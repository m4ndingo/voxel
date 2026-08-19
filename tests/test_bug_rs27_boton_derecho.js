// @area: redstone
// @necesita: servidor, playwright
// BUG-RS27 — «los botones de redstone se estan activando con boton derecho y deberia de ser
// solamente con boton central» (nota del dueño en /map/bugfinder, 40,14,65).
//
// `redstone-piezas.js` envolvía `mcUseRight`: probaba a conmutar y solo construía si no había pieza
// manual delante. O sea que dentro de un circuito montado el mismo botón hacía dos cosas distintas
// según la puntería, y un fallo te dejaba un bloque encima del cable. El derecho vuelve a construir
// y nada más; accionar es del CENTRAL.
//
// El tramo C es el anti-falso-verde: se vuelve a poner el envoltorio viejo A MANO y se comprueba que
// el test SÍ ve conmutar por el derecho. Sin eso, «no conmuta» también lo cumpliría un test que no
// esté apuntando a nada.
//
// ⚠️ Dos trampas que costaron tres pasadas en rojo:
//   · Conmutar NO se ve en la rejilla en la misma vuelta: el motor encola y la celda cambia de clave
//     un tick después. Por eso todo va con `tras()` —actuar, esperar, leer— y nunca se mide dentro
//     del mismo evaluate que acciona.
//   · **El mundo autoarranca el redstone PUBLICADO, y `?noauto=1` NO lo evita** (ése solo salta el
//     autoarranque del editor y la intro; `mundo-autoarranque` corre en todos los mapas). O sea que
//     al entrar ya hay cargada la versión del servidor —a día de hoy `piezas-1.7`, con el envoltorio
//     viejo— y hay que ESPERAR a que termine antes de cargar la de este repo encima, o el test mide
//     una carrera. Que sea así viene de perlas: comprueba de paso el desenvoltorio en caliente.
//     Y recuerda que arreglar el .js NO arregla el mundo vivo hasta republicar
//     (`node redstone/make_snippets.js`).

