#!/usr/bin/env python3
"""VoxelForge: sirve el sitio estático + API de habitantes (guardar/listar/renombrar/borrar).
   Uso: python3 server.py [puerto]   (por defecto 8500)
   Almacén: data/habitantes/<id>.json  (formato vox export)."""
import http.server, socketserver, json, os, re, sys, datetime, shutil, time, urllib.parse
import gzip, threading
import mundos                                              # listado de /map/: estadísticas + miniatura cenital
import voxfmt                                              # formato de mundo voxelworld-2 (cabecera + .vox denso)

BASE  = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(BASE, 'data', 'habitantes')
TRASH = os.path.join(BASE, 'data', 'habitantes_trash')   # NADA se borra de verdad: va aquí
MAPFILE = os.path.join(BASE, 'data', 'mapa.json')         # mapa del mundo (rejilla de habitaciones)
WORLDFILE = os.path.join(BASE, 'data', 'mundo.json')       # mundo sandbox 3D (REQ-MC) — fichero único "sagrado" (mapa «default»)
WORLDS = os.path.join(BASE, 'data', 'worlds')             # mundos con nombre: /map/<nombre> -> data/worlds/<slug>.json (persistentes)
SNIPS = os.path.join(BASE, 'data', 'snippets')             # gestor de snippets de código (data/snippets/<id>.json)
AGENTS = os.path.join(BASE, 'data', 'agentes')             # agentes articulados (data/agentes/<id>.json) — el documento, no el motor
# Snippets que NO se pueden borrar desde la UI. 'mundo-autoarranque' lo busca app.js POR ESE ID al
# entrar al Mundo (openWorld), así que borrarlo no rompe nada visible al momento: simplemente el
# Mundo deja de tener bloques con comportamiento y no hay ningún error que lo delate. Editarlo y
# guardarlo sí se puede (POST respalda la versión anterior); lo que se bloquea es el DELETE.
SNIPS_PROTEGIDOS = {'mundo-autoarranque'}
os.makedirs(STORE, exist_ok=True)
os.makedirs(TRASH, exist_ok=True)
os.makedirs(WORLDS, exist_ok=True)
os.makedirs(SNIPS, exist_ok=True)
os.makedirs(AGENTS, exist_ok=True)

DEFAULT_MAP = {'cols': 8, 'rows': 8, 'cells': {}}
# Mundo vacío por defecto: sin voxels => el cliente genera terreno plano (mcGenFlat)
DEFAULT_WORLD = {'format': 'voxelworld-1', 'dim': {'x': 96, 'y': 40, 'z': 96}, 'spawn': None, 'voxels': {}}
PORT  = int(sys.argv[1]) if len(sys.argv) > 1 else 8500

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
def world_file_for(name):
    s = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')
    if not s or s == 'default':
        return WORLDFILE
    return os.path.join(WORLDS, s + '.json')

def now_iso():
    return datetime.datetime.now().isoformat(timespec='seconds')

MAX_TRASH_FILES = 30

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
    except Exception as e:
        sys.stderr.write(f"[TRASH CLEAN] Error: {e}\n")

# Copia de seguridad de un fichero a la papelera (con marca de tiempo) — acotada a MAX_TRASH_FILES
def to_trash(fp, move=True):
    if not os.path.exists(fp):
        return
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
                    'lines': (d.get('code', '') or '').count('\n') + 1,
                    'savedAt': d.get('savedAt', ''),
                    'protegido': fn[:-5] in SNIPS_PROTEGIDOS})    # la UI esconde el botón; el DELETE lo corta el servidor
    out.sort(key=lambda s: s.get('savedAt', ''), reverse=True)   # más recientes primero
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

