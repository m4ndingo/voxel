// @area: fisica
// @necesita: servidor, playwright
// test_parkour_navegador.js — el parkour (colgarse de un canto y trepar) contra el app.js DE VERDAD.
//
// Va aparte de test_fisica_navegador.js porque necesita otro escenario: aquel monta una plataforma
// de 6×9×6 con un escalon de un bloque, y aqui hace falta un patio de 10³ con un muro de 3 y repisa,
// un vano de 1 de alto sobre el canto y un borde que se acaba. Cargar todo eso en el fichero de la
// marcha lo dejaria ilegible y ademas lo haria mas lento para quien solo toque 'velocidad'.
//
// Se ejecuta el mcUpdate REAL: el parkour vive en un envoltorio de mcUpdate y depende del orden de
// app.js (mcUnstick al principio, gravedad antes que el horizontal, dt acotado por dentro). Un calco
// a mano de la fisica no probaria nada de eso.
//
//   node test_parkour_navegador.js [url]      por defecto http://localhost:8500/map/agents
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
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/habitantes**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(() => {
    if (!game.parkour) return { error: 'este snippet no tiene game.parkour (¿v1.26?)' };

    // ── Escenario ────────────────────────────────────────────────────────────────────────────
    // Un patio vacio de 10×10×10 en el que se monta, contra la pared -z, un muro de 3 de alto con
    // repisa de 2 de fondo. Todo con bloques ENTEROS: nada de estructuras, para no depender de una
    // sola pieza del mundo del dueño. La escala del jugador se deja en 1, que es donde el salto llega
    // a 1,4545 y un canto a 3 es inalcanzable — el caso exacto que describio.
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    const W = 10, H = 10;
    let base = null;
    for (let y = mc.dim.y - H; y > 4 && !base; y -= 2)
      for (let x = 1; x + W < mc.dim.x && !base; x += 4)
        for (let z = 1; z + W < mc.dim.z && !base; z += 4)
          if (vacio(x, y, z, W, H, W)) base = [x, y, z];
    if (!base) return { error: 'no encontre un hueco de ' + W + '×' + H + '×' + W + ' en el mundo' };

    const [BX, BY, BZ] = base;
    const previos = [];
    const poner = (x, y, z) => { previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]); mcSetBlock(x, y, z, 1); };
    const SUELO = BY + 1;                       // cara superior de la solera

    for (let dx = 0; dx < W; dx++) for (let dz = 0; dz < W; dz++) poner(BX + dx, BY, BZ + dz);
    // Muro de 3 con repisa, en z = BZ..BZ+1, o sea al -z del jugador (yaw 0 ⇒ se mira a -z).
    // Su cara mira a +z y esta en z = BZ+2; el canto queda en y = SUELO+3.
    for (let dx = 0; dx < W; dx++) for (let dz = 0; dz < 2; dz++) for (let dy = 1; dy <= 3; dy++) poner(BX + dx, BY + dy, BZ + dz);
    const CANTO = SUELO + 3, CARA = BZ + 2;

    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), yaw: mc.yaw, pitch: mc.pitch,
                   scale: mc.scale, keys: Object.assign({}, mc.keys), onGround: mc.onGround };

    // ── Utilidades ───────────────────────────────────────────────────────────────────────────
    const DT = 1 / 60;
    const reset = (z) => {
      mc.scale = 1; mc.yaw = 0; mc.pitch = 0;                     // yaw 0 ⇒ fwd = -z: se mira al muro
      mc.pos = [BX + 5.5, SUELO, z]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.onGround = true;
      mc._parkour = null; mc._pkEnfria = 0;
      mc._pasoDesfase = 0; mc._pasoSubido = 0; mc._deslizVel = null;
    };
    // La y FISICA, no la pintada: suavizarPaso desplaza mc.pos[1] al salir del frame para que el ojo
    // alcance al cuerpo (y restaurarPaso lo deshace al entrar en el siguiente). Leer mc.pos[1] justo
    // despues de una tanda da la y de la CAMARA, que puede ir hasta un escalon por detras.
    const yFisica = () => (mc._pasoDesfase && mc._pasoY === mc.pos[1]) ? mc._pasoReal : mc.pos[1];
    const correr = (n, teclas, traza) => {
      for (let i = 0; i < n; i++) {
        mc.keys = Object.assign({}, teclas);
        mcUpdate(DT);
        if (traza) traza.push({ pos: mc.pos.slice(), st: mc._parkour ? mc._parkour.st : 'libre',
                                onGround: mc.onGround, vel: mc.vel.slice() });
      }
    };
    // Salto contra el muro con el ESPACIO SOSTENIDO, que es el gesto que describio el dueño. Se
    // arranca pegado al muro y sin W: el objetivo es medir el agarre, no la carrera.
    const saltarPegado = (n, extra, traza) => {
      const k = Object.assign({ ' ': true }, extra || {});
      correr(n, k, traza);
    };

    const out = {};

    // 1 · el salto de app.js NO llega solo: sin parkour el jugador cae y no sube nada.
    reset(CARA + 0.35);
    game.parkour.activo = false;
    saltarPegado(120);
    out.sinParkour = { y: mc.pos[1], onGround: mc.onGround };
    game.parkour.activo = true;

    // 2 · con el espacio sostenido queda COLGADO y se mantiene ahi (≥60 frames quieto y sin velocidad)
    reset(CARA + 0.35);
    let tr = [];
    saltarPegado(40, null, tr);
    const colgadoEn = tr.findIndex(f => f.st === 'colgado');
    const yColgado = colgadoEn >= 0 ? tr[colgadoEn].pos[1] : null;
    tr = [];
    saltarPegado(60, null, tr);
    out.colgado = {
      frame: colgadoEn, y: yColgado, canto: CANTO,
      // v1.28: el agarre NO teletransporta en y. Se compara el salto del frame del agarre con la
      // mayor caida que ya llevaba: agarrarse no puede ser mas brusco que seguir cayendo.
      saltoAlAgarrar: colgadoEn > 0 ? Math.abs(tr[colgadoEn].pos[1] - tr[colgadoEn - 1].pos[1]) : null,
      caidaPrevia: colgadoEn > 1
        ? Math.max.apply(null, tr.slice(1, colgadoEn).map((f, i) => Math.abs(f.pos[1] - tr[i].pos[1])))
        : null,
      estable: tr.every(f => f.st === 'colgado'),
      deriva: Math.max.apply(null, tr.map(f => Math.abs(f.pos[1] - yColgado))),
      velMax: Math.max.apply(null, tr.map(f => Math.hypot(f.vel[0], f.vel[1], f.vel[2]))),
      onGround: tr.every(f => f.onGround === false)
    };

    // 3 · soltar el espacio = caida libre
    tr = [];
    correr(40, {}, tr);
    out.soltar = { st: mc._parkour ? mc._parkour.st : 'libre', y: mc.pos[1], onGround: mc.onGround };

    // 4 · W estando colgado corona el canto, y la trayectoria SUBE ANTES DE AVANZAR (la ele)
    reset(CARA + 0.35);
    saltarPegado(40);
    const p0 = mc.pos.slice();
    tr = [];
    correr(60, { ' ': true, w: true }, tr);
    const subiendo = tr.filter(f => f.st === 'subiendo');
    const mitad = subiendo[Math.floor(subiendo.length / 2)] || null;
    // El frame en que se corona, NO el ultimo de la tanda: al coronar se queda onGround con el espacio
    // todavia pulsado, asi que app.js:5929 le da un salto normal el frame siguiente. Eso es lo que hace
    // Minecraft con el espacio mantenido y no es cosa del parkour, pero mediria mal el aterrizaje.
    const iFin = tr.findIndex((f, i) => f.st === 'libre' && i > 0 && tr[i - 1].st === 'subiendo');
    const fin = iFin >= 0 ? tr[iFin] : null;
    out.subir = {
      estados: tr.map(f => f.st).filter((v, i, a) => v !== a[i - 1]),
      y: fin ? fin.pos[1] : null, canto: CANTO, onGround: fin ? fin.onGround : null,
      z: fin ? fin.pos[2] : null, caraCanto: CARA,
      // en la mitad del recorrido: cuanto se ha subido y cuanto se ha avanzado, en tanto por uno
      subidoMitad: mitad && fin ? (mitad.pos[1] - p0[1]) / (CANTO - p0[1]) : null,
      avanzadoMitad: mitad && fin ? Math.abs(mitad.pos[2] - p0[2]) / Math.abs(fin.pos[2] - p0[2]) : null,
      pasos: subiendo.length,
      // al TERMINAR el jugador no puede quedarse embutido en el muro (la camara va por encima durante
      // la curva, pero el AABB tiene que acabar libre y de pie)
      libreAlFinal: fin ? !mcCollides(fin.pos[0], fin.pos[1], fin.pos[2]) : false
    };

    // 5 · enfriamiento: recien coronado, con el espacio aun pulsado, no se re-agarra al mismo canto
    tr = [];
    correr(30, { ' ': true }, tr);
    out.enfria = { agarres: tr.filter(f => f.st === 'colgado').length, y: mc.pos[1] };

    // 6 · desplazamiento lateral: A/D mueven a lo largo del canto y SE PARAN al acabarse.
    //     Se abre un boquete en el muro a un lado para que el borde termine de verdad.
    reset(CARA + 0.35);
    saltarPegado(40);
    const latIni = mc.pos[0], yIni = mc.pos[1];
    tr = [];
    correr(45, { ' ': true, d: true }, tr);
    const latD = mc.pos[0];
    correr(45, { ' ': true, a: true }, tr);
    out.lateral = {
      st: mc._parkour ? mc._parkour.st : 'libre',
      derecha: latD - latIni, izquierda: mc.pos[0] - latD,
      // v1.28: el shimmy no sube ni baja — se queda en la y a la que te agarraste, sea cual sea
      alturaIntacta: Math.abs(mc.pos[1] - yIni) < 1e-6
    };

    // 7 · el borde se acaba: se quita el muro entero a partir de cierta x y el desplazamiento para ahi
    const quitados = [];
    for (let dx = 8; dx < W; dx++) for (let dz = 0; dz < 2; dz++) for (let dy = 1; dy <= 3; dy++) {
      quitados.push([BX + dx, BY + dy, BZ + dz, mc.grid[mcIdx(BX + dx, BY + dy, BZ + dz)]]);
      mcSetBlock(BX + dx, BY + dy, BZ + dz, 0);
    }
    reset(CARA + 0.35);
    saltarPegado(40);
    const xAntes = mc.pos[0];
    correr(120, { ' ': true, d: true });
    out.finDeBorde = {
      st: mc._parkour ? mc._parkour.st : 'libre',
      x: mc.pos[0], tope: BX + 8, avanzo: mc.pos[0] - xAntes,
      colgado: !!(mc._parkour && mc._parkour.st === 'colgado')
    };
    quitados.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));

    // 8 · un escalon de UN bloque NO dispara parkour: lo resuelve el auto-escalon de app.js.
    //     El escalon se monta en MITAD del patio (z = BZ+3..BZ+8) y no contra el borde: pegado al
    //     borde el jugador se salia de la plataforma y lo que se medía era la caída, no el escalon.
    const esc1 = [];
    for (let dx = 0; dx < W; dx++) for (let dz = 3; dz < W - 2; dz++) {
      esc1.push([BX + dx, BY + 1, BZ + dz, mc.grid[mcIdx(BX + dx, BY + 1, BZ + dz)]]);
      mcSetBlock(BX + dx, BY + 1, BZ + dz, 1);
    }
    reset(BZ + W - 2 + 0.4);                                       // justo detras del escalon, mirando a -z
    tr = [];
    correr(25, { ' ': true, w: true }, tr);                        // con el ESPACIO sostenido: no debe enganchar
    correr(40, {}, tr);                                            // y se deja aterrizar del todo para medir la y
    out.escalon1 = { agarres: tr.filter(f => f.st !== 'libre').length, y: yFisica(),
                     esperado: SUELO + 1, onGround: mc.onGround };
    esc1.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));

    // 9 · una repisa de UN bloque de fondo SI aguanta: la huella del jugador mide 0,6 y aterriza
    //     entera dentro del primer bloque. Es el limite util del test de apoyo bajo las 4 esquinas —
    //     el caso que de verdad rechaza (un labio de 1/16) necesita una estructura fina, y aqui solo
    //     hay bloques enteros; ese camino lo ejercita el fin de borde de la prueba 7.
    const finos = [];
    for (let dx = 0; dx < W; dx++) for (let dy = 1; dy <= 3; dy++) {          // se quita la fila trasera
      finos.push([BX + dx, BY + dy, BZ + 1, mc.grid[mcIdx(BX + dx, BY + dy, BZ + 1)]]);
      mcSetBlock(BX + dx, BY + dy, BZ + 1, 0);
    }
    reset(CARA - 1 + 0.35);                                        // la cara del muro fino esta en BZ+1
    saltarPegado(45);
    out.repisaFina = { st: mc._parkour ? mc._parkour.st : 'libre', y: mc.pos[1], canto: CANTO };
    finos.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));

    // 10 · un VANO de 1 de alto sobre el canto: hay canto y hay apoyo, pero no se cabe de pie.
    const techo = [];
    for (let dx = 0; dx < W; dx++) for (let dz = 0; dz < 2; dz++) {
      techo.push([BX + dx, BY + 5, BZ + dz, mc.grid[mcIdx(BX + dx, BY + 5, BZ + dz)]]);
      mcSetBlock(BX + dx, BY + 5, BZ + dz, 1);                     // deja hueco de 1 sobre el canto
    }
    reset(CARA + 0.35);
    saltarPegado(45);
    out.vanoBajo = { st: mc._parkour ? mc._parkour.st : 'libre', motivo: game.parkour.estado().motivo };
    techo.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));

    // 11 · abortos: un game.tp a media subida deja el estado en 'libre' y sin posicion congelada
    reset(CARA + 0.35);
    saltarPegado(40);
    correr(4, { ' ': true, w: true });
    const enSubida = mc._parkour && mc._parkour.st === 'subiendo';
    mc.pos[0] += 4; mc.pos[1] += 1;                                // lo que haria game.tp / un respawn
    correr(2, { ' ': true, w: true });
    out.aborto = { enSubida: !!enSubida, st: mc._parkour ? mc._parkour.st : 'libre' };

    // 12 · dt gigante (pestaña en segundo plano): la subida NO se completa de un tiron ni teletransporta
    reset(CARA + 0.35);
    saltarPegado(40);
    const yAnt = mc.pos[1];
    mc.keys = { ' ': true, w: true };
    mcUpdate(5);                                                    // cinco segundos de golpe
    out.dtGigante = { salto: mc.pos[1] - yAnt, dur: game.parkour.duracion,
                      st: mc._parkour ? mc._parkour.st : 'libre' };

    // 13 · apagarlo lo apaga de verdad, y el tunable persiste
    game.parkour.alturaMax = 2.35;
    const guardado = localStorage.getItem('vf_pk_alturaMax');
    game.parkour.alturaMax = 2.2;
    out.tunables = { guardado: guardado, leido: game.parkour.alturaMax,
                     claves: Object.keys(game.parkour).sort() };

    // ── Regresion: el auto-escalon de 1,7 y el trepado de escaleras siguen igual ───────────────
    // (mismo caso que cubre test_fisica_navegador.js, aqui solo se comprueba que el envoltorio nuevo
    //  no ha roto el camino normal: escala 2 sube un bloque entero de un paso, sin parkour.)
    const esc2 = [];
    for (let dx = 0; dx < W; dx++) for (let dz = 3; dz < W - 2; dz++) {
      esc2.push([BX + dx, BY + 1, BZ + dz, mc.grid[mcIdx(BX + dx, BY + 1, BZ + dz)]]);
      mcSetBlock(BX + dx, BY + 1, BZ + dz, 1);
    }
    reset(BZ + W - 2 + 0.6);
    mc.scale = 2;                                                  // a escala 2, MC_STEP·escala = 1,2
    tr = [];
    correr(20, { w: true }, tr);
    correr(10, {}, tr);                                            // se cierra el suavizado del ojo
    out.autoEscalon = { y: yFisica(), esperado: SUELO + 1, parkour: tr.some(f => f.st !== 'libre') };
    esc2.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));

    // ── Limpieza ──────────────────────────────────────────────────────────────────────────────
    mc.scale = est0.scale; mc.pos = est0.pos; mc.vel = est0.vel;
    mc.yaw = est0.yaw; mc.pitch = est0.pitch; mc.keys = est0.keys; mc.onGround = est0.onGround;
    mc._parkour = null; mc._pkEnfria = 0; mc._pasoDesfase = 0; mc._pasoSubido = 0;
    previos.forEach(([x, y, z, id]) => mcSetBlock(x, y, z, id));
    out.limpio = previos.every(([x, y, z, id]) => mc.grid[mcIdx(x, y, z)] === id);
    out.serializa = mcSerialize().structures.length;
    return out;
  });

  if (r.error) { console.log('  FALLO montando el escenario: ' + r.error); await b.close(); process.exit(1); }

  console.log('\nParkour · agarre y trepado');

  test('sin parkour el salto NO llega al canto de 3 (es el problema que se arregla)', () => {
    assert(r.sinParkour.y < r.colgado.canto - 1, 'acabo en y=' + r.sinParkour.y + ' con el canto en ' + r.colgado.canto);
  });

  test('con el espacio sostenido el jugador se queda COLGADO del canto', () => {
    assert(r.colgado.frame >= 0, 'no se agarro en 40 frames');
    // v1.28: te cuelgas A LA ALTURA A LA QUE ESTAS, no en una pose fija. El unico tope es el calado
    // (1,2 de cuerpo por debajo del canto) y por abajo el alcance del brazo (alturaMax = 2,2).
    assert(r.colgado.y !== null &&
      r.colgado.y <= r.colgado.canto - 1.2 + 1e-9 && r.colgado.y >= r.colgado.canto - 2.2 - 1e-9,
      'colgado en y=' + r.colgado.y + ', fuera de la banda [' + (r.colgado.canto - 2.2) + ', ' + (r.colgado.canto - 1.2) + ']');
    // Y sobre todo: el frame del agarre no puede dar un TIRON hacia abajo mayor que la caida que ya
    // llevabas — ese salto brusco en y es justo lo que se arreglo.
    assert(r.colgado.saltoAlAgarrar <= r.colgado.caidaPrevia + 1e-9,
      'el agarre dio un tiron de ' + r.colgado.saltoAlAgarrar + ' en y cuando ya caia ' + r.colgado.caidaPrevia + ' por frame');
  });

  test('colgado se queda quieto: 60 frames sin deriva y con velocidad cero', () => {
    assert(r.colgado.estable, 'algun frame salio del estado colgado');
    assert(r.colgado.deriva < 1e-9, 'derivo ' + r.colgado.deriva);
    assert(r.colgado.velMax === 0, 'la velocidad no era cero: ' + r.colgado.velMax);
    assert(r.colgado.onGround, 'colgado no puede estar onGround (activaria el salto de app.js)');
  });

  test('soltar el espacio suelta el canto y se cae', () => {
    assert(r.soltar.st === 'libre', 'sigue en ' + r.soltar.st);
    assert(r.soltar.y < r.colgado.y - 0.5, 'no cayo: y=' + r.soltar.y + ' desde ' + r.colgado.y);
  });

  test('W estando colgado sube y deja al jugador DE PIE encima', () => {
    assert(r.subir.y !== null, 'nunca llego a coronar (estados: ' + r.subir.estados.join(' → ') + ')');
    assert(Math.abs(r.subir.y - r.subir.canto) < 1e-6, 'corono en y=' + r.subir.y + ' y el canto esta en ' + r.subir.canto);
    assert(r.subir.onGround === true, 'no quedo onGround');
    assert(r.subir.z < r.subir.caraCanto, 'no llego a pasar la cara del muro (z=' + r.subir.z + ')');
    assert(r.subir.libreAlFinal, 'acabo embutido en el muro');
  });

  test('la subida es una ELE: a mitad de camino se ha subido mucho mas de lo que se ha avanzado', () => {
    assert(r.subir.pasos > 3, 'la subida duro ' + r.subir.pasos + ' frames (¿instantanea?)');
    assert(r.subir.subidoMitad > 0.6, 'a mitad solo se habia subido el ' + (r.subir.subidoMitad * 100).toFixed(0) + '%');
    assert(r.subir.avanzadoMitad < 0.4, 'a mitad ya se habia avanzado el ' + (r.subir.avanzadoMitad * 100).toFixed(0) + '%');
    assert(r.subir.subidoMitad > r.subir.avanzadoMitad, 'avanzo antes de subir');
  });

  test('tras coronar no se re-agarra al canto que acaba de subir (enfriamiento)', () => {
    assert(r.enfria.agarres === 0, 'volvio a colgarse ' + r.enfria.agarres + ' frames');
  });

  test('A/D desplazan por el canto sin cambiar de altura', () => {
    assert(r.lateral.st === 'colgado', 'se solto: ' + r.lateral.st);
    assert(r.lateral.derecha > 0.3, 'con D solo se movio ' + r.lateral.derecha.toFixed(3));
    assert(r.lateral.izquierda < -0.3, 'con A solo se movio ' + r.lateral.izquierda.toFixed(3));
    assert(r.lateral.alturaIntacta, 'el desplazamiento lateral cambio la altura');
  });

  test('el desplazamiento lateral SE PARA donde se acaba el canto (no cae ni lo atraviesa)', () => {
    assert(r.finDeBorde.colgado, 'se solto al llegar al final: ' + r.finDeBorde.st);
    assert(r.finDeBorde.x < r.finDeBorde.tope, 'llego a x=' + r.finDeBorde.x + ' pasandose del tope ' + r.finDeBorde.tope);
    assert(r.finDeBorde.avanzo > 0.3, 'no llego a desplazarse (' + r.finDeBorde.avanzo.toFixed(3) + ')');
  });

  test('un escalon de UN bloque no dispara parkour: lo sube el auto-escalon', () => {
    assert(r.escalon1.agarres === 0, 'se agarro ' + r.escalon1.agarres + ' frames a un escalon de 1');
    assert(r.escalon1.onGround, 'no llego a aterrizar sobre el escalon');
    // Con tolerancia y no al bit: al aterrizar de un salto app.js deja al jugador en la ultima y que
    // NO chocaba (app.js:5938), o sea hasta |vel|·dt por encima de la cara. Eso es de siempre.
    assert(r.escalon1.y >= r.escalon1.esperado - 1e-6 && r.escalon1.y < r.escalon1.esperado + 0.1,
      'acabo en y=' + r.escalon1.y + ' y deberia estar sobre el escalon (' + r.escalon1.esperado + ')');
  });

  test('una repisa de UN bloque de fondo sí aguanta la huella (el test de apoyo no es demasiado estricto)', () => {
    assert(r.repisaFina.st === 'colgado', 'rechazo una repisa perfectamente pisable: ' + r.repisaFina.st);
    assert(r.repisaFina.y <= r.repisaFina.canto - 1.2 + 1e-9 && r.repisaFina.y >= r.repisaFina.canto - 2.2 - 1e-9,
      'colgado en y=' + r.repisaFina.y + ', fuera de la banda de agarre de v1.28');
  });

  test('un vano de 1 de alto sobre el canto se rechaza (no cabe de pie arriba)', () => {
    assert(r.vanoBajo.st === 'libre', 'se agarro donde no cabe: ' + r.vanoBajo.st);
  });

  test('mover al jugador desde fuera a media subida suelta el parkour', () => {
    assert(r.aborto.enSubida, 'no llego a entrar en la subida');
    assert(r.aborto.st === 'libre', 'siguio en ' + r.aborto.st + ' pese al teletransporte');
  });

  test('un dt gigante no completa la subida de un tiron (tope propio del envoltorio)', () => {
    assert(r.dtGigante.st === 'subiendo', 'con dt=5 s acabo en ' + r.dtGigante.st);
    assert(r.dtGigante.salto < 3, 'con dt=5 s subio ' + r.dtGigante.salto.toFixed(3) + ' de golpe');
  });

  test('game.parkour expone los tunables y los persiste en localStorage', () => {
    assert(r.tunables.guardado === '2.35', 'localStorage guardo ' + r.tunables.guardado);
    assert(r.tunables.leido === 2.2, 'al releer dio ' + r.tunables.leido);
    const esperadas = ['activo', 'alcance', 'alturaMax', 'alturaMin', 'caida', 'duracion', 'estado', 'velLateral', 'version'];
    assert(esperadas.every(k => r.tunables.claves.indexOf(k) >= 0),
      'faltan claves: ' + esperadas.filter(k => r.tunables.claves.indexOf(k) < 0).join(', '));
  });

  test('regresion: el auto-escalon de escala 2 sigue subiendo un bloque entero sin parkour', () => {
    assert(!r.autoEscalon.parkour, 'el parkour se metio en un auto-escalon');
    assert(Math.abs(r.autoEscalon.y - r.autoEscalon.esperado) < 1e-6,
      'acabo en y=' + r.autoEscalon.y + ' y deberia ser ' + r.autoEscalon.esperado);
  });

  test('el mundo del dueño queda como estaba', () => {
    assert(r.limpio, 'algun bloque del escenario no se restauro');
  });

  test('sin excepciones en la pagina', () => {
    assert(errores.length === 0, errores[0]);
  });

  await b.close();
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();