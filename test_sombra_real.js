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
  catch (e) { fallos++; console.log('  FALLO ' + nombre + '\n       ' + e.message); }
}

// ---------------------------------------------------------------- el motor, portado tal cual
const MC_MAXLIGHT = 15, MC_CHUNK = 16;

// Lo minimo de WebGL para que la pasada de dibujo corra de verdad: cada buffer se queda con sus
// datos, cada atributo con el buffer que tenia enganchado y cada drawArrays con el estado de mezcla
// que llevaba puesto. Asi el test mira la geometria REAL que se manda a la GPU, no una intencion.
function nuevoGL(ctx) {
  let bound = null, uView = null;
  const attr = {};
  return {
    ARRAY_BUFFER: 1, DYNAMIC_DRAW: 2, STATIC_DRAW: 3, TRIANGLES: 4, FLOAT: 5,
    BLEND: 6, SRC_ALPHA: 7, ONE_MINUS_SRC_ALPHA: 8, ZERO: 9, ONE: 10,
    createBuffer() { return { datos: null }; },
    deleteBuffer(b) { ctx.borrados.push(b); },
    bindBuffer(t, b) { bound = b; },
    bufferData(t, d) { if (bound) bound.datos = d; },
    useProgram() {}, uniform1f() {}, uniform3f() {}, uniform1i() {},
    uniformMatrix4fv(loc, tr, mm) { if (loc === 'uView') uView = mm; },
    enable(f) { if (f === 6) ctx.estado.blend = true; },
    disable(f) { if (f === 6) ctx.estado.blend = false; },
    blendFunc(s, d) { ctx.estado.blendFunc = s + ',' + d; ctx.estado.blendAlpha = s + ',' + d; },
    blendFuncSeparate(s, d, sa, da) { ctx.estado.blendFunc = s + ',' + d; ctx.estado.blendAlpha = sa + ',' + da; },
    depthMask(v) { ctx.estado.depthMask = v; },
    vertexAttribPointer(loc, size, tipo, norm, stride, off) { attr[loc] = { buf: bound, size, stride, off }; },
    enableVertexAttribArray() {}, disableVertexAttribArray() {},
    drawArrays(modo, first, count) {
      ctx.draws.push({ count, view: uView,
        pos: attr[0], color: attr[1], shade: attr[2], emit: attr[3], alpha: attr[4],
        blend: ctx.estado.blend, depthMask: ctx.estado.depthMask,
        blendFunc: ctx.estado.blendFunc, blendAlpha: ctx.estado.blendAlpha });
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
      ident() { const mm = new Float32Array(16); mm[0] = mm[5] = mm[10] = mm[15] = 1; return mm; },
      translate(x, y, z) { const mm = ctx.mat4.ident(); mm[12] = x; mm[13] = y; mm[14] = z; return mm; },
      mul(a, b) { const mm = Float32Array.from(a); mm[12] += b[12]; mm[13] += b[13]; mm[14] += b[14]; return mm; }
    },
    mcProjMatrix: () => ({ m: ctx.mat4.ident(), far: 100 }),
    mcViewMatrix: () => ctx.mat4.ident(),
    mcAttribs() {}, mcStructAttrib() {},
    mc: {
      dim, grid, light: null, blockLight: null, interiorDark: 0.55,
      agents: new Map(), structures: [], blockKey: [null, 'roca'],
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
    mcSerialize() { // copia de app.js:5709
      const vox = {}, g = ctx.mc.grid;
      for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
        const id = g[ctx.mcIdx(x, y, z)]; if (!id) continue;
        vox[x + ',' + y + ',' + z] = 'tex:' + ctx.mc.blockKey[id];
      }
      return { format: 'voxelworld-1', dim, voxels: vox };
    },
    mcSurfaceY(x, z) { // copia de app.js:6386
      if (!ctx.mcInside(x, 0, z)) return -1;
      for (let y = dim.y - 1; y >= 0; y--) if (ctx.mc.grid[ctx.mcIdx(x, y, z)]) return y;
      return -1;
    },
    mcSurfaceNear(x, z, y0, climb, drop) { // copia de app.js:6394
      if (!ctx.mcInside(x, 0, z)) return -1;
      const H = dim.y, maxUp = climb || 1, maxDn = drop || 3, cand = [y0];
      for (let d = 1; d <= Math.max(maxUp, maxDn); d++) {
        if (d <= maxUp) cand.push(y0 + d);
        if (d <= maxDn) cand.push(y0 - d);
      }
      for (const y of cand) {
        if (y < 0 || y >= H) continue;
        if (ctx.mc.grid[ctx.mcIdx(x, y, z)] && (y + 1 >= H || !ctx.mc.grid[ctx.mcIdx(x, y + 1, z)])) return y;
      }
      return -1;
    },
    mcMeshChunk(cx, cz) { ctx.malladas.push(cx + ',' + cz); },
    mcRender() { ctx.frames = (ctx.frames || 0) + 1; },
    mcComputeLight() { // copia de app.js:4437
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
          if (i % NX > 0) { const j = i - 1; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (i % NX < NX - 1) { const j = i + 1; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / NX) | 0) % NY > 0) { const j = i - NX; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / NX) | 0) % NY < NY - 1) { const j = i + NX; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
          if (((i / sxy) | 0) > 0) { const j = i - sxy; if (g[j] === 0 && L[j] < nl) { L[j] = nl; buckets[nl].push(j); } }
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
  const antes = c.luces; c.mcRender(); return c.luces - antes;
}
// Lo que la GPU va a pintar de verdad: posiciones (VBO estatica, stride 8) + alphas (VBO por frame).
// pct = 100*(1 - interiorDark^(dlv/MAX)) = cuanta luz pierde esa cara.
function sombraDe(c, a) {
  const out = new Map();
  const e = a.vars && a.vars._estampa;
  if (!e || !e.count || !e.vbo.datos || !e.alfas) return out;
  const v = e.vbo.datos, al = e.alfas;
  for (let q = 0; q < e.count / 6; q++) {
    const b = q * 6 * 8, pct = +(100 * al[q * 6]).toFixed(1);
    if (!pct) continue; // columna con quad pero sin sombra que echar: no cuenta
    out.set(v[b] + ',' + v[b + 2], { y: v[b + 1], pct });
  }
  return out;
}
function oscuridad(c, a, x, z) {
  const s = sombraDe(c, a).get(x + ',' + z);
  return s ? s.pct : 0;
}
// Altura del quad de una columna (o null si esa columna no lleva sombra).
function alturaSombra(c, a, x, z) {
  const s = sombraDe(c, a).get(x + ',' + z);
  return s ? s.y : null;
}
const ID_SOMBRA = 65535;

