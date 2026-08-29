#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`paste-ancla`: el AGARRE elegido al copiar sobrevive al pegar.

Dueño (2026-08-28): «*de paso hay otro bug, cuando se copia y se pega, si se habia elegido un ancla al
copiar (con control apuntando un bloque), al pegar se pierde y no deberia*».

Qué pasaba: `mcCopySelection`/`mcCutSelection` vuelcan la caja a `clipboard` y TIRAN `mc.selPivote` (el
agarre del giro, REQ-SEL1), y `mcPasteWorld` arranca siempre con `mc.pasteAnchor = [0,0,0]` (esquina
mínima). Los dos agarres son el MISMO punto de la pieza contado de dos maneras, así que aquí se traduce
uno en otro: al copiar se guarda en `clipboard.ancla` la celda del pivote RELATIVA a la esquina mínima
de lo copiado, y al pegar se restaura en `mc.pasteAnchor`.

Ejes: `mc.pasteAnchor` va en ejes de MUNDO relativos a la pieza (`mcClipboardDims` da w=x, h=y, d=z) y
SIN ROTAR, que es justo lo que `mcPasteOrigen` espera; `mc.selPivote` es una celda de mundo absoluta.
La cuenta es una resta, no el remapeo de ejes de `clipboard.cells` (ése es cosa del editor).

Parcheo EN CALIENTE (Ley de Oro): no toca `app.js`.

    game.pasteAncla.on() / .off() / .conmutar() / .puesto() / .estado()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'paste-ancla'
NOMBRE = '📌 Copiar/pegar · el agarre elegido al copiar no se pierde al pegar'

