#!/usr/bin/env python3
"""Ciudad-MD · lo que comparten la ida (md_a_ciudad.py) y la vuelta (ciudad_a_md.py).

Vive aparte porque la ida y la vuelta SON la misma tabla leída en dos sentidos: si el ancho del
canal, el material separador o el troceador de notas se desincronizan un solo voxel, la vuelta
segmenta mal y el .md regenerado sale corrupto sin que nada falle a gritos. Todo lo que las dos
mitades tienen que ver igual está aquí y sólo aquí.

Regla que gobierna el diseño (ver docs/ciudad-md.md):

    Cada rasgo del mundo es PORTADOR (única copia de un dato del .md; la vuelta lo lee) o
    DERIVADO (función pura de los portadores; la vuelta lo ignora). Nada decorativo sin relación.

PORTADORES: la partición del suelo (materiales separadores reservados ⇒ orden y anidamiento) y las
notas (el texto). DERIVADO: alturas, tejados por estado, canales, farolas, senderos, hitos.

⛔ NO se importa server.py: hace clean_trash() a nivel de módulo (server.py:147) y lee sys.argv.
   Por eso abajo hay una copia de 12 líneas de atomic_dump/to_trash. servidor/voxfmt.py sí se
   importa, con el patrón de servidor/mundos.py:16-18.
"""
import json
import os
import re
import shutil
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la raíz del repo
sys.path.insert(0, os.path.join(BASE, 'servidor'))

try:                                         # como paquete, si algún día lo importa el servidor
    from servidor import voxfmt
except ImportError:                          # ...y a pelo: `python3 herramientas/md_a_ciudad.py`
    import voxfmt                            # noqa: F401  (lo usan los dos scripts, no este módulo)

WORLDS = os.path.join(BASE, 'data', 'worlds')
TRASH = os.path.join(BASE, 'data', 'habitantes_trash')

# ---------------------------------------------------------------- escala de la maqueta

GH = 14                 # altura del suelo, la misma que mcGenFlat (web/app.js:8550)
COLS = 8                # atriles por fila dentro de una planta
PASO_ATRIL = 2          # atril + pasillo: un atril de 1×1 cada 2 de rejilla
ALTO_PLANTA = 4         # forjado de ladrillo_piedra cada 4 ⇒ una planta por `####`
ALTO_PUERTA = 2
ANCHO_CALLE = 3         # adoquín entre parcelas (###)
ANCHO_CANAL = 3         # agua entre barrios (##)
ANCHO_MAR = 3           # marco de agua alrededor de la isla, que la vuelta recorta primero

DIMS = (96, 128, 192, 256, 384, 512, 768, 1024)   # escalones de lado; se elige el menor que quepa

# ---------------------------------------------------------------- materiales

_CATALOGO = None


def _catalogo():
    """id → fichero, leído de assets/index.json (la única lista buena, ver CLAUDE.md)."""
    global _CATALOGO
    if _CATALOGO is None:
        with open(os.path.join(BASE, 'assets', 'index.json'), encoding='utf-8') as f:
            _CATALOGO = {e['id']: e['file'] for e in json.load(f) if e.get('id') and e.get('file')}
    return _CATALOGO


def mat(nombre):
    """Clave de material del catálogo. NUNCA un id de cliente: la paleta del .vox lleva claves.

    ⛔ El fichero se LEE del índice, no se deduce del id. `assets/<id>.vox.json` es la convención
    pero no la regla: `yellow` vive en `assets/yellow_concrete.vox.json`, y deducirlo daba un mundo
    con un 404 en la paleta (`GET /assets/yellow.vox.json`, reportado por el dueño el 2026-08-20).
    Un material que no carga no rompe nada a gritos: sale fucsia macizo y ya.
    """
    fichero = _catalogo().get(nombre)
    if not fichero:
        raise KeyError('material %r no está en assets/index.json' % nombre)
    return 'asset:' + fichero


# Reservados: la vuelta segmenta POR ESTOS y por nada más, así que ningún otro rasgo puede usarlos.
SEP_MAR = mat('agua')                # marco exterior
SEP_BARRIO = mat('agua')             # canal entre barrios (##)
SEP_PARCELA = mat('adoquin')         # calle entre parcelas (###)
SEP_PLANTA = mat('ladrillo_piedra')  # forjado entre plantas (####)

