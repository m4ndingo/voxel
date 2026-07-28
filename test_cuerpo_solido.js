// Arnes headless para «CUERPO SOLIDO» de data/snippets/base-npc-skills.json.
//
// Extrae la seccion VERBATIM del snippet guardado y la ejecuta contra stubs de los internos del Mundo.
// Lo que se comprueba es que un agente grande se comporte como un agente normal pero A SU TAMANO:
// choca donde se le ve, te empuja, te lleva encima — y que al agente pequeno no se le cambie nada.
'use strict';
const fs = require('fs');
const vm = require('vm');

const lib = JSON.parse(fs.readFileSync('/root/voxel/data/snippets/base-npc-skills.json', 'utf8'));
const lineas = lib.code.split('\n');
const ini = lineas.findIndex(l => l.includes('CUERPO SOLIDO: la fisica del agente'));
if (ini < 0) throw new Error('no encuentro la seccion CUERPO SOLIDO en la libreria');
const fin = lineas.findIndex((l, i) => i > ini && l.trim() === '})();');
const seccion = lineas.slice(ini - 1, fin).join('\n');

let ok = 0, fallos = 0, mundo = null;
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function test(nombre, fn) {
  mundo = nuevoMundo();
  try { fn(); ok++; console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLO ' + nombre + '\n        ' + e.message); }
}

// ---------------------------------------------------------------- stubs del motor
function nuevoMundo() {
  const cuenta = { colisionPrevia: 0, empujonPrevio: 0 };
  const ctx = {
    console: { log() {}, warn(...a) { ctx._warns.push(a.join(' ')); }, error(...a) { ctx._errors.push(a.join(' ')); } },
    _warns: [], _errors: [], cuenta,
    performance: { now: () => 1e6 },          // lejos de cualquier _dismountedAt
    MC_HW: 0.3, MC_PH: 1.8,
    mc: { agents: new Map(), scale: 1, pos: [0, 0, 0] },
    // el original: terreno + estructuras + la caja 1x1x1 de CADA agente (justo lo que se quiere sustituir)
    mcCollides(px, py, pz) {
      cuenta.colisionPrevia++;
      if (py < ctx.SUELO) return true;                       // "terreno": todo lo que baje del suelo
      if (!ctx.mc.agents || !ctx.mc.agents.size) return false;
      const HW = ctx.MC_HW * ctx.mc.scale, PH = ctx.MC_PH * ctx.mc.scale;
      for (const a of ctx.mc.agents.values()) {
        if (a.state === 'stopped') continue;
        const rx = a.renderX !== undefined ? a.renderX : a.x;
        const ry = a.renderY !== undefined ? a.renderY : a.y;
        const rz = a.renderZ !== undefined ? a.renderZ : a.z;
        if (px + HW > rx && px - HW < rx + 1 && py + PH - 1e-4 > ry + 1 && py < ry + 2
            && pz + HW > rz && pz - HW < rz + 1) return true;
      }
      return false;
    },
    mcAgentShove() { cuenta.empujonPrevio++; return false; },
    mcGetVoxel(x, y, z) { return y < ctx.SUELO ? 1 : 0; },
    SUELO: 0,
  };
  ctx.window = ctx;
  ctx.game = { skills: {} };
  // cuerpoDe: lo aporta la seccion CUERPOS DE AGENTE, que este arnes no carga
  vm.createContext(ctx);
  vm.runInContext('function cuerpoDe(a){ return a && a.vars ? a.vars._cuerpo : null; }', ctx);
  vm.runInContext('(function(){\n' + seccion + '\n})();', ctx, { filename: 'base-npc-skills.js' });
  return ctx;
}

// agente con cuerpo declarado por skills.cuerpo (escala/altura) y el isMounted del framework
function agente(id, x, y, z, cuerpo) {
  const a = {
    id, x, y, z, state: 'running', vars: {}, count: 0,
    renderX: x, renderY: cuerpo && cuerpo.altura != null ? cuerpo.altura - 1 : y, renderZ: z,
    isMounted() { return a._montarFramework === true; },   // marcador: ¿se ha usado el original?
  };
  if (cuerpo) a.vars._cuerpo = { tipo: 'bloque', escala: cuerpo.escala, altura: cuerpo.altura, malla: null };
  mundo.mc.agents.set(id, a);
  return a;
}

console.log('CUERPO SOLIDO · ' + (fin - ini + 1) + ' lineas extraidas de ' + lib.name);

// ---------------------------------------------------------------- 1. la caja es la que se ve
test('choca donde se le VE: escala 9 en altura 26 ocupa [26,35] y 9 de lado', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  // centro del cuerpo: 20+0.5 = 20.5, asi que x va de 16 a 25
  assert(mundo.mcCollides(20.5, 30, 20.5), 'no choca en el centro del cuerpo');
  assert(mundo.mcCollides(16.5, 26.5, 20.5), 'no choca cerca del borde x0');
  assert(!mundo.mcCollides(14, 30, 20.5), 'choca FUERA de la caja por x');
  assert(!mundo.mcCollides(20.5, 36, 20.5), 'choca POR ENCIMA de la tapa (y1=35)');
  assert(!mundo.mcCollides(20.5, 23, 20.5), 'choca POR DEBAJO de la base (y0=26)');
});

test('el 1x1x1 fantasma del framework YA NO esta a ras de suelo bajo un agente que vuela', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  // el original pondria una caja en [ry+1, ry+2) = [26,27) ... pero con renderY=25 pondria [26,27).
  // Lo que importa: en la cota del JUGADOR (suelo) no puede haber nada del agente.
  assert(!mundo.mcCollides(20.5, 0.5, 20.5), 'hay un obstaculo invisible a ras de suelo bajo la nube');
});

