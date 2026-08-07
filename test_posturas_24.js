// BUG-ROT1 · un cubo se puede poner de 24 maneras (6 caras arriba x 4 giros por cara) y el Mundo solo
// llegaba a 16: con dos ejes (vuelco sobre X + giro sobre Y) las 6 caras si salian arriba, pero TUMBADA
// DE LADO (+X o -X arriba) unicamente 2 de los 4 giros. Faltaban 8 posturas, y no habia forma de pedirlas.
//
// Aqui se comprueba, sin navegador, lo que gobierna todo lo demas:
//   A · las 24 salen, son 24 DISTINTAS, y las 6 caras aparecen 4 veces cada una;
//   B · los codigos @0..@15 siguen significando EXACTAMENTE lo de antes (los mundos guardados no se
//       mueven ni un grado) — es el criterio de aceptacion duro;
//   C · el gesto que pidio el dueno: R recorre 6 caras, Shift+R los 4 giros dentro de la cara;
//   D · la huella (mcOriDims) concuerda con la geometria de verdad, postura a postura.
//
// Se extraen las funciones VERBATIM de app.js: si alguien toca mcRotXZ o la composicion de
// mcStructGeom, este arnes se entera. No abre servidor ni navegador.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('/root/voxel/app.js', 'utf8');
// Cada funcion de nivel superior de app.js acaba con '}' en la columna 0.
function extraer(nombre) {
  const ini = src.indexOf('\nfunction ' + nombre + '(');
  if (ini < 0) throw new Error('no encuentro function ' + nombre + ' en app.js');
  const fin = src.indexOf('\n}\n', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 3);
}
// Los `const NOMBRE=(function(){ ... })();` se cortan por el '})();' en columna 0.
function extraerIIFE(nombre) {
  const ini = src.indexOf('\nconst ' + nombre + '=(function(){');
  if (ini < 0) throw new Error('no encuentro const ' + nombre + ' en app.js');
  const fin = src.indexOf('\n})();\n', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 6);
}
// mcOriNorm y mcOriParts caben en una linea, asi que el corte por '\n}\n' se comeria medio fichero.
function extraerLinea(nombre) {
  const ini = src.indexOf('\nfunction ' + nombre + '(');
  if (ini < 0) throw new Error('no encuentro function ' + nombre + ' en app.js');
  const fin = src.indexOf('\n', ini + 1);
  const linea = src.slice(ini + 1, fin + 1);
  if (linea.indexOf('}') < 0) throw new Error(nombre + ' ya no cabe en una linea: usa extraer()');
  return linea;
}
function extraerConst(nombre) {
  const ini = src.indexOf('\nconst ' + nombre + '=[');
  if (ini < 0) throw new Error('no encuentro const ' + nombre + ' en app.js');
  const fin = src.indexOf('\n];\n', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 4);
}

let ok = 0, fallos = 0;
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
}

const sandbox = { console, Number, Math, Map, Set, Object, Array, String, mc: { previewCara: 0, previewGiro: 0 } };
vm.createContext(sandbox);
vm.runInContext(
  extraerConst('MC_FACES') +
  extraer('mcRotXZ') +
  extraerIIFE('MC_ORI') +
  extraerLinea('mcOriNorm') +
  extraerLinea('mcOriParts') +
  extraerIIFE('MC_ORI_CARA') +
  extraer('mcOriDims') +
  extraer('mcPreviewOri') +
  extraer('mcFacePerm') +
  extraer('mcOriMove') +
  extraerLinea('mcOriPerm') +
  // Un `const` de nivel superior NO se cuelga del objeto de contexto (las `function` si), asi que las
  // tres tablas se pasan a mano. `this` aqui dentro es el global del sandbox.
  '\nthis.MC_FACES=MC_FACES; this.MC_ORI=MC_ORI; this.MC_ORI_CARA=MC_ORI_CARA;\n',
  sandbox);
const { MC_ORI, MC_FACES, MC_ORI_CARA, mcRotXZ, mcOriNorm, mcOriParts, mcOriDims, mcPreviewOri,
        mcFacePerm, mcOriMove, mcOriPerm } = sandbox;

