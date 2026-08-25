// ── 🧱 sel-extruir-frente · Shift+rueda: extruir/cavar EN LA DIRECCIÓN DE LA MIRADA ─────────────────
//
// El motor ya trae Ctrl+rueda (REQ-EXTRU1, `mcSelExtruir`): con la herramienta Seleccionar y una caja
// confirmada, la selección SUBE poniendo bloques o BAJA cavando, siempre por el eje Y. Esto añade el
// mismo gesto por el eje HORIZONTAL al que estés mirando, que es lo que hace falta para trabajar un
// muro de frente:
//
//     Shift + rueda ARRIBA  →  hacia DENTRO: se lleva la capa que te da la cara  ⇒ profundiza cavidades
//     Shift + rueda ABAJO   →  hacia FUERA : pone una capa hacia ti              ⇒ trae el muro / alarga el túnel
//
// ⚠️ Los sentidos son los INVERSOS de Ctrl (allí arriba construye y abajo cava). Aquí arriba se ALEJA
// (hunde) y abajo se ACERCA (trae), que es como lo pidió el dueño: «profundizar cavidades con
// shift+ruedaarriba y traer muros/tuneles hacia mi […] con shift+rueda abajo».
//
// NO TOCA app.js (Ley de Oro). Son dos piezas:
//
//   1. Un oyente de 'wheel' en `window` y en fase de CAPTURA. El del motor está colgado de #mc-canvas,
//      y en el elemento DESTINO los oyentes corren por orden de registro (la bandera de captura ahí no
//      cuenta), así que desde el canvas no habría manera de adelantarlo. Desde `window` sí: la captura
//      va antes de llegar al destino y `stopPropagation()` le corta el paso. Hace falta cortarlo: sin
//      eso, Shift+rueda seguiría además girando la rosca de herramienta (`mcRuedaHerramienta`), que es
//      lo que hace hoy.
//
//   2. La extrusión, calcada de `mcSelExtruir` pero por FILAS (a lo largo del eje que miras) en vez de
//      por columnas, y quedándose con el bloque que te da la cara en vez de con el más alto.
//
// Defecto HEREDADO de Ctrl, a propósito: una muesca y su contraria dejan los BLOQUES como estaban
// (regla del dueño, 2026-08-20), pero la caja no recupera su profundidad — hundir con profundidad 1
// mueve la caja entera y traer después crece solo por el borde activo, así que queda de 2. El motor
// hace exactamente lo mismo en Y. Se copia en vez de corregirse: que los dos gestos hermanos se
// comporten distinto confundiría más que el defecto. Verificado en tests/probe_sel_frente.js §3.
//
// API:  game.selFrente.on() / .off() / .conmutar() / .estado()
//
// Se carga desde el mapa con alt+c. Re-ejecutarlo es seguro: la copia anterior se retira antes.

const W = window;

// `mc` es un `const` de nivel superior de app.js: NO está en `window`, solo se alcanza por identificador
// pelado. Por eso el guardián mira `typeof mc` y no `W.mc` (que siempre sería undefined).
if (typeof mc === 'undefined' || !mc) {
  console.warn('🧱 sel-extruir-frente: no hay motor de mundo. Abre /map/<nombre>.');
  return 'sin motor';
}

// EN EL MOTOR (2026-08-25): el dueño lo dio por bueno («funciona correcto») y bajó a app.js como
// `mcSelExtruirFrente`, dentro del propio oyente de rueda del canvas. Este snippet se aparta: puesto
// encima, el oyente de captura de aquí y el del motor se comerían UNA MUESCA CADA UNO — dos capas por
// muesca. Es el mismo tropiezo que ya se dio con `parche-luz-dia-ley`. Se conserva como el original de
// la Ley de Oro y para volver a probar cambios en caliente sobre una copia con otro nombre.
if (typeof mcSelExtruirFrente === 'function') {
  if (W.game && W.game.selFrente && typeof W.game.selFrente.off === 'function') W.game.selFrente.off();
  toast('🧱 Shift+rueda ya está EN EL MOTOR · no hace falta el snippet', 6);
  return 'ya está en app.js (mcSelExtruirFrente) · snippet no aplicado';
}

const NECESITA = ['mcSelForEach', 'mcInside', 'mcIdx', 'mcSetBlock', 'mcRemeshEdiciones',
                  'mcPushHist', 'mcScheduleSave', 'mcForceUnstick', 'toast', 'mcRaycast', 'mcSelCount'];
const faltan = NECESITA.filter(n => typeof W[n] !== 'function');
if (faltan.length) {
  console.warn('🧱 sel-extruir-frente: al motor le faltan ' + faltan.join(', ') + ' — ¿versión distinta de app.js?');
  return 'motor incompleto';
}