test('al agente SIN solido no se le cambia nada: sigue con su 1x1x1', () => {
  const a = agente('serpiente', 10, 5, 10, null);
  assert(mundo.mcCollides(10.5, 6.5, 10.5), 'la caja 1x1x1 de siempre ha dejado de chocar');
  assert(!mundo.mcCollides(13, 6.5, 10.5), 'choca fuera de su 1x1x1');
});

test('terreno y estructuras las sigue resolviendo el original', () => {
  mundo.SUELO = 5;
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  mundo.cuenta.colisionPrevia = 0;
  assert(mundo.mcCollides(0, 1, 0), 'ya no choca con el terreno');
  assert(mundo.cuenta.colisionPrevia === 1, 'no ha delegado en el mcCollides original');
});

test('mezcla: agente grande y agente pequeno conviven con su caja cada uno', () => {
  const g = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  const p = agente('serpiente', 10, 5, 10, null);
  mundo.game.skills.solido(g);
  assert(mundo.mcCollides(20.5, 30, 20.5), 'el grande no choca a su tamano');
  assert(mundo.mcCollides(10.5, 6.5, 10.5), 'el pequeno ha perdido su caja');
  assert(!mundo.mcCollides(10.5, 30, 10.5), 'el pequeno choca donde no debe');
});

// ---------------------------------------------------------------- 2. subirse encima
test('te lleva encima: los pies en la TAPA real del cuerpo (y=35), no en ry+2', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  mundo.mc.pos = [20.5, 35, 20.5];
  assert(a.isMounted(), 'de pie sobre la tapa del cuerpo y no te lleva');
  mundo.mc.pos = [20.5, 27, 20.5];
  assert(!a.isMounted(), 'la ventana antigua (ry+2) sigue contando como montado');
  mundo.mc.pos = [40, 35, 20.5];
  assert(!a.isMounted(), 'te lleva estando fuera del cuerpo en horizontal');
});

test('apoyado en suelo del mundo NO cuenta como montado (igual que el original)', () => {
  mundo.SUELO = 35;
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  mundo.mc.pos = [20.5, 35, 20.5];
  assert(!a.isMounted(), 'de pie en el suelo del mundo y dice que vas montado');
});

// ---------------------------------------------------------------- 3. empujon
test('te EMPUJA fuera si te embiste, por el lado corto a favor de su marcha', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  a.x = 21;                                   // va hacia +x (a.x por delante de renderX)
  mundo.game.skills.solido(a);
  mundo.mc.pos = [24, 30, 20.5];              // dentro de la caja, cerca del borde +x
  assert(mundo.mcAgentShove(), 'no te ha apartado');
  assert(mundo.mc.pos[0] > 25, 'te ha escupido hacia atras (x=' + mundo.mc.pos[0] + '), no a favor de su marcha');
  assert(!mundo.mcCollides(mundo.mc.pos[0], mundo.mc.pos[1], mundo.mc.pos[2]), 'te ha dejado dentro del cuerpo');
});

test('si no hay agente solido encima, el empujon lo resuelve el original', () => {
  agente('serpiente', 10, 5, 10, null);
  mundo.mc.pos = [10.5, 6.5, 10.5];
  mundo.mcAgentShove();
  assert(mundo.cuenta.empujonPrevio === 1, 'no ha delegado en mcAgentShove original');
});

test('fuera del cuerpo no te empuja', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  mundo.mc.pos = [40, 30, 40];
  const antes = mundo.mc.pos.slice();
  mundo.mcAgentShove();
  assert(mundo.mc.pos[0] === antes[0] && mundo.mc.pos[2] === antes[2], 'te ha movido sin tocarte');
});

// ---------------------------------------------------------------- 4. ciclo de vida
test('solido(a,false) devuelve al agente su 1x1x1 y su isMounted original', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  mundo.game.skills.solido(a, false);
  assert(!mundo.mcCollides(16.5, 30, 20.5), 'sigue chocando a escala 9');
  a._montarFramework = true;
  assert(a.isMounted() === true, 'no ha devuelto el isMounted del framework');
});

test('solido sin cuerpo declarado avisa y no hace nada', () => {
  const a = agente('pelado', 10, 5, 10, null);
  const r = mundo.game.skills.solido(a);
  assert(r === null, 'deberia devolver null');
  assert(mundo._warns.some(w => /no tiene cuerpo declarado/.test(w)), 'esperaba aviso: ' + mundo._warns);
});

test('un agente parado (stopped) deja de chocar', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  a.state = 'stopped';
  assert(!mundo.mcCollides(20.5, 30, 20.5), 'un agente parado sigue siendo solido');
});

test('la caja sigue al cuerpo interpolado (renderX), no a la celda logica', () => {
  const a = agente('nube', 20, 25, 20, { escala: 9, altura: 26 });
  mundo.game.skills.solido(a);
  a.renderX = 24.4;                            // a mitad de camino entre celdas
  assert(mundo.mcCollides(24.9, 30, 20.5), 'la caja no ha seguido a la posicion interpolada');
  assert(!mundo.mcCollides(20.0, 30, 20.5), 'la caja se ha quedado en la celda vieja');
});

test('no queda rastro del cuerpo de bloques ni del gemelo invisible', () => {
  for (const resto of ['cuerpoBloques', 'ID_FANTASMA', 'mcComputeLight', 'dibujarSombras', 'game.skills.sombra'])
    assert(!lib.code.includes(resto), 'queda "' + resto + '" en la libreria');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
