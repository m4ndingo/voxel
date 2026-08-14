#!/usr/bin/env python3
# BUG-ROT1 · el snippet de autoarranque calca dos cuentas de app.js que acaban de crecer:
#   · caraEnMundo() — cara del objeto → cara del mundo, calcada de mcStructGeom
#   · dimsMundo()   — huella ya girada, calcada de mcOriDims
# Las dos abrian `rot` a mano con (rot>>2)&3 = vuelco y rot&3 = giro, que solo llega a 16 posturas.
# Ahora hay 24 (tercer cuarto de vuelta, `roll`, sobre Z) y el reparto de bits ya no vale: se pregunta
# al motor con mcOriParts(rot), con el calco de antes como red por si el snippet corre sin motor.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/snippets/mundo-autoarranque.json')

MARCA = 'function partesOri('

AYUDA = '''function partesOri(rot) {
    // Las 24 posturas de un cubo viven en MC_ORI (app.js): rot -> [roll, tilt, yaw]. Antes solo habia
    // 16 y bastaba con (rot>>2)&3 / rot&3; con el tercer cuarto de vuelta (roll, sobre Z) eso se queda
    // corto para @16..@23, asi que se pregunta al motor y solo se calca si no esta.
    if (typeof mcOriParts === 'function') { var p = mcOriParts(rot); if (p) return p; }
    return [0, (rot >> 2) & 3, rot & 3];
  }
  '''

CARA_VIEJA = '''function caraEnMundo(cara, rot) {
    var n = CARAS[cara], t = dirRot(n[1], n[2], (rot >> 2) & 3), r = dirRot(n[0], t[1], rot & 3);
    var dx = r[0], dy = t[0], dz = r[1];'''

CARA_NUEVA = '''function caraEnMundo(cara, rot) {
    var n = CARAS[cara], o = partesOri(rot);
    var p = dirRot(n[0], n[1], o[0]);          // roll sobre Z: rota x/altura
    var t = dirRot(p[1], n[2], o[1]);          // vuelco sobre X: rota altura/profundidad
    var r = dirRot(p[0], t[1], o[2]);          // giro sobre Y: rota x/profundidad
    var dx = r[0], dy = t[0], dz = r[1];'''

DIMS_VIEJA = '''function dimsMundo(ext, rot) {
    var w = ext[0], h = ext[1], d = ext[2], t;
    if (((rot >> 2) & 3) & 1) { t = d; d = h; h = t; }   // vuelco impar: profundidad <-> altura
    if ((rot & 3) & 1) { t = w; w = d; d = t; }          // giro impar: ancho <-> profundidad'''

DIMS_NUEVA = '''function dimsMundo(ext, rot) {
    var w = ext[0], h = ext[1], d = ext[2], t, o = partesOri(rot);
    if (o[0] & 1) { t = w; w = h; h = t; }               // roll impar: ancho <-> altura
    if (o[1] & 1) { t = d; d = h; h = t; }               // vuelco impar: profundidad <-> altura
    if (o[2] & 1) { t = w; w = d; d = t; }               // giro impar: ancho <-> profundidad'''


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    faltan = [n for n, v in (('caraEnMundo', CARA_VIEJA), ('dimsMundo', DIMS_VIEJA)) if v not in code]
    if faltan:
        print('ABORTA: no encuentro el texto original de ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    code = code.replace(CARA_VIEJA, AYUDA + CARA_NUEVA, 1)
    code = code.replace(DIMS_VIEJA, DIMS_NUEVA, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: partesOri + caraEnMundo + dimsMundo entienden las 24 posturas')
    return 0


if __name__ == '__main__':
    sys.exit(main())
