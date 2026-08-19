// @area: general
// @necesita: servidor, playwright
// REQ-SNP7 — «*volver al juego no tendria que recargar el snippet del mapa*» (nota del dueño en
// /map/bugfinder, 50,14,40).
//
// `openWorld()` corría `mcAutoarranque()` SIEMPRE, y volver del editor 2D/3D pasa por ahí. O sea que
// cada Alt+C + volver re-ejecutaba entero `mundo-autoarranque` y `mundo-<mapa>`: plantar otra vez lo
// plantado, montar otro bucle encima del que ya corría y re-ligar teclas ya ligadas. Ahora arranca
// SOLO la primera entrada, y quien necesite hacer algo al volver lo registra con
// `game.alVolverAlMundo(clave, fn)` — así `app.js` sigue sin saber qué hace ningún snippet.
//
// ⚠️ Trampas:
//   · No vale mirar «¿sigue existiendo game.redstone?» para saber si re-arrancó: un segundo arranque
//     también lo dejaría puesto. Lo que se cuenta es el número de LLAMADAS a `mcAutoarranque`, con un
//     envoltorio propio del test (que se quita al final).
//   · La ida al editor es `closeWorld()` + `openWorld()`, no una recarga: si esto empezara a recargar
//     la página, el contador del test se iría con ella y el test se caería, que es lo que se quiere.
//   · `openWorld()` es `async` y se espera de verdad; sin `await` se mide antes de que arranque nada.

const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  // El autoarranque publicado tarda en montar lo suyo, y `mc.active` llega ANTES que él: se espera a
  // `game.redstone.conmutar` —lo último que deja puesto `mundo-autoarranque`— o el test mediría el
  // «sigue en pie» contra un mundo que todavía no había arrancado nada.
  await p.waitForFunction('typeof game!=="undefined" && game.redstone && typeof game.redstone.conmutar==="function"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);

  console.log('\nA · el gancho existe y se comporta como game.bloques.define');
  const a = await p.evaluate(() => {
    const out = { hay: typeof game.alVolverAlMundo === 'function' };
    window._snp7 = { vueltas: 0, otras: 0, petardas: 0 };
    // La misma clave dos veces REEMPLAZA (no encadena): re-ejecutar un snippet a mano con Alt+C no
    // puede dejar dos copias del mismo callback vivas.
    game.alVolverAlMundo('test-snp7', () => { window._snp7.vueltas += 100; });
    game.alVolverAlMundo('test-snp7', () => { window._snp7.vueltas++; });
    // Una segunda clave, para ver que conviven; y una que revienta, para ver que no arrastra a nadie.
    game.alVolverAlMundo('test-snp7-otra', () => { window._snp7.otras++; });
    game.alVolverAlMundo('test-snp7-mala', () => { window._snp7.petardas++; throw new Error('a propósito'); });
    out.sinClave = game.alVolverAlMundo('', () => {});
    out.noFuncion = game.alVolverAlMundo('test-snp7-nofn', 42);
    // Y el contador de arranques: se envuelve mcAutoarranque para contar LLAMADAS, no efectos.
    if (!window.mcAutoarranque._snp7) {
      const orig = window.mcAutoarranque;
      const env = async function () { window._snp7.arranques = (window._snp7.arranques || 0) + 1; return orig.apply(this, arguments); };
      env._snp7 = true; env._orig = orig; window.mcAutoarranque = env;
    }
    window._snp7.arranques = 0;
    out.redstoneAlEntrar = !!(game.redstone && typeof game.redstone.conmutar === 'function');
    return out;
  });
  ok('game.alVolverAlMundo existe', a.hay);
  ok('sin clave no registra nada (y avisa)', a.sinClave === null);
  ok('lo que no es función tampoco', a.noFuncion === null);
  ok('el mundo YA arrancó sus snippets al entrar (game.redstone montado)', a.redstoneAlEntrar === true);

  console.log('\nB · ir al editor y volver NO re-arranca los snippets');
  await p.evaluate(async () => { closeWorld(); });
  await p.waitForTimeout(600);
  ok('closeWorld() deja el Mundo parado sin tirar la rejilla', await p.evaluate(() => !mc.active && !!mc.grid));
  await p.evaluate(async () => { await openWorld(); });
  await p.waitForFunction('mc.active===true', null, { timeout: 120000 });
  await p.waitForTimeout(800);

  const bres = await p.evaluate(() => ({
    arranques: window._snp7.arranques,
    vueltas: window._snp7.vueltas,
    otras: window._snp7.otras,
    petardas: window._snp7.petardas,
    redstone: !!(game.redstone && typeof game.redstone.conmutar === 'function'),
    grid: !!mc.grid,
  }));
  ok('mcAutoarranque NO se volvió a llamar', bres.arranques === 0, 'llamadas=' + bres.arranques);
  ok('…pero el callback de vuelta SÍ, una vez', bres.vueltas === 1, 'vueltas=' + bres.vueltas);
  ok('la clave repetida reemplazó en vez de encadenar', bres.vueltas === 1, '100 = corrió el viejo');
  ok('y el de otra clave también corrió', bres.otras === 1, 'otras=' + bres.otras);
  ok('el callback que revienta no impide que corran los demás', bres.petardas === 1);
  ok('lo que montaron los snippets sigue en pie (game.redstone)', bres.redstone === true);
  ok('y el mundo es el MISMO (no se recargó la página)', bres.grid === true);

  console.log('\nC · la segunda vuelta cuenta otra vez, y borrar la clave la calla');
  await p.evaluate(() => { game.alVolverAlMundo('test-snp7-mala', null); });
  await p.evaluate(async () => { closeWorld(); });
  await p.waitForTimeout(400);
  await p.evaluate(async () => { await openWorld(); });
  await p.waitForFunction('mc.active===true', null, { timeout: 120000 });
  await p.waitForTimeout(800);
  const c = await p.evaluate(() => ({
    arranques: window._snp7.arranques, vueltas: window._snp7.vueltas, petardas: window._snp7.petardas,
  }));
  ok('sigue sin re-arrancar', c.arranques === 0, 'llamadas=' + c.arranques);
  ok('la vuelta se avisa cada vez (2 idas y venidas ⇒ 2)', c.vueltas === 2, 'vueltas=' + c.vueltas);
  ok('pasar null da de baja la clave', c.petardas === 1, 'petardas=' + c.petardas);

  // Dejar la página como estaba: fuera los callbacks del test y el envoltorio del contador.
  await p.evaluate(() => {
    for (const k of ['test-snp7', 'test-snp7-otra', 'test-snp7-mala']) game.alVolverAlMundo(k, null);
    if (window.mcAutoarranque._snp7) window.mcAutoarranque = window.mcAutoarranque._orig;
  });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
