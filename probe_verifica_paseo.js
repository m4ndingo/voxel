// Verifica que `performance/consola_luz_paseo.js` FUNCIONA antes de dársela al dueño: se le monta una luz que
// sigue al jugador (una estructura emisiva con `model`, igual que la herramienta en la mano) y se corre el modo
// `.salto()`. Si la tabla sale con celdas alumbradas y cifras, la sonda está lista para pegarla en su consola.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { const t = m.text(); if (/▶|sondaLuzPaseo|origen/.test(t)) console.log('  · ' + t.replace(/%c/g, '')); });
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // La luz que sigue al jugador: un cubo emisivo estampado + `model` reescrito cada frame desde `mc.pos`.
  const montaje = await p.evaluate(async () => {
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    if (sy < 0) return { err: 'sin suelo bajo el jugador' };
    mc.glowLevel = 12; game.agentsLightTracking(true);
    const S = 16, vox = {};
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) vox[x + ',' + y + ',' + z] = '*#ffdd88';
    roomDataCache.set('zz-luzmano', Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: 'zz-luzmano', type: 'bloque' }, voxels: vox }));
    const OX = bx, OY = sy + 1, OZ = bz;
    await mcStampStruct('zz-luzmano', OX, OY, OZ, 0, true);
    const S0 = mc.structures.find(o => o.key === 'zz-luzmano');
    if (!S0) return { err: 'no se estampó' };
    const sync = window.mcDynSync;
    window.mcDynSync = function () {                       // la «mano»: la luz va delante del ojo, a su altura
      const m = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
      m[12] = (mc.pos[0] + Math.sin(mc.yaw) * 0.7) - (OX + 0.5);
      m[13] = (mc.pos[1] + 1.5) - (OY + 0.5);
      m[14] = (mc.pos[2] + Math.cos(mc.yaw) * 0.7) - (OZ + 0.5);
      S0.model = m;
      return sync.apply(this, arguments);
    };
    mcDynSync();
    return { sy, emit: !!(S0.emitFinos && S0.emitFinos.length), luces: mc.dynLight ? mc.dynLight.luces : 0,
             caja: mc.dynLight ? mc.dynLight.vol : 0 };
  });
  console.log('montaje:', JSON.stringify(montaje));
  if (montaje.err) { await b.close(); process.exit(1); }

  await p.addScriptTag({ path: 'performance/consola_luz_paseo.js' });
  await p.waitForTimeout(500);

  const texto = await p.evaluate(async () => {
    sondaLuzPaseo.foto = false;                 // en la verificación no se escribe a disco
    sondaLuzPaseo.aqui();
    return await sondaLuzPaseo.salto(240, { calienta: 20 });
  });
  console.log('\n' + texto);
  await b.close();
})();
