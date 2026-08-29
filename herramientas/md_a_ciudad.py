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
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

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
            # Altura base mínima según el tipo de sección / barrio
            texto_todo = ''.join(b.texto for p in plantas_bl for b in p)
            if re.search(r'redstone', texto_todo, re.I):
                alto = max(alto, 4)
            elif re.search(r'rendimiento|perf', texto_todo, re.I):
                alto = max(alto, 3)
            elif re.search(r'bug|fallo', texto_todo, re.I):
                alto = max(alto, 2)
            elif re.search(r'req|requerimiento|mejora', texto_todo, re.I):
                alto = max(alto, 2)
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


# Tinte del cartel según tipo de ticket (coincidente con colores de post-it / paleta de carteles):
#   BUG  -> Rosa / Rojo claro (#ffb3c1)
#   REQ  -> Amarillo / Dorado (#ffe066)
#   PERF -> Naranja (#ffc078)
#   DOC  -> Azul (#8fd3ff)
#   AG / OTRO -> Violeta (#d0bfff)
TINTES_TICKET = {
    'BUG': '#ffb3c1',
    'REQ': '#ffe066',
    'PERF': '#ffc078',
    'DOC': '#8fd3ff',
    'AG': '#d0bfff',
    'SNP': '#d0bfff',
    'TOOL': '#ffe066',
}

RE_TICKET_TIPO = re.compile(r'\b(BUG|REQ|PERF|DOC|AG|SNP|TOOL)-[A-Z0-9]+\b')

def tinte_de_texto(texto):
    """Devuelve el tinte hex del cartel si el texto contiene un ID de ticket, o None."""
    m = RE_TICKET_TIPO.search(texto)
    if m:
        tipo = m.group(1)
        return TINTES_TICKET.get(tipo, '#ffe066')
    return None


# Temas visuales de cada isla según el título de la sección:
#   jardín: material decorativo de la superficie del lote / parque
#   muro: material de las paredes de edificios
#   roca/tierra: cimientos
#   dy: elevación del terreno por encima o por debajo del estándar (y=GH)
TEMAS_ISLA = [
    # (regex_coincidencia, dict_tema)
    (re.compile(r'plaza|# plan', re.I),
     {'jardin': C.SUELO_HIERBA, 'muro': C.mat('arenisca'), 'dy': 0, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}),
    (re.compile(r'base disponible|precedente', re.I),
     {'jardin': C.mat('musgo_adoquin'), 'muro': C.mat('ladrillo_piedra'), 'dy': 1, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}),
    (re.compile(r'decisiones|invariante', re.I),
     {'jardin': C.mat('arena'), 'muro': C.mat('arenisca'), 'dy': 2, 'cimientos_roca': C.mat('arenisca'), 'cimientos_tierra': C.mat('arena')}),
    (re.compile(r'fases', re.I),
     {'jardin': C.SUELO_HIERBA, 'muro': C.mat('madera'), 'dy': 1, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}),
    (re.compile(r'índice|indice', re.I),
     {'jardin': C.mat('tablones'), 'muro': C.mat('tronco'), 'dy': 0, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.mat('madera')}),
    (re.compile(r'cerrado|archivo', re.I),
     {'jardin': C.mat('grava'), 'muro': C.mat('obsidiana'), 'dy': -2, 'cimientos_roca': C.mat('obsidiana'), 'cimientos_tierra': C.SUELO_ROCA}),
    (re.compile(r'bug|error|fallo', re.I),
     {'jardin': C.mat('red_concrete'), 'muro': C.mat('ladrillo'), 'dy': 3, 'cimientos_roca': C.mat('obsidiana'), 'cimientos_tierra': C.mat('red_concrete')}),
    (re.compile(r'req|requerimiento|mejora|feature', re.I),
     {'jardin': C.mat('yellow_concrete'), 'muro': C.mat('arenisca'), 'dy': 2, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.mat('yellow_concrete')}),
    (re.compile(r'backlog|ola', re.I),
     {'jardin': C.mat('musgo_adoquin'), 'muro': C.mat('madera'), 'dy': -1, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}),
    (re.compile(r'redstone', re.I),
     {'jardin': C.mat('red_concrete'), 'muro': C.mat('ladrillo_piedra'), 'dy': 4, 'cimientos_roca': C.mat('obsidiana'), 'cimientos_tierra': C.mat('red_concrete')}),
    (re.compile(r'rendimiento|perf', re.I),
     {'jardin': C.mat('obsidiana'), 'muro': C.mat('ladrillo_piedra'), 'dy': 3, 'cimientos_roca': C.mat('obsidiana'), 'cimientos_tierra': C.SUELO_ROCA}),
    (re.compile(r'bitácora|bitacora', re.I),
     {'jardin': C.mat('tablones'), 'muro': C.mat('madera'), 'dy': 0, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}),
]