SUELO_ROCA = mat('roca')             # y < 11
SUELO_TIERRA = mat('tierra')         # 11..13
SUELO_HIERBA = mat('hierba')         # y = GH
# ⛔ El muro NO puede ser adoquín aunque quede mejor: es un material separador, y un edificio que
#    llene su parcela justo le pondría a la vuelta una columna de adoquín de lado a lado del
#    estante, que la partiría por la mitad. Los reservados son EXCLUSIVOS de la partición.
MURO = mat('arenisca')
ATRIL = mat('tablones')              # pedestal 1×1 que porta una nota
OBELISCO = mat('oro')
CRIPTA = mat('obsidiana')            # bloque de código
CITA = mat('alfombra')               # cita `>`
SENDERO = mat('grava')               # enlace interno, con --enlaces=carreteras
FAROLA_POSTE = mat('tronco')
FAROLA_LUZ = mat('cubo-blanco-brillante')

# Estado del ticket → material del tejado. Vocabulario medido en PLAN.md.
TEJADOS = {
    '🔴': mat('ladrillo'),
    '🟡': mat('hormig-n-amarillo-i'),
    '🟢': mat('hormig-n-verde'),
    '⬜': mat('white_whool'),
    '🟨': mat('yellow'),
    '✅': mat('oro'),
    '⛔': mat('obsidiana'),
    '': mat('adoquin'),              # sección sin estado
}
ESTADOS = ''.join(k for k in TEJADOS if k)

HITOS = ('taberna', 'herreria', 'mazmorra')   # 3 estructuras estampadas = 3 draw calls, y ya

# ---------------------------------------------------------------- notas

MC_NOTE_MAX = 280        # web/app.js:16039 — y el truncado es txt.slice(0,280), que cuenta UTF-16
MC_NOTE_SIGN_MAX = 64    # web/app.js:16057 — sólo las 64 primeras se dibujan como cartel 3D


def u16(s):
    """Longitud en unidades UTF-16, que es como mide JS. '🔴' son 2, no 1."""
    return len(s.encode('utf-16-le', 'surrogatepass')) // 2


def _corte_max(s, tope):
    """Índice (en code points) del prefijo más largo de `s` que quepa en `tope` unidades UTF-16."""
    n = 0
    for i, c in enumerate(s):
        w = 2 if ord(c) > 0xFFFF else 1
        if n + w > tope:
            return i
        n += w
    return len(s)


def trocea(texto, tope=MC_NOTE_MAX):
    """Parte `texto` en trozos de nota. Es un PARTICIONADOR: ''.join(trozos) == texto, siempre.

    Tres invariantes, y las tres importan por una razón concreta del motor:
      1. la concatenación devuelve el original ⇒ la vuelta es un `join`, no un renderizador;
      2. ningún trozo vacío ⇒ mcSyncNoteSignsRun mira mc.notes[k] por truthiness, y una nota "" es
         una nota BORRADA (el cartel desaparece y con él un pedazo del documento);
      3. ningún trozo > tope ⇒ si el dueño abre una nota y la guarda, el slice(0,280) del motor es
         un no-op y no le trunca la edición por la espalda.
    Se mide en UTF-16 pero se corta por code points, para no partir un par suplente en dos.
    """
    if texto == '':
        return []
    trozos = []
    resto = texto
    while resto:
        corte = _corte_max(resto, tope)
        if corte >= len(resto):
            trozos.append(resto)
            break
        # preferimos cortar por línea, luego por espacio; si no hay ninguno, a hueso.
        nl = resto.rfind('\n', 0, corte)
        sp = resto.rfind(' ', 0, corte)
        if nl > 0:
            corte = nl + 1
        elif sp > 0:
            corte = sp + 1
        corte = max(corte, 1)                # progreso garantizado: un code point cabe siempre
        trozos.append(resto[:corte])
        resto = resto[corte:]
    assert ''.join(trozos) == texto, 'el troceador ha perdido texto'
    assert all(trozos), 'trozo vacío: sería una nota borrada'
    assert all(u16(t) <= tope for t in trozos), 'trozo por encima de MC_NOTE_MAX'
    return trozos


# ---------------------------------------------------------------- particionador de markdown

RE_ENCABEZADO = re.compile(r'^ {0,3}(#{1,6})(?:\s+(.*))?$')
RE_ANCLA = re.compile(r'^\s*<a\s+id="([^"]*)"\s*>\s*</a>\s*$')
RE_VALLA = re.compile(r'^ {0,3}(`{3,}|~{3,})')
RE_REGLA = re.compile(r'^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$')
RE_ITEM = re.compile(r'^(\s*)(?:[-*+]|\d+[.)])\s')
RE_FECHA = re.compile(r'\d{4}-\d{2}-\d{2}')
RE_TICKET = re.compile(r'\b(?:BUG|REQ)-[A-Z0-9]+\b')
RE_ENLACE_INT = re.compile(r'\]\(#([a-z0-9\-]+)\)')


