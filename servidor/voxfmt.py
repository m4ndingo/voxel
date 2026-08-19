"""voxfmt.py — formato de mundo «voxelworld-2»: cabecera JSON pequena + rejilla densa aparte.

v1 guardaba la rejilla como un diccionario JSON {"x,y,z": "tex:asset:..."}. En un mundo de
512x40x512 eso son 5,5 M de claves y 290 MB de texto, y el precio se pagaba en cada bloque puesto:
el navegador se congelaba 18,5 s (5,5 s serializando + 13 s en JSON.stringify), mandaba un POST de
257 MB, y el servidor copiaba 276 MB a la papelera antes de reescribir el fichero entero. Medido,
no supuesto. De ahi los 3,3 GB de data/habitantes_trash: eran 30 bloques puestos.

v2 parte el mundo en dos ficheros hermanos:

    <mundo>.json    {format, dim, spawn, palette, structures, notes, noteRots, noteTints} ~40 KB
    <mundo>.vox     dim.x*dim.y*dim.z uint16 little-endian, sin cabecera       21 MB

El indice del .vox es EXACTAMENTE mcIdx del cliente (app.js): idx = x + y*dim.x + z*dim.x*dim.y.
Que sea el mismo layout es lo que permite las dos cosas que arreglan la queja: cargar es volcar
bytes en la rejilla (un Uint16Array, sin JSON.parse) y poner un bloque es un seek + 2 bytes.

`palette[0]` es siempre None (= aire). El resto son CLAVES de material ('asset:assets/roca.vox.json',
'hab:tejado'), NUNCA ids del cliente: mc.blockKey se reconstruye en cada arranque y sus ids no son
estables entre sesiones. Cliente y servidor se hablan siempre por clave.

Las estructuras NO estan en el .vox. Lo que tiene forma vive en mc.structures (1/16 de grosor) y
viaja en la cabecera; mirar solo el .vox es ver medio mundo.
"""

import array
import gzip
import json
import os
import sys
import threading
import time

FORMATO = 'voxelworld-2'
MAX_PALETA = 65535          # el .vox es uint16 y el 0 es el aire

# El .vox se escribe EN SITIO (seek + write), no con el atomic_write de la casa. Es a proposito y es
# justo el punto: reescribir 21 MB de forma atomica por cada bloque puesto es el problema que venimos
# a quitar. A cambio, todas las escrituras pasan por este cerrojo por ruta (el servidor es
# ThreadingMixIn) y la cabecera —que si es pequena— sigue yendo por atomic_dump.
_cerrojos = {}
_cerrojos_lock = threading.Lock()

# Respaldo del .vox: uno por sesion, no uno por bloque (decision del dueno). Como el servidor no ve
# sesiones de navegador, se aproxima por hueco de inactividad: la primera escritura tras RESPALDO_GAP
# sin tocar ese mundo se lleva una copia a la papelera.
RESPALDO_GAP = 1800.0       # segundos
_ultimo_toque = {}


def _cerrojo(ruta):
    with _cerrojos_lock:
        c = _cerrojos.get(ruta)
        if c is None:
            c = _cerrojos[ruta] = threading.Lock()
        return c


def vox_path(wf):
    """Fichero hermano del .json del mundo: data/worlds/fps.json -> data/worlds/fps.vox."""
    return (wf[:-5] if wf.endswith('.json') else wf) + '.vox'


def es_v2(doc):
    return isinstance(doc, dict) and doc.get('format') == FORMATO


def _dims(doc):
    d = (doc or {}).get('dim') or {}
    x, y, z = int(d.get('x') or 0), int(d.get('y') or 0), int(d.get('z') or 0)
    if x <= 0 or y <= 0 or z <= 0 or x * y * z > 80_000_000:      # ~160 MB de .vox, tope de cordura
        return None
    return x, y, z


def _rejilla_vacia(n):
    g = array.array('H', bytes(2 * n))
    return g


def _a_bytes_le(g):
    """array('H') es nativo; el fichero es little-endian por contrato (lo lee un Uint16Array)."""
    if sys.byteorder == 'big':
        g = array.array('H', g)
        g.byteswap()
    return g.tobytes()


def _de_bytes_le(datos):
    g = array.array('H')
    g.frombytes(datos)
    if sys.byteorder == 'big':
        g.byteswap()
    return g


# ------------------------------------------------------------------ conversion v1 -> v2

