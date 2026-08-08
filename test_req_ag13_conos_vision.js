// @area: agentes
// @necesita: servidor, playwright
// REQ-AG13: Visualización 3D de conos de visión y mirada de agentes (game.verConos / game.conosVision).
'use strict';
const { chromium } = require('playwright');
const http = require('http');

function checkServer(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => resolve(res.statusCode === 200)).on('error', () => resolve(false));
  });
}

(async () => {
  const serverUp = await checkServer('http://localhost:8500/map/test');
  if (!serverUp) {
    console.error('❌ ERROR PRE-FLIGHT: Servidor HTTP no detectado en http://localhost:8500.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let ok = 0, fail = 0;
  const t = (n, c, extra) => {
    if (c) { ok++; console.log('  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
    else { fail++; console.log('  FAIL ' + n + (extra ? '   (' + extra + ')' : '')); }
  };

  try {
    await page.goto('http://localhost:8500/map/test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof game !== 'undefined' && game.verConos !== undefined);

    // 1) Comprueba la propiedad game.verConos / game.conosVision
    const vInit = await page.evaluate(() => game.verConos);
    t('game.verConos arranca definido (defecto false)', vInit === false, 'valor = ' + vInit);

    await page.evaluate(() => { game.verConos = true; });
    const vON = await page.evaluate(() => game.verConos && game.conosVision);
    t('game.verConos = true activa conosVision', vON === true, 'conosVision = ' + vON);

    await page.evaluate(() => { game.verConos = false; });
    const vOFF = await page.evaluate(() => game.verConos);
    t('game.verConos = false lo apaga correctamente', vOFF === false);

    const vEsq = await page.evaluate(() => {
      if (game.esqueletos && typeof game.esqueletos.verConos === 'function') {
        game.esqueletos.verConos(true);
        return game.verConos;
      }
      return false;
    });
    t('game.esqueletos.verConos(true) es accesible y activa el cono', vEsq === true);

    // 2) Plantar un agente y verificar rendering de conos en mcDrawOverlays
    await page.evaluate(() => {
      game.verConos = true;
      if (!game.esqueletos) game.esqueletos = {};
      game.esqueletos._vivos = [{
        id: 1,
        pos: [10, 5, 10],
        giro: 45,
        horneado: 0,
        G: { vision: 180, deteccion: 8, limitesX: [-70, 70], limitesY: [-90, 90] }
      }];
    });

    const overlayOk = await page.evaluate(() => {
      const out = [];
      if (typeof mcPushVisionCones === 'function') {
        mcPushVisionCones(out);
      }
      return out.length > 0;
    });

    t('mcPushVisionCones genera líneas 3D para el cono de seguir.vision y mirar.limites', overlayOk, 'vértices en buffer overlay');

  } catch (err) {
    fail++;
    console.error('  FAIL Excepción en la prueba:', err);
  } finally {
    await browser.close();
    console.log(`\nResumen REQ-AG13: ${ok} ok, ${fail} fallos.`);
    process.exit(fail ? 1 : 0);
  }
})();
