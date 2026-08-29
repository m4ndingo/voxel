// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián) del snippet `sel-guia-extrusion`: al dejar pulsado Shift o Ctrl con la
// herramienta Seleccionar, la selección enseña por dónde va a SUMAR (✚ verde) y por dónde a RESTAR
// (▬ rojo).
//
// Dueño (2026-08-28): «*saber visualmente hacia donde se crece o encoge la pieza con shift y control
// presionados en la herramienta de seleccion […] si empujar o traer con shift o hacer crecer o decrecer
// con control va a sumar o restar en cada direccion posible*».
//
// LA PRUEBA DE VERDAD (§1–§4) NO MIRA PÍXELES NI LISTAS: hace que el guía PREDIGA y luego deja que el
// MOTOR actúe, y exige que coincidan celda a celda. Una guía que no acierte lo que va a pasar es peor
// que ninguna, porque el jugador se fía. Se prueban las cuatro caras de trabajo (Ctrl y Shift, cada uno
// con y sin la cara opuesta de REQ-EXTRU4) y los dos sentidos de la rueda de cada una.
//
// ⛔ TODO PASA EN EL AIRE y CADA SECCIÓN EN SU SITIO (`__base(n)`, en rejilla): reusar la misma columna
// deja a la siguiente el terreno ya cavado, da 0 y parece fallo del parche cuando es del montaje. Y en
// rejilla, no en fila: corriendo el escenario por X se sale del mundo (96×80×96) a partir de la §5.
//
//   §1 Ctrl normal      · predice la cima: rueda ↑ pone lo que dijo ✚, rueda ↓ quita lo que dijo ▬
//   §2 Ctrl cara opuesta· lo mismo por el SUELO, con los sentidos de rueda cambiados
//   §3 Shift normal     · lo mismo por la cara que TE MIRA (ojo: ahí ✚ es rueda ABAJO)
//   §4 Shift c. opuesta · lo mismo por el FONDO
//   §5 silueta          · con una escalera, las marcas NO son una plancha plana
//   §6 la mirada manda  · girarse cambia el eje de Shift (y no el de Ctrl)
//   §7 las teclas       · Shift a secas y Ctrl pintan; Shift+Alt no; Ctrl+Shift = Ctrl (como la rueda)
//   §8 se apaga         · soltar la tecla, cambiar de herramienta o `off()` dejan los grupos a cero
//   §9 caja vacía       · el motor MUEVE la caja (REQ-EXTRU3) ⇒ ni ✚ ni ▬, marca cian aparte
//   §10 barato          · ✚ = 5 voxeles con grosor 5, NO 125 apilados
//   §11 no toca nada    · mirar no edita: `mc.gridGen` y el historial quedan igual
//   §12 centrado        · el glifo cae centrado en su celda (lo cazó el dueño a ojo en la v1)
//
// Corre en `/map/empty` con el AUTOGUARDADO APAGADO y comprueba que `empty.vox` no se toca.
//
//   node tests/probe_sel_guia.js [url]
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';
const SNIPPET = JSON.parse(fs.readFileSync(__dirname + '/../data/snippets/sel-guia-extrusion.json', 'utf8')).code;

const fallos = [];
function comprueba(nombre, ok, detalle) {
  if (ok) console.log('  ok   · ' + nombre);
  else { console.log('  FALLA· ' + nombre + (detalle ? ' → ' + detalle : '')); fallos.push(nombre); }
}

