// @area: render
// @necesita: servidor, playwright
// test_osd_mapa.js — REQ-OSD3: una pantalla OSD que es OTRO MAPA, montada en un <iframe> con puente
// postMessage.
//
//   node tests/test_osd_mapa.js [url]      por defecto http://localhost:8500/map/test
//
// Por que iframe y no una segunda escena: `mc` es un singleton (una rejilla, un programa GL, un
// jugador). Dos mundos vivos a la vez obligan a sacarlo a instancias, o sea a reescribir app.js. Lo
// que cuesta el iframe es un SEGUNDO CONTEXTO WEBGL mientras la pantalla esta abierta, y por eso el §4
// —que al cerrar el iframe se destruye de verdad— es el test que de verdad importa aqui.
//
// Se usa el propio mapa de pruebas como pantalla: no hace falta inventarse un /map/menu1, y asi el
// test no depende de un mundo que el dueño puede borrar o renombrar.
//
// ⚠️ Levanta DOS mundos en SwiftShader: es lento a proposito. Los tiempos de espera son generosos.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
const MAPA = (URL.match(/\/map\/([^/?#]+)/) || [, 'test'])[1];
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
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.osd', null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  // ── §1 · montar la pantalla ────────────────────────────────────────────────────────────────────
  const montada = await p.evaluate((mapa) => {
    window.__pulsados = [];
    game.osd.define('pantalla', { mapa });
    game.osd.alPulsar('JUGAR', () => window.__pulsados.push('JUGAR'));
    game.osd.abrir('pantalla');
    const f = $('#mc-osd').querySelector('iframe');
    return { abierta: game.osd.abierta, hay: !!f, src: f ? f.getAttribute('src') : null,
             visible: !$('#mc-osd').hidden,
             // REQ-OSD6 · como nace: invisible y con la ruedecita, no enseñando la carga del mundo de dentro
             cargando: f ? f.classList.contains('cargando') : null,
             opacidad: f ? getComputedStyle(f).opacity : null,
             espera: !!$('#mc-osd').querySelector('.mc-osd-espera') };
  }, MAPA);
  test('§1 abrir una pantalla {mapa:…} monta un iframe con ese mapa y ?osd=1', () => {
    assert(montada.hay, 'no se ha montado ningun iframe');
    assert(montada.src === '/map/' + MAPA + '?osd=1', 'src = ' + montada.src);
    assert(montada.visible && montada.abierta === 'pantalla', 'la capa no esta abierta');
  });
  // REQ-OSD6 · lo que el dueño vio y no quiere: «se pone todo azul, empiezan a salir mensajes de cosas
  // que cargan, y luego sale el mapa… mucho flash de informacion para algo que deberia ser un simple menu».
  test('§1 …y nace INVISIBLE: la pantalla no se enseña cargandose', () => {
    assert(montada.cargando === true, 'el iframe no arranca con la clase «cargando»');
    assert(montada.opacidad === '0', 'el iframe ya se ve al montarlo (opacity = ' + montada.opacidad + ')');
  });
  test('§1 …con un aviso de espera que NO tapa el juego de debajo', () =>
    assert(montada.espera, 'no hay ruedecita de espera'));

  // ── §2 · el mundo de dentro arranca en escaparate ──────────────────────────────────────────────
  // El frame tarda en tener URL propia (arranca en about:blank), asi que se espera a que aparezca en vez
  // de mirar una sola vez: mirarlo una vez es una carrera que se pierde en una maquina cargada.
  let hijo = null;
  for (let i = 0; i < 120 && !hijo; i++) {
    hijo = p.frames().find(f => f !== p.mainFrame() && /osd=1/.test(f.url()));
    if (!hijo) await p.waitForTimeout(500);
  }
  assert(hijo, 'no encuentro el frame de la pantalla');
  await hijo.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await p.waitForTimeout(2500);
  const dentro = await hijo.evaluate(() => {
    const vis = sel => { const e = document.querySelector(sel); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && !e.hidden; };
    return { escaparate: mc.escaparate, hotbar: vis('#mc-hotbar'),
             capturado: document.pointerLockElement === mc.canvas, enIframe: window.parent !== window };
  });
  test('§2 el mundo de la pantalla arranca en escaparate y sabe que esta incrustado', () => {
    assert(dentro.escaparate === true, 'mc.escaparate = ' + dentro.escaparate + ' dentro del iframe');
    assert(dentro.enIframe, 'el mundo de dentro no se ve a si mismo incrustado');
  });
  test('§2 …sin hotbar y sin captura de puntero', () => {
    assert(!dentro.hotbar, 'la hotbar sale en la pantalla');
    assert(!dentro.capturado, 'la pantalla ha capturado el raton');
  });

  // ── §5 · REQ-OSD6 · un OSD se pone ENCIMA, no borra lo que hay ─────────────────────────────────
  // El encargo del dueño, literal: «basta con que se muestre el mapa una vez cargado… sin el fondo azul
  // que borra lo que hay… igual sin mostrar el cielo en los osd que sean mapas queda mejor, asi el azul
  // del cielo no molesta y deja ver a traves». Son tres cosas y se comprueban las tres por separado.
  let descubierta = true;
  try {
    await p.waitForFunction(() => {
      const f = document.querySelector('#mc-osd iframe');
      return f && !f.classList.contains('cargando');
    }, null, { timeout: 60000 });
  } catch (e) { descubierta = false; }
  const revelada = await p.evaluate(() => {
    const f = document.querySelector('#mc-osd iframe');
    return { opacidad: getComputedStyle(f).opacity, fondo: getComputedStyle(f).backgroundColor,
             espera: !!document.querySelector('.mc-osd-espera') };
  });
  test('§5 la pantalla se descubre de UNA VEZ, cuando el mundo de dentro ya esta', () => {
    assert(descubierta, 'el iframe se quedo en «cargando»: el hijo nunca mando osd-listo');
    assert(revelada.opacidad === '1', 'opacity = ' + revelada.opacidad);
    assert(!revelada.espera, 'la ruedecita de espera sigue puesta');
  });
  test('§5 …y su fondo es transparente, no un telon negro', () =>
    assert(/rgba\(0, 0, 0, 0\)|transparent/.test(revelada.fondo), 'background del iframe = ' + revelada.fondo));

  const trans = await hijo.evaluate(() => {
    const gl = mc.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    // 1 · el fondo pelado: lo que queda donde no hay NADA dibujado. Se lee del propio framebuffer y no de
    //     una captura, porque el canvas no lleva preserveDrawingBuffer y fuera del frame sale negro.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const vacio = new Uint8Array(4);
    gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, vacio);
    // 2 · y en un frame de verdad: el cielo tiene que seguir siendo un AGUJERO. No se mira una franja fija
    //     (donde cae el horizonte depende de a donde mire el spawn del mapa) sino cuantos pixeles del
    //     fotograma entero dejan ver: si el cielo se pintara, serian cero.
    mcRender();
    const buf = new Uint8Array(4 * W * H);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let cielo = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] === 0) cielo++;
    const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
    // Y las dos costuras que tambien pintaban de azul: el cartel de carga y los avisos.
    mcShowLoading('no deberia verse');
    toast('tampoco');
    return { alphaClear: gl.getParameter(gl.COLOR_CLEAR_VALUE)[3], alphaVacio: vacio[3],
             cieloTransparente: cielo, pixeles: W * H,
             html: getComputedStyle(document.documentElement).backgroundColor,
             body: bg('body'), modal: bg('#mc-modal'),
             cabecera: getComputedStyle(document.querySelector('header')).display,
             cartel: !document.querySelector('#mc-loading').hidden,
             aviso: !document.querySelector('#toast').hidden };
  });
  test('§5 …el cielo NO se pinta: el frame se limpia con alpha 0 y se ve a traves', () => {
    assert(trans.alphaClear === 0, 'clearColor con alpha ' + trans.alphaClear + ' (deberia ser 0)');
    assert(trans.alphaVacio === 0, 'donde no hay nada dibujado sale opaco (alpha ' + trans.alphaVacio + ')');
    assert(trans.cieloTransparente > trans.pixeles / 100,
      'el fotograma tapa casi entero: solo ' + trans.cieloTransparente + ' de ' + trans.pixeles + ' pixeles dejan ver');
  });
  test('§5 …y ninguna capa del documento vuelve a taparlo', () => {
    const opaco = c => !/rgba\(0, 0, 0, 0\)|transparent/.test(c);
    assert(!opaco(trans.html), '<html> pinta fondo: ' + trans.html);
    assert(!opaco(trans.body), '<body> pinta fondo: ' + trans.body);
    assert(!opaco(trans.modal), '#mc-modal pinta fondo (el azul de siempre): ' + trans.modal);
    assert(trans.cabecera === 'none', 'la cabecera del editor asoma por detras de la pantalla');
  });
  test('§5 …y la pantalla no habla: ni cartel de carga ni avisos', () => {
    assert(!trans.cartel, 'el cartel de carga se enseña dentro de un OSD');
    assert(!trans.aviso, 'los toasts salen dentro de un OSD');
  });

  // ── §3 · el puente ─────────────────────────────────────────────────────────────────────────────
  // Se dispara mcOsdEnvia DESDE el hijo, que es exactamente lo que hace el clic sobre un bloque-nota.
  // La accion tiene que ejecutarse EN EL PADRE: la pantalla solo dice que boton se ha pulsado.
  const envio = await hijo.evaluate(() => ({ enviado: mcOsdEnvia('JUGAR'), aquiHay: game.osd.acciones().length }));
  await p.waitForTimeout(400);
  const enPadre = await p.evaluate(() => window.__pulsados.slice());
  test('§3 la pantalla NO ejecuta la accion: la manda al mundo de fuera', () => {
    assert(envio.enviado === true, 'mcOsdEnvia devolvio ' + envio.enviado);
    assert(envio.aquiHay === 0, 'la pantalla tiene ' + envio.aquiHay + ' acciones propias registradas');
  });
  test('§3 …y el padre la ejecuta', () =>
    assert(enPadre.length === 1 && enPadre[0] === 'JUGAR', 'el padre vio ' + JSON.stringify(enPadre)));

  // Un mensaje de otro origen no puede mover nada. Se simula el caso mas cercano que permite el
  // navegador: el mismo mensaje con un `vf` que no es el nuestro.
  const ruido = await p.evaluate(async () => {
    window.postMessage({ vf: 'otra-cosa', texto: 'JUGAR' }, location.origin);
    window.postMessage('JUGAR', location.origin);
    await new Promise(s => setTimeout(s, 300));
    return window.__pulsados.length;
  });
  test('§3 un mensaje que no es del puente no dispara nada', () =>
    assert(ruido === 1, 'se han disparado ' + ruido + ' acciones'));

  // ── §4 · cerrar DESTRUYE el iframe ─────────────────────────────────────────────────────────────
  const cerrada = await p.evaluate(() => {
    game.osd.cerrar();
    return { abierta: game.osd.abierta, iframes: $('#mc-osd').querySelectorAll('iframe').length,
             oculta: $('#mc-osd').hidden };
  });
  await p.waitForTimeout(500);
  const frames = p.frames().filter(f => /osd=1/.test(f.url())).length;
  test('§4 cerrar quita el iframe del DOM (un contexto WebGL colgado no se recupera)', () => {
    assert(cerrada.abierta === null, 'sigue abierta');
    assert(cerrada.iframes === 0, 'quedan ' + cerrada.iframes + ' iframes en la capa');
    assert(cerrada.oculta, 'la capa sigue visible');
  });
  test('§4 …y el navegador ya no tiene ese frame vivo', () =>
    assert(frames === 0, 'quedan ' + frames + ' frames de pantalla vivos'));

  // ── §6 · REQ-OSD7 · el ENCUADRE de una pantalla-mapa ──────────────────────────────────────────
  // «cuando se muestra un osd se deberia de poder indicar las coordenadas (teleport) del jugador para
  // poder encuadrar correctamente el menu… tambien la rotacion de la camara». Se declara en el define y
  // viaja en la URL del iframe, porque tiene que estar puesto ANTES del primer fotograma: por
  // postMessage llegaria con el hijo ya pintado, y eso se ve como un salto de camara.
  const ENC = { pos: [40, 24, 44], yaw: -135, pitch: -20 };
  const src2 = await p.evaluate(({ mapa, e }) => {
    game.osd.define('encuadrada', { mapa, pos: e.pos, yaw: e.yaw, pitch: e.pitch });
    game.osd.abrir('encuadrada');
    return document.querySelector('#mc-osd iframe').getAttribute('src');
  }, { mapa: MAPA, e: ENC });
  test('§6 el encuadre declarado viaja en la URL de la pantalla', () => {
    assert(/[?&]pos=40,24,44(&|$)/.test(src2), 'src = ' + src2);
    assert(/[?&]yaw=-135(&|$)/.test(src2) && /[?&]pitch=-20(&|$)/.test(src2), 'src = ' + src2);
  });

  let hijo2 = null;
  for (let i = 0; i < 120 && !hijo2; i++) {
    hijo2 = p.frames().find(f => f !== p.mainFrame() && /pos=40,24,44/.test(f.url()));
    if (!hijo2) await p.waitForTimeout(500);
  }
  assert(hijo2, 'no encuentro el frame de la pantalla encuadrada');
  await hijo2.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await p.waitForFunction(() => {
    const f = document.querySelector('#mc-osd iframe');
    return f && !f.classList.contains('cargando');
  }, null, { timeout: 60000 }).catch(() => {});
  const camara = await hijo2.evaluate(() => ({ pos: mc.pos.slice(), yaw: game.yaw, pitch: game.pitch,
                                               enc: game.osd.encuadre() }));
  test('§6 …y la camara de la pantalla acaba EXACTAMENTE ahi', () => {
    assert(camara.pos.join(',') === '40,24,44', 'pos = ' + camara.pos.join(','));
    assert(camara.yaw === -135, 'yaw = ' + camara.yaw);
    assert(camara.pitch === -20, 'pitch = ' + camara.pitch);
  });
  // El descubridor: encuadrar es volar hasta que se vea bien y copiar. game.osd.encuadre() devuelve
  // (e imprime) el define ya escrito, en las MISMAS unidades que se declaran.
  test('§6 …y game.osd.encuadre() devuelve lo que hay que pegar en el define', () => {
    assert(camara.enc.mapa === MAPA, 'mapa = ' + camara.enc.mapa);
    assert(camara.enc.pos.join(',') === '40,24,44', 'encuadre().pos = ' + camara.enc.pos.join(','));
    assert(camara.enc.yaw === -135 && camara.enc.pitch === -20, 'encuadre() gira distinto: ' + JSON.stringify(camara.enc));
  });
  // Sin encuadre declarado no se toca nada: una pantalla de las de antes sigue saliendo donde su spawn.
  const src3 = await p.evaluate(mapa => {
    game.osd.cerrar();
    game.osd.define('suelta', { mapa });
    game.osd.abrir('suelta');
    const s = document.querySelector('#mc-osd iframe').getAttribute('src');
    game.osd.cerrar();
    return s;
  }, MAPA);
  test('§6 …y una pantalla sin encuadre no lleva nada en la URL (sigue en su spawn)', () =>
    assert(src3 === '/map/' + MAPA + '?osd=1', 'src = ' + src3));

  // ── §7 · REQ-OSD8 · el teclado sigue siendo del juego de DETRAS ───────────────────────────────
  // «no funciona ni escape ni alt+c para ir al editor de codigo». Pulsar un boton del menu le da el foco
  // al <iframe>, y desde ese momento las teclas las recibe el hijo, que es un app.js entero: Esc le hacia
  // closeWorld() DENTRO del iframe y Alt+C le abria SU panel de codigo, invisible detras del menu. El
  // sintoma es «no funciona», la causa es «lo atendio el otro». Este bloque se hace con un clic de raton
  // de verdad: sin el, el foco nunca sale del padre y el fallo no se reproduce.
  await p.evaluate(mapa => { game.osd.define('teclas', { mapa }); game.osd.abrir('teclas'); }, MAPA);
  let hijo3 = null;
  for (let i = 0; i < 120 && !hijo3; i++) {
    hijo3 = p.frames().find(f => f !== p.mainFrame() && /osd=1/.test(f.url()));
    if (!hijo3) await p.waitForTimeout(500);
  }
  assert(hijo3, 'no encuentro el frame de la pantalla de teclas');
  await hijo3.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  const caja = await (await p.$('#mc-osd iframe')).boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.waitForTimeout(400);
  const focoTrasClic = await p.evaluate(() => document.activeElement.tagName);
  test('§7 pulsar en la pantalla le da el foco al iframe (el escenario del fallo)', () =>
    assert(focoTrasClic === 'IFRAME', 'el foco no se fue al iframe, se fue a ' + focoTrasClic));

  await p.keyboard.press('Alt+c');
  await p.waitForTimeout(700);
  const trasAltC = await p.evaluate(() => ({ snipPadre: !document.querySelector('#snip-modal').hidden,
                                             osd: mc.osdAbierta, foco: document.activeElement.tagName }));
  const snipHijo = await hijo3.evaluate(() => !document.querySelector('#snip-modal').hidden).catch(() => 'frame muerto');
  test('§7 Alt+C abre el panel de codigo DEL PADRE, no el del iframe', () => {
    assert(trasAltC.snipPadre === true, 'el padre no abrio #snip-modal');
    assert(snipHijo === false, 'lo abrio el hijo: ' + snipHijo);
    assert(trasAltC.osd === 'teclas', 'la pantalla se cerro sola: ' + trasAltC.osd);
  });
  test('§7 …y la primera tecla devuelve el foco al padre', () =>
    assert(trasAltC.foco !== 'IFRAME', 'el foco sigue en el iframe'));

  await p.evaluate(() => { closeSnips(); });
  await p.waitForTimeout(300);
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);   // el foco, otra vez dentro
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  const trasEsc = await p.evaluate(() => ({ osd: mc.osdAbierta, iframe: !!document.querySelector('#mc-osd iframe'),
                                            mundo: !document.querySelector('#mc-modal').hidden }));
  test('§7 Esc con el foco dentro cierra la PANTALLA, no el mundo del iframe', () => {
    assert(trasEsc.osd === null, 'la pantalla sigue abierta: ' + trasEsc.osd);
    assert(trasEsc.iframe === false, 'el iframe sigue en el DOM');
    assert(trasEsc.mundo === true, 'Esc se llevo por delante el Mundo del padre');
  });

  // ── §8 · REQ-OSD9 · mapa Y html a la vez: el mapa de fondo, el html de botones ────────────────
  // Antes había que elegir, y quien quería las dos cosas acababa metiendo su panel DENTRO de la pantalla
  // (un snippet corriendo en el mundo del iframe), donde las acciones afectan al menú y no al juego. Lo
  // que este bloque fija es justo eso: el html vive en el DOM del PADRE, sus botones disparan la accion
  // del padre, y aun asi NO se traga los clics que van al mapa (los botones-bloque tienen que seguir vivos).
  await p.evaluate(mapa => {
    mc._osd9 = 0;
    game.osd.alPulsar('COMBI', () => { mc._osd9++; });
    game.osd.define('combi', { mapa, html:'<div class="mc-osd-panel"><button class="mc-osd-btn">COMBI</button></div>' });
    game.osd.abrir('combi');
  }, MAPA);
  let hijo4 = null;
  for (let i = 0; i < 120 && !hijo4; i++) {
    hijo4 = p.frames().find(f => f !== p.mainFrame() && /osd=1/.test(f.url()));
    if (!hijo4) await p.waitForTimeout(500);
  }
  assert(hijo4, 'no encuentro el frame de la pantalla combinada');
  await hijo4.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  // Se espera a que el panel ESTE del todo visible y no un tiempo fijo: entre quitar la clase y llegar a
  // opacity 1 hay una transicion CSS, y medir dentro de ella da un 0 que no significa nada.
  await p.waitForFunction(() => {
    const pa = document.querySelector('#mc-osd .mc-osd-html');
    return pa && getComputedStyle(pa).opacity === '1';
  }, null, { timeout: 60000 }).catch(() => {});

  const combi = await p.evaluate(() => {
    const capa = document.querySelector('#mc-osd');
    const panel = capa.querySelector('.mc-osd-html');
    const cs = panel ? getComputedStyle(panel) : null;
    return { iframe: !!capa.querySelector('iframe'), panel: !!panel,
             boton: !!(panel && panel.querySelector('button')),
             pasaClics: cs && cs.pointerEvents, visible: cs && cs.opacity,
             botonPulsable: panel && getComputedStyle(panel.querySelector('button')).pointerEvents };
  });
  test('§8 la pantalla lleva el mapa Y el html, no uno u otro', () => {
    assert(combi.iframe === true, 'no hay iframe del mapa');
    assert(combi.panel === true, 'no hay panel html en el DOM del padre');
    assert(combi.boton === true, 'el panel no llego con sus botones');
  });
  test('§8 …y el panel NO se traga los clics del mapa (los botones-bloque siguen vivos)', () => {
    assert(combi.pasaClics === 'none', 'el panel intercepta el raton: pointer-events=' + combi.pasaClics);
    assert(combi.botonPulsable === 'auto', 'el boton no recibe el raton: ' + combi.botonPulsable);
  });
  test('§8 …y se descubre a la vez que el mapa, sin parpadeo', () =>
    assert(combi.visible === '1', 'el panel se quedo invisible: opacity=' + combi.visible));

  await p.click('#mc-osd .mc-osd-html button');
  await p.waitForTimeout(300);
  const trasClic = await p.evaluate(() => ({ veces: mc._osd9, osd: mc.osdAbierta }));
  test('§8 …y su boton ejecuta la accion DEL PADRE (no la del mundo del iframe)', () => {
    assert(trasClic.veces === 1, 'la accion corrio ' + trasClic.veces + ' veces');
    assert(trasClic.osd === 'combi', 'la pantalla se cerro sola');
  });
  await p.evaluate(() => game.osd.cerrar());

  // ── §9 · REQ-OSD10 · `sitio:` decide DONDE cae el panel ───────────────────────────────────────
  // «el OSD de botones tapa el grafico de fondo». Centrado sobre un mapa se come justo lo que se ha ido a
  // enseñar. Se comprueba por la caja en pantalla y no por el CSS: lo que importa es donde acaba el panel.
  const sitios = { 'centro': [1, 1], 'abajo-derecha': [2, 2], 'arriba-izquierda': [0, 0], 'abajo': [1, 2], 'derecha': [2, 1] };
  //                            ^ tercios [horizontal, vertical]: 0=inicio, 1=centro, 2=final
  for (const [sitio, esperado] of Object.entries(sitios)) {
    const caja = await p.evaluate(s => {
      game.osd.define('sit', { html: '<div class="mc-osd-panel"><button class="mc-osd-btn">X</button></div>', sitio: s });
      game.osd.abrir('sit');
      const el = document.querySelector('#mc-osd .mc-osd-panel').getBoundingClientRect();
      const capa = document.querySelector('#mc-osd').getBoundingClientRect();
      const tercio = (c, min, tam) => (c - min) / tam < 1 / 3 ? 0 : (c - min) / tam > 2 / 3 ? 2 : 1;
      return [tercio(el.x + el.width / 2, capa.x, capa.width), tercio(el.y + el.height / 2, capa.y, capa.height)];
    }, sitio);
    test('§9 sitio:"' + sitio + '" pone el panel donde dice', () =>
      assert(caja[0] === esperado[0] && caja[1] === esperado[1],
        'esperaba tercio [' + esperado + '] y cayo en [' + caja + ']'));
  }

  const aviso = [];
  p.on('console', m => { if (m.type() === 'warning') aviso.push(m.text()); });
  await p.evaluate(() => {
    game.osd.define('sit', { html: '<div class="mc-osd-panel">x</div>', sitio: 'abajo-derexa' });
    game.osd.abrir('sit');
  });
  await p.waitForTimeout(200);
  test('§9 …y un sitio mal escrito AVISA en vez de centrar en silencio', () =>
    assert(aviso.some(t => /derexa/.test(t) && /sitio/.test(t)), 'no salio el aviso: ' + JSON.stringify(aviso)));
  await p.evaluate(() => game.osd.cerrar());

  // ── §10 · REQ-OSD11 · cambiar de pantalla NO recarga el mapa del fondo ────────────────────────
  // Un menu de verdad son varias pantallas (MENU, AJUSTES, VOLAR ON/OFF) sobre el MISMO decorado. Con el
  // iframe destruido y montado de cero en cada salto, cambiar un boton costaba una descarga del mundo
  // entera, con su spinner: segundos de espera por tres letras. La marca se pone en el `contentWindow`
  // del hijo porque una recarga la borra — es la unica prueba de que el iframe no se ha vuelto a levantar.
  const marca = async () => p.evaluate(() => { document.querySelector('#mc-osd iframe').contentWindow.__vfMarca = 1; });
  const sigueVivo = async () => p.evaluate(() => {
    const f = document.querySelector('#mc-osd iframe');
    return { hay: !!f, marca: !!(f && f.contentWindow && f.contentWindow.__vfMarca) };
  });
  const esperaPanel = async () => p.waitForFunction(() => {
    const pa = document.querySelector('#mc-osd .mc-osd-html');
    return pa && getComputedStyle(pa).opacity === '1';
  }, null, { timeout: 60000 }).catch(() => {});

  await p.evaluate(mapa => {
    const e = { mapa, pos: [8, 12, 8], yaw: 30, pitch: -20 };
    game.osd.define('menu',    Object.assign({ html: '<div class="mc-osd-panel"><button>AJUSTES</button></div>' }, e));
    game.osd.define('ajustes', Object.assign({ html: '<div class="mc-osd-panel"><button>VOLVER</button></div>' }, e));
    game.osd.define('otra',    Object.assign({ html: '<div class="mc-osd-panel"><button>X</button></div>' }, e, { pitch: -60 }));
    game.osd.abrir('menu');
  }, MAPA);
  let hijo5 = null;
  for (let i = 0; i < 120 && !hijo5; i++) {
    hijo5 = p.frames().find(f => f !== p.mainFrame() && /osd=1/.test(f.url()));
    if (!hijo5) await p.waitForTimeout(500);
  }
  test('§10 la pantalla de partida monta su iframe', () => assert(!!hijo5, 'no encuentro el frame de "menu"'));
  await hijo5.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await esperaPanel();
  await marca();

  const t0 = Date.now();
  await p.evaluate(() => game.osd.abrir('ajustes'));
  const trasSalto = await sigueVivo();
  const salto = Date.now() - t0;
  const textoSalto = await p.evaluate(() => document.querySelector('#mc-osd .mc-osd-html button').textContent);
  test('§10 saltar a otra pantalla con el MISMO fondo reaprovecha el iframe vivo', () => {
    assert(trasSalto.hay === true, 'el iframe desaparecio del DOM');
    assert(trasSalto.marca === true, 'el iframe se recargo: el mapa del fondo se ha vuelto a descargar');
  });
  test('§10 …y el panel de botones SI cambia (no es que no hiciera nada)', () =>
    assert(textoSalto === 'VOLVER', 'el panel no se repinto: sigue poniendo "' + textoSalto + '"'));
  test('§10 …y el salto es inmediato, sin esperar a ningun mundo', () =>
    assert(salto < 1000, 'el salto tardo ' + salto + ' ms'));
  const opSalto = await p.evaluate(() => getComputedStyle(document.querySelector('#mc-osd .mc-osd-html')).opacity);
  test('§10 …y el panel nace visible, sin el velo de "cargando"', () =>
    assert(opSalto === '1', 'el panel nacio invisible: opacity=' + opSalto));

  // game.osd.html() · repintar los botones de la pantalla abierta (VOLAR: ON → OFF) sin tocar el fondo
  await p.evaluate(() => game.osd.html('<div class="mc-osd-panel"><button>VOLAR: OFF</button></div>'));
  const trasHtml = await sigueVivo();
  const estadoHtml = await p.evaluate(() => ({
    texto: document.querySelector('#mc-osd .mc-osd-html button').textContent,
    guardado: /OFF/.test(mc.osdPantallas['ajustes'].html || '')
  }));
  test('§10 game.osd.html() repinta los botones sin recargar el mapa del fondo', () => {
    assert(trasHtml.marca === true, 'game.osd.html() se llevo por delante el iframe');
    assert(estadoHtml.texto === 'VOLAR: OFF', 'el panel no se repinto: "' + estadoHtml.texto + '"');
  });
  test('§10 …y se queda en la definicion, para que reabrirla enseñe lo mismo', () =>
    assert(estadoHtml.guardado === true, 'la pantalla abierta conservo el html viejo'));

  // Un encuadre distinto SI es otro decorado: ahi el iframe tiene que volver a montarse.
  await p.evaluate(() => game.osd.abrir('otra'));
  await p.waitForTimeout(500);
  const trasOtra = await sigueVivo();
  test('§10 …pero un encuadre distinto SI remonta el iframe (es otro fondo)', () => {
    assert(trasOtra.hay === true, 'no se monto el iframe nuevo');
    assert(trasOtra.marca === false, 'reaprovecho un fondo que ya no vale: el encuadre cambio');
  });
  await p.evaluate(() => game.osd.cerrar());

  // ── §11 · REQ-OSD11 · el aviso de espera GIRA, y gira en su sitio ─────────────────────────────
  // `.mc-osd-espera` se centra con transform:translate(-50%,-50%) y se anima con transform:rotate(). Si
  // los keyframes no repiten el translate, la animacion pisa la propiedad entera y el navegador interpola
  // las dos matrices: el punto se desliza abajo-derecha y no gira (360 grados se descomponen en 0). Se
  // veia como «el spinner se mueve raro». Se mira la MATRIZ, que es lo unico que distingue un caso de otro.
  await p.evaluate(mapa => { game.osd.define('esp', { mapa }); game.osd.abrir('esp'); }, MAPA);
  await p.waitForTimeout(120);
  const giro = [];
  for (let i = 0; i < 4; i++) {
    giro.push(await p.evaluate(() => {
      const e = document.querySelector('#mc-osd .mc-osd-espera');
      if (!e) return null;
      const m = getComputedStyle(e).transform.match(/matrix\(([^)]+)\)/);
      if (!m) return null;
      const n = m[1].split(',').map(Number);
      return { a: n[0], b: n[1], tx: n[4], ty: n[5] };   // a,b = rotacion · tx,ty = centrado
    }));
    await p.waitForTimeout(150);
  }
  const leidos = giro.filter(Boolean);
  test('§11 el aviso de espera existe mientras la pantalla viene', () =>
    assert(leidos.length >= 3, 'no pude leer el spinner: ' + leidos.length + ' lecturas'));
  test('§11 …y GIRA de verdad (la matriz tiene rotacion, no solo desplazamiento)', () =>
    assert(leidos.some(g => Math.abs(g.b) > 0.05 || g.a < 0.95),
      'la matriz es una traslacion pura, el punto se desliza en vez de girar: ' + JSON.stringify(leidos[0])));
  test('§11 …y gira SIN moverse del centro (el desplazamiento no cambia)', () => {
    const txs = new Set(leidos.map(g => Math.round(g.tx))), tys = new Set(leidos.map(g => Math.round(g.ty)));
    assert(txs.size === 1 && tys.size === 1,
      'el centrado se mueve durante la animacion: tx=' + [...txs] + ' ty=' + [...tys]);
  });
  await p.evaluate(() => game.osd.cerrar());

  // `vivo:false` · un decorado quieto no arrastra el autoarranque del mundo detras
  const pedidos = [];
  p.on('request', r => pedidos.push(r.url()));
  await p.evaluate(mapa => { game.osd.define('postal', { mapa, vivo: false }); game.osd.abrir('postal'); }, MAPA);
  const urlPostal = await p.evaluate(() => document.querySelector('#mc-osd iframe').src);
  let hijo6 = null;
  for (let i = 0; i < 120 && !hijo6; i++) {
    hijo6 = p.frames().find(f => f !== p.mainFrame() && /postal=1/.test(f.url()));
    if (!hijo6) await p.waitForTimeout(500);
  }
  test('§11 vivo:false viaja en la URL como &postal=1', () =>
    assert(/[?&]postal=1/.test(urlPostal), 'la URL no lo lleva: ' + urlPostal));
  if (hijo6) {
    await hijo6.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
    await p.waitForFunction(() => { const f = document.querySelector('#mc-osd iframe'); return f && !f.classList.contains('cargando'); }, null, { timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(1500);
  }
  test('§11 …y el decorado NO pide el autoarranque del mundo', () =>
    assert(!pedidos.some(u => /snippets\/mundo-autoarranque/.test(u)),
      'la postal se trajo mundo-autoarranque igual (274 KB de snippet por un fondo quieto)'));
  await p.evaluate(() => game.osd.cerrar());

  // ── §12 · REQ-OSD12 · con un menu puesto, el HUD del juego se aparta ──────────────────────────
  const hud = async () => p.evaluate(() => {
    const v = q => { const e = document.querySelector(q); return e ? (e.hidden ? 'oculto' : getComputedStyle(e).display) : 'no existe'; };
    return { codigo: v('#mc-code-btn'), cerrar: v('#mc-close'), hotbar: v('.mc-hotbar'), mira: v('.mc-crosshair') };
  });
  await p.evaluate(() => { game.showOSDbuttons(true); game.osd.cerrar(); });
  const antes = await hud();
  await p.evaluate(() => {
    game.osd.define('hud0', { html: '<div class="mc-osd-panel"><button>X</button></div>' });
    game.osd.abrir('hud0');
  });
  await p.waitForTimeout(200);
  const durante = await hud();
  await p.evaluate(() => game.osd.cerrar());
  await p.waitForTimeout(200);
  const despues = await hud();
  await p.evaluate(() => {
    game.osd.define('hud1', { html: '<div class="mc-osd-panel"><button>X</button></div>', hud: true });
    game.osd.abrir('hud1');
  });
  await p.waitForTimeout(200);
  const conHud = await hud();
  await p.evaluate(() => { game.osd.cerrar(); game.showOSDbuttons(false); });

  test('§12 el HUD esta puesto antes de abrir el menu (o el test no probaria nada)', () =>
    assert(antes.hotbar !== 'none' && antes.codigo !== 'none' && antes.codigo !== 'oculto',
      'el HUD ya venia escondido: ' + JSON.stringify(antes)));
  test('§12 con el menu puesto se apartan hotbar, mira, CODIGO y CERRAR', () =>
    assert(Object.values(durante).every(v => v === 'none'),
      'algo del HUD sigue encima del menu: ' + JSON.stringify(durante)));
  test('§12 …y vuelven todos al cerrar el menu', () =>
    assert(JSON.stringify(despues) === JSON.stringify(antes),
      'el HUD no volvio igual: ' + JSON.stringify(antes) + ' → ' + JSON.stringify(despues)));
  test('§12 …y `hud:true` lo deja puesto (un panel sobre la partida viva)', () =>
    assert(conHud.hotbar !== 'none' && conHud.codigo !== 'none',
      'hud:true escondio el HUD igual: ' + JSON.stringify(conHud)));

  // ── §13 · una pantalla-mapa se encuadra a TAMAÑO 1, herede lo que herede ──────────────────────
  // `game.playerScale` persiste en localStorage y el iframe comparte origen con el padre, asi que un
  // visitante que se hubiera hecho grande o pequeño se llevaba su escala DENTRO del menu. El ojo es
  // `pos[1] + MC_EYE*mc.scale`, o sea que el mismo `pos` de la URL encuadraba distinto en cada
  // navegador: el menu sale descolocado y no hay forma de que el dueño lo cuadre para todos.
  const pEsc = await b.newPage();
  await pEsc.addInitScript(() => { try { localStorage.setItem('vf_mcScale', '4'); } catch (e) {} });
  await pEsc.goto(URL + '?osd=1&pos=10,20,10&yaw=90&pitch=-10', { waitUntil: 'load', timeout: 120000 });
  await pEsc.waitForFunction('typeof mc !== "undefined" && mc.grid', null, { timeout: 180000 });
  const esc = await pEsc.evaluate(() => ({
    escaparate: !!mc.escaparate, escala: mc.scale,
    guardada: localStorage.getItem('vf_mcScale'),           // el ajuste del visitante NO se pisa
    pos: mc.pos.slice(), yaw: Math.round(mc.yaw * 180 / Math.PI)
  }));
  // …y fuera del escaparate la escala guardada se sigue respetando (o el arreglo seria romper playerScale)
  const pJuego = await b.newPage();
  await pJuego.addInitScript(() => { try { localStorage.setItem('vf_mcScale', '4'); } catch (e) {} });
  await pJuego.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await pJuego.waitForFunction('typeof mc !== "undefined" && mc.grid', null, { timeout: 180000 });
  const juego = await pJuego.evaluate(() => ({ escaparate: !!mc.escaparate, escala: mc.scale }));
  await pEsc.close(); await pJuego.close();

  test('§13 la pantalla-mapa arranca en modo escaparate (o el test no probaria nada)', () =>
    assert(esc.escaparate, 'no es escaparate: ' + JSON.stringify(esc)));
  test('§13 y a tamaño 1 aunque el visitante tuviera playerScale=4', () =>
    assert(esc.escala === 1, 'mc.scale = ' + esc.escala));
  test('§13 …sin pisarle su ajuste guardado', () =>
    assert(esc.guardada === '4', 'vf_mcScale quedo en ' + esc.guardada));
  test('§13 …y el encuadre de la URL se aplica igual', () =>
    assert(esc.pos[0] === 10 && esc.pos[1] === 20 && esc.pos[2] === 10 && esc.yaw === 90,
      'encuadre ' + JSON.stringify(esc)));
  test('§13 fuera del menu, playerScale guardado se sigue respetando', () =>
    assert(!juego.escaparate && juego.escala === 4, JSON.stringify(juego)));

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
