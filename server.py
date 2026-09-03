#!/usr/bin/env python3
"""VoxelForge: sirve el sitio estático + API de habitantes (guardar/listar/renombrar/borrar).
   Uso: python3 server.py [puerto]   (por defecto 8500)
   Almacén: data/habitantes/<id>.json  (formato vox export)."""
import http.server, socketserver, json, os, re, sys, datetime, shutil, time, urllib.parse
import gzip, threading, base64, binascii, glob, hmac
from servidor import mundos                                # listado de /map/: estadísticas + miniatura cenital
from servidor import voxfmt                                # formato de mundo voxelworld-2 (cabecera + .vox denso)
from servidor import limites                               # freno de escrituras por IP (sólo en modo público)
from servidor import sesion                                # cuentas, perfiles, permisos y la cookie firmada
from servidor import mundos_meta                           # de quién es cada mapa y quién puede verlo/escribirlo
from servidor import registro                              # F7.3 · qué se pidió, quién y con qué respuesta
from servidor import vales                                 # F5.6 · el enlace de invitación a UN mapa
from servidor import plantillas                            # REQ-PLANT1 · fichas de mundo nuevo y ambientes cerrados
from servidor import autoria                               # REQ-ASSET1 · de quién es cada habitante y quién lo ve

BASE  = os.path.dirname(os.path.abspath(__file__))
WEB   = os.path.join(BASE, 'web')                          # el SITIO: los .html/.js/.css que se sirven tal cual
# REQ-ASSET1 · La carpeta se puede desviar por entorno, como ya se hace con `usuarios`, `perfiles`
# y `mundos_meta`. No es un capricho: el guardián de autoría guarda dibujos de prueba, y sin esto
# cada pasada le dejaría al dueño un `zz-*.json` en su galería (y su copia en la papelera).
STORE = os.environ.get('VOXELFORGE_HABITANTES') or os.path.join(BASE, 'data', 'habitantes')
TRASH = os.path.join(BASE, 'data', 'habitantes_trash')   # NADA se borra de verdad: va aquí
MAPFILE = os.path.join(BASE, 'data', 'mapa.json')         # mapa del mundo (rejilla de habitaciones)
WORLDFILE = os.path.join(BASE, 'data', 'mundo.json')       # mundo sandbox 3D (REQ-MC) — fichero único "sagrado" (mapa «default»)
WORLDS = os.path.join(BASE, 'data', 'worlds')             # mundos con nombre: /map/<nombre> -> data/worlds/<slug>.json (persistentes)
SNIPS = os.path.join(BASE, 'data', 'snippets')             # gestor de snippets de código (data/snippets/<id>.json)
AGENTS = os.path.join(BASE, 'data', 'agentes')             # agentes articulados (data/agentes/<id>.json) — el documento, no el motor
FOTOS = os.path.join(BASE, 'data', 'fotos')                # fotos del Mundo (tecla F): <n>_<mapa>_<fecha>.png + .json con la ficha
FOTOS_MINI = os.path.join(FOTOS, 'mini')                   # la MISMA foto a 800 px de ancho, que es la que puede abrir un asistente:
                                                           # la de tamaño completo está vetada en .claude/settings.json (tokens)
FOTOS_INF = os.path.join(FOTOS, 'informes')                # REQ-INF1 · el ESTUDIO de cada foto: data/fotos/informes/<id>/<nombre>.json.
                                                           # La ficha solo lleva el índice; el detalle vive aquí para no hincharla.
RE_INFORME = re.compile(r'^[a-z0-9][a-z0-9-]{0,47}$')      # el nombre acaba siendo una RUTA: ni '..', ni '/', ni sorpresas
VIDEOS = os.path.join(BASE, 'data', 'videos')              # vídeos del Mundo (Alt+V): <n>_<mapa>_<fecha>.mp4/.webm + .json
UI = os.path.join(BASE, 'data', 'ui')                      # iconos de la aplicación horneados desde /images (favicon, marca, herramientas)
UIFILE = os.path.join(UI, 'ranuras.json')                  # la ASIGNACIÓN (ranura → dibujo@postura, modo, aa): la fuente de verdad de los .png
# Snippets que NO se pueden borrar desde la UI. 'mundo-autoarranque' lo busca app.js POR ESE ID al
# entrar al Mundo (openWorld), así que borrarlo no rompe nada visible al momento: simplemente el
# Mundo deja de tener bloques con comportamiento y no hay ningún error que lo delate. Editarlo y
# guardarlo sí se puede (POST respalda la versión anterior); lo que se bloquea es el DELETE.
#
# Esto era un `set` de UN elemento escrito a mano, y esa es exactamente la forma en que se perdió
# `particulas-voxel`: no estaba en la lista, nadie se acordó de meterlo, y la papelera poda a los 30.
# Una lista a mano protege lo que alguien recordó el día que la escribió. Por eso ahora son TRES
# reglas y basta con que una diga que no (`esta_protegido`), más una cuarta que se calcula en el
# DELETE (quién lo llama, con `buscar_snips`).
SNIPS_PROTEGIDOS = {'mundo-autoarranque', 'editor-autoarranque', 'particulas-voxel', 'sondas-mundo',
                    'efectos-demo', 'base-npc-skills', 'multi-verse'}
# Convención del motor: a estos los arranca `app.js` SOLO, por su nombre calculado, sin que ningún
# otro snippet los mencione. Justo por eso `buscar_snips(usa=…)` no los ve referenciados y parecerían
# huérfanos: la regla de «quién lo llama» no puede protegerlos, y son los que más duele perder.
#   `mundo-<mapa>`     construye el mundo entero al entrar (mundo-fps, construye-*)
#   `arranque-<mapa>`  la intro con `?intro=1`
#   `redstone*`        el motor de redstone y sus piezas, que se publican desde `redstone/`
SNIPS_PREFIJOS_PROTEGIDOS = ('mundo-', 'arranque-', 'redstone')


def esta_protegido(sid, doc=None):
    """Motivo por el que `sid` NO se puede borrar, o '' si sí se puede.

    Se devuelve el MOTIVO y no un booleano a propósito: el 409 tiene que decir por qué, o el dueño
    solo ve «no puedes» y acaba borrando a mano desde disco, que es peor que no haber protegido nada.
    """
    if sid in SNIPS_PROTEGIDOS:
        return f'«{sid}» es una pieza del motor: el juego la ejecuta sola y sin ella se rompe en silencio'
    for pre in SNIPS_PREFIJOS_PROTEGIDOS:
        if sid.startswith(pre):
            return f'«{sid}» empieza por «{pre}»: lo arranca el motor por convención, no por una llamada'
    # La marca viaja DENTRO del fichero para que sobreviva a un `git pull` y a un `POST /api/snippets`
    # que lo reescriba: quien publica el snippet decide que es crítico, sin tocar `server.py`.
    if doc is None:
        try:
            with open(os.path.join(SNIPS, sid + '.json'), encoding='utf-8') as f:
                doc = json.load(f)
        except Exception:
            doc = {}
    if doc.get('protegido') is True:
        return f'«{sid}» se declara `"protegido": true` en su propio fichero'
    return ''
os.makedirs(STORE, exist_ok=True)
os.makedirs(TRASH, exist_ok=True)
os.makedirs(WORLDS, exist_ok=True)
os.makedirs(SNIPS, exist_ok=True)
os.makedirs(AGENTS, exist_ok=True)
os.makedirs(FOTOS, exist_ok=True)
os.makedirs(VIDEOS, exist_ok=True)
os.makedirs(UI, exist_ok=True)

DEFAULT_MAP = {'cols': 8, 'rows': 8, 'cells': {}}
# Mundo vacío por defecto: sin voxels => el cliente genera terreno plano (mcGenFlat)
DEFAULT_WORLD = {'format': 'voxelworld-1', 'dim': {'x': 96, 'y': 40, 'z': 96}, 'spawn': None, 'voxels': {}}

CLI_TOKEN = None
CLI_PUBLICO = False

# El servidor se configura por ENTORNO, no por línea de comandos: los secretos no se escriben en un
# `ps aux` y las tres unidades de systemd comparten un solo `EnvironmentFile`. Por eso la ayuda
# dedica más sitio a las variables que a las banderas — son las que de verdad mandan.
USO = """VoxelForge · servidor de mapas, assets, snippets y wiki.

  python3 server.py [puerto] [--token LLAVE] [--publico]

Argumentos
  puerto              Un número suelto. Por defecto 8500.
  --token, -t LLAVE   Llave del dueño (también --token=LLAVE). Gana sobre VOXELFORGE_TOKEN.
                      ⚠️ Queda a la vista en `ps aux`: para algo permanente, la variable.
  --publico           Enciende el MODO PÚBLICO (lo mismo que VOXELFORGE_PUBLICO=1). Ver abajo.
  --help, -h          Esto.

LOS DOS MODOS · es lo que más confunde, así que va con nombre y apellidos
  Sin VOXELFORGE_PUBLICO el servidor da por hecho que está en TU máquina y no le pide nada a
  nadie: cualquiera que llegue al puerto puede escribir un snippet, borrar un asset o listar
  /data/ entero. Es lo que hace falta para trabajar —los 128 tests y los ~90 parche_snp_*.py
  hacen POST anónimos— y es exactamente lo que NO se puede publicar.

  Con VOXELFORGE_PUBLICO=1 se encienden las reglas de un servidor abierto a gente de fuera:
    · Escribir exige identidad. Sin token del dueño ni sesión iniciada → 401/403. Es lo que
      apaga la bomba: POST /api/snippets ejecuta JS en el navegador de TODOS los visitantes.
    · /data/ deja de servirse entero: solo ui, fotos, videos e informes. Fuera quedan los
      tickets, los mundos y la papelera, que hoy son un listado navegable.
    · Los POST traen tope de tamaño y hay freno por IP (429 si te pasas).
    · Las escrituras exigen cabecera Origin (el CSRF de los pobres).
    · «/» deja de ser el editor y pasa a ser el menú del juego para quien no traiga el token.
    · Se enciende el registro de accesos.
    · Y el proceso NO ARRANCA sin VOXELFORGE_SECRETO_SESION.

  ⚠️ El interruptor ENCIENDE la seguridad, nunca la apaga: un despliegue olvidadizo sale
  seguro. Al revés —estricto por defecto y una bandera para relajarlo— la primera prisa lo
  apaga «un momento» y ahí se queda para siempre.

Variables de entorno (lo normal es ponerlas en un fichero y cargarlo; ver abajo)
  VOXELFORGE_TOKEN              Llave del dueño. Dos puertas: cabecera X-VoxelForge-Token (curl y
                                herramientas/*.py) y galleta vf_disena que pone POST /api/disena.
                                ⛔ SIN ella, en desarrollo TODO EL MUNDO es el dueño.
  VOXELFORGE_PUBLICO=1          Enciende el modo público de ahí arriba. Rompe a propósito los POST
                                anónimos de los tests y de los parche_snp_*.py.
  VOXELFORGE_SECRETO_SESION     Firma las cookies de sesión y los vales de invitación.
                                ⛔ En modo público el proceso NO ARRANCA sin ella.
                                ⚠️ multi/servidor_multi.py tiene que compartir el MISMO valor o
                                rechazará los vales que emita este servidor.
                                Generar:  python3 -c "import secrets;print(secrets.token_urlsafe(32))"
  VOXELFORGE_REGISTRO           Fichero del registro de accesos. En público se enciende solo; con
                                esta variable se fuerza también en desarrollo, o se lleva a otro disco.
  VOXELFORGE_USUARIOS           Carpeta de cuentas.          (data/usuarios)
  VOXELFORGE_PERFILES           Carpeta de perfiles.         (data/perfiles)
  VOXELFORGE_MUNDOS_META        Carpeta de metadatos de mundo. (data/mundos_meta)
  VOXELFORGE_HABITANTES         Carpeta de habitantes.       (data/habitantes)
  VOXELFORGE_COPIAS             Destino de las copias que lanza el panel del dueño.
  VOXELFORGE_TOPE_ESCRITURAS         Escrituras por minuto y por IP, anónimo.  (600)
  VOXELFORGE_TOPE_ESCRITURAS_SESION  Lo mismo con sesión iniciada.             (3000)

Arrancar con las variables de /root/voxelforge.env (600, fuera del repo a propósito)
  set -a; . /root/voxelforge.env; set +a; nohup python3 server.py 8500 > /tmp/srv8500.log 2>&1 &

  `set -a` exporta todo lo que se lea a continuación (sin él, las variables se quedan en el shell
  y el proceso hijo no las ve); `set +a` lo vuelve a apagar para no exportar media sesión.
  `nohup … &` lo suelta en segundo plano y lo deja vivo al cerrar la terminal.

  ⚠️ Ese fichero trae VOXELFORGE_PUBLICO=1, o sea que esa línea arranca en MODO PÚBLICO y los
  tests y los parche_snp_*.py empezarán a recibir 401. Para trabajar con la llave puesta pero
  con las reglas de desarrollo, se vacía la variable en la propia línea:
  set -a; . /root/voxelforge.env; set +a; VOXELFORGE_PUBLICO= nohup python3 server.py 8500 > /tmp/srv8500.log 2>&1 &

  Con nohup el saludo del arranque va al log, no a la pantalla. Comprobar que está y en qué modo:
  head -3 /tmp/srv8500.log        # dice «modo PÚBLICO», el token y dónde va el registro
  curl -s localhost:8500/api/yo   # {"publico": true|false, …}

  Y para pararlo:  pkill -f 'server.py 8500'

En un servidor de verdad esto no se lanza a mano: despliegue/voxelforge.service lo hace con
EnvironmentFile=/etc/voxelforge.env. Ver despliegue/LEEME.md."""


def parse_cli_args():
    global PORT, CLI_TOKEN, CLI_PUBLICO
    port = 8500
    token = None
    publico = False
    args = sys.argv[1:]
    i = 0
    sueltos = []
    while i < len(args):
        arg = args[i]
        if arg in ('--help', '-h'):
            print(USO)
            sys.exit(0)
        elif arg in ('--token', '-t') and i + 1 < len(args):
            token = args[i + 1].strip()
            i += 2
        elif arg.startswith('--token='):
            token = arg.split('=', 1)[1].strip()
            i += 1
        elif arg == '--publico':
            publico = True
            i += 1
        elif arg.isdigit():
            port = int(arg)
            i += 1
        else:
            # Lo desconocido se sigue ignorando —arrancar es más importante que ser estricto— pero
            # se DICE: un `--tokne` mal escrito dejaba el servidor sin llave en silencio.
            sueltos.append(arg)
            i += 1
    if sueltos:
        print('⚠️  argumento(s) que no entiendo y me salto: ' + ' '.join(sueltos)
              + '\n    python3 server.py --help', file=sys.stderr)
    PORT = port
    CLI_TOKEN = token
    CLI_PUBLICO = publico

parse_cli_args()

def get_server_token():
    """1º Token pasado por línea de comandos (--token / -t), 2º variable de entorno VOXELFORGE_TOKEN."""
    if CLI_TOKEN:
        return CLI_TOKEN
    env = os.environ.get('VOXELFORGE_TOKEN')
    return env.strip() if env else None

def es_publico():
    """¿Está el servidor abierto a gente de fuera? (`--publico` o VOXELFORGE_PUBLICO=1)

    ⚠️ El interruptor ENCIENDE el modo estricto, nunca lo apaga. En desarrollo todo sigue exactamente
    como estaba —los 128 tests y los `parche_snp_*.py` hacen POST anónimos y tienen que seguir
    funcionando—, y es el despliegue el que tiene que acordarse de encenderlo. Al revés (estricto por
    defecto, con una bandera para relajarlo) la primera prisa lo apaga «un momento» y ahí se queda.
    """
    return bool(CLI_PUBLICO or str(os.environ.get('VOXELFORGE_PUBLICO', '')).strip() in ('1', 'si', 'sí', 'true'))

# ── LA MATRIZ ───────────────────────────────────────────────────────────────────────────────────
# Qué permiso hace falta para escribir en cada sitio. Está aquí, en una tabla y no repartido por las
# cuatro `do_*`, porque el contrato tiene que poder LEERSE de una vez: un permiso mal puesto en la
# rama 30 de un `do_POST` de 400 líneas no lo ve nadie en una revisión.
#
# Gana el prefijo MÁS LARGO (`/api/mundos/crear` antes que `/api/mundos`), y lo que no esté listado
# exige el token del dueño. Sólo se aplica en modo público: en desarrollo no cambia nada.
#
# ⛔ Esto dice QUIÉN puede escribir, no DÓNDE, y son DOS PUERTAS EN SERIE. Aquí se decide si esta
# persona puede editar mapas en general; de si puede editar ESTE mapa se ocupa `_mundo_ok()` con
# `data/mundos_meta/` (F3.1). Hacen falta las dos: con la tabla sola, `mundo.editar_propio` daría
# permiso sobre el mapa de cualquiera; con el registro solo, una cuenta en cuarentena entraría a
# escribir en los mapas de escritura abierta. Quien quite una de las dos deja la otra coja.
#
# ⛔ Las puertas de la propia identidad NO pueden pedir permiso, o no habría forma de conseguirlo.
# Siguen pasando por el freno por IP, que es justo lo que hace falta ahí: es donde alguien probaría
# contraseñas a lo bruto o daría de alta mil cuentas.
RUTAS_ABIERTAS = ('/api/registro', '/api/entrar', '/api/salir', '/api/disena')

# F5.6 · Las ÚNICAS rutas que un vale de invitación puede desbloquear por sí solo (`_exige_por_ruta`).
# ⛔ `/api/mundo` a secas NO está, y no debe estar: reescribe el mundo ENTERO (64 MB, sólo dueño). Un
# enlace que sirve para construir no puede servir para machacar el mapa al que te han invitado. Estas
# dos son deltas acotados, y encima pasan después por `_mundo_ok(escribir=True)`.
RUTAS_CON_VALE = ('/api/mundo/edits', '/api/mundo/cabecera')

# El cuarto campo son los MÉTODOS a los que aplica la fila, o None para todos. Existe porque borrar
# no es editar: `mundo.borrar_propio` está en el vocabulario justo para poder dar un perfil que
# construya pero no destruya, y sin esta columna el DELETE caía en la fila de `mundo.editar_propio`
# y hacían falta LOS DOS permisos para una sola acción. Un panel donde conceder el permiso que se
# llama «borrar» no deja borrar es un panel en el que el dueño deja de confiar a la segunda.
PERMISO_POR_RUTA = (
    # ⛔ LA BOMBA, y el motivo de toda esta fase: `mcAutoarranque()` baja `mundo-autoarranque` y lo
    # pasa por `new AsyncFunction(code)` en el navegador de CADA visitante de CADA mapa. Con el POST
    # abierto, escribir un snippet era literalmente ejecutar código en máquinas ajenas, y persistente.
    # Va por el vocabulario y no por `_exige_dueno` para que el panel pueda dárselo algún día a una
    # cuenta concreta; hoy no lo tiene nadie salvo el perfil `dueno`, así que la puerta queda igual.
    ('/api/snippets',      'snippet.editar_sistema', 'escribir snippets',   None),
    ('/api/mundos/crear',  'mundo.crear',            'crear mundos',        None),
    ('/api/mundos',        'mundo.borrar_propio',    'borrar mundos',       ('DELETE',)),
    ('/api/mundos',        'mundo.editar_propio',    'tocar mundos',        None),
    ('/api/mundo',         'mundo.editar_propio',    'editar el mundo',     None),
    ('/api/assets',        'asset.subir',            'subir piezas',        None),
    ('/api/habitantes',    'habitante.guardar',      'guardar habitantes',  None),
    ('/api/agentes',       'agente.editar',          'editar agentes',      None),
    # F9 · El panel. `panel.usar` para mirar y tocar mapas; `panel.perfiles` lo exige aparte el
    # propio módulo para lo que reparte permisos (cuentas y perfiles), porque no es lo mismo abrir
    # un mapa al público que poder ascenderse a uno mismo.
    ('/api/panel',         'panel.usar',             'usar el panel',       None),
    # F5.6 · Emitir un enlace de invitación. Además del permiso, la propia rama exige poder escribir
    # en ESE mapa: el permiso dice «esta cuenta invita», el mapa dice «a este sitio, tú».
    ('/api/invitaciones',  'multi.invitar',          'invitar',             None),
    ('/api/fotos',         'foto.subir',             'subir fotos',         None),
    ('/api/videos',        'foto.subir',             'subir vídeos',        None),
)

# F3.6 · el paginado de `/api/mundos`. El TOPE existe porque `?cuantos=999999` es la forma más fácil
# de pedir el listado entero fingiendo que se pagina, y entonces paginar no sirve de nada.
MUNDOS_POR_PAGINA = 24
MUNDOS_POR_PAGINA_TOPE = 100


def _entero(txt, porDefecto):
    """Un entero de la query, o el de por defecto. Nunca revienta: `?desde=hola` no es un 500."""
    try:
        return int(str(txt).strip())
    except (TypeError, ValueError):
        return porDefecto


def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', (s or 'objeto').lower()).strip('-')
    return s or 'objeto'

# ---- Nombre corto de un asset (meta.alias): como se le llama desde un script ----
# Un asset ya responde hoy a su id, a su rotulo y al basename de su fichero (mcIndexAssets,
# app.js:1413). El alias es una cuarta puerta, la unica que elige el dueno: la textura que otro
# programa genero como «green_concrete» se referencia asi en vez de por «hormig-n-verde-hojas».
#
# ALIAS_FIJOS es el espejo de MC_MAT_ALIAS (app.js:7452). Un alias de la ficha NO puede pisarlos:
# un script que dice 'stone' tiene que seguir poniendo roca para siempre. Si anades uno alli,
# anadelo aqui. El cliente vuelve a comprobarlo al indexar, asi que un servidor desactualizado
# como mucho deja pasar algo que el cliente ignora — no puede corromper un alias de fabrica.
ALIAS_FIJOS = {
    'stone', 'smooth_stone', 'cobblestone', 'mossy_cobblestone', 'stone_bricks', 'bricks',
    'sandstone', 'dirt', 'grass', 'wood', 'planks', 'sand', 'log', 'obsidian',
    'red_concrete', 'red_concrete_block',
}
# Sin espacios ni acentos: el sentido de todo esto es poder teclearlo en un script.
ALIAS_RE = re.compile(r'^[a-z0-9_]{2,40}$')

