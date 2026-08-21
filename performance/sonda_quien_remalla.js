// ¿Quién manda remallar el mundo ENTERO con la escena en reposo? Cuenta las llamadas y guarda la
// PILA de cada una: la pila nombra al culpable aunque sea un snippet (sale como AsyncFunction/eval).
// Uso: node performance/sonda_quien_remalla.js [mapa] [segundos]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const segs = +(process.argv[3] || 12);
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(6000);            // que termine de arrancar

  await p.evaluate(() => {
    window._espia = { llamadas: {}, pilas: {} };
    const vigilar = ['mcMeshAll', 'mcComputeLight', 'mcComputeBlockLight', 'mcRestampAll', 'mcBuildPalette', 'mcRelightBox', 'mcDirty', 'mcShadowDirty'];
    for (const n of vigilar) {
      if (typeof window[n] !== 'function') continue;
      const orig = window[n];
      window[n] = function (...a) {
        const e = window._espia;
        e.llamadas[n] = (e.llamadas[n] || 0) + 1;
        if ((e.pilas[n] || []).length < 3) {
          (e.pilas[n] = e.pilas[n] || []).push(new Error().stack.split('\n').slice(1, 7).join(' ⇦ '));
        }
        return orig.apply(this, a);
      };
      window[n]._orig = orig;
    }
  });

  await p.waitForTimeout(segs * 1000);     // QUIETO: nadie toca nada

  const r = await p.evaluate((segs) => ({
    llamadas: window._espia.llamadas,
    pilas: window._espia.pilas,
    fps: Math.round(mc.fps || 0),
    chunks: mc.chunks ? mc.chunks.size : 0,
    segs,
  }), segs);

  console.log('== ' + segs + ' s QUIETO en /map/' + mapa + ' · ' + r.fps + ' fps · ' + r.chunks + ' chunks ==');
  console.log('llamadas:', JSON.stringify(r.llamadas, null, 1));
  for (const n in r.pilas) {
    console.log('\n-- ' + n + ' · quién lo llama --');
    for (const s of r.pilas[n]) console.log('   ' + s.replace(/https?:\/\/[^/]+/g, ''));
  }
  await b.close();
})();
