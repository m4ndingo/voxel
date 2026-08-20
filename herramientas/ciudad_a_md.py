#!/usr/bin/env python3
"""Ciudad-MD · la VUELTA: un mundo de VoxelForge → el fichero .md que lo generó.

    python3 herramientas/ciudad_a_md.py plan                     # el .md por stdout
    python3 herramientas/ciudad_a_md.py plan --verifica PLAN.md   # byte a byte; sale 1 si difiere

No es un renderizador: es una CONCATENACIÓN. Por eso con --fidelidad=exacta vuelve byte a byte, con
sus CRLF, sus espacios en cola, sus líneas en blanco de más y su ausencia de \\n final.

Sólo lee dos cosas del mundo, las dos PORTADORAS (docs/ciudad-md.md):
  · la partición del suelo en y=GH por materiales separadores reservados ⇒ el orden y el anidamiento;
  · las notas ⇒ el texto.
Todo lo demás (alturas, tejados, canales, farolas, senderos, el obelisco) es DERIVADO y se ignora
aquí a propósito: por eso se puede rehacer entero el aspecto de la ciudad sin tocar la vuelta.
"""
import argparse
import array
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ciudad_comun as C                                          # noqa: E402
from ciudad_comun import voxfmt                                   # noqa: E402
from md_a_ciudad import MARCA                                     # noqa: E402


class Capa(object):
    """La capa y=GH del mundo, ya resuelta a claves de material. Es lo único que se segmenta."""

    def __init__(self, cab, datos):
        d = cab['dim']
        self.dx, self.dy, self.dz = d['x'], d['y'], d['z']
        pal = cab.get('palette') or []
        g = array.array('H')
        g.frombytes(datos)
        if sys.byteorder != 'little':
            g.byteswap()
        base = C.GH * self.dx                     # idx = x + y*dx + z*dx*dy, igual que mcIdx
        paso = self.dx * self.dy
        self.celda = []
        for z in range(self.dz):
            fila = []
            off = base + z * paso
            for x in range(self.dx):
                n = g[off + x]
                fila.append(pal[n] if 0 < n < len(pal) else None)
            self.celda.append(fila)

    def sep(self, x, z, claves):
        """El aire cuenta como separador: fuera de la isla no hay nada, y eso también separa."""
        c = self.celda[z][x]
        return c is None or c in claves


def _parte(capa, x0, x1, z0, z1, claves):
    """Rectángulo → sub-rectángulos, cortando por filas y columnas ENTERAS de material separador.

    Primero en z (bandas) y luego en x, que es justo el orden inverso al que empaqueta() usó para
    colocar: el resultado sale en orden de documento sin que haya índice escrito en ninguna parte.
    """
    filas = [all(capa.sep(x, z, claves) for x in range(x0, x1)) for z in range(z0, z1)]
    fuera = []
    for a, b in C.tramos(filas):
        cols = [all(capa.sep(x, z, claves) for z in range(z0 + a, z0 + b)) for x in range(x0, x1)]
        for c, d in C.tramos(cols):
            fuera.append((x0 + c, x0 + d, z0 + a, z0 + b))
    return fuera


def parcelas(capa):
    """Mundo → parcelas en orden de documento. Dos cortes: mar/canal (##) y luego calle (###)."""
    fuera = []
    for bx0, bx1, bz0, bz1 in _parte(capa, 0, capa.dx, 0, capa.dz, {C.SEP_BARRIO}):
        fuera.extend(_parte(capa, bx0, bx1, bz0, bz1, {C.SEP_PARCELA}))
    return fuera


def notas_por_parcela(notes, celdas):
    """Notas → (parcela, texto) en orden. Dentro de una parcela: y ascendente, luego z, luego x.

    Ese orden ES el de escritura (plantas de abajo arriba, atriles en raster), así que concatenar
    devuelve el documento. Una nota que no cae en ninguna parcela es un error duro: significa que
    alguien ha tirado un muro o un canal y la ciudad ya no dice lo que dice el .md.
    """
    dentro = [[] for _ in celdas]
    huerfanas = []
    for clave, texto in notes.items():
        try:
            x, y, z = (int(v) for v in clave.split(','))
        except ValueError:
            huerfanas.append((clave, texto))
            continue
        for i, (x0, x1, z0, z1) in enumerate(celdas):
            if x0 <= x < x1 and z0 <= z < z1:
                dentro[i].append((y, z, x, texto))
                break
        else:
            huerfanas.append((clave, texto))
    fuera = []
    for lista in dentro:
        lista.sort()
        fuera.extend(t for _, _, _, t in lista)
    return fuera, huerfanas


