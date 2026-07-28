// Comprueba la seccion «SOMBRA» de data/snippets/base-npc-skills.json contra un puerto LITERAL del
// motor de luz de app.js (mcComputeLight, 4437) y del muestreo por cara de mcMeshChunk (4395).
// La seccion se extrae VERBATIM del snippet: se prueba lo que corre en el navegador, no una copia.
//
//   node test_sombra_real.js
const fs = require('fs'), vm = require('vm');

const lib = JSON.parse(fs.readFileSync('/root/voxel/data/snippets/base-npc-skills.json', 'utf8'));
const lineas = lib.code.split('\n');
const ini = lineas.findIndex(l => l.includes('SOMBRA: la sombra DEL MUNDO'));
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

// Lo minimo de WebGL para que la pasada de dibujo corra de verdad: cada buffer se queda con sus
// datos y cada drawArrays con la uView que llevaba puesta. Asi el test mira la geometria REAL que
// se manda a la GPU, no una reimplementacion.
function nuevoGL(ctx) {
  let bound = null, uView = null;
  return {
    ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, STATIC_DRAW: 3, TRIANGLES: 4, FLOAT: 5,
    BLEND: 6, SRC_ALPHA: 7, ONE_MINUS_SRC_ALPHA: 8,
    createBuffer: () => ({ datos: null }),
    deleteBuffer(b) { ctx.borrados.push(b); },
    bindBuffer(t, b) { bound = b; },
    bufferData(t, d) { bound.datos = d; },
    useProgram() {}, uniform3f() {}, uniform1f() {}, uniform1i() {},
    uniformMatrix4fv(loc, tr, mtx) { if (loc === 'uView') uView = mtx; },
    enable(f) { if (f === 6) ctx.estado.blend = true; },
    disable(f) { if (f === 6) ctx.estado.blend = false; },
    blendFunc(s, d) { ctx.estado.blendFunc = s + ',' + d; },
    depthMask(v) { ctx.estado.depthMask = v; },
    vertexAttribPointer() {}, enableVertexAttribArray() {}, disableVertexAttribArray() {},
    drawArrays(modo, first, count) {
      ctx.draws.push({ count, datos: bound.datos, view: uView,
                       blend: ctx.estado.blend, depthMask: ctx.estado.depthMask });
    }
  };
}

