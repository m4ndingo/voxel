// Comprueba la seccion «SOMBRA» de data/snippets/base-npc-skills.json contra un puerto LITERAL del
// motor de luz de app.js (mcComputeLight, 4437) y del muestreo por cara de mcMeshChunk (4395).
// La seccion se extrae VERBATIM del snippet: se prueba lo que corre en el navegador, no una copia.
//
//   node test_sombra_real.js
const fs = require('fs'), vm = require('vm');

const lib = JSON.parse(fs.readFileSync('/root/voxel/data/snippets/base-npc-skills.json', 'utf8'));
const lineas = lib.code.split('\n');
const ini = lineas.findIndex(l => l.includes('SOMBRA: el agente proyecta la sombra DEL MUNDO'));
if (ini < 0) throw new Error('no encuentro la seccion SOMBRA en la libreria');
const fin = lineas.findIndex((l, i) => i > ini && l.trim() === '})();');
const seccion = lineas.slice(ini - 1, fin).join('\n');

let ok = 0, fallos = 0, m = null;
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function test(nombre, fn) {
  m = nuevoMundo();
  try { fn(); ok++; console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLO ' + nombre + '\n         ' + e.message); }
}

// ---------------------------------------------------------------- el motor, portado tal cual
const MC_MAXLIGHT = 15, MC_CHUNK = 16;

function nuevoMundo(dim = { x: 96, y: 40, z: 96 }, GH = 14) {
  const NX = dim.x, NY = dim.y, NZ = dim.z, sxy = NX * NY, N = NX * NY * NZ;
  const grid = new Uint16Array(N);
  for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) for (let y = 0; y <= GH; y++) grid[x + y * NX + z * sxy] = 1;

  const ctx = {
    GH, dim, N, sxy, malladas: [], luces: 0, tiempo: 1000,
    console: { log() {}, warn(...a) { ctx._warns.push(a.join(' ')); }, error(...a) { ctx._errors.push(a.join(' ')); } },
    _warns: [], _errors: [],
    performance: { now: () => ctx.tiempo },
    MC_MAXLIGHT, MC_CHUNK,
    mc: { grid, dim, light: null, gl: {}, agents: new Map(), interiorDark: 0.55, palette: [null, {}], blockKey: [null, 'roca'] },
    mcIdx: (x, y, z) => x + y * NX + z * sxy,
    mcInside: (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ,
    mcSolid(x, y, z) { if (y < 0) return true; return ctx.mcInside(x, y, z) ? ctx.mc.grid[ctx.mcIdx(x, y, z)] !== 0 : false; },
    mcGetVoxel(x, y, z) {
      x = Math.round(x); y = Math.round(y); z = Math.round(z);
      if (!ctx.mcInside(x, y, z)) return 0;
      return ctx.mc.grid[ctx.mcIdx(x, y, z)] || 0;
    },
    mcSerialize() {                                   // copia de app.js:5709
      const vox = {}, g = ctx.mc.grid;
      for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
        const id = g[ctx.mcIdx(x, y, z)]; if (!id) continue;
        vox[x + ',' + y + ',' + z] = 'tex:' + ctx.mc.blockKey[id];
      }
      return { format: 'voxelworld-1', dim, voxels: vox };
    },
    mcSurfaceY(x, z) {                                // copia de app.js:6386
      if (!ctx.mcInside(x, 0, z)) return -1;
      for (let y = dim.y - 1; y >= 0; y--) if (ctx.mc.grid[ctx.mcIdx(x, y, z)]) return y;
      return -1;
    },
    mcSurfaceNear(x, z, y0, climb, drop) {            // copia de app.js:6394
      if (!ctx.mcInside(x, 0, z)) return -1;
      const H = dim.y, maxUp = climb !== undefined ? climb : 1, maxDown = drop !== undefined ? drop : 3;
      for (let d = 0; d <= Math.max(maxUp, maxDown); d++) {
        const cand = [];
        if (d <= maxUp) cand.push(y0 + d);
        if (d > 0 && d <= maxDown) cand.push(y0 - d);
        for (const y of cand) {
          if (y < 0 || y >= H) continue;
          if (ctx.mc.grid[ctx.mcIdx(x, y, z)] && (y + 1 >= H || !ctx.mc.grid[ctx.mcIdx(x, y + 1, z)])) return y;
        }
      }
      return -1;
    },
    mcMeshChunk(cx, cz) { ctx.malladas.push(cx + ',' + cz); },
    mcRender() { ctx.frames = (ctx.frames || 0) + 1; },
    mcComputeLight() {                                // copia de app.js:4437
      ctx.luces++;
      const g = ctx.mc.grid;
      const L = (ctx.mc.light && ctx.mc.light.length === N) ? ctx.mc.light : (ctx.mc.light = new Uint8Array(N));
      if (ctx.mc.interiorDark >= 1) return;
      L.fill(0);
      const buckets = []; for (let i = 0; i <= MC_MAXLIGHT; i++) buckets.push([]);
      const top = buckets[MC_MAXLIGHT];
      const seed = i => { if (g[i] === 0 && L[i] !== MC_MAXLIGHT) { L[i] = MC_MAXLIGHT; top.push(i); } };
      for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++)
        for (let y = NY - 1; y >= 0; y--) { const i = x + y * NX + z * sxy; if (g[i] !== 0) break; seed(i); }
      for (let y = 0; y < NY; y++) {
        for (let z = 0; z < NZ; z++) { seed(y * NX + z * sxy); seed((NX - 1) + y * NX + z * sxy); }
        for (let x = 0; x < NX; x++) { seed(x + y * NX); seed(x + y * NX + (NZ - 1) * sxy); }
      }
      for (let lvl = MC_MAXLIGHT; lvl >= 1; lvl--) {
        const b = buckets[lvl], nl = lvl - 1;
        for (let bi = 0; bi < b.length; bi++) {
          const i = b[bi]; if (L[i] !== lvl) continue;
          const x = i % NX, y = ((i / NX) | 0) % NY, z = (i / sxy) | 0;
          if (x > 0)      { const j = i - 1;   if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (x < NX - 1) { const j = i + 1;   if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (y > 0)      { const j = i - NX;  if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (y < NY - 1) { const j = i + NX;  if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (z > 0)      { const j = i - sxy; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (z < NZ - 1) { const j = i + sxy; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
        }
      }
    },
    game: { skills: {}, defineAgent: cfg => ({ id: cfg.id, vars: {}, x: cfg.x | 0, y: 14, z: cfg.z | 0, state: 'running' }) }
  };
  ctx.window = ctx;
  ctx.mcComputeLight();
  vm.createContext(ctx);
  vm.runInContext('function cuerpoDe(a){ return a && a.vars ? a.vars._cuerpo : null; }', ctx);
  vm.runInContext('(function(){\n' + seccion + '\n})();', ctx, { filename: 'base-npc-skills.js' });
  return ctx;
}

// ---------------------------------------------------------------- utilidades del test
function agente(c, id, x, y, z, cuerpo) {
  const a = { id, x, y, z, renderX: x, renderY: y, renderZ: z, state: 'running', vars: {} };
  if (cuerpo) a.vars._cuerpo = cuerpo;
  c.mc.agents.set(id, a);
  return a;
}
function frame(c) { c.malladas.length = 0; const n = c.luces; c.mcRender(); return c.luces - n; }
// oscurecimiento (%) de la cara SUPERIOR del suelo en (x,z): muestrea la luz del aire de encima
function oscuridad(c, x, z) {
  const lv = c.mc.light[c.mcIdx(x, c.GH + 1, z)];
  return +(100 * (1 - Math.pow(c.mc.interiorDark, (MC_MAXLIGHT - lv) / MC_MAXLIGHT))).toFixed(1);
}
const ID_SOMBRA = 65535;
function oclusores(c) { let n = 0; for (let i = 0; i < c.N; i++) if (c.mc.grid[i] === ID_SOMBRA) n++; return n; }

console.log('SOMBRA · ' + (seccion.split('\n').length) + ' lineas extraidas de ' + lib.name + '\n');

// ---------------------------------------------------------------- la sombra existe y es la del mundo
test('un agente normal deja UN oclusor en la celda de su cuerpo', () => {
  agente(m, 'bot', 48, m.GH, 48);
  assert(oscuridad(m, 48, 48) === 0, 'el suelo empieza sin sombra');
  frame(m);
  assert(oclusores(m) === 1, 'un solo oclusor, no un volumen: ' + oclusores(m));
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === ID_SOMBRA, 'el oclusor va en ry+1, donde esta el cuerpo');
});

// Dato incomodo pero real, y hay que saberlo: un agente que anda POR EL SUELO no ensena sombra. El
// skylight solo oscurece la celda que el propio cuerpo ocupa —la de debajo, que su cubo tapa entera—
// y a los vecinos no les quita nada, porque a ras de suelo la luz les entra directa del cielo.
test('agente a ras de suelo: la sombra cae bajo su propio cuerpo y no se ve nada alrededor', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(oscuridad(m, 48, 48) === 45, 'la celda tapada por el cuerpo queda negra (45%), no ' + oscuridad(m, 48, 48));
  assert(oscuridad(m, 49, 48) === 0, 'la celda de al lado no se entera: ' + oscuridad(m, 49, 48) + '%');
  assert(oscuridad(m, 47, 48) === 0 && oscuridad(m, 48, 47) === 0, 'ningun vecino oscurece');
});

test('agente que VUELA: ahi si hay sombra visible, con degradado', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(oscuridad(m, 48, 48) === 7.7, 'lado 3 oscurece 7.7% en el centro, no ' + oscuridad(m, 48, 48));
  assert(oscuridad(m, 49, 48) === 3.9, 'y 3.9% en el borde de la huella, no ' + oscuridad(m, 49, 48));
  assert(oscuridad(m, 50, 48) === 0, 'fuera de la huella ya no llega: ' + oscuridad(m, 50, 48) + '%');
});

test('la sombra la calcula mcComputeLight, no la libreria (misma luz que poner un bloque a mano)', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;                                    // cuerpo apoyado en y=26, como hace el gancho de vuelo
  frame(m);
  const conAgente = Array.from(m.mc.light);
  // ahora el mismo hueco tapado con terreno de verdad
  m.mc.agents.clear(); frame(m);
  for (let x = 44; x <= 52; x++) for (let z = 44; z <= 52; z++) m.mc.grid[m.mcIdx(x, 26, z)] = 1;
  m.mcComputeLight();
  let dif = 0;
  for (let i = 0; i < m.N; i++) if (conAgente[i] !== m.mc.light[i]) dif++;
  assert(dif === 0, 'la luz del agente difiere de la de un bloque real en ' + dif + ' celdas');
  assert(oscuridad(m, 48, 48) === 18.1, 'lado 9 oscurece 18.1%, no ' + oscuridad(m, 48, 48));
});

test('solo se escribe la LOSA inferior: 9x9 celdas, no 9x9x9', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(oclusores(m) === 81, 'esperaba 81 celdas (una capa), hay ' + oclusores(m));
  assert(m.mc.grid[m.mcIdx(48, 27, 48)] === 0, 'la segunda capa no se toca');
});

