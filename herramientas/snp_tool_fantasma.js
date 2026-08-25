// ── 👻 tool-fantasma · la parte TAPADA de la herramienta en mano, en rayos X ────────────────────────
//
// La herramienta en primera persona es una estructura de verdad (REQ-HELDTOOL, `mc._heldToolStruct`):
// se ilumina, se refleja y RECIBE PRUEBA DE PROFUNDIDAD como todo lo demás. Por eso, cuando te pegas a
// una pared o metes el pico en el suelo, el trozo tapado sencillamente no se dibuja y la herramienta
// aparece cortada. Esto le devuelve ese trozo, pero en «fantasma»: gris claro, plano y translúcido.
//
//     Visible → como siempre.   Tapado por un bloque → silueta gris translúcida.
//
// CÓMO, sin recompilar un solo shader. El truco está en los ATRIBUTOS CONSTANTES de WebGL: con
// `disableVertexAttribArray` + `vertexAttrib*f` se le da a un atributo un valor fijo para todos los
// vértices. Se dibuja la misma geometría con el programa de estructuras del motor y:
//
//     aEmit  = 1.0   ⇒ el FS hace `mix(iluminado, vColor, em)` = vColor PELADO. Sin luz, sin sol, sin
//                      sombra… y su línea de niebla va multiplicada por `(1.0 - em)`, así que tampoco
//                      hay niebla. La salida es exactamente vec4(vColor, vAlpha).
//     aColor = gris  ⇒ el color plano que se ve (adiós a los colores del dibujo, que es lo pedido).
//     aAlpha = 0.30  ⇒ la transparencia.
//     aShade = 1.0   ⇒ elegido a conciencia: `mcViento(1.0)` da 0, o sea NADA de viento. Un valor con
//                      el bit de viento puesto haría ondear el fantasma respecto de la herramienta real.
//
// Y para que salga SOLO lo tapado, `depthFunc(GREATER)`: pasa el fragmento que está DETRÁS de lo ya
// pintado, que es justo el trozo escondido.
//
// DÓNDE se engancha, que es lo delicado: en `mcDrawVoxUI`, es decir ANTES de las pasadas de estructuras.
// En ese punto la profundidad tiene el terreno pero la herramienta AÚN NO SE HA DIBUJADO, así que
// «detrás de lo ya pintado» significa «detrás de un bloque» y nada más. Enganchado después, la
// herramienta ya habría escrito su propia profundidad y el fantasma saldría también donde la
// herramienta SE TAPA A SÍ MISMA — una neblina gris por encima del pico entero. Luego el motor pinta
// encima la parte visible con su pasada normal, y cada trozo queda en su sitio.
//
// LIMITACIÓN CONOCIDA: la pasada no escribe profundidad y no ordena, así que donde el objeto tiene
// varias capas de grosor el gris se acumula y se ve más denso. Se deja así a propósito: ordenar por
// distancia costaría rehacer el VBO cada frame (es el mismo motivo por el que existe BUG-TOOL3), y en
// una silueta translúcida ese engrosamiento se lee como volumen. Con `game.toolFantasma.alpha(n)` se
// ajusta al gusto.
//
// NO TOCA app.js (Ley de Oro). Envuelve `mcDrawVoxUI` guardando el original en `._orig`.
//
// API:  game.toolFantasma.on() / .off() / .conmutar() / .estado()
//       game.toolFantasma.alpha(0.30)        · transparencia
//       game.toolFantasma.color(0.85,0.88,0.94)  · el gris (o el tono que quieras)
//
// Se carga desde el mapa con alt+c. Re-ejecutarlo es seguro: la copia anterior se retira antes.

const W = window;

// `mc` es un `const` de nivel superior de app.js: NO está en `window`, solo se alcanza por identificador
// pelado. Por eso el guardián mira `typeof mc` y no `W.mc` (que siempre sería undefined).
if (typeof mc === 'undefined' || !mc) {
  console.warn('👻 tool-fantasma: no hay motor de mundo. Abre /map/<nombre>.');
  return 'sin motor';
}