def claves_de_asset(item):
    """Todo lo que YA resuelve a este asset desde un script (espejo de mcIndexAssets)."""
    claves = set()
    for v in (item.get('id'), item.get('name'), item.get('alias')):
        if v:
            claves.add(str(v).strip().lower())
    if item.get('name'):
        claves.add(slugify(item['name']))
    rel = item.get('file') or ''
    if rel:
        claves.add(rel.split('/')[-1].replace('.vox.json', '').lower())
    return claves

def validar_alias(alias, aid, idx):
    """(alias_normalizado, motivo_legible_o_None). Cadena vacia = borrar el alias."""
    a = (alias or '').strip().lower()
    if not a:
        return '', None
    if not ALIAS_RE.match(a):
        return a, 'usa solo minusculas, numeros y _ (entre 2 y 40 caracteres)'
    if a in ALIAS_FIJOS:
        return a, f'«{a}» ya es un material de fabrica — elige otro'
    for item in idx:
        if item.get('id') == aid:
            continue                     # las claves propias no chocan consigo mismas
        if a in claves_de_asset(item):
            return a, f'«{a}» ya apunta a «{item.get("name") or item.get("id")}» — elige otro'
    return a, None

# Nombre de mapa (de /map/<nombre> o ?map=) -> fichero de mundo persistente.
# «default» (o vacío/ausente) = el mundo sagrado mundo.json; cualquier otro = data/worlds/<slug>.json.
# El slug se acota a [a-z0-9-] (sin ../, sin barras) => imposible salir de data/worlds/.
def world_slug(name):
    return re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')

def world_file_for(name):
    s = world_slug(name)
    if not s or s == 'default':
        return WORLDFILE
    return os.path.join(WORLDS, s + '.json')

def now_iso():
    return datetime.datetime.now().isoformat(timespec='seconds')

MAX_TRASH_FILES = 30

# …y un tope POR BYTES, además del de ficheros. Sin él la papelera llegó a 1,5 GB — más que todo el
# resto del repo junto —, porque contar ficheros no dice nada cuando un grupo son respaldos de mundo
# de 5 MB y otro son snippets de 300 KB. Se poda el grupo más gordo primero, que es el que se lo comió.
MAX_TRASH_BYTES = 2 * 1024 * 1024 * 1024

# El tope es POR FICHERO DE ORIGEN, no global, y esa es toda la diferencia entre tener papelera y
# creer que la tienes: el autoguardado del Mundo mete un respaldo de ~5 MB de mundo.json en CADA
# guardado, así que con un tope global de 30 los respaldos del mundo desalojaban todo lo demás. Medido
# antes de este cambio: 30 ficheros, 26 de ellos mundo.json, y la papelera entera cubría 19,7 minutos
# — o sea que un snippet borrado se perdía de verdad al cabo de un rato de jugar. Agrupar por nombre
# de origen no aumenta el disco de forma apreciable (los que pesan son los mundos, y esos siguen
# limitados a 30); solo impide que lo voluminoso y frecuente se coma a lo pequeño e irrepetible.
def clean_trash():
    try:
        grupos = {}
        for f in os.listdir(TRASH):
            fp = os.path.join(TRASH, f)
            if not os.path.isfile(fp):
                continue
            origen = f.split('__', 1)[1] if '__' in f else f     # '<ms>__mundo.json' -> 'mundo.json'
            grupos.setdefault(origen, []).append(fp)
        for origen, files in grupos.items():
            if len(files) <= MAX_TRASH_FILES:
                continue
            files.sort(key=lambda x: os.path.getmtime(x))
            for f in files[:-MAX_TRASH_FILES]:
                try: os.remove(f)
                except OSError: pass

        # Segunda pasada, la del disco. El tope por grupo ya ha hecho su trabajo; si aun así la
        # papelera pasa de MAX_TRASH_BYTES, se poda del grupo que más ocupa (nunca por debajo de dos
        # copias: una papelera vacía no es una papelera) hasta bajar del tope.
        def _pesa(fp):
            try: return os.path.getsize(fp)
            except OSError: return 0
        vivos = {o: [f for f in fs if os.path.exists(f)] for o, fs in grupos.items()}
        total = sum(_pesa(f) for fs in vivos.values() for f in fs)
        while total > MAX_TRASH_BYTES:
            gordo = max(vivos, key=lambda o: sum(_pesa(f) for f in vivos[o]), default=None)
            if gordo is None or len(vivos[gordo]) <= 2:
                break                                    # no queda de dónde recortar sin quedarnos sin red
            vivos[gordo].sort(key=lambda x: os.path.getmtime(x))
            viejo = vivos[gordo].pop(0)
            total -= _pesa(viejo)
            try: os.remove(viejo)
            except OSError: pass
    except Exception as e:
        sys.stderr.write(f"[TRASH CLEAN] Error: {e}\n")

# De qué carpeta sale un fichero de AUTORÍA, y cómo se llama su cajón en `data/papelera/`. Son las
# tres cosas que una persona escribió a mano y que no se pueden volver a generar desde ningún sitio.
PAPELERA_AUTORIA = ((SNIPS, 'snippets'), (STORE, 'habitantes'), (AGENTS, 'agentes'))


def _cajon_de_autoria(fp):
    """`data/papelera/<tipo>/` si `fp` es de autoría; None si es material reponible."""
    real = os.path.realpath(fp)
    for origen, tipo in PAPELERA_AUTORIA:
        if real.startswith(os.path.realpath(origen) + os.sep):
            return os.path.join(BASE, 'data', 'papelera', tipo)
    return None


# Copia de seguridad de un fichero a la papelera (con marca de tiempo) — acotada a MAX_TRASH_FILES
#
# Dos destinos, y la diferencia NO es qué fichero es, sino qué le está pasando:
#
#   · `move=True`  es un BORRADO. Si además es autoría (un snippet, un habitante, un agente), va a
#     `data/papelera/<tipo>/` y de ahí NO lo poda nadie. Así se perdió `particulas-voxel`: acabó en
#     `habitantes_trash`, llegaron 30 borrados más y lo podó `clean_trash`. Un borrado es raro y pesa
#     kilobytes; guardarlos todos para siempre cuesta menos que perder uno.
#   · `move=False` es una COPIA ANTES DE SOBRESCRIBIR, y esa sí se poda como siempre. Es un deshacer
#     corto, ocurre en CADA guardado (`mundo-autoarranque` son 315 KB y se republica a diario) y sin
#     poda llenaría el disco sola. Que sea autoría no la convierte en irrepetible: el fichero sigue
#     estando, con su contenido nuevo.
def to_trash(fp, move=True):
    if not os.path.exists(fp):
        return
    cajon = _cajon_de_autoria(fp) if move else None
    if cajon:
        os.makedirs(cajon, exist_ok=True)
        shutil.move(fp, os.path.join(cajon, f'{int(time.time()*1000)}__{os.path.basename(fp)}'))
        return                                           # ⛔ sin `clean_trash()`: aquí no se poda
    dst = os.path.join(TRASH, f'{int(time.time()*1000)}__{os.path.basename(fp)}')
    (shutil.move if move else shutil.copy2)(fp, dst)
    clean_trash()

clean_trash()

# Escritura atómica: fichero temporal en el MISMO dir + os.replace (atómico en POSIX). El servidor es
# multihilo (ThreadingMixIn) y el autoguardado del mundo dispara POST solapados de ~5MB; sin esto, dos
# open('w') a la vez truncan/entrelazan el JSON y lo dejan corrupto. Con replace, el último write completo gana.
def atomic_dump(d, path):
    tmp = f'{path}.tmp.{os.getpid()}.{time.time_ns()}'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except OSError: pass

# Elimina (a papelera) otros ficheros cuyo nombre coincide (mismo slug) => sin duplicados por nombre.
# `store`/`name_of` porque la regla es la misma para habitantes y para agentes: solo cambia dónde
# viven y de qué clave sale el nombre visible.
def dedup(idd, store=STORE, name_of=lambda d: (d.get('meta') or {}).get('name')):
    for fn in os.listdir(store):
        if not fn.endswith('.json') or fn[:-5] == idd:
            continue
        try:
            d = json.load(open(os.path.join(store, fn), encoding='utf-8'))
            igual = slugify(name_of(d)) == idd
        except Exception:
            continue                                  # un .json roto o que no es un objeto: ni se toca
        if igual:
            to_trash(os.path.join(store, fn))

def list_snips():
    out = []
    for fn in os.listdir(SNIPS):
        if not fn.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(SNIPS, fn), encoding='utf-8'))
        except Exception:
            continue
        out.append({'id': fn[:-5], 'name': d.get('name', '(sin nombre)'),
                    'categoria': d.get('categoria', '') or d.get('category', ''),
                    'lines': (d.get('code', '') or '').count('\n') + 1,
                    'savedAt': d.get('savedAt', ''),
                    # REQ-PLANT1 · el carrusel de mundo nuevo se pinta con ESTO. Va en el listado y no
                    # pidiendo cada snippet aparte porque los generadores pesan de 6 a 15 KB de código
                    # y el carrusel sólo quiere el título y la foto: siete peticiones y 70 KB para
                    # enseñar cuatro fichas es lo que se evita aquí.
                    'ficha': d.get('ficha') if isinstance(d.get('ficha'), dict) else None,
                    # La UI esconde el botón; el DELETE lo corta el servidor. Se pasa el `doc` ya
                    # leído para no abrir 200 ficheros otra vez solo por mirar una marca.
                    'protegido': bool(esta_protegido(fn[:-5], d))})
    out.sort(key=lambda s: s.get('savedAt', ''), reverse=True)   # más recientes primero
    return out

# ---- Buscar DENTRO de los snippets (REQ-SNP6) --------------------------------------------------
# El listado de arriba no lleva el código (son ~1,5 MB entre todos: 'mundo-autoarranque' solo son
# 300 KB), así que buscar en el cliente obligaba a bajárselos TODOS en cada tecla. Se busca aquí, que
# es donde están los ficheros, y se devuelve lo mismo que el listado + dónde está la coincidencia.
# Dos preguntas distintas, un solo recorrido:
#   ?q=<texto>  · «¿qué snippets dicen esto?» (literal, sin distinguir mayúsculas; también en rótulo/id)
#   ?usa=<id>   · «¿quién llama a este snippet?» — `game.snippet('<id>')` es LLAMADA; el id suelto entre
#                 comillas es MENCIÓN (un `game.snippet` guardado en una variable, una tabla de nombres,
#                 un comentario). La diferencia importa: renombrar rompe las dos, pero solo la primera
#                 se ve ejecutar. NO se busca el id a pelo: 'redstone' saldría en media docena de
#                 palabras que no son referencias.
def _muestra(linea):
    s = (linea or '').strip()
    return s[:120] + ('…' if len(s) > 120 else '')

def buscar_snips(q=None, usa=None):
    if usa:
        # IGNORECASE y sin anclar por delante a propósito: la llamada se escribe `game.snippet('x')`,
        # pero también `ejecutarSnippet('x')` (el ayudante de 'redstone-arranque') o `mcCorreSnippet('x',…)`.
        # Todas ejecutan; pedir el nombre exacto las contaba como simples menciones.
        rx_llama = re.compile(r'snippet\s*\(\s*[\'"`]' + re.escape(usa) + r'[\'"`]', re.I)
        rx_menta = re.compile(r'[\'"`]' + re.escape(usa) + r'[\'"`]')
    ql = (q or '').lower()
    out = []
    for s in list_snips():
        if usa and s['id'] == usa:                               # nadie se «usa» a sí mismo
            continue
        try:
            d = json.load(open(os.path.join(SNIPS, s['id'] + '.json'), encoding='utf-8'))
        except Exception:
            continue
        code = d.get('code', '') or ''
        r = dict(s)
        if usa:
            hits = [(i + 1, ln, bool(rx_llama.search(ln))) for i, ln in enumerate(code.split('\n'))
                    if rx_menta.search(ln)]
            if not hits:
                continue
            r['tipo'] = 'llamada' if any(h[2] for h in hits) else 'mencion'
            prim = next((h for h in hits if h[2]), hits[0])
        else:
            if not ql:
                continue
            # El rótulo y el id también cuentan: buscar «fornite» y no ver el snippet que se llama así
            # sería absurdo. Se marca de dónde viene la coincidencia para que la ficha lo enseñe.
            hits = [(i + 1, ln, False) for i, ln in enumerate(code.split('\n')) if ql in ln.lower()]
            en_rotulo = ql in (s['name'] or '').lower() or ql in s['id'].lower()
            if not hits and not en_rotulo:
                continue
            r['donde'] = 'codigo' if hits else 'rotulo'
            prim = hits[0] if hits else (0, '', False)
        r['hits'] = len(hits)
        r['linea'] = prim[0]
        r['muestra'] = _muestra(prim[1])
        out.append(r)
    # Primero lo que de verdad ejecuta / lo que más veces sale; el orden por fecha se queda de desempate.
    out.sort(key=lambda r: (0 if r.get('tipo') == 'llamada' else 1, -r.get('hits', 0)))
    return out

def pesa_mundo(slug):
    """Lo que ocupa un mapa en disco: la cabecera `.json` MÁS la rejilla `.vox`.

    Los dos, siempre. La cabecera son kilobytes y el `.vox` son megas, así que contar solo el
    `.json` —que es el fichero que se ve en `data/worlds/` y el que uno mira primero— daría una
    cuota que no frena nada.
    """
    total = 0
    for ext in ('.json', '.vox'):
        try:
            total += os.path.getsize(os.path.join(WORLDS, slug + ext))
        except OSError:
            pass
    return total


def bytes_de_usuario(uid):
    """F3.4 · lo que ocupan TODOS los mapas de `uid`. Se mide en disco, no se lleva un contador.

    Un contador guardado se desincroniza el primer día (un mapa borrado a mano, un `.vox` que crece
    al redimensionar, dos escrituras a la vez) y entonces la cuota miente en la dirección peor: deja
    pasar. Sumar `os.path.getsize` de unos cuantos ficheros son microsegundos.
    """
    return sum(pesa_mundo(s) for s in mundos_meta.de(uid))


def mundos_que_usan(clave):
    """Qué mundos referencian `asset:assets/<id>.vox.json` o `hab:<id>`. Lista de dicts, o [].

    ⛔ Solo se abren las CABECERAS `.json` de los mundos. Ni un `.vox` (la rejilla, hasta 20 MB) ni
    un `assets/*.vox.json` (283 k tokens, vetado al `Read`): la cabecera ya lo dice todo, porque el
    formato v2 guarda las referencias en `palette[]` («asset:assets/roca.vox.json») y en
    `structures[].key` («hab:escalera»). Es justo el motivo por el que esta pregunta es barata.
    """
    ficheros = sorted(glob.glob(os.path.join(WORLDS, '*.json')))
    if os.path.exists(WORLDFILE):
        ficheros.append(WORLDFILE)                       # el mapa «default», que vive aparte
    out = []
    for wf in ficheros:
        try:
            with open(wf, encoding='utf-8') as f:
                d = json.load(f)
        except Exception:
            continue                                     # una cabecera ilegible no puede bloquear un borrado
        if not isinstance(d, dict):
            continue
        en_paleta = sum(1 for p in (d.get('palette') or []) if p == clave)
        en_estruct = sum(1 for s in (d.get('structures') or [])
                         if isinstance(s, dict) and s.get('key') == clave)
        if en_paleta or en_estruct:
            donde = ('paleta' if en_paleta else '') + ('+' if en_paleta and en_estruct else '') \
                    + ('estructuras' if en_estruct else '')
            out.append({'mapa': os.path.splitext(os.path.basename(wf))[0],
                        'donde': donde, 'veces': en_paleta + en_estruct})
    out.sort(key=lambda m: -m['veces'])
    return out


# Un agente es un DOCUMENTO (qué piezas, dónde van, cómo articulan), no código: el motor vive en el
# snippet «mundo-autoarranque» y lo único que se guarda aquí es la descripción del bicho. El listado
# enseña solo lo que necesita un selector; para animarlo hace falta el fichero entero.
def list_agentes():
    out = []
    for fn in sorted(os.listdir(AGENTS)):
        if not fn.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(AGENTS, fn), encoding='utf-8'))
            piezas = 1 + len(d.get('piezas') or [])       # la raíz cuenta: es la pieza 0
        except Exception:
            continue
        out.append({'id': fn[:-5], 'nombre': d.get('nombre', '(sin nombre)'),
                    'piezas': piezas, 'savedAt': d.get('savedAt', '')})
    out.sort(key=lambda a: a.get('savedAt', ''), reverse=True)   # más recientes primero
    return out

# REQ-GAL4 · los assets del juego no llevaban ninguna fecha ni el número de voxels, y la galería los
# necesita para ordenar. Se rellenan UNA vez en `assets/index.json` (que sí se versiona) leyendo el
# fichero del disco, y a partir de ahí viajan con el índice.
#
# ⚠️ Por qué se persiste en vez de calcularlo en cada petición: la fecha sale del **mtime**, y el mtime
# no sobrevive a un `git clone` —todos los ficheros quedarían con la hora del clonado— ni a un
# `atomic_dump`, que crea un inodo nuevo. Escribirla al índice la congela en el momento en que aún es
# cierta. Y el número de voxels obliga a abrir el .vox.json (los 70 son 8,7 MB): una vez, no cada vez.
def completar_fechas_asset(item, ruta):
    """Rellena savedAt/createdAt/count si faltan. Devuelve True si tocó algo (hay que reescribir)."""
    tocado = False
    if not item.get('savedAt') or not item.get('createdAt'):
        try:
            sello = datetime.datetime.fromtimestamp(os.path.getmtime(ruta)).isoformat(timespec='seconds')
        except OSError:
            sello = now_iso()
        # Un asset del juego que nunca se ha reguardado se creó cuando se escribió: las dos fechas son
        # la misma y no hay nada mejor que decir. En cuanto se reguarde, `savedAt` avanzará y
        # `createdAt` se quedará donde está.
        if not item.get('savedAt'):
            item['savedAt'] = sello
            tocado = True
        if not item.get('createdAt'):
            item['createdAt'] = item['savedAt']
            tocado = True
    if item.get('count') is None:
        try:
            with open(ruta, 'r', encoding='utf-8') as f:
                item['count'] = len(json.load(f).get('voxels', {}) or {})
        except Exception:
            item['count'] = 0
def list_assets_auto():
    """Devuelve el catálogo de assets garantizando que TODO archivo .vox.json en assets/ esté incluido."""
    idx_path = os.path.join(BASE, 'assets', 'index.json')
    assets_dir = os.path.join(BASE, 'assets')
    idx = []
    if os.path.exists(idx_path):
        try:
            with open(idx_path, 'r', encoding='utf-8') as f:
                idx = json.load(f)
        except Exception:
            idx = []

    indexed_files = {item.get('file') for item in idx if item.get('file')}
    tocado = False

    # Escanear assets/ para descubrir archivos nuevos creados en disco
    for root, _, files in os.walk(assets_dir):
        for fn in files:
            if fn.endswith('.vox.json'):
                full_p = os.path.join(root, fn)
                rel_p = os.path.relpath(full_p, BASE).replace('\\', '/')
                if rel_p in indexed_files:
                    continue
                try:
                    with open(full_p, 'r', encoding='utf-8') as f:
                        doc = json.load(f) or {}
                except Exception:
                    continue
                meta = doc.get('meta', {})
                # ⛔ El id es la RUTA dentro de `assets/`, no el nombre del fichero. Con el nombre a secas,
                # `trees_mock/pino` y `pino` eran el mismo asset para todo el servidor: al guardar el de la
                # subcarpeta se escribía `assets/pino.vox.json`, y al borrar el viejo se borraba el nuevo
                # (lo vio el dueño, 2026-08-27). Los mocks son assets como los demás: lo que los distingue
                # es dónde están. Ojo, la separación es siempre `/`, también en Windows: es un id, no una ruta.
                raw_id = rel_p[len('assets/'):-len('.vox.json')]
                # …pero el NOMBRE visible sigue saliendo del fichero: nadie quiere leer «Trees_Mock/Pino».
                name = meta.get('name') or raw_id.split('/')[-1].replace('-', ' ').replace('_', ' ').title()
                tipo = meta.get('type', 'objeto')
                role = meta.get('role', f'Asset · {name}')
                icon = meta.get('icon', '🧱' if tipo == 'textura' else '📦')
                group = 'Bloques de construcción' if tipo == 'textura' else ('Naturaleza' if any(k in raw_id for k in ('cerezo', 'arbol', 'hoja', 'palmera', 'pino', 'roble')) else 'Objetos')
                size = doc.get('size', 16)
                vox_count = len(doc.get('voxels', {}) or {})
                item = {
                    'id': raw_id,
                    'name': name,
                    'role': role,
                    'icon': icon,
                    'type': tipo,
                    'group': group,
                    'size': size,
                    'file': rel_p,
                    'savedAt': doc.get('savedAt') or now_iso(),
                    'createdAt': doc.get('createdAt') or now_iso(),
                    'count': vox_count
                }
                if 'categoria' in meta: item['categoria'] = meta['categoria']
                if 'herramienta' in meta: item['herramienta'] = meta['herramienta']
                if 'alias' in meta: item['alias'] = meta['alias']
                if 'description' in meta: item['description'] = meta['description']
                idx.append(item)
                indexed_files.add(rel_p)
                tocado = True

    if tocado:
        try:
            atomic_dump(idx, idx_path)
        except Exception:
            pass

    return idx