console.log('SOMBRA · ' + (seccion.split('\n').length) + ' lineas extraidas de ' + lib.name + '\n');

// ---------------------------------------------------------------- la sombra existe y es la del mundo
// Dato incomodo pero real, y hay que saberlo: un agente que anda POR EL SUELO no ensena sombra. El
// skylight solo oscurece la celda que el propio cuerpo ocupa —la de debajo, que su cubo tapa entera—
// y a los vecinos no les quita nada, porque les sigue entrando cielo por arriba.
test('un agente a ras de suelo solo oscurece la celda que pisa', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  assert(oscuridad(m, a, 48, 48) === 45, 'esperaba 45% bajo el agente, hay ' + oscuridad(m, a, 48, 48));
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
  a.renderY = 25; // cuerpo apoyado en y=26, como hace el gancho de vuelo
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
  assert(esperado.size > 0, 'el bloque real no ha proyectado nada: el test no prueba nada');
  assert(esperado.size === estampa.size, 'la estampa cubre ' + estampa.size + ' celdas y el bloque real oscurece ' + esperado.size);
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
  assert(e.w === 12 && e.d === 6, 'la huella mide ' + e.w + 'x' + e.d);
  assert(e.campo.x0 === 43 && e.campo.z0 === 46, 'ancla en ' + e.campo.x0 + ',' + e.campo.z0);
  const s = sombraDe(m, a);
  assert(s.get('43,48') && s.get('54,48'), 'la huella va de 43 a 54 (el cuerpo va de 42.5 a 54.5)');
  // Lado PAR: el cuerpo cae a medio camino entre dos columnas, asi que la de fuera se lleva la mitad
  // de sombra en vez de cero. Eso es lo correcto, y es justo lo que hace que el movimiento sea suave.
  assert(s.get('42,48') && s.get('42,48').pct < s.get('43,48').pct, 'la columna de mitad de fuera tenia que llevar menos');
});