// La MISMA composicion que aplica mcStructGeom, calcada aqui a proposito: si la de app.js se desvia,
// las comprobaciones C y D dejan de cuadrar y se ve. La huella no pinta (el offset se cancela al restar).
function mueve(roll, tilt, yaw, x, y, z) {
  const p = mcRotXZ(x, y, roll, 1, 1), q = mcRotXZ(p[1], z, tilt, 1, 1), r = mcRotXZ(p[0], q[1], yaw, 1, 1);
  return [r[0], q[0], r[1]];
}
function matriz(ori) {
  const [roll, tilt, yaw] = mcOriParts(ori);
  const o = mueve(roll, tilt, yaw, 0, 0, 0);
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => {
    const q = mueve(roll, tilt, yaw, v[0], v[1], v[2]);
    return [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  });
}
const firma = ori => matriz(ori).map(c => c.join(',')).join('|');
// Que cara del dibujo acaba mirando a +Y con esta postura.
function caraArriba(ori) {
  const m = matriz(ori);
  const gira = d => [0, 1, 2].reduce((a, k) => [a[0] + m[k][0] * d[k], a[1] + m[k][1] * d[k], a[2] + m[k][2] * d[k]], [0, 0, 0]);
  return MC_FACES.findIndex(F => { const q = gira(F.dir); return q[0] === 0 && q[1] === 1 && q[2] === 0; });
}

// ── A · las 24 posturas ────────────────────────────────────────────────────────────────────────────
console.log('\nA · estan las 24 y son distintas');
t('MC_ORI tiene 24 posturas', MC_ORI.length === 24, MC_ORI.length + ' posturas');

const firmas = new Set();
for (let o = 0; o < MC_ORI.length; o++) firmas.add(firma(o));
t('...y las 24 son rotaciones DISTINTAS', firmas.size === 24, firmas.size + ' distintas');

// El grupo de rotaciones del cubo tiene 24 elementos exactos: si salieran mas, alguna seria un espejo.
const detMal = [];
for (let o = 0; o < MC_ORI.length; o++) {
  const m = matriz(o);
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[1][0] * (m[0][1] * m[2][2] - m[0][2] * m[2][1])
            + m[2][0] * (m[0][1] * m[1][2] - m[0][2] * m[1][1]);
  if (det !== 1) detMal.push(o + ':det=' + det);
}
t('ninguna es un espejo (determinante 1: son giros de verdad)', detMal.length === 0, detMal.join(' '));

const porCara = new Map();
for (let o = 0; o < 24; o++) {
  const c = caraArriba(o);
  porCara.set(c, (porCara.get(c) || 0) + 1);
}
t('las 6 caras del cubo llegan a quedar arriba', porCara.size === 6, [...porCara.keys()].sort().join(','));
t('...y cada una con sus 4 giros (era 2 en las tumbadas de lado)',
  [...porCara.values()].every(n => n === 4), [...porCara.entries()].map(([c, n]) => c + '×' + n).join(' '));

// ── B · los mundos guardados no se mueven ──────────────────────────────────────────────────────────
console.log('\nB · compatibilidad: @0..@15 significan lo mismo que antes');
// Antes: yaw = rot&3 (sobre Y), tilt = (rot>>2)&3 (sobre X), sin roll.
const viejo = [];
for (let rot = 0; rot < 16; rot++) {
  const [roll, tilt, yaw] = mcOriParts(rot);
  if (roll !== 0 || tilt !== ((rot >> 2) & 3) || yaw !== (rot & 3)) viejo.push('@' + rot);
}
t('los 16 codigos viejos siguen siendo (roll=0, tilt=rot>>2, yaw=rot&3)', viejo.length === 0, viejo.join(' '));
t('las 8 posturas nuevas van DETRAS, en @16..@23',
  MC_ORI.slice(16).every(([roll]) => roll === 1), MC_ORI.slice(16).map(o => o.join('')).join(' '));
t('un @n imposible no rompe nada: se trata como sin girar',
  mcOriNorm(99) === 0 && mcOriNorm(-3) === 0 && mcOriNorm(NaN) === 0 && mcOriNorm(23) === 23);

