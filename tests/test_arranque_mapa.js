// @area: general
// @necesita: servidor, playwright
//
// REQ-ARR1 · El autoarranque POR MAPA: 'mundo-<mapa>'.
//
// 'mundo-autoarranque' es uno solo para todos los mapas, así que lo que solo vale en un mundo concreto
// —una pieza que mira al jugador— se ejecutaba también donde esa pieza no está, llenando la consola de
// avisos legítimos en un mapa vacío. 'mundo-<mapa>' es el mismo punto de extensión, con nombre de mapa.
//
// ⚠️ NO se toca ningún snippet del disco del dueño: los dos escenarios se montan interceptando la RED
// (`/api/snippets/*`), igual que test_editor_tapa.js. Interceptar además el global es lo que hace este
// test rápido — el de verdad son 274 KB y bloquea el hilo varios segundos.
const { chromium } = require('playwright');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA  ' + nombre + '\n         ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

const snip = (id, code) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ id, name: id, code })
});
const noHay = { status: 404, contentType: 'application/json', body: '{"error":"no existe"}' };

// El global deja una marca y una capacidad; el del mapa las lee, para probar que HEREDA lo que aquél puso.
const CODE_GLOBAL = 'window.__orden = ["global"]; window.__delGlobal = 42;';

async function abre(ctx, mapa, codigoMapa, opciones) {
  const o = opciones || {};
  const p = await ctx.newPage();
  const avisos = [];
  p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') avisos.push(m.text()); });
  await p.route('**/api/snippets/mundo-autoarranque', r => r.fulfill(snip('mundo-autoarranque', CODE_GLOBAL)));
  // El mundo tarda ~1,6 s en cargar, así que NO vale un plazo fijo: se espera a que el motor pida el
  // snippet del mapa. La ruta se dispara también cuando la respuesta es 404, que es justo el caso §3.
  let pedido;
  const pedidoListo = new Promise(res => { pedido = res; });
  // `__ini` se pone en la PRIMERA línea del snippet, así que esperarla es esperar a que el motor lo
  // haya cargado y arrancado; lo que venga detrás corre ya en el mismo tick. Vale también para §4, que
  // revienta a la línea siguiente. Sin esto, la primera carga (fría, 431 KB) gana la carrera al plazo.
  await p.route('**/api/snippets/mundo-' + mapa, r => {
    pedido();
    return r.fulfill(codigoMapa === null ? noHay
      : snip('mundo-' + mapa, 'window.__ini=1;\n' + codigoMapa));
  });
  await p.goto('http://localhost:8500/map/' + mapa + (o.query || ''), { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await pedidoListo;
  if (codigoMapa !== null) await p.waitForFunction('window.__ini===1', null, { timeout: 30000 });
  await p.waitForTimeout(300);                       // el aviso del catch (§4) llega justo detrás
  const estado = await p.evaluate(`({
    orden: window.__orden || null,
    visto: window.__visto === undefined ? null : window.__visto,
    vivo: typeof mc !== 'undefined' && !!mc.grid,
    mapa: mcMapName()
  })`);
  estado.avisos = avisos;
  await p.close();
  return estado;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext();

  console.log('\n§1 · el snippet del mapa corre, y corre DESPUÉS del global');
  {
    const r = await abre(ctx, 'test', 'window.__orden.push("mapa:" + mcMapName());');
    test('corre sin que la URL pida nada (ni ?intro=1 ni nada)',
      () => assert(r.orden && r.orden.length === 2, 'orden=' + JSON.stringify(r.orden)));
    test('el global va primero', () => assert(r.orden[0] === 'global', 'primero=' + r.orden[0]));
    test('el del mapa va después y sabe en qué mapa está',
      () => assert(r.orden[1] === 'mapa:test', 'segundo=' + r.orden[1]));
    test('corre UNA sola vez', () => assert(r.orden.filter(x => x.startsWith('mapa:')).length === 1,
      'veces=' + JSON.stringify(r.orden)));
  }

  console.log('\n§2 · hereda lo que dejó puesto el global');
  {
    const r = await abre(ctx, 'test', 'window.__visto = window.__delGlobal; window.__orden.push("mapa");');
    test('ve el estado que dejó el global', () => assert(r.visto === 42, 'visto=' + r.visto));
  }

  console.log('\n§3 · un mapa SIN snippet propio: ni pasa nada ni se avisa de nada');
  {
    const r = await abre(ctx, 'test', null);
    test('el global sigue corriendo', () => assert(r.orden && r.orden[0] === 'global', 'orden=' + JSON.stringify(r.orden)));
    test('no se ejecuta nada más', () => assert(r.orden.length === 1, 'orden=' + JSON.stringify(r.orden)));
    test('un 404 NO es un error: consola limpia de «mundo-»',
      () => assert(!r.avisos.some(a => /mundo-test/.test(a)), 'avisos=' + JSON.stringify(r.avisos)));
    test('el Mundo entra igual', () => assert(r.vivo, 'el Mundo no quedó vivo'));
  }

  console.log('\n§4 · si el snippet del mapa falla, el Mundo NO se cae');
  {
    const r = await abre(ctx, 'test', 'window.__orden.push("mapa"); throw new Error("boom de prueba");');
    test('el Mundo sigue vivo', () => assert(r.vivo, 'el Mundo se quedó sin grid'));
    test('se avisa del fallo con el nombre del snippet',
      () => assert(r.avisos.some(a => /mundo-test/.test(a) && /boom de prueba/.test(a)),
        'avisos=' + JSON.stringify(r.avisos)));
  }

  await ctx.close();
  await browser.close();
  console.log('\n' + (fallos ? '❌' : '✅') + '  ' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
