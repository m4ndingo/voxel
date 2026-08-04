// test_guardar_pieza.js — retocar una pieza de agente y que el bicho vivo se entere, en el navegador de verdad.
//
// La queja del dueño: «cuando se está editando un bloque/estructura que forma parte de un agente
// articulado, los cambios que se realizan en el bloque/estructura una vez guardado no se reflejan en
// el personaje». No era el refresco: era DÓNDE aterrizaba el dibujo. El agente guarda sus piezas como
// `asset:assets/<id>.vox.json`, pero al guardar el id se deducía del RÓTULO (`slugify(meta.name)`),
// así que «Torso de zombie» se escribía en torso-de-zombie.vox.json — un asset nuevo que no usaba
// nadie — mientras el agente seguía leyendo torso-zombie.vox.json. 17 de los 49 assets del dueño
// tenían id != slug(nombre), incluidas las 8 piezas de agente: ninguna podía retocarse.
//
//   node test_guardar_pieza.js [url]      por defecto http://localhost:8500/
//
// ⚠️ Necesita el server.py reiniciado (Python no recarga el módulo solo).
//
// El test se crea SU PROPIA pieza por API y la borra en el finally: no toca ni un fichero del dueño.
// Y por eso mismo comprueba al final que los assets del dueño siguen enteros en el índice.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8500/';
const API = URL.replace(/\/$/, '');
const IDX = path.join(__dirname, 'assets', 'index.json');

// La gracia está aquí: el id NO es el slug del nombre. Si el guardado vuelve a deducirlo del rótulo,
// el dibujo aterrizará en zz-pieza-de-prueba.vox.json y este test lo verá.
const ID = 'zz-pieza-test';
const NOMBRE = 'ZZ Pieza De Prueba';
const ID_BIFURCADO = 'zz-pieza-de-prueba';
const NOMBRE_NUEVO = 'ZZ Pieza De Prueba Renombrada';
const ID_RENOMBRADO = 'zz-pieza-de-prueba-renombrada';
const FICH = id => path.join(__dirname, 'assets', id + '.vox.json');
const CLAVE = 'asset:assets/' + ID + '.vox.json';        // como la nombra un agente

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const leerIdx = () => JSON.parse(fs.readFileSync(IDX, 'utf8'));
const entrada = id => leerIdx().find(a => a.id === id);
const nVoxels = id => Object.keys(JSON.parse(fs.readFileSync(FICH(id), 'utf8')).voxels).length;