const { chromium } = require('playwright');
const fs = require('fs');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor = fs.readFileSync(__dirname + '/../redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/../redstone/redstone-piezas.js', 'utf8');

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  // Esperar a que el autoarranque del mundo acabe de montar SU redstone (el publicado): `apuntada` la
  // define el snippet de piezas, así que verla es la señal de que ya está entero.
  await p.waitForFunction('typeof game!=="undefined" && game.redstone && typeof game.redstone.apuntada==="function"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const publicado = await p.evaluate(() => mcUseRight._redstone || '(sin envolver)');
  console.log('  · redstone publicado en el servidor: ' + publicado);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  // Banqueta propia y despejada dentro de los 96x40x96 de /map/test, mirando a -X desde tres celdas:
  // las mismas ayudas que el resto de tests de redstone.
  const arranque = await p.evaluate(async () => {
    const out = { log: [] };
    for (const m of ['hab:palanca', 'hab:palanca-on', 'hab:roca']) {
      if (!mc.name2id[m]) { try { await game.addMaterial(m); } catch (e) { out.log.push(m + ': ' + e.message); } }
    }
    const X = 20, Y = 30, Z = 20;
    const idRoca = mc.name2id['hab:roca@0'] || mc.name2id['hab:roca'];
    const idPal = mc.name2id['hab:palanca@0'] || mc.name2id['hab:palanca'];
    for (let dx = -5; dx <= 2; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++)
      mcSetBlock(X + dx, Y + dy, Z + dz, 0);
    for (let dx = -5; dx <= 2; dx++) for (let dz = -3; dz <= 3; dz++) mcSetBlock(X + dx, Y - 1, Z + dz, idRoca);
    mcSetBlock(X, Y, Z, idPal);
    mc.pos[0] = X - 3 + 0.5; mc.pos[1] = Y - MC_EYE * (mc.scale || 1); mc.pos[2] = Z + 0.5;
    mc.yaw = -Math.PI / 2; mc.pitch = 0;
    window._rs27 = { clave: () => mc.blockKey[mc.grid[mcIdx(X, Y, Z)]] || '' };
    out.apuntada = game.redstone.apuntada(6);
    return out;
  });
  if (arranque.log.length) console.log('  · ' + arranque.log.join(' · '));

  const clave = () => p.evaluate(() => window._rs27.clave());
  // Actuar y dejar pasar el tick del motor antes de volver a mirar la rejilla.
  const tras = async (fn) => { const r = await p.evaluate(fn); await p.waitForTimeout(400); return r; };
  const es = (v) => Array.isArray(v) && v[0] === 20 && v[1] === 30 && v[2] === 20;

  console.log('\nA · control: la palanca está donde apunto y el motor la conmuta');
  ok('el rayo fino da en la palanca', es(arranque.apuntada), JSON.stringify(arranque.apuntada));
  let antes = await clave();
  const cambio = await tras(() => game.redstone.conmutar(20, 30, 20));
  let despues = await clave();
  ok('conmutar() la gira', cambio === true && antes !== despues, antes + ' -> ' + despues);
  await tras(() => game.redstone.conmutar(20, 30, 20));
  ok('y se puede dejar como estaba', (await clave()) === antes);

  console.log('\nB · el clic DERECHO ya no la toca');
  const sinEnvoltorio = await p.evaluate(() => !!(mcUseRight._redstone || mcUseRight._orig));
  ok('mcUseRight no lleva envoltorio de redstone', sinEnvoltorio === false);
  antes = await clave();
  const errDer = await tras(() => { try { mcUseRight(); } catch (e) { return e.message; } return null; });
  despues = await clave();
  ok('llamarlo NO conmuta la palanca', antes === despues,
    antes + ' -> ' + despues + (errDer ? ' · mcUseRight: ' + errDer : ''));

  console.log('\nC · ANTI-FALSO-VERDE: con el envoltorio viejo puesto a mano, sí conmutaba');
  antes = await clave();
  await tras(() => {
    const orig = mcUseRight;
    const env = function () {
      const a = game.redstone.apuntada(6);
      if (a && game.redstone.conmutar(a[0], a[1], a[2])) return;
      return orig.apply(this, arguments);
    };
    env._redstone = 'piezas-vieja'; env._orig = orig;
    window.mcUseRight = env;
    try { mcUseRight(); } catch (e) { /* da igual: lo que se mira es la palanca */ }
  });
  despues = await clave();
  ok('el envoltorio viejo SÍ la conmuta (el test ve el fallo)', antes !== despues, antes + ' -> ' + despues);
  ok('…y quedó marcado como envuelto', await p.evaluate(() => mcUseRight._redstone === 'piezas-vieja'));

  // Y re-ejecutar el snippet tiene que DESENVOLVERLO: una pestaña con la versión vieja cargada vuelve
  // sola al comportamiento de app.js sin recargar la página.
  await p.evaluate(piezas);
  await p.waitForTimeout(400);
  const tras2 = await p.evaluate(() => ({
    envuelto: !!(mcUseRight._redstone || mcUseRight._orig),
    marca: mcUseRight._redstone || '(ninguna)',
  }));
  ok('re-ejecutar el snippet desenvuelve mcUseRight', tras2.envuelto === false, 'marca=' + tras2.marca);
  antes = await clave();
  await tras(() => { try { mcUseRight(); } catch (e) { /* idem */ } });
  despues = await clave();
  ok('y ya no conmuta', antes === despues, antes + ' -> ' + despues);

  console.log('\nD · el botón CENTRAL sigue conmutando');
  ok('el oyente del central está puesto', await p.evaluate(() => typeof window._redstoneMedio === 'function'));
  antes = await clave();
  await tras(() => {
    // En headless no hay pointer-lock que pedir, y el oyente exige que mande el jugador: se le dice
    // que sí, que es justo lo que contesta mcMandoActivo() con el ratón capturado.
    window._rs27.mandoOrig = window.mcMandoActivo;
    window.mcMandoActivo = () => true;
    window.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }));
  });
  despues = await clave();
  ok('el central conmuta', antes !== despues, antes + ' -> ' + despues);

  // Y el mismo camino con el botón derecho (button 2) no puede colarse por el oyente del central.
  await tras(() => window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true })));
  const trasDerecho = await clave();
  ok('el mousedown del derecho no conmuta', despues === trasDerecho, despues + ' -> ' + trasDerecho);
  await p.evaluate(() => { window.mcMandoActivo = window._rs27.mandoOrig; });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
