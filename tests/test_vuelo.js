// @area: fisica
// @necesita: servidor, playwright
// test_vuelo.js — REQ-FLY1: modo vuelo con la tecla F (y la foto a Alt+F). Contra el app.js DE VERDAD.
//
//   node tests/test_vuelo.js [url]      por defecto http://localhost:8500/map/test
//
// Se mide llamando al mcUpdate del motor frame a frame, como test_hundirse.js: una constante de la
// tabla se puede cambiar sin que la fisica la lea, y eso es justo lo que hay que cazar.
//
// El caso que de verdad protege es el §1: SIN volar no cambia ni un float. Volar es un modo nuevo, y
// una regresion en la caida de siempre seria mucho peor que no tener el ticket.
//
// El pedido literal del dueño fue «el movimiento sería como estar dentro de un fluido pero sin caida
// hacia abajo (sin gravedad)», asi que el §2 es el corazon: con las manos quietas, la altura NO se
// mueve. Una deriva de 0,1 u/s arruina el sobrevuelo de la intro (REQ-INTRO1) y no se veria a ojo.
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
  await p.waitForFunction('window.game && typeof game.volar !== "undefined"', null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  // ── El escenario: un hueco de aire limpio con una plataforma debajo ────────────────────────────
  // La plataforma no es decorado: el §4 comprueba que volar NO atraviesa paredes, y sin algo solido
  // contra lo que chocar ese test daria verde con las colisiones rotas.
  const montaje = await p.evaluate(async () => {
    const libre = (x, y, z, alto) => {
      for (let dy = 0; dy < alto; dy++) if (!mcInside(x, y + dy, z) || mc.grid[mcIdx(x, y + dy, z)]) return false;
      return true;
    };
    const ALTO = 14;
    let base = null;
    for (let y = mc.dim.y - ALTO - 2; y > 3 && !base; y -= 2)
      for (let x = 3; x < mc.dim.x - 3 && !base; x += 3)
        for (let z = 3; z < mc.dim.z - 3 && !base; z += 3) {
          let hueco = true;
          for (let dx = -1; dx <= 1 && hueco; dx++) for (let dz = -1; dz <= 1 && hueco; dz++)
            if (!libre(x + dx, y, z + dz, ALTO)) hueco = false;
          if (hueco) base = [x, y, z];
        }
    if (!base) return { error: 'no encontre un hueco de 3x' + ALTO + 'x3 de aire' };

    const [BX, BY, BZ] = base;
    const previos = [];
    window.__previos = previos;
    mcResolveMat('roca');
    await new Promise(s => setTimeout(s, 1200));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      previos.push([BX + dx, BY, BZ + dz, mc.grid[mcIdx(BX + dx, BY, BZ + dz)]]);
      game.setVoxel(BX + dx, BY, BZ + dz, 'roca');       // suelo de la plataforma
    }
    window.__zona = { BX, BY, BZ, suelo: BY, aire: BY + 1 };
    return { BX, BY, BZ, dim: [mc.dim.x, mc.dim.y, mc.dim.z] };
  });
  if (montaje.error) { console.log('ABORTA: ' + montaje.error); await b.close(); process.exit(1); }
  console.log('plataforma en ' + JSON.stringify(montaje));

  // n frames de simulacion desde (x,y,z) con unas teclas dadas. Devuelve la altura y la vy frame a
  // frame. Se restaura TODO el estado del jugador: el mapa del dueño se queda como estaba.
  const volar = (opts) => p.evaluate((o) => {
    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), keys: Object.assign({}, mc.keys),
                   onGround: mc.onGround, scale: mc.scale, yaw: mc.yaw, pitch: mc.pitch,
                   volar: mc.volar, fantasma: mc.fantasma };
    mc.scale = 1; mc.pos = [o.x, o.y, o.z]; mc.vel = [0, 0, 0]; mc.onGround = false;
    mc.yaw = 0; mc.pitch = o.pitch || 0;
    mc.keys = {}; (o.teclas || []).forEach(t => { mc.keys[t] = true; });
    mc.volar = !!o.volar; mc.fantasma = !!o.fantasma;
    const atascado = mcCollides(o.x, o.y, o.z);
    const ys = [], vys = [], xs = [];
    for (let i = 0; i < o.n; i++) { mcUpdate(1 / 60); ys.push(mc.pos[1]); vys.push(mc.vel[1]); xs.push(mc.pos[0]); }
    Object.assign(mc, { vel: est0.vel, keys: est0.keys, onGround: est0.onGround, scale: est0.scale,
                        yaw: est0.yaw, pitch: est0.pitch, volar: est0.volar, fantasma: est0.fantasma });
    mc.pos = est0.pos;
    return { ys, vys, xs, atascado };
  }, opts);

  const zona = await p.evaluate(() => window.__zona);
  const X = zona.BX + 0.5, Z = zona.BZ + 0.5;
  const yAlto = zona.aire + 8.0;             // bien despegado del suelo de la plataforma

  // ── §1 · SIN volar no cambia NADA ───────────────────────────────────────────────────────────────
  // Contra la formula exacta de antes del ticket: v_n = -22·n/60. Si la rama nueva se colara con el
  // vuelo apagado, o si mcCaidaPaso dejara de llamarse, esto se cae.
  const normal = await volar({ x: X, y: yAlto, z: Z, n: 40, volar: false });
  test('§1 con el vuelo APAGADO la gravedad sigue siendo 22 bloques/s², clavada', () => {
    assert(!normal.atascado, 'el punto de suelta no estaba libre');
    for (let i = 0; i < normal.vys.length; i++)
      cerca(normal.vys[i], -22 * (i + 1) / 60, 1e-9, 'vy del frame ' + (i + 1));
  });

  // ── §2 · volando y con las manos quietas, la altura NO se mueve ────────────────────────────────
  const quieto = await volar({ x: X, y: yAlto, z: Z, n: 60, volar: true });
  test('§2 volando sin tocar nada, la altura no cambia ni un float en 60 frames', () => {
    for (let i = 0; i < quieto.ys.length; i++)
      cerca(quieto.ys[i], yAlto, 1e-9, 'altura del frame ' + (i + 1));
  });
  test('§2 …y la velocidad vertical es CERO, no una terminal pequeña', () => {
    // Es la diferencia entre «sin gravedad» y «con una gravedad muy floja»: lo segundo se ve igual
    // en un segundo y hunde la camara 40 bloques en el minuto que dura un sobrevuelo.
    quieto.vys.forEach((v, i) => cerca(v, 0, 1e-12, 'vy del frame ' + (i + 1)));
  });

  // ── §3 · Espacio sube y Shift baja, PROPORCIONAL a playerSpeed (REQ-FLY2) ───────────────────────
  // La vertical de vuelo va a `playerSpeed · √scale · volarVel` (volarVel es un MULTIPLICADOR, defecto 1),
  // igual que la horizontal. Antes usaba el fijo `volarVel=6` u/s y subir/bajar iba mucho más lento al
  // subir la velocidad. El test corre con scale=1, así que la vertical esperada = mc.speed · mc.volarVel.
  const vel = await p.evaluate(() => mc.speed * mc.volarVel);
  const sube = await volar({ x: X, y: yAlto, z: Z, n: 60, volar: true, teclas: [' '] });
  const baja = await volar({ x: X, y: yAlto, z: Z, n: 60, volar: true, teclas: ['shift'] });
  test('§3 Espacio sube proporcional a playerSpeed', () => {
    cerca(sube.vys[0], vel, 1e-9, 'vy con Espacio');
    cerca(sube.ys[59] - yAlto, vel, vel * 0.02, 'bloques subidos en 1 s');
  });
  test('§3 Shift baja igual (y no frena la marcha a la mitad como al andar)', () => {
    cerca(baja.vys[0], -vel, 1e-9, 'vy con Shift');
  });
  // El corazón de REQ-FLY2: subir playerSpeed acelera la vertical en la MISMA proporción que la horizontal.
  const propor = await p.evaluate(async () => {
    const sp0 = mc.speed, vv0 = mc.volarVel, pos0 = mc.pos.slice(), vel0 = mc.vel.slice(), sc0 = mc.scale, k0 = mc.keys;
    mc.scale = 1; mc.volarVel = 1; mc.volar = true; mc.keys = { ' ': true };
    mc.speed = 5;  mc.pos = [pos0[0], 40, pos0[2]]; mc.vel = [0, 0, 0]; mcUpdate(1 / 60); const vyLento = mc.vel[1];
    mc.speed = 20; mc.pos = [pos0[0], 40, pos0[2]]; mc.vel = [0, 0, 0]; mcUpdate(1 / 60); const vyRapido = mc.vel[1];
    mc.speed = sp0; mc.volarVel = vv0; mc.pos = pos0; mc.vel = vel0; mc.scale = sc0; mc.keys = k0; mc.volar = false;
    return { vyLento, vyRapido, razon: vyRapido / vyLento };
  });
  test('§3 subir playerSpeed acelera la vertical en la misma proporción (×4 con speed 5→20)', () =>
    cerca(propor.razon, 4, 0.01, 'razón vertical rápido/lento (' + propor.vyLento.toFixed(2) + ' → ' + propor.vyRapido.toFixed(2) + ')'));
  // El tope esta en ±1 antes de multiplicar: sin el, mirar arriba + Espacio daria el doble de
  // velocidad que Espacio solo, y la camara de la intro pegaria tirones.
  const ambos = await volar({ x: X, y: yAlto, z: Z, n: 10, volar: true, teclas: [' ', 'shift'] });
  test('§3 Espacio + Shift a la vez = quieto', () => cerca(ambos.vys[0], 0, 1e-9, 'vy con los dos'));

  // ── §4 · volar NO atraviesa el terreno; fantasma SI ────────────────────────────────────────────
  const contra = await volar({ x: X, y: zona.aire + 3.0, z: Z, n: 120, volar: true, teclas: ['shift'] });
  test('§4 volando hacia abajo se choca con la plataforma: volar no es noclip', () => {
    // El margen de arriba no es holgura de escritura: mcCollides deja un epsilon sobre el bloque, asi
    // que apoyado se queda en zona.aire + ~0,1. Lo que se comprueba es que PARA, no el decimal.
    const fin = contra.ys[contra.ys.length - 1];
    assert(fin >= zona.aire - 0.01 && fin <= zona.aire + 0.2,
      'altura final ' + fin.toFixed(3) + ', esperada apoyada en la plataforma (' + zona.aire + ')');
  });
  const atraviesa = await volar({ x: X, y: zona.aire + 3.0, z: Z, n: 120, volar: true, fantasma: true, teclas: ['shift'] });
  test('§4 con game.fantasma se atraviesa la plataforma', () => {
    assert(atraviesa.ys[atraviesa.ys.length - 1] < zona.aire - 1,
      'con fantasma sigue frenando en ' + atraviesa.ys[atraviesa.ys.length - 1].toFixed(2));
  });
  const fantasmaSinVolar = await volar({ x: X, y: zona.aire + 3.0, z: Z, n: 120, volar: false, fantasma: true });
  test('§4 fantasma A PIE no existe: sin volar, el suelo sigue parando la caida', () => {
    // Si el noclip valiera con el vuelo apagado, el jugador se caeria del mundo al activarlo por error.
    assert(fantasmaSinVolar.ys[fantasmaSinVolar.ys.length - 1] > zona.suelo,
      'ha atravesado el suelo sin estar volando');
  });

  // ── §5 · la API ────────────────────────────────────────────────────────────────────────────────
  const api = await p.evaluate(() => {
    const antes = mc.volar;
    const r = {};
    r.lectura = !!game.volar.valueOf();
    r.enciende = game.volar(true);
    r.conmuta = game.volar();
    game.volar(true); mc.vel[1] = -7;
    r.apagaDejaVelACero = (game.volar(false), mc.vel[1]);
    game.volar(true); game.fantasma(true);
    r.apagarVolarQuitaFantasma = (game.volar(false), mc.fantasma);
    game.volarVel = 1e6; r.tope = mc.volarVel;
    game.volarVel = 1;
    mc.volar = antes;
    return r;
  });
  test('§5 game.volar vale como lectura, como orden y como conmutador', () => {
    assert(api.lectura === false, 'el vuelo no arranca apagado');
    assert(api.enciende === true, 'game.volar(true) no enciende');
    assert(api.conmuta === false, 'game.volar() no conmuta');
  });
  test('§5 apagar el vuelo deja la vertical a cero (la gravedad recoge desde parado)', () =>
    cerca(api.apagaDejaVelACero, 0, 1e-9, 'vel[1] tras game.volar(false)'));
  test('§5 apagar el vuelo apaga tambien el fantasma', () =>
    assert(api.apagarVolarQuitaFantasma === false, 'el fantasma sobrevive al vuelo'));
  test('§5 game.volarVel (multiplicador) esta acotada', () => assert(api.tope <= 10, 'volarVel acepta ' + api.tope));

  // ── §6 · las teclas: F vuela, Alt+F fotografia ─────────────────────────────────────────────────
  const teclas = await p.evaluate(() => {
    const orig = window.mcFoto;
    let fotos = 0;
    window.mcFoto = () => { fotos++; };
    const antes = mc.volar;
    mc.volar = false;
    const pulsa = (o) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: 'f', code: 'KeyF', bubbles: true }, o)));
    pulsa({});                       // F
    const trasF = { volar: mc.volar, fotos };
    pulsa({ altKey: true });         // Alt+F  (e.code, que con Alt e.key llega compuesto en Mac)
    const trasAltF = { volar: mc.volar, fotos };
    window.mcFoto = orig;
    mc.volar = antes;
    return { trasF, trasAltF };
  });
  test('§6 F sola enciende el vuelo y NO saca foto', () => {
    assert(teclas.trasF.volar === true, 'F no ha encendido el vuelo');
    assert(teclas.trasF.fotos === 0, 'F ha sacado una foto');
  });
  test('§6 Alt+F saca la foto y NO toca el vuelo', () => {
    assert(teclas.trasAltF.fotos === 1, 'Alt+F no ha sacado la foto');
    assert(teclas.trasAltF.volar === true, 'Alt+F ha conmutado el vuelo');
  });

  // ── Deshacer ───────────────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => (window.__previos || []).reverse().forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id | 0)));

  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
