#!/usr/bin/env python3
# «Un manto de nieve de 4 voxels de altura lo veo muy alto, que sea configurable, y que por defecto
#  sean 2 voxels de altura» (dueño, 2026-08-19).
#
# El mando ya existe y es `manto`: es el espesor MAXIMO de la alfombra, en voxeles finos (1/16 de
# bloque cada uno). Lo que estaba en 4 era la nevada de `efectos-demo`, asi que se baja ahi a 2.
#
# Se puede cambiar en caliente, porque la configuracion ES el propio sistema:
#   const s = P.sistemas.find(s => s.grupo === 'nieve');  s.manto = 3;
# La alfombra se reajusta sola (el nivel se recorta al nuevo tope y las columnas van bajando por el
# mismo camino por el que subieron).
#
# Y se saca `manto` en `info()`, que es donde el dueño mira que tiene puesto cada efecto.
#
#   python3 herramientas/parche_snp_manto_alto.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/efectos-demo.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')

CFG_V = """  manto: 0,              // espesor máximo en 1/16 de bloque (0 = este efecto no cuaja manto). 4 ≈ MC"""
CFG_N = """  // ⬅️ ESPESOR de la alfombra, en voxeles finos (1/16 de bloque cada uno): 2 = una lámina fina,
  // 8 = media cara de bloque, 16 = un bloque entero. 0 = este efecto no cuaja manto.
  // Se puede cambiar en caliente —la configuración ES el sistema— y la alfombra se reajusta sola:
  //   P.sistemas.find(s => s.grupo === 'nieve').manto = 3;
  manto: 0,"""

INFO_V = """               porSegundo: C.porSegundo }; },"""
INFO_N = """               porSegundo: C.porSegundo, manto: C.manto }; },"""

NIEVE_V = """  manto: 4, mantoEn: 50, mantoDura: 120, mantoRadio: 0,"""
NIEVE_N = """  // `manto` es el ESPESOR en voxeles finos (1/16 de bloque). Estaba en 4 y el dueño lo vio «muy
  // alto»: 2 es una lámina que cubre sin tragarse el relieve del suelo.
  manto: 2, mantoEn: 50, mantoDura: 120, mantoRadio: 0,"""

PARES_PARTIC = [('config', CFG_V, CFG_N), ('info', INFO_V, INFO_N)]
PARES_EFECTOS = [('nieve', NIEVE_V, NIEVE_N)]


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


def main():
    return (parchea(PARTIC, PARES_PARTIC, 'ESPESOR de la alfombra')
            or parchea(EFECTOS, PARES_EFECTOS, 'el dueño lo vio «muy'))


if __name__ == '__main__':
    sys.exit(main())
