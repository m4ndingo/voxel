// ¿`game.perfDump.forzar()` imprime algo en una página RECIÉN cargada, sin armar nada antes?
// (El dueño lo llamó en /map/plan y no vio ni una línea, 2026-08-20.)
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const todo = [];
  p.on('console', m => todo.push(m.type() + ' | ' + m.text().slice(0, 160)));
  p.on('pageerror', e => todo.push('EXC | ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  await p.goto('http://localhost:8500/map/' + mapa + '?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const n = todo.length;
  const r = await p.evaluate(() => {
    const salida = { assertAntes: game.perfAssert, tipo: typeof game.perfDump.forzar };
    salida.devuelve = game.perfDump.forzar();          // en frío, sin armar
    salida.devuelveEsUndefined = salida.devuelve === undefined;
    delete salida.devuelve;
    game.perfDump();                                   // y el que re-imprime, también en frío
    return salida;
  });
  console.log('== en frío ==', JSON.stringify(r, null, 1));
  console.log('== consola durante la llamada ==');
  for (const l of todo.slice(n)) console.log('  ' + l);
  if (todo.slice(n).length === 0) console.log('  ⛔ NADA. Sería un bug de verdad.');

  // Y el 404 del material, que es lo que de verdad ensucia esta consola.
  console.log('\n== 404 al cargar el mundo ==');
  for (const l of todo.slice(0, n)) if (/404|Failed|fucsia/i.test(l)) console.log('  ' + l);

  await b.close();
})();
