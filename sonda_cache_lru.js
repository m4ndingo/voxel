const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && game.redstone && game.redstone.conmutar', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { registro: [], stats: [] };
    await game.addMaterial('hab:boton');
    await game.addMaterial('hab:boton-on');
    await game.addMaterial('asset:assets/observador.vox.json');
    await game.addMaterial('asset:assets/observador-on.vox.json');
    const idBoton = mc.name2id['hab:boton'];
    const idObs = mc.name2id['asset:assets/observador.vox.json'];
    const CH = MC_CHUNK, cx0 = Math.floor(mc.dim.x / 2 / CH), cz0 = Math.floor(mc.dim.z / 2 / CH);
    const cy = Math.floor(mc.dim.y / 2);
    let bx = -1, bz = -1;
    for (let dz = 0; dz < 8 && bx < 0; dz++) for (let dx = 0; dx < 8 && bx < 0; dx++) {
      const x = cx0 * CH + 4 + dx, z = cz0 * CH + 4 + dz;
      if (mc.grid[mcIdx(x, cy, z)] === 0 && mc.grid[mcIdx(x + 1, cy, z)] === 0) { bx = x; bz = z; }
    }
    out.pos = [bx, cy, bz];
    const guardar = [];
    const w = (X, Y, Z, id) => { guardar.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };
    w(bx, cy, bz, idBoton);
    w(bx + 1, cy, bz, idObs);
    await new Promise(s => setTimeout(s, 500));
    game.redstone.tick();
    await new Promise(s => setTimeout(s, 500));

    // Espia mcMeshChunk registrando FIRMA + ms + hit/miss
    const _origMC = window.mcMeshChunk;
    let sec = 0;
    window.mcMeshChunk = function(cx, cz){
      const ch = mc.chunks.get(cx+','+cz);
      const sigPre = ch && ch._meshSig;
      const cacheHitsPre = mc._cacheHits|0, cacheMissPre = mc._cacheMisses|0;
      const t = performance.now();
      const r = _origMC.apply(this, arguments);
      const dt = performance.now() - t;
      const ch2 = mc.chunks.get(cx+','+cz);
      const isHit = (mc._cacheHits|0) > cacheHitsPre;
      const isMiss = (mc._cacheMisses|0) > cacheMissPre;
      out.registro.push({
        sec, cx, cz, dt: +dt.toFixed(2),
        sigPre, sigPost: ch2 && ch2._meshSig,
        hit: isHit, miss: isMiss,
        slots: ch2 && ch2._cache ? ch2._cache.length : 0,
        sigsEnCache: ch2 && ch2._cache ? ch2._cache.map(c => c.sig) : []
      });
      return r;
    };

    mc._cacheHits = 0; mc._cacheMisses = 0;

    // 15 conmutaciones consecutivas simulando Morse rápido
    for (let i = 0; i < 15; i++) {
      sec = i;
      game.redstone.conmutar(bx, cy, bz);
      await new Promise(s => setTimeout(s, 130));
      game.redstone.tick();
      out.stats.push({ n: i, hits: mc._cacheHits|0, misses: mc._cacheMisses|0 });
    }
    await new Promise(s => setTimeout(s, 500));
    out.totalHits = mc._cacheHits|0;
    out.totalMisses = mc._cacheMisses|0;

    for (const [X, Y, Z, id] of guardar.slice().reverse()) mcSetBlock(X, Y, Z, id);
    window.mcMeshChunk = _origMC;
    return out;
  });

  console.log('Posicion:', r.pos);
  console.log('\n== Total tras 15 conmutaciones ==');
  console.log('  Hits:', r.totalHits, ' Misses:', r.totalMisses,
    ' Ratio:', (r.totalHits / Math.max(1, r.totalHits + r.totalMisses) * 100).toFixed(1) + '%');
  console.log('\n== Detalle de mcMeshChunk por conmutación ==');
  console.log('  #sec  chunk    hit/miss  ms       sigPre → sigPost  slots');
  for (const e of r.registro) {
    console.log('  #' + String(e.sec).padStart(3) + '   (' + e.cx + ',' + e.cz + ')  ' + (e.hit ? 'HIT ' : e.miss ? 'MISS' : '----') + '      ' + e.dt.toFixed(2).padStart(6) + '   ' + String(e.sigPre).padStart(13) + ' → ' + String(e.sigPost).padStart(13) + '  ' + e.slots);
  }
  await b.close();
})();
