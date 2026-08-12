// @area: redstone
// @necesita: servidor, playwright
// test_bug_rs12_piston_cabeza_sin_energia.js
const { chromium } = require('playwright');
const fs = require('fs');

const motor = fs.readFileSync(__dirname + '/../redstone/redstone.js', 'utf8');
const piezas = fs.readFileSync(__dirname + '/../redstone/redstone-piezas.js', 'utf8');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;

  function ok(cond, txt, extra) {
    if (!cond) fallos++;
    console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra ? '   · ' + extra : ''));
  }

  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined" && game.redstone', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const R = game.redstone;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;

    let caja = null;
    const AN = 20, AL = 8, PR = 20;
    const yTop = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 4; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) return { err: 'no hay caja libre' };

    const [X, Y, Z] = caja;

    // Precargar materiales
    const CLAVES = ['hab:cable', 'hab:palanca', 'hab:palanca-on', 'hab:piston', 'hab:piston-on', 'hab:piston-cabeza'];
    for (const k of CLAVES) {
      if (typeof game.addMaterial === 'function') await game.addMaterial(k);
    }

    // Colocar palanca en (X-1, Y, Z), pistón en (X, Y, Z) mirando a +X, y cable receptor en (X+2, Y, Z)
    const idPiston = mc.name2id['hab:piston'];
    const idPalanca = mc.name2id['hab:palanca'];
    const idCable = mc.name2id['hab:cable'];

    mcSetBlock(X - 1, Y, Z, idPalanca);
    mcSetBlock(X, Y, Z, idPiston);
    mcSetBlock(X + 2, Y, Z, idCable);

    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));

    // Encender la palanca
    mcSetBlock(X - 1, Y, Z, mc.name2id['hab:palanca-on']);
    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));

    const blkPiston = mc.blockKey[mc.grid[mcIdx(X, Y, Z)]];
    const blkCabeza = mc.blockKey[mc.grid[mcIdx(X + 1, Y, Z)]];
    const blkCable = mc.blockKey[mc.grid[mcIdx(X + 2, Y, Z)]];

    const infoCabeza = R.info(X + 1, Y, Z);
    const infoCable = R.info(X + 2, Y, Z);

    // Desmontar
    mcSetBlock(X - 1, Y, Z, 0);
    mcSetBlock(X, Y, Z, 0);
    mcSetBlock(X + 1, Y, Z, 0);
    mcSetBlock(X + 2, Y, Z, 0);

    return {
      blkPiston,
      blkCabeza,
      blkCable,
      infoCabeza,
      infoCable
    };
  });

  console.log('\n── BUG-RS12 · La cabeza del pistón no transmite energía ──');
  ok(r.blkPiston === 'hab:piston-on', 'el pistón se extiende a hab:piston-on', r.blkPiston);
  ok(r.blkCabeza === 'hab:piston-cabeza', 'la cabeza ocupa la casilla colindante hab:piston-cabeza', r.blkCabeza);
  ok(r.infoCabeza && (r.infoCabeza.recibe === 0 || r.infoCabeza.conduce === false), 'la cabeza del pistón no conduce ni emite energía', JSON.stringify(r.infoCabeza));
  ok(r.infoCable && r.infoCable.recibe === 0, 'el cable/receptor pegado a la cabeza NO recibe energía a través de la cabeza', JSON.stringify(r.infoCable));

  ok(errores.length === 0, 'sin errores JS', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();