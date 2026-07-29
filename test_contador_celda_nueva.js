// «Pasos sin celda nueva» no contaba pasos. Contaba dos cosas mal a la vez:
//   1. se ponia a cero cuando se LANZABA una maniobra de rescate, no cuando la maniobra servia, asi
//      que por construccion no podia pasar del umbral;
//   2. dos ramas de escape (LOOP_ESCAPE_2CELL y FREQ_BREAK) caminan y hacen return antes de llegar a
//      la contabilidad del final del tick, asi que el agente que mas escapaba era el que menos se
//      anotaba: contador congelado y visited/visitedPlanar sin las columnas realmente pisadas.
// Por eso el informe de atascos daba 18 pasos para un agente que llevaba 975 sin ganar una celda.
//
// La prueba es DIFERENCIAL: mismo mundo de juguete con la libreria de HEAD y con la actual.
//   - lo que TIENE que cambiar: el contador crece con cada paso que no descubre columna;
//   - lo que NO tiene que cambiar: el agente da los mismos pasos, acaba en la misma celda y la
//     escalera de rescate se dispara en los mismos ticks (la cadencia se mide ahora con la resta
//     stepsWithoutNewCell - rescateEnPaso, que vale lo que valia antes el contador).
// El mundo es el caso real del informe: un pasillo de 1 de ancho con tapia inescalable.
// Sin navegador y sin escribir nada: game.defineAgent devuelve la definicion y se llama al tick.
const fs = require('fs');
const { execSync } = require('child_process');

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

function correr(code, ticks) {
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
    // Fuera todo lo que reescribe el mundo: si el agente pica la tapia ya no hay atasco que medir.
    skills: { minadoEmergencia: false, saltoTactico: false, caminataAzotea: false,
              lookAheadPrevent: false, visitaCimaUnaSolaVez: false, rebobinadoHistorico: false }
  });
  console.log = real;

  const mundo = nuevoMundo();
  const a = {
    id: 'preso', name: 'Preso', block: 'stone', climb: 1, drop: 3, margin: 1,
    x: X0, y: SUELO + 1, z: Z0, renderX: X0, renderY: SUELO + 1, renderZ: Z0,
    stats: { ticks: 0, steps: 0, mined: 0, jumps: 0 },
    vars: {},
    matId: () => 1,
    getBlock: (x, y, z) => mundo[x + ',' + y + ',' + z] || 0,
    setBlock: (x, y, z, val) => { mundo[x + ',' + y + ',' + z] = val ? val : 0; return true; },
    paint: () => true,
    enqueueBlock: () => true,
    note: () => {},
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
  const cuenta = [], disparos = [];
  let escPrevio = 0;
  for (let i = 0; i < ticks; i++) {
    a.stats.ticks = i;
    def.onTick(a);
    const v = a.vars;
    // "la escalera se ha disparado" = ha rearmado la cuenta atras del escape en este tick
    if ((v.escapeSteps || 0) > escPrevio) disparos.push(i);
    escPrevio = v.escapeSteps || 0;
    cuenta.push(v.stepsWithoutNewCell || 0);
  }
  console.log = () => {};
  const stuck = game.stuck ? game.stuck() : [];
  console.log = real;
  return { cuenta, disparos, stuck, vars: a.vars, pos: [a.x, a.y, a.z], pasos: a.stats.steps,
           columnas: a.vars.visitedPlanar.size };
}

const TICKS = 150;
const actual = JSON.parse(fs.readFileSync('data/snippets/base-npc-skills.json', 'utf8')).code;
const ref = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).code
  : JSON.parse(execSync('git show HEAD:data/snippets/base-npc-skills.json',
      { encoding: 'utf8', maxBuffer: 1 << 28 })).code;

console.log('\nEl pasillo de 1 de ancho atasca al agente (caso real del informe)');
const A = correr(ref, TICKS);
const B = correr(actual, TICKS);
t('el pasillo solo tiene 7 columnas y las agota enseguida', B.columnas === LARGO,
  B.columnas + ' columnas en ' + B.pasos + ' pasos');
t('no se escapa del pasillo (no pica la tapia)', B.pos[0] === X0 && B.pos[2] >= Z0 && B.pos[2] < Z0 + LARGO,
  B.pos.join(','));

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

console.log('\nLo que NO cambia: el agente se mueve exactamente igual');
t('la escalera se dispara el mismo numero de veces', A.disparos.length === B.disparos.length,
  A.disparos.length + ' vs ' + B.disparos.length);
t('y en los mismos ticks', A.disparos.join(',') === B.disparos.join(','), '[' + B.disparos.join(',') + ']');
t('acaba en la misma celda', A.pos.join(',') === B.pos.join(','), A.pos.join(',') + ' vs ' + B.pos.join(','));
t('con los mismos pasos dados', A.pasos === B.pasos, A.pasos + ' vs ' + B.pasos);
t('y descubriendo las mismas columnas', A.columnas === B.columnas, A.columnas + ' vs ' + B.columnas);

console.log('\nY el diagnostico deja de mentir');
// game.stuck etiqueta este caso como oscilacion (ese motivo llega antes en la cascada), pero la ficha
// que yo leo en el informe trae ademas pasosSinProgreso: ESE es el campo que mentia.
const sinProgreso = r => (r.stuck && r.stuck.length ? String(r.stuck[0].pasosSinProgreso || '') : '');
const pasosDe = r => parseInt(sinProgreso(r).split('/')[0], 10);
t('game.stuck ve al agente atascado', B.stuck.length === 1, B.stuck.length + ' agente(s)');
t('y su ficha da la racha completa, no la de despues del ultimo intento',
  pasosDe(B) > TICKS * 0.8 && pasosDe(A) < 15,
  'antes ' + sinProgreso(A) + ' ahora ' + sinProgreso(B));

console.log(fail ? '\n' + fail + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
process.exit(fail ? 1 : 0);
