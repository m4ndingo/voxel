// Prueba de humo de game.informe(): carga la libreria real con stubs minimos y comprueba que el
// informe, POR SI SOLO, delata los fallos de REGLAS_AGENTES.md §21 — un peldano que se ejecuta sin
// abrir paso, siempre desde la misma celda, y dos agentes peleandose por la misma celda.
const fs = require('fs');
const code = JSON.parse(fs.readFileSync('data/snippets/base-npc-skills.json', 'utf8')).code;

let ok = 0, fail = 0;
function t(n, c) { if (c) { ok++; console.log('  ok ' + n); } else { fail++; console.log('  FALLO ' + n); } }

global.performance = { now: () => Date.now() };
global.toast = () => {};
global.navigator = { userAgent: 'node-test' };
const mc = { dim: { x: 96, y: 40, z: 96 }, grid: null, notes: {}, agents: new Map() };
global.mc = mc;
global.mcGetVoxel = () => 0;
const game = { agents: () => [], toastHistory: [], showToastsEnabled: false, fps: 60 };
global.game = game;
global.window = global;

// fetch NO debe llamarse con guardar:false. Si se llama, el test falla en vez de pasar callado.
let fetchLlamado = 0;
global.fetch = function () { fetchLlamado++; return Promise.resolve({ ok: true, status: 200 }); };

const logs = [];
console.log = (...a) => logs.push(a.join(' '));
(new Function(code))();
console.log = (...a) => process.stdout.write(a.join(' ') + '\n');

const sk = game.skills;
t('la libreria expone game.informe', typeof game.informe === 'function');
t('expone el anillo de escrituras', Array.isArray(game.worldWrites));

// ── Mundo de juguete ─────────────────────────────────────────────────────────────────────────────
// Mismo contrato que test_rescate.js: canWalk replica mcSurfaceNear exactamente.
let mundo = {};
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function surfaceY(x, z) {
  for (let y = 39; y >= 0; y--) if (mundo[x + ',' + y + ',' + z]) return y;
  return -1;
}
// El framework decide con esto, no con surfaceY: el informe tiene que usar la misma vara.
global.mcSurfaceNear = function (x, z, y0, climb, drop) {
  const maxUp = climb === undefined ? 1 : climb, maxDown = drop === undefined ? 3 : drop;
  for (let d = 0; d <= Math.max(maxUp, maxDown); d++) {
    const cand = [];
    if (d <= maxUp) cand.push(y0 + d);
    if (d > 0 && d <= maxDown) cand.push(y0 - d);
    for (const y of cand) {
      if (y < 0 || y > 39) continue;
      if (mundo[x + ',' + y + ',' + z] && !mundo[x + ',' + (y + 1) + ',' + z]) return y;
    }
  }
  return -1;
};

function nuevoAgente(id, nombre, x, z) {
  const a = {
    id: id, name: nombre, x: x, y: 15, z: z, climb: 1, drop: 3, margin: 1,
    tickMs: 120, block: 'stone', state: 'running',
    cfg: { skills: { minadoEmergencia: true, saltoTactico: false, caminataAzotea: true } },
    stats: { ticks: 0, steps: 0, blocked: 0, mined: 0, painted: 0 },
    vars: { dir: [1, 0], historial: [], visited: new Set(), recentVisits: [], tickets: {},
            ticketLog: [], executionTrace: [], runId: 'test' },
    matId: () => 1,
    getBlock: (bx, by, bz) => mundo[bx + ',' + by + ',' + bz] ? 1 : 0,
    setBlock: function (bx, by, bz, mat) {
      const k = bx + ',' + by + ',' + bz;
      if (mat === 0 || mat === 'air') { if (!mundo[k]) return false; delete mundo[k]; return true; }
      if (mundo[k]) return false; mundo[k] = 1; return true;
    },
    surfaceY: surfaceY,
    canWalk: function (dx, dz) { return mcSurfaceNear(this.x + dx, this.z + dz, this.y, this.climb, this.drop) >= 0; },
    // La nota se escribe DE VERDAD en mc.notes: si no, findExistingNoteInRadius nunca encuentra el
    // hito y la libreria planta un pino de emergencia por vuelta, que es un mundo que no existe.
    note: function (txt, celda) {
      const c = celda || [this.x, this.y, this.z];
      mc.notes[c[0] + ',' + c[1] + ',' + c[2]] = String(txt);
      return true;
    },
    getNote: function (x, y, z) { return mc.notes[x + ',' + y + ',' + z] || ''; },
    walk: () => false, agentsAt: () => []
  };
  mc.agents.set(id, a);
  return a;
}

