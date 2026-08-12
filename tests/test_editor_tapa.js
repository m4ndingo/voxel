// @area: editor
// @necesita: servidor, playwright
//
// REQ-EDIT1 · La tapa del arranque: la página no enseña el editor 2D/3D para taparlo un cuarto de segundo
// después. Antes, un 'editor-autoarranque' que navegara (`location.href='/map/empty?intro=1'`) pintaba el
// editor entero y lo tiraba a los ~100-250 ms — el «flashazo» del que se quejó el dueño.
//
// Lo que se comprueba es lo que se VE (`visibility` efectiva de la columna del editor), no la clase: la
// clase se puede quitar y dejar la página tapada por otro sitio, y al revés.
//
// El snippet del dueño NO se toca: cada escenario se monta interceptando la RED
// (`/api/snippets/editor-autoarranque`), que es como se prueban los tres finales sin escribir en su disco.
const { chromium } = require('playwright');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA  ' + nombre + '\n         ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// Sigue la página desde antes de que exista, apuntando qué se ve en cada momento.
async function observa(ctx, url, codigoSnippet, ms) {
  const p = await ctx.newPage();
  if (codigoSnippet !== undefined) {
    await p.route('**/api/snippets/editor-autoarranque', r => r.fulfill({
      status: codigoSnippet === null ? 404 : 200,
      contentType: 'application/json',
      body: codigoSnippet === null ? '{"error":"no hay"}'
        : JSON.stringify({ id: 'editor-autoarranque', name: 'editor-autoarranque', code: codigoSnippet })
    }));
  }
  const tiros = [];
  const t0 = Date.now();
  p.goto('http://localhost:8500' + url, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    let v;
    try {
      v = await p.evaluate(() => {
        const e = document.querySelector('.layout'), m = document.querySelector('#mc-modal');
        return {
          ve: e ? getComputedStyle(e).visibility === 'visible' : false,   // ¿se ve el editor 2D/3D?
          mundo: !!(m && !m.hidden),                                      // ¿está puesto el modal del Mundo?
          url: location.pathname + location.search
        };
      });
    } catch (err) { v = { navegando: true }; }
    tiros.push(Object.assign({ ms: Date.now() - t0 }, v));
    await p.waitForTimeout(30);
  }
  const urlFinal = p.url();
  await p.close();
  return { tiros, urlFinal };
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });

  // §1 · el caso del dueño: el snippet se va a otro sitio → NO se puede haber visto el editor ni un instante
  const redirige = await observa(ctx, '/', "location.href = '/map/empty';", 1200);
  const vioEditor = redirige.tiros.filter(t => t.ve && t.url === '/');
  test('§1 un autoarranque que navega no llega a enseñar el editor', () =>
    assert(vioEditor.length === 0,
      'el editor se vio ' + vioEditor.length + ' veces en / (a los ' + (vioEditor[0] || {}).ms + ' ms): eso es el flash'));
  test('§1 …y la navegación sí ocurre (o el test no probaria nada)', () =>
    assert(/\/map\/empty/.test(redirige.urlFinal), 'no navego: ' + redirige.urlFinal));

  // §2 · el caso peligroso: el snippet se queda. La página NO puede quedarse en negro.
  const sequeda = await observa(ctx, '/', "window.__hecho = 1;", 2500);
  const visto = sequeda.tiros.find(t => t.ve);
  test('§2 un autoarranque que se queda destapa el editor igual', () =>
    assert(!!visto, 'la pagina se quedo tapada para siempre: eso es peor que el flash'));
  test('§2 …y lo destapa pronto, no cuando salta la red de seguridad de 5 s', () =>
    assert(visto && visto.ms < 3000, 'tardo ' + (visto || {}).ms + ' ms en verse'));

  // §3 · sin snippet no se espera a nada: el editor de siempre, sin penalizar a quien no usa esto
  const sinSnippet = await observa(ctx, '/', null, 1500);
  const v3 = sinSnippet.tiros.find(t => t.ve);
  test('§3 sin autoarranque el editor sale sin esperas', () =>
    assert(v3 && v3.ms < 2000, 'tardo ' + (v3 || {}).ms + ' ms en verse sin haber snippet'));

  // §4 · ?noauto=1 no espera ni a pedir el snippet
  const noauto = await observa(ctx, '/?noauto=1', undefined, 1200);
  const v4 = noauto.tiros.find(t => t.ve);
  test('§4 con ?noauto=1 el editor sale sin esperas', () =>
    assert(v4 && v4.ms < 2000, 'tardo ' + (v4 || {}).ms + ' ms en verse con ?noauto=1'));

  // §5 · entrar directo a /map/<x>: entre el final del script y openWorld() hay un viaje de red a por el
  // indice de assets, y en ese hueco se veia el editor 2D/3D de fondo. El mismo flashazo, por el otro lado.
  const mundo = await observa(ctx, '/map/empty', undefined, 4000);
  const editorSuelto = mundo.tiros.filter(t => t.ve && !t.mundo);
  test('§5 entrando directo a /map/ no se ve el editor antes del Mundo', () =>
    assert(editorSuelto.length === 0,
      'el editor se vio ' + editorSuelto.length + ' veces sin el Mundo puesto, la 1ª a los ' +
      (editorSuelto[0] || {}).ms + ' ms: eso es el flash'));
  const conMundo = mundo.tiros.find(t => t.mundo);
  test('§5 …y el Mundo acaba puesto, destapado (o el test no probaria nada)', () =>
    assert(conMundo && conMundo.ve, 'el Mundo no llego a verse: ' + JSON.stringify(conMundo)));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