test('la losa da la MISMA sombra en el suelo que el volumen entero', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  const conLosa = Array.from(m.mc.light);
  for (let x = 44; x <= 52; x++) for (let z = 44; z <= 52; z++) for (let y = 27; y <= 34; y++) m.mc.grid[m.mcIdx(x, y, z)] = 1;
  m.mcComputeLight();
  let dif = 0;
  for (let y = 0; y <= m.GH + 1; y++) for (let z = 0; z < m.dim.z; z++) for (let x = 0; x < m.dim.x; x++) {
    const i = m.mcIdx(x, y, z); if (conLosa[i] !== m.mc.light[i]) dif++;
  }
  assert(dif === 0, dif + ' celdas de luz distintas a nivel de suelo');
});

test('un cuerpo de ESTRUCTURA usa la extension real de su malla, no el cubo de la escala', () => {
  const a = agente(m, 'nube', 48, 25, 48,
    { tipo: 'estructura', escala: 3, altura: 26, malla: { ext: { x: 12, y: 4, z: 6 } } });
  a.renderY = 25;
  frame(m);
  assert(oclusores(m) === 12 * 6, 'esperaba 12x6=72 celdas, hay ' + oclusores(m));
  assert(m.mc.grid[m.mcIdx(43, 26, 48)] === ID_SOMBRA && m.mc.grid[m.mcIdx(54, 26, 48)] === ID_SOMBRA,
    'la huella (43..54) tiene que quedar centrada en el cuerpo, que va de 42.5 a 54.5');
  assert(m.mc.grid[m.mcIdx(42, 26, 48)] === 0 && m.mc.grid[m.mcIdx(55, 26, 48)] === 0,
    'la huella no puede salirse del cuerpo');
});