def list_all(criba=None):
    """El listado de la galería. `criba(doc)` decide cuáles entran; sin criba, entran todos.

    REQ-ASSET1 · La criba se pasa desde fuera y NO se calcula aquí a propósito: quién puede ver qué
    depende de la petición (`quien()`, `_es_dueno()`), y meter eso en una función que solo sabe leer
    ficheros la ataría al `Handler` y la dejaría sin poder probarse sola.
    """
    out = []
    for fn in sorted(os.listdir(STORE)):
        if not fn.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(STORE, fn), encoding='utf-8'))
        except Exception:
            continue
        if criba and not criba(d):
            continue
        meta = d.get('meta', {})
        out.append({'id': fn[:-5], 'name': meta.get('name', '(sin nombre)'),
                    # REQ-ASSET1 · de quién es y si es «del mundo». Viajan en el listado porque la
                    # galería tiene que poder enseñar «tuyo» / «del mundo» sin una segunda petición.
                    **autoria.resumen(d),
                    'role': meta.get('role', ''), 'type': meta.get('type', 'objeto'),
                    'categoria': meta.get('categoria', ''),
                    # REQ-TOOL1: qué herramienta del Mundo ES este dibujo ('build'|'paint'|...).
                    # Viaja en el listado para que la ranura 10 la resuelva SIN claves escritas a mano.
                    'herramienta': meta.get('herramienta', ''),
                    'size': d.get('size', 16), 'count': len(d.get('voxels', {})),
                    'savedAt': d.get('savedAt', ''),
                    # REQ-GAL4: dos fechas distintas. `savedAt` = último guardado («recientes»);
                    # `createdAt` = alta. Los dibujos anteriores al ticket no la traen: se cae a
                    # `savedAt`, que es lo más antiguo que consta de ellos.
                    'createdAt': d.get('createdAt') or d.get('savedAt', '')})
    out.sort(key=lambda h: h.get('savedAt', ''), reverse=True)   # más recientes primero
    return out

# ---- Fotos del Mundo (tecla F) ----------------------------------------------------------------
# Cada foto son DOS ficheros hermanos con el mismo nombre: el .png (con la ficha ya quemada en la
# imagen, para que sobreviva a copiar/pegar) y un .json con esa misma ficha en crudo. El .json existe
# para que la galería —y quien lea el disco— pueda ordenar, filtrar y volver a las coordenadas sin
# tener que leer la imagen.
FOTO_MAX_BYTES = 24 * 1024 * 1024     # una captura 4K en PNG no llega a 12 MB; el doble es margen de sobra
RE_FOTO = re.compile(r'^(\d{4,})_([a-z0-9-]+)_(\d{8}-\d{6})$')   # {4,} y no {4}: la foto 10000 sigue siendo una foto

