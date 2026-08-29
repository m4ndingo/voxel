// @area: mundo
// @necesita: servidor, playwright
// SONDA: la cuarta linea de rayos-X de una pieza GIRADA. El dueño (2026-08-28): «solamente "casita"
// indica "alRomper" en rayosx, las otras no sale, aunque todas son rompibles/activables».
//
// El hueco lo rellena el snippet `mundo-autoarranque` (`window.mcXrayExtra = etiquetaRayosX`), asi que
// se le pregunta a el directamente: es la MISMA funcion que pinta la etiqueta, sin tener que leer
// pixeles. Se comprueban la recta y sus giradas, y de paso que el snippet vivo es el parcheado.
//
//   node tests/probe_rayosx_girada.js [url] [pieza]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
const PIEZA = process.argv[3] || 'casita';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForFunction('typeof window.mcXrayExtra==="function"', null, { timeout: 60000 });
  await page.waitForTimeout(4000);

  console.log('   ' + JSON.stringify(await page.evaluate(n => {
    const k = mcClaveDeNombre(n);
    const linea = c => { try { return mcXrayExtra(c, null); } catch (e) { return 'ERR:' + e.message; } };
    const info = game.bloques.info();
    return {
      version: (window.mcUpdate && mcUpdate._bloques) || null,
      enTabla: (Array.isArray(info) ? info : Object.keys(info || {})).filter(x => String(JSON.stringify(x)).includes(n)),
      clave: k,
      moteCrudo: linea(n),
      recta: linea(k),
      girada2: linea(mcClaveConOri(k, 2)),
      girada3: linea(mcClaveConOri(k, 3)),
      girada7: linea(mcClaveConOri(k, 7))
    };
  }, PIEZA)));
  await browser.close();
})();