// Re-ejecutable (alt+c dos veces): si ya había una copia puesta, se retira su oyente antes de poner
// ésta. Si no, cada carga dejaría un oyente más y una muesca movería la selección varias veces.
if (W.game && W.game.selFrente && typeof W.game.selFrente.off === 'function') W.game.selFrente.off();

// Eje horizontal al que se mira. Convenio de app.js (el de mcRaycast y compañía):
//     adelante = [-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch)]
// Nos quedamos con el eje dominante en horizontal y su signo, con `sN` apuntando AL FRENTE (lejos de
// ti). Se recalcula EN CADA MUESCA, no al cargar: te giras y el gesto se gira contigo.
function ejeMirada() {
  const fx = -Math.sin(mc.yaw || 0), fz = -Math.cos(mc.yaw || 0);
  if (Math.abs(fx) >= Math.abs(fz)) return { eje: 0, sN: fx >= 0 ? 1 : -1, nombre: fx >= 0 ? '+X' : '-X' };
  return { eje: 2, sN: fz >= 0 ? 1 : -1, nombre: fz >= 0 ? '+Z' : '-Z' };
}

function extruyeFrente(dir) {
  if (mc.tool !== 'select' || !mc.selBox || !dir) return false;
  const dentro = dir > 0;                       // rueda arriba = hundir · rueda abajo = traer
  const m = ejeMirada(), eje = m.eje, sN = m.sN;
  const lim = eje === 0 ? mc.dim.x : mc.dim.z;

  // Una sola pasada por la selección quedándose con el bloque de cada FILA que da a la cara (el más
  // cercano a ti). La fila es (caja, las otras dos coordenadas) y NO solo las coordenadas: dos cajas
  // pueden caer sobre la misma fila a distinta profundidad y son dos caras, no una — mismo motivo por
  // el que `mcSelExtruir` mete `ci` en la clave de la columna (REQ-SEL1).
  const fila = new Map();
  mcSelForEach((x, y, z, id, ci) => {
    const p = eje === 0 ? x : z;
    const k = ci + ':' + y + ',' + (eje === 0 ? z : x);
    const v = fila.get(k);
    // «cerca» es el MENOR a lo largo del eje si miras hacia +, y el MAYOR si miras hacia −.
    if (!v || (sN > 0 ? p < v.p : p > v.p)) fila.set(k, { x: x, y: y, z: z, p: p, id: id });
  });
  if (!fila.size) { toast('La selección no tiene bloques: nada que ' + (dentro ? 'hundir' : 'traer')); return false; }

  const edits = [];
  for (const c of fila.values()) {
    if (dentro) {
      // Hundir = quitar la capa que da a la cara. La muesca siguiente se encuentra con la de detrás, así
      // que repetir el gesto va profundizando la cavidad.
      mcSetBlock(c.x, c.y, c.z, 0);
      edits.push({ x: c.x, y: c.y, z: c.z, before: c.id, after: 0 });
    } else {
      // Traer = poner un bloque JUSTO DELANTE del que da a la cara, hacia ti, con SU material (así un
      // muro de varios materiales viene entero y no se aplana a uno solo).
      const x = c.x - (eje === 0 ? sN : 0), z = c.z - (eje === 2 ? sN : 0);
      if (!mcInside(x, c.y, z)) continue;                        // borde del mundo
      const before = mc.grid[mcIdx(x, c.y, z)];
      mcSetBlock(x, c.y, z, c.id);                               // mcSetBlock y no mc.grid[..]=: es un
      edits.push({ x: x, y: c.y, z: z, before: before, after: c.id });   // cambio de TOPOLOGÍA y tiene
    }                                                            // que re-iluminar (mc.gridGen)
  }
  // Si NINGUNA fila pudo escribir no ha pasado nada, y la caja tampoco se mueve: moverla sería mentir.
  // Es la misma regla que `mcSelExtruir` aprendió a la fuerza (una muesca hacia dentro seguida de otra
  // hacia fuera tiene que dejar los bloques como estaban).
  if (!edits.length) { toast(dentro ? 'Nada que hundir' : 'No cabe nada más hacia ti'); return false; }

  // Con alguna escrita sí se mueve, aunque otras se hayan quedado sin sitio: lo que enseña el marco cian
  // es DÓNDE va la muesca siguiente, no cuántos bloques salieron. Se mueven TODAS las cajas, cada una
  // por su cuenta, por su borde ACTIVO — que aquí es el que te da la cara, no el de arriba.
  mc._selCajasBeforeEdit = mc.selCajas.map(s => ({ a: s.a.slice(), b: s.b.slice() }));
  for (const s of mc.selCajas) {
    const p0 = Math.min(s.a[eje], s.b[eje]), p1 = Math.max(s.a[eje], s.b[eje]);
    const cerca = ((sN > 0) === (s.a[eje] <= s.b[eje])) ? s.a : s.b;   // la esquina que te da la cara
    const lejos = (cerca === s.a) ? s.b : s.a;
    if (dentro) {
      const np = sN > 0 ? Math.min(lim - 1, p0 + 1) : Math.max(0, p1 - 1);
      cerca[eje] = np;
      if (sN > 0 ? p1 < np : p0 > np) lejos[eje] = np;   // profundidad 1 ⇒ la caja entera avanza
    } else {
      cerca[eje] = sN > 0 ? Math.max(0, p0 - 1) : Math.min(lim - 1, p1 + 1);
    }
  }

  mcRemeshEdiciones(edits); mcPushHist({ t: 'bb', edits }); mcScheduleSave();
  toast((dentro ? 'Hundido' : 'Traído') + ' — ' + edits.length + ' bloque(s) · eje ' + m.nombre);

  if (!dentro) mcForceUnstick();   // traer el muro hacia ti puede dejarte metido dentro

  return true;
}

