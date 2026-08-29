// @area: mundo
// @necesita: servidor, playwright
//
// SONDA de REQ-TACT1 · el Mundo entero al alcance del dedo. Dos encargos del dueño (2026-08-29):
//   «*[el ☰ con] a b c d e f h j · [extrusión con] dos botones ＋/－ que salen solos cuando hay
//    selección · submenús · directo a app.js*»
//   «*en el móvil hacer clic en pantalla no debería realizar clic izquierdo ya que quieres moverte o
//    coger el foco y se activa la función de la herramienta y no debería, para eso está el botón en
//    pantalla*»
//
// Se prueba PULSANDO, sin mandar una sola tecla: es justo lo que no tiene una tablet.
//   §1 el ☰ es de submenús y su primer nivel conserva el contrato de inyección (#mc-tsalir el último)
//   §2 navegar: entrar en un submenú, volver, y que el ☰ cierre lo que haya abierto
//   §3 cada opción llama a la MISMA función que su tecla (se espían, no se ejecutan: no se toca el mundo)
//   §4 la herramienta cicla sin cerrar el menú y su texto sigue a `mc.tool`
//   §5 el ⤓ sale al volar, mantiene el Shift mientras el dedo esté puesto y lo suelta al levantarlo
//   §6 los ＋/－ salen SOLOS con una caja marcada y llaman a mcSelExtruir(±1)
//   §7 un toque en el lienzo NO dispara la herramienta ni pide pointer-lock (el ratón de verdad sí)
//   §8 salir del Mundo no deja ningún panel ni botón colgando sobre el editor
//
//     python3 server.py 8500 &
//     node tests/probe_menu_tactil.js
//
// ⛔ NO escribe en el mundo: los ＋/－ y las opciones de editar se espían sustituyendo la función del
// motor por un contador (ver `espia`), así que el mapa queda como estaba (memoria: una sonda que deja
// bloques en /map/test rompe guardianes ajenos).
const { chromium } = require('playwright');

const URL = process.env.VOXEL_URL || 'http://localhost:8500';
const MAPA = process.env.VOXEL_MAPA || 'test';

let ok = 0, fallos = 0;
function comprueba(que, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + que + (detalle ? '   · ' + detalle : '')); }
  else { fallos++; console.log('  FALLA  ' + que + (detalle ? '   · ' + detalle : '')); }
}

