// @area: general
// @necesita: servidor, playwright
// test_osd_boton.js — REQ-OSD4: un boton del menu es un BLOQUE CON UNA NOTA. Y REQ-OSD3: el modo
// ESCAPARATE (?osd=1), que es el que convierte un mapa en la pantalla de un menu.
//
//   node tests/test_osd_boton.js [url]      por defecto http://localhost:8500/map/test
//
// Se abre el mapa de pruebas CON ?osd=1 pero SIN iframe: una pantalla suelta tiene que funcionar sola,
// porque es como el dueño la va a diseñar (entrando a /map/menu1 a pelo y dibujando).
//
// Los dos casos que de verdad protege:
//   - pulsar el boton NO rompe el bloque. Un menu cuyo boton se desintegra al pulsarlo no es un menu.
//   - en escaparate NO se guarda. Sin eso, el primer clic escribiria encima del dibujo del propio menu.
//
// El bloque y la nota que se plantan se deshacen al terminar, y los POST de guardado se bloquean.

const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8500/map/test';
const URL = BASE + (BASE.indexOf('?') < 0 ? '?osd=1' : '&osd=1');
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  let postsDeGuardado = 0;
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => {
    if (r.request().method() === 'POST') { postsDeGuardado++; return r.fulfill({ status: 200, body: '{"ok":true}' }); }
    return r.continue();
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.osd', null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  // ── §1 · el modo escaparate ────────────────────────────────────────────────────────────────────
  const modo = await p.evaluate(() => {
    const vis = sel => { const e = $(sel); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && !e.hidden; };
    return {
      escaparate: mc.escaparate, volar: mc.volar,
      clase: document.body.classList.contains('mc-escaparate'),
      hotbar: vis('#mc-hotbar'), mira: vis('#mc-crosshair'), cerrar: vis('#mc-close')
    };
  });
  test('§1 ?osd=1 pone el mundo en modo ESCAPARATE', () =>
    assert(modo.escaparate === true, 'mc.escaparate = ' + modo.escaparate));
  test('§1 …sin hotbar, sin mira y sin los botones de la esquina', () => {
    assert(!modo.hotbar, 'la hotbar se ve en una pantalla de menu');
    assert(!modo.mira, 'la mira se ve en una pantalla de menu');
    assert(!modo.cerrar, 'el boton de cerrar se ve en una pantalla de menu');
  });
  test('§1 …y sin gravedad: la camara se queda donde la dejo el spawn', () =>
    assert(modo.volar === true, 'la pantalla no esta en modo vuelo: la camara se caera'));

  // ── §2 · el escenario: un bloque delante de la camara, con una nota encima ─────────────────────
  const montaje = await p.evaluate(async () => {
    mcResolveMat('roca');
    await new Promise(s => setTimeout(s, 1200));
    mc.pitch = 0;                                    // mirando al horizonte: el bloque cae en el centro exacto
    const ojoY = mc.pos[1] + MC_EYE * mc.scale;
    const dx = -Math.sin(mc.yaw), dz = -Math.cos(mc.yaw);
    let celda = null;
    for (let d = 3; d <= 8 && !celda; d++) {
      const c = [Math.floor(mc.pos[0] + dx * d), Math.floor(ojoY), Math.floor(mc.pos[2] + dz * d)];
      if (mcInside(c[0], c[1], c[2]) && !mc.grid[mcIdx(c[0], c[1], c[2])]) celda = c;
    }
    if (!celda) return { error: 'no hay hueco libre delante de la camara' };
    window.__celda = celda;
    window.__previo = mc.grid[mcIdx(celda[0], celda[1], celda[2])];
    game.setVoxel(celda[0], celda[1], celda[2], 'roca');
    const clave = mcNoteKey(celda);
    window.__clave = clave;
    window.__notaPrevia = mc.notes[clave];
    mc.notes[clave] = 'JUGAR';
    // La accion. En una pantalla suelta (sin iframe) se ejecuta aqui mismo: asi el dueño puede probar
    // el menu entrando a /map/menu1 directamente, sin montar el OSD.
    window.__pulsados = [];
    game.osd.alPulsar('JUGAR', () => window.__pulsados.push('JUGAR'));
    await new Promise(s => setTimeout(s, 600));
    return { celda, clave };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('boton en ' + JSON.stringify(montaje.celda));

  // ── §3 · el clic ───────────────────────────────────────────────────────────────────────────────
  const caja = await p.evaluate(() => { const r = mc.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });

  await p.mouse.move(caja.x, caja.y);
  await p.waitForTimeout(120);
  const cursor = await p.evaluate(() => mc.canvas.style.cursor);
  test('§3 el cursor avisa de que ese bloque es pulsable', () =>
    assert(cursor === 'pointer', 'el cursor sobre el boton es «' + cursor + '»'));

  await p.mouse.click(caja.x, caja.y);
  await p.waitForTimeout(250);
  const trasClic = await p.evaluate(() => ({
    pulsados: window.__pulsados.slice(),
    sigueElBloque: !!mc.grid[mcIdx(window.__celda[0], window.__celda[1], window.__celda[2])],
    sigueLaNota: mc.notes[window.__clave] === 'JUGAR',
    capturado: document.pointerLockElement === mc.canvas
  }));
  test('§3 pulsar el bloque ejecuta su accion', () =>
    assert(trasClic.pulsados.length === 1, 'la accion se ejecuto ' + trasClic.pulsados.length + ' veces'));
  test('§3 …y el bloque SIGUE AHI (pulsar no es romper)', () => {
    assert(trasClic.sigueElBloque, 'el boton se ha roto al pulsarlo');
    assert(trasClic.sigueLaNota, 'la nota del boton ha desaparecido');
  });
  test('§3 …y el clic no ha capturado el raton (sin cursor no hay menu)', () =>
    assert(!trasClic.capturado, 'el clic ha capturado el puntero'));

  // Un clic contra el cielo, lejos del boton: no puede disparar nada.
  await p.mouse.click(caja.x + caja.w * 0.42, caja.y - caja.h * 0.42);
  await p.waitForTimeout(200);
  const alVacio = await p.evaluate(() => window.__pulsados.length);
  test('§3 un clic donde no hay boton no dispara ninguna accion', () =>
    assert(alVacio === 1, 'se han disparado ' + alVacio + ' acciones tras el clic al vacio'));

  // ── §4 · una pantalla NO se guarda ─────────────────────────────────────────────────────────────
  await p.evaluate(() => { mcScheduleSave(); mcDirtyHeader && mcDirtyHeader(); });
  await p.waitForTimeout(1800);
  test('§4 en escaparate no sale ni un POST de guardado (o el menu se machaca a si mismo)', () =>
    assert(postsDeGuardado === 0, 'han salido ' + postsDeGuardado + ' POST /api/mundo'));

  // ── Deshacer ───────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    mcSetBlock(window.__celda[0], window.__celda[1], window.__celda[2], window.__previo | 0);
    if (window.__notaPrevia === undefined) delete mc.notes[window.__clave];
    else mc.notes[window.__clave] = window.__notaPrevia;
  });

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