// ---------------------------------------------------------------- invisible, intangible, no se guarda
test('el oclusor NO es solido: ni choca ni pela la cara del terreno que tiene debajo', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(m.mcSolid(48, m.GH + 1, 48) === false, 'mcSolid lo daria por bloque => agujero en el suelo y colision fantasma');
  assert(m.mcSolid(48, m.GH, 48) === true, 'el terreno de verdad sigue siendo solido');
});

test('mcGetVoxel devuelve 0 en un oclusor (isMounted no lo toma por suelo del mundo)', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(m.mcGetVoxel(48, m.GH + 1, 48) === 0, 'un script veria un bloque invisible bajo sus pies');
});

test('mcSerialize no guarda los oclusores, y los deja donde estaban', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  const doc = m.mcSerialize();
  assert(!doc.voxels[48 + ',' + (m.GH + 1) + ',' + 48], 'el oclusor se ha guardado en el mundo');
  assert(JSON.stringify(doc).indexOf('undefined') < 0, 'se ha colado un "tex:undefined"');
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === ID_SOMBRA, 'tras serializar el oclusor tiene que volver');
});

test('un oclusor NUNCA pisa un bloque del usuario', () => {
  m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] = 1;          // el usuario tiene algo puesto justo ahi
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === 1, 'le ha machacado el bloque');
  m.mc.agents.clear(); frame(m);
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === 1, 'al retirar la sombra le ha borrado el bloque');
});

