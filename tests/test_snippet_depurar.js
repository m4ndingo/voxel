// @area: general
// @necesita: servidor, playwright
//
// REQ-SNIP1 · Depurar un snippet que revienta.
//
// Un snippet se compila con `new AsyncFunction(code)`, así que el navegador lo llama «VM2571» y da una
// línea que no es la del panel. El dueño lo reportó con este error suyo, que es el caso §1:
//
//   [snippet] SyntaxError: missing ) after argument list (at VM2571:5:21)
//
// —una llamada `define('clave': {cfg})` copiada de la tabla DEFECTOS, donde sí lleva dos puntos porque
// allí es un objeto literal. El fallo estaba en la línea 3, no en la 5, y «VM2571» no lleva a ningún
// sitio. Lo que se comprueba aquí es que el informe señale la línea DEL PANEL y enseñe su texto.
const { chromium } = require('playwright');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA  ' + nombre + '\n         ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// El error literal del dueño: el `:` que tenía que ser `,` está en la línea 3.
const CODIGO_DUENO = [
  'toast("default")',
  'console.log("aaa")',
  "game.bloques.define('asset:assets/cabeza.vox.json': { mirar: { ejes: 'xy', alcance: 12 } })",
  "game.bloques.define('asset:assets/brazo.vox.json', { mirar: { ejes: 'xy' } })"
].join('\n');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage();
  const consola = [];
  p.on('console', m => consola.push(m.text()));
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });

  // Corre un código y devuelve lo que el motor dedujo, sin pasar por el panel.
  const corre = (code) => p.evaluate(`(async () => {
    let e = null;
    try { await mcCorreSnippet('prueba', ${JSON.stringify('')} + ${JSON.stringify(code)}); }
    catch (err) { e = { nombre: err.name, msg: err.message, linea: err.vfLinea === undefined ? null : err.vfLinea }; }
    return e;
  })()`);

  console.log('\n§1 · el SyntaxError del dueño: la línea del PANEL, no la de la VM');
  {
    const r = await corre(CODIGO_DUENO);
    test('revienta, y es un SyntaxError', () => assert(r && r.nombre === 'SyntaxError', 'r=' + JSON.stringify(r)));
    test('señala la línea 3, que es donde está el «:» de más',
      () => assert(r.linea === 3, 'linea=' + r.linea));
    test('la línea viaja en el propio error (err.vfLinea)',
      () => assert(typeof r.linea === 'number', 'no llegó vfLinea'));
  }

  console.log('\n§2 · el informe enseña la línea culpable y su contexto');
  {
    const informe = consola.filter(t => /snippet «prueba»/.test(t)).pop() || '';
    test('lleva el nombre del snippet y el tipo de error',
      () => assert(/SyntaxError/.test(informe) && /prueba/.test(informe), 'informe=' + informe.slice(0, 200)));
    test('imprime el TEXTO de la línea 3, no solo su número',
      () => assert(/cabeza\.vox\.json/.test(informe), 'informe=' + informe.slice(0, 300)));
    test('marca cuál es con la flecha', () => assert(/→\s*3 │/.test(informe), 'informe=' + informe.slice(0, 300)));
  }

  console.log('\n§3 · un error de EJECUCIÓN (no de sintaxis) también se ubica');
  {
    consola.length = 0;
    const r = await corre('var a = 1;\nvar b = 2;\nnoExisteEstaFuncion();\n');
    test('es el error de ejecución', () => assert(r && /noExisteEstaFuncion/.test(r.msg), 'r=' + JSON.stringify(r)));
    test('lo sitúa en la línea 3 descontando el preámbulo de AsyncFunction',
      () => assert(r.linea === 3, 'linea=' + r.linea));
  }

  console.log('\n§4 · el desfase se MIDE, no se cablea');
  {
    const d = await p.evaluate('mcSnippetDesfase()');
    test('vale 2 en este motor (preámbulo de dos líneas)', () => assert(d === 2, 'desfase=' + d));
  }

  console.log('\n§5 · un snippet correcto sigue corriendo y no informa de nada');
  {
    consola.length = 0;
    const r = await corre('window.__vale = 7;');
    test('no revienta', () => assert(r === null, 'r=' + JSON.stringify(r)));
    const v = await p.evaluate('window.__vale');
    test('el efecto está', () => assert(v === 7, 'v=' + v));
    test('consola limpia de informes', () => assert(!consola.some(t => /✖ snippet/.test(t)),
      'consola=' + JSON.stringify(consola.slice(0, 3))));
  }

  console.log('\n§6 · el panel lleva el cursor a la línea que falló');
  {
    await p.evaluate(`(() => {
      const ta = document.querySelector('#snip-code');
      ta.value = ${JSON.stringify(CODIGO_DUENO)};
      snipMarcaLinea(3);
    })()`);
    const sel = await p.evaluate(`(() => {
      const ta = document.querySelector('#snip-code');
      return ta.value.slice(ta.selectionStart, ta.selectionEnd);
    })()`);
    test('deja seleccionada la línea 3 entera',
      () => assert(/^game\.bloques\.define\('asset:assets\/cabeza/.test(sel), 'sel=' + sel.slice(0, 80)));
  }

  await browser.close();
  console.log('\n' + (fallos ? '❌' : '✅') + '  ' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
