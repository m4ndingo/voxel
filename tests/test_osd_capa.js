// @area: render
// @necesita: servidor, playwright
// test_osd_capa.js — REQ-OSD2: la capa OSD (#mc-osd) y su API game.osd.
//
//   node tests/test_osd_capa.js [url]      por defecto http://localhost:8500/map/test
//
// El caso que de verdad protege es el §1: SIN pantalla abierta el Mundo se comporta exactamente como
// antes del ticket. Todo lo demas de este fichero es una funcion nueva; una regresion en el §1 seria
// que abrir un mapa cualquiera ha dejado de funcionar.
//
// La comprobacion de que «el OSD se traga el clic» se hace con la herramienta CUENTAGOTAS y no
// rompiendo un bloque: el cuentagotas no toca el mundo, asi que el test puede fallar sin dejar el mapa
// del dueño peor de lo que estaba.
//
// ⚠️ No confundir con test_botones_osd.js, que es de REQ-OSD1 (los dos botones de la esquina).

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
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
  await p.waitForFunction('window.game && game.osd && typeof game.osd.define === "function"', null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  // ── §1 · sin pantalla abierta, nada cambia ──────────────────────────────────────────────────────
  const virgen = await p.evaluate(() => ({
    abierta: game.osd.abierta,
    oculta: $('#mc-osd').hidden,
    vacia: $('#mc-osd').innerHTML === '',
    mias: game.osd.pantallas().filter(n => n === 'menu' || n === 'otra'),
    mundoAbierto: !$('#mc-modal').hidden
  }));
  // ⚠️ Esto NO puede exigir `pantallas().length === 0`, y lo exigia. El registro de pantallas y el de
  // acciones son UNO SOLO para toda la pagina, y `mundo-autoarranque` carga menus que definen las
  // suyas al entrar (`miosd` define `mi_menu*` desde hace meses; `menu-juego` registra su pausa desde
  // F5.3). O sea que este test se ponia rojo por que el dueño tuviera menus, que es lo normal, y no
  // por que la capa OSD estuviera mal. Lo que si tiene que ser cierto es que al arrancar no hay
  // NINGUNA pantalla ABIERTA, la capa esta vacia y oculta, y las de este test todavia no existen.
  test('§1 el Mundo arranca sin ninguna pantalla OSD abierta y con la capa vacia y oculta', () => {
    assert(virgen.abierta === null, 'arranca con la pantalla «' + virgen.abierta + '» abierta');
    assert(virgen.oculta, '#mc-osd no arranca oculto');
    assert(virgen.vacia, '#mc-osd arranca con contenido');
    assert(virgen.mias.length === 0, 'las pantallas de este test ya estaban definidas: ' + virgen.mias);
    assert(virgen.mundoAbierto, 'el Mundo no esta abierto');
  });

  // El cuentagotas NO toca el mundo: es la herramienta con la que se puede comprobar que el clic
  // llega (o no llega) sin arriesgar un bloque del mapa del dueño.
  const espia = () => p.evaluate(() => {
    const orig = window.mcPickBlock;
    let n = 0;
    window.mcPickBlock = () => { n++; };
    const tool = mc.tool;
    mc.tool = 'pick';
    const antes = n; mcDoAction(0); const cerrado = n - antes;
    mc.tool = tool;
    window.mcPickBlock = orig;
    return cerrado;
  });
  const sinOsd = await espia();
  test('§1 con la capa cerrada, mcDoAction ejecuta la herramienta de siempre', () =>
    assert(sinOsd === 1, 'la herramienta se ejecuto ' + sinOsd + ' veces, esperaba 1'));

  // ── §2 · define ────────────────────────────────────────────────────────────────────────────────
  const define = await p.evaluate(() => {
    const r = {};
    try { game.osd.define('', { html: 'x' }); r.sinNombre = 'no tiro'; } catch (e) { r.sinNombre = 'tiro'; }
    try { game.osd.define('vacia', {}); r.sinCuerpo = 'no tiro'; } catch (e) { r.sinCuerpo = 'tiro'; }
    game.osd.define('menu', { html: '<div class="mc-osd-panel"><button class="mc-osd-btn">JUGAR</button>' +
                                    '<button class="mc-osd-btn">CONSTRUIR</button></div>' });
    game.osd.define('otra', { html: '<div class="mc-osd-panel">otra</div>' });
    r.pantallas = game.osd.pantallas();
    return r;
  });
  test('§2 define exige nombre y {html:…} o {mapa:…}', () => {
    assert(define.sinNombre === 'tiro', 'define("") no protesta');
    assert(define.sinCuerpo === 'tiro', 'define sin html ni mapa no protesta');
  });
  // Se pregunta si ESTAN, no si son las unicas: en la lista hay tambien las de los menus que carga el
  // mundo (ver el aviso del §1). Que aparezcan las dos, y en el orden en que se definieron, es lo que
  // este caso dice comprobar.
  test('§2 las pantallas definidas se listan', () => {
    const mias = define.pantallas.filter(n => n === 'menu' || n === 'otra');
    assert(mias.join(',') === 'menu,otra', 'pantallas() = ' + define.pantallas);
  });

  // ── §3 · abrir: se ve, tapa el canvas y suelta el puntero ──────────────────────────────────────
  const abierto = await p.evaluate(() => {
    let pedidos = 0;
    const origLock = mc.canvas.requestPointerLock;
    mc.canvas.requestPointerLock = function () { pedidos++; };
    game.osd.abrir('menu');
    mcLockPointer();                       // con OSD abierto NO puede volver a capturar
    const capa = $('#mc-osd').getBoundingClientRect(), cv = mc.canvas.getBoundingClientRect();
    const r = {
      abierta: game.osd.abierta,
      visible: !$('#mc-osd').hidden,
      botones: $('#mc-osd').querySelectorAll('button').length,
      tapaElCanvas: capa.left <= cv.left && capa.top <= cv.top &&
                    capa.right >= cv.right && capa.bottom >= cv.bottom,
      pedidosDeCaptura: pedidos
    };
    mc.canvas.requestPointerLock = origLock;
    return r;
  });
  test('§3 abrir muestra la capa con su contenido', () => {
    assert(abierto.abierta === 'menu', 'game.osd.abierta = ' + abierto.abierta);
    assert(abierto.visible, '#mc-osd sigue oculto tras abrir');
    assert(abierto.botones === 2, 'se han montado ' + abierto.botones + ' botones, esperaba 2');
  });
  test('§3 la capa TAPA el canvas entero (si no, los clics rompen bloques por detras)', () =>
    assert(abierto.tapaElCanvas, 'la capa no cubre el canvas'));
  test('§3 con OSD abierto, mcLockPointer NO recaptura el raton', () =>
    assert(abierto.pedidosDeCaptura === 0, 'ha pedido la captura ' + abierto.pedidosDeCaptura + ' vez/veces'));

  const conOsd = await espia();
  test('§3 …y un clic que llegara al mundo no ejecuta la herramienta', () =>
    assert(conOsd === 0, 'la herramienta se ejecuto ' + conOsd + ' veces con el OSD abierto'));

  // ── §4 · las acciones ──────────────────────────────────────────────────────────────────────────
  const acciones = await p.evaluate(async () => {
    const vistos = [];
    window.__vistos = vistos;
    game.osd.alPulsar('JUGAR', () => vistos.push('jugar'));
    game.osd.alPulsar('  construir  ', () => vistos.push('construir'));   // se normaliza: trim + mayusculas
    const r = {};
    r.registradas = game.osd.acciones();
    r.porApi = game.osd.pulsar('jugar');                                   // minusculas: mismo boton
    const btn = Array.from($('#mc-osd').querySelectorAll('button')).find(b => /CONSTRUIR/.test(b.textContent));
    btn.click();                                                            // por el TEXTO del boton, como un bloque-nota
    r.desconocida = game.osd.pulsar('NO EXISTE');
    r.vistos = vistos.slice();
    return r;
  });
  // Lo que se comprueba es la NORMALIZACION: «  construir  » entra en el registro como CONSTRUIR. La
  // lista entera no vale para eso —lleva las acciones de los menus del mundo— y ademas es justo el
  // motivo por el que un menu propio no debe registrar nombres pelados: se pisan (ver `menu-juego`,
  // que por esto usa claves «pausa:…»).
  test('§4 el texto del boton se normaliza (trim + mayusculas)', () => {
    const mias = acciones.registradas.filter(t => t === 'JUGAR' || t === 'CONSTRUIR');
    assert(mias.join(',') === 'JUGAR,CONSTRUIR', 'acciones() = ' + acciones.registradas);
  });
  test('§4 game.osd.pulsar dispara la accion sin mirar mayusculas', () => {
    assert(acciones.porApi === true, 'pulsar("jugar") devolvio ' + acciones.porApi);
    assert(acciones.vistos[0] === 'jugar', 'no se ejecuto la accion de JUGAR');
  });
  test('§4 hacer clic en un boton de la pantalla dispara su accion por el texto', () =>
    assert(acciones.vistos.indexOf('construir') >= 0, 'el clic en CONSTRUIR no ejecuto nada'));
  test('§4 pulsar algo sin accion registrada no revienta: avisa y devuelve false', () =>
    assert(acciones.desconocida === false, 'pulsar("NO EXISTE") devolvio ' + acciones.desconocida));

  // ── §5 · una sola pantalla a la vez ────────────────────────────────────────────────────────────
  const solaUna = await p.evaluate(() => {
    game.osd.abrir('otra');
    return { abierta: game.osd.abierta, botones: $('#mc-osd').querySelectorAll('button').length,
             texto: $('#mc-osd').textContent.trim() };
  });
  test('§5 abrir otra pantalla sustituye a la anterior (dos iframes = dos contextos WebGL)', () => {
    assert(solaUna.abierta === 'otra', 'abierta = ' + solaUna.abierta);
    assert(solaUna.texto === 'otra', 'la capa aun enseña «' + solaUna.texto + '»');
  });

  // ── §6 · Esc cierra el OSD, NO el Mundo ────────────────────────────────────────────────────────
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  const trasEsc = await p.evaluate(() => ({
    abierta: game.osd.abierta, oculta: $('#mc-osd').hidden, vacia: $('#mc-osd').innerHTML === '',
    mundoAbierto: !$('#mc-modal').hidden
  }));
  test('§6 Esc cierra la pantalla OSD', () => {
    assert(trasEsc.abierta === null, 'sigue abierta «' + trasEsc.abierta + '»');
    assert(trasEsc.oculta, '#mc-osd no se ha ocultado');
    assert(trasEsc.vacia, 'la capa se queda con el contenido dentro');
  });
  test('§6 …y NO cierra el Mundo (Esc de dos pasos)', () =>
    assert(trasEsc.mundoAbierto, 'el Mundo se ha cerrado con el mismo Esc'));

  // ── §7 · conmutar ──────────────────────────────────────────────────────────────────────────────
  const conmutar = await p.evaluate(() => {
    const a = game.osd.conmutar('menu') && game.osd.abierta;
    game.osd.conmutar('menu');
    return { abre: a, cierra: game.osd.abierta };
  });
  test('§7 conmutar abre y vuelve a cerrar', () => {
    assert(conmutar.abre === 'menu', 'conmutar no abrio (' + conmutar.abre + ')');
    assert(conmutar.cierra === null, 'conmutar no cerro (' + conmutar.cierra + ')');
  });

  // ── §8 · game.osd.dump(): el descubridor ───────────────────────────────────────────────────────
  // Lo pidio el dueño para que quien no conoce el OSD pueda definir pantallas sin leerse app.js. Lo que
  // se protege no es el texto que imprime, sino que el volcado NO MIENTA: los botones tienen que salir
  // leidos igual que los lee mcOsdAbrir, y las dos averias normales —boton sin accion y accion sin
  // boton— tienen que quedar señaladas, que es para lo que se mira esto.
  const vol = await p.evaluate(() => {
    game.osd.define('dumpeada', { html: '<div><button class="mc-osd-btn">JUGAR</button><button> salir </button><span data-osd="OPCIONES">x</span></div>' });
    game.osd.define('dumpmapa', { mapa: 'menu1' });
    game.osd.alPulsar('JUGAR', () => { window.__loQueHace = 'un zumbido concreto'; });
    game.osd.alPulsar('HUERFANA', () => {});
    const d = game.osd.dump();
    return { d, pantallas: d.pantallas.map(x => x.nombre) };
  });
  const dHtml = vol.d.pantallas.find(x => x.nombre === 'dumpeada');
  const dMapa = vol.d.pantallas.find(x => x.nombre === 'dumpmapa');
  test('§8 dump() vuelca TODAS las pantallas definidas con su configuracion', () => {
    assert(vol.pantallas.indexOf('menu') >= 0 && dHtml && dMapa, 'faltan pantallas: ' + vol.pantallas.join(','));
    assert(dHtml.tipo === 'html' && dMapa.tipo === 'mapa', 'tipos mal: ' + dHtml.tipo + '/' + dMapa.tipo);
    assert(dMapa.cfg.mapa === 'menu1', 'la cfg no viaja en el volcado: ' + JSON.stringify(dMapa.cfg));
  });
  test('§8 …con los botones leidos como los lee el OSD (texto normalizado y data-osd)', () => {
    assert(dHtml.botones.map(b => b.texto).join(',') === 'JUGAR,SALIR,OPCIONES', 'botones = ' + JSON.stringify(dHtml.botones));
    assert(dMapa.botones === null, 'una pantalla {mapa:…} no puede inventarse botones: sus botones son bloques con nota');
  });
  // Lo que pidio el dueño al ver la primera version: «con esto no se que hace un boton, no se crear un
  // boton como los de esta pantalla». Asi que cada boton tiene que traer las DOS piezas que lo forman:
  // el HTML exacto (para copiarlo) y el codigo de su accion (para saber que hace).
  const jugar = dHtml.botones[0];
  test('§8 …diciendo QUE HACE cada boton, no solo como se llama', () => {
    assert(jugar.accion === true, 'JUGAR figura sin accion');
    assert(/un zumbido concreto/.test(jugar.hace || ''), 'no se vuelca el codigo de la accion: ' + jugar.hace);
    assert(vol.d.acciones.some(a => a.texto === 'JUGAR' && /un zumbido concreto/.test(a.hace)),
      'la lista de acciones no trae su codigo: ' + JSON.stringify(vol.d.acciones));
  });
  test('§8 …y DONDE se registro, que es donde hay que ir a cambiarlo', () =>
    assert(/consola/.test(jugar.origen || ''), 'origen = ' + jugar.origen));
  test('§8 …y el HTML exacto del boton, que es lo que hay que copiar para hacer otro', () =>
    assert(jugar.marca === '<button class="mc-osd-btn">JUGAR</button>', 'marca = ' + jugar.marca));
  test('§8 …y señalando las dos averias normales: boton sin accion y accion sin boton', () => {
    assert(dHtml.sinAccion.join(',') === 'SALIR,OPCIONES', 'sinAccion = ' + dHtml.sinAccion.join(','));
    assert(dHtml.botones[1].hace === null, 'un boton sin accion no puede traer codigo');
    assert(vol.d.sinBoton.indexOf('HUERFANA') >= 0, 'sinBoton = ' + vol.d.sinBoton.join(','));
    assert(vol.d.sinBoton.indexOf('JUGAR') < 0, 'JUGAR tiene boton y sale como huerfana');
  });
  // Lo que pidio el dueño en la TERCERA vuelta: «no me puedes dar un ejemplo con una funcion de la cual no
  // tengo sus parametros… deberian de autoresolverse». Asi que el volcado no trae la funcion pelada sino una
  // RECETA: la linea que resuelve sus ayudantes + el codigo + la llamada. Lo que se protege aqui es que ese
  // bloque, copiado tal cual a la consola (scope global, fuera del snippet donde se escribio), CORRE.
  const receta = await p.evaluate(() => {
    (function () {                       // ← este IIFE hace de snippet: `timbre` solo existe aqui dentro
      const timbre = { toca() { window.__eco = 'din'; } };
      function llamar() { timbre.toca(); }
      game.osd.define('dumpenv', { html: '<div><button class="mc-osd-btn">LLAMAR</button></div>' });
      game.osd.alPulsar('LLAMAR', llamar, { timbre });
    })();
    const b = game.osd.dump().pantallas.find(x => x.nombre === 'dumpenv').botones[0];
    // 1) el codigo pelado, sin la linea de entorno, es justo lo que fallaba: se comprueba que sigue fallando
    let pelado = 'no fallo';
    try { (0, eval)(b.hace + '\nllamar();'); } catch (e) { pelado = e.message; }
    window.__eco = null;
    // 2) la receta entera, copiada como se copia de la consola
    let corrio = null;
    try { (0, eval)(b.receta); } catch (e) { corrio = e.message; }
    // 3) y al pulsar de verdad, la accion no recibe ningun argumento que haya que explicar
    game.osd.alPulsar('CUANTOS', function () { window.__args = arguments.length; });
    game.osd.pulsar('CUANTOS');
    return { receta: b.receta, hace: b.hace, falta: b.falta, entorno: b.entorno,
             pelado, corrio, eco: window.__eco, args: window.__args };
  });
  test('§8 …y el ejemplo se AUTORRESUELVE: la receta trae delante lo que la accion usa de su snippet', () => {
    assert(/^const \{ timbre \} = game\.osd\.entorno\('LLAMAR'\);/.test(receta.receta),
      'la receta no abre resolviendo el entorno:\n' + receta.receta);
    assert(/\nllamar\(\);$/.test(receta.receta), 'la receta no termina llamando a la accion:\n' + receta.receta);
  });
  test('§8 …y copiada a la consola CORRE (que es de lo que se quejo el dueño)', () => {
    assert(receta.corrio === null, 'la receta copiada fallo: ' + receta.corrio);
    assert(receta.eco === 'din', 'la receta corrio pero no hizo lo del boton: eco = ' + receta.eco);
    assert(/timbre is not defined/.test(receta.pelado), 'sin la linea de entorno deberia fallar, y dio: ' + receta.pelado);
  });
  test('§8 …y la accion no tiene parametros que adivinar: se la llama sin argumentos', () => {
    assert(receta.args === 0, 'pulsar() le paso ' + receta.args + ' argumento(s) a la accion');
    assert(/^function llamar\(\)/m.test(receta.hace), 'la accion volcada declara parametros: ' + receta.hace.split('\n')[0]);
  });

  // Un descubridor que toca lo que describe no sirve: se mira con el menu puesto y todo tiene que seguir igual.
  const trasDump = await p.evaluate(() => {
    game.osd.abrir('menu');
    const antes = { abierta: game.osd.abierta, html: $('#mc-osd').innerHTML };
    const d = game.osd.dump();
    return { abiertaEnVolcado: d.abierta, marcada: d.pantallas.some(x => x.nombre === 'menu' && x.abierta),
             abierta: game.osd.abierta, intacto: $('#mc-osd').innerHTML === antes.html };
  });
  await p.evaluate(() => game.osd.cerrar());
  test('§8 …dice cual esta abierta y no toca nada al mirarla', () => {
    assert(trasDump.abiertaEnVolcado === 'menu' && trasDump.marcada, 'el volcado no marca la pantalla abierta');
    assert(trasDump.abierta === 'menu' && trasDump.intacto, 'dump() ha alterado la pantalla que estaba puesta');
  });

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