// ---------------------------------------------------------------- el relieve (BUG del quad flotante)
// El fallo que hubo: el quad se calculaba con la altura de la columna que le tocaba al medir y luego
// se DESLIZABA entero. Sobre relieve acababa flotando encima de un agujero o hundido dentro del
// bloque de al lado — «los bloques se sombrean de golpe y la sombra desaparece poco a poco».
function relieve(c) {
  for (let y = c.GH + 1; y <= c.GH + 2; y++) c.mc.grid[c.mcIdx(49, y, 48)] = 1; // pilar de 2
  for (let y = c.GH; y >= c.GH - 1; y--) c.mc.grid[c.mcIdx(47, y, 48)] = 0;     // agujero de 2
  c.mcComputeLight();
}

test('la sombra TREPA al bloque alto y BAJA al agujero: cada quad en la cara de SU columna', () => {
  relieve(m);
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 5, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(alturaSombra(m, a, 48, 48) !== null, 'no hay sombra en el suelo llano');
  const llano = alturaSombra(m, a, 48, 48), pilar = alturaSombra(m, a, 49, 48), hoyo = alturaSombra(m, a, 47, 48);
  assert(pilar !== null && hoyo !== null, 'el pilar o el agujero se han quedado sin sombra');
  assert(Math.abs(llano - (m.GH + 1)) < 0.1, 'el llano esta en ' + llano + ', tenia que estar en ' + (m.GH + 1));
  assert(Math.abs(pilar - (m.GH + 3)) < 0.1, 'la sombra del pilar esta en ' + pilar + ', tenia que trepar a ' + (m.GH + 3));
  assert(Math.abs(hoyo - (m.GH - 1)) < 0.1, 'la sombra del agujero esta en ' + hoyo + ', tenia que bajar a ' + (m.GH - 1));
});

test('deslizarse por encima del relieve NO despega la sombra del suelo', () => {
  relieve(m);
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 5, altura: 26 });
  a.renderY = 25;
  m.tiempo += 1000; frame(m);
  const y0 = [47, 48, 49].map(x => alturaSombra(m, a, x, 48));
  for (const rx of [48.1, 48.3, 48.49, 48.51, 48.7, 49.0]) {
    a.x = Math.round(rx); a.renderX = rx;
    m.tiempo += 1000; frame(m);
    [47, 48, 49].forEach((x, k) => {
      const y = alturaSombra(m, a, x, 48);
      assert(y === null || Math.abs(y - y0[k]) < 1e-4,
        'con renderX=' + rx + ' el quad de la columna ' + x + ' se ha ido a y=' + y + ' (era ' + y0[k] + ')');
    });
  }
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

test('el oclusor no lo ve nadie: ni el jugador, ni el pathfinding, ni el mundo guardado', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 9, altura: 26 });
  a.renderY = 25;
  frame(m);
  assert(m.mcSolid(48, 26, 48) === false, 'mcSolid ve el oclusor: el jugador chocaria con el aire');
  assert(m.mcGetVoxel(48, 26, 48) === 0, 'mcGetVoxel devuelve el oclusor');
  assert(m.mcSurfaceY(48, 48) === m.GH, 'mcSurfaceY se sube al oclusor: ' + m.mcSurfaceY(48, 48));
  assert(m.mcSurfaceNear(48, 48, m.GH, 1, 3) === m.GH, 'mcSurfaceNear se sube al oclusor');
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
  m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] = 1; // el usuario tiene algo puesto justo ahi
  const a = agente(m, 'bot', 48, m.GH, 48);
  frame(m);
  assert(m.mc.grid[m.mcIdx(48, m.GH + 1, 48)] === 1, 'le ha machacado el bloque');
  assert(sombraDe(m, a).size === 0, 'el cuerpo esta dentro de terreno: ahi ya tapa el terreno, no hay sombra que anadir');
});