TEMA_DEFECTO = {'jardin': C.SUELO_HIERBA, 'muro': C.MURO, 'dy': 0, 'cimientos_roca': C.SUELO_ROCA, 'cimientos_tierra': C.SUELO_TIERRA}

def tema_de_barrio(b):
    """Obtiene el tema visual según el texto del encabezado del barrio."""
    texto_cab = ''
    if b.edificios and b.edificios[0].plantas and b.edificios[0].plantas[0].atriles:
        texto_cab = b.edificios[0].plantas[0].atriles[0]
    for rx, tema in TEMAS_ISLA:
        if rx.search(texto_cab):
            return tema
    return TEMA_DEFECTO


class Lienzo(object):
    """Dict disperso {"x,y,z": "tex:<clave>"}. Lo densifica voxfmt.desde_v1, que ya existe."""

    def __init__(self):
        self.vox = {}
        self.notes = {}
        self.noteTints = {}

    def set(self, x, y, z, clave):
        self.vox['%d,%d,%d' % (x, y, z)] = 'tex:' + clave

    def borra(self, x, y, z):
        self.vox.pop('%d,%d,%d' % (x, y, z), None)

    def caja(self, x0, z0, w, h, y, clave):
        for z in range(z0, z0 + h):
            for x in range(x0, x0 + w):
                self.set(x, y, z, clave)

    def nota(self, x, y, z, texto, tinte=None):
        self.set(x, y, z, C.ATRIL)
        k = '%d,%d,%d' % (x, y, z)
        self.notes[k] = texto
        tin = tinte or tinte_de_texto(texto)
        if tin:
            self.noteTints[k] = tin


def pinta_terreno(li, W, H, ox, oz, barrios):
    """Bases de islas escalonadas con colores temáticos visibles sobre el agua, fondo somero y canales bajos."""
    # 1. Lecho marino somero de arena/roca (y<=11) y UN ÚNICO nivel de agua profunda en los canales/mar (y=12)
    for y in range(0, C.SUELO_MAR_Y + 1):
        li.caja(ox, oz, W, H, y, C.SUELO_ROCA if y < C.SUELO_MAR_Y else C.SUELO_ARENA)
    li.caja(ox, oz, W, H, C.AGUA_Y, C.SEP_MAR)

    # 2. Islas independientes con cimientos temáticos y bases escalonadas
    for b in barrios:
        tema = tema_de_barrio(b)
        bx, bz = ox + b.x, oz + b.z
        c_roca = tema['cimientos_roca']
        c_tierra = tema['cimientos_tierra']
        
        # Nivel 1 bajo el agua / lecho (y<=11): cimientos de roca temática
        for y in range(0, C.SUELO_MAR_Y + 1):
            li.caja(bx, bz, b.w, b.h, y, c_roca)

        # Nivel 2 al ras del agua (y=AGUA_Y=12): escalón de roca/cimientos que emerge del agua
        li.caja(bx, bz, b.w, b.h, C.AGUA_Y, c_roca)
            
        # Nivel 3 sobre el agua (y=13): escalón intermedio con el color secundario de la temática (tierra/base)
        li.caja(bx, bz, b.w, b.h, C.GH - 1, c_tierra)

        # Nivel 4 portador (y=GH=14): suelo de la isla (calles de adoquín portador)
        li.caja(bx, bz, b.w, b.h, C.GH, C.SEP_PARCELA)


def pinta_edificio(li, e, ox, oz, tema=None):
    """Parcela + edificio + atriles con jardín y muros según el tema de la isla y altura de planta."""
    tema = tema or TEMA_DEFECTO
    mat_jardin = tema['jardin']
    mat_muro = tema['muro']

    # La capa y=GH es la PORTADORA (jardín de la parcela + forjado del edificio)
    li.caja(ox, oz, e.w, e.h, C.GH, mat_jardin)           # jardín del tema
    ex, ez = ox + 1, oz + 1                               # esquina del edificio
    ew, eh = e.iw + 2, e.ih + 2
    li.caja(ex, ez, ew, eh, C.GH, C.ATRIL)                # forjado de planta baja

    total_atriles = sum(len(p.atriles) for p in e.plantas)

    # Si sólo hay 1 cartel en todo el edificio (común en esqueleto/secciones cortas),
    # no creamos un edificio hueco con muros y tejado: se pone al aire libre como monumento/atril abierto.
    if total_atriles <= 1:
        for k, planta in enumerate(e.plantas):
            base = C.GH + C.ALTO_PLANTA * k
            for i, texto in enumerate(planta.atriles):
                dx, dz = C.pos_atril(i)
                li.nota(ex + 1 + dx, base + 1, ez + 1 + dz, texto)
        return

    n = len(e.plantas)
    for k, planta in enumerate(e.plantas):
        base = C.GH + C.ALTO_PLANTA * k
        for y in range(base + 1, base + C.ALTO_PLANTA):   # muros de la planta
            for x in range(ex, ex + ew):
                li.set(x, y, ez, mat_muro)
                li.set(x, y, ez + eh - 1, mat_muro)
            for z in range(ez, ez + eh):
                li.set(ex, y, z, mat_muro)
                li.set(ex + ew - 1, y, z, mat_muro)
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


