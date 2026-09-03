// La regresion de la mano: coger la ballesta la equipa, y la de la MANO no se auto-coge.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';
(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  let cargas = 0;
  p.on('console', (m) => { if (/Flecha-Arco.*cargado/i.test(m.text())) cargas++; });
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.game && window.game.bloques, null, { timeout: 30000 });
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    await game.stamp('ballesta', x, y, z);
    for (let i = 0; i < 45; i++) { mc.pos[0] += 0.1; mcUpdate(0.016); await new Promise(r => setTimeout(r, 25)); }
    const equipada = game.playerTool;
    // …y ahora se queda ahi 3 segundos con la ballesta en la mano.
    for (let i = 0; i < 120; i++) { mcUpdate(0.016); await new Promise(r => setTimeout(r, 25)); }
    return { equipada, tool: game.playerTool,
             mano: !!(mc._heldToolStruct && mc.structures.indexOf(mc._heldToolStruct) >= 0),
             manoKey: mc._heldToolKey };
  });
  console.log('playerTool tras coger :', r.equipada);
  console.log('playerTool 3 s despues:', r.tool);
  console.log('la mano sigue en mc.structures:', r.mano, '·', r.manoKey);
  console.log('cargas de flecha-arco :', cargas, cargas <= 1 ? '  ✓ una sola' : '  ⛔ SE REPITE');
  await nav.close();
  process.exit((r.tool === 'ballesta' && r.mano && cargas <= 1) ? 0 : 1);
})();
