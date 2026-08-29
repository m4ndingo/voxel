#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`sel-cara-opuesta`: el clic CENTRAL pasa la herramienta Seleccionar a construir por la CARA OPUESTA.

Dueño (2026-08-28), corrigiendo el primer intento (`sel-rueda-invertida`, que sólo daba la vuelta a la
rueda y NO era esto): «*la estrusion que deseo no es correcta […] no se cambia la direccion de la rueda,
se cambia como se comporta la herramienta. control+abajo despues de hacer clic central serviria para
crear hacia abajo bloques replicando los seleccionados. por ejemplo si un bloque esta en el aire se le
podrian poner patas seleccionando sus bloques, clic central, y luego control+abajo*». Y para Shift:
«*lo que tiene hacer es seguir empujando hacia adelante pero rellenando con los bloques seleccionados
(por ejemplo para construir puentes)*».

Parcheo EN CALIENTE (Ley de Oro): envuelve `mcSelExtruir` y `mcSelExtruirFrente` sin tocar `app.js`.

    game.selOpuesta.on() / .off() / .conmutar() / .estado() / .invierte()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'sel-cara-opuesta'
NOMBRE = '🪜 Selección · clic central = construir por la cara opuesta (patas y puentes)'

CODE = r"""// ── 🪜 sel-cara-opuesta · el clic CENTRAL construye por la CARA OPUESTA ───────────────────────────
//
// Dueño (2026-08-28), CORRIGIENDO el primer intento (`sel-rueda-invertida`): «*no se cambia la direccion
// de la rueda, se cambia como se comporta la herramienta. control+abajo despues de hacer clic central
// serviria para crear hacia abajo bloques replicando los seleccionados. por ejemplo si un bloque esta en
// el aire se le podrian poner patas seleccionando sus bloques, clic central, y luego control+abajo*».
// Y de Shift: «*seguir empujando hacia adelante pero rellenando con los bloques seleccionados (por
// ejemplo para construir puentes)*».
//
// LA IDEA, que es lo que se me escapó la primera vez: el motor trabaja SIEMPRE por una cara —la de
// ARRIBA con Ctrl, la que DA LA CARA al jugador con Shift— y construye o come por ella. Este snippet no
// toca la rueda: cambia CUÁL ES ESA CARA. Se pasa a la de ABAJO y a la del FONDO, y el gesto que antes
// comía, ahora construye replicando el bloque de esa cara.
//
//   normal (motor)   Ctrl  ↑ construye ENCIMA        · ↓ come por ARRIBA
//                    Shift ↑ come por la CARA (hueco) · ↓ construye HACIA TI
//
//   cara opuesta     Ctrl  ↓ construye DEBAJO  ← patas
//                          ↑ come por ABAJO           (el inverso, para deshacer la última muesca)
//                    Shift ↑ construye HACIA ADELANTE ← puentes
//                          ↓ come por el FONDO        (el inverso)
//
// Lo que dijo el dueño son las dos muescas que CONSTRUYEN (Ctrl↓ y Shift↑). Las otras dos las he puesto
// yo por simetría, y no es un capricho: es la regla del dueño del 2026-08-20 —«*un wup seguido de un
// wdown debería dejar los bloques iguales que como estaban*»—, que sin ellas se rompería en este modo.
//
// El bloque nuevo sale del que hay en esa cara (`c.id`), no del de la mano: «*replicando los
// seleccionados*». Un muro de varios materiales se prolonga entero, cada columna con el suyo.
//
// LA CAJA SE ESTIRA POR ESA MISMA CARA, igual que hace el motor por la suya: al construir crece una
// celda y al comer encoge una (y con grosor 1 se desplaza entera). Así la muesca siguiente ve lo recién
// puesto sin volver a marcar esquinas — que es lo que hace que las patas salgan de una tacada.
//
// ⚠️ EL CLIC CENTRAL YA TIENE DUEÑO: es el de REDSTONE (`redstone/redstone-piezas.js:823`, conmuta
// palancas y botones). Escucha en `window` en CAPTURA y se registró antes, así que va primero y no hay
// forma limpia de quitárselo. Por eso esto sólo escucha con `mc.tool === 'select'`; aun así, clic
// central apuntando a una palanca conmuta la palanca TAMBIÉN.
//
// NO SE PERSISTE: al recargar se vuelve al motor normal. Un modo escondido que sobrevive a la recarga y
// del que no te acuerdas es indistinguible de un motor roto.
//
// API: game.selOpuesta.on() / .off() / .conmutar() / .estado() / .invierte() / .activo()

const W = window;
const VERSION = 'sel-opuesta-v1';

// `mc` es un `const` de nivel superior de app.js: NO está en `window`, sólo se alcanza por identificador
// pelado. Por eso el guardián mira `typeof mc` y no `W.mc` (que siempre sería undefined).
if (typeof mc === 'undefined' || !mc) {
  console.warn('🪜 sel-cara-opuesta: no hay motor de mundo. Abre /map/<nombre>.');
  return 'sin motor';
}

// YA ESTÁ EN EL MOTOR (2026-08-28). El dueño dio por bueno este snippet —«*esta correcto, aplicar parche
// a app.js*»— y bajó a `app.js` como `mcSelExtruirAbajo`/`mcSelExtruirFondo` (REQ-EXTRU4), con el clic
// central en su sitio. Este snippet se aparta: puesto encima no llegaría a duplicar nada (el envoltorio
// atiende y el original ni se llama), pero sí taparía al motor con esta copia CONGELADA, y cualquier
// arreglo posterior de app.js dejaría de notarse. Se conserva como el original de la Ley de Oro y para
// volver a probar cambios en caliente sobre una copia con otro nombre.
if (typeof mcSelExtruirAbajo === 'function') {
  if (W.game && W.game.selOpuesta && typeof W.game.selOpuesta.off === 'function') W.game.selOpuesta.off();
  toast('🪜 La cara opuesta ya está EN EL MOTOR · no hace falta el snippet', 6);
  return 'ya está en app.js (mcSelExtruirAbajo) · snippet no aplicado';
}

const NECESITA = ['mcSelExtruir', 'mcSelExtruirFrente', 'mcEjeMirada', 'mcSelForEach', 'mcInside',
                  'mcIdx', 'mcSetBlock', 'mcRemeshEdiciones', 'mcPushHist', 'mcScheduleSave',
                  'mcForceUnstick', 'toast'];
const faltan = NECESITA.filter(n => typeof W[n] !== 'function');
if (faltan.length) {
  console.warn('🪜 sel-cara-opuesta: al motor le faltan ' + faltan.join(', ') + ' — ¿app.js anterior a REQ-EXTRU2?');
  return 'motor incompleto: falta ' + faltan.join(', ');
}

// El estado vive en `mc` y no en una variable del snippet para poder mirarlo desde la consola o desde una
// sonda sin pasar por `game.selOpuesta`, y para que `off()` lo deje limpio de verdad.
if (typeof mc._selOpuesta !== 'boolean') mc._selOpuesta = false;

// ── Ctrl con la cara de ABAJO ─────────────────────────────────────────────────────────────────────
// Espejo de `mcSelExtruir`: donde el motor se queda con la CIMA de cada columna, aquí con el SUELO.
// La columna es (caja, x, z) y NO (x, z): dos cajas pueden caer sobre el mismo sitio a distinta altura
// —una en el tejado y otra en el sótano— y son dos suelos, no uno (REQ-SEL1).
function porAbajo(dir) {
  const construye = dir < 0;                       // rueda ABAJO construye: es la petición del dueño
  const col = new Map();
  mcSelForEach((x, y, z, id, ci) => {
    const k = ci + ':' + x + ',' + z, v = col.get(k);
    if (!v || y < v.y) col.set(k, { x, y, z, id });   // ← `<`: el más BAJO (el motor usa `>`)
  });
  // Caja vacía: no es asunto nuestro. El motor ya la mueve (REQ-EXTRU3, `mcSelMueveVacia`) y en el
  // sentido correcto, así que se le devuelve el gesto tal cual, sin tocarle el signo.
  if (!col.size) return null;

  const edits = [];
  for (const c of col.values()) {
    if (construye) {
      const y = c.y - 1;
      if (!mcInside(c.x, y, c.z)) continue;        // suelo del mundo
      const before = mc.grid[mcIdx(c.x, y, c.z)];
      mcSetBlock(c.x, y, c.z, c.id);               // mcSetBlock y no mc.grid[..]=: es un cambio de
      edits.push({ x: c.x, y, z: c.z, before, after: c.id });   // TOPOLOGÍA y tiene que re-iluminar
    } else {
      mcSetBlock(c.x, c.y, c.z, 0);
      edits.push({ x: c.x, y: c.y, z: c.z, before: c.id, after: 0 });
    }
  }
  // Si NINGUNA columna pudo escribir no ha pasado nada, y la caja tampoco se mueve: moverla sería mentir.
  if (!edits.length) { toast(construye ? 'No cabe nada más abajo' : 'Nada que quitar por abajo'); return false; }

  mc._selCajasBeforeEdit = mc.selCajas.map(s => ({ a: s.a.slice(), b: s.b.slice() }));
  for (const s of mc.selCajas) {
    const y0 = Math.min(s.a[1], s.b[1]), y1 = Math.max(s.a[1], s.b[1]);
    const baja = (s.a[1] <= s.b[1]) ? s.a : s.b;   // la esquina que sujeta el SUELO de la caja
    const alta = (baja === s.a) ? s.b : s.a;
    if (construye) baja[1] = Math.max(0, y0 - 1);  // crece una celda hacia abajo
    else { const ny = Math.min(mc.dim.y - 1, y0 + 1); baja[1] = ny; if (y1 < ny) alta[1] = ny; }
  }                                                // alto 1 ⇒ la caja entera sube y sigue comiendo
  mcRemeshEdiciones(edits); mcPushHist({ t: 'bb', edits }); mcScheduleSave();
  toast((construye ? '🪜 Patas — ' : 'Quitado por abajo — ') + edits.length + ' bloque(s)');
  if (construye) mcForceUnstick();                 // construir bajo los pies puede dejarte dentro
  return true;
}

// ── Shift con la cara del FONDO ───────────────────────────────────────────────────────────────────
// Espejo de `mcSelExtruirFrente`: donde el motor se queda con el bloque que DA LA CARA, aquí con el del
// FONDO, y en vez de comérselo pone uno más allá. El eje se recalcula en CADA muesca, como el motor: te
// giras y el puente se gira contigo.
function porElFondo(dir) {
  const construye = dir > 0;                       // rueda ARRIBA construye hacia adelante: la petición
  const m = mcEjeMirada(), eje = m.eje, sN = m.sN; // `sN` apunta AL FRENTE (alejándose del jugador)
  const lim = eje === 0 ? mc.dim.x : mc.dim.z;
  const fila = new Map();
  mcSelForEach((x, y, z, id, ci) => {
    const p = eje === 0 ? x : z;
    const k = ci + ':' + y + ',' + (eje === 0 ? z : x), v = fila.get(k);
    if (!v || (sN > 0 ? p > v.p : p < v.p)) fila.set(k, { x, y, z, p, id });   // ← el del FONDO
  });
  if (!fila.size) return null;                     // caja vacía: la mueve el motor (REQ-EXTRU3)

  const edits = [];
  for (const c of fila.values()) {
    if (construye) {
      const x = c.x + (eje === 0 ? sN : 0), z = c.z + (eje === 2 ? sN : 0);   // una celda más allá
      if (!mcInside(x, c.y, z)) continue;          // borde del mundo
      const before = mc.grid[mcIdx(x, c.y, z)];
      mcSetBlock(x, c.y, z, c.id);                 // con SU material: un muro de varios va entero
      edits.push({ x, y: c.y, z, before, after: c.id });
    } else {
      mcSetBlock(c.x, c.y, c.z, 0);
      edits.push({ x: c.x, y: c.y, z: c.z, before: c.id, after: 0 });
    }
  }
  if (!edits.length) { toast(construye ? 'No cabe nada más adelante' : 'Nada que quitar por el fondo'); return false; }

  mc._selCajasBeforeEdit = mc.selCajas.map(s => ({ a: s.a.slice(), b: s.b.slice() }));
  for (const s of mc.selCajas) {
    const p0 = Math.min(s.a[eje], s.b[eje]), p1 = Math.max(s.a[eje], s.b[eje]);
    const cerca = ((sN > 0) === (s.a[eje] <= s.b[eje])) ? s.a : s.b;   // la esquina que da la cara
    const lejos = (cerca === s.a) ? s.b : s.a;
    if (construye) lejos[eje] = sN > 0 ? Math.min(lim - 1, p1 + 1) : Math.max(0, p0 - 1);
    else { const np = sN > 0 ? Math.max(0, p1 - 1) : Math.min(lim - 1, p0 + 1);
           lejos[eje] = np; if (sN > 0 ? p0 > np : p1 < np) cerca[eje] = np; }   // grosor 1 ⇒ retrocede entera
  }
  mcRemeshEdiciones(edits); mcPushHist({ t: 'bb', edits }); mcScheduleSave();
  toast((construye ? '🌉 Puente — ' : 'Quitado por el fondo — ') + edits.length + ' bloque(s) · eje ' + m.nombre);
  if (construye) mcForceUnstick();
  return true;
}

// ── la costura ────────────────────────────────────────────────────────────────────────────────────
// UNA SOLA. `base` sale de `._orig` si ya había envoltorio nuestro, así que volver a cargar el snippet
// reemplaza el de antes en vez de apilarse encima.
function envuelve(nombre, mio) {
  const f = W[nombre];
  if (f._selOp === VERSION) return 'ya';
  const base = f._selOp ? f._orig : f;
  const env = function (dir) {
    // Las mismas condiciones de entrada que el original y en el mismo orden. Fuera del modo, o sin
    // herramienta/caja/muesca, esto no es asunto nuestro y pasa de largo intacto.
    if (mc._selOpuesta && dir && mc.tool === 'select' && mc.selBox) {
      const r = mio(dir);
      if (r !== null) return r;                    // `null` = «no era para mí»: sigue el motor
    }
    return base.apply(this, arguments);
  };
  env._selOp = VERSION;
  env._orig = base;
  W[nombre] = env;                                 // app.js las llama por identificador pelado
  return 'puesto';                                 // (app.js:23568), y en script clásico eso ES window.X
}

// ── el clic central ───────────────────────────────────────────────────────────────────────────────
// En `window` y en CAPTURA, igual que redstone: en el propio canvas mandaría el orden de registro y
// app.js registró primero (app.js:23519 se come el botón para que el navegador no entre en autoscroll).
function mandaElJugador() {
  // REQ-MOV1: en el móvil no hay pointer-lock que exigir. La pregunta buena la responde `mcMandoActivo`;
  // sin ella (motor viejo) se vuelve al pointer-lock de toda la vida.
  return (typeof mcMandoActivo === 'function') ? mcMandoActivo()
                                               : (mc.active && document.pointerLockElement === mc.canvas);
}

function invierte() {
  mc._selOpuesta = !mc._selOpuesta;
  toast(mc._selOpuesta
    ? '🪜 CARA OPUESTA · Ctrl↓ pone patas debajo · Shift↑ tiende puente hacia adelante'
    : '↩️ Normal · Ctrl↑ construye encima · Shift↑ hace hueco', 4);
  return mc._selOpuesta;
}

function quitaOyente() {
  if (W._selOpMedio) { W.removeEventListener('mousedown', W._selOpMedio, true); W._selOpMedio = null; }
}

function ponOyente() {
  quitaOyente();                                   // ⛔ nunca dos: dos conmutaciones por clic se anulan
  const medio = function (e) {
    if (e.button !== 1 || mc.tool !== 'select' || !mandaElJugador()) return;
    e.preventDefault();                            // si no, el navegador entra en autoscroll
    invierte();
  };
  W.addEventListener('mousedown', medio, true);
  W._selOpMedio = medio;
}

// ── mando ─────────────────────────────────────────────────────────────────────────────────────────
function on() {
  const a = envuelve('mcSelExtruir', porAbajo);
  const b = envuelve('mcSelExtruirFrente', porElFondo);
  ponOyente();
  return (a === 'ya' && b === 'ya') ? 'ya estaba puesto'
       : 'clic central (con Seleccionar) cambia a la cara opuesta';
}

function off() {
  quitaOyente();
  mc._selOpuesta = false;                          // se sale por la puerta normal, no en modo espejo
  let n = 0;
  ['mcSelExtruir', 'mcSelExtruirFrente'].forEach(function (k) {
    const f = W[k];
    if (f && f._selOp && f._orig) { W[k] = f._orig; n++; }
  });
  return n ? 'fuera — la herramienta vuelve a su cara de siempre' : 'ya estaba fuera';
}

function puesto() { return typeof mcSelExtruir === 'function' && mcSelExtruir._selOp === VERSION; }
function activo() { return !!mc._selOpuesta; }
function conmutar() { return puesto() ? off() : on(); }

function estado() {
  const m = mcEjeMirada(), op = !!mc._selOpuesta;
  return {
    puesto: puesto(),
    caraOpuesta: op,
    version: VERSION,
    oyenteClicCentral: !!W._selOpMedio,
    herramienta: mc.tool,
    cajas: mc.selCajas.length,
    hayCaja: !!mc.selBox,
    ejeMirada: m.nombre,
    ctrl: op ? '↓ construye DEBAJO (patas) · ↑ come por abajo'
             : '↑ construye ENCIMA · ↓ come por arriba',
    shift: op ? '↑ construye HACIA ADELANTE (puente) · ↓ come por el fondo'
              : '↑ hace hueco (aleja) · ↓ construye hacia ti',
    nota: 'El bloque nuevo se replica del que hay en esa cara, no del de la mano. Con la caja vacía ' +
          'manda el motor (REQ-EXTRU3). Ojo: redstone también usa el clic central y va primero.'
  };
}

game.selOpuesta = { on: on, off: off, conmutar: conmutar, estado: estado,
                    puesto: puesto, activo: activo, invierte: invierte };

const r = on();

toast('🪜 Clic CENTRAL (con Seleccionar) = construir por la cara opuesta · game.selOpuesta.off() para quitarlo', 6);

return 'sel-cara-opuesta · ' + r;
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
