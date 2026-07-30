// «Pasos sin celda nueva» no contaba pasos, y por eso la escalera de rescate no llegaba a bajar.
// Dos defectos encadenados, uno detras del otro:
//   1. el contador se ponia a cero cuando se LANZABA una maniobra de rescate, no cuando la maniobra
//      servia, asi que por construccion no podia pasar del umbral; ademas dos ramas de escape
//      (LOOP_ESCAPE_2CELL y FREQ_BREAK) caminan y hacen return antes de la contabilidad del final del
//      tick, asi que el agente que mas escapaba era el que menos se anotaba. El informe daba 18 pasos
//      para un agente que llevaba 975 sin ganar una celda.
//   2. arreglado el contador, FREQ_BREAK seguia capturando el tick SIEMPRE que tocaba por cadencia,
//      asi que el agente nunca caia hasta el minado ni el salto tactico: se pasaba la vida girando.
//      Ahora tiene presupuesto (FREQ_BREAK_MAX_SIN_CELDA disparos sin descubrir columna) y al agotarlo
//      deja pasar el tick a los peldanos de abajo.
// Las dos pruebas son DIFERENCIALES: el mismo mundo de juguete con la libreria de un commit concreto
// y con la actual. Se fija el commit, no HEAD, para que la prueba siga midiendo lo mismo manana.
// El mundo es el caso real del informe: un pasillo de 1 de ancho con tapia inescalable.
// Sin navegador y sin escribir nada: game.defineAgent devuelve la definicion y se llama al tick.
const fs = require('fs');
const { execSync } = require('child_process');

const REF_CONTADOR = 'c070444~1';    // antes de que el contador contara pasos
const REF_PRESUPUESTO = 'c070444';   // contador ya arreglado, pero FREQ_BREAK aun preferente