test('mcSurfaceY no confunde la sombra de una nube con el suelo', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(m.mcSurfaceY(48, 48) === m.GH, 'dice que el suelo esta en ' + m.mcSurfaceY(48, 48) + ' en vez de ' + m.GH);
  assert(m.mc.grid[m.mcIdx(48, 26, 48)] === ID_SOMBRA, 'y el oclusor tiene que seguir puesto despues');
});

test('mcSurfaceNear: la sombra de un agente no le quita el suelo pisable al de al lado', () => {
  agente(m, 'a1', 48, m.GH, 48);
  frame(m);
  assert(m.mcSurfaceNear(48, 48, m.GH, 1, 3) === m.GH,
    'la celda deja de ser pisable por un bloque invisible: ' + m.mcSurfaceNear(48, 48, m.GH, 1, 3));
});

// ---------------------------------------------------------------- movimiento, freno y limpieza
test('al cambiar de celda retira el oclusor viejo y pone el nuevo, sin dejar rastro', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  a.x = a.renderX = 49; m.tiempo += 1000;
  frame(m);
  assert(oclusores(m) === 1, 'ha dejado ' + oclusores(m) + ' oclusores');
  assert(m.mc.grid[m.mcIdx(49, m.GH + 1, 48)] === ID_SOMBRA, 'el nuevo no esta donde toca');
  assert(oscuridad(m, 48, 48) === 0, 'la sombra vieja no se ha ido');
  assert(oscuridad(m, 49, 48) === 45, 'la sombra no ha seguido al agente');
});

test('quieto no cuesta nada: ni recalculo de luz ni re-mallado', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  for (let i = 0; i < 30; i++) { m.tiempo += 16; assert(frame(m) === 0, 'ha recalculado la luz sin moverse nadie'); }
  assert(m.malladas.length === 0, 'ha re-mallado sin motivo');
});

test('game.sombraMs frena el recalculo: moverse 5 veces seguidas cuesta una sola pasada de luz', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  let luces = 0;
  for (let i = 1; i <= 5; i++) { a.x = a.renderX = 48 + i; m.tiempo += 20; luces += frame(m); }
  assert(luces === 0, 'ha recalculado ' + luces + ' veces dentro de la ventana de 250 ms');
  m.tiempo += 300;
  assert(frame(m) === 1, 'pasada la ventana tiene que ponerse al dia');
  assert(m.mc.grid[m.mcIdx(53, m.GH + 1, 48)] === ID_SOMBRA, 'el oclusor tiene que estar en la celda actual');
});

