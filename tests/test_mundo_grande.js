// @area: general
// @necesita: servidor, playwright
// test_mundo_grande.js — poner un bloque en un mundo grande no puede congelar el navegador.
//
// La queja del dueño: «poner un bloque se ve rapido como aparece pero luego se congela todo varios
// segundos, he puesto incluso game.renderDist=1 pero nada mejora, minecraft no lagea al poner o
// quitar bloques». No era render. En fps (512x40x512) el autoguardado serializaba el mundo ENTERO:
// mcSerialize 5,5 s + JSON.stringify 13 s = 18,5 s de congelacion y un POST de 257 MB, y el servidor
// encima copiaba 276 MB a la papelera. De ahi los 3,3 GB de data/habitantes_trash: eran 30 bloques.
//
//   node test_mundo_grande.js [url]        por defecto http://localhost:8500/
//
// El test se crea SU PROPIO mundo por API y lo borra en el finally: no toca ni fps ni el mundo
// sagrado. Por eso mismo comprueba al final que los mundos del dueño siguen ahi.
//
// Lo que se vigila, y por que cada cosa:
//   - poner/quitar un bloque no bloquea el hilo ni manda megabytes  -> la queja, medida;
//   - el bloque sobrevive a recargar                                -> que el atajo no sea "no guardar";
//   - un lote de snippet y deshacer/rehacer tambien sobreviven      -> los otros caminos de edicion;
//   - notas, estructuras y spawn siguen guardandose                 -> lo que un guardado por
//     ediciones de bloque puede tirar EN SILENCIO, que es el fallo caro de este cambio;
//   - un mundo v1 se convierte solo y no pierde un bloque           -> los 6 mundos que ya existian.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RAIZ = (process.argv[2] || 'http://localhost:8500/').replace(/\/$/, '');
const MAPA = 'zz-test-grande';
const WF = path.join(__dirname, 'data', 'worlds', MAPA + '.json');
const VOX = path.join(__dirname, 'data', 'worlds', MAPA + '.vox');
const DIM = { x: 128, y: 40, z: 128 };          // 655.360 celdas: bastante para que el camino viejo se note

let ok = 0, fallos = 0;
function test(nombre, cond, extra) {
  if (cond) { console.log('  ok  ' + nombre + (extra ? '   (' + extra + ')' : '')); ok++; }
  else { console.log('  FALLO ' + nombre + (extra ? '\n        ' + extra : '')); fallos++; }
}
const api = (ruta, opts) => fetch(RAIZ + ruta, opts);
const cabecera = () => JSON.parse(fs.readFileSync(WF, 'utf8'));

// Un mundo v1 con suelo, para que la conversion tenga algo que convertir.
function docV1() {
  const voxels = {};
  for (let z = 0; z < DIM.z; z++) for (let x = 0; x < DIM.x; x++) {
    voxels[x + ',0,' + z] = 'tex:asset:assets/roca.vox.json';
    voxels[x + ',1,' + z] = 'tex:asset:assets/hierba.vox.json';
  }
  return {
    format: 'voxelworld-1', dim: DIM, spawn: { x: 8, y: 3, z: 8 },
    voxels, structures: [], notes: { '4,2,4': 'nota de partida' }
  };
}

