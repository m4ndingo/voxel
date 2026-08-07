#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════════════════════
# BUG-RS6 · Parte la puerta alta del dueño en piezas de UNA CELDA
# ══════════════════════════════════════════════════════════════════════════════════════════════
#
# El dueño subió su puerta de 16×16×16 a 16×16×24 porque la de antes era demasiado baja, y con eso
# dejó de funcionar como redstone. No es un fallo del circuito: mcCabeEnRejilla (app.js) exige que
# una pieza quepa en UNA celda (w/h/d ≤ 1) para entrar en mc.grid. Con 24 de alto ya son dos celdas,
# así que el clic derecho la estampa como ESTRUCTURA suelta — y una estructura no es una celda de la
# rejilla, no tiene señal, no tiene vecinos: no es redstone.
#
# La salida acordada con el dueño es apilar VARIAS CELDAS DE REJILLA, no estampar una estructura
# («las estructuras son lentas»), con la condición de que se muevan AL UNÍSONO. Este script se ocupa
# de la mitad del dibujo; de moverlas juntas se ocupa redstone/redstone-piezas.js.
#
# NO redibuja nada: parte el dibujo que el dueño tiene AHORA en la galería, así que se conserva su
# grosor, su tirador a media altura y el listón claro que le puso. La hoja abierta se deriva girando
# la cerrada 90° sobre la jamba, por lo mismo — dibujarlas por separado ya se desincronizó una vez.
#
#   python3 redstone/partir_puerta.py            # parte data/habitantes/puerta.json
#   python3 redstone/partir_puerta.py --forzar    # aunque la de la galería ya esté partida
#
# Lo que pisa se respalda antes en data/habitantes_trash/<ms>__<nombre>.json.
# ──────────────────────────────────────────────────────────────────────────────────────────────
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_piezas import DIR, abatir, guardar, partir       # noqa: E402  (hace falta el path de arriba)

FORZAR = '--forzar' in sys.argv


def main():
    ruta = os.path.join(DIR, 'puerta.json')
    doc = json.load(open(ruta))
    hoja = doc.get('voxels') or {}
    alto = (doc.get('size') or {}).get('z', 16)

    if alto <= 16 and not FORZAR:
        print('La puerta de la galería ya mide %d de alto: nada que partir (--forzar para rehacer '
              'las cuatro piezas de todas formas).' % alto)
        return

    pisos = -(-alto // 16)             # 24 → 2 celdas
    if pisos > 2:
        print('Esta puerta ocupa %d celdas y el snippet solo sabe mover dos. Aborto.' % pisos)
        return

    abierta = abatir(hoja)
    ahora = datetime.datetime.now().replace(microsecond=0).isoformat()
    print('Partiendo la puerta del dueño: %d voxels, %d de alto → %d celdas' % (len(hoja), alto, pisos))
    for nombre, dibujo, piso in [('puerta', hoja, 0), ('puerta-alta', hoja, 1),
                                 ('puerta-abierta', abierta, 0), ('puerta-alta-abierta', abierta, 1)]:
        guardar(nombre, partir(dibujo, piso), ahora)
    print('Listo. En el Mundo: hab:puerta abajo y hab:puerta-alta encima; el snippet las abre juntas.')


if __name__ == '__main__':
    main()
