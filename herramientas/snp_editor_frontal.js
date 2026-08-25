// ── 🪞 editor-frontal-lado · el botón «Frontal» mira el modelo desde el lado que NO toca ────────────
//
// Queja del dueño (2026-08-25): «*hay una discrepancia entre el editor 2d y 3d, los dibujos salen
// espejados: como se diseña en la vista 2d, al ir a la vista 3d sale espejado; si es de izq→der sale de
// der→izq*».
//
// NO es un espejo: es que se mira desde el otro lado. Medido en tests/test_espejo_2d3d.js:
//
//     vista 2D (Capas)          +X a la DERECHA        ← lo que se dibuja
//     miniatura iso (rot=0)     +X a la DERECHA        ✓
//     vista 3D libre (defecto)  +X a la DERECHA        ✓
//     botón «Frontal»           +X a la IZQUIERDA      ✗  ← el único que discrepa
//
// El porqué está en una sola línea de `toggleCamFront`: pone `view3d.yaw = 0`, y con yaw=0 la
// profundidad de +Y sale POSITIVA (+Y se aleja) ⇒ la cámara queda en −Y, o sea asomada por el borde de
// ARRIBA del plano 2D. Mirando un plano desde su borde de arriba, la izquierda y la derecha se cambian.
// Y no es solo cuestión de gusto: en el Mundo el eje Y del editor es la PROFUNDIDAD (editor-Y →
// mundo-Z), y un jugador con yaw 0 mira hacia −Z, o sea que está en +Y del editor. Con `yaw = π` la
// cámara se pone justo ahí: el «Frontal» pasa a enseñar lo mismo que ve el jugador en el mapa y lo mismo
// que se acaba de dibujar en Capas.
//
// Se cambia SOLO el preset del botón. La rotación libre, la miniatura y el 2D ya estaban de acuerdo y no
// se tocan (el `-x1` de `project3d` NO es el culpable, por más que lo parezca al leerlo).
//
// NO TOCA app.js (Ley de Oro). Envuelve `toggleCamFront` guardando el original en `._orig`, y REBINDEA
// el botón: `$('#e3-cam').onclick=toggleCamFront` guardó la referencia vieja al cargar la página, así
// que cambiar `window.toggleCamFront` a secas no llegaría al clic.
//
// API:  game.frontalLado.on() / .off() / .estado()
//
// Se prueba en el EDITOR (`/`): pestaña «Código» → ▶ (o Ctrl+Enter). Luego se le da al botón «Frontal»
// de la vista 3D y se compara con Capas. Re-ejecutarlo es seguro: la copia anterior se retira antes.

const W = window;
const D = document;

// `view3d` es un `const` de nivel superior de app.js: NO está en `window`, solo se alcanza por
// identificador pelado. Por eso el guardián mira `typeof view3d` y no `W.view3d` (siempre undefined).
if (typeof view3d === 'undefined' || !view3d) {
  console.warn('🪞 editor-frontal-lado: esto es del EDITOR de objetos. Abre / (no /map/<nombre>).');
  return 'sin editor';
}
if (typeof toggleCamFront !== 'function' || W.toggleCamFront !== toggleCamFront) {
  console.warn('🪞 editor-frontal-lado: no encuentro toggleCamFront — ¿otra versión de app.js?');
  return 'editor incompleto';
}

// EN EL MOTOR: si app.js ya lleva el arreglo, este snippet se aparta (puesto encima volvería a girar
// media vuelta y dejaría el «Frontal» mirando otra vez desde atrás).
if (typeof MC_FRONTAL_YAW !== 'undefined') {
  toast('🪞 El «Frontal» ya está arreglado EN EL MOTOR · snippet no aplicado', 5);
  return 'ya está en app.js (MC_FRONTAL_YAW) · snippet no aplicado';
}

// Re-ejecutable (▶ dos veces): se retira la copia anterior o se apilarían dos envolturas.
if (W.game && W.game.frontalLado && typeof W.game.frontalLado.off === 'function') W.game.frontalLado.off();

const YAW_BUENO = Math.PI;     // cámara en +Y del editor = donde está el jugador en el mapa

// ¿Acaba de entrar en «Frontal»? El original deja exactamente yaw=0 y pitch=0; `camFront` es un `let`
// de nivel superior y NO se alcanza desde aquí, así que se reconoce por esos dos ceros. Un usuario que
// hubiera dejado su vista libre clavada en (0,0) al milésimo entraría por aquí también: es inofensivo
// —le pone el frontal bueno— y no hay forma de distinguirlo sin tocar app.js.
function esFrontalCrudo() { return view3d.yaw === 0 && view3d.pitch === 0; }

function arregla() {
  if (!esFrontalCrudo()) return false;
  view3d.yaw = YAW_BUENO;
  if (typeof drawEdit3d === 'function') drawEdit3d();
  return true;
}

let puesto = false;
let botonPrevio = null;

function on() {
  if (puesto) return 'ya estaba puesto';
  const orig = W.toggleCamFront;
  const envuelta = function () {
    const r = orig.apply(this, arguments);
    arregla();
    return r;
  };
  envuelta._orig = orig;
  W.toggleCamFront = envuelta;
  // El botón guardó la referencia VIEJA en su onclick al cargar la página: hay que rebindearlo o el
  // clic seguiría llamando al original y no se notaría nada.
  const b = D.querySelector('#e3-cam');
  if (b) { botonPrevio = b.onclick; b.onclick = envuelta; }
  puesto = true;
  arregla();                     // si ya estaba en «Frontal», se endereza ahora mismo
  return 'puesto · el «Frontal» mira desde el mismo lado que Capas';
}

function off() {
  if (!puesto) return 'ya estaba fuera';
  if (W.toggleCamFront && W.toggleCamFront._orig) W.toggleCamFront = W.toggleCamFront._orig;
  else console.warn('🪞 editor-frontal-lado: alguien envolvió toggleCamFront después; no lo desenvuelvo');
  const b = D.querySelector('#e3-cam');
  if (b && botonPrevio) b.onclick = botonPrevio;
  botonPrevio = null;
  puesto = false;
  return 'fuera — el «Frontal» vuelve a mirar desde atrás';
}

// Profundidad del eje +Y con la cámara de ahora: es rotP(0,1,0)[1] = cos(yaw)·cos(pitch). Negativa =
// +Y viene HACIA ti = miras el modelo desde el mismo lado que en Capas. Positiva = lo miras desde el
// borde de arriba del plano y la izquierda y la derecha salen cambiadas.
function profundidadY() { return Math.cos(view3d.yaw) * Math.cos(view3d.pitch); }

function estado() {
  return {
    puesto: puesto,
    yawActual: view3d.yaw,
    pitchActual: view3d.pitch,
    profundidadY: profundidadY(),
    deFrenteAlPlano2D: profundidadY() < 0,
    yawDelFrontal: YAW_BUENO,
    comoSeSabe: 'tests/test_espejo_2d3d.js compara 2D, iso, 3D libre y 3D frontal con la misma marca'
  };
}

game.frontalLado = { on: on, off: off, estado: estado };

on();

toast('🪞 «Frontal» arreglado · dale al botón y compara con Capas: +X tiene que ir a la derecha en las dos', 7);

return 'editor-frontal-lado puesto · game.frontalLado.estado()';
