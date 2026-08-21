// SONDA (REQ-LUZ2) · ¿deja de costar fps ANDAR por culpa de las partículas?
// Reproduce lo que midió el dueño (BUG-GLOW11): estrellas quietas en el cielo + la herramienta en la mano,
// se anda en línea recta y se cuenta cuántas veces se rompe la firma de la caja y cuánto cuesta cada rotura.
// Lo hace DOS veces —con game.luzQuietas false y true— para que la comparación sea del mismo mundo, la misma
// máquina y el mismo paseo. Y comprueba que la luz SIGUE ESTANDO (Ley VIII: si no alumbra, no vale de nada).
//   node probe_luz_quietas.js [url] [nEstrellas]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test?noauto=1';
const NE = +(process.argv[3] || 128);

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o);
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate((NE) => {
    const out = { tiene: (typeof mcVoxUIReparto === 'function') };
    if (!out.tiene) return out;
    const d = mc.dim, N = Math.round(1 / MC_VOX);
    game.voxelesUI.limpia('sonda');
    game.voxelesUI.material('sonda', { emite: true, luz: 37 });
    let puestas = 0;
    for (let i = 0; i < NE; i++) {
      const x = 2 + ((i * 7919) % (d.x - 4)), z = 2 + ((i * 6271) % (d.z - 4)), y = d.y - 2 - (i % 6);
      if (game.voxelesUI.pon(x * N, y * N, z * N, [255, 255, 230], 'sonda') !== false) puestas++;
    }
    out.puestas = puestas;

    // Un paseo = 200 pasos de 0,12 bloques (24 bloques, lo mismo que anduvo el dueño en 8 s). Se cronometra
    // mcDynSync() entero, que es lo que se come el frame, y se separa lo que costó re-sembrar.
    const pasea = () => {
      mc.pos[0] = 8; mc.pos[1] = 20; mc.pos[2] = d.z / 2;
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      let rotas = 0, ms = 0, msTotal = 0;
      for (let i = 0; i < 200; i++) {
        mc.pos[0] += 0.12;
        const antes = mc._dynSig, t = performance.now();
        mcDynSync();
        const dt = performance.now() - t;
        msTotal += dt;
        if (mc._dynSig !== antes) { rotas++; ms += dt; }
      }
      const D = mc.dynLight, Q = game.luzDiag().quietas;
      return { rotas, ms, msTotal, caja: D ? D.vol : 0, semillas: D ? D.luces : 0,
               quietas: Q.quietas, movidas: Q.movidas };
    };
    // Estado del CAMPO DEL MUNDO en el sitio donde se mide la luz, para que «más rápido» no pueda salir de
    // «no alumbra». Se mira por dentro (celdas encendidas de mc.blockLight) y por fuera (nivel a ras de suelo).
    const campo = () => {
      const BL = mc.blockLight; let enc = 0;
      if (BL) for (let i = 3; i < BL.length; i += 4) if (BL[i]) enc++;
      const nivel = (x, y, z) => { let n = 0;
        try { n = mcDynNivel(x, y, z); } catch (e) { n = -1; }
        const i = mcIdx(x, y, z) * 4;
        return { dyn: n, mundo: BL ? Math.round(BL[i + 3] / MC_LUZ_SUB) : 0 };
      };
      return { encendidas: enc, hasGlow: mc.hasGlow,
               suelo: nivel(Math.floor(d.x / 2), 16, Math.floor(d.z / 2)),
               alto: nivel(Math.floor(d.x / 2), d.y - 4, Math.floor(d.z / 2)) };
    };

    game.luzQuietas = false;            // ── ANTES del ticket: todo a la caja
    out.antes = pasea(); out.campoAntes = campo();
    game.luzQuietas = true;             // ── DESPUÉS: las quietas al campo del mundo
    // El reparto necesita game.luzQuietasTras pasadas para madurar; se le dan.
    for (let i = 0; i < (game.luzQuietasTras + 5); i++) mcDynSync();
    out.despues = pasea(); out.campoDespues = campo();

    // …y el precio nuevo: rehornear el campo del mundo CON las estrellas dentro. Es lo que ahora se paga al
    // colocar o romper un bloque, y hay que decirlo aunque duela: se ha mudado el coste, no ha desaparecido.
    const bake = () => { mc._blEmiSig = null; const t = performance.now(); mcComputeBlockLight(); return performance.now() - t; };
    bake(); let bm = 0; for (let i = 0; i < 5; i++) bm += bake();
    out.mundoBake = bm / 5;
    game.luzQuietas = false; mc._blEmiSig = null; mcComputeBlockLight();
    bake(); let bs = 0; for (let i = 0; i < 5; i++) bs += bake();
    out.mundoBakeSin = bs / 5;
    game.luzQuietas = true;

    game.voxelesUI.limpia('sonda');
    return out;
  }, NE);

  if (!r.tiene) { console.log('⚠️ esta versión no trae REQ-LUZ2 (no hay mcVoxUIReparto)'); await b.close(); return; }
  const f = n => (n || 0).toFixed(2);
  const linea = (t, a, c) => {
    console.log('\n' + t);
    console.log('  roturas de firma ' + a.rotas + ' de 200 · ' + f(a.ms) + ' ms en re-sembrar · ' +
                f(a.rotas ? a.ms / a.rotas : 0) + ' ms cada una');
    console.log('  mcDynSync total del paseo ' + f(a.msTotal) + ' ms  (' + f(a.msTotal / 200) + ' ms por frame)');
    console.log('  caja ' + a.caja + ' celdas · ' + a.semillas + ' semillas · reparto de la capa: ' +
                a.quietas + ' quietas / ' + a.movidas + ' movidas');
    console.log('  ¿ALUMBRA? campo del mundo ' + c.encendidas + ' celdas · hasGlow ' + c.hasGlow +
                ' · suelo {caja ' + c.suelo.dyn + ', mundo ' + c.suelo.mundo + '}' +
                ' · arriba {caja ' + c.alto.dyn + ', mundo ' + c.alto.mundo + '}');
  };
  console.log('\n' + r.puestas + ' estrellas quietas plantadas (luz 37)');
  linea('game.luzQuietas = FALSE  (lo de antes: todas a la caja)', r.antes, r.campoAntes);
  linea('game.luzQuietas = TRUE   (REQ-LUZ2)', r.despues, r.campoDespues);
  console.log('\nGANANCIA ANDANDO: ' + f(r.antes.msTotal) + ' → ' + f(r.despues.msTotal) + ' ms  (×' +
              (r.despues.msTotal ? (r.antes.msTotal / r.despues.msTotal).toFixed(1) : '∞') + ')');
  console.log('PRECIO NUEVO: rehornear el campo del mundo (al poner/romper un bloque) ' +
              f(r.mundoBakeSin) + ' → ' + f(r.mundoBake) + ' ms con las estrellas dentro');
  await b.close();
})();
