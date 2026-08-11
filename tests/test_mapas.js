// @area: general
// @necesita: servidor, playwright
// /map/ era la SPA (abria el mundo sagrado); ahora es el LISTADO de mundos y solo /map/<nombre> abre uno.
// Ese reparto es fragil de dos maneras y las dos se guardan aqui:
//   1. si el boton "Abrir" del mundo por defecto apunta a /map/, la pagina se enlaza a si misma (bucle);
//   2. si /map/<nombre> deja de servir index.html, se cae TODO el Mundo, no solo el listado.
// Y en pixeles: la miniatura de un mundo con setas rojas TIENE que salir roja. La primera version pintaba
// por nombre de material y lo que no reconocia caia en un gris-morado; las setas de «lab» salian grises.
// No persiste nada: solo GETs, y ademas bloquea el POST del mundo por si la SPA autoguarda al abrirse.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const RAIZ = 'http://localhost:8500';

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  const rotos = [];
  p.on('response', r => { if (r.status() >= 400) rotos.push(r.status() + ' ' + r.url()); });

  // --- La API ---------------------------------------------------------------------------------
  const api = await (await ctx.request.get(RAIZ + '/api/mundos')).json();
  console.log('\nGET /api/mundos');
  ok('devuelve una lista no vacia', Array.isArray(api) && api.length > 0, api.length + ' mundos');
  const claves = ['nombre', 'dim', 'voxels', 'estructuras', 'notas', 'mb', 'ymax', 'relleno', 'top', 'mtime', 'thumb'];
  ok('cada mundo trae todos los campos de la tarjeta',
    api.every(m => claves.every(k => m[k] !== undefined)),
    claves.join(','));
  ok('el mundo sagrado aparece como «default»', api.some(m => m.nombre === 'default'));
  ok('las miniaturas son PNG embebidos', api.every(m => /^data:image\/png;base64,/.test(m.thumb)));
  // La cache es lo unico que hace viable el listado: en frio son ~33 MB de JSON.
  const t0 = Date.now(); await ctx.request.get(RAIZ + '/api/mundos');
  const t1 = Date.now(); await ctx.request.get(RAIZ + '/api/mundos'); const t2 = Date.now();
  ok('la segunda llamada va por cache (no relee los mundos)', (t2 - t1) <= Math.max(60, (t1 - t0)),
    (t1 - t0) + ' ms -> ' + (t2 - t1) + ' ms');

  // --- La pagina ------------------------------------------------------------------------------
  await p.goto(RAIZ + '/map/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.card', { timeout: 15000 });
  console.log('\nGET /map/ pinta el listado');
  ok('hay una tarjeta por mundo', await p.locator('.card').count() === api.length, api.length + ' tarjetas');
  ok('el resumen cuenta los mundos', /\d+ mundos? · /.test(await p.locator('#resumen').textContent()),
    await p.locator('#resumen').textContent());
  const hrefs = await p.locator('.abrir').evaluateAll(a => a.map(x => x.getAttribute('href')));
  ok('ningun "Abrir" enlaza a /map/ (seria un bucle a esta misma pagina)',
    hrefs.every(h => h !== '/map/' && h !== '/map'), hrefs.join(' '));
  ok('todos los "Abrir" apuntan a /map/<nombre>', hrefs.every(h => /^\/map\/[^/]+$/.test(h)));
  ok('sin peticiones rotas', rotos.length === 0, rotos.join(' '));

  // Filtrar y ordenar son toda la interaccion que tiene la pagina.
  await p.fill('#q', 'zzz-no-existe');
  ok('el filtro sin resultados deja la rejilla vacia', await p.locator('.card').count() === 0);
  await p.fill('#q', '');
  await p.click('#orden button[data-k="voxels"]');
  const vox = await p.locator('.stats b').first().textContent();
  ok('ordenar por voxels pone el mayor primero',
    parseInt(vox.replace(/\./g, ''), 10) === Math.max(...api.map(m => m.voxels)), vox);

  // --- EN PIXELES: las setas rojas de «lab» se ven rojas desde el aire -------------------------
  console.log('\nLa miniatura lleva el color real del material');
  const lab = api.find(m => m.nombre === 'lab');
  if (!lab) {
    ok('el mundo «lab» sigue existiendo (es el que tiene las setas)', false);
  } else {
    ok('«lab» usa red_concrete', lab.top.includes('red_concrete'), lab.top.join(','));
    const cuenta = await p.evaluate(url => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let rojos = 0, verdes = 0, grises = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], v = d[i + 1], a = d[i + 2];
          if (r > 100 && r > v * 2 && r > a * 2) rojos++;
          else if (v > 90 && v > r * 1.4 && v > a * 1.4) verdes++;
          // El gris-morado del fallo original: canales casi iguales y ni claro ni oscuro.
          else if (r > 90 && r < 190 && Math.abs(r - v) < 22 && Math.abs(v - a) < 26) grises++;
        }
        res({ rojos, verdes, grises, total: d.length / 4 });
      };
      im.onerror = () => res(null);
      im.src = url;
    }), lab.thumb);
    ok('la miniatura se decodifica', !!cuenta);
    if (cuenta) {
      ok('las setas salen ROJAS (el fallo original las pintaba grises)',
        cuenta.rojos > cuenta.total * 0.01, cuenta.rojos + ' px rojos de ' + cuenta.total);
      ok('la hierba sale verde', cuenta.verdes > cuenta.total * 0.3, cuenta.verdes + ' px verdes');
      ok('casi nada cae en el gris de "material desconocido"',
        cuenta.grises < cuenta.total * 0.05, cuenta.grises + ' px grises');
    }
  }

  // --- Y /map/<nombre> sigue abriendo el Mundo -------------------------------------------------
  console.log('\n/map/<nombre> sigue siendo la SPA');
  const html = await (await ctx.request.get(RAIZ + '/map/lab')).text();
  ok('/map/lab sirve index.html, no el listado', /id="edit3d"|<base href="\/"/.test(html) && !/id="grid"/.test(html));
  const raiz = await (await ctx.request.get(RAIZ + '/')).text();
  ok('/ sigue siendo el editor', /<base href="\/"/.test(raiz) && !/id="grid"/.test(raiz));
  await p.goto(RAIZ + '/map/lab', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.grid && mc.dim', { timeout: 120000 });
  const cargado = await p.evaluate(() => ({ mapa: mcMapName(), dim: mc.dim.y }));
  ok('y carga ESE mundo, no el sagrado', cargado.mapa === 'lab' && cargado.dim === 60,
    cargado.mapa + ', dim.y=' + cargado.dim);

  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n18 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();