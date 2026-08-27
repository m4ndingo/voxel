// @area: editor
// @necesita: servidor, playwright
// test_editor_asset_subcarpeta.js — el bug del dueño, paso por paso, en el navegador de verdad.
//
// Su parte del guardián `test_assets_subcarpeta.js` prueba la API a pelo. Esto prueba EL CAMINO QUE ÉL
// HIZO, que es donde estaba la queja (2026-08-27): «abro "asset:assets/trees_mock/pino.vox.json" lo
// modifico, le doy a guardar y me lo crea como "asset:assets/pino.vox.json"; le doy borrar el antiguo,
// y en lugar de quedar el nuevo borra ese».
//
// Entre la API y el editor hay tres piezas que podían tirar la carpeta y ninguna se ve desde la API:
//   · la galería pasa `a.id` del índice a `loadFromUrl(url, id)`, que lo deja en `serverId`;
//   · `save()` manda ESE `serverId`, y de ahí sale el fichero que se reescribe;
//   · Borrar arma la URL con `'/api/assets/' + id`, o sea que la `/` viaja SIN escapar.
// Si cualquiera de las tres se comiera la carpeta, la API seguiría estando bien y el dueño seguiría
// viendo el bug. Por eso esto no sobra.
//
//   node test_editor_asset_subcarpeta.js [url]        por defecto http://localhost:8500/
//
// Se crea SU PROPIA subcarpeta (`assets/zz_test_sub/`) y la retira en el finally: no toca el pino del
// dueño ni ningún fichero suyo, y lo comprueba exigiendo el índice intacto al terminar.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8500/';
const BASE = path.join(__dirname, '..');
const IDX = path.join(BASE, 'assets', 'index.json');
const CARPETA = 'zz_test_sub';
const ID = CARPETA + '/zz-test-arbol';          // el de la subcarpeta: el que se edita
const GEMELO = 'zz-test-arbol';                 // el fantasma de la raíz que NO debe nacer

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const api = (metodo, ruta, cuerpo) => fetch(URL.replace(/\/$/, '') + ruta, {
  method: metodo,
  headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
  body: cuerpo ? JSON.stringify(cuerpo) : undefined
}).then(async r => ({ code: r.status, d: await r.json().catch(() => null) }));

const fich = (id) => path.join(BASE, 'assets', id + '.vox.json');
const hay = (id) => fs.existsSync(fich(id));
const leerIdx = () => JSON.parse(fs.readFileSync(IDX, 'utf8'));
const color = (id) => JSON.parse(fs.readFileSync(fich(id), 'utf8')).voxels['0,0,0'];

