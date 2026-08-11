const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && game && game.redstone && game.redstone.conmutar', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const medir = async (pulsoVisible) => {
    return await p.evaluate(async (pv) => {
      game.redstone.pulsoVisible = pv;
      const acc = { relight: [0, 0], blockLight: [0, 0], meshChunk: [0, 0], rebake: [0, 0], remesh: [0, 0] };
      const wrap = (n, orig) => function () { const t = performance.now(); const r = orig.apply(this, arguments); acc[n][0] += performance.now() - t; acc[n][1]++; return r; };
      const _o = { rel: window.mcRelightBox, bl: window.mcComputeBlockLight, mc: window.mcMeshChunk, rb: window.mcRebakeStructsNear, rm: window.mcRemeshAround };
      window.mcRelightBox = wrap('relight', _o.rel);
      window.mcComputeBlockLight = wrap('blockLight', _o.bl);
      window.mcMeshChunk = wrap('meshChunk', _o.mc);
      window.mcRebakeStructsNear = wrap('rebake', _o.rb);
      window.mcRemeshAround = wrap('remesh', _o.rm);

      await game.addMaterial('hab:boton');
      await game.addMaterial('hab:boton-on');
      await game.addMaterial('asset:assets/observador.vox.json');
      await game.addMaterial('asset:assets/observador-on.vox.json');
      const idBoton = mc.name2id['hab:boton'], idObs = mc.name2id['asset:assets/observador.vox.json'];
      const CH = MC_CHUNK, cx = Math.floor(mc.dim.x / 2 / CH), cz = Math.floor(mc.dim.z / 2 / CH);
      const cy = Math.floor(mc.dim.y / 2);
      let bx = -1, bz = -1;
      for (let dz = 0; dz < 8 && bx < 0; dz++) for (let dx = 0; dx < 8 && bx < 0; dx++) {
        const x = cx * CH + 4 + dx, z = cz * CH + 4 + dz;
        if (mc.grid[mcIdx(x, cy, z)] === 0 && mc.grid[mcIdx(x + 1, cy, z)] === 0) { bx = x; bz = z; }
      }
      const guardar = [];
      const w = (X, Y, Z, id) => { guardar.push([X, Y, Z, mc.grid[mcIdx(X, Y, Z)]]); mcSetBlock(X, Y, Z, id); };
      w(bx, cy, bz, idBoton);
      w(bx + 1, cy, bz, idObs);
      await new Promise(s => setTimeout(s, 500));
      game.redstone.tick();
      await new Promise(s => setTimeout(s, 300));
      for (const k in acc) { acc[k][0] = 0; acc[k][1] = 0; }
      for (let i = 0; i < 10; i++) {
        game.redstone.conmutar(bx, cy, bz);
        await new Promise(s => setTimeout(s, 130));
      }
      await new Promise(s => setTimeout(s, 500));
      for (const [X, Y, Z, id] of guardar.slice().reverse()) mcSetBlock(X, Y, Z, id);
      window.mcRelightBox = _o.rel; window.mcComputeBlockLight = _o.bl;
      window.mcMeshChunk = _o.mc; window.mcRebakeStructsNear = _o.rb;
      window.mcRemeshAround = _o.rm;
      return acc;
    }, pulsoVisible);
  };

  const imprimir = (nombre, acc) => {
    console.log('\n== ' + nombre + ' ==');
    for (const k of ['remesh', 'relight', 'blockLight', 'meshChunk', 'rebake']) {
      const a = acc[k];
      const perCall = a[1] ? (a[0] / a[1]).toFixed(2) : '  0.00';
      console.log('  ' + k.padEnd(12) + ': ' + String(a[1]).padStart(4) + ' calls, ' + a[0].toFixed(1).padStart(7) + ' ms, ' + perCall.padStart(6) + ' ms/call');
    }
  };

  const conPulso = await medir(true);
  imprimir('pulsoVisible = true (10 pulsaciones)', conPulso);
  const sinPulso = await medir(false);
  imprimir('pulsoVisible = false (10 pulsaciones)', sinPulso);

  const total = (acc) => Object.values(acc).reduce((s, v) => s + v[0], 0);
  console.log('\nMejora total: ' + total(conPulso).toFixed(1) + ' ms -> ' + total(sinPulso).toFixed(1) + ' ms (' +
    (100 * (1 - total(sinPulso) / total(conPulso))).toFixed(0) + '% menos)');

  await b.close();
})();
