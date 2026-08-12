// @area: editor
// @necesita: servidor, playwright
// test_tool1_ranura_herramienta.js — REQ-TOOL1: la ranura 10 (herramienta activa) y la taxonomía.
//
// Lo que de verdad se vigila aquí no es que la ranura salga, sino la decisión de arquitectura que la
// sostiene: **el vínculo herramienta → dibujo se DERIVA del catálogo**, no está escrito a mano en el
// motor. Escribir `{build:'hab:pico-de-piedra'}` en una tabla es literalmente lo que costó BUG-RS23 y
// BUG-FLUID3, porque `hab:…` y `asset:…` son el mismo dibujo entrando por puertas distintas. Por eso
// el test más importante es el último: se cambia la clave del catálogo y la ranura tiene que seguirlo.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;
  const ok = (c, t, e) => { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t + (e !== undefined ? '   · ' + e : '')); };
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  console.log('\nREQ-TOOL1 · la ranura de la herramienta\n');

  // ── el servidor sirve el vínculo ────────────────────────────────────────────────────────────────
  // Sin esto no hay nada que derivar y todo lo de abajo «pasaría» con la ranura vacía.
  const habs = await (await p.request.get('http://localhost:8500/api/habitantes')).json();
  const herr = {};
  habs.filter(h => h.categoria === 'herramienta').forEach(h => { herr[h.herramienta] = h.id; });
  ok(herr.build === 'pico-de-piedra', '/api/habitantes marca el pico como «build»', herr.build);
  ok(herr.paint === 'pincel-de-texturizado', '…el pincel como «paint»', herr.paint);
  ok(herr.pick === 'cuentagotas', '…el cuentagotas como «pick»', herr.pick);
  ok(herr.select === 'varita-de-selecci-n', '…y la varita como «select»', herr.select);

  // ── el editor 2D/3D: elegir la categoría (petición 4 del dueño) ─────────────────────────────────
  // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
  await p.goto('http://localhost:8500/?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof GAL_CATEGORIAS!=="undefined" && typeof MC_HERRAMIENTAS!=="undefined"', null, { timeout: 120000 });

  const opciones = await p.evaluate(() => Array.from(document.querySelectorAll('#meta-categoria option')).map(o => o.value));
  ok(opciones.length === await p.evaluate(() => GAL_CATEGORIAS.length),
     'el desplegable del editor se pinta desde GAL_CATEGORIAS (una sola lista)', opciones.length + ' opciones');
  ok(opciones[0] === '' && opciones.includes('herramienta') && opciones.includes('redstone'),
     'incluye «herramienta», conserva «redstone» y deja «sin clasificar» la primera', opciones.join(','));

  // El sub-selector solo aparece cuando la categoría es «herramienta»: preguntarle a un adoquín qué
  // herramienta es no tiene sentido.
  const campoVisible = async () => p.evaluate(() => { const e = document.querySelector('#meta-herramienta-campo'); return !!e && !e.hidden; });
  ok(await campoVisible() === false, 'de entrada, «Es la herramienta» está escondido');

  await p.selectOption('#meta-categoria', 'herramienta');
  ok(await campoVisible() === true, 'al elegir «Herramienta» aparece el sub-selector');
  ok(await p.evaluate(() => state.meta.categoria) === 'herramienta', 'y la categoría entra en state.meta');

  await p.selectOption('#meta-herramienta', 'paint');
  ok(await p.evaluate(() => state.meta.herramienta) === 'paint', 'elegir la herramienta la guarda en state.meta');

  // La regresión sutil: cambiar de categoría tiene que SOLTAR el vínculo, o un dibujo que pasa a ser
  // decoración seguiría reclamando ser el pincel y saldría en la galería de herramientas.
  await p.selectOption('#meta-categoria', 'decoracion');
  ok(await p.evaluate(() => state.meta.herramienta) === undefined,
     'cambiar a otra categoría suelta el vínculo con la herramienta');
  ok(await campoVisible() === false, 'y vuelve a esconder el sub-selector');

  // ── el Mundo: la ranura 10 ──────────────────────────────────────────────────────────────────────
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  ok(await p.evaluate(() => mc.tool) === 'build', 'se arranca con el pico (build), que es el defecto que pidió el dueño');
  ok(await p.evaluate(() => localStorage.getItem('vf_mcTool')) === null,
     'y la herramienta ya no se persiste: no puede cambiar sola al recargar');

  const slots = await p.evaluate(() => document.querySelectorAll('#mc-hotbar .mc-slot').length);
  ok(slots === 10, 'la hotbar tiene 10 ranuras: las 9 de bloques y la de herramienta', slots);
  ok(await p.evaluate(() => { const s = document.querySelectorAll('#mc-hotbar .mc-slot'); return s[9] && s[9].id === 'mc-slot-tool'; }),
     'y la de herramienta es la ÚLTIMA (detrás de la 9, no en su sitio)');
  ok(await p.evaluate(() => document.querySelector('#mc-slot-tool .mc-slot-key').textContent) === 'P',
     'se etiqueta «P», no «10»');

  // El catálogo se pide en segundo plano al pintar la ranura; se espera a que resuelva el vínculo.
  await p.waitForFunction('mc.catalog && mc.catalog.length', null, { timeout: 60000 });
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => mcHerramientaKey('build')) === 'hab:pico-de-piedra',
     'la ranura resuelve el dibujo del pico desde el catálogo');
  ok((await p.evaluate(() => document.querySelector('#mc-slot-tool').title)).indexOf('Construir') >= 0,
     'y el rótulo dice qué herramienta hay puesta', await p.evaluate(() => document.querySelector('#mc-slot-tool').title));

  // El dibujo tiene que APROVECHAR la ranura. Se mide la tinta: si se queda dentro pero diminuto —que
  // es lo que pasaba encuadrando la caja de 16³ de un pico de 58 voxels— en 42 px no se distingue qué
  // herramienta hay puesta, que es justo lo único que la ranura tiene que decir.
  const tinta = await p.evaluate(() => {
    const cv = document.querySelector('#mc-slot-tool canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { lado: cv.width, x0: x0, y0: y0, x1: x1, y1: y1 };
  });
  const ocupa = Math.max(tinta.x1 - tinta.x0 + 1, tinta.y1 - tinta.y0 + 1) / tinta.lado;
  ok(ocupa > 0.8, 'el dibujo llena la ranura (no sale diminuto dentro de su caja)', Math.round(ocupa * 100) + '% del lado');
  ok(tinta.x0 >= 0 && tinta.y0 >= 0 && tinta.x1 < tinta.lado && tinta.y1 < tinta.lado && ocupa <= 1,
     'y cabe entera: no se sale ni se recorta por los bordes',
     tinta.x0 + '..' + tinta.x1 + ' × ' + tinta.y0 + '..' + tinta.y1 + ' de ' + tinta.lado);

  // Y las NUEVE de bloque van por el mismo camino (el dueño lo pidió al ver la ranura P al lado): el
  // icono es el objeto en iso sobre transparente, no la cara de arriba de su textura recortada del
  // atlas. Se comprueba por las esquinas: una cara del atlas llena el lienzo de borde a borde, así que
  // si las cuatro esquinas están vacías es que lo que hay dibujado es el objeto.
  const bloque = await p.evaluate(() => {
    const cv = document.querySelector('#mc-hotbar .mc-slot:not(.empty):not(.mc-slot-tool) canvas');
    if (!cv) return null;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const alfa = (x, y) => d[(y * cv.width + x) * 4 + 3];
    const m = 2, L = cv.width - 3;
    return { lado: cv.width, esquinas: [alfa(m, m), alfa(L, m), alfa(m, L), alfa(L, L)],
             centro: alfa(cv.width >> 1, cv.height >> 1) };
  });
  ok(bloque && bloque.lado === 120, 'las ranuras de bloque dibujan a 120 px, no a los 16 del atlas', bloque && bloque.lado);
  ok(bloque && bloque.esquinas.every(a => a === 0), 'y sobre fondo transparente (esquinas vacías)', bloque && bloque.esquinas.join(','));
  ok(bloque && bloque.centro > 8, 'con el bloque dibujado en medio', bloque && bloque.centro);

  // ── P sigue rotando, y la ranura se entera ──────────────────────────────────────────────────────
  const pulsaP = async (mods) => { await p.keyboard.press((mods || '') + 'p'); await p.waitForTimeout(250); };
  await pulsaP();
  ok(await p.evaluate(() => mc.tool) === 'paint', 'P sigue rotando: build → paint');
  ok((await p.evaluate(() => document.querySelector('#mc-slot-tool').title)).indexOf('Pintar') >= 0,
     'y la ranura 10 se entera del cambio');
  await pulsaP(); await pulsaP(); await pulsaP();
  ok(await p.evaluate(() => mc.tool) === 'build', 'y la rotación da la vuelta entera (4 pulsaciones)');

  // El ratón sobre la ranura reparte igual que en las de bloque: izquierdo elige, derecho abre la
  // galería. Que el izquierdo ROTE (y no abra) es petición expresa del dueño, y es la única forma de
  // cambiar de herramienta sin soltar el ratón.
  await p.click('#mc-slot-tool'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => mc.tool) === 'paint', 'clic izquierdo en la ranura rota, igual que la tecla P');
  ok(await p.evaluate(() => document.querySelector('#mc-picker').hidden) === true, 'y NO abre la galería');
  await p.click('#mc-slot-tool', { button: 'right' });
  await p.waitForFunction('document.querySelector("#mc-picker") && !document.querySelector("#mc-picker").hidden', null, { timeout: 30000 });
  ok(await p.evaluate(() => mc.pickTool) === true, 'clic derecho sí abre la galería de herramientas');
  ok(await p.evaluate(() => mc.tool) === 'paint', 'y el derecho no rota nada');
  await p.evaluate(() => mcClosePicker());
  await pulsaP(); await pulsaP(); await pulsaP();   // vuelta a «build» para lo que sigue
  ok(await p.evaluate(() => mc.tool) === 'build', 'se vuelve al pico para seguir');

  // ── alt+P abre la galería, y SOLO con herramientas ──────────────────────────────────────────────
  await pulsaP('Alt+');
  await p.waitForFunction('document.querySelector("#mc-picker") && !document.querySelector("#mc-picker").hidden', null, { timeout: 30000 });
  ok(await p.evaluate(() => mc.pickTool) === true, 'alt+P abre el picker en modo herramienta');
  ok(await p.evaluate(() => mc.tool) === 'build', 'y alt+P NO rota la herramienta (solo abre)');

  const listados = await p.evaluate(() => Array.from(document.querySelectorAll('#mc-picker-grid .mapa-opt')).map(o => o.dataset.key));
  ok(listados.length === 4, 'la galería lista las 4 herramientas y nada más', listados.length + ': ' + listados.join(', '));
  ok(listados.every(k => k.indexOf('pico') >= 0 || k.indexOf('pincel') >= 0 || k.indexOf('cuentagotas') >= 0 || k.indexOf('varita') >= 0),
     'y lo listado son justo los cuatro dibujos de herramienta');
  ok(await p.evaluate(() => document.querySelector('#mc-picker-remove').hidden) === true,
     'no se ofrece «quitar»: siempre hay una herramienta activa');
  ok((await p.evaluate(() => document.querySelector('#mc-picker-title').textContent)).indexOf('ranura P') >= 0,
     'y el título dice de qué ranura se trata');

  // Es EL MISMO picker: el buscador y el desplegable de orden de REQ-GAL4 siguen ahí.
  ok(await p.locator('#mc-picker .gal-orden').count() === 1, 'es el mismo picker de siempre (lleva su orden de REQ-GAL4)');

  // Elegir una herramienta la ACTIVA, no solo la enseña.
  const claveVarita = listados.find(k => k.indexOf('varita') >= 0);
  await p.evaluate(k => document.querySelector('#mc-picker-grid .mapa-opt[data-key="' + k + '"]').click(), claveVarita);
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => mc.tool) === 'select', 'elegir la varita ACTIVA «seleccionar», no solo la enseña');
  ok(await p.evaluate(() => document.querySelector('#mc-picker').hidden) === true, 'y la galería se cierra al elegir');
  ok((await p.evaluate(() => document.querySelector('#mc-slot-tool').title)).indexOf('Seleccionar') >= 0,
     'y la ranura enseña ya la nueva');

  // ── la prueba de fuego: NADA de claves escritas a mano ──────────────────────────────────────────
  // Se le cambia la clave al dibujo del pico en el catálogo, como pasaría si el dueño lo exportara de
  // `hab:` a `asset:`. Si alguien hubiera escrito la clave en una tabla del motor, esto se rompería en
  // silencio y la ranura saldría vacía. Como se deriva, tiene que seguirlo sin enterarse.
  const seguido = await p.evaluate(() => {
    const c = mc.catalog.find(x => x.herramienta === 'build');
    const antes = c.key;
    c.key = 'asset:assets/pico-de-piedra.vox.json';       // el MISMO dibujo por la otra puerta
    const ahora = mcHerramientaKey('build');
    c.key = antes;                                        // se deja el catálogo como estaba
    return { antes: antes, ahora: ahora };
  });
  ok(seguido.ahora === 'asset:assets/pico-de-piedra.vox.json',
     'si el pico cambia de hab: a asset:, la ranura lo sigue (nada está escrito a mano)', seguido.antes + ' → ' + seguido.ahora);

  // Y un dibujo marcado «herramienta» con un valor que el motor no conoce no se ofrece: pulsarlo no
  // haría nada, y enseñar algo que no funciona es peor que no enseñarlo.
  const conIntruso = await p.evaluate(() => {
    mc.catalog.push({ key: 'hab:intruso', name: 'Intruso', icon: '❓', badge: 'guardada',
                      categoria: 'herramienta', herramienta: 'teletransporte', savedAt: '', createdAt: '', count: 1 });
    const n = mcHerramientasConDibujo().length;
    mc.catalog.pop();
    return n;
  });
  ok(conIntruso === 4, 'una «herramienta» que el motor no conoce no se ofrece', conIntruso + ' ofrecidas');

  ok(errores.length === 0, 'sin excepciones en la página', errores.join(' | ') || 'ninguna');
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
