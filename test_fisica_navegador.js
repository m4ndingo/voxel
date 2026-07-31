// test_fisica_navegador.js — los bloques que tocan la fisica del jugador, contra el app.js DE VERDAD.
// Cubre la subida suave de escalones (pasoSuave) y el factor de marcha (velocidad).
//
// Por que existe este fichero teniendo ya test_bloques_comportamiento.js: el mundo de juguete de aquel
// aplicaba la gravedad DESPUES del movimiento horizontal, y app.js la aplica ANTES. Con ese orden, el
// frame en que se sube un escalon termina con vel[1]=0, ny === pos[1], sin colision y por tanto con
// onGround FALSE (app.js:5089-5098). La primera version del suavizado se guardaba con `mc.onGround`,
// el juguete dio 81 ok y en el juego no hacia absolutamente nada: el dueño no notaba diferencia entre
// pasoSuave(0) y pasoSuave(1000). Un calco a mano de la fisica siempre puede desviarse del original;
// esto ejecuta el mcUpdate real, el mcMoveAxis real y lee la camara de la matriz de vista real.
//
//   node test_fisica_navegador.js [url]      por defecto http://localhost:8500/map/agents
//
// El mundo del dueño NO se toca: se bloquea POST /api/mundo y ademas se deshacen los bloques al salir.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/agents';
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
  // Cinturon: aunque el test deshace todo lo que pone, que no salga del navegador ni un guardado.
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(() => {
    // Escenario controlado y lejos de todo: una plataforma de 6x6 y, contra ella, un escalon de UN
    // bloque. A escala 1 ese escalon no se sube (MC_STEP=0.6), asi que el jugador va a escala 2, donde
    // MC_STEP*scale = 1.2: es exactamente el caso que se quiere suavizar, hecho solo con bloques
    // enteros para no depender de ninguna estructura del mundo del dueño.
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    const ALTO = 9;
    let base = null;
    for (let y = mc.dim.y - ALTO; y > 4 && !base; y -= 2)
      for (let x = 1; x + 6 < mc.dim.x && !base; x += 5)
        for (let z = 1; z + 6 < mc.dim.z && !base; z += 5)
          if (vacio(x, y, z, 6, ALTO, 6)) base = [x, y, z];
    if (!base) return { error: 'no encontre un hueco de 6x' + ALTO + 'x6 en el mundo' };

    const [BX, BY, BZ] = base;
    const previos = [];
    const poner = (x, y, z) => { previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]); mcSetBlock(x, y, z, 1); };
    for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 6; dz++) poner(BX + dx, BY, BZ + dz);   // suelo, cara en BY+1
    for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 2; dz++) poner(BX + dx, BY + 1, BZ + dz); // escalon, cara en BY+2

    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), yaw: mc.yaw, pitch: mc.pitch,
                   scale: mc.scale, keys: Object.assign({}, mc.keys), tau: game.bloques.pasoSuave() };
    const SUELO = BY + 1;

    // Una pasada de N frames andando contra el escalon. Devuelve, frame a frame, la y FISICA (la que
    // colisiona), el desfase y la altura de camara sacada de la MATRIZ DE VISTA de verdad: con yaw y
    // pitch a cero la vista es solo translate(-ex,-ey,-ez), asi que m[13] = -ojo.
    // Se suelta la W en cuanto el escalon esta subido: la plataforma mide 6 y el jugador a escala 2
    // anda ~6 unidades en 60 frames, o sea que si no, se sale por el otro lado y lo que se mide es la
    // caida. mc.onGround tambien se repone: si se hereda de la pasada anterior, la segunda arranca en
    // control de aire, acelera distinto y las dos pasadas dejan de ser comparables.
    const pasada = (tau, n) => {
      mc.scale = 2; mc.yaw = 0; mc.pitch = 0;                       // yaw 0 ⇒ fwd = -z
      mc.pos = [BX + 3.5, SUELO, BZ + 4.5]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.keys['w'] = true; mc.onGround = true;
      mc._pasoDesfase = 0; mc._pasoSubido = 0;
      game.bloques.pasoSuave(tau);
      const fisica = [], camara = [], desfase = [], atascado = mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]);
      for (let i = 0; i < n; i++) {
        mcUpdate(1 / 60);
        const d = mc._pasoDesfase || 0;
        desfase.push(d);
        fisica.push(mc.pos[1] + d);
        camara.push(-mcViewMatrix()[13]);
        if (mc.pos[1] + d > SUELO + 0.5) mc.keys['w'] = false;      // ya esta arriba: quieto en el escalon
      }
      return { fisica, camara, desfase, atascado };
    };
    const N = 60;
    const crudo = pasada(0, N);
    const suave = pasada(0.06, N);

    // --- velocidad: el mismo escenario, pero andando por el llano de la plataforma y a escala 1.
    // El material del suelo es el que se define, porque 'velocidad' mira el bloque BAJO LOS PIES.
    // 10 frames: a ×2 son ~1,7 bloques y el escalon esta a 2,2, asi que la medida es de llano puro
    // (se comprueba con `subio`, que tiene que quedarse en 0).
    const claveSuelo = mc.blockKey[1];
    const correr = (fac, n) => {
      mc.scale = 1; mc.yaw = 0; mc.pitch = 0;
      mc.pos = [BX + 3.5, SUELO, BZ + 4.5]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.keys['w'] = true; mc.onGround = true;
      mc._pasoDesfase = 0; mc._pasoSubido = 0;
      // La inercia se ARRASTRA entre pasadas (vive en mc, no en un closure): sin este reset, la pasada
      // de ×0.5 venia frenando desde los 10 u/s de la de ×2 y media el decaimiento, no la marcha.
      mc._velInercia = 0;
      if (fac) game.bloques.define(claveSuelo, { velocidad: fac }); else game.bloques.quitar(claveSuelo);
      const z0 = mc.pos[2], spd0 = mc.speed;
      for (let i = 0; i < n; i++) mcUpdate(1 / 60);
      return { avance: z0 - mc.pos[2], intacta: mc.speed === spd0, suelo: mc.onGround, subio: mc.pos[1] - SUELO };
    };
    // La queja del dueño: corriendo por hielo (velocidad:2) y saliendo a suelo normal, la marcha se
    // cortaba en seco EL MISMO FRAME, asi que al trampolin de mas alla se llegaba a marcha base. Aqui
    // se corre a ×2, se quita la definicion (= pisar fuera del hielo) y se mide UN frame: tiene que
    // avanzar mas que a marcha base, que es justo lo que antes no pasaba.
    const inercia = (() => {
      correr(2, 10);                                  // llega lanzado
      game.bloques.quitar(claveSuelo);                // el pie sale del bloque rapido
      const z0 = mc.pos[2];
      mcUpdate(1 / 60);
      // Sin el arreglo, game.bloques.inercia ni existe: se informa como 0 para que el test de un FALLO
      // legible en vez de reventar la evaluacion entera.
      const tau = typeof game.bloques.inercia === 'function' ? game.bloques.inercia() : 0;
      return { avance: z0 - mc.pos[2], base: mc.speed / 60, tau };
    })();
    const marcha = mc.speed;
    const vel = { normal: correr(0, 10), doble: correr(2, 10), medio: correr(0.5, 10), marcha: marcha };

    // --- deslizamiento (el hielo de Minecraft): al SOLTAR ASWD encima del bloque se sigue rodando.
    // Se corre 10 frames con la tecla puesta, se sueltan las teclas y se miden los 10 siguientes. El
    // control (sin deslizamiento) tiene que quedarse clavado: app.js pone vel=0 en el suelo sin tecla.
    const patinar = (segs) => {
      mc.scale = 1; mc.yaw = 0; mc.pitch = 0;
      mc.pos = [BX + 3.5, SUELO, BZ + 4.5]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.keys['w'] = true; mc.onGround = true;
      mc._pasoDesfase = 0; mc._pasoSubido = 0; mc._velInercia = 0; mc._deslizVel = null;
      if (segs) game.bloques.define(claveSuelo, { deslizamiento: segs }); else game.bloques.quitar(claveSuelo);
      for (let i = 0; i < 10; i++) mcUpdate(1 / 60);
      mc.keys = {};                                                 // se sueltan las teclas
      const z0 = mc.pos[2];
      for (let i = 0; i < 10; i++) mcUpdate(1 / 60);
      return z0 - mc.pos[2];
    };
    const desliz = { con: patinar(1.2), sin: patinar(0), tramo: mc.speed * 10 / 60,
                     hay: typeof game.bloques.roce === 'function' };
    mc._deslizVel = null;
    game.bloques.quitar(claveSuelo);                                // la tabla queda como estaba

    // Deshacer: primero el mundo, luego el jugador y el ajuste.
    for (const [x, y, z, id] of previos) mcSetBlock(x, y, z, id);
    const cs = new Set();
    for (const [x, , z] of previos) cs.add(((x / MC_CHUNK) | 0) + ',' + ((z / MC_CHUNK) | 0));
    for (const c of cs) { const [cx, cz] = c.split(',').map(Number); mcMeshChunk(cx, cz); }
    mc.pos = est0.pos; mc.vel = est0.vel; mc.yaw = est0.yaw; mc.pitch = est0.pitch;
    mc.scale = est0.scale; mc.keys = est0.keys;
    mc._pasoDesfase = 0; mc._pasoSubido = 0;
    game.bloques.pasoSuave(est0.tau);
    const limpio = previos.every(([x, y, z, id]) => mc.grid[mcIdx(x, y, z)] === id);

    return { base, SUELO, crudo, suave, vel, inercia, desliz, limpio,
             hayApi: typeof game.bloques.pasoSuave === 'function',
             envuelto: !!(mcMoveAxis && mcMoveAxis._orig), eye: MC_EYE, step: MC_STEP };
  });

  console.log('\n--- ' + URL + ' ---');
  if (r.error) { console.log('  ' + r.error); process.exit(1); }
  const tiron = (a) => a.reduce((m, y, i) => (i && y - a[i - 1] > m ? y - a[i - 1] : m), 0);
  const subida = (a) => a[a.length - 1] - a[0];
  console.log('  plataforma en ' + r.base.join(',') + '  suelo y=' + r.SUELO + '  escalon de 1 bloque, jugador a escala 2');
  console.log('  y fisica: ' + r.crudo.fisica[0].toFixed(2) + ' → ' + r.crudo.fisica[r.crudo.fisica.length - 1].toFixed(2) +
              '   tiron de camara: sin suavizar ' + tiron(r.crudo.camara).toFixed(3) +
              '   suavizado ' + tiron(r.suave.camara).toFixed(3) + '\n');

  test('el snippet se autoarranco en el navegador de verdad y trae la API', () => {
    assert(r.hayApi, 'game.bloques.pasoSuave no existe: el hook de autoarranque no corrio');
    assert(r.envuelto, 'mcMoveAxis no esta envuelto: el escalon no se esta midiendo');
  });

  test('el jugador no arranca incrustado (el escenario es valido)', () => {
    assert(!r.crudo.atascado && !r.suave.atascado, 'mcCollides ya era true en la posicion inicial');
  });

  test('sube el escalon de verdad: la y fisica gana un bloque', () => {
    assert(Math.abs(subida(r.crudo.fisica) - 1) < 0.05, 'subio ' + subida(r.crudo.fisica).toFixed(3) + ', no 1');
  });

  // La de la queja: sin suavizar la camara pega el salto entero de un bloque en UN frame.
  test('sin suavizar, la camara salta el escalon entero en un frame', () => {
    assert(tiron(r.crudo.camara) > 0.9, 'el mayor salto de camara fue ' + tiron(r.crudo.camara).toFixed(3));
  });

  test('con pasoSuave la camara ya no da el tiron', () => {
    assert(tiron(r.suave.camara) < 0.35, 'el mayor salto de camara sigue siendo ' + tiron(r.suave.camara).toFixed(3));
    assert(tiron(r.suave.camara) < tiron(r.crudo.camara) / 2.5,
      'apenas mejora: ' + tiron(r.crudo.camara).toFixed(3) + ' → ' + tiron(r.suave.camara).toFixed(3));
  });

  test('el ojo llega arriba igual, solo que mas tarde', () => {
    assert(Math.abs(subida(r.suave.camara) - subida(r.crudo.camara)) < 0.02,
      'acabo en otra altura: ' + subida(r.suave.camara).toFixed(3) + ' vs ' + subida(r.crudo.camara).toFixed(3));
    assert((r.suave.desfase[r.suave.desfase.length - 1] || 0) === 0, 'el desfase no se cerro al final de la pasada');
  });

  test('el suavizado NO toca la fisica: misma y de verdad en los 60 frames', () => {
    const malo = r.crudo.fisica.findIndex((y, i) => y !== r.suave.fisica[i]);
    assert(malo < 0, 'divergen en el frame ' + malo + ': ' + r.crudo.fisica[malo] + ' vs ' + r.suave.fisica[malo]);
  });

  test('la camara es el ojo del jugador (se esta midiendo lo que se cree)', () => {
    const i = r.suave.camara.length - 1;
    // 1e-4 y no 1e-9: la matriz de vista es un Float32Array (36.2400016784668 por 36.24).
    assert(Math.abs(r.suave.camara[i] - (r.suave.fisica[i] + r.eye * 2)) < 1e-4,
      'camara=' + r.suave.camara[i] + ' y pos+ojo=' + (r.suave.fisica[i] + r.eye * 2));
  });

  // --- velocidad: el factor del bloque que se pisa, con el app.js de verdad ---
  console.log('\n  avance en 10 frames:  normal ' + r.vel.normal.avance.toFixed(3) +
              '   ×2 ' + r.vel.doble.avance.toFixed(3) +
              '   ×0.5 ' + r.vel.medio.avance.toFixed(3) + '   (marcha ' + r.vel.marcha.toFixed(2) + ' u/s)');
  console.log('  tras soltar ASWD:  con deslizamiento ' + r.desliz.con.toFixed(3) +
              '   sin el ' + r.desliz.sin.toFixed(3) +
              '   (a marcha entera serian ' + r.desliz.tramo.toFixed(3) + ')\n');

  // Guarda contra el error de siempre: medir una caida o una trepada creyendo medir la marcha.
  test('las tres pasadas son llanas: se midio andar, no caer ni subir', () => {
    for (const [n, v] of Object.entries(r.vel)) {
      if (n === 'marcha') continue;
      assert(v.suelo === true, n + ': acabo sin suelo bajo los pies');
      assert(Math.abs(v.subio) < 1e-9, n + ': cambio de altura ' + v.subio);
    }
  });

  test('sin velocidad se anda a la marcha de siempre', () => {
    const esperado = r.vel.marcha * 10 / 60;
    assert(Math.abs(r.vel.normal.avance - esperado) < 1e-6,
      'avanzo ' + r.vel.normal.avance + ' y la marcha da ' + esperado);
  });

  test('velocidad ×2 avanza exactamente el doble, ×0.5 la mitad', () => {
    assert(Math.abs(r.vel.doble.avance / r.vel.normal.avance - 2) < 1e-9,
      'la razon fue ' + (r.vel.doble.avance / r.vel.normal.avance));
    assert(Math.abs(r.vel.medio.avance / r.vel.normal.avance - 0.5) < 1e-9,
      'la razon fue ' + (r.vel.medio.avance / r.vel.normal.avance));
  });

  // mc.speed es del jugador, no del bloque: el efecto dura lo que dura el frame.
  test('mc.speed queda intacto tras el frame (no se persiste nada)', () => {
    for (const [n, v] of Object.entries(r.vel)) {
      if (n === 'marcha') continue;
      assert(v.intacta === true, n + ': mc.speed no volvio a su valor');
    }
  });

  test('al salir del bloque rapido la marcha NO se corta en seco (inercia)', () => {
    assert(r.inercia.tau > 0, 'la inercia esta desactivada: tau = ' + r.inercia.tau);
    assert(r.inercia.avance > r.inercia.base * 1.2,
      'avanzo ' + r.inercia.avance.toFixed(4) + ' y a marcha base serian ' + r.inercia.base.toFixed(4));
  });

  test('con deslizamiento, soltar ASWD sigue rodando; sin el, se para en seco', () => {
    assert(r.desliz.hay, 'esta version no tiene deslizamiento (falta game.bloques.roce)');
    assert(r.desliz.sin < r.desliz.tramo * 0.02,
      'sin deslizamiento avanzo ' + r.desliz.sin.toFixed(4) + ' tras soltar las teclas (deberia ser ~0)');
    assert(r.desliz.con > r.desliz.tramo * 0.5,
      'con deslizamiento solo avanzo ' + r.desliz.con.toFixed(4) + ' de los ' + r.desliz.tramo.toFixed(4) + ' de un tramo a marcha entera');
  });

  test('el mundo del dueño queda como estaba', () => {
    assert(r.limpio, 'algun bloque de la plataforma no se restauro');
  });

  test('sin excepciones en la pagina', () => {
    assert(errores.length === 0, errores[0]);
  });

  await b.close();
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
