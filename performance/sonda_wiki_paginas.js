// Sonda: ¿la wiki lista y PINTA las dos páginas nuevas (atajos, iconos)?
// No es un guardián: el guardián es tests/test_wiki.js. Esto solo mira con ojos de navegador,
// que es donde se ve si el markdown se renderiza o se queda en crudo.
//   node performance/sonda_wiki_paginas.js
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

  await p.goto('http://localhost:8500/wiki/');
  await p.waitForTimeout(600);

  const nav = await p.$$eval('nav a, aside a, .nav a', as => as.map(a => a.textContent.trim()));
  console.log('enlaces del panel lateral:', nav);

  for (const [id, esperado] of [['atajos', 'Atajos de teclado'], ['iconos', 'dibujos tuyos']]) {
    await p.goto('http://localhost:8500/wiki/#/' + id);
    await p.waitForTimeout(500);
    const h1 = await p.$eval('h1', e => e.textContent.trim()).catch(() => '(sin h1)');
    const tablas = await p.$$eval('table', ts => ts.length);
    const crudo = await p.evaluate(() => /^#|\|---/m.test(document.body.innerText.slice(0, 400)));
    console.log(`#/${id}  h1="${h1}"  tablas=${tablas}  markdown-crudo=${crudo}  ok=${h1.includes(esperado) || h1.length > 0}`);
  }

  console.log(errores.length ? 'ERRORES: ' + errores.join(' | ') : 'sin errores de página');
  await b.close();
})();
