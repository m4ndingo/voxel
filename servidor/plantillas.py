# -*- coding: utf-8 -*-
"""REQ-PLANT1 · las plantillas de mundo: el catálogo de fichas y la lista CERRADA de ambientes.

Crear un mapa era caer en una llanura vacía. Ahora se elige una ficha con foto, y detrás de la ficha
hay un `construye-*` de los que ya existían — que no son librerías: **se autoejecutan** (cada uno
define su `buildX(...)`, se llama a sí mismo al final y remata con `game.snippet("nubes-altas")`).
Por eso aquí no hay nada de generación: el generador ya estaba escrito, esto sólo lo presenta.

⛔ **POR QUÉ EL AMBIENTE ES UNA LISTA CERRADA Y NO CÓDIGO**

Para que un mapa vuelva a abrirse con su tormenta hace falta un snippet `mundo-<slug>`, porque
`game.entorno(...)` es un ajuste de tiempo de ejecución y se pierde al salir. Pero un snippet lo
ejecuta `mcAutoarranque()` con `new AsyncFunction(code)` en ámbito global **en el navegador de cada
visitante**, incluido el dueño. Si el jugador pudiera decidir ese texto, entrar a su mapa sería
ejecutar su código con la sesión de quien entra: exactamente lo que el dueño prohibió — *«la cuenta
de administrador/dueño no tendría que poder ser nunca robada por un jugador que lance un snippet»*.

Por eso el jugador **no manda código: manda opciones de esta tabla**, y el `code` lo compone
`codigo_ambiente()` a partir de constantes de este fichero. Es la opción **D** de
`docs/codigo-de-usuario.md` («lista cerrada en vez de JS») aplicada a un caso concreto, y permite dar
la función sin tocar el candado de `snippet.crear_propio` (que sigue apagado para todos).

⇒ Regla para quien toque esto: **nada de lo que llegue del cliente puede acabar dentro de `code`**.
Se comprueba que la clave está en el diccionario y se emite la constante; no se interpola texto.
"""

import base64
import os
import re

# ── Lo que el jugador puede elegir ──────────────────────────────────────────────────────────────
# Clave → (rótulo, línea de JS). La línea es CONSTANTE: no lleva nada del cliente.

AMBIENTES = {
    'dia':        ('☀️ Día',        'game.entorno("DIA", 0);'),
    'atardecer':  ('🌆 Atardecer',  'game.entorno("ATARDECER", 0.8);'),
    'noche':      ('🌙 Noche',      'game.entorno("NOCHE", 0);'),
    'tormenta':   ('⛈️ Tormenta',   'game.entorno("TORMENTA", 0);'),
}

EFECTOS = {
    'lluvia':    ('🌧️ Lluvia',    'try{ game.efectos.lluvia.enciende(160); }catch(e){}'),
    'estrellas': ('✨ Estrellas', 'try{ game.efectos.estrellas.enciende(); }catch(e){}'),
    'niebla':    ('🌫️ Niebla',    'try{ game.interiorDark = 0.05; }catch(e){}'),
}

# ── Tamaño ──────────────────────────────────────────────────────────────────────────────────────
# El lado del mundo, en celdas. El tope por defecto lo puso el dueño en 128 (2026-09-02) y el panel
# puede subirlo por perfil con `cuota.mapa_lado`.
#
# ⚠️ El peso NO es una estimación: es el mismo cálculo con el que `/api/mundos/crear` cobra la cuota
# (lado · alto · lado · 2 bytes). Antes se cobraban siempre 96³ y el generador redimensionaba después
# a 128³ o 512³ — la cuota decía que sí y el disco se llenaba igual.
LADOS = (96, 128, 192, 256, 384, 512)
LADO_POR_DEFECTO = 128
LADO_TOPE_POR_DEFECTO = 128
ALTO = 40


def bytes_de(lado, alto=ALTO):
    """Lo que va a ocupar en disco un mundo de ese lado. Dos bytes por celda."""
    return int(lado) * int(alto) * int(lado) * 2