(async () => {
  const mundosAntes = (await (await api('/api/mundos')).json()).map(m => m.nombre);

  // Se da de alta en v1 A PROPOSITO: el POST completo tiene que seguir valiendo (sondas, tests,
  // importaciones) y el mundo tiene que aterrizar ya convertido.
  await api('/api/mundo?map=' + MAPA, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(docV1())
  });

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  // Se pesa lo que sale por la red hacia /api/mundo*: es la mitad de la queja (257 MB por bloque).
  const posts = [];
  p.on('request', r => {
    if (r.method() === 'POST' && /\/api\/mundo/.test(r.url())) {
      posts.push({ url: r.url().replace(RAIZ, ''), bytes: (r.postData() || '').length });
    }
  });

  let convertido = null, trasAlta = null, bloqueo = null, tamPost = null;
  let traeVox = false, persistio = null, cabFinal = null, borrado = null;
  let tamLote = null, nLote = 0, urlsBloque = [];
  try {
    convertido = cabecera();
    trasAlta = { vox: fs.existsSync(VOX) && fs.statSync(VOX).size, esperado: 2 * DIM.x * DIM.y * DIM.z };

    // La rejilla tiene que llegar como BYTES, no como 5,5 M de claves JSON.
    const rv = await ctx.request.get(RAIZ + '/api/mundo/vox?map=' + MAPA);
    traeVox = rv.ok() && (await rv.body()).length === trasAlta.esperado;

    await p.goto(RAIZ + '/map/' + MAPA, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof game!=="undefined" && game.setVoxel && mc && mc.grid', { timeout: 60000 });
    await p.waitForFunction('mc.v2===true', { timeout: 20000 }).catch(() => {});

    posts.length = 0;
    // La medida que importa: cuanto se queda el hilo principal parado por poner UN bloque. Se mide
    // con un temporizador que deberia dispararse cada 20 ms; si el hilo se bloquea, no se dispara.
    bloqueo = await p.evaluate(async () => {
      let peor = 0, t = performance.now();
      const id = setInterval(() => { const n = performance.now(); peor = Math.max(peor, n - t); t = n; }, 20);
      await new Promise(r => setTimeout(r, 200));
      // Los dos son de la paleta base (MC_BLOCKS) y ninguno esta en el mundo: asi el .vox estrena
      // dos entradas de paleta. Un material FUERA de esa lista (obsidiana) no lo resuelve setVoxel:
      // cae a roca con un aviso, y el test estaria midiendo otra cosa.
      game.setVoxel(60, 12, 60, 'asset:assets/tablones.vox.json');
      game.setVoxel(61, 12, 60, 'asset:assets/arena.vox.json');
      game.setVoxel(60, 1, 60, '');                      // quitar tambien cuenta
      await new Promise(r => setTimeout(r, 2500));       // el autoguardado va con 900 ms de retraso
      clearInterval(id);
      return peor;
    });
    tamPost = posts.reduce((s, x) => s + x.bytes, 0);
    urlsBloque = posts.map(x => x.url + ':' + x.bytes);

    // Un lote de snippet: beginBatch + 2.000 setVoxel + endBatch, que cierra por mcFlushBuild. Es
    // por donde entran los snippets y los agentes, y el unico camino que puede pasarse del umbral
    // de pendientes (MC_PEND_MAX) y caer al POST completo.
    posts.length = 0;
    nLote = await p.evaluate(async () => {
      let n = 0;
      game.beginBatch();
      for (let x = 70; x < 90; x++) for (let z = 70; z < 90; z++) for (let y = 12; y < 17; y++)
        if (game.setVoxel(x, y, z, 'asset:assets/adoquin.vox.json')) n++;
      game.endBatch();
      await new Promise(r => setTimeout(r, 3000));
      return n;
    });
    tamLote = posts.reduce((s, x) => s + x.bytes, 0);

    // Deshacer y rehacer. El editor apunta la entrada de historial justo al lado de la edicion; el
    // test hace lo mismo y luego usa mcUndo/mcRedo de verdad. Se prueban los DOS sentidos: en
    // (66,12,66) se queda deshecho y en (65,12,65) se rehace, para que ninguno pase por casualidad.
    await p.evaluate(async () => {
      const poner = (x, y, z) => {
        const before = game.getVoxel(x, y, z);
        game.setVoxel(x, y, z, 'asset:assets/adoquin.vox.json');
        mcPushHist({ t: 'b', x, y, z, before, after: game.getVoxel(x, y, z) });
      };
      poner(65, 12, 65);
      poner(66, 12, 66);
      await mcUndo();                    // deshace (66,12,66)
      await mcUndo();                    // deshace (65,12,65)
      await mcRedo();                    // ...y solo ese vuelve
      await new Promise(r => setTimeout(r, 2500));
    });

    // Notas, estructuras y spawn: lo que el guardado por ediciones podria tirar sin avisar.
    await p.evaluate(async () => {
      mc.notes['9,2,9'] = 'nota nueva';
      mc.spawn = { x: 20, y: 5, z: 20 };
      mcDirtyHeader(); mcScheduleSave();
      await new Promise(r => setTimeout(r, 2500));
    });

    await p.goto(RAIZ + '/map/' + MAPA, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction('typeof mc!=="undefined" && mc.grid', { timeout: 60000 });
    // game.getVoxel devuelve el ID de la paleta DEL CLIENTE, que se reconstruye en cada arranque:
    // se traduce a clave para poder afirmar sobre materiales y no sobre numeros que cambian.
    persistio = await p.evaluate(() => {
      const k = (x, y, z) => mc.blockKey[game.getVoxel(x, y, z)] || null;
      return {
        puesto: k(60, 12, 60), puesto2: k(61, 12, 60),
        quitado: k(60, 1, 60), vecino: k(59, 1, 59),
        lote1: k(70, 12, 70), lote2: k(89, 16, 89), loteFuera: k(90, 12, 90),
        rehecho: k(65, 12, 65), deshecho: k(66, 12, 66),
        nota: mc.notes['9,2,9'] || null, notaVieja: mc.notes['4,2,4'] || null,
        spawn: mc.spawn, v2: mc.v2
      };
    });
    cabFinal = cabecera();
  } finally {
    await b.close();
    // Red de seguridad: el mundo de prueba no se queda en el listado del dueño.
    for (const f of [WF, VOX]) if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (e) {} }
    borrado = !fs.existsSync(WF) && !fs.existsSync(VOX);
  }

  console.log('\n--- ' + RAIZ + ' (mundo grande: poner un bloque sin congelar) ---\n');

  test('el alta en v1 aterriza convertida a voxelworld-2',
    convertido && convertido.format === 'voxelworld-2',
    'format: ' + (convertido && convertido.format));
  test('la cabecera es de kilobytes, no de megabytes',
    convertido && !convertido.voxels && JSON.stringify(convertido).length < 20000,
    'cabecera: ' + (convertido ? JSON.stringify(convertido).length : '?') + ' bytes');
  test('la rejilla va aparte, en un .vox del tamaño exacto de la dim',
    trasAlta && trasAlta.vox === trasAlta.esperado,
    trasAlta && (trasAlta.vox + ' vs ' + trasAlta.esperado));
  test('GET /api/mundo/vox sirve esos bytes', traeVox);
  test('la conversion no pierde el suelo que venia en v1',
    persistio && persistio.vecino && /hierba/.test(String(persistio.vecino)),
    'el bloque (59,1,59) era: ' + (persistio && persistio.vecino));

  // El corazon del asunto. 18.514 ms era lo de antes; 300 ms es holgado incluso en SwiftShader.
  test('poner y quitar bloques no congela el hilo',
    bloqueo !== null && bloqueo < 300,
    'peor parón del hilo: ' + (bloqueo === null ? '?' : bloqueo.toFixed(0)) + ' ms');
  test('lo que se manda por la red son kilobytes, no el mundo entero',
    tamPost !== null && tamPost < 100000,
    'POSTs a /api/mundo*: ' + (tamPost === null ? '?' : tamPost) + ' bytes en ' + urlsBloque.length + ' peticiones');
  test('se usa el camino incremental, no el POST completo',
    urlsBloque.length > 0 && urlsBloque.every(u => /\/edits|\/cabecera/.test(u)),
    urlsBloque.join(' '));

  test('el bloque puesto sigue ahi tras recargar',
    persistio && /tablones/.test(String(persistio.puesto)) && /arena/.test(String(persistio.puesto2)),
    'quedaron: ' + (persistio && persistio.puesto) + ' / ' + (persistio && persistio.puesto2));
  test('el bloque quitado sigue quitado tras recargar',
    persistio && !persistio.quitado,
    'quedo: ' + (persistio && persistio.quitado));

  test('un lote de snippet (beginBatch/endBatch) persiste entero',
    nLote === 2000 && persistio && /adoquin/.test(String(persistio.lote1))
      && /adoquin/.test(String(persistio.lote2)) && !persistio.loteFuera,
    nLote + ' puestos; esquinas: ' + (persistio && persistio.lote1) + ' / ' + (persistio && persistio.lote2)
      + '; fuera del lote: ' + (persistio && persistio.loteFuera));
  test('2.000 bloques de golpe siguen yendo por ediciones, no por el mundo entero',
    tamLote !== null && tamLote < 300000 && posts.every(x => /\/edits|\/cabecera/.test(x.url)),
    'POSTs del lote: ' + tamLote + ' bytes (~' + (nLote ? Math.round(tamLote / nLote) : '?') + ' por bloque)');
  test('rehacer persiste',
    persistio && /adoquin/.test(String(persistio.rehecho)),
    'quedo: ' + (persistio && persistio.rehecho));
  test('deshacer persiste (no revive el bloque al recargar)',
    persistio && !persistio.deshecho,
    'quedo: ' + (persistio && persistio.deshecho));

  test('una nota nueva se guarda', persistio && persistio.nota === 'nota nueva',
    'quedo: ' + (persistio && persistio.nota));
  test('las notas que ya estaban NO se pierden al guardar por ediciones',
    persistio && persistio.notaVieja === 'nota de partida',
    'quedo: ' + (persistio && persistio.notaVieja));
  test('el spawn se guarda',
    persistio && persistio.spawn && persistio.spawn.x === 20 && persistio.spawn.z === 20,
    'quedo: ' + JSON.stringify(persistio && persistio.spawn));
  test('al recargar, el mundo se abre ya en modo incremental',
    persistio && persistio.v2 === true);
  test('la paleta de la cabecera crece con los materiales nuevos',
    cabFinal && (cabFinal.palette || []).some(k => k && /tablones/.test(k)),
    'paleta: ' + JSON.stringify(cabFinal && cabFinal.palette));

  const mundosAhora = (await (await api('/api/mundos')).json()).map(m => m.nombre);
  test('los mundos del dueño siguen intactos',
    mundosAntes.every(n => mundosAhora.includes(n)),
    'faltan: ' + mundosAntes.filter(n => !mundosAhora.includes(n)).join(', '));
  test('el mundo de prueba se ha limpiado', borrado);
  test('sin excepciones en la pagina', errores.length === 0, errores.join('\n        '));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos\n');
  process.exit(fallos ? 1 : 0);
})();