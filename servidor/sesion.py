#!/usr/bin/env python3
"""Quién es quién: cuentas, perfiles, permisos y la cookie que los transporta.

Hasta ahora `server.py` no tenía ninguna noción de identidad: el único control era el token del
dueño, y sólo lo miraba `POST /api/namespace`. Esto es la pieza que falta para abrir el juego a
gente de fuera, y vive aparte por el mismo motivo que `mundos.py` y `voxfmt.py`: para que se pueda
leer, probar y razonar sin abrir las 1 700 líneas del servidor.

Tres decisiones que explican todo lo demás:

1. **La sesión no se guarda en ninguna parte.** La cookie es `uid.gen.caduca.hmac`, firmada con
   `VOXELFORGE_SECRETO_SESION`. Sin tabla de sesiones no hay estado que se pierda al reiniciar
   `server.py` —que se reinicia constantemente— ni que sincronizar con el árbitro del multijugador,
   que necesita validar lo mismo desde otro proceso. Revocar todas las sesiones de alguien es subir
   su `gen`; no hace falta borrar nada.

2. **Los perfiles son DATOS, no código.** Viven en `data/perfiles/<nombre>.json` porque el dueño
   pidió poder configurar «los niveles de usuario y qué puede hacer cada uno» desde un panel. Si los
   perfiles fueran un `if` en Python, el panel no podría existir. Lo único fijo es el VOCABULARIO
   (`PERMISOS`): la lista de qué cosas se pueden pedir permiso para hacer.

3. **El permiso efectivo se ajusta también cuenta por cuenta**: `perfil + permisos_mas −
   permisos_menos`. También lo pidió el dueño, y es lo que permite «esta cuenta concreta sí puede
   crear snippets propios» sin inventar un perfil para una persona.

⚠️ Este módulo NO decide nada por su cuenta: sólo responde «¿tiene este usuario este permiso?».
Quien prohíbe es `server.py`, en la cabecera de cada rama de escritura. El navegador y el árbitro
del multijugador esconden cosas, pero esconder no es prohibir.
"""
import base64, hashlib, hmac, json, os, re, time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la raíz del repo, un nivel arriba

# Se pueden mudar por entorno, y hace falta: el guardián de permisos da de alta cuentas de verdad
# para probar la matriz, y esas cuentas NO pueden acabar mezcladas con las de personas en
# `data/usuarios/`. El test apunta las dos variables a un directorio temporal y lo borra al acabar.
USUARIOS = os.environ.get('VOXELFORGE_USUARIOS') or os.path.join(BASE, 'data', 'usuarios')
PERFILES = os.environ.get('VOXELFORGE_PERFILES') or os.path.join(BASE, 'data', 'perfiles')

COOKIE = 'vf_sid'
DIAS = 30                       # lo que dura una sesión sin volver a entrar
SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)   # ~16 MB y ~50 ms por intento: caro de probar a lo bruto


# ── El vocabulario ──────────────────────────────────────────────────────────────────────────────
# Esto SÍ es código, y a propósito: es el contrato entre `server.py` (que exige) y el panel del dueño
# (que ofrece las casillas). Un permiso que no esté aquí no existe; un perfil que lo mencione lo verá
# rechazado al guardarse, para que un typo no abra una puerta ni cierre otra en silencio.
PERMISOS = (
    'mundo.crear',            # hacerse un mapa nuevo (con cuota)
    'mundo.editar_propio',    # construir en los suyos
    'mundo.editar_ajeno',     # y en los de otros — esto es de moderación, no de juego
    'mundo.borrar_propio',
    'mundo.publicar',         # cambiar la visibilidad de los suyos a «público»
    'snippet.crear_propio',   # ⚠️ nace APAGADO para todos: ver docs/codigo-de-usuario.md (F-E)
    'snippet.editar_sistema', # tocar los snippets que hacen funcionar el juego: sólo el dueño
    'asset.subir',
    'asset.borrar',
    'habitante.guardar',
    'agente.editar',
    'foto.subir',
    'multi.entrar',           # conectarse al árbitro y jugar acompañado
    'multi.invitar',
    'panel.usar',
    'panel.perfiles',         # crear y editar perfiles: el permiso que reparte permisos
)

