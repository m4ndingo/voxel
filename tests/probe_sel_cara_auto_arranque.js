// @area: mundo
// @necesita: servidor, playwright
// SONDA del parche `herramientas/parche_snp_sel_cara_auto.py`: comprueba que el ARRANQUE del Mundo
// enciende `sel-cara-auto` solo, sin que nadie lo cargue a mano.
//
// Es lo que la sonda hermana (`probe_sel_cara_auto.js`) NO puede ver: aquélla entra con `?noauto=1` y
// carga el snippet ella misma, así que valida el COMPORTAMIENTO pero no el CABLEADO.
//
// Puerto 8514 a propósito: el 8500 es el servidor del dueño y una sonda no se lo reinicia.

const { chromium } = require('playwright');

const PUERTO = process.env.PUERTO || 8514;
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok   · ' : '  FALLA · ') + nom + (extra ? ' (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  // SIN ?noauto=1: es justo el autoarranque lo que se está probando.
  await p.goto('http://localhost:' + PUERTO + '/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });

  // El bloque del parche va aplazado un tick y `game.snippet` es asíncrono: se espera a que aparezca
  // en vez de dormir un rato fijo, que en el navegador de pruebas (1,4 fps) no significa nada.
  let puesto = false;
  try {
    await p.waitForFunction('window.game && game.selAuto && game.selAuto.puesto && game.selAuto.puesto()',
      null, { timeout: 60000 });
    puesto = true;
  } catch (e) { /* lo canta el ok de abajo */ }

  ok('el arranque del Mundo enciende sel-cara-auto solo', puesto);

  if (puesto) {
    const e = await p.evaluate(() => game.selAuto.estado());
    ok('y quedan envueltas las cuatro funciones del motor',
      e.puesto === true && e.version === 'sel-auto-v2', 'version=' + e.version);
    ok('arranca SIN marca a mano (el clic central no se ha tocado)', e.aMano === false);
  }

  ok('sin errores de página', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s)' : '✓ todo ok'));
  process.exit(fallos ? 1 : 0);
})();
