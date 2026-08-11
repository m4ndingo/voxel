// @area: fluidos
// @necesita: servidor, playwright
// test_fuentes_infinitas.js — REQ-FLUID8: una celda de fluido que toca DOS o mas fuentes por los lados
// y tiene un bloque SOLIDO debajo se convierte ella misma en fuente. Contra el app.js DE VERDAD.
//
//   node test_fuentes_infinitas.js [url]      por defecto http://localhost:8500/map/test
//
// El caso del enunciado es el hoyo de 2x2x1 con dos fuentes en diagonal: las otras dos celdas tienen
// que acabar a nivel 0. Pero lo que de verdad protege este fichero son los tres NO:
//   §3  una fuente sola NO convierte a nadie (con el umbral en 1, un charco inunda el llano entero).
//   §4  con otra FUENTE debajo en vez de roca NO prende (respuesta del dueño: solido es solido).
//   §6  la valvula lo apaga y el mundo se comporta como antes del ticket.
//
// El mundo del dueño NO se toca: se bloquean los POST de guardado y ademas se deshacen los bloques.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.fluidos && typeof game.fluidos.getProps === "function"', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  // ── Escenario: una bandeja de roca partida en CUATRO compartimentos estancos ─────────────────────
  // Uno por caso, con tabique de roca entre medias. No es exceso de celo: en la primera version dos
  // casos compartian bandeja, el agua de uno llego al otro y la lava ni llego a asentarse. Un charco
  // que se cuela de un caso a otro convierte un verde en una casualidad.
  const montaje = await p.evaluate(async () => {
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    const ANCHO = 8, ALTO = 8, FONDO = 24;   // 4 compartimentos de 5 celdas utiles + tabiques
    let base = null;
    for (let y = mc.dim.y - ALTO - 1; y > 2 && !base; y -= 2)
      for (let x = 1; x + ANCHO < mc.dim.x && !base; x += 4)
        for (let z = 1; z + FONDO < mc.dim.z && !base; z += 4)
          if (vacio(x, y, z, ANCHO, ALTO, FONDO)) base = [x, y, z];
    if (!base) return { error: 'no encontre un hueco de ' + ANCHO + 'x' + ALTO + 'x' + FONDO };

    const [BX, BY, BZ] = base;
    const previos = [];
    window.__previos = previos;
    const poner = (x, y, z, m) => { previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]); game.setVoxel(x, y, z, m); };

    mcResolveMat('agua'); mcResolveMat('lava');
    await new Promise(s => setTimeout(s, 1500));

    // Bandeja: suelo de roca en BY y un reborde de roca alrededor, para que nada se derrame fuera.
    // Las paredes suben 4 porque §4 monta una segunda capa de agua encima de la primera.
    const SUELO = BY, LIQ = BY + 1;
    for (let dx = 0; dx < ANCHO; dx++) for (let dz = 0; dz < FONDO; dz++) poner(BX + dx, SUELO, BZ + dz, 'roca');
    for (let dx = 0; dx < ANCHO; dx++) for (let dz = 0; dz < FONDO; dz++) {
      const borde = (dx === 0 || dx === ANCHO - 1 || dz === 0 || dz === FONDO - 1);
      if (borde) for (let y = LIQ; y < LIQ + 4; y++) poner(BX + dx, y, BZ + dz, 'roca');
    }
    // Tres tabiques ⇒ cuatro compartimentos estancos, uno por caso.
    const tabiques = [BZ + 6, BZ + 12, BZ + 18];
    tabiques.forEach(zt => {
      for (let dx = 0; dx < ANCHO; dx++) for (let y = LIQ; y < LIQ + 4; y++) poner(BX + dx, y, zt, 'roca');
    });

    // Esquina de trabajo de cada compartimento (deja sitio de sobra hasta el tabique siguiente).
    const comp = [BZ + 2, BZ + 8, BZ + 14, BZ + 20];
    window.__z = { BX, BY, BZ, ANCHO, FONDO, SUELO, LIQ, comp, cx: BX + 2 };
    return { BX, BY, BZ, SUELO, LIQ, comp };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('bandeja en ' + JSON.stringify(montaje));

  // nivel de una celda: 0 = FUENTE, 1..7 = corriente, null = no hay fluido
  const nivel = (x, y, z) => p.evaluate(({ x, y, z }) => {
    const pr = game.fluidos.getProps(mc.grid[mcIdx(x, y, z)], x, y, z);
    return pr && pr.isFluid ? pr.fluidLevel : null;
  }, { x, y, z });
  const poner = (x, y, z, m) => p.evaluate(({ x, y, z, m }) => {
    if (!window.__previos.some(q => q[0] === x && q[1] === y && q[2] === z))
      window.__previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]);
    game.setVoxel(x, y, z, m);
  }, { x, y, z, m });

  const Z = await p.evaluate(() => window.__z);
  // Un compartimento por caso: §1/§2 (y §4, que se monta encima) · §3 · §5 · §6.
  const CASO = { ejemplo: Z.comp[0], sola: Z.comp[1], lava: Z.comp[2], valvula: Z.comp[3] };

  // ── §1 · el ejemplo del dueño, tal cual ─────────────────────────────────────────────────────────
  //   [FUENTE][ aire ]      →      [FUENTE][FUENTE]
  //   [ aire ][FUENTE]             [FUENTE][FUENTE]
  await poner(Z.cx,     Z.LIQ, CASO.ejemplo,     'agua');
  await poner(Z.cx + 1, Z.LIQ, CASO.ejemplo + 1, 'agua');
  await p.waitForTimeout(4000);

  const diag = [await nivel(Z.cx, Z.LIQ, CASO.ejemplo), await nivel(Z.cx + 1, Z.LIQ, CASO.ejemplo + 1)];
  const huecos = [await nivel(Z.cx + 1, Z.LIQ, CASO.ejemplo), await nivel(Z.cx, Z.LIQ, CASO.ejemplo + 1)];
  test('§1 las dos fuentes puestas a mano siguen siendo fuentes', () => {
    assert(diag[0] === 0 && diag[1] === 0, 'las fuentes colocadas estan a nivel ' + JSON.stringify(diag));
  });
  test('§1 los dos huecos del 2×2 se convierten en FUENTE (nivel 0)', () => {
    assert(huecos[0] === 0 && huecos[1] === 0,
      'los huecos quedaron a nivel ' + JSON.stringify(huecos) + ' (0 = fuente, 1..7 = corriente, null = seco)');
  });

  // ── §2 · el cubo infinito: vaciar una celda y que vuelva a ser fuente ───────────────────────────
  // Es el motivo entero del ticket. Ademas comprueba la respuesta 3 del dueño: romper una fuente NO
  // degrada a las demas, asi que las tres que quedan bastan para rehacer la cuarta.
  await poner(Z.cx, Z.LIQ, CASO.ejemplo, 0);
  await p.waitForTimeout(4000);
  const rellenada = await nivel(Z.cx, Z.LIQ, CASO.ejemplo);
  test('§2 al vaciar una celda del 2×2, el hoyo se rellena y vuelve a ser fuente', () => {
    assert(rellenada === 0, 'la celda vaciada quedo a nivel ' + rellenada + ', no es fuente otra vez');
  });
  // Se vuelven a MEDIR las otras tres despues de romper. Comparar contra la lectura de §1 seria un
  // falso verde: ese valor es de antes del golpe y no dice nada de lo que paso despues.
  const trasRomper = [await nivel(Z.cx + 1, Z.LIQ, CASO.ejemplo), await nivel(Z.cx, Z.LIQ, CASO.ejemplo + 1),
                      await nivel(Z.cx + 1, Z.LIQ, CASO.ejemplo + 1)];
  test('§2 …y las otras tres siguen siendo fuentes (romper una no degrada al resto)', () => {
    trasRomper.forEach((v, i) => assert(v === 0,
      'la fuente ' + i + ' quedo a nivel ' + v + ' despues de romper su vecina: la conversion se esta deshaciendo'));
  });

  // ── §3 · una fuente SOLA no convierte a nadie ───────────────────────────────────────────────────
  // Este es el guardian del umbral. Con el umbral en 1 en vez de 2, la vecina se volveria fuente, y
  // luego la vecina de la vecina: el llano entero acabaria de fuentes. Aqui tiene que quedar corriente.
  await poner(Z.cx, Z.LIQ, CASO.sola, 'agua');
  await p.waitForTimeout(4000);
  const vecinas = [await nivel(Z.cx + 1, Z.LIQ, CASO.sola), await nivel(Z.cx, Z.LIQ, CASO.sola + 1),
                   await nivel(Z.cx + 2, Z.LIQ, CASO.sola)];
  test('§3 una fuente sola moja a sus vecinas pero NO las asciende a fuente', () => {
    assert(vecinas.some(v => v !== null), 'la fuente solitaria no llego a mojar nada: el caso no prueba nada');
    vecinas.forEach((v, i) => assert(v !== 0,
      'la vecina ' + i + ' se volvio FUENTE con una sola fuente al lado: con ese umbral el llano entero se inunda'));
  });

  // ── §4 · «solido» es solido: otra fuente debajo NO vale ─────────────────────────────────────────
  // Respuesta literal del dueño. Efecto practico: la regla solo prende en la capa que toca el fondo,
  // asi que en un estanque de dos de hondo la capa de arriba NO se vuelve infinita.
  const alto = { x: Z.cx, y: Z.LIQ + 1, z: CASO.ejemplo };
  await poner(alto.x, alto.y, alto.z, 'agua');
  await poner(alto.x + 1, alto.y, alto.z + 1, 'agua');
  await p.waitForTimeout(4000);
  const arriba = [await nivel(alto.x + 1, alto.y, alto.z), await nivel(alto.x, alto.y, alto.z + 1)];
  test('§4 con FUENTE debajo en vez de roca, los huecos NO ascienden a fuente', () => {
    assert(arriba.every(v => v !== 0),
      'la capa de arriba quedo a nivel ' + JSON.stringify(arriba) + ': el suelo era agua, no roca');
  });

  // ── §5 · vale para cualquier fluido: la lava tambien ────────────────────────────────────────────
  // Respuesta 2 del dueño. Se monta en la mitad sur, lejos del agua.
  const lx = Z.cx, lz = CASO.lava;
  await poner(lx,     Z.LIQ, lz,     'lava');
  await poner(lx + 1, Z.LIQ, lz + 1, 'lava');
  await p.waitForTimeout(6000);                     // la lava corre mas despacio que el agua
  const huecosLava = [await nivel(lx + 1, Z.LIQ, lz), await nivel(lx, Z.LIQ, lz + 1)];
  test('§5 la lava tambien forma fuentes infinitas', () => {
    assert(huecosLava[0] === 0 && huecosLava[1] === 0,
      'los huecos de lava quedaron a nivel ' + JSON.stringify(huecosLava));
  });

  // ── §6 · la valvula lo apaga ────────────────────────────────────────────────────────────────────
  await p.evaluate(() => { mc.sinFuentesInfinitas = true; });
  const vx = Z.cx, vy = Z.LIQ, vz = CASO.valvula;
  await poner(vx,     vy, vz,     'agua');
  await poner(vx + 1, vy, vz + 1, 'agua');
  await p.waitForTimeout(4000);
  const conValvula = [await nivel(vx + 1, vy, vz), await nivel(vx, vy, vz + 1)];
  await p.evaluate(() => { mc.sinFuentesInfinitas = false; });
  test('§6 mc.sinFuentesInfinitas devuelve el comportamiento de antes del ticket', () => {
    assert(conValvula.some(v => v !== null), 'con la valvula echada el agua ni siquiera corrio');
    conValvula.forEach((v, i) => assert(v !== 0,
      'el hueco ' + i + ' se volvio fuente con la valvula echada (nivel ' + v + ')'));
  });

  // ── Deshacer ───────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    const Zn = window.__z;
    for (let dx = 0; dx < Zn.ANCHO; dx++) for (let dz = 0; dz < Zn.FONDO; dz++)
      for (let y = Zn.LIQ; y < Zn.LIQ + 4 && y < mc.dim.y; y++) game.setVoxel(Zn.BX + dx, y, Zn.BZ + dz, 0);
  });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { (window.__previos || []).reverse().forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id | 0)); });

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
