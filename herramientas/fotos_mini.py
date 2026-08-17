#!/usr/bin/env python3
"""Rellena data/fotos/mini/ con la copia a 800 px de las fotos que ya estaban guardadas.

Las fotos nuevas ya traen su reducida desde el navegador (mcFotoMini en web/app.js); esto es solo
para las anteriores al cambio. Idempotente: salta la que ya tiene mini al día.

    python3 herramientas/fotos_mini.py [--rehacer]

Usa Pillow, que NO es dependencia de server.py — por eso el camino normal (guardar una foto) no
pasa por aquí: el servidor sigue siendo stdlib pelada y quien reduce es el canvas del navegador.
"""
import os
import sys

from PIL import Image

ANCHO = 800
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = os.path.join(BASE, 'data', 'fotos')
MINI = os.path.join(FOTOS, 'mini')


def main():
    rehacer = '--rehacer' in sys.argv
    os.makedirs(MINI, exist_ok=True)
    hechas = saltadas = 0
    for fn in sorted(os.listdir(FOTOS)):
        if not fn.endswith('.png'):
            continue
        src, dst = os.path.join(FOTOS, fn), os.path.join(MINI, fn)
        if os.path.exists(dst) and not rehacer and os.path.getmtime(dst) >= os.path.getmtime(src):
            saltadas += 1
            continue
        with Image.open(src) as im:
            if im.width <= ANCHO:
                saltadas += 1
                continue
            alto = max(1, round(im.height * ANCHO / im.width))
            im.convert('RGB').resize((ANCHO, alto), Image.LANCZOS).save(dst, 'PNG', optimize=True)
        print('%s  %d KB -> %d KB' % (fn, os.path.getsize(src) // 1024, os.path.getsize(dst) // 1024))
        hechas += 1
    print('mini: %d hechas, %d ya estaban' % (hechas, saltadas))


if __name__ == '__main__':
    main()
