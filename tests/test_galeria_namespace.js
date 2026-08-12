// @area: editor
// @necesita: servidor, playwright
// test_galeria_namespace.js — una pieza vuelve a la galeria de la que salio, en el navegador de verdad.
//
// La queja del dueño (2026-08-06, BUG-GAL1/GAL2/RS5): "he querido modificar el cable de redstone por una
// forma mas interesante y en lugar de reemplazar el actual se ha creado uno nuevo, cosa que no deberia de
// haber pasado, ademas parece que se llama igual viendo los rayos-X, solamente el nuevo tiene ficha, el
// original no tiene ficha y deberia tenerla, tampoco deberia de haberse duplicado. y lo que es peor, el
// modificado no funciona".
//
// Causa: save() enrutaba por meta.type ('textura' -> /api/assets) en vez de por el ORIGEN del dibujo. El
// cable es un habitante de tipo 'textura', asi que al guardarlo se creaba assets/cable.vox.json — un
// fichero nuevo, con el mismo id, en OTRO espacio de nombres. Por eso "no funciona": el motor de redstone
// declara el circuito sobre 'hab:cable' y la copia era 'asset:assets/cable.vox.json'.
//
//   node test_galeria_namespace.js [url]      por defecto http://localhost:8500/
//
// El test se crea SU PROPIO habitante y lo borra en el finally: no toca ni una pieza del dueño. Por eso
// mismo comprueba explicitamente que los habitantes y los assets del dueño siguen ahi al terminar.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = (process.argv[2] || 'http://localhost:8500/').replace(/\/$/, '');
const IDX = path.join(__dirname, '..', 'assets', 'index.json');
const ID = 'zz-test-namespace';
const NOMBRE = 'ZZ Test Namespace';
const HAB = path.join(__dirname, '..', 'data', 'habitantes', ID + '.json');
const ASSET = path.join(__dirname, '..', 'assets', ID + '.vox.json');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const leerIdx = () => JSON.parse(fs.readFileSync(IDX, 'utf8'));

