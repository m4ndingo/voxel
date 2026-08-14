// @area: render
// @necesita: servidor, playwright
//
// REQ-OSD13 · El TAMAÑO del panel de `game.osd.define({html:…})`.
//
//   node tests/test_osd_medidas.js [url]      por defecto http://localhost:8500/map/test
//
// Encargo del dueño: «el menú que sale con game.osd.define es excesivamente grande; está bien para
// algunos casos, pero me gustaría poder elegir menús más compactos, tal vez escalar su tamaño, definir
// el espacio entre los botones (padding), etc.».
//
// El caso que de verdad protege es el §1: una pantalla que NO pida medidas tiene que verse exactamente
// como antes del ticket. El dueño tiene menús escritos y en marcha; que encojan solos sería la
// regresión. Todo lo demás es funcionalidad nueva.
//
// El otro caso caro es el §3: la fuente del juego (Pixeloid) solo sale nítida en múltiplos de 9 px, así
// que escalar NO puede dejar un cuerpo de letra en 18,9. Un menú pequeño y borroso es peor que uno
// grande, y la causa —una fuente de píxeles fuera de su rejilla— no se parece en nada al síntoma.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLA  ' + nombre + '\n         ' + e.message); fallos++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

const HTML = '<div class="mc-osd-panel">'
           +   '<div class="mc-osd-title">Menu</div>'
           +   '<button class="mc-osd-btn">UNO</button>'
           +   '<button class="mc-osd-btn">DOS</button>'
           + '</div>';

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const avisos = [], errores = [];
  p.on('console', m => { if (m.type() === 'warning') avisos.push(m.text()); });
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  // Ningún test escribe en el mundo del dueño.
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.osd && typeof game.osd.define === "function"', null, { timeout: 60000 });

  // Abre una pantalla con esa cfg y devuelve lo que el navegador CALCULA (no lo que pedimos).
  const mide = (cfg) => p.evaluate(`(() => {
    game.osd.cerrar();
    game.osd.define('__medidas', Object.assign({ html: ${JSON.stringify(HTML)} }, ${JSON.stringify(cfg)}));
    game.osd.abrir('__medidas');
    const capa   = document.querySelector('#mc-osd .mc-osd-html');
    const panel  = document.querySelector('#mc-osd .mc-osd-panel');
    const titulo = document.querySelector('#mc-osd .mc-osd-title');
    const boton  = document.querySelector('#mc-osd .mc-osd-btn');
    const cs = e => getComputedStyle(e);
    return {
      titulo:  parseFloat(cs(titulo).fontSize),
      boton:   parseFloat(cs(boton).fontSize),
      hueco:   parseFloat(cs(panel).rowGap),
      relleno: [parseFloat(cs(panel).paddingTop), parseFloat(cs(panel).paddingLeft)],
      relBoton:[parseFloat(cs(boton).paddingTop), parseFloat(cs(boton).paddingLeft)],
      minAncho: parseFloat(cs(boton).minWidth),
      anchoReal: Math.round(panel.getBoundingClientRect().width),
      altoReal:  Math.round(panel.getBoundingClientRect().height),
      varHueco: capa.style.getPropertyValue('--osd-hueco').trim()
    };
  })()`);

  console.log('\n§1 · una pantalla que no pide medidas se ve EXACTAMENTE como antes');
  const base = await mide({});
  {
    test('título 27px (3×9)',              () => assert(base.titulo === 27, 'titulo=' + base.titulo));
    test('botón 18px (2×9)',               () => assert(base.boton === 18, 'boton=' + base.boton));
    test('hueco 22px entre botones',       () => assert(base.hueco === 22, 'hueco=' + base.hueco));
    test('relleno del panel 34/44',        () => assert(base.relleno[0] === 34 && base.relleno[1] === 44,
      'relleno=' + JSON.stringify(base.relleno)));
    test('relleno del botón 18/26',        () => assert(base.relBoton[0] === 18 && base.relBoton[1] === 26,
      'relBoton=' + JSON.stringify(base.relBoton)));
    test('anchura mínima de botón 260px',  () => assert(base.minAncho === 260, 'minAncho=' + base.minAncho));
  }

  console.log('\n§2 · `escala` encoge el panel entero');
  {
    const r = await mide({ escala: 0.5 });
    test('el panel ocupa MENOS que el de serie', () => assert(r.anchoReal < base.anchoReal && r.altoReal < base.altoReal,
      r.anchoReal + '×' + r.altoReal + ' vs ' + base.anchoReal + '×' + base.altoReal));
    test('el espaciado escala', () => assert(r.hueco === 11, 'hueco=' + r.hueco));
    test('el relleno escala',   () => assert(r.relleno[0] === 17 && r.relleno[1] === 22,
      'relleno=' + JSON.stringify(r.relleno)));
    test('la anchura mínima escala', () => assert(r.minAncho === 130, 'minAncho=' + r.minAncho));

    const g = await mide({ escala: 1.5 });
    test('y también crece hacia arriba', () => assert(g.anchoReal > base.anchoReal, 'ancho=' + g.anchoReal));
  }

  console.log('\n§3 · los cuerpos de letra NO se salen de la rejilla de 9 de la fuente');
  {
    const escalas = [0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.3, 2];
    const sucios = [];
    for (const e of escalas) {
      const r = await mide({ escala: e });
      if (r.titulo % 9 || r.boton % 9) sucios.push('escala ' + e + ' → ' + r.titulo + '/' + r.boton);
    }
    test('todo cuerpo de letra es múltiplo de 9 a cualquier escala',
      () => assert(!sucios.length, sucios.join(', ')));
    const mini = await mide({ escala: 0.1 });
    test('y nunca baja de 9px, que es el mínimo legible',
      () => assert(mini.titulo >= 9 && mini.boton >= 9, mini.titulo + '/' + mini.boton));
  }

  console.log('\n§4 · cada medida se puede poner suelta');
  {
    const r = await mide({ hueco: 6, relleno: [10, 14], rellenoBoton: [4, 10], ancho: 0 });
    test('`hueco` es el espacio entre botones',  () => assert(r.hueco === 6, 'hueco=' + r.hueco));
    test('`relleno` acepta [vertical, horizontal]',
      () => assert(r.relleno[0] === 10 && r.relleno[1] === 14, 'relleno=' + JSON.stringify(r.relleno)));
    test('`rellenoBoton` va al botón',
      () => assert(r.relBoton[0] === 4 && r.relBoton[1] === 10, 'relBoton=' + JSON.stringify(r.relBoton)));
    // Lo compacto de verdad: sin anchura mínima cada botón mide lo que mida su texto.
    test('`ancho:0` deja el botón del tamaño de su texto',
      () => assert(r.minAncho === 0 && r.anchoReal < base.anchoReal / 2,
        'minAncho=' + r.minAncho + ' ancho=' + r.anchoReal + ' vs ' + base.anchoReal));

    const uno = await mide({ relleno: 12 });
    test('`relleno` con un solo número son los cuatro lados',
      () => assert(uno.relleno[0] === 12 && uno.relleno[1] === 12, 'relleno=' + JSON.stringify(uno.relleno)));
  }

  console.log('\n§5 · un cuerpo de letra a mano manda, pero avisa si se sale de la rejilla');
  {
    avisos.length = 0;
    const r = await mide({ titulo: 20, boton: 9 });
    test('se respeta lo que pidió quien lo escribió', () => assert(r.titulo === 20 && r.boton === 9,
      r.titulo + '/' + r.boton));
    test('avisa del 20 (no es múltiplo de 9) y propone el 18',
      () => assert(avisos.some(a => /20px/.test(a) && /18/.test(a)), 'avisos=' + JSON.stringify(avisos)));
    test('no avisa del 9, que sí lo es',
      () => assert(!avisos.some(a => /de 9px/.test(a)), 'avisos=' + JSON.stringify(avisos)));
  }

  console.log('\n§6 · una escala imposible no rompe nada: avisa y se queda en 1');
  {
    avisos.length = 0;
    const r = await mide({ escala: 'grande' });
    test('se comporta como el de serie', () => assert(r.titulo === base.titulo && r.hueco === base.hueco,
      r.titulo + '/' + r.hueco));
    test('y lo dice', () => assert(avisos.some(a => /escala/.test(a)), 'avisos=' + JSON.stringify(avisos)));
    const cero = await mide({ escala: 0 });
    test('escala 0 tampoco hace desaparecer el menú', () => assert(cero.titulo === base.titulo, 'titulo=' + cero.titulo));
  }

  console.log('\n§7 · repintar un botón no cambia la talla del menú');
  {
    await mide({ escala: 0.5, hueco: 6 });
    const r = await p.evaluate(`(() => {
      game.osd.html(${JSON.stringify(HTML.replace('UNO', 'UNO: ON'))});
      const panel = document.querySelector('#mc-osd .mc-osd-panel');
      const cs = getComputedStyle(panel);
      return { hueco: parseFloat(cs.rowGap),
               titulo: parseFloat(getComputedStyle(document.querySelector('#mc-osd .mc-osd-title')).fontSize) };
    })()`);
    test('el hueco sigue siendo el pedido', () => assert(r.hueco === 6, 'hueco=' + r.hueco));
    test('y el cuerpo de letra también',    () => assert(r.titulo === 14 || r.titulo === 18 || r.titulo === 9,
      'titulo=' + r.titulo));
  }

  console.log('\n§8 · el mundo queda como estaba');
  {
    const limpio = await p.evaluate(`(() => { game.osd.cerrar();
      return { abierta: game.osd.abierta, capa: !!document.querySelector('#mc-osd').hidden, vivo: !!mc.grid }; })()`);
    test('la pantalla se cierra', () => assert(!limpio.abierta && limpio.capa, JSON.stringify(limpio)));
    test('el Mundo sigue vivo',   () => assert(limpio.vivo, 'sin grid'));
    test('sin excepciones',       () => assert(!errores.length, errores.slice(0, 3).join(' | ')));
  }

  await b.close();
  console.log('\n' + (fallos ? '❌' : '✅') + '  ' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
