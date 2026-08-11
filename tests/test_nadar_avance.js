// @area: fisica
// @necesita: servidor, playwright
// test_nadar_avance.js — REQ-FLUID9: dentro de un liquido, W avanza HACIA DONDE SE MIRA (cabeceo
// incluido) y Shift hunde mas deprisa. Contra el app.js DE VERDAD, no contra un calco de la fisica.
//
//   node test_nadar_avance.js [url]      por defecto http://localhost:8500/map/test
//
// Lo que de verdad protege, por orden de lo que costaria caro:
//   §1  FUERA del liquido no cambia NI UN FLOAT, ni con el cabeceo a plomo ni con Shift pulsado.
//   §3  mirando a plomo hacia abajo, W te hunde y NO te empuja en horizontal (se ACOTA el rumbo, no
//       se normaliza: normalizarlo devolveria la marcha entera con el cuerpo apuntando al fondo).
//   §6  con suelo debajo gana lo de fuera, o sea que vadear un charco se sigue andando en horizontal.
//   §7  la valvula mc.sinFisicaFluido devuelve la fisica de antes del ticket, exacta.
//
// El mundo del dueño NO se toca: se bloquean los POST de guardado y se deshacen los bloques al final.

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

  // ── El escenario: el pozo estanco de test_nadar.js, pero ANCHO ───────────────────────────────────
  // Aqui se mide desplazamiento horizontal, asi que el interior tiene que dar de si: con el pozo de 7
  // de lado (5 por dentro) el cuerpo llega a la pared antes de que la marcha se estabilice y lo que se
  // acaba midiendo es la colision, no el rumbo.
  const montaje = await p.evaluate(async () => {
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    const LADO = 11, ALTO = 18;
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

    mcResolveMat('agua');
    await new Promise(s => setTimeout(s, 1500));

    const HONDO = 12, FONDO = BY + 1, SUP = FONDO + HONDO;
    for (let dx = 0; dx < LADO; dx++) for (let dz = 0; dz < LADO; dz++) {
      poner(BX + dx, BY, BZ + dz, 'roca');
      const borde = (dx === 0 || dx === LADO - 1 || dz === 0 || dz === LADO - 1);
      if (borde) for (let y = FONDO; y < SUP; y++) poner(BX + dx, y, BZ + dz, 'roca');
    }
    window.__zona = { BX, BY, BZ, LADO, FONDO, SUP, HONDO, cx: BX + (LADO >> 1), cz: BZ + (LADO >> 1) };
    return { BX, BY, BZ, FONDO, SUP };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('pozo en ' + JSON.stringify(montaje));

  await p.evaluate(() => {
    const Z = window.__zona;
    for (let dx = 1; dx < Z.LADO - 1; dx++) for (let dz = 1; dz < Z.LADO - 1; dz++)
      for (let y = Z.FONDO; y < Z.SUP; y++) game.setVoxel(Z.BX + dx, y, Z.BZ + dz, 'agua');
  });
  await p.waitForTimeout(5000);

  // Un tramo de n frames llamando al mcUpdate DE VERDAD, con la vista y las teclas que se digan.
  // `pitch` va en radianes y POSITIVO ES MIRAR ARRIBA (es el convenio de mc.pitch en todo app.js).
  const tramo = (o) => p.evaluate((o) => {
    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), keys: Object.assign({}, mc.keys),
                   onGround: mc.onGround, scale: mc.scale, yaw: mc.yaw, pitch: mc.pitch };
    mc.scale = 1; mc.pos = [o.x, o.y, o.z]; mc.vel = [0, 0, 0];
    mc.yaw = 0; mc.pitch = o.pitch || 0;                    // yaw 0 ⇒ se avanza hacia −Z
    mc.keys = {}; (o.teclas || []).forEach(t => { mc.keys[t] = true; });
    mc.onGround = !!o.enSuelo;
    const atascado = mcCollides(o.x, o.y, o.z);
    const dentro0 = !!mcFisicaFluido(o.x, o.y, o.z);
    const pos = [], vys = [];
    for (let i = 0; i < o.n; i++) { mcUpdate(1 / 60); pos.push(mc.pos.slice()); vys.push(mc.vel[1]); }
    const fin = mc.pos.slice();
    Object.assign(mc, { vel: est0.vel, keys: est0.keys, onGround: est0.onGround,
                        scale: est0.scale, yaw: est0.yaw, pitch: est0.pitch });
    mc.pos = est0.pos;
    return { pos, vys, fin, atascado, dentro0,
             dx: fin[0] - o.x, dy: fin[1] - o.y, dz: fin[2] - o.z,
             horiz: Math.hypot(fin[0] - o.x, fin[2] - o.z) };
  }, o);

  const zona = await p.evaluate(() => window.__zona);
  const params = await p.evaluate(() => game.fisicaAgua());
  const velJugador = await p.evaluate(() => mc.speed);
  const X = zona.cx + 0.5, Z = zona.cz + 0.5;
  const yAire = zona.SUP + 5.0;          // aire limpio, muy por encima de la superficie
  const yAlto = zona.SUP - 2.5;          // dentro, con 9 bloques de agua por debajo para hundirse
  const yBajo = zona.FONDO + 2.0;        // dentro, con sitio de sobra por arriba
  const N = 15;                          // frames de los tramos horizontales (no se llega a la pared)
  const PLOMO = 1.55;                    // el tope de cabeceo de app.js

  const estado = await p.evaluate(() => {
    const Z = window.__zona, y = Z.SUP - 3;
    const f = mcFisicaFluido(Z.cx + 0.5, y + 0.5, Z.cz + 0.5);
    return { hay: !!f, clave: mc.blockKey[mc.grid[mcIdx(Z.cx, y, Z.cz)]] };
  });
  test('§0 el pozo tiene agua de verdad y la reconoce el motor', () => {
    assert(estado.hay, 'mcFisicaFluido no ve agua en el pozo (clave = ' + estado.clave + ')');
    assert(/agua/.test(String(estado.clave)), 'la celda no es agua sino ' + estado.clave);
  });

  // ── §1 · FUERA del liquido no cambia ni un float ────────────────────────────────────────────────
  // Es la condicion del dueño desde REQ-FLUID6 y el sitio donde un ticket de agua puede romper el
  // juego entero: si `mira` se colase fuera, mirar al suelo con W seria un acelerador de caida.
  const aireAbajo = await tramo({ x: X, y: yAire, z: Z, n: 30, teclas: ['w'], pitch: -PLOMO });
  const aireShift = await tramo({ x: X, y: yAire, z: Z, n: 30, teclas: ['w', 'shift'], pitch: -PLOMO });
  test('§1 en el aire, W mirando a plomo hacia abajo no acelera la caida', () => {
    assert(!aireAbajo.atascado, 'el punto de suelta no estaba libre');
    assert(!aireAbajo.dentro0, 'el punto de suelta ya estaba dentro de un liquido');
    for (let i = 0; i < aireAbajo.vys.length; i++)
      cerca(aireAbajo.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1));
  });
  test('§1 …y Shift en el aire tampoco hunde: sigue siendo caida limpia', () => {
    for (let i = 0; i < aireShift.vys.length; i++)
      cerca(aireShift.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con Shift');
  });

  // ── §2 · mirando al horizonte, W avanza en horizontal y NO toca la vertical ─────────────────────
  const horizonte = await tramo({ x: X, y: yAlto, z: Z, n: N, teclas: ['w'], pitch: 0 });
  const quieto = await tramo({ x: X, y: yAlto, z: Z, n: N, teclas: [], pitch: 0 });
  test('§2 dentro del agua, W mirando al horizonte avanza hacia donde se mira', () => {
    assert(horizonte.dentro0, 'el punto de partida no estaba dentro del agua');
    assert(!horizonte.atascado, 'el punto de partida estaba embutido en algo');
    // yaw 0 ⇒ el frente es −Z. Se exige el rumbo, no solo el bulto.
    assert(horizonte.dz < -0.4, 'no avanzo hacia donde miraba: dz = ' + horizonte.dz.toFixed(3));
    cerca(horizonte.dx, 0, 1e-6, 'se desvio de lado sin tocar A/D');
    cerca(horizonte.horiz, velJugador * N / 60, velJugador * N / 60 * 0.05, 'lo avanzado en 15 frames');
  });
  test('§2 …y con el cabeceo a cero la vertical es EXACTAMENTE la de hundirse sin teclas', () => {
    // La componente vertical sale de sen(cabeceo): a cero tiene que ser cero, no «casi». Si el rumbo
    // se colase en la vertical, REQ-FLUID6 dejaria de valer para el caso mas comun de todos.
    for (let i = 0; i < N; i++)
      cerca(horizonte.vys[i], quieto.vys[i], 1e-12, 'vy del frame ' + (i + 1) + ' con W vs sin teclas');
  });

  // ── §3 · mirando a plomo hacia abajo, W hunde y NO empuja en horizontal ─────────────────────────
  const aPlomo = await tramo({ x: X, y: yAlto, z: Z, n: N, teclas: ['w'], pitch: -PLOMO });
  test('§3 W mirando al fondo te SUMERGE', () => {
    assert(aPlomo.dy < quieto.dy - 0.2, 'no se hunde mas que a la deriva (' +
      aPlomo.dy.toFixed(3) + ' vs ' + quieto.dy.toFixed(3) + ')');
  });
  test('§3 …y casi no te mueve en horizontal: el rumbo se ACOTA, no se normaliza', () => {
    // Normalizando el rumbo, mirar a plomo devolveria la marcha horizontal entera con el cuerpo
    // apuntando al fondo. Lo que queda tiene que ser cos(1,55) = 2 % de la marcha y nada mas.
    const tope = velJugador * N / 60 * Math.cos(PLOMO) * 1.2;
    assert(aPlomo.horiz <= tope, 'avanzo ' + aPlomo.horiz.toFixed(3) +
      ' en horizontal mirando a plomo (tope ' + tope.toFixed(3) + ')');
  });

  // ── §4 · mirando arriba, W te saca ──────────────────────────────────────────────────────────────
  const arriba = await tramo({ x: X, y: yBajo, z: Z, n: 60, teclas: ['w'], pitch: PLOMO });
  const derivaBajo = await tramo({ x: X, y: yBajo, z: Z, n: 60, teclas: [], pitch: 0 });
  test('§4 W mirando arriba te sube, sin tocar la tecla de salto', () => {
    assert(arriba.dentro0, 'el punto de partida no estaba dentro del agua');
    assert(arriba.dy > 0.3, 'no subio: dy = ' + arriba.dy.toFixed(3));
    assert(derivaBajo.dy < 0, 'sin teclas no se hundia, el contraste no prueba nada');
  });
  test('§4 …y la subida es SOSTENIDA: no hay ni un frame de parabola', () => {
    for (let i = 1; i < arriba.pos.length; i++)
      assert(arriba.pos[i][1] >= arriba.pos[i - 1][1] - 1e-12, 'el frame ' + i + ' bajo: eso es un impulso, no nadar');
  });

  // ── §5 · Shift hunde mas deprisa ────────────────────────────────────────────────────────────────
  const conShift = await tramo({ x: X, y: yAlto, z: Z, n: 40, teclas: ['shift'], pitch: 0 });
  const sinShift = await tramo({ x: X, y: yAlto, z: Z, n: 40, teclas: [], pitch: 0 });
  test('§5 Shift dentro del agua hunde mas deprisa que dejarse caer', () => {
    assert(conShift.dy < sinShift.dy - 0.5, 'con Shift bajo ' + conShift.dy.toFixed(3) +
      ' y sin el ' + sinShift.dy.toFixed(3) + ': no se nota');
  });
  test('§5 …y la velocidad de hundirse sale de las perillas, no de un numero a mano', () => {
    // Bajar es el mismo empuje del cuerpo con el signo cambiado, asi que la gravedad SUMA en vez de
    // restar: a = −(empuje+1)·g_dentro. Y la terminal del motor es la DISCRETA (a·dt·k/(1−k)), que a
    // 60 fps se separa un 3,7 % de a·τ — el error que mordio cinco veces en REQ-FLUID6/7.
    // Pero a los 40 frames TODAVIA no se ha llegado a ella: son 3,03·τ, o sea el 95,2 %. Se compara
    // contra el termino n-esimo exacto (·(1−kⁿ)), que es lo unico que permite la tolerancia fina;
    // exigir la asintota aqui es el mismo error de escribir el numero a ojo, solo que del otro lado.
    const a = -22 * params.gravedad * (params.empuje + 1);
    const dt = 1 / 60, k = Math.exp(-dt / params.arrastre);
    const vT = a * dt * k / (1 - k);
    const v40 = vT * (1 - Math.pow(k, 40));
    cerca(conShift.vys[39], v40, Math.abs(v40) * 0.02, 'vy de hundirse con Shift a los 40 frames');
  });
  // `mira` y la tecla de nadar comparten el mismo empuje y se acotan juntos en mcCaidaPaso: pulsar
  // salto y Shift a la vez tiene que dar exactamente lo mismo que no pulsar ninguno de los dos.
  const saltoYShift = await tramo({ x: X, y: yAlto, z: Z, n: 30, teclas: [' ', 'shift'], pitch: 0 });
  const niUnaNiOtra = await tramo({ x: X, y: yAlto, z: Z, n: 30, teclas: [], pitch: 0 });
  test('§5 salto + Shift a la vez = ni subir ni hundirse de mas', () => {
    for (let i = 0; i < 30; i++)
      cerca(saltoYShift.vys[i], niUnaNiOtra.vys[i], 1e-12, 'vy del frame ' + (i + 1) + ' con salto y Shift');
  });

  // ── §6 · con suelo debajo gana lo de fuera ──────────────────────────────────────────────────────
  const vadeando = await tramo({ x: X, y: zona.FONDO, z: Z, n: N, teclas: ['w'], pitch: -PLOMO, enSuelo: true });
  test('§6 con los pies en el agua pero con suelo debajo, W anda en HORIZONTAL como siempre', () => {
    // Vadear un charco mirando al suelo no puede convertirse en bucear. Es la misma segunda mitad que
    // protege REQ-FLUID7 §7, y la que impide que andar por agua somera se sienta como pegamento.
    assert(vadeando.dentro0, 'el fondo del pozo no cuenta como agua, el caso no prueba nada');
    assert(vadeando.horiz > velJugador * N / 60 * 0.8, 'apenas avanzo andando por el fondo: ' +
      vadeando.horiz.toFixed(3));
  });

  // ── §7 · la valvula lo apaga entero ─────────────────────────────────────────────────────────────
  await p.evaluate(() => { mc.sinFisicaFluido = true; });
  const apagadoPlomo = await tramo({ x: X, y: yAlto, z: Z, n: 20, teclas: ['w'], pitch: -PLOMO });
  const apagadoShift = await tramo({ x: X, y: yAlto, z: Z, n: 20, teclas: ['shift'], pitch: 0 });
  await p.evaluate(() => { mc.sinFisicaFluido = false; });
  test('§7 mc.sinFisicaFluido devuelve la fisica de antes: ni la vista ni Shift hunden', () => {
    for (let i = 0; i < 20; i++) {
      cerca(apagadoPlomo.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' mirando a plomo');
      cerca(apagadoShift.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1) + ' con Shift');
    }
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
