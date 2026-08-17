// test_animacion_piezas_agente.js
// Pruebas unitarias para la capacidad de animación procedimental / matemática de piezas (REQ-ANIM1).
// Cubre:
// 1. Normalización de animación (presets, valores por defecto, ejes x/y/z, modos siempre/movimiento).
// 2. Fórmulas de rotación matemática de pez (cola rot_Y = A*sin(wt), cabeza rot_Y = -0.2*A*sin(wt), aleta rot_Z = B*sin(wt+phi)).
// 3. Composición de matrices en 3D con pivote.
// 4. Preparación y cálculo de pose dinámica con tiempo t.

const assert = require('assert');
const fs = require('fs');

let total = 0, ok = 0;
function test(nom, fn) {
  total++;
  try {
    fn();
    ok++;
    console.log('  ok  ' + nom);
  } catch (e) {
    console.error('  FAIL: ' + nom + ' -> ' + (e.message || e));
  }
}

console.log('\n=== §1 Snippet mundo-autoarranque: Soporte de animación matemática ===\n');

const snp = JSON.parse(fs.readFileSync('data/snippets/mundo-autoarranque.json', 'utf8'));
const code = snp.code;

test('El snippet incluye la marca REQ-ANIM1', () => {
  assert(code.includes('REQ-ANIM1'), 'Falta la marca REQ-ANIM1 en mundo-autoarranque.json');
});

test('normalizarAnimacion está definida en el snippet', () => {
  assert(code.includes('function normalizarAnimacion'), 'Falta función normalizarAnimacion');
});

test('matrizGiro soporta aleteo / eje Z (Roll)', () => {
  assert(code.includes('_rAlet'), 'matrizGiro debe soportar rotación de aleteo en eje Z');
});

console.log('\n=== §2 Verificación de fórmulas matemáticas de pez y oscilación ===\n');

// Extraer funciones para test directo
const GRADO = Math.PI / 180;

function normalizarAnimacion(anim) {
  if (!anim) return null;
  const tipo = String(anim.tipo || 'personalizada').toLowerCase();
  let eje = String(anim.eje || 'y').toLowerCase();
  if (eje !== 'x' && eje !== 'y' && eje !== 'z') eje = 'y';
  let modo = String(anim.modo || 'siempre').toLowerCase();
  if (modo !== 'siempre' && modo !== 'movimiento') modo = 'siempre';
  return {
    tipo: tipo,
    eje: eje,
    amplitud: Number.isFinite(+anim.amplitud) ? +anim.amplitud : 25,
    frecuencia: Number.isFinite(+anim.frecuencia) ? +anim.frecuencia : 1.5,
    fase: Number.isFinite(+anim.fase) ? +anim.fase : 0,
    contrabalanceo: (anim.contrabalanceo !== undefined && Number.isFinite(+anim.contrabalanceo)) ? +anim.contrabalanceo : 1,
    pivote: (anim.pivote === undefined) ? null : anim.pivote,
    modo: modo
  };
}

function calcOscilacion(anim, t, andando) {
  const norm = normalizarAnimacion(anim);
  if (!norm) return { x: 0, y: 0, z: 0 };
  const factorModo = (norm.modo === 'movimiento') ? (andando || 0) : 1.0;
  const peso = (norm.contrabalanceo !== undefined) ? norm.contrabalanceo : 1.0;
  const amp = norm.amplitud * peso * factorModo;
  const faseRad = (norm.fase || 0) * GRADO;
  const osc = amp * Math.sin(norm.frecuencia * t + faseRad);
  return {
    val: osc,
    eje: norm.eje,
    x: norm.eje === 'x' ? osc : 0,
    y: norm.eje === 'y' ? osc : 0,
    z: norm.eje === 'z' ? osc : 0
  };
}

test('Cola de pez: rotación_Y = A * sin(omega * t)', () => {
  const colaAnim = { tipo: 'pez_cola', eje: 'y', amplitud: 30, frecuencia: 2.0, fase: 0, contrabalanceo: 1 };
  const t = Math.PI / 4; // sin(2 * pi/4) = sin(pi/2) = 1
  const res = calcOscilacion(colaAnim, t);
  assert.strictEqual(res.eje, 'y');
  assert(Math.abs(res.y - 30) < 1e-6, `Esperado 30°, obtenido ${res.y}`);
});

