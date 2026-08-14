// @area: general
// @necesita: servidor, playwright
//
// REQ-WIKI1 · La wiki de /wiki.
//
// Dos cosas distintas se guardan aquí, y la primera es la que de verdad importa:
//
//  A) Que la DOCUMENTACIÓN no mienta. wiki/api.json dice de cada API en qué símbolo de app.js está
//     implementada. Un renombrado deja eso viejo en silencio y nadie se entera hasta que alguien va a
//     buscar la función y no está. Aquí se comprueba símbolo a símbolo contra app.js.
//  B) Que el renderizador y el enlazado automático hagan su trabajo: un nombre de API dentro de un
//     bloque de código tiene que salir como ENLACE a su ficha. Ésa es toda la gracia del encargo
//     («quiero saber qué es toast y cómo se usa»), así que si se rompe, se rompe el producto.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');           // los tests se lanzan desde la RAÍZ, pero esto no depende del cwd
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA  ' + nombre + '\n         ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

const api = JSON.parse(fs.readFileSync(path.join(RAIZ, 'wiki/api.json'), 'utf8'));
const indice = JSON.parse(fs.readFileSync(path.join(RAIZ, 'wiki/indice.json'), 'utf8'));
const ENTRADAS = api.entradas;
const NOMBRES = new Set(ENTRADAS.map(e => e.nombre));

