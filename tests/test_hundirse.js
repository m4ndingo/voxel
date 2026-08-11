// @area: fisica
// @necesita: servidor, playwright
// test_hundirse.js — REQ-FLUID6: dentro de un liquido la gravedad efectiva baja a 1/16 y aparece un
// rozamiento vertical que da la velocidad terminal. Contra el app.js DE VERDAD.
//
//   node test_hundirse.js [url]      por defecto http://localhost:8500/map/test
//
// Lo que se mide es la CAIDA REAL: se llama al mcUpdate del motor frame a frame y se leen las
// posiciones que deja, no las constantes de la tabla. Una tabla se puede cambiar sin que la fisica
// la lea, que es exactamente el fallo que este fichero tiene que cazar.
//
// El caso que de verdad protege es el §1: FUERA del liquido no cambia ni un float. La peticion del
// dueño fue «usar fuera del liquido las que estan ahora mismo», asi que una regresion ahi es peor
// que no tener el ticket.
//
// El mundo del dueño NO se toca: se bloquean los POST de guardado y ademas se deshacen los bloques
// al terminar.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function cerca(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg + ' (' + a + ' vs ' + b + ', tolerancia ' + tol + ')');
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  // Sin game.fluidos no hay nada que medir: lo instala un snippet y puede llegar tarde.
  await p.waitForFunction('window.game && game.fluidos && typeof game.fluidos.getProps === "function"', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  // ── El escenario: un pozo estanco ────────────────────────────────────────────────────────────────
  // Estanco de verdad (suelo + cuatro paredes) y no un charco: un fluido que puede escaparse se
  // reparte por medio mundo en niveles finisimos y a los tres segundos ya no queda columna que medir.
  const montaje = await p.evaluate(async () => {
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    const LADO = 7, ALTO = 16;
    let base = null;
    for (let y = mc.dim.y - ALTO - 1; y > 2 && !base; y -= 2)
      for (let x = 1; x + LADO < mc.dim.x && !base; x += 4)
        for (let z = 1; z + LADO < mc.dim.z && !base; z += 4)
          if (vacio(x, y, z, LADO, ALTO, LADO)) base = [x, y, z];
    if (!base) return { error: 'no encontre un hueco de ' + LADO + 'x' + ALTO + 'x' + LADO };

    const [BX, BY, BZ] = base;
    const previos = [];
    window.__previos = previos;
    const poner = (x, y, z, m) => { previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]); game.setVoxel(x, y, z, m); };

    // El material hay que resolverlo ANTES de usarlo: mcResolveMat es quien mete assets/agua.vox.json
    // en la paleta, y hasta que no esta, un setVoxel('agua') cae al relleno sin decir nada.
    mcResolveMat('agua'); mcResolveMat('lava');
    await new Promise(s => setTimeout(s, 1500));

    const HONDO = 9;                       // celdas de liquido
    const FONDO = BY + 1;                  // primera celda de liquido
    const SUP = FONDO + HONDO;             // primera celda de aire por encima
    for (let dx = 0; dx < LADO; dx++) for (let dz = 0; dz < LADO; dz++) {
      poner(BX + dx, BY, BZ + dz, 'roca');                                   // fondo estanco
      const borde = (dx === 0 || dx === LADO - 1 || dz === 0 || dz === LADO - 1);
      if (borde) for (let y = FONDO; y < SUP; y++) poner(BX + dx, y, BZ + dz, 'roca');   // paredes
    }
    window.__zona = { BX, BY, BZ, LADO, FONDO, SUP, HONDO, cx: BX + (LADO >> 1), cz: BZ + (LADO >> 1) };
    return { BX, BY, BZ, FONDO, SUP, dim: [mc.dim.x, mc.dim.y, mc.dim.z] };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('pozo en ' + JSON.stringify(montaje));

  // Llenar y esperar a que el simulador asiente: los niveles tardan varios ticks en cuajar.
  const llenar = async (material) => {
    await p.evaluate((mat) => {
      const Z = window.__zona;
      for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
        for (let y = Z.FONDO; y < Z.SUP; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, mat);
    }, material);
    await p.waitForTimeout(4000);
    return p.evaluate(() => {
      const Z = window.__zona, y = Z.SUP - 2;                                 // una celda por debajo de la superficie
      const f = mcFisicaFluido(Z.cx + 0.5, y + 0.5, Z.cz + 0.5);
      return { hay: !!f, params: f, clave: mc.blockKey[mc.grid[mcIdx(Z.cx, y, Z.cz)]] };
    });
  };

  // Una caida de n frames desde (x,y,z) con vy inicial. Devuelve la vy y la altura frame a frame.
  // Se llama al mcUpdate DE VERDAD (no a un calco): es lo unico que garantiza que se mide el orden
  // real de las operaciones, que en app.js aplica la gravedad ANTES del movimiento horizontal.
  const caer = (x, y, z, vy0, n) => p.evaluate(({ x, y, z, vy0, n }) => {
    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), keys: Object.assign({}, mc.keys),
                   onGround: mc.onGround, scale: mc.scale, yaw: mc.yaw, pitch: mc.pitch };
    mc.scale = 1; mc.pos = [x, y, z]; mc.vel = [0, vy0, 0]; mc.keys = {}; mc.onGround = false;
    const atascado = mcCollides(x, y, z);
    const ys = [], vys = [];
    for (let i = 0; i < n; i++) { mcUpdate(1 / 60); ys.push(mc.pos[1]); vys.push(mc.vel[1]); }
    Object.assign(mc, { vel: est0.vel, keys: est0.keys, onGround: est0.onGround,
                        scale: est0.scale, yaw: est0.yaw, pitch: est0.pitch });
    mc.pos = est0.pos;
    return { ys, vys, atascado };
  }, { x, y, z, vy0, n });

  const zona = await p.evaluate(() => window.__zona);
  const yAire = zona.SUP + 4.0;              // bien por encima de la superficie: aire limpio
  const yDentro = zona.FONDO + 6.0;          // hundido, con celdas de liquido encima y debajo

  // ── §1 · FUERA del liquido no cambia NADA ───────────────────────────────────────────────────────
  // Se compara contra la formula de antes del ticket, exacta: v_n = -22·n/60. Si mcCaidaPaso metiera
  // el menor rozamiento o el menor redondeo fuera del agua, esto se cae.
  const aire = await caer(zona.cx + 0.5, yAire, zona.cz + 0.5, 0, 40);
  test('§1 en el aire la gravedad sigue siendo 22 bloques/s², clavada', () => {
    assert(!aire.atascado, 'el punto de suelta no estaba libre');
    for (let i = 0; i < aire.vys.length; i++)
      cerca(aire.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1));
  });
  test('§1 en el aire recorre la caida de siempre, frame a frame', () => {
    // La esperada es la de la integracion DISCRETA del motor (suma de v_i·dt), no la parabola
    // continua ½gt²: a 60 fps se separan un 2,5 % y ese 2,5 % no es un fallo, es el metodo.
    const n = aire.ys.length, dt = 1 / 60;
    const caido = yAire - aire.ys[n - 1];
    cerca(caido, 22 * dt * dt * n * (n + 1) / 2, 1e-9, 'bloques caidos en ' + n + ' frames');
  });

  // ── §2 · AGUA ───────────────────────────────────────────────────────────────────────────────────
  const estadoAgua = await llenar('agua');
  test('§2 el pozo tiene agua de verdad y la reconoce el motor', () => {
    assert(estadoAgua.hay, 'mcFisicaFluido no ve agua en el pozo (clave = ' + estadoAgua.clave + ')');
    assert(/agua/.test(String(estadoAgua.clave)), 'la celda no es agua sino ' + estadoAgua.clave);
  });

  const agua = await caer(zona.cx + 0.5, yDentro, zona.cz + 0.5, 0, 120);
  const terminalAgua = Math.abs(agua.vys[agua.vys.length - 1]);
  test('§2 dentro del agua se hunde, pero MUCHO mas despacio que en el aire', () => {
    assert(!agua.atascado, 'el agua frena por colision: deberia atravesarse');
    const caidoAgua = yDentro - agua.ys[119];
    const caidoAire = yAire - aire.ys[39];
    assert(caidoAgua > 0.05, 'no se hunde nada en 2 s (' + caidoAgua.toFixed(3) + ' bloques)');
    assert(caidoAgua < 1.0, 'se hunde demasiado en 2 s: ' + caidoAgua.toFixed(3) + ' bloques');
    // En el aire son ~2,4 bloques en la MITAD de tiempo. La proporcion es el ticket entero.
    assert(caidoAire / caidoAgua > 5, 'la caida en agua no es sensiblemente mas lenta que en aire');
  });
  test('§2 la velocidad terminal es la que sale de gravedad × arrastre, no una escrita a mano', () => {
    // No se compara contra 0,3025 escrito aqui: se le pregunta al motor por sus parametros y se
    // deriva. Un numero a mano en el test mediria mi memoria, no el motor.
    const esperada = 22 * estadoAgua.params.gravedad * estadoAgua.params.arrastre;
    cerca(terminalAgua, esperada, esperada * 0.05, 'velocidad terminal en agua');
  });
  test('§2 la velocidad terminal se ESTANCA (no sigue creciendo)', () => {
    const v90 = Math.abs(agua.vys[89]), v119 = Math.abs(agua.vys[119]);
    cerca(v119, v90, v90 * 0.02, 'vy a los 1,5 s vs a los 2 s');
  });

  // ── §3 · la frontera no es un muro ──────────────────────────────────────────────────────────────
  // Entrar a toda velocidad tiene que DECELERAR en unas decimas, no cortarse en seco: es lo que
  // separa un rozamiento de un tope duro, y solo se ve en los primeros frames.
  const entrada = await caer(zona.cx + 0.5, yDentro, zona.cz + 0.5, -10, 120);
  test('§3 al entrar a 10 bloques/s no se corta en seco: el primer frame conserva casi toda la velocidad', () => {
    assert(Math.abs(entrada.vys[0]) > 8, 'el primer frame ya frena a ' + entrada.vys[0].toFixed(2) + ': eso es un tope, no rozamiento');
  });
  test('§3 …pero en dos decimas ya ha perdido la mitad', () => {
    // La vida media del rozamiento es arrastre·ln2 ≈ 0,15 s ≈ 9,2 frames: a los 12 (0,2 s) tiene que
    // quedar por debajo de la mitad, y a los 9 todavia no — por eso se mide en el 12 y no antes.
    assert(Math.abs(entrada.vys[11]) < 5, 'a los 12 frames aun va a ' + entrada.vys[11].toFixed(2) + ': el rozamiento no muerde');
  });
  test('§3 …y a los dos segundos va a velocidad terminal', () => {
    // Un segundo NO basta y no es un fallo: la cola del exponencial deja ~0,1 bloques/s de la
    // entrada, que sobre una terminal de 0,29 es un 35 %. Con dos segundos es 1e-3.
    cerca(Math.abs(entrada.vys[119]), terminalAgua, terminalAgua * 0.05, 'vy dos segundos despues de entrar');
  });

  // ── §4 · la valvula ─────────────────────────────────────────────────────────────────────────────
  // Va aqui, con el pozo TODAVIA LLENO: comprobarla sobre agua vacia daria verde aunque la valvula no
  // hiciera nada, porque fuera del agua el resultado ya es ese.
  const conValvula = await p.evaluate(async ({ x, y, z }) => {
    mc.sinFisicaFluido = true;
    const est = { pos: mc.pos.slice(), vel: mc.vel.slice(), keys: Object.assign({}, mc.keys), onGround: mc.onGround };
    mc.pos = [x, y, z]; mc.vel = [0, 0, 0]; mc.keys = {}; mc.onGround = false;
    const enAgua = !!mcFisicaFluido(x, y, z);      // con la valvula puesta tiene que decir «aqui no hay nada»
    const vys = [];
    for (let i = 0; i < 20; i++) { mcUpdate(1 / 60); vys.push(mc.vel[1]); }
    mc.sinFisicaFluido = false;
    const vuelve = !!mcFisicaFluido(x, y, z);      // …y al quitarla, el agua tiene que volver
    Object.assign(mc, { vel: est.vel, keys: est.keys, onGround: est.onGround }); mc.pos = est.pos;
    return { vys, enAgua, vuelve };
  }, { x: zona.cx + 0.5, y: yDentro, z: zona.cz + 0.5 });
  test('§4 mc.sinFisicaFluido devuelve la caida de antes del ticket, exacta', () => {
    assert(conValvula.vuelve, 'el punto medido no tenia agua: la prueba no valdria nada');
    assert(!conValvula.enAgua, 'con la valvula puesta mcFisicaFluido sigue viendo liquido');
    for (let i = 0; i < conValvula.vys.length; i++)
      cerca(conValvula.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con la valvula puesta');
  });

  // ── §5 · LAVA, un poco mas espesa ───────────────────────────────────────────────────────────────
  await p.evaluate(() => {                                 // vaciar antes: agua y lava juntas hacen roca
    const Z = window.__zona;
    for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
      for (let y = Z.FONDO; y < Z.SUP + 2 && y < mc.dim.y; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, 0);
  });
  await p.waitForTimeout(3000);
  const estadoLava = await llenar('lava');
  test('§5 el pozo tiene lava de verdad', () => {
    assert(estadoLava.hay, 'mcFisicaFluido no ve lava en el pozo (clave = ' + estadoLava.clave + ')');
    assert(/lava/.test(String(estadoLava.clave)), 'la celda no es lava sino ' + estadoLava.clave);
  });
  const lava = await caer(zona.cx + 0.5, yDentro, zona.cz + 0.5, 0, 120);
  const terminalLava = Math.abs(lava.vys[lava.vys.length - 1]);
  test('§5 en lava se hunde MAS despacio que en agua («un poco mas espesa», dueño)', () => {
    assert(terminalLava < terminalAgua * 0.8,
      'lava (' + terminalLava.toFixed(3) + ') no es mas espesa que agua (' + terminalAgua.toFixed(3) + ')');
  });
  test('§5 …y sigue siendo un liquido, no cemento: se hunde', () => {
    const caido = yDentro - lava.ys[119];
    assert(caido > 0.02, 'en lava no se hunde nada en 2 s (' + caido.toFixed(4) + ')');
  });

  // ── §6 · la superficie: un liquido a medio nivel no llega a los pies ────────────────────────────
  // Es la diferencia entre mirar la CELDA (lo que hace mcFluidoOjo, y alli basta) y mirar el PUNTO.
  // Sin esto, unos pies apoyados en el aire que deja un fluido a medio nivel se hundirian igual.
  // Se vacia el pozo y se deja UNA fuente en el suelo: al extenderse, las celdas de alrededor quedan
  // a nivel 1..7, o sea con la superficie a media altura. Es el unico caso donde la regla se nota, y
  // por eso no vale medirlo en el pozo lleno (alli todas las celdas son fuente y llegan a 1,0).
  await p.evaluate(() => {
    const Z = window.__zona;
    for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
      for (let y = Z.FONDO; y < Z.SUP + 2 && y < mc.dim.y; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, 0);
  });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const Z = window.__zona; game.setVoxel(Z.cx, Z.FONDO, Z.cz, 'agua'); });
  await p.waitForTimeout(4000);

  const superficie = await p.evaluate(() => {
    const Z = window.__zona, y = Z.FONDO;
    let media = null;
    for (let dx = 1; dx < Z.LADO - 1 && !media; dx++) for (let dz = 1; dz < Z.LADO - 1 && !media; dz++) {
      const x = Z.BX + dx, z = Z.BZ + dz;
      if (!mc.grid[mcIdx(x, y, z)]) continue;
      const h = mcGetFluidHeight(x, y, z);
      if (h < 0.95 && h > 0.2) media = { x, z, h, clave: mc.blockKey[mc.grid[mcIdx(x, y, z)]] };
    }
    if (!media) return { sinMedia: true };
    return {
      h: media.h, clave: media.clave,
      dentro: !!mcFisicaFluido(media.x + 0.5, y + media.h - 0.05, media.z + 0.5),
      justoEncima: !!mcFisicaFluido(media.x + 0.5, y + media.h + 0.05, media.z + 0.5),
      celdaEntera: !!mcFisicaFluido(media.x + 0.5, y + 0.99, media.z + 0.5),   // casi el techo de SU celda
      enRoca: !!mcFisicaFluido(Z.BX + 0.5, y + 0.5, Z.BZ + 0.5)                // la pared del pozo
    };
  });
  test('§6 el escenario tiene una celda de liquido a MEDIO nivel', () => {
    assert(!superficie.sinMedia, 'la fuente no dejo ninguna celda con la superficie por debajo del techo: ' +
      'sin eso, las tres comprobaciones de abajo no prueban nada');
  });
  test('§6 justo por DEBAJO de la superficie de esa celda, se esta dentro', () => {
    assert(superficie.dentro, 'a ' + (superficie.h - 0.05).toFixed(2) + ' de la base de una celda de altura ' +
      superficie.h + ' no detecta liquido');
  });
  test('§6 justo por ENCIMA de la superficie, NO — aunque la celda sea de agua', () => {
    assert(!superficie.justoEncima, 'unos pies apoyados en el aire que deja un fluido a medio nivel se hundirian');
  });
  test('§6 …y menos aun pegado al techo de esa misma celda', () => {
    assert(!superficie.celdaEntera, 'mira la CELDA y no el PUNTO: el ticket entero depende de esta diferencia');
  });
  test('§6 dentro de un bloque solido tampoco hay fisica de liquido', () => {
    assert(!superficie.enRoca, 'la roca de la pared se comporta como liquido');
  });

  // ── §7 · los AGENTES caen por la MISMA funcion que el jugador ───────────────────────────────────
  // El dueño lo pidio explicito: «los agentes tienen que comportarse a nivel de fisicas como los
  // jugadores en todos los casos». Sus integradores viven en el snippet 'mundo-autoarranque' y son
  // tres. Aqui se comprueba que pasan por mcCaidaPaso —envolviendola y viendo quien la llama con una
  // posicion que NO es la del jugador— en vez de tener su propia copia de la formula, que es lo que
  // se desincronizaria al primer retoque.
  const agentes = await p.evaluate(async () => {
    const rigs = (window.game && game.esqueletos && game.esqueletos.lista) ? game.esqueletos.lista() : [];
    const orig = window.mcCaidaPaso;
    const llamadas = [];
    // El envoltorio pasa TODOS los argumentos: desde REQ-FLUID7 hay un sexto («nadando») y comerselo
    // aqui apagaria el empuje mientras corre este test, que es justo el tipo de falso verde a evitar.
    window.mcCaidaPaso = function (vy, dt, x, y, z, nadando) { llamadas.push([x, y, z]); return orig(vy, dt, x, y, z, nadando); };
    const yo = mc.pos.slice();
    await new Promise(s => setTimeout(s, 1500));           // que corran unos cuantos frames del mundo
    window.mcCaidaPaso = orig;
    const ajenas = llamadas.filter(c => Math.abs(c[0] - yo[0]) > 0.001 || Math.abs(c[2] - yo[2]) > 0.001);
    return { rigs: rigs ? rigs.length : 0, total: llamadas.length, ajenas: ajenas.length };
  });
  test('§7 el jugador cae por mcCaidaPaso (un frame del mundo la llama)', () => {
    assert(agentes.total > 0, 'nadie llamo a mcCaidaPaso en 1,5 s de mundo en marcha');
  });
  test('§7 si hay agentes articulados vivos, caen por la MISMA funcion', () => {
    if (!agentes.rigs) { assert(agentes.total > 0, 'sin agentes en el mapa'); return; }
    assert(agentes.ajenas > 0, 'hay ' + agentes.rigs + ' agente(s) y ninguno pasa por mcCaidaPaso: ' +
      'tienen su propia copia de la gravedad');
  });

  // ── Deshacer ───────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    const Z = window.__zona;
    for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
      for (let y = Z.FONDO; y < Z.SUP + 2 && y < mc.dim.y; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, 0);
    (window.__previos || []).reverse().forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id | 0));
  });

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
