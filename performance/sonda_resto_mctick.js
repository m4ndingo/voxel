// ¿Quién se come mcTick? El volcado tenía 16 ms de mcTick con 1,5 ms repartidos entre sus hijos.
// Esta sonda arma el profiler, deja correr frames y saca el volcado con la fila `(resto de mcTick)`.
// Uso: node performance/sonda_resto_mctick.js [mapa]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const perf = [];
  p.on('console', m => { const t = m.text(); if (t.startsWith('[perf]')) perf.push(t); });
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(5000);   // que se asiente: mallado y streaming fuera

  // Qué costuras hay puestas ANTES de medir: un snippet que envuelve deja `_orig` a la vista.
  const costuras = await p.evaluate(() => {
    const nombres = ['mcUpdate','mcRender','mcTick','mcCaidaPaso','mcFineBoxHit','mcSolid','mcDynSync','mcUpdatePreview'];
    const out = {};
    for (const n of nombres) {
      const f = window[n];
      if (typeof f === 'function') out[n] = { envuelta: !!f._orig, largo: f.toString().length };
    }
    out.fluidos = typeof game.fluidos === 'object' && typeof game.fluidos.tick === 'function';
    out.snippets = (game.snippets && game.snippets.lista) ? game.snippets.lista() : null;
    return out;
  });
  console.log('== costuras instaladas antes de medir ==');
  console.log(JSON.stringify(costuras, null, 1));

  const n0 = perf.length;
  await p.evaluate(() => { game.perfDump.reset(); game.perfVerbosity = 2; game.perfContinuo = true; game.perfAssert = 60; });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { game.perfAssert = 0; });

  // El último volcado completo: desde el penúltimo '=== CAÍDA' hasta el final.
  const lineas = perf.slice(n0);
  const inicios = lineas.map((l, i) => (/CAÍDA DE FPS/.test(l) ? i : -1)).filter(i => i >= 0);
  const desde = inicios.length ? inicios[inicios.length - 1] : 0;
  console.log('\n== último volcado (' + inicios.length + ' caídas en 4 s) ==');
  for (const l of lineas.slice(desde)) console.log(l);

  await b.close();
})();