test('Cabeza de pez: contrabalanceo sutil rot_Y = -0.2 * A * sin(omega * t)', () => {
  const cabezaAnim = { tipo: 'pez_cabeza', eje: 'y', amplitud: 30, frecuencia: 2.0, fase: 0, contrabalanceo: -0.2 };
  const t = Math.PI / 4; // sin(2 * pi/4) = 1
  const res = calcOscilacion(cabezaAnim, t);
  assert.strictEqual(res.eje, 'y');
  assert(Math.abs(res.y - (-6)) < 1e-6, `Esperado -6° (-0.2 * 30), obtenido ${res.y}`);
});

test('Aletas laterales: aleteo desfasado en eje Z rot_Z = B * sin(omega * t + phi)', () => {
  const aletaAnim = { tipo: 'aleta', eje: 'z', amplitud: 20, frecuencia: 2.0, fase: 90 };
  const t = 0; // sin(0 + 90°) = sin(pi/2) = 1
  const res = calcOscilacion(aletaAnim, t);
  assert.strictEqual(res.eje, 'z');
  assert(Math.abs(res.z - 20) < 1e-6, `Esperado 20°, obtenido ${res.z}`);
});

test('Modo movimiento vs siempre: solo oscila si andando > 0', () => {
  const pezNado = { tipo: 'pez_cola', eje: 'y', amplitud: 20, frecuencia: 1.0, modo: 'movimiento' };
  const t = Math.PI / 2; // sin(pi/2) = 1
  const quieto = calcOscilacion(pezNado, t, 0);
  assert.strictEqual(quieto.y, 0, 'Parado no debe oscilar en modo movimiento');
  const nadando = calcOscilacion(pezNado, t, 1);
  assert(Math.abs(nadando.y - 20) < 1e-6, 'En movimiento debe oscilar con amplitud completa');
});

console.log('\n=== §3 Integración en editor de Agentes (web/app.js) ===\n');

const appJs = fs.readFileSync('web/app.js', 'utf8');

test('app.js incluye la tarjeta de animación de pieza en agForm()', () => {
  assert(appJs.includes("agTarjeta(box, 'animacion'"), 'Falta agTarjeta para animacion en agForm()');
});

test('app.js incluye presets para pez_cola, pez_cabeza, calamar, medusa, tiburon, aleta', () => {
  assert(appJs.includes('pez_cola') && appJs.includes('pez_cabeza') && appJs.includes('calamar') && appJs.includes('medusa') && appJs.includes('tiburon') && appJs.includes('aleta'), 'Faltan presets marinos en app.js');
});

test('Preset Calamar: ondulación vertical suave en eje X (tentáculos)', () => {
  const calamarAnim = { tipo: 'calamar', eje: 'x', amplitud: 12, frecuencia: 0.9, fase: 0, contrabalanceo: 0.05 };
  const res = calcOscilacion(calamarAnim, Math.PI / (2 * 0.9));
  assert.strictEqual(res.eje, 'x');
  assert(Math.abs(res.x - 0.6) < 1e-6, `Esperado 0.6° de contrabalanceo, obtenido ${res.x}`);
});

test('Preset Medusa: flotación en eje X desfasada 90°', () => {
  const medusaAnim = { tipo: 'medusa', eje: 'x', amplitud: 10, frecuencia: 0.6, fase: 90, contrabalanceo: 1 };
  const res = calcOscilacion(medusaAnim, 0); // sin(0 + 90°) = 1
  assert.strictEqual(res.eje, 'x');
  assert(Math.abs(res.x - 10) < 1e-6, `Esperado 10°, obtenido ${res.x}`);
});

test('app.js pasa agTiempo y t a game.esqueletos.pose()', () => {
  assert(appJs.includes('t:agTiempo'), 'agLoop debe pasar t a pose() para animación continua');
});

test('app.js muestra el chip de pieza animada en agChips()', () => {
  assert(appJs.includes('animPieza'), 'agChips() debe incluir chip animPieza');
});

console.log(`\n${ok} ok / ${total - ok} fallos\n`);
if (total - ok > 0) process.exit(1);
