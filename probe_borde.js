// UN EMISOR CRUZANDO EL BORDE DE SU CELDA, con el haz QUIETO. En las fotos 83/84 del dueño el jugador no se movió
// ni un milímetro (misma pos exacta, solo 1° de yaw) y aun así uno de los 6 voxeles emisivos del pico pasó de la
// celda (20,15,60) a la (21,15,60). La ley es continua en la posición fina del emisor, pero la SIEMBRA se ancla en
// su CELDA: al cruzar, el juego de celdas sembradas se desplaza de golpe. Esto mide si eso se nota.
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
    let A = null;
    for (let y = mc.dim.y - 3; y >= 1 && !A; y--) for (let z = 12; z < mc.dim.z - 12 && !A; z++) {
      let ini = -1;
      for (let x = 12; x < mc.dim.x - 12; x++) {
        if (PASA[mc.grid[mcIdx(x, y, z)]]) { if (ini < 0) ini = x; if (x - ini >= 20) { A = { x: ini + 10, y, z }; break; } } else ini = -1;
      }
    }
    if (!A) return { error: 'sin aire' };
    const LV = 8, R = 10;
    const x0 = A.x - R, y0 = A.y - 2, z0 = A.z - R, W = 2 * R + 1, H = 5, P = 2 * R + 1;
    const BL = new Uint8Array(W * H * P * 4), BD = new Int8Array(W * H * P * 3),
          OR = new Int16Array(W * H * P * 3), DI = new Uint16Array(W * H * P), MX = new Uint8Array(W * H * P);
    const salida = {};
    for (const FOCUS of [0, 1]) {
      const filas = [];
      const ang = 25 * Math.PI / 180, nx = Math.cos(ang), nz = Math.sin(ang);   // haz QUIETO, en diagonal
      for (let s = 0; s <= 32; s++) {
        const fx = A.x + s / 32;                       // el emisor cruza el borde x = A.x + 0.5 a mitad del barrido
        const cx = Math.floor(fx), fy = A.y + 0.5, fz = A.z + 0.5;
        BL.fill(0); BD.fill(0); OR.fill(0); DI.fill(0); MX.fill(0);
        const C = mcCampoLuz(BL, BD, x0, y0, z0, W, H, P, OR, DI, MX);
        const bk = mcLuzBuckets(LV);
        const ed = FOCUS ? new Int16Array([Math.round(nx * 100), 0, Math.round(nz * 100)]) : null;
        mcLuzSiembra(C, PASA, bk, LV, FOCUS, cx, A.y, A.z, ed, 0, null, fx, fy, fz);
        mcLuzDifunde(C, PASA, bk, LV, FOCUS);
        let suma = 0; const celdas = [], coords = [];
        for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
          const v = BL[((A.x + dx - x0) + (A.y - y0) * W + (A.z + dz - z0) * W * H) * 4 + 3] / MC_LUZ_SUB;
          suma += v; celdas.push(v); coords.push(dx + ',' + dz);
        }
        filas.push({ fx: +fx.toFixed(3), cx, suma: +suma.toFixed(1), celdas, coords });
      }
      salida['focus=' + FOCUS] = filas;
    }
    return { salida, A };
  });

  if (r.error) { console.log(r.error); await b.close(); return; }
  console.log('aire usado: ' + JSON.stringify(r.A) + '   (haz QUIETO; solo se desliza el emisor 1 celda entera)');
  for (const etiq of Object.keys(r.salida)) {
    const filas = r.salida[etiq];
    console.log('\n=== ' + etiq + ' ===');
    let mxS = 0, dS = '', mxC = 0, dC = '', cruce = 0;
    for (let i = 1; i < filas.length; i++) {
      const a = filas[i - 1], f = filas[i];
      const d = Math.abs(f.suma - a.suma);
      if (d > mxS) { mxS = d; dS = a.fx + '→' + f.fx + ' (' + a.suma + '→' + f.suma + ')'; }
      for (let k = 0; k < f.celdas.length; k++) {
        const dc = Math.abs(f.celdas[k] - a.celdas[k]);
        if (dc > mxC) { mxC = dc; dC = a.fx + '→' + f.fx + ' celda(' + f.coords[k] + ') ' + a.celdas[k] + '→' + f.celdas[k]; }
      }
      if (a.cx !== f.cx) cruce = d;   // el paso que cruza el borde de celda
    }
    console.log('  suma del campo: ' + Math.min(...filas.map(f => f.suma)) + ' … ' + Math.max(...filas.map(f => f.suma)));
    console.log('  SALTO MÁX del campo por paso (1/32 de bloque): ' + mxS.toFixed(1) + '  · ' + dS);
    console.log('  SALTO MÁX en UNA celda: ' + mxC.toFixed(2) + '  · ' + dC);
    console.log('  salto JUSTO AL CRUZAR el borde de celda: ' + cruce.toFixed(1) + (cruce >= mxS - 0.01 ? '   <<< el cruce ES el peor paso' : ''));
  }
  if (errs.length) console.log('ERRORES: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