(async () => {
  const assetsAntes = leerIdx().map(a => a.id);
  const habsAntes = (await (await fetch(URL + '/api/habitantes')).json()).map(h => h.id);

  // Un habitante de tipo 'textura': exactamente la forma del cable de redstone, que es la que se rompia.
  const doc = {
    format: 'voxelforge-1', id: ID, size: { x: 16, y: 16, z: 16 },
    meta: { name: NOMBRE, type: 'textura' },
    voxels: { '0,0,0': '#ff0000', '1,0,0': '#ff0000' }
  };
  const creado = await (await fetch(URL + '/api/habitantes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
  })).json();

  const b = await chromium.launch();
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  // El disco se fotografia ANTES del finally: la limpieza borra el asset duplicado si lo hubiera, asi
  // que comprobarlo despues daria por bueno justo el fallo que este test persigue.
  let origen = null, trasGuardar = null, botones = null, ficha = null, disco = null;
  try {
    assert(creado.id === ID, 'el POST devolvio ' + JSON.stringify(creado));

    // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
    await p.goto(URL + '/?noauto=1', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof openHabitantes === "function"', { timeout: 60000 });

    const abrir = async () => {
      await p.evaluate(() => openHabitantes('textura'));
      await p.waitForFunction(
        (t) => [...document.querySelectorAll('#hab-grid .hab-card')]
          .some(c => c.querySelector('.hab-name').textContent.includes(t)),
        NOMBRE, { timeout: 15000 }
      ).catch(() => {});
    };
    const tarjeta = (txt) => p.evaluate((t) => {
      const c = [...document.querySelectorAll('#hab-grid .hab-card')]
        .find(x => x.querySelector('.hab-name').textContent.includes(t));
      if (!c) return null;
      c.dataset.zz = '1';
      return [...c.querySelectorAll('.hab-acts button')].map(x => x.textContent.trim());
    }, txt);

    await abrir();
    botones = await tarjeta(NOMBRE);

    // --- Ficha del habitante (BUG-GAL2): tiene que existir y decir la clave que de verdad funciona.
    const hayFicha = await p.evaluate(() => {
      const btn = document.querySelector('.hab-card[data-zz="1"] [data-a=ficha]');
      if (!btn) return false;
      btn.click(); return true;
    });
    if (hayFicha) {
      await p.waitForTimeout(400);
      ficha = await p.evaluate(() => ({
        clave: document.querySelector('#ficha-clave').value,
        ejemplo: document.querySelector('#ficha-ejemplo').value,
        aliasOculto: document.querySelector('#ficha-alias-wrap').hidden,
        guardarOculto: document.querySelector('#ficha-save').hidden,
        abierta: !document.querySelector('#ficha-modal').hidden
      }));
      await p.evaluate(() => closeFicha());
    }

    // --- Cargar -> modificar -> Guardar (BUG-GAL1): debe REESCRIBIR el habitante, no crear un asset.
    await abrir();
    await tarjeta(NOMBRE);
    await p.evaluate((id) => loadHabitante(id), ID);
    await p.waitForFunction((id) => serverId === id, ID, { timeout: 15000 }).catch(() => {});
    origen = await p.evaluate(() => ({ serverId, serverKind, tipo: state.meta && state.meta.type }));

    await p.evaluate(() => { setVoxel(2, 0, 0, '#00ff00'); });
    await p.evaluate(() => save());
    await p.waitForTimeout(1500);
    trasGuardar = await p.evaluate(() => ({ serverId, serverKind }));
    disco = {
      asset: fs.existsSync(ASSET),
      enIndice: leerIdx().some(a => a.id === ID),
      hab: fs.existsSync(HAB) ? JSON.parse(fs.readFileSync(HAB, 'utf8')) : null
    };
  } finally {
    await b.close();
    if (fs.existsSync(HAB)) await fetch(URL + '/api/habitantes/' + ID, { method: 'DELETE' }).catch(() => {});
    if (fs.existsSync(ASSET) || leerIdx().some(a => a.id === ID)) {
      await fetch(URL + '/api/assets/' + ID, { method: 'DELETE' }).catch(() => {});
    }
  }

  console.log('\n--- ' + URL + ' (galeria de Texturas · espacios de nombres) ---\n');

  test('cargar un habitante recuerda de que galeria vino', () => {
    assert(origen, 'no se pudo leer el estado del editor tras cargar');
    assert(origen.serverId === ID, 'serverId quedo en ' + origen.serverId);
    assert(origen.tipo === 'textura', 'el tipo de prueba ya no es textura, el test no prueba el caso roto');
    assert(origen.serverKind === 'hab', 'serverKind quedo en ' + JSON.stringify(origen.serverKind));
  });

  // El corazon del fallo: guardar mandaba la pieza a la OTRA galeria y dejaba dos copias con el mismo id.
  test('guardar un habitante de tipo textura NO crea un asset duplicado', () => {
    assert(disco, 'no se llego a fotografiar el disco tras guardar');
    assert(!disco.asset, 'aparecio ' + ASSET + ' — la pieza se duplico en la otra galeria');
    assert(!disco.enIndice, 'aparecio una entrada en assets/index.json con el mismo id');
  });

  test('guardar reescribe el habitante en su sitio', () => {
    assert(disco && disco.hab, 'el habitante desaparecio de data/habitantes/');
    const d = disco.hab;
    assert(d.voxels['2,0,0'], 'el voxel nuevo no llego al fichero: ' + Object.keys(d.voxels).join(' '));
    assert(trasGuardar.serverKind === 'hab', 'tras guardar, serverKind es ' + trasGuardar.serverKind);
    assert(trasGuardar.serverId === ID, 'tras guardar, serverId es ' + trasGuardar.serverId);
  });

  test('la tarjeta de un habitante ofrece Cargar, Ficha, Renombrar y Borrar', () => {
    assert(botones, 'no aparecio la tarjeta del habitante de prueba');
    assert(botones.join(',') === 'Cargar,📋 Ficha,Renombrar,Borrar', 'los botones eran: ' + botones.join(','));
  });

  // Una ficha que ofreciera 'cable' a secas mentiria: los habitantes no pasan por mcIndexAssets.
  test('la ficha de un habitante enseña hab:<id>, y no ofrece alias que no existe', () => {
    assert(ficha, 'no se pudo abrir la ficha del habitante');
    assert(ficha.abierta, 'el modal de la ficha no llego a abrirse');
    assert(ficha.clave === 'hab:' + ID, 'la clave decia ' + ficha.clave);
    assert(ficha.ejemplo.includes("'hab:" + ID + "'"), 'el ejemplo decia ' + ficha.ejemplo);
    assert(ficha.aliasOculto, 'ofrecia editar el nombre corto, que en un habitante no hace nada');
    assert(ficha.guardarOculto, 'ofrecia Guardar, que haria PATCH /api/assets sobre un habitante');
  });

  test('las piezas del dueño siguen intactas', async () => {
    const assetsFaltan = assetsAntes.filter(id => !leerIdx().some(a => a.id === id));
    assert(assetsFaltan.length === 0, 'desaparecieron de assets/index.json: ' + assetsFaltan.join(', '));
  });

  test('sin excepciones en la pagina', () => { assert(errores.length === 0, errores[0]); });

  // Se comprueba fuera de test() porque necesita await: los habitantes del dueño son lo mas delicado.
  const habsAhora = (await (await fetch(URL + '/api/habitantes')).json()).map(h => h.id);
  const habsFaltan = habsAntes.filter(id => !habsAhora.includes(id));
  if (habsFaltan.length) { console.log('  FALLO desaparecieron habitantes del dueño: ' + habsFaltan.join(', ')); fallos++; }
  else { console.log('  ok  los habitantes del dueño siguen intactos'); ok++; }

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();