def desde_v1(doc):
    """Doc v1 completo -> (cabecera v2, bytes del .vox). None si el doc no es utilizable."""
    dims = _dims(doc)
    if not dims:
        return None
    dx, dy, dz = dims
    g = _rejilla_vacia(dx * dy * dz)

    paleta = [None]
    clave2id = {}
    for k, v in (doc.get('voxels') or {}).items():
        if not isinstance(v, str):
            continue
        clave = v[4:] if v.startswith('tex:') else v
        if not clave:
            continue
        try:
            x, y, z = (int(n) for n in k.split(','))
        except ValueError:
            continue
        if not (0 <= x < dx and 0 <= y < dy and 0 <= z < dz):
            continue
        pid = clave2id.get(clave)
        if pid is None:
            if len(paleta) > MAX_PALETA:
                continue                      # 65k materiales distintos no pasa; si pasara, se ignora
            pid = clave2id[clave] = len(paleta)
            paleta.append(clave)
        g[x + y * dx + z * dx * dy] = pid

    cab = {
        'format': FORMATO,
        'dim': {'x': dx, 'y': dy, 'z': dz},
        'spawn': doc.get('spawn'),
        'palette': paleta,
        'structures': doc.get('structures') or [],
        'notes': doc.get('notes') or {},
        'noteRots': doc.get('noteRots') or {},
        'noteTints': doc.get('noteTints') or {},
    }
    return cab, _a_bytes_le(g)


def a_doc_v1(wf, cab=None):
    """Reconstruye el doc v1 completo (con `voxels`). CARO: solo para compatibilidad y tests."""
    cab = cab if cab is not None else leer_cabecera(wf)
    dims = _dims(cab)
    datos = leer_rejilla(wf)
    if not dims or datos is None:
        return None
    dx, dy, dz = dims
    paleta = cab.get('palette') or [None]
    g = _de_bytes_le(datos)
    vox = {}
    for z in range(dz):
        for y in range(dy):
            base = y * dx + z * dx * dy
            fila = g[base:base + dx]
            if not max(fila):
                continue
            for x in range(dx):
                pid = fila[x]
                if pid and pid < len(paleta) and paleta[pid]:
                    vox[f'{x},{y},{z}'] = 'tex:' + paleta[pid]
    return {
        'format': 'voxelworld-1',
        'dim': dict(cab.get('dim') or {}),
        'spawn': cab.get('spawn'),
        'voxels': vox,
        'structures': cab.get('structures') or [],
        'notes': cab.get('notes') or {},
        'noteRots': cab.get('noteRots') or {},
        'noteTints': cab.get('noteTints') or {},
    }


# ------------------------------------------------------------------ lectura

def leer_cabecera(wf):
    try:
        with open(wf, encoding='utf-8') as f:
            d = json.load(f)
    except Exception:
        return None
    return d if isinstance(d, dict) else None


def leer_rejilla(wf):
    """Bytes crudos del .vox, o None si no esta o no cuadra con la cabecera."""
    vp = vox_path(wf)
    try:
        with open(vp, 'rb') as f:
            return f.read()
    except OSError:
        return None


def completo(wf):
    """True si el mundo esta en v2 y su .vox tiene el tamano que dice la cabecera."""
    cab = leer_cabecera(wf)
    if not es_v2(cab):
        return False
    dims = _dims(cab)
    if not dims:
        return False
    try:
        return os.path.getsize(vox_path(wf)) == 2 * dims[0] * dims[1] * dims[2]
    except OSError:
        return False


# ------------------------------------------------------------------ escritura

def _respaldar_si_toca(vp, to_trash):
    """Copia el .vox a la papelera solo tras un hueco de inactividad (uno por sesion, no por bloque)."""
    ahora = time.monotonic()
    previo = _ultimo_toque.get(vp)
    _ultimo_toque[vp] = ahora
    if previo is None or (ahora - previo) > RESPALDO_GAP:
        try:
            to_trash(vp, move=False)
        except Exception:
            pass                              # la papelera es red de seguridad, no puede tumbar un guardado


def escribir(wf, cab, datos, atomic_dump, to_trash):
    """Vuelca cabecera + .vox enteros (alta de mundo, conversion, POST v1 completo)."""
    with _cerrojo(wf):
        vp = vox_path(wf)
        to_trash(wf, move=False)              # la cabecera es de kilobytes: se respalda siempre
        _respaldar_si_toca(vp, to_trash)
        tmp = f'{vp}.tmp.{os.getpid()}.{time.time_ns()}'
        try:
            with open(tmp, 'wb') as f:
                f.write(datos)
                f.flush(); os.fsync(f.fileno())
            os.replace(tmp, vp)
        finally:
            if os.path.exists(tmp):
                try: os.remove(tmp)
                except OSError: pass
        atomic_dump(cab, wf)
        _ultimo_toque[vp] = time.monotonic()


def guardar_v1(wf, doc, atomic_dump, to_trash):
    """POST /api/mundo con un doc v1 completo -> se guarda como v2. (cabecera, None si el doc no vale)."""
    par = desde_v1(doc)
    if not par:
        return None
    cab, datos = par
    escribir(wf, cab, datos, atomic_dump, to_trash)
    return cab


def convertir(wf, atomic_dump, to_trash):
    """Un mundo v1 en disco pasa a v2 (una vez por mundo). Devuelve la cabecera, o None si no habia v1."""
    with _cerrojo(wf):
        if completo(wf):                      # otro hilo se nos adelanto mientras esperabamos el cerrojo
            return leer_cabecera(wf)
    doc = leer_cabecera(wf)
    if not isinstance(doc, dict) or 'voxels' not in doc:
        return None
    par = desde_v1(doc)
    if not par:
        return None
    cab, datos = par
    escribir(wf, cab, datos, atomic_dump, to_trash)
    return cab