(async () => {
  const idsAntes = leerIdx().map(a => a.id);

  // Una pieza cualquiera: un cubito de 4³ con el id y el nombre a propósito descasados.
  const voxels = {};
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) voxels[[x, y, z]] = '#8bc34a';
  const doc = { format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 }, id: ID,
                meta: { name: NOMBRE, type: 'textura', role: 'Pieza de agente · de pruebas', icon: '🧪' },
                voxels };
  const creado = await fetch(API + '/api/assets', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }).then(r => r.json());

  const b = await chromium.launch();
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  let alCargar = null, clavesRefrescadas = null, tras = null, trasRecarga = null, guardarComo = null;
  let renombrado = null, aceptado = null;
  try {
    assert(creado.id === ID, 'crear la pieza con id explícito devolvió ' + JSON.stringify(creado));
    const voxelsAntes = nVoxels(ID);

    await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof openHabitantes === "function"', { timeout: 60000 });

    // 1) Cargarla como lo hace el dueño: galería de Texturas → Cargar.
    await p.evaluate(() => openHabitantes('textura'));
    await p.waitForFunction((n) => [...document.querySelectorAll('#hab-grid .hab-card')]
      .some(c => c.querySelector('.hab-name').textContent.includes(n)), NOMBRE, { timeout: 15000 });
    await p.evaluate((n) => {
      const c = [...document.querySelectorAll('#hab-grid .hab-card')]
        .find(x => x.querySelector('.hab-name').textContent.includes(n));
      c.querySelector('[data-a=load]').click();
    }, NOMBRE);
    await p.waitForTimeout(1200);
    alCargar = await p.evaluate(() => ({ serverId, nombre: state.meta.name, voxels: state.voxels.size }));

    // 2) Retocarla y darle a Guardar, espiando con qué clave se manda refrescar el mundo: es
    //    exactamente la clave con la que el agente tiene cogida la pieza, o no se entera de nada.
    clavesRefrescadas = await p.evaluate(async () => {
      const vistas = [];
      const orig = window.mcRefreshSavedKey;
      window.mcRefreshSavedKey = async k => { vistas.push(k); return orig ? orig(k) : undefined; };
      try {
        for (let i = 0; i < 8; i++) state.voxels.delete(state.voxels.keys().next().value);
        await save();
      } finally { window.mcRefreshSavedKey = orig; }
      return vistas;
    });
    await p.waitForTimeout(600);
    tras = { voxelsAntes, voxelsAhora: nVoxels(ID),
             bifurcado: fs.existsSync(FICH(ID_BIFURCADO)) || !!entrada(ID_BIFURCADO),
             idx: entrada(ID) };

    // 3) Que el id sobreviva a un F5: si no, el siguiente Guardar volvería a bifurcar.
    await p.reload({ waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof save === "function"', { timeout: 60000 });
    trasRecarga = await p.evaluate(() => ({ serverId, nombre: state.meta.name }));

    // 4) …y que «Guardar como…» siga bifurcando: es la vía explícita para sacar una pieza nueva.
    guardarComo = await p.evaluate(() => {
      const cuerpo = typeof saveAs === 'function' ? String(saveAs) : '';
      return { existe: typeof saveAs === 'function', quitaElId: /delete\s+body\.id|body\.id\s*=\s*(null|undefined)|sin id/.test(cuerpo) };
    });

    // 5) Renombrar y darle a Guardar. Es el otro camino que usa el dueño (cargar una pieza del zombie,
    //    llamarla «de personaje» y guardar), y ahí las dos lecturas son razonables: por eso pregunta.
    //    Sin este aviso, mandar el id convertiría ese «hacerme una variante» en pisar el original.
    const renombrarYGuardar = async (aceptar) => {
      const dialogo = new Promise(res => p.once('dialog', d => { res(d.message()); aceptar ? d.accept() : d.dismiss(); }));
      const idAntes = await p.evaluate(() => serverId);
      await p.evaluate((n) => { state.meta.name = n; document.querySelector('#meta-name').value = n; }, NOMBRE_NUEVO);
      const guardado = p.evaluate(() => save());
      const msg = await dialogo;
      await guardado;
      await p.waitForTimeout(600);
      return { msg, idAntes, idDespues: await p.evaluate(() => serverId) };
    };

    renombrado = await renombrarYGuardar(false);          // Cancelar = pieza nueva
    renombrado.originalIntacto = nVoxels(ID) === tras.voxelsAhora;
    renombrado.creoLaNueva = fs.existsSync(FICH(ID_RENOMBRADO));   // el id del nuevo sí sale del rótulo

    // y ahora al revés: volver a cargar la original, renombrarla y ACEPTAR = reescribirla.
    await p.evaluate((id) => loadFromUrl('assets/' + id + '.vox.json', id), ID);
    await p.waitForTimeout(800);
    await p.evaluate(() => { for (let i = 0; i < 5; i++) state.voxels.delete(state.voxels.keys().next().value); });
    aceptado = await renombrarYGuardar(true);             // Aceptar = reescribe la de siempre
    aceptado.voxels = nVoxels(ID);
    aceptado.esperados = tras.voxelsAhora - 5;
  } finally {
    await b.close();
    for (const id of [ID, ID_BIFURCADO, ID_RENOMBRADO])
      if (entrada(id) || fs.existsSync(FICH(id)))
        await fetch(API + '/api/assets/' + id, { method: 'DELETE' }).catch(() => {});
  }

  console.log('\n--- ' + URL + ' · retocar una pieza de agente ---\n');

  test('cargar un asset desde la galería se queda con SU id (no con el slug del rótulo)', () => {
    assert(alCargar, 'no se pudo cargar la pieza');
    assert(alCargar.serverId === ID, 'serverId quedó en ' + JSON.stringify(alCargar.serverId) + ', esperaba ' + ID);
  });

  test('Guardar reescribe el MISMO fichero que usa el agente', () => {
    assert(tras.voxelsAhora !== tras.voxelsAntes,
      'assets/' + ID + '.vox.json sigue con ' + tras.voxelsAntes + ' voxels: el dibujo no llegó');
    assert(tras.voxelsAhora === tras.voxelsAntes - 8, 'quedaron ' + tras.voxelsAhora + ' voxels, esperaba ' + (tras.voxelsAntes - 8));
  });

  // Lo que rompía: un asset nuevo, invisible para el agente, y el dueño sin enterarse.
  test('Guardar NO bifurca a un asset nuevo deducido del rótulo', () =>
    assert(!tras.bifurcado, 'apareció ' + ID_BIFURCADO + '.vox.json: el dibujo se fue a otro sitio'));

  test('el índice mantiene la entrada de siempre (misma id y mismo fichero)', () => {
    assert(tras.idx, 'la entrada desapareció de assets/index.json');
    assert(tras.idx.file === 'assets/' + ID + '.vox.json', 'el fichero pasó a ' + tras.idx.file);
    assert(tras.idx.name === NOMBRE, 'el rótulo pasó a ' + tras.idx.name);
  });

  test('se refresca la clave con la que el agente tiene cogida la pieza', () => {
    assert(clavesRefrescadas.length, 'Guardar no mandó refrescar nada');
    assert(clavesRefrescadas.includes(CLAVE),
      'refrescó ' + JSON.stringify(clavesRefrescadas) + ' y el agente usa ' + CLAVE);
  });

  test('el id sobrevive a recargar la página (si no, el siguiente Guardar bifurca)', () => {
    assert(trasRecarga.nombre === NOMBRE, 'tras el F5 el documento era «' + trasRecarga.nombre + '»');
    assert(trasRecarga.serverId === ID, 'tras el F5 serverId quedó en ' + JSON.stringify(trasRecarga.serverId));
  });

  test('«Guardar como…» sigue existiendo para bifurcar a propósito', () =>
    assert(guardarComo.existe, 'no hay saveAs(): sin él no habría forma de sacar una copia'));

  // El otro camino del dueño: cargar una pieza del zombie, llamarla «de personaje» y guardar. Antes
  // salía una pieza nueva SIEMPRE (por eso existen sus assets *-de-personaje); ahora manda el id, así
  // que hay que preguntar o ese «hazme una variante» se convertiría en pisar el original.
  test('renombrar y Guardar avisa antes de nada (y dice los dos nombres)', () => {
    assert(renombrado.msg, 'no salió ningún aviso al guardar con otro nombre');
    assert(renombrado.msg.includes(NOMBRE) && renombrado.msg.includes(NOMBRE_NUEVO),
      'el aviso no dice de qué a qué: ' + JSON.stringify(renombrado.msg));
  });

  test('...Cancelar guarda una pieza NUEVA y deja la original como estaba', () => {
    assert(renombrado.creoLaNueva, 'no apareció ' + ID_RENOMBRADO + '.vox.json');
    assert(renombrado.originalIntacto, 'se tocó ' + ID + '.vox.json, que era justo lo que no había que hacer');
    assert(renombrado.idDespues === ID_RENOMBRADO, 'el editor se quedó en ' + JSON.stringify(renombrado.idDespues));
  });

  test('...Aceptar reescribe la de siempre, que es la que usan los agentes', () => {
    assert(aceptado.idDespues === ID, 'el editor se quedó en ' + JSON.stringify(aceptado.idDespues));
    assert(aceptado.voxels === aceptado.esperados,
      'assets/' + ID + '.vox.json quedó con ' + aceptado.voxels + ' voxels, esperaba ' + aceptado.esperados);
  });

  test('los assets del dueño siguen todos en el índice', () => {
    const ahora = leerIdx().map(a => a.id);
    const faltan = idsAntes.filter(id => id !== ID && !ahora.includes(id));
    assert(faltan.length === 0, 'desaparecieron del índice: ' + faltan.join(', '));
  });

  test('las piezas de prueba no se quedan por ahí', () => {
    for (const id of [ID, ID_BIFURCADO, ID_RENOMBRADO])
      assert(!entrada(id) && !fs.existsSync(FICH(id)), 'quedó ' + id + ' sin borrar');
  });

  test('sin excepciones en la página', () => assert(errores.length === 0, errores[0] || ''));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