function nuevoMundo(dim = { x: 96, y: 40, z: 96 }, GH = 14) {
  const NX = dim.x, NY = dim.y, NZ = dim.z, sxy = NX * NY, N = NX * NY * NZ;
  const grid = new Uint16Array(N);
  for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) for (let y = 0; y <= GH; y++) grid[x + y * NX + z * sxy] = 1;

  const ctx = {
    GH, dim, N, sxy, malladas: [], luces: 0, tiempo: 1000, draws: [], borrados: [], estado: {},
    console: { log() {}, warn(...a) { ctx._warns.push(a.join(' ')); }, error(...a) { ctx._errors.push(a.join(' ')); } },
    _warns: [], _errors: [],
    performance: { now: () => ctx.tiempo },
    MC_MAXLIGHT, MC_CHUNK,
    MC_SKY: [0.5, 0.7, 1.0],
    // solo la cara +Y: es la unica que usa la estampa (app.js:3778)
    MC_FACES: [{ dir: [0, 1, 0], tex: 0, s: 1.12, corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] }],
    mat4: {
      ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
      translate(x, y, z) { const m = ctx.mat4.ident(); m[12] = x; m[13] = y; m[14] = z; return m; },
      mul(a, b) { return b; }   // la vista del test es la identidad: uView = la traslacion
    },
    mcProjMatrix: () => ({ m: null, far: 100 }),
    mcViewMatrix: () => ctx.mat4.ident(),
    mcAttribs() {}, mcStructAttrib() {},
    mc: { grid, dim, light: null, blockLight: null, gl: null, agents: new Map(), interiorDark: 0.55,
          palette: [null, {}], blockKey: [null, 'roca'],
          structProg: {}, structLoc: { uView: 'uView', uProj: 'uProj', uSky: 'uSky', uFogNear: 'n', uFogFar: 'f',
                                       aPos: 0, aColor: 1, aShade: 2, aEmit: 3, aAlpha: 4 } },
    mcIdx: (x, y, z) => x + y * NX + z * sxy,
    mcInside: (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ,
    mcSolid(x, y, z) { if (y < 0) return true; return ctx.mcInside(x, y, z) ? ctx.mc.grid[ctx.mcIdx(x, y, z)] !== 0 : false; },
    mcGetVoxel(x, y, z) {
      x = Math.round(x); y = Math.round(y); z = Math.round(z);
      if (!ctx.mcInside(x, y, z)) return 0;
      return ctx.mc.grid[ctx.mcIdx(x, y, z)] || 0;
    },
    mcSerialize() {                                          // copia de app.js:5709
      const vox = {}, g = ctx.mc.grid;
      for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
        const id = g[ctx.mcIdx(x, y, z)]; if (!id) continue;
        vox[x + ',' + y + ',' + z] = 'tex:' + ctx.mc.blockKey[id];
      }
      return { format: 'voxelworld-1', dim, voxels: vox };
    },
    mcSurfaceY(x, z) {                                       // copia de app.js:6386
      if (!ctx.mcInside(x, 0, z)) return -1;
      for (let y = dim.y - 1; y >= 0; y--) if (ctx.mc.grid[ctx.mcIdx(x, y, z)]) return y;
      return -1;
    },
    mcSurfaceNear(x, z, y0, climb, drop) {                   // copia de app.js:6394
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
    mcComputeLight() {                                       // copia de app.js:4437
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
          if (i % NX > 0)      { const j = i - 1;   if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (i % NX < NX - 1) { const j = i + 1;   if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / NX) | 0) % NY > 0)      { const j = i - NX;  if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / NX) | 0) % NY < NY - 1) { const j = i + NX;  if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / sxy) | 0) > 0)      { const j = i - sxy; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / sxy) | 0) < NZ - 1) { const j = i + sxy; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
        }
      }
    },
    game: { skills: {}, defineAgent: cfg => ({ id: cfg.id, vars: {}, x: cfg.x | 0, y: 14, z: cfg.z | 0, state: 'running' }) }
  };
  ctx.mc.gl = nuevoGL(ctx);
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
function frame(c) {
  c.malladas.length = 0; c.draws.length = 0;
  const n = c.luces; c.mcRender(); return c.luces - n;     // devuelve cuantas veces recalculo la luz
}

// La estampa, leida de la VBO que se ha mandado a la GPU: "x,z" (celda del mundo) -> % de
// oscurecimiento. Es el equivalente exacto de lo que mcMeshChunk habria pintado con el oclusor
// puesto: 100*(1 - interiorDark^(dlv/MAX)).
function sombraDe(c, a) {
  const e = a.vars && a.vars._estampa, out = new Map();
  if (!e || !e.count || !e.vbo.datos) return out;
  const v = e.vbo.datos;
  for (let q = 0; q < e.count / 6; q++) {
    const b = q * 6 * 9;
    out.set((v[b] + e.ax) + ',' + (v[b + 2] + e.az), { y: v[b + 1], pct: +(100 * v[b + 8]).toFixed(1) });
  }
  return out;
}
function oscuridad(c, a, x, z) {
  const s = sombraDe(c, a).get(x + ',' + z);
  return s ? s.pct : 0;
}
// Donde cae de verdad el primer quad en el mundo = vertice local + la traslacion de su uView.
function bordeDibujado(c) {
  const d = c.draws[c.draws.length - 1];
  if (!d) return null;
  let minX = Infinity, minZ = Infinity;
  for (let q = 0; q < d.count / 6; q++) { const b = q * 6 * 9; minX = Math.min(minX, d.datos[b]); minZ = Math.min(minZ, d.datos[b + 2]); }
  return { x: minX + d.view[12], z: minZ + d.view[14], quads: d.count / 6 };
}
const ID_SOMBRA = 65535;

console.log('SOMBRA · ' + (seccion.split('\n').length) + ' lineas extraidas de ' + lib.name + '\n');

// ---------------------------------------------------------------- la sombra existe y es la del mundo
// Dato incomodo pero real, y hay que saberlo: un agente que anda POR EL SUELO no ensena sombra. El
// skylight solo oscurece la celda que el propio cuerpo ocupa —la de debajo, que su cubo tapa entera—
// y a los vecinos no les quita nada, porque a ras de suelo la luz les entra directa del cielo.
test('agente a ras de suelo: la sombra cae bajo su propio cuerpo y no se ve nada alrededor', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(oscuridad(m, a, 48, 48) === 45, 'la celda tapada por el cuerpo queda negra (45%), no ' + oscuridad(m, a, 48, 48));
  assert(oscuridad(m, a, 49, 48) === 0 && oscuridad(m, a, 47, 48) === 0, 'a los vecinos no les quita luz');
  assert(sombraDe(m, a).size === 1, 'esperaba 1 cara, hay ' + sombraDe(m, a).size);
});