// Espía una función del motor: la sustituye por un contador y devuelve la original para reponerla.
// `app.js` es un script clásico sin IIFE, así que sus `function mcX` son propiedades de `window` y se
// pueden reasignar; las llamadas de los oyentes del menú pasan por el nombre global y caen aquí.
const ESPIAR = ['mcUndo', 'mcRedo', 'mcCopySelection', 'mcCutSelection', 'mcPasteWorld',
                'mcRotateSelBox', 'mcStartNotePlace', 'mcOpenNote', 'mcSelExtruir', 'mcLockPointer',
                'mcDoAction', 'mcFoto', 'mcToggleGrabarVideo', 'mcPantallaCompleta', 'openSnips'];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  · pageerror: ' + e.message));
  await p.goto(URL + '/map/' + MAPA, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  // El autoarranque del mapa envuelve mcUpdate; se espera a que deje de moverse (ver probe_who.js).
  await p.waitForFunction(`(() => {
    const f = mcUpdate;
    if (window.__ult === f) { window.__veces = (window.__veces || 0) + 1; } else { window.__ult = f; window.__veces = 0; }
    return window.__veces >= 8;
  })()`, null, { timeout: 60000, polling: 500 });

  await p.evaluate((nombres) => {
    window.__espia = {};
    window.__orig = {};
    for (const n of nombres) {
      if (typeof window[n] !== 'function') continue;
      window.__orig[n] = window[n];
      window[n] = function (...a) { (window.__espia[n] = window.__espia[n] || []).push(a); };
    }
    // Los mandos táctiles no salen en un escritorio: se encienden a mano, que es lo que hace
    // `game.touchControls` (y es la puerta que usa el dueño para probarlos sin móvil).
    game.touchControls = true;
    document.getElementById('mc-touch').hidden = false;
  }, ESPIAR);

  const veces = n => p.evaluate(n => (window.__espia[n] || []).length, n);
  const args = n => p.evaluate(n => (window.__espia[n] || [])[0] || null, n);
  const limpia = () => p.evaluate(() => { window.__espia = {}; });
  const abre = () => p.locator('#mc-tmenu').dispatchEvent('pointerup');
  const pulsa = sel => p.locator(sel).dispatchEvent('pointerup');
  const visible = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden; }, sel);

  console.log('\n§1 · el ☰ es de submenús, y su primer nivel sigue siendo el sitio donde se inyecta');
  const nivel1 = await p.evaluate(() =>
    [...document.getElementById('mc-tmenu-panel').children].map(b => b.id || b.className));
  comprueba('el panel de primer nivel cabe en una pantalla (≤ 7 filas)', nivel1.length <= 7, nivel1.length + ' filas');
  comprueba('…y «✕ Salir del Mundo» sigue siendo el ÚLTIMO hijo directo',
    nivel1[nivel1.length - 1] === 'mc-tsalir', nivel1.join(' '));
  comprueba('hay tres submenús colgando', await p.evaluate(() =>
    ['mc-tmenu-editar', 'mc-tmenu-ver', 'mc-tmenu-captura'].every(i => !!document.getElementById(i))));
  // Lo que el dueño excluyó a propósito: K (recortes) y B (tamaño del jugador). Si alguien las añade
  // «porque faltaban», este test se lo recuerda.
  comprueba('⛔ NO están los recortes (K) ni el tamaño del jugador (B)', await p.evaluate(() => {
    const t = document.getElementById('mc-touch').textContent;
    return t.indexOf('Recorte') < 0 && t.indexOf('Tamaño') < 0;
  }));

  console.log('\n§2 · navegar: entrar, volver, y que el ☰ cierre lo que haya abierto');
  await abre();
  comprueba('el ☰ abre el primer nivel', await visible('#mc-tmenu-panel'));
  await pulsa('#mc-tm-editar');
  comprueba('entrar en «Editar» cambia de panel', await visible('#mc-tmenu-editar') && !await visible('#mc-tmenu-panel'));
  await pulsa('#mc-tmenu-editar .volver');
  comprueba('«‹ Editar» vuelve al primer nivel', await visible('#mc-tmenu-panel') && !await visible('#mc-tmenu-editar'));
  await pulsa('#mc-tm-ver');
  await abre();
  // Éste es el fallo fácil: si el ☰ sólo mirase su propio panel, estando en un submenú lo ABRIRÍA
  // encima en vez de cerrar, y quedarían los dos puestos a la vez.
  comprueba('el ☰ desde dentro de un submenú CIERRA, no abre dos paneles',
    !await visible('#mc-tmenu-panel') && !await visible('#mc-tmenu-ver'));

  console.log('\n§3 · cada opción llama a la función de su tecla');
  const opcion = async (sub, sel, fn) => {
    await limpia();
    await abre(); await pulsa('#mc-tm-' + sub); await pulsa(sel);
    const n = await veces(fn);
    comprueba(sel + ' → ' + fn + '()', n === 1, n + ' llamada(s)');
    comprueba('…y cierra el menú detrás de sí', !await visible('#mc-tmenu-' +
      ({ editar: 'editar', ver: 'ver', captura: 'captura' })[sub]));
  };
  await opcion('editar', '#mc-tdeshacer', 'mcUndo');        // z
  await opcion('editar', '#mc-trehacer', 'mcRedo');         // Shift+Z
  await opcion('editar', '#mc-tcopiar', 'mcCopySelection'); // Ctrl+C
  await opcion('editar', '#mc-tcortar', 'mcCutSelection');  // Ctrl+X
  await opcion('editar', '#mc-tpegar', 'mcPasteWorld');     // Ctrl+V
  await opcion('captura', '#mc-tfoto', 'mcFoto');           // Alt+F
  await opcion('captura', '#mc-tvideo', 'mcToggleGrabarVideo'); // Alt+V
  await limpia();
  await abre(); await pulsa('#mc-tcodigo');
  comprueba('#mc-tcodigo → openSnips()  (Alt+C)', await veces('openSnips') === 1);
  await limpia();
  await abre(); await pulsa('#mc-tm-ver'); await pulsa('#mc-txray');
  comprueba('#mc-txray conmuta mc.xray  (x)', await p.evaluate(() => mc.xray === true));
  await p.evaluate(() => { mc.xray = false; });
  // Girar exige selección, igual que la tecla R: sin caja avisa en vez de hacer nada a escondidas.
  await limpia();
  await p.evaluate(() => { mc.tool = 'select'; mc.selBox = null; });
  await abre(); await pulsa('#mc-tm-editar'); await pulsa('#mc-tgirar');
  comprueba('⟳ Girar sin selección NO gira nada', await veces('mcRotateSelBox') === 0);
  await p.evaluate(() => { mc.selBox = { a: [0, 0, 0], b: [1, 1, 1] }; });
  await limpia();
  await abre(); await pulsa('#mc-tm-editar'); await pulsa('#mc-tgirar');
  comprueba('…y con selección gira por el eje de la R a secas', (await args('mcRotateSelBox') || [])[0] === 'y');

  console.log('\n§4 · la herramienta cicla sin cerrar el menú');
  await p.evaluate(() => { mc.selBox = null; mcSetPlayerTool('build'); });
  await abre(); await pulsa('#mc-tm-editar');
  const t0 = await p.evaluate(() => [mc.tool, document.getElementById('mc-therr').textContent]);
  await pulsa('#mc-therr');
  const t1 = await p.evaluate(() => [mc.tool, document.getElementById('mc-therr').textContent]);
  comprueba('pulsarla cambia de herramienta', t1[0] !== t0[0], t0[0] + ' → ' + t1[0]);
  comprueba('…el menú SIGUE abierto (es cíclica: hay que poder pulsarla otra vez)',
    await visible('#mc-tmenu-editar'));
  comprueba('…y el texto dice cuál llevas', t1[1] !== t0[1] && t1[1].length > 2, t1[1]);
  await p.evaluate(() => mcSetPlayerTool('build'));
  await abre();   // cerrar

  console.log('\n§5 · el ⤓ de bajar volando');
  comprueba('a pie no está', !await visible('#mc-tbajar'));
  await p.evaluate(() => { mcSetVolar(true); mcExtruBtn(); });
  comprueba('volando sale solo', await visible('#mc-tbajar'));
  await p.locator('#mc-tbajar').dispatchEvent('pointerdown', { pointerId: 77 });
  comprueba('mantenerlo baja la tecla Shift, que es lo que hunde al volar (REQ-FLY1)',
    await p.evaluate(() => mc.keys['shift'] === true));
  await p.evaluate(() => mcTouchSuelta(77));
  comprueba('…y soltarlo la levanta (un `up` perdido te hundiría sin parar)',
    await p.evaluate(() => mc.keys['shift'] === false));
  // Dejar de volar con el dedo puesto es el caso feo: sin el barrido, el Shift se quedaba clavado.
  await p.locator('#mc-tbajar').dispatchEvent('pointerdown', { pointerId: 78 });
  await p.evaluate(() => { mcSetVolar(false); mcExtruBtn(); });
  comprueba('aterrizar con el dedo puesto se lleva el botón…', !await visible('#mc-tbajar'));
  comprueba('…y suelta el Shift', await p.evaluate(() => mc.keys['shift'] === false));

  console.log('\n§6 · los ＋/－ de extruir salen solos con la selección');
  await p.evaluate(() => { mc.tool = 'select'; mc.selBox = null; mcExtruBtn(); });
  comprueba('sin caja marcada no están', !await visible('#mc-textru-mas') && !await visible('#mc-textru-menos'));
  await p.evaluate(() => { mc.selBox = { a: [0, 0, 0], b: [1, 1, 1] }; mcExtruBtn(); });
  comprueba('con caja marcada salen los dos', await visible('#mc-textru-mas') && await visible('#mc-textru-menos'));
  await limpia();
  await p.locator('#mc-textru-mas').dispatchEvent('pointerdown');
  comprueba('＋ → mcSelExtruir(+1), la MISMA de Ctrl+rueda arriba', (await args('mcSelExtruir') || [])[0] === 1);
  await limpia();
  await p.locator('#mc-textru-menos').dispatchEvent('pointerdown');
  comprueba('－ → mcSelExtruir(−1)', (await args('mcSelExtruir') || [])[0] === -1);
  await p.evaluate(() => { mc.tool = 'build'; mc.selBox = null; mcExtruBtn(); });
  comprueba('al soltar la selección se van solos', !await visible('#mc-textru-mas'));

  console.log('\n§7 · un toque en el lienzo no es un clic izquierdo');
  // El camino real del bug: el `click` de compatibilidad pedía pointer-lock, y a partir de ahí cada
  // toque para girar la cámara entraba por el `mousedown` y disparaba la herramienta.
  await limpia();
  // Todo DENTRO de un solo evaluate, incluida la lectura: la ventana del dedo dura 700 ms y este
  // Chromium va a ~1,4 fps, así que un `evaluate` de ida y vuelta por medio la deja caducar y el test
  // «pasaría» por el motivo equivocado.
  const toque = await p.evaluate(() => {
    const c = document.getElementById('mc-canvas');
    const o = { bubbles: true, cancelable: true, clientX: 300, clientY: 300 };
    c.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 5, pointerType: 'touch' }, o)));
    c.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerId: 5, pointerType: 'touch' }, o)));
    c.dispatchEvent(new MouseEvent('mousedown', Object.assign({ button: 0 }, o)));   // el de compatibilidad
    c.dispatchEvent(new MouseEvent('click', o));
    return { esDedo: mcRatonDeDedo(), lock: (window.__espia['mcLockPointer'] || []).length };
  });
  comprueba('…ni pide pointer-lock (en táctil mandan los botones de pantalla)', toque.lock === 0);
  // El `mousedown` de compatibilidad no se puede medir de frente aquí: sin pointer-lock su guarda de
  // siempre ya lo corta, y el test pasaría solo. Lo que se mide es la marca que consulta esa guarda —
  // si `mcRatonDeDedo()` no se enterara del toque, con pointer-lock puesto (el móvil del dueño, en
  // pantalla completa) el toque volvería a picar un bloque.
  comprueba('el motor sabe que el último toque fue un DEDO', toque.esDedo === true);
  // Y el ratón de verdad tiene que seguir picando: un portátil con pantalla táctil tiene las dos cosas.
  await p.evaluate(() => new Promise(r => setTimeout(r, 800)));   // que caduque la ventana del dedo
  await limpia();
  await p.evaluate(() => {
    const c = document.getElementById('mc-canvas');
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  });
  comprueba('un clic de RATÓN sigue pidiendo el pointer-lock', await veces('mcLockPointer') === 1);
  comprueba('…porque la marca del dedo ha caducado', await p.evaluate(() => mcRatonDeDedo() === false));

  console.log('\n§8 · salir del Mundo no deja nada colgando');
  await abre(); await pulsa('#mc-tm-editar');          // se sale con un submenú abierto a propósito
  await p.evaluate(() => { mcSetVolar(true); mc.tool = 'select'; mc.selBox = { a: [0, 0, 0], b: [1, 1, 1] }; mcExtruBtn(); });
  // Por la puerta de verdad: `closeWorld` apaga `mc.active` ANTES de llamar a mcTouchShow, y de eso
  // depende que los botones que salen solos no vuelvan a ponerse en el frame siguiente.
  await p.evaluate(() => closeWorld());
  comprueba('ningún panel del ☰ sobrevive', await p.evaluate(() =>
    [...document.querySelectorAll('.mc-tmenu-panel')].every(x => x.hidden)));
  comprueba('…ni el ⤓ ni los ＋/－', !await visible('#mc-tbajar') && !await visible('#mc-textru-mas'));

  await b.close();
  console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s) · ' + ok + ' ok' : '✓ todo ok (' + ok + ')'));
  process.exit(fallos ? 1 : 0);
})();
