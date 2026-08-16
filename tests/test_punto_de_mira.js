// test_punto_de_mira.js — Valida el tunable de punto de mira (game.crosshair / game.mira)
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name + '\n       ' + err.message);
    failed++;
  }
}
function suite(name) { console.log('\n=== ' + name + ' ===\n'); }
function report() {
  console.log(`\n${passed} ok / ${failed} fallos\n`);
  if (failed > 0) process.exit(1);
}

// Mock de DOM y localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const crosshairDom = { textContent: '+', style: {} };
global.document = {
  getElementById: (id) => (id === 'mc-crosshair' ? crosshairDom : null)
};

global.mc = { crosshair: '+', tool: 'build' };
global.game = {};

const MC_HERRAMIENTA_MIRA = { build:'+', box:'⛶', paint:'☉', select:'⌞⌝', pick:'👁' };

function mcSetCrosshair(v){
  const s = (v == null || v === '') ? (MC_HERRAMIENTA_MIRA[mc.tool] || '+') : String(v);
  mc.crosshair = s;
  try{ localStorage.setItem('vf_mcCrosshair', s); }catch(e){}
  const el = document.getElementById('mc-crosshair');
  if(el){
    el.textContent = s;
    const isEmoji = /\p{Extended_Pictographic}/u.test(s);
    el.style.fontSize = isEmoji ? '20px' : (s.length > 1 ? '18px' : '22px');
    el.style.letterSpacing = s === '⌞⌝' ? '1px' : 'normal';
  }
  return s;
}
function mcSetPlayerTool(v){
  v = (v === 'box' || v === 'paint' || v === 'select' || v === 'pick') ? v : 'build';
  mc.tool = v;
  mcSetCrosshair(MC_HERRAMIENTA_MIRA[v] || '+');
  return v;
}
Object.defineProperty(game,'crosshair',{ enumerable:true, get:()=>mc.crosshair, set:mcSetCrosshair });
Object.defineProperty(game,'mira',{ enumerable:true, get:()=>mc.crosshair, set:mcSetCrosshair });
Object.defineProperty(game,'playerTool',{ enumerable:true, get:()=>mc.tool, set:mcSetPlayerTool });

suite('§1 Tunable game.crosshair y game.mira');

test('Valor por defecto es "+"', () => {
  assert.strictEqual(game.crosshair, '+');
  assert.strictEqual(game.mira, '+');
});

test('Cambiar a punto simple "·"', () => {
  game.crosshair = '·';
  assert.strictEqual(mc.crosshair, '·');
  assert.strictEqual(crosshairDom.textContent, '·');
  assert.strictEqual(localStorage.getItem('vf_mcCrosshair'), '·');
});

test('Cambiar a emoji "🎯" mediante game.mira', () => {
  game.mira = '🎯';
  assert.strictEqual(game.crosshair, '🎯');
  assert.strictEqual(mc.crosshair, '🎯');
  assert.strictEqual(crosshairDom.textContent, '🎯');
  assert.strictEqual(crosshairDom.style.fontSize, '20px');
  assert.strictEqual(localStorage.getItem('vf_mcCrosshair'), '🎯');
});

test('Cambiar a otros emojis como "✨", "🔴", "⭐", "⚔️"', () => {
  for (const emoji of ['✨', '🔴', '⭐', '⚔️']) {
    game.crosshair = emoji;
    assert.strictEqual(game.mira, emoji);
    assert.strictEqual(crosshairDom.textContent, emoji);
  }
});

test('Restablecer a vacío o null vuelve al punto de mira de la herramienta activa', () => {
  mc.tool = 'build';
  game.crosshair = null;
  assert.strictEqual(game.crosshair, '+');
  assert.strictEqual(crosshairDom.textContent, '+');
});

suite('§2 Puntos de mira por herramienta');

test('Herramienta volumen (box) cambia el punto de mira a ⛶', () => {
  game.playerTool = 'box';
  assert.strictEqual(game.mira, '⛶');
  assert.strictEqual(crosshairDom.textContent, '⛶');
});

test('Herramienta construir (build) cambia el punto de mira a +', () => {
  game.playerTool = 'build';
  assert.strictEqual(game.mira, '+');
  assert.strictEqual(crosshairDom.textContent, '+');
});

test('Herramienta pintar (paint) cambia el punto de mira a ☉', () => {
  game.playerTool = 'paint';
  assert.strictEqual(game.mira, '☉');
  assert.strictEqual(crosshairDom.textContent, '☉');
});

test('Herramienta seleccionar (select) cambia el punto de mira a ⌞⌝', () => {
  game.playerTool = 'select';
  assert.strictEqual(game.mira, '⌞⌝');
  assert.strictEqual(crosshairDom.textContent, '⌞⌝');
});

test('Herramienta cuentagotas (pick) cambia el punto de mira a 👁', () => {
  game.playerTool = 'pick';
  assert.strictEqual(game.mira, '👁');
  assert.strictEqual(crosshairDom.textContent, '👁');
});

test('Al arrancar el mapa el crosshair siempre coincide con la herramienta activa', () => {
  // Simulando arranque con herramienta 'build'
  mc.tool = 'build';
  mcSetCrosshair(MC_HERRAMIENTA_MIRA[mc.tool] || '+');
  assert.strictEqual(game.crosshair, '+');
  assert.strictEqual(crosshairDom.textContent, '+');

  // Si arrancara con otra herramienta activa
  mc.tool = 'box';
  mcSetCrosshair(MC_HERRAMIENTA_MIRA[mc.tool] || '+');
  assert.strictEqual(game.crosshair, '⛶');
  assert.strictEqual(crosshairDom.textContent, '⛶');
});

report();