// Caso 1: minado que pica y pica y NUNCA abre paso, siempre desde la misma celda (§21.1 y §21.2).
mundo = {};
mundo['10,14,10'] = 1;
for (const [dx, dz] of DIRS) for (const y of [15, 16, 17]) mundo[(10 + dx) + ',' + y + ',' + (10 + dz)] = 1;
const a1 = nuevoAgente('minero', 'Minero', 10, 10);
for (let i = 0; i < 14; i++) {
  // "Otro agente" repone lo picado en cada vuelta: el mundo nunca mejora.
  for (const [dx, dz] of DIRS) for (const y of [15, 16]) mundo[(10 + dx) + ',' + y + ',' + (10 + dz)] = 1;
  a1.vars.minadoCelda = undefined;                 // como si se hubiera movido: permite reintentar
  a1.stats.ticks += 6;                             // envejece la accion mas alla de ACCION_ESPERA_TICKS
  a1.vars.recentVisits.push({ x: a1.x, z: a1.z, tick: a1.stats.ticks });
  sk.minadoEmergencia(a1, DIRS);
}
// El informe se genera con el muro repuesto, que es como se encuentra el agente en la practica.
for (const [dx, dz] of DIRS) for (const y of [15, 16]) mundo[(10 + dx) + ',' + y + ',' + (10 + dz)] = 1;

const inf = game.informe({ guardar: false });
if (process.env.VER) console.log(inf);
t('caso 1: no se llamo a fetch con guardar:false', fetchLlamado === 0);
t('caso 1: el agente sale como atascado', inf.indexOf('Minero') >= 0 && inf.indexOf('VEREDICTO — 1 de') >= 0);
t('caso 1: la tabla 3.3 marca el peldano INEFICAZ', /EMERGENCY_MINE \|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| \*\*INEFICAZ\*\*/.test(inf));
t('caso 1: dispara R1 (se ejecuto sin producir celda nueva)', inf.indexOf('R1 ·') >= 0 && inf.indexOf('§21.1') >= 0);
t('caso 1: dispara R2 (siempre desde la misma celda)', inf.indexOf('R2 ·') >= 0 && inf.indexOf('10,15,10') >= 0);
t('caso 1: el vecindario explica el bloqueo (TAPIADO)', inf.indexOf('TAPIADO') >= 0);
t('caso 1: cuenta 0 vecinos pisables', inf.indexOf('Vecinos pisables: 0/4') >= 0);
t('caso 1: toda hipotesis cita un § de las reglas', inf.split('\n').filter(l => l.indexOf('- R') === 0).every(l => l.indexOf('§') >= 0));

// Caso 2: guerra de bloques — dos agentes escribiendo la misma celda por turnos (§21.2 / R3).
game.worldWrites.length = 0;
const aA = mc.agents.get('minero');
const aB = nuevoAgente('constructor', 'Constructor', 40, 40);
for (let i = 0; i < 4; i++) {
  game.worldWrites.push({ ms: 0, tick: i, agente: 'Minero',      x: 50, y: 15, z: 50, de: 'piedra', a: 'aire' });
  game.worldWrites.push({ ms: 0, tick: i, agente: 'Constructor', x: 50, y: 15, z: 50, de: 'aire',   a: 'piedra' });
}
const inf2 = game.informe({ guardar: false });
t('caso 2: dispara R3 con los dos autores', inf2.indexOf('R3 ·') >= 0 &&
  inf2.indexOf('Minero') >= 0 && inf2.indexOf('Constructor') >= 0);
t('caso 2: la seccion 4 lista la celda disputada', /\| \[50,15,50\] \| 8 \|/.test(inf2));

// Caso 3: presupuesto de tamano — se recorta Y se dice que se recorto (§22).
const inf3 = game.informe({ guardar: false, max: 2000 });
t('caso 3: respeta el presupuesto de 2000 caracteres', inf3.length <= 2000);
t('caso 3: la seccion 6 declara lo recortado', inf3.indexOf('## 6. RECORTES') >= 0 &&
  inf3.indexOf('omitido "') >= 0);
t('caso 3: sin recorte, la seccion 6 lo dice igual', inf.indexOf('Ninguno: el informe entra entero') >= 0);

// Caso 4: entrega por fichero — el `code` que se manda al servidor es JS valido y lleva el markdown.
let enviado = null;
fetchLlamado = 0;
global.fetch = function (url, opt) {
  enviado = { url: url, body: JSON.parse(opt.body) };
  fetchLlamado++;
  return Promise.resolve({ ok: true, status: 200 });
};
const inf4 = game.informe();
t('caso 4: guarda por POST /api/snippets', fetchLlamado === 1 && enviado.url === '/api/snippets');
t('caso 4: el id es informe-atascos', enviado.body.id === 'informe-atascos');
t('caso 4: el code generado es JS valido', (() => { try { new Function(enviado.body.code); return true; } catch (e) { return false; } })());
t('caso 4: el markdown viaja crudo dentro del comentario', enviado.body.code.indexOf('## 1. VEREDICTO') >= 0);
t('caso 4: game.informe.ultimo guarda el mismo texto', game.informe.ultimo === inf4);

// Caso 5: la procedencia esta, para no depurar codigo que ya no corre.
t('caso 5: lleva version y huella de la libreria', /libreria: v4\.37 · huella [a-z0-9]+/.test(inf4));
t('caso 5: declara el tamano de los anillos', inf4.indexOf('Lo anterior a eso NO esta en este informe') >= 0);

// Caso 6: el informe no escribe en el mundo que esta diagnosticando.
const notasAntes = Object.keys(mc.notes).length;
game.informe({ guardar: false });
t('caso 6: no crea notas (isTrapPit de solo lectura)', Object.keys(mc.notes).length === notasAntes);

console.log('\n' + ok + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