# ── ⛔ CANDADO F-E · el código de usuario sigue sin decidirse ────────────────────────────────────
# `docs/codigo-de-usuario.md` cierra con una recomendación: **no conceder `snippet.crear_propio` a
# nadie** hasta resolver el invariante del dueño («su cuenta no la puede robar un jugador que lance
# un snippet»). Un snippet corre con `AsyncFunction` en NUESTRO MISMO ORIGEN, así que puede hacer
# `fetch('/api/…')` y el navegador le adjunta solo la galleta de quien esté mirando: si un jugador
# publicase código y el dueño entrase a su mapa, ese código actuaría COMO EL DUEÑO.
#
# Esto no se deja como costumbre a recordar, porque las costumbres se incumplen (es la misma
# objeción que hunde la opción C en el estudio). Lo hace cumplir `servidor/panel.py`: mientras esto
# valga False, el panel RECHAZA dar `snippet.crear_propio` a un perfil que no sea `dueno` o a los
# `permisos_mas` de una cuenta. El dueño lo conserva porque el agujero no es que él tenga el
# permiso, sino que lo tenga OTRO cuyo código él vaya a ejecutar.
#
# Se pone en True el día que se implemente una de las salidas del estudio (A: origen distinto para
# el código ajeno · B recortado: que `vf_disena` no valga para las escrituras peligrosas · D: lista
# cerrada en vez de JS). ⚠️ Cambiar esta línea SIN implementar ninguna es abrir el agujero: la
# firma del commit que la toque tiene que decir cuál.
FE_CODIGO_DE_USUARIO_DECIDIDO = False
FE_PERMISO_BAJO_CANDADO = 'snippet.crear_propio'

# Los perfiles de partida. Se escriben a disco la primera vez y a partir de ahí mandan los ficheros:
# si el dueño edita `jugador` desde el panel, esto NO se lo vuelve a pisar.
#
# ⚠️ `cuarentena` es donde nace todo el mundo, porque el registro es abierto: puede entrar, jugar y
# hablar, y nada más. Es la respuesta a «cualquiera se registra» sin que «cualquiera» pueda escribir
# en el disco del servidor el primer minuto.
PERFILES_SEMILLA = {
    'cuarentena': {
        'descripcion': 'Recién registrado: puede jugar y hablar, nada más. El dueño lo sube de nivel.',
        'permisos': ['multi.entrar'],
    },
    'jugador': {
        'descripcion': 'Se hace sus mapas, invita, guarda habitantes y sube fotos.',
        'permisos': ['multi.entrar', 'multi.invitar', 'mundo.crear', 'mundo.editar_propio',
                     'mundo.borrar_propio', 'mundo.publicar', 'habitante.guardar', 'foto.subir'],
    },
    'constructor': {
        'descripcion': 'Un jugador que además sube piezas propias y edita agentes.',
        'permisos': ['multi.entrar', 'multi.invitar', 'mundo.crear', 'mundo.editar_propio',
                     'mundo.borrar_propio', 'mundo.publicar', 'habitante.guardar', 'foto.subir',
                     'asset.subir', 'asset.borrar', 'agente.editar'],
    },
    'moderador': {
        'descripcion': 'Entra en los mapas de otros y ve el panel, pero no reparte permisos.',
        'permisos': ['multi.entrar', 'multi.invitar', 'mundo.crear', 'mundo.editar_propio',
                     'mundo.editar_ajeno', 'mundo.borrar_propio', 'mundo.publicar',
                     'habitante.guardar', 'foto.subir', 'asset.subir', 'asset.borrar',
                     'agente.editar', 'panel.usar'],
    },
    'dueno': {
        'descripcion': 'Todo. Es la cuenta del dueño del servidor.',
        'permisos': list(PERMISOS),
    },
}

# `mapa_lado` (REQ-PLANT1) es el lado MÁXIMO de mundo que esta cuenta puede pedir al crearlo. Está en
# la cuota y no en una constante porque el dueño lo quiso ajustable: «128, pero que a nivel de
# administracion pueda elegir el limite tambien desde perfiles». Los números que hay detrás: 128³ pesa
# 1,3 MB y 512³ son 21 MB, así que con los 100 MB de cuota cuatro mapas grandes llenan a un usuario.
CUOTA_POR_DEFECTO = {'mapas': 5, 'bytes': 100 * 1024 * 1024, 'habitantes': 50, 'fotos': 200,
                     'mapa_lado': 128}


