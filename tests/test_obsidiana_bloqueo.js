// @area: redstone
// @necesita: servidor, playwright
// Validar que un bloque con "inamovible": true en su JSON de definición de material
// (como assets/blocks_mock/obsidiana.vox.json) bloquea el empuje del pistón e impide su extensión.
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
    const PISTON = 'hab:piston';
    const OBSIDIANA = 'asset:assets/blocks_mock/obsidiana.vox.json';

    // ── buscar sitio despejado ──
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 14 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 14; z++) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      const idSuelo = mc.grid[mcIdx(x, gy, z)];
      const claveSuelo = mc.blockKey[idSuelo] || '';
      if (claveSuelo.startsWith('hab:')) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 4 && libre; y++) for (let d = -1; d <= 4; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy + 1, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado'); return out; }
    const [X, Y, Z] = sitio;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const CELDAS = [[X, Y, Z], [X + 1, Y, Z], [X + 2, Y, Z]];
    const antes = CELDAS.map(c => idEn(c[0], c[1], c[2]));

    try {
      await game.addMaterial(PISTON);
      await game.addMaterial(OBSIDIANA);

      const idObs = mc.name2id[OBSIDIANA];
      out.idObs = idObs;
      out.inamovibleEnDoc = mc.inamovibleDoc ? mc.inamovibleDoc[idObs] : null;

      // Colocar pistón mirando al Este (+X, ori 0) y obsidiana delante
      // PISTON (X, Y, Z) -> OBSIDIANA (X + 1, Y, Z)
      mcSetBlock(X, Y, Z, mc.name2id[PISTON]);
      mcSetBlock(X + 1, Y, Z, idObs);
      game.redstone.repasarMundo();

      // Forzar extensión del pistón manualmente por API
      game.redstone.encender(X, Y, Z, true);
      for (let i = 0; i < 10; i++) { game.redstone.tick(); await new Promise(res => setTimeout(res, 20)); }

      const claveCuerpo = mc.blockKey[idEn(X, Y, Z)] || '';
      const claveCabeza = mc.blockKey[idEn(X + 1, Y, Z)] || '';

      out.cuerpoDespues = claveCuerpo;
      out.cabezaDespues = claveCabeza;

    } finally {
      CELDAS.forEach((c, i) => mcSetBlock(c[0], c[1], c[2], antes[i]));
      mcRemeshAround(X - 1, Z - 1, X + 3, Z + 1);
      game.redstone.repasarMundo();
      game.redstone.tick();
    }
    return out;
  });

  console.log('Validación de bloqueo del pistón con Obsidiana:');
  console.log('  ID de obsidiana:', r.idObs);
  console.log('  ¿Es inamovible en paleta?:', r.inamovibleEnDoc);
  console.log('  Pistón después de encender:', r.cuerpoDespues);
  console.log('  Casilla delantera después de encender (donde iría la cabeza):', r.cabezaDespues);

  ok('el pistón NO se extendió (sigue apagado y sin cabeza)', r.cuerpoDespues === 'hab:piston' && r.cabezaDespues === 'asset:assets/blocks_mock/obsidiana.vox.json');
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
