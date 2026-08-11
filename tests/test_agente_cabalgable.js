// @area: agentes
// @necesita: servidor, playwright
// REQ-AG12 · capacidad `cabalgable`: montado en él se queda quieto y lo conduces con WASD / flechas.
//
// El dueño (REQ-AG12 / BUG-AG11):
//   «"montado" no es lo mismo que "cabalgable", si fuese "cabalgable" tiene sentido que se quede
//    quieto y que además pueda moverlo; si estás "montado" y no te ve, pues que sea como tonto
//    y vuelva a su ancla»
//
// Pruebas:
//   A · game.esqueletos.cabalgable() expone la API y conmuta por instancia.
//   B · montado en un bicho cabalgable = SE QUEDA QUIETO (no vuelve a su ancla como BUG-AG11).
//   C · la tabla de game.esqueletos.lista() reporta estado «cabalgando».
//   D · al pulsar teclas de dirección (mc.keys['d'] = true), el agente AVANZA y gira hacia la dirección de marcha.
//   E · al soltar las teclas, el agente FRENADO se queda en su nueva posición sin volver al ancla.
//   F · al apagar cabalgable(false), vuelve a comportarse como montado normal (vuelve a su ancla).
//
//   node test_agente_cabalgable.js [url]       por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.agentes', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  console.log('\n--- ' + URL + ' ---');

  const hayApi = await p.evaluate(() => !!(window.game && game.esqueletos && typeof game.esqueletos.cabalgable === 'function'));
  ok(hayApi, 'el snippet expone game.esqueletos.cabalgable()');
  if (!hayApi) { await b.close(); process.exit(1); }

  const r = await p.evaluate(async () => {
    const out = { errs: [], a: {}, b: {}, c: {}, d: {}, e: {}, f: {} };
    const idEn = (x, y, z) => (typeof mcInside === 'function' && mcInside(x, y, z)) ? (mc.grid[mcIdx(x, y, z)] || 0) : 0;
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const sig = (rg) => {
      const r = rg || rig;
      return (r && r.partes && r.partes[0] && r.partes[0].s && r.partes[0].s._sig) || { x: 0, z: 0 };
    };

    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 12) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 20 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 20 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde hacer las pruebas'); return out; }
    const [X, Y, Z] = sitio;

    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie" guardado'); return out; }

    // Planteamos el zombie en (X + 2, Y, Z + 2) para tener margen seguro de suelo en todas direcciones
    const rig = await game.esqueletos.crear(def, X + 2, Y, Z + 2);
    if (!rig) { out.errs.push('no he podido crear el agente articulado'); return out; }
    out.rigId = rig.id;
    await frame(); await frame(); // esperar a que las piezas se estampen

    // A · API cabalgable
    out.a.defecto = game.esqueletos.cabalgable(rig.id);
    out.a.enciende = game.esqueletos.cabalgable(rig.id, true);
    out.a.leido = game.esqueletos.cabalgable(rig.id);

    // Hacemos la cabeza montable
    const cab = rig.partes.find(p => p.nombre === 'cabeza');
    if (!cab || !cab.s || !cab.s.aabb) { out.errs.push('no encuentro la pieza cabeza o sus AABB'); return out; }
    game.esqueletos.montable(rig.id, cab.nombre, true);

    // Montamos al jugador encima de la cabeza (mundo = R·L + t)
    const a = cab.s.aabb, m = cab.s.model;
    const L = [(a[0] + a[3]) / 2, a[4] + 0.05, (a[2] + a[5]) / 2];
    mc.pos[0] = m[0] * L[0] + m[4] * L[1] + m[8] * L[2] + m[12];
    mc.pos[1] = m[1] * L[0] + m[5] * L[1] + m[9] * L[2] + m[13];
    mc.pos[2] = m[2] * L[0] + m[6] * L[1] + m[10] * L[2] + m[14];
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    await frame(); await frame(); // 1º: llevarPasajero guarda pose · 2º: ya te lleva

    // B · Con cabalgable=true, el agente NO vuelve a su ancla y se queda quieto
    const pIni = [sig().x, sig().z];
    for (let i = 0; i < 24; i++) {
      mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
      await frame();
    }
    const pFin = [sig().x, sig().z];
    out.b.quietoDist = Math.hypot(pFin[0] - pIni[0], pFin[1] - pIni[1]);

    // C · Tabla de estado
    const filas = game.esqueletos.lista();
    const fila = filas.find(f => f.id === rig.id);
    out.c.estado = fila ? fila.estado : '';

    // D · Conducción con WASD: 'd' gira la montura, 'w' la hace avanzar de frente hacia su orientación
    const resetKeys = () => {
      if (mc && mc.keys) {
        ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(k => mc.keys[k] = false);
      }
    };
    resetKeys();
    rig.giro = 90; // orientada de frente a +X
    const pMarcha0 = [sig().x, sig().z];
    for (let i = 0; i < 5; i++) {
      mc.keys['w'] = true;
      mc.vel[1] = 0;
      await frame();
    }
    resetKeys();
    // Esperar a que la desaceleración concluya con inercia zero
    for (let i = 0; i < 30; i++) {
      resetKeys();
      mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
      await frame();
    }
    const pMarcha1 = [sig().x, sig().z];
    out.d.avanceDist = Math.hypot(pMarcha1[0] - pMarcha0[0], pMarcha1[1] - pMarcha0[1]);

    // E · Soltar teclas: una vez detenido, se queda en reposo sin moverse ni volver
    const pParado0 = [sig().x, sig().z];
    for (let i = 0; i < 25; i++) {
      resetKeys();
      mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
      await frame();
    }
    const pParado1 = [sig().x, sig().z];
    out.e.movSoltado = Math.hypot(pParado1[0] - pParado0[0], pParado1[1] - pParado0[1]);

    // F · Apagar cabalgable(false): vuelve a comportarse como montado normal (se va al ancla)
    resetKeys();
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    game.esqueletos.cabalgable(rig.id, false);
    for (let i = 0; i < 40; i++) {
      mc.vel[1] = 0; // frena solo gravedad
      await frame();
    }
    const pVolver = [sig().x, sig().z];
    out.f.retornoAncla = Math.hypot(pVolver[0] - pParado1[0], pVolver[1] - pParado1[1]);

    game.esqueletos.quitar(rig.id);
    return out;
  });

  if (r.errs && r.errs.length) {
    r.errs.forEach(e => ok(false, e));
    await b.close(); process.exit(1);
  }

  console.log('\n── A · API cabalgable(rig, si) ──');
  ok(r.a.defecto === false, 'por defecto cabalgable es false', r.a.defecto);
  ok(r.a.enciende === true, 'cabalgable(id, true) devuelve true', r.a.enciende);
  ok(r.a.leido === true, 'cabalgable(id) devuelve true tras encender', r.a.leido);

  console.log('\n── B · montado en un cabalgable: se queda quieto ──');
  ok(r.b.quietoDist < 0.05, 'montado con cabalgable=true NO vuelve a su ancla (se queda quieto en el sitio)', Math.round(r.b.quietoDist * 1000) / 1000);

  console.log('\n── C · estado en la tabla ──');
  ok(r.c.estado === 'cabalgando', 'game.esqueletos.lista() pone estado «cabalgando»', r.c.estado);

  console.log('\n── D · conducción con WASD / teclas de dirección ──');
  ok(r.d.avanceDist > 0.3, 'pulsar W (avanzar) hace avanzar a la montura en su dirección de frente', Math.round(r.d.avanceDist * 1000) / 1000);

  console.log('\n── E · al soltar las teclas se queda frenado ──');
  ok(r.e.movSoltado < 0.05, 'al soltar las teclas no se mueve ni vuelve atrás', Math.round(r.e.movSoltado * 1000) / 1000);

  console.log('\n── F · apagar cabalgable(false) restaura volver al ancla ──');
  ok(r.f.retornoAncla > 0.3, 'apagar cabalgable(false) vuelve a enviar al agente a su ancla', Math.round(r.f.retornoAncla * 1000) / 1000);

  console.log('\n── limpieza ──');
  ok(errores.length === 0, 'sin excepciones en la página', errores.join(', '));

  await b.close();
  if (fallos > 0) process.exit(1);
  console.log('\ntodo ok\n');
})();