# ── Escritura ───────────────────────────────────────────────────────────────────────────────────

def _guarda(d, ruta):
    """Temporal en el mismo directorio + `os.replace`, como todo lo que escribe este repo.

    El servidor es multihilo: dos `open('w')` a la vez sobre la misma cuenta la dejan a medias, y una
    cuenta a medias es una cuenta que no puede entrar.
    """
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = f'{ruta}.tmp.{os.getpid()}.{time.time_ns()}'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp, ruta)
    finally:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except OSError: pass


def _lee(ruta):
    try:
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ── El secreto ──────────────────────────────────────────────────────────────────────────────────

def secreto():
    """La llave con la que se firman cookies y vales de invitación.

    ⚠️ En modo público es OBLIGATORIA y el proceso no debe arrancar sin ella (lo comprueba
    `server.py`): sin secreto no hay firma, y sin firma cualquiera se pone `uid=dueno` en la cookie.
    En desarrollo se deja improvisar uno en memoria, que dura lo que dure el proceso — reiniciar
    echa a todo el mundo, que en la máquina de uno es exactamente lo que se quiere.
    """
    s = os.environ.get('VOXELFORGE_SECRETO_SESION')
    if s and s.strip():
        return s.strip()
    global _SECRETO_VOLATIL
    if _SECRETO_VOLATIL is None:
        _SECRETO_VOLATIL = base64.b64encode(os.urandom(32)).decode('ascii')
    return _SECRETO_VOLATIL

_SECRETO_VOLATIL = None


def _firma(mensaje):
    return hmac.new(secreto().encode('utf-8'), mensaje.encode('utf-8'), hashlib.sha256).hexdigest()[:32]


# ── La cookie ───────────────────────────────────────────────────────────────────────────────────

def emite(uid, gen, dias=DIAS):
    """`uid.gen.caduca.firma`. Todo lo que hace falta para reconocer a alguien, sin guardar nada."""
    caduca = int(time.time()) + dias * 86400
    cuerpo = f'{uid}.{gen}.{caduca}'
    return f'{cuerpo}.{_firma(cuerpo)}'


def abre(valor):
    """El uid que hay dentro de una cookie válida, o None. None significa «anónimo», nunca «error».

    Se comprueban las tres cosas por separado y en este orden: que la firma es nuestra, que no ha
    caducado, y que la `gen` sigue siendo la de la cuenta. La última es la que permite echar a
    alguien de todas partes sin tener una lista de sesiones que revocar.
    """
    partes = str(valor or '').split('.')
    if len(partes) != 4:
        return None
    uid, gen, caduca, firma = partes
    if not hmac.compare_digest(firma, _firma(f'{uid}.{gen}.{caduca}')):
        return None
    try:
        if int(caduca) < time.time():
            return None
    except ValueError:
        return None
    u = carga(uid)
    if not u or str(u.get('gen', 0)) != gen:
        return None
    return uid


# ── Cuentas ─────────────────────────────────────────────────────────────────────────────────────

def uid_de(nombre):
    """El nombre visible mandado a minúsculas y sin nada raro. Es también el nombre del fichero.

    ⚠️ Sin puntos: la cookie se parte por puntos, y un uid con punto la rompería de una forma que no
    falla a gritos — se leería otro usuario.
    """
    return re.sub(r'[^a-z0-9_-]+', '-', str(nombre or '').lower()).strip('-')[:32]


def ruta(uid):
    return os.path.join(USUARIOS, uid + '.json')


def carga(uid):
    if not uid or uid != uid_de(uid):
        return None
    return _lee(ruta(uid))


def existe(uid):
    return os.path.exists(ruta(uid))


def _amasa(clave, sal):
    return hashlib.scrypt(str(clave).encode('utf-8'), salt=bytes.fromhex(sal), **SCRYPT).hex()


