// BANCO DE PRUEBAS PARA BISECAR (BUG-GLOW11) · «esto antes no tiraba los fps» — orden del dueño 2026-08-21.
// Mide UNA sola cosa y la mide igual en cualquier versión del motor: **cuánto cuesta UNA siembra de la luz
// dinámica con estrellas en el cielo**. Nada de fps, nada de dibujar: se fuerza la re-siembra anulando la
// firma y se cronometra mcDynSync(). Sólo usa lo que existe desde BUG-GLOW8 (mcDynSync, mc._dynSig,
// mc.dynLight) y game.voxelesUI, así que corre igual en los commits viejos.
//   node bench_luz.js [url] [nEstrellas]
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
    const out = { version: (typeof VERSION !== 'undefined' ? VERSION : '?'),
                  sub: (typeof MC_LUZ_SUB !== 'undefined' ? MC_LUZ_SUB : 1),
                  semTope: (typeof MC_DYN_SEMILLAS !== 'undefined' ? MC_DYN_SEMILLAS : null),
                  celdasTope: (typeof MC_DYN_CELDAS !== 'undefined' ? MC_DYN_CELDAS : null),
                  dim: [mc.dim.x, mc.dim.y, mc.dim.z] };
    if (typeof game === 'undefined' || !game.voxelesUI) { out.error = 'no hay game.voxelesUI'; return out; }
    const d = mc.dim, N = Math.round(1 / MC_VOX);
    try { game.voxelesUI.limpia('bench'); } catch (e) {}
    try { game.voxelesUI.material('bench', { emite: true, luz: 37 }); } catch (e) { out.error = 'material: ' + e.message; }
    let puestas = 0;
    for (let i = 0; i < NE; i++) {
      const x = 2 + ((i * 7919) % (d.x - 4)), z = 2 + ((i * 6271) % (d.z - 4)), y = d.y - 2 - (i % 6);
      try { if (game.voxelesUI.pon(x * N, y * N, z * N, [255, 255, 230], 'bench') !== false) puestas++; } catch (e) {}
    }
    out.puestas = puestas;
    mc.pos[0] = d.x / 2; mc.pos[1] = 20; mc.pos[2] = d.z / 2;

    const mide = (n) => {                       // n siembras FORZADAS, sin candado de por medio
      mc._dynSig = null; if ('_dynSuma' in mc) mc._dynSuma = null;
      mcDynSync();                              // una de calentamiento, fuera de la cuenta
      let ms = 0;
      for (let i = 0; i < n; i++) {
        mc._dynSig = null; if ('_dynSuma' in mc) mc._dynSuma = null;
        const t = performance.now(); mcDynSync(); ms += performance.now() - t;
      }
      return ms / n;
    };
    out.conEstrellas = mide(12);
    // ⚠️ Sin esto la comparación no vale nada: una versión que NO alumbra siempre será la más rápida.
    // Se mira el campo por dentro (celdas encendidas) y por fuera (nivel bajo una estrella y en el suelo).
    const D = mc.dynLight;
    out.campo = D ? Object.keys(D).join(',') : 'null';
    if (D && D.BL) { let enc = 0; for (let i = 3; i < D.BL.length; i += 4) if (D.BL[i]) enc++; out.encendidas = enc; }
    try { out.nivelSuelo = mcDynNivel(Math.floor(d.x / 2), 16, Math.floor(d.z / 2)); } catch (e) { out.nivelSuelo = 'x'; }
    try { out.nivelAlto = mcDynNivel(Math.floor(d.x / 2), d.y - 4, Math.floor(d.z / 2)); } catch (e) { out.nivelAlto = 'x'; }
    out.luces = mc._voxUILuz ? mc._voxUILuz.length / 4 : 0;
    out.cand = mc._dynCand ? mc._dynCand.length / 11 : 0;
    out.vol = mc.dynLight ? mc.dynLight.vol : 0;
    out.usadas = mc.dynLight ? mc.dynLight.luces : 0;
    out.focus = (mc.glowFocus != null ? mc.glowFocus : 0);

    try { game.voxelesUI.limpia('bench'); } catch (e) {}
    out.sinEstrellas = mide(12);
    out.volSin = mc.dynLight ? mc.dynLight.vol : 0;
    out.candSin = mc._dynCand ? mc._dynCand.length / 11 : 0;
    return out;
  }, NE);

  const n = (v) => (v == null ? '?' : v);
  console.log(JSON.stringify(r));
  console.log('  version ' + n(r.version) + ' · mundo ' + r.dim.join('×') + ' · MC_LUZ_SUB ' + n(r.sub) +
              ' · tope semillas ' + n(r.semTope) + ' · tope celdas ' + n(r.celdasTope) + ' · foco ' + n(r.focus));
  if (r.error) console.log('  ⚠️ ' + r.error);
  console.log('  CON ' + n(r.puestas) + ' estrellas (' + n(r.luces) + ' luces, ' + n(r.cand) + ' candidatas, ' +
              n(r.usadas) + ' sembradas, caja ' + n(r.vol) + ') → ' + (r.conEstrellas || 0).toFixed(2) + ' ms por siembra');
  console.log('     ¿ALUMBRA? celdas encendidas ' + n(r.encendidas) + ' · nivel en el suelo ' + n(r.nivelSuelo) +
              ' · nivel arriba ' + n(r.nivelAlto) + ' · campo {' + n(r.campo) + '}');
  console.log('  SIN estrellas (' + n(r.candSin) + ' candidatas, caja ' + n(r.volSin) + ') → ' +
              (r.sinEstrellas || 0).toFixed(2) + ' ms por siembra');
  await b.close();
})();
