// Prueba de humo de la cadena de rescate: carga la libreria con stubs minimos y comprueba
// que minadoEmergencia solo declara exito si el picado ABRIO paso, y que logAgente acota.
const fs = require('fs');
const code = JSON.parse(fs.readFileSync('data/snippets/base-npc-skills.json','utf8')).code;

let ok = 0, fail = 0;
function t(n, c) { if (c) { ok++; console.log('  ok  ' + n); } else { fail++; console.log('  FALLO ' + n); } }

global.performance = { now: () => Date.now() };
global.toast = () => {};
const mc = { dim: { x: 96, y: 40, z: 96 }, grid: null, notes: {}, agents: [] };
global.mc = mc;
global.mcGetVoxel = () => 0;
const game = { agents: () => [], toastHistory: [], showToastsEnabled: false };
global.game = game;
global.window = global;

const logs = [];
console.log = (...a) => logs.push(a.join(' '));
(new Function(code))();
console.log = (...a) => process.stdout.write(a.join(' ') + '\n');

const sk = game.skills;
t('la libreria expone game.skills', !!sk);
t('expone vecinosPisablesEn', typeof sk.vecinosPisablesEn === 'function');

// ── Mundo de juguete: el agente en (10,15,10) tapiado por bloques a la altura de pies y cabeza ────
function nuevoAgente(mundo) {
  const a = {
    id: 'test', name: 'Test', x: 10, y: 15, z: 10, climb: 1, drop: 3,
    stats: { ticks: 0, mined: 0 },
    vars: { dir: [1,0], historial: [], visited: new Set(), skills: {}, toastHistory: [] },
    getBlock: (x,y,z) => mundo[x+','+y+','+z] || 0,
    setBlock: (x,y,z,v) => { mundo[x+','+y+','+z] = (v === 0 || v === undefined) ? 0 : v; },
    surfaceY: (x,z) => { for (let y = 39; y >= 0; y--) if (mundo[x+','+y+','+z]) return y; return -1; },
    // Copia fiel de mcSurfaceNear: suelo solido con AIRE encima, subiendo <= climb y bajando <= drop.
    canWalk(dx,dz) {
      const nx = this.x+dx, nz = this.z+dz;
      for (let d = 0; d <= 3; d++) {
        const cand = [];
        if (d <= this.climb) cand.push(this.y + d);
        if (d > 0 && d <= this.drop) cand.push(this.y - d);
        for (const y of cand) {
          if (y < 0 || y > 39) continue;
          if (mundo[nx+','+y+','+nz] && !mundo[nx+','+(y+1)+','+nz]) return true;
        }
      }
      return false;
    },
    note: () => {}, walk: () => false
  };
  return a;
}
const DIRS = [[1,0],[0,1],[-1,0],[0,-1]];

// Caso A: muro de 1 bloque de grosor -> picar SI abre paso.
let mundo = {};
for (const [dx,dz] of DIRS) {
  mundo[(10+dx)+',14,'+(10+dz)] = 1;                       // suelo vecino
  mundo[(10+dx)+',15,'+(10+dz)] = 1;                       // pies tapiados
  mundo[(10+dx)+',16,'+(10+dz)] = 1;                       // cabeza tapiada
  mundo[(10+dx)+',17,'+(10+dz)] = 1;                       // y una hilada mas: no se puede trepar
}
mundo['10,14,10'] = 1;
let a = nuevoAgente(mundo);
t('caso A: de entrada esta tapiado', !DIRS.some(d => a.canWalk(d[0], d[1])));
t('caso A: picar abre paso y devuelve true', sk.minadoEmergencia(a, DIRS) === true);
t('caso A: el contador de intentos se reinicia', a.vars.minadoIntentos === 0);

// Caso B: un constructor repone el bloque en cada tick -> nunca abre -> SIEMPRE false, y para a las 8.
mundo = {};
mundo['10,14,10'] = 1;
// Voladizo: los vecinos SOLO tienen bloques a la altura del agente y nada debajo, asi que picar
// pies y cabeza deja el hueco sobre el vacio y sigue sin haber donde pisar.
for (const [dx,dz] of DIRS) {
  mundo[(10+dx)+',15,'+(10+dz)] = 1;
  mundo[(10+dx)+',16,'+(10+dz)] = 1;
  mundo[(10+dx)+',17,'+(10+dz)] = 1;
}
a = nuevoAgente(mundo);
a.vars.minadoCelda = undefined;
let veces = 0;
for (let i = 0; i < 30; i++) {
  // el "constructor" repone lo picado
  for (const [dx,dz] of DIRS) for (const y of [15,16]) mundo[(10+dx)+','+y+','+(10+dz)] = 1;
  if (sk.minadoEmergencia(a, DIRS) === true) veces++;
}
t('caso B: nunca declara exito si no abrio paso', veces === 0);
t('caso B: deja de picar tras 8 intentos en la misma celda', a.vars.minadoIntentos === 8);

// Caso C: acotado de log — 30 llamadas con la misma clave = 1 sola linea.
logs.length = 0;
console.log = (...x) => logs.push(x.join(' '));
mundo = {}; mundo['10,14,10'] = 1;
for (const [dx,dz] of DIRS) { mundo[(10+dx)+',14,'+(10+dz)] = 1; mundo[(10+dx)+',15,'+(10+dz)] = 1; mundo[(10+dx)+',16,'+(10+dz)] = 1; mundo[(10+dx)+',17,'+(10+dz)] = 1; }
a = nuevoAgente(mundo);
for (let i = 0; i < 30; i++) {
  for (const [dx,dz] of DIRS) { mundo[(10+dx)+',15,'+(10+dz)] = 1; mundo[(10+dx)+',16,'+(10+dz)] = 1; }
  a.vars.minadoCelda = undefined;   // como si se hubiera movido: permite reintentar   // como si se hubiera movido: permite reintentar
  sk.minadoEmergencia(a, DIRS);
}
const minado = logs.filter(l => l.indexOf('[MINADO EMERGENCIA]') >= 0);
console.log = (...x) => process.stdout.write(x.join(' ') + '\n');
t('caso C: 30 minados exitosos <= 1 linea de log (antes eran 30)', minado.length <= 1);

console.log('\n' + ok + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