test('agente que VUELA: ahi si hay sombra visible, con degradado', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(oscuridad(m, a, 48, 48) === 7.7, 'lado 3 oscurece 7.7% en el centro, no ' + oscuridad(m, a, 48, 48));
  assert(oscuridad(m, a, 49, 48) === 3.9, 'y 3.9% en el borde de la huella, no ' + oscuridad(m, a, 49, 48));
  assert(oscuridad(m, a, 50, 48) === 0, 'fuera de la huella ya no llega: ' + oscuridad(m, a, 50, 48) + '%');
});

test('la sombra la calcula mcComputeLight, no la libreria (los mismos niveles que un bloque real)', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;                                  // cuerpo apoyado en y=26, como hace el gancho de vuelo
  frame(m);
  const estampa = sombraDe(m, a);
  assert(oscuridad(m, a, 48, 48) === 18.1, 'lado 9 oscurece 18.1%, no ' + oscuridad(m, a, 48, 48));

  // el mismo hueco tapado con terreno de VERDAD: mcComputeLight tiene que dar lo mismo, celda a celda
  const antes = Array.from(m.mc.light);
  for (let x = 44; x <= 52; x++) for (let z = 44; z <= 52; z++) m.mc.grid[m.mcIdx(x, 26, z)] = 1;
  m.mcComputeLight();
  const D = m.mc.interiorDark, esperado = new Map();
  for (let z = 0; z < m.dim.z; z++) for (let x = 0; x < m.dim.x; x++) {
    const i = m.mcIdx(x, m.GH + 1, z), d = antes[i] - m.mc.light[i];
    if (d > 0) esperado.set(x + ',' + z, +(100 * (1 - Math.pow(D, d / MC_MAXLIGHT))).toFixed(1));
  }
  assert(esperado.size > 0, 'el bloque real no ha oscurecido nada: el test no prueba nada');
  assert(esperado.size === estampa.size, 'la estampa tiene ' + estampa.size + ' caras y el bloque real oscurece ' + esperado.size);
  let dif = 0;
  esperado.forEach((pct, k) => { const s = estampa.get(k); if (!s || s.pct !== pct) dif++; });
  assert(dif === 0, dif + ' celdas donde la estampa no coincide con el bloque real');
});

test('solo se mide la LOSA inferior: da la misma sombra que meter el volumen entero', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  const losa = sombraDe(m, a);
  const antes = Array.from(m.mc.light);
  for (let x = 44; x <= 52; x++) for (let z = 44; z <= 52; z++) for (let y = 26; y <= 34; y++) m.mc.grid[m.mcIdx(x, y, z)] = 1;
  m.mcComputeLight();
  let dif = 0;
  for (let z = 0; z < m.dim.z; z++) for (let x = 0; x < m.dim.x; x++) {
    const i = m.mcIdx(x, m.GH + 1, z), d = antes[i] - m.mc.light[i];
    const s = losa.get(x + ',' + z), pct = s ? s.pct : 0;
    if (+(100 * (1 - Math.pow(m.mc.interiorDark, d / MC_MAXLIGHT))).toFixed(1) !== pct) dif++;
  }
  assert(dif === 0, dif + ' celdas de diferencia entre la losa y el volumen de 9x9x9');
});

test('un cuerpo de ESTRUCTURA usa la extension real de su malla, no el cubo de la escala', () => {
  const a = agente(m, 'nube', 48, 25, 48,
    { tipo: 'estructura', escala: 3, altura: 26, malla: { ext: { x: 12, y: 4, z: 6 } } });
  a.renderY = 25;
  frame(m);
  const e = a.vars._estampa;
  assert(e.ax === 43 && e.az === 46, 'la huella (43.., 46..) tiene que centrarse en el cuerpo, no en la escala: ' + e.ax + ',' + e.az);
  assert(e.w === 12 && e.d === 6, 'el ancho dibujado sale de ext, no de escala: ' + e.w + 'x' + e.d);
  const s = sombraDe(m, a);
  assert(s.get('43,48') && s.get('54,48'), 'la huella va de 43 a 54 (el cuerpo va de 42.5 a 54.5)');
});

