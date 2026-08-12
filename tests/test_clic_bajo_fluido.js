// @area: redstone
// @necesita: servidor, playwright
// BUG-RS24 — El rayo fino del redstone (clic central / clic derecho) NO puede pararse en el agua.
// Desde REQ-FLUID4 un fluido es un macizo 16³ que se dibuja con geometría fina, o sea que su `bits`
// está lleno: `miraFina` se paraba en la primera celda de líquido y una palanca sumergida (o detrás
// de una lámina de agua) dejaba de poder conmutarse.
//
// El tramo D es el anti-falso-verde: sin agua por medio nada de esto cambia, y el rayo tiene que
// seguir parándose en el CABLE fino de siempre en vez de atravesarlo.

const { chromium } = require('playwright');
const fs = require('fs');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor = fs.readFileSync(__dirname + '/../redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/../redstone/redstone-piezas.js', 'utf8');

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const res = await p.evaluate(async () => {
    const out = { log: [] };
    for (const m of ['hab:palanca', 'hab:palanca-on', 'hab:roca', 'hab:cable', 'hab:cable-on']) {
      if (!mc.name2id[m]) { try { await game.addMaterial(m); } catch (e) { out.log.push(m + ': ' + e.message); } }
    }

    // Banqueta propia, alta y despejada, dentro de los 96x40x96 de /map/test.
    const X = 20, Y = 30, Z = 20;
    const idRoca = mc.name2id['hab:roca@0'] || mc.name2id['hab:roca'];
    const idPal = mc.name2id['hab:palanca@0'] || mc.name2id['hab:palanca'];
    const idCable = mc.name2id['hab:cable@0'] || mc.name2id['hab:cable'];

    const limpiar = () => {
      for (let dx = -7; dx <= 2; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++)
        mcSetBlock(X + dx, Y + dy, Z + dz, 0);
      // Cubeta estanca: suelo y paredes, o el agua se reparte por medio mundo en niveles finísimos.
      for (let dx = -7; dx <= 2; dx++) for (let dz = -3; dz <= 3; dz++) mcSetBlock(X + dx, Y - 1, Z + dz, idRoca);
      for (let dx = -7; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) {
        mcSetBlock(X + dx, Y + dy, Z - 3, idRoca); mcSetBlock(X + dx, Y + dy, Z + 3, idRoca);
      }
      for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy <= 2; dy++) mcSetBlock(X - 7, Y + dy, Z + dz, idRoca);
    };
    // Ojo a -X mirando a +X: dx = -sin(yaw)·cos(pitch) = 1  ⇒  yaw = -PI/2.
    const mirarA = (bx) => {
      mc.pos[0] = bx + 0.5; mc.pos[1] = Y - MC_EYE * (mc.scale || 1); mc.pos[2] = Z + 0.5;
      mc.yaw = -Math.PI / 2; mc.pitch = 0;
    };
    const claveEn = (x, y, z) => mc.blockKey[mc.grid[mcIdx(x, y, z)]] || null;
    const esperarFluido = () => new Promise(r => setTimeout(r, 500));

    // ── A · en seco la palanca se apunta y se conmuta ────────────────────────────
    limpiar();
    mcSetBlock(X, Y, Z, idPal);
    mirarA(X - 3);
    out.A_apuntada = game.redstone.apuntada(6);
    out.A_antes = claveEn(X, Y, Z);
    out.A_conmuto = !!(out.A_apuntada && game.redstone.conmutar(...out.A_apuntada));
    out.A_despues = claveEn(X, Y, Z);

    // ── B · con la celda de delante inundada, la palanca sigue siendo alcanzable ─
    limpiar();
    mcSetBlock(X, Y, Z, idPal);
    mirarA(X - 3);
    game.fluidos.setFluid(X - 1, Y, Z, 'WATER', 0);
    await esperarFluido();
    out.B_hayAgua = /agua/.test(claveEn(X - 1, Y, Z) || '');
    out.B_aguaReemplazable = mcIsCellReplaceable(X - 1, Y, Z);
    const gAgua = mc._geoFina && mc._geoFina[mc.grid[mcIdx(X - 1, Y, Z)]];
    out.B_bitsAguaLlenos = gAgua && gAgua.bits ? gAgua.bits.every(v => v) : null;
    out.B_apuntada = game.redstone.apuntada(6);
    out.B_antes = claveEn(X, Y, Z);
    out.B_conmuto = !!(out.B_apuntada && game.redstone.conmutar(...out.B_apuntada));
    out.B_despues = claveEn(X, Y, Z);
    // Y el motor tiene que decir lo mismo que la pieza: son la misma pregunta.
    const rB = mcRaycast(6, true);
    out.B_rayoMotor = rB ? rB.cell : null;

    // ── C · con la propia palanca SUMERGIDA (agua encima y delante) ──────────────
    limpiar();
    mcSetBlock(X, Y, Z, idPal);
    mirarA(X - 3);
    for (let dx = -3; dx <= -1; dx++) game.fluidos.setFluid(X + dx, Y, Z, 'WATER', 0);
    game.fluidos.setFluid(X, Y + 1, Z, 'WATER', 0);
    await esperarFluido();
    out.C_claveEnPalanca = claveEn(X, Y, Z);
    out.C_apuntada = game.redstone.apuntada(6);
    out.C_antes = claveEn(X, Y, Z);
    out.C_conmuto = !!(out.C_apuntada && game.redstone.conmutar(...out.C_apuntada));
    out.C_despues = claveEn(X, Y, Z);

    // ── D · ANTI-FALSO-VERDE: la MISMA celda, con cable y con agua ───────────────
    // El arreglo salta la celda por ser REEMPLAZABLE, no por dibujarse con geometría fina. Un cable
    // es fino igual que el agua y su bitset tampoco está lleno, así que recorre el mismo camino de
    // `miraFina`; lo único que los separa es `mcIsCellReplaceable`. Si el arreglo se hubiera escrito
    // como «saltar lo fino», este tramo se pone rojo y el B/C seguirían verdes.
    limpiar();
    mcSetBlock(X, Y, Z, idPal);
    mcSetBlock(X - 2, Y, Z, idCable);
    mirarA(X - 5);
    out.D_cableNoReemplazable = !mcIsCellReplaceable(X - 2, Y, Z);
    const gCable = mc._geoFina && mc._geoFina[mc.grid[mcIdx(X - 2, Y, Z)]];
    out.D_cableEsFino = !!(mc.finoRejilla && mc.finoRejilla[mc.grid[mcIdx(X - 2, Y, Z)]]);
    out.D_cableBitsLlenos = gCable && gCable.bits ? gCable.bits.every(v => v) : null;
    out.D_conCable = game.redstone.apuntada(6);

    // Y ahora agua en ESA MISMA celda, con la palanca donde estaba: el rayo tiene que pasar.
    mcSetBlock(X - 2, Y, Z, 0);
    game.fluidos.setFluid(X - 2, Y, Z, 'WATER', 0);
    await esperarFluido();
    out.D_mismaCeldaEsAgua = /agua/.test(claveEn(X - 2, Y, Z) || '');
    out.D_conAgua = game.redstone.apuntada(6);

    out.punto = [X, Y, Z];
    return out;
  });

  if (res.log.length) console.log('  · avisos: ' + res.log.join(' | '));

  const es = (a, x, y, z) => !!a && a[0] === x && a[1] === y && a[2] === z;
  const [X, Y, Z] = res.punto;

  console.log('\nA · en seco (control)');
  ok('apunta a la palanca', es(res.A_apuntada, X, Y, Z), JSON.stringify(res.A_apuntada));
  ok('el clic la conmuta', res.A_conmuto && res.A_antes !== res.A_despues, res.A_antes + ' -> ' + res.A_despues);

  console.log('\nB · con una lámina de agua delante');
  ok('la celda de delante es agua', res.B_hayAgua === true, res.B_hayAgua);
  ok('el agua es reemplazable', res.B_aguaReemplazable === true);
  ok('y su bitset fino está LLENO (por eso paraba el rayo)', res.B_bitsAguaLlenos === true);
  ok('el rayo la ATRAVIESA y apunta a la palanca', es(res.B_apuntada, X, Y, Z), JSON.stringify(res.B_apuntada));
  ok('el motor dice lo mismo (mcRaycast)', es(res.B_rayoMotor, X, Y, Z), JSON.stringify(res.B_rayoMotor));
  ok('el clic la conmuta bajo el agua', res.B_conmuto && res.B_antes !== res.B_despues, res.B_antes + ' -> ' + res.B_despues);

  console.log('\nC · con la palanca sumergida');
  ok('la palanca sigue en su celda', /palanca/.test(res.C_claveEnPalanca || ''), res.C_claveEnPalanca);
  ok('el rayo la alcanza', es(res.C_apuntada, X, Y, Z), JSON.stringify(res.C_apuntada));
  ok('el clic la conmuta', res.C_conmuto && res.C_antes !== res.C_despues, res.C_antes + ' -> ' + res.C_despues);

  console.log('\nD · anti-falso-verde: la MISMA celda, con cable y con agua');
  ok('un cable NO es reemplazable', res.D_cableNoReemplazable === true);
  ok('el cable tambien se dibuja con geometria fina', res.D_cableEsFino === true);
  ok('pero su bitset NO esta lleno (mismo camino, distinta razon)', res.D_cableBitsLlenos === false, res.D_cableBitsLlenos);
  ok('con cable el rayo se PARA en esa celda', es(res.D_conCable, X - 2, Y, Z), JSON.stringify(res.D_conCable));
  ok('esa misma celda pasa a ser agua', res.D_mismaCeldaEsAgua === true, res.D_mismaCeldaEsAgua);
  ok('con agua el rayo la ATRAVIESA y llega a la palanca', es(res.D_conAgua, X, Y, Z), JSON.stringify(res.D_conAgua));

  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallo(s)' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();
