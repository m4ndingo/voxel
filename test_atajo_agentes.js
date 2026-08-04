// test_atajo_agentes.js — entrar y salir del panel de Agentes sin pasar por el editor.
//
// El panel sabia describir un bicho (test_panel_agentes.js) y la libreria sabia plantarlo
// (test_esqueleto_navegador.js), pero el camino entre las dos cosas estaba roto: solo se llegaba al
// panel por la pestaña del editor, y despues de plantar te quedabas mirando el formulario en vez del
// Mundo donde acababa de aparecer el bicho. Lo que se prueba aqui es ese camino, y las tres trampas
// que salieron al abrirlo:
//
//   · el panel se abre SOBRE el Mundo, pero #mc-modal va despues en el HTML: a igual z-index ganaba
//     el Mundo y el panel quedaba tapado (se comprueba con elementFromPoint, no con `hidden`);
//   · Esc con el panel abierto cerraba EL MUNDO, porque su cadena de Esc no conocia #ag-modal;
//   · `a` es andar hacia la izquierda: sin cortar el evento, cerrar el panel con Alt+A te hacia dar
//     un paso de lado, y teclear en el panel movia al jugador por detras.
//
//   node test_atajo_agentes.js [url]        por defecto http://localhost:8500/map/agents
//
// Los POST a /api/mundo y /api/habitantes se bloquean: el mundo del dueno no se toca. El agente se
// planta de verdad, pero es efimero (no entra en mcSerialize) y no sobrevive a la recarga.

