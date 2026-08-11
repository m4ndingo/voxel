// @area: fisica
// @necesita: servidor, playwright
// test_nadar.js — REQ-FLUID7: dentro de un liquido, MANTENER la tecla de salto empuja de forma
// sostenida hacia arriba en vez de dar un impulso y caer. Contra el app.js DE VERDAD.
//
//   node test_nadar.js [url]      por defecto http://localhost:8500/map/test
//
// El ticket cambia el GESTO, no un numero: fuera la tecla es un evento (impulso + parabola) y dentro
// pasa a ser un estado (aceleracion mientras siga pulsada). Por eso lo que se mide es la subida REAL
// —posiciones que deja mcUpdate frame a frame— y no la constante de la tabla.
//
// Los tres casos que de verdad protege:
//   §1  FUERA no cambia ni un float, ni siquiera con la tecla pulsada.
//   §7  con suelo debajo gana el salto de siempre, asi que un charco se sigue saltando igual.
//   §6  mandan los PIES, que es lo que deja salir a la orilla en vez de quedarse pegado al borde.
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
  await p.waitForFunction('window.game && game.fluidos && typeof game.fluidos.getProps === "function"', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  // ── El escenario: el mismo pozo estanco de test_hundirse.js ──────────────────────────────────────
  // Estanco de verdad (suelo + cuatro paredes): un fluido que puede escaparse se reparte por medio
  // mundo en niveles finisimos y a los tres segundos ya no queda columna en la que nadar.
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

    mcResolveMat('agua'); mcResolveMat('lava');
    await new Promise(s => setTimeout(s, 1500));

    const HONDO = 9, FONDO = BY + 1, SUP = FONDO + HONDO;
    for (let dx = 0; dx < LADO; dx++) for (let dz = 0; dz < LADO; dz++) {
      poner(BX + dx, BY, BZ + dz, 'roca');
      const borde = (dx === 0 || dx === LADO - 1 || dz === 0 || dz === LADO - 1);
      if (borde) for (let y = FONDO; y < SUP; y++) poner(BX + dx, y, BZ + dz, 'roca');
    }
    window.__zona = { BX, BY, BZ, LADO, FONDO, SUP, HONDO, cx: BX + (LADO >> 1), cz: BZ + (LADO >> 1) };
    return { BX, BY, BZ, FONDO, SUP, dim: [mc.dim.x, mc.dim.y, mc.dim.z] };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('pozo en ' + JSON.stringify(montaje));

  const llenar = async (material) => {
    await p.evaluate((mat) => {
      const Z = window.__zona;
      for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
        for (let y = Z.FONDO; y < Z.SUP; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, mat);
    }, material);
    await p.waitForTimeout(4000);
    return p.evaluate(() => {
      const Z = window.__zona, y = Z.SUP - 2;
      const f = mcFisicaFluido(Z.cx + 0.5, y + 0.5, Z.cz + 0.5);
      return { hay: !!f, params: f, clave: mc.blockKey[mc.grid[mcIdx(Z.cx, y, Z.cz)]] };
    });
  };

  // Un tramo de n frames desde (x,y,z), con la tecla de subir MANTENIDA o no, y con o sin suelo bajo
  // los pies. `soltarEn` suelta la tecla a mitad, que es como se comprueba que el empuje es un estado
  // y no un impulso que ya no se puede retirar. Se llama al mcUpdate DE VERDAD.
  const tramo = (o) => p.evaluate((o) => {
    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), keys: Object.assign({}, mc.keys),
                   onGround: mc.onGround, scale: mc.scale, yaw: mc.yaw, pitch: mc.pitch };
    mc.scale = 1; mc.pos = [o.x, o.y, o.z]; mc.vel = [0, o.vy0 || 0, 0];
    mc.keys = {}; if (o.tecla) mc.keys[' '] = true;
    mc.onGround = !!o.enSuelo;
    const atascado = mcCollides(o.x, o.y, o.z);
    const dentro0 = !!mcFisicaFluido(o.x, o.y, o.z);
    const ys = [], vys = [];
    for (let i = 0; i < o.n; i++) {
      if (o.soltarEn != null && i === o.soltarEn) mc.keys[' '] = false;
      mcUpdate(1 / 60);
      ys.push(mc.pos[1]); vys.push(mc.vel[1]);
    }
    Object.assign(mc, { vel: est0.vel, keys: est0.keys, onGround: est0.onGround,
                        scale: est0.scale, yaw: est0.yaw, pitch: est0.pitch });
    mc.pos = est0.pos;
    return { ys, vys, atascado, dentro0 };
  }, o);

  const zona = await p.evaluate(() => window.__zona);
  const X = zona.cx + 0.5, Z = zona.cz + 0.5;
  const yAire = zona.SUP + 4.0;              // bien por encima de la superficie: aire limpio
  const yDentro = zona.FONDO + 1.5;          // hundido, con sitio de sobra para subir sin asomar

  // ── §1 · FUERA del liquido la tecla mantenida no hace NADA ──────────────────────────────────────
  // Sin suelo debajo, mantener pulsado en el aire tiene que seguir siendo caida limpia: v_n = -22·n/60.
  // Si el empuje se colase fuera del agua, se podria volar, que es la peor regresion posible aqui.
  const aireCon = await tramo({ x: X, y: yAire, z: Z, n: 40, tecla: true });
  const aireSin = await tramo({ x: X, y: yAire, z: Z, n: 40, tecla: false });
  test('§1 en el aire, mantener la tecla no cambia la caida ni un float', () => {
    assert(!aireCon.atascado, 'el punto de suelta no estaba libre');
    assert(!aireCon.dentro0, 'el punto de suelta ya estaba dentro de un liquido');
    for (let i = 0; i < aireCon.vys.length; i++)
      cerca(aireCon.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con la tecla pulsada');
  });
  test('§1 …y da exactamente lo mismo que sin pulsarla', () => {
    for (let i = 0; i < aireCon.vys.length; i++)
      cerca(aireCon.vys[i], aireSin.vys[i], 1e-12, 'vy del frame ' + (i + 1) + ' con tecla vs sin tecla');
  });

  // ── §2 · AGUA: se sube manteniendo, y es sostenido ──────────────────────────────────────────────
  const estadoAgua = await llenar('agua');
  test('§2 el pozo tiene agua de verdad y la reconoce el motor', () => {
    assert(estadoAgua.hay, 'mcFisicaFluido no ve agua en el pozo (clave = ' + estadoAgua.clave + ')');
    assert(/agua/.test(String(estadoAgua.clave)), 'la celda no es agua sino ' + estadoAgua.clave);
  });

  const nada = await tramo({ x: X, y: yDentro, z: Z, n: 120, tecla: true });
  const hunde = await tramo({ x: X, y: yDentro, z: Z, n: 120, tecla: false });
  test('§2 dentro del agua, mantener la tecla SUBE (sin ella, se hunde)', () => {
    assert(nada.dentro0, 'el punto de partida no estaba dentro del agua');
    assert(nada.ys[119] > yDentro, 'con la tecla pulsada acabo en ' + nada.ys[119].toFixed(2) + ', partiendo de ' + yDentro);
    assert(hunde.ys[119] < yDentro, 'sin tecla no se hundio: ' + hunde.ys[119].toFixed(2));
  });
  test('§2 la subida es SOSTENIDA: sube en todos y cada uno de los frames', () => {
    // Esto es lo que separa «nadar» de «saltar»: un impulso da una parabola, o sea frames en los que
    // ya se esta bajando. Aqui no puede haber ni uno solo.
    for (let i = 1; i < nada.ys.length; i++)
      assert(nada.ys[i] > nada.ys[i - 1], 'el frame ' + i + ' bajo (' + nada.ys[i - 1].toFixed(3) +
        ' → ' + nada.ys[i].toFixed(3) + '): eso es una parabola, no nadar');
  });

  // ── §3 · no es un impulso: la velocidad se GANA, no se recibe de golpe ──────────────────────────
  const saltoFuera = await tramo({ x: X, y: yAire, z: Z, n: 2, tecla: true, enSuelo: true });
  test('§3 el primer frame dentro del agua no da un pelotazo de velocidad', () => {
    // Fuera, el salto pone 8 bloques/s de una vez. Dentro, el primer frame tiene que ser una fraccion
    // de eso: es aceleracion, no impulso.
    assert(saltoFuera.vys[0] > 5, 'el salto de fuera ya no da un impulso (' + saltoFuera.vys[0].toFixed(2) + ')');
    assert(nada.vys[0] > 0, 'el primer frame dentro del agua no sube: ' + nada.vys[0].toFixed(3));
    assert(nada.vys[0] < saltoFuera.vys[0] / 10, 'el primer frame dentro del agua da ' +
      nada.vys[0].toFixed(2) + ': eso es un impulso, no un empuje sostenido');
  });
  test('§3 …y la velocidad de subida CRECE durante los primeros frames', () => {
    assert(nada.vys[5] > nada.vys[0], 'no acelera: ' + nada.vys[0].toFixed(3) + ' → ' + nada.vys[5].toFixed(3));
    assert(nada.vys[20] > nada.vys[5], 'deja de acelerar demasiado pronto');
  });

  // ── §4 · hay tope de subida, y sale del propio motor ────────────────────────────────────────────
  const paramsAgua = await p.evaluate(() => game.fisicaAgua());
  // La terminal REAL del motor no es a·τ, que es el limite continuo: el motor integra en pasos, con
  // v_{n+1} = (v_n + a·dt)·k y k = e^(−dt/τ), cuyo punto fijo es a·dt·k/(1−k). A 60 fps se separan un
  // 3,7 %, o sea mas que cualquier tolerancia honrada, y es el mismo desajuste discreto-vs-continuo
  // que ya mordio en test_hundirse.js §1. Lo que hay que perseguir es el numero del motor.
  const terminalDiscreta = (a, tau) => { const dt = 1 / 60, k = Math.exp(-dt / tau); return a * dt * k / (1 - k); };
  // …y a esa terminal se llega por una exponencial, asi que a los n frames queda un resto CALCULABLE:
  // |v0 − v*|·k^n. La tolerancia sale de ahi (con un 2× de margen) en vez de ser un porcentaje a ojo:
  // asi el test aprieta todo lo que la fisica permite y ni un pelo menos.
  const cola = (hueco, tau, n) => 2 * Math.abs(hueco) * Math.pow(Math.exp(-(1 / 60) / tau), n);
  test('§4 la velocidad de subida se estanca en la que sale de gravedad × (empuje−1) × arrastre', () => {
    // Sin tope, mantener pulsado en un lago hondo te dispararia. El tope no esta escrito a mano: lo da
    // el mismo rozamiento que frena la caida, y por eso la esperada se deriva de los parametros del
    // motor y no de un numero copiado aqui.
    const a = 22 * paramsAgua.gravedad * (paramsAgua.empuje - 1);
    const vT = terminalDiscreta(a, paramsAgua.arrastre);
    cerca(nada.vys[119], vT, cola(vT, paramsAgua.arrastre, 120), 'vy de subida a los 2 s');
    // Contra lo que ANUNCIA la consola (a·τ, el limite continuo) solo se puede pedir el 5 %: el 3,7 %
    // de diferencia es el paso discreto, no una mentira del tunable.
    cerca(nada.vys[119], paramsAgua.terminalSubida, a * paramsAgua.arrastre * 0.05, 'vy de subida frente a lo que anuncia game.fisicaAgua()');
  });
  test('§4 …y ya no crece: entre el segundo 1 y el 2 esta clavada', () => {
    cerca(nada.vys[119], nada.vys[59], Math.abs(nada.vys[119]) * 0.02, 'vy de subida al segundo 1 vs al 2');
  });

  // ── §5 · al SOLTAR se deja de subir: es un estado, no un disparo ────────────────────────────────
  const suelta = await tramo({ x: X, y: yDentro, z: Z, n: 240, tecla: true, soltarEn: 60 });
  test('§5 al soltar la tecla se vuelve a hundir', () => {
    assert(suelta.vys[59] > 0, 'no estaba subiendo cuando se solto');
    assert(suelta.vys[119] < 0, 'un segundo despues de soltar sigue subiendo a ' + suelta.vys[119].toFixed(3));
  });
  test('§5 …y acaba hundiendose a la terminal de REQ-FLUID6, sin resaca', () => {
    // Se mide a los TRES segundos de soltar, no a uno: el rozamiento disipa la subida de forma
    // exponencial (τ = arrastre = 0,22 s), asi que al segundo todavia queda un ~8 % de impulso viejo
    // restando. Eso no es una resaca del ticket, es la cola de la exponencial; a 3 s (≈13 τ) ya no
    // queda nada y se puede exigir la terminal de caida clavada, sin margen de porcentaje.
    const terminal = terminalDiscreta(22 * paramsAgua.gravedad, paramsAgua.arrastre);
    cerca(Math.abs(suelta.vys[239]), terminal, cola(suelta.vys[59] + terminal, paramsAgua.arrastre, 180),
          'vy tres segundos despues de soltar');
  });

  // ── §6 · mandan los PIES: asomando por la superficie ya no se nada ──────────────────────────────
  const superficie = await p.evaluate(() => {
    const Zn = window.__zona;
    for (let y = Zn.SUP + 1; y >= Zn.FONDO; y--)
      if (mcFisicaFluido(Zn.cx + 0.5, y + 0.5, Zn.cz + 0.5)) return y + 1;   // primera altura ya fuera
    return null;
  });
  test('§6 el pozo tiene una superficie localizable', () => {
    assert(superficie != null, 'no encontre superficie de agua en la columna del pozo');
  });
  const asomando = await tramo({ x: X, y: superficie + 0.4, z: Z, n: 6, tecla: true });
  test('§6 con los PIES fuera del agua, mantener la tecla ya no empuja: se cae', () => {
    // Es lo que deja SALIR a la orilla. Si mandase el ojo o el cuerpo entero, uno se quedaria flotando
    // pegado al borde sin poder subirse.
    assert(!asomando.dentro0, 'el punto de prueba seguia contando como dentro del agua');
    for (let i = 0; i < asomando.vys.length; i++)
      cerca(asomando.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con los pies fuera');
  });

  // ── §7 · con suelo debajo gana el salto de siempre ──────────────────────────────────────────────
  const enElFondo = await tramo({ x: X, y: zona.FONDO, z: Z, n: 2, tecla: true, enSuelo: true });
  test('§7 con los pies en el agua pero con suelo debajo, se SALTA como siempre', () => {
    // Un charco de un bloque se sigue saltando igual que antes del ticket: si el empuje se comiera
    // tambien este caso, andar por agua somera pasaria a sentirse como andar por pegamento.
    assert(enElFondo.dentro0, 'el fondo del pozo no cuenta como agua, el caso no prueba nada');
    cerca(enElFondo.vys[0], 8.0, 1e-9, 'vy del salto con suelo debajo dentro del agua');
  });

  // ── §8 · LAVA: tambien se nada, pero mas espesa ─────────────────────────────────────────────────
  await p.evaluate(() => {
    const Zn = window.__zona;
    for (let dx = 1; dx < Zn.LADO - 1; dx++) for (let dz = 1; dz < Zn.LADO - 1; dz++)
      for (let y = Zn.FONDO; y < Zn.SUP + 2 && y < mc.dim.y; y++) game.setVoxel(Zn.BX + dx, y, Zn.BZ + dz, 0);
  });
  await p.waitForTimeout(2500);
  const estadoLava = await llenar('lava');
  test('§8 el pozo tiene lava de verdad', () => {
    assert(estadoLava.hay, 'mcFisicaFluido no ve lava (clave = ' + estadoLava.clave + ')');
    assert(/lava/.test(String(estadoLava.clave)), 'la celda no es lava sino ' + estadoLava.clave);
  });
  const nadaLava = await tramo({ x: X, y: yDentro, z: Z, n: 120, tecla: true });
  test('§8 en lava tambien se sube manteniendo, pero mas despacio que en agua', () => {
    assert(nadaLava.vys[119] > 0, 'en lava no se sube: ' + nadaLava.vys[119].toFixed(3));
    assert(nadaLava.vys[119] < nada.vys[119], 'en lava se nada igual o mas rapido que en agua (' +
      nadaLava.vys[119].toFixed(2) + ' vs ' + nada.vys[119].toFixed(2) + '): la lava es mas espesa');
  });

  // ── §9 · el tunable de consola ──────────────────────────────────────────────────────────────────
  const conEmpuje = await p.evaluate(() => game.fisicaAgua({ empuje: 1 }));
  test('§9 game.fisicaAgua({empuje:1}) deja el empuje justo compensando la gravedad', () => {
    assert(conEmpuje.empuje === 1, 'no acepto empuje:1 (' + conEmpuje.empuje + ')');
    cerca(conEmpuje.terminalSubida, 0, 1e-9, 'la subida anunciada con empuje:1');
  });
  const reset = await p.evaluate(() => game.fisicaAgua('reset'));
  test('§9 …y «reset» devuelve el empuje de fabrica', () => {
    cerca(reset.empuje, paramsAgua.empuje, 1e-9, 'empuje tras reset');
  });

  // ── §10 · la valvula de escape sigue apagandolo todo ────────────────────────────────────────────
  await p.evaluate(() => { mc.sinFisicaFluido = true; });
  const apagado = await tramo({ x: X, y: yDentro, z: Z, n: 20, tecla: true });
  await p.evaluate(() => { mc.sinFisicaFluido = false; });
  test('§10 mc.sinFisicaFluido devuelve la fisica de antes de los tickets: no se nada', () => {
    for (let i = 0; i < apagado.vys.length; i++)
      cerca(apagado.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con la valvula echada');
  });

  // ── Deshacer ───────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    const Zn = window.__zona;
    for (let dx = 1; dx < Zn.LADO - 1; dx++) for (let dz = 1; dz < Zn.LADO - 1; dz++)
      for (let y = Zn.FONDO; y < Zn.SUP + 2 && y < mc.dim.y; y++) game.setVoxel(Zn.BX + dx, y, Zn.BZ + dz, 0);
    (window.__previos || []).reverse().forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id | 0));
  });

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