// EN EL MOTOR (2026-08-25): el dueño lo dio por bueno y bajó a app.js como `mcToolFantasma`, con su mando
// `game.toolFantasma`. Este snippet se aparta: puesto encima pintaría el fantasma DOS VECES (el doble de
// denso), que es el mismo tropiezo que ya se dio con `parche-luz-dia-ley`. Se conserva como el original
// de la Ley de Oro y para volver a probar cambios en caliente sobre una copia con otro nombre.
if (typeof mcToolFantasma === 'function') {
  if (W.game && W.game.toolFantasma && typeof W.game.toolFantasma.off === 'function') W.game.toolFantasma.off();
  toast('👻 El fantasma ya está EN EL MOTOR · se maneja con game.toolFantasma = true/false', 6);
  return 'ya está en app.js (game.toolFantasma) · snippet no aplicado';
}
if (typeof mcDrawVoxUI !== 'function' || W.mcDrawVoxUI !== mcDrawVoxUI) {
  console.warn('👻 tool-fantasma: no encuentro mcDrawVoxUI en el motor — ¿otra versión de app.js?');
  return 'motor incompleto';
}
const NECESITA = ['mcModelOf', 'mcAttribs', 'mcStructGL'];
const faltan = NECESITA.filter(n => typeof W[n] !== 'function');
if (faltan.length) {
  console.warn('👻 tool-fantasma: al motor le faltan ' + faltan.join(', '));
  return 'motor incompleto';
}

// Re-ejecutable (alt+c dos veces): se retira la copia anterior antes de poner ésta, o se apilarían dos
// envolturas y el fantasma se pintaría dos veces (el doble de denso).
if (W.game && W.game.toolFantasma && typeof W.game.toolFantasma.off === 'function') W.game.toolFantasma.off();

const cfg = {
  alpha: 0.30,
  color: [0.85, 0.88, 0.94]   // blanco frío: gris azulado, que se despega del terreno sin cantar
};

// Los tres lotes de una estructura. `aPos` son SIEMPRE los 3 primeros floats del vértice, así que con el
// stride correcto y desplazamiento 0 se puede leer la posición de los tres con el mismo programa —
// aunque el lote texturado tenga otro layout (aPos+aTile+aRect+aShade), que aquí no nos importa porque
// todo lo demás va constante.
const LOTES = [
  { vbo: 'colVbo',   n: 'colCount',   stride: 9 * 4 },
  { vbo: 'texVbo',   n: 'texCount',   stride: 10 * 4 },
  { vbo: 'alphaVbo', n: 'alphaCount', stride: 9 * 4 }
];

function pintaFantasma(pj, view) {
  const s = mc._heldToolStruct;
  if (!s || !mc.structProg) return;
  const gl = mc.gl, SL = mc.structLoc;
  if (!gl || !SL) return;

  let hay = false;
  for (const L of LOTES) if (s[L.n] && s[L.vbo]) { hay = true; break; }
  if (!hay) return;

  mcStructGL(true);                       // culling y sesgo, igual que las pasadas de estructuras
  gl.useProgram(mc.structProg);
  gl.uniformMatrix4fv(SL.uProj, false, pj.m);
  gl.uniformMatrix4fv(SL.uView, false, view);
  gl.uniformMatrix4fv(SL.uModel, false, mcModelOf(s));
  // El FS descarta por `uClipY` si vale > -999; las pasadas del motor lo dejan en -1000, pero no se da
  // por hecho: si otro parche lo hubiera movido, el fantasma desaparecería sin motivo aparente.
  if (SL.uClipY) gl.uniform1f(SL.uClipY, -1000.0);

  // Solo la POSICIÓN sale del buffer; el resto son constantes. mcAttribs apaga todos los arrays y
  // enciende los de la lista, que es exactamente lo que hace falta para que valgan los `vertexAttrib*f`.
  mcAttribs([SL.aPos]);
  gl.vertexAttrib3f(SL.aColor, cfg.color[0], cfg.color[1], cfg.color[2]);
  gl.vertexAttrib1f(SL.aShade, 1.0);      // mcViento(1.0)=0 ⇒ sin viento (ver cabecera)
  gl.vertexAttrib1f(SL.aEmit, 1.0);       // ⇒ color pelado, sin luz ni niebla
  gl.vertexAttrib1f(SL.aAlpha, cfg.alpha);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.depthFunc(gl.GREATER);               // ⬅ LA línea: solo lo que queda DETRÁS de lo ya pintado

  for (const L of LOTES) {
    const n = s[L.n], vbo = s[L.vbo];
    if (!n || !vbo) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.vertexAttribPointer(SL.aPos, 3, gl.FLOAT, false, L.stride, 0);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }

  // Devolver el estado como estaba. `depthFunc(LESS)` es lo que da por hecho el resto del frame (el
  // propio motor lo repone así tras su apaño de BUG-TOOL3), y dejar el GREATER puesto borraría media
  // escena a partir de aquí.
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  mcStructGL(false);
}

