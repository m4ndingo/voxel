// REQ-COGER1 · las tres cosas que el primer sondeo no mira:
//   1. la ballesta DE VERDAD (sin redefinirla) equipa la herramienta al acercarse,
//   2. la via de la REJILLA (un material 16³ macizo), que es la otra mitad del mundo,
//   3. `consume:false` — se queda puesta y NO se repite mientras sigues al lado (flanco).
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  p.on('pageerror', (e) => console.log('  [error]', String(e).slice(0, 200)));
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques, null, { timeout: 30000 });
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  const anda = `async (pasos) => {
    for (let i = 0; i < pasos; i++) { mc.pos[0] += 0.1; mcUpdate(0.016); await new Promise(r => setTimeout(r, 20)); }
  }`;

  // 1) La ballesta de verdad.
  const uno = await p.evaluate(async () => {
    const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    const antes = game.playerTool;
    await game.stamp('ballesta', x, y, z);
    for (let i = 0; i < 45; i++) { mc.pos[0] += 0.1; mcUpdate(0.016); await new Promise(r => setTimeout(r, 25)); }
    return { antes: antes, despues: game.playerTool };
  });
  console.log('1· ballesta real  : playerTool', uno.antes, '→', uno.despues,
    uno.despues === 'ballesta' ? '  ✓ equipada al acercarse' : '  ⛔ NO se equipo');

  // 2) La via de la rejilla + 3) el flanco de consume:false.
  const dos = await p.evaluate(async () => {
    const out = { rejilla: null, veces: 0, vecesTrasIrYVolver: 0 };
    let n = 0, ultimo = null;
    // hierba es un 16³ macizo ⇒ vive en mc.grid, no en mc.structures.
    game.bloques.define('asset:assets/hierba.vox.json',
      { nota: 'prueba rejilla', alcance: 0.9, consume: false, alCoger: (c) => { n++; ultimo = c; } });
    // Andar por encima de la hierba unos cuantos frames: la celda de los pies es hierba.
    for (let i = 0; i < 25; i++) { mcUpdate(0.016); await new Promise(r => setTimeout(r, 25)); }
    out.rejilla = ultimo ? { tipo: ultimo.tipo, clave: ultimo.clave } : null;
    out.veces = n;
    // Sigue quieto: el flanco no debe volver a disparar la MISMA celda.
    const marca = n;
    for (let i = 0; i < 25; i++) { mcUpdate(0.016); await new Promise(r => setTimeout(r, 25)); }
    out.repiteQuieto = n - marca;
    // Y la pieza sigue puesta (consume:false).
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1] - 0.5), bz = Math.floor(mc.pos[2]);
    out.sigueAhi = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '(aire)';
    game.bloques.olvida ? game.bloques.olvida('asset:assets/hierba.vox.json') : 0;
    return out;
  });
  console.log('2· via rejilla    :', JSON.stringify(dos.rejilla),
    dos.rejilla && dos.rejilla.tipo === 'rejilla' ? '  ✓ la rejilla tambien dispara' : '  ⛔ la rejilla no dispara');
  console.log('3· flanco         : disparos', dos.veces, '· repite quieto:', dos.repiteQuieto,
    dos.repiteQuieto === 0 ? '  ✓ no se repite' : '  ⛔ SE REPITE');
  console.log('   consume:false  : la celda sigue siendo', dos.sigueAhi);

  await nav.close();
  const ok = uno.despues === 'ballesta' && dos.rejilla && dos.rejilla.tipo === 'rejilla' && dos.repiteQuieto === 0;
  process.exit(ok ? 0 : 1);
})();
