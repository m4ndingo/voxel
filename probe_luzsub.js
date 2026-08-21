// REQ-LUZ4 · comprobación mínima de que el mando NO rompe nada.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST') ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const d = mc.dim, cx = Math.floor(d.x / 2), cz = Math.floor(d.z / 2);
    let gy = 0; for (let y = d.y - 1; y >= 0; y--) if (mcSolid(mc.grid[mcIdx(cx, y, cz)])) { gy = y; break; }
    const EY = gy + 2;
    const sem = () => [{ x: cx, y: EY, z: cz, fx: cx + 0.5, fy: EY + 0.5, fz: cz + 0.5, nivel: 12, col: [255, 255, 230], haz: null }];
    const foto = () => { const D = mc.dynLight; return {
      sub: MC_LUZ_SUB, caja: D ? [D.x0, D.y0, D.z0, D.W, D.H, D.P, D.luces] : null,
      byte: D ? D.BL[((cx - D.x0) + (EY - D.y0) * D.W + (cz - D.z0) * D.W * D.H) * 4 + 3] : null,
      nivel: D ? +mcDynNivel(cx, EY, cz).toFixed(4) : null }; };
    const out = {};
    game.luzSub = 'auto'; mc._dynSig = null; mcDynBake(sem()); out.auto = foto();
    game.luzSub = 4;      mc._dynSig = null; mcDynBake(sem()); out.clavado4 = foto();
    game.luzSub = 8;      mc._dynSig = null; mcDynBake(sem()); out.clavado8 = foto();
    game.luzSub = 'auto'; mc._dynSig = null; mcDynBake(sem()); out.vuelta = foto();
    const s40 = sem(); s40.push({ x: cx + 3, y: EY + 1, z: cz, fx: cx + 3.5, fy: EY + 1.5, fz: cz + 0.5, nivel: 40, col: [255, 255, 255], haz: null });
    mc._dynSig = null; mcDynBake(s40);
    out.alcance40 = { sub: MC_LUZ_SUB, techo: 40 * MC_LUZ_SUB, centro40: +mcDynNivel(cx + 3, EY + 1, cz).toFixed(3) };
    out.diag = game.luzDiag ? JSON.parse(JSON.stringify(game.luzDiag())).modo : null;
    out.diagSub = game.luzDiag ? game.luzDiag().sub : null;
    return out;
  });
  console.log(JSON.stringify(r));
  console.log(errs.length ? 'ERRORES:\n' + errs.join('\n') : 'sin errores de página');
  await b.close();
})();
