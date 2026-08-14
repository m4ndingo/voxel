// @area: editor
// @necesita: servidor, playwright
// REQ-OSD1 (2026-08-13) · los dos botones de la esquina del Mundo (🧩 Código y ✕ Cerrar) están QUITADOS.
//
// Este guardián nació al revés: comprobaba que se podían esconder, y luego que estaban ocultos. Las
// dos versiones daban verde con los botones DIBUJADOS en pantalla, porque preguntaban por el atributo
// `hidden` —la intención del código— y `.btn{display:inline-flex}` se lo comía. Ahora se comprueba lo
// único que no admite interpretación: que los elementos NO ESTÁN EN EL DOM, y que tampoco queda la
// API que los encendía (`game.showOSDbuttons`) ni su rastro en `localStorage` (`vf_showOSD`), que era
// lo que los resucitaba en el navegador del dueño en cada carga.
//
// Lo que de verdad hay que proteger aquí NO es esconderlos, es no dejar el Mundo sin salida:
//   1. escritorio: ni un botón, y `Esc` cierra + `Alt+C` abre los snippets;
//   2. táctil de 390 px: el ✕ de `#mc-touch` está, se ve y CIERRA;
//   3. táctil CON un menú OSD puesto: ese ✕ sigue siendo pulsable — no basta con que se vea, porque
//      la capa del menú (z-index 25) tapa la de mandos (7) y lo dejaría decorativo.
// No persiste nada en el mundo: solo lee, y bloquea el POST por si la SPA autoguarda al abrirse.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const RAIZ = 'http://localhost:8500';
const BLOQUEA_POST = () => {
  const orig = window.fetch;
  window.fetch = (u, o) => {
    const url = String((u && u.url) || u);
    if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url))
      return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return orig(u, o);
  };
};
// «Se puede pulsar» ≠ «se ve»: se pregunta por el elemento que hay EN ESE PUNTO de la pantalla. Un
// botón tapado por una capa a pantalla completa se ve perfectamente y no recibe ni un clic.
const PULSABLE = sel => {
  const e = document.querySelector(sel); if (!e) return 'no existe';
  const r = e.getBoundingClientRect(); if (!r.width || !r.height) return 'no se ve';
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return (e === top || e.contains(top)) ? true : 'tapado por ' + (top ? (top.id || top.className || top.tagName) : 'nada');
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errores = [];

  console.log('\nEscritorio: los botones no existen, y el teclado sigue siendo la puerta');
  const p = await b.newPage();
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(BLOQUEA_POST);
  await p.goto(RAIZ + '/map/test', { waitUntil: 'networkidle' });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 120000 });
  await p.waitForTimeout(1200);

  const r1 = await p.evaluate(() => ({
    codigo: !!document.querySelector('#mc-code-btn'),
    cerrar: !!document.querySelector('#mc-close'),
    acciones: !!document.querySelector('.mc-actions'),
    api: 'showOSDbuttons' in game,
    enDump: 'showOSDbuttons' in game.dumpVars(),
    guardado: localStorage.getItem('vf_showOSD'),
    tactil: !!game.touchControls
  }));
  ok('el navegador de prueba no es táctil', r1.tactil === false);
  ok('«🧩 Código» no está en el DOM', r1.codigo === false);
  ok('«✕ Cerrar» no está en el DOM', r1.cerrar === false);
  ok('ni el contenedor .mc-actions', r1.acciones === false);
  ok('game.showOSDbuttons ya no existe', r1.api === false);
  ok('…ni sale en game.dumpVars()', r1.enDump === false);
  ok('no se lee ni se escribe vf_showOSD', r1.guardado === null, 'vf_showOSD=' + r1.guardado);

  await p.keyboard.press('Alt+c');
  await p.waitForTimeout(300);
  ok('Alt+C sigue abriendo los snippets', await p.evaluate(() => {
    const m = document.querySelector('#snip-modal'); return !!m && !m.hidden;
  }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok('Esc sigue cerrando el Mundo', await p.evaluate(() => !mc.active));
  await p.close();

  console.log('\nTáctil a 390 px: el ✕ de los mandos es la salida, y CIERRA');
  const p3 = await b.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  p3.on('pageerror', e => errores.push(String(e)));
  await p3.addInitScript(BLOQUEA_POST);
  await p3.goto(RAIZ + '/map/test', { waitUntil: 'networkidle' });
  await p3.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 120000 });
  await p3.waitForTimeout(1200);

  const r3 = await p3.evaluate(([pulsable]) => {
    const f = new Function('sel', 'return (' + pulsable + ')(sel)');
    return { tactil: !!game.touchControls, salir: f('#mc-tsalir'), esquina: !!document.querySelector('#mc-close') };
  }, [PULSABLE.toString()]);
  ok('el contexto sí es táctil', r3.tactil === true);
  ok('el ✕ de salir se puede pulsar', r3.salir === true, String(r3.salir));
  ok('y sigue sin haber botón de esquina', r3.esquina === false);

  console.log('\n…y con un menú OSD puesto tampoco se queda encerrado');
  const r3b = await p3.evaluate(([pulsable]) => {
    const f = new Function('sel', 'return (' + pulsable + ')(sel)');
    game.osd.define('_prueba_salida', { html: '<div class="mc-osd-panel">sin botón de salir</div>' });
    game.osd.abrir('_prueba_salida');
    return { salir: f('#mc-tsalir'), hotbar: f('#mc-hotbar') };
  }, [PULSABLE.toString()]);
  ok('el ✕ sigue pulsable POR ENCIMA del menú', r3b.salir === true, String(r3b.salir));
  ok('…y la hotbar sí desaparece con el menú', r3b.hotbar !== true, String(r3b.hotbar));

  await p3.evaluate(() => game.osd.cerrar());
  await p3.waitForTimeout(200);
  await p3.tap('#mc-tsalir');
  await p3.waitForTimeout(500);
  ok('tocarlo cierra el Mundo de verdad', await p3.evaluate(() => !mc.active));
  await p3.close();

  console.log('');
  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log(fallos ? `\n${fallos} fallos` : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();