// ---------------------------------------------------------------- lo que pidio el dueno: que sea SUAVE
test('moverse dentro de la misma celda NO recalcula nada, pero la sombra SI se mueve', () => {
  const a = agente(m, 'nube', 10, 25, 10, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  m.tiempo += 1000; frame(m);
  const geom0 = a.vars._estampa.vbo.datos, izq0 = oscuridad(m, a, 9, 10), der0 = oscuridad(m, a, 11, 10);

  a.renderX = 10.37; m.tiempo += 16;
  assert(frame(m) === 0, 'ha recalculado la luz sin cambiar de celda');
  assert(a.vars._estampa.vbo.datos === geom0, 'ha rehecho la geometria sin cambiar de celda');
  assert(oscuridad(m, a, 11, 10) > der0, 'la columna de delante tenia que oscurecerse al avanzar');
  assert(oscuridad(m, a, 9, 10) < izq0, 'la columna de detras tenia que aclararse al avanzar');
});

test('SIN TIRONES: el alpha de una columna cambia de forma continua al cruzarla el cuerpo', () => {
  const a = agente(m, 'nube', 10, 25, 10, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  let previo = null, mayor = 0;
  for (let rx = 8; rx <= 14.001; rx += 0.1) {
    a.x = Math.round(rx); a.renderX = rx;
    m.tiempo += 1000; frame(m); // sin freno: se rehace en cuanto cambia de celda
    const pct = oscuridad(m, a, 11, 10);
    if (previo !== null) mayor = Math.max(mayor, Math.abs(pct - previo));
    previo = pct;
  }
  // un paso de 0.1 celda no puede cambiar el alpha mas de ~0.1 del salto entero (7.7 puntos)
  assert(mayor > 0, 'el alpha no se ha movido: el test no prueba nada');
  assert(mayor < 1.2, 'salto de ' + mayor.toFixed(2) + ' puntos de alpha en 0.1 celdas: eso es un tiron');
});

test('la estampa se dibuja mezclada (negro con alpha) y sin escribir en el z-buffer', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  const d = m.draws[m.draws.length - 1];
  assert(d, 'no ha llegado ni un drawArrays');
  assert(d.blend === true && d.depthMask === false, 'tiene que ir con BLEND y depthMask apagado');
  assert(d.blendFunc === '7,8', 'el color se mezcla con SRC_ALPHA / ONE_MINUS_SRC_ALPHA');
  assert(m.estado.depthMask === true && m.estado.blend === false, 'tiene que dejar el GL como estaba');
  const v = d.pos.buf.datos, al = d.alpha.buf.datos;
  assert(d.pos.stride === 32 && d.alpha.stride === 4, 'layout inesperado: ' + d.pos.stride + '/' + d.alpha.stride);
  for (let q = 0; q < d.count / 6; q++) {
    const b = q * 6 * 8;
    assert(v[b + 3] === 0 && v[b + 4] === 0 && v[b + 5] === 0, 'el quad tiene color: la sombra no pinta, solo quita luz');
    assert(v[b + 6] === 1 && v[b + 7] === 0, 'shade=1 y emit=0: el color no aporta y la niebla le afecta igual');
    assert(al[q * 6] >= 0 && al[q * 6] <= 1, 'alpha fuera de rango: ' + al[q * 6]);
  }
});

// BUG: el lienzo GL se compone sobre el cielo del modal (#8cc6ff, style.css:445). Con blendFunc
// normal la mezcla baja tambien el ALPHA del framebuffer y ese azul se colaba por debajo: la sombra
// salia como una calcomania GRIS AZULADA, igual de gris sobre hierba, tierra o roca.
test('la sombra no anade color: no toca el canal alpha del lienzo (o sale GRIS)', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  const d = m.draws[m.draws.length - 1];
  assert(d.blendAlpha === '9,10', 'el alpha tiene que mezclarse con ZERO/ONE (dejarlo intacto), no con ' + d.blendAlpha);
  assert(/blendFuncSeparate/.test(lib.code), 'sin blendFuncSeparate el fondo del modal se cuela por la sombra');
});

