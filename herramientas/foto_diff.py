#!/usr/bin/env python3
"""Compara dos fotos de data/fotos/ y deja en data/fotos/mini/ lo que hace falta para VERLAS.

El dueño manda dos capturas y dice «aquí falla algo». A 200 px no se ve una sombra, y las fotos a
tamaño nativo no se pueden abrir directamente. Esto responde a las dos preguntas de siempre:

    ¿QUÉ cambió?    → mapa de diferencias + caja que la encierra, en números
    ¿CÓMO se ve?    → recorte de esa caja, a escala 1:1 o ampliado, de cada una de las dos

    python3 herramientas/foto_diff.py 118 119            # por número de foto
    python3 herramientas/foto_diff.py 118 119 --zoom 2   # recorte ampliado x2
    python3 herramientas/foto_diff.py 118 119 --caja 900,300,1400,700   # recorte a mano

Salida en data/fotos/mini/_dif_<a>_<b>_*.png. Usa Pillow (como fotos_mini.py), no server.py.
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageChops, ImageOps

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = os.path.join(RAIZ, 'data', 'fotos')
MINI = os.path.join(FOTOS, 'mini')
UMBRAL = 8          # suma |ΔR|+|ΔG|+|ΔB| por debajo de la cual es ruido de compresión, no un cambio


def medias(im):
    px = list(im.getdata())
    n = float(len(px)) or 1.0
    return (sum(p[0] for p in px) / n, sum(p[1] for p in px) / n, sum(p[2] for p in px) / n)


def luma(m):
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]


def busca(ref):
    """Acepta el número de foto ('118'), el id completo o una ruta."""
    if os.path.exists(ref):
        return ref
    for patron in ('%s_*.png' % str(ref).zfill(4), '%s*.png' % ref):
        hit = sorted(glob.glob(os.path.join(FOTOS, patron)))
        if hit:
            return hit[0]
    sys.exit('no encuentro la foto %r en %s' % (ref, FOTOS))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--zoom', type=float, default=1.0)
    ap.add_argument('--caja', help='x0,y0,x1,y1 en píxeles de la foto original')
    ap.add_argument('--umbral', type=int, default=UMBRAL)
    args = ap.parse_args()

    pa, pb = busca(args.a), busca(args.b)
    ia = Image.open(pa).convert('RGB')
    ib = Image.open(pb).convert('RGB')
    if ia.size != ib.size:
        sys.exit('tamaños distintos: %s vs %s' % (ia.size, ib.size))
    print('A = %s' % os.path.basename(pa))
    print('B = %s   %dx%d' % (os.path.basename(pb), ia.size[0], ia.size[1]))

    dif = ImageChops.difference(ia, ib).convert('L')
    # Sin banda muerta el JPEG/PNG de dos frames seguidos ya «cambia» en medio cuadro.
    mask = dif.point(lambda v: 255 if v * 3 > args.umbral else 0)
    n = sum(mask.histogram()[255:])
    total = ia.size[0] * ia.size[1]
    caja = mask.getbbox()
    print('pixeles cambiados: %d de %d (%.2f %%) · dif maxima %d'
          % (n, total, 100.0 * n / total, max(i for i, c in enumerate(dif.histogram()) if c)))
    print('caja del cambio  : %s' % (caja,))

    os.makedirs(MINI, exist_ok=True)
    na = os.path.basename(pa)[:4]
    nb = os.path.basename(pb)[:4]
    pre = os.path.join(MINI, '_dif_%s_%s' % (na, nb))

    # El mapa de cambio, amplificado: lo que importa es DÓNDE, no cuánto.
    ImageOps.autocontrast(dif).save(pre + '_mapa.png')
    salidas = [pre + '_mapa.png']

    if args.caja:
        caja = tuple(int(v) for v in args.caja.split(','))
    if caja:
        m = 24                                     # un margen para no recortar al ras del cambio
        caja = (max(0, caja[0] - m), max(0, caja[1] - m),
                min(ia.size[0], caja[2] + m), min(ia.size[1], caja[3] + m))
        for etq, im in (('A', ia), ('B', ib)):
            rec = im.crop(caja)
            if args.zoom != 1.0:
                rec = rec.resize((int(rec.width * args.zoom), int(rec.height * args.zoom)), Image.NEAREST)
            f = '%s_%s.png' % (pre, etq)
            rec.save(f)
            salidas.append(f)
        print('recorte          : %s  (%dx%d)' % (caja, caja[2] - caja[0], caja[3] - caja[1]))
        # ¿se OSCURECIO A o se ACLARO B? A ojo no se distingue, y es la pregunta que decide si lo
        # que falta es una sombra (A oscura) o lo que sobra es una luz (B clara).
        ma = medias(ia.crop(caja))
        mb = medias(ib.crop(caja))
        print('media RGB en A   : %6.1f %6.1f %6.1f   (luma %.1f)' % (ma + (luma(ma),)))
        print('media RGB en B   : %6.1f %6.1f %6.1f   (luma %.1f)' % (mb + (luma(mb),)))
        print('B - A            : %+6.1f %+6.1f %+6.1f   (luma %+.1f)'
              % (mb[0] - ma[0], mb[1] - ma[1], mb[2] - ma[2], luma(mb) - luma(ma)))
    else:
        print('recorte          : las dos fotos son IDENTICAS por encima del umbral')

    for f in salidas:
        print('  -> %s' % os.path.relpath(f, RAIZ))


if __name__ == '__main__':
    main()
