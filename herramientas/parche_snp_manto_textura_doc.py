#!/usr/bin/env python3
# Los comentarios que quedaron describiendo el manto VIEJO (cajas de la capa fina) después de
# `parche_snp_manto_textura.py`, que lo pasó a celdas achatadas con textura.
#
#   python3 herramientas/parche_snp_manto_textura_doc.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'Cada columna es UNA CELDA achatada'

CAJA_V = """  // Cada columna es UNA caja fina de 16×espesor×16 (`game.volatiles.ponCajaFina`), o sea 12
  // triángulos. De voxeles sueltos serían 256 entradas por bloque y el mapa entero no cabría."""
CAJA_N = """  // Cada columna es UNA CELDA achatada con la textura del material (`game.volatiles.ponCapa`): el
  // bloque de arriba, aplastado a `manto`/16 de alto. Son ~2 quads, y van en la pasada del terreno."""

CHUNKS_V = """  mantoChunks: 6,        // chunks finos remallados por pasada"""
CHUNKS_N = """  mantoChunks: 6,        // chunks de alfombra remallados por pasada"""


def parchea(ruta, pares, marca):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if marca in code:
        print('ya estaba: %s' % os.path.basename(ruta))
        return 0
    for nombre, viejo, nuevo in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for nombre, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: %s' % os.path.basename(ruta))
    return 0


if __name__ == '__main__':
    sys.exit(parchea(PARTIC, [('caja', CAJA_V, CAJA_N), ('chunks', CHUNKS_V, CHUNKS_N)], MARCA))