test('el quad se levanta un pelo sobre la cara del terreno, no dentro', () => {
  const a = agente(m, 'nube', 48, 25, 48, { tipo: 'bloque', escala: 3, altura: 26 });
  a.renderY = 25;
  frame(m);
  const s = sombraDe(m, a).get('48,48');
  assert(s.y > m.GH + 1 && s.y < m.GH + 1.1, 'la altura del quad es ' + s.y + ', tenia que ser ' + (m.GH + 1) + ' y un pelo');
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

test('game.sombraMs frena el REHACER: cruzar dos celdas cuesta una sola pasada de luz', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  let luces = 0;
  for (let i = 1; i <= 5; i++) { a.renderX = 48 + i * 0.4; a.x = Math.round(a.renderX); m.tiempo += 20; luces += frame(m); }
  assert(luces === 0, 'el freno de game.sombraMs no ha frenado nada: ' + luces + ' pasadas de luz');
  m.tiempo += 1000;
  assert(frame(m) === 1, 'pasado el freno tenia que rehacerla');
  assert(oscuridad(m, a, 50, 48) === 45, 'la sombra no ha acabado bajo el agente');
});

test('el freno NO congela la posicion: la sombra sigue al cuerpo aunque no se rehaga', () => {
  const a = agente(m, 'bot', 10, m.GH, 10);
  m.tiempo += 1000; frame(m);
  assert(oscuridad(m, a, 10, 10) === 45, 'no ha empezado bajo el agente');
  a.x = a.renderX = 12; m.tiempo += 20; // dos celdas, dentro de la ventana del freno
  assert(frame(m) === 0, 'no deberia haber recalculado la luz');
  assert(oscuridad(m, a, 12, 10) === 45, 'la sombra se ha quedado atras: ' + oscuridad(m, a, 12, 10) + '%');
  assert(oscuridad(m, a, 10, 10) === 0, 'ha dejado sombra donde ya no esta');
});

test('si se aleja mas que el margen medido, el freno se salta: la sombra no se queda sin suelo', () => {
  const a = agente(m, 'bot', 10, m.GH, 10);
  m.tiempo += 1000; frame(m);
  a.x = a.renderX = 20; m.tiempo += 20; // muy lejos y dentro de la ventana del freno
  assert(frame(m) === 1, 'no ha rehecho la estampa pese a irse fuera del campo medido');
  assert(oscuridad(m, a, 20, 10) === 45, 'la sombra no ha llegado hasta el agente');
});

test('un agente parado (stopped) pierde la sombra', () => {
  const a = agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  a.state = 'stopped'; m.tiempo += 1000; frame(m);
  assert(!a.vars._estampa, 'la estampa sigue viva');
  assert(m.borrados.length === 2, 'no ha soltado las dos VBOs: ' + m.borrados.length);
  assert(m.draws.length === 0, 'sigue dibujando la sombra de un agente parado');
});

test('sacar un agente de mc.agents le quita la sombra', () => {
  agente(m, 'bot', 48, m.GH, 48);
  m.tiempo += 1000; frame(m);
  m.mc.agents.delete('bot'); m.tiempo += 1000; frame(m);
  assert(m.draws.length === 0, 'la sombra de un agente que ya no existe sigue dibujandose');
  assert(m.borrados.length === 2, 'no ha soltado las VBOs');
});

test('game.sombras = false las apaga todas y volver a true las devuelve', () => {
  const a1 = agente(m, 'a1', 40, m.GH, 40), a2 = agente(m, 'a2', 60, m.GH, 60);
  m.tiempo += 1000; frame(m);
  assert(m.draws.length === 2, 'esperaba 2 sombras, hay ' + m.draws.length);
  m.game.sombras = false; m.tiempo += 1000; frame(m);
  assert(m.draws.length === 0, 'sigue dibujando con game.sombras=false');
  assert(!a1.vars._estampa && !a2.vars._estampa, 'no ha soltado las estampas');
  m.game.sombras = true; m.tiempo += 1000; frame(m);
  assert(m.draws.length === 2, 'no vuelven al ponerlo a true');
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
  assert((m.frames || 0) === 1, 'el frame del Mundo no se ha pintado');
  assert(m.game.sombras === false, 'no se ha apagado sola');
  assert(m._errors.join(' ').indexOf('[skills.sombra]') >= 0, 'no ha dejado dicho quien fallaba');
});

test('sigue sin haber shadow maps, FBOs ni una segunda verdad de sombras', () => {
  const t = lib.code.toLowerCase();
  for (const p of ['createframebuffer', 'shadowmap', 'shadow map', 'depthtexture'])
    assert(t.indexOf(p) < 0, 'la libreria menciona "' + p + '": la unica verdad es mcComputeLight');
  assert(lib.code.indexOf('mcComputeLight()') > 0, 'la sombra tiene que salir de mcComputeLight');
  assert(/var ID_SOMBRA = 65535;/.test(lib.code), 'ID_SOMBRA tiene que ser un id sin entrada en mc.palette');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
