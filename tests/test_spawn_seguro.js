// @area: fisica
// @necesita: servidor, playwright
// BUG-SPAWN1 · «como jugador sin muchos permisos (test2) genero un nuevo mapa llamado /map/playa
// todo va bien, pero al recargarlo aparezco bajo el suelo de la playa, entre el fondo y la arena en
// una cavidad en lugar de sobre la arena» (el dueño, 2026-09-03).
//
// LA CADENA DE DOS FALLOS, porque ninguno de los dos por separado explica el síntoma:
//
//   1. NINGÚN generador pone `mc.spawn`. Comprobado en los 9 snippets `construye-*`: cero menciones.
//      Un mapa recién generado se guarda con el punto que traía `app.js` de fábrica —el centro, a
//      `y = GH+1 = 15`— elegido antes de que existiera el relieve. En `/map/playa` (medido) esa
//      columna es roca maciza de y=1 a y=16 y arena de y=17 a y=20: y=15 está ENTERRADO en roca, no
//      bajo el agua, como se supuso al principio.
//
//   2. `mcUnstick` no lo tapa, y ésta es la parte cara: sube al PRIMER hueco de aire, no a la
//      superficie. Con una bolsa de aire entre la roca y la arena, la bolsa ES el primer hueco y ahí
//      te deja — la «cavidad entre el fondo y la arena» del parte. Y si el spawn cae en agua no
//      mueve nada en absoluto, porque el agua no colisiona y para él eso ya está bien.
//
// El test NO depende de que el mapa que se le dé traiga el fallo: **se fabrica cada escenario** en
// una columna apartada y devuelve el mundo como estaba (celdas y `mc.spawn`). Así vale contra
// `/map/test` y contra cualquier otro.
//
//   A · la API está, y el mundo cargado tiene un spawn pisable
//   B · ENTERRADO en roca      → lo saca a la superficie y avisa una vez
//   C · EL CASO DEL DUEÑO: enterrado CON UNA CAVIDAD encima → sale a la SUPERFICIE, no a la cavidad
//   D · A REMOJO (fluido)      → también lo saca, aunque no haya colisión que desatascar
//   E · idempotente: repetirlo sobre un spawn bueno no mueve nada
//   F · EL INVARIANTE QUE IMPIDE EL FALSO VERDE: un spawn LEGÍTIMO bajo tierra —aire con suelo
//       debajo: una cueva, un sótano, una casa— NO se toca. Sin F, «arreglar el spawn» lo cumpliría
//       igual un `mcSpawnSeguro` que sacara a todo el mundo a la superficie, y eso le movería la
//       casa a quien la construyó ahí.
//
//   node test_spawn_seguro.js [url]     por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  // No se guarda nada: este test mueve `mc.spawn` y excava, y sin esto un PUT dejaría el mapa escrito.
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(() => {
    const out = { escenarios: {} };
    const pisable = (x, y, z) => !mcSolidWalk(x, y, z) && !mcSolidWalk(x, y + 1, z) &&
                                 !mcCeldaFluida(x, y, z) && !mcCeldaFluida(x, y + 1, z);

    out.hayApi = typeof mcSpawnSeguro === 'function' && typeof mcPieSeco === 'function' &&
                 typeof game.spawnSeguro === 'function';

    const s0 = mc.spawn;
    out.cargado = {
      spawn: { x: s0.x | 0, y: s0.y | 0, z: s0.z | 0 },
      pisable: pisable(s0.x | 0, s0.y | 0, s0.z | 0),
      seco: !mcCeldaFluida(Math.floor(mc.pos[0]), Math.floor(mc.pos[1]), Math.floor(mc.pos[2])),
    };

    const spawnPrevio = { x: s0.x, y: s0.y, z: s0.z };
    const posPrevia = mc.pos.slice();
    const tocadas = [];
    const pon = (x, y, z, id) => {
      if (!mcInside(x, y, z)) return;
      tocadas.push([x, y, z, mc.grid[mcIdx(x, y, z)] || 0]);
      mc.grid[mcIdx(x, y, z)] = id;
    };
    // `/map/test` está COMPLETAMENTE VACÍO (rejilla a cero y paleta sin materiales), así que no se
    // puede «coger un id del mundo»: hay que elegirlo y que lo confirme el motor. Cualquier id que no
    // sea 0 ni reemplazable es macizo para `mcSolidWalk`, que es el único predicado que importa aquí.
    let SOLIDO = 0;
    for (let id = 1; id < 64 && !SOLIDO; id++) if (!mcIsReplaceable(id)) SOLIDO = id;
    // Y un fluido solo si este mundo tiene alguno: en un mapa vacío no lo hay y §D se omite.
    let FLUIDO = 0;
    for (let id = 1; id < 250 && !FLUIDO; id++) if (mcIsReplaceable(id) && id !== 0) FLUIDO = id;
    out.SOLIDO = SOLIDO; out.FLUIDO = FLUIDO;

    // Una torre maciza en una columna apartada, con `cima` como primera celda de aire.
    const monta = (cx, cz, base, cima, conCavidad, conFluido) => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        for (let y = base; y < cima; y++) pon(cx + dx, y, cz + dz, SOLIDO);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        for (let y = cima; y < cima + 4; y++) pon(cx + dx, y, cz + dz, 0);
      // La bolsa de aire enterrada donde `mcUnstick` dejaba al jugador. Se hace de TRES de alto y
      // con suelo propio: así es un sitio donde de verdad se podría estar de pie, y el test no pasa
      // por la razón fácil («la cabeza le tocaba la roca»). Es la cavidad del parte del dueño.
      if (conCavidad)
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
          for (let y = base + 5; y < base + 8; y++) pon(cx + dx, y, cz + dz, 0);
      if (conFluido && FLUIDO)
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
          for (let y = cima; y < cima + 3; y++) pon(cx + dx, y, cz + dz, FLUIDO);
    };

    const corre = (nombre, cx, cz, spawnY, opts) => {
      const base = 2, cima = (opts && opts.cima) || spawnY + 6;
      monta(cx, cz, base, cima, !!(opts && opts.cavidad), !!(opts && opts.fluido));
      mc.spawn = { x: cx, y: spawnY, z: cz };
      mc.pos = [cx + 0.5, spawnY, cz + 0.5];
      const movio = mcSpawnSeguro();
      out.escenarios[nombre] = {
        movio,
        spawn: { x: mc.spawn.x | 0, y: mc.spawn.y | 0, z: mc.spawn.z | 0 },
        cima,
        pisable: pisable(mc.spawn.x | 0, mc.spawn.y | 0, mc.spawn.z | 0),
        sueloDebajo: mcSolidWalk(mc.spawn.x | 0, (mc.spawn.y | 0) - 1, mc.spawn.z | 0),
        seco: !mcCeldaFluida(mc.spawn.x | 0, mc.spawn.y | 0, mc.spawn.z | 0),
        segunda: game.spawnSeguro(),
        // ¿La cavidad era de verdad una alternativa? Si no fuese habitable, §C aprobaría solo porque
        // no había dónde equivocarse.
        cavidadHabitable: opts && opts.cavidad ? pisable(cx, base + 5, cz) : null,
        cavidadTieneTecho: opts && opts.cavidad ? mcSolidWalk(cx, base + 8, cz) : null,
      };
    };

    // …y que el motor esté de acuerdo en que lo escrito es macizo: sin esto, todo lo de abajo
    // «pasaría» construyendo con aire.
    pon(30, 1, 30, SOLIDO);
    out.solidoDeVerdad = mcSolidWalk(30, 1, 30);

    corre('enterrado', 30, 30, 6);
    // Spawn en y=4: roca maciza, y con una cavidad DE PIE en y=7..9 justo encima. Es el mapa del
    // dueño en pequeño, y separa los dos arreglos posibles: subir al primer hueco (la cavidad, y=7)
    // o subir a la superficie (y=12). Solo el segundo es correcto.
    // La torre es maciza de y=2 a y=11 y la cavidad le vacía y=7..9, así que le queda TECHO propio
    // (y=10,11) y no se funde con la superficie: hay dos huecos distintos, la cavidad y el cielo.
    corre('cavidad', 45, 45, 4, { cavidad: true, cima: 12 });
    if (FLUIDO) corre('remojo', 60, 30, 12, { fluido: true });

    // F · una cámara de aire SEPULTADA: aire, con suelo debajo. Spawn legítimo ⇒ intocable.
    const cx = 20, cz = 20, cy = 6;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      pon(cx + dx, cy - 1, cz + dz, SOLIDO);
      for (let dy = 0; dy < 3; dy++) pon(cx + dx, cy + dy, cz + dz, 0);
      pon(cx + dx, cy + 3, cz + dz, SOLIDO);
    }
    mc.spawn = { x: cx, y: cy, z: cz };
    mc.pos = [cx + 0.5, cy, cz + 0.5];
    out.cueva = {
      pisable: pisable(cx, cy, cz),
      sueloDebajo: mcSolidWalk(cx, cy - 1, cz),
      sepultada: mcSolidWalk(cx, cy + 3, cz),
      movio: mcSpawnSeguro(),
      spawn: { x: mc.spawn.x | 0, y: mc.spawn.y | 0, z: mc.spawn.z | 0 },
    };

    for (const [x, y, z, id] of tocadas.reverse()) mc.grid[mcIdx(x, y, z)] = id;
    mc.spawn = spawnPrevio;
    mc.pos = posPrevia;
    return out;
  });

  const avisos = [];   // se recogen abajo desde la consola de la página
  console.log('\n§0 la API está puesta');
  ok(r.hayApi, 'mcSpawnSeguro / mcPieSeco / game.spawnSeguro existen');
  ok(r.SOLIDO > 0 && r.solidoDeVerdad, 'el id con el que construye el test es macizo para el motor',
     'solido=' + r.SOLIDO + ' fluido=' + (r.FLUIDO || 'ninguno en este mundo'));

  console.log('\n§A el mundo cargado tiene un spawn donde se puede estar de pie');
  ok(r.cargado.pisable, 'el spawn no es maciza ni fluido (pies y cabeza)', JSON.stringify(r.cargado.spawn));
  ok(r.cargado.seco, 'y el jugador no acaba a remojo');

  const e = r.escenarios;
  console.log('\n§B spawn ENTERRADO en roca → a la superficie');
  ok(e.enterrado && e.enterrado.movio === true, 'mcSpawnSeguro dice que lo movió');
  ok(e.enterrado && e.enterrado.spawn.y === e.enterrado.cima, 'y lo deja en la primera celda de aire de la columna',
     e.enterrado && JSON.stringify(e.enterrado.spawn) + ' cima=' + e.enterrado.cima);
  ok(e.enterrado && e.enterrado.pisable && e.enterrado.sueloDebajo, 'pisable y con suelo debajo');

  console.log('\n§C EL CASO DEL DUEÑO · enterrado CON CAVIDAD encima → sale a la superficie, NO a la cavidad');
  ok(e.cavidad && e.cavidad.cavidadHabitable === true && e.cavidad.cavidadTieneTecho === true,
     'la cavidad es habitable y tiene techo: sí era una alternativa donde equivocarse');
  ok(e.cavidad && e.cavidad.movio === true, 'lo mueve');
  ok(e.cavidad && e.cavidad.spawn.y === e.cavidad.cima,
     'y acaba en la SUPERFICIE, no en la bolsa de aire enterrada (que es donde lo dejaba mcUnstick)',
     e.cavidad && JSON.stringify(e.cavidad.spawn) + ' cima=' + e.cavidad.cima);

  console.log('\n§D spawn A REMOJO → también lo saca (el agua no colisiona: mcUnstick no lo veía)');
  if (e.remojo) {
    ok(e.remojo.movio === true, 'lo mueve');
    ok(e.remojo.seco, 'y el sitio nuevo está seco', JSON.stringify(e.remojo.spawn));
  } else {
    console.log('  --  este mundo no tiene material de fluido en la paleta; escenario omitido');
  }

  console.log('\n§E idempotente');
  ok(e.enterrado && /ya era pisable/.test(e.enterrado.segunda), 'repetirlo sobre un spawn bueno no mueve nada',
     e.enterrado && e.enterrado.segunda);

  console.log('\n§F un spawn LEGÍTIMO bajo tierra NO se toca (cueva / sótano / casa)');
  ok(r.cueva.pisable && r.cueva.sueloDebajo && r.cueva.sepultada,
     'la cámara de prueba es aire, con suelo debajo y sepultada');
  ok(r.cueva.movio === false, 'mcSpawnSeguro NO lo mueve');
  ok(r.cueva.spawn.y === 6, 'y el spawn se queda en su cueva', JSON.stringify(r.cueva.spawn));

  await b.close();
  console.log('\n' + (fallos ? '❌  ' + fallos + ' fallos' : '✅  0 fallos'));
  process.exit(fallos ? 1 : 0);
})();