def lado_valido(lado, tope):
    """El lado pedido si es uno de los de la lista y cabe en el tope; si no, `None`.

    Se devuelve `None` en vez de recortar en silencio: un jugador que pide 512 y recibe 128 sin que
    nadie se lo diga cree que el asistente está roto.
    """
    try:
        lado = int(lado)
    except (TypeError, ValueError):
        return None
    if lado not in LADOS or lado > int(tope or LADO_TOPE_POR_DEFECTO):
        return None
    return lado


# ⚠️ EL TOPE DE LA PLANTILLA NO ES EL DE LA CUENTA, y hacen falta los dos.
#
# El de la cuenta (`cuota.mapa_lado`) dice cuánto DISCO se le deja gastar a alguien. Éste dice hasta
# dónde aguanta EL GENERADOR: una ciudad a 256 son cuatro veces la ciudad de 128 —cuatro veces los
# edificios, y sobre todo cuatro veces la superficie que hay que mallar— y el navegador del dueño se
# quedó SIN MEMORIA generando «borrame-6» (256×256, `construye-fornite-tilted-towers`, 2026-09-02).
# El disco decía que sí; el navegador, que no.
#
# Lo declara cada ficha en `ladoMax`, porque el que sabe lo que pesa un bioma es el bioma. Sin
# declarar, la plantilla no limita nada (las dos especiales del programa no construyen nada pesado).
LADO_MAX_POR_DEFECTO = max(LADOS)


def tope_de_plantilla(ficha):
    """El lado máximo que declara esa ficha; `LADO_MAX_POR_DEFECTO` si no declara ninguno."""
    m = (ficha or {}).get('ladoMax')
    return m if isinstance(m, int) and m in LADOS else LADO_MAX_POR_DEFECTO


# ── El snippet `mundo-<slug>` de ambientación ───────────────────────────────────────────────────

def codigo_ambiente(ambiente, efectos):
    """El `code` del `mundo-<slug>`, compuesto SOLO con constantes de este fichero.

    Devuelve '' si no hay nada que aplicar, para no dejar snippets vacíos por ahí.

    ⛔ `ambiente` y `efectos` vienen del cliente y por eso NO se escriben: se usan como clave. Si la
    clave no está en la tabla, se ignora. Cambiar esto por un f-string es abrir la puerta que todo
    este módulo existe para cerrar.
    """
    lineas = []
    amb = AMBIENTES.get(str(ambiente or '').strip().lower())
    if amb:
        lineas.append(amb[1])
    for e in (efectos or []):
        ef = EFECTOS.get(str(e or '').strip().lower())
        if ef and ef[1] not in lineas:
            lineas.append(ef[1])
    if not lineas:
        return ''
    return ('// Ambientación elegida en el asistente de mundo nuevo (REQ-PLANT1).\n'
            '// Generado por el servidor a partir de una lista cerrada: NO es código de usuario.\n'
            '// Se puede borrar sin miedo — sólo pinta el ambiente, no construye nada.\n'
            + '\n'.join(lineas) + '\n')


# ── El catálogo que ve el carrusel ──────────────────────────────────────────────────────────────
# La ficha vive DENTRO del snippet generador (decisión del dueño: «podria haber metadatos en esos
# snippets para indicar la foto, el titulo de la ficha, una descripcion, etc»), así que el catálogo
# no es otra lista que mantener: es lo que hay en `data/snippets/` con una `ficha` puesta.

