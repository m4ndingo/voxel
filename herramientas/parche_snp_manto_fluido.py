#!/usr/bin/env python3
# «La nieve cuando cae sobre un fluido no se comporta como lo que esta haciendo esta nieve; vamos a
#  hacer que si la nieve cae en algo que sea un fluido no cuaje por defecto (en la realidad se tendria
#  que convertir en hielo poco a poco la superficie)» (dueño, 2026-08-19).
#
# En la captura la nieve no estaba SOBRE el agua: estaba en el FONDO de la piscina, vista a traves del
# agua. Causa: `mcTapaCara` es falso para el fluido, asi que la busqueda de suelo que se acababa de
# meter seguia bajando y se posaba en el lecho.
#
# Habia un filtro de agua, pero estaba MAL de dos formas:
#   - reconocia el material POR SU NOMBRE (/agua|water|lava/), que es justo lo que el motor prohibe
#     («aqui no se reconoce ningun material por su nombre», comentario de mcFluidoOjo);
#   - y miraba el bloque de destino, o sea DESPUES de haber bajado hasta el lecho, donde ya no hay agua.
#
# Ahora se baja mirando celda a celda y, en cuanto una es fluido, la columna se descarta. El predicado
# es el bueno: `game.fluidos.getProps(id,x,y,z).isFluid`, que es quien sabe de niveles y de tipos.
#
# `mantoSobreFluido` queda como mando, en false por defecto, que es lo que pide el dueño. El hielo
# —congelar la superficie poco a poco— seria ponerlo en true y cambiar el color; no se hace hoy.
#
#   python3 herramientas/parche_snp_manto_fluido.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'mantoSobreFluido'

CFG_V = """  mantoChunks: 6,        // chunks finos remallados por pasada"""
CFG_N = """  mantoSobreFluido: false, // ⬅️ por defecto la nieve NO cuaja sobre agua ni lava: se hunde y ya.
                         // Lo realista sería que la SUPERFICIE se fuera helando; eso es otra cosa
                         // (un material, no un manto) y hoy no se hace.
  mantoChunks: 6,        // chunks finos remallados por pasada"""

BASE_V = """      let y = mcSurfaceY(x, z);
      // ⚠️ `mcSurfaceY` da lo más ALTO haya lo que haya, y eso NO es donde se posa la nieve: sobre una
      // planta, unas hojas o una valla ponía la baldosa en la cima del adorno, flotando (la captura de
      // la planta con la losa encima, el dueño). `mcTapaCara` es la pregunta buena y ya está en el
      // motor: es falsa para los bloques de recorte y para los de geometría fina —los que tienen
      // huecos y solo caras pintadas— y verdadera para un cubo de verdad. Se baja hasta él.
      while(y >= 0 && !mcTapaCara(x, y, z)) y--;
      if(y < 0 || y >= dim.y - 1) continue;        // columna vacía, o llena hasta el techo
      // No nieva sobre el agua: se ve fatal y además el agua se mueve.
      const k = mc.blockKey[mc.grid[mcIdx(x, y, z)]] || '';
      if(/agua|water|lava/i.test(k)) continue;"""
BASE_N = """      // Se baja desde lo más alto hasta el primer bloque que AGUANTA nieve encima, y por el camino se
      // descarta la columna si hay fluido.
      //
      // ⚠️ `mcSurfaceY` da lo más ALTO haya lo que haya, y eso NO es donde se posa la nieve: sobre una
      // planta, unas hojas o una valla ponía la baldosa en la cima del adorno, flotando (la captura de
      // la planta con la losa encima, el dueño). `mcTapaCara` es la pregunta buena y ya está en el
      // motor: es falsa para los bloques de recorte y para los de geometría fina —los que tienen
      // huecos y solo caras pintadas— y verdadera para un cubo de verdad.
      //
      // ⚠️ Y el fluido hay que mirarlo AQUÍ DENTRO, bajando, no al final: `mcTapaCara` también es falso
      // para el agua, así que sin esto la columna seguía bajando y el manto acababa EN EL FONDO DE LA
      // PISCINA, que es lo que se veía a través del agua en la captura del dueño.
      let y = mcSurfaceY(x, z), moja = false;
      while(y >= 0){
        if(mantoFluido(x, y, z)){ moja = true; break; }
        if(mcTapaCara(x, y, z)) break;
        y--;
      }
      if(moja || y < 0 || y >= dim.y - 1) continue;   // mojada, columna vacía, o llena hasta el techo"""

FN_V = """  function mantoOn(){ return !!(C.manto > 0 && game.volatiles && game.volatiles.ponCajaFina
                                && typeof mc !== 'undefined' && mc.grid); }"""
FN_N = """  function mantoOn(){ return !!(C.manto > 0 && game.volatiles && game.volatiles.ponCajaFina
                                && typeof mc !== 'undefined' && mc.grid); }
  // ¿Esta celda es líquido? Lo pregunta `game.fluidos`, que es quien sabe de niveles (`hab:agua-3`) y
  // de tipos. ⛔ NUNCA por el nombre del material: antes esto era un /agua|water|lava/ sobre la clave,
  // y el motor lo prohíbe expresamente («aquí no se reconoce ningún material por su nombre»).
  function mantoFluido(x, y, z){
    if(C.mantoSobreFluido) return false;
    const id = mc.grid[mcIdx(x, y, z)];
    if(!id) return false;
    const api = (typeof game !== 'undefined') && game.fluidos;
    if(!api || typeof api.getProps !== 'function') return false;
    const p = api.getProps(id, x, y, z);
    return !!(p && p.isFluid);
  }"""

PARES = [('config', CFG_V, CFG_N), ('predicado', FN_V, FN_N), ('base', BASE_V, BASE_N)]


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
