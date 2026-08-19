#!/usr/bin/env python3
# «En un objeto con huecos, ademas solamente caras pintadas, etc. deberia de caer la nieve en su base,
#  no en su cima» (dueño, 2026-08-19, con la captura de la planta y la losa de nieve flotando encima).
#
# El manto tomaba la altura de `mcSurfaceY`, que devuelve el bloque mas alto SEA LO QUE SEA. Sobre una
# planta —o unas hojas, o una valla, o cualquier cosa dibujada con su geometria real— eso ponia la
# baldosa de nieve en la cima del adorno, flotando, en vez de en el suelo de al lado.
#
# La pregunta correcta ya existe en el motor y es `mcTapaCara(x,y,z)`: es FALSA para los bloques de
# recorte (textura con agujeros, hojas) y para los que se dibujan con su geometria fina, y VERDADERA
# para un cubo de verdad. O sea, exactamente «¿esto aguanta algo encima?».
#
# Asi que la columna baja desde lo mas alto hasta el primer bloque que tapa su cara, y ahi se posa la
# nieve. La planta queda con nieve alrededor de la base y asomando por encima, que es lo que hace la
# nieve de verdad.
#
#   python3 herramientas/parche_snp_manto_base.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'mcTapaCara'

BASE_V = """      const y = mcSurfaceY(x, z);
      if(y < 0 || y >= dim.y - 1) continue;        // columna vacía, o llena hasta el techo"""
BASE_N = """      let y = mcSurfaceY(x, z);
      // ⚠️ `mcSurfaceY` da lo más ALTO haya lo que haya, y eso NO es donde se posa la nieve: sobre una
      // planta, unas hojas o una valla ponía la baldosa en la cima del adorno, flotando (la captura de
      // la planta con la losa encima, el dueño). `mcTapaCara` es la pregunta buena y ya está en el
      // motor: es falsa para los bloques de recorte y para los de geometría fina —los que tienen
      // huecos y solo caras pintadas— y verdadera para un cubo de verdad. Se baja hasta él.
      while(y >= 0 && !mcTapaCara(x, y, z)) y--;
      if(y < 0 || y >= dim.y - 1) continue;        // columna vacía, o llena hasta el techo"""

PARES = [('base', BASE_V, BASE_N)]


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
    sys.exit(parchea(PARTIC, PARES, MARCA))
