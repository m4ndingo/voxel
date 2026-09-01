# -*- coding: utf-8 -*-
"""Registro LATERAL de los mundos: de quién es cada uno y quién puede verlo o escribirlo.

⛔ POR QUÉ ES LATERAL Y NO VA EN LA RUTA. Lo natural en un multiverso sería `/map/@ana/castillo`, y
está descartado a propósito: el slug del mapa es la clave de MEDIO MOTOR. Lo usan `world_file_for`
(`server.py`), `mundos.listar()`, la caché de miniaturas `data/_thumbs/<slug>.json`, `mcMapName()`
en `app.js`, la convención `mundo-<mapa>` / `arranque-<mapa>` de los snippets de autoarranque, y las
URL escritas por medio repo y por la wiki. Meter un usuario en la ruta es semanas de trabajo y una
migración de 166 MB para ganar lo mismo que un fichero al lado.

Con el registro al lado, el «espacio de nombres por usuario» pasa a ser de PRESENTACIÓN — el menú
enseña «Mis mundos» y «Públicos» — y cuesta cero. El precio es que los nombres son globales, y eso
se paga en `nombre_libre()`, que propone `castillo-2` cuando `castillo` está cogido.

⚠️ LOS MUNDOS QUE YA EXISTEN NO TIENEN FICHERO AQUÍ, y no se les inventa uno: un mundo sin registro
hereda `HEREDADO`, que es OCULTO y de SOLO LECTURA. Es lo que pidió el dueño para sus 33 mapas, y
además es la postura segura — si mañana aparece un mundo por un camino que nadie previó, nace
cerrado en vez de abierto. El panel (F9) es el que los va abriendo uno a uno.
"""

import json
import os
import re
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la raíz del repo, un nivel arriba
META = os.environ.get('VOXELFORGE_MUNDOS_META') or os.path.join(BASE, 'data', 'mundos_meta')

# Las tres visibilidades y las tres escrituras. Que sean TRES es la decisión de diseño: se explican
# en una frase cada una, y un sistema de ACL por usuario no se explica en ninguna.
VISIBILIDADES = ('privado', 'enlace', 'publico')
ESCRITURAS = ('dueno', 'invitados', 'todos')

# Lo que hereda un mundo que no tiene registro (los 33 de antes de F3.1, y cualquiera que aparezca
# por un camino no previsto). Sin dueño ⇒ solo el dueño del servidor lo toca.
HEREDADO = {'dueno': None, 'visibilidad': 'privado', 'escritura': 'dueno',
            'codigo': '', 'invitados': [], 'destacado': False, 'heredado': True}


def _ruta(slug):
    return os.path.join(META, slug + '.json')


def _guarda(d, ruta):
    """Temporal en el mismo directorio + `os.replace`, como todo lo que escribe este repo."""
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


def lee(slug):
    """El registro de `slug`, o una copia de `HEREDADO` si no tiene. NUNCA devuelve None.

    Devolver siempre un dict es lo que evita el `if meta is None` repetido en cada rama del servidor,
    que es donde se cuelan los permisos olvidados.
    """
    try:
        with open(_ruta(slug), encoding='utf-8') as f:
            d = json.load(f)
    except (OSError, ValueError):
        d = None
    if not isinstance(d, dict):
        return dict(HEREDADO, slug=slug)
    fila = dict(HEREDADO, slug=slug, heredado=False)
    fila.update(d)
    fila['slug'] = slug                                  # el nombre del fichero manda sobre el contenido
    return fila


def guarda(meta):
    slug = meta.get('slug')
    if not slug:
        raise ValueError('un registro sin slug no se puede guardar')
    meta = dict(meta)
    meta.pop('heredado', None)                           # es un dato calculado, no se persiste
    if meta.get('visibilidad') not in VISIBILIDADES:
        meta['visibilidad'] = 'privado'
    if meta.get('escritura') not in ESCRITURAS:
        meta['escritura'] = 'dueno'
    _guarda(meta, _ruta(slug))
    return meta