// La huella de los 16 viejos tiene que salir EXACTAMENTE igual que con la cuenta de antes.
const dimMal = [];
for (let rot = 0; rot < 16; rot++) {
  let [w, h, d] = [3, 5, 7];
  if (((rot >> 2) & 3) & 1) { const x = d; d = h; h = x; }
  if ((rot & 3) & 1) { const x = w; w = d; d = x; }
  const nuevo = mcOriDims(3, 5, 7, rot);
  if (nuevo[0] !== w || nuevo[1] !== h || nuevo[2] !== d) dimMal.push('@' + rot + ' ' + nuevo + '≠' + [w, h, d]);
}
t('mcOriDims da la MISMA huella que antes en @0..@15', dimMal.length === 0, dimMal.join(' · '));

// ── C · el gesto: R = cara, Shift+R = giro ─────────────────────────────────────────────────────────
console.log('\nC · el gesto de R / Shift+R');
const vistas = new Set();
for (let cara = 0; cara < 6; cara++) for (let giro = 0; giro < 4; giro++) {
  sandbox.mc.previewCara = cara; sandbox.mc.previewGiro = giro;
  vistas.add(mcPreviewOri());
}
t('R (6 caras) x Shift+R (4 giros) alcanza las 24 posturas', vistas.size === 24, vistas.size + ' alcanzadas');

// R seis veces vuelve al principio; Shift+R cuatro veces, tambien.
sandbox.mc.previewCara = 0; sandbox.mc.previewGiro = 0;
for (let i = 0; i < 6; i++) sandbox.mc.previewCara = (sandbox.mc.previewCara + 1) % 6;
for (let i = 0; i < 4; i++) sandbox.mc.previewGiro = (sandbox.mc.previewGiro + 1) & 3;
t('R x6 y Shift+R x4 vuelven a la postura de partida', mcPreviewOri() === 0, 'ori=' + mcPreviewOri());

// Lo que hace util el gesto: R no toca el giro y Shift+R no cambia de cara.
let caraFija = true, giroFijo = true;
for (let cara = 0; cara < 6; cara++) {
  const caras = new Set();
  for (let giro = 0; giro < 4; giro++) {
    sandbox.mc.previewCara = cara; sandbox.mc.previewGiro = giro;
    caras.add(caraArriba(mcPreviewOri()));
  }
  if (caras.size !== 1) caraFija = false;
}
for (let giro = 0; giro < 4; giro++) {
  const caras = new Set();
  for (let cara = 0; cara < 6; cara++) {
    sandbox.mc.previewCara = cara; sandbox.mc.previewGiro = giro;
    caras.add(caraArriba(mcPreviewOri()));
  }
  if (caras.size !== 6) giroFijo = false;
}
t('Shift+R gira DENTRO de la cara (no la cambia)', caraFija);
t('R cambia de cara (las 6, sin repetir)', giroFijo);
t('el aviso de R nombra las 6 caras sin repetirse',
  MC_ORI_CARA.length === 6 && new Set(MC_ORI_CARA).size === 6, MC_ORI_CARA.join(' · '));

// ── D · la huella concuerda con la geometria ───────────────────────────────────────────────────────
console.log('\nD · mcOriDims concuerda con donde acaban los voxels');
// Una caja 3x5x7 de verdad: se giran sus ocho esquinas con la composicion y se mide la caja resultante.
const W = 3, H = 5, D = 7;
const malas = [];
for (let ori = 0; ori < 24; ori++) {
  const [roll, tilt, yaw] = mcOriParts(ori);
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (const x of [0, W - 1]) for (const y of [0, H - 1]) for (const z of [0, D - 1]) {
    const q = mueve(roll, tilt, yaw, x, y, z);
    if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0];
    if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1];
    if (q[2] < mnz) mnz = q[2]; if (q[2] > mxz) mxz = q[2];
  }
  const real = [mxx - mnx + 1, mxy - mny + 1, mxz - mnz + 1];
  const dice = mcOriDims(W, H, D, ori);
  if (real.join(',') !== dice.join(',')) malas.push('@' + ori + ' dice ' + dice + ' y es ' + real);
}
t('la huella declarada = la huella real, en las 24', malas.length === 0, malas.join(' · '));

