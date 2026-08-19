#!/usr/bin/env python3
# BUG-GLOW4 (fallo 1 de 3) · `mirarObjetivos` le borra la matriz a la HERRAMIENTA EN MANO cada frame.
#
# La funcion recorre TODAS las estructuras y, a las que no estan en su tabla de «mirar», les hace
# `s.model = null` para devolverlas a su pose horneada. La herramienta que lleva el jugador es una
# estructura real del mundo (`_isHeldTool`, la crea `mcSyncHeldToolStruct`), asi que cae ahi.
#
# Por que no se habia visto: dentro del mismo frame, `mcSyncHeldToolStruct` (app.js:17795) le repone
# la matriz DESPUES de esto y ANTES de `mcRender`, asi que el dibujo y la sombra salen perfectos —el
# dueño la ve proyectar sombra correctamente de dia—. Quien se come el `null` es `mcDynSync`
# (app.js:17786), que corre ANTES: ve `s.model = null`, decide que la espada no es un emisor movido
# y no le pone luz dinamica ninguna. De ahi que una Espada de Luz con 45 voxeles emisivos no alumbre.
#
# Esta guarda es la TERCERA de la misma familia: ya estaban `s._rig` (piezas de esqueleto, que
# componen su matriz en esqueletosPaso) y `desplazada(s)` (las movidas por `seguir`). El snippet ya
# usa `_isHeldTool` en `golpe()` para que la herramienta no se apunte a si misma, asi que el nombre
# no es nuevo aqui.
#
#   python3 herramientas/parche_snp_glow4.py
#   …y publicarlo:  curl -X POST localhost:8500/api/snippets -d @data/snippets/mundo-autoarranque.json
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')
MARCA = 'BUG-GLOW4'

VIEJO = """      if (s._rig) continue;"""

NUEVO = """      if (s._rig) continue;
      // BUG-GLOW4 · La herramienta EN LA MANO tambien trae matriz propia, y se la escribe
      // `mcSyncHeldToolStruct` cada frame. Sin esta guarda se la borrabamos aqui, y aunque el dibujo
      // salia bien igual (se la reponen 9 lineas despues, antes de pintar), `mcDynSync` corre ANTES:
      // veia `model = null`, no la tomaba por emisor movido y una espada emisiva no alumbraba nada.
      if (s._isHeldTool) continue;"""

VIEJO2 = "var VERSION = 'v1.35';"
NUEVO2 = "var VERSION = 'v1.36';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    pares = [('la guarda de _rig en mirarObjetivos', VIEJO, NUEVO),
             ("VERSION 'v1.35'", VIEJO2, NUEVO2)]

    # Todo o nada: se validan las anclas ANTES de tocar una sola letra.
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: mirarObjetivos respeta la herramienta en mano; VERSION v1.36')
    return 0


if __name__ == '__main__':
    sys.exit(main())