def crea(slug, uid, visibilidad='privado', escritura='dueno'):
    return guarda({'slug': slug, 'dueno': uid, 'visibilidad': visibilidad, 'escritura': escritura,
                   'codigo': '', 'invitados': [], 'destacado': False,
                   'creado': time.strftime('%Y-%m-%dT%H:%M:%S')})


def olvida(slug):
    """Quita el registro (lo llama el borrado del mundo). No es un borrado de autoría: se recalcula."""
    try:
        os.remove(_ruta(slug))
    except OSError:
        pass


def todos():
    if not os.path.isdir(META):
        return []
    return [lee(f[:-5]) for f in sorted(os.listdir(META)) if f.endswith('.json')]


def de(uid):
    """Los slugs de los mundos de `uid`. Es lo que cuenta la cuota de mapas."""
    if not uid:
        return []
    return [m['slug'] for m in todos() if m.get('dueno') == uid]


# ── Quién puede qué ─────────────────────────────────────────────────────────────────────────────
#
# ⚠️ Estas dos funciones NO conocen al dueño del servidor. El `_es_dueno()` del `Handler` se
# comprueba ANTES, arriba, y por eso en desarrollo (sin token, todo el mundo es dueño) nada de esto
# se nota y los 128 tests de siempre siguen verdes. Aquí solo se decide entre usuarios normales.

def es_suyo(meta, u):
    return bool(u) and bool(meta.get('dueno')) and meta.get('dueno') == u.get('uid')


def puede_ver(meta, u, codigo=None):
    """¿Puede esta persona ABRIR este mapa?

    El `codigo` es el código de acceso que pidió el dueño para sus propios mapas: viaja en la URL
    (`?codigo=…`) y abre un mapa que de otro modo no se vería. Se compara tal cual porque no es una
    contraseña: es una llave que se comparte a propósito, como el enlace.
    """
    if es_suyo(meta, u):
        return True
    if meta.get('codigo') and codigo and str(codigo) == str(meta['codigo']):
        return True
    if u and u.get('uid') in (meta.get('invitados') or []):
        return True
    vis = meta.get('visibilidad')
    if vis == 'publico':
        return True
    # `enlace` = «quien tenga la URL». No es seguridad, es discreción: no sale en los listados, pero
    # cualquiera con el enlace entra. Se dice claro para que nadie lo confunda con `privado`.
    return vis == 'enlace'


def sale_en_listados(meta, u):
    """`enlace` es la diferencia entre ver y encontrar: entra quien tiene la URL, pero no se lista."""
    return meta.get('visibilidad') == 'publico' or es_suyo(meta, u)


def puede_escribir(meta, u, invitado=False):
    """`invitado` = llega con un vale de F5.6 válido PARA ESTE MAPA (lo comprueba `server.py`).

    Un vale te mete en la lista de invitados sobre la marcha, sin escribir nada en el fichero: es
    lo mismo que salir en `invitados[]`, pero sin necesidad de tener cuenta. Por eso ⛔ NO es un
    comodín — en un mapa `escritura: dueno` sigue devolviendo False y el invitado entra a MIRAR.
    Invitar a ver no puede ser invitar a tocar, o las tres reglas de F6.3 no significan nada.
    """
    if es_suyo(meta, u):
        return True
    esc = meta.get('escritura')
    if esc == 'todos':
        return True
    if esc == 'invitados':
        return invitado or (bool(u) and u.get('uid') in (meta.get('invitados') or []))
    return False


def nombre_libre(slug, existe):
    """`castillo` → `castillo-2` si está cogido. `existe(slug)` lo decide quien llama."""
    slug = re.sub(r'[^a-z0-9]+', '-', (slug or '').lower()).strip('-') or 'mundo'
    if not existe(slug):
        return slug
    for n in range(2, 1000):
        cand = f'{slug}-{n}'
        if not existe(cand):
            return cand
    return f'{slug}-{int(time.time())}'
