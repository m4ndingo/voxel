// BUG-PERF3 · «en un mapa complejo colocar un bloque, dependiendo de dónde se haga, genera una
// caída importante de fps».
//
// Esta sonda contesta UNA pregunta: al colocar un bloque, ¿cuál de las tres cosas caras que hace
// `mcRemeshAround` (app.js:8705) domina, y cuánto cambia según lo que haya YA en el chunk?
//
//   mcRelightBox         · el BFS de skylight sobre la caja del edit
//   mcMeshChunk          · re-mallar cada chunk tocado  (lo que la propuesta de la pasada 9 acota)
//   mcRebakeStructsNear  · re-hornear las estructuras del vecindario
//
// Coloca y quita EL MISMO bloque, el mismo número de veces, en cuatro sitios que solo se diferencian
// en lo que ya tenían dentro. La comparación es el dato; los ms absolutos bajo SwiftShader no valen
// como cifra de la máquina del dueño, pero la RAZÓN malo/bueno y el reparto entre las tres sí.
//
//   liso        · terreno pelado                        ← el «sitio bueno» del protocolo
//   finos       · el chunk lleno de piezas finas en rejilla (flores)   → castiga mcMeshChunk
//   estructuras · piezas estampadas alrededor (mc.structures)          → castiga mcRebakeStructsNear
//   redstone    · observadores y cables, que es lo que tiene el mundo del dueño
//
// No persiste nada: bloquea los POST y deshace cada celda tocada.
//
//   node performance/sonda_perf3_colocar.js [url]     · por defecto /map/test

