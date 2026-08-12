// @area: editor
// @necesita: servidor, playwright
// test_gal4_buscador_min.js — REQ-GAL4 punto 1: el buscador no busca hasta la 3ª letra.
//
// Se comprueban LAS DOS galerías —la del editor (`#hab-picker-search`) y el picker del Mundo
// (`#mc-picker-search`)— porque hoy son dos copias del mismo patrón y la regla tiene que ser la misma
// en las dos. Fundirlas es el objetivo a la larga del ticket; mientras tanto, esto lo vigila.
//
// La regla, en concreto:
//   · con 1 o 2 letras NO se filtra (se ve el catálogo entero) y sale un aviso de «faltan N letras»;
//   · a la 3ª letra sí filtra;
//   · borrar hasta 2 letras vuelve a enseñarlo todo (no se queda con el filtro viejo puesto).
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;
  const ok = (c, t, e) => { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t + (e !== undefined ? '   · ' + e : '')); };
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
  await p.goto('http://localhost:8500/?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof openHabitantes==="function" && typeof GAL_MIN_BUSCA!=="undefined"', null, { timeout: 120000 });

  console.log('\nREQ-GAL4 · el buscador exige 3 letras\n');
  ok(await p.evaluate(() => GAL_MIN_BUSCA) === 3, 'el mínimo es 3 letras y está en una sola constante');

  // ── la galería del editor ───────────────────────────────────────────────────────────────────────
  await p.evaluate(() => openHabitantes(null));
  await p.waitForFunction('document.querySelectorAll("#hab-grid .hab-card").length > 0', null, { timeout: 60000 });

  // Se teclea de verdad (`type`), no se asigna `.value`: lo que se está vigilando es el `oninput`.
  const teclea = async (sel, txt) => {
    await p.fill(sel, '');
    await p.type(sel, txt, { delay: 10 });
    await p.waitForTimeout(250);
  };
  const nCards = () => p.evaluate(() => document.querySelectorAll('#hab-grid .hab-card').length);
  const aviso = () => p.evaluate(() => { const e = document.querySelector('#hab-modal .gal-aviso-min'); return e && !e.hidden ? e.textContent : ''; });

  const todas = await nCards();
  ok(todas > 3, 'la galería abre con su catálogo', todas + ' tarjetas');

  await teclea('#hab-picker-search', 'ro');
  const con2 = await nCards(), aviso2 = await aviso();
  ok(con2 === todas, 'con 2 letras NO filtra: se sigue viendo todo', con2 + ' vs ' + todas);
  ok(/1 letra/.test(aviso2), 'y avisa de cuántas letras faltan', JSON.stringify(aviso2));

  await teclea('#hab-picker-search', 'roc');
  const con3 = await nCards(), aviso3 = await aviso();
  ok(con3 < todas, 'a la 3ª letra sí filtra', con3 + ' de ' + todas);
  ok(con3 > 0, 'y el filtro encuentra algo (si no, el test no probaría nada)', con3 + ' tarjeta(s)');
  ok(aviso3 === '', 'el aviso desaparece al llegar al mínimo', JSON.stringify(aviso3));

  await teclea('#hab-picker-search', 'ro');
  ok(await nCards() === todas, 'borrar hasta 2 letras vuelve a enseñarlo todo (no se queda el filtro viejo)');

  // ── y que NO filtrar salga gratis ───────────────────────────────────────────────────────────────
  // Esto es la segunda mitad de la regla, y es la que se olvidó al implementarla: no basta con no
  // filtrar, hay que **no repintar**. Repintar cuesta 114 tarjetas con su canvas, su `getRoomData()` y
  // su `drawThumb()`, y el dueño lo vio como una caída de fps del entorno al teclear.
  // Se comprueba por el efecto observable, no por el código: se marcan las tarjetas y, si siguen ahí
  // los MISMOS nodos, es que nadie vació la rejilla para volver a llenarla igual.
  await teclea('#hab-picker-search', '');
  const marcadas = await p.evaluate(() => {
    const c = document.querySelectorAll('#hab-grid .hab-card');
    c.forEach((n, i) => { n.dataset.marca = 'm' + i; });
    return c.length;
  });
  await teclea('#hab-picker-search', 'ro');           // 2 letras: por debajo del mínimo
  const vivas = await p.evaluate(() => document.querySelectorAll('#hab-grid .hab-card[data-marca]').length);
  ok(vivas === marcadas, 'teclear por debajo del mínimo NO repinta la rejilla', vivas + ' de ' + marcadas + ' tarjetas intactas');
  ok(/1 letra/.test(await aviso()), 'pero el aviso sí se actualiza con cada letra (es lo único que cambia)');

  await teclea('#hab-picker-search', 'roc');          // la 3ª sí tiene que repintar
  ok(await p.evaluate(() => document.querySelectorAll('#hab-grid .hab-card[data-marca]').length) < marcadas,
     'y a la 3ª letra sí repinta (si no, no habría filtrado nada)');

  await teclea('#hab-picker-search', '');
  ok(await aviso() === '', 'con la caja vacía tampoco se avisa: no hay nada a medio escribir');
  await p.evaluate(() => { const m = document.querySelector('#hab-modal'); if (m) m.hidden = true; });

  // ── el picker del Mundo ─────────────────────────────────────────────────────────────────────────
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => { await mcBuildCatalog(); mcOpenPicker(0); });
  await p.waitForFunction('document.querySelectorAll("#mc-picker-grid .mapa-opt").length > 0', null, { timeout: 60000 });

  const nItems = () => p.evaluate(() => document.querySelectorAll('#mc-picker-grid .mapa-opt').length);
  const avisoMc = () => p.evaluate(() => { const e = document.querySelector('#mc-picker .gal-aviso-min'); return e && !e.hidden ? e.textContent : ''; });

  const todosMc = await nItems();
  ok(todosMc > 3, 'el picker del Mundo abre con su catálogo', todosMc + ' ítems');

  await teclea('#mc-picker-search', 'ro');
  ok(await nItems() === todosMc, 'con 2 letras NO filtra tampoco aquí', (await nItems()) + ' vs ' + todosMc);
  ok(/1 letra/.test(await avisoMc()), 'y el mismo aviso, que sale del mismo código');

  await teclea('#mc-picker-search', 'roc');
  const mc3 = await nItems();
  ok(mc3 < todosMc && mc3 > 0, 'a la 3ª letra filtra', mc3 + ' de ' + todosMc);

  // El mismo «no repintar» aquí, donde además duele más: cada ítem arranca un `mcStructCells()`.
  await teclea('#mc-picker-search', '');
  const marcadasMc = await p.evaluate(() => {
    const c = document.querySelectorAll('#mc-picker-grid .mapa-opt');
    c.forEach((n, i) => { n.dataset.marca = 'm' + i; });
    return c.length;
  });
  await teclea('#mc-picker-search', 'ro');
  const vivasMc = await p.evaluate(() => document.querySelectorAll('#mc-picker-grid .mapa-opt[data-marca]').length);
  ok(vivasMc === marcadasMc, 'y el picker del Mundo tampoco repinta por debajo del mínimo', vivasMc + ' de ' + marcadasMc + ' ítems intactos');

  ok(errores.length === 0, 'sin excepciones en la página', errores.join(' | ') || 'ninguna');
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
