#!/usr/bin/env python3
# BUG-ROT2 · el ULTIMO `& 15` que quedaba vivo en el repo, en `game.esqueletos.crear`:
#
#     rot: (q.rot | 0) & 15,
#
# Las posturas de un cubo son 24 (MC_ORI), no 16. Con el recorte, una pieza declarada con rot 16..23
# no se rechazaba: se convertia EN SILENCIO en 0..7, o sea en OTRA postura. Es exactamente el fallo
# que costo BUG-RS7 y BUG-RS8, y aqui el sintoma seria «el brazo sale mirando a otro lado» sin que
# nada avise. Criterio del motor (mcOriNorm): lo que no es una postura conocida se lee como «sin
# girar», NUNCA como otra.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'function oriDePieza('

AYUDA = '''  // Las 24 posturas de un cubo viven en MC_ORI (app.js). El `& 15` que habia aqui no rechazaba un
  // 16..23: lo convertia en silencio en 0..7, o sea en otra postura — el mismo fallo que costo
  // BUG-RS7 y BUG-RS8 en redstone. Se pregunta al motor; el calco de abajo es la red por si el
  // snippet corre sin el (tests de juguete), y aplica el mismo criterio: lo desconocido no gira.
  function oriDePieza(r) {
    if (typeof mcOriNorm === 'function') return mcOriNorm(r);
    r = r | 0;
    return (r >= 0 && r < 24) ? r : 0;
  }

'''

ANCLA = '''  function normalizarArticulacion(art) {'''

VIEJO = '''nombre: q.nombre || ('pieza ' + idx), clave: q.pieza, rot: (q.rot | 0) & 15,'''
NUEVO = '''nombre: q.nombre || ('pieza ' + idx), clave: q.pieza, rot: oriDePieza(q.rot),'''


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    faltan = [n for n, v in (('el recorte `& 15` de crear()', VIEJO),
                             ('normalizarArticulacion (ancla)', ANCLA)) if v not in code]
    if faltan:
        print('ABORTA: no encuentro ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    code = code.replace(ANCLA, AYUDA + ANCLA, 1)
    code = code.replace(VIEJO, NUEVO, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: las piezas de un esqueleto entienden las 24 posturas (oriDePieza)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