def list_all():
    out = []
    for fn in sorted(os.listdir(STORE)):
        if not fn.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(STORE, fn), encoding='utf-8'))
        except Exception:
            continue
        meta = d.get('meta', {})
        out.append({'id': fn[:-5], 'name': meta.get('name', '(sin nombre)'),
                    'role': meta.get('role', ''), 'type': meta.get('type', 'objeto'),
                    'size': d.get('size', 16), 'count': len(d.get('voxels', {})),
                    'savedAt': d.get('savedAt', '')})
    out.sort(key=lambda h: h.get('savedAt', ''), reverse=True)   # más recientes primero
    return out

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
        super().__init__(*a, directory=BASE, **k)

    def handle_one_request(self):
        self._cuerpo_leido = False
        super().handle_one_request()

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
        pass
    def end_headers(self):
        # Sin esto el navegador cachea app.js/style.css (heurística de SimpleHTTP sin Cache-Control)
        # y los cambios del editor no llegan al recargar. no-cache = revalidar siempre.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        gz = gzip.compress(body, GZ_NIVEL) if len(body) >= GZ_MIN and self._acepta_gzip() else None
        self._send_bytes(code, 'application/json; charset=utf-8', body, gz)
    def _read(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
        self._cuerpo_leido = True
        return json.loads(self.rfile.read(n) or b'{}')
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
    def _agente_id(self):
        m = re.match(r'^/api/agentes/([A-Za-z0-9_-]+)$', self.path)
        return m.group(1) if m else None
    def _agente_path(self, idd):
        return os.path.join(AGENTS, idd + '.json')
    def _asset_id(self):
        m = re.match(r'^/api/assets/([A-Za-z0-9_.-]+)$', self.path)
        if not m:
            return None
        aid = m.group(1)
        if aid.endswith('.vox.json'):
            aid = aid[:-9]
        return aid
    def _asset_path(self, idd):
        return os.path.join(BASE, 'assets', f'{idd}.vox.json')

    def do_GET(self):
        # SPA: /map/<nombre> (elige el mundo por URL) sirve el mismo index.html; el cliente lee el nombre
        # de la ruta y carga /api/mundo?map=<nombre>. Los assets del index van con ruta absoluta (/app.js…).
        path_only = urllib.parse.urlparse(self.path).path
        if path_only == '/assets/index.json':
            idx_path = os.path.join(BASE, 'assets', 'index.json')
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                    valid_idx = []
                    changed = False
                    for item in idx:
                        rel = item.get('file', '')
                        if rel and os.path.exists(os.path.join(BASE, rel)):
                            valid_idx.append(item)
                        else:
                            changed = True
                    if changed:
                        atomic_dump(valid_idx, idx_path)
                    return self._send(200, valid_idx)
                except Exception:
                    pass
        # /map y /map/ (sin nombre) = listado de mundos; /map/<nombre> = la SPA con ese mundo.
        if path_only in ('/map', '/map/'):
            self.path = '/mapas.html'
            return super().do_GET()
        if path_only.startswith('/map/'):
            self.path = '/index.html'
            return super().do_GET()
        if path_only == '/api/mundos':                            # listado de /map/ (cache por mtime en data/_thumbs/)
            try:
                return self._send(200, mundos.listar())
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
        if self.path == '/api/snippets':                         # gestor de snippets: lista
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
            idx_path = os.path.join(BASE, 'assets', 'index.json')
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                    return self._send(200, idx)
                except Exception:
                    pass
            return self._send(200, [])
        aid = self._asset_id()
        if aid:
            fp = self._asset_path(aid)
            if os.path.exists(fp):
                try:
                    return self._send(200, json.load(open(fp, encoding='utf-8')))
                except Exception:
                    pass
            return self._send(404, {'error': 'no existe asset'})
        if self.path == '/api/habitantes':
            return self._send(200, list_all())
        idd = self._id()
        if idd:
            fp = self._path(idd)
            if os.path.exists(fp):
                return self._send(200, json.load(open(fp, encoding='utf-8')))
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

    def do_POST(self):
        if self.path == '/api/mapa':
            d = self._read()
            if not isinstance(d, dict) or 'cells' not in d:      # validación mínima
                return self._send(400, {'error': 'mapa inválido'})
            d.setdefault('cols', 8); d.setdefault('rows', 8)
            to_trash(MAPFILE, move=False)                         # respaldo del mapa anterior (sagrado)
            atomic_dump(d, MAPFILE)
            return self._send(200, {'ok': True})
        ruta_post = urllib.parse.urlparse(self.path).path
        if ruta_post == '/api/mundo/edits':                       # poner/quitar bloques: seek + 2 bytes por celda
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
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict):
                return self._send(400, {'error': 'cabecera inválida'})
            if not voxfmt.guardar_cabecera(wf, d, atomic_dump, to_trash):
                return self._send(409, {'error': 'el mundo no está en voxelworld-2', 'reintenta': 'completo'})
            return self._send(200, {'ok': True})
        if ruta_post == '/api/mundo':                             # mundo sandbox 3D (REQ-MC); ?map=<nombre> elige el mundo
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict) or 'voxels' not in d or 'dim' not in d:   # validación mínima
                return self._send(400, {'error': 'mundo inválido'})
            # De puertas afuera sigue aceptando el doc v1 completo de siempre (sondas, tests, wipeMap,
            # importaciones); por dentro aterriza ya en voxelworld-2.
            if voxfmt.guardar_v1(wf, d, atomic_dump, to_trash) is None:
                return self._send(400, {'error': 'mundo inválido'})
            return self._send(200, {'ok': True})
        if self.path == '/api/snippets':                         # gestor de snippets: crear/guardar
            d = self._read()
            if not isinstance(d, dict) or 'code' not in d:       # validación mínima
                return self._send(400, {'error': 'snippet inválido'})
            sid = d.get('id') or slugify(d.get('name'))          # id estable = del cliente o slug del nombre
            rec = {'id': sid, 'name': d.get('name', '(sin nombre)'), 'code': d.get('code', ''),
                   'savedAt': now_iso()}
            to_trash(self._snip_path(sid), move=False)           # respaldo de la versión anterior
            atomic_dump(rec, self._snip_path(sid))
            return self._send(200, {'id': sid, 'savedAt': rec['savedAt']})
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
            idd = re.sub(r'[^A-Za-z0-9_.-]', '', str(d.get('id') or '')) or slugify(name)
            filename = f'{idd}.vox.json'
            asset_path = os.path.join(BASE, 'assets', filename)
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
                    'file': rel_file
                }
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
            to_trash(self._path(idd), move=False)             # respaldo antes de sobrescribir
            atomic_dump(d, self._path(idd))
            dedup(idd)                                        # consolida otros con el mismo nombre (a papelera)
            return self._send(200, {'id': idd, 'savedAt': d['savedAt']})
        return self._send(404, {'error': 'ruta'})

    def do_PATCH(self):
        aid = self._asset_id()
        if aid and os.path.exists(self._asset_path(aid)):
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
            d = json.load(open(self._asset_path(aid), encoding='utf-8'))
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
            atomic_dump(d, self._asset_path(aid))

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
        sid = self._snip_id()
        if sid:
            if sid in SNIPS_PROTEGIDOS:
                return self._send(409, {'error': f'«{sid}» está protegido: el Mundo lo ejecuta al entrar. '
                                                 'Se puede editar y guardar, pero no borrar.'})
            if os.path.exists(self._snip_path(sid)):
                to_trash(self._snip_path(sid)); return self._send(200, {'ok': True})   # a papelera, no borrado real
            return self._send(404, {'error': 'no existe'})
        gid = self._agente_id()
        if gid:
            if os.path.exists(self._agente_path(gid)):
                to_trash(self._agente_path(gid)); return self._send(200, {'ok': True})   # a papelera, no borrado real
            return self._send(404, {'error': 'no existe agente'})
        aid = self._asset_id()
        if aid and os.path.exists(self._asset_path(aid)):
            to_trash(self._asset_path(aid))
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
            to_trash(self._path(idd)); return self._send(200, {'ok': True})   # a papelera, no borrado real
        return self._send(404, {'error': 'no existe'})

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    print(f'VoxelForge server en http://0.0.0.0:{PORT}  ·  habitantes -> {STORE}')
    Server(('0.0.0.0', PORT), Handler).serve_forever()
