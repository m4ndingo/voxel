// @area: agentes
// @necesita: servidor, playwright
// REQ-MNT1 · «cuando construimos los npcs se les dieron habilidades a algunos como "passengers: true",
// es posible que para un agente articulado le pueda dar esta habilidad a su cabeza desde scripting?».
//
// No lo era: `passengers` vive en mcAgentsSmoothUpdate, que recorre mc.agents (los NPC-CUBO). Un
// agente articulado no esta ahi. Esto comprueba lo que se ha añadido en el snippet:
//
//   A · game.esqueletos.montable() valida lo que le dan y no revienta con basura.
//   B · TRASLACION: la pieza se mueve y el jugador se mueve con ella.
//   C · GIRO: la pieza se vuelve y el jugador ORBITA con ella, en vez de resbalarse.
//   D · apagado: la misma pieza se va andando y el jugador se queda donde estaba.
//   E · no te lleva si no vas encima (de pie al lado, la pieza pasa y no te arrastra).
//
// ⚠️ EL INVARIANTE de B y C es el mismo, y no es un numero a mano: mientras vas montado, TU SITIO
// DENTRO DE LA PIEZA —L = Rᵀ·(p − t), la traspuesta de su matriz— no cambia. Eso es exactamente lo
// que significa «ir montado», vale igual para trasladarse que para girar, y compara dos fuentes
// (donde esta el jugador / donde esta la pieza) en vez de contra una constante escrita a ojo.
//
// No persiste nada: bloquea los POST y retira el agente que crea.
//
//   node test_montar_agente.js [url]        por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.agentes', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  console.log('\n--- ' + URL + ' ---');

  // Si esto falla, todo lo demas es un falso verde: la capacidad la pone el SNIPPET, no app.js.
  const hayApi = await p.evaluate(() => !!(window.game && game.esqueletos && typeof game.esqueletos.montable === 'function'));
  ok(hayApi, 'el snippet expone game.esqueletos.montable() (app.js no sabe de esto)');
  if (!hayApi) { await b.close(); process.exit(1); }

  const r = await p.evaluate(async () => {
    const out = { errs: [], pasos: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    // Un claro con sitio de sobra para plantar un bicho entero y pasearlo.
    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 12) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 20 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 20 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde hacer las pruebas'); return out; }
    const [X, Y, Z] = sitio;

    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie" guardado'); return out; }
    const rig = await game.esqueletos.crear(def, X + 2, Y, Z + 2);
    if (!rig) { out.errs.push('no se pudo crear el agente'); return out; }
    out.agente = rig.nombre; out.agenteId = rig.id;
    // ⚠️ Este test PASEA el rig a mano con game.esqueletos.desplazar(). Desde BUG-AG11, ir montado
    // encima significa «no te veo», y un agente que no te ve con `volver` (el defecto) se vuelve a
    // su ancla — deshaciendo el paseo frame a frame y midiendo 0,4 donde deberia haber 2. Aqui se
    // prueba el ACARREO, no la IA de seguimiento: se le quita el regreso y el rig lo mueve el test.
    rig.G.volver = false;

    // Las matrices las compone el paso del rig, no crear(): sin esperarlas, las piezas siguen en su
    // ancla y el test mediria el mundo equivocado.
    for (let i = 0; i < 60 && !rig.partes.some(P => P.s && P.s.model); i++) await frame();

    out.piezas = rig.partes.map(P => P.nombre);

    // ── A · lo que montable() rechaza ────────────────────────────────────────────────────────────
    out.malaPieza = game.esqueletos.montable(rig.id, 'no-existe-esta-pieza');
    out.malAgente = game.esqueletos.montable(999999, 'cabeza');

    // La cabeza si esta; si el zombie cambiara de piezas, la mas alta sirve igual.
    const alturaDe = (P) => (P.s && P.s.model && P.s.aabb) ? P.s.model[13] + P.s.aabb[4] : -Infinity;
    let obj = rig.partes.find(P => P.nombre === 'cabeza');
    if (!obj) obj = rig.partes.slice().sort((A, B) => alturaDe(B) - alturaDe(A))[0];
    if (!obj || !obj.s || !obj.s.model) { out.errs.push('la pieza elegida no tiene matriz'); return out; }
    out.pieza = obj.nombre;
    out.encendido = game.esqueletos.montable(rig.id, obj.nombre);

    // ── Donde estoy DENTRO de la pieza: L = Rᵀ·(p − t). Es el invariante de todo el test. ────────
    const local = (s) => {
      const m = s.model, p = mc.pos;
      const py = mc._pasoDesfase ? mc._pasoReal : p[1];      // la Y fisica, no la pintada
      const dx = p[0] - m[12], dy = py - m[13], dz = p[2] - m[14];
      return [m[0] * dx + m[1] * dy + m[2] * dz,
              m[4] * dx + m[5] * dy + m[6] * dz,
              m[8] * dx + m[9] * dy + m[10] * dz];
    };
    // ...y el camino de vuelta, para subirse encima: mundo = R·L + t.
    const mundo = (s, L) => {
      const m = s.model;
      return [m[0] * L[0] + m[4] * L[1] + m[8] * L[2] + m[12],
              m[1] * L[0] + m[5] * L[1] + m[9] * L[2] + m[13],
              m[2] * L[0] + m[6] * L[1] + m[10] * L[2] + m[14]];
    };
    const dist = (A, B) => Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    const enLaTapa = async (dx, dz) => {
      const a = obj.s.aabb;
      const L = [(a[0] + a[3]) / 2 + (dx || 0), a[4] + 0.05, (a[2] + a[5]) / 2 + (dz || 0)];
      const w = mundo(obj.s, L);
      mc.pos[0] = w[0]; mc.pos[1] = w[1]; mc.pos[2] = w[2];
      if (mc.vel) { mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0; }
      await frame();
    };

    // Se pasea la pieza y se mira si el jugador sigue en el MISMO sitio de ella. `desplazar` es el
    // primitivo publico que ya existia para mover un rig con la colision de siempre.
    // ⚠️ La referencia es EL PUNTO DE LA PIEZA QUE PISAS (mundo(s, L0)), no la traslacion de su
    // matriz. En cuanto la pieza gira —y gira, porque el bicho se vuelve hacia ti— su origen recorre
    // un arco que tu no recorres, asi que |t1−t0| no es la distancia que te toca viajar. Comparar
    // contra el se lo inventa: el primer intento de este test fallaba con 12.9 vs 3.0 y el acarreo
    // estaba bien.
    const pasear = async (etiqueta, pasos, girar) => {
      const L0 = local(obj.s);
      const p0 = [mc.pos[0], mc.pos[1], mc.pos[2]];
      const q0 = mundo(obj.s, L0);
      let peor = 0;
      for (let i = 0; i < pasos; i++) {
        if (girar) rig.giro = ((rig.giro || 0) + girar);
        else game.esqueletos.desplazar(rig, 0.25, 0, 0);
        await frame();
        const d = dist(L0, local(obj.s));
        if (d > peor) peor = d;
      }
      const q1 = mundo(obj.s, L0);
      const pf = [mc.pos[0], mc.pos[1], mc.pos[2]];
      const paso = { etiqueta,
                     derivaLocal: +peor.toFixed(3),
                     viajePunto: +dist(q0, q1).toFixed(3),      // cuanto viajo el sitio que pisabas
                     viajeJugador: +dist(p0, pf).toFixed(3),    // cuanto viajaste tu
                     separacion: +dist(pf, q1).toFixed(3),      // ...y si acabaste ahi encima
                     giroTotal: girar ? girar * pasos : 0 };
      out.pasos.push(paso);
      return paso;
    };

    // ── B · traslacion ───────────────────────────────────────────────────────────────────────────
    await enLaTapa(0, 0);
    out.subido = +local(obj.s)[1].toFixed(3) >= obj.s.aabb[4] - 0.2;
    out.traslada = await pasear('traslada (montable ON)', 8, 0);

    // ── C · giro. Descentrado a proposito: en el centro del eje, girar no mueve nada y el caso
    //      pasaria sin probar nada (justo el falso verde que ya mordio en REQ-DBG2).
    const a = obj.s.aabb;
    await enLaTapa((a[3] - a[0]) * 0.3, (a[5] - a[2]) * 0.3);
    out.gira = await pasear('gira 15° x8 (montable ON)', 8, 15);

    // ── D · apagado: la misma pieza, el mismo paseo, y el jugador se queda ───────────────────────
    out.apagado = game.esqueletos.montable(rig.id, obj.nombre, false);
    await enLaTapa(0, 0);
    out.suelto = await pasear('traslada (montable OFF)', 8, 0);

    // ── E · no ir encima no te lleva. De pie al lado, a la altura de los pies del bicho. ─────────
    game.esqueletos.montable(rig.id, obj.nombre, true);
    const raiz = rig.partes[0].s;
    mc.pos[0] = raiz.model[12] + 3.5; mc.pos[1] = raiz.model[13]; mc.pos[2] = raiz.model[14] + 3.5;
    if (mc.vel) { mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0; }
    await frame();
    const pl0 = [mc.pos[0], mc.pos[1], mc.pos[2]];
    const tt0 = [obj.s.model[12], obj.s.model[13], obj.s.model[14]];
    for (let i = 0; i < 8; i++) { game.esqueletos.desplazar(rig, 0.25, 0, 0); await frame(); }
    out.alLado = { movioLaPieza: +dist(tt0, [obj.s.model[12], obj.s.model[13], obj.s.model[14]]).toFixed(3),
                   movioElJugador: +dist(pl0, [mc.pos[0], mc.pos[1], mc.pos[2]]).toFixed(3) };

    game.esqueletos.quitar(rig);
    await frame();
    out.retirado = !mc.structures.some(s => s && s._rig);
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok(false, 'preparacion: ' + e));

  console.log('\n── A · montable() valida lo que le dan ──');
  ok(r.encendido === true, 'enciende sobre una pieza que existe', r.agente + ' → «' + r.pieza + '»');
  ok(r.malaPieza === false, 'una pieza que no existe devuelve false (y dice cuales hay)');
  ok(r.malAgente === false, 'un agente que no existe devuelve false');
  ok(r.apagado === false, 'y se puede apagar');
  ok(!!(r.piezas && r.piezas.length > 1), 'el bicho tiene varias piezas', r.piezas && r.piezas.join(', '));

  console.log('\n── B · traslacion: te lleva ──');
  const T = r.traslada || {};
  ok(r.subido === true, 'el jugador arranca de pie sobre la tapa de la pieza');
  ok(T.viajePunto > 1, 'el sitio que pisabas se ha ido lejos (si no, no se prueba nada)', T.viajePunto);
  ok(T.derivaLocal < 0.35,
    'y el jugador NO se mueve DENTRO de la pieza: va montado', 'deriva ' + T.derivaLocal);
  ok(T.separacion < 0.35,
    'visto desde el mundo, acaba encima de ese mismo sitio',
    'a ' + T.separacion + ' tras viajar ' + T.viajeJugador);

  console.log('\n── C · giro: orbitas con ella, no te resbalas ──');
  const G = r.gira || {};
  ok(G.viajeJugador > 0.3, 'girando la pieza, el jugador se mueve por el mundo', G.viajeJugador);
  ok(G.derivaLocal < 0.35,
    'pero sigue en el mismo sitio DE LA PIEZA (el giro tambien te lleva)', 'deriva ' + G.derivaLocal);
  ok(G.separacion < 0.35, 'y encima del mismo punto de ella', G.separacion);

  console.log('\n── D · apagado: la pieza se va y tu te quedas ──');
  const S = r.suelto || {};
  ok(S.viajePunto > 1, 'el sitio que pisabas vuelve a irse lejos', S.viajePunto);
  ok(S.derivaLocal > 1,
    'y ahora SI te quedas atras dentro de ella (montable(false) apaga de verdad)', 'deriva ' + S.derivaLocal);
  ok(S.separacion > 1, 'o sea: la pieza se va sin ti', 'a ' + S.separacion + ' de donde estabas montado');

  console.log('\n── E · no ir encima no te lleva ──');
  ok(!!(r.alLado && r.alLado.movioLaPieza > 1), 'la pieza pasa al lado', r.alLado && r.alLado.movioLaPieza);
  ok(!!(r.alLado && r.alLado.movioElJugador < 0.6),
    'de pie al lado, no te arrastra', r.alLado && r.alLado.movioElJugador);

  console.log('\n── limpieza ──');
  ok(r.retirado === true, 'el agente se retira sin dejar piezas sueltas');
  ok(errores.length === 0, 'sin excepciones en la pagina', errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();