def lineas_de(texto):
    """Parte por '\\n' conservando el final. ''.join(lineas_de(t)) == t, con CRLF y sin \\n final."""
    out = []
    ini = 0
    while True:
        j = texto.find('\n', ini)
        if j < 0:
            if ini < len(texto):
                out.append(texto[ini:])
            return out
        out.append(texto[ini:j + 1])
        ini = j + 1


class Bloque(object):
    """Un rango contiguo de líneas. Los bloques cubren el fichero ENTERO, sin huecos ni solapes."""

    __slots__ = ('tipo', 'i0', 'i1', 'texto', 'nivel', 'titulo', 'ancla', 'estado', 'ticket', 'fecha')

    def __init__(self, tipo, i0, i1, texto):
        self.tipo = tipo
        self.i0, self.i1 = i0, i1
        self.texto = texto
        self.nivel = 0
        self.titulo = self.ancla = self.estado = self.ticket = self.fecha = ''

    def __repr__(self):
        return '<%s %d:%d %r>' % (self.tipo, self.i0, self.i1, self.texto[:40])


def _clasifica(cruda):
    linea = cruda.rstrip('\r\n')
    if not linea.strip():
        return 'blanco'
    if RE_VALLA.match(linea):
        return 'valla'
    if RE_ENCABEZADO.match(linea):
        return 'encabezado'
    if RE_ANCLA.match(linea):
        return 'ancla'
    if RE_REGLA.match(linea):
        return 'regla'
    if linea.lstrip().startswith('|'):
        return 'tabla'
    if linea.lstrip().startswith('>'):
        return 'cita'
    if RE_ITEM.match(linea):
        return 'item'
    return 'prosa'


def _mide_encabezado(b, cruda):
    m = RE_ENCABEZADO.match(cruda.rstrip('\r\n'))
    b.nivel = len(m.group(1))
    b.titulo = (m.group(2) or '').strip()
    for e in ESTADOS:
        if e in b.titulo:
            b.estado = e
            break
    mt = RE_TICKET.search(b.titulo)
    if mt:
        b.ticket = mt.group(0)
    mf = RE_FECHA.search(b.titulo)
    if mf:
        b.fecha = mf.group(0)


def particiona(texto):
    """`texto` → lista de Bloque contigua que lo cubre entero. Ninguna construcción puede romperlo.

    Lo que un markdown raro degrada es la ESTÉTICA (cae a 'prosa' y sale como un atril más), nunca
    la exactitud: el peor caso sigue siendo una partición del fichero.
    """
    lineas = lineas_de(texto)
    n = len(lineas)
    tipos = [_clasifica(l) for l in lineas]
    bloques = []
    i = 0

    def cierra(tipo, i0, i1):
        b = Bloque(tipo, i0, i1, ''.join(lineas[i0:i1]))
        bloques.append(b)
        return b

    while i < n:
        t = tipos[i]

        if t == 'valla':                     # la valla se traga TODO hasta la de cierre, '#' incluido
            marca = RE_VALLA.match(lineas[i].rstrip('\r\n')).group(1)
            j = i + 1
            while j < n:
                m = RE_VALLA.match(lineas[j].rstrip('\r\n'))
                if m and m.group(1)[0] == marca[0] and len(m.group(1)) >= len(marca):
                    j += 1
                    break
                j += 1
            cierra('codigo', i, j)
            i = j

        elif t == 'ancla':
            # Las anclas van ANTES del ### (25 casos en PLAN.md). Si detrás hay un encabezado, van
            # con él; si no, la placa acabaría en el jardín del vecino.
            j = i + 1
            while j < n and tipos[j] == 'blanco':
                j += 1
            if j < n and tipos[j] == 'encabezado':
                b = cierra('encabezado', i, j + 1)
                b.ancla = RE_ANCLA.match(lineas[i].rstrip('\r\n')).group(1)
                _mide_encabezado(b, lineas[j])
                i = j + 1
            else:
                cierra('prosa', i, i + 1)
                i += 1

        elif t == 'encabezado':
            b = cierra('encabezado', i, i + 1)
            _mide_encabezado(b, lineas[i])
            i += 1

        elif t == 'regla':
            cierra('regla', i, i + 1)
            i += 1

        elif t in ('tabla', 'cita'):
            j = i
            while j < n and tipos[j] == t:
                j += 1
            cierra(t, i, j)
            i = j

        elif t == 'item':                    # un ítem = su línea + las continuaciones más sangradas
            sangria = len(RE_ITEM.match(lineas[i].rstrip('\r\n')).group(1))
            j = i + 1
            while j < n and tipos[j] in ('prosa', 'item'):
                cruda = lineas[j].rstrip('\r\n')
                if len(cruda) - len(cruda.lstrip()) <= sangria:
                    break
                j += 1
            b = cierra('item', i, j)
            b.nivel = sangria
            i = j

        elif t == 'blanco':
            j = i
            while j < n and tipos[j] == 'blanco':
                j += 1
            cierra('blanco', i, j)
            i = j

        else:                                # prosa: líneas seguidas que no son nada de lo anterior
            j = i
            while j < n and tipos[j] == 'prosa':
                j += 1
            cierra('prosa', i, j)
            i = j

    bloques = _absorbe_blancos(bloques)
    assert ''.join(b.texto for b in bloques) == texto, 'el particionador ha perdido texto'
    assert all(b.texto for b in bloques), 'bloque vacío'
    return bloques


