// Sonda de un solo uso: ¿qué SEMILLAS produce de verdad un objeto con emisores apilados, y por qué
// `mcLuzFunde` no funde ninguna? Sin esto, el guardián de REQ-LUZ3 pasa en verde probando nada.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    game.luzQuietas = false; game.luzFunde = false; game.glowFocus = 1;
    const N = Math.round(1 / MC_VOX), d = mc.dim;
    const cx = Math.floor(d.x / 2), cz = Math.floor(d.z / 2), cy = d.y - 6;
    game.voxelesUI.limpia('espada');
    game.voxelesUI.material('espada', { emite: true, luz: 12 });
    let puestas = 0;
    for (let i = 0; i < 24; i++) if (game.voxelesUI.pon(cx * N + (i % N), cy * N + ((i / N) | 0), cz * N, [255, 255, 230], 'espada') !== false) puestas++;
    mc._dynSig = null; mc._dynSuma = null; mcDynSync();
    const sem = mc._dynSem || [];
    return { puestas, nSem: sem.length,
      cand: mc._dynCand ? mc._dynCand.length / 11 : 0,
      sem: sem.slice(0, 24).map(s => ({ c: [s.x, s.y, s.z], f: [+s.fx.toFixed(3), +s.fy.toFixed(3), +s.fz.toFixed(3)],
                                        nivel: s.nivel, col: s.col, haz: s.haz ? s.haz.map(v => +v.toFixed(2)) : null })) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