# Las dos opciones del final del carrusel no son snippets y por eso están aquí a mano. ⛔ Ninguna de
# las dos ejecuta un snippet: «solo terreno base» llama a `game.buildTerrain()` a pelo — y SIN
# argumentos, porque `buildTerrain(true)` entra por `mcGenFlat()`, que es un mundo de 96×40×96
# escrito a fuego y desharía el tamaño que el jugador acaba de elegir.
ESPECIALES = (
    {'id': 'terreno-base', 'orden': 900, 'especial': 'terreno',
     'ficha': {'titulo': 'Solo terreno base',
               'descripcion': 'Un suelo llano de hierba, tierra y roca. Para construir desde cero.',
               'etiquetas': ['🌱 hierba', '🟫 tierra', '🪨 roca'],
               'foto': '', 'frases': ['Allanando el terreno…']}},
    {'id': 'vacio', 'orden': 901, 'especial': 'vacio',
     'ficha': {'titulo': 'Mapa vacío',
               'descripcion': 'Nada de nada: el lienzo en blanco, sin una sola celda puesta.',
               'etiquetas': ['⬛ vacío', '✏️ libre'],
               'foto': '', 'frases': []}},
)


def normaliza_ficha(d):
    """La `ficha` de un documento de snippet, saneada, o `None` si ese snippet no es una plantilla.

    Tolerante a propósito: una ficha a medio rellenar (sin foto todavía, que es el caso mientras el
    dueño hace las capturas) tiene que salir en el carrusel igual, con su marcador.
    """
    f = d.get('ficha')
    if not isinstance(f, dict):
        return None
    etiquetas = f.get('etiquetas')
    if not isinstance(etiquetas, list):
        etiquetas = []
    frases = f.get('frases')
    if not isinstance(frases, list):
        frases = []
    return {
        'titulo': str(f.get('titulo') or d.get('name') or d.get('id') or '').strip(),
        'descripcion': str(f.get('descripcion') or '').strip(),
        'etiquetas': [str(x).strip() for x in etiquetas[:4] if str(x).strip()],
        'foto': str(f.get('foto') or '').strip(),
        'frases': [str(x).strip() for x in frases[:8] if str(x).strip()],
        'orden': f.get('orden') if isinstance(f.get('orden'), int) else 500,
        # Tamaños: `lado` es el que la plantilla recomienda (para el que fue escrita) y `ladoMax` el
        # último que aguanta. Ver `tope_de_plantilla`: sin `ladoMax` no limita nada.
        'lado': f.get('lado') if f.get('lado') in LADOS else 0,
        'ladoMax': f.get('ladoMax') if f.get('ladoMax') in LADOS else 0,
        # La BAJA de una plantilla (REQ-PLANT3). ⛔ Dar de baja NO es borrar el snippet: el generador
        # sigue entero y se le puede seguir llamando a mano; lo que se quita es la tarjeta del
        # carrusel. Por eso es una marca dentro de la ficha y no un borrado — quitar la `ficha` para
        # esconder la tarjeta dejaba el alta sin vuelta atrás, porque el panel sólo ve lo que tiene
        # ficha y la plantilla escondida desaparecía también de donde se gestiona.
        'oculta': bool(f.get('oculta')),
    }


# ── La foto de la ficha ─────────────────────────────────────────────────────────────────────────
#
# La ficha guarda la RUTA de su foto, nunca la imagen: `/api/snippets` tiene 2 MB de cuerpo y el
# fichero del generador se lee entero en cada arranque de cada mapa, así que un base64 de 800 KB
# dentro se pagaría en todas las cargas de todos los visitantes.
#
# ⛔ **DÓNDE VIVEN, Y POR QUÉ AHÍ**: `data/ui/plantillas/`. Es de las cuatro carpetas de `data/` que
# el modo público sigue sirviendo (`DATA_PUBLICA` en `server.py`), y por tanto **de lectura pública
# y escritura cerrada**: para dejar un fichero ahí hay que pasar por el panel con `panel.usar`. No
# valen `data/tickets/` ni la raíz de `data/`, que en público devuelven 404.
#
# ⚠️ **QUÉ PASA SI LA FOTO SE BORRA**: nada se rompe, y es a propósito. `foto_de()` comprueba el
# disco en cada petición del catálogo; si el fichero no está, devuelve '' y la tarjeta se pinta con
# su marcador (la inicial del título). Una ruta muerta en la ficha NO deja un hueco roto.
#
# Y el revés de la misma moneda: si no hay foto declarada pero existe `data/ui/plantillas/<id>.jpg`,
# se usa esa. **Asociar una foto es subirla con el nombre de la ficha**; los metadatos no hacen falta.

