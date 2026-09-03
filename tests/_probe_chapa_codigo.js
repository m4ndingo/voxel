// La chapa con el EDITOR DE CÓDIGO abierto de verdad (Alt+C), no moviendo el `hidden` a mano.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('#vf-quien', { timeout: 8000 });
  const ver = () => p.$eval('#vf-quien', (e) => getComputedStyle(e).display);
  console.log('antes de abrir el código  :', await ver());

  await p.keyboard.press('Alt+c');
  await p.waitForTimeout(1500);
  const abierto = await p.$eval('#snip-modal', (m) => !m.hidden);
  console.log('editor abierto            :', abierto, '· chapa display =', await ver(),
    (abierto && (await ver()) === 'none') ? '  ✓ callada' : '  ⛔ SE VE');

  await p.keyboard.press('Escape');
  await p.waitForTimeout(1200);
  console.log('al cerrarlo               :', await ver(),
    (await ver()) !== 'none' ? '  ✓ vuelve' : '  ⛔ no vuelve');
  await nav.close();
})();
