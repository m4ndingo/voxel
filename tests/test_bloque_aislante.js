// @area: redstone
// @necesita: servidor, playwright
// Validar que un bloque con "aislante": true en su JSON de definición de material
// (como assets/cubo-trans.vox.json) NO actúe como bloque puente conductor de redstone.
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
  await p.waitForFunction('window.game && game.redstone && window.mcXrayExtra', null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const FUENTE = 'asset:assets/bloque_redstone.vox.json';
    const CABLE = 'hab:cable';
    const TRANS = 'asset:assets/cubo-trans.vox.json';

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
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const CELDAS = [[X, Y, Z], [X + 1, Y, Z], [X + 2, Y, Z]];
    const antes = CELDAS.map(c => idEn(c[0], c[1], c[2]));

    // Usar la roca de suelo real para el caso conductor
    const SUELO = idEn(X, Y - 1, Z);

    try {
      await game.addMaterial(FUENTE);
      await game.addMaterial(CABLE);
      await game.addMaterial(TRANS);

      const idTrans = mc.name2id[TRANS];
      out.idTrans = idTrans;
      out.aislanteEnDoc = mc.aislanteDoc ? mc.aislanteDoc[idTrans] : null;

      // Forzar invalidar en redstone para regenerar cacheIds
      if (game.redstone && game.redstone.repasarMundo) {
        // Ejecutar repasarMundo invalida y reconstruye caches en redstone.js
        game.redstone.repasarMundo();
      }

      // Caso 1: bloque aislante (cubo-trans) en medio
      // FUENTE (X, Y, Z) -> TRANS (X + 1, Y, Z) -> CABLE (X + 2, Y, Z)
      mcSetBlock(X, Y, Z, mc.name2id[FUENTE]);
      mcSetBlock(X + 1, Y, Z, idTrans);
      mcSetBlock(X + 2, Y, Z, mc.name2id[CABLE]);
      game.redstone.repasarMundo();
      for (let i = 0; i < 20; i++) { game.redstone.tick(); await new Promise(res => setTimeout(res, 20)); }
      out.pwrAislante = game.redstone.info(X + 2, Y, Z).recibe;
      out.etiAislante = window.mcXrayExtra(claveEn(X + 1, Y, Z), null, X + 1, Y, Z) || '';

      // Caso 2: bloque conductor (suelo real) en medio
      // FUENTE (X, Y, Z) -> SUELO (X + 1, Y, Z) -> CABLE (X + 2, Y, Z)
      mcSetBlock(X + 1, Y, Z, SUELO);
      game.redstone.repasarMundo();
      for (let i = 0; i < 20; i++) { game.redstone.tick(); await new Promise(res => setTimeout(res, 20)); }
      out.pwrConductor = game.redstone.info(X + 2, Y, Z).recibe;

    } finally {
      CELDAS.forEach((c, i) => mcSetBlock(c[0], c[1], c[2], antes[i]));
      mcRemeshAround(X - 1, Z - 1, X + 3, Z + 1);
      game.redstone.repasarMundo();
      game.redstone.tick();
    }
    return out;
  });

  console.log('Validación de la propiedad aislante de materiales:');
  console.log('  ID de cubo-trans:', r.idTrans);
  console.log('  ¿Está en mc.aislanteDoc?:', r.aislanteEnDoc);
  ok('con cubo-trans en medio, el cable NO recibe energía', r.pwrAislante === 0, 'potencia recibida: ' + r.pwrAislante);
  ok('el bloque aislante muestra "🚫 aislante" en Rayos-X', r.etiAislante === '🚫 aislante', JSON.stringify(r.etiAislante));
  ok('con adoquín/suelo en medio, el cable SÍ recibe energía', r.pwrConductor > 0, 'potencia recibida: ' + r.pwrConductor);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
