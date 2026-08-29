// @area: mundo
// @necesita: servidor, playwright
// SONDA de limpieza: retira los bloques que dejaron las sondas de diagnóstico del bug de las piezas
// giradas (2026-08-28). Se apunta CELDA A CELDA lo que se plantó, en vez de barrer una caja a lo
// bruto, porque `/map/test` y `/map/empty` no son míos y ahí hay cosas del dueño.
//
//   node tests/probe_limpia_sondas_ori.js [http://localhost:8500]
const { chromium } = require('playwright');

const SITIO = process.argv[2] || 'http://localhost:8500';
const RASTRO = [
  // mapa,        celdas plantadas por las sondas
  ['empty', [[51, 15, 45],                                  // probe_casita_ori_structs (casita@2)
             [47, 15, 44], [49, 15, 44],                    // …(seiheki @2 y recta)
             [45, 15, 43], [47, 15, 43], [49, 15, 43]]],    // …(minisilla @3, @2 y recta)
  ['test',  [[47, 15, 44], [49, 15, 44]]]                   // …(casita @2 y recta)
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [mapa, celdas] of RASTRO) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(SITIO + '/map/' + mapa, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
    await page.waitForTimeout(4000);
    const r = await page.evaluate(cs => {
      const fuera = [];
      for (const c of cs) {
        const id = mc.grid[mcIdx(c[0], c[1], c[2])];
        if (!id) continue;
        fuera.push(c.join(',') + '=' + mc.blockKey[id]);
        mcSetBlock(c[0], c[1], c[2], 0);
        if (typeof mcRemeshAround === 'function') mcRemeshAround(c[0], c[1], c[2]);
      }
      if (typeof mcScheduleSave === 'function') mcScheduleSave();
      return fuera;
    }, celdas);
    console.log('/map/' + mapa + ': ' + (r.length ? r.join(' · ') : 'nada que quitar'));
    await page.waitForTimeout(5000);          // que el guardado en cola llegue a disco
    await page.close();
  }
  await browser.close();
})();