const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/agents';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/agentes*', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  // Cinturon de red. Se responde 200 en vez de abortar a proposito: aqui se cierra el Mundo (§5) y
  // salir vuelca el mundo con mcSaveWorld — un abort dejaria una promesa rechazada que §6 leeria
  // como excepcion de la pagina. No sale nada: la escritura se traga aqui.
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      // ⚠️ `(o && o.method) || 'GET'`, no `String(o.method)`: media app lee con fetch(u,{cache:'no-store'}),
      // sin `method`, y eso da 'UNDEFINED' — o sea que los GET pasaban por escrituras y recibian `{}`
      // donde esperaban una lista (`list.filter is not a function`).
      const escribe = String((o && o.method) || 'GET').toUpperCase() !== 'GET';
      if (escribe && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes'))) {
        (window.__bloqueados = window.__bloqueados || []).push(String(u));
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return orig(u, o);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.structures', { timeout: 120000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', { timeout: 60000 });
  await p.waitForTimeout(1500);

  const abierto = () => p.evaluate(() => !document.querySelector('#ag-modal').hidden);
  const mundo = () => p.evaluate(() => !document.querySelector('#mc-modal').hidden);
  // Que el panel ESTE por delante, no solo que no este `hidden`: es justo lo que fallaba.
  const alFrente = () => p.evaluate(() => {
    const m = document.querySelector('#ag-modal');
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return !!(el && m.contains(el));
  });
  const pasos = () => p.evaluate(() => ['w', 'a', 's', 'd'].filter(k => mc.keys[k]).join(','));

  // ── 1) Alt+A abre el panel desde el Mundo, sin cerrarlo ni mover al jugador ────────────────────
  await p.keyboard.press('Alt+a');
  await p.waitForTimeout(600);
  const tras1 = { panel: await abierto(), mundo: await mundo(), frente: await alFrente(), teclas: await pasos() };

  // Con el panel delante, las teclas del Mundo no mandan (`x` = rayos-X, `b` = tamaño).
  const antesXray = await p.evaluate(() => mc.xray);
  await p.keyboard.press('x');
  await p.waitForTimeout(150);
  const trasXray = await p.evaluate(() => mc.xray);

  // ── 2) Esc cierra el PANEL, no el Mundo ───────────────────────────────────────────────────────
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const tras2 = { panel: await abierto(), mundo: await mundo() };

  // ── 3) Alt+A conmuta: abre y vuelve a cerrar, y al cerrar no da el paso de lado ────────────────
  await p.keyboard.press('Alt+a');
  await p.waitForTimeout(600);
  const reabierto = await abierto();
  await p.keyboard.press('Alt+a');
  await p.waitForTimeout(300);
  const tras3 = { panel: await abierto(), mundo: await mundo(), teclas: await pasos() };

  // ── 4) Plantar deja el Mundo a la vista, con un esqueleto mas ──────────────────────────────────
  await p.keyboard.press('Alt+a');
  await p.waitForFunction('typeof agDoc !== "undefined" && agDoc', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  const antesVivos = await p.evaluate(() => game.esqueletos.lista().length);
  await p.click('#ag-plantar');
  await p.waitForTimeout(1200);
  const tras4 = {
    panel: await abierto(), mundo: await mundo(),
    vivos: await p.evaluate(() => game.esqueletos.lista().length),
    // Plantado DELANTE del jugador: a ~3 bloques en planta, no encima ni en el origen. Se mide sobre
    // `plantado` (donde se puso) y no sobre `donde` (donde esta ahora): en cuanto empieza a
    // perseguirte, la posicion viva ya no dice nada del sitio en que aparecio.
    lejos: await p.evaluate(() => {
      const l = game.esqueletos.lista(); const u = l[l.length - 1];
      const [x, , z] = u.plantado.split(',').map(Number);
      return +Math.hypot(x - mc.pos[0], z - mc.pos[2]).toFixed(2);
    })
  };

  // ── 5) Plantar desde el EDITOR (Mundo cerrado) tiene que abrir el Mundo ────────────────────────
  await p.evaluate(() => closeWorld());
  await p.waitForTimeout(400);
  await p.keyboard.press('Alt+a');
  await p.waitForFunction('typeof agDoc !== "undefined" && agDoc && !document.querySelector("#ag-modal").hidden',
    null, { timeout: 30000 });
  await p.waitForTimeout(400);
  const mundoAntes5 = await mundo();
  await p.click('#ag-plantar');
  await p.waitForTimeout(3000);
  const tras5 = { panel: await abierto(), mundo: await mundo(), activo: await p.evaluate(() => mc.active) };

  console.log('\n§1 Alt+A abre el panel sobre el Mundo');
  test('el panel queda abierto', () => assert(tras1.panel, 'Alt+A no abrio #ag-modal'));
  test('el Mundo sigue abierto detras', () => assert(tras1.mundo, 'Alt+A cerro el Mundo'));
  test('y se ve POR DELANTE del Mundo (z-index)', () => assert(tras1.frente, 'el Mundo tapa el panel: elementFromPoint cae fuera de #ag-modal'));
  test('abrirlo no deja al jugador andando', () => assert(tras1.teclas === '', 'teclas pegadas: ' + tras1.teclas));
  test('con el panel delante, `x` no cambia los rayos-X', () => assert(antesXray === trasXray, 'la tecla llego al Mundo (xray ' + antesXray + '->' + trasXray + ')'));

  console.log('\n§2 Esc con el panel abierto');
  test('cierra el panel', () => assert(!tras2.panel, 'Esc no cerro el panel'));
  test('y NO cierra el Mundo', () => assert(tras2.mundo, 'Esc se llevo el Mundo por delante'));

  console.log('\n§3 Alt+A conmuta');
  test('vuelve a abrir', () => assert(reabierto, 'el segundo Alt+A no reabrio'));
  test('y cierra', () => assert(!tras3.panel, 'Alt+A no cerro el panel'));
  test('cerrar no cierra el Mundo', () => assert(tras3.mundo, 'al cerrar el panel se fue el Mundo'));
  test('cerrar no da el paso de lado', () => assert(tras3.teclas === '', 'el `a` llego al Mundo: ' + tras3.teclas));

  console.log('\n§4 Plantar desde el Mundo');
  test('el panel se aparta', () => assert(!tras4.panel, 'el panel sigue tapando el Mundo tras plantar'));
  test('el Mundo queda a la vista', () => assert(tras4.mundo, 'no se ve el Mundo'));
  test('hay un esqueleto mas', () => assert(tras4.vivos === antesVivos + 1, antesVivos + ' -> ' + tras4.vivos));
  test('plantado ahi delante (~3 bloques)', () => assert(tras4.lejos > 1.5 && tras4.lejos < 4.5, 'distancia ' + tras4.lejos));

  console.log('\n§5 Plantar desde el editor abre el Mundo');
  test('se partia con el Mundo cerrado', () => assert(!mundoAntes5, 'el Mundo no estaba cerrado'));
  test('el panel se aparta', () => assert(!tras5.panel, 'el panel sigue delante'));
  test('el Mundo se abre solo', () => assert(tras5.mundo, 'plantar no abrio el Mundo'));
  test('y esta vivo (no una foto)', () => assert(tras5.activo, 'mc.active=false: el Mundo no corre'));

  console.log('\n§6 Sin excepciones');
  test('ninguna excepcion en la pagina', () => assert(errores.length === 0, errores.join(' | ')));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
