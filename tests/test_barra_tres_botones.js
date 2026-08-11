// @area: editor
// @necesita: servidor, playwright
// REQ-NAV1 · «solamente quedan 3 botones visibles: [Galería] [Mapa] y [...]» — con la corrección
// posterior del dueño: el botón 2 es 🌍 Mundo, y 🗺 Mapa se va dentro del «⋯».
//
// Lo que se comprueba es lo que se pidió: que la barra tenga TRES botones, que el resto siga estando
// (y funcionando) dentro del menú, que la Galería junte los cuatro buckets sin cerrarse, y que a
// 390 px la barra ocupe UNA fila — que era la ganancia de verdad del ticket, porque el dueño juega
// desde el móvil.
//
// No abre el Mundo ni guarda nada: los POST van bloqueados.
//
//   node test_barra_tres_botones.js [url]        por defecto http://localhost:8500/

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/';
let ok = 0, fallos = 0;
function test(nombre, cond, extra) {
  if (cond) { console.log('  ok    ' + nombre + (extra ? '   (' + extra + ')' : '')); ok++; }
  else { console.log('  FALLO ' + nombre + (extra ? '\n        ' + extra : '')); fallos++; }
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const escribe = o && String(o.method).toUpperCase() !== 'GET';
      if (escribe && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes')))
        return Promise.resolve(new Response('{}', { status: 200 }));
      return orig(u, o);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  // `state` es un `const` de nivel superior: NO es propiedad de `window`. Se pregunta por el ámbito
  // léxico, como hacen los demás tests con `typeof openHabitantes`.
  await p.waitForFunction('typeof state !== "undefined" && typeof openHabitantes === "function" && document.querySelector("#tabs")',
    { timeout: 60000 });
  console.log('\n--- ' + URL + ' ---');

  console.log('\n── A · la barra son tres botones ──');
  const A = await p.evaluate(() => {
    const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    return {
      barra: [...document.querySelectorAll('#tabs .tab')].filter(vis).map(t => t.textContent.trim()),
      menuAbierto: !document.querySelector('#mas-menu').hidden,
    };
  });
  test('hay exactamente 3 botones visibles', A.barra.length === 3, A.barra.join(' · '));
  test('...y son Galería, Mundo y ⋯', /Galer/.test(A.barra[0]) && /Mundo/.test(A.barra[1]) && A.barra[2] === '⋯',
    A.barra.join(' · '));
  test('el menú arranca cerrado', !A.menuAbierto);

  console.log('\n── B · el «⋯» abre, cierra y lleva todo lo demás ──');
  await p.click('#btn-mas');
  const B = await p.evaluate(() => ({
    abierto: !document.querySelector('#mas-menu').hidden,
    aria: document.querySelector('#btn-mas').getAttribute('aria-expanded'),
    items: [...document.querySelectorAll('#mas-menu .menu-item')].map(i => i.firstChild.nodeValue.trim()),
  }));
  test('un clic en ⋯ lo abre', B.abierto && B.aria === 'true');
  // Las nueve que el dueño quería dentro, ni una menos.
  const esperadas = ['🗺 Mapa', '▶ Jugar', '🧩 Código', '🦴 Agentes', 'Nuevo', 'Guardar', 'Guardar como…', 'Exportar', 'Importar'];
  const faltan = esperadas.filter(e => !B.items.some(i => i === e));
  test('están las 9 entradas que salieron de la barra', faltan.length === 0 && B.items.length === 9,
    B.items.length + ' entradas' + (faltan.length ? ' · faltan: ' + faltan.join(', ') : ''));
  // Importar tiene que seguir siendo un <label> con su <input type=file>: como <button> no abriría nada.
  const imp = await p.evaluate(() => {
    const l = [...document.querySelectorAll('#mas-menu .menu-item')].find(i => i.textContent.trim().startsWith('Importar'));
    return { tag: l && l.tagName, input: !!(l && l.querySelector('input[type=file]')), id: l && l.querySelector('input') && l.querySelector('input').id };
  });
  test('Importar sigue siendo un <label> con su <input type=file>', imp.tag === 'LABEL' && imp.input && imp.id === 'file-importar',
    imp.tag + ' · input=' + imp.input + ' · #' + imp.id);

  await p.keyboard.press('Escape');
  test('Esc lo cierra', await p.evaluate(() => document.querySelector('#mas-menu').hidden));
  await p.click('#btn-mas');
  await p.mouse.click(640, 400);
  test('un clic fuera lo cierra', await p.evaluate(() => document.querySelector('#mas-menu').hidden));
  await p.click('#btn-mas');
  await p.click('#btn-mas');
  test('un segundo clic en ⋯ lo cierra', await p.evaluate(() => document.querySelector('#mas-menu').hidden));

  console.log('\n── C · la Galería lo enseña TODO, sin clasificar ──');
  // Decisión del dueño (2026-08-07): «ir a Galería es mostrar todo lo que hay y punto». Ni pastillas
  // ni buckets: lo que se comprueba es que no falta NADA de ninguna de las dos fuentes.
  await p.click('[data-tab="galeria"]');
  await p.waitForFunction('!document.querySelector("#hab-modal").hidden', { timeout: 20000 });
  await p.waitForFunction('!document.querySelector("#hab-grid").textContent.includes("Cargando")', { timeout: 20000 });
  const buckets = ['habitante', 'objeto', 'habitacion', 'textura'];
  const C = await p.evaluate(() => ({
    tarjetas: document.querySelectorAll('#hab-grid .hab-card').length,
    porBucket: [...document.querySelectorAll('#hab-grid .hab-card')].reduce((m, c) => (m[c.dataset.bucket] = (m[c.dataset.bucket] || 0) + 1, m), {}),
    orden: [...document.querySelectorAll('#hab-grid .hab-card')].map(c => c.dataset.bucket),
    titulo: document.querySelector('#hab-title').textContent.trim(),
    pastillas: !!document.querySelector('#hab-buckets'),
  }));
  // Se compara contra la fuente, no contra un número fijo: el total de las dos listas, sin filtrar.
  const fuente = await p.evaluate(async () => {
    const habs = await (await fetch('/api/habitantes', { cache: 'no-store' })).json();
    let idx = []; try { idx = await (await fetch('assets/index.json', { cache: 'no-store' })).json(); } catch (e) {}
    const cuenta = { total: habs.length + idx.length };
    for (const k of ['habitante', 'objeto', 'habitacion', 'textura'])
      cuenta[k] = habs.filter(h => habBucket(h.type) === k).length + idx.filter(a => habBucket(a.type) === k).length;
    return cuenta;
  });
  test('el título es «Galería» y ya no hay selector de buckets', C.titulo === 'Galería' && !C.pastillas,
    C.titulo + ' · #hab-buckets=' + C.pastillas);
  test('salen TODAS las piezas de las dos fuentes, sin filtrar', C.tarjetas === fuente.total,
    C.tarjetas + '/' + fuente.total);
  // Anti-falso-verde del total: que cuadre la suma no basta, tienen que estar los cuatro tipos.
  const malos = buckets.filter(k => (C.porBucket[k] || 0) !== fuente[k]);
  test('...y de cada tipo está lo que hay', malos.length === 0,
    buckets.map(k => k + ': ' + (C.porBucket[k] || 0) + '/' + fuente[k]).join(' · '));
  // Mezclar los cuatro no puede salir revuelto: se agrupa, con las 86 texturas al final.
  const grupos = C.orden.filter((b, i) => b !== C.orden[i - 1]);
  test('las tarjetas salen agrupadas por tipo (cada tipo, un solo bloque)',
    grupos.length === new Set(grupos).size, grupos.join(' → '));

  console.log('\n── D · abrirla y cerrarla no le cambia nada ──');
  await p.keyboard.press('Escape');
  test('Esc cierra la galería (y eso ya es «volver a Objeto»: el lienzo es el fondo)',
    await p.evaluate(() => document.querySelector('#hab-modal').hidden));
  await p.click('[data-tab="galeria"]');
  await p.waitForFunction('!document.querySelector("#hab-modal").hidden', { timeout: 20000 });
  await p.waitForFunction('!document.querySelector("#hab-grid").textContent.includes("Cargando")', { timeout: 20000 });
  test('reabrirla vuelve a enseñarlo todo (no recuerda ningún filtro)',
    await p.evaluate(() => document.querySelector('#hab-title').textContent.trim() === 'Galería'
      && document.querySelectorAll('#hab-grid .hab-card').length > 0),
    await p.evaluate(() => document.querySelector('#hab-title').textContent.trim() + ' · '
      + document.querySelectorAll('#hab-grid .hab-card').length + ' tarjetas'));
  // Los atajos «Galería ▤» del panel derecho SÍ siguen pidiendo un tipo concreto: nacen junto a su
  // roster y ahí el filtro significa algo. Si esto se rompiera, el `kind` habría muerto del todo.
  await p.evaluate(() => openHabitantes('textura'));
  await p.waitForFunction('!document.querySelector("#hab-grid").textContent.includes("Cargando")', { timeout: 20000 });
  const D = await p.evaluate(() => ({
    titulo: document.querySelector('#hab-title').textContent.trim(),
    soloTexturas: [...document.querySelectorAll('#hab-grid .hab-card')].every(c => c.dataset.bucket === 'textura'),
    n: document.querySelectorAll('#hab-grid .hab-card').length,
  }));
  test('openHabitantes("textura") sigue filtrando (lo usan los atajos y otros tests)',
    D.titulo === 'Texturas' && D.soloTexturas && D.n === fuente.textura,
    D.titulo + ' · ' + D.n + '/' + fuente.textura);
  await p.keyboard.press('Escape');

  console.log('\n── E · a 390 px la barra ocupa UNA fila ──');
  // La ganancia real del ticket. Se mide contra el alto de un botón: si la barra envolviera, el alto
  // de #tabs sería el doble o el triple.
  await p.setViewportSize({ width: 390, height: 780 });
  await p.waitForTimeout(200);
  const E = await p.evaluate(() => {
    const tabs = document.querySelector('#tabs'), t0 = document.querySelector('#tabs .tab');
    const r = tabs.getBoundingClientRect(), b = t0.getBoundingClientRect();
    const tops = [...document.querySelectorAll('#tabs .tab')].map(x => Math.round(x.getBoundingClientRect().top));
    return { alto: r.height, botón: b.height, filas: new Set(tops).size, barra: document.querySelector('.topbar').getBoundingClientRect().height };
  });
  test('los tres botones están en la MISMA fila', E.filas === 1, E.filas + ' fila(s)');
  test('...y #tabs no es más alto que un botón', E.alto <= E.botón + 2,
    'alto ' + E.alto.toFixed(1) + ' vs botón ' + E.botón.toFixed(1));
  test('la cabecera entera cabe en menos de 90 px', E.barra < 90, E.barra.toFixed(1) + ' px');

  console.log('\n── F · anti-falso-verde: el menú de verdad ABRE cosas ──');
  // A/B miran el DOM. Si las entradas no hicieran nada, saldrían verdes igual: aquí se pulsa una y se
  // comprueba que abre su panel.
  await p.click('#btn-mas');
  await p.click('#mas-menu [data-tab="codigo"]');
  await p.waitForFunction('!document.querySelector("#snip-modal").hidden', { timeout: 20000 });
  test('«🧩 Código» del menú abre el panel de snippets', true);
  test('...y al pulsarlo el menú se cierra solo', await p.evaluate(() => document.querySelector('#mas-menu').hidden));
  await p.keyboard.press('Escape');

  test('no hay errores de página', errores.length === 0, errores.join(' | '));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();