def foto_nueva(mapa):
    """Reserva un nombre de foto libre y devuelve (id, ruta_png). O_EXCL y no «max+1» a secas: el
    servidor es multihilo y dos F seguidas se pisarían el fichero."""
    mapa = re.sub(r'[^a-z0-9]+', '-', (mapa or 'default').lower()).strip('-') or 'default'
    sello = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    n = 0
    for fn in os.listdir(FOTOS):
        m = RE_FOTO.match(fn[:-4]) if fn.endswith('.png') else None
        if m:
            n = max(n, int(m.group(1)))
    while True:
        n += 1
        idd = f'{n:04d}_{mapa}_{sello}'
        fp = os.path.join(FOTOS, idd + '.png')
        try:
            os.close(os.open(fp, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            return idd, fp
        except FileExistsError:
            continue

def list_fotos():
    out = []
    for fn in os.listdir(FOTOS):
        m = RE_FOTO.match(fn[:-4]) if fn.endswith('.png') else None
        if not m:
            continue
        idd = fn[:-4]
        fp = os.path.join(FOTOS, fn)
        try:
            tam = os.path.getsize(fp)
        except OSError:
            continue
        try:
            ficha = json.load(open(os.path.join(FOTOS, idd + '.json'), encoding='utf-8'))
        except Exception:
            ficha = {}                                   # un .png sin su .json sigue siendo una foto válida
        out.append({'id': idd, 'n': int(m.group(1)), 'mapa': m.group(2),
                    'url': '/data/fotos/' + fn, 'bytes': tam, 'ficha': ficha})
    out.sort(key=lambda f: f['n'], reverse=True)          # por número y no por texto: '10000' es posterior a '9999'
    return out

# ---- Vídeos del Mundo (Alt+V / game.video()) ---------------------------------------------------
VIDEO_MAX_BYTES = 120 * 1024 * 1024    # 120 MB de tope para clips de vídeo
RE_VIDEO = re.compile(r'^(\d{4,})_([a-z0-9-]+)_(\d{8}-\d{6})$')

def video_nueva(mapa, ext='mp4'):
    """Reserva un nombre de vídeo libre y devuelve (id, ruta_video)."""
    mapa = re.sub(r'[^a-z0-9]+', '-', (mapa or 'default').lower()).strip('-') or 'default'
    sello = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    ext = 'webm' if ext == 'webm' else 'mp4'
    n = 0
    for fn in os.listdir(VIDEOS):
        if fn.endswith('.mp4') or fn.endswith('.webm') or fn.endswith('.mov') or fn.endswith('.m4v'):
            base = os.path.splitext(fn)[0]
            m = RE_VIDEO.match(base)
            if m:
                n = max(n, int(m.group(1)))
    while True:
        n += 1
        idd = f'{n:04d}_{mapa}_{sello}'
        fp = os.path.join(VIDEOS, f'{idd}.{ext}')
        try:
            os.close(os.open(fp, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            return idd, fp
        except FileExistsError:
            continue

def list_videos():
    out = []
    for fn in os.listdir(VIDEOS):
        if not (fn.endswith('.mp4') or fn.endswith('.webm') or fn.endswith('.mov') or fn.endswith('.m4v')):
            continue
        base, ext = os.path.splitext(fn)
        m = RE_VIDEO.match(base)
        if not m:
            continue
        idd = base
        fp = os.path.join(VIDEOS, fn)
        try:
            tam = os.path.getsize(fp)
        except OSError:
            continue
        try:
            ficha = json.load(open(os.path.join(VIDEOS, idd + '.json'), encoding='utf-8'))
        except Exception:
            ficha = {}
        out.append({'id': idd, 'n': int(m.group(1)), 'mapa': m.group(2),
                    'url': '/data/videos/' + fn, 'ext': ext.lstrip('.'),
                    'bytes': tam, 'ficha': ficha})
    out.sort(key=lambda f: f['n'], reverse=True)
    return out

# ---------------------------------------------------------------------------------------------
# Iconos de la aplicación (/images). Dos cosas distintas viven en data/ui/:
#   · `ranuras.json` — la ASIGNACIÓN: qué dibujo, en qué postura, plano o iso, con o sin suavizado.
#     Es la fuente de verdad y lo único que hay que conservar: de ahí se rehornea todo.
#   · `<ranura>-<px>.png` — el DERIVADO que consumen los HTML por una URL fija. Se versiona igual
#     (ver .gitignore) porque un clon recién hecho enseñaría la pestaña rota hasta que alguien
#     entrase en /images a publicar. NO se editan a mano nunca.
# El horneado lo hace el NAVEGADOR (es quien tiene el rasterizador de `pinta`), así que aquí solo
# se valida y se escribe: mismo trato que /api/fotos.
UI_MAX_BYTES = 4 * 1024 * 1024        # un icono de 64 px son ~2 KB; 4 MB cubren el lote entero con margen
RE_UI_PNG = re.compile(r'^[a-z][a-z0-9-]*-\d{1,4}$')   # 'favicon-16', 'tool-hand-32', 'marca-64'

def ui_leer():
    """La asignación guardada, o {} si nadie ha publicado todavía."""
    try:
        d = json.load(open(UIFILE, encoding='utf-8'))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def png_crudo(dato):
    """Un data-URL de PNG → sus bytes, o None si no lo es. La comprobación es de BYTES MÁGICOS y no
    de la cabecera del data-URL: el cliente la escribe él y no prueba nada."""
    if not isinstance(dato, str):
        return None
    if ',' in dato[:64] and dato.startswith('data:'):
        dato = dato.split(',', 1)[1]
    try:
        crudo = base64.b64decode(dato, validate=True)
    except Exception:
        return None
    return crudo if crudo[:8] == b'\x89PNG\r\n\x1a\n' else None

# ---------------------------------------------------------------------------------------------
# Compresión. `data/mundo.json` son 5,3 MB de JSON con la misma clave repetida 81.000 veces: gzip lo
# deja en 262 KB (×20). Medido desde un móvil (20 Mbps, 40 ms de ida y vuelta) eso son ~2,1 s de la
# apertura del Mundo. Los assets de bloque comprimen ×4.
#
# Nivel 1 y NO 6 a propósito: en este JSON tan repetitivo la diferencia de tamaño es de un pelo y la
# de CPU no, y el servidor está en el camino crítico de abrir el Mundo.
#
# Se memoriza por (ruta, mtime, tamaño) porque son siempre los mismos bytes: comprimir 5 MB en cada
# petición metería en el camino crítico justo lo que venimos a quitar. El parseo de validación
# también se hace una sola vez por versión del fichero.
GZ_NIVEL = 1
GZ_MIN   = 1400          # por debajo de un paquete de red, comprimir es trabajo para nada
_gz_cache = {}           # (ruta, mtime_ns, tam) -> (crudo, gzip)
_gz_lock  = threading.Lock()

def json_file_body(path):
    """(bytes crudos, bytes gzip) de un .json del disco, o None si no existe o no parsea.

    Devolver None es la señal de «sigue por el camino de siempre»: un mundo corrupto tiene que
    acabar en el respaldo de toda la vida, no servirse tal cual porque sea más rápido."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    clave = (path, st.st_mtime_ns, st.st_size)
    with _gz_lock:
        hit = _gz_cache.get(clave)
    if hit is not None:
        return hit
    try:
        with open(path, 'rb') as f:
            crudo = f.read()
        json.loads(crudo)                      # validar UNA vez por versión, no en cada petición
    except Exception:
        return None
    par = (crudo, gzip.compress(crudo, GZ_NIVEL))
    with _gz_lock:
        if len(_gz_cache) > 64:                # los mundos y los assets son pocos; esto es un tope, no una política
            _gz_cache.clear()
        _gz_cache[clave] = par
    return par


class Handler(http.server.SimpleHTTPRequestHandler):
    # Keep-alive. Con HTTP/1.0 el servidor cerraba la conexión en CADA respuesta: abrir el Mundo son
    # ~40 peticiones, o sea ~40 apretones de manos TCP, que a 40 ms de ida y vuelta se notan más que
    # los bytes. Exige Content-Length exacto en todas las respuestas (lo ponen `_send_bytes`,
    # SimpleHTTPRequestHandler y `send_error`) y vaciar el cuerpo de las peticiones que no se leen
    # (ver `_drenar`): un byte suelto en el socket se interpretaría como la petición siguiente.
    protocol_version = 'HTTP/1.1'

    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    # El sitio vive en `web/` y los datos (dibujos, mundos, fotos, wiki, /images) siguen en la raíz
    # del repo, porque sus URLs son públicas y llevan años escritas así. `translate_path` elige la
    # raíz por el PRIMER TRAMO de la URL, y todo lo demás cae en `web/`: la consecuencia buscada es
    # que `/server.py`, `/PLAN.md`, `/tests/…` y el resto del código dejan de estar servidos por HTTP.
    # Se cambia `self.directory` en vez de rehacer la ruta a mano para no perder el confinamiento
    # que ya hace SimpleHTTPRequestHandler (el que impide salir con `..`).
    #
    # `performance` es la excepción que confirma la regla (2026-08-21): sus `.js` NO son código del
    # motor, son sondas que sólo existen para correr EN la consola del navegador. Copiarlas a mano al
    # portapapeles son 35 KB de pegado; servidas, la tirada es `await import('/performance/<sonda>.js')`.
    RAIZ_URL = ('assets', 'data', 'wiki', 'images', 'performance')

    # En modo público `data/` DEJA de servirse entero. Servirlo era cómodo y regalaba el listado
    # navegable de `data/tickets/` (capturas y conversaciones del dueño), `data/informes/`,
    # `data/worlds/` y 1,5 GB de `data/habitantes_trash/`. De todo `data/`, el sitio sólo pide estas
    # cuatro (comprobado con un grep de `/data/` en `web/*.html|js|css`), así que lo demás sobra.
    # `performance/` son sondas de desarrollo: fuera también.
    RAIZ_URL_PUBLICO = ('assets', 'data', 'wiki', 'images')
    DATA_PUBLICA = ('ui', 'fotos', 'videos', 'informes')

    def _raiz_permitida(self, tramos):
        """¿Se puede servir del disco esta URL? `tramos` son los trozos de la ruta ya partida."""
        tramo = tramos[0] if tramos else ''
        if not es_publico():
            return tramo in self.RAIZ_URL
        if tramo not in self.RAIZ_URL_PUBLICO:
            return False
        if tramo == 'data':
            return len(tramos) > 1 and tramos[1] in self.DATA_PUBLICA
        return True

    def translate_path(self, path):
        tramo = urllib.parse.urlparse(path).path.lstrip('/').split('/')[0]
        self.directory = BASE if tramo in self.RAIZ_URL else WEB
        return super().translate_path(path)

    def list_directory(self, path):
        """⛔ Nunca un listado de carpeta. El de serie enseñaba `data/` entero a quien pidiera `/data/`.

        Devolver 404 y no 403 es a propósito: que no se pueda distinguir «existe pero no te lo doy»
        de «no existe». En desarrollo tampoco hace falta: para mirar ficheros está la shell.
        """
        self.send_error(404, 'No encontrado')
        return None

    def handle_one_request(self):
        # ⚠️ TODO lo que sea «de esta petición» se borra AQUÍ. Con `protocol_version = 'HTTP/1.1'`
        # hay keep-alive, y entonces UN handler sirve MUCHAS peticiones seguidas: lo que se guarde
        # en `self` sobrevive a la petición que lo puso.
        #
        # `_quien` faltaba, y no era teórico. La caché de identidad (`quien()`) se quedaba pegada al
        # socket, así que en el navegador —que siempre reaparovecha la conexión— entrar no surtía
        # efecto hasta que el socket moría: la primera petición cacheaba «anónimo» y la cookie
        # recién puesta se ignoraba el resto de la conexión. Y al revés es peor: después de
        # `/api/salir`, las siguientes peticiones seguían siendo del que acababa de salir.
        # No lo cazaba ningún test porque Node 18 abre una conexión por petición; lo cazó una sonda
        # con `new http.Agent({keepAlive:true})`, que es lo que ahora hace `test_permisos_api.js §10`.
        self._cuerpo_leido = False
        self.__dict__.pop('_quien', None)
        self._codigo = None
        self._nota = ''
        self._t0 = time.perf_counter()
        try:
            super().handle_one_request()
        finally:
            # En el `finally` a propósito: la petición que revienta a mitad es EXACTAMENTE la que
            # hay que poder mirar después. Y aquí, no en `log_request`, porque a `log_request` lo
            # llama `send_response` ANTES de escribir el cuerpo: el tiempo saldría siempre bonito.
            self._apunta_peticion()

    def _apunta_peticion(self):
        if self._codigo is None and not self._nota:
            return                                    # conexión que se cerró sin llegar a pedir nada
        ruta = getattr(self, 'path', '') or '-'
        metodo = getattr(self, 'command', None) or '-'
        # Con nota (la puso `log_error`) se apunta siempre: es una petición que ya salió mal, y son
        # las únicas que de verdad hacen falta. Sin nota, decide `merece`.
        if not self._nota and not registro.merece(metodo, urllib.parse.urlsplit(ruta).path, self._codigo):
            return
        # `quien()` ya está resuelto y cacheado si alguna rama lo miró; si no lo miró, era una
        # petición que no depende de quién seas y no vale la pena leer un fichero para apuntarlo.
        u = self.__dict__.get('_quien')
        registro.apunta(self.client_address[0] if self.client_address else '-',
                        metodo, ruta, self._codigo if self._codigo is not None else 0,
                        (time.perf_counter() - self._t0) * 1000,
                        (u or {}).get('uid') or ('dueño' if self.headers.get('X-VoxelForge-Token') else None),
                        self._nota)

    def log_request(self, code='-', size='-'):
        # No escribe: solo se queda con el código para que lo apunte `_apunta_peticion` al final.
        self._codigo = code if isinstance(code, int) else None

    def _acepta_gzip(self):
        return 'gzip' in (self.headers.get('Accept-Encoding') or '')

    def _drenar(self):
        """Se traga el cuerpo que este handler no llegó a leer (p.ej. un POST a una ruta que no existe).
        Sin esto, con keep-alive, ese cuerpo sería lo primero que se lee de la petición siguiente."""
        if getattr(self, '_cuerpo_leido', False):
            return
        self._cuerpo_leido = True
        n = int(self.headers.get('Content-Length', 0) or 0)
        while n > 0:
            trozo = self.rfile.read(min(n, 65536))
            if not trozo:
                break
            n -= len(trozo)

    def _send_bytes(self, code, ctype, crudo, gz=None, extra=()):
        self._drenar()
        cuerpo, comprimido = crudo, False
        if gz is not None and len(gz) < len(crudo) and self._acepta_gzip():
            cuerpo, comprimido = gz, True
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        for k, v in extra:
            self.send_header(k, v)
        if comprimido:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(cuerpo)
    def log_message(self, *a):
        pass                                          # la consola se queda limpia; lo escrito va al registro

    def log_error(self, formato, *a):
        # Esto también era `pass`, así que una petición malformada o una conexión rota a mitad no
        # dejaban rastro: es la media línea que explica los 400 que si no, no se entienden.
        #
        # ⚠️ Guarda el MOTIVO, no escribe. `send_error` llama a `log_error` y DESPUÉS a
        # `send_response`, o sea que escribir aquí dejaría dos líneas por cada 404 — el doble de
        # fichero para contar una sola cosa. La línea, una, la pone `_apunta_peticion` al final.
        try:
            self._nota = '· ' + (formato % a)
        except Exception:
            self._nota = '· error'
    def end_headers(self):
        # Sin esto el navegador cachea app.js/style.css (heurística de SimpleHTTP sin Cache-Control)
        # y los cambios del editor no llegan al recargar. no-cache = revalidar siempre.
        #
        # ⚠️ Salvo que la respuesta traiga la SUYA (`self._cache_propia`, F3.6). Dos `Cache-Control` en
        # la misma respuesta no son dos opciones: el navegador los junta con comas y `no-cache` gana,
        # así que sin esta puerta el `max-age` de las miniaturas no cachearía nada y encima parecería
        # que sí. Se pone en las respuestas cuyo contenido no puede cambiar porque la URL lleva sello.
        if not getattr(self, '_cache_propia', False):
            self.send_header('Cache-Control', 'no-cache')
        # `nosniff`: sin ella, un .json o un .txt que empiece por «<» lo puede interpretar el navegador
        # como HTML y ejecutarlo. Todo lo que sube un usuario (fotos, piezas) se sirve de este mismo
        # origen, así que adivinar el tipo es adivinar mal.
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        # ⚠️ SAMEORIGIN, NUNCA 'DENY': el OSD monta sus pantallas de tipo mapa como iframes
        # `/map/<x>?osd=1` del MISMO origen (docs/osd-e-intro.md). Con DENY el menú se queda en negro.
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        # ⛔ Aquí NO se pone Content-Security-Policy, y conviene que quede escrito por qué: los
        # snippets son la arquitectura del juego y corren con `new AsyncFunction(code)`, así que una
        # CSP tendría que llevar 'unsafe-eval' y 'unsafe-inline' — o sea, no protegería de nada y
        # daría la falsa sensación de que sí. Lo que de verdad cierra ese agujero es que sólo el
        # dueño pueda escribir snippets (`_exige_dueno` más abajo).
        super().end_headers()
    def _send(self, code, obj, extra=()):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        gz = gzip.compress(body, GZ_NIVEL) if len(body) >= GZ_MIN and self._acepta_gzip() else None
        self._send_bytes(code, 'application/json; charset=utf-8', body, gz, extra)
    def _read(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
        self._cuerpo_leido = True
        return json.loads(self.rfile.read(n) or b'{}')

    # ── Los tres guardias de toda escritura ─────────────────────────────────────────────────────
    # Van juntos y se llaman en UN SOLO SITIO (la cabecera de do_POST/do_PATCH/do_DELETE), no rama
    # por rama: un guardia que hay que acordarse de poner en cada `if` es un guardia que se olvida.

    def _tope_cuerpo(self, ruta):
        """Cuántos bytes se le admiten a esta ruta.

        Los números salen de medir lo más gordo que hay hoy, no de redondear: el snippet mayor es
        `mundo-autoarranque` (308 KB), el asset mayor `castillo.vox.json` (1,6 MB) y el habitante
        mayor `taberna.json` (2,5 MB). El tope general de 512 KB cubre el resto de sobra.
        """
        if ruta.startswith('/api/fotos'):    return FOTO_MAX_BYTES
        if ruta.startswith('/api/videos'):   return VIDEO_MAX_BYTES
        if ruta.startswith('/api/ui'):       return UI_MAX_BYTES
        if ruta.startswith('/api/snippets'): return 2 * 1024 * 1024
        # REQ-PLANT2 · la foto de una ficha viaja en base64, que abulta un tercio más que el fichero.
        # Con el tope general de 512 KB ninguna foto de móvil pasaba, y el 413 no decía por qué.
        if ruta.startswith('/api/panel/plantilla/foto'):
            return plantillas.FOTO_MAX_BYTES * 4 // 3 + 4096
        if ruta.startswith('/api/assets') or ruta.startswith('/api/habitantes') or ruta.startswith('/api/agentes'):
            return 8 * 1024 * 1024
        if ruta == '/api/mundo':
            # El mundo entero. El comentario de la rama habla de «un POST de 257 MB», así que en
            # desarrollo se deja holgado; en público es cosa del dueño y 64 MB sobran (el mundo más
            # grande del repo pesa 6 MB).
            return (64 if es_publico() else 512) * 1024 * 1024
        if ruta.startswith('/api/mundo'):    return 4 * 1024 * 1024   # /edits y /cabecera son deltas
        return 512 * 1024

    def _cuerpo_cabe(self, ruta):
        """False (y ya ha respondido) si el cuerpo declarado no cabe.

        Se mira el `Content-Length` ANTES de leer nada: `self.rfile.read(n)` con la `n` que diga el
        cliente es exactamente el POST que agota la RAM del proceso. Y un POST sin `Content-Length`
        se rechaza en vez de tratarlo como vacío, que era la otra forma de colarse.
        """
        crudo = self.headers.get('Content-Length')
        if crudo is None:
            if self.command in ('POST', 'PATCH'):
                self._send(411, {'error': 'falta Content-Length'})
                return False
            return True
        try:
            n = int(crudo)
        except ValueError:
            # ⚠️ `_cuerpo_leido` ANTES de contestar: si no, `_drenar` intentaría `int('dos megas')` y
            # se llevaría el hilo por delante justo en la petición que veníamos a rechazar.
            self._cuerpo_leido = True
            self.close_connection = True          # sin longitud creíble no se sabe dónde acaba esta
            self._send(400, {'error': 'Content-Length inválido'})
            return False
        tope = self._tope_cuerpo(ruta)
        if n > tope:
            # ⚠️ Aquí está el sentido entero del guardia: NO se drena. `_send` llama a `_drenar`, que
            # se leería los 512 MB que acabamos de rechazar — o sea, el ataque, sólo que en dos
            # pasos. Marcamos el cuerpo como leído para desactivarlo y cerramos la conexión, que es
            # la única forma honesta de dejar sin leer lo que queda en el socket.
            self._cuerpo_leido = True
            self.close_connection = True
            self._send(413, {'error': f'cuerpo demasiado grande ({n} bytes; el tope aquí son {tope})'})
            return False
        return True

    def _ip(self):
        """Quién llama, para contarle las escrituras.

        ⚠️ `X-Forwarded-For` sólo se cree si la conexión viene de la propia máquina, o sea de NUESTRO
        proxy. Creérselo siempre sería regalar el salto del freno: cualquiera manda la cabecera que
        quiera y cada petición parece de una IP distinta.
        """
        directa = self.client_address[0]
        if directa in ('127.0.0.1', '::1') and self.headers.get('X-Forwarded-For'):
            return self.headers['X-Forwarded-For'].split(',')[0].strip() or directa
        return directa

    def _freno_ok(self):
        """False (y ya ha respondido 429) si esta IP está escribiendo demasiado. Sólo en público.

        El freno es contra el ABUSO ANÓNIMO —un bucle de `curl` llenando el disco—, así que se
        aplica por identidad y no a todo el mundo por igual:

          · el DUEÑO no se frena. Sus herramientas (`herramientas/*.py`, `multi/publica_cliente.py`)
            y la tanda de tests hacen ráfagas de cientos de escrituras seguidas, y frenarlas es
            romper el trabajo, no proteger nada: quien trae el token ya puede hacer lo que quiera.
          · quien ha ENTRADO con su cuenta tiene un tope alto (`TOPE_SESION`): tiene nombre, cuota
            y a quién reclamarle.
          · el anónimo, el de siempre (`TOPE`).
        """
        if not es_publico():
            return True
        if self._es_dueno():
            return True
        tope = limites.TOPE_SESION if self.quien() else limites.TOPE
        cabe, restantes = limites.cabe(self._ip(), tope)
        if not cabe:
            self.send_response(429)
            self.send_header('Retry-After', str(int(limites.VENTANA)))
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            cuerpo = json.dumps({'error': 'demasiadas escrituras seguidas; espera un poco'},
                                ensure_ascii=False).encode('utf-8')
            self.send_header('Content-Length', str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return False
        return True

    def _es_dueno(self):
        """¿Trae esta petición el token del dueño? (cabecera `X-VoxelForge-Token`)

        En desarrollo, cuando no hay token configurado, TODO EL MUNDO es el dueño: es la máquina de
        uno y los 128 tests hacen POST anónimos. En público el token es obligatorio (lo comprueba
        `_exige_dueno`), así que un servidor abierto sin token no deja escribir a nadie.
        """
        serv = get_server_token()
        if not serv:
            return not es_publico()
        if str(self.headers.get('X-VoxelForge-Token') or '').strip() == serv:
            return True
        # F5.8 · …o la GALLETA DEL MODO DISEÑO, que es la misma llave por otra puerta.
        #
        # Petición del dueño: «que para entrar en modo diseño se requiera un token». El token ya
        # existía, pero solo servía desde `curl`: un NAVEGADOR no puede poner `X-VoxelForge-Token`
        # al escribir una URL, así que con `VOXELFORGE_TOKEN` puesto el dueño se quedaba fuera de su
        # propio editor y la única salida era quitar el token. Por eso hay una segunda puerta.
        #
        # ⛔ En la galleta NO va el token, va una FIRMA con caducidad. Guardar el token en el tarro
        # del navegador sería dejar la llave del servidor en un fichero de texto que cualquier
        # extensión lee, y encima sin caducar nunca.
        return self._galleta_disena_ok()

    def _via_dueno(self):
        """POR DÓNDE es dueño quien pide: `'token'`, `'galleta'` o `'desarrollo'`. `None` si no lo es.

        Lo pinta la chapa de identidad (`web/quien.js`), y la que importa es `'desarrollo'`: ahí no
        hay token configurado y `_es_dueno` le dice que sí a cualquiera que abra la página. Sin
        distinguirla, la chapa pondría «dueño» en la máquina de desarrollo y quien la leyera creería
        estar viendo una sesión — justo la confusión que la chapa venía a quitar.
        """
        if not self._es_dueno():
            return None
        if not get_server_token():
            return 'desarrollo'
        if str(self.headers.get('X-VoxelForge-Token') or '').strip() == get_server_token():
            return 'token'
        return 'galleta'

    COOKIE_DISENA = 'vf_disena'
    DIAS_DISENA = 7

    def _galleta_disena_ok(self):
        crudo = ''
        for trozo in str(self.headers.get('Cookie') or '').split(';'):
            if '=' in trozo:
                k, v = trozo.split('=', 1)
                if k.strip() == self.COOKIE_DISENA:
                    crudo = v.strip()
        if not crudo or '.' not in crudo:
            return False
        caduca, _, firma = crudo.partition('.')
        try:
            if int(caduca) < time.time():
                return False
        except ValueError:
            return False
        # `compare_digest` y no `==`, por lo mismo que en `sesion.comprueba`: comparar firmas con
        # `==` filtra byte a byte cuánto has acertado.
        return hmac.compare_digest(firma, sesion._firma('disena.' + caduca))

    def _vale_disena(self):
        caduca = str(int(time.time()) + self.DIAS_DISENA * 86400)
        return caduca + '.' + sesion._firma('disena.' + caduca)

    def _exige_dueno(self, que):
        """False (y ya ha respondido) si quien pide no es el dueño. `que` es para el mensaje."""
        if self._es_dueno():
            return True
        hay = bool(get_server_token())
        self._send(401 if not hay or not self.headers.get('X-VoxelForge-Token') else 403,
                   {'error': f'{que}: hace falta ser el dueño', 'requiresToken': True})
        return False

    # ── Quién es quién ──────────────────────────────────────────────────────────────────────────
    def quien(self):
        """El usuario de la cookie, o None si es anónimo. Se resuelve UNA vez por petición.

        La caché no es por velocidad (leer un JSON de 400 B no lo es): es para que dos ramas de la
        misma petición no puedan ver identidades distintas si el fichero cambia por medio.
        """
        if not hasattr(self, '_quien'):
            galletas = {}
            for trozo in str(self.headers.get('Cookie') or '').split(';'):
                if '=' in trozo:
                    k, v = trozo.split('=', 1)
                    galletas[k.strip()] = v.strip()
            uid = sesion.abre(galletas.get(sesion.COOKIE))
            self._quien = sesion.carga(uid) if uid else None
        return self._quien

    def exige(self, permiso, que=None):
        """False (y ya ha respondido 401/403) si quien pide no tiene este permiso.

        401 = «no sé quién eres, entra»; 403 = «sé quién eres y no puedes». La distinción no es
        cosmética: es lo que le dice al menú si tiene que enseñar el formulario de entrada o un
        «pídeselo al dueño».

        ⚠️ El token del dueño manda sobre todo lo demás (F1.7): lo usan `herramientas/*.py`,
        `multi/publica_cliente.py` y los tests, y en desarrollo sin token todo el mundo es el dueño,
        que es lo que mantiene verdes los 128 tests de siempre.
        """
        if self._es_dueno():
            return True
        u = self.quien()
        if sesion.puede(u, permiso):
            return True
        self._send(403 if u else 401,
                   {'error': f'{que or permiso}: no tienes permiso', 'permiso': permiso,
                    'necesitaEntrar': not u})
        return False

    def _origen_ok(self):
        """CSRF de andar por casa: una escritura de fuera de nuestro sitio no se atiende.

        `SameSite=Lax` ya impide que la cookie viaje en un POST de otra página, así que esto es el
        cinturón sobre el tirante — y cubre a los navegadores que no lo respeten. Sin `Origin` se
        deja pasar a propósito: `curl` y los `herramientas/*.py` no lo mandan, y su puerta es el
        token, no ésta.
        """
        origen = self.headers.get('Origin')
        if not origen:
            return True
        anfitrion = self.headers.get('Host') or ''
        try:
            o = urllib.parse.urlparse(origen)
        except ValueError:
            return False
        return o.netloc == anfitrion

    def _guardias(self):
        """Los cinco, en orden de coste. False = ya se ha respondido y la rama no debe seguir."""
        ruta = urllib.parse.urlparse(self.path).path
        if not self._freno_ok():
            return False
        if not self._cuerpo_cabe(ruta):
            return False
        if es_publico() and not self._origen_ok():
            self._send(403, {'error': 'origen no permitido'})
            return False
        if es_publico() and self.command in ('POST', 'PATCH', 'DELETE'):
            if not self._exige_por_ruta(ruta):
                return False
        return True

    def _exige_por_ruta(self, ruta):
        """El permiso que pide esta ruta, buscando en PERMISO_POR_RUTA el prefijo MÁS LARGO.

        ⚠️ Lo importante de esta función es lo que hace cuando NO encuentra nada: exigir el dueño.
        Prohibir por defecto es la única forma de que una ruta nueva no nazca abierta — y nacen: el
        que añada mañana `POST /api/loquesea` no va a acordarse de este fichero. Al revés (permitir
        lo no listado) el agujero lo abre el olvido, que es lo más fácil de conseguir.
        """
        if ruta in RUTAS_ABIERTAS:
            return True
        # F5.6 · El vale ES una credencial: un HMAC que afirma «a este mapa puedes pasar». Sin esto,
        # la matriz pide `mundo.editar_propio` ANTES de mirar el mapa y el invitado sin cuenta se
        # come un 401 — o sea, «invitar en un clic» solo funcionaría entre gente ya registrada.
        # ⛔ SOLO para las rutas de DELTA. Nunca para `/api/mundo` a secas, que reescribe el mundo
        # entero (64 MB, dueño): un enlace de invitación no puede valer para machacar el mapa.
        # Y esto no decide nada más: la rama sigue llamando a `_mundo_ok(escribir=True)`, que aplica
        # la `escritura` del mapa, así que un vale a un mapa `escritura: dueno` sigue sin escribir.
        if ruta in RUTAS_CON_VALE and vales.vale_para(
                vales.de_la_peticion(self.path), self._slug_pedido()):
            return True
        mejor = None
        for prefijo, permiso, que, metodos in PERMISO_POR_RUTA:
            if metodos is not None and self.command not in metodos:
                continue
            if ruta == prefijo or ruta.startswith(prefijo + '/'):
                # A igualdad de prefijo gana la fila con método explícito: es la más específica, y
                # si no, el orden de la tabla decidiría en silencio cuál de las dos manda.
                puntos = (len(prefijo), 1 if metodos is not None else 0)
                if mejor is None or puntos > mejor[0]:
                    mejor = (puntos, permiso, que)
        if mejor is None:
            return self._exige_dueno(f'escribir en {ruta}')
        return self.exige(mejor[1], mejor[2])
    def _id(self):
        m = re.match(r'^/api/habitantes/([A-Za-z0-9_-]+)$', self.path)
        return m.group(1) if m else None
    def _path(self, idd):
        return os.path.join(STORE, idd + '.json')
    def _snip_id(self):
        m = re.match(r'^/api/snippets/([A-Za-z0-9_-]+)$', self.path)
        return m.group(1) if m else None
    def _snip_path(self, idd):
        return os.path.join(SNIPS, idd + '.json')

    def _slug_pedido(self):
        """El mapa al que se refiere esta petición, ya normalizado. '' = el mapa «default»."""
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        return world_slug(q.get('map', [''])[0]) or 'default'

    def _mundo_ok(self, escribir=False):
        """True si quien pide puede ver (o escribir) el mapa de esta petición. Si no, ya ha contestado.

        ⚠️ Booleano explícito, nunca `return self._send(...)`: ver `_en_uso_o_409`.

        El dueño del servidor pasa siempre. En desarrollo SIN token todo el mundo es el dueño, así
        que esto no se nota; y en desarrollo CON token la lectura sigue abierta (ver abajo), que es
        lo que mantiene verdes los tests de navegador. La regla solo muerde de verdad en público.
        """
        if self._es_dueno():
            return True
        slug = self._slug_pedido()
        meta = mundos_meta.lee(slug)
        u = self.quien()
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        # F5.6 · El vale de invitación te hace INVITADO de este mapa, ni más ni menos. No es un
        # pase que se salte las reglas: sigue mandando la `escritura` del mapa, así que en un mapa
        # `escritura: dueno` el invitado entra y MIRA. Es lo que hace que las tres reglas de F6.3
        # signifiquen algo para quien llega por enlace, y evita que invitar a ver sea invitar a tocar.
        # ⛔ Solo abre el mapa que va DENTRO de la firma: `vale_para` compara el slug, así que un
        # enlace a `castillo` no abre `santuario-zen`.
        invitado = vales.vale_para(q.get('invita', [''])[0].strip(), slug)
        # ⚠️ En DESARROLLO, LEER un mapa sigue siendo libre aunque haya token. Poner
        # `VOXELFORGE_TOKEN` en la máquina de uno sirve para que el modo diseño pida llave, no para
        # esconderle los mapas al navegador — y los ~160 tests de Playwright entran al 8500 SIN
        # identificarse: sin esta línea, poner el token deja la suite entera en 404 y el fallo no se
        # parece en nada a su causa. En modo público esto es código muerto (`es_publico()` manda) y
        # las visibilidades de `mundos_meta` siguen mandando enteras.
        if not es_publico() and not escribir:
            return True
        if not invitado and not mundos_meta.puede_ver(meta, u, q.get('codigo', [''])[0]):
            # 404 y no 403 a propósito, igual que el listado de carpetas: un 403 confirmaría que el
            # mapa existe, y «qué mapas privados tiene ese» no es asunto de nadie.
            self._send(404, {'error': f'no existe el mundo «{slug}»'})
            return False
        if escribir and not mundos_meta.puede_escribir(meta, u, invitado):
            # Aquí sí 403: ya ha demostrado que puede VER el mapa, así que no se filtra nada nuevo.
            self._send(403 if u else 401, {
                'error': f'«{slug}» es de solo lectura para ti (escritura: {meta.get("escritura")})',
                'necesitaEntrar': not u, 'mapa': slug})
            return False
        return True

    def _lleno_o_409(self, uid, crece, que='este mapa'):
        """F3.4 · True si a `uid` no le caben `crece` bytes más (y YA se ha contestado 409).

        ⚠️ Booleano explícito, nunca `return self._send(...)`: ver `_en_uso_o_409`. Aquí la forma
        equivocada sería todavía peor que en el borrado — el 409 saldría por el socket y el mundo se
        escribiría igual de grande. Una cuota que avisa y deja pasar no es una cuota.

        ⚠️ El gasto se le apunta AL DUEÑO DEL MAPA, no a quien escribe. Un mapa con la escritura
        abierta lo agranda cualquiera que entre, y cobrárselo al visitante dejaría a un invitado sin
        sitio en sus propios mapas por haber construido en los ajenos.
        """
        if not uid:
            return False        # el dueño del servidor no gasta, y un mapa heredado no es de nadie
        u = sesion.carga(uid)
        cuota = (u or {}).get('cuota') or sesion.CUOTA_POR_DEFECTO
        tope = cuota.get('bytes') or sesion.CUOTA_POR_DEFECTO['bytes']
        usados = bytes_de_usuario(uid)
        if usados + max(0, int(crece)) <= tope:
            return False
        mb = lambda n: f'{n / (1024 * 1024):.1f} MB'
        self._send(409, {
            'error': f'no cabe: {que} pediría {mb(crece)} y de {mb(tope)} ya hay {mb(usados)} en uso. '
                     'Borra algún mapa para hacer sitio.',
            'cuota': {'bytes': tope, 'usados': usados, 'pedido': int(crece)},
            'deQuien': uid})
        return True

    def _en_uso_o_409(self, clave, que):
        """True si `clave` está en uso (y YA se ha contestado 409); False si se puede borrar.

        ⚠️ Devuelve un booleano y NO `self._send(...)`, que es lo natural de escribir aquí y está
        mal: `_send` devuelve `None`, así que `if self._en_uso_o_409(...)` sería siempre falso, el
        409 saldría por el socket y el borrado seguiría adelante igualmente. El cliente ve un 409
        perfecto y el fichero ya no está. Lo cazó `test_en_uso_no_se_borra.js` (§5), y es la misma
        forma exacta del fallo de `_cuerpo_cabe`: contestar no es parar.

        La red es para el DUEÑO, no contra el intruso: a ese ya lo paró el permiso. Aquí se evita el
        error caro y silencioso — un mundo que abre y le falta la pieza no da un error, da un hueco,
        y para cuando alguien lo nota el asset lleva semanas fuera y la papelera ya lo podó.
        Por eso se dice EN QUÉ MAPAS está y no solo «no puedes».
        """
        usos = mundos_que_usan(clave)
        if not usos:
            return False
        mapas = ', '.join(f'«{u["mapa"]}» ({u["veces"]}× en {u["donde"]})' for u in usos[:6])
        self._send(409, {
            'error': f'{que} está EN USO en {len(usos)} mapa(s) — {mapas}'
                     + ('…' if len(usos) > 6 else '')
                     + '. Quítalo de ahí primero, o esos mapas abrirán con un hueco y sin avisar.',
            'enUso': True, 'clave': clave, 'usadoPor': usos})
        return True
    def _agente_id(self):
        m = re.match(r'^/api/agentes/([A-Za-z0-9_-]+)$', self.path)
        return m.group(1) if m else None
    def _agente_path(self, idd):
        return os.path.join(AGENTS, idd + '.json')
    def _asset_id(self):
        # La `/` va DENTRO de la clase: un asset en subcarpeta (`trees_mock/pino`) lleva la carpeta en
        # el id, porque su identidad es el FICHERO. Sin ella, `pino` señalaba a dos sitios distintos y
        # guardar en uno borraba el otro. Quien valida que eso no se escape de `assets/` es
        # `_asset_path`, no este `re`: aquí sólo se recorta la URL.
        m = re.match(r'^/api/assets/([A-Za-z0-9_.\-/]+)$', self.path)
        if not m:
            return None
        aid = m.group(1)
        if aid.endswith('.vox.json'):
            aid = aid[:-9]
        return aid
    def _asset_path(self, idd):
        """Ruta en disco de un asset, o `None` si el id pretende salirse de `assets/`.

        ⛔ Devolver `None` no es una formalidad: desde que el id admite `/`, un id como `../../etc/passwd`
        sería un fichero cualquiera del disco, y por aquí pasan un POST que escribe y un DELETE que
        borra. Se comprueba con `realpath` sobre el resultado, que es lo único que aguanta `..` a
        mitad de camino, enlaces simbólicos y rutas absolutas; mirar el id «a ojo» no aguanta ninguna
        de las tres. Todos los llamantes tienen que tratar el `None`.

        ⚠️ Ningún tramo del id puede empezar por punto, y esto va ADEMÁS del `realpath`, no en su lugar.
        El `realpath` sólo mira dónde acaba la ruta, y el POST *limpia* el id borrando lo que no le vale:
        `..%2f..%2fPLAN` perdía los `%` y se quedaba en `..2f..2fPLAN`, que ya no se sale de `assets/` —
        el `realpath` lo daba por bueno y escribía ese adefesio en la galería, y en el índice (lo cazó el
        guardián `test_assets_subcarpeta.js` a la primera). Escapar no escapaba; ensuciar, sí."""
        for tramo in str(idd).split('/'):
            if not tramo or tramo.startswith('.'):
                return None
        raiz = os.path.realpath(os.path.join(BASE, 'assets'))
        p = os.path.realpath(os.path.join(raiz, f'{idd}.vox.json'))
        if p != raiz and not p.startswith(raiz + os.sep):
            return None
        return p

    def do_GET(self):
        # SPA: /map/<nombre> (elige el mundo por URL) sirve el mismo index.html; el cliente lee el nombre
        # de la ruta y carga /api/mundo?map=<nombre>. Los assets del index van con ruta absoluta (/app.js…).
        path_only = urllib.parse.urlparse(self.path).path
        # El favicon es el PNG de 32 horneado en /images. Se sirve por esta ruta en vez de cambiar
        # el <link> de los cuatro HTML porque el navegador lo pide SOLO igualmente, y así el sitio
        # entero cambia de icono publicando, sin tocar una línea de HTML. Sin publicar, 404 — que
        # es exactamente lo que devolvía antes, porque /favicon.ico nunca ha existido en disco.
        if path_only == '/favicon.ico':
            self.path = '/data/ui/favicon-32.png'
            return super().do_GET()
        # El corte de `data/` va ANTES que ninguna ruta de fichero, porque quien pide `/data/tickets/`
        # no pasa por ninguna de las ramas de abajo: cae directo en el `super().do_GET()` del final.
        tramos = [t for t in path_only.lstrip('/').split('/') if t]
        if tramos and tramos[0] in self.RAIZ_URL and not self._raiz_permitida(tramos):
            return self.send_error(404, 'No encontrado')
        if self._panel(path_only):
            return
        if path_only in ('/assets/index.json', '/api/assets'):
            return self._send(200, list_assets_auto())
        # F5.1 · LA PORTADA. Hasta hoy `/` servía `index.html`, que es el EDITOR DE OBJETOS: a un
        # visitante no le dice nada y además le enseña herramientas que no puede usar. En público, a
        # quien no sea el dueño se le sirve el menú del juego, que es lo que sabe presentarse solo.
        # En desarrollo NO cambia nada: el dueño sigue cayendo en su editor, como siempre.
        # (El dueño que quiera ver la portada la tiene en `/menu.html`, y el visitante que quiera el
        # editor se lo encuentra prohibido de verdad por permisos, no por esta línea.)
        if path_only == '/' and es_publico() and not self._es_dueno():
            self.path = '/menu.html'
            return super().do_GET()
        # F9 · El panel. La página es pública como fichero; lo que está cerrado es `/api/panel/*`,
        # y sin esos datos aquí no se pinta nada más que el motivo del 401. Servirla sin comprobar
        # nada es a propósito: así el dueño ve «entra con el token» en vez de un 403 desnudo.
        if path_only in ('/panel', '/panel/'):
            self.path = '/panel.html'
            return super().do_GET()
        # /map y /map/ (sin nombre) = listado de mundos; /map/<nombre> = la SPA con ese mundo.
        if path_only in ('/map', '/map/'):
            self.path = '/mapas.html'
            return super().do_GET()
        if path_only.startswith('/map/'):
            self.path = '/index.html'
            return super().do_GET()
        if path_only in ('/fotos', '/fotos/'):                    # galería de las fotos que saca la tecla F
            self.path = '/fotos.html'
            return super().do_GET()
        if path_only == '/api/fotos':
            return self._send(200, list_fotos())
        if path_only in ('/videos', '/videos/'):                  # galería de los vídeos que saca Alt+V
            self.path = '/videos.html'
            return super().do_GET()
        if path_only == '/api/videos':
            return self._send(200, list_videos())
        if path_only == '/api/ui':                                # asignación de iconos de /images
            return self._send(200, ui_leer())
        if path_only == '/api/yo':
            # La pieza clave de todo el reparto: la consultan el menú, el selector de mundos y el
            # snippet de disimulo para saber QUÉ ENSEÑAR. ⚠️ Enseñar no es permitir — lo que se
            # esconda aquí sigue devolviendo 403 si se pide a pelo (`exige`).
            u = self.quien()
            if u:
                # El GASTO, no solo el tope: sin esto el menú no puede pintar «3 de 5» y la cuota es
                # un número que no significa nada hasta que te la comes de golpe.
                mios = mundos_meta.de(u.get('uid'))
                return self._send(200, {'anonimo': False, 'yo': sesion.publico(u),
                                        'mapas': mios,
                                        'gastado': {'mapas': len(mios),
                                                    'bytes': sum(pesa_mundo(s) for s in mios)}})
            # Sin cuenta, pero con el token del dueño (o en desarrollo, donde no hay token): se dice
            # que puede todo, porque es verdad, y así el editor no se esconde a sí mismo.
            if self._es_dueno():
                # `via` dice por CUÁL de las tres puertas: la chapa de identidad la pinta, y sin ella
                # la máquina de desarrollo enseñaría «dueño» a cualquiera (ver `_via_dueno`).
                return self._send(200, {'anonimo': True, 'dueno': True, 'via': self._via_dueno(),
                                        'yo': {'uid': None, 'nombre': 'dueño', 'perfil': 'dueno',
                                               'permisos': sorted(sesion.PERMISOS), 'cuota': None}})
            return self._send(200, {'anonimo': True, 'yo': None,
                                    'permisos': [], 'publico': es_publico()})
        # F3.6 · la miniatura, cada una por su URL y con ETag. Antes viajaba como `data:image/png` DENTRO
        # del listado: una respuesta enorme, imposible de cachear y que se baja entera aunque solo se vean
        # tres tarjetas. Va ANTES de `/api/mundos` a secas porque el prefijo más largo manda.
        mt = re.match(r'^/api/mundos/([a-z0-9-]+)/thumb\.png$', path_only)
        if mt:
            slug = world_slug(mt.group(1))
            # Mismo criterio que el listado: si el mundo no sale para ti, su foto tampoco. Sin esto, la
            # miniatura sería la rendija por la que asomarse a los mapas privados de otro.
            if not self._es_dueno() and not mundos_meta.sale_en_listados(mundos_meta.lee(slug), self.quien()):
                return self._send(404, {'error': 'no hay tal mundo'})
            png, etag = mundos.miniatura(slug)
            if not png:
                return self._send(404, {'error': 'no hay miniatura'})
            etag = '"' + etag + '"'
            if self.headers.get('If-None-Match') == etag:
                self.send_response(304); self.send_header('ETag', etag); self.end_headers()
                return
            # La URL lleva el sello colgando (`?v=…`), así que ESTE contenido no cambia nunca: se puede
            # guardar sin preguntar. Cuando el mundo cambia, cambia la URL y el navegador pide otra.
            self._cache_propia = True
            return self._send_bytes(200, 'image/png', png, None,
                                    extra=[('ETag', etag), ('Cache-Control', 'public, max-age=604800')])
        # F6.5 · el MANDO: la credencial con la que el dueño de un mapa echa o calla en el 8510.
        # ⛔ Es un endpoint aparte y no un campo de `/api/yo` a propósito: el mando va por mapa, y
        # `/api/yo` no sabe en cuál estás. Y ⛔ no se puede reutilizar el vale de invitación para
        # esto — el vale se COMPARTE por enlace, así que autorizar con él sería darle a cada invitado
        # el poder de echar a quien le invitó (ver `vales.emite_mando`).
        mm = re.match(r'^/api/mundos/([a-z0-9-]+)/mando$', path_only)
        if mm:
            slug = world_slug(mm.group(1))
            u = self.quien()
            # ⚠️ La existencia se mira en el DISCO, no en `mundos_meta.lee`, que NUNCA devuelve vacío:
            # para un slug que no existe devuelve una copia de `HEREDADO`, así que un `if not meta`
            # aquí es código muerto que no se ve serlo (lo era, y el guardián lo cazó).
            if not os.path.exists(os.path.join(WORLDS, slug + '.json')) and slug != 'default':
                return self._send(404, {'error': f'no existe el mundo «{slug}»'})
            meta = mundos_meta.lee(slug)
            if not self._es_dueno() and not mundos_meta.es_suyo(meta, u):
                # 403 y no 404: quien pregunta ya ha entrado al mapa, así que sabe que existe.
                return self._send(403, {'error': 'el mando es del dueño del mapa'})
            return self._send(200, {'mando': vales.emite_mando(slug, (u or {}).get('uid') or ''),
                                    'horas': vales.HORAS_MANDO})
        # REQ-PLANT1 · «¿este mapa está a medias, y de qué plantilla?». Lo pregunta el corredor de
        # generación al entrar (snippet `generador-mundo`), y por eso NO exige escritura: si el mapa
        # ya está hecho —que es el caso de todos menos el recién creado— la respuesta es `generado:
        # true` y ahí acaba. Lo que sí exige es poder VER el mapa, o revelaría qué plantilla usó
        # alguien en un mapa privado.
        mp = re.match(r'^/api/mundos/([a-z0-9-]+)/plantilla$', path_only)
        if mp:
            slug = world_slug(mp.group(1))
            meta = mundos_meta.lee(slug)
            # ⚠️ La query se parsea AQUÍ. `q` se creaba 40 líneas más abajo, dentro de la rama de
            # `/api/mundos`, y aquí llegaba sin asignar: `UnboundLocalError`, o sea 500 y la conexión
            # cerrada sin respuesta. Como el `and` es perezoso y `_es_dueno()` va primero, al dueño
            # no le pasaba nunca — el fallo sólo lo veía un JUGADOR, que es justo quien crea mapas
            # con plantilla. Resultado: mapas vacíos y ni un error en pantalla (el corredor da el
            # `fetch` por perdido y se callaba). Guardián: `tests/test_permisos_api.js` §9b. Y el
            # silencio del corredor está arreglado aparte, en el propio snippet `generador-mundo`
            # (REQ-PLANT1b, `herramientas/parche_snp_generador_aviso.py`).
            qp = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if not self._es_dueno() and not mundos_meta.puede_ver(meta, self.quien(),
                                                                  qp.get('codigo', [''])[0]):
                return self._send(403, {'error': 'este mapa no es tuyo'})
            # La ficha viaja con la respuesta para que el corredor pinte las frases de la pantalla de
            # carga sin una segunda petición: cuando llega esto, la generación tiene que empezar YA.
            ficha = None
            if meta.get('plantilla'):
                try:
                    with open(self._snip_path(meta['plantilla']), encoding='utf-8') as f:
                        ficha = plantillas.normaliza_ficha(json.load(f))
                except Exception:
                    ficha = None
            elif meta.get('especial'):
                ficha = next((dict(e['ficha']) for e in plantillas.ESPECIALES
                              if e['especial'] == meta['especial']), None)
            return self._send(200, {'slug': slug, 'generado': bool(meta.get('generado')),
                                    'plantilla': meta.get('plantilla') or '',
                                    'especial': meta.get('especial') or '', 'ficha': ficha})
        if path_only == '/api/mundos':                            # listado de /map/ (cache por mtime en data/_thumbs/)
            try:
                filas = mundos.listar()
                if not self._es_dueno():
                    # Ver y ENCONTRAR no son lo mismo: un mapa `enlace` se abre con su URL pero no
                    # sale aquí. Y los 33 heredados no salen para nadie salvo el dueño, que es lo
                    # que se pidió — el panel (F9) los irá abriendo uno a uno.
                    u = self.quien()
                    filas = [f for f in filas
                             if mundos_meta.sale_en_listados(mundos_meta.lee(f.get('nombre')), u)]
                # `mundos.listar()` sólo mira el fichero del mundo, así que no sabe de quién es. Sin
                # estos tres campos el cliente no puede distinguir «mis mundos» de «los demás», y un
                # botón como Invitar —que sólo vale en los tuyos— no se puede ni pintar.
                for f in filas:
                    m = mundos_meta.lee(f.get('nombre'))
                    f['dueno'] = m.get('dueno')
                    f['visibilidad'] = m.get('visibilidad')
                    f['escritura'] = m.get('escritura')
                # F3.6 · paginado, y OPCIONAL a propósito. Sin `?desde`/`?cuantos` esto devuelve la
                # lista entera como siempre, que es lo que espera `web/mapas.html` para buscar y
                # ordenar en el navegador sin ir al servidor por cada tecla. Quien pida página recibe
                # un sobre `{total, desde, cuantos, mundos}`: la cuenta total no se puede deducir de
                # una página, y sin ella no hay «página siguiente» ni «300 mundos».
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                if 'desde' in q or 'cuantos' in q:
                    total = len(filas)
                    desde = max(0, _entero(q.get('desde', ['0'])[0], 0))
                    cuantos = min(MUNDOS_POR_PAGINA_TOPE,
                                  max(1, _entero(q.get('cuantos', [str(MUNDOS_POR_PAGINA)])[0],
                                                 MUNDOS_POR_PAGINA)))
                    trozo = filas[desde:desde + cuantos]
                    return self._send(200, {'total': total, 'desde': desde,
                                            'cuantos': len(trozo), 'mundos': trozo})
                return self._send(200, filas)
            except Exception as e:
                return self._send(500, {'error': f'no se pudo listar los mundos: {e}'})
        if self.path == '/api/mapa':
            if os.path.exists(MAPFILE):
                try:
                    return self._send(200, json.load(open(MAPFILE, encoding='utf-8')))
                except Exception:
                    pass
            return self._send(200, DEFAULT_MAP)
        if path_only == '/api/mundo/vox':                         # rejilla densa del mundo (voxelworld-2)
            if not self._mundo_ok():
                return
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            trio = voxfmt.cuerpo_vox(wf)
            if not trio:
                return self._send(404, {'error': 'sin rejilla'})   # el cliente cae al camino v1
            crudo, gz, etag = trio
            # 21 MB que no cambian mientras no toques el mundo: reabrirlo tiene que salir gratis.
            if self.headers.get('If-None-Match') == etag:
                self.send_response(304); self.send_header('ETag', etag); self.end_headers()
                return
            return self._send_bytes(200, 'application/octet-stream', crudo,
                                    gz if self._acepta_gzip() else None, extra=[('ETag', etag)])
        if path_only == '/api/mundo':                             # mundo sandbox 3D (REQ-MC); ?map=<nombre> elige el mundo
            if not self._mundo_ok():
                return
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            if os.path.exists(wf):
                # Un mundo que sigue en v1 se convierte la PRIMERA vez que se abre (una sola vez por
                # mundo; fps tarda lo que tardaba antes y nunca más). El v1 se va a la papelera.
                if not voxfmt.completo(wf):
                    voxfmt.convertir(wf, atomic_dump, to_trash)
                # Se sirven los BYTES DEL DISCO, sin parsear ni re-serializar en cada apertura.
                # json_file_body ya valida (y devuelve None si el fichero está corrupto), así que un
                # mundo roto sigue cayendo al terreno de recién nacido como toda la vida.
                par = json_file_body(wf)
                if par:
                    return self._send_bytes(200, 'application/json; charset=utf-8', par[0], par[1])
            return self._send(200, {**DEFAULT_WORLD, 'fresh': True})   # sin fichero = mundo recién nacido → terreno plano (un vacío guardado NO lleva fresh)
        if path_only == '/api/plantillas':                       # REQ-PLANT1 · el carrusel de mundo nuevo
            # El catálogo NO es una lista aparte que mantener: es lo que hay en `data/snippets/` con
            # una `ficha` puesta. Añadir un bioma = publicar su generador con su ficha, y aparece.
            # Se sirve a cualquiera (es un escaparate, no toca nada), y con él van los tamaños y los
            # ambientes elegibles para que el asistente no los tenga escritos por su cuenta: si el
            # tope de tamaño lo sube el panel por perfil, el selector se entera solo.
            u = self.quien()
            tope = plantillas.LADO_TOPE_POR_DEFECTO
            if u:
                tope = ((u.get('cuota') or {}).get('mapa_lado')
                        or (sesion.CUOTA_POR_DEFECTO.get('mapa_lado') or plantillas.LADO_TOPE_POR_DEFECTO))
            elif self._es_dueno():
                tope = max(plantillas.LADOS)                     # el dueño paga el disco: sin tope
            fichas = []
            # ⚠️ La foto se resuelve contra el DISCO, no se copia de la ficha (REQ-PLANT2): una ruta
            # que ya no existe sale como '' y la tarjeta se pinta con su marcador, y una foto subida
            # al panel con el nombre de la ficha vale aunque nadie haya tocado los metadatos.
            for s in list_snips():
                f = plantillas.normaliza_ficha({'ficha': s.get('ficha'), 'name': s.get('name'), 'id': s.get('id')})
                # …y la baja es `oculta` en la ficha (REQ-PLANT3): el generador sigue publicado y
                # funcionando, pero deja de tener tarjeta. Se filtra AQUÍ y no en el panel, que es
                # justo donde se sigue viendo para poder devolverla al carrusel.
                if f and not f.get('oculta'):
                    f['foto'] = plantillas.foto_de(BASE, s['id'], f['foto'])
                    fichas.append({'id': s['id'], 'snippet': s['id'], 'especial': '',
                                   'orden': f.pop('orden', 500), 'ficha': f})
            for e in plantillas.ESPECIALES:
                f = plantillas.normaliza_ficha(e)
                f['foto'] = plantillas.foto_de(BASE, e['id'], f['foto'])
                fichas.append({'id': e['id'], 'snippet': '', 'especial': e['especial'],
                               'orden': e['orden'], 'ficha': f})
            fichas.sort(key=lambda x: (x['orden'], x['ficha']['titulo']))
            return self._send(200, {
                'plantillas': fichas,
                'lados': [{'lado': l, 'bytes': plantillas.bytes_de(l), 'cabe': l <= tope}
                          for l in plantillas.LADOS],
                'ladoPorDefecto': min(plantillas.LADO_POR_DEFECTO, tope), 'ladoTope': tope,
                'ambientes': [{'id': k, 'rotulo': v[0]} for k, v in plantillas.AMBIENTES.items()],
                'efectos': [{'id': k, 'rotulo': v[0]} for k, v in plantillas.EFECTOS.items()],
            })
        if path_only == '/api/snippets':                         # gestor de snippets: lista
            # ?q=<texto> busca dentro del código; ?usa=<id> dice quién llama a ese snippet (REQ-SNP6).
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            q, usa = qs.get('q', [''])[0], qs.get('usa', [''])[0]
            if q or usa:
                return self._send(200, buscar_snips(q, usa))
            return self._send(200, list_snips())
        sid = self._snip_id()
        if sid:
            fp = self._snip_path(sid)
            if os.path.exists(fp):
                return self._send(200, json.load(open(fp, encoding='utf-8')))
            return self._send(404, {'error': 'no existe'})
        if self.path == '/api/agentes':                          # agentes articulados: lista
            return self._send(200, list_agentes())
        gid = self._agente_id()
        if gid:
            fp = self._agente_path(gid)
            if os.path.exists(fp):
                return self._send(200, json.load(open(fp, encoding='utf-8')))
            return self._send(404, {'error': 'no existe agente'})
        if path_only == '/api/assets':
            return self._send(200, list_assets_auto())
        aid = self._asset_id()
        if aid:
            fp = self._asset_path(aid)
            if fp and os.path.exists(fp):
                try:
                    return self._send(200, json.load(open(fp, encoding='utf-8')))
                except Exception:
                    pass
            return self._send(404, {'error': 'no existe asset'})
        if self.path == '/api/habitantes':
            # REQ-ASSET1 · cada uno ve LO SUYO y LO DEL MUNDO; lo de los demás, no. El dueño del
            # servidor lo ve todo — y en desarrollo sin token todo el mundo es el dueño, así que la
            # galería de siempre y los tests no se enteran de que esto existe.
            if self._es_dueno():
                return self._send(200, list_all())
            u = self.quien()
            return self._send(200, list_all(lambda d: autoria.puede_ver(d, u)))
        idd = self._id()
        if idd:
            fp = self._path(idd)
            if os.path.exists(fp):
                doc = json.load(open(fp, encoding='utf-8'))
                # La misma regla que el listado, y hace falta LAS DOS VECES: sin esto, esconderlo de
                # la lista sería cosmética — bastaría con acertar el id para bajarse el dibujo entero.
                if not self._es_dueno() and not autoria.puede_ver(doc, self.quien()):
                    return self._send(403, {'error': f'«{idd}» no es tuyo'})
                return self._send(200, doc)
            return self._send(404, {'error': 'no existe'})
        # Estáticos .json — sobre todo los assets/*.vox.json de la paleta, que son 1,4 MB por apertura
        # del Mundo y comprimen ×4. translate_path confina la ruta al directorio servido.
        # (Se pierde el Last-Modified/304 que daba SimpleHTTPRequestHandler, pero hoy el cliente los
        # pide con cache:'no-store', así que no había revalidación que perder. Al tocar la política de
        # caché habrá que devolverlo.)
        fp = self.translate_path(self.path)
        if fp.endswith('.json') and os.path.isfile(fp):
            par = json_file_body(fp)
            if par:
                return self._send_bytes(200, 'application/json; charset=utf-8', par[0], par[1])
        return super().do_GET()

    # ── Entrar y salir ──────────────────────────────────────────────────────────────────────────
    def _cookie_sesion(self, u):
        """`HttpOnly` para que un snippet no pueda LEERLA; `SameSite=Lax` para que no viaje sola.

        ⚠️ `HttpOnly` no es la defensa que parece: un snippet corre en nuestro mismo origen y puede
        hacer `fetch('/api/...')` sin leer la cookie, que el navegador adjunta él solo. Ese agujero
        NO se cierra aquí — se estudia en `docs/codigo-de-usuario.md` (F-E), y mientras tanto lo tapa
        que `snippet.crear_propio` no lo tenga nadie.

        Sin `Secure`: en LAN se sirve por HTTP y con `Secure` la cookie no se guardaría, o sea que
        nadie podría entrar. Se pone el día que haya TLS (F7.6), y hasta entonces se dice sin adornos:
        en red local la cookie viaja en claro.
        """
        return [('Set-Cookie',
                 f'{sesion.COOKIE}={sesion.emite(u["uid"], u.get("gen", 1))}; '
                 f'Path=/; Max-Age={sesion.DIAS * 86400}; HttpOnly; SameSite=Lax')]

    def _sesion_endpoints(self, ruta):
        """Las cuatro puertas de la identidad. True = atendida aquí y `do_POST` no sigue."""
        if ruta == '/api/registro':
            d = self._read() or {}
            # El registro es ABIERTO pero en cuarentena: nace pudiendo jugar y nada más, y es el
            # dueño quien sube de nivel desde el panel. Abrirlo con permisos de escritura sería
            # dejar el disco del servidor a quien pase por la URL.
            u, motivo = sesion.crea(d.get('nombre'), d.get('clave'))
            if not u:
                self._send(400, {'error': motivo})
                return True
            self._send(200, {'ok': True, 'yo': sesion.publico(u)}, self._cookie_sesion(u))
            return True
        if ruta == '/api/entrar':
            d = self._read() or {}
            u = sesion.comprueba(sesion.uid_de(d.get('nombre')), d.get('clave'))
            if not u:
                # El mismo mensaje para «no existe» y «la contraseña no es»: distinguirlos regala
                # una lista de qué cuentas hay.
                self._send(401, {'error': 'nombre o contraseña incorrectos'})
                return True
            self._send(200, {'ok': True, 'yo': sesion.publico(u)}, self._cookie_sesion(u))
            return True
        if ruta == '/api/salir':
            self._read()
            self._send(200, {'ok': True},
                       [('Set-Cookie', f'{sesion.COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'),
                        ('Set-Cookie', f'{self.COOKIE_DISENA}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')])
            return True
        # F5.8 · Entrar en MODO DISEÑO con el token, desde el navegador.
        #
        # ⚠️ Esta ruta está en `RUTAS_ABIERTAS` por lo mismo que `/api/entrar`: una puerta que exige
        # haber cruzado la puerta no la cruza nadie. Lo que la protege es el freno por IP (que es
        # justo donde alguien probaría tokens a lo bruto) y que el token no se puede adivinar.
        if ruta == '/api/disena':
            d = self._read() or {}
            serv = get_server_token()
            if not serv:
                # Sin token configurado no hay nada que abrir: en desarrollo el editor ya está
                # abierto, y decirlo claro evita el rato de «he metido el token y no hace nada».
                self._send(409, {'error': 'este servidor no tiene VOXELFORGE_TOKEN configurado: '
                                          'el modo diseño está abierto o cerrado por permisos, no por token'})
                return True
            if str(d.get('token') or '').strip() != serv:
                self._send(401, {'error': 'ese token no es'})
                return True
            self._send(200, {'ok': True, 'dias': self.DIAS_DISENA},
                       [('Set-Cookie', f'{self.COOKIE_DISENA}={self._vale_disena()}; Path=/; '
                                       f'Max-Age={self.DIAS_DISENA * 86400}; HttpOnly; SameSite=Lax')])
            return True
        return False

    # ── F9 · El panel del dueño ─────────────────────────────────────────────────────────────────
    # Todo por web, que es la petición: «los permisos de usuarios y mapas y todo lo que sea
    # administración, vía web, no consola».

    def _panel_puede(self, permiso='panel.usar'):
        """False (y ya respondido) si esta petición no puede usar el panel.

        ⛔ Esto NO sobra por tener la fila en `PERMISO_POR_RUTA`: aquella tabla solo se consulta en
        POST/PATCH/DELETE y **en modo público**. El panel LEE por GET y en desarrollo la tabla ni se
        mira, así que sin esta función `GET /api/panel/cuentas` sería una lista de cuentas abierta
        a quien pase por la URL. Es exactamente el agujero que se acaba de cerrar con el token.
        """
        if self._es_dueno():
            return True
        u = self.quien()
        if u and sesion.puede(u, permiso):
            return True
        self._send(401 if not u else 403,
                   {'error': f'el panel pide «{permiso}»', 'permiso': permiso,
                    'necesitaEntrar': not u})
        return False

    def _panel(self, ruta):
        """Las rutas del panel, GET y POST. True si esta petición era suya."""
        if not ruta.startswith('/api/panel'):
            return False
        from servidor import panel as panel_mod

        if self.command == 'GET':
            if not self._panel_puede():
                return True
            if ruta == '/api/panel/cuentas':
                return bool(self._send(200, {'cuentas': panel_mod.cuentas()}) or True)
            if ruta == '/api/panel/perfiles':
                return bool(self._send(200, panel_mod.perfiles()) or True)
            if ruta == '/api/panel/mundos':
                return bool(self._send(200, {'mundos': panel_mod.mundos(WORLDS)}) or True)
            if ruta == '/api/panel/salud':
                return bool(self._send(200, panel_mod.salud(BASE, WORLDS)) or True)
            if ruta == '/api/panel/plantillas':                  # REQ-PLANT2 · las fichas del carrusel
                return bool(self._send(200, panel_mod.plantillas(BASE, list_snips())) or True)
            self._send(404, {'error': 'no hay nada en ' + ruta})
            return True

        if self.command in ('POST', 'DELETE'):
            # `panel.perfiles` es el permiso que REPARTE permisos: quien lo tenga puede ascenderse.
            # Por eso cuentas y perfiles lo piden aparte, y los mapas no.
            duro = ruta in ('/api/panel/cuenta', '/api/panel/perfil')
            if not self._panel_puede('panel.perfiles' if duro else 'panel.usar'):
                return True
            quien = self.quien()
            if self.command == 'DELETE' and ruta.startswith('/api/panel/perfil/'):
                motivo = panel_mod.borra_perfil(ruta.rsplit('/', 1)[-1])
                self._send(409 if motivo else 200, {'error': motivo} if motivo else {'ok': True})
                return True
            # REQ-PLANT2 · quitar la foto de una ficha. Va a la papelera y NO toca la ficha: lo que
            # se está probando aquí es justo que una foto que ya no está no rompe nada.
            if self.command == 'DELETE' and ruta.startswith('/api/panel/plantilla/foto/'):
                quitadas = panel_mod.borra_foto_plantilla(BASE, ruta.rsplit('/', 1)[-1], to_trash)
                self._send(200, {'ok': True, 'quitadas': quitadas})
                return True
            d = self._read()
            if not isinstance(d, dict):
                self._send(400, {'error': 'faltan datos'})
                return True
            if ruta == '/api/panel/cuenta':
                r, motivo = panel_mod.guarda_cuenta(quien, d)
            elif ruta == '/api/panel/perfil':
                r, motivo = panel_mod.guarda_perfil(quien, d)
            elif ruta == '/api/panel/mundo':
                r, motivo = panel_mod.guarda_mundo(d)
            elif ruta == '/api/panel/plantilla':                 # REQ-PLANT2 · metadatos de la ficha
                r, motivo = panel_mod.guarda_plantilla(BASE, SNIPS, d, atomic_dump, to_trash)
            elif ruta == '/api/panel/plantilla/foto':            # REQ-PLANT2 · la imagen, en base64
                r, motivo = panel_mod.guarda_foto_plantilla(BASE, d.get('id'), d.get('dato'))
            else:
                self._send(404, {'error': 'no hay nada en ' + ruta})
                return True
            self._send(400 if motivo else 200, {'error': motivo} if motivo else {'ok': True, 'r': r})
            return True
        return False

    def do_POST(self):
        if not self._guardias():
            return
        if self._panel(urllib.parse.urlparse(self.path).path):
            return
        if self._sesion_endpoints(urllib.parse.urlparse(self.path).path):
            return
        if self.path == '/api/mapa':
            d = self._read()
            if not isinstance(d, dict) or 'cells' not in d:      # validación mínima
                return self._send(400, {'error': 'mapa inválido'})
            d.setdefault('cols', 8); d.setdefault('rows', 8)
            to_trash(MAPFILE, move=False)                         # respaldo del mapa anterior (sagrado)
            atomic_dump(d, MAPFILE)
            return self._send(200, {'ok': True})
        ruta_post = urllib.parse.urlparse(self.path).path
        if ruta_post == '/api/fotos':                             # tecla F en el Mundo: guarda la captura + su ficha
            # El tope se mira ANTES de leer: si no, un cuerpo enorme ya se habría tragado la memoria
            # cuando fuéramos a rechazarlo. `_send` drena lo que quede en el socket (keep-alive).
            if int(self.headers.get('Content-Length', 0) or 0) > FOTO_MAX_BYTES:
                return self._send(413, {'error': 'la foto pesa demasiado'})
            d = self._read()
            png = d.get('png') if isinstance(d, dict) else None
            if not isinstance(png, str) or not png:
                return self._send(400, {'error': 'falta png (base64)'})
            png = png.split(',', 1)[1] if png.startswith('data:') else png
            try:
                crudo = base64.b64decode(png, validate=True)
            except (binascii.Error, ValueError):
                return self._send(400, {'error': 'png no es base64 válido'})
            if not crudo.startswith(b'\x89PNG\r\n\x1a\n'):         # que lo que se guarda con .png sea un PNG
                return self._send(400, {'error': 'eso no es un PNG'})
            ficha = d.get('ficha') if isinstance(d.get('ficha'), dict) else {}
            ficha['guardadaEn'] = now_iso()
            idd, fp = foto_nueva(ficha.get('mapa'))
            with open(fp, 'wb') as f:                              # foto_nueva ya lo creó vacío con O_EXCL: aquí solo se rellena
                f.write(crudo)
            ficha['id'] = idd
            # La reducida la manda ya hecha el navegador (mcFotoMini): aquí solo se valida igual que
            # la grande. Si no viene o no cuela, la foto se guarda igual — la copia es un extra.
            mini = d.get('mini') if isinstance(d, dict) else None
            if isinstance(mini, str) and mini:
                try:
                    chico = base64.b64decode(mini.split(',', 1)[-1], validate=True)
                except (binascii.Error, ValueError):
                    chico = b''
                if chico.startswith(b'\x89PNG\r\n\x1a\n'):
                    os.makedirs(FOTOS_MINI, exist_ok=True)
                    with open(os.path.join(FOTOS_MINI, idd + '.png'), 'wb') as f:
                        f.write(chico)
            # REQ-INF1 · los INFORMES van a ficheros hermanos, no dentro de la ficha: un barrido de luz ocupa
            # más que todo lo demás junto y la ficha tiene que seguir siendo legible de un vistazo. La ficha se
            # queda con el índice que mandó el navegador y aquí solo se le añade DÓNDE está cada cuerpo.
            informes = d.get('informes') if isinstance(d.get('informes'), dict) else {}
            if informes:
                idx = ficha.get('informes') if isinstance(ficha.get('informes'), dict) else {}
                dst = os.path.join(FOTOS_INF, idd)
                os.makedirs(dst, exist_ok=True)
                for nom, cuerpo in informes.items():
                    if not RE_INFORME.match(str(nom)):
                        continue
                    atomic_dump(cuerpo, os.path.join(dst, nom + '.json'))
                    e = idx.get(nom)
                    if not isinstance(e, dict):
                        e = idx[nom] = {}
                    e['fichero'] = 'data/fotos/informes/%s/%s.json' % (idd, nom)
                ficha['informes'] = idx
            atomic_dump(ficha, os.path.join(FOTOS, idd + '.json'))
            return self._send(200, {'ok': True, 'id': idd, 'url': '/data/fotos/' + idd + '.png',
                                    'bytes': len(crudo), 'informes': sorted(informes.keys())})
        if ruta_post == '/api/videos':                            # Alt+V en el Mundo: guarda el clip de vídeo + su ficha
            if int(self.headers.get('Content-Length', 0) or 0) > VIDEO_MAX_BYTES:
                return self._send(413, {'error': 'el vídeo pesa demasiado'})
            d = self._read()
            vid = d.get('video') if isinstance(d, dict) else None
            if not isinstance(vid, str) or not vid:
                return self._send(400, {'error': 'falta video (base64)'})
            vid = vid.split(',', 1)[1] if vid.startswith('data:') else vid
            try:
                crudo = base64.b64decode(vid, validate=True)
            except (binascii.Error, ValueError):
                return self._send(400, {'error': 'video no es base64 válido'})
            ext = str(d.get('ext') or 'mp4').lower()
            if ext not in ('mp4', 'webm', 'mov', 'm4v'):
                ext = 'mp4'
            ficha = d.get('ficha') if isinstance(d.get('ficha'), dict) else {}
            ficha['guardadaEn'] = now_iso()
            ficha['bytes'] = len(crudo)
            ficha['ext'] = ext
            idd, fp = video_nueva(ficha.get('mapa'), ext)
            with open(fp, 'wb') as f:
                f.write(crudo)
            ficha['id'] = idd
            atomic_dump(ficha, os.path.join(VIDEOS, idd + '.json'))
            return self._send(200, {'ok': True, 'id': idd, 'url': '/data/videos/' + idd + '.' + ext,
                                    'bytes': len(crudo)})
        if ruta_post == '/api/ui':                                # «Publicar» en /images: asignación + PNG horneados
            if int(self.headers.get('Content-Length', 0) or 0) > UI_MAX_BYTES:
                return self._send(413, {'error': 'el lote de iconos pesa demasiado'})
            d = self._read()
            if not isinstance(d, dict) or not isinstance(d.get('ranuras'), dict):
                return self._send(400, {'error': 'falta ranuras'})
            pngs = d.get('png') if isinstance(d.get('png'), dict) else {}
            # Se valida el lote ENTERO antes de escribir un solo byte: publicar es una operación sola,
            # y una tanda a medias deja el favicon nuevo con los botones viejos y nadie sabe por qué.
            crudos = {}
            for nombre, dato in pngs.items():
                if not RE_UI_PNG.match(nombre):
                    return self._send(400, {'error': 'nombre de icono inválido: ' + str(nombre)[:40]})
                crudo = png_crudo(dato)
                if crudo is None:
                    return self._send(400, {'error': 'no es un PNG: ' + nombre})
                crudos[nombre] = crudo
            to_trash(UIFILE, move=False)                          # respaldo de la asignación anterior
            atomic_dump(d['ranuras'], UIFILE)
            for nombre, crudo in crudos.items():
                fp = os.path.join(UI, nombre + '.png')
                tmp = fp + '.tmp'
                with open(tmp, 'wb') as f:
                    f.write(crudo); f.flush(); os.fsync(f.fileno())
                os.replace(tmp, fp)                               # los HTML piden estos .png a la vez: nunca a medio escribir
            # Los .png de las ranuras que se han quitado se van a la papelera, no se borran: el
            # consumidor tiene que volver a su emoji/carácter de siempre, y el fichero se recupera.
            vivos = {n + '.png' for n in crudos}
            for fn in os.listdir(UI):
                if fn.endswith('.png') and fn not in vivos:
                    to_trash(os.path.join(UI, fn))
            return self._send(200, {'ok': True, 'ranuras': len(d['ranuras']), 'png': len(crudos)})
        if ruta_post == '/api/invitaciones':                       # F5.6 · invitar en un clic
            # La petición literal del dueño. Hoy invitar es `game.multi.invita(<número>)` por
            # consola y solo funciona si el otro YA está conectado; esto devuelve un enlace.
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'faltan datos'})
            slug = world_slug(d.get('slug') or d.get('mapa') or '')
            # ⚠️ `world_file_for` devuelve una RUTA aunque el mundo no exista (así es como nacen los
            # mapas al visitarlos en desarrollo), así que hay que mirar el disco: sin esto se emiten
            # vales preciosos y firmados para mapas que no existen.
            if not slug or not os.path.exists(world_file_for(slug)):
                return self._send(404, {'error': f'no existe el mundo «{slug}»'})
            u = self.quien()
            meta = mundos_meta.lee(slug)
            # ⛔ Invitar es repartir acceso, así que solo lo hace quien YA lo tiene. Sin esto,
            # cualquiera se fabrica un vale para el mapa de otro y la firma deja de significar nada.
            if not self._es_dueno() and not mundos_meta.puede_escribir(meta, u):
                return self._send(403, {'error': 'solo se invita a un mapa en el que puedas escribir'})
            vale = vales.emite(slug, (u or {}).get('uid') or '', d.get('dias') or vales.DIAS)
            # El host lo pone el navegador (cabecera `Host`): el servidor no sabe por qué nombre o
            # túnel lo están alcanzando, y adivinarlo genera enlaces que no funcionan fuera de casa.
            base = d.get('base') or f'http://{self.headers.get("Host") or "localhost:8500"}'
            info = vales.abre(vale)
            return self._send(200, {'ok': True, 'vale': vale, 'caduca': info['caduca'],
                                    'enlace': vales.enlace(base, slug, vale),
                                    'escritura': meta.get('escritura')})
        if ruta_post == '/api/mundos/crear':                      # F3.2 · crear un mapa a propósito
            # Hasta hoy un mundo NACÍA DE VISITAR UNA URL: `/map/loquesea` y ya había un mundo en
            # disco a nombre de nadie. En un multiverso eso son mil mundos basura y ninguna forma de
            # saber de quién son. Crear pasa a ser un acto explícito, con permiso, cuota y dueño.
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'faltan datos'})
            u = self.quien()
            uid = (u or {}).get('uid')
            # REQ-PLANT1 · el TAMAÑO lo elige quien crea, dentro de lo que le deje su perfil. El tope
            # vive en la cuota (`mapa_lado`) porque el dueño lo quiso ajustable desde el panel.
            cuota = (u.get('cuota') if u else None) or sesion.CUOTA_POR_DEFECTO
            tope_lado = cuota.get('mapa_lado') or plantillas.LADO_TOPE_POR_DEFECTO
            if not uid and self._es_dueno():
                tope_lado = max(plantillas.LADOS)             # el dueño paga el disco: sin tope
            lado = plantillas.lado_valido(d.get('lado') or plantillas.LADO_POR_DEFECTO, tope_lado)
            if lado is None:
                return self._send(409, {'error': f'ese tamaño no está permitido para tu perfil '
                                                 f'(máximo {tope_lado}).',
                                        'ladoTope': tope_lado, 'lados': list(plantillas.LADOS)})

            # REQ-PLANT1 · qué plantilla se pidió. Se acepta O un generador que EXISTA y tenga ficha,
            # O una de las dos especiales. Cualquier otra cosa se ignora y sale un mapa vacío: el id
            # de la plantilla acaba llamando a `game.snippet(...)` en el navegador, así que no puede
            # ser texto libre que venga del cliente.
            plantilla = especial = ''
            ficha_pedida = None
            pedida = str(d.get('plantilla') or '').strip()
            if pedida in [e['id'] for e in plantillas.ESPECIALES]:
                especial = next(e['especial'] for e in plantillas.ESPECIALES if e['id'] == pedida)
                ficha_pedida = plantillas.normaliza_ficha(
                    next(e for e in plantillas.ESPECIALES if e['id'] == pedida))
            elif pedida:
                try:
                    with open(self._snip_path(re.sub(r'[^A-Za-z0-9_-]+', '', pedida)), encoding='utf-8') as f:
                        doc_p = json.load(f)
                    ficha_pedida = plantillas.normaliza_ficha(doc_p)
                    if ficha_pedida:
                        plantilla = re.sub(r'[^A-Za-z0-9_-]+', '', pedida)
                except Exception:
                    plantilla = ''

            # ⚠️ Y AHORA EL OTRO TOPE: el de la plantilla. El de arriba es disco (lo que le dejamos
            # gastar a esta cuenta); éste es MEMORIA DEL NAVEGADOR de quien lo genera, y el disco no
            # sabe nada de eso. El cliente ya apaga estos tamaños, pero el que prohíbe es el
            # servidor: `/api/mundos/crear` lo llama un `curl` igual de bien.
            tope_p = plantillas.tope_de_plantilla(ficha_pedida)
            if lado > tope_p:
                return self._send(409, {
                    'error': f'«{(ficha_pedida or {}).get("titulo") or pedida}» no da para {lado}×{lado}: '
                             f'su máximo es {tope_p}×{tope_p}. Más grande no sale más bonito — sale un '
                             f'navegador sin memoria a mitad de la generación.',
                    'ladoMax': tope_p, 'lados': list(plantillas.LADOS)})
            dim = {'x': lado, 'y': plantillas.ALTO, 'z': lado}
            # La cuota se mira ANTES de escribir, que es la única forma de que sirva de algo. El
            # dueño del servidor no tiene cuota: no es una cuenta, es quien paga el disco.
            if uid:
                tope = ((u.get('cuota') or sesion.CUOTA_POR_DEFECTO).get('mapas')
                        or sesion.CUOTA_POR_DEFECTO['mapas'])
                tiene = len(mundos_meta.de(uid))
                if tiene >= tope:
                    return self._send(409, {'error': f'has llegado a tu tope de mapas ({tiene} de {tope}). '
                                                     'Borra alguno para hacer sitio.',
                                            'cuota': {'mapas': tope, 'usados': tiene}})
                # Y los BYTES, que son el tope que de verdad llena el disco: cinco mapas son cinco
                # ficheros, pero un mapa grande son seis megas.
                # ⚠️ REQ-PLANT1 · se cobra por el tamaño ELEGIDO, no por el de `DEFAULT_WORLD`. Antes
                # se cobraban siempre 96³ (720 KB) y después el generador hacía `resizeWorld(128…)` o
                # más: la cuota daba el visto bueno para 720 KB y en disco acababan 21 MB.
                if self._lleno_o_409(uid, plantillas.bytes_de(lado), 'un mapa nuevo'):
                    return
            # El nombre es global (el registro es LATERAL, no hay `@usuario/` en la ruta), así que la
            # colisión no se rechaza: se propone. `castillo` cogido → `castillo-2`.
            pedido = world_slug(d.get('nombre'))
            if not pedido:
                return self._send(400, {'error': 'hace falta un nombre'})
            if pedido == 'default':
                return self._send(409, {'error': '«default» es el mundo sagrado: elige otro nombre'})
            slug = mundos_meta.nombre_libre(
                pedido, lambda s: os.path.exists(os.path.join(WORLDS, s + '.json')))
            mundo = dict(DEFAULT_WORLD, dim=dim)
            voxfmt.guardar_v1(os.path.join(WORLDS, slug + '.json'), mundo, atomic_dump, to_trash)

            # (`plantilla` y `especial` ya están resueltos arriba: hacía falta la ficha ANTES de
            # escribir nada, para poder rechazar un tamaño que la plantilla no aguanta.)

            # La AMBIENTACIÓN se persiste como un `mundo-<slug>`, porque `game.entorno(...)` es un
            # ajuste de tiempo de ejecución y se perdería al salir. ⛔ Lo escribe el SERVIDOR a partir
            # de la lista cerrada de `servidor/plantillas.py`: el jugador manda claves («tormenta»),
            # nunca código. Ver el porqué largo en la cabecera de ese módulo — es lo que permite dar
            # esta función sin abrir `snippet.crear_propio`, que sigue bajo candado (F-E).
            # ⛔ El `construye-*` NO entra aquí: empieza por `game.wipeMap()` y arrasaría el mundo en
            # cada entrada. El generador corre UNA vez; esto corre siempre.
            codigo = plantillas.codigo_ambiente(d.get('ambiente'), d.get('efectos'))
            if codigo:
                sid_amb = 'mundo-' + slug
                atomic_dump({'id': sid_amb, 'name': 'Ambiente de «' + slug + '»', 'code': codigo,
                             'dueno': uid, 'savedAt': now_iso()}, self._snip_path(sid_amb))

            meta = mundos_meta.crea(slug, uid, plantilla=plantilla, especial=especial)
            return self._send(200, {'ok': True, 'nombre': slug, 'ruta': '/map/' + slug,
                                    'renombrado': slug != pedido, 'meta': meta,
                                    'lado': lado, 'plantilla': plantilla, 'especial': especial})
        mg = re.match(r'^/api/mundos/([a-z0-9-]+)/generado$', ruta_post)
        if mg:                                                    # REQ-PLANT1 · «ya he terminado de construir»
            # Lo llama el navegador cuando el `construye-*` acaba. Hasta que llega esto, el mapa está
            # marcado a medias y al volver a entrar se regenera — que es lo que el dueño pidió: **no
            # dejarlo a medias**. Sólo puede marcarlo quien puede escribir en el mapa; si no, un
            # tercero podría dar por bueno un mundo que se quedó a la mitad.
            # ⚠️ Aquí NO vale `_mundo_ok()`: ese saca el mapa de `?map=`, y este slug viene en la
            # RUTA. Se comprueba a mano contra el registro, como hace el DELETE de mundos.
            slug = mg.group(1)
            if not self._es_dueno() and not mundos_meta.puede_escribir(
                    mundos_meta.lee(slug), self.quien(), False):
                return self._send(403, {'error': f'«{slug}» no es tuyo'})
            return self._send(200, {'ok': True, 'meta': mundos_meta.marca_generado(slug)})
        if ruta_post in ('/api/mundos/duplicar', '/api/mundos/renombrar'):   # menú del botón derecho en /map/
            # Un mundo son DOS ficheros (.json + .vox hermano): el par lo mueve `voxfmt`, que es quien
            # sabe eso y quien tiene el cerrojo por ruta. Aquí sólo se decide QUIÉN puede y hacia dónde.
            renombra = ruta_post.endswith('renombrar')
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'faltan datos'})
            org, dst = world_slug(d.get('origen')), world_slug(d.get('nombre'))
            if not org:
                return self._send(400, {'error': 'falta el mundo de origen'})
            if not dst:
                # `world_slug` se come todo lo que no sea [a-z0-9-]: un nombre en chino o sólo signos
                # se queda en cadena vacía, que apuntaría a mundo.json. Se corta aquí, no allí.
                return self._send(400, {'error': 'ese nombre no deja ninguna letra ni número utilizable'})
            if dst == 'default':
                return self._send(400, {'error': '«default» es el mundo de siempre: elige otro nombre'})
            if renombra and org == 'default':
                # data/mundo.json es el mundo sagrado y su ruta está escrita en medio repo (y en la URL
                # /map/default). Duplicarlo sí; moverlo de sitio, no.
                return self._send(400, {'error': 'el mundo «default» no se renombra — duplícalo y renombra la copia'})
            if org == dst:
                return self._send(400, {'error': 'ya se llama así'})
            src_wf, dst_wf = world_file_for(org), world_file_for(dst)
            ok, err = (voxfmt.mover if renombra else voxfmt.copiar)(src_wf, dst_wf)
            if not ok:
                return self._send(409, {'error': err})
            if renombra:
                # La miniatura se cachea POR NOMBRE (data/_thumbs/<slug>.json): la del nombre viejo ya
                # no describe nada y reviviría si alguien vuelve a usar ese nombre.
                try: os.remove(os.path.join(BASE, 'data', '_thumbs', org + '.json'))
                except OSError: pass
            return self._send(200, {'ok': True, 'nombre': dst, 'ruta': '/map/' + dst})
        if ruta_post == '/api/mundo/edits':                       # poner/quitar bloques: seek + 2 bytes por celda
            if not self._mundo_ok(escribir=True):
                return
            # Este es el camino que arregla la congelación. NO se lee ni se reescribe el mundo entero:
            # el cuerpo son las celdas que han cambiado, [[x,y,z,'asset:assets/roca.vox.json'], ...],
            # con '' o null para el aire. Poner un bloque pasa de un POST de 257 MB a uno de ~1 KB.
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict) or not isinstance(d.get('edits'), list):
                return self._send(400, {'error': 'edits inválidos'})
            if not voxfmt.completo(wf):
                # El cliente reintenta con el POST completo: así una edición no se pierde nunca porque
                # el mundo esté todavía en v1 (o porque el .vox se haya quedado a medias).
                return self._send(409, {'error': 'el mundo no está en voxelworld-2', 'reintenta': 'completo'})
            n, err = voxfmt.aplicar_edits(wf, d['edits'], atomic_dump, to_trash)
            if err:
                return self._send(400, {'error': err})
            return self._send(200, {'ok': True, 'aplicadas': n})
        if ruta_post == '/api/mundo/cabecera':                    # spawn / estructuras / notas (kilobytes)
            if not self._mundo_ok(escribir=True):
                return
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'cabecera inválida'})
            # F6.4 · EL SITIO DE APARICIÓN LO MUEVE SOLO EL DUEÑO DEL MAPA. No es lo mismo construir
            # que decidir dónde aparece TODO EL MUNDO al entrar: con `escritura:'todos'`, cualquiera
            # podía plantar el spawn dentro de la roca o en el aire a 40 de altura y el mapa quedaba
            # inservible para los demás sin haber roto un solo bloque.
            #
            # ⚠️ Se QUITA el campo, no se rechaza la petición entera: `mcScheduleSave` manda la cabecera
            # completa (spawn + estructuras + notas) desde CADA navegador cada vez, así que un 403 aquí
            # dejaría a los invitados sin poder guardar las estructuras que sí son suyas. Y se dice en la
            # respuesta (`spawnIgnorado`), porque un campo que se cae en silencio es un fallo invisible:
            # el autor vería su spawn volver al de antes al recargar sin nada que mirar.
            if 'spawn' in d:
                slug_cab = self._slug_pedido()
                meta_cab = mundos_meta.lee(slug_cab)
                dueno_cab = meta_cab.get('dueno')
                yo_cab = (self.quien() or {}).get('uid')
                # Sin dueño registrado no hay a quién reservárselo: los 33 mapas de antes de F3.1 no
                # tienen `dueno`, y ahí manda quien pueda escribir, como hasta hoy.
                if dueno_cab and not self._es_dueno() and yo_cab != dueno_cab:
                    d.pop('spawn')
                    if not voxfmt.guardar_cabecera(wf, d, atomic_dump, to_trash):
                        return self._send(409, {'error': 'el mundo no está en voxelworld-2',
                                                'reintenta': 'completo'})
                    return self._send(200, {'ok': True, 'spawnIgnorado': True,
                                            'aviso': 'el sitio de aparición solo lo mueve el dueño del mapa'})
            if not voxfmt.guardar_cabecera(wf, d, atomic_dump, to_trash):
                return self._send(409, {'error': 'el mundo no está en voxelworld-2', 'reintenta': 'completo'})
            return self._send(200, {'ok': True})
        if ruta_post == '/api/mundo':                             # mundo sandbox 3D (REQ-MC); ?map=<nombre> elige el mundo
            if not self._mundo_ok(escribir=True):
                return
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict) or 'voxels' not in d or 'dim' not in d:   # validación mínima
                return self._send(400, {'error': 'mundo inválido'})
            # F3.4 · ESTE es el sitio donde un mapa engorda: `/edits` escribe dos bytes en una celda
            # que ya existe, pero el mundo entero trae su `dim` y con él el tamaño del `.vox`. El
            # coste se calcula de la DIMENSIÓN PEDIDA (celdas × 2 bytes), no de lo que ocupa el
            # cuerpo: los voxels vienen dispersos y un JSON de 4 KB puede pedir una rejilla de 3 GB.
            slug_pedido = self._slug_pedido()
            dueno_mapa = mundos_meta.lee(slug_pedido).get('dueno')
            if dueno_mapa:
                dim = d['dim'] if isinstance(d['dim'], dict) else {}
                try:
                    celdas = int(dim.get('x', 0)) * int(dim.get('y', 0)) * int(dim.get('z', 0))
                except (TypeError, ValueError):
                    return self._send(400, {'error': 'dim inválida'})
                # Menos lo que ya ocupa: guardar el mismo mapa otra vez no puede consumir cuota, o a
                # la tercera pasada del editor el autor no podría guardar su propio trabajo.
                if self._lleno_o_409(dueno_mapa, celdas * 2 - pesa_mundo(slug_pedido),
                                     f'«{slug_pedido}» con {dim.get("x")}×{dim.get("y")}×{dim.get("z")}'):
                    return
            # De puertas afuera sigue aceptando el doc v1 completo de siempre (sondas, tests, wipeMap,
            # importaciones); por dentro aterriza ya en voxelworld-2.
            if voxfmt.guardar_v1(wf, d, atomic_dump, to_trash) is None:
                return self._send(400, {'error': 'mundo inválido'})
            return self._send(200, {'ok': True})
        if self.path == '/api/snippets':                         # gestor de snippets: crear/guardar
            d = self._read()
            if not isinstance(d, dict) or 'code' not in d:       # validación mínima
                return self._send(400, {'error': 'snippet inválido'})
            # Id estable = el que manda el cliente (ahora se puede teclear en el editor, BUG-SNP5) o el
            # slug del nombre. Se acota a lo MISMO que la ruta de lectura (`^/api/snippets/([A-Za-z0-9_-]+)$`)
            # o se guardaría un fichero que ninguna GET puede volver a pedir; y como acaba en un
            # os.path.join, sin acotar un id con `../` escribiría fuera de data/snippets/.
            sid = re.sub(r'[^A-Za-z0-9_-]+', '-', str(d.get('id') or '')).strip('-') or slugify(d.get('name'))
            rec = {'id': sid, 'name': d.get('name', '(sin nombre)'), 'code': d.get('code', ''),
                   'savedAt': now_iso()}
            cat = str(d.get('categoria') if 'categoria' in d else (d.get('category') or '')).strip()
            if cat:
                rec['categoria'] = cat
            # REQ-PLANT1 · la FICHA del carrusel de mundo nuevo (título, descripción, etiquetas, foto
            # y frases de carga) viaja DENTRO del generador, que es donde la quiso el dueño: «podria
            # haber metadatos en esos snippets para indicar la foto, el titulo de la ficha, una
            # descripcion, etc». Es pegajosa por el mismo motivo que `protegido` justo aquí abajo —
            # `rec` se arma de cero, así que sin esto el primer guardado desde el botón del editor se
            # llevaría la ficha por delante y el bioma desaparecería del carrusel sin un solo error.
            # ⛔ La foto va por RUTA, nunca en base64: `/api/snippets` tiene 2 MB de cuerpo y este
            # fichero se lee entero en cada arranque del mapa.
            if 'ficha' in d:
                if isinstance(d.get('ficha'), dict):
                    rec['ficha'] = d['ficha']
            else:
                try:
                    with open(self._snip_path(sid), encoding='utf-8') as f:
                        vieja = json.load(f).get('ficha')
                    if isinstance(vieja, dict):
                        rec['ficha'] = vieja
                except Exception:
                    pass
            # `protegido` es PEGAJOSO: si el fichero ya lo llevaba y quien guarda no dice nada, se
            # queda. `rec` se arma de cero, así que sin esto cualquier guardado normal —el botón del
            # editor, `redstone/make_snippets.js`— desprotegería la pieza en silencio, y una marca
            # que se cae sola no protege de nada. Para quitarla hay que pedirlo: `protegido: false`.
            if 'protegido' in d:
                if d.get('protegido') is True:
                    rec['protegido'] = True
            else:
                try:
                    with open(self._snip_path(sid), encoding='utf-8') as f:
                        if json.load(f).get('protegido') is True:
                            rec['protegido'] = True
                except Exception:
                    pass                                         # no existía, o no se puede leer: nace sin marca
            to_trash(self._snip_path(sid), move=False)           # respaldo de la versión anterior
            atomic_dump(rec, self._snip_path(sid))
            return self._send(200, {'id': sid, 'savedAt': rec['savedAt']})
        if ruta_post == '/api/namespace':                        # REQ-GAL3: mover pieza entre asset: y hab:
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'petición inválida'})

            # Validación de autorización por token (CLI o VOXELFORGE_TOKEN)
            serv_token = get_server_token()
            if serv_token:
                user_token = str(d.get('token') or self.headers.get('X-VoxelForge-Token') or '').strip()
                if not user_token:
                    return self._send(401, {'error': 'Se requiere token de autorización (VOXELFORGE_TOKEN)', 'requiresToken': True})
                if user_token != serv_token:
                    return self._send(403, {'error': 'Token de autorización incorrecto', 'requiresToken': True})

            origen = d.get('from')  # 'asset' o 'hab'
            destino = d.get('to')   # 'asset' o 'hab'
            idd = str(d.get('id') or '').strip()
            if origen not in ('asset', 'hab') or destino not in ('asset', 'hab') or origen == destino or not idd:
                return self._send(400, {'error': 'parámetros inválidos (from, to, id)'})

            idx_path = os.path.join(BASE, 'assets', 'index.json')
            idx = []
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                except Exception:
                    idx = []

            if origen == 'hab' and destino == 'asset':
                hab_path = self._path(idd)
                if not os.path.exists(hab_path):
                    return self._send(404, {'error': f'No existe el habitante «{idd}»'})
                try:
                    with open(hab_path, 'r', encoding='utf-8') as f:
                        doc = json.load(f)
                except Exception:
                    return self._send(400, {'error': 'No se pudo leer el habitante'})
                
                meta = doc.get('meta', {})
                name = meta.get('name') or idd
                asset_id = slugify(idd)
                filename = f'{asset_id}.vox.json'
                asset_path = os.path.join(BASE, 'assets', filename)
                rel_file = f'assets/{filename}'

                # Si ya existe en assets, respaldar
                to_trash(asset_path, move=False)
                atomic_dump(doc, asset_path)

                # Mover habitante a la papelera
                to_trash(hab_path, move=True)

                # Añadir o actualizar en index.json
                found = False
                for item in idx:
                    if item.get('id') == asset_id or item.get('file') == rel_file:
                        item['name'] = meta.get('name', name)
                        item['file'] = rel_file
                        item['size'] = doc.get('size', 16)
                        item['type'] = meta.get('type', 'objeto')
                        item['savedAt'] = now_iso()
                        item['count'] = len(doc.get('voxels', {}) or {})
                        found = True
                        break
                if not found:
                    nuevo = {
                        'id': asset_id,
                        'name': meta.get('name', name),
                        'role': meta.get('role', f'Asset · {asset_id}'),
                        'icon': meta.get('icon', '📦'),
                        'type': meta.get('type', 'objeto'),
                        'group': meta.get('group', 'Objetos'),
                        'size': doc.get('size', 16),
                        'file': rel_file,
                        'savedAt': now_iso(),
                        'createdAt': doc.get('createdAt') or now_iso(),
                        'count': len(doc.get('voxels', {}) or {})
                    }
                    if meta.get('categoria'): nuevo['categoria'] = meta['categoria']
                    if meta.get('herramienta'): nuevo['herramienta'] = meta['herramienta']
                    idx.append(nuevo)
                atomic_dump(idx, idx_path)

                return self._send(200, {'ok': True, 'id': asset_id, 'file': rel_file, 'kind': 'asset',
                                        'clave': f'asset:{rel_file}', 'prevClave': f'hab:{idd}'})

            elif origen == 'asset' and destino == 'hab':
                asset_id = idd
                if asset_id.startswith('assets/'): asset_id = asset_id[7:]
                if asset_id.endswith('.vox.json'): asset_id = asset_id[:-9]
                asset_path = os.path.join(BASE, 'assets', f'{asset_id}.vox.json')
                if not os.path.exists(asset_path):
                    return self._send(404, {'error': f'No existe el asset «{asset_id}»'})
                try:
                    with open(asset_path, 'r', encoding='utf-8') as f:
                        doc = json.load(f)
                except Exception:
                    return self._send(400, {'error': 'No se pudo leer el asset'})

                meta = doc.get('meta', {})
                name = meta.get('name') or asset_id
                hab_id = slugify(asset_id) or slugify(name)
                hab_path = self._path(hab_id)

                to_trash(hab_path, move=False)
                doc['savedAt'] = now_iso()
                atomic_dump(doc, hab_path)

                # Mover asset a papelera y quitar de index.json
                to_trash(asset_path, move=True)
                idx = [item for item in idx if item.get('id') != asset_id and item.get('file') != f'assets/{asset_id}.vox.json']
                atomic_dump(idx, idx_path)

                return self._send(200, {'ok': True, 'id': hab_id, 'kind': 'hab',
                                        'clave': f'hab:{hab_id}', 'prevClave': f'asset:assets/{asset_id}.vox.json'})

        if self.path == '/api/agentes':                          # agentes articulados: crear/guardar
            d = self._read()
            if (not isinstance(d, dict) or not isinstance(d.get('raiz'), dict)
                    or not d['raiz'].get('pieza') or not isinstance(d.get('piezas'), list)):
                return self._send(400, {'error': 'agente inválido: hace falta raiz.pieza y piezas[]'})
            gid = slugify(d.get('id') or d.get('nombre'))
            # `rec` es una COPIA del documento entero, no una lista de campos conocidos: el formato va
            # a crecer (fase 3 le pondrá pose de reposo, sonidos, lo que sea) y un guardado desde una
            # versión vieja del editor no puede tirar a la basura las claves que esa versión no
            # entiende. Solo se imponen `id` y `savedAt`, que son del almacén y no del bicho.
            rec = dict(d)
            rec['id'] = gid
            rec['savedAt'] = now_iso()
            to_trash(self._agente_path(gid), move=False)         # respaldo de la versión anterior
            atomic_dump(rec, self._agente_path(gid))
            dedup(gid, AGENTS, lambda a: a.get('nombre'))        # consolida otros con el mismo nombre
            return self._send(200, {'id': gid, 'savedAt': rec['savedAt']})
        if self.path == '/api/assets':
            d = self._read()
            if not isinstance(d, dict) or 'voxels' not in d:
                return self._send(400, {'error': 'asset inválido'})
            meta = d.get('meta', {})
            name = meta.get('name') or d.get('name') or 'asset'
            # La identidad de un asset es su FICHERO, no su rótulo: el mundo y los agentes guardan
            # 'asset:assets/<id>.vox.json'. Si el editor dice de qué asset viene lo que está guardando,
            # se reescribe ESE; deducir el id del nombre bifurcaba en silencio (guardar «Torso de zombie»
            # escribía torso-de-zombie.vox.json y el bicho vivo seguía con torso-zombie.vox.json).
            # Sin id => alta nueva, y ahí sí manda el nombre.
            # Extraer id sin extensión si viene como ruta (ej: 'assets/bloque_redstone.vox.json' -> 'bloque_redstone')
            raw_id = str(d.get('id') or '')
            if raw_id.startswith('assets/'): raw_id = raw_id[7:]
            if raw_id.endswith('.vox.json'): raw_id = raw_id[:-9]
            # ⛔ La `/` SE QUEDA: el id de un asset en subcarpeta es `trees_mock/pino`, y comérsela era la
            # otra mitad del bug de 2026-08-27 (guardar el pino del mock escribía `assets/pino.vox.json`).
            # Los `..` los para `_asset_path`, que es quien decide si la ruta se sale de `assets/`; aquí
            # sólo se limpia lo que no puede formar parte de un id.
            idd = re.sub(r'[^A-Za-z0-9_./-]', '', raw_id).strip('/') or slugify(name)
            filename = f'{idd}.vox.json'
            asset_path = self._asset_path(idd)
            if not asset_path:
                return self._send(400, {'error': 'id de asset inválido: %s' % idd})
            # Alta en subcarpeta: el directorio puede no existir todavía (`atomic_dump` no lo crea).
            os.makedirs(os.path.dirname(asset_path), exist_ok=True)
            # El editor no conoce alias/icon/description (no hay campos para ellos en el panel «Objeto»), y
            # este POST vuelca el .vox.json ENTERO con lo que manda: sin esto, guardar una textura desde
            # el editor le borraría el nombre corto del fichero. El índice lo conservaría, pero a la
            # siguiente reindexación se perdería. Borrar un alias se hace desde la ficha (PATCH), no
            # guardando el dibujo.
            if os.path.exists(asset_path):
                try:
                    with open(asset_path, 'r', encoding='utf-8') as f:
                        previo = (json.load(f) or {}).get('meta') or {}
                except Exception:
                    previo = {}
                heredado = {k: previo[k] for k in ('alias', 'icon', 'description')
                            if previo.get(k) and not meta.get(k)}
                if heredado:
                    meta = dict(meta, **heredado)
                    d['meta'] = meta
            to_trash(asset_path, move=False)          # respaldo de la versión anterior, como en habitantes
            atomic_dump(d, asset_path)

            idx_path = os.path.join(BASE, 'assets', 'index.json')
            idx = []
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                except Exception:
                    pass

            rel_file = f'assets/{filename}'
            found = False
            for item in idx:
                if item.get('id') == idd or item.get('file') == rel_file:
                    item['name'] = meta.get('name', item.get('name', idd))
                    item['file'] = rel_file
                    item['size'] = d.get('size', item.get('size', 16))   # el dibujo pudo cambiar de tamaño
                    # role/icon/alias/description solo si el editor los trae: 'group' NO se toca (no hay
                    # UI para elegirlo y machacarlo mandaría una pieza de «Agentes» a «Bloques de
                    # construcción»). alias/description vienen heredados del fichero de arriba.
                    for k in ('role', 'icon', 'alias', 'description'):
                        if meta.get(k):
                            item[k] = meta[k]
                    for campo in ('categoria', 'herramienta'):     # REQ-TOOL1: 'herramienta' igual que 'categoria'
                        if meta.get(campo):
                            item[campo] = meta[campo]
                        else:
                            item.pop(campo, None)                  # quitarla en el editor tiene que quitarla aquí
                    # REQ-GAL4: reguardar mueve `savedAt` («recientes») pero NO `createdAt`, que es la
                    # fecha de alta y solo se pone una vez. `count` se recalcula porque el dibujo cambió.
                    item['savedAt'] = now_iso()
                    item.setdefault('createdAt', item['savedAt'])
                    item['count'] = len(d.get('voxels', {}) or {})
                    found = True
                    break

            if not found:
                nuevo = {
                    'id': idd,
                    'name': meta.get('name', idd),
                    'role': meta.get('role', f'Bloque · {idd}'),
                    'icon': meta.get('icon', '🧱'),
                    'type': meta.get('type', 'textura'),
                    'group': meta.get('group', 'Bloques de construcción'),
                    'size': d.get('size', 16),
                    'file': rel_file,
                    'savedAt': now_iso(),
                    'createdAt': now_iso(),     # alta: esta es la única vez que se escribe
                    'count': len(d.get('voxels', {}) or {})
                }
                for campo in ('categoria', 'herramienta'):         # REQ-TOOL1
                    if meta.get(campo):
                        nuevo[campo] = meta[campo]
                # Solo si los hay: una entrada con 'alias':'' es ruido en el índice y además el cliente
                # registraría la cadena vacía como clave de material.
                for k in ('alias', 'description'):
                    if meta.get(k):
                        nuevo[k] = meta[k]
                idx.append(nuevo)

            atomic_dump(idx, idx_path)
            return self._send(200, {'ok': True, 'id': idd, 'file': rel_file})
        if self.path == '/api/habitantes':
            d = self._read()
            d.pop('id', None)
            idd = slugify(d.get('meta', {}).get('name'))     # id = nombre => sin duplicados
            d['savedAt'] = now_iso()
            # REQ-GAL4: `createdAt` es del ALMACÉN, no del dibujo, y sobrevive a cada sobrescritura —
            # se relee del fichero que hay ahora, no de lo que mande el cliente (que reenvía el
            # documento entero y borraría la fecha de alta de un dibujo viejo al reguardarlo).
            previo = {}
            if os.path.exists(self._path(idd)):
                try:
                    previo = json.load(open(self._path(idd), encoding='utf-8')) or {}
                except Exception:
                    previo = {}
            d['createdAt'] = previo.get('createdAt') or previo.get('savedAt') or d['savedAt']

            # REQ-ASSET1 · de quién es esto.
            #
            # ⚠️ EL CHOQUE DE NOMBRES ES REAL Y HAY QUE FRENARLO AQUÍ. El id de un habitante es su
            # nombre pasado por `slugify`, así que dos personas que llamen «casa» a su dibujo
            # aterrizan en el MISMO fichero. Antes de este ticket eso daba igual (todo era del
            # dueño); con cuentas, dejarlo pasar es sobrescribir el dibujo de otro sin avisar.
            mando = self._es_dueno()
            if not mando:
                de_otro = autoria.choca(previo, self.quien())
                if de_otro:
                    return self._send(409, {
                        'error': f'ya hay un habitante llamado «{idd}» y no es tuyo. '
                                 'Ponle otro nombre y vuelve a guardar.',
                        'id': idd, 'deOtro': True})
            autoria.sella(d, self.quien(), previo, manda=mando)

            to_trash(self._path(idd), move=False)             # respaldo antes de sobrescribir
            atomic_dump(d, self._path(idd))
            dedup(idd)                                        # consolida otros con el mismo nombre (a papelera)
            return self._send(200, {'id': idd, 'savedAt': d['savedAt']})
        return self._send(404, {'error': 'ruta'})

    def do_PATCH(self):
        if not self._guardias():
            return

        # F3.1 · el autor elige quién ve y quién escribe en SU mapa.
        #
        # Va aquí arriba y no abajo con los assets porque `_asset_id()` mira el último tramo de la
        # ruta: `/api/mundos/castillo` le parece el asset «castillo», y si ese asset existiera se
        # comería la petición. El orden de las ramas ES la protección.
        mm = re.match(r'^/api/mundos/([a-z0-9-]+)$', urllib.parse.urlparse(self.path).path)
        if mm:
            slug = mm.group(1)
            if not os.path.exists(os.path.join(WORLDS, slug + '.json')) and slug != 'default':
                return self._send(404, {'error': f'no existe el mundo «{slug}»'})
            meta = mundos_meta.lee(slug)
            u = self.quien()
            if not self._es_dueno() and not mundos_meta.es_suyo(meta, u):
                # Un mundo HEREDADO (los 33 de antes de F3.1) no es de nadie ⇒ aquí no entra nadie
                # más que el dueño del servidor. Es lo que hace que abrirlos sea trabajo del panel
                # (F9) y no de quien acierte el nombre.
                return self._send(403 if u else 401, {'error': f'«{slug}» no es tuyo',
                                                      'necesitaEntrar': not u})
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'faltan datos'})

            # Campo a campo y solo los que vienen: el panel manda uno suelto y el menú manda dos, y
            # rearmar el registro entero borraría `creado` y `dueno` en cuanto alguien mande solo
            # `codigo`. Es el mismo cuidado que ya se tiene con `createdAt` en los habitantes.
            if 'visibilidad' in d:
                if d['visibilidad'] not in mundos_meta.VISIBILIDADES:
                    return self._send(400, {'error': 'visibilidad: ' +
                                            ' | '.join(mundos_meta.VISIBILIDADES)})
                meta['visibilidad'] = d['visibilidad']
            if 'escritura' in d:
                if d['escritura'] not in mundos_meta.ESCRITURAS:
                    return self._send(400, {'error': 'escritura: ' +
                                            ' | '.join(mundos_meta.ESCRITURAS)})
                meta['escritura'] = d['escritura']
            if 'codigo' in d:
                meta['codigo'] = str(d['codigo'] or '').strip()[:64]
            if 'invitados' in d:
                # Se invita POR NOMBRE, que es lo que la gente sabe de sus amigos, y se guarda por
                # uid, que es lo que no cambia si alguien se renombra. La traducción se hace aquí y
                # no en el navegador para no publicar un «¿existe este usuario?» a los anónimos.
                pedidos = d['invitados'] if isinstance(d['invitados'], list) else []
                uids, desconocidos = [], []
                for quien in pedidos[:200]:
                    quien = str(quien or '').strip()
                    if not quien:
                        continue
                    uid = sesion.uid_de(quien)          # el uid ES el nombre normalizado
                    (uids if uid and sesion.existe(uid) else desconocidos).append(uid or quien)
                if desconocidos:
                    return self._send(400, {'error': 'no conozco a ' + ', '.join(desconocidos),
                                            'desconocidos': desconocidos})
                meta['invitados'] = sorted(set(uids))
            if 'destacado' in d:
                # ⛔ Destacar es la portada del servidor, no una propiedad del mapa: si un usuario
                # pudiera destacarse solo, la portada sería de quien más veces pulsara el botón.
                if not self._es_dueno():
                    return self._send(403, {'error': 'destacar un mapa es cosa del dueño del servidor'})
                meta['destacado'] = bool(d['destacado'])
            if meta.get('heredado') and not meta.get('dueno'):
                meta['creado'] = meta.get('creado') or time.strftime('%Y-%m-%dT%H:%M:%S')
            return self._send(200, {'ok': True, 'meta': mundos_meta.guarda(meta)})

        aid = self._asset_id()
        ap = self._asset_path(aid) if aid else None
        if ap and os.path.exists(ap):
            body = self._read()
            name = (body.get('name') or '').strip()
            # «Renombrar» manda solo name; la ficha manda alias/icon/description. Cada campo es
            # opcional POR SEPARADO, y por eso se mira `in body` y no si el valor es verdadero:
            # alias:'' significa «borra el alias», no «este campo no viene».
            if not any(k in body for k in ('name', 'alias', 'icon', 'description')):
                return self._send(400, {'error': 'nada que cambiar'})
            if 'name' in body and not name:
                return self._send(400, {'error': 'falta el nombre'})

            idx_path = os.path.join(BASE, 'assets', 'index.json')
            idx = []
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                except Exception:
                    idx = []

            alias = None
            if 'alias' in body:
                alias, motivo = validar_alias(body.get('alias'), aid, idx)
                if motivo:
                    # 409 y no 400: el nombre corto esta bien escrito, lo que pasa es que ya esta
                    # cogido. El cliente pinta `motivo` tal cual debajo del campo.
                    return self._send(409, {'error': motivo, 'alias': alias})

            # Renombrar un asset cambia SOLO el rotulo: el id y el fichero se quedan. Los voxels del
            # mundo guardan la clave del material como 'asset:assets/<fichero>.vox.json', asi que mover
            # el fichero (como si hace el rename de habitantes) dejaria sin textura cada bloque pintado
            # con el en cada mundo. El nombre es de la vitrina; el fichero es la identidad. El alias
            # tampoco mueve nada: es otra puerta de entrada al mismo fichero.
            d = json.load(open(ap, encoding='utf-8'))
            meta = d.setdefault('meta', {})
            if 'name' in body:
                meta['name'] = name
            if 'icon' in body:
                meta['icon'] = str(body.get('icon') or '').strip()
            if 'description' in body:
                meta['description'] = str(body.get('description') or '').strip()
            if alias:
                meta['alias'] = alias
            elif alias is not None:
                meta.pop('alias', None)
            atomic_dump(d, ap)

            # El indice es el espejo del que se alimenta el cliente (mcIndexAssets solo lee de aqui:
            # sin esto habria que bajar los ~79 .vox.json en cada arranque para saber los alias).
            for item in idx:
                if item.get('id') == aid or item.get('file') == f'assets/{aid}.vox.json':
                    for k in ('name', 'icon', 'description'):
                        if k in body:
                            item[k] = meta.get(k, '')
                    if alias:
                        item['alias'] = alias
                    elif alias is not None:
                        item.pop('alias', None)
            if idx:
                try:
                    atomic_dump(idx, idx_path)
                except Exception:
                    pass
            return self._send(200, {'ok': True, 'id': aid, 'name': meta.get('name', ''),
                                    'alias': meta.get('alias', ''),
                                    'icon': meta.get('icon', ''),
                                    'description': meta.get('description', '')})
        gid = self._agente_id()
        if gid and os.path.exists(self._agente_path(gid)):
            d = json.load(open(self._agente_path(gid), encoding='utf-8'))
            body = self._read()
            nombre = (body.get('nombre') or '').strip()
            if nombre:
                # Aquí el fichero SÍ se mueve (al revés que en assets): a un agente se le invoca por
                # su id y no hay nada guardado en el mundo que lo apunte — los agentes son efímeros y
                # no entran en mundo.json, así que renombrar no deja huérfano a nadie.
                d['nombre'] = nombre
                new_id = slugify(nombre)
                if new_id != gid:
                    d['id'] = new_id
                    to_trash(self._agente_path(new_id), move=False)
                    atomic_dump(d, self._agente_path(new_id))
                    to_trash(self._agente_path(gid)); gid = new_id     # el viejo va a papelera
                    dedup(gid, AGENTS, lambda a: a.get('nombre'))
                else:
                    atomic_dump(d, self._agente_path(gid))
            return self._send(200, {'ok': True, 'id': gid, 'nombre': d.get('nombre', '')})
        idd = self._id()
        if idd and os.path.exists(self._path(idd)):
            d = json.load(open(self._path(idd), encoding='utf-8'))
            body = self._read()
            if body.get('name'):
                d.setdefault('meta', {})['name'] = body['name']
                new_id = slugify(body['name'])
                if new_id != idd:                            # renombrar => mover el fichero al nuevo id
                    to_trash(self._path(new_id), move=False)
                    atomic_dump(d, self._path(new_id))
                    to_trash(self._path(idd)); idd = new_id   # el viejo va a papelera
                    dedup(idd)
                else:
                    atomic_dump(d, self._path(idd))
            return self._send(200, {'ok': True, 'id': idd})
        return self._send(404, {'error': 'no existe'})

    def do_DELETE(self):
        if not self._guardias():
            return
        if self._panel(urllib.parse.urlparse(self.path).path):
            return
        # ── F3.3 · borrar un mundo ──────────────────────────────────────────────────────────────
        # Hasta hoy NO existía: los mundos nacían solos al visitar una URL y no había forma de
        # quitarlos por API. En un multiverso donde cada uno crea los suyos eso no es una carencia,
        # es un producto sin terminar — y además la única forma de que un test se recoja la basura.
        mm = re.match(r'^/api/mundos/([a-z0-9-]+)$', urllib.parse.urlparse(self.path).path)
        if mm:
            slug = mm.group(1)
            # El permiso ya lo ha exigido `_exige_por_ruta` (fila `/api/mundos` + DELETE ⇒
            # `mundo.borrar_propio`), y aquí NO se vuelve a pedir a propósito: un permiso comprobado
            # en dos sitios acaba divergiendo, y el sitio que se olvide de actualizar es el que
            # manda. De quién ES cada mundo todavía no se sabe — eso es `data/mundos_meta/` (F3.1);
            # hoy el permiso es la única puerta, y el dueño la cruza siempre.
            if slug == 'default':
                return self._send(409, {'error': 'el mapa «default» es el mundo sagrado '
                                                 '(`data/mundo.json`): no se borra por API.'})
            wf = os.path.join(WORLDS, slug + '.json')
            if not os.path.exists(wf):
                return self._send(404, {'error': f'no existe el mundo «{slug}»'})
            # `mundo.borrar_propio` dice que puede borrar mundos; ESTO dice cuáles. Sin esta línea el
            # permiso daría barra libre sobre los mapas de los demás, que es justo lo contrario de
            # lo que significa «propio». Los 33 heredados no son de nadie ⇒ solo el dueño del
            # servidor, que ya ha pasado por `_es_dueno()` más arriba.
            if not self._es_dueno() and not mundos_meta.es_suyo(mundos_meta.lee(slug), self.quien()):
                return self._send(403, {'error': f'«{slug}» no es tuyo'})
            # El par entero a `data/papelera/mundos/`, y con `voxfmt.mover`, que es quien sabe que el
            # `.vox` es hermano del `.json` y quien tiene el cerrojo por ruta: alguien puede estar
            # poniendo bloques en este mundo AHORA MISMO. Moverlo a mano dejaría el `.vox` huérfano.
            destino = os.path.join(BASE, 'data', 'papelera', 'mundos')
            os.makedirs(destino, exist_ok=True)
            ok, err = voxfmt.mover(wf, os.path.join(destino, f'{int(time.time()*1000)}__{slug}.json'))
            if not ok:
                return self._send(409, {'error': err})
            # La miniatura se cachea POR NOMBRE: si no se borra, reviviría el día que alguien
            # reutilice el nombre y el selector enseñaría la foto de un mundo que ya no existe.
            try: os.remove(os.path.join(BASE, 'data', '_thumbs', slug + '.json'))
            except OSError: pass
            # El registro se va con el mundo, y NO a la papelera: es dato derivado (quién era el
            # dueño, si era público), no autoría. Si se quedase, el día que alguien reutilice el
            # nombre heredaría dueño y permisos de un mapa que ya no existe.
            mundos_meta.olvida(slug)
            # REQ-PLANT1 · y su snippet de ambiente, si el asistente le puso uno. Va a papelera como
            # todo, no se borra. ⚠️ Hace falta hacerlo aquí a propósito: `mundo-` es un PREFIJO
            # PROTEGIDO (`esta_protegido`), así que un `mundo-<slug>` de un mapa que ya no existe no
            # habría manera de quitarlo por API — quedaría para siempre, y encima intentaría
            # ejecutarse el día que alguien reutilizara el nombre del mapa.
            amb = self._snip_path('mundo-' + slug)
            if os.path.exists(amb):
                try:
                    with open(amb, encoding='utf-8') as f:
                        suyo = json.load(f).get('name', '').startswith('Ambiente de ')
                except Exception:
                    suyo = False
                if suyo:                                     # sólo el que escribió el asistente
                    to_trash(amb)
            return self._send(200, {'ok': True, 'borrado': slug, 'papelera': 'data/papelera/mundos/'})
        mf = re.match(r'^/api/fotos/(\d{4,}_[a-z0-9-]+_\d{8}-\d{6})$', urllib.parse.urlparse(self.path).path)
        if mf:
            png = os.path.join(FOTOS, mf.group(1) + '.png')
            if not os.path.exists(png):
                return self._send(404, {'error': 'no existe esa foto'})
            to_trash(png)                                          # a papelera, como todo lo demás
            to_trash(os.path.join(FOTOS, mf.group(1) + '.json'))
            return self._send(200, {'ok': True})
        mv = re.match(r'^/api/videos/(\d{4,}_[a-z0-9-]+_\d{8}-\d{6})$', urllib.parse.urlparse(self.path).path)
        if mv:
            idd = mv.group(1)
            borrado = False
            for ext in ('.mp4', '.webm', '.mov', '.m4v'):
                vfp = os.path.join(VIDEOS, idd + ext)
                if os.path.exists(vfp):
                    to_trash(vfp)
                    borrado = True
            jfp = os.path.join(VIDEOS, idd + '.json')
            if os.path.exists(jfp):
                to_trash(jfp)
            if borrado:
                return self._send(200, {'ok': True})
            return self._send(404, {'error': 'no existe ese vídeo'})
        sid = self._snip_id()
        if sid:
            motivo = esta_protegido(sid)
            if motivo:
                return self._send(409, {'error': motivo + '. Se puede editar y guardar, pero no borrar.',
                                        'protegido': True})
            # La cuarta regla, y la única que no se puede escribir en una lista: QUIÉN LO LLAMA.
            # `buscar_snips(usa=…)` ya distingue la llamada de la simple mención (`game.snippet('x')`
            # frente a la palabra 'x' suelta en un comentario), así que solo frenan las llamadas: una
            # mención no rompe nada al borrarse y frenar por ella haría el aviso inútil de puro ruido.
            if os.path.exists(self._snip_path(sid)):
                llaman = [s for s in buscar_snips(usa=sid) if s.get('tipo') == 'llamada']
                if llaman:
                    quienes = ', '.join(f'«{s["id"]}»:{s.get("linea", "?")}' for s in llaman[:8])
                    return self._send(409, {
                        'error': f'«{sid}» está EN USO: lo llaman {len(llaman)} snippet(s) — {quienes}'
                                 + ('…' if len(llaman) > 8 else '')
                                 + '. Quita la llamada primero, o el juego se romperá al entrar.',
                        'enUso': True,
                        'llamadoPor': [{'id': s['id'], 'name': s.get('name', ''),
                                        'linea': s.get('linea'), 'muestra': s.get('muestra', '')}
                                       for s in llaman]})
                to_trash(self._snip_path(sid)); return self._send(200, {'ok': True})   # a papelera, no borrado real
            return self._send(404, {'error': 'no existe'})
        gid = self._agente_id()
        if gid:
            if os.path.exists(self._agente_path(gid)):
                to_trash(self._agente_path(gid)); return self._send(200, {'ok': True})   # a papelera, no borrado real
            return self._send(404, {'error': 'no existe agente'})
        aid = self._asset_id()
        ap = self._asset_path(aid) if aid else None      # `None` = el id pretendía salirse de `assets/`
        if ap and os.path.exists(ap):
            if self._en_uso_o_409(f'asset:assets/{aid}.vox.json', f'el asset «{aid}»'):
                return
            to_trash(ap)
            idx_path = os.path.join(BASE, 'assets', 'index.json')
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                    idx = [item for item in idx if item.get('id') != aid and item.get('file') != f'assets/{aid}.vox.json']
                    atomic_dump(idx, idx_path)
                except Exception:
                    pass
            return self._send(200, {'ok': True})
        idd = self._id()
        if idd and os.path.exists(self._path(idd)):
            # REQ-ASSET1 · solo se borra lo propio. Que algo sea DEL MUNDO no lo hace de todos: lo
            # comparte su autor y lo descomparte su autor. Un heredado no lo borra nadie por aquí —
            # queda para el dueño del servidor, que ya ha pasado por `_es_dueno()`.
            if not self._es_dueno():
                try:
                    doc = json.load(open(self._path(idd), encoding='utf-8'))
                except Exception:
                    doc = {}
                if not autoria.puede_escribir(doc, self.quien()):
                    return self._send(403, {'error': f'«{idd}» no es tuyo'})
            if self._en_uso_o_409(f'hab:{idd}', f'el habitante «{idd}»'):
                return
            to_trash(self._path(idd)); return self._send(200, {'ok': True})   # a papelera, no borrado real
        return self._send(404, {'error': 'no existe'})

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    tk = get_server_token()
    tk_info = f'  ·  token -> [ACTIVO]' if tk else ''
    modo = '  ·  modo PÚBLICO' if es_publico() else ''
    # ⛔ En público, sin secreto NO se arranca. Con un secreto improvisado en memoria las cookies
    # valdrían igual, pero se caerían en cada reinicio de `server.py` —que son constantes— y, peor,
    # el árbitro del multijugador firma con el MISMO secreto desde otro proceso: dos secretos
    # distintos y los vales de invitación dejan de valer sin que nada lo diga.
    if es_publico() and not (os.environ.get('VOXELFORGE_SECRETO_SESION') or '').strip():
        sys.exit('⛔ modo público sin VOXELFORGE_SECRETO_SESION. Genéralo una vez y guárdalo:\n'
                 '   python3 -c "import secrets;print(secrets.token_urlsafe(32))"')
    sesion.siembra_perfiles()                       # deja los perfiles de partida; no pisa los editados
    # F7.3 · el registro se enciende en público, igual que todo lo demás: en desarrollo la consola es
    # del dueño y un fichero creciendo por debajo sería una sorpresa. `VOXELFORGE_REGISTRO` lo fuerza
    # (lo usa su guardián) y también sirve para llevarlo a otro disco.
    reg = registro.arranca() if (es_publico() or os.environ.get('VOXELFORGE_REGISTRO')) else None
    # ⛔ flush: lanzado con `nohup … > log &` la salida es de bloque, y como `serve_forever()` no
    # vuelve NUNCA, el buffer no se vacía jamás y el log se queda vacío. Justo el saludo que dice en
    # qué modo ha arrancado, que es lo único que se va a mirar ahí.
    print(f'VoxelForge server en http://0.0.0.0:{PORT}  ·  habitantes -> {STORE}{tk_info}{modo}'
          + (f'  ·  registro -> {reg}' if reg else ''), flush=True)
    if es_publico() and not tk:
        # No se aborta —el servidor sigue siendo útil de solo lectura— pero el aviso tiene que doler:
        # sin token, `_es_dueno()` es False para todos y no se puede escribir ni un snippet.
        print('⚠️  modo público SIN token: nadie podrá escribir snippets. Arranca con --token o VOXELFORGE_TOKEN.',
              flush=True)
    Server(('0.0.0.0', PORT), Handler).serve_forever()
