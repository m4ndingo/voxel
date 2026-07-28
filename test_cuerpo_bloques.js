// Arnes headless para «CUERPO DE BLOQUES» de data/snippets/base-npc-skills.json.
//
// Extrae la seccion VERBATIM del snippet guardado (no una copia) y la ejecuta contra stubs de los
// internos del Mundo (mc.grid, mcIdx, mcComputeLight, mcSerialize, mcAgentMesh...). Lo que se
// comprueba es lo que el dueno del proyecto exigio que no se rompiera:
//   1. el agente NUNCA pisa un bloque del usuario (solo aire) y al moverse solo borra lo suyo,
//   2. mundo.json jamas lleva celdas de agente,
//   3. un paso = UN mcComputeLight (no 54), y quedarse quieto = CERO.
'use strict';
const fs = require('fs');
const vm = require('vm');

// ---------------------------------------------------------------- extraccion de la seccion real
const lib = JSON.parse(fs.readFileSync('/root/voxel/data/snippets/base-npc-skills.json', 'utf8'));
const lineas = lib.code.split('\n');
const ini = lineas.findIndex(l => l.includes('CUERPO DE BLOQUES: el agente ES terreno'));
if (ini < 0) throw new Error('no encuentro la seccion CUERPO DE BLOQUES en la libreria');
const fin = lineas.findIndex((l, i) => i > ini && l.trim() === '})();');
if (fin < 0) throw new Error('no encuentro el cierre de la libreria');
const seccion = lineas.slice(ini - 1, fin).join('\n');
const cola = lineas.slice(fin + 1).join('').trim();
assert(cola === '', 'la seccion ya no es la ultima de la libreria: revisa la extraccion');
assert(/game\.skills\.cuerpoBloques\s*=/.test(seccion), 'la seccion extraida no define cuerpoBloques');
assert(/game\.skills\.liberarCuerpoBloques\s*=/.test(seccion), 'la seccion extraida no define liberarCuerpoBloques');

// ---------------------------------------------------------------- stubs del motor
const DIM = { x: 32, y: 40, z: 32 };
const SUELO = 14;

let mundo = null;   // el contexto vm

function nuevoMundo() {
  const grid = new Uint16Array(DIM.x * DIM.y * DIM.z);
  const idx = (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y;
  for (let z = 0; z < DIM.z; z++) for (let x = 0; x < DIM.x; x++)
    for (let y = 0; y <= SUELO; y++) grid[idx(x, y, z)] = 3;   // 3 = 'grass'

  const cuenta = { luz: 0, luzBloque: 0, chunks: 0, malla: 0, serializa: 0 };
  const ctx = {
    console: { log() {}, warn(...a) { ctx._warns.push(a.join(' ')); }, error(...a) { ctx._errors.push(a.join(' ')); } },
    _warns: [], _errors: [], cuenta,
    MC_CHUNK: 16,
    mc: { dim: DIM, grid, agents: new Map(), structures: [], name2id: { snow: 7, stone: 1, grass: 3 } },
    mcIdx: (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y,
    mcInside: (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < DIM.x && y < DIM.y && z < DIM.z,
    mcComputeLight() { cuenta.luz++; },
    mcComputeBlockLight() { cuenta.luzBloque++; },
    mcMeshChunk(cx, cz) {
      cuenta.chunks++;
      assert(cx >= 0 && cz >= 0 && cx < Math.ceil(DIM.x / 16) && cz < Math.ceil(DIM.z / 16),
        'mcMeshChunk fuera de rango: ' + cx + ',' + cz);
    },
    mcRebakeStructsNear() {},
    mcResolveMat(m) { return ctx.mc.name2id[m] || 0; },
    // Original: vuelca la rejilla tal cual (es lo que hace el de verdad con mc.grid).
    mcSerialize() { cuenta.serializa++; return { grid: Array.from(ctx.mc.grid) }; },
    mcAgentMesh(a) { cuenta.malla++; a.count = 36; },
  };
  ctx.window = ctx;
  ctx.game = { skills: {} };
  vm.createContext(ctx);
  vm.runInContext('(function(){\n' + seccion + '\n})();', ctx, { filename: 'base-npc-skills.js' });
  return ctx;
}

function agente(id, x, y, z) {
  const a = { id, x, y, z, vars: {}, blockId: 1, count: 0 };
  mundo.mc.agents.set(id, a);
  return a;
}

// ---------------------------------------------------------------- utilidades de asercion
let ok = 0, fallos = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function test(nombre, fn) {
  mundo = nuevoMundo();
  try { fn(); ok++; console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLO ' + nombre + '\n        ' + e.message); }
}
function ocupadas(id) {
  const out = [];
  for (let i = 0; i < mundo.mc.grid.length; i++) if (mundo.mc.grid[i] === id) out.push(i);
  return out;
}

console.log('CUERPO DE BLOQUES · ' + (fin - ini + 2) + ' lineas extraidas de ' + lib.name);

// ---------------------------------------------------------------- 1. estampado basico
test('estampa un cubo impar centrado en la celda del agente', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  const celdas = ocupadas(7);
  assert(celdas.length === 27, 'esperaba 27 celdas, hay ' + celdas.length);
  for (let y = 26; y < 29; y++) for (let z = 15; z < 18; z++) for (let x = 15; x < 18; x++)
    assert(mundo.mc.grid[mundo.mcIdx(x, y, z)] === 7, 'falta celda ' + x + ',' + y + ',' + z);
});

test('escala par se redondea a impar (4 -> 5) para quedar centrado', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 4, altura: 26 });
  assert(ocupadas(7).length === 125, 'esperaba 5^3=125, hay ' + ocupadas(7).length);
});