(async () => {
  const antes = leerIdx().map(a => a.id).filter(i => !String(i).startsWith('zz-') && !String(i).startsWith(CARPETA));

  // El asset de partida, en su subcarpeta, creado por API (esto ya está probado aparte).
  const alta = await api('POST', '/api/assets', {
    format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 },
    meta: { name: 'ZZ Test Arbol', type: 'textura' },
    voxels: { '0,0,0': '#ff0000', '1,0,0': '#ff0000' },
    id: ID
  });

  const b = await chromium.launch();
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  let cargado = null, guardado = null, borrado = null;
  try {
    assert(alta.code === 200 && alta.d && alta.d.id === ID, 'el POST de partida devolvio ' + JSON.stringify(alta.d));

    // ?noauto=1 = el editor a pelo, sin el snippet de autoarranque del dueño (que puede irse a otro mapa).
    await p.goto(URL + '?noauto=1', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof openHabitantes === "function" && typeof save === "function"', { timeout: 60000 });

    // ── 1. Abrirlo desde la galería, como hizo él ────────────────────────────────────────────────
    // Se recarga el índice primero: la página pudo cargarse antes de que existiera nuestro asset.
    cargado = await p.evaluate(async (id) => {
      const idx = await fetch('assets/index.json', { cache: 'no-store' }).then(r => r.json());
      const a = idx.find(x => x.id === id);
      if (!a) return { error: 'no esta en el indice', ids: idx.slice(-3).map(x => x.id) };
      await loadFromUrl(a.file, a.id);            // exactamente lo que hace el click de la tarjeta
      return { serverId, serverKind, vox: state.voxels.size, file: a.file };
    }, ID);

    test('la galeria abre el asset de la subcarpeta', () => {
      assert(!cargado.error, JSON.stringify(cargado));
      assert(cargado.vox === 2, 'ha cargado ' + cargado.vox + ' voxels, esperaba 2');
      assert(cargado.file === 'assets/' + ID + '.vox.json', 'file = ' + cargado.file);
    });
    // ⛔ AQUÍ empezaba el bug: si `serverId` pierde la carpeta, Guardar ya no puede acertar el fichero.
    test('...y el editor recuerda el id CON su carpeta', () => {
      assert(cargado.serverId === ID, 'serverId = ' + JSON.stringify(cargado.serverId) + ', esperaba ' + ID);
      assert(cargado.serverKind === 'asset', 'serverKind = ' + cargado.serverKind);
    });

    // ── 2. Modificarlo y darle a Guardar ─────────────────────────────────────────────────────────
    guardado = await p.evaluate(async () => {
      state.voxels.set('0,0,0', '#0000ff');       // «lo modifico»
      await save();                               // «le doy a guardar»
      return { serverId, nombre: state.meta.name };
    });
    test('Guardar reescribe el MISMO fichero de la subcarpeta', () => {
      assert(hay(ID), 'ha desaparecido ' + fich(ID));
      assert(color(ID) === '#0000ff', 'el fichero de la subcarpeta sigue en ' + color(ID));
    });
    // ⛔ EL síntoma que denunció: el gemelo fantasma en la raíz de assets/.
    test('...y NO nace el gemelo en la raiz de assets/', () => {
      assert(!hay(GEMELO), 'ha aparecido ' + fich(GEMELO));
      assert(!leerIdx().some(a => a.id === GEMELO), 'el gemelo se ha colado en el indice');
    });
    test('...y el editor sigue apuntando al de la subcarpeta', () => {
      assert(guardado.serverId === ID, 'serverId = ' + JSON.stringify(guardado.serverId));
    });
    test('el indice lo tiene una sola vez, con su ruta', () => {
      const suyas = leerIdx().filter(a => a.id === ID);
      assert(suyas.length === 1, 'aparece ' + suyas.length + ' veces');
      assert(suyas[0].file === 'assets/' + ID + '.vox.json', 'file = ' + suyas[0].file);
    });

    // ── 3. Borrarlo desde la galería (la `/` viaja en la URL, sin escapar) ───────────────────────
    // Se crea antes un homónimo en la raíz: si Borrar se equivocara de fichero, se llevaría ESE, y el
    // test lo veria. Sin el homonimo, «borro el de la subcarpeta y desaparece» pasa por casualidad.
    await api('POST', '/api/assets', {
      format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 },
      meta: { name: 'ZZ Test Arbol Raiz', type: 'textura' },
      voxels: { '0,0,0': '#00ff00' }, id: GEMELO
    });
    assert(hay(GEMELO), 'no he podido plantar el homonimo de control en la raiz');

    borrado = await p.evaluate(async (id) => {
      const r = await fetch('/api/assets/' + id, { method: 'DELETE' });   // lo que hace el boton Borrar
      return { code: r.status };
    }, ID);
    test('Borrar el de la subcarpeta responde ok', () => {
      assert(borrado.code === 200, 'HTTP ' + borrado.code);
    });
    test('...y se lleva ESE', () => { assert(!hay(ID), 'sigue ahi ' + fich(ID)); });
    // ⛔ El segundo síntoma: «en lugar de quedar el nuevo borra ese».
    test('...⛔ y NO el homonimo de la raiz', () => {
      assert(hay(GEMELO), 'se ha llevado por delante ' + fich(GEMELO));
      assert(color(GEMELO) === '#00ff00', 'el de la raiz ha cambiado de color');
    });

    test('sin excepciones en la pagina', () => {
      assert(errores.length === 0, errores.join(' · '));
    });
  } finally {
    await b.close();
    // Limpieza: por API, para que el índice se quede como estaba.
    await api('DELETE', '/api/assets/' + ID);
    await api('DELETE', '/api/assets/' + GEMELO);
    // ⚠️ Se barre POR PREFIJO, no por los dos ids que esperaba. Al romper el servidor a posta para
    // comprobar que este test sirve de algo, el POST de partida aterrizó en un tercer nombre que yo no
    // había previsto (`zz_test_subzz-test-arbol`) y se quedó ahí: la limpieza de un test tiene que
    // recoger lo que el fallo haya dejado, no lo que el acierto dejaría.
    for (const dir of [path.join(BASE, 'assets'), path.join(BASE, 'assets', CARPETA)]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('zz-test') || f.startsWith('zz_test')) {
          try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
        }
      }
    }
    const dir = path.join(BASE, 'assets', CARPETA);
    if (fs.existsSync(dir)) { try { fs.rmdirSync(dir); } catch (e) {} }
    // …y del índice igual, que es donde se ve el estropicio la próxima vez.
    try {
      const idx = leerIdx().filter(a => !String(a.id).startsWith('zz-test') && !String(a.id).startsWith('zz_test'));
      fs.writeFileSync(IDX, JSON.stringify(idx, null, 1));
    } catch (e) {}
  }

  test('no queda nada mio en assets/', () => {
    assert(!hay(ID) && !hay(GEMELO), 'quedan ficheros zz-test');
    assert(!fs.existsSync(path.join(BASE, 'assets', CARPETA)), 'queda la subcarpeta ' + CARPETA);
  });
  test('los assets del dueño siguen intactos', () => {
    const ahora = leerIdx().map(a => a.id).filter(i => !String(i).startsWith('zz-') && !String(i).startsWith(CARPETA));
    const faltan = antes.filter(i => !ahora.includes(i));
    assert(faltan.length === 0, 'faltan del indice: ' + faltan.join(' '));
    assert(ahora.length === antes.length, antes.length + ' antes, ' + ahora.length + ' ahora');
  });

  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();