// ---------------------------------------------------------------- no deja rastro en el mundo
test('el mundo queda INTACTO: ni un bloque ni un nivel de luz cambiados', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  const grid0 = Uint16Array.from(m.mc.grid), luz0 = Uint8Array.from(m.mc.light);
  frame(m);
  assert(sombraDe(m, a).size > 0, 'no ha proyectado nada: el test no prueba nada');
  let dg = 0, dl = 0;
  for (let i = 0; i < m.N; i++) { if (m.mc.grid[i] !== grid0[i]) dg++; if (m.mc.light[i] !== luz0[i]) dl++; }
  assert(dg === 0, dg + ' celdas de la rejilla han quedado tocadas (oclusores huerfanos)');
  assert(dl === 0, dl + ' niveles de luz han quedado tocados: alguien tendria que re-mallar');
});

test('nunca se re-malla un chunk: la luz del mundo no cambia, no hay nada que rehacer', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  for (let i = 0; i < 10; i++) { a.x = a.renderX = 40 + i; m.tiempo += 1000; frame(m); }
  assert(m.malladas.length === 0, 'ha re-mallado ' + m.malladas.length + ' chunks');
});

test('el oclusor no lo ve nadie: mcSolid / mcGetVoxel / mcSurfaceY / mcSurfaceNear / mcSerialize', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(m.mcSolid(48, 26, 48) === false, 'mcSolid da por bloque la celda del cuerpo => agujero en el suelo');
  assert(m.mcGetVoxel(48, 26, 48) === 0, 'mcGetVoxel ve un bloque donde solo hay una nube');
  assert(m.mcSurfaceY(48, 48) === m.GH, 'mcSurfaceY dice que el suelo esta en ' + m.mcSurfaceY(48, 48));
  assert(m.mcSurfaceNear(48, 48, m.GH, 1, 3) === m.GH, 'mcSurfaceNear pierde el suelo pisable');
  const doc = m.mcSerialize();
  assert(JSON.stringify(doc).indexOf('undefined') < 0, 'el mundo guardado lleva "tex:undefined"');
});

test('la libreria no envuelve nada del framework salvo mcRender y game.defineAgent', () => {
  const c = nuevoMundo();
  for (const f of ['mcSolid', 'mcGetVoxel', 'mcSerialize', 'mcSurfaceY', 'mcSurfaceNear', 'mcComputeLight'])
    assert(!('' + c[f]).includes('sinOclusores'), f + ' sigue envuelta: ya no hace falta esconder nada');
  assert(('' + c.mcRender).includes('actualizarSombras'), 'mcRender tiene que llevar el latido');
});

test('un oclusor NUNCA pisa un bloque del usuario', () => {
  m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] = 1;              // el usuario tiene algo puesto justo ahi
  const a = agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === 1, 'le ha machacado el bloque');
  assert(sombraDe(m, a).size === 0, 'el cuerpo esta dentro de terreno: ahi ya tapa el terreno, no hay sombra que anadir');
});