(async () => {
  const mtimeAntes = fs.statSync(VOX).mtimeMs;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  // ── utillería que vive en la página ─────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco
    mc.tool = 'select';

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    // Materiales de verdad, sacados del propio terreno: dos distintos si los hay.
    const ids = [];
    for (let y = suelo; y > suelo - 8 && y >= 0; y--) {
      const id = mc.grid[mcIdx(cx, y, cz)];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    window.__S = { cx, cz, suelo, ids, aire: suelo + 12 };   // 12 por encima del suelo = aire limpio

    // Coloca bloques (lista de [dx,dy,dz] relativos a la base) y deja la zona de alrededor VACÍA.
    window.__monta = (base, celdas, id) => {
      const edits = [];
      const pon = (x, y, z, v) => {
        const b = mc.grid[mcIdx(x, y, z)];
        if (b === v) return;
        mcSetBlock(x, y, z, v);
        edits.push({ x, y, z, before: b, after: v });
      };
      // Primero se vacía una burbuja generosa: la sección anterior pudo dejar algo justo al lado.
      for (let x = -4; x <= 8; x++) for (let y = -6; y <= 8; y++) for (let z = -4; z <= 8; z++) {
        const p = [base[0] + x, base[1] + y, base[2] + z];
        if (mcInside(p[0], p[1], p[2])) pon(p[0], p[1], p[2], 0);
      }
      for (const c of celdas) pon(base[0] + c[0], base[1] + c[1], base[2] + c[2], id || __S.ids[0]);
      mcRemeshEdiciones(edits);
      return edits.length;
    };

    // Caja de selección que envuelve exactamente las celdas dadas.
    window.__selecciona = (base, celdas) => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const c of celdas) for (let i = 0; i < 3; i++) {
        const v = base[i] + c[i];
        if (v < lo[i]) lo[i] = v;
        if (v > hi[i]) hi[i] = v;
      }
      mc.tool = 'select';
      mc.selCajas = [{ a: lo.slice(), b: hi.slice() }];
      mc.selA = null;
      return { a: lo, b: hi };
    };

    // Foto de una región (la caja + margen) para poder diferenciar después.
    window.__foto = (caja, margen) => {
      const m = margen == null ? 3 : margen;
      const f = new Map();
      for (let x = caja.a[0] - m; x <= caja.b[0] + m; x++)
        for (let y = caja.a[1] - m; y <= caja.b[1] + m; y++)
          for (let z = caja.a[2] - m; z <= caja.b[2] + m; z++)
            if (mcInside(x, y, z)) f.set(x + ',' + y + ',' + z, mc.grid[mcIdx(x, y, z)]);
      return f;
    };
    // ganados = celdas que pasaron de aire a bloque · perdidos = al revés
    window.__diff = (antes, despues) => {
      const ganados = [], perdidos = [];
      for (const [k, v] of antes) {
        const w = despues.get(k);
        if (!v && w) ganados.push(k);
        if (v && !w) perdidos.push(k);
      }
      return { ganados: ganados.sort(), perdidos: perdidos.sort() };
    };
    window.__claves = lista => lista.map(c => c.join(',')).sort();
    window.__mismo = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    // ⛔ CADA SECCIÓN EN SU SITIO, y DENTRO DEL MUNDO (96×80×96): el primer montaje de esta sonda iba
    // corriendo el escenario por el eje X y a partir de la §5 se salía del mapa — `mcSelForEach` no
    // encontraba nada, las marcas salían vacías y parecía fallo del snippet. Se reparten en rejilla,
    // 6 por fila, con hueco de sobra para la burbuja de aire (−4..+8) que limpia `__monta`.
    window.__base = n => [6 + (n % 6) * 14, __S.aire, 6 + ((n / 6) | 0) * 14];

    // Mira siempre hacia +X salvo que se diga otra cosa (mcEjeMirada: fx = −sin(yaw))
    window.__mira = eje => {
      mc.yaw = { '+X': -Math.PI / 2, '-X': Math.PI / 2, '-Z': 0, '+Z': Math.PI }[eje];
      return mcEjeMirada().nombre;
    };
  });

  const prep = await page.evaluate(() => ({ suelo: __S.suelo, ids: __S.ids, aire: __S.aire }));
  console.log('preparado ·', JSON.stringify(prep));
  if (prep.suelo < 0 || !prep.ids.length) { console.log('sin terreno en /map/empty: no se puede montar'); process.exit(1); }

  // ── carga del snippet, como lo carga el motor (web/app.js:4586) ─────────────────────────────────
  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const r = await new AsyncFunction('opts', 'args', code)({}, {});
    return { dicho: r, hayApi: !!(window.game && game.selGuia), puesto: !!(game.selGuia && game.selGuia.puesto()) };
  }, SNIPPET);
  console.log('snippet cargado ·', JSON.stringify(arranque));
  comprueba('el snippet expone game.selGuia y queda puesto', arranque.hayApi && arranque.puesto);

  // ── §1–§4 · la guía PREDICE y el motor CUMPLE ───────────────────────────────────────────────────
  // Escalera irregular a propósito: tres columnas de altura 1, 2 y 3. Así ninguna cara es plana y una
  // guía que dibujase una plancha (en vez de la silueta) fallaría aquí.
  const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];

  const casos = [
    { id: '§1 Ctrl normal', modo: 'ctrl', opuesta: false, n: 0, mira: '+X' },
    { id: '§2 Ctrl cara opuesta', modo: 'ctrl', opuesta: true, n: 1, mira: '+X' },
    { id: '§3 Shift normal', modo: 'shift', opuesta: false, n: 2, mira: '+X' },
    { id: '§4 Shift cara opuesta', modo: 'shift', opuesta: true, n: 3, mira: '+X' }
  ];

  for (const c of casos) {
    console.log('\n' + c.id);
    const r = await page.evaluate(caso => {
      const base = __base(caso.n);
      const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
      const mirada = __mira(caso.mira);
      mc.selOpuesta = caso.opuesta;                      // REQ-EXTRU4, la cara de trabajo

      const salida = { mirada, caraOpuesta: !!mc.selOpuesta };

      // — el ✚ —
      __monta(base, ESCALERA);
      const caja = __selecciona(base, ESCALERA);
      const pred = game.selGuia.marcas(caso.modo);
      salida.cara = pred.cara.nombre;
      salida.ruedaMas = pred.cara.ruedaMas;
      salida.ruedaMenos = pred.cara.ruedaMenos;
      salida.nMas = pred.mas.length;
      salida.nMenos = pred.menos.length;
      const dirMas = pred.cara.ruedaMas === 'arriba' ? 1 : -1;
      let antes = __foto(caja);
      const okMas = caso.modo === 'ctrl' ? mcSelExtruir(dirMas) : mcSelExtruirFrente(dirMas);
      let d = __diff(antes, __foto(caja));
      salida.devolvioMas = okMas;
      salida.ganados = d.ganados.length;
      salida.perdidosAlSumar = d.perdidos.length;
      salida.aciertaMas = __mismo(d.ganados, __claves(pred.mas));
      salida.esperabaMas = __claves(pred.mas).slice(0, 4);
      salida.ganoDeVerdad = d.ganados.slice(0, 4);

      // — el ▬ — (escenario nuevo: el gesto anterior ya movió la caja)
      __monta(base, ESCALERA);
      const caja2 = __selecciona(base, ESCALERA);
      const pred2 = game.selGuia.marcas(caso.modo);
      const dirMenos = pred2.cara.ruedaMenos === 'arriba' ? 1 : -1;
      antes = __foto(caja2);
      const okMenos = caso.modo === 'ctrl' ? mcSelExtruir(dirMenos) : mcSelExtruirFrente(dirMenos);
      d = __diff(antes, __foto(caja2));
      salida.devolvioMenos = okMenos;
      salida.perdidos = d.perdidos.length;
      salida.aciertaMenos = __mismo(d.perdidos, __claves(pred2.menos));
      salida.esperabaMenos = __claves(pred2.menos).slice(0, 4);
      salida.perdioDeVerdad = d.perdidos.slice(0, 4);
      // El ✚ y el ▬ tienen que ser CAPAS DISTINTAS: si coincidieran, la guía diría que en la misma
      // celda se pone y se quita, que es justo la confusión que el dueño quiere quitarse.
      salida.masYMenosSonDistintos = __claves(pred2.mas).every(k => __claves(pred2.menos).indexOf(k) < 0);
      mc.selOpuesta = false;
      return salida;
    }, c);
    console.log('  ' + JSON.stringify(r));
    comprueba(c.id + ' · el ✚ cae donde el motor pone', r.aciertaMas,
      'guía=' + JSON.stringify(r.esperabaMas) + ' motor=' + JSON.stringify(r.ganoDeVerdad));
    comprueba(c.id + ' · el ▬ cae donde el motor quita', r.aciertaMenos,
      'guía=' + JSON.stringify(r.esperabaMenos) + ' motor=' + JSON.stringify(r.perdioDeVerdad));
    comprueba(c.id + ' · ✚ y ▬ no comparten celda', r.masYMenosSonDistintos);
    comprueba(c.id + ' · hay marcas de las dos (3 columnas/filas)', r.nMas === 3 && r.nMenos === 3,
      'mas=' + r.nMas + ' menos=' + r.nMenos);
  }

  // ── §5 · silueta, no plancha ────────────────────────────────────────────────────────────────────
  console.log('\n§5 silueta');
  const sil = await page.evaluate(() => {
    const base = __base(4);
    const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
    __monta(base, ESCALERA);
    __selecciona(base, ESCALERA);
    mc.selOpuesta = false;
    const p = game.selGuia.marcas('ctrl');
    const alturas = p.menos.map(c => c[1] - base[1]).sort();
    return { alturas, alturasMas: p.mas.map(c => c[1] - base[1]).sort() };
  });
  console.log('  ' + JSON.stringify(sil));
  comprueba('§5 el ▬ sigue la escalera (alturas 0,1,2), no una plancha', String(sil.alturas) === '0,1,2');
  comprueba('§5 el ✚ va una celda por encima de cada peldaño', String(sil.alturasMas) === '1,2,3');

  // ── §6 · la mirada manda (sólo con Shift) ───────────────────────────────────────────────────────
  console.log('\n§6 la mirada manda');
  const mirada = await page.evaluate(() => {
    const base = __base(5);
    const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
    __monta(base, ESCALERA);
    __selecciona(base, ESCALERA);
    mc.selOpuesta = false;
    const lee = eje => { __mira(eje); const p = game.selGuia.marcas('shift'); return { eje: p.eje, out: p.out }; };
    const masX = lee('+X'), menosX = lee('-X'), menosZ = lee('-Z');
    __mira('+X');
    const ctrlA = game.selGuia.marcas('ctrl');
    __mira('-Z');
    const ctrlB = game.selGuia.marcas('ctrl');
    return { masX, menosX, menosZ, ctrl: { a: ctrlA.out, b: ctrlB.out, eje: ctrlA.eje } };
  });
  console.log('  ' + JSON.stringify(mirada));
  comprueba('§6 mirando a +X, Shift trabaja el eje X y hacia el jugador (out=−1)',
    mirada.masX.eje === 0 && mirada.masX.out === -1, JSON.stringify(mirada.masX));
  comprueba('§6 darse la vuelta le da la vuelta al sentido',
    mirada.menosX.eje === 0 && mirada.menosX.out === 1, JSON.stringify(mirada.menosX));
  comprueba('§6 mirando a −Z, Shift cambia de eje', mirada.menosZ.eje === 2);
  comprueba('§6 Ctrl NO depende de la mirada (siempre eje Y, +1)',
    mirada.ctrl.eje === 1 && mirada.ctrl.a === 1 && mirada.ctrl.b === 1, JSON.stringify(mirada.ctrl));

  // ── §7 · las teclas ─────────────────────────────────────────────────────────────────────────────
  // ⚠️ TECLADO DE VERDAD (`page.keyboard`), no `dispatchEvent`. El primer montaje sintetizaba el
  // KeyboardEvent a mano y NO valía: el navegador de pruebas suelta un chorro constante de `mousemove`
  // DE CONFIANZA con movimiento (0,0) y sin modificadores, y el snippet —que entonces también se
  // refrescaba con `mousemove`— se apagaba solo entre el evento falso y la medición. Eso destapó un
  // fallo de verdad (ver el snippet: ya sólo escucha keydown/keyup), y con teclas reales el estado del
  // navegador es el mismo que tendría el dueño.
  console.log('\n§7 las teclas');
  await page.evaluate(() => {
    const base = __base(6);
    const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
    __monta(base, ESCALERA);
    __selecciona(base, ESCALERA);
    mc.selOpuesta = false;
    mc.active = true;
    window.__pintados = () => {
      const g = game.voxelesUI.info().grupos;
      return { mas: g['sel-guia-mas'] || 0, menos: g['sel-guia-menos'] || 0, mueve: g['sel-guia-mueve'] || 0 };
    };
  });

  // Mantiene pulsadas exactamente esas teclas, espera al repintado del bucle y mide.
  let pulsadas = [];
  const suelta = async () => { for (const t of pulsadas.reverse()) await page.keyboard.up(t); pulsadas = []; };
  const pulsa = async teclas => {
    await suelta();
    for (const t of teclas) { await page.keyboard.down(t); pulsadas.push(t); }
    await page.waitForTimeout(2500);           // el navegador de pruebas va a ~1,4 fps: hay que esperar
    return await page.evaluate(() => ({ estado: game.selGuia.estado(), vox: __pintados() }));
  };

  const soloShift = await pulsa(['Shift']);
  console.log('  Shift a secas · ' + JSON.stringify({ modo: soloShift.estado.modo, cara: soloShift.estado.cara, vox: soloShift.vox }));
  comprueba('§7 Shift a secas dibuja ✚ y ▬', soloShift.estado.modo === 'shift' && soloShift.vox.mas > 0 && soloShift.vox.menos > 0,
    JSON.stringify(soloShift.vox));
  comprueba('§7 Shift a secas dice que suma con la rueda ABAJO (REQ-EXTRU2, inverso a Ctrl)',
    soloShift.estado.sumaConRueda === 'abajo', soloShift.estado.sumaConRueda);

  const shiftAlt = await pulsa(['Shift', 'Alt']);
  console.log('  Shift+Alt · ' + JSON.stringify({ modo: shiftAlt.estado.modo, vox: shiftAlt.vox }));
  comprueba('§7 Shift+Alt no es el gesto: no dibuja nada',
    shiftAlt.estado.modo === '(ninguno)' && shiftAlt.vox.mas === 0 && shiftAlt.vox.menos === 0,
    JSON.stringify(shiftAlt.vox));

  const soloCtrl = await pulsa(['Control']);
  console.log('  Ctrl a secas · ' + JSON.stringify({ modo: soloCtrl.estado.modo, cara: soloCtrl.estado.cara, vox: soloCtrl.vox }));
  comprueba('§7 Ctrl a secas dibuja por la cima (+Y)', soloCtrl.estado.modo === 'ctrl' && soloCtrl.vox.mas > 0,
    soloCtrl.estado.cara);
  comprueba('§7 Ctrl a secas dice que suma con la rueda ARRIBA', soloCtrl.estado.sumaConRueda === 'arriba');

  const ambas = await pulsa(['Control', 'Shift']);
  console.log('  Ctrl+Shift · ' + JSON.stringify({ modo: ambas.estado.modo }));
  comprueba('§7 con Ctrl y Shift a la vez manda Ctrl, como en la rueda de app.js', ambas.estado.modo === 'ctrl',
    ambas.estado.modo);

  // ── §8 · se apaga solo ──────────────────────────────────────────────────────────────────────────
  console.log('\n§8 se apaga');
  await suelta();
  await page.waitForTimeout(2500);
  const soltada = await page.evaluate(() => ({ estado: game.selGuia.estado(), vox: __pintados() }));
  comprueba('§8 soltar la tecla borra las marcas',
    !soltada.estado.dibujando && soltada.vox.mas === 0 && soltada.vox.menos === 0, JSON.stringify(soltada.vox));

  await pulsa(['Control']);
  await page.evaluate(() => { mc.tool = 'build'; });
  await page.waitForTimeout(2500);
  const otraHerramienta = await page.evaluate(() => __pintados());
  comprueba('§8 cambiar de herramienta (con la tecla aún pulsada) borra las marcas',
    otraHerramienta.mas === 0 && otraHerramienta.menos === 0, JSON.stringify(otraHerramienta));
  await page.evaluate(() => { mc.tool = 'select'; });
  await suelta();

  // ── §9 · caja vacía: el motor la MUEVE, no fabrica ──────────────────────────────────────────────
  console.log('\n§9 caja vacía');
  const vacia = await page.evaluate(() => {
    const base = __base(7);
    __monta(base, []);                                   // burbuja de aire, sin un solo bloque
    mc.tool = 'select';
    mc.selCajas = [{ a: [base[0], base[1], base[2]], b: [base[0] + 2, base[1] + 2, base[2] + 2] }];
    mc.selOpuesta = false;
    const p = game.selGuia.marcas('ctrl');
    return { mas: p.mas.length, menos: p.menos.length, vaciaDice: p.vacia };
  });
  await pulsa(['Control']);
  const vaciaVox = await page.evaluate(() => ({ vox: __pintados(), estado: game.selGuia.estado() }));
  console.log('  ' + JSON.stringify({ ...vacia, vox: vaciaVox.vox }));
  comprueba('§9 caja vacía: ni ✚ ni ▬ (el motor no crea ni destruye, REQ-EXTRU3)',
    vacia.mas === 0 && vacia.menos === 0 && vacia.vaciaDice === true && vaciaVox.vox.mas === 0 && vaciaVox.vox.menos === 0,
    JSON.stringify(vaciaVox.vox));
  comprueba('§9 caja vacía: sí sale la marca cian de «esto se mueve»', vaciaVox.vox.mueve > 0,
    JSON.stringify(vaciaVox.vox));

  // ── §10 · barato ────────────────────────────────────────────────────────────────────────────────
  console.log('\n§10 barato');
  const barato = await page.evaluate(() => {
    const base = __base(8);
    const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
    __monta(base, ESCALERA);
    __selecciona(base, ESCALERA);
    mc.selOpuesta = false;
    return { grosorMas: game.voxelesUI.grosor('sel-guia-mas'), grosorMenos: game.voxelesUI.grosor('sel-guia-menos') };
  });
  await pulsa(['Control']);
  const cuenta = await page.evaluate(() => {
    const e = game.selGuia.estado(), v = __pintados();
    return { esperado: e.marcasMas * 5 + e.marcasMenos * 3, pintado: v.mas + v.menos, e, v };
  });
  console.log('  ' + JSON.stringify({ ...barato, esperado: cuenta.esperado, pintado: cuenta.pintado }));
  comprueba('§10 el ✚ son 5 voxeles gordos y el ▬ 3, no cubos apilados',
    cuenta.pintado === cuenta.esperado && cuenta.pintado > 0,
    'esperado=' + cuenta.esperado + ' pintado=' + cuenta.pintado);
  comprueba('§10 el grosor va por GRUPO (grosor 5), que es lo que agranda sin apilar',
    barato.grosorMas === 5 && barato.grosorMenos === 5, JSON.stringify(barato));

  // ── §11 · mirar no edita ────────────────────────────────────────────────────────────────────────
  console.log('\n§11 mirar no edita');
  const quieto = await page.evaluate(() => ({ gen: mc.gridGen | 0, hist: (mc.hist ? mc.hist.length : -1) }));
  await pulsa(['Shift']);
  await page.evaluate(() => { __mira('-Z'); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { __mira('+X'); });
  await page.waitForTimeout(3000);
  const despues = await page.evaluate(() => ({ gen: mc.gridGen | 0, hist: (mc.hist ? mc.hist.length : -1) }));
  console.log('  ' + JSON.stringify({ antes: quieto, despues }));
  comprueba('§11 girarse con la tecla pulsada no cambia un solo bloque',
    quieto.gen === despues.gen && quieto.hist === despues.hist, JSON.stringify(despues));

  // ── §12 · CENTRADO ──────────────────────────────────────────────────────────────────────────────
  // El dueño cazó esto a ojo en la primera versión («*no esta bien centrado del todo*»): un voxel de la
  // capa UI NO está centrado en su coordenada —`mcVoxUIGeom` planta el cubo con la ESQUINA en `q*paso`
  // y lo hace crecer `grosor` hacia +—, así que dar los trazos como ±5 alrededor del centro corría el
  // glifo 2,5 finos. Se mide de verdad: el glifo tiene que quedar centrado en su celda con menos de un
  // fino de desvío en los dos ejes de la cara. Un fino es 1/16 de bloque; medio fino no lo ve nadie.
  console.log('\n§12 centrado');
  await pulsa(['Control']);
  const centrado = await page.evaluate(() => {
    const GROSOR = game.voxelesUI.grosor('sel-guia-mas'), FINOS = 16;
    const peor = { mas: 0, menos: 0 };
    for (const grupo of ['sel-guia-mas', 'sel-guia-menos']) {
      const m = mc.voxUI.get(grupo);
      if (!m || !m.size) return { error: 'grupo vacío: ' + grupo };
      // Por celda de bloque, la extensión del glifo en los dos ejes que NO son el de trabajo (aquí Y).
      const porCelda = new Map();
      for (const k of m.keys()) {
        const q = k.split(',').map(Number);
        const cel = q.map(v => Math.floor(v / FINOS));
        const off = [q[0] - cel[0] * FINOS, q[2] - cel[2] * FINOS];   // eje de trabajo = Y ⇒ u,v = X,Z
        const c = cel.join(','), a = porCelda.get(c) || [Infinity, -Infinity, Infinity, -Infinity];
        a[0] = Math.min(a[0], off[0]); a[1] = Math.max(a[1], off[0] + GROSOR);
        a[2] = Math.min(a[2], off[1]); a[3] = Math.max(a[3], off[1] + GROSOR);
        porCelda.set(c, a);
      }
      const clave = grupo === 'sel-guia-mas' ? 'mas' : 'menos';
      for (const a of porCelda.values()) {
        peor[clave] = Math.max(peor[clave],
          Math.abs((a[0] + a[1]) / 2 - FINOS / 2), Math.abs((a[2] + a[3]) / 2 - FINOS / 2));
      }
    }
    return peor;
  });
  console.log('  desvío máximo (en finos, 1 fino = 1/16 de bloque) · ' + JSON.stringify(centrado));
  comprueba('§12 el ✚ queda centrado en su celda (< 1 fino de desvío)',
    !centrado.error && centrado.mas < 1, JSON.stringify(centrado));
  comprueba('§12 el ▬ queda centrado en la cara del bloque (< 1 fino de desvío)',
    !centrado.error && centrado.menos < 1, JSON.stringify(centrado));

  await suelta();

  // ── §13 · PEGANDO: LAS MARCAS VAN A LA PIEZA EN VUELO, NO AL ORIGEN ─────────────────────────────
  // Dos quejas del dueño (2026-08-28) sobre el mismo gesto:
  //   «*cuando copio y pego, si pulso control o shift aunque los brackets estan en la pieza a pegar,
  //    los +- aparecen en la pieza de origen*»
  //   «*pegando sí hay extrusión que predecir, pero donde se esta pegando la pieza, no de donde se
  //    copió; ademas con desaparecer sigue funcionando control+rueda en la seleccion previa*»
  // El motivo: `mcPasteWorld` NO limpia la selección, así que `mc.selBox` sigue siendo la caja de ORIGEN
  // mientras el cúmulo vuela pegado a la mira — y la rueda de `app.js` la extruía de verdad.
  // Aquí se mide lo único que no se puede discutir: DÓNDE caen las marcas (¿en la caja de origen o en la
  // pieza en vuelo?) y QUÉ toca la rueda (¿el mundo o el portapapeles?).
  console.log('\n§13 pegando: las marcas y la rueda van a la pieza en vuelo');
  const pegando = await page.evaluate(() => {
    const base = __base(9), P = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    __monta(base, P);
    __selecciona(base, P);
    mc.selOpuesta = false;
    mc.pos = [base[0] - 3 + 0.5, base[1] + 0.5, base[2] + 0.5];
    mc.yaw = -Math.PI / 2; mc.pitch = 0;                       // mirando a +X, hacia la pieza
    mcCopySelection();
    mcPasteWorld();
    // Las celdas de mundo del cúmulo EN VUELO, por el camino del motor (`mcPasteOrigen`, el ÚNICO que
    // sabe dónde cae), para poder exigir que las marcas caigan dentro y ni una en el origen.
    window.__destino = () => {
      const org = mcPasteOrigen(mcRaycast(mcReach(), true));
      if (!org) return null;
      return clipboard.cells.map(c => { const q = org.mueve(c.dx, c.dz, c.dy);
                                        return [org.ox + q[0], org.oy + q[1], org.oz + q[2]].join(','); });
    };
    window.__origenCeldas = () => { const l = []; mcSelForEach((x, y, z) => l.push([x, y, z].join(','))); return l; };
    return { pasteActive: !!mc.pasteActive, hayCaja: !!mc.selBox };
  });
  const pegandoCtrl = await pulsa(['Control']);
  // Se mide CON Ctrl YA PULSADO, que es cuando el dueño ve el fallo, y además así el sitio es firme: con
  // Ctrl el motor CONGELA el cúmulo (`mc.pasteCtrlFreeze`) en vez de dejarlo colgado de la mira, que en
  // este navegador de 1,4 fps se movería entre la medida y la comprobación (el jugador está cayendo).
  const vuelo = await page.evaluate(() => ({
    prediccion: game.selGuia.marcas('ctrl'), destino: __destino(), origenCeldas: __origenCeldas(),
    congelado: mc.pasteCtrlFreeze ? mc.pasteCtrlFreeze.slice() : null
  }));
  // La rueda con Ctrl: pegando tiene que engordar el CÚMULO y no tocar un solo bloque del mundo.
  const rueda = await page.evaluate(async () => {
    // Las DOS ruedas —la del canvas (app.js) y la del snippet— exigen el ratón capturado, y eso no se
    // puede pedir sin un gesto de usuario de verdad. Se finge el candado: sin esto el evento no llega a
    // ninguna de las dos y el «no extruye el origen» pasaría por la puerta de atrás, sin probar nada.
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    const foto = () => ({ bloques: clipboard.cells.length, gen: mc.gridGen | 0, dims: mcClipboardDims() });
    const gira = (n, dy) => { for (let i = 0; i < n; i++) mc.canvas.dispatchEvent(new WheelEvent('wheel',
      { deltaY: dy, ctrlKey: true, bubbles: true, cancelable: true })); };
    const antes = foto();
    gira(4, -60);                                   // rosca arriba = la cima crece (§1)
    const despues = foto();
    gira(4, 60);                                    // y hacia abajo se lo come otra vez
    const encogida = foto();
    delete document.pointerLockElement;
    return { antes, despues, encogida };
  });
  await suelta();
  await page.waitForTimeout(2500);
  const finPegado = await page.evaluate(() => { mcPasteCancel(); return { pasteActive: !!mc.pasteActive }; });
  await page.waitForTimeout(2500);
  const trasCancelar = await pulsa(['Control']);
  await suelta();
  // ¿Las marcas ▬ caen sobre la pieza en vuelo o sobre la de origen? Celda a celda, contra las dos listas.
  const donde = (() => {
    const p = vuelo.prediccion;
    if (!p || !vuelo.destino) return null;
    const destino = new Set(vuelo.destino), origen = new Set(vuelo.origenCeldas);
    const cl = c => c.join(',');
    return { total: p.menos.length,
             enVuelo: p.menos.filter(c => destino.has(cl(c))).length,
             enOrigen: p.menos.filter(c => origen.has(cl(c))).length };
  })();
  console.log('  ' + JSON.stringify({ congelado: vuelo.congelado, destino: vuelo.destino, donde,
                                      ctrl: pegandoCtrl.vox, rueda, tras: trasCancelar.vox }));
  comprueba('§13 el escenario es el del bug: pegando y con la caja de origen todavía viva',
    pegando.pasteActive && pegando.hayCaja, JSON.stringify({ p: pegando.pasteActive, c: pegando.hayCaja }));
  comprueba('§13 pegando SÍ hay extrusión que predecir', !!vuelo.prediccion && vuelo.prediccion.pegando === true,
    JSON.stringify(vuelo.prediccion));
  comprueba('§13 las marcas caen en la pieza EN VUELO, ni una en la de origen',
    !!donde && donde.total > 0 && donde.enVuelo === donde.total && donde.enOrigen === 0, JSON.stringify(donde));
  comprueba('§13 pegando, Ctrl pinta ✚ y ▬ (no desaparecen)',
    pegandoCtrl.vox.mas > 0 && pegandoCtrl.vox.menos > 0, JSON.stringify(pegandoCtrl.vox));
  comprueba('§13 Ctrl+rueda engorda la PIEZA del portapapeles', rueda.despues.bloques > rueda.antes.bloques,
    JSON.stringify(rueda));
  comprueba('§13 y la rueda al revés la adelgaza (vuelve a lo que era)',
    rueda.encogida.bloques === rueda.antes.bloques && rueda.encogida.dims.h === rueda.antes.dims.h,
    JSON.stringify(rueda));
  comprueba('§13 ⛔ y NO extruye la selección de origen (`mc.gridGen` no se mueve)',
    rueda.despues.gen === rueda.antes.gen && rueda.encogida.gen === rueda.antes.gen, JSON.stringify(rueda));
  comprueba('§13 al soltar el pegado la guía vuelve a la selección',
    !finPegado.pasteActive && trasCancelar.vox.mas > 0 && trasCancelar.vox.menos > 0,
    JSON.stringify(trasCancelar.vox));

  // ── off() ───────────────────────────────────────────────────────────────────────────────────────
  console.log('\noff()');
  const apagado = await page.evaluate(() => {
    const dicho = game.selGuia.off();
    return { dicho, vox: __pintados(), puesto: game.selGuia.puesto(),
             mcUpdateLimpio: !mcUpdate._selGuia, oyentes: !!window._selGuiaOyentes };
  });
  console.log('  ' + JSON.stringify(apagado));
  comprueba('off() borra las marcas, desenrosca mcUpdate y quita los oyentes',
    apagado.vox.mas === 0 && apagado.vox.menos === 0 && apagado.vox.mueve === 0 &&
    !apagado.puesto && apagado.mcUpdateLimpio && !apagado.oyentes, JSON.stringify(apagado));

  await browser.close();

  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  const intacto = mtimeAntes === mtimeDespues;
  comprueba('empty.vox intacto (autoguardado apagado)', intacto);

  console.log('\n' + (fallos.length ? fallos.length + ' FALLO(S): ' + fallos.join(' · ') : 'todo ok'));
  process.exit(fallos.length ? 1 : 0);
})();