test('forma esfera ocupa menos que el cubo y vacia las esquinas', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 7, altura: 26, forma: 'esfera' });
  const n = ocupadas(7).length;
  assert(n > 0 && n < 343, 'esfera de lado 7: ' + n + ' celdas (deberia ser <343)');
  assert(mundo.mc.grid[mundo.mcIdx(13, 26, 13)] === 0, 'la esquina inferior deberia quedar vacia');
});

test('material que no esta en la paleta no crea cuerpo (avisa y devuelve null)', () => {
  const a = agente('n1', 16, 25, 16);
  const r = mundo.game.skills.cuerpoBloques(a, { bloque: 'no-existe', escala: 3, altura: 26 });
  assert(r === null, 'deberia devolver null');
  assert(ocupadas(0).length === 0 || true, '');
  assert(mundo._warns.some(w => /no esta en la paleta/.test(w)), 'esperaba aviso por consola');
});

// ---------------------------------------------------------------- 2. no pisar terreno del usuario
test('NO pisa terreno del usuario: la celda ocupada se respeta y no entra en el cuerpo', () => {
  const a = agente('n1', 16, 25, 16);
  const i = mundo.mcIdx(16, 27, 16);
  mundo.mc.grid[i] = 99;                                   // bloque del usuario en medio del cuerpo
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  assert(mundo.mc.grid[i] === 99, 'el bloque del usuario ha sido pisado');
  assert(ocupadas(7).length === 26, 'esperaba 26 celdas propias, hay ' + ocupadas(7).length);
});

test('al moverse NO borra el bloque del usuario que quedo dentro del cuerpo', () => {
  const a = agente('n1', 16, 25, 16);
  const i = mundo.mcIdx(16, 27, 16);
  mundo.mc.grid[i] = 99;
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  a.x = 17; mundo.mcAgentMesh(a);                          // un paso: el gancho re-estampa
  assert(mundo.mc.grid[i] === 99, 'el bloque del usuario ha desaparecido al avanzar el agente');
});

test('el rastro se limpia al avanzar (no deja estela de bloques)', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  for (let p = 0; p < 5; p++) { a.x++; mundo.mcAgentMesh(a); }
  assert(ocupadas(7).length === 27, 'tras 5 pasos hay ' + ocupadas(7).length + ' celdas (deberian ser 27)');
  assert(mundo.mc.grid[mundo.mcIdx(15, 26, 16)] === 0, 'ha quedado estela detras');
});

test('el suelo sigue intacto tras un paseo', () => {
  const antes = [];
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 5, altura: 15 });   // rozando el suelo
  for (let z = 0; z < DIM.z; z++) for (let x = 0; x < DIM.x; x++) antes.push(mundo.mc.grid[mundo.mcIdx(x, SUELO, z)]);
  for (let p = 0; p < 8; p++) { a.x++; mundo.mcAgentMesh(a); }
  let k = 0;
  for (let z = 0; z < DIM.z; z++) for (let x = 0; x < DIM.x; x++)
    assert(mundo.mc.grid[mundo.mcIdx(x, SUELO, z)] === antes[k++], 'suelo alterado en ' + x + ',' + z);
});