// ---------------------------------------------------------------- lo que pidio el dueno: que sea SUAVE
test('moverse dentro de la misma celda NO recalcula nada, pero la sombra SI se desplaza', () => {
  const a = agente(m, 'nube', 10, 25, 10, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  m.tiempo += 1000; frame(m);
  const p0 = bordeDibujado(m), vbo0 = a.vars._estampa.vbo.datos;
  assert(p0 && p0.quads > 0, 'no ha dibujado la sombra');

  a.renderX = 10.37; a.renderZ = 10.62; m.tiempo += 16;
  assert(frame(m) === 0, 'ha recalculado la luz por moverse un tercio de celda');
  assert(a.vars._estampa.vbo.datos === vbo0, 'ha rehecho la VBO sin cambiar de celda');
  const p1 = bordeDibujado(m);
  assert(Math.abs((p1.x - p0.x) - 0.37) < 1e-4, 'la sombra se ha movido ' + (p1.x - p0.x) + ' en x, no 0.37');
  assert(Math.abs((p1.z - p0.z) - 0.62) < 1e-4, 'la sombra se ha movido ' + (p1.z - p0.z) + ' en z, no 0.62');
});

test('SIN TIRONES: al cruzar de celda la sombra sigue exactamente donde esta el cuerpo', () => {
  const a = agente(m, 'nube', 10, 25, 10, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  const visto = [];
  for (const rx of [10.0, 10.25, 10.49, 10.5, 10.75, 11.0]) {
    a.x = Math.round(rx); a.renderX = rx;
    m.tiempo += 1000; frame(m);
    const p = bordeDibujado(m);
    visto.push({ rx, x: p.x });
    assert(Math.abs(p.x - (rx + 0.5 - 3 / 2)) < 1e-4,
      'con renderX=' + rx + ' el borde de la sombra cae en ' + p.x + ' y el del cuerpo en ' + (rx + 0.5 - 1.5));
  }
  for (let i = 1; i < visto.length; i++) {
    const salto = (visto[i].x - visto[i - 1].x) - (visto[i].rx - visto[i - 1].rx);
    assert(Math.abs(salto) < 1e-4, 'tiron de ' + salto + ' al pasar de renderX=' + visto[i - 1].rx + ' a ' + visto[i].rx);
  }
});

test('la estampa se dibuja mezclada (negro con alpha) y sin escribir en el z-buffer', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  const d = m.draws[m.draws.length - 1];
  assert(d, 'no ha llegado ni un drawArrays');
  assert(d.blend === true && d.depthMask === false, 'tiene que ir con BLEND y depthMask apagado');
  assert(m.estado.blendFunc === '7,8', 'la mezcla tiene que ser SRC_ALPHA / ONE_MINUS_SRC_ALPHA');
  assert(m.estado.depthMask === true && m.estado.blend === false, 'tiene que dejar el estado de GL como lo encontro');
  for (let q = 0; q < d.count / 6; q++) {
    const b = q * 6 * 9;
    assert(d.datos[b + 3] === 0 && d.datos[b + 4] === 0 && d.datos[b + 5] === 0, 'el color del quad tiene que ser negro');
    assert(d.datos[b + 6] === 1 && d.datos[b + 7] === 0, 'shade=1 y emit=0: la niebla le afecta igual que al terreno');
    assert(d.datos[b + 8] > 0 && d.datos[b + 8] < 1, 'alpha fuera de rango: ' + d.datos[b + 8]);
  }
});

test('el quad va justo encima de la cara del terreno, no dentro', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  const s = sombraDe(m, a).get('48,48');
  assert(s.y > m.GH + 1 && s.y < m.GH + 1.1, 'la altura del quad es ' + s.y + ', tenia que ser ' + (m.GH + 1) + ' + un pelo');
});

// ---------------------------------------------------------------- cadencia y ciclo de vida
test('un agente parado no cuesta nada: cero recalculos, cero remallado', () => {
  agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  for (let i = 0; i < 30; i++) { m.tiempo += 16; assert(frame(m) === 0, 'ha recalculado la luz sin moverse nadie'); }
});

test('cambiar de celda rehace la estampa y la sombra se va con el agente', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  assert(oscuridad(m, a, 48, 48) === 45, 'la sombra inicial no esta donde el agente');
  a.x = a.renderX = 49; m.tiempo += 1000;
  assert(frame(m) === 1, 'no ha rehecho la estampa al cambiar de celda');
  assert(oscuridad(m, a, 48, 48) === 0 && oscuridad(m, a, 49, 48) === 45, 'la sombra no ha seguido al agente');
});

test('game.sombraMs frena el REHACER: moverse 5 veces seguidas cuesta una sola pasada de luz', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  let luces = 0;
  for (let i = 1; i <= 5; i++) { a.x = a.renderX = 48 + i; m.tiempo += 20; luces += frame(m); }
  assert(luces === 0, 'ha recalculado ' + luces + ' veces dentro de la ventana de ' + m.game.sombraMs + ' ms');
  m.tiempo += 1000;
  assert(frame(m) === 1, 'pasada la ventana tiene que ponerse al dia');
  assert(oscuridad(m, a, 53, 48) === 45, 'la estampa tiene que estar en la celda actual');
});

test('el freno NO congela la posicion: la sombra sigue al cuerpo aunque no se rehaga', () => {
  const a = agente(m, 'nube', 10, 25, 10, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  m.tiempo += 1000; frame(m);
  const p0 = bordeDibujado(m);
  a.x = 12; a.renderX = 12; m.tiempo += 20;                 // dos celdas, dentro de la ventana del freno
  assert(frame(m) === 0, 'no deberia haber recalculado la luz');
  assert(Math.abs(bordeDibujado(m).x - (p0.x + 2)) < 1e-4, 'la sombra se ha quedado atras');
});

test('un agente parado (stopped) pierde la sombra', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  a.state = 'stopped'; m.tiempo += 1000; frame(m);
  assert(!a.vars._estampa, 'la estampa sigue viva');
  assert(m.borrados.length === 1, 'no ha soltado la VBO: ' + m.borrados.length);
  assert(m.draws.length === 0, 'sigue dibujando la sombra de un agente parado');
});