def aplicar_edits(wf, edits, atomic_dump, to_trash):
    """Aplica [[x,y,z,clave], ...] al .vox en sitio. ('' o null = aire.)

    Devuelve (n_aplicadas, error). Es el camino de «poner un bloque»: no lee ni reescribe el fichero
    entero, solo hace seek + 2 bytes por celda (y un write por tramo consecutivo en x)."""
    if not isinstance(edits, list):
        return 0, 'edits debe ser una lista'
    with _cerrojo(wf):
        cab = leer_cabecera(wf)
        if not es_v2(cab):
            return 0, 'el mundo no esta en formato ' + FORMATO
        dims = _dims(cab)
        if not dims:
            return 0, 'dim invalida'
        dx, dy, dz = dims
        vp = vox_path(wf)
        if not os.path.exists(vp) or os.path.getsize(vp) != 2 * dx * dy * dz:
            return 0, 'el .vox no cuadra con la cabecera'

        paleta = cab.get('palette') or [None]
        if paleta[0] is not None:
            paleta = [None] + list(paleta)    # cabecera manipulada a mano: el 0 es el aire, siempre
        clave2id = {c: i for i, c in enumerate(paleta) if i and isinstance(c, str)}
        crecio = False

        pares = []                            # (idx, pid)
        for e in edits:
            if not isinstance(e, (list, tuple)) or len(e) < 4:
                continue
            try:
                x, y, z = int(e[0]), int(e[1]), int(e[2])
            except (TypeError, ValueError):
                continue
            if not (0 <= x < dx and 0 <= y < dy and 0 <= z < dz):
                continue
            clave = e[3]
            if not clave:
                pid = 0
            elif not isinstance(clave, str):
                continue
            else:
                pid = clave2id.get(clave)
                if pid is None:
                    if len(paleta) > MAX_PALETA:
                        return 0, 'paleta llena'
                    pid = clave2id[clave] = len(paleta)
                    paleta.append(clave)
                    crecio = True
            pares.append((x + y * dx + z * dx * dy, pid))

        if not pares:
            return 0, None

        if crecio:                            # la cabecera son kilobytes: reescribirla entera esta bien
            cab['palette'] = paleta
            atomic_dump(cab, wf)

        _respaldar_si_toca(vp, to_trash)
        pares.sort()
        with open(vp, 'r+b') as f:
            i, n = 0, len(pares)
            while i < n:
                j = i + 1                     # coalescer el tramo consecutivo (un fill en x son 512 celdas)
                while j < n and pares[j][0] == pares[j - 1][0] + 1:
                    j += 1
                tramo = array.array('H', [p[1] for p in pares[i:j]])
                f.seek(2 * pares[i][0])
                f.write(_a_bytes_le(tramo))
                i = j
            f.flush(); os.fsync(f.fileno())
        _ultimo_toque[vp] = time.monotonic()
        return len(pares), None


def guardar_cabecera(wf, parcial, atomic_dump, to_trash):
    """Guarda solo lo que no esta en el .vox (spawn, structures, notes, noteRots, noteTints). El .vox no se toca."""
    with _cerrojo(wf):
        cab = leer_cabecera(wf)
        if not es_v2(cab):
            return False
        for k in ('spawn', 'structures', 'notes', 'noteRots', 'noteTints'):
            if k in parcial:
                cab[k] = parcial[k]
        to_trash(wf, move=False)
        atomic_dump(cab, wf)
        return True


# ------------------------------------------------------------------ gzip del .vox

# Mismo trato que json_file_body en server.py: los bytes de un .vox son siempre los mismos mientras
# no cambie (ruta, mtime, tamano), y comprimir 21 MB en cada apertura seria meter en el camino
# critico justo lo que venimos a quitar. 21 MB crudos -> ~0,35 MB por la red.
_gz_cache = {}
_gz_lock = threading.Lock()
GZ_NIVEL = 1


def cuerpo_vox(wf):
    """(crudo, gzip, etag) del .vox, o None si no esta."""
    vp = vox_path(wf)
    try:
        st = os.stat(vp)
    except OSError:
        return None
    clave = (vp, st.st_mtime_ns, st.st_size)
    with _gz_lock:
        hit = _gz_cache.get(clave)
    if hit is not None:
        return hit
    try:
        with open(vp, 'rb') as f:
            crudo = f.read()
    except OSError:
        return None
    trio = (crudo, gzip.compress(crudo, GZ_NIVEL), f'"{st.st_mtime_ns:x}-{st.st_size:x}"')
    with _gz_lock:
        if len(_gz_cache) > 8:                # son 21 MB por entrada: aqui el tope si es una politica
            _gz_cache.clear()
        _gz_cache[clave] = trio
    return trio