CODE = r"""// ── 📌 paste-ancla ─────────────────────────────────────────────────────────────────────────────────
// Dueño (2026-08-28): «cuando se copia y se pega, si se habia elegido un ancla al copiar (con control
// apuntando un bloque), al pegar se pierde y no deberia».
//
// EL PUENTE. Hay DOS agarres en el motor y nadie los presentó:
//   · `mc.selPivote`   — Seleccionar: Ctrl + apuntar. Celda de mundo ABSOLUTA. Es sobre lo que gira R.
//   · `mc.pasteAnchor` — Pegar: Ctrl + apuntar. Celda RELATIVA a la esquina mínima de la pieza, SIN
//                        rotar, en ejes de mundo (w=x, h=y, d=z, como los da `mcClipboardDims`).
// Copiar tiraba el primero y pegar estrenaba el segundo en [0,0,0]. Se traduce: agarre = pivote − esquina.
//
// DÓNDE SE GUARDA: en el propio `clipboard` (`clipboard.ancla`), no en `mc`. El portapapeles es lo que
// viaja, y el editor lo reasigna entero al copiar por su lado ⇒ su copia nace sin ancla, sola, sin que
// haya que limpiar nada. Mientras se pega se refresca desde `mc.pasteAnchor`, así que reelegir el agarre
// con Ctrl durante el pegado también se recuerda para el siguiente Ctrl+V.
//
// ⛔ La esquina mínima se recalcula ANTES de llamar al original: `mcCutSelection` borra los bloques, y
// después del corte el barrido ya no encuentra ninguno y las cotas saldrían vacías.
const VERSION = 'paste-ancla-v1';
const W = window;
let vivo = false;

// Cotas de lo que se va a copiar, con el MISMO filtro que usa el motor (solo celdas con bloque: el aire
// de dentro de la caja no cuenta para la esquina mínima) y el pivote traducido a esas cotas.
function anclaDeSeleccion() {
  const p = mc.selPivote;
  if (!p || !mc.selBox) return null;
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  mcSelForEach((x, y, z, id) => {
    if (!mc.blockKey[id]) return;
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  });
  if (mnx === Infinity) return null;                       // no había nada que copiar
  if (p[0] < mnx || p[0] > mxx || p[1] < mny || p[1] > mxy || p[2] < mnz || p[2] > mxz) return null;
  return [p[0] - mnx, p[1] - mny, p[2] - mnz];             // el agarre no es de ESTA pieza ⇒ no se hereda
}

// Copiar/cortar: se apunta el agarre y se cuelga del portapapeles NUEVO, solo si el original dijo que sí
// (si no había nada que copiar, `clipboard` sigue siendo el de antes y no se le toca su ancla).
function envuelveVuelca(nombre) {
  const f = W[nombre];
  if (typeof f !== 'function' || f._pasteAncla === VERSION) return;
  const env = function () {
    const a = anclaDeSeleccion();
    const r = f.apply(this, arguments);
    if (r !== false && clipboard) { if (a) clipboard.ancla = a; else delete clipboard.ancla; }
    return r;
  };
  env._pasteAncla = VERSION; env._orig = f;
  W[nombre] = env;
}

function envuelvePega() {
  const f = W.mcPasteWorld;
  if (typeof f !== 'function' || f._pasteAncla === VERSION) return;
  const env = function () {
    const r = f.apply(this, arguments);
    // El original acaba de poner [0,0,0]; si la pieza traía agarre, se recupera. `mcPasteOrigen` ya
    // recorta contra (w,h,d), así que un ancla heredada nunca puede sacar la mira fuera de la pieza.
    if (mc.pasteActive && clipboard && clipboard.ancla) {
      mc.pasteAnchor = clipboard.ancla.slice();
      mc._pasteCache = null;
      toast('Pegar: agarre heredado de la copia [' + mc.pasteAnchor.join(', ') + '] · Ctrl + apuntar lo cambia', 5);
    }
    return r;
  };
  env._pasteAncla = VERSION; env._orig = f;
  W.mcPasteWorld = env;
}

// El agarre se puede reelegir mientras se pega (Ctrl + apuntar, keyup en `app.js`), y eso no hay dónde
// envolverlo: es un listener. Se copia de vuelta al portapapeles desde el bucle, que es barato —tres
// enteros y solo mientras el pegado está vivo— y así el siguiente Ctrl+V estrena el último agarre.
function envuelveBucle() {
  const f = W.mcUpdate;
  if (typeof f !== 'function' || f._pasteAncla === VERSION) return;
  const env = function () {
    const r = f.apply(this, arguments);
    if (vivo && mc.pasteActive && !mc.pasteCtrlHeld && clipboard && mc.pasteAnchor) {
      const a = mc.pasteAnchor, b = clipboard.ancla;
      if (!b || b[0] !== a[0] || b[1] !== a[1] || b[2] !== a[2]) clipboard.ancla = a.slice();
    }
    return r;
  };
  env._pasteAncla = VERSION; env._orig = f;
  W.mcUpdate = env;
}

function on() {
  vivo = true;
  envuelveVuelca('mcCopySelection');
  envuelveVuelca('mcCutSelection');
  envuelvePega();
  envuelveBucle();
  return 'dentro — el agarre de la copia viaja al pegado';
}

// Desenvolver solo si sigo siendo el de fuera; si otro snippet envolvió después, me quedo mudo (`vivo`).
function desenvuelve(nombre) {
  const f = W[nombre];
  if (f && f._pasteAncla === VERSION && f._orig) { W[nombre] = f._orig; return true; }
  return false;
}

function off() {
  vivo = false;
  let sueltos = 0;
  for (const n of ['mcCopySelection', 'mcCutSelection', 'mcPasteWorld', 'mcUpdate']) if (desenvuelve(n)) sueltos++;
  return sueltos === 4 ? 'fuera — sin envoltorios' : 'fuera — mudo (' + sueltos + '/4 sueltos: alguien envolvió después)';
}

function puesto() {
  return vivo && typeof mcPasteWorld === 'function' && mcPasteWorld._pasteAncla === VERSION;
}
function conmutar() { return puesto() ? off() : on(); }

function estado() {
  return {
    puesto: puesto(), version: VERSION,
    anclaEnPortapapeles: (clipboard && clipboard.ancla) ? clipboard.ancla.slice() : null,
    bloquesEnPortapapeles: (clipboard && clipboard.cells) ? clipboard.cells.length : 0,
    pieza: mcClipboardDims(),
    pivoteSeleccion: mc.selPivote ? mc.selPivote.slice() : null,
    anclaQueDaríaLaCopia: anclaDeSeleccion(),
    pegando: !!mc.pasteActive,
    agarrePegado: mc.pasteAnchor ? mc.pasteAnchor.slice() : null
  };
}

W.game = W.game || {};
W.game.pasteAncla = { on, off, conmutar, puesto, estado, marca: anclaDeSeleccion, VERSION };
on();
toast('📌 paste-ancla: el agarre de la copia se hereda al pegar · game.pasteAncla.off()', 6);
'paste-ancla ' + VERSION + ' dentro';
"""


def publicar():
    data = {'id': ID, 'nombre': NOMBRE, 'code': CODE}
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s' % ID)
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if publicar() else 1)
