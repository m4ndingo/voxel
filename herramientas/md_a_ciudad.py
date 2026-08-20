#!/usr/bin/env python3
"""Ciudad-MD · la IDA: un fichero .md → un mundo de VoxelForge que se puede pisar.

    python3 herramientas/md_a_ciudad.py PLAN.md                       # sólo informa
    python3 herramientas/md_a_ciudad.py PLAN.md --escribe              # -> /map/plan
    python3 herramientas/md_a_ciudad.py PLAN.md --fidelidad=exacta --escribe

SIN --escribe NO ESCRIBE NADA (estilo de herramientas/marca_notas_procesadas.py): imprime bloques,
trozos, dimensión elegida, notas y presupuesto de carteles, y se calla.

Cómo se compone la ciudad y por qué (la regla PORTADOR/DERIVADO) → docs/ciudad-md.md.
La vuelta es herramientas/ciudad_a_md.py; las dos comparten herramientas/ciudad_comun.py, que es
lo que impide que se desincronicen.
"""
import argparse
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ciudad_comun as C                                          # noqa: E402
from ciudad_comun import voxfmt                                   # noqa: E402

MARCA = '⛩ CIUDAD-MD v1'      # 1ª línea de la placa del obelisco: la vuelta la reconoce y la salta
BYTES_POR_PLANTA = 1200        # cuánto texto «pesa» una planta, para la altura derivada
MAX_PLANTAS_DERIVADAS = 6


# ---------------------------------------------------------------- el plano, con medidas

class Planta(object):
    __slots__ = ('atriles',)

    def __init__(self, atriles):
        self.atriles = atriles


class Edificio(object):
    __slots__ = ('plantas', 'iw', 'ih', 'w', 'h', 'x', 'z', 'estado', 'ancla', 'enlaces')

    def __init__(self, plantas, estado, ancla, enlaces):
        self.plantas = plantas
        self.estado, self.ancla, self.enlaces = estado, ancla, enlaces
        self.remide()

    def remide(self):
        n = max([len(p.atriles) for p in self.plantas] + [0])
        self.iw, self.ih = C.interior_planta(n)
        self.w, self.h = self.iw + 4, self.ih + 4     # +2 muros, +2 jardín ⇒ la parcela


class Barrio(object):
    __slots__ = ('edificios', 'w', 'h', 'x', 'z')

    def __init__(self, edificios):
        self.edificios = edificios


def _trozos_de(bloques, fidelidad):
    """Bloques de una planta → textos de sus atriles. Aquí es donde manda --fidelidad."""
    if fidelidad == 'esqueleto':
        bloques = [b for b in bloques if b.tipo == 'encabezado']
    trozos = []
    for b in bloques:
        trozos.extend(C.trocea(b.texto))
    return trozos