def crea(nombre, clave, perfil='cuarentena'):
    """Alta. Devuelve (usuario, None) o (None, motivo)."""
    uid = uid_de(nombre)
    if len(uid) < 3:
        return None, 'el nombre necesita al menos 3 letras o números'
    if len(str(clave or '')) < 8:
        return None, 'la contraseña necesita al menos 8 caracteres'
    if existe(uid):
        return None, 'ese nombre ya está cogido'
    sal = os.urandom(16).hex()
    u = {
        'uid': uid,
        'nombre': str(nombre).strip()[:48],
        'creado': int(time.time()),
        'perfil': perfil,
        'permisos_mas': [],
        'permisos_menos': [],
        'sal': sal,
        'hash': _amasa(clave, sal),
        'gen': 1,
        'cuota': dict(CUOTA_POR_DEFECTO),
    }
    _guarda(u, ruta(uid))
    return u, None


def comprueba(uid, clave):
    """El usuario si la contraseña es la suya, None si no.

    `compare_digest` y no `==`: comparar hashes con `==` se para en el primer byte distinto y filtra,
    byte a byte, cuánto has acertado. Aquí cuesta lo mismo hacerlo bien.
    """
    u = carga(uid)
    if not u or not u.get('sal') or not u.get('hash'):
        return None
    return u if hmac.compare_digest(u['hash'], _amasa(clave, u['sal'])) else None


def cambia_clave(u, clave):
    u['sal'] = os.urandom(16).hex()
    u['hash'] = _amasa(clave, u['sal'])
    u['gen'] = int(u.get('gen', 1)) + 1        # cambiar la contraseña echa a las sesiones viejas
    _guarda(u, ruta(u['uid']))
    return u


def guarda(u):
    _guarda(u, ruta(u['uid']))
    return u


def todos():
    if not os.path.isdir(USUARIOS):
        return []
    out = []
    for fn in sorted(os.listdir(USUARIOS)):
        if fn.endswith('.json'):
            u = _lee(os.path.join(USUARIOS, fn))
            if u:
                out.append(u)
    return out


# ── Perfiles y permisos ─────────────────────────────────────────────────────────────────────────

def siembra_perfiles():
    """Escribe los perfiles que falten. Idempotente: NO pisa los que el dueño ya haya tocado."""
    for nombre, d in PERFILES_SEMILLA.items():
        fp = os.path.join(PERFILES, nombre + '.json')
        if not os.path.exists(fp):
            _guarda({'nombre': nombre, 'descripcion': d['descripcion'],
                     'permisos': list(d['permisos'])}, fp)


def perfil(nombre):
    d = _lee(os.path.join(PERFILES, str(nombre or '') + '.json'))
    if d:
        return d
    s = PERFILES_SEMILLA.get(nombre)             # respaldo si el fichero se borró: mejor esto que nada
    return {'nombre': nombre, 'descripcion': (s or {}).get('descripcion', ''),
            'permisos': list((s or {}).get('permisos', []))}


def perfiles():
    siembra_perfiles()
    if not os.path.isdir(PERFILES):
        return []
    return [_lee(os.path.join(PERFILES, fn)) for fn in sorted(os.listdir(PERFILES))
            if fn.endswith('.json')]


def permisos_de(u):
    """El conjunto efectivo: perfil + permisos_mas − permisos_menos.

    `permisos_menos` gana a `permisos_mas` a propósito. Quitar tiene que ser más fuerte que dar: si
    alguna vez las dos listas se contradicen, lo seguro es que no pueda.
    """
    if not u:
        return set()
    p = set(perfil(u.get('perfil')).get('permisos') or [])
    p |= set(u.get('permisos_mas') or [])
    p -= set(u.get('permisos_menos') or [])
    return p & set(PERMISOS)                     # lo que no esté en el vocabulario no cuenta


def puede(u, permiso):
    return permiso in permisos_de(u)


def publico(u):
    """Lo que se le puede contar al navegador de una cuenta. ⛔ Nunca `sal` ni `hash`."""
    if not u:
        return None
    return {'uid': u.get('uid'), 'nombre': u.get('nombre'), 'perfil': u.get('perfil'),
            'permisos': sorted(permisos_de(u)), 'cuota': u.get('cuota') or dict(CUOTA_POR_DEFECTO),
            'creado': u.get('creado')}
