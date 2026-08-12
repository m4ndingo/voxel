// @area: editor
// @necesita: servidor, playwright
// test_galeria_assets.js — renombrar y borrar un ASSET desde la galeria, en el navegador de verdad.
//
// La queja del dueño: "las texturas nuevas que importo como Hielo no puedo borrarlas, en cambio las
// antiguas si que podia". Causa: guardar una textura la manda a POST /api/assets (save(), isTex), o sea
// que aterriza en assets/ + index.json, y la galeria pintaba esas tarjetas como "solo lectura" (solo
// Cargar). Las de antes vivian en data/habitantes/ y por eso si tenian Renombrar/Borrar.
//
//   node test_galeria_assets.js [url]        por defecto http://localhost:8500/
//
// El test se crea SU PROPIO asset por API y lo borra en el finally: no toca ni un fichero del dueño.
// Por eso mismo comprueba explicitamente que los assets del dueño siguen en el indice al terminar.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8500/';
const IDX = path.join(__dirname, '..', 'assets', 'index.json');
const ID = 'zz-test-galeria';
const FICH = path.join(__dirname, '..', 'assets', ID + '.vox.json');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const leerIdx = () => JSON.parse(fs.readFileSync(IDX, 'utf8'));
const entrada = () => leerIdx().find(a => a.id === ID);

(async () => {
  const antes = leerIdx().map(a => a.id);           // foto del indice del dueño, para exigirlo intacto
  const doc = {
    format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 },
    meta: { name: 'ZZ Test Galeria', type: 'textura' },
    voxels: { '0,0,0': '#ff0000' }
  };
  let r = await fetch(URL.replace(/\/$/, '') + '/api/assets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
  });
  const creado = await r.json();

  const b = await chromium.launch();
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  let botones = null, trasRenombrar = null, trasBorrar = null, tarjetaBorrada = null;
  try {
    assert(creado.id === ID, 'el POST devolvio ' + JSON.stringify(creado));

    await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof openHabitantes === "function"', { timeout: 60000 });

    // La galeria de Texturas: ahi es donde aterriza lo que se guarda como textura.
    const abrir = async () => {
      await p.evaluate(() => openHabitantes('textura'));
      await p.waitForFunction(
        (id) => [...document.querySelectorAll('#hab-grid .hab-card')]
          .some(c => c.querySelector('.hab-name').textContent.includes(id)),
        'ZZ Test', { timeout: 15000 }
      ).catch(() => {});
    };
    // Devuelve la tarjeta cuyo rotulo contiene el texto dado (null si ya no esta).
    const tarjeta = (txt) => p.evaluate((t) => {
      const c = [...document.querySelectorAll('#hab-grid .hab-card')]
        .find(x => x.querySelector('.hab-name').textContent.includes(t));
      if (!c) return null;
      c.dataset.zz = '1';
      return [...c.querySelectorAll('.hab-acts button')].map(x => x.textContent.trim());
    }, txt);

    await abrir();
    botones = await tarjeta('ZZ Test Galeria');

    // Con el codigo viejo estos botones NO existen. Pulsar a ciegas reventaria el test entero con un
    // "Cannot read properties of null" en vez de dar un FALLO legible, asi que se pulsa solo si estan.
    const pulsar = (a) => p.evaluate((sel) => {
      const btn = document.querySelector('.hab-card[data-zz="1"] [data-a=' + sel + ']');
      if (!btn) return false;
      btn.click(); return true;
    }, a);

    // Renombrar: prompt -> PATCH. El fichero NO se mueve (los mundos guardan 'asset:assets/<id>.vox.json').
    p.once('dialog', d => d.accept('ZZ Renombrada'));
    if (await pulsar('ren')) await p.waitForTimeout(1200);
    trasRenombrar = entrada();

    // Borrar: confirm -> DELETE -> a la papelera y fuera del indice.
    await abrir();
    // Si el renombrado no llego a pasar, la tarjeta sigue con el rotulo original: se marca igual.
    if (!await tarjeta('ZZ Renombrada')) await tarjeta('ZZ Test Galeria');
    p.once('dialog', d => d.accept());
    if (await pulsar('del')) await p.waitForTimeout(1200);
    trasBorrar = entrada() || null;
    await abrir();
    tarjetaBorrada = await tarjeta('ZZ Renombrada');
  } finally {
    await b.close();
    // Red de seguridad: si algo fallo a medias, el asset de prueba no se queda en el indice del dueño.
    if (entrada() || fs.existsSync(FICH)) {
      await fetch(URL.replace(/\/$/, '') + '/api/assets/' + ID, { method: 'DELETE' }).catch(() => {});
    }
  }

  console.log('\n--- ' + URL + ' (galeria de Texturas) ---\n');

  test('la tarjeta de un asset ofrece Cargar, Ficha, Renombrar y Borrar', () => {
    assert(botones, 'no aparecio la tarjeta del asset de prueba en la galeria');
    assert(botones.join(',') === 'Cargar,📋 Ficha,Renombrar,Borrar', 'los botones eran: ' + botones.join(','));
  });

  test('Renombrar cambia el rotulo en assets/index.json', () => {
    assert(trasRenombrar, 'la entrada desaparecio del indice al renombrar');
    assert(trasRenombrar.name === 'ZZ Renombrada', 'se quedo en ' + trasRenombrar.name);
  });

  // Lo que NO debe pasar: mover el fichero. La clave del material en el mundo es la ruta, asi que
  // renombrar moviendo dejaria sin textura cada bloque ya pintado con el.
  test('Renombrar NO mueve el fichero: la clave del material sigue valiendo', () => {
    assert(trasRenombrar.file === 'assets/' + ID + '.vox.json', 'el fichero paso a ' + trasRenombrar.file);
    assert(trasRenombrar.id === ID, 'el id paso a ' + trasRenombrar.id);
  });

  test('Borrar lo saca del indice, del disco y de la galeria', () => {
    assert(trasBorrar === null, 'sigue en index.json');
    assert(!fs.existsSync(FICH), 'el .vox.json sigue en assets/');
    assert(tarjetaBorrada === null, 'la tarjeta sigue en la galeria tras borrar');
  });

  test('nada se borra de verdad: esta en la papelera', () => {
    const t = path.join(__dirname, '..', 'data', 'habitantes_trash');
    assert(fs.readdirSync(t).some(f => f.endsWith('__' + ID + '.vox.json')), 'no aparecio en ' + t);
  });

  test('los assets del dueño siguen intactos', () => {
    const ahora = leerIdx().map(a => a.id);
    const faltan = antes.filter(id => id !== ID && !ahora.includes(id));
    assert(faltan.length === 0, 'desaparecieron del indice: ' + faltan.join(', '));
  });

  test('sin excepciones en la pagina', () => { assert(errores.length === 0, errores[0]); });

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();