def compone(barrios_bloques, fidelidad):
    """[barrio][edificio][planta] de bloques → objetos con huella medida y posición asignada.

    El atril 0 de la plaza queda RESERVADO para la placa del obelisco: se reserva aquí, antes de
    medir la huella, o el edificio de la plaza saldría con un atril menos del que va a necesitar.
    """
    barrios = []
    for eds in barrios_bloques:
        edificios = []
        for plantas_bl in eds:
            cab = next((b for p in plantas_bl for b in p if b.tipo == 'encabezado'), None)
            enlaces = C.enlaces_de(''.join(b.texto for p in plantas_bl for b in p))
            plantas = [Planta(_trozos_de(p, fidelidad)) for p in plantas_bl]
            # DERIVADO: la altura sale del tamaño de la sección, para que el perfil de la ciudad
            # cuente algo desde el aire. La vuelta la ignora por completo.
            peso = sum(len(b.texto) for p in plantas_bl for b in p)
            alto = min(MAX_PLANTAS_DERIVADAS, 1 + peso // BYTES_POR_PLANTA)
            while len(plantas) < alto:
                plantas.append(Planta([]))
            edificios.append(Edificio(plantas, cab.estado if cab else '',
                                      cab.ancla if cab else '', enlaces))
        barrios.append(Barrio(edificios))

    plaza = barrios[0].edificios[0]
    plaza.plantas[0].atriles.insert(0, MARCA)          # sitio para la placa; se reescribe al pintar
    plaza.remide()

    for b in barrios:                                     # parcelas dentro del barrio
        pos, b.w, b.h = C.empaqueta([(e.w, e.h) for e in b.edificios], C.ANCHO_CALLE)
        for e, (x, z) in zip(b.edificios, pos):
            e.x, e.z = x, z
    pos, W, H = C.empaqueta([(b.w, b.h) for b in barrios], C.ANCHO_CANAL)
    for b, (x, z) in zip(barrios, pos):
        b.x, b.z = x, z
    return barrios, W, H


# ---------------------------------------------------------------- pintar

class Lienzo(object):
    """Dict disperso {"x,y,z": "tex:<clave>"}. Lo densifica voxfmt.desde_v1, que ya existe."""

    def __init__(self):
        self.vox = {}
        self.notes = {}

    def set(self, x, y, z, clave):
        self.vox['%d,%d,%d' % (x, y, z)] = 'tex:' + clave

    def borra(self, x, y, z):
        self.vox.pop('%d,%d,%d' % (x, y, z), None)

    def caja(self, x0, z0, w, h, y, clave):
        for z in range(z0, z0 + h):
            for x in range(x0, x0 + w):
                self.set(x, y, z, clave)

    def nota(self, x, y, z, texto):
        self.set(x, y, z, C.ATRIL)
        self.notes['%d,%d,%d' % (x, y, z)] = texto


def pinta_terreno(li, W, H, ox, oz):
    """Roca, tierra y el mar. La capa y=GH la reescriben luego barrios y parcelas."""
    for y in range(0, C.GH):
        clave = C.SUELO_ROCA if y < 11 else C.SUELO_TIERRA
        li.caja(ox, oz, W, H, y, clave)
    li.caja(ox, oz, W, H, C.GH, C.SEP_MAR)                # todo hueco del nivel isla ES mar


def pinta_edificio(li, e, ox, oz):
    """Parcela + edificio + atriles. La parcela es el edificio con 1 de jardín alrededor."""
    li.caja(ox, oz, e.w, e.h, C.GH, C.SUELO_HIERBA)       # jardín
    ex, ez = ox + 1, oz + 1                               # esquina del edificio
    ew, eh = e.iw + 2, e.ih + 2
    li.caja(ex, ez, ew, eh, C.GH, C.ATRIL)                # forjado de planta baja

    n = len(e.plantas)
    for k, planta in enumerate(e.plantas):
        base = C.GH + C.ALTO_PLANTA * k
        for y in range(base + 1, base + C.ALTO_PLANTA):   # muros de la planta
            for x in range(ex, ex + ew):
                li.set(x, y, ez, C.MURO)
                li.set(x, y, ez + eh - 1, C.MURO)
            for z in range(ez, ez + eh):
                li.set(ex, y, z, C.MURO)
                li.set(ex + ew - 1, y, z, C.MURO)
        # techo: los de en medio son forjado (PORTADOR: separan plantas); el de arriba, tejado
        techo = C.SEP_PLANTA if k < n - 1 else C.TEJADOS.get(e.estado, C.TEJADOS[''])
        li.caja(ex, ez, ew, eh, base + C.ALTO_PLANTA, techo)
        for i, texto in enumerate(planta.atriles):
            dx, dz = C.pos_atril(i)
            li.nota(ex + 1 + dx, base + 1, ez + 1 + dz, texto)

    puerta = ex + ew // 2                                 # DERIVADO: por donde se entra
    for y in range(C.GH + 1, C.GH + 1 + C.ALTO_PUERTA):
        li.borra(puerta, y, ez)


def puerta_de(li, e, ox, oz):
    """(x, z) de la calle justo delante de la puerta del edificio. Origen de senderos y farolas."""
    return (ox + 1 + (e.iw + 2) // 2, oz - 1)


def pinta_senderos(li, puertas, barrios, ox, oz):
    """DERIVADO: los enlaces internos `(#-bug-rs10)`, de puerta a puerta.

    ⛔ El sendero se pinta en y=GH+1, NUNCA en y=GH. La capa y=GH es la PORTADORA: una sola celda
    de grava en mitad de una calle rompería la columna de adoquín y la vuelta ya no sabría dónde
    acaba una parcela. Sobre el canal, el sendero sale gratis como pasarela.
    """
    y = C.GH + 1
    puesto = 0
    for e in (e for b in barrios for e in b.edificios):
        if not e.ancla or e.ancla not in puertas:
            continue
        ax, az = puertas[e.ancla]
        for destino in e.enlaces:
            if destino == e.ancla or destino not in puertas:
                continue
            bx, bz = puertas[destino]
            tramo = ([(ax, z) for z in range(min(az, bz), max(az, bz) + 1)] +
                     [(x, bz) for x in range(min(ax, bx), max(ax, bx) + 1)])
            for x, z in tramo:
                if li.vox.get('%d,%d,%d' % (x, C.GH, z)) in (
                        'tex:' + C.SEP_PARCELA, 'tex:' + C.SEP_MAR) \
                        and '%d,%d,%d' % (x, y, z) not in li.vox:
                    li.set(x, y, z, C.SENDERO)
                    puesto += 1
    return puesto


def pinta_farolas(li, barrios, ox, oz):
    """DERIVADO: una farola en la esquina de cada parcela. También vive por encima de y=GH."""
    n = 0
    for b in barrios:
        for e in b.edificios:
            x, z = ox + b.x + e.x - 1, oz + b.z + e.z - 1
            if li.vox.get('%d,%d,%d' % (x, C.GH, z)) != 'tex:' + C.SEP_PARCELA:
                continue
            for y in range(C.GH + 1, C.GH + 4):
                li.set(x, y, z, C.FAROLA_POSTE)
            li.set(x, C.GH + 4, z, C.FAROLA_LUZ)
            n += 1
    return n


def pinta(barrios, W, H, dim, enlaces):
    li = Lienzo()
    ox = (dim[0] - W) // 2
    oz = (dim[2] - H) // 2
    pinta_terreno(li, W, H, ox, oz)
    puertas = {}
    for b in barrios:
        bx, bz = ox + b.x, oz + b.z
        li.caja(bx, bz, b.w, b.h, C.GH, C.SEP_PARCELA)    # todo hueco del barrio ES calle
        for e in b.edificios:
            pinta_edificio(li, e, bx + e.x, bz + e.z)
            if e.ancla:
                puertas[e.ancla] = puerta_de(li, e, bx + e.x, bz + e.z)
    n_sendero = pinta_senderos(li, puertas, barrios, ox, oz) if enlaces == 'carreteras' else 0
    n_farola = pinta_farolas(li, barrios, ox, oz)
    return li, ox, oz, n_sendero, n_farola


# ---------------------------------------------------------------- el mundo

def dimension(W, H, barrios, forzada):
    if forzada:
        return forzada
    lado = C.escalon_dim(max(W, H) + 2)
    plantas = max([len(e.plantas) for b in barrios for e in b.edificios] + [1])
    alto = C.GH + C.ALTO_PLANTA * plantas + 8
    return (lado, max(48, -(-alto // 16) * 16), lado)


def placa(ruta, crudo, args, dim, n_notas):
    """Metadatos → la PLACA DEL OBELISCO, que es una nota.

    ⛔ Nada de claves nuevas en la cabecera del mundo: POST /api/mundo la reconstruye con
    voxfmt.desde_v1 y sólo conserva spawn/structures/notes/noteRots/noteTints
    (servidor/voxfmt.py:129-139), así que una clave inventada se evaporaría en el primer
    autoguardado del navegador. En una nota, en cambio, sobrevive.
    """
    return '\n'.join([
        MARCA,
        'fuente: %s' % os.path.basename(ruta),
        'bytes: %d' % len(crudo),
        'sha256: %s' % hashlib.sha256(crudo).hexdigest()[:32],
        'fidelidad: %s' % args.fidelidad,
        'enlaces: %s' % args.enlaces,
        'dim: %dx%dx%d' % dim,
        'notas: %d' % n_notas,
    ])


def main(argv=None):
    p = argparse.ArgumentParser(description='Renderiza un .md como ciudad de voxels.')
    p.add_argument('md', help='fichero markdown de entrada')
    p.add_argument('--fidelidad', choices=('esqueleto', 'exacta'), default='esqueleto',
                   help='esqueleto: sólo encabezados (por defecto). exacta: el .md entero, byte a byte')
    # `carteles` estaba en el plan y se ha caído a propósito: una nota es PORTADORA, así que un
    # cartel de enlace se colaría en la concatenación de la vuelta y corrompería el .md. Los
    # enlaces son DERIVADOS y sólo pueden vivir donde no estorben (senderos por encima de y=GH).
    p.add_argument('--enlaces', choices=('carreteras', 'no'), default='carreteras',
                   help='carreteras: sendero de grava de puerta a puerta por cada enlace interno')
    p.add_argument('--mundo', help='nombre del mundo (por defecto, el del fichero)')
    p.add_argument('--dim', help='WxHxD, fuerza la dimensión')
    p.add_argument('--salida', help='carpeta destino (por defecto data/worlds)')
    p.add_argument('--escribe', action='store_true', help='sin esto no se escribe nada')
    p.add_argument('--forzar', action='store_true', help='sobrescribir un mundo que ya existe')
    args = p.parse_args(argv)

    with open(args.md, 'rb') as f:
        crudo = f.read()
    texto = crudo.decode('utf-8')

    bloques = C.particiona(texto)
    barrios_bl = C.plano(C.arbol(bloques))
    barrios, W, H = compone(barrios_bl, args.fidelidad)

    dim = None
    if args.dim:
        dim = tuple(int(v) for v in args.dim.lower().split('x'))
        if len(dim) != 3:
            p.error('--dim quiere WxHxD, p.ej. 384x48x384')
    dim = dimension(W, H, barrios, dim)
    if max(W, H) + 2 > min(dim[0], dim[2]):
        p.error('la ciudad mide %dx%d y no cabe en --dim %dx%dx%d' % ((W, H) + dim))

    li, ox, oz, n_sendero, n_farola = pinta(barrios, W, H, dim, args.enlaces)

    # La placa va en el atril 0 de la planta 0 del edificio 0 de la plaza: el PRIMERO del barrido
    # raster, así la vuelta la encuentra sin buscarla.
    plaza = barrios[0].edificios[0]
    px = ox + barrios[0].x + plaza.x + 2
    pz = oz + barrios[0].z + plaza.z + 2
    clave = '%d,%d,%d' % (px, C.GH + 1, pz)
    if li.notes.get(clave) != MARCA:
        p.error('la plaza no tiene sitio para la placa (esto es un fallo del trazado)')
    li.notes[clave] = placa(args.md, crudo, args, dim, len(li.notes))
    for y in range(C.GH + C.ALTO_PLANTA * len(plaza.plantas) + 1, dim[1] - 1):
        li.set(px, y, pz, C.OBELISCO)                     # DERIVADO: el hito que se ve desde lejos

    nombre = args.mundo or os.path.splitext(os.path.basename(args.md))[0]
    slug = C.slug_de(nombre)
    if slug in C.SLUGS_VETADOS:
        p.error('«%s» es un mundo vivo del repo: elige otro nombre con --mundo' % slug)
    wf = C.fichero_de_mundo(nombre, args.salida)

    n_atriles = sum(len(pl.atriles) for b in barrios for e in b.edificios for pl in e.plantas)
    print('%s → %s' % (args.md, wf))
    print('  bloques   %d   atriles %d   notas %d   (%d serán cartel 3D de %d)'
          % (len(bloques), n_atriles, len(li.notes),
             min(len(li.notes), C.MC_NOTE_SIGN_MAX), C.MC_NOTE_SIGN_MAX))
    print('  barrios   %d   edificios %d   fidelidad %s'
          % (len(barrios), sum(len(b.edificios) for b in barrios), args.fidelidad))
    print('  ciudad    %dx%d   dim %dx%dx%d   .vox %.2f MB'
          % (W, H, dim[0], dim[1], dim[2], dim[0] * dim[1] * dim[2] * 2 / 1e6))
    print('  derivado  %d de sendero   %d farolas   (nada de esto lo lee la vuelta)'
          % (n_sendero, n_farola))

    if not args.escribe:
        print('  (sin --escribe no se ha escrito nada)')
        return 0

    if os.path.exists(wf) and not args.forzar:
        print('  ⛔ %s ya existe; --forzar para sobrescribir (va a papelera antes)' % wf)
        return 1

    # Se aparece en la calle, frente a la puerta de la plaza y mirando al obelisco: dentro del
    # edificio el interior mínimo es de 4×2 y se nace empotrado en el muro del fondo.
    puerta_x = ox + barrios[0].x + plaza.x + 1 + (plaza.iw + 2) // 2
    puerta_z = oz + barrios[0].z + plaza.z - 1

    doc = {'format': 'voxelworld-1',
           'dim': {'x': dim[0], 'y': dim[1], 'z': dim[2]},
           'spawn': {'x': puerta_x + 0.5, 'y': C.GH + 1.0, 'z': puerta_z + 0.5},
           'voxels': li.vox, 'structures': [], 'notes': li.notes,
           'noteRots': {}, 'noteTints': {}}
    par = voxfmt.desde_v1(doc)
    if not par:
        print('  ⛔ voxfmt ha rechazado el mundo')
        return 1
    cab, datos = par
    os.makedirs(os.path.dirname(wf), exist_ok=True)
    voxfmt.escribir(wf, cab, datos, C.atomic_dump, C.to_trash)
    print('  ✅ escrito. Míralo en /map/%s?noauto=1  (el ?noauto=1 evita que el autoguardado '
          'lo reescriba mientras lo miras)' % slug)
    return 0


if __name__ == '__main__':
    sys.exit(main())
