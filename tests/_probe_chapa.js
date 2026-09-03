// La chapa: centrada en las cabeceras, y CALLADA mientras se juega (el Mundo se abre dentro de «/»).
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  await p.setViewportSize({ width: 1280, height: 760 });

  for (const ruta of ['/', '/map', '/panel', '/menu.html']) {
    await p.goto(BASE + ruta, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const c = document.getElementById('vf-quien');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { centro: Math.round(b.left + b.width / 2), ancho: innerWidth, clases: c.className, y: Math.round(b.top) };
    });
    if (!r) { console.log(ruta.padEnd(11), 'sin chapa'); continue; }
    const desvio = Math.abs(r.centro - r.ancho / 2);
    console.log(ruta.padEnd(11), 'centro=' + r.centro, 'de', r.ancho, '· y=' + r.y,
                desvio < 40 ? '✓ centrada' : '⛔ descentrada (' + Math.round(desvio) + ' px)', '·', r.clases);
  }

  // Y ahora jugando: se abre el Mundo desde el editor y la chapa tiene que desaparecer.
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(1500);
  console.log('antes de jugar, ¿se ve?', await p.$eval('#vf-quien', e => e.offsetParent !== null || getComputedStyle(e).display !== 'none'));
  await p.click('.tab-mundo');
  await p.waitForTimeout(9000);
  const jugando = await p.evaluate(() => ({
    modal: !document.getElementById('mc-modal').hidden,
    vista: getComputedStyle(document.getElementById('vf-quien')).display,
  }));
  console.log('jugando: modal abierto =', jugando.modal, '· chapa display =', jugando.vista,
              (jugando.modal && jugando.vista === 'none') ? '  ✓ callada' : '  ⛔ SE VE JUGANDO');
  // Y al salir del Mundo vuelve.
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1200);
  console.log('al volver al editor, chapa display =',
              await p.$eval('#vf-quien', e => getComputedStyle(e).display));
  await nav.close();
})();
