// @area: redstone
// @necesita: servidor, playwright
// test_bug_rs12_piston_cabeza.js
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  let fallos = 0;
  function ok(cond, txt, info) {
    if (cond) console.log('  ok    ' + txt + (info !== undefined ? '   · ' + info : ''));
    else { console.log('  FAIL  ' + txt + (info !== undefined ? '   · ' + info : '')); fallos++; }
  }

  p.on('console', msg => {
    const txt = msg.text();
    if (msg.type() === 'error' && !txt.includes('favicon')) console.log('  [browser error] ' + txt);
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof mc !== 'undefined' && mc.name2id && typeof game !== 'undefined' && game.redstone);

  const res = await p.evaluate(async () => {
    const X = 100, Y = 10, Z = 100;
    // Vaciar zona
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          mcSetBlock(X + dx, Y + dy, Z + dz, 0);
        }
      }
    }

    // Colocar palanca en (X-1, Y, Z), pistón mirando a +X en (X, Y, Z), y lámpara en (X+2, Y, Z) (pegada a donde saldrá la cabeza en X+1, Y, Z)
    mcSetBlock(X - 1, Y, Z, mc.name2id['hab:palanca']);
    mcSetBlock(X, Y, Z, mc.name2id['hab:piston']);
    mcSetBlock(X + 2, Y, Z, mc.name2id['hab:antorcha']); // lámpara o antorcha receptora

    game.redstone.revisarCaja(X - 2, Y - 2, Z - 2, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));

    // Encender palanca
    mcSetBlock(X - 1, Y, Z, mc.name2id['hab:palanca-on']);
    game.redstone.revisarCaja(X - 2, Y - 2, Z - 2, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 15; i++) await new Promise(r => requestAnimationFrame(r));

    const blockPiston = mc.blockKey[mc.grid[mcIdx(X, Y, Z)]];
    const blockCabeza = mc.blockKey[mc.grid[mcIdx(X + 1, Y, Z)]];
    const blockReceptor = mc.blockKey[mc.grid[mcIdx(X + 2, Y, Z)]];
    const infoCabeza = game.redstone.info(X + 1, Y, Z);
    const infoReceptor = game.redstone.info(X + 2, Y, Z);

    return {
      blockPiston,
      blockCabeza,
      blockReceptor,
      infoCabeza,
      infoReceptor
    };
  });

  console.log('\n── RESULTADO BUG-RS12 ──');
  console.log('Pistón en (X,Y,Z):', res.blockPiston);
  console.log('Cabeza en (X+1,Y,Z):', res.blockCabeza);
  console.log('Receptor en (X+2,Y,Z):', res.blockReceptor);
  console.log('Info Cabeza:', res.infoCabeza);
  console.log('Info Receptor:', res.infoReceptor);

  await b.close();
})();