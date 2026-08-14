// @area: caras
// @necesita: node
// Arnes headless para la MASCARA DE CARAS por voxel (state.caras de app.js).
//
// Un voxel puede pintar solo algunas de sus 6 caras (bit i = CUBE_FACES[i]); es lo que convierte un
// voxel en un plano (la mata de hierba, una bandera, un cartel). Lo delicado no es la mascara sino el
// GIRO: al rotar el dibujo las caras tienen que viajar con el. Por eso la permutacion se deriva de la
// misma transformacion afin que mueve las coordenadas, y no de una tabla escrita a mano que se
// desincronizaria en cuanto alguien tocase rotateModel.
//
// Extrae las funciones VERBATIM de app.js. La gracia del truco de `fnDeGiro`: rotateModel aplica su
// `fn` a los pivotes, asi que metiendo el origen y los tres vectores base como pivotes es el propio
// app.js quien nos devuelve su transformacion, sin copiar aqui su tabla de giros.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(__dirname + '/../web/app.js', 'utf8');
// Cada funcion de nivel superior de app.js acaba con '}' en la columna 0.
function extraer(nombre) {
  const ini = src.indexOf('\nfunction ' + nombre + '(');
  if (ini < 0) throw new Error('no encuentro function ' + nombre + ' en app.js');
  const fin = src.indexOf('\n}', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 3);
}
// CUBE_FACES es un `const` con array multilinea: se corta por el ']' en columna 0.
function extraerConst(nombre) {
  const ini = src.indexOf('\nconst ' + nombre + ' = [');
  if (ini < 0) throw new Error('no encuentro const ' + nombre + ' en app.js');
  const fin = src.indexOf('\n];', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 4);
}

let ok = 0, fallos = 0;
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
}

// ── Sandbox ────────────────────────────────────────────────────────────────────
const sandbox = {
  console, Number, Math, Map, Set, Object,
  SX: 16, SY: 16, SZ: 16,
  MASK_ALL: 63,
  state: { voxels: new Map(), pivotes: [], caras: new Map(), layer: 0 },
  mutated: false,
  hover3d: null,
  selection: new Set(),
  view: {}, view3d: {},
  // Cascaron minimo de lo que rotateModel toca y que aqui no significa nada.
  snapshot: () => null,
  commit: () => {},
  syncLayer: () => {},
  render: () => {},
  updateZoomLabel: () => {},
  setSize: (x, y, z) => { sandbox.SX = x; sandbox.SY = y; sandbox.SZ = z; },
};
vm.createContext(sandbox);
vm.runInContext(
  extraerConst('CUBE_FACES') +
  extraer('facePerm') + extraer('permMask') + extraer('permCaras') +
  extraer('normCaras') + extraer('rotateModel'), sandbox);

// `const` dentro de un vm no cuelga del objeto sandbox (vive en el ambito lexico del script).
const CUBE_FACES = vm.runInContext('CUBE_FACES', sandbox);
const EJES = ['x', 'y', 'z'], DIRS = [1, -1];
const MASK_ALL = 63;

// Reconstruye la transformacion afin del giro `ax`/`dir` PREGUNTANDOSELA a app.js: se le pasan como
// pivotes el origen y los tres vectores base, y rotateModel devuelve sus imagenes.
function fnDeGiro(ax, dir) {
  sandbox.state.pivotes = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  sandbox.rotateModel(ax, dir);
  const [o, ex, ey, ez] = sandbox.state.pivotes;
  const col = (a) => [a[0] - o[0], a[1] - o[1], a[2] - o[2]];
  const cx = col(ex), cy = col(ey), cz = col(ez);
  return (x, y, z) => [
    o[0] + x * cx[0] + y * cy[0] + z * cz[0],
    o[1] + x * cx[1] + y * cy[1] + z * cz[1],
    o[2] + x * cx[2] + y * cy[2] + z * cz[2],
  ];
}
function reset() {
  sandbox.SX = 16; sandbox.SY = 16; sandbox.SZ = 16;
  sandbox.state.voxels = new Map();
  sandbox.state.caras = new Map();
}

// ── §1 facePerm es una biyeccion en los 6 giros ────────────────────────────────
console.log('\n§1 facePerm devuelve una permutacion de las 6 caras');
for (const ax of EJES) for (const dir of DIRS) {
  reset();
  const P = sandbox.facePerm(fnDeGiro(ax, dir));
  const nombre = ax + (dir < 0 ? '-' : '+');
  t('giro ' + nombre + ': ninguna cara sin destino', P.every(i => i >= 0), P.join(','));
  t('giro ' + nombre + ': los 6 destinos son distintos', new Set(P).size === 6, P.join(','));
}

