// Sonda para REQ-PERF1: verifica que el profiler condicional se activa y dispara al caer los fps.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const perfLog = [];
  p.on('console', m => { const t = m.text(); if (t.startsWith('[perf]')) perfLog.push(t); });
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && game && game.perfAssert !== undefined', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = {};
    // Comprobar que la API está expuesta.
    out.tieneAPI = typeof game.perfAssert === 'number' && typeof game.perfVerbosity === 'number' && typeof game.perfDump === 'function';

    // Coste con profiler apagado (defecto).
    out.perfOffAssert = game.perfAssert;
    out.perfOffVerbosity = game.perfVerbosity;

    // Activar con assert alto para forzar disparo (SwiftShader da 10-15 fps).
    game.perfAssert = 60;
    game.perfVerbosity = 1;
    out.perfOn = { assert: game.perfAssert, verbosity: game.perfVerbosity };

    // Esperar unos frames y ver si el profiler dispara.
    await new Promise(s => setTimeout(s, 2000));

    // Comprobar estado interno
    out.armed = !!(window._perfState && _perfState.armed);   // podría no existir el _perfState global
    // Forzar un dump manual para asegurar que la API funciona
    if (game.perfDump && game.perfDump.forzar) game.perfDump.forzar();

    // Bajar assert a 0 (apagar).
    game.perfAssert = 0;
    await new Promise(s => setTimeout(s, 300));
    out.perfOffTrasApagar = game.perfAssert;

    return out;
  });

  console.log('== Estado ==');
  console.log('  tieneAPI:', r.tieneAPI);
  console.log('  perfAssert por defecto:', r.perfOffAssert, '(esperado 0)');
  console.log('  perfVerbosity por defecto:', r.perfOffVerbosity, '(esperado 1)');
  console.log('  perfAssert tras encender:', r.perfOn);
  console.log('  perfAssert tras apagar:', r.perfOffTrasApagar);
  console.log('\n== Logs capturados por consola ([perf]) ==');
  for (const l of perfLog) console.log(l);
  console.log('\nTotal:', perfLog.length, 'líneas [perf]');

  await b.close();
})();