test('re-malla solo los chunks cuya luz cambio, no el mundo entero', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  const total = Math.ceil(m.dim.x / MC_CHUNK) * Math.ceil(m.dim.z / MC_CHUNK);
  assert(m.malladas.length > 0, 'no ha re-mallado nada: la sombra no llegaria a verse');
  assert(m.malladas.length < total, 'ha re-mallado los ' + total + ' chunks del mundo');
});

test('un agente parado (stopped) deja de dar sombra', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  a.state = 'stopped'; m.tiempo += 1000;
  frame(m);
  assert(oclusores(m) === 0, 'sigue habiendo oclusor de un agente parado');
  assert(oscuridad(m, 48, 48) === 0, 'la sombra sigue pintada');
});

test('un agente retirado de mc.agents se lleva su sombra', () => {
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  m.mc.agents.delete('bot'); m.tiempo += 1000;
  frame(m);
  assert(oclusores(m) === 0, 'ha quedado un oclusor huerfano en la rejilla');
});

// ---------------------------------------------------------------- interruptores
test('game.sombras = false las apaga todas (y volver a true las trae)', () => {
  agente(m, 'a1', 40, m.GH, 40); agente(m, 'a2', 60, m.GH, 60);
  frame(m);
  assert(oclusores(m) === 2, 'los dos agentes dan sombra por defecto');
  m.game.sombras = false; m.tiempo += 1000; frame(m);
  assert(oclusores(m) === 0, 'no se han apagado');
  m.game.sombras = true; m.tiempo += 1000; frame(m);
  assert(oclusores(m) === 2, 'no han vuelto');
});

test('game.skills.sombra(a,false) apaga la de UN agente y deja la del otro', () => {
  const a1 = agente(m, 'a1', 40, m.GH, 40); agente(m, 'a2', 60, m.GH, 60);
  frame(m);
  m.game.skills.sombra(a1, false);
  m.tiempo += 1000; frame(m);
  assert(oclusores(m) === 1, 'esperaba 1 oclusor, hay ' + oclusores(m));
  assert(oscuridad(m, 40, 40) === 0, 'a1 sigue dando sombra');
  assert(oscuridad(m, 60, 60) === 45, 'a2 ha perdido la suya');
  m.game.skills.sombra(a1, true); m.tiempo += 1000; frame(m);
  assert(oclusores(m) === 2, 'no se le puede volver a encender');
});

test('game.defineAgent({sombra:false}) nace sin sombra', () => {
  const a = m.game.defineAgent({ id: 'mudo', x: 48, z: 48, sombra: false });
  a.renderX = a.x; a.renderY = a.y; a.renderZ = a.z;
  m.mc.agents.set(a.id, a);
  frame(m);
  assert(oclusores(m) === 0, 'ha puesto sombra a un agente que pidio no tenerla');
});

test('con interiorDark=1 (sin sombreado en el Mundo) no se toca la rejilla', () => {
  m.mc.interiorDark = 1;
  agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(oclusores(m) === 0, 'esta pagando oclusores y recalculos para nada');
});

test('un fallo dentro del latido apaga las sombras pero NO tumba el render del Mundo', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  Object.defineProperty(a, 'renderX', { get() { throw new Error('boom'); } });
  const antes = m.frames || 0;
  m.mcRender();
  assert((m.frames || 0) === antes + 1, 'el render del Mundo se ha quedado sin ejecutar');
  assert(m.game.sombras === false, 'tenia que apagarse solo tras el error');
  assert(m._errors.join(' ').indexOf('[skills.sombra]') >= 0, 'no ha dejado el error en consola');
});

// ---------------------------------------------------------------- higiene
test('la libreria no inventa sombras: ni calcomanias, ni shadow maps, ni FBOs', () => {
  const t = lib.code.toLowerCase();
  for (const p of ['calcomania', 'shadowmap', 'shadow map', 'framebuffer', 'createframebuffer', 'dibujarsombras'])
    assert(t.indexOf(p) < 0, 'la libreria menciona "' + p + '": la unica sombra es el skylight');
  assert(lib.code.indexOf('mcComputeLight()') > 0, 'la sombra tiene que salir de mcComputeLight');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
