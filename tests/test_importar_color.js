// @area: editor
// @necesita: servidor, playwright
// BUG-IMP1 · Importar un objeto cuyos colores NO son strings '#rrggbb' (un entero empaquetado, null, un
// objeto…) reventaba el editor entero: `shade`/`hex6` asumían string y `hex.slice` lanzaba
// `TypeError`, y como pasa dentro del render de la miniatura iso, tumbaba la página.
//
// Se prueban las funciones de color de verdad (hex6/shade) en la página del editor:
//   · un color ENTERO empaquetado (0xRRGGBB) se recupera como '#rrggbb' (no se pierde el color);
//   · un color en formato desconocido (null, objeto) cae en un magenta de error, sin crashear;
//   · un import con colores numéricos se pinta sin lanzar una sola excepción.
//
//   node tests/test_importar_color.js [url]      por defecto http://localhost:8500/
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/';
let fallos = 0;
function ok(c, m, x) { if (!c) fallos++; console.log((c ? '  ok  ' : '  FALLA  ') + m + (x ? '   · ' + x : '')); }

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof hex6==="function" && typeof shade==="function" && typeof drawIso==="function"', null, { timeout: 60000 });
  await p.waitForTimeout(1000);

  const r = await p.evaluate(() => {
    const out = { errs: [] };
    // 1 · las funciones de color aguantan tipos raros
    try {
      out.numRecuperado = hex6(0xff8844);      // entero empaquetado → '#ff8844'
      out.strIntacto = hex6('#abcdef');        // string válido, sin tocar
      out.cortoExpande = hex6('#abc');          // '#abc' → '#aabbcc'
      out.nullFallback = hex6(null);            // null → magenta, sin crashear
      out.objFallback = hex6({});               // objeto → magenta
      shade(0xff8844, 1); shade(null, 1); shade({}, 0.5);   // NO deben lanzar
      out.shadeOk = true;
    } catch (e) { out.errs.push('color: ' + e); out.shadeOk = false; }

    // 2 · un "import" con colores NUMÉRICOS se pinta sin excepción (el caso del dueño)
    try {
      const antes = new Map(state.voxels);
      state.voxels.clear();
      state.voxels.set('0,0,0', 0xff8844);   // colores como ENTEROS, como el fichero que petaba
      state.voxels.set('1,0,0', 0x2244cc);
      state.voxels.set('0,1,0', 0x33aa55);
      drawIso();                              // la miniatura iso: aquí crasheaba
      state.voxels = antes; drawIso();
      out.pintado = true;
    } catch (e) { out.errs.push('drawIso: ' + e); out.pintado = false; }
    return out;
  });

  console.log('\n§1 · las funciones de color aguantan cualquier tipo (no solo strings)');
  ok(r.numRecuperado === '#ff8844', 'un color ENTERO empaquetado se recupera como su hex', String(r.numRecuperado));
  ok(r.strIntacto === '#abcdef' && r.cortoExpande === '#aabbcc', 'los strings válidos se comportan igual que siempre');
  ok(r.nullFallback === '#ff00ff' && r.objFallback === '#ff00ff', 'null/objeto → magenta de error, no crash');
  ok(r.shadeOk === true, 'shade() no lanza con entero, null ni objeto');

  console.log('\n§2 · un import con colores numéricos se pinta (la miniatura iso ya no revienta)');
  ok(r.pintado === true, 'drawIso() con voxels de color entero no lanza', (r.errs || []).join(' | '));

  console.log('\n§3 · sin excepciones en la página');
  ok(errores.length === 0, 'ninguna', errores.slice(0, 3).join(' | '));

  console.log(fallos ? ('\n' + fallos + ' FALLO(S)') : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
