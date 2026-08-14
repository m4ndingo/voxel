#!/usr/bin/env python3
"""Listado de mundos para /map/: estadisticas + miniatura cenital de cada data/worlds/*.json.

Por que vive aparte de server.py: leer los 7 mundos son ~33 MB de JSON, asi que todo el trabajo
esta detras de una cache en disco (data/_thumbs/<slug>.json) invalidada por mtime+tamano del
fichero de mundo. Un listado en frio cuesta ~0,5 s; en caliente, ~0.

La miniatura es una vista cenital sin render 3D: por cada columna (x,z) se coge el voxel mas alto
y se pinta con el color REAL de su material (la media de la cara superior de su textura, resuelta
en color_de_material). El relieve se marca con luz rasante del noroeste — bajar el brillo con la
altura apagaba todos los colores (las setas rojas de «lab» salian grises).
"""
import array, base64, collections, json, os, re, struct, sys, time, zlib

try:                                         # server.py lo importa como paquete: `from servidor import mundos`
    from . import voxfmt                     # voxelworld-2: la rejilla vive en el .vox, no en el .json
except ImportError:                          # ...y a pelo sigue valiendo: `python3 servidor/mundos.py`
    import voxfmt

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la raíz del repo, un nivel arriba
WORLDS = os.path.join(BASE, 'data', 'worlds')
WORLDFILE = os.path.join(BASE, 'data', 'mundo.json')
CACHE = os.path.join(BASE, 'data', '_thumbs')

ESCALA = 2                      # px por voxel: un mundo de 96 sale a 192x192
GRIS = (150, 150, 155)          # material que no se puede resolver (no deberia pasar)
FONDO = (11, 13, 18)            # columna vacia — mismo tono que el fondo de la pagina

# ---------------------------------------------------------------- colores de material

_colores = {}                   # clave de material -> (r,g,b), memorizado en el proceso


def _cargar(ruta):
    try:
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _media_cara_superior(doc):
    """Media de la cara vista desde arriba de un .vox.json (los assets usan Z como altura)."""
    vox = (doc or {}).get('voxels') or {}
    alto, col = {}, {}
    for k, v in vox.items():
        try:
            x, y, z = (int(n) for n in k.split(','))
        except ValueError:
            continue
        if z >= alto.get((x, y), -1):
            alto[(x, y)] = z
            col[(x, y)] = v
    r = g = b = n = 0
    for v in col.values():
        c = _hex(v)
        if c:
            r += c[0]; g += c[1]; b += c[2]; n += 1
    return (round(r / n), round(g / n), round(b / n)) if n else None


def _hex(v):
    if not isinstance(v, str):
        return None
    if v.startswith('*'):        # prefijo de material emisivo
        v = v[1:]
    if re.fullmatch(r'#[0-9a-fA-F]{6}', v):
        return (int(v[1:3], 16), int(v[3:5], 16), int(v[5:7], 16))
    return None


def color_de_material(clave):
    """'tex:asset:assets/roca.vox.json' | 'tex:hab:tejado' | '#rrggbb' -> (r,g,b)."""
    if clave in _colores:
        return _colores[clave]
    c = _hex(clave)
    if c is None and isinstance(clave, str):
        cuerpo = clave[4:] if clave.startswith('tex:') else clave
        if cuerpo.startswith('asset:'):
            rel = cuerpo[6:]
            if not re.fullmatch(r'[A-Za-z0-9_./-]+', rel) or '..' in rel:
                rel = None
            if rel:
                c = _media_cara_superior(_cargar(os.path.join(BASE, rel)))
        elif cuerpo.startswith('hab:'):
            hid = cuerpo[4:]
            if re.fullmatch(r'[A-Za-z0-9_-]+', hid):
                c = _media_cara_superior(_cargar(os.path.join(BASE, 'data', 'habitantes', hid + '.json')))
    _colores[clave] = c or GRIS
    return _colores[clave]


