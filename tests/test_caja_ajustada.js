// @area: render
// @necesita: servidor, playwright
// REQ-CULL1 · el recorte por frustum ya existía (`mcChunkVisible`), pero probaba una caja que era una
// COLUMNA DE LA ALTURA ENTERA DEL MUNDO: `ch.aabb = [x0,0,z0, x1,dim.y,z1]`. Con el suelo a y=14 y un
// mundo de 48 de alto, mirar al cielo seguía metiendo en la lista chunks cuyo contenido queda 30 bloques
// por debajo del visor. Y la capa HORNEADA de game.voxelesUI (mc.voxFino) no se recortaba en absoluto.
//
// La promesa de este ticket es exigente y es la que se prueba aquí: **recorta más y NO cambia ni un píxel**.
// Por eso el test no mide fps ni triángulos, compara la IMAGEN: mismo mundo, mismo instante, misma cámara,
// caja ajustada contra columna entera. Un falso negativo del recorte borraría geometría de la pantalla, y
// eso es justo lo que un contador de draws no vería.
//
// Las dos huellas se toman con `mcRender()` SÍNCRONO dentro del mismo evaluate (igual que
// test_giro_navegador.js), y se toma una tercera con el ajuste apagado para demostrar que la escena estaba
// quieta: sin esa tercera, una nube o una ola moviéndose haría fallar el test por algo que no es el recorte.
//
// No persiste nada: bloquea el POST del mundo.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test?noauto=1';
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

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
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // --- Relieve y capa horneada, para que ajustar la caja tenga algo que recortar ------------------
  // Un mundo perfectamente plano no distingue las dos cajas en TODAS las direcciones, así que se
  // levantan unas torres y se tumba una mancha de voxeles finos en el suelo (que es lo que hace la nieve).
  const mundo = await p.evaluate(() => {
    const d = mc.dim;
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 7, z = 8 + (i % 3) * 9;
      let y = 0; for (let k = d.y - 1; k >= 0; k--) if (mc.grid[x + k * d.x + z * d.x * d.y]) { y = k + 1; break; }
      for (let k = 0; k < 10; k++) mcSetBlock(x, y + k, z, 1);
    }
    const N = Math.round(1 / MC_VOX);
    let finos = 0;
    for (let bx = 4; bx < 20; bx++) for (let bz = 4; bz < 20; bz++)
      for (let s = 0; s < N; s += 4) { if (mcPonVoxFino(bx * N + s, 15 * N, bz * N, [1, 1, 1])) finos++; }
    mcVoxFinoRemalla(0);
    return { dim: [d.x, d.y, d.z], finos, chunksFinos: mc.voxFino ? mc.voxFino.size : 0 };
  });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    // El agua se mueve sola: `uTime` sale de `performance.now()` (app.js:13087) y basta una ola para que
    // dos renders seguidos den huellas distintas. Se congela el reloj mientras se mide, que es lo único
    // honesto: comparar imágenes de dos instantes distintos no probaría nada del recorte.
    const relojReal = performance.now.bind(performance);
    const t0 = relojReal();
    performance.now = () => t0;

    const huella = () => {
      mcRender();
      const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s = (s * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0;
      return s;
    };
    const cuenta = () => {
      const pv = mat4.mul(mcProjMatrix().m, mcViewMatrix());
      let terreno = 0, finos = 0;
      for (const ch of mc.chunks.values())
        if ((ch.count || ch.finoCount || ch.finoACount) && mcChunkVisible(ch, pv)) terreno++;
      // Misma condición que `veVox` en app.js, conmutador incluido: si el test se saltara el conmutador
      // mediría siempre lo mismo en las dos ramas y el ahorro saldría 0 aunque el recorte funcionase.
      if (mc.voxFino) for (const ch of mc.voxFino.values())
        if (ch.count && (!mc.cajaAjustada || !ch.aabb || mcChunkVisible(ch, pv))) finos++;
      return { terreno, finos };
    };
    const visible = () => {                     // el CONJUNTO, para poder comprobar que ajustar solo QUITA
      const pv = mat4.mul(mcProjMatrix().m, mcViewMatrix()), s = [];
      for (const [k, ch] of mc.chunks)
        if ((ch.count || ch.finoCount || ch.finoACount) && mcChunkVisible(ch, pv)) s.push(k);
      return s;
    };

    // Cajas bien formadas: dentro del mundo, no vacías y NUNCA más altas que la columna que sustituyen.
    const cajas = { total: 0, conCaja: 0, malas: [], masAltaQueElMundo: 0 };
    for (const [k, ch] of mc.chunks) {
      if (!(ch.count || ch.finoCount || ch.finoACount)) continue;
      cajas.total++;
      if (ch.yLo === undefined) continue;
      cajas.conCaja++;
      if (!(ch.yLo >= 0 && ch.yHi <= mc.dim.y && ch.yLo <= ch.yHi)) cajas.malas.push(k + ' [' + ch.yLo + ',' + ch.yHi + ']');
      if (ch.yHi - ch.yLo >= mc.dim.y) cajas.masAltaQueElMundo++;
    }

    // Mirando al cielo desde el suelo es donde más se nota: el contenido queda por debajo del visor pero
    // la columna de la altura entera sigue cruzándolo.
    const vistas = [
      { nom: 'al frente',      yaw: 0,           pitch: 0,   y: 17 },
      { nom: 'al cielo',       yaw: 0.6,         pitch: 55,  y: 16 },
      { nom: 'al suelo',       yaw: 2.2,         pitch: -60, y: 34 },
      { nom: 'de lado',        yaw: Math.PI / 2, pitch: 20,  y: 18 },
      { nom: 'pegado al muro', yaw: 3.9,         pitch: 5,   y: 16 },
    ];
    const guardaPos = [mc.pos[0], mc.pos[1], mc.pos[2]], guardaYaw = mc.yaw, guardaPitch = mc.pitch;
    const filas = [];
    for (const v of vistas) {
      mc.pos[0] = mc.dim.x / 2; mc.pos[1] = v.y; mc.pos[2] = mc.dim.z / 2;
      mc.yaw = v.yaw; mc.pitch = v.pitch * Math.PI / 180;
      mc.cajaAjustada = false; const h1 = huella(), cOff = cuenta(), setOff = visible();
      mc.cajaAjustada = true;  const h2 = huella(), cOn  = cuenta(), setOn  = visible();
      mc.cajaAjustada = false; const h3 = huella();
      const fuera = setOn.filter(k => setOff.indexOf(k) < 0);
      filas.push({ nom: v.nom, h1, h2, h3, quieta: h1 === h3, cOff, cOn, colados: fuera.length });
    }
    mc.pos[0] = guardaPos[0]; mc.pos[1] = guardaPos[1]; mc.pos[2] = guardaPos[2];
    mc.yaw = guardaYaw; mc.pitch = guardaPitch; mc.cajaAjustada = true;

    game.cajaAjustada = false;
    const guardado = localStorage.getItem('vf_mcCajaAj');
    game.cajaAjustada = true;
    performance.now = relojReal;
    return { cajas, filas, mando: { guardado, leido: game.cajaAjustada } };
  });

  console.log('\nmundo ' + mundo.dim.join('×') + '  ·  ' + mundo.finos + ' voxeles finos en ' + mundo.chunksFinos + ' chunks horneados\n');

  // --- 1. las cajas están bien formadas -----------------------------------------------------------
  ok('todo chunk con geometría trae su alto real', r.cajas.conCaja === r.cajas.total,
     r.cajas.conCaja + ' de ' + r.cajas.total);
  ok('ninguna caja se sale del mundo ni está del revés', r.cajas.malas.length === 0, r.cajas.malas.slice(0, 3).join(' · '));
  ok('alguna caja es MÁS BAJA que la columna entera', r.cajas.masAltaQueElMundo < r.cajas.total,
     r.cajas.masAltaQueElMundo + ' de ' + r.cajas.total + ' siguen siendo columna entera');

  // --- 2. la promesa: recorta más y no cambia la imagen -------------------------------------------
  let ahorroTotal = 0, ahorroFinos = 0;
  for (const f of r.filas) {
    ok('«' + f.nom + '»: la escena estaba quieta (control)', f.quieta, f.h1 + ' vs ' + f.h3);
    ok('«' + f.nom + '»: MISMA IMAGEN, píxel a píxel', f.h1 === f.h2, 'columna ' + f.h1 + ' vs ajustada ' + f.h2);
    ok('«' + f.nom + '»: ajustar solo QUITA chunks, no añade', f.colados === 0, f.colados + ' colados');
    ok('«' + f.nom + '»: no dibuja más que antes', f.cOn.terreno <= f.cOff.terreno && f.cOn.finos <= f.cOff.finos,
       f.cOff.terreno + '→' + f.cOn.terreno + ' terreno, ' + f.cOff.finos + '→' + f.cOn.finos + ' finos');
    ahorroTotal += f.cOff.terreno - f.cOn.terreno;
    ahorroFinos += f.cOff.finos - f.cOn.finos;
  }
  // Sin esto el test pasaría con una implementación que no hiciera absolutamente nada.
  ok('el recorte AHORRA de verdad en alguna vista', ahorroTotal > 0, ahorroTotal + ' chunks de terreno menos en total');
  ok('la capa horneada de voxelesUI también se recorta', ahorroFinos > 0, ahorroFinos + ' chunks finos menos en total');

  // --- 3. el mando existe, se lee y se recuerda ---------------------------------------------------
  ok('game.cajaAjustada se persiste en localStorage', r.mando.guardado === '0', 'valor ' + r.mando.guardado);
  ok('game.cajaAjustada se lee', r.mando.leido === true);

  console.log(fallos ? '\nFALLAN ' + fallos : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
