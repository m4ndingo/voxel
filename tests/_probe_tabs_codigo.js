// Las pestañas del editor de código: ninguna repetida cambiando sólo la mayúscula.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.keyboard.press('Alt+c');
  await p.waitForSelector('#snip-tabs .snip-tab', { timeout: 15000 });
  await p.waitForTimeout(800);
  const tabs = await p.$$eval('#snip-tabs .snip-tab', (bs) => bs.map((b) => b.textContent.trim()));
  console.log('pestañas:', tabs);
  const nombres = tabs.map((t) => t.replace(/\s*\(\d+\)\s*$/, '').trim());
  const vistas = new Map(), repes = [];
  for (const n of nombres) {
    const k = n.toLowerCase();
    if (vistas.has(k)) repes.push(vistas.get(k) + ' / ' + n);
    else vistas.set(k, n);
  }
  console.log(repes.length ? '⛔ repetidas: ' + repes.join(', ') : '✓ ninguna repetida por mayúsculas');
  await nav.close();
  process.exit(repes.length ? 1 : 0);
})();