def nombre_material(clave):
    """Nombre corto para las etiquetas de la tarjeta."""
    if not isinstance(clave, str):
        return '?'
    c = clave[4:] if clave.startswith('tex:') else clave
    if c.startswith('asset:'):
        return os.path.basename(c[6:]).replace('.vox.json', '')
    if c.startswith('hab:'):
        return c[4:]
    return c

# ---------------------------------------------------------------- PNG a pelo (sin dependencias)


def _png(w, h, filas):
    raw = b''.join(b'\x00' + bytes(f) for f in filas)

    def trozo(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))

    return (b'\x89PNG\r\n\x1a\n'
            + trozo(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + trozo(b'IDAT', zlib.compress(raw, 9))
            + trozo(b'IEND', b''))

# ---------------------------------------------------------------- un mundo


def _superficie_v1(vox, W, H):
    """Recorre el mapa disperso {"x,y,z": "tex:..."} de voxelworld-1."""
    alto = [[-1] * W for _ in range(H)]      # y del voxel mas alto de cada columna
    mat = [[None] * W for _ in range(H)]     # y su material
    cuenta = collections.Counter()
    ymax = 0
    for k, v in vox.items():
        try:
            x, y, z = (int(n) for n in k.split(','))
        except ValueError:
            continue
        cuenta[v] += 1
        if y > ymax:
            ymax = y
        if 0 <= x < W and 0 <= z < H and y > alto[z][x]:
            alto[z][x] = y
            mat[z][x] = v
    return alto, mat, cuenta, ymax, len(vox)


def _superficie_v2(ruta, cab, W, DY, H):
    """Lo mismo desde la rejilla densa de voxelworld-2 (el .vox hermano del .json).

    Sale mas barato que el camino v1 —que parseaba 290 MB de texto para esto— porque las filas
    vacias se descartan con un memcmp en vez de una por una: fps es 74% aire."""
    datos = voxfmt.leer_rejilla(ruta)
    if datos is None or len(datos) != 2 * W * DY * H:
        return None
    paleta = cab.get('palette') or [None]
    g = array.array('H')
    g.frombytes(datos)
    if sys.byteorder == 'big':
        g.byteswap()
    ceros = bytes(2 * W)

    alto = [[-1] * W for _ in range(H)]
    mat = [[None] * W for _ in range(H)]
    cuenta = collections.Counter()
    ymax = nvox = 0
    for z in range(H):
        fz, mz = alto[z], mat[z]
        for y in range(DY):                  # ascendente: la ultima que escribe es la mas alta
            base = y * W + z * W * DY
            fila = g[base:base + W]
            if fila.tobytes() == ceros:
                continue
            for x in range(W):
                pid = fila[x]
                if not pid:
                    continue
                clave = paleta[pid] if pid < len(paleta) else None
                if not clave:
                    continue
                v = 'tex:' + clave           # color_de_material/nombre_material esperan el valor v1
                cuenta[v] += 1
                nvox += 1
                fz[x] = y
                mz[x] = v
                if y > ymax:
                    ymax = y
    return alto, mat, cuenta, ymax, nvox


def _analizar(mundo, nombre, archivo, mb, mtime, ruta=None):
    dim = mundo.get('dim') or {'x': 96, 'y': 40, 'z': 96}
    W, H = int(dim.get('x', 96)), int(dim.get('z', 96))
    DY = int(dim.get('y', 40))

    sup = None
    if voxfmt.es_v2(mundo) and ruta:
        sup = _superficie_v2(ruta, mundo, W, DY, H)
    if sup is None:                          # v1, o un .vox que no cuadra: se mira el mapa disperso
        sup = _superficie_v1(mundo.get('voxels') or {}, W, H)
    alto, mat, cuenta, ymax, nvox = sup

    tope = max((max(f) for f in alto), default=0) or 1
    filas, columnas = [], 0
    for z in range(H):
        fila = bytearray()
        for x in range(W):
            y = alto[z][x]
            if y < 0:
                r, g, b = FONDO
            else:
                columnas += 1
                r, g, b = color_de_material(mat[z][x])
                # Luz rasante del noroeste: solo el DESNIVEL con el vecino, acotado, para que se
                # lean las siluetas sin lavar el color.
                vecino = alto[z - 1][x - 1] if z > 0 and x > 0 else y
                d = max(-6, min(6, y - (vecino if vecino >= 0 else y)))
                f = (1.0 + d * 0.045) * (0.95 + 0.10 * (y / tope))   # pizca de altitud, muy suave
                r = min(255, max(0, round(r * f)))
                g = min(255, max(0, round(g * f)))
                b = min(255, max(0, round(b * f)))
            fila += bytes((r, g, b)) * ESCALA
        for _ in range(ESCALA):
            filas.append(fila)

    ests = mundo.get('structures') or []
    return {
        'nombre': nombre,
        'archivo': archivo,
        'dim': f"{W}x{int(dim.get('y', 40))}x{H}",
        'voxels': nvox,
        'estructuras': len(ests),
        'tiposEstructura': len({s.get('key') for s in ests if isinstance(s, dict)}),
        'notas': len(mundo.get('notes') or {}),
        'materiales': len(cuenta),
        'mb': round(mb, 1),
        'ymax': ymax,
        'relleno': round(100 * columnas / max(1, W * H)),
        'spawn': mundo.get('spawn'),
        'top': [nombre_material(k) for k, _ in cuenta.most_common(4)],
        'mtime': mtime,
        'thumb': 'data:image/png;base64,' + base64.b64encode(_png(W * ESCALA, H * ESCALA, filas)).decode(),
    }

# ---------------------------------------------------------------- cache + listado


def _de_cache(ruta, nombre, archivo):
    st = os.stat(ruta)
    # En voxelworld-2 el .json es de kilobytes y los bloques estan en el .vox hermano: el sello y el
    # tamano tienen que mirar los DOS, o poner un bloque no invalidaria la miniatura.
    try:
        sv = os.stat(voxfmt.vox_path(ruta))
        sello = f'{int(st.st_mtime)}:{st.st_size}:{int(sv.st_mtime)}:{sv.st_size}'
        tam = st.st_size + sv.st_size
    except OSError:
        sello = f'{int(st.st_mtime)}:{st.st_size}'
        tam = st.st_size
    fp = os.path.join(CACHE, (nombre or 'default') + '.json')
    guardado = _cargar(fp)
    if guardado and guardado.get('sello') == sello:
        return guardado['fila']
    mundo = _cargar(ruta)
    if not isinstance(mundo, dict):
        return None
    fila = _analizar(mundo, nombre, archivo, tam / 1048576,
                     time.strftime('%Y-%m-%dT%H:%M', time.localtime(st.st_mtime)), ruta)
    try:
        os.makedirs(CACHE, exist_ok=True)
        tmp = f'{fp}.tmp.{os.getpid()}'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'sello': sello, 'fila': fila}, f)
        os.replace(tmp, fp)
    except OSError:
        pass                     # la cache es un lujo: si no se puede escribir, se recalcula
    return fila


def listar():
    """[{nombre, dim, voxels, ..., thumb}] ordenado por fecha de modificacion (lo mas reciente primero)."""
    fuentes = []
    if os.path.exists(WORLDFILE):
        fuentes.append((WORLDFILE, 'default', 'mundo.json'))
    if os.path.isdir(WORLDS):
        for f in sorted(os.listdir(WORLDS)):
            if f.endswith('.json'):
                fuentes.append((os.path.join(WORLDS, f), f[:-5], f))
    filas = []
    for ruta, nombre, archivo in fuentes:
        try:
            fila = _de_cache(ruta, nombre, archivo)
        except Exception:
            fila = None          # un mundo corrupto no debe tumbar el listado entero
        if fila:
            filas.append(fila)
    filas.sort(key=lambda r: r['mtime'], reverse=True)
    return filas


if __name__ == '__main__':
    t0 = time.time()
    for r in listar():
        print(f"{r['nombre']:10} {r['dim']:12} {r['voxels']:>7} vox  {r['mb']:>5} MB  "
              f"{len(r['thumb']) // 1024:>3} KB png  {','.join(r['top'])}")
    print(f'-- {time.time() - t0:.2f} s')