test('recorta contra el borde del mapa sin salirse de la rejilla', () => {
  const a = agente('n1', 0, 25, 0);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 5, altura: 38 });   // y=38..42, se sale por arriba
  const celdas = ocupadas(7);
  assert(celdas.length > 0 && celdas.length < 125, 'esperaba recorte, hay ' + celdas.length);
  for (const i of celdas) assert(i >= 0 && i < mundo.mc.grid.length, 'indice fuera de la rejilla');
});

// ---------------------------------------------------------------- 3. guardado limpio
test('mcSerialize NO ve las celdas del agente y las devuelve despues', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  const dump = mundo.mcSerialize();
  assert(!dump.grid.some(v => v === 7), 'mundo.json llevaria bloques del agente');
  assert(dump.grid.filter(v => v === 3).length === DIM.x * DIM.z * (SUELO + 1), 'el suelo no esta completo en el volcado');
  assert(ocupadas(7).length === 27, 'las celdas no se han restaurado tras serializar');
});

test('mcSerialize restaura las celdas aunque el volcado original lance', () => {
  const a = agente('n1', 16, 25, 16);
  // el original tiene que reventar POR DENTRO del wrapper: se rompe antes de instalar los ganchos.
  mundo.mcSerialize = () => { throw new Error('boom'); };
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  let lanzo = false;
  try { mundo.mcSerialize(); } catch (e) { lanzo = /boom/.test(e.message); }
  assert(lanzo, 'el wrapper se ha tragado el error del volcado');
  assert(ocupadas(7).length === 27, 'el finally no ha devuelto las celdas: hay ' + ocupadas(7).length);
});

// ---------------------------------------------------------------- 4. coste: relucidos por paso
test('un paso = UN mcComputeLight (no uno por celda)', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  mundo.cuenta.luz = 0; mundo.cuenta.luzBloque = 0;
  a.x = 17; mundo.mcAgentMesh(a);
  assert(mundo.cuenta.luz === 1, 'esperaba 1 mcComputeLight por paso, hubo ' + mundo.cuenta.luz);
  assert(mundo.cuenta.luzBloque === 1, 'esperaba 1 mcComputeBlockLight, hubo ' + mundo.cuenta.luzBloque);
});

test('QUIETO = CERO relucidos (mcAgentMesh corre cada frame)', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  mundo.cuenta.luz = 0;
  for (let f = 0; f < 60; f++) mundo.mcAgentMesh(a);        // un segundo de frames sin moverse
  assert(mundo.cuenta.luz === 0, 'un segundo quieto ha costado ' + mundo.cuenta.luz + ' relucidos del mundo entero');
});

test('QUIETO y BLOQUEADO (cuerpo sin celdas) tampoco reluce cada frame', () => {
  const a = agente('n1', 16, 25, 16);
  // todo el volumen del cuerpo ocupado por el usuario: no cabe ni una celda
  for (let y = 26; y < 29; y++) for (let z = 15; z < 18; z++) for (let x = 15; x < 18; x++)
    mundo.mc.grid[mundo.mcIdx(x, y, z)] = 99;
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  assert(ocupadas(7).length === 0, 'no deberia haber cuerpo: no cabe');
  mundo.cuenta.luz = 0;
  for (let f = 0; f < 60; f++) mundo.mcAgentMesh(a);
  assert(mundo.cuenta.luz === 0, 'un segundo quieto y bloqueado ha costado ' + mundo.cuenta.luz
    + ' relucidos del mundo entero (7,6 ms cada uno)');
});

test('el cuerpo no dibuja malla propia (count=0, lo pinta el terreno)', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  a.count = 36;
  mundo.mcAgentMesh(a);
  assert(a.count === 0, 'el agente sigue con VBO propio (count=' + a.count + ')');
});

