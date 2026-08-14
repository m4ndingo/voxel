#!/usr/bin/env python3
# REQ-AG17 · tercera pasada, y la que de verdad cierra el puñetazo.
#
# La segunda pasada engancho `moverRaiz` a `avanzar`, o sea a la misma validacion que un paso
# normal. Suena a cerrado, pero una sonda fotograma a fotograma
# (`data/tickets/REQ-AG17/sonda_punetazo.js`) enseño esto, con los dos en un pasillo del que no se
# puede salir:
#
#     t=0  golpeado x=34.364   escudo x=36.364   (separados 2, cuerpos de 0.8)
#     t=1  golpeado x=37.214   escudo x=36.364   ← paso de 2.85, y ya esta al otro lado
#
# Ni un fotograma solapados, y el escudo sin moverse un milimetro. No lo rodeo: se lo ATRAVESO.
#
# El motivo es que `avanzar` valida DONDE SE ATERRIZA, no el camino. Mientras el paso sea mas corto
# que el cuerpo da igual, porque no se puede saltar por encima de nadie. Pero el puñetazo no anda:
# `empujarEsqueleto` mete la fuerza entera en `mov.vx`, y `movPaso` la gasta en `e.vx * dt`. Con
# fuerza 40 eso son 0,67 bloques por fotograma a 60 fps — ya rozando los 0,8 del cuerpo — y en un
# fotograma lento (el navegador sin GPU del guardian, o el mundo cargando) son 3 o 4 bloques de
# golpe. O sea que no es un caso raro del banco de pruebas: es un fallo que asoma en cuanto la
# maquina va justa, y encima justo cuando hay jaleo en pantalla.
#
# Arreglo: `moverRaiz` parte el desplazamiento en trozos de MEDIO CUERPO y valida cada uno con la
# comprobacion de siempre. Nada de una colision nueva ni de barrer volumenes; es la que ya hay,
# llamada las veces que hagan falta para que no se salte a nadie. Tope de 32 trozos para que un
# empujon absurdo (o un `dt` disparatado al volver de una pestaña en segundo plano) no cuelgue el
# fotograma; pasado ese tope el paso se recorta, que es justo lo que se quiere.
#
# De regalo cubre el patinaje sobre hielo, que entra por el mismo sitio.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-AG17c'

VIEJO = """  function moverRaiz(s, a, g, dx, dz, drop) {
    // REQ-AG17b · `avanzar`, no `asentar`: por aqui pasan el brinco del puñetazo (movPaso) y el
    // patinaje sobre hielo (fisicaPaso), y los dos atravesaban a los demas agentes sin preguntar.
    var x0 = g.x, z0 = g.z, ok = true;
    if (dx) { g.x += dx; if (!avanzar(s, a, g, x0, z0, drop)) ok = false; }
    if (dz) { g.z += dz; if (!avanzar(s, a, g, g.x, z0, drop)) ok = false; }
    return ok;
  }"""

NUEVO = """  // REQ-AG17b · `avanzar`, no `asentar`: por aqui pasan el brinco del puñetazo (movPaso) y el
  // patinaje sobre hielo (fisicaPaso), y los dos atravesaban a los demas agentes sin preguntar.
  function tramoRaiz(s, a, g, dx, dz, drop) {
    var x0 = g.x, z0 = g.z, ok = true;
    if (dx) { g.x += dx; if (!avanzar(s, a, g, x0, z0, drop)) ok = false; }
    if (dz) { g.z += dz; if (!avanzar(s, a, g, g.x, z0, drop)) ok = false; }
    return ok;
  }
  // REQ-AG17c · a trozos de medio cuerpo. `avanzar` valida DONDE SE ATERRIZA, no el camino: un paso
  // mas largo que el propio cuerpo se planta al otro lado del vecino sin haberlo tocado nunca, y el
  // puñetazo (`mov.vx * dt`) mide 0,67 por fotograma a 60 fps y 3 o 4 en uno lento. Partiendolo, la
  // comprobacion de siempre ve el camino y el que vuela choca en vez de colarse.
  function moverRaiz(s, a, g, dx, dz, drop) {
    var lado = Math.min(a[3] - a[0], a[5] - a[2]) * 0.5;
    if (!(lado > 0.05)) lado = 0.05;
    var n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / lado);
    if (!(n > 1)) return tramoRaiz(s, a, g, dx, dz, drop);
    if (n > 32) n = 32;          // tope: un empujon absurdo (o un `dt` de pestaña dormida) no cuelga
    for (var i = 0; i < n; i++)
      if (!tramoRaiz(s, a, g, dx / n, dz / n, drop)) return false;   // choco: lo que quede se pierde
    return true;
  }"""

VIEJO2 = "var VERSION = 'v1.34';"
NUEVO2 = "var VERSION = 'v1.35';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0
    if 'REQ-AG17b' not in code:
        print('ABORTA: falta el parche REQ-AG17b (parche_snp_ag17b.py). Este va DESPUES.', file=sys.stderr)
        return 1

    pares = [('moverRaiz', VIEJO, NUEVO),
             ("VERSION 'v1.34'", VIEJO2, NUEVO2)]

    # Todo o nada: se valida cada ancla ANTES de tocar una sola letra.
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
    print('parcheado: moverRaiz a trozos de medio cuerpo; VERSION v1.35')
    return 0


if __name__ == '__main__':
    sys.exit(main())
