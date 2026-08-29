// @area: mundo
// @necesita: servidor, playwright
// SONDA de una línea: ¿este mapa tiene todavía `casita` en su paleta? Es la condición del bug de las
// piezas giradas («ocurre cuando el mapa nunca tuvo casita»), y hace falta saberlo para elegir dónde
// se puede reproducir: ⛔ en `/map/agents` y `/map/default` no se planta nada.
//
//   node tests/probe_paleta_casita.js [mapa] [trozo-de-nombre]
const { chromium } = require('playwright');

const MAPA = process.argv[2] || 'test';
const QUE = process.argv[3] || 'casita';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:8500/map/' + MAPA, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await page.waitForTimeout(5000);
  console.log('/map/' + MAPA + ' · ' + JSON.stringify(await page.evaluate(q => ({
    enPaleta: (mc.blockKey || []).filter(k => String(k).includes(q)),
    enBlocks: (mc.blocks || []).map(b => b.key).filter(k => String(k).includes(q)),
    structs: Object.keys(mc.structs || {}).filter(k => k.includes(q))
  }), QUE)));
  await browser.close();
})();
