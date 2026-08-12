// BUG-PERF3 · ¿por qué `mcMeshChunk` cuesta 134 ms en un chunk cargado de piezas finas?
// Mide cuánta geometría fina produce un chunk denso frente a uno liso, y cronometra el mesh
// forzado (invalidando la firma para que no dé acierto de caché).
//
//   node performance/sonda_perf3_finos.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && window.game', null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(async () => {
    const CH = MC_CHUNK, Y = 30;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const und = [];
    const pon = (x, y, z, id) => { und.push([x, y, z, idEn(x, y, z)]); mcSetBlock(x, y, z, id | 0); };
    const res = async (c) => { for (const k of c) { if (mc.name2id[k]) return mc.name2id[k]; try { await game.addMaterial(k); } catch (e) {} if (mc.name2id[k]) return mc.name2id[k]; } return 0; };
    const roca = await res(['roca']), obs = await res(['asset:assets/observador.vox.json']), cab = await res(['hab:cable']);
    let X = 0, Z = 0, ok = false;
    for (let cx = 1; cx < 5 && !ok; cx++) for (let cz = 1; cz < 5 && !ok; cz++) {
      let libre = true;
      for (let i = 0; i < CH && libre; i += 2) for (let k = 0; k < CH && libre; k += 2)
        for (let j = -1; j < 4 && libre; j++) if (idEn(cx * CH + i, Y + j, cz * CH + k)) libre = false;
      if (libre) { X = cx * CH; Z = cz * CH; ok = true; }
    }
    if (!ok) return 'sin chunk libre';
    for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) pon(X + i, Y - 1, Z + k, roca);
    const cxc = Math.floor(X / CH), czc = Math.floor(Z / CH), key = cxc + ',' + czc;
    await new Promise(s => setTimeout(s, 800));
    const l = mc.chunks.get(key);
    const liso = { count: l.count, fino: (l.finoCount | 0) + (l.finoACount | 0) };
    const cron = () => { const t = []; const ch = mc.chunks.get(key);
      for (let i = 0; i < 5; i++) { ch._meshSig = -1 - i; ch._cache = null;
        const t0 = performance.now(); mcMeshChunk(cxc, czc); t.push(+(performance.now() - t0).toFixed(1)); } return t; };
    const msLiso = cron();
    for (let i = 0; i < CH; i++) for (let k = 0; k < CH; k++) pon(X + i, Y, Z + k, (i + k) % 3 === 0 ? obs : cab);
    await new Promise(s => setTimeout(s, 1500));
    const d = mc.chunks.get(key);
    const denso = { count: d.count, fino: (d.finoCount | 0) + (d.finoACount | 0) };
    const msDenso = cron();
    for (const [x, y, z, id] of und.slice().reverse()) mcSetBlock(x, y, z, id);
    return JSON.stringify({
      liso, denso,
      vertices_finos_denso: denso.fino,
      floats_empujados: denso.fino * 9,
      llamadas_push: denso.fino,
      ms_mesh_liso: msLiso, ms_mesh_denso: msDenso
    }, null, 1);
  }));
  await b.close();
})();
