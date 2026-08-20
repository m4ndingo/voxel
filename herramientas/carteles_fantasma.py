#!/usr/bin/env python3
# BUG-CART1 · Carteles de nota que se colaron en el DOCUMENTO del mundo.
#
# El cartel de una nota se DERIVA de `mc.notes` y va marcado `efimera`, así que `mundo.json` nunca
# debería llevar ninguno. Pero la marca se ponía DESPUÉS del `await` de estampar, y un guardado que
# cayera en ese hueco se lo llevaba al fichero. Ahí ya no hay quien lo quite: al cargar vuelve sin
# `nota` ni `efimera`, nadie lo reconoce como cartel de nota, y en cada guardado se suma otro.
#
# El motor ya se cura solo en caliente (mcSyncNoteSignsRun) los que están DONDE VA el cartel de una
# nota viva. Esto es para lo que queda: los HUÉRFANOS, cuyo bloque ya no tiene nota. No se distinguen
# de un cartel puesto a mano como decoración, así que aquí no se adivina nada: se listan, y solo se
# borran si se pide con `--escribe` (y `--todos` para no tener que ir mapa a mapa).
#
#   python3 herramientas/carteles_fantasma.py                  # pasada en seco de todos los mapas
#   python3 herramientas/carteles_fantasma.py --escribe --mapa test
#
# Idempotente: correrlo dos veces no cambia nada la segunda.

import argparse
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUNDOS = os.path.join(RAIZ, 'data', 'worlds')
CARTELES = ('asset:assets/cartel.vox.json', 'asset:assets/cartel_tabla.vox.json')


def origen_de_nota(clave, desvio):
    x, y, z = (int(v) for v in clave.split(','))
    return (x + desvio[0], y + desvio[1], z + desvio[2])


def revisa(ruta, escribe):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    notas = doc.get('notes') or {}
    # El desvío es global y vive en la cabecera (`carteles.desvio`, REQ-CART3); por defecto, encima.
    cfg = (doc.get('carteles') or {})
    d = cfg.get('desvio')
    desvio = tuple(int(v) for v in d) if isinstance(d, list) and len(d) == 3 else (0, 1, 0)
    sitios = {origen_de_nota(k, desvio) for k in notas}

    ests = doc.get('structures') or []
    fantasmas, huerfanos = [], []
    for s in ests:
        if s.get('key') not in CARTELES:
            continue
        pos = (int(s.get('x', 0)), int(s.get('y', 0)), int(s.get('z', 0)))
        (fantasmas if pos in sitios else huerfanos).append(s)

    if not fantasmas and not huerfanos:
        return 0
    nombre = os.path.basename(ruta)
    print('%-22s notas=%-4d carteles en el documento: %d en el sitio de una nota, %d huérfanos'
          % (nombre, len(notas), len(fantasmas), len(huerfanos)))
    for s in huerfanos:
        print('      huérfano en %s,%s,%s' % (s.get('x'), s.get('y'), s.get('z')))
    if not escribe:
        return len(fantasmas) + len(huerfanos)

    fuera = {id(s) for s in fantasmas + huerfanos}
    doc['structures'] = [s for s in ests if id(s) not in fuera]
    tmp = ruta + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)
    os.replace(tmp, ruta)
    print('      → escrito: %d fuera, quedan %d estructuras' % (len(fuera), len(doc['structures'])))
    return len(fuera)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mapa', help='solo este mapa (sin .json)')
    ap.add_argument('--escribe', action='store_true', help='borrar de verdad (por defecto, en seco)')
    a = ap.parse_args()

    if a.mapa:
        rutas = [os.path.join(MUNDOS, a.mapa + '.json')]
    else:
        rutas = sorted(os.path.join(MUNDOS, n) for n in os.listdir(MUNDOS) if n.endswith('.json'))

    total = 0
    for r in rutas:
        if not os.path.exists(r):
            print('no existe:', r, file=sys.stderr)
            continue
        try:
            total += revisa(r, a.escribe)
        except Exception as e:                                  # un mapa roto no puede parar la pasada
            print('%-22s ¡no se pudo leer! %s' % (os.path.basename(r), e), file=sys.stderr)
    if not total:
        print('Ningún cartel de nota en ningún documento: nada que hacer.')
    elif not a.escribe:
        print('\nPasada en seco. Para borrarlos: --escribe (y --mapa <nombre> si solo quieres uno).')


if __name__ == '__main__':
    main()