def pinta_puentes(li, barrios, ox, oz):
    """DERIVADO: puentes peatonales a nivel de suelo (y=GH) para cruzar caminando sin tener que saltar."""
    puestos = 0
    ancho_p = 2  # ancho del puente para caminar con holgura
    y_tablero = C.GH  # tablero al mismo nivel del suelo (y=GH=14) para paso continuo

    for i in range(len(barrios)):
        b1 = barrios[i]
        b1_x0, b1_x1 = ox + b1.x, ox + b1.x + b1.w
        b1_z0, b1_z1 = oz + b1.z, oz + b1.z + b1.h

        for j in range(i + 1, len(barrios)):
            b2 = barrios[j]
            b2_x0, b2_x1 = ox + b2.x, ox + b2.x + b2.w
            b2_z0, b2_z1 = oz + b2.z, oz + b2.z + b2.h

            # ¿Vecinos en X?
            solap_z0 = max(b1_z0, b2_z0)
            solap_z1 = min(b1_z1, b2_z1)
            dist_x = min(abs(b1_x0 - b2_x1), abs(b2_x0 - b1_x1)) if (b1_x1 <= b2_x0 or b2_x1 <= b1_x0) else 999

            if dist_x <= C.ANCHO_CANAL + 2 and (solap_z1 - solap_z0) >= ancho_p:
                x_ini = min(b1_x1, b2_x1)
                x_fin = max(b1_x0, b2_x0)
                z_mid = (solap_z0 + solap_z1 - ancho_p) // 2
                for x in range(x_ini, x_fin):
                    for dz in range(ancho_p):
                        z = z_mid + dz
                        # Tablero del puente a ras de suelo en y=GH
                        li.set(x, y_tablero, z, C.PUENTE)
                        # Soporte bajo el puente
                        for yp in range(C.AGUA_Y, C.GH):
                            li.set(x, yp, z, C.mat('ladrillo_piedra'))
                        puestos += 1
                    # Barandillas laterales en y=GH+1
                    li.set(x, y_tablero + 1, z_mid - 1, C.PUENTE_BARANDILLA)
                    li.set(x, y_tablero + 1, z_mid + ancho_p, C.PUENTE_BARANDILLA)

            # ¿Vecinos en Z?
            solap_x0 = max(b1_x0, b2_x0)
            solap_x1 = min(b1_x1, b2_x1)
            dist_z = min(abs(b1_z0 - b2_z1), abs(b2_z0 - b1_z1)) if (b1_z1 <= b2_z0 or b2_z1 <= b1_z0) else 999

            if dist_z <= C.ANCHO_CANAL + 2 and (solap_x1 - solap_x0) >= ancho_p:
                z_ini = min(b1_z1, b2_z1)
                z_fin = max(b1_z0, b2_z0)
                x_mid = (solap_x0 + solap_x1 - ancho_p) // 2
                for z in range(z_ini, z_fin):
                    for dx in range(ancho_p):
                        x = x_mid + dx
                        # Tablero del puente a ras de suelo en y=GH
                        li.set(x, y_tablero, z, C.PUENTE)
                        # Soporte bajo el puente
                        for yp in range(C.AGUA_Y, C.GH):
                            li.set(x, yp, z, C.mat('ladrillo_piedra'))
                        puestos += 1
                    # Barandillas laterales en y=GH+1
                    li.set(x_mid - 1, y_tablero + 1, z, C.PUENTE_BARANDILLA)
                    li.set(x_mid + ancho_p, y_tablero + 1, z, C.PUENTE_BARANDILLA)

    return puestos

    return puestos


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
    pinta_terreno(li, W, H, ox, oz, barrios)
    n_puentes = pinta_puentes(li, barrios, ox, oz)
    puertas = {}
    for b in barrios:
        tema = tema_de_barrio(b)
        bx, bz = ox + b.x, oz + b.z
        for e in b.edificios:
            pinta_edificio(li, e, bx + e.x, bz + e.z, tema)
            if e.ancla:
                puertas[e.ancla] = puerta_de(li, e, bx + e.x, bz + e.z)
    n_sendero = pinta_senderos(li, puertas, barrios, ox, oz) if enlaces == 'carreteras' else 0
    n_farola = pinta_farolas(li, barrios, ox, oz)
    return li, ox, oz, n_sendero, n_farola, n_puentes


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

    li, ox, oz, n_sendero, n_farola, n_puentes = pinta(barrios, W, H, dim, args.enlaces)

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
    print('  derivado  %d de sendero   %d farolas   %d bloques puente'
          % (n_sendero, n_farola, n_puentes))

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
           'noteRots': {}, 'noteTints': li.noteTints}
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