let puesto = false;

function on() {
  if (puesto) return 'ya estaba puesto';
  const orig = W.mcDrawVoxUI;
  const envuelta = function (pj, view) {
    const r = orig.apply(this, arguments);
    // DESPUÉS del original y ANTES de las pasadas de estructuras: en este punto la profundidad lleva el
    // terreno pero no la herramienta (ver cabecera). Si algo falla aquí se apaga solo: un throw en mitad
    // del render dejaría el mundo negro y el estado de GL a medias.
    try { pintaFantasma(pj, view); }
    catch (e) { console.warn('👻 tool-fantasma: se apaga solo tras un error —', e); off(); }
    return r;
  };
  envuelta._orig = orig;
  W.mcDrawVoxUI = envuelta;
  puesto = true;
  return 'fantasma puesto · lo tapado de la herramienta sale en gris translúcido';
}

function off() {
  if (!puesto) return 'ya estaba fuera';
  // Solo se desenvuelve si la de arriba es LA NUESTRA: si otro parche envolvió después, quitar la
  // nuestra del medio se llevaría la suya por delante. En ese caso se deja y se avisa.
  if (W.mcDrawVoxUI && W.mcDrawVoxUI._orig) W.mcDrawVoxUI = W.mcDrawVoxUI._orig;
  else console.warn('👻 tool-fantasma: alguien envolvió mcDrawVoxUI después; no lo desenvuelvo');
  puesto = false;
  return 'fuera — la herramienta vuelve a salir cortada donde la tapan';
}

function conmutar() { return puesto ? off() : on(); }

function alpha(a) {
  if (a === undefined) return cfg.alpha;
  cfg.alpha = Math.max(0, Math.min(1, +a || 0));
  return cfg.alpha;
}

function color(r, g, b) {
  if (r === undefined) return cfg.color.slice();
  cfg.color = [+r || 0, +g || 0, +b || 0];
  return cfg.color.slice();
}

function estado() {
  const s = mc._heldToolStruct;
  return {
    puesto: puesto,
    hayHerramienta: !!s,
    herramienta: mc._heldToolKey || null,
    lotes: s ? { color: s.colCount | 0, textura: s.texCount | 0, alfa: s.alphaCount | 0 } : null,
    alpha: cfg.alpha,
    color: cfg.color.slice(),
    comoSeHace: 'atributos constantes (aEmit=1 ⇒ color pelado) + depthFunc(GREATER) ⇒ solo lo tapado',
    nota: 'donde el objeto es grueso el gris se acumula: no ordena ni escribe profundidad (ver cabecera)'
  };
}

game.toolFantasma = { on: on, off: off, conmutar: conmutar, alpha: alpha, color: color, estado: estado };

on();

toast('👻 Fantasma puesto · lo que tape un bloque de la herramienta sale en gris translúcido', 5);

return 'tool-fantasma puesto · game.toolFantasma.estado()';
