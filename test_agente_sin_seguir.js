// BUG-AG3 · «si se crea un agente articulado sin la capacidad "te persigue" no se renderiza
// correctamente, ademas se quedan las piezas sueltas, no es empujable, no te mira, etc. parece roto».
//
// Se planta el MISMO documento del dueño (data/agentes/personaje-1.json) con `seguir:false` y se le
// pide lo que pide la verificación del ticket: piezas pegadas al rig, apoyado en el suelo, empujable
// y que te mire. Y de paso la fuga que lo destapó: quitar un rig después de un mcRestampAll dejaba
// piezas huérfanas en el mundo.
//
// Hace falta navegador de verdad: el mundo de juguete de test_bloques_comportamiento.js no tiene
// atlas, y sin atlas no hay mcRestampAll — que es justo lo que provoca la fuga.
//
// Se planta en /map/test y los POST van bloqueados: no se guarda nada, no se toca el mundo del dueño.
//
//   node test_agente_sin_seguir.js [url]        por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, cond, extra) {
  if (cond) { console.log('  ok    ' + nombre + (extra ? '   (' + extra + ')' : '')); ok++; }
  else { console.log('  FALLO ' + nombre + (extra ? '\n        ' + extra : '')); fallos++; }
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const escribe = o && String(o.method).toUpperCase() !== 'GET';
      if (escribe && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes')))
        return Promise.resolve(new Response('{}', { status: 200 }));
      return orig(u, o);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && mc.grid && mc.prog', { timeout: 180000 });
  // Que el mundo se quede quieto antes de contar estructuras: los carteles de las notas siguen
  // aterrizando durante segundos (BUG-AG8) y falsearían el «antes».
  await p.waitForFunction(() => {
    const n = mc.structures.length;
    if (window.__ultimoN === n) window.__quietos = (window.__quietos || 0) + 1;
    else { window.__ultimoN = n; window.__quietos = 0; }
    return window.__quietos >= 6;
  }, null, { timeout: 120000, polling: 500 });

  console.log('\n--- ' + URL + ' ---');

  // El banco: se planta al agente EN EL AIRE, 5 bloques por encima del suelo, para que «se apoya en
  // el suelo» sea una medida y no una casualidad de dónde se plantó.
  const prep = await p.evaluate(async () => {
    const d = await (await fetch('/api/agentes/personaje-1')).json();
    const doc = d.doc || d;
    const X = Math.floor(mc.dim.x / 2) + 12, Z = Math.floor(mc.dim.z / 2);
    const suelo = mcSurfaceNear(X, Z, mc.dim.y - 2, 1, mc.dim.y);
    window.__doc = doc;
    window.__sitio = { X, Z, suelo, Y: suelo + 6 };
    window.__antes = mc.structures.length;
    return { piezas: 1 + doc.piezas.length, X, Z, suelo, Y: suelo + 6, antes: mc.structures.length };
  });
  console.log('  ' + prep.piezas + ' piezas · se planta en ' + prep.X + ',' + prep.Y + ',' + prep.Z
    + ' (suelo en y=' + prep.suelo + ', o sea 6 bloques en el aire)');

  // Correr N frames de la física real, con el jugador donde se diga.
  const correr = (o) => p.evaluate((o) => {
    if (o.jugador) mc.pos = o.jugador.slice();
    for (let i = 0; i < o.frames; i++) mcUpdate(1 / 60);
    const rig = window.__rig;
    const R = rig.partes[0], g = R.s && R.s._sig;
    return {
      pegadas: rig.partes.filter(P => P.s && P.s._rig === rig).length,
      total: rig.partes.length,
      y: g ? R.s.oy + g.y : null, x: g ? R.s.ox + g.x : null, z: g ? R.s.oz + g.z : null,
      // Los PIES: `asentar` apoya la caja del CUERPO, no la celda de la raíz (el torso está a media
      // altura del bicho). rig.cuerpo va en coordenadas absolutas, así que el suelo bajo los pies
      // es cuerpo[1] + g.y, y tiene que dar justo la cara de arriba del terreno (suelo + 1).
      pies: g ? rig.cuerpo[1] + g.y : null,
      gx: g ? g.x : null, gy: g ? g.y : null, gz: g ? g.z : null, por: g ? g.por : null,
      // La mirada de la cabeza: es lo único que quiere decir «te mira» (el giro del cuerpo es del
      // que persigue, y este no persigue).
      mira: rig.partes.map(P => P.mirar ? P.giroMira : null).filter(v => v !== null),
      estructuras: mc.structures.length,
    };
  }, o);

  console.log('\n── A · sin «te persigue» se planta un agente, no un montón de piezas ──');
  const A0 = await p.evaluate(async () => {
    const doc = JSON.parse(JSON.stringify(window.__doc)); doc.seguir = false;
    const S = window.__sitio;
    window.__rig = await game.esqueletos.crear(doc, S.X, S.Y, S.Z);
    return window.__rig ? { partes: window.__rig.partes.length, quieto: !!(window.__rig.G && window.__rig.G.quieto) } : null;
  });
  test('game.esqueletos.crear devuelve un agente (antes devolvía null)', !!A0, 'devolvió ' + JSON.stringify(A0));
  test('...con todas sus piezas', A0 && A0.partes === prep.piezas, A0 && A0.partes + ' de ' + prep.piezas);
  test('...y marcado como quieto', !!(A0 && A0.quieto));

  // Jugador lejos: ni lo ve ni le importa.
  const A = await correr({ frames: 120, jugador: [prep.X + 30, prep.suelo + 2, prep.Z] });
  test('las piezas siguen pegadas al rig', A.pegadas === A.total, A.pegadas + ' de ' + A.total);
  test('se apoya en el suelo (se planta 6 bloques en el aire y baja)', Math.abs(A.pies - (prep.suelo + 1)) < 0.2,
    'los pies acabaron en y=' + A.pies.toFixed(2) + ' y la cara de arriba del terreno está en '
    + (prep.suelo + 1) + ' (bajó ' + (-A.gy).toFixed(2) + ')');

  console.log('\n── B · quieto es quieto: no te persigue ──');
  // El jugador se le planta al lado. Uno que persiga se le echa encima; este no se mueve.
  const B = await correr({ frames: 180, jugador: [prep.X + 3, prep.suelo + 2, prep.Z] });
  const derivaB = Math.hypot(B.gx, B.gz);
  test('con el jugador al lado NO da un paso', derivaB < 0.05, 'se movió ' + derivaB.toFixed(3) + ' bloques');
  test('...y se queda en postura de reposo (por=1)', B.por === 1, 'por = ' + B.por);

  console.log('\n── C · pero SÍ te mira ──');
  const C1 = await correr({ frames: 90, jugador: [prep.X + 4, prep.suelo + 2, prep.Z] });
  const C2 = await correr({ frames: 90, jugador: [prep.X - 4, prep.suelo + 2, prep.Z] });
  test('la cabeza tiene mirada', C1.mira.length > 0, C1.mira.length + ' pieza(s) con `mirar`');
  const giroC = Math.abs(C1.mira[0] - C2.mira[0]);
  test('...y cambia al cambiar el jugador de sitio', giroC > 20,
    'giró ' + giroC.toFixed(1) + '° al pasar el jugador de un lado al otro (' +
    C1.mira[0].toFixed(1) + '° → ' + C2.mira[0].toFixed(1) + '°)');

  console.log('\n── D · y SÍ se le empuja ──');
  const antesEmp = await correr({ frames: 1, jugador: [prep.X + 4, prep.suelo + 2, prep.Z] });
  await p.evaluate(() => game.esqueletos.empujar(window.__rig, 8, -1, 0));
  const D = await correr({ frames: 90 });
  test('game.esqueletos.empujar lo mueve', Math.abs(D.x - antesEmp.x) > 0.5,
    'se movió ' + (D.x - antesEmp.x).toFixed(3) + ' bloques');
  test('...y las piezas se van con él', D.pegadas === D.total, D.pegadas + ' de ' + D.total);

  console.log('\n── E · anti-falso-verde: el banco distingue moverse de no moverse ──');
  // B dice «no se movió». Si el rig estuviera muerto (sin paso por frame) B saldría verde igual, así
  // que aquí se planta el MISMO documento CON «te persigue» y tiene que echarse encima del jugador.
  const E = await p.evaluate(async () => {
    const doc = JSON.parse(JSON.stringify(window.__doc));          // este trae su `seguir` de verdad
    const S = window.__sitio;
    const rig = await game.esqueletos.crear(doc, S.X + 8, S.Y, S.Z);
    if (!rig) return { sinRig: true };
    mc.pos = [S.X + 8 + 4, S.suelo + 2, S.Z];
    const R = rig.partes[0], g0 = R.s._sig ? { x: R.s._sig.x, z: R.s._sig.z } : { x: 0, z: 0 };
    for (let i = 0; i < 180; i++) mcUpdate(1 / 60);
    const g = R.s._sig;
    const r = { dx: g.x - g0.x, dz: g.z - g0.z, por: g.por };
    game.esqueletos.quitar(rig);
    return r;
  });
  test('el MISMO agente CON «te persigue» sí se echa encima', !E.sinRig && Math.hypot(E.dx, E.dz) > 1,
    E.sinRig ? 'no se pudo plantar' : 'avanzó ' + Math.hypot(E.dx, E.dz).toFixed(2) + ' bloques hacia el jugador');

  console.log('\n── F · la fuga: quitar un rig no deja piezas por el suelo ──');
  // Es lo que destapó el ticket. mcStampStruct dispara un mcRestampAll cuando el atlas crece, y
  // app.js SUSTITUYE las instancias: quitarEsqueleto borraba por referencia y se saltaba en silencio
  // todas las piezas anteriores al restampado (en la sonda: 6 de 7 se quedaban en el mundo).
  const F = await p.evaluate(() => {
    const n = game.esqueletos.quitar(window.__rig);
    return { retiradas: n, estructuras: mc.structures.length, antes: window.__antes,
             vivos: game.esqueletos.lista().length };
  });
  test('quitar() retira TODAS las piezas', F.retiradas === prep.piezas, F.retiradas + ' de ' + prep.piezas);
  test('...y el mundo queda con las estructuras que tenía', F.estructuras === F.antes,
    F.estructuras + ' ahora vs ' + F.antes + ' antes');
  test('...sin agentes vivos que animar', F.vivos === 0, F.vivos + ' vivos');

  test('no hay errores de página', errores.length === 0, errores.join(' | '));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