URL_FOTOS = '/data/ui/plantillas/'
URL_CAPTURAS = '/data/fotos/'                 # las de la tecla F: también valen como foto de ficha
FOTO_MAX_BYTES = 3 * 1024 * 1024              # una foto de móvil sin recortar cabe de sobra
EXT_FOTO = ('jpg', 'png', 'webp')

# Se reconoce por los BYTES, no por lo que diga el nombre ni el `data:` de delante: quien sube
# manda las dos cosas, y un `.jpg` que en realidad es un `.svg` es un XSS servido desde el sitio.
_MAGIA = ((b'\xff\xd8\xff', 'jpg'), (b'\x89PNG\r\n\x1a\n', 'png'))


def carpeta_fotos(base):
    """`<repo>/data/ui/plantillas`. No la crea: eso es cosa de quien escriba."""
    return os.path.join(base, 'data', 'ui', 'plantillas')


def ruta_de_url(base, url):
    """La ruta en disco de una `ficha.foto`, o `None` si esa URL no es una foto de ficha admisible.

    Es el portero: sólo las dos carpetas de arriba y sólo un nombre de fichero llano. Sin esto,
    una ficha con `foto: '/data/../../etc/passwd'` convertiría el catálogo en un lector de ficheros.
    """
    u = str(url or '').strip().split('?')[0]
    if u.startswith(URL_FOTOS):
        carpeta, nombre = carpeta_fotos(base), u[len(URL_FOTOS):]
    elif u.startswith(URL_CAPTURAS):
        carpeta, nombre = os.path.join(base, 'data', 'fotos'), u[len(URL_CAPTURAS):]
    else:
        return None
    if not re.match(r'^[A-Za-z0-9_.-]+$', nombre) or nombre.startswith('.') or '..' in nombre:
        return None
    return os.path.join(carpeta, nombre)


def foto_viva(base, url):
    """¿La foto que declara la ficha sigue en el disco?"""
    r = ruta_de_url(base, url)
    return bool(r and os.path.isfile(r))


def foto_de(base, idd, declarada=''):
    """La foto que hay que pintar para esta ficha, mirando el DISCO. '' si no hay ninguna.

    Orden: la declarada si sigue viva → la que haya subido el panel con el nombre de la ficha → ''.
    """
    if declarada and foto_viva(base, declarada):
        return declarada
    idd = re.sub(r'[^A-Za-z0-9_-]+', '-', str(idd or '')).strip('-')
    if idd:
        for ext in EXT_FOTO:
            if os.path.isfile(os.path.join(carpeta_fotos(base), idd + '.' + ext)):
                return URL_FOTOS + idd + '.' + ext
    return ''


def imagen_cruda(dato):
    """`(bytes, extensión)` de una imagen mandada en base64 o `data:`; `(None, None)` si no lo es.

    Mismo trato que `png_crudo` de `server.py` para los iconos, con JPEG añadido porque las fichas
    son fotos y un PNG de 1080×1920 pesa cinco veces más.
    """
    txt = dato if isinstance(dato, str) else ''
    if ',' in txt[:80] and txt.lstrip().startswith('data:'):
        txt = txt.split(',', 1)[1]
    try:
        crudo = base64.b64decode(re.sub(r'\s+', '', txt), validate=True)
    except Exception:
        return None, None
    if not crudo or len(crudo) > FOTO_MAX_BYTES:
        return None, None
    for magia, ext in _MAGIA:
        if crudo.startswith(magia):
            return crudo, ext
    if crudo[:4] == b'RIFF' and crudo[8:12] == b'WEBP':
        return crudo, 'webp'
    return None, None