def _absorbe_blancos(bloques):
    """Las rachas de líneas en blanco NO son bloques: se pegan a la cola del anterior.

    Si fueran bloques propios acabarían en notas de sólo '\\n', y una nota en blanco es una nota
    borrada para el motor (invariante 2 de trocea()). Al principio del fichero, donde no hay
    anterior, se pegan a la cabeza del siguiente.
    """
    fuera = []
    for b in bloques:
        if b.tipo != 'blanco':
            fuera.append(b)
            continue
        if fuera:
            prev = fuera[-1]
            prev.texto += b.texto
            prev.i1 = b.i1
        else:
            fuera.append(b)                  # blanco inicial: se fusiona abajo con el siguiente
    if fuera and fuera[0].tipo == 'blanco':
        if len(fuera) > 1:
            fuera[1].texto = fuera[0].texto + fuera[1].texto
            fuera[1].i0 = fuera[0].i0
            fuera.pop(0)
        else:
            fuera[0].tipo = 'prosa'          # un fichero que es sólo líneas en blanco
    return fuera


def enlaces_de(texto):
    """Anclas `(#-bug-rs10)` citadas en un texto. Portador del grafo, derivado como sendero."""
    return RE_ENLACE_INT.findall(texto)


def esquema(bloques):
    """Esquema de encabezados: lo que la vuelta en modo `esqueleto` tiene que devolver clavado."""
    return [{'nivel': b.nivel, 'titulo': b.titulo, 'ancla': b.ancla,
             'estado': b.estado, 'ticket': b.ticket, 'fecha': b.fecha}
            for b in bloques if b.tipo == 'encabezado']


# ---------------------------------------------------------------- el árbol del documento

class Nodo(object):
    __slots__ = ('nivel', 'bloque', 'hijos', 'contenido')

    def __init__(self, nivel, bloque):
        self.nivel = nivel
        self.bloque = bloque
        self.hijos = []
        self.contenido = []


def arbol(bloques):
    """Bloques → árbol por nivel de encabezado. Cada bloque suelto cuelga del encabezado abierto."""
    raiz = Nodo(0, None)
    pila = [raiz]
    for b in bloques:
        if b.tipo == 'encabezado' and b.nivel:
            while len(pila) > 1 and pila[-1].nivel >= b.nivel:
                pila.pop()
            n = Nodo(b.nivel, b)
            pila[-1].hijos.append(n)
            pila.append(n)
        else:
            pila[-1].contenido.append(b)
    return raiz


def _rama(n):
    """Descendientes en orden de documento (preorden), sin el propio nodo."""
    out = []
    for h in n.hijos:
        out.append(h)
        out.extend(_rama(h))
    return out


def plano(raiz):
    """Árbol → [barrio][edificio][planta] = lista de bloques. ES el orden del documento, en 3 niveles.

    barrios[0] es siempre la PLAZA: lo que hay antes del primer encabezado de barrio (y el `#` del
    fichero, si hay uno solo que lo envuelve todo). Así ningún bloque se queda sin casa, que es lo
    que garantiza que la vuelta pueda concatenar y salir byte a byte.
    """
    if len(raiz.hijos) == 1 and not raiz.contenido:
        top = raiz.hijos[0]                  # un único `#` que envuelve el fichero ⇒ ES la isla
        plaza = [top.bloque] + top.contenido
        nodos = top.hijos
    else:
        plaza = list(raiz.contenido)         # sin `#`, o con varios: la isla es el documento
        nodos = raiz.hijos

    barrios = [[[plaza]]]                    # plaza: 1 edificio, 1 planta (puede ir vacía)
    for nb in nodos:
        edificios = [[[nb.bloque] + nb.contenido]]        # la sede del barrio: su propio `##`
        for ne in nb.hijos:
            plantas = [[ne.bloque] + ne.contenido]
            for nd in _rama(ne):                          # `####` y más hondo ⇒ plantas
                plantas.append([nd.bloque] + nd.contenido)
            edificios.append(plantas)
        barrios.append(edificios)
    return barrios