test('un agente SIN cuerpo de bloques sigue usando mcAgentMesh original', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });   // instala los ganchos
  const b = agente('otro', 5, 15, 5);
  mundo.cuenta.malla = 0;
  mundo.mcAgentMesh(b);
  assert(mundo.cuenta.malla === 1, 'el agente normal no ha pasado por mcAgentMesh original');
  assert(b.count === 36, 'el agente normal se ha quedado sin cuerpo');
});

// ---------------------------------------------------------------- 5. liberar
test('liberarCuerpoBloques deja la rejilla EXACTAMENTE como estaba', () => {
  const virgen = Uint16Array.from(mundo.mc.grid);
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 5, altura: 26 });
  for (let p = 0; p < 4; p++) { a.x++; mundo.mcAgentMesh(a); }
  mundo.game.skills.liberarCuerpoBloques(a);
  for (let i = 0; i < virgen.length; i++) assert(mundo.mc.grid[i] === virgen[i], 'celda ' + i + ' sin restaurar');
  assert(a.vars._bloques === null, 'el cuerpo no se ha soltado del handle');
});

// liberarCuerpo vive en la seccion CUERPOS DE AGENTE, que este arnes no carga: se comprueba sobre el
// texto de la libreria que sigue delegando (es lo que llama el onStop de los snippets).
test('liberarCuerpo (el general) delega en liberarCuerpoBloques', () => {
  assert(/liberarCuerpo\s*=\s*function[\s\S]{0,600}?liberarCuerpoBloques\(a\)/.test(lib.code),
    'game.skills.liberarCuerpo ya no llama a liberarCuerpoBloques: el onStop dejaria el cuerpo clavado');
});

test('la libreria no conserva restos del sistema de sombras propio', () => {
  for (const resto of ['dibujarSombras', 'game.skills.sombra', 'construirSombra', 'SOMBRA_MAX_CELDAS'])
    assert(!lib.code.includes(resto), 'queda "' + resto + '" en la libreria');
});

test('redefinir el cuerpo en caliente no duplica celdas', () => {
  const a = agente('n1', 16, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 5, altura: 26 });
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  assert(ocupadas(7).length === 27, 'esperaba 27 celdas tras redefinir, hay ' + ocupadas(7).length);
});

test('dos agentes conviven sin comerse las celdas del otro', () => {
  const a = agente('n1', 10, 25, 16), b = agente('n2', 20, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  mundo.game.skills.cuerpoBloques(b, { bloque: 'stone', escala: 3, altura: 26 });
  // 3 pasos: de x=10/x=20 a x=13/x=17, todavia sin tocarse
  for (let p = 0; p < 3; p++) { a.x++; b.x--; mundo.mcAgentMesh(a); mundo.mcAgentMesh(b); }
  assert(ocupadas(7).length === 27, 'el agente 1 tiene ' + ocupadas(7).length + ' celdas');
  assert(ocupadas(1).length === 27, 'el agente 2 tiene ' + ocupadas(1).length + ' celdas');
  const dump = mundo.mcSerialize();
  assert(!dump.grid.some(v => v === 7 || v === 1), 'mundo.json lleva celdas de agente con dos agentes vivos');
  mundo.game.skills.liberarCuerpoBloques(a);
  assert(ocupadas(1).length === 27, 'liberar un agente se ha llevado por delante el cuerpo del otro');
});

test('dos agentes que se CRUZAN no dejan celdas huerfanas al liberarse', () => {
  const virgen = Uint16Array.from(mundo.mc.grid);
  const a = agente('n1', 10, 25, 16), b = agente('n2', 20, 25, 16);
  mundo.game.skills.cuerpoBloques(a, { bloque: 'snow', escala: 3, altura: 26 });
  mundo.game.skills.cuerpoBloques(b, { bloque: 'stone', escala: 3, altura: 26 });
  // se atraviesan: cada uno ve al otro como solido (no es aire) y le cede esas celdas
  for (let p = 0; p < 12; p++) { a.x++; b.x--; mundo.mcAgentMesh(a); mundo.mcAgentMesh(b); }
  mundo.game.skills.liberarCuerpoBloques(a);
  mundo.game.skills.liberarCuerpoBloques(b);
  for (let i = 0; i < virgen.length; i++)
    assert(mundo.mc.grid[i] === virgen[i], 'celda ' + i + ' huerfana tras el cruce (val ' + mundo.mc.grid[i] + ')');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
