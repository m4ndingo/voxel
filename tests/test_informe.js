// @area: general
// @necesita: node
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
    // La obsidiana tiene que tener un id PROPIO: con matId()=>1 el envoltorio de proteccion de
    // obsidiana toma cualquier piedra por obsidiana y bloquea todas las escrituras.
    matId: n => (n === 'obsidian' || n === 'obsidiana') ? 99 : 1,
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
t('caso 1: la tabla 3.3 marca el peldano INEFICAZ', /EMERGENCY_MINE \|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| \*\*INEFICAZ\*\*/.test(inf));
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
// La version se escribia dos veces (cabecera del fichero y seccion 0) y se fueron de la mano: el
// informe anunciaba v4.37 con la libreria ya en v4.38, que es justo el dato que sirve para saber si la
// pestana recargo. Aqui se comprueba que las dos digan lo mismo, no que digan un numero concreto.
const verCabecera = (code.match(/Habilidades de Agentes (v4\.\d+)/) || [])[1];
t('caso 5: lleva version y huella de la libreria', /libreria: v4\.\d+ · huella [a-z0-9]+/.test(inf4));
t('caso 5: la version del informe es la de la cabecera de la libreria',
  !!verCabecera && inf4.indexOf('- libreria: ' + verCabecera + ' · huella ') >= 0);
t('caso 5: declara el tamano de los anillos', inf4.indexOf('Lo anterior a eso NO esta en este informe') >= 0);

// Caso 6: el informe no escribe en el mundo que esta diagnosticando.
const notasAntes = Object.keys(mc.notes).length;
game.informe({ guardar: false });
t('caso 6: no crea notas (isTrapPit de solo lectura)', Object.keys(mc.notes).length === notasAntes);

// Caso 7: ping-pong entre dos celdas. El agente se mueve SIEMPRE y no gana una sola celda: el
// veredicto no puede decir "ok" solo porque cambio de casilla (es el fallo de §21 dentro del informe).
mundo = {};
mundo['20,14,20'] = 1; mundo['20,14,21'] = 1;
const a3 = nuevoAgente('serp', 'Pingpong', 20, 20);
a3.vars.acciones = { UTURN_DEADEND: { n: 4000, conEfecto: 3990, sinEfecto: 0, celdasGanadas: 0,
                                      mismaPos: 2, celdaIman: '20,15,20' } };
a3.vars.recentVisits = [];
for (let i = 0; i < 30; i++) a3.vars.recentVisits.push({ x: 20, z: 20 + (i % 2), tick: i });
a3.stats.ticks = 4000;
const inf7 = game.informe({ guardar: false, todos: true });
t('caso 7: el veredicto es SIN AVANCE, no ok', /UTURN_DEADEND \|[^|]*\|[^|]*\|[^|]*\| 0 \|[^|]*\|[^|]*\| \*\*SIN AVANCE\*\*/.test(inf7));
t('caso 7: R1 explica que moverse no es avanzar', inf7.indexOf('gano 0 celdas nuevas') >= 0 && inf7.indexOf('§21.1') >= 0);

// Caso 8: vecino con suelo pisable pero con voladizo encima. canWalk lo rechaza (desnivelProhibido
// mide cima contra cima), asi que el informe NO puede etiquetarlo LIBRE.
mundo = {};
mundo['30,14,30'] = 1;                       // donde esta el agente
mundo['30,14,29'] = 1; mundo['30,18,29'] = 1; // vecino NORTE: suelo pisable en 14 y voladizo en 18
const a4 = nuevoAgente('volad', 'Voladizo', 30, 30);
const inf8 = game.informe({ guardar: false, todos: true, agentes: ['volad'] });
t('caso 8: el vecino con voladizo sale como AZOTEA', /NORTE[^\n]*AZOTEA \+4/.test(inf8));
t('caso 8: y no como LIBRE', !/NORTE[^\n]*LIBRE/.test(inf8));

// Caso 9: la ventana en segundos hace caso a game.agentSpeed (con 100 no son 80 s, son 0,8).
game.agentSpeed = 100;
const inf9 = game.informe({ guardar: false });
t('caso 9: los segundos cuentan la velocidad', /400 ticks \(~0\.[0-9] s con tickMs 120 y agentSpeed 100\)/.test(inf9));
game.agentSpeed = 1;

// Caso 10: el peldano ESTERIL. Es el caso real del informe del 30/7: FREQ_BREAK gano 110 celdas en
// 19215 ejecuciones (0,006 por vez) y, por no ser CERO exacto, la tabla lo daba por "ok" mientras los
// cinco agentes llevaban 975 ticks sin descubrir una celda. Lo que separa un peldano util de uno
// esteril es el orden de magnitud, no el cero. De paso comprueba las otras dos correcciones del
// informe, que fallaban en el mismo agente: R2 (que colgaba de un caso inalcanzable) y R8 (cuyo suelo
// de area estaba invertido).
mundo = {};
for (let x = 55; x <= 72; x++) for (let z = 55; z <= 66; z++) mundo[x + ',14,' + z] = 1;
const a5 = nuevoAgente('freq', 'Esteril', 60, 60);
a5.stats.ticks = 400;
a5.vars.acciones = {
  // El mejor peldano del propio agente, para que la comparacion no dependa de un numero magico.
  WALK: { n: 1000, conEfecto: 1000, sinEfecto: 0, celdasGanadas: 4300, mismaPos: 1, celdaIman: '' },
  FREQ_BREAK: { n: 19215, conEfecto: 19000, sinEfecto: 215, celdasGanadas: 110,
                mismaPos: 48, celdaIman: '60,15,60' }
};
// Recorre una LINEA de 8 columnas una y otra vez: pisa poco de la caja por la que merodea.
a5.vars.recentVisits = [];
for (let i = 0; i < 120; i++) a5.vars.recentVisits.push({ x: 60 + (i % 8), z: 60, tick: 395 });
const inf10 = game.informe({ guardar: false, agentes: ['freq'] });
t('caso 10: el peldano que gana 0,006 celdas por vez sale ESTERIL, no ok',
  /FREQ_BREAK \|[^|]*\|[^|]*\|[^|]*\|[^|]*\| 0\.006 \|[^|]*\| \*\*ESTÉRIL\*\*/.test(inf10));
t('caso 10: el que si funciona sigue saliendo ok', /WALK \|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| ok \|/.test(inf10));
t('caso 10: R1 lo acusa por tasa y lo compara con el mejor del mismo agente',
  inf10.indexOf('0.006 celdas por vez') >= 0 && inf10.indexOf('**WALK** da 4.30') >= 0);
// R2 colgaba del caso "no cambio de celda", que es justo el que NO se da en un peldano que camina:
// era inalcanzable. Aqui FREQ_BREAK tiene 19000 ejecuciones CON efecto y aun asi R2 tiene que salir.
t('caso 10: R2 sale aunque el peldano si cambie de celda',
  inf10.indexOf('R2 · Esteril') >= 0 && inf10.indexOf('48 veces seguidas') >= 0 &&
  inf10.indexOf('[60,15,60]') >= 0);
// R8 pedia una caja de >=100 celdas, y la caja la dibuja el propio agente: cuanto mas atascado, mas
// pequena. Esta es de 98 — justo la talla que antes callaba.
t('caso 10: R8 acusa la caja pequena (el suelo de area estaba invertido)',
  /R8 · Esteril: solo pisa 8 celdas de las 98 de su caja de merodeo \(8%\)/.test(inf10));

console.log('\n' + ok + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);