test('sacar un agente de mc.agents le quita la sombra', () => {
  agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  m.mc.agents.delete('bot'); m.tiempo += 1000; frame(m);
  assert(m.draws.length === 0, 'la sombra de un agente que ya no existe sigue dibujandose');
  assert(m.borrados.length === 1, 'no ha soltado la VBO');
});

test('game.sombras = false las apaga todas (y volver a true las trae)', () => {
  const a1 = agente(m, 'a1', 40, m.GH, 40), a2 = agente(m, 'a2', 60, m.GH, 60);
  m.tiempo += 1000; frame(m);
  assert(m.draws.length === 2, 'los dos agentes dan sombra por defecto, hay ' + m.draws.length);
  m.game.sombras = false; m.tiempo += 1000; frame(m);
  assert(m.draws.length === 0, 'no se han apagado');
  assert(!a1.vars._estampa && !a2.vars._estampa, 'las estampas siguen ahi');
  m.game.sombras = true; m.tiempo += 1000; frame(m);
  assert(m.draws.length === 2, 'no han vuelto');
});

test('game.skills.sombra(a,false) apaga la de UN agente y deja la del otro', () => {
  const a1 = agente(m, 'a1', 40, m.GH, 40), a2 = agente(m, 'a2', 60, m.GH, 60);
  m.tiempo += 1000; frame(m);
  m.game.skills.sombra(a1, false);
  m.tiempo += 1000; frame(m);
  assert(m.draws.length === 1, 'esperaba 1 sombra, hay ' + m.draws.length);
  assert(!a1.vars._estampa && a2.vars._estampa, 'ha apagado la que no era');
  assert(oscuridad(m, a2, 60, 60) === 45, 'a2 ha perdido la suya');
  m.game.skills.sombra(a1, true); m.tiempo += 1000; frame(m);
  assert(m.draws.length === 2, 'no se le puede volver a encender');
});

test('game.defineAgent({sombra:false}) nace sin sombra', () => {
  const a = m.game.defineAgent({ id: 'mudo', x: 48, z: 48, sombra: false });
  a.renderX = a.x; a.renderY = a.y; a.renderZ = a.z;
  m.mc.agents.set(a.id, a);
  m.tiempo += 1000; frame(m);
  assert(!a.vars._estampa && m.draws.length === 0, 'ha nacido con sombra pese a sombra:false');
});

test('con interiorDark=1 (sin penumbra) no hace absolutamente nada', () => {
  m.mc.interiorDark = 1;
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000;
  assert(frame(m) === 0, 'ha recalculado la luz con las sombras desactivadas en el motor');
  assert(!a.vars._estampa && m.draws.length === 0, 'ha proyectado sombra sin penumbra que copiar');
});

test('un fallo en la sombra NO tumba el Mundo: se apaga sola y el frame se pinta', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  Object.defineProperty(a, 'renderX', { get() { throw new Error('boom'); } });
  m.frames = 0; m.tiempo += 1000;
  m.mcRender();
  assert((m.frames || 0) === 1, 'el frame no se ha llegado a pintar');
  assert(m.game.sombras === false, 'no se ha apagado sola tras el error');
  assert(m._errors.join(' ').indexOf('[skills.sombra]') >= 0, 'no ha dejado rastro en la consola');
});

// ---------------------------------------------------------------- la regla de fondo
test('la unica verdad de sombras sigue siendo el skylight: ni shadow maps, ni FBOs, ni luz inventada', () => {
  const t = lib.code.toLowerCase();
  for (const p of ['shadowmap', 'shadow map', 'framebuffer', 'createframebuffer', 'renderbuffer'])
    assert(t.indexOf(p) < 0, 'la libreria menciona "' + p + '": la unica sombra es el skylight');
  assert(lib.code.indexOf('mcComputeLight()') > 0, 'el oscurecimiento tiene que salir de mcComputeLight');
  assert(/var ID_SOMBRA = 65535;/.test(lib.code), 'ID_SOMBRA tiene que seguir siendo un id sin entrada en mc.palette');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