// La pieza no puede encoger ni crecer: los tres lados son los mismos, en otro orden.
const volMal = [];
for (let ori = 0; ori < 24; ori++) {
  const d = mcOriDims(W, H, D, ori).slice().sort((a, b) => a - b);
  if (d.join(',') !== [W, H, D].slice().sort((a, b) => a - b).join(',')) volMal.push('@' + ori);
}
t('ninguna postura deforma la pieza (mismos tres lados)', volMal.length === 0, volMal.join(' '));

// ── E · hacia donde MIRA una pieza (BUG-RS7) ────────────────────────────────────────────────────
// Las piezas de redstone no tienen la geometria delante: preguntan por mcOriPerm hacia donde acaba
// su cara +X, que es su frente (por ahi empuja un piston, por ahi NO escucha una antorcha). Si eso se
// desvia de la composicion de mcStructGeom, la pieza hace una cosa y se ve otra — y no hay forma de
// notarlo mirando la pantalla.
console.log('\nE · el frente de una pieza (lo que consume redstone)');
const XPOS = MC_FACES.findIndex(F => F.dir[0] === 1 && F.dir[1] === 0 && F.dir[2] === 0);
const frente = ori => mcOriPerm(ori)[XPOS];          // en que cara del MUNDO acaba el +X del dibujo

// Que mcOriMove sea de verdad la composicion calcada arriba es lo que sostiene TODO este fichero:
// desde que existe, mcStructGeom no la lleva escrita, la pide.
const desviadas = [];
for (let ori = 0; ori < 24; ori++) {
  const T = mcOriMove(ori, 1, 1, 1), o = T(0, 0, 0);
  const m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => {
    const q = T(v[0], v[1], v[2]);
    return [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  });
  if (m.map(c => c.join(',')).join('|') !== firma(ori)) desviadas.push('@' + ori);
}
t('mcOriMove es la misma composicion que aplica mcStructGeom', desviadas.length === 0, desviadas.join(' '));

// Compatibilidad dura: en las 16 de siempre el frente sale IGUAL que con la tabla horizontal que
// tenia redstone escrita a mano, o los circuitos ya construidos cambiarian de sentido al recargar.
const FRENTE_VIEJO = [0, 4, 1, 5];                   // giro 0..3 → +X, +Z, −X, −Z, en indices de DIRS
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CARA2DIR = [2, 3, 0, 1, 4, 5];                 // indice en MC_FACES → indice en DIRS
const movidas = [];
for (let ori = 0; ori < 16; ori++) {
  if (CARA2DIR[frente(ori)] !== FRENTE_VIEJO[ori & 3]) movidas.push('@' + ori);
}
t('@0..@15 miran adonde miraban (los circuitos guardados no se giran)', movidas.length === 0, movidas.join(' '));

// Y lo que faltaba: que una pieza pueda mirar al techo o al suelo. Sin esto el piston del dueno se
// acostaba, porque el frente se calculaba siempre en horizontal.
const haciaArriba = [], haciaAbajo = [];
for (let ori = 0; ori < 24; ori++) {
  const d = DIRS[CARA2DIR[frente(ori)]];
  if (d[1] === 1) haciaArriba.push('@' + ori);
  if (d[1] === -1) haciaAbajo.push('@' + ori);
}
t('hay posturas que miran hacia ARRIBA (el piston apuntando al techo)', haciaArriba.length > 0, haciaArriba.join(' '));
t('...y hacia ABAJO', haciaAbajo.length > 0, haciaAbajo.join(' '));
t('los 6 sentidos son alcanzables', new Set([...Array(24).keys()].map(frente)).size === 6);

// atrasDe() en redstone es `frente ^ 1`: solo vale si DIRS va emparejada opuesto a opuesto.
const paresMal = [];
for (let i = 0; i < 6; i++) {
  const a = DIRS[i], b = DIRS[i ^ 1];
  if (a[0] !== -b[0] || a[1] !== -b[1] || a[2] !== -b[2]) paresMal.push(i);
}
t('DIRS se empareja 0/1, 2/3, 4/5 (atrasDe = frente^1)', paresMal.length === 0, paresMal.join(' '));

console.log('\n' + (fallos ? fallos + ' fallo(s) · ' : 'todo ok · ') + ok + ' comprobaciones');
process.exit(fallos ? 1 : 0);
