// @area: render
// @necesita: servidor, playwright
// SONDA (no guardián): humo del informe «color-particulas» que registra `parche-luz-dia-ley`.
//
// NO juzga nada visual — para eso las fotos las hace el dueño. Sólo comprueba tres cosas que ya me
// han mordido: que el informe se REGISTRA (Alt+F lo verá), que CORRE sin petar en una escena con
// partículas, y que `game.luzLey.color(...)` acepta las tres formas sin caerse por el desagüe (un
// objeto `{saturacion:1000}` no hacía NADA y no se quejaba: por eso el dueño no veía diferencias).
//
//   node tests/probe_informe_color.js [url]
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
const SNIPPET = execFileSync('python3', [__dirname + '/../herramientas/crea_snp_luz_ley.py', '--ver'],
  { encoding: 'utf8', cwd: __dirname + '/..' });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { const t = m.text(); if (/informe|luzLey|no entiendo/i.test(t)) console.log('[consola]', t); });
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(6000);

  const mandos = await page.evaluate(async code => {
    const AF = Object.getPrototypeOf(async function () { }).constructor;
    await new AF('opts', 'args', code)({}, {});
    const out = { informes_registrados: game.informes.lista().map(i => i.nombre) };
    out.con_objeto = game.luzLey.color({ saturacion: 2.5 });     // la forma que el dueño probó
    out.con_numero = game.luzLey.color(100);                     // se recorta al tope
    out.con_basura = game.luzLey.color('pepino');                // tiene que quejarse, no callarse
    // Partículas de verdad, para que el informe tenga qué medir: color MUY saturado a propósito.
    game.voxelesUI.material('prueba', { emite: true, luz: 6 });
    const y = Math.round((mc.pos[1] + 1) * 16), x0 = Math.round(mc.pos[0] * 16), z0 = Math.round(mc.pos[2] * 16);
    for (let i = 0; i < 40; i++) game.voxelesUI.pon(x0 + i * 4, y, z0 + 24, [0.1, 1, 0.2], 'prueba');
    return out;
  }, SNIPPET);
  console.log(JSON.stringify(mandos, null, 1));

  await page.waitForTimeout(3000);
  const inf = await page.evaluate(() => game.luzLey.informe());
  console.log(JSON.stringify({
    parche: inf.parche, capa: inf.capa,
    semillas: Object.assign({}, inf.semillas, { muestras: inf.semillas.muestras.slice(0, 2) }),
    cuantizacion: inf.cuantizacion.slice(0, 2), campo: inf.campo, loQueVeElOjo: inf.loQueVeElOjo
  }, null, 1));
  await browser.close();
})();
