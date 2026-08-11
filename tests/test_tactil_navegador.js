// @area: general
// @necesita: servidor, playwright
// test_tactil_navegador.js — los controles táctiles del Mundo, en un Chromium con pantalla táctil.
//
// Esto NO se puede probar headless a secas: lo que se comprueba es que un dedo mueve al jugador de
// verdad (mc.pos cambia) y que el arrastre gira la cámara, y eso pasa por el bucle de mcUpdate y por
// la colisión reales. Se lanzan PointerEvent con pointerType 'touch', que es lo que manda un móvil.
//
//   node test_tactil_navegador.js [url]      por defecto http://localhost:8500/map/cubes
//
// El POST a /api/mundo se bloquea: el mundo del dueño no se toca.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/cubes';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  // Un móvil de verdad: pantalla táctil y 390 px de ancho (el viewport que hay que respetar).
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST'
      && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes')))
      ? Promise.resolve(new Response('{}', { status: 200 })) : f(u, o);
  });
  await p.goto(URL, { timeout: 90000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.structures', { timeout: 180000 });
  await p.waitForTimeout(4000);

  // Un dedo: PointerEvent con pointerType 'touch', que es lo que distingue el código del ratón.
  await p.evaluate(() => {
    window.__dedo = (sel, tipo, x, y, id) => {
      const el = document.querySelector(sel), r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(tipo, { pointerId: id || 7, pointerType: 'touch', isPrimary: true,
        bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y }));
    };
  });

  const visible = await p.evaluate(() => ({
    activo: mc.active, oculto: document.querySelector('#mc-touch').hidden,
    hayStick: !!document.querySelector('#mc-stick'), haySalto: !!document.querySelector('#mc-tjump'),
    // El contenedor NO puede comerse los toques: la hotbar y la zona de mirar están debajo.
    pe: getComputedStyle(document.querySelector('#mc-touch')).pointerEvents,
    peStick: getComputedStyle(document.querySelector('#mc-stick')).pointerEvents
  }));
  console.log('\n§1 los mandos aparecen en una pantalla táctil');
  test('el Mundo está activo', () => assert(visible.activo, 'el Mundo no arrancó'));
  test('#mc-touch visible', () => assert(!visible.oculto, 'los mandos siguen ocultos en un móvil'));
  test('joystick y botón de salto en el DOM', () => assert(visible.hayStick && visible.haySalto, 'falta algún mando'));
  test('el contenedor no intercepta toques', () => assert(visible.pe === 'none', 'pointer-events=' + visible.pe));
  test('el joystick sí los intercepta', () => assert(visible.peStick === 'auto', 'pointer-events=' + visible.peStick));

  // ── Andar ──────────────────────────────────────────────────────────────────────────────────
  const andar = await p.evaluate(async (nada) => {
    // Un claro con sitio para dar un paso hacia -Z: si el jugador arranca pegado a una pared, la
    // colisión le frena y el test culparía al joystick de algo que hace bien.
    const x0 = Math.round(mc.pos[0]), z0 = Math.round(mc.pos[2]);
    let claro = null;
    for (let r = 0; r <= 30 && !claro; r++) for (let a = 0; a < 12 && !claro; a++) {
      const x = x0 + Math.round(Math.cos(a * Math.PI / 6) * r), z = z0 + Math.round(Math.sin(a * Math.PI / 6) * r);
      const sy = mcSurfaceY(x, z); if (sy < 0) continue;
      let libre = true;                        // 4 bloques de aire hacia -Z y 2 de alto: sitio para andar
      for (let dz = 0; dz <= 4 && libre; dz++) for (let dy = 1; dy <= 2; dy++)
        if (mcInside(x, sy + dy, z - dz) && mc.grid[mcIdx(x, sy + dy, z - dz)]) { libre = false; break; }
      if (libre) claro = [x, sy + 1, z];
    }
    if (claro) { mc.pos[0] = claro[0] + 0.5; mc.pos[1] = claro[1]; mc.pos[2] = claro[2] + 0.5; }
    mc.yaw = 0; mc.pitch = 0; mc.vel = [0, 0, 0];
    for (let i = 0; i < 30; i++) mcUpdate(1 / 60);        // que asiente en el suelo antes de medir
    const r = document.querySelector('#mc-stick').getBoundingClientRect(), c = r.width / 2;
    const antes = mc.pos.slice();
    __dedo('#mc-stick', 'pointerdown', c, c - 45);            // pulgar ARRIBA = adelante
    const teclas = { w: !!mc.keys['w'], s: !!mc.keys['s'], a: !!mc.keys['a'], d: !!mc.keys['d'] };
    for (let i = 0; i < 60; i++) mcUpdate(1 / 60);
    const tras = mc.pos.slice();
    __dedo('#mc-stick', 'pointerup', c, c - 45);
    const soltado = { w: !!mc.keys['w'], s: !!mc.keys['s'], a: !!mc.keys['a'], d: !!mc.keys['d'] };
    for (let i = 0; i < 60; i++) mcUpdate(1 / 60);
    const parado = mc.pos.slice();
    // Diagonal: pulgar arriba-derecha tiene que encender DOS teclas, como un teclado.
    __dedo('#mc-stick', 'pointerdown', c + 32, c - 32);
    const diag = { w: !!mc.keys['w'], d: !!mc.keys['d'], a: !!mc.keys['a'], s: !!mc.keys['s'] };
    __dedo('#mc-stick', 'pointerup', c + 32, c - 32);
    // Zona muerta: el pulgar apoyado en el centro no debe hacerte andar.
    __dedo('#mc-stick', 'pointerdown', c + 3, c + 2);
    const muerta = !!(mc.keys['w'] || mc.keys['a'] || mc.keys['s'] || mc.keys['d']);
    __dedo('#mc-stick', 'pointerup', c + 3, c + 2);
    return { teclas, soltado, diag, muerta,
             avance: Math.hypot(tras[0] - antes[0], tras[2] - antes[2]),
             deriva: Math.hypot(parado[0] - tras[0], parado[2] - tras[2]),
             dz: tras[2] - antes[2] };
  });
  console.log('\n§2 el joystick anda');
  test('pulgar arriba enciende W y solo W', () => assert(andar.teclas.w && !andar.teclas.s && !andar.teclas.a && !andar.teclas.d,
    'teclas=' + JSON.stringify(andar.teclas)));
  test('el jugador se mueve de verdad', () => assert(andar.avance > 0.5, 'avanzó ' + andar.avance.toFixed(2) + ' bloques en 1 s'));
  test('adelante es -Z con yaw 0', () => assert(andar.dz < 0, 'dz=' + andar.dz.toFixed(2)));
  test('soltar apaga las teclas', () => assert(!andar.soltado.w && !andar.soltado.a && !andar.soltado.s && !andar.soltado.d,
    'quedaron pulsadas: ' + JSON.stringify(andar.soltado)));
  test('soltar para al jugador', () => assert(andar.deriva < 0.35, 'siguió andando ' + andar.deriva.toFixed(2) + ' bloques'));
  test('diagonal = dos teclas', () => assert(andar.diag.w && andar.diag.d && !andar.diag.a && !andar.diag.s,
    'diag=' + JSON.stringify(andar.diag)));
  test('zona muerta en el centro', () => assert(!andar.muerta, 'el centro del joystick ya hace andar'));

  // ── Mirar ──────────────────────────────────────────────────────────────────────────────────
  const mirar = await p.evaluate(() => {
    mc.yaw = 0; mc.pitch = 0;
    const w = mc.canvas.clientWidth, h = mc.canvas.clientHeight;
    __dedo('#mc-canvas', 'pointerdown', w / 2, h / 2, 9);
    __dedo('#mc-canvas', 'pointermove', w / 2 + 100, h / 2, 9);
    const yaw = mc.yaw;
    __dedo('#mc-canvas', 'pointermove', w / 2 + 100, h / 2 + 80, 9);
    const pitch = mc.pitch;
    __dedo('#mc-canvas', 'pointerup', w / 2 + 100, h / 2 + 80, 9);
    const yaw2 = mc.yaw;
    __dedo('#mc-canvas', 'pointermove', w / 2 + 300, h / 2, 9);   // dedo levantado: no debe girar
    const trasSoltar = mc.yaw;
    // Un tope: mirar al cielo hasta pasarse no debe poner la cámara del revés.
    __dedo('#mc-canvas', 'pointerdown', w / 2, h / 2, 9);
    for (let i = 0; i < 40; i++) __dedo('#mc-canvas', 'pointermove', w / 2, h / 2 - 60 * (i + 1), 9);
    const tope = mc.pitch;
    __dedo('#mc-canvas', 'pointerup', w / 2, h / 2, 9);
    // Y el ratón NO debe entrar por aquí (ya tiene su pointer-lock; si no, giraría el doble).
    mc.yaw = 0;
    const el = document.querySelector('#mc-canvas'), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, pointerType: 'mouse', bubbles: true,
      clientX: r.left + 10, clientY: r.top + 10 }));
    el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: 'mouse', bubbles: true,
      clientX: r.left + 200, clientY: r.top + 10 }));
    return { yaw, pitch, yaw2, trasSoltar, tope, raton: mc.yaw };
  });
  console.log('\n§3 el arrastre mira');
  test('arrastrar a la derecha gira la cámara', () => assert(Math.abs(mirar.yaw) > 0.2, 'yaw=' + mirar.yaw.toFixed(3)));
  test('arrastrar a la derecha mira a la derecha', () => assert(mirar.yaw < 0, 'yaw=' + mirar.yaw.toFixed(3) + ' (el ratón usa el mismo signo)'));
  test('arrastrar abajo mira abajo', () => assert(mirar.pitch < -0.1, 'pitch=' + mirar.pitch.toFixed(3)));
  test('levantar el dedo suelta la cámara', () => assert(mirar.trasSoltar === mirar.yaw2, 'siguió girando sin dedo'));
  test('el pitch tiene tope (no da la voltereta)', () => assert(mirar.tope <= 1.5501 && mirar.tope > 1.4, 'pitch=' + mirar.tope.toFixed(3)));
  test('el ratón no entra por la vía táctil', () => assert(mirar.raton === 0, 'un ratón giraría dos veces: yaw=' + mirar.raton));

  // ── Saltar ─────────────────────────────────────────────────────────────────────────────────
  const salto = await p.evaluate(() => {
    for (let i = 0; i < 90; i++) mcUpdate(1 / 60);       // que caiga al suelo antes de nada
    const y0 = mc.pos[1];
    __dedo('#mc-tjump', 'pointerdown', 30, 30, 5);
    const pulsado = !!mc.keys[' '];
    for (let i = 0; i < 14; i++) mcUpdate(1 / 60);
    const subio = mc.pos[1] - y0;
    __dedo('#mc-tjump', 'pointerup', 30, 30, 5);
    return { pulsado, suelto: !!mc.keys[' '], subio };
  });
  console.log('\n§4 el botón de salto');
  test('pulsar enciende la barra espaciadora', () => assert(salto.pulsado, 'mc.keys[" "] no se encendió'));
  test('el jugador sube', () => assert(salto.subio > 0.15, 'subió ' + salto.subio.toFixed(2) + ' bloques'));
  test('soltar la apaga', () => assert(!salto.suelto, 'se quedó saltando para siempre'));

  // ── Dedos que se pierden ───────────────────────────────────────────────────────────────────
  // El fallo que reportó el dueño: «a veces solo avanza y no puedo girar la cámara». Son los dos
  // síntomas de UN `pointerup` que no llegó al mando. Cada caso de aquí es una forma de perderlo.
  const perdidos = await p.evaluate(() => {
    const cv = document.querySelector('#mc-canvas'), r = cv.getBoundingClientRect();
    const anda = () => !!(mc.keys['w'] || mc.keys['a'] || mc.keys['s'] || mc.keys['d']);
    const suelta = (tipo, id, el) => (el || cv).dispatchEvent(new PointerEvent(tipo,
      { pointerId: id, pointerType: 'touch', bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
    const out = {};

    // 1) El dedo se sale del aro y levanta sobre el canvas: el `up` no le llega al joystick.
    __dedo('#mc-stick', 'pointerdown', 59, 14, 21);
    out.andando1 = anda();
    suelta('pointerup', 21);
    out.tras1 = anda();

    // 2) El navegador se queda el gesto (una llamada, un gesto del sistema): pointercancel suelto.
    __dedo('#mc-stick', 'pointerdown', 59, 14, 22);
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 22, pointerType: 'touch', bubbles: true }));
    out.tras2 = anda();

    // 3) Cambias de app y vuelves: no llega ningún evento de fin.
    __dedo('#mc-stick', 'pointerdown', 59, 14, 23);
    __dedo('#mc-tjump', 'pointerdown', 30, 30, 24);
    window.dispatchEvent(new Event('blur'));
    out.tras3 = anda(); out.salto3 = !!mc.keys[' '];

    // 4) Y lo otro: un dedo de MIRAR que se queda colgado no puede dejar la cámara muerta para
    //    siempre. Sin levantarlo, el siguiente toque tiene que volver a girar.
    mc.yaw = 0;
    __dedo('#mc-canvas', 'pointerdown', 100, 400, 31);        // este se «pierde» (nunca levanta)
    __dedo('#mc-canvas', 'pointermove', 160, 400, 31);
    const tras31 = mc.yaw;
    __dedo('#mc-canvas', 'pointerdown', 100, 400, 32);        // dedo nuevo
    __dedo('#mc-canvas', 'pointermove', 200, 400, 32);
    out.giroNuevo = Math.abs(mc.yaw - tras31);

    // 5) El botón de salto soltado fuera del botón.
    __dedo('#mc-tjump', 'pointerdown', 30, 30, 25);
    suelta('pointerup', 25);
    out.salto5 = !!mc.keys[' '];
    mcTouchSuelta();
    return out;
  });
  console.log('\n§5 dedos que se pierden (el fallo del «solo avanza»)');
  test('el joystick andaba antes de soltar', () => assert(perdidos.andando1, 'el caso no se montó bien'));
  test('un up fuera del joystick te para igual', () => assert(!perdidos.tras1, 'se quedó andando solo'));
  test('pointercancel suelto te para', () => assert(!perdidos.tras2, 'se quedó andando solo'));
  test('cambiar de app suelta joystick y salto', () => assert(!perdidos.tras3 && !perdidos.salto3,
    'anda=' + perdidos.tras3 + ' salta=' + perdidos.salto3));
  test('un dedo colgado NO mata la cámara', () => assert(perdidos.giroNuevo > 0.2,
    'el toque siguiente giró ' + perdidos.giroNuevo.toFixed(3) + ' rad'));
  test('el salto se apaga soltando fuera del botón', () => assert(!perdidos.salto5, 'se quedó saltando'));

  // ── Al cerrar el Mundo ─────────────────────────────────────────────────────────────────────
  const cierre = await p.evaluate(() => {
    __dedo('#mc-stick', 'pointerdown', 59, 14, 7);       // dejar el pulgar puesto y salir
    closeWorld();
    return { oculto: document.querySelector('#mc-touch').hidden,
             teclas: !!(mc.keys['w'] || mc.keys['a'] || mc.keys['s'] || mc.keys['d']) };
  });
  console.log('\n§6 al salir del Mundo');
  test('los mandos se esconden', () => assert(cierre.oculto, 'siguen puestos sobre el editor'));
  test('no queda ninguna tecla pulsada', () => assert(!cierre.teclas, 'el jugador vuelve andando solo'));

  if (errores.length) { console.log('\nERRORES DE CONSOLA:'); errores.slice(0, 6).forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();