const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test';
const REPS = 12;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && window.game', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async (REPS) => {
    const out = { casos: [], errs: [] };
    const frame = () => new Promise(s => requestAnimationFrame(s));
    const esperar = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) await frame(); };

    // ── instrumentación: se envuelve una sola vez y se acumula por caso ────────────────────────
    const acc = {};
    const reset = () => { for (const k of ['remesh', 'relight', 'blockLight', 'meshChunk', 'rebake']) acc[k] = [0, 0]; };
    reset();
    const wrap = (n, orig) => function () {
      const t = performance.now();
      const r = orig.apply(this, arguments);
      acc[n][0] += performance.now() - t; acc[n][1]++;
      return r;
    };
    const _o = {
      rel: window.mcRelightBox, bl: window.mcComputeBlockLight, mch: window.mcMeshChunk,
      rb: window.mcRebakeStructsNear, rm: window.mcRemeshAround
    };
    window.mcRelightBox = wrap('relight', _o.rel);
    window.mcComputeBlockLight = wrap('blockLight', _o.bl);
    window.mcMeshChunk = wrap('meshChunk', _o.mch);
    window.mcRebakeStructsNear = wrap('rebake', _o.rb);
    window.mcRemeshAround = wrap('remesh', _o.rm);

    // Cada mundo nombra lo suyo a su manera: en /map/test la roca es `roca` a secas y en otros
    // `asset:assets/roca.vox.json`. Se prueba la lista y se da de alta lo que falte; el que no
    // aparezca se dice, en vez de medir un caso vacío creyendo que se midió.
    const resolver = async (cands) => {
      for (const c of cands) if (mc.name2id[c]) return { id: mc.name2id[c], clave: c };
      for (const c of cands) {
        try { await game.addMaterial(c); } catch (e) {}
        if (mc.name2id[c]) return { id: mc.name2id[c], clave: c };
      }
      return null;
    };
    const roca = await resolver(['roca', 'asset:assets/roca.vox.json', 'adoquin', 'tablones']);
    if (!roca) { out.errs.push('sin material para colocar'); return out; }
    const idRoca = roca.id;
    out.material = roca.clave;
    const flor1 = await resolver(['asset:assets/flor-roja.vox.json', 'flor-roja']);
    const flor2 = await resolver(['asset:assets/flor-amarilla.vox.json', 'flor-amarilla']);
    const obs = await resolver(['asset:assets/observador.vox.json', 'hab:observador']);
    const cable = await resolver(['hab:cable', 'asset:assets/cable.vox.json']);
    out.piezas = { flor1: flor1 && flor1.clave, flor2: flor2 && flor2.clave,
                   obs: obs && obs.clave, cable: cable && cable.clave };

    const CH = MC_CHUNK;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const deshacer = [];
    const pon = (x, y, z, id) => { deshacer.push([x, y, z, idEn(x, y, z)]); mcSetBlock(x, y, z, id | 0); };

    // Un chunk virgen por caso: se buscan chunks cuya columna esté vacía, para que la única
    // diferencia entre casos sea lo que planta esta sonda y no lo que ya hubiera en el mapa.
    const Y = Math.min(30, mc.dim.y - 8);
    const libres = [];
    const ncx = Math.floor(mc.dim.x / CH), ncz = Math.floor(mc.dim.z / CH);
    for (let cx = 1; cx < ncx - 1 && libres.length < 8; cx++)
      for (let cz = 1; cz < ncz - 1 && libres.length < 8; cz++) {
        let libre = true;
        for (let i = 0; i < CH && libre; i += 2) for (let k = 0; k < CH && libre; k += 2)
          for (let j = -1; j < 5 && libre; j++) if (idEn(cx * CH + i, Y + j, cz * CH + k)) libre = false;
        if (libre) libres.push([cx * CH, cz * CH]);
      }
    if (libres.length < 4) { out.errs.push('no hay 4 chunks vacios (hay ' + libres.length + ')'); return out; }

    // suelo bajo cada zona de prueba, igual en los cuatro
    for (const [X, Z] of libres.slice(0, 4))
      for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) pon(X + i, Y - 1, Z + k, idRoca);
    await esperar(600);

    const sembrar = {
      liso: async () => {},
      finos: async (X, Z) => {                      // piezas finas EN REJILLA: no son structures
        const f = [flor1 && flor1.id, flor2 && flor2.id].filter(Boolean);
        if (!f.length) { out.errs.push('sin flores'); return; }
        let n = 0;
        for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) { pon(X + i, Y, Z + k, f[(i + k) % f.length]); n++; }
        out.sembrado_finos = n;
      },
      estructuras: async (X, Z) => {                // estampadas: van a mc.structures
        if (!obs) { out.errs.push('sin pieza que estampar'); return; }
        let n = 0;
        for (let i = 2; i < CH - 2; i += 3) for (let k = 2; k < CH - 2; k += 3) {
          try { await game.stamp(obs.clave, X + i, Y, Z + k); n++; } catch (e) {}
        }
        out.sembrado_estructuras = n;
      },
      redstone: async (X, Z) => {                   // lo que de verdad tiene el mundo del dueño
        const idObs = obs && obs.id, idCab = cable && cable.id;
        if (!idObs || !idCab) { out.errs.push('sin piezas de redstone'); return; }
        let n = 0;
        for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) { pon(X + i, Y, Z + k, (i + k) % 3 === 0 ? idObs : idCab); n++; }
        out.sembrado_redstone = n;
      }
    };

    const nombres = ['liso', 'finos', 'estructuras', 'redstone'];
    for (let c = 0; c < nombres.length; c++) {
      const nom = nombres[c], [X, Z] = libres[c];
      await sembrar[nom](X, Z);
      await esperar(1500);                           // que se asiente el mallado de la siembra

      // El gesto que mide el ticket: poner un bloque y quitarlo, en medio del chunk sembrado.
      const px = X + (CH >> 1), pz = Z + (CH >> 1), py = Y + 2;
      const previo = idEn(px, py, pz);
      reset();
      const t0 = performance.now();
      for (let i = 0; i < REPS; i++) {
        mcSetBlock(px, py, pz, idRoca); mcRemeshAround(px, pz);
        await esperar(24);
        mcSetBlock(px, py, pz, previo); mcRemeshAround(px, pz);
        await esperar(24);
      }
      const total = performance.now() - t0;
      const copia = {}; for (const k in acc) copia[k] = acc[k].slice();
      out.casos.push({ nombre: nom, chunk: [X, Z], totalMs: total, gestos: REPS * 2, acc: copia,
                       structs: mc.structures.length });
    }

    for (const [x, y, z, id] of deshacer.slice().reverse()) mcSetBlock(x, y, z, id);
    window.mcRelightBox = _o.rel; window.mcComputeBlockLight = _o.bl; window.mcMeshChunk = _o.mch;
    window.mcRebakeStructsNear = _o.rb; window.mcRemeshAround = _o.rm;
    return out;
  }, REPS);

  if (r.errs && r.errs.length) console.log('avisos: ' + r.errs.join(' · '));
  if (!r.casos || !r.casos.length) { console.log('sin medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }

  console.log('\nBUG-PERF3 · coste de COLOCAR un bloque, según lo que ya hay en el chunk');
  console.log('(' + REPS * 2 + ' gestos por caso · SwiftShader: importa la RAZÓN, no los ms absolutos)\n');
  const fila = (a, b2, c, d, e) =>
    console.log('  ' + String(a).padEnd(13) + String(b2).padStart(9) + String(c).padStart(11) +
                String(d).padStart(11) + String(e).padStart(11));
  fila('caso', 'ms/gesto', 'meshChunk', 'rebake', 'relight');
  console.log('  ' + '─'.repeat(56));
  const base = r.casos[0];
  const porGesto = c => c.acc.remesh[0] / c.gestos;
  for (const c of r.casos) {
    const ms = k => (c.acc[k][0] / c.gestos).toFixed(2);
    fila(c.nombre, porGesto(c).toFixed(2), ms('meshChunk'), ms('rebake'), ms('relight'));
  }
  console.log('\n  razón contra «liso» (esto es el «depende de dónde»):');
  for (const c of r.casos.slice(1)) {
    const x = porGesto(base) > 0 ? (porGesto(c) / porGesto(base)) : 0;
    console.log('    ' + c.nombre.padEnd(13) + '×' + x.toFixed(1) + '   (structures en el mundo: ' + c.structs + ')');
  }
  console.log('\n  quién se lleva el tiempo en el peor caso:');
  const peor = r.casos.slice().sort((a, b2) => porGesto(b2) - porGesto(a))[0];
  const tot = peor.acc.remesh[0] || 1;
  for (const k of ['meshChunk', 'rebake', 'relight', 'blockLight'])
    console.log('    ' + k.padEnd(12) + (100 * peor.acc[k][0] / tot).toFixed(0).padStart(4) + ' %   ' +
                peor.acc[k][1] + ' llamadas, ' + (peor.acc[k][1] ? (peor.acc[k][0] / peor.acc[k][1]).toFixed(2) : '0') + ' ms/call');
  console.log('\n  (peor caso: ' + peor.nombre + ')');
  await b.close();
})();
