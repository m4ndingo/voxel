// @area: editor
// @necesita: servidor, playwright
// test_gal4_orden.js — REQ-GAL4 punto 2: ordenación de las galerías.
//
// Los cuatro órdenes los fijó el dueño, y dos de ellos significan cosas que NO son obvias mirando el
// código: «recientes» es *importado o modificado* (`savedAt`) y no la fecha de alta (`createdAt`, que es
// «creación», el otro orden), y «tamaño» es el **número de voxels** (`count`), no los bytes del fichero.
// Por eso lo que se comprueba aquí no es que el desplegable exista, sino que cada opción ordena por SU
// campo, que el orden elegido **se recuerda entre sesiones** (localStorage) y que las dos galerías
// —editor y picker del Mundo— comparten la elección, que es hacia dónde va el ticket.
//
// El orden queda ANIDADO en la galería del editor: primero el que elige el dueño y encima el agrupado
// por tipo, que es estable. Así que aquí se comprueba «ordenado dentro de cada grupo», no de la lista
// entera; en el picker del Mundo, que no agrupa, sí se comprueba la lista entera.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;
  const ok = (c, t, e) => { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t + (e !== undefined ? '   · ' + e : '')); };
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  console.log('\nREQ-GAL4 · ordenación de las galerías\n');

  // ── el servidor sirve los tres campos por los que se ordena ─────────────────────────────────────
  // Si esto falla, todo lo de abajo ordenaría por campos vacíos y "pasaría" sin ordenar nada.
  const idx = await (await p.request.get('http://localhost:8500/assets/index.json')).json();
  const habs = await (await p.request.get('http://localhost:8500/api/habitantes')).json();
  // `createdAt` ya no ordena nada (se quitó «creación»), pero se sigue exigiendo a propósito: el dato
  // se guarda porque **no se puede reconstruir después** —salió del mtime, que ya no volverá— y esta
  // línea es lo que impide que alguien lo borre por parecer código muerto.
  const completos = l => l.filter(a => a.savedAt && a.createdAt && typeof a.count === 'number').length;
  ok(completos(idx) === idx.length, 'assets/index.json trae savedAt+createdAt+count en todo', completos(idx) + '/' + idx.length);
  ok(completos(habs) === habs.length, '/api/habitantes trae savedAt+createdAt+count en todo', completos(habs) + '/' + habs.length);

  // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
  await p.goto('http://localhost:8500/?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof openHabitantes==="function" && typeof galOrdenaLista!=="undefined"', null, { timeout: 120000 });

  // «Creación» se quitó a petición del dueño (2026-08-12): enseñaba lo mismo que «recientes», porque
  // las dos fechas coinciden en todo lo anterior al ticket. El dato `createdAt` sigue guardándose —eso
  // se comprueba arriba— pero no hay opción para él.
  ok(await p.evaluate(() => GAL_ORDENES.map(o => o[0]).join(',')) === 'recientes,nombre,tamano',
     'los tres órdenes del dueño, y «recientes» el primero (= el defecto)');
  ok(await p.evaluate(() => GAL_ORDENES.some(o => o[0] === 'creacion')) === false,
     'y «creación» ya no está en el desplegable');

  // ── el comparador, en seco ──────────────────────────────────────────────────────────────────────
  // Se prueba `galOrdenaLista` directamente porque es el único sitio donde vive la regla: si aquí
  // ordena bien, las dos galerías ordenan bien.
  //
  // La muestra está montada para que los tres órdenes den TRES RESULTADOS DISTINTOS, y distintos
  // también del orden en que se le entrega la lista. Si no, un comparador roto que no ordenase nada
  // pasaría el test. `createdAt` va **al revés** que `savedAt` a propósito: así «recientes» no puede
  // colar el campo equivocado y salir bien por casualidad.
  const seco = await p.evaluate(() => {
    const muestra = [
      { name:'Media', savedAt:'2026-01-01T00:00:00', createdAt:'2026-08-01T00:00:00', count:300 },
      { name:'alfa',  savedAt:'2026-04-01T00:00:00', createdAt:'2026-04-01T00:00:00', count:10  },
      { name:'Zeta',  savedAt:'2026-08-01T00:00:00', createdAt:'2026-01-01T00:00:00', count:50  },
    ];
    const antes = galOrden, r = {};
    for(const o of ['recientes','nombre','tamano']){ galOrden = o; r[o] = galOrdenaLista(muestra).map(x => x.name).join(','); }
    r.intacta = muestra.map(x => x.name).join(',');
    galOrden = antes;
    return r;
  });
  ok(seco.recientes === 'Zeta,alfa,Media', '«recientes» ordena por savedAt, del más nuevo al más viejo', seco.recientes);
  ok(seco.nombre    === 'alfa,Media,Zeta', '«nombre» es alfabético e ignora mayúsculas (alfa antes que Media)', seco.nombre);
  ok(seco.tamano    === 'Media,Zeta,alfa', '«tamaño» ordena por nº de voxels, de mayor a menor', seco.tamano);
  ok(new Set([seco.recientes, seco.nombre, seco.tamano]).size === 3,
     'y los tres dan resultados distintos (si no, el test pasaría sin ordenar nada)');
  ok(seco.intacta   === 'Media,alfa,Zeta', 'y no toca la lista que le dan (devuelve copia)', seco.intacta);

  // Una fecha vacía no puede envenenar el sort ni colarse la primera.
  const huecos = await p.evaluate(() => {
    const antes = galOrden; galOrden = 'recientes';
    const r = galOrdenaLista([{name:'sin fecha'}, {name:'con fecha', savedAt:'2020-01-01T00:00:00'}]).map(x => x.name).join(',');
    galOrden = antes; return r;
  });
  ok(huecos === 'con fecha,sin fecha', 'lo que no tiene fecha cae al final, no al principio', huecos);

  // ── la galería del editor ───────────────────────────────────────────────────────────────────────
  await p.evaluate(() => openHabitantes(null));
  await p.waitForFunction('document.querySelectorAll("#hab-grid .hab-card").length > 0', null, { timeout: 60000 });

  const sel = '#hab-modal .gal-orden';
  ok(await p.locator(sel).count() === 1, 'la galería del editor monta UN desplegable de orden');

  const elige = async (donde, valor) => {
    await p.selectOption(donde, valor);
    await p.waitForTimeout(400);
  };
  // Cada tarjeta declara su grupo en `data-bucket`; se comprueba orden DENTRO de cada grupo.
  // El nombre se lee del `title`, no del texto: el texto visible lleva delante el icono del asset
  // («🔨 Herrería») y detrás la etiqueta «asset», y se ordena por el nombre pelado.
  const nombresPorGrupo = () => p.evaluate(() => {
    const g = {};
    document.querySelectorAll('#hab-grid .hab-card').forEach(c => {
      const b = c.dataset.bucket || '?';
      (g[b] = g[b] || []).push(c.querySelector('.hab-name').title || '');
    });
    return g;
  });

  await elige(sel, 'nombre');
  const porNombre = await nombresPorGrupo();
  const grupos = Object.keys(porNombre);
  ok(grupos.length > 1, 'siguen agrupadas por tipo (ordenar no deshace el agrupado)', grupos.join('+'));
  let desordenados = [];
  for (const g of grupos) {
    const v = porNombre[g];
    for (let i = 1; i < v.length; i++) {
      if (v[i - 1].localeCompare(v[i], 'es', { sensitivity: 'base' }) > 0) { desordenados.push(g + ': ' + v[i - 1] + ' > ' + v[i]); break; }
    }
  }
  ok(desordenados.length === 0, 'y dentro de cada grupo van alfabéticas', desordenados.join(' | ') || 'todos los grupos ordenados');

  // Cambiar de orden tiene que MOVER las tarjetas: si la lista sale idéntica, el desplegable no manda.
  const planas = async () => (Object.values(await nombresPorGrupo())).flat().join(',');
  const conNombre = await planas();
  await elige(sel, 'tamano');
  const conTamano = await planas();
  ok(conTamano !== conNombre, 'cambiar a «tamaño» reordena de verdad la galería');

  // ── se recuerda entre sesiones ──────────────────────────────────────────────────────────────────
  ok(await p.evaluate(() => localStorage.getItem('vf_galOrden')) === 'tamano', 'la elección se guarda en localStorage');
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof openHabitantes==="function" && typeof galOrdenaLista!=="undefined"', null, { timeout: 120000 });
  ok(await p.evaluate(() => galOrden) === 'tamano', 'y sobrevive a recargar la página (el dueño lo pidió expresamente)');
  await p.evaluate(() => openHabitantes(null));
  await p.waitForFunction('document.querySelectorAll("#hab-grid .hab-card").length > 0', null, { timeout: 60000 });
  ok(await p.locator(sel).inputValue() === 'tamano', 'el desplegable abre marcando el orden que está aplicado');
  ok(await planas() === conTamano, 'y la galería abre ya ordenada así, sin tocar nada');
  await p.evaluate(() => { const m = document.querySelector('#hab-modal'); if (m) m.hidden = true; });

  // ── el picker del Mundo: mismo código, misma elección ───────────────────────────────────────────
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => { await mcBuildCatalog(); mcOpenPicker(0); });
  await p.waitForFunction('document.querySelectorAll("#mc-picker-grid .mapa-opt").length > 0', null, { timeout: 60000 });

  const selMc = '#mc-picker .gal-orden';
  ok(await p.locator(selMc).count() === 1, 'el picker del Mundo monta el mismo desplegable');
  ok(await p.locator(selMc).inputValue() === 'tamano', 'y llega con el orden elegido en la OTRA galería');

  // El catálogo del Mundo tiene que traer los campos, o el desplegable ordenaría por nada.
  const campos = await p.evaluate(() => {
    const c = mc.catalog || [];
    return { n: c.length, ok: c.filter(x => x.savedAt && x.createdAt && typeof x.count === 'number').length };
  });
  ok(campos.n > 0 && campos.ok === campos.n, 'mc.catalog arrastra savedAt+createdAt+count', campos.ok + '/' + campos.n);

  // Aquí no hay agrupado: la lista entera tiene que salir ordenada.
  const cuentas = () => p.evaluate(() => Array.from(document.querySelectorAll('#mc-picker-grid .mapa-opt'))
    .map(o => (mc.catalog.find(c => c.key === o.dataset.key) || {}).count | 0));
  const porTamano = await cuentas();
  ok(porTamano.length > 3 && porTamano.every((v, i) => i === 0 || porTamano[i - 1] >= v),
     'el picker sale ordenado por nº de voxels, de mayor a menor', porTamano.slice(0, 5).join(' ≥ ') + ' …');

  await elige(selMc, 'nombre');
  const nombresMc = await p.evaluate(() => Array.from(document.querySelectorAll('#mc-picker-grid .mapa-opt'))
    .map(o => ((mc.catalog.find(c => c.key === o.dataset.key) || {}).name) || ''));
  const malMc = nombresMc.findIndex((v, i) => i > 0 && nombresMc[i - 1].localeCompare(v, 'es', { sensitivity: 'base' }) > 0);
  ok(malMc === -1, 'y por nombre también', malMc === -1 ? nombresMc.slice(0, 3).join(', ') + ' …' : nombresMc[malMc - 1] + ' > ' + nombresMc[malMc]);

  ok(errores.length === 0, 'sin excepciones en la página', errores.join(' | ') || 'ninguna');
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
