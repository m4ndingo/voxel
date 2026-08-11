// @area: agentes
// @necesita: servidor, playwright
// test_bug_req_ag15_reposicionar_montura.js
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;

  function ok(cond, txt, extra) {
    if (!cond) fallos++;
    console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
  }

  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined" && game.esqueletos && game.agentes', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const E = game.esqueletos;
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const idEn = (x, y, z) => (typeof mcInside === 'function' && mcInside(x, y, z)) ? (mc.grid[mcIdx(x, y, z)] || 0) : 0;

    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 12) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 20 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 20 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro'); return out; }
    const [X, Y, Z] = sitio;

    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie"'); return out; }

    const rig = await E.crear(def, X + 2, Y, Z + 2);
    if (!rig) { out.errs.push('no se pudo crear rig'); return out; }
    out.rigId = rig.id;
    await frame(); await frame();

    E.cabalgable(rig.id, true);
    const cab = rig.partes.find(p => p.nombre === 'cabeza');
    if (!cab || !cab.s || !cab.s.aabb) { out.errs.push('no hay cabeza'); return out; }
    E.montable(rig.id, cab.nombre, true);

    const a = cab.s.aabb, m = cab.s.model;
    const L = [(a[0] + a[3]) / 2, a[4] + 0.05, (a[2] + a[5]) / 2];
    mc.pos[0] = m[0] * L[0] + m[4] * L[1] + m[8] * L[2] + m[12];
    mc.pos[1] = m[1] * L[0] + m[5] * L[1] + m[9] * L[2] + m[13];
    mc.pos[2] = m[2] * L[0] + m[6] * L[1] + m[10] * L[2] + m[14];
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    await frame(); await frame();

    const sig = () => (rig.partes && rig.partes[0] && rig.partes[0].s && rig.partes[0].s._sig) || { x: 0, z: 0 };
    out.montadoInicial = !!rig.llevando;
    out.esCabalgandoInicial = E.esCabalgando();

    // ── CASO 1 · Pulsar Shift + W: el jugador camina sobre la montura, el agente NO se mueve ──
    const pRig0 = [sig().x, sig().z];
    const pJug0 = [mc.pos[0], mc.pos[2]];

    for (let i = 0; i < 2; i++) {
      mc.keys['shift'] = true;
      mc.keys['w'] = true;
      await frame();
    }

    const pRig1 = [sig().x, sig().z];
    const pJug1 = [mc.pos[0], mc.pos[2]];

    out.despAgenteShift = Math.hypot(pRig1[0] - pRig0[0], pRig1[1] - pRig0[1]);
    out.despJugadorShift = Math.hypot(pJug1[0] - pJug0[0], pJug1[1] - pJug0[1]);

    mc.keys['shift'] = false;
    mc.keys['w'] = false;
    await frame();

    // ── CASO 2 · Pulsar sólo W sin Shift: la montura conduce y avanza ──
    const pRig2 = [sig().x, sig().z];

    for (let i = 0; i < 15; i++) {
      mc.keys['w'] = true;
      await frame();
    }

    const pRig3 = [sig().x, sig().z];
    out.despAgenteSinShift = Math.hypot(pRig3[0] - pRig2[0], pRig3[1] - pRig2[1]);

    mc.keys['w'] = false;
    await frame();

    if (typeof E.quitar === 'function') E.quitar(rig.id);
    return out;
  });

  console.log('\n── REQ-AG15 · Reposicionamiento en la montura con Shift + WASD ──');
  if (r.errs && r.errs.length) {
    console.log('  FALLA ' + r.errs.join(' · '));
    fallos++;
  } else {
    ok(r.montadoInicial && r.esCabalgandoInicial, 'jugador montado y cabalgando en la montura');
    ok(r.despAgenteShift < 0.05, 'con Shift + W el agente NO avanza de sitio', 'desplazamiento agente = ' + Math.round(r.despAgenteShift * 1000) / 1000);
    ok(r.despJugadorShift > 0.02, 'con Shift + W el jugador SÍ se desplaza sobre la superficie para reposicionarse', 'desplazamiento jugador = ' + Math.round(r.despJugadorShift * 100) / 100);
    ok(r.despAgenteSinShift > 0.1, 'sin Shift, la tecla W conduce y hace avanzar a la montura', 'desplazamiento agente = ' + Math.round(r.despAgenteSinShift * 100) / 100);
  }

  ok(errores.length === 0, 'sin errores JS', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();