// ── §2 la permutacion CASA con la geometria ────────────────────────────────────
// El invariante de verdad: si dos voxels son vecinos por la cara i, tras el giro deben ser vecinos
// por la cara P[i]. Esto es lo que impide que la mascara y el dibujo se desincronicen.
console.log('\n§2 el vecino por la cara i acaba siendo el vecino por la cara P[i]');
for (const ax of EJES) for (const dir of DIRS) {
  reset();
  const fn = fnDeGiro(ax, dir), P = sandbox.facePerm(fn);
  const nombre = ax + (dir < 0 ? '-' : '+');
  let mal = -1;
  for (let i = 0; i < 6; i++) {
    const nb = CUBE_FACES[i].nb;
    const a = fn(4, 5, 6), b = fn(4 + nb[0], 5 + nb[1], 6 + nb[2]);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e = CUBE_FACES[P[i]].nb;
    if (d[0] !== e[0] || d[1] !== e[1] || d[2] !== e[2]) { mal = i; break; }
  }
  t('giro ' + nombre + ': vecindad conservada en las 6 caras', mal < 0,
    mal < 0 ? '' : 'falla la cara ' + mal);
}

// ── §3 cuatro giros seguidos = identidad ───────────────────────────────────────
console.log('\n§3 cuatro giros en el mismo eje devuelven el dibujo y sus caras al sitio');
for (const ax of EJES) for (const dir of DIRS) {
  reset();
  const nombre = ax + (dir < 0 ? '-' : '+');
  // Una mascara por voxel distinta en cada celda, para que un cruce de bits no pase desapercibido.
  const original = new Map([['1,2,3', 1], ['4,5,6', 12], ['7,8,9', 21], ['0,0,0', 34]]);
  let caras = original;
  for (let k = 0; k < 4; k++) caras = sandbox.permCaras(caras, fnDeGiro(ax, dir));
  const igual = caras.size === original.size &&
    [...original].every(([k, m]) => caras.get(k) === m);
  t('4x ' + nombre + ' = identidad', igual, [...caras].map(([k, m]) => k + '=' + m).join(' '));
}

// ── §4 un giro no crea ni destruye caras ───────────────────────────────────────
console.log('\n§4 girar conserva cuantas caras estan encendidas');
const bits = (m) => { let n = 0; for (let i = 0; i < 6; i++) if (m & (1 << i)) n++; return n; };
for (const ax of EJES) for (const dir of DIRS) {
  reset();
  const P = sandbox.facePerm(fnDeGiro(ax, dir));
  let mal = -1;
  for (let m = 0; m <= MASK_ALL; m++) if (bits(sandbox.permMask(m, P)) !== bits(m)) { mal = m; break; }
  t('giro ' + ax + (dir < 0 ? '-' : '+') + ': las 64 mascaras conservan su cuenta de bits', mal < 0,
    mal < 0 ? '' : 'falla la mascara ' + mal);
}

// ── §5 normCaras filtra lo que no vale ─────────────────────────────────────────
console.log('\n§5 normCaras solo deja pasar mascaras utiles');
reset();
const n = sandbox.normCaras({
  '1,2,3': 12,          // valida
  '0,0,0': 0,           // valida: un voxel invisible pero solido es legitimo
  '2,2,2': 63,          // 63 = las seis marcadas A MANO: es una marca válida y se guarda
  '3,3,3': 64,          // fuera de rango
  '4,4,4': -1,          // fuera de rango
  '5,5,5': 1.5,         // no entero
  '99,0,0': 12,         // fuera de la rejilla
  '-1,0,0': 12,         // fuera de la rejilla
  '1,2': 12,            // clave mal formada
  'a,b,c': 12,          // clave mal formada
  '1,2,3,4': 12,        // clave mal formada
});
t('deja las validas', n.size === 3 && n.get('1,2,3') === 12 && n.get('0,0,0') === 0,
  [...n].map(([k, m]) => k + '=' + m).join(' '));
t('se queda el 63 (marcar las seis es una marca)', n.get('2,2,2') === 63);
t('tira lo fuera de rango y lo no entero', !n.has('3,3,3') && !n.has('4,4,4') && !n.has('5,5,5'));
t('tira lo que cae fuera de la rejilla', !n.has('99,0,0') && !n.has('-1,0,0'));
t('aguanta basura sin reventar', sandbox.normCaras(null).size === 0 && sandbox.normCaras(7).size === 0);

console.log('\n' + ok + ' ok / ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);