// @area: agentes
// @necesita: servidor, playwright
// BUG-AG2 · «los agentes articulados no respetan la altura de los componentes: si una placa de
// redstone tiene altura 1 voxel suben 16, no respetan el cuerpo real de los bloques».
//
// Un agente andaba sobre CELDAS y el jugador sobre CUERPOS. Las dos preguntas que lo causaban:
//
//   · chocaTerreno() usaba `mcSolid` — «¿hay materia en esta celda?» — que da la celda por cubo
//     entero e ignora `atravesable`. app.js, para el jugador, usa mcSolidWalk + el bitset fino de
//     mc._geoFina (mcTerrenoChoca).
//   · asentar() pedia la altura a mcSurfaceNear, que toma por suelo CUALQUIER celda ocupada, a su
//     cota entera: sobre una placa de 2/16 devolvia la celda de la placa y el agente plantaba los
//     pies un BLOQUE por encima de donde los planta el jugador.
//
// Aqui se mide lo que se ve: la altura del pie del agente cruzando por encima de la pieza fina,
// comparada con la del jugador en la misma columna. Se prueban los dos casos, que van por caminos
// distintos del arreglo:
//
//   A · placa ATRAVESABLE  → superficieCerca la salta y el pie se queda en el suelo de verdad.
//   B · la misma lamina SIN atravesable → es suelo, y la bajada de 1/16 apoya el pie en su techo
//       real (2/16), no en el de su celda (16/16).
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node test_agente_cuerpo_real.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.bloques', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };

    // ── el escenario: un pasillo de suelo macizo con la lamina fina en medio ──────────────────
    const AN = 12, AL = 5, PR = 6;
    let caja = null;
    const yTop = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el pasillo'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);

    if (!mc.name2id['hab:placa']) { try { await game.addMaterial('hab:placa'); } catch (e) { out.errs.push('no carga hab:placa: ' + e.message); } }
    const idPlaca = mc.name2id['hab:placa'] || 0;
    if (!idPlaca) { out.errs.push('hab:placa no esta en la paleta'); return out; }
    const XP = X + 6, ZP = Z + 3;                       // la columna de la lamina
    await new Promise(res => setTimeout(res, 600));      // que se hornee la geometria fina

    // El cuerpo REAL de la lamina, leido del mismo sitio del que lo lee app.js.
    const gf = mc._geoFina && mc._geoFina[idPlaca];
    out.fdim = gf && gf.fdim;
    if (gf && gf.bits) {
      const d = gf.fdim; let alto = 0;
      for (let fy = 0; fy < d[1]; fy++) {
        let hay = false;
        for (let fz = 0; fz < d[2] && !hay; fz++) for (let fx = 0; fx < d[0] && !hay; fx++)
          if (gf.bits[(fy * d[2] + fz) * d[0] + fx]) hay = true;
        if (hay) alto = fy + 1;
      }
      out.altoVoxels = alto;
    }
    out.atravesable = !!(mc.atraviesa && mc.atraviesa[idPlaca]);

    // ── el agente: se planta a un lado y se le pone el objetivo al otro, cruzando la lamina ───
    async function cruzar(etiqueta) {
      game.esqueletos.quitar();
      const rig = await game.esqueletos.crear('zombie', X + 2, Y, ZP);
      if (!rig) return { err: 'no se pudo crear el agente' };
      for (let i = 0; i < 200 && !rig.partes.every(P => P.s); i++) await new Promise(res => setTimeout(res, 50));
      if (!rig.partes.every(P => P.s)) return { err: 'el agente no acabo de estamparse' };
      // Objetivo fijo al otro lado del pasillo, y correa larga: que cruce y no se pare a mitad.
      rig.G.objetivo = [X + AN - 2, Y, ZP];
      rig.G.porClave = false;
      rig.G.deteccion = 0;                 // 0 = siempre le ve: nada de rendirse a mitad de camino
      rig.G.distancia = 0.3;
      rig.G.correa = 0;                    // sin correa: el ancla no le tira hacia atras
      rig.G.velocidad = 3;
      const sr = rig.partes[0].s;
      const muestras = [];
      for (let t = 0; t < 200; t++) {
        await new Promise(res => requestAnimationFrame(res));
        const g = sr._sig; if (!g) continue;
        const cx = (rig.cuerpo[0] + rig.cuerpo[3]) * 0.5 + g.x;
        const pie = rig.cuerpo[1] + g.y + (rig.mov ? rig.mov.alto : 0);
        muestras.push({ x: +cx.toFixed(3), pie: +pie.toFixed(4) });
        if (cx > X + AN - 3) break;
      }
      // Lo que interesa: la altura del pie MIENTRAS esta sobre la columna de la lamina...
      const encima = muestras.filter(m => m.x >= XP && m.x < XP + 1);
      // ...y sobre el suelo liso de al lado, que es la referencia de «no ha cambiado nada».
      const llano = muestras.filter(m => m.x >= X + 2.5 && m.x < XP - 1);
      const max = l => l.length ? Math.max.apply(null, l.map(m => m.pie)) : null;
      const min = l => l.length ? Math.min.apply(null, l.map(m => m.pie)) : null;
      game.esqueletos.quitar();
      return { etiqueta, n: muestras.length, nEncima: encima.length, nLlano: llano.length,
               pieEncimaMax: max(encima), pieEncimaMin: min(encima),
               pieLlanoMax: max(llano), pieLlanoMin: min(llano),
               xFinal: muestras.length ? muestras[muestras.length - 1].x : null };
    }

    // A · la placa tal cual: atravesable, se anda por dentro.
    pon(XP, Y, ZP, idPlaca);
    await new Promise(res => setTimeout(res, 400));
    out.A = await cruzar('atravesable');
    // Y el jugador en la misma columna, para comparar con la misma vara de medir.
    const HW = MC_HW * (mc.scale || 1), PH = MC_PH * (mc.scale || 1);
    out.jugadorChocaEnCelda = mcTerrenoChoca(XP + 0.5, Y, ZP + 0.5, HW, PH);

    // B · la misma lamina SIN atravesable: ahora es suelo, y hay que apoyarse en su techo REAL.
    game.bloques.quitar('hab:placa');
    await new Promise(res => setTimeout(res, 400));
    out.atravesableB = !!(mc.atraviesa && mc.atraviesa[idPlaca]);
    out.B = await cruzar('solida');
    game.bloques.define('hab:placa', { atravesable: true });   // se deja como estaba

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja) + '   lamina fdim=' + JSON.stringify(r.fdim)
    + '  alto real=' + r.altoVoxels + '/16  atravesable=' + r.atravesable);
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.A || !r.B) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  if (r.A.err || r.B.err) { console.log('A: ' + r.A.err + ' · B: ' + r.B.err); await b.close(); process.exit(1); }

  const SUELO = r.caja[1];   // el pie sobre el pasillo liso vale exactamente esto
  console.log('\nA · placa ATRAVESABLE (se anda por dentro, como el jugador)');
  console.log('    ' + JSON.stringify(r.A));
  ok(r.A.nEncima > 0, 'el agente llega a pisar la columna de la placa', 'muestras=' + r.A.nEncima);
  ok(r.A.nLlano > 0 && Math.abs(r.A.pieLlanoMax - SUELO) < 1e-3,
    'sobre el pasillo liso el pie esta en el suelo (referencia sin tocar)', 'pie=' + r.A.pieLlanoMax + ' esperado=' + SUELO);
  ok(r.A.pieEncimaMax !== null && r.A.pieEncimaMax - SUELO < 1e-3,
    'sobre la placa atravesable NO sube: mismo pie que en el llano', 'pie=' + r.A.pieEncimaMax + ' esperado=' + SUELO);
  ok(r.jugadorChocaEnCelda === false, 'y el jugador tampoco choca en esa celda (misma regla para los dos)');
  // El numero del ticket, dicho como lo dijo el dueño: subia UN BLOQUE = 16 voxels.
  ok(!(r.A.pieEncimaMax >= SUELO + 1 - 1e-3), 'no se sube los 16 voxels de la celda (el fallo del ticket)',
    'pie=' + r.A.pieEncimaMax);

  console.log('\nB · la misma lamina SIN atravesable (es suelo: se apoya en su techo real)');
  console.log('    ' + JSON.stringify(r.B));
  ok(r.atravesableB === false, 'la lamina esta de verdad solida en este tramo (si no, B no probaria nada)');
  ok(r.B.nEncima > 0, 'el agente llega a pisar la columna de la lamina', 'muestras=' + r.B.nEncima);
  const esperadoB = SUELO + (r.altoVoxels || 2) / 16;
  ok(r.B.pieEncimaMax !== null && Math.abs(r.B.pieEncimaMax - esperadoB) < 1 / 16 + 1e-3,
    'el pie se apoya en el CUERPO de la lamina (' + (r.altoVoxels || 2) + '/16), no en el techo de su celda',
    'pie=' + r.B.pieEncimaMax + ' esperado=' + esperadoB.toFixed(4));
  ok(r.B.pieEncimaMax !== null && r.B.pieEncimaMax < SUELO + 1 - 1e-3,
    'y por tanto sube menos de un bloque entero', 'pie=' + r.B.pieEncimaMax + ' techo de celda=' + (SUELO + 1));

  ok(errores.length === 0, 'sin errores de pagina', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();