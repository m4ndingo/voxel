// @area: redstone
// @necesita: servidor, playwright
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

  // Interceptar POSTs
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.redstone', null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const PISTON_ESTE = 'hab:piston@2';
    const PISTON_OESTE = 'hab:piston@3';
    const ARENA = 'asset:assets/blocks_mock/arena.vox.json';
    const OBSIDIANA = 'asset:assets/blocks_mock/obsidiana.vox.json';
    const CABLE = 'hab:cable';
    const BLOQUE_REDSTONE = 'asset:assets/bloque_redstone.vox.json';

    // buscar sitio despejado
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 16 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 16; z++) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      const idSuelo = mc.grid[mcIdx(x, gy, z)];
      const claveSuelo = mc.blockKey[idSuelo] || '';
      if (claveSuelo.startsWith('hab:')) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 4 && libre; y++) for (let d = -2; d <= 6; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy + 1, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado'); return out; }
    const [X, Y, Z] = sitio;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const keyEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || 'aire';
    const CELDAS = [];
    for (let dx = -1; dx <= 6; dx++) CELDAS.push([X + dx, Y, Z]);
    const antes = CELDAS.map(c => idEn(c[0], c[1], c[2]));

    try {
      await game.addMaterial(PISTON_ESTE);
      await game.addMaterial(PISTON_OESTE);
      await game.addMaterial('hab:piston-on@2');
      await game.addMaterial('hab:piston-on@3');
      await game.addMaterial('hab:piston-cabeza@2');
      await game.addMaterial('hab:piston-cabeza@3');
      await game.addMaterial(ARENA);

      // Configuración:
      // X: Pistón A (mira al Este, ori 2)
      // X+1: Arena
      // X+2: Aire
      // X+3: Pistón B (mira al Oeste, ori 3)
      mcSetBlock(X, Y, Z, mc.name2id[PISTON_ESTE] || 0);
      mcSetBlock(X + 1, Y, Z, mc.name2id[ARENA] || 0);
      mcSetBlock(X + 3, Y, Z, mc.name2id[PISTON_OESTE] || 0);

      // 0. Alimentar Pistón A al inicio
      game.redstone.encender(X, Y, Z, 15);
      for (let i = 0; i < 5; i++) { game.redstone.tick(); await new Promise(r => setTimeout(r, 10)); }

      out.estado0 = {
        pistonA: keyEn(X, Y, Z),
        pistonACab: keyEn(X + 1, Y, Z),
        arena: keyEn(X + 2, Y, Z),
        pistonB: keyEn(X + 3, Y, Z)
      };

      // 1. Apagar el Pistón A
      game.redstone.encender(X, Y, Z, 0);
      for (let i = 0; i < 5; i++) { game.redstone.tick(); await new Promise(r => setTimeout(r, 10)); }

      out.estado1_pistonA_apagado = {
        pistonA: keyEn(X, Y, Z),
        pistonACab: keyEn(X + 1, Y, Z),
        arena: keyEn(X + 2, Y, Z)
      };

      // 2. Encender el Pistón B
      // Esto debe empujar la arena de X+2 a X+1
      game.redstone.encender(X + 3, Y, Z, 15);
      for (let i = 0; i < 5; i++) { game.redstone.tick(); await new Promise(r => setTimeout(r, 10)); }

      out.estado2_pistonB_encendido = {
        pistonA: keyEn(X, Y, Z),
        arena: keyEn(X + 1, Y, Z),
        pistonB: keyEn(X + 3, Y, Z),
        pistonBCab: keyEn(X + 2, Y, Z)
      };

      // 3. Apagar el Pistón B
      game.redstone.encender(X + 3, Y, Z, 0);
      for (let i = 0; i < 5; i++) { game.redstone.tick(); await new Promise(r => setTimeout(r, 10)); }

      out.estado3_pistonB_apagado = {
        pistonA: keyEn(X, Y, Z),
        arena: keyEn(X + 1, Y, Z),
        pistonB: keyEn(X + 3, Y, Z),
        pistonBCab: keyEn(X + 2, Y, Z)
      };

      // 4. Encender el Pistón A de nuevo
      // Esto debe empujar la arena de X+1 a X+2 de nuevo
      game.redstone.encender(X, Y, Z, 15);
      for (let i = 0; i < 10; i++) { game.redstone.tick(); await new Promise(r => setTimeout(r, 10)); }

      out.estado4_final = {
        pistonA: keyEn(X, Y, Z),
        pistonACab: keyEn(X + 1, Y, Z),
        arena: keyEn(X + 2, Y, Z),
        pistonB: keyEn(X + 3, Y, Z)
      };

    } catch (e) {
      out.errs.push(e.message);
    } finally {
      CELDAS.forEach((c, i) => mcSetBlock(c[0], c[1], c[2], antes[i]));
      mcRemeshAround(X - 2, Z - 1, X + 7, Z + 1);
      game.redstone.repasarMundo();
      game.redstone.tick();
    }
    return out;
  });

  console.log('Resultados de simulación de pistones enfrentados:');
  console.log('  [0] Inicial (Pistón A extendido, B contraído):', r.estado0);
  console.log('  [1] Pistón A apagado (se contrae, arena en X+2):', r.estado1_pistonA_apagado);
  console.log('  [2] Pistón B encendido (empuja arena a X+1):', r.estado2_pistonB_encendido);
  console.log('  [3] Pistón B apagado (se contrae, arena libre en X+1):', r.estado3_pistonB_apagado);
  console.log('  [4] Final (Pistón A se enciende, empuja arena a X+2):', r.estado4_final);

  ok('Al inicio, el Pistón A está extendido', r.estado0 && r.estado0.pistonA.startsWith('hab:piston-on') && r.estado0.pistonACab.startsWith('hab:piston-cabeza'));
  ok('Al apagar Pistón A, se contrae', r.estado1_pistonA_apagado && r.estado1_pistonA_apagado.pistonA.startsWith('hab:piston') && r.estado1_pistonA_apagado.pistonACab === 'aire');
  ok('Pistón B encendido empujó la arena a X+1', r.estado2_pistonB_encendido && r.estado2_pistonB_encendido.arena === 'asset:assets/blocks_mock/arena.vox.json' && r.estado2_pistonB_encendido.pistonB.startsWith('hab:piston-on'));
  ok('Pistón B apagado se contrae dejando aire en X+2', r.estado3_pistonB_apagado && r.estado3_pistonB_apagado.pistonBCab === 'aire' && r.estado3_pistonB_apagado.pistonB.startsWith('hab:piston'));
  ok('Al encender Pistón A de nuevo, empuja la arena a X+2', r.estado4_final && r.estado4_final.arena === 'asset:assets/blocks_mock/arena.vox.json' && r.estado4_final.pistonA.startsWith('hab:piston-on'));
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