def lee_placa(texto):
    """La 1ª nota del barrido raster es la placa del obelisco. Dice con qué reglas se generó."""
    if not texto.startswith(MARCA):
        return None
    meta = {}
    for linea in texto.split('\n')[1:]:
        if ':' in linea:
            k, v = linea.split(':', 1)
            meta[k.strip()] = v.strip()
    return meta


def main(argv=None):
    p = argparse.ArgumentParser(description='Regenera el .md a partir de su ciudad de voxels.')
    p.add_argument('mundo', help='nombre o slug del mundo (data/worlds/<slug>.json)')
    p.add_argument('--salida', help='carpeta donde vive el mundo (por defecto data/worlds)')
    p.add_argument('--verifica', help='compara byte a byte con este .md; sale 1 si difiere')
    p.add_argument('--tolerante', action='store_true',
                   help='las notas huérfanas pasan de error duro a aviso por stderr')
    args = p.parse_args(argv)

    wf = C.fichero_de_mundo(args.mundo, args.salida)
    cab = voxfmt.leer_cabecera(wf)
    if not cab or not voxfmt.es_v2(cab):
        sys.stderr.write('⛔ %s no es un mundo voxelworld-2\n' % wf)
        return 1
    datos = voxfmt.leer_rejilla(wf)
    if datos is None:
        sys.stderr.write('⛔ falta %s\n' % voxfmt.vox_path(wf))
        return 1

    capa = Capa(cab, datos)
    celdas = parcelas(capa)
    trozos, huerfanas = notas_por_parcela(cab.get('notes') or {}, celdas)

    if huerfanas:
        aviso = ('⚠️  %d notas fuera de toda parcela reconocible (¿se ha tirado un muro o un '
                 'canal?):\n' % len(huerfanas))
        aviso += ''.join('    %s  %r\n' % (k, t[:50]) for k, t in huerfanas[:5])
        sys.stderr.write(aviso)
        if not args.tolerante:
            sys.stderr.write('    (--tolerante para seguir de todas formas)\n')
            return 1

    meta = lee_placa(trozos[0]) if trozos else None
    if meta:
        trozos = trozos[1:]
    else:
        sys.stderr.write('⚠️  sin placa de obelisco: no se sabe con qué reglas se generó\n')

    texto = ''.join(trozos)
    if meta and meta.get('fidelidad') == 'esqueleto':
        texto = ('<!-- Regenerado desde /map/%s con --fidelidad=esqueleto: SÓLO vuelven los\n'
                 '     encabezados. La prosa no está en la ciudad, así que no puede volver. -->\n'
                 % C.slug_de(args.mundo)) + texto

    if args.verifica:
        with open(args.verifica, 'rb') as f:
            esperado = f.read()
        obtenido = texto.encode('utf-8')
        if obtenido == esperado:
            print('✅ idéntico a %s (%d bytes)' % (args.verifica, len(esperado)))
            return 0
        sys.stderr.write('⛔ difiere de %s: %d bytes obtenidos, %d esperados\n'
                         % (args.verifica, len(obtenido), len(esperado)))
        for i in range(min(len(obtenido), len(esperado))):
            if obtenido[i] != esperado[i]:
                sys.stderr.write('   1ª diferencia en el byte %d\n' % i)
                sys.stderr.write('   obtenido: %r\n' % obtenido[max(0, i - 40):i + 40])
                sys.stderr.write('   esperado: %r\n' % esperado[max(0, i - 40):i + 40])
                break
        return 1

    sys.stdout.write(texto)
    return 0


if __name__ == '__main__':
    sys.exit(main())