function umbral() {
  return (isFinite(+mc.ruedaUmbral) && +mc.ruedaUmbral > 0) ? +mc.ruedaUmbral : 30;
}

function alRodar(e) {
  if (!mc.active || document.pointerLockElement !== mc.canvas) return;
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;   // Ctrl es del motor; Shift a secas, nuestro
  if (mc.tool !== 'select') return;

  // Con la esquina A puesta pero sin caja confirmada, la rueda la cierra sola tomando el bloque apuntado
  // como B — igual que hace Ctrl+rueda en el motor, para no obligar a un segundo clic.
  if (mc.selA && !mc.selBox) {
    const near = mcRaycast();
    const b = (near && near.cell[1] >= 0) ? near.cell.slice() : mc.selA.slice();
    const caja = { a: mc.selA.slice(), b: b };
    if (mc.selSuma) mc.selCajas.push(caja); else mc.selBox = caja;
    mc.selA = null; mc.selSuma = false;
    toast(mcSelCount() + ' bloque(s) — auto-selección · Shift+rueda hunde/trae');
  }
  if (!mc.selBox) return;        // sin caja esto no es nuestro gesto: que siga hasta la rosca del motor

  e.preventDefault();
  e.stopPropagation();           // ⛔ que no llegue al oyente del canvas, o además giraría la rosca

  // Acumulador PROPIO. Compartir `mc._ruedaAcum` con el motor mezclaría media muesca de un gesto con
  // media del otro, que es justo lo que el motor evita vaciándolo al cambiar de gesto.
  mc._ruedaFrenteAcum = (mc._ruedaFrenteAcum || 0) + e.deltaY;
  if (Math.abs(mc._ruedaFrenteAcum) < umbral()) return;
  const paso = mc._ruedaFrenteAcum > 0 ? -1 : 1;   // deltaY > 0 = rueda hacia abajo = traer hacia ti
  mc._ruedaFrenteAcum = 0;
  extruyeFrente(paso);
}

let puesto = false;

function on() {
  if (puesto) return 'ya estaba puesto';
  W.addEventListener('wheel', alRodar, { capture: true, passive: false });
  puesto = true;
  return 'Shift+rueda: arriba hunde (hacia dentro) · abajo trae (hacia ti)';
}

function off() {
  if (!puesto) return 'ya estaba fuera';
  W.removeEventListener('wheel', alRodar, { capture: true });
  puesto = false;
  mc._ruedaFrenteAcum = 0;
  return 'fuera — Shift+rueda vuelve a ser lo que era';
}

function conmutar() { return puesto ? off() : on(); }

function estado() {
  const m = ejeMirada();
  return {
    puesto: puesto,
    herramienta: mc.tool,
    cajas: mc.selCajas.length,
    bloques: mc.selBox ? mcSelCount() : 0,
    ejeMirada: m.nombre,
    umbralRueda: umbral(),
    gesto: 'Shift+rueda ARRIBA = hundir hacia dentro · ABAJO = traer hacia ti',
    nota: 'Ctrl+rueda sigue siendo el de siempre (arriba construye / abajo cava, por Y)'
  };
}

game.selFrente = { on: on, off: off, conmutar: conmutar, estado: estado,
                   extruye: extruyeFrente, eje: ejeMirada };

on();

toast('🧱 Shift+rueda listo · con Seleccionar y una caja: arriba HUNDE · abajo TRAE', 5);

return 'sel-extruir-frente puesto · game.selFrente.estado()';
