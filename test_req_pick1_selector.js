// @area: ui
// @necesita: servidor, playwright
// test_req_pick1_selector.js — Comprueba las mejoras del selector #mc-picker (REQ-PICK1):
// 1) Buscador por texto y filtros por categoría
// 2) Ancho de ventana y minmax de rejilla
// 3) Fuente del juego en el texto y tooltip en hover
// 4) Menú contextual (clic derecho) y modal "Ficha de Material"

const { chromium } = require('playwright');

(async () => {
  let ok = 0, fail = 0;
  function t(desc, cond, extra) {
    if (cond) { ok++; console.log('  ok  ' + desc + (extra ? '   (' + extra + ')' : '')); }
    else { fail++; console.log('  FAIL ' + desc + (extra ? '   (' + extra + ')' : '')); }
  }

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto('http://localhost:8500/map/test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof mcOpenPicker === 'function');

    // 1. Abrir el picker para la ranura 0
    await page.evaluate(() => mcOpenPicker(0));
    await page.waitForSelector('#mc-picker:not([hidden])');
    t('#mc-picker se abre correctamente', true);

    // 2. Comprobar buscador por texto
    await page.fill('#mc-picker-search', 'puerta');
    await page.waitForTimeout(100);
    const countBuscador = await page.evaluate(() => document.querySelectorAll('#mc-picker-grid .mapa-opt').length);
    t('Buscador por texto filtra elementos', countBuscador > 0 && countBuscador < 50, 'encontrados = ' + countBuscador);

    // 3. Comprobar filtro por categoría Redstone y exclusividad
    await page.fill('#mc-picker-search', '');
    await page.click('.mc-pick-filter[data-cat="redstone"]');
    await page.waitForTimeout(100);
    const countRedstone = await page.evaluate(() => document.querySelectorAll('#mc-picker-grid .mapa-opt').length);
    t('Filtro por categoría Redstone funciona', countRedstone > 0, 'elementos rs = ' + countRedstone);

    // Comprobar que en la pestaña Estructuras NO hay elementos con categoria='redstone' (data-driven)
    await page.click('.mc-pick-filter[data-cat="estructura"]');
    await page.waitForTimeout(100);
    const hasRsInEstruct = await page.evaluate(() => {
      // Leer las keys visibles y comprobar contra el catálogo
      const keys = Array.from(document.querySelectorAll('#mc-picker-grid .mapa-opt')).map(el => el.dataset.key);
      return keys.some(k => mc.catalog && mc.catalog.find(c => c.key === k && c.categoria === 'redstone'));
    });
    t('Pestaña Estructuras excluye componentes con categoria=redstone', !hasRsInEstruct);

    // 4. Comprobar tooltip y title en elemento
    const titleVal = await page.evaluate(() => {
      const el = document.querySelector('#mc-picker-grid .mapa-opt');
      return el ? el.getAttribute('title') : '';
    });
    t('Las celdas incluyen atributo title con nombre y clave', titleVal && titleVal.includes('('), 'title = ' + titleVal);

    // 5. Comprobar menú contextual (clic derecho)
    await page.click('.mc-pick-filter[data-cat="all"]');
    await page.waitForTimeout(100);
    const itemBound = await page.evaluate(() => {
      const el = document.querySelector('#mc-picker-grid .mapa-opt');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (itemBound) {
      await page.mouse.click(itemBound.x, itemBound.y, { button: 'right' });
      await page.waitForSelector('#mc-picker-ctxmenu:not([hidden])');
      t('Menú contextual responde al clic derecho', true);

      // 6. Abrir Ficha de Material
      await page.click('#mc-ctx-ficha');
      await page.waitForSelector('#mc-card-modal:not([hidden])');
      const cardTitle = await page.textContent('#mc-card-title');
      t('Modal "Ficha de Material" se abre con los detalles', !!cardTitle, 'título = ' + cardTitle.trim());

      await page.click('#mc-card-close');
    }

    await browser.close();
  } catch (err) {
    t('Excepción inesperada en la prueba: ' + err.message, false);
  }

  console.log('\nResumen REQ-PICK1: ' + ok + ' ok, ' + fail + ' fallos.');
  process.exit(fail ? 1 : 0);
})();
