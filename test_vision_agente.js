// @area: agentes
// @necesita: servidor, playwright
// BUG-AG9 + BUG-AG10 · qué puede ver un agente articulado.
//
// El dueño: «si me pongo encima de su cabeza no debería verme puesto que los ojos no pueden mirar en
// ese ángulo z, y tampoco si paso por detrás de él no debería poder verme para comenzar a seguirme».
//
// Son dos capacidades distintas y aquí van por separado:
//   A · `mirar` (por PIEZA) medía un solo ángulo, el horizontal. Encima de su cabeza el objetivo
//       queda casi vertical y la cabeza te seguía encarando. Ahora hay cono vertical (`limites.x`).
//   B · `seguir` (del BICHO) detectaba en una ESFERA: pasarle por la espalda dentro del radio le
//       hacía darse la vuelta y perseguirte. Ahora hay `vision`, y solo decide EMPEZAR.
//
// Cada mitad lleva su ANTI-FALSO-VERDE, que es lo que aquí cuesta: «no se movió» y «no te vio» se
// leen igual en un log. Por eso el mismo sitio se repite con la válvula de escape abierta
// (`limites.x:[-90,90]` · `vision:360`) y ahí SÍ tiene que reaccionar: si no, lo que se ha probado
// es que el banco no funciona.
//
// Dos trampas del banco que costaron un verde falso y un rojo falso, y por eso están escritas:
//   · el jugador CAE. Clavarle `mc.pos` cada frame no basta: `mc.vel` sigue acumulando y en un solo
//     mcUpdate baja más de un bloque, así que «3 por encima de su cabeza» acaban siendo 1,5 y el
//     ángulo cruza el tope al revés. Hay que poner también la velocidad a cero.
//   · en /map/test hay estructuras: si cada caso anda hacia un lado distinto, «no se movió» puede
//     querer decir «tenía una pared delante». Todos los casos de B andan hacia el MISMO lado y lo
//     único que cambia entre ellos es hacia dónde mira el bicho.
//
// Se planta en /map/test y los POST van bloqueados: no se guarda nada, no se toca el mundo del dueño.
//
// node test_vision_agente.js [url]   — por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, cond, extra) {
  if (cond) { console.log('  ok    ' + nombre + (extra ? '  (' + extra + ')' : '')); ok++; }
  else { console.log('  FALLO ' + nombre + (extra ? '\n        ' + extra : '')); fallos++; }
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = function (u, o) {
      const m = (o && String(o.method).toUpperCase()) || 'GET';
      if (m !== 'GET' && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes')))
        return Promise.resolve(new Response('{}', { status: 200 }));
      return f.apply(this, arguments);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  // Ojo: `mc` NO cuelga de window (es del ámbito del script), así que `window.mc` da undefined y
  // la espera no se cumpliría nunca. Se nombra pelado, como en el resto de los tests.
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForFunction(() => {
    const n = mc.structures.length;
    if (window.__ultimoN === n) window.__quietos = (window.__quietos || 0) + 1;
    else { window.__ultimoN = n; window.__quietos = 0; }
    return window.__quietos >= 6;
  }, null, { timeout: 120000, polling: 500 });

  console.log('\n--- ' + URL + ' ---');

  const prep = await p.evaluate(async () => {
    const d = await (await fetch('/api/agentes/personaje-1')).json();
    window.__doc = d.doc || d;
    const X = Math.floor(mc.dim.x / 2) + 12, Z = Math.floor(mc.dim.z / 2);
    const suelo = mcSurfaceNear(X, Z, mc.dim.y - 2, 1, mc.dim.y);
    window.__sitio = { X, Z, suelo };

    // La NARIZ del bicho es rig.giro + rig.horneado: es la misma cuenta del punto 3 de
    // esqueletosPaso, al revés. De ahí salen «delante», «detrás» y «al costado».
    window.__nariz = function (rig) {
      const a = (rig.giro + rig.horneado) * Math.PI / 180;
      return { fx: Math.sin(a), fz: -Math.cos(a), lx: Math.cos(a), lz: Math.sin(a) };
    };
    window.__cabeza = function (rig) {
      const P = rig.partes.filter(q => q.mirar)[0];
      if (!P || !P.s || !P.s.aabb) return null;
      const aa = P.s.aabb, g = rig.partes[0].s._sig;
      return { x: (aa[0] + aa[3]) / 2 + g.x, y: (aa[1] + aa[4]) / 2 + g.y, z: (aa[2] + aa[5]) / 2 + g.z };
    };
    // N frames de la física de verdad con el jugador CLAVADO. La velocidad a cero es obligatoria:
    // sin ella cae ~1 bloque dentro del mismo mcUpdate y la medida se hace desde otro sitio.
    window.__correr = function (rig, pos, frames) {
      const R = rig.partes[0], g0 = { x: R.s._sig.x, z: R.s._sig.z };
      for (let i = 0; i < frames; i++) {
        if (pos) { mc.pos[0] = pos[0]; mc.pos[1] = pos[1]; mc.pos[2] = pos[2]; mc.vel[0] = mc.vel[1] = mc.vel[2] = 0; }
        mcUpdate(1 / 60);
      }
      const g = R.s._sig, P = rig.partes.filter(q => q.mirar)[0];
      return { mira: P ? P.giroMira : null, por: g.por, pide: Math.round(g.pide * 100) / 100,
               frente: Math.round(rig.angObj * 10) / 10,
               anduvo: Math.hypot(g.x - g0.x, g.z - g0.z) };
    };
    return { X, Z, suelo };
  });
  console.log('  banco: /map/test, suelo en y=' + prep.suelo + ', agentes en x=' + prep.X);

  // ────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n── A · BUG-AG9 · encima de su cabeza NO te ve ──');
  // El agente va con `seguir:false`: si persiguiera, se movería entre medición y medición y el
  // «encima de la cabeza» dejaría de estar encima de la cabeza.
  const A = await p.evaluate(async () => {
    const doc = JSON.parse(JSON.stringify(window.__doc));
    doc.seguir = false;
    const S = window.__sitio;
    const rig = await game.esqueletos.crear(doc, S.X, S.suelo + 2, S.Z);
    if (!rig) return { sinRig: true };
    for (let i = 0; i < 60; i++) mcUpdate(1 / 60);          // que se asiente antes de medir
    const c = window.__cabeza(rig), n = window.__nariz(rig);
    if (!c) return { sinCabeza: true };

    // AL COSTADO y a la altura de la cabeza: el cono horizontal pide ~90° y se pinza en el tope,
    // así que «te ve» es un número grande y no un ruido de 2°.
    const vLado = window.__correr(rig, [c.x + n.lx * 3, c.y, c.z + n.lz * 3], 120);

    // ENCIMA, con el mismo desvío al costado (0.6) para que el objetivo horizontal siga siendo el
    // mismo lado: lo único que cambia entre las dos medidas es la ALTURA.
    const vArriba = window.__correr(rig, [c.x + n.lx * 0.6, c.y + 3, c.z + n.lz * 0.6], 120);

    game.esqueletos.quitar(rig);
    return { lado: vLado, arriba: vArriba, alto: Math.round(Math.atan2(3, 0.6) * 1800 / Math.PI) / 10,
             mirar: doc.piezas[0].mirar };
  });
  test('el agente de prueba tiene una pieza con `mirar`', !A.sinRig && !A.sinCabeza,
       JSON.stringify(A.sinRig || A.sinCabeza || A.mirar));
  test('a su costado y a su altura SÍ te mira', Math.abs(A.lado.mira) > 40,
       'la cabeza giró ' + A.lado.mira.toFixed(1) + '° (tope ±70)');
  test('3 bloques por encima de su cabeza (' + A.alto + '°) vuelve a reposo', Math.abs(A.arriba.mira) < 5,
       'la cabeza quedó en ' + A.arriba.mira.toFixed(1) + '°, y antes estaba en ' + A.lado.mira.toFixed(1) + '°');

  console.log('\n── A bis · anti-falso-verde: con el cuello libre, ese MISMO sitio sí gira ──');
  // Sin esto, «0°» podría querer decir «desde ahí el giro que pide es 0», que es justo lo que pasa
  // si uno se pone en el eje del bicho (la lección de REQ-DBG2).
  const A2 = await p.evaluate(async () => {
    const doc = JSON.parse(JSON.stringify(window.__doc));
    doc.seguir = false;
    doc.piezas[0].mirar.limites.x = [-90, 90];              // la válvula: el cilindro de antes
    const S = window.__sitio;
    const rig = await game.esqueletos.crear(doc, S.X + 8, S.suelo + 2, S.Z);
    if (!rig) return { sinRig: true };
    for (let i = 0; i < 60; i++) mcUpdate(1 / 60);
    const c = window.__cabeza(rig), n = window.__nariz(rig);
    const v = window.__correr(rig, [c.x + n.lx * 0.6, c.y + 3, c.z + n.lz * 0.6], 120);
    game.esqueletos.quitar(rig);
    return v;
  });
  test('con limites.x:[-90,90] el mismo sitio de encima SÍ le gira la cabeza', Math.abs(A2.mira) > 40,
       'la cabeza giró ' + A2.mira.toFixed(1) + '° (con el cono por defecto se quedaba en '
       + A.arriba.mira.toFixed(1) + '°)');

  // ────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n── B · BUG-AG10 · por la espalda no empieza a seguirte ──');
  const B = await p.evaluate(async () => {
    const S = window.__sitio, X = S.X + 16, Z = S.Z;
    // Mismo sitio y mismo lado al que andar (+z) en los tres casos; lo único que cambia es hacia
    // dónde mira. `rig.giro` se pone a mano porque plantar mirando a un lado concreto no es algo
    // que la API ofrezca, y girar el mundo entero para probar esto sería peor.
    const plantar = async (vision, giro, x) => {
      const doc = JSON.parse(JSON.stringify(window.__doc));
      doc.seguir = { deteccion: 16, distancia: 1.2, velocidad: 2.2, correa: 0, suavidad: 0.12 };
      if (vision !== undefined) doc.seguir.vision = vision;
      const rig = await game.esqueletos.crear(doc, x, S.suelo + 2, Z);
      if (!rig) return null;
      for (let i = 0; i < 60; i++) mcUpdate(1 / 60);
      rig.giro = giro;         // 0 = la nariz al -z (el jugador, que va al +z, le queda a la espalda)
      return rig;
    };
    const donde = (rig, d) => [rig.eje[0] + rig.partes[0].s._sig.x, S.suelo + 2,
                               rig.eje[2] + rig.partes[0].s._sig.z + d];

    // El caso con la esfera abierta va PRIMERO y hace de calibración del banco: /map/test se llena
    // de estructuras con el tiempo, y un sitio donde el bicho tenga una pared al +z daría «no se
    // movió» en TODOS los casos, o sea un verde precioso que no prueba nada. Se prueban varios
    // sitios y se elige el primero donde un bicho que SÍ tiene que arrancar arranca de verdad.
    let sitio = 0, esfera = null, vis360 = 0;
    const probados = [];
    for (const dx of [24, 32, 40, 48, 16, 8]) {
      const r = await plantar(360, 0, X + dx);
      if (!r) continue;
      const v = window.__correr(r, donde(r, 5), 240);
      vis360 = r.G.vision;
      game.esqueletos.quitar(r);
      probados.push('x+' + dx + ': ' + v.anduvo.toFixed(2) + ' (' + v.por + ')');
      if (v.anduvo > 1) { sitio = X + dx; esfera = v; break; }
    }
    if (!esfera) return { sinSitio: true, probados };

    const r1 = await plantar(undefined, 0, sitio);
    if (!r1) return { sinRig: true };
    const espalda = window.__correr(r1, donde(r1, 5), 240);
    const vision = r1.G.vision;
    game.esqueletos.quitar(r1);

    const r2 = await plantar(undefined, 180, sitio);
    const frente = window.__correr(r2, donde(r2, 5), 240);
    // Y una vez en faena, rodearle no le hace perderte: el cono es para EMPEZAR. Se le da la
    // espalda AL BICHO (se le gira) y se aleja el jugador; si el cono se midiera cada frame, aquí
    // se rendiría (por=1) y con `volver` se iría a su ancla, o sea alejándose.
    r2.giro = 0;
    const rodeo = window.__correr(r2, donde(r2, 8), 120);
    game.esqueletos.quitar(r2);

    return { espalda, frente, rodeo, esfera, vision, vis360, sitio, probados };
  });
  if (B.sinSitio || B.sinRig) {
    // Rojo, no verde: sin banco no hay medida. Es exactamente el caso que este test tiene que
    // evitar, así que no se disimula.
    test('hay un sitio en /map/test donde medir la persecución', false,
         'ninguno sirvió: ' + (B.probados || []).join(' · '));
    console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
    await b.close();
    process.exit(1);
  }
  console.log('  banco de B: x=' + B.sitio + ' (sitios probados: ' + B.probados.join(' · ') + ')');
  test('`vision` sale del normalizado con su defecto', B.vision === 180, 'vision = ' + B.vision);
  test('a 5 bloques POR LA ESPALDA no da un paso', B.espalda.anduvo < 0.05,
       'anduvo ' + B.espalda.anduvo.toFixed(3) + ' bloques · el jugador le queda a ' + B.espalda.frente + '°');
  test('...y el diagnóstico sigue diciendo a qué distancia estás', B.espalda.pide > 4 && B.espalda.pide < 6,
       'g.pide = ' + B.espalda.pide + ' (si saliera 0, la tabla de game.esqueletos() mentiría)');
  test('a 5 bloques DE FRENTE sí se te echa encima', B.frente.anduvo > 1,
       'anduvo ' + B.frente.anduvo.toFixed(2) + ' bloques y se quedó a ' + B.frente.pide);
  test('ya persiguiéndote, rodearle no le hace perderte', B.rodeo.por === 0 && B.rodeo.pide < 7,
       'estado ' + B.rodeo.por + ', se quedó a ' + B.rodeo.pide + ' de los 8 a los que se puso el jugador');

  console.log('\n── B bis · anti-falso-verde: con vision:360 esa MISMA espalda sí le arranca ──');
  test('con vision:360 la esfera de antes vuelve intacta', B.vis360 === 360 && B.esfera.anduvo > 1,
       'vision ' + B.vis360 + ', anduvo ' + B.esfera.anduvo.toFixed(2) + ' bloques desde su espalda');

  test('sin excepciones en consola', errores.length === 0, errores.join(' · '));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();