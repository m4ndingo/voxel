// test_ficha_material.js — la ficha de un asset: como se llama esa textura desde un script.
//
// La queja del dueño: escribio «Construye Montañas» usando la textura «Hormigón Verde / Hojas» y tuvo
// que adivinar que desde un script se llama "hormig-n-verde-hojas". La textura la habia generado en
// otro programa como "green_concrete", y ese nombre no valia aqui. Desde el editor y la galeria solo
// se ve el ROTULO, asi que no habia forma de saber el nombre bueno ni de declarar uno corto propio.
//
//   node test_ficha_material.js [url]        por defecto http://localhost:8500/
//
// El test se crea SU PROPIO asset por API y lo borra en el finally: no toca ni un fichero del dueño.
// Por eso mismo comprueba explicitamente que los assets del dueño siguen en el indice al terminar, y
// que 'stone' sigue siendo roca despues de intentar robarselo.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8500/';
const IDX = path.join(__dirname, 'assets', 'index.json');
const ID = 'zz-test-ficha';
const FICH = path.join(__dirname, 'assets', ID + '.vox.json');

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
    format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 }, id: ID,
    meta: { name: 'ZZ Test Ficha', type: 'textura' },
    voxels: { '0,0,0': '#00ff88' }
  };
  await fetch(URL.replace(/\/$/, '') + '/api/assets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
  });

  // Sin los args de SwiftShader el arranque se cuela ~9 s en el WebGL por software y las esperas
  // fijas de este test se quedan cortas: es el mismo lanzamiento que usa el resto de la suite.
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  let claves = null, clave = null, resuelveAlias = null, resuelveViejo = null;
  let tomado = null, stoneSigue = null, cambiado = null, viejoMuerto = null;
  let trasReguardar = null, enIndice = null;
  try {
    await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof openFicha === "function"', { timeout: 60000 });

    // Abrir la ficha por el boton de la tarjeta, no llamando a openFicha() a pelo: lo que se esta
    // comprobando es que el dueño PUEDE llegar hasta aqui desde la galeria.
    const abrirFicha = async () => {
      await p.evaluate(() => openHabitantes('textura'));
      await p.waitForFunction(
        () => [...document.querySelectorAll('#hab-grid .hab-card')]
          .some(c => c.querySelector('.hab-name').textContent.includes('ZZ Test Ficha')),
        null, { timeout: 15000 }
      );
      await p.evaluate(() => [...document.querySelectorAll('#hab-grid .hab-card')]
        .find(c => c.querySelector('.hab-name').textContent.includes('ZZ Test Ficha'))
        .querySelector('[data-a=ficha]').click());
      await p.waitForFunction(() => !document.querySelector('#ficha-modal').hidden, null, { timeout: 5000 });
    };
    // Se espera a que guardarFicha TERMINE, no 1,2 s a ojo: el primer guardado es el mas lento de
    // todos (rebaja assets/index.json y repinta la galeria entera en frio) y la espera fija se le
    // quedaba corta — fallaba el PRIMER alias y salian verdes los siguientes, que enmascara el fallo.
    // Las dos senales de fin son el toast y el aviso de error; se limpian antes para no leer la vieja.
    const guardar = async () => {
      await p.evaluate(() => {
        document.querySelector('#toast').textContent = '';
        document.querySelector('#ficha-error').hidden = true;
      });
      await p.evaluate(() => document.querySelector('#ficha-save').click());
      await p.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Ficha guardada')
        || !document.querySelector('#ficha-error').hidden, null, { timeout: 20000 });
    };
    const escribir = (sel, v) => p.evaluate(([s, x]) => { document.querySelector(s).value = x; }, [sel, v]);
    // Los DOS mapas, porque son dos caminos distintos: MC_MAT_ALIAS es el que mira setVoxel
    // (mcResolveMat) y mcAssetsRegistry el que mira game.addMaterial — que es justo por donde
    // entro la queja. Se leen como identificadores sueltos: son `const` de nivel superior de un
    // script clasico, o sea que NO estan en window.
    // No se llama a mcResolveMat porque traduce a un id de mc.blockKey, y mc.blockKey solo esta
    // poblado con el Mundo abierto: aqui daria '' para todo y el test mentiria en verde.
    const resuelve = (m) => p.evaluate((x) => ({
      setVoxel: (typeof MC_MAT_ALIAS !== 'undefined' && MC_MAT_ALIAS[x]) || '',
      addMaterial: (typeof mcAssetsRegistry !== 'undefined' && mcAssetsRegistry[x])
        ? 'asset:' + mcAssetsRegistry[x] : ''
    }), m);

    await abrirFicha();
    clave = await p.evaluate(() => document.querySelector('#ficha-clave').value);
    claves = await p.evaluate(() => [...document.querySelectorAll('#ficha-claves li')]
      .map(li => li.textContent.trim().split(' ')[0]));

    // 1) Un nombre corto que no choca con nada.
    await escribir('#ficha-alias', 'zz_verde');
    await guardar();
    resuelveAlias = await resuelve('zz_verde');
    resuelveViejo = await resuelve(ID);              // el id de siempre no puede dejar de valer

    // 2) Robarle el nombre a un material de fabrica: debe rebotar y 'stone' seguir siendo roca.
    await escribir('#ficha-alias', 'stone');
    await guardar();
    tomado = await p.evaluate(() => ({
      error: document.querySelector('#ficha-error').hidden
        ? null : document.querySelector('#ficha-error').textContent,
      // el campo se deja como estaba para poder corregirlo, no se limpia de golpe
      campo: document.querySelector('#ficha-alias').value
    }));
    stoneSigue = await resuelve('stone');

    // 3) Cambiar el alias: el anterior tiene que DEJAR de valer (los mapas son de solo-acumular).
    await escribir('#ficha-alias', 'zz_hormigon');
    await guardar();
    cambiado = await resuelve('zz_hormigon');
    viejoMuerto = await resuelve('zz_verde');
    enIndice = entrada();

    // 4) Guardar la textura desde el editor (POST /api/assets) no puede borrar el nombre corto.
    await p.evaluate(() => fetch('/api/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'voxelforge-1', size: { x: 16, y: 16, z: 16 }, id: 'zz-test-ficha',
        meta: { name: 'ZZ Test Ficha', type: 'textura' }, voxels: { '0,0,0': '#123456' }
      })
    }).then(r => r.json()));
    await p.waitForTimeout(400);
    trasReguardar = JSON.parse(fs.readFileSync(FICH, 'utf8')).meta || {};
  } finally {
    await b.close();
    // Red de seguridad: si algo fallo a medias, el asset de prueba no se queda en el indice del dueño.
    if (entrada() || fs.existsSync(FICH)) {
      await fetch(URL.replace(/\/$/, '') + '/api/assets/' + ID, { method: 'DELETE' }).catch(() => {});
    }
  }

  console.log('\n--- ' + URL + ' (ficha de un asset) ---\n');

  test('la ficha enseña la clave exacta para scripting', () => {
    assert(clave === 'asset:assets/' + ID + '.vox.json', 'la clave era: ' + clave);
  });

  test('la ficha lista los nombres que YA funcionan (id y rotulo)', () => {
    assert(claves && claves.includes(ID), 'no listaba el id, listaba: ' + JSON.stringify(claves));
    assert(claves.includes('zz'), 'no listaba el rotulo, listaba: ' + JSON.stringify(claves));
  });

  const MIO = 'asset:assets/' + ID + '.vox.json';

  test('un nombre corto nuevo resuelve sin recargar la pagina', () => {
    assert(resuelveAlias.setVoxel === MIO, 'setVoxel(zz_verde) → ' + resuelveAlias.setVoxel);
    assert(resuelveAlias.addMaterial === MIO, 'addMaterial(zz_verde) → ' + resuelveAlias.addMaterial);
  });

  test('el id de siempre sigue valiendo (no se rompe ningun script viejo)', () => {
    assert(resuelveViejo.setVoxel === MIO, 'setVoxel(' + ID + ') → ' + resuelveViejo.setVoxel);
    assert(resuelveViejo.addMaterial === MIO, 'addMaterial(' + ID + ') → ' + resuelveViejo.addMaterial);
  });

  test('un nombre de fabrica se rechaza con motivo legible', () => {
    assert(tomado && tomado.error, 'no salio ningun error al pedir «stone»');
    assert(/fabrica/i.test(tomado.error), 'el motivo era: ' + tomado.error);
    assert(tomado.campo === 'stone', 'el campo se limpio en vez de dejar corregirlo: ' + tomado.campo);
  });

  test('«stone» sigue siendo roca despues del intento', () => {
    assert(stoneSigue.setVoxel === 'asset:assets/roca.vox.json',
      'stone resolvio a: ' + stoneSigue.setVoxel);
  });

  test('cambiar el nombre corto mata el anterior', () => {
    assert(cambiado.setVoxel === MIO, 'zz_hormigon → ' + cambiado.setVoxel);
    assert(viejoMuerto.setVoxel !== MIO, 'zz_verde SIGUE valiendo en setVoxel tras cambiarlo');
    assert(viejoMuerto.addMaterial !== MIO, 'zz_verde SIGUE valiendo en addMaterial tras cambiarlo');
  });

  test('el nombre corto queda en assets/index.json', () => {
    assert(enIndice && enIndice.alias === 'zz_hormigon',
      'el indice tenia: ' + JSON.stringify(enIndice && enIndice.alias));
  });

  test('guardar desde el editor NO borra el nombre corto del fichero', () => {
    assert(trasReguardar && trasReguardar.alias === 'zz_hormigon',
      'meta tras re-guardar: ' + JSON.stringify(trasReguardar));
  });

  test('los assets del dueño siguen intactos', () => {
    const ahora = leerIdx().map(a => a.id);
    const perdidos = antes.filter(x => !ahora.includes(x));
    assert(!perdidos.length, 'faltan del indice: ' + perdidos.join(', '));
  });

  test('sin excepciones en la pagina', () => {
    assert(!errores.length, errores.join('\n        '));
  });

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos\n');
  process.exit(fallos ? 1 : 0);
})();