(async () => {
  console.log('\n§1 · api.json no miente sobre app.js');
  {
    const src = fs.readFileSync(path.join(RAIZ, 'web', 'app.js'), 'utf8');
    const huerfanos = [];
    for (const e of ENTRADAS) {
      const sim = String(e.fuente || '').split('·')[1];
      if (!sim) { huerfanos.push(e.nombre + ' (sin fuente)'); continue; }
      // \b no vale con nombres tipo `game.snippet`: se comprueba que el símbolo aparezca tal cual.
      if (src.indexOf(sim.trim()) < 0) huerfanos.push(e.nombre + ' → ' + sim.trim());
    }
    test('cada `fuente` sigue existiendo en app.js',
      () => assert(!huerfanos.length, 'símbolos que ya no están: ' + huerfanos.join(', ')));
    test('hay entradas de sobra para los ejemplos', () => assert(ENTRADAS.length >= 30, 'solo ' + ENTRADAS.length));
  }

  console.log('\n§2 · las fichas están completas y no se enlazan a la nada');
  {
    const rotos = [], pelados = [];
    for (const e of ENTRADAS) {
      for (const v of (e.ver || [])) if (!NOMBRES.has(v)) rotos.push(e.nombre + ' → ' + v);
      // [[x]] es la cita de una API dentro del texto: si x no existe, el enlace lleva a «No existe».
      for (const m of JSON.stringify(e).matchAll(/\[\[([^\]]+)\]\]/g)) if (!NOMBRES.has(m[1].trim())) rotos.push(e.nombre + ' → [[' + m[1] + ']]');
      if (!e.firma || !e.resumen || !e.grupo) pelados.push(e.nombre);
    }
    test('ningún «ver también» ni [[cita]] apunta a una ficha inexistente',
      () => assert(!rotos.length, rotos.join(', ')));
    test('toda ficha tiene firma, resumen y grupo', () => assert(!pelados.length, pelados.join(', ')));
    test('no hay nombres duplicados', () => assert(NOMBRES.size === ENTRADAS.length,
      ENTRADAS.length + ' entradas pero ' + NOMBRES.size + ' nombres'));
  }

  console.log('\n§3 · el índice y sus páginas existen en disco');
  {
    const faltan = [];
    for (const s of indice.secciones) for (const p of s.paginas) {
      if (p.tipo === 'api') continue;
      if (!fs.existsSync(path.join(RAIZ, 'wiki/paginas', p.id + '.md'))) faltan.push(p.id + '.md');
    }
    test('cada fila del índice tiene su .md', () => assert(!faltan.length, 'faltan: ' + faltan.join(', ')));
  }

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage();
  const errores = [];
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  p.on('pageerror', e => errores.push(String(e)));
  // Entrar por /wiki (sin barra) a propósito: es el enlace que se va a escribir en todas partes, y lo
  // que lo hace funcionar es el 301 del servidor estático — no hay ruta en server.py que lo sostenga.
  await p.goto('http://localhost:8500/wiki', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('#nav a', { timeout: 20000 });

  console.log('\n§4 · /wiki abre y trae la primera página');
  {
    const r = await p.evaluate(`({
      url: location.pathname,
      titulo: (document.querySelector('#cuerpo h1') || {}).textContent,
      enlaces: document.querySelectorAll('#nav a').length,
      secciones: document.querySelectorAll('#nav .sec').length,
      preS: document.querySelectorAll('#cuerpo pre').length
    })`);
    test('/wiki sin barra acaba sirviendo la wiki', () => assert(r.url === '/wiki/', 'url=' + r.url));
    // El título esperado se DERIVA: cuál es la primera página la decide `indice.json`, y su h1 lo
    // decide el `# …` del .md (que NO tiene por qué ser el rótulo del índice — «iconos» se llama
    // distinto en cada sitio a propósito). Escrito a mano aquí, este test rompía por el cambio
    // legítimo —añadir una sección delante— y no por el fallo que vigila: «sin hash, ¿carga algo?».
    const primeraId = indice.secciones[0].paginas[0].id;
    const primeraH1 = (fs.readFileSync(path.join(RAIZ, 'wiki/paginas', primeraId + '.md'), 'utf8')
                         .match(/^#\s+(.+)$/m) || [, ''])[1].trim();
    test('sin hash entra por la primera página del índice',
      () => assert(primeraH1 && (r.titulo || '').trim() === primeraH1,
                   'h1=' + r.titulo + ' · ' + primeraId + '.md dice=' + primeraH1));
    test('el panel lateral tiene sus secciones y sus enlaces',
      () => assert(r.secciones >= 2 && r.enlaces >= 4, 'secs=' + r.secciones + ' enlaces=' + r.enlaces));
    test('el Markdown se renderizó (hay bloques de código)', () => assert(r.preS >= 1, 'pre=' + r.preS));
  }

  console.log('\n§5 · un nombre de API dentro de un ejemplo ES un enlace a su ficha');
  {
    await p.evaluate(`location.hash = '#/autoarranque'`);
    await p.waitForFunction(`/Autoarranque/.test((document.querySelector('#cuerpo h1')||{}).textContent||'')`, null, { timeout: 20000 });
    const r = await p.evaluate(`(() => {
      const as = [...document.querySelectorAll('#cuerpo pre a.apiref')];
      const t  = as.map(a => a.textContent);
      const def = as.find(a => a.textContent === 'game.osd.define');
      return { cuantos: as.length, tiene: t, href: def ? def.getAttribute('href') : null,
               cortos: t.filter(x => x === 'game.osd').length };
    })()`);
    test('los ejemplos enlazan varias APIs', () => assert(r.cuantos >= 10, 'solo ' + r.cuantos));
    test('«game.osd.define» apunta a su propia ficha',
      () => assert(r.href === '#/api/game.osd.define', 'href=' + r.href));
    // El enlazado va de más largo a más corto: si ganara `game.osd`, quedaría un enlace a la ficha
    // equivocada seguido de un `.define` suelto, que es peor que no enlazar nada.
    test('gana el nombre LARGO: no aparece «game.osd» partido',
      () => assert(r.cortos === 0, 'hay ' + r.cortos + ' enlaces a game.osd suelto'));
    test('toast también está enlazado en algún ejemplo',
      () => assert(r.tiene.indexOf('toast') >= 0 || r.tiene.indexOf('game.volar') >= 0, 'enlaces=' + r.tiene.slice(0, 12)));
  }

  console.log('\n§6 · la ficha de una API se lee entera');
  {
    await p.evaluate(`location.hash = '#/api/toast'`);
    await p.waitForFunction(`(document.querySelector('#cuerpo h1')||{}).textContent === 'toast'`, null, { timeout: 20000 });
    const r = await p.evaluate(`({
      firma: (document.querySelector('#cuerpo .firma') || {}).textContent,
      params: document.querySelectorAll('#cuerpo table.params tbody tr').length,
      ejemplo: document.querySelectorAll('#cuerpo pre').length,
      fuente: (document.querySelector('#cuerpo .meta') || {}).textContent || '',
      texto: document.querySelector('#cuerpo').textContent
    })`);
    test('enseña la firma', () => assert(/toast\(mensaje/.test(r.firma || ''), 'firma=' + r.firma));
    test('enseña la tabla de parámetros', () => assert(r.params === 2, 'filas=' + r.params));
    test('enseña un ejemplo', () => assert(r.ejemplo >= 1, 'pre=' + r.ejemplo));
    test('dice dónde está implementada', () => assert(/app\.js/.test(r.fuente), 'meta=' + r.fuente));
    test('contesta a «cuánto dura»', () => assert(/1,8 s/.test(r.texto), 'no sale la duración por defecto'));
  }

  console.log('\n§7 · el índice de API y el buscador');
  {
    await p.evaluate(`location.hash = '#/api'`);
    await p.waitForFunction(`document.querySelectorAll('#cuerpo .tarjeta').length > 0`, null, { timeout: 20000 });
    const todas = await p.evaluate(`document.querySelectorAll('#cuerpo .tarjeta').length`);
    test('el índice lista todas las fichas', () => assert(todas === ENTRADAS.length, todas + ' de ' + ENTRADAS.length));

    await p.evaluate(`(() => { const b = document.querySelector('#buscar'); b.value = 'volar';
                               b.dispatchEvent(new Event('input')); })()`);
    const r = await p.evaluate(`({
      tarjetas: document.querySelectorAll('#cuerpo .tarjeta').length,
      nav: [...document.querySelectorAll('#nav a.api')].map(a => a.textContent)
    })`);
    test('buscar recorta el índice', () => assert(r.tarjetas > 0 && r.tarjetas < todas,
      'tarjetas=' + r.tarjetas + ' de ' + todas));
    test('y también el panel lateral', () => assert(r.nav.indexOf('game.volar') >= 0 && r.nav.indexOf('toast') < 0,
      'nav=' + JSON.stringify(r.nav)));
  }

  console.log('\n§8 · ni una página suelta un error');
  {
    for (const s of indice.secciones) for (const pag of s.paginas) {
      await p.evaluate(`location.hash = '#/' + ${JSON.stringify(pag.id)}`);
      await p.waitForFunction(`!document.querySelector('#cuerpo .cargando')`, null, { timeout: 20000 });
      const h1 = await p.evaluate(`(document.querySelector('#cuerpo h1')||{}).textContent||''`);
      test('«' + pag.id + '» pinta su título', () => assert(h1 && !/No existe/.test(h1), 'h1=' + h1));
    }
    test('consola limpia de errores', () => assert(!errores.length, errores.slice(0, 3).join(' | ')));
  }

  await browser.close();
  console.log('\n' + (fallos ? '❌' : '✅') + '  ' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
