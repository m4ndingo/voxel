// @area: mundo
// @necesita: servidor, playwright
// SONDA de limpieza (un solo uso): `probe_aviso_setblock.js` pone bloques de verdad en `/map/test`
// para provocar el aviso, y `/map/test` es un mapa compartido por muchos guardianes — dejarlos ahí
// hace fallar a otros (asi rompi `test_observador_redstone.js`). Esto los quita.
//
//   node tests/probe_limpia_sonda_setblock.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
const CAJA = { x0: 10, x1: 19, y0: 40, y1: 78, z: 10 };   // lo que toca la sonda del aviso

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await page.waitForTimeout(3000);

  const n = await page.evaluate(c => {
    let n = 0;
    for (let x = c.x0; x <= c.x1; x++) for (let y = c.y0; y <= c.y1; y++) {
      if (mc.grid[mcIdx(x, y, c.z)]) { mcSetBlock(x, y, c.z, 0); n++; }
    }
    if (typeof mcRemeshAround === 'function') mcRemeshAround((c.x0 + c.x1) >> 1, (c.y0 + c.y1) >> 1, c.z);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
    return n;
  }, CAJA);

  console.log('bloques quitados: ' + n);
  await page.waitForTimeout(5000);       // que el guardado en cola llegue a disco
  await browser.close();
})();
