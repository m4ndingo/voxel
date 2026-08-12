// @area: redstone
// @necesita: servidor, playwright
// test_bug_rs13_piston_placa.js
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
    const CLAVES = ['hab:cable', 'hab:palanca', 'hab:palanca-on', 'hab:piston', 'hab:piston-on', 'hab:piston-cabeza', 'hab:placa', 'hab:placa-on'];
    for (const k of CLAVES) {
      if (typeof game.addMaterial === 'function') await game.addMaterial(k);
    }

    // ── PARTE A · La placa empujada vuelve al estado desaccionado 'hab:placa' ────────────────
    const idPiston = mc.name2id['hab:piston'];
    const idPalanca = mc.name2id['hab:palanca'];
    const idPlacaOn = mc.name2id['hab:placa-on'];

    mcSetBlock(X - 1, Y, Z, idPalanca);
    mcSetBlock(X, Y, Z, idPiston);
    mcSetBlock(X + 1, Y, Z, idPlacaOn); // placa encendida en X+1

    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));

    // Encender palanca para extender pistón hacia +X
    mcSetBlock(X - 1, Y, Z, mc.name2id['hab:palanca-on']);
    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));

    const blkEmpujadoA = mc.blockKey[mc.grid[mcIdx(X + 2, Y, Z)]];

    // Limpiar A. Dejar aire NO basta: hay que dejar también el circuito a cero y darle sus frames,
    // o B arranca con la señal de A todavía anotada en esas celdas y el pistón nuevo no llega a ver
    // ningún flanco (se queda sordo con «recibe: 15» de mentira). A esto se llegó por B: desde
    // BUG-RS22 la placa que ocupas se mantiene encendida, así que ya no hay parpadeo que le
    // devolviera el flanco por accidente.
    mcSetBlock(X - 1, Y, Z, 0); mcSetBlock(X, Y, Z, 0); mcSetBlock(X + 1, Y, Z, 0); mcSetBlock(X + 2, Y, Z, 0);
    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));

    // ── PARTE B · Jugador pisando la placa delante del pistón se empuja al avanzar la cabeza ──
    const idPlacaOff = mc.name2id['hab:placa'];
    mcSetBlock(X - 1, Y, Z, idPalanca);
    mcSetBlock(X, Y, Z, idPiston);
    mcSetBlock(X + 1, Y, Z, idPlacaOff); // placa en X+1

    // Posicionar al jugador pisando la placa en X+1, Y+0.05, Z
    mc.pos[0] = X + 1.5;
    mc.pos[1] = Y + 0.05;
    mc.pos[2] = Z + 0.5;
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;

    // La marca se toma AQUI, antes de dejar correr un solo frame, y no después de asentar. Desde
    // BUG-RS22 la placa se SOSTIENE mientras la ocupas (alSeguirPisando) en vez de irse soltando
    // sola, así que un jugador plantado encima la mantiene encendida — y la placa está pegada al
    // pistón, o sea que es ELLA quien lo extiende, sin esperar a la palanca. Eso es lo correcto (en
    // Minecraft pasa igual), pero deja el pistón ya extendido antes de tocar la palanca: midiendo
    // desde después de asentar, el empujón caía fuera de la ventana y parecía no haber existido.
    // Lo que se comprueba es lo mismo de siempre: quien está sobre la placa acaba una celda más allá.
    const posX0 = mc.pos[0];
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));

    // Encender palanca
    mcSetBlock(X - 1, Y, Z, mc.name2id['hab:palanca-on']);
    R.revisarCaja(X - 3, Y - 3, Z - 3, X + 3, Y + 3, Z + 3);
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));

    const posX1 = mc.pos[0];
    const avanceJugador = posX1 - posX0;

    // Limpiar B
    mcSetBlock(X - 1, Y, Z, 0); mcSetBlock(X, Y, Z, 0); mcSetBlock(X + 1, Y, Z, 0); mcSetBlock(X + 2, Y, Z, 0);

    return {
      blkEmpujadoA,
      avanceJugador
    };
  });

  console.log('\n── BUG-RS13 · Placa empujada por pistón y empuje del jugador ──');
  ok(r.blkEmpujadoA === 'hab:placa', 'la placa empujada se restaura a su estado desaccionado «hab:placa»', r.blkEmpujadoA);
  ok(r.avanceJugador > 0.5, 'el jugador pisando la placa es empujado hacia adelante (+X) al extenderse el pistón', Math.round(r.avanceJugador * 100) / 100);

  ok(errores.length === 0, 'sin errores JS', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();