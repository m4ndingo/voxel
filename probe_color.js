// ¿Por qué el pico (mango azul, 6 voxeles) va a saltos y la espada de luz (45 voxeles cálidos) no?
// Mueve UNA luz de un solo voxel en pasos finísimos y saca los 4 bytes crudos del campo en una celda fija:
// si el ALFA (nivel) avanza suave y el RGB da zancadas, el escalón está en cómo se CODIFICA el color, no en la ley.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof mcCampoLuz==="function"', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(() => {
    // Busca un tramo LARGO de aire real (el campo solo se propaga por donde PASA dice que pasa).
    const PASA = mcTablaLuz();
    let mejor = null;
    for (let y = mc.dim.y - 2; y >= 1 && !mejor; y--) for (let z = 1; z < mc.dim.z - 1 && !mejor; z++) {
      let ini = -1;
      for (let x = 1; x < mc.dim.x - 1; x++) {
        const aire = !!PASA[mc.grid[mcIdx(x, y, z)]];
        if (aire) { if (ini < 0) ini = x; if (x - ini >= 20) { mejor = { x: ini, y, z }; break; } } else ini = -1;
      }
    }
    if (!mejor) return { error: 'sin tramo de aire' };
    const x0 = mejor.x, y0 = mejor.y - 1, z0 = mejor.z - 1, W = 24, H = 3, P = 3;
    const BL = new Uint8Array(W * H * P * 4), BD = new Int8Array(W * H * P * 3);
    const salida = { _tramo: mejor };
    for (const [etiq, hex] of [['pico  #356fb8', '#356fb8'], ['espada #FFF1E8', '#FFF1E8']]) {
      const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
      const col = new Uint8Array([cr, cg, cb]);
      const filas = [];
      for (let i = 0; i <= 16; i++) {
        const fx = mejor.x + 1 + i / 16;             // la luz cruza UNA celda entera en 16 pasos
        BL.fill(0); BD.fill(0);
        const C = mcCampoLuz(BL, BD, x0, y0, z0, W, H, P);
        const buckets = mcLuzBuckets(MC_MAXLIGHT);
        mcLuzSiembra(C, PASA, buckets, MC_MAXLIGHT, 0, Math.floor(fx), mejor.y, mejor.z, null, 0, col, fx, mejor.y + 0.5, mejor.z + 0.5);
        mcLuzDifunde(C, PASA, buckets, MC_MAXLIGHT, 0);
        const muestra = [];
        for (const d of [3, 6]) { const k = ((mejor.x + 1 + d - x0) + (mejor.y - y0) * W + (mejor.z - z0) * W * H) * 4; muestra.push([BL[k], BL[k + 1], BL[k + 2], BL[k + 3]]); }
        filas.push({ fx: +fx.toFixed(3), a: muestra[0], b: muestra[1] });
      }
      salida[etiq] = filas;
    }
    return salida;
  });

  console.log('tramo de aire usado: ' + JSON.stringify(r._tramo));
  for (const etiq of Object.keys(r)) {
    if (etiq.startsWith('_')) continue;
    console.log('\n=== ' + etiq + ' ===');
    console.log('  fx      celda +3 (R,G,B,nivel)      celda +6 (R,G,B,nivel)');
    for (const f of r[etiq]) console.log('  ' + String(f.fx).padEnd(7), JSON.stringify(f.a).padEnd(26), JSON.stringify(f.b));
    for (const cel of ['a', 'b']) for (let ch = 0; ch < 4; ch++) {
      let mx = 0; for (let i = 1; i < r[etiq].length; i++) mx = Math.max(mx, Math.abs(r[etiq][i][cel][ch] - r[etiq][i - 1][cel][ch]));
      const nom = ['R', 'G', 'B', 'nivel'][ch];
      if (ch === 0) process.stdout.write('  salto máx por paso, celda ' + (cel === 'a' ? '+3' : '+6') + ': ');
      process.stdout.write(nom + '=' + mx + '  ');
      if (ch === 3) console.log('');
    }
  }
  if (errs.length) console.log('ERRORES: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
