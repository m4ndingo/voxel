// Monta los ejemplos de redstone en /map/redstone y COMPRUEBA que funcionan.
//   node redstone/montar_ejemplos.js            (con el servidor levantado en :8500)
//   node redstone/montar_ejemplos.js --mapa otro
//
// No basta con construirlo: un circuito mal orientado se ve igual de bonito y no hace nada. Así que
// después de montarlo esto acciona cada entrada como lo haría el dueño (conmutar la palanca, pulsar
// el botón, pisar la placa) y mira la SALIDA. Lo que se guarda es lo que ha pasado la prueba.
//
// Ojo: aquí NO se bloquean los POST — el objetivo es justamente dejar el mapa guardado.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.VOXEL_URL || 'http://localhost:8500';
const iM = process.argv.indexOf('--mapa');
const MAPA = iM > 0 ? process.argv[iM + 1] : 'redstone';

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  p.on('console', m => { if (/\[redstone\]|\[ejemplos\]/.test(m.text())) console.log('    · ' + m.text()); });

  console.log('Abriendo ' + BASE + '/map/' + MAPA);
  await p.goto(BASE + '/map/' + MAPA, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  // El motor entra por el autoarranque, que a propósito no se espera al abrir el mundo.
  await p.waitForFunction('window.game && game.redstone', null, { timeout: 60000 });
  await p.waitForTimeout(3000);

  await p.evaluate(fs.readFileSync(__dirname + '/redstone-ejemplos.js', 'utf8'));
  await p.waitForTimeout(6000);

  // ── ahora la parte que importa: accionar cada circuito ────────────────────────────────────
  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    const clave = (x, y, z) => mc.blockKey[mc.grid[mcIdx(x, y, z)]] || null;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const espera = ms => new Promise(f => setTimeout(f, ms));
    const Y = 15;
    const COLS = [4, 33, 62], FILAS = [30, 52, 72];
    const P = n => ({ x: COLS[n % 3], z: FILAS[(n / 3) | 0] });
    const en = (n, px, pz, dy) => { const q = P(n); return [q.x + px, Y + (dy || 0), q.z + pz]; };
    const leo = (n, px, pz, dy) => base(clave.apply(null, en(n, px, pz, dy)));

    // name2id indexa por mote corto, no por clave: quien sabe si un material está puesto es la paleta.
    const cargado = k => mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0;
    out.materiales = ['hab:cable', 'hab:inversor', 'hab:boton', 'hab:repetidor',
                      'hab:puerta', 'hab:puerta-alta',
                      // Las giradas son entradas de paleta APARTE: si faltan, las piezas de vuelta
                      // de los lazos salen roca y el 5, el 6 y el 8 se quedan sin cerrar.
                      'hab:repetidor@2', 'hab:inversor@2',
                      'asset:assets/adoquin.vox.json', 'asset:assets/tablones.vox.json'].filter(k => !cargado(k));

    // 1 · palanca → lámpara
    out.e1antes = leo(0, 10, 8);
    R.conmutar.apply(R, en(0, 4, 8)); ticks(10);
    out.e1conPalanca = leo(0, 10, 8);
    out.e1cable = leo(0, 5, 8);
    R.conmutar.apply(R, en(0, 4, 8)); ticks(10);
    out.e1trasApagar = leo(0, 10, 8);

    // 2 · el tendido largo muere, el del repetidor llega
    out.e2sinRepetidor = leo(1, 22, 5);
    out.e2conRepetidor = leo(1, 22, 10);
    out.e2repetidor = leo(1, 9, 10);
    // y el repetidor tiene que poder APAGARSE: si emitiera hacia atrás se quedaría pegado a sí mismo
    R.conmutar.apply(R, en(1, 1, 10)); ticks(20);
    out.e2trasBajarPalanca = leo(1, 9, 10);
    R.conmutar.apply(R, en(1, 1, 10)); ticks(20);

    // 3 · placa → puerta (se pisa de verdad: el mismo camino que al andar)
    out.e3cerrada = leo(2, 8, 8);
    const hueco = en(2, 8, 8);
    // La prueba de que se cruza es la del motor de física, no una tabla: el AABB del jugador
    // plantado en el vano tiene que dejar de chocar cuando la hoja se abre.
    out.e3chocaCerrada = mcCollides(hueco[0] + 0.5, hueco[1], hueco[2] + 0.5);
    const pl = en(2, 8, 11);
    R.encender(pl[0], pl[1], pl[2], true); ticks(10);
    out.e3abajo = leo(2, 8, 8);
    out.e3arriba = leo(2, 8, 8, 1);
    out.e3chocaAbierta = mcCollides(hueco[0] + 0.5, hueco[1], hueco[2] + 0.5);
    await espera(1600);                              // la placa se suelta sola (pulso)
    ticks(10);
    out.e3traspulso = leo(2, 8, 8);

    // 4 · NOR: luce solo con las dos palancas bajadas
    const nor = [];
    const A = en(3, 5, 7), B = en(3, 5, 9);
    for (const [a, bb] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      R.encender(A[0], A[1], A[2], !!a); R.encender(B[0], B[1], B[2], !!bb); ticks(12);
      nor.push(leo(3, 9, 8) === 'hab:antorcha');
    }
    R.encender(A[0], A[1], A[2], false); R.encender(B[0], B[1], B[2], false); ticks(12);
    out.nor = nor;

    // 5 · reloj: parado con el freno puesto, parpadeando sin él
    out.e5parado = leo(4, 3, 4);
    const frenoQuieto = [];
    for (let i = 0; i < 30; i++) { ticks(1); frenoQuieto.push(leo(4, 3, 4)); }
    out.e5quietoConFreno = new Set(frenoQuieto).size === 1;
    // ⚠️ Un reloj se mide contando CAMBIOS, no estados distintos. La versión anterior metía las
    // muestras en un Set y daba por bueno `size > 1`: eso lo cumple también un circuito que cambia
    // UNA vez y se queda quieto, que es justamente lo que pasaba —el inversor estaba clavado y lo
    // único que se veía era el pulso de soltar el freno—. La prueba pasaba y el reloj no existía.
    // Por eso además se deja asentar antes de empezar a contar: así el pulso del freno no cuenta.
    R.encender.apply(R, en(4, 6, 8).concat(false));  // se suelta el freno (forzado, no conmutado)
    ticks(60);
    let ant = leo(4, 3, 4), cambios = 0;
    const visto = new Set([ant]);
    for (let i = 0; i < 300; i++) {
      ticks(1);
      const v = leo(4, 3, 4);
      visto.add(v);
      if (v !== ant) { cambios++; ant = v; }
    }
    out.e5cambios = cambios;
    out.e5estados = [...visto];
    R.encender.apply(R, en(4, 6, 8).concat(true)); ticks(60);   // y se deja PARADO, que es como se guarda
    out.e5vuelveAPararse = leo(4, 3, 4);

    // 6 · memoria: SET, se suelta el botón, y sigue puesto; RESET, ídem
    out.e6inicial = leo(5, 6, 3);
    const rst = en(5, 8, 8), set = en(5, 4, 5);
    R.encender(rst[0], rst[1], rst[2], true); ticks(30);
    R.encender(rst[0], rst[1], rst[2], false); ticks(30);
    out.e6trasReset = leo(5, 6, 3);
    R.encender(set[0], set[1], set[2], true); ticks(30);
    R.encender(set[0], set[1], set[2], false); ticks(30);
    out.e6trasSet = leo(5, 6, 3);
    ticks(60);
    out.e6seAcuerda = leo(5, 6, 3);

    // 7 · T-Flip-Flop con pistón pegajoso: alternar estado con el botón
    const btn = en(6, 3, 7);
    const estadoIni = leo(6, 9, 7);
    R.encender(btn[0], btn[1], btn[2], true); ticks(2);
    R.encender(btn[0], btn[1], btn[2], false); ticks(60);
    const estadoTras1 = leo(6, 9, 7);
    R.encender(btn[0], btn[1], btn[2], true); ticks(2);
    R.encender(btn[0], btn[1], btn[2], false); ticks(60);
    const estadoTras2 = leo(6, 9, 7);
    out.tflipflop = [estadoIni, estadoTras1, estadoTras2];

    // 8 · XOR: luce con UNA palanca subida, no con ninguna y no con las dos
    const xor = [], A8 = en(7, 3, 4), B8 = en(7, 3, 10);
    ticks(30);                                        // que el XOR asiente antes de la primera lectura
    for (const [a, bb] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      R.encender(A8[0], A8[1], A8[2], !!a); R.encender(B8[0], B8[1], B8[2], !!bb); ticks(24);
      xor.push(leo(7, 11, 7) === 'hab:antorcha');
    }
    out.xor = xor;
    R.encender(A8[0], A8[1], A8[2], false); R.encender(B8[0], B8[1], B8[2], false); ticks(24);

    // 9 · la señal sube 21 bloques. El farol de arriba es la prueba de que el tendido vertical
    // conduce Y de que el repetidor de media altura repone: sin él el cable llega a cero por el
    // camino, exactamente igual que en horizontal.
    const P9 = en(8, 4, 4);                           // la palanca del pie
    out.e9antes = leo(8, 8, 4, 21);
    R.encender(P9[0], P9[1], P9[2], true); ticks(20);
    out.e9farol = leo(8, 8, 4, 21);
    out.e9escalon = leo(8, 7, 4, 10);
    R.encender(P9[0], P9[1], P9[2], false); ticks(20);
    out.e9trasApagar = leo(8, 8, 4, 21);

    out.notas = Object.keys(mc.notes).length;
    // Cada nota tiene que haber plantado su cartel, y NINGUNO puede acabar en el documento: los
    // carteles se derivan de las notas y van marcados efímeros. Si algún día se guardaran, el mapa
    // pasaría a tener dos fuentes de verdad y una re-ejecución dejaría carteles viejos de pie.
    if (typeof mcSyncNoteSigns === 'function') { await mcSyncNoteSigns(); await mcSyncNoteSigns(); }  // 10 notas = dos tandas
    out.carteles = mc.structures.filter(s => s.nota && mc.notes[s.nota]).length;
    out.cartelesEnDoc = mcStructuresDoc().filter(d => /cartel\.vox\.json$/.test(d.key)).length;
    out.spawn = mc.spawn;
    out.guardado = await game.saveWorld();
    return out;
  });

  console.log('\nMateriales y montaje');
  ok('todas las piezas están en la paleta', r.materiales.length === 0, r.materiales.join(','));
  ok('hay 10 carteles (9 circuitos + la entrada)', r.notas === 10, r.notas);
  ok('y cada nota ha plantado el suyo', r.carteles === 10, r.carteles + ' cartel(es)');
  ok('que no se guardan en el mundo (son efímeros)', r.cartelesEnDoc === 0, r.cartelesEnDoc + ' en el documento');
  ok('el spawn queda delante del cartel de entrada', !!r.spawn, JSON.stringify(r.spawn));

  console.log('\n1 · interruptor y lámpara');
  ok('nace apagada', r.e1antes === 'hab:antorcha-apagada', r.e1antes);
  ok('la palanca la enciende', r.e1conPalanca === 'hab:antorcha', r.e1conPalanca);
  ok('y el cable luce por donde pasa', r.e1cable === 'hab:cable-on', r.e1cable);
  ok('al bajarla se apaga', r.e1trasApagar === 'hab:antorcha-apagada', r.e1trasApagar);

  console.log('\n2 · el cable se gasta, el repetidor lo repone');
  ok('a los 20 bloques la señal ya no llega', r.e2sinRepetidor === 'hab:antorcha-apagada', r.e2sinRepetidor);
  ok('con repetidor en medio sí llega', r.e2conRepetidor === 'hab:antorcha', r.e2conRepetidor);
  ok('el repetidor está encendido', r.e2repetidor === 'hab:repetidor-on', r.e2repetidor);
  ok('y se APAGA al quitarle la fuente (no se alimenta a sí mismo)',
    r.e2trasBajarPalanca === 'hab:repetidor', r.e2trasBajarPalanca);

  console.log('\n3 · puerta con placa de presión');
  ok('la puerta nace cerrada', r.e3cerrada === 'hab:puerta', r.e3cerrada);
  ok('la placa abre la hoja de abajo', r.e3abajo === 'hab:puerta-abierta', r.e3abajo);
  // La de arriba no tiene señal ni cable propio: la arrastra la de abajo en la misma pasada (BUG-RS6).
  ok('…y la de arriba, arrastrada por ella', r.e3arriba === 'hab:puerta-alta-abierta', r.e3arriba);
  ok('cerrada, el jugador no cabe en el vano', r.e3chocaCerrada === true);
  ok('abierta, se puede cruzar', r.e3chocaAbierta === false);
  ok('y se cierra sola al soltarse la placa', r.e3traspulso === 'hab:puerta', r.e3traspulso);

  console.log('\n4 · NOR');
  ok('0,0 → luce', r.nor[0] === true);
  ok('1,0 → apagada', r.nor[1] === false);
  ok('0,1 → apagada', r.nor[2] === false);
  ok('1,1 → apagada', r.nor[3] === false, JSON.stringify(r.nor));

  console.log('\n5 · reloj');
  ok('se guarda PARADO (con el freno puesto)', r.e5parado === 'hab:inversor', r.e5parado);
  ok('y con el freno no se mueve', r.e5quietoConFreno === true);
  // El umbral no es «más de un estado» sino «más de un CAMBIO»: con un solo cambio lo que se está
  // midiendo es el pulso de soltar el freno, no el reloj. En 300 pasadas caben ~7 medios periodos.
  ok('al soltar el freno parpadea solo', r.e5cambios >= 4,
     r.e5cambios + ' cambios en 300 pasadas · ' + (r.e5estados || []).join(' / '));
  ok('y vuelve a pararse al frenarlo', r.e5vuelveAPararse === 'hab:inversor', r.e5vuelveAPararse);

  console.log('\n6 · memoria (1 bit)');
  ok('nace con el bit a 1', r.e6inicial === 'hab:antorcha', r.e6inicial);
  ok('RESET lo apaga y SIGUE apagado al soltar el botón', r.e6trasReset === 'hab:antorcha-apagada', r.e6trasReset);
  ok('SET lo enciende y SIGUE encendido al soltarlo', r.e6trasSet === 'hab:antorcha', r.e6trasSet);
  ok('y se acuerda sin que nadie lo sujete', r.e6seAcuerda === 'hab:antorcha', r.e6seAcuerda);

  console.log('\n7 · T-Flip-Flop con pistón pegajoso');
  ok('nace apagada', r.tflipflop[0] === 'hab:cable', r.tflipflop[0]);
  ok('primer pulso la enciende', r.tflipflop[1] === 'hab:cable-on', r.tflipflop[1]);
  ok('segundo pulso la apaga', r.tflipflop[2] === 'hab:cable', r.tflipflop[2]);

  console.log('\n8 · XOR (el interruptor de pasillo)');
  ok('0,0 apagada', r.xor[0] === false, JSON.stringify(r.xor));
  ok('1,0 ENCENDIDA', r.xor[1] === true, JSON.stringify(r.xor));
  ok('0,1 ENCENDIDA', r.xor[2] === true, JSON.stringify(r.xor));
  ok('1,1 apagada', r.xor[3] === false, JSON.stringify(r.xor));

  console.log('\n9 · la señal sube');
  ok('el farol nace apagado', r.e9antes === 'hab:antorcha-apagada', r.e9antes);
  ok('la palanca del pie enciende el farol de arriba', r.e9farol === 'hab:antorcha', r.e9farol);
  ok('y el repetidor de media altura está repartiendo', r.e9escalon === 'hab:repetidor-on', r.e9escalon);
  ok('al bajarla se apaga', r.e9trasApagar === 'hab:antorcha-apagada', r.e9trasApagar);

  console.log('\nGuardado');
  ok('el mundo se ha guardado', r.guardado === true);
  ok('sin errores de página', errores.length === 0, errores[0]);

  await p.screenshot({ path: '/tmp/redstone_mapa.png' });
  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallos' : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();