let ok = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { ok++; console.log('  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log('  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

const SUELO = 14, X0 = 10, Z0 = 10, LARGO = 7, TAPIA = 20;
function nuevoMundo() {
  const m = {};
  for (let x = X0 - 1; x <= X0 + 1; x++) {
    for (let z = Z0 - 1; z <= Z0 + LARGO; z++) {
      const pared = (x !== X0) || z < Z0 || z >= Z0 + LARGO;
      for (let y = 0; y <= (pared ? TAPIA : SUELO); y++) m[x + ',' + y + ',' + z] = 1;
    }
  }
  return m;
}

function correr(code, ticks, minado) {
  global.performance = { now: () => Date.now() };
  global.toast = () => {};
  global.window = global;
  global.mcGetVoxel = () => 0;
  const mc = { dim: { x: 96, y: 40, z: 96 }, grid: null, notes: {}, agents: new Map(), mats: [] };
  global.mc = mc;
  const game = { agents: () => [], toastHistory: [], showToastsEnabled: false,
                 defineAgent: d => d, matName: () => 'piedra' };
  global.game = game;

  const real = console.log;
  console.log = () => {};                       // la libreria se presenta al cargarse (§22)
  (new Function(code))();
  const def = game.defineStandardAgent({
    id: 'preso', name: 'Preso', block: 'stone', climb: 1, drop: 3, tickMs: 200,
    // Con minado APAGADO no hay forma de salir del pasillo: se mide el atasco puro.
    // Con minado ENCENDIDO el pasillo tiene salida, pero solo si la escalera llega hasta abajo.
    skills: { minadoEmergencia: !!minado, saltoTactico: false, caminataAzotea: false,
              lookAheadPrevent: false, visitaCimaUnaSolaVez: false, rebobinadoHistorico: false }
  });
  console.log = real;

  const mundo = nuevoMundo();
  let picados = 0;
  const a = {
    id: 'preso', name: 'Preso', block: 'stone', climb: 1, drop: 3, margin: 1,
    x: X0, y: SUELO + 1, z: Z0, renderX: X0, renderY: SUELO + 1, renderZ: Z0,
    stats: { ticks: 0, steps: 0, mined: 0, jumps: 0 },
    vars: {},
    // La obsidiana tiene que tener un id PROPIO: con matId()=>1 el envoltorio de proteccion de
    // obsidiana de onStart toma cualquier piedra por obsidiana y no deja picar una sola vez.
    matId: n => (n === 'obsidian' || n === 'obsidiana') ? 99 : 1,
    getBlock: (x, y, z) => mundo[x + ',' + y + ',' + z] || 0,
    setBlock: (x, y, z, val) => {
      const k = x + ',' + y + ',' + z;
      if (!val || val === 'air') { if (!mundo[k]) return false; delete mundo[k]; picados++; return true; }
      mundo[k] = val; return true;
    },
    paint: () => true,
    enqueueBlock: () => true,
    note: () => {},
    // Con el minado encendido el pasillo es tan pequeno que el agente lo cubre entero y se para solo.
    stop: function () { this.parado = true; },
    surfaceY: (x, z) => { for (let y = 39; y >= 0; y--) if (mundo[x + ',' + y + ',' + z]) return y; return -1; },
    canWalk(dx, dz) {                            // copia fiel de mcSurfaceNear
      const nx = this.x + dx, nz = this.z + dz;
      for (let d = 0; d <= 3; d++) {
        const cand = [];
        if (d <= this.climb) cand.push(this.y + d);
        if (d > 0 && d <= this.drop) cand.push(this.y - d);
        for (const y of cand) {
          if (y < 0 || y > 39) continue;
          if (mundo[nx + ',' + y + ',' + nz] && !mundo[nx + ',' + (y + 1) + ',' + nz]) return true;
        }
      }
      return false;
    },
    walk(dx, dz) {
      if (!this.canWalk(dx, dz)) return false;
      this.x += dx; this.z += dz;
      this.y = this.surfaceY(this.x, this.z) + 1;
      this.renderX = this.x; this.renderY = this.y; this.renderZ = this.z;
      this.stats.steps++;
      return true;
    }
  };
  mc.agents.set('preso', a);                     // para que game.stuck() lo vea

  if (def.onStart) def.onStart(a);
  const cuenta = [];
  let ticksDados = 0;
  for (let i = 0; i < ticks && !a.parado; i++) {
    a.stats.ticks = i;
    def.onTick(a);
    cuenta.push(a.vars.stepsWithoutNewCell || 0);
    ticksDados++;
  }
  console.log = () => {};
  const stuck = game.stuck ? game.stuck() : [];
  console.log = real;
  // Cuantas veces se ejecuto cada peldano, del anillo de telemetria del propio informe (§23).
  const acc = a.vars.acciones || {};
  const veces = k => (acc[k] ? acc[k].n : 0);
  return { cuenta, stuck, vars: a.vars, pos: [a.x, a.y, a.z], pasos: a.stats.steps, picados, veces,
           ticksDados, parado: !!a.parado, columnas: a.vars.visitedPlanar.size };
}

const actual = JSON.parse(fs.readFileSync('data/snippets/base-npc-skills.json', 'utf8')).code;
const libDe = ref => JSON.parse(execSync('git show ' + ref + ':data/snippets/base-npc-skills.json',
  { encoding: 'utf8', maxBuffer: 1 << 28 })).code;

// ── 1. El contador cuenta pasos, no intentos ────────────────────────────────────────────────────
const TICKS = 150;
console.log('\nEl pasillo de 1 de ancho atasca al agente (caso real del informe)');
const A = correr(libDe(REF_CONTADOR), TICKS, false);
const B = correr(actual, TICKS, false);
t('el pasillo solo tiene 7 columnas y las agota enseguida', B.columnas === LARGO,
  B.columnas + ' columnas en ' + B.pasos + ' pasos');
t('no se escapa del pasillo (con el minado apagado no hay salida)',
  B.pos[0] === X0 && B.pos[2] >= Z0 && B.pos[2] < Z0 + LARGO, B.pos.join(','));

console.log('\nLo que cambia: el contador cuenta pasos, no intentos');
const maxA = Math.max.apply(null, A.cuenta), maxB = Math.max.apply(null, B.cuenta);
t('antes se congelaba muy por debajo de los pasos dados', maxA < 15 && maxA < B.pasos / 10,
  'maximo ' + maxA + ' con ' + A.pasos + ' pasos dados');
t('ahora llega hasta el final de la racha', maxB > TICKS * 0.8, maxA + ' -> ' + maxB);
t('sube de uno en uno mientras no aparezca columna nueva',
  B.cuenta.every((n, i) => i === 0 || n === 0 || n === B.cuenta[i - 1] || n === B.cuenta[i - 1] + 1),
  'ultimo ' + B.cuenta[B.cuenta.length - 1]);
t('coincide con el de antes hasta que el viejo se congela',
  A.cuenta.slice(0, 18).join(',') === B.cuenta.slice(0, 18).join(','),
  B.cuenta.slice(0, 18).join(' '));
t('rescateEnPaso (el apunte del ultimo intento) nunca pasa del contador',
  (B.vars.rescateEnPaso || 0) <= (B.vars.stepsWithoutNewCell || 0),
  'rescateEnPaso=' + (B.vars.rescateEnPaso || 0) + ' contador=' + B.vars.stepsWithoutNewCell);

console.log('\nY el diagnostico deja de mentir');
// game.stuck etiqueta este caso como oscilacion (ese motivo llega antes en la cascada), pero la ficha
// que yo leo en el informe trae ademas pasosSinProgreso: ESE es el campo que mentia.
const sinProgreso = r => (r.stuck && r.stuck.length ? String(r.stuck[0].pasosSinProgreso || '') : '');
const pasosDe = r => parseInt(sinProgreso(r).split('/')[0], 10);
t('game.stuck ve al agente atascado', B.stuck.length === 1, B.stuck.length + ' agente(s)');
t('y su ficha da la racha completa, no la de despues del ultimo intento',
  pasosDe(B) > TICKS * 0.8 && pasosDe(A) < 15,
  'antes ' + sinProgreso(A) + ' ahora ' + sinProgreso(B));

// ── 2. FREQ_BREAK deja pasar el tick cuando se le acaba el presupuesto ──────────────────────────
// Aqui el minado esta ENCENDIDO: el pasillo tiene salida, pero solo la encuentra quien llega al
// peldano del minado. Con FREQ_BREAK preferente el agente ni se asoma.
const TICKS2 = 400;
console.log('\nCon el minado disponible, la escalera tiene que llegar hasta abajo');
const C = correr(libDe(REF_PRESUPUESTO), TICKS2, true);
const D = correr(actual, TICKS2, true);
t('antes FREQ_BREAK se quedaba el tick y no se picaba una sola vez',
  C.picados === 0 && C.veces('FREQ_BREAK') > 100,
  'FREQ_BREAK x' + C.veces('FREQ_BREAK') + ', ' + C.picados + ' bloques picados');
t('ahora el agente llega al minado de emergencia', D.veces('EMERGENCY_MINE') > 0,
  'EMERGENCY_MINE x' + D.veces('EMERGENCY_MINE'));
t('y pica de verdad', D.picados > 0, D.picados + ' bloques picados');
t('FREQ_BREAK deja de acaparar el tick', D.veces('FREQ_BREAK') < C.veces('FREQ_BREAK') / 2,
  C.veces('FREQ_BREAK') + ' -> ' + D.veces('FREQ_BREAK'));

console.log(fail ? '\n' + fail + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
process.exit(fail ? 1 : 0);
