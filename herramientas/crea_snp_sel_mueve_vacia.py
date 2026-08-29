#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`sel-mueve-vacia`: la caja de Seleccionar se mueve aunque no tenga ni un bloque dentro.

Dueño (2026-08-28): «*cuando hago shift+wheel o control+wheel me dice a veces "la seleccion no tiene
bloques, nada que cavar", no importa si no tiene bloques, la seleccion ha de moverse igualmente*».

Parcheo EN CALIENTE (Ley de Oro): envuelve `mcSelExtruir` y `mcSelExtruirFrente` sin tocar `app.js`.

    game.selVacia.on() / .off() / .conmutar() / .estado()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'sel-mueve-vacia'
NOMBRE = '✋ Selección vacía · Ctrl/Shift+rueda la mueve igual'

CODE = r"""// ── ✋ sel-mueve-vacia · la caja de Seleccionar se mueve aunque esté VACÍA ─────────────────────────
//
// Dueño (2026-08-28): «*cuando hago shift+wheel o control+wheel me dice a veces "la seleccion no tiene
// bloques, nada que cavar", no importa si no tiene bloques, la seleccion ha de moverse igualmente*».
//
// El «a veces» es cuando la caja marcada cae en el aire. El motor tiene DOS guardas parecidas y aquí
// sólo se toca la primera:
//
//   1. `!col.size` / `!fila.size` → «La selección no tiene bloques: nada que cavar/hundir/traer…»
//      (app.js:16875 y app.js:16948). La caja está vacía: no hay NADA que extruir, el motor no la
//      mueve, y uno se queda con el marco colgado en el aire sin manera de bajarlo al suelo salvo
//      volviendo a marcar las dos esquinas. ESTA es la que se parchea.
//
//   2. `!edits.length` → «Nada que cavar» / «No cabe nada más arriba» (app.js:16895 y app.js:16968).
//      Ahí SÍ hay bloques, pero ninguno se pudo escribir. Esa guarda es una REGLA DEL DUEÑO
//      (2026-08-20): «un wup seguido de un wdown debería dejar los bloques iguales que como estaban».
//      ⛔ NO se toca: mover la caja cuando el gesto no ha hecho nada sí sería mentir.
//
// SE TRASLADA, NO SE ESTIRA. El motor mueve la caja por su borde ACTIVO (el de arriba con Ctrl, el que
// da la cara con Shift) porque ahí acaba de aparecer o desaparecer una capa: el marco enseña dónde va
// la muesca siguiente. Sin bloques no aparece ni desaparece nada, así que estirar o encoger un borde no
// significaría nada — y encoger una caja vacía de alto 3 la dejaría quieta dos muescas antes de empezar
// a bajar. Aquí viaja ENTERA una celda, conservando la forma que costó marcar, hasta que se mete en el
// terreno; en cuanto pilla un bloque manda otra vez el motor y se extruye/cava como siempre.
//
// Sentidos, los del motor:
//   Ctrl+rueda  (mcSelExtruir)       arriba → +Y          · abajo → −Y
//   Shift+rueda (mcSelExtruirFrente) arriba → se ALEJA    · abajo → se ACERCA   (eje de la mirada)
//
// NO HAY DESHACER de este movimiento: Ctrl+Z restaura la caja sólo si viaja pegada a una edición
// (`mc._selCajasBeforeEdit`, que consume `mcPushHist`), y aquí no se edita ni un bloque. Por eso
// tampoco se toca esa variable: dejarla puesta pegaría este viaje a la SIGUIENTE edición y el deshacer
// teletransportaría el marco.
//
// API:  game.selVacia.on() / .off() / .conmutar() / .estado()
// Re-ejecutarlo es seguro: una sola costura, sellada por VERSION (no apila envoltorios).

const W = window;
const VERSION = 'sel-vacia-v1';

// `mc` es un `const` de nivel superior de app.js: NO está en `window`, sólo se alcanza por identificador
// pelado. Por eso el guardián mira `typeof mc` y no `W.mc` (que siempre sería undefined).
if (typeof mc === 'undefined' || !mc) {
  console.warn('✋ sel-mueve-vacia: no hay motor de mundo. Abre /map/<nombre>.');
  return 'sin motor';
}

// EN EL MOTOR (2026-08-28): el dueño lo dio por bueno («el parche funciona correctamente, aplicar a
// app.js») y bajó a app.js como `mcSelMueveVacia`, dentro de las dos guardas de «no tiene bloques».
// Este snippet se aparta: puesto encima no llegaría a duplicar el movimiento (el envoltorio atiende la
// caja vacía y el original ni se llama), pero sí taparía al motor con esta copia congelada, y cualquier
// arreglo posterior de app.js dejaría de notarse. Se conserva como el original de la Ley de Oro y para
// volver a probar cambios en caliente sobre una copia con otro nombre.
if (typeof mcSelMueveVacia === 'function') {
  if (W.game && W.game.selVacia && typeof W.game.selVacia.off === 'function') W.game.selVacia.off();
  toast('✋ La selección vacía ya se mueve EN EL MOTOR · no hace falta el snippet', 6);
  return 'ya está en app.js (mcSelMueveVacia) · snippet no aplicado';
}

// `mcEjeMirada` sólo existe desde REQ-EXTRU2 (2026-08-25). Si falta, es que este app.js es anterior y
// Shift+rueda ni siquiera hunde/trae: mejor decirlo que envolver medio motor.
const NECESITA = ['mcSelExtruir', 'mcSelExtruirFrente', 'mcEjeMirada', 'mcInside', 'mcIdx', 'toast'];
const faltan = NECESITA.filter(n => typeof W[n] !== 'function');
if (faltan.length) {
  console.warn('✋ sel-mueve-vacia: al motor le faltan ' + faltan.join(', ') + ' — ¿app.js anterior a REQ-EXTRU2?');
  return 'motor incompleto: falta ' + faltan.join(', ');
}

// ¿Hay ALGÚN bloque dentro de la selección? Se escribe a mano en vez de usar `mcSelCount()` para poder
// SALIR AL PRIMERO: esto corre antes que el original en cada muesca, y con una caja grande recorrer el
// volumen entero dos veces por muesca se nota. No hace falta el Set de celdas ya vistas que lleva
// `mcSelForEach` (las cajas pueden solaparse): aquí no se cuenta, se pregunta si hay o no hay.
function hayBloques() {
  const cajas = mc.selCajas;
  for (let ci = 0; ci < cajas.length; ci++) {
    const s = cajas[ci];
    const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]);
    const y0 = Math.min(s.a[1], s.b[1]), y1 = Math.max(s.a[1], s.b[1]);
    const z0 = Math.min(s.a[2], s.b[2]), z1 = Math.max(s.a[2], s.b[2]);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (!mcInside(x, y, z)) continue;
      if (mc.grid[mcIdx(x, y, z)]) return true;
    }
  }
  return false;
}

// Mueve TODAS las cajas una celda por el eje `eje` (REQ-SEL1: la selección puede ser varias, y se mueven
// a la vez o no se mueve ninguna). El tope del mundo se mira sobre el CONJUNTO: recortar caja a caja las
// deformaría y les cambiaría las distancias entre ellas, que es justo lo que una traslación no hace.
function traslada(eje, paso, comoSeLlama) {
  const cajas = mc.selCajas;
  if (!cajas.length) return false;
  const lim = eje === 0 ? mc.dim.x : (eje === 1 ? mc.dim.y : mc.dim.z);
  let min = Infinity, max = -Infinity;
  for (const s of cajas) {
    min = Math.min(min, s.a[eje], s.b[eje]);
    max = Math.max(max, s.a[eje], s.b[eje]);
  }
  if (paso > 0 ? max + paso > lim - 1 : min + paso < 0) {
    toast('La selección toca el borde del mundo: no cabe más ' + comoSeLlama);
    return false;
  }
  for (const s of cajas) { s.a[eje] += paso; s.b[eje] += paso; }
  // El AGARRE del giro (REQ-SEL1) viaja con la caja: es una celda de mundo que el dueño eligió DENTRO de
  // la selección, y si se queda atrás el motor lo da por fuera (`mcSelCajaDe(...)<0`) y rotar pasaría a
  // pivotar por la esquina mínima sin avisar.
  if (mc.selPivote) mc.selPivote[eje] += paso;
  return true;
}

// Ctrl+rueda: eje Y, arriba sube y abajo baja.
function vaciaY(dir) {
  if (!traslada(1, dir > 0 ? 1 : -1, dir > 0 ? 'arriba' : 'abajo')) return false;
  toast('Selección vacía — movida ' + (dir > 0 ? 'arriba' : 'abajo') + ' (sin bloques que ' +
        (dir > 0 ? 'extruir' : 'cavar') + ')');
  return true;
}

// Shift+rueda: eje horizontal de la mirada. `sN` apunta AL FRENTE (alejándose), y el gesto es el inverso
// del de Ctrl a propósito: arriba HUNDE (se aleja), abajo TRAE (se acerca). Se recalcula en cada muesca,
// igual que el motor: te giras y la caja se va por donde miras.
function vaciaFrente(dir) {
  const m = mcEjeMirada();
  const dentro = dir > 0;
  if (!traslada(m.eje, (dentro ? 1 : -1) * m.sN, dentro ? 'hacia dentro' : 'hacia ti')) return false;
  toast('Selección vacía — movida ' + (dentro ? 'hacia dentro' : 'hacia ti') + ' · eje ' + m.nombre +
        ' (sin bloques que ' + (dentro ? 'hundir' : 'traer') + ')');
  return true;
}

// UNA SOLA COSTURA. `base` sale de `._orig` si ya había envoltorio nuestro, así que volver a cargar el
// snippet reemplaza el de antes en vez de apilarse encima (dos envoltorios = dos celdas por muesca).
function envuelve(nombre, vacia) {
  const f = W[nombre];
  if (f._selVacia === VERSION) return 'ya';
  const base = f._selVacia ? f._orig : f;
  const env = function (dir) {
    // Las mismas condiciones de entrada que el original, y en el mismo orden: sin herramienta, sin caja
    // o sin muesca esto no es asunto nuestro y pasa de largo. `hayBloques()` va EL ÚLTIMO por ser el
    // caro. Con bloques dentro, el motor hace su trabajo intacto — incluida la guarda nº 2.
    if (dir && mc.tool === 'select' && mc.selBox && !hayBloques()) return vacia(dir);
    return base.apply(this, arguments);
  };
  env._selVacia = VERSION;
  env._orig = base;
  W[nombre] = env;                       // app.js las llama por identificador pelado (app.js:23532), y
  return 'puesto';                       // en un script clásico eso ES la propiedad de window
}

function on() {
  const a = envuelve('mcSelExtruir', vaciaY);
  const b = envuelve('mcSelExtruirFrente', vaciaFrente);
  return (a === 'ya' && b === 'ya') ? 'ya estaba puesto'
       : 'Ctrl/Shift+rueda mueven la caja aunque esté vacía';
}

function off() {
  let n = 0;
  ['mcSelExtruir', 'mcSelExtruirFrente'].forEach(function (k) {
    const f = W[k];
    if (f && f._selVacia && f._orig) { W[k] = f._orig; n++; }
  });
  return n ? 'fuera — la caja vacía vuelve a quedarse quieta' : 'ya estaba fuera';
}

function puesto() {
  return typeof mcSelExtruir === 'function' && mcSelExtruir._selVacia === VERSION;
}

function conmutar() { return puesto() ? off() : on(); }

function estado() {
  const m = mcEjeMirada();
  return {
    puesto: puesto(),
    version: VERSION,
    herramienta: mc.tool,
    cajas: mc.selCajas.length,
    vacia: mc.selCajas.length ? !hayBloques() : null,
    ejeMirada: m.nombre,
    ctrl: 'arriba sube / abajo baja (eje Y)',
    shift: 'arriba aleja / abajo acerca (eje de la mirada)',
    nota: 'Con bloques dentro manda el motor. Este viaje NO lo deshace Ctrl+Z: no edita nada.'
  };
}

game.selVacia = { on: on, off: off, conmutar: conmutar, estado: estado, puesto: puesto,
                  hayBloques: hayBloques, traslada: traslada };

const r = on();

toast('✋ Selección vacía: Ctrl/Shift+rueda la mueven igual · game.selVacia.off() para quitarlo', 5);

return 'sel-mueve-vacia · ' + r;
"""


def publicar():
    data = {'id': ID, 'name': NOMBRE, 'code': CODE}
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
