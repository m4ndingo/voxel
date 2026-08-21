// EMISOR QUIETO, HAZ QUE GIRA. En las fotos 81/82 del dueño la mano se movió 0,03 bloques y el suelo cambió un
// 20 %: lo único que cambió de verdad fue la ORIENTACIÓN del haz. Aquí se fija la posición y se gira el haz
// grado a grado, midiendo el campo. Además compara el campo del BFS con la LEY CONTINUA (`maxC−(d−1)·k`), que
// es lo que el campo debería valer en aire libre: la diferencia entre ambos es el artefacto del BFS anisótropo.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && typeof mcCampoLuz==="function"', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(() => {
    const PASA = mcTablaLuz();
    // Tramo largo de aire libre, para que no haya materia que justifique ninguna sombra.
    let A = null;
    for (let y = mc.dim.y - 3; y >= 1 && !A; y--) for (let z = 12; z < mc.dim.z - 12 && !A; z++) {
      let ini = -1;
      for (let x = 12; x < mc.dim.x - 12; x++) {
        if (PASA[mc.grid[mcIdx(x, y, z)]]) { if (ini < 0) ini = x; if (x - ini >= 20) { A = { x: ini + 10, y, z }; break; } } else ini = -1;
      }
    }
    if (!A) return { error: 'sin aire' };
    const LV = 8, FOCUS = 1, R = 10;
    const x0 = A.x - R, y0 = A.y - 2, z0 = A.z - R, W = 2 * R + 1, H = 5, P = 2 * R + 1;
    const BL = new Uint8Array(W * H * P * 4), BD = new Int8Array(W * H * P * 3), OR = new Int16Array(W * H * P * 3), DI = new Uint16Array(W * H * P), MX = new Uint8Array(W * H * P);
    const fx = A.x + 0.5, fy = A.y + 0.5, fz = A.z + 0.5;      // emisor CLAVADO en el centro de su celda
    const filas = [];
    for (let g = 0; g <= 90; g += 1) {
      const a = g * Math.PI / 180, nx = Math.cos(a), nz = Math.sin(a);
      BL.fill(0); BD.fill(0); OR.fill(0); DI.fill(0); MX.fill(0);
      const C = mcCampoLuz(BL, BD, x0, y0, z0, W, H, P, OR, DI, MX);
      const bk = mcLuzBuckets(LV);
      const ed = new Int16Array([Math.round(nx * 100), 0, Math.round(nz * 100)]);
      mcLuzSiembra(C, PASA, bk, LV, FOCUS, A.x, A.y, A.z, ed, 0, null, fx, fy, fz);
      mcLuzDifunde(C, PASA, bk, LV, FOCUS);
      // Campo del BFS vs LEY CONTINUA, en el plano del emisor
      let suma = 0, enc = 0, difMax = 0;
      const celdas = [], leyes = [], coords = [];
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const x = A.x + dx, z = A.z + dz;
        const v = BL[((x - x0) + (A.y - y0) * W + (z - z0) * W * H) * 4 + 3] / MC_LUZ_SUB;
        suma += v; if (v > 0) enc++;
        const vx = (x + 0.5) - fx, vz = (z + 0.5) - fz, e = Math.hypot(vx, vz);
        const cos = e > 1e-6 ? (vx * nx + vz * nz) / e : 1;
        const ley = Math.max(0, LV - Math.max(0, Math.abs(vx) + Math.abs(vz) - 1) * mcLuzFactorHaz(FOCUS, cos));
        difMax = Math.max(difMax, Math.abs(v - ley));
        celdas.push(v); leyes.push(+ley.toFixed(2)); coords.push(dx + ',' + dz);
      }
      filas.push({ g, suma: +suma.toFixed(1), enc, difMax: +difMax.toFixed(2), celdas, leyes, coords });
    }
    return { filas, A };
  });

  if (r.error) { console.log(r.error); await b.close(); return; }
  console.log('aire usado: ' + JSON.stringify(r.A) + '   (emisor clavado en el centro de su celda; SOLO gira el haz)');
  console.log('ángulo  suma-campo  celdas-encendidas  |BFS − ley continua| máx');
  let mxSuma = 0, dSuma = '', mxCel = 0, dCel = '', peor = null;
  for (let i = 0; i < r.filas.length; i++) {
    const f = r.filas[i];
    if (i % 5 === 0) console.log('  ' + String(f.g).padStart(3) + '°  ' + String(f.suma).padStart(9) + String(f.enc).padStart(15) + String(f.difMax).padStart(22));
    if (i) {
      const d = Math.abs(f.suma - r.filas[i - 1].suma);
      if (d > mxSuma) { mxSuma = d; dSuma = r.filas[i - 1].g + '°→' + f.g + '° (' + r.filas[i - 1].suma + '→' + f.suma + ')'; }
      for (let k = 0; k < f.celdas.length; k++) {
        const dc = Math.abs(f.celdas[k] - r.filas[i - 1].celdas[k]);
        if (dc > mxCel) {
          mxCel = dc; peor = { i, k };
          dCel = r.filas[i - 1].g + '°→' + f.g + '° celda(' + f.coords[k] + ') BFS ' + r.filas[i - 1].celdas[k] + '→' + f.celdas[k] +
            '   pero la LEY dice ' + r.filas[i - 1].leyes[k] + '→' + f.leyes[k];
        }
      }
    }
  }
  const sumas = r.filas.map(f => f.suma);
  console.log('\nsuma del campo: mín ' + Math.min(...sumas) + '  máx ' + Math.max(...sumas) + '  ⇒ el alcance del haz depende ' + (Math.max(...sumas) / Math.min(...sumas)).toFixed(2) + '× de hacia dónde apunte');
  console.log('SALTO MÁX del campo entero por 1°: ' + mxSuma.toFixed(1) + '  · ' + dSuma);
  console.log('SALTO MÁX en UNA celda por 1°: ' + mxCel.toFixed(2) + '  · ' + dCel);
  console.log('desvío MÁX del BFS respecto a la ley continua: ' + Math.max(...r.filas.map(f => f.difMax)).toFixed(2) + ' niveles');
  if (peor) {   // las celdas que más saltan en ese mismo par de ángulos, con lo que la ley pedía en cada una
    const a = r.filas[peor.i - 1], b = r.filas[peor.i];
    const lista = a.celdas.map((v, k) => ({ c: b.coords[k], d: Math.abs(b.celdas[k] - v), bfs: v + '→' + b.celdas[k], ley: a.leyes[k] + '→' + b.leyes[k] }))
      .filter(o => o.d > 0.01).sort((x, y) => y.d - x.d).slice(0, 8);
    console.log('\nlas que más saltan de ' + a.g + '° a ' + b.g + '°:');
    console.log('  celda    salto   BFS            ley continua');
    for (const o of lista) console.log('  ' + o.c.padEnd(8), o.d.toFixed(2).padStart(5), '  ' + o.bfs.padEnd(14), o.ley);
  }
  if (errs.length) console.log('ERRORES: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
