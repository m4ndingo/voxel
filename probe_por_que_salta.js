// ¿POR QUÉ salta la luz al ANDAR? El dueño lo ve caminando con la espada, así que aquí se camina: se mueve un
// racimo de emisores como el de la espada (24 en 2 celdas, con haz) por delante del ojo, en pasos de 1/16 de
// bloque, y se mira el nivel en celdas FIJAS del suelo. Se mide el ESCALÓN entre dos pasos consecutivos.
//
// La diferencia con probe_salto_luz.js —y el motivo de que aquella medida se quedara corta— es que ALLÍ se hacía
// `mc._dynSig=null` antes de cada horneado, o sea que se le quitaba al motor la congelación por firma. Aquí NO:
// el campo se queda quieto mientras la firma no cambia, exactamente como en el navegador del dueño, y por eso
// aparece el patrón real «quieto, quieto, BRINCO».
//
// Cada escalón se ATRIBUYE a una causa, que es lo único que sirve para arreglarlo:
//   · CAJA      — la caja del campo dinámico cambió de sitio/tamaño (el borde recortado barre celdas)
//   · REHORNEO  — la firma cambió y el campo se recalculó (aquí es donde se paga la congelación)
//   · CONGELADO — la firma NO cambió: el campo es idéntico, el escalón tiene que ser 0
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    const d = mc.dim, cx = Math.floor(d.x / 2), cz = Math.floor(d.z / 2);
    // Suelo real bajo el camino: la luz del dueño cae sobre el suelo, no sobre aire vacío.
    let gy = 0; for (let y = d.y - 1; y >= 0; y--) if (mcSolid(mc.grid[mcIdx(cx, y, cz)])) { gy = y; break; }
    // Celdas fijas: la mancha del suelo delante del jugador y un par de alturas. Es lo que él mira al andar.
    const celdas = [];
    for (let dx = -2; dx <= 6; dx++) for (let dz = -3; dz <= 3; dz += 3) celdas.push([cx + dx, gy + 1, cz + dz]);
    for (let dx = 0; dx <= 6; dx += 2) celdas.push([cx + dx, gy + 3, cz]);

    // El racimo de la espada: 24 emisores metidos en 2 celdas, con haz hacia donde se mira.
    const semillas = (px, pz, yaw) => {
      const s = [], ha = [Math.sin(yaw), -0.15, Math.cos(yaw)];
      const hx = px + Math.sin(yaw) * 0.7, hz = pz + Math.cos(yaw) * 0.7, hy = gy + 2.2;   // la mano, delante del ojo
      for (let i = 0; i < 24; i++) {
        const fx = hx + (i % 4) * 0.0625, fy = hy + (((i / 4) | 0) % 3) * 0.0625, fz = hz + (((i / 12) | 0)) * 0.0625;
        s.push({ x: Math.floor(fx), y: Math.floor(fy), z: Math.floor(fz), fx, fy, fz,
                 nivel: 12, col: [255, 255, 230], haz: ha.slice() });
      }
      return s;
    };

    const barrido = (nombre, N, mueve) => {
      mc._dynSig = null; mc.dynLight = null;
      const pasos = [];
      for (let i = 0; i < N; i++) {
        const q = mueve(i);
        mc.pos[0] = q.px; mc.pos[2] = q.pz;                    // el recorte de la caja se centra en el OJO
        const antesSig = mc._dynSig, antesCaja = mc.dynLight ? [mc.dynLight.x0, mc.dynLight.y0, mc.dynLight.z0, mc.dynLight.W, mc.dynLight.H, mc.dynLight.P].join(',') : '';
        mcDynBake(semillas(q.px, q.pz, q.yaw));
        const caja = [mc.dynLight.x0, mc.dynLight.y0, mc.dynLight.z0, mc.dynLight.W, mc.dynLight.H, mc.dynLight.P].join(',');
        pasos.push({ i, t: +q.t.toFixed(4), rehorneo: mc._dynSig !== antesSig, cajaMovida: caja !== antesCaja,
                     celdaEmisor: semillas(q.px, q.pz, q.yaw)[0].x + ',' + semillas(q.px, q.pz, q.yaw)[0].z,
                     v: celdas.map(c => +mcDynNivel(c[0], c[1], c[2]).toFixed(4)) });
      }
      const esc = [];
      for (let i = 1; i < pasos.length; i++) {
        let m = 0, dónde = -1;
        for (let j = 0; j < celdas.length; j++) { const a = Math.abs(pasos[i].v[j] - pasos[i - 1].v[j]); if (a > m) { m = a; dónde = j; } }
        esc.push({ t: pasos[i].t, salto: +m.toFixed(3), celda: dónde >= 0 ? celdas[dónde].join(',') : null,
                   rehorneo: pasos[i].rehorneo, cajaMovida: pasos[i].cajaMovida,
                   cruzaCelda: pasos[i].celdaEmisor !== pasos[i - 1].celdaEmisor });
      }
      const ord = esc.map(e => e.salto).slice().sort((a, b) => a - b);
      const congeladosNoCero = esc.filter(e => !e.rehorneo && e.salto > 0).length;   // debería ser 0 siempre
      return { nombre, pasos: esc.length,
               maxSalto: Math.max(...esc.map(e => e.salto)),
               medianaSalto: ord[ord.length >> 1],
               rehorneos: esc.filter(e => e.rehorneo).length,
               cajasMovidas: esc.filter(e => e.cajaMovida).length,
               congeladosNoCero,
               saltoMedioEnRehorneo: +(esc.filter(e => e.rehorneo).reduce((s, e) => s + e.salto, 0) / Math.max(1, esc.filter(e => e.rehorneo).length)).toFixed(3),
               saltoMedioSinRehorneo: +(esc.filter(e => !e.rehorneo).reduce((s, e) => s + e.salto, 0) / Math.max(1, esc.filter(e => !e.rehorneo).length)).toFixed(3),
               saltoEnCajaMovida: +(esc.filter(e => e.cajaMovida).reduce((s, e) => s + e.salto, 0) / Math.max(1, esc.filter(e => e.cajaMovida).length)).toFixed(3),
               peores: esc.slice().sort((a, b) => b.salto - a.salto).slice(0, 5) };
    };

    const yaw0 = 0.6;
    const out = {};
    for (const suave of [true, false]) {
      game.luzSuave = suave;
      const k = suave ? 'conSuave' : 'sinSuave';
      out[k] = {
        andar: barrido('andar 2 bloques en pasos de 1/16', 33, i => ({ t: i / 16, px: cx + 0.5 + i / 16, pz: cz + 0.5, yaw: yaw0 })),
        girar: barrido('girar 45° en pasos de 1,4°', 33, i => ({ t: i, px: cx + 0.5, pz: cz + 0.5, yaw: yaw0 + i * Math.PI / 128 })),
      };
    }
    game.luzSuave = true;
    return { celdas: celdas.length, gy, SUB: MC_LUZ_SUB, focus: mc.glowFocus, tope: MC_DYN_CELDAS, out };
  });

  const linea = (s) => {
    console.log('\n   ── ' + s.nombre);
    console.log('      salto MÁXIMO entre dos pasos: ' + s.maxSalto + ' NIVELES   ·   mediana: ' + s.medianaSalto);
    console.log('      rehorneos: ' + s.rehorneos + '/' + s.pasos + '   ·   cajas movidas: ' + s.cajasMovidas +
                '   ·   pasos CONGELADOS con salto≠0: ' + s.congeladosNoCero + ' (debe ser 0)');
    console.log('      salto medio · en rehorneo: ' + s.saltoMedioEnRehorneo + ' · congelado: ' + s.saltoMedioSinRehorneo +
                ' · cuando se mueve la caja: ' + s.saltoEnCajaMovida);
    console.log('      los 5 peores: ' + JSON.stringify(s.peores));
  };
  console.log('══ POR QUÉ SALTA · ' + r.celdas + ' celdas fijas del suelo (y=' + (r.gy + 1) + ') · MC_LUZ_SUB=' + r.SUB +
              ' · glowFocus=' + r.focus + ' · tope de caja=' + r.tope);
  for (const k of ['conSuave', 'sinSuave']) { console.log('\n' + k.toUpperCase()); linea(r.out[k].andar); linea(r.out[k].girar); }
  await b.close();
})();
