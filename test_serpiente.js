// Prueba de humo de la muerte por la propia cola (§24): una serpiente metida en un callejon de 1 de
// ancho tiene que dejar lapida y reaparecer, en vez de hacer ping-pong entre dos celdas para siempre.
const fs = require('fs');
const code = JSON.parse(fs.readFileSync('data/snippets/base-npc-skills.json', 'utf8')).code;

let ok = 0, fail = 0;
function t(n, c) { if (c) { ok++; console.log('  ok  ' + n); } else { fail++; console.log('  FALLO ' + n); } }

global.performance = { now: () => Date.now() };
global.toast = () => {};
const mc = { dim: { x: 40, y: 40, z: 40 }, grid: null, notes: {}, agents: new Map() };
global.mc = mc;
global.mcGetVoxel = () => 0;
const game = { agents: () => [], toastHistory: [], showToastsEnabled: false, fps: 60 };
global.game = game;
global.window = global;
const logs = [];
console.log = (...a) => logs.push(a.join(' '));
(new Function(code))();
console.log = (...a) => process.stdout.write(a.join(' ') + '\n');
const sk = game.skills;

// ── Mundo: llanura de suelo en y=14, con un callejon de 1 de ancho en la esquina x=1..3, z=1 ──────
let mundo = {};
for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) mundo[x + ',14,' + z] = 1;
// paredes que dejan (1,1)..(3,1) como pasillo ciego de una sola celda de ancho
for (let x = 0; x <= 4; x++) { mundo[x + ',15,0'] = 1; mundo[x + ',16,0'] = 1; mundo[x + ',15,2'] = 1; mundo[x + ',16,2'] = 1; }
mundo['0,15,1'] = 1; mundo['0,16,1'] = 1;   // fondo del callejon
mundo['4,15,1'] = 1; mundo['4,16,1'] = 1;   // y tapamos tambien la salida: encierro total

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
const surfaceY = (x, z) => { for (let y = 39; y >= 0; y--) if (mundo[x + ',' + y + ',' + z]) return y; return -1; };

let pasos = 0;
const a = {
  id: 'serp', name: 'Serpiente', x: 2, y: 15, z: 1, climb: 1, drop: 3, margin: 1,
  tickMs: 110, block: 'sand', state: 'running',
  cfg: { skills: { modoSerpiente: true } },
  stats: { ticks: 0, steps: 0, blocked: 0, mined: 0, painted: 0 },
  vars: { dir: [1, 0], historial: [], visited: new Set(), recentVisits: [], tickets: {}, ticketLog: [],
          executionTrace: [], runId: 'test', skills: { modoSerpiente: true },
          cuerpo: [{ x: 1, z: 1 }], cuerpoSalientes: [], ultimoPaso: [1, 0] },
  matId: () => 1,
  getBlock: (x, y, z) => mundo[x + ',' + y + ',' + z] ? 1 : 0,
  setBlock: function (x, y, z, mat) {
    const k = x + ',' + y + ',' + z;
    if (mat === 0 || mat === 'air') { if (!mundo[k]) return false; delete mundo[k]; return true; }
    if (mundo[k]) return false; mundo[k] = mat; return true;
  },
  surfaceY: surfaceY,
  canWalk: function (dx, dz) { return mcSurfaceNear(this.x + dx, this.z + dz, this.y, this.climb, this.drop) >= 0; },
  walk: function (dx, dz) { pasos++; this.x += dx; this.z += dz; return true; },
  note: function (txt, celda) { const c = celda || [this.x, this.y, this.z]; mc.notes[c.join(',')] = String(txt); return true; },
  getNote: function (x, y, z) { return mc.notes[x + ',' + y + ',' + z] || ''; },
  agentsAt: () => []
};

t('expone serpienteMuerePorSuCola', typeof sk.serpienteMuerePorSuCola === 'function');
// El pino NO se reimplementa: se reutiliza el de la libreria con el tronco estirado.
t('no hay un segundo pino duplicado', typeof sk.plantarPinoAlto === 'undefined');
t('sigue existiendo plantarPinoDeEmergencia', typeof sk.plantarPinoDeEmergencia === 'function');

const antes = { x: a.x, z: a.z };
const murio = sk.serpienteMuerePorSuCola(a);
t('la muerte devuelve true (encontro sitio donde reaparecer)', murio === true);
t('reaparece lejos de donde murio', Math.hypot(a.x - antes.x, a.z - antes.z) >= 10);
t('el cuerpo se descarta entero', a.vars.cuerpo.length === 0 && a.vars.ultimoPaso === null);
t('cuenta la muerte', a.stats.muertes === 1);
t('reaparece sobre suelo pisable', mcSurfaceNear(a.x, a.z, a.y, a.climb, a.drop) >= 0);
t('reaparece con al menos 2 vecinos pisables', sk.vecinosPisablesEn(a, a.x, a.y - 1, a.z) >= 2);

// La lapida: el pino tiene que verse, o sea ser MUCHO mas alto que el pino de emergencia (5).
let altura = 0;
for (let y = 15; y < 40; y++) if (mundo['2,' + y + ',1']) altura = y - 14;
t('el pino es bien alto (>=12 de tronco)', altura >= 12);
// Copa del pino de siempre: 3x3, cruz y punta encima del tronco.
const punta = 14 + altura;
t('la copa 3x3 corona el tronco', !!mundo['1,' + (punta - 2) + ',1'] && !!mundo['3,' + (punta - 2) + ',1']);
t('la punta es una sola columna', !!mundo['2,' + punta + ',1'] && !mundo['1,' + punta + ',1']);
const nota = mc.notes['2,15,1'] || '';
t('deja nota de muerte por su propia cola', /muri[oó] por su propia cola/i.test(nota));
t('la nota dice la causa', nota.indexOf('callejon de 1 de ancho') >= 0);
t('la traza registra la muerte y la reaparicion',
  a.vars.executionTrace.some(e => e.indexOf ? e.indexOf('SNAKE_DEAD_BY_TAIL') >= 0 : JSON.stringify(e).indexOf('SNAKE_DEAD_BY_TAIL') >= 0) &&
  JSON.stringify(a.vars.executionTrace).indexOf('SNAKE_RESPAWN') >= 0);

// Regresion del refactor: sin opts el pino de emergencia sale EXACTAMENTE como antes.
const b = { x: 20, y: 15, z: 20, name: 'Otro', stats: { ticks: 0 },
            vars: { stepsWithoutNewCell: 0, visited: new Set(), toastHistory: [], executionTrace: [] },
            surfaceY: surfaceY, getBlock: a.getBlock, setBlock: a.setBlock, note: a.note, getNote: a.getNote };
sk.plantarPinoDeEmergencia(b);
let altB = 0;
for (let y = 15; y < 40; y++) if (mundo['20,' + y + ',20']) altB = y - 14;
t('el pino de emergencia sin opts sigue midiendo 5 (2 tronco + copa)', altB === 5);
t('y sigue dejando su nota de siempre', /pino de emergencia/.test(mc.notes['20,15,20'] || ''));

console.log('\n' + ok + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
