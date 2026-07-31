#!/usr/bin/env python3
"""VoxelForge: sirve el sitio estático + API de habitantes (guardar/listar/renombrar/borrar).
   Uso: python3 server.py [puerto]   (por defecto 8500)
   Almacén: data/habitantes/<id>.json  (formato vox export)."""
import http.server, socketserver, json, os, re, sys, datetime, shutil, time, urllib.parse
import mundos                                              # listado de /map/: estadísticas + miniatura cenital

BASE  = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(BASE, 'data', 'habitantes')
TRASH = os.path.join(BASE, 'data', 'habitantes_trash')   # NADA se borra de verdad: va aquí
MAPFILE = os.path.join(BASE, 'data', 'mapa.json')         # mapa del mundo (rejilla de habitaciones)
WORLDFILE = os.path.join(BASE, 'data', 'mundo.json')       # mundo sandbox 3D (REQ-MC) — fichero único "sagrado" (mapa «default»)
WORLDS = os.path.join(BASE, 'data', 'worlds')             # mundos con nombre: /map/<nombre> -> data/worlds/<slug>.json (persistentes)
SNIPS = os.path.join(BASE, 'data', 'snippets')             # gestor de snippets de código (data/snippets/<id>.json)
# Snippets que NO se pueden borrar desde la UI. 'mundo-autoarranque' lo busca app.js POR ESE ID al
# entrar al Mundo (openWorld), así que borrarlo no rompe nada visible al momento: simplemente el
# Mundo deja de tener bloques con comportamiento y no hay ningún error que lo delate. Editarlo y
# guardarlo sí se puede (POST respalda la versión anterior); lo que se bloquea es el DELETE.
SNIPS_PROTEGIDOS = {'mundo-autoarranque'}
os.makedirs(STORE, exist_ok=True)
os.makedirs(TRASH, exist_ok=True)
os.makedirs(WORLDS, exist_ok=True)
os.makedirs(SNIPS, exist_ok=True)

DEFAULT_MAP = {'cols': 8, 'rows': 8, 'cells': {}}
# Mundo vacío por defecto: sin voxels => el cliente genera terreno plano (mcGenFlat)
DEFAULT_WORLD = {'format': 'voxelworld-1', 'dim': {'x': 96, 'y': 40, 'z': 96}, 'spawn': None, 'voxels': {}}
PORT  = int(sys.argv[1]) if len(sys.argv) > 1 else 8500

def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', (s or 'objeto').lower()).strip('-')
    return s or 'objeto'

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

# Elimina (a papelera) otros ficheros cuyo nombre coincide (mismo slug) => sin duplicados por nombre
def dedup(idd):
    for fn in os.listdir(STORE):
        if not fn.endswith('.json') or fn[:-5] == idd:
            continue
        try:
            m = json.load(open(os.path.join(STORE, fn), encoding='utf-8')).get('meta', {})
        except Exception:
            continue
        if slugify(m.get('name')) == idd:
            to_trash(os.path.join(STORE, fn))

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

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=BASE, **k)
    def log_message(self, *a):
        pass
    def end_headers(self):
        # Sin esto el navegador cachea app.js/style.css (heurística de SimpleHTTP sin Cache-Control)
        # y los cambios del editor no llegan al recargar. no-cache = revalidar siempre.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def _read(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
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
        if path_only == '/api/mundo':                             # mundo sandbox 3D (REQ-MC); ?map=<nombre> elige el mundo
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            if os.path.exists(wf):
                try:
                    return self._send(200, json.load(open(wf, encoding='utf-8')))
                except Exception:
                    pass
            return self._send(200, {**DEFAULT_WORLD, 'fresh': True})   # sin fichero = mundo recién nacido → terreno plano (un vacío guardado NO lleva fresh)
        if self.path == '/api/snippets':                         # gestor de snippets: lista
            return self._send(200, list_snips())
        sid = self._snip_id()
        if sid:
            fp = self._snip_path(sid)
            if os.path.exists(fp):
                return self._send(200, json.load(open(fp, encoding='utf-8')))
            return self._send(404, {'error': 'no existe'})
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
        if urllib.parse.urlparse(self.path).path == '/api/mundo':  # mundo sandbox 3D (REQ-MC); ?map=<nombre> elige el mundo
            wf = world_file_for(urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('map', [''])[0])
            d = self._read()
            if not isinstance(d, dict) or 'voxels' not in d or 'dim' not in d:   # validación mínima
                return self._send(400, {'error': 'mundo inválido'})
            to_trash(wf, move=False)                              # respaldo del mundo anterior (a la papelera, nunca se pierde)
            atomic_dump(d, wf)
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
        if self.path == '/api/assets':
            d = self._read()
            if not isinstance(d, dict) or 'voxels' not in d:
                return self._send(400, {'error': 'asset inválido'})
            meta = d.get('meta', {})
            name = meta.get('name') or d.get('name') or 'asset'
            idd = slugify(name)
            filename = f'{idd}.vox.json'
            asset_path = os.path.join(BASE, 'assets', filename)
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
                    found = True
                    break

            if not found:
                idx.append({
                    'id': idd,
                    'name': meta.get('name', idd),
                    'role': meta.get('role', f'Bloque · {idd}'),
                    'icon': meta.get('icon', '🧱'),
                    'type': meta.get('type', 'textura'),
                    'group': meta.get('group', 'Bloques de construcción'),
                    'size': d.get('size', 16),
                    'file': rel_file
                })

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
            if not name:
                return self._send(400, {'error': 'falta el nombre'})
            # Renombrar un asset cambia SOLO el rotulo: el id y el fichero se quedan. Los voxels del
            # mundo guardan la clave del material como 'asset:assets/<fichero>.vox.json', asi que mover
            # el fichero (como si hace el rename de habitantes) dejaria sin textura cada bloque pintado
            # con el en cada mundo. El nombre es de la vitrina; el fichero es la identidad.
            d = json.load(open(self._asset_path(aid), encoding='utf-8'))
            d.setdefault('meta', {})['name'] = name
            atomic_dump(d, self._asset_path(aid))
            idx_path = os.path.join(BASE, 'assets', 'index.json')
            if os.path.exists(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                    for item in idx:
                        if item.get('id') == aid or item.get('file') == f'assets/{aid}.vox.json':
                            item['name'] = name
                    atomic_dump(idx, idx_path)
                except Exception:
                    pass
            return self._send(200, {'ok': True, 'id': aid, 'name': name})
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