# ---------------------------------------------------------------- aritmética de la huella

def interior_planta(n_atriles):
    """Interior de una planta que aloje `n_atriles`: rejilla de COLS de ancho, paso 2 (atril+pasillo)."""
    if n_atriles <= 0:
        return (2, 2)
    cols = min(COLS, n_atriles)
    filas = -(-n_atriles // cols)
    return (max(2, cols * PASO_ATRIL), max(2, filas * PASO_ATRIL))


def pos_atril(i):
    """Índice de atril → (dx, dz) dentro del interior. Raster: x asc dentro de la fila, z asc."""
    return ((i % COLS) * PASO_ATRIL, (i // COLS) * PASO_ATRIL)


def empaqueta(tams, sep):
    """Empaqueta rectángulos EN ORDEN en estantes, y rellena todo hueco con el separador.

    Devuelve (posiciones, W, H). Los estantes se apilan en z y se llenan en x, así que el barrido
    raster (z ascendente, luego x ascendente) devuelve EXACTAMENTE el orden de entrada — que es lo
    único que hace falta para que la vuelta recupere el orden del documento sin índice escrito.

    Todo hueco (entre piezas, entre estantes, y la cola de un estante corto) queda de material
    separador, no de suelo: así la vuelta segmenta buscando «filas/columnas enteras de separador» y
    no tiene que adivinar dónde acaba una pieza y empieza el relleno.
    """
    if not tams:
        return [], sep, sep
    area = sum((w + sep) * (h + sep) for w, h in tams)
    objetivo = max(max(w for w, _ in tams), int(area ** 0.5))
    estantes, fila, ancho = [], [], 0
    for t in tams:
        if fila and ancho + sep + t[0] > objetivo:
            estantes.append(fila)
            fila, ancho = [], 0
        fila.append(t)
        ancho += (sep if ancho else 0) + t[0]
    if fila:
        estantes.append(fila)

    pos = []
    z = sep                                  # marco de separador por arriba
    W = 0
    for est in estantes:
        x = sep                              # ...y por la izquierda
        for w, h in est:
            pos.append((x, z))
            x += w + sep
        W = max(W, x)
        z += max(h for _, h in est) + sep
    return pos, W, z


def escalon_dim(lado):
    """Menor escalón de DIMS que aloje `lado`; si se pasa de 1024, se dice el número tal cual."""
    for d in DIMS:
        if d >= lado:
            return d
    return lado


# ---------------------------------------------------------------- segmentación (la vuelta)

def tramos(es_sep):
    """[bool] de «esta línea es toda separador» → tramos [ini, fin) de las que no lo son.

    Es la única operación de la vuelta: no hay visión artificial ni heurística, sólo materiales
    reservados. Si el dueño tira un muro, esto lo nota; si tira un canal, dos barrios se funden en
    uno y el sha256 de la placa lo delata.
    """
    out = []
    ini = None
    for i, s in enumerate(es_sep):
        if s:
            if ini is not None:
                out.append((ini, i))
                ini = None
        elif ini is None:
            ini = i
    if ini is not None:
        out.append((ini, len(es_sep)))
    return out


# ---------------------------------------------------------------- disco

def atomic_dump(d, path):
    """Copia de server.py:150. No se importa server.py: hace clean_trash() al importarlo."""
    tmp = '%s.tmp.%d.%d' % (path, os.getpid(), time.time_ns())
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def to_trash(fp, move=True):
    """Copia de server.py:138 (sin clean_trash: la poda es cosa del servidor). NADA se borra."""
    if not os.path.exists(fp):
        return
    os.makedirs(TRASH, exist_ok=True)
    dst = os.path.join(TRASH, '%d__%s' % (int(time.time() * 1000), os.path.basename(fp)))
    (shutil.move if move else shutil.copy2)(fp, dst)


SLUGS_VETADOS = ('default', 'mundo', 'test', 'agents')   # mundos vivos del repo: ni con --forzar


def slug_de(nombre):
    """Misma slugificación que world_file_for (server.py:100), para caer en el mismo fichero."""
    return re.sub(r'[^a-z0-9]+', '-', nombre.lower()).strip('-')


def fichero_de_mundo(nombre, salida=None):
    return os.path.join(salida or WORLDS, slug_de(nombre) + '.json')
