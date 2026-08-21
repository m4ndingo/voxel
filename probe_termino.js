// ¿QUÉ TÉRMINO DE LA LEY SALTA? Sabemos la celda y el grado donde el campo pega el bandazo. Aquí se pone la mira en
// el grado de antes y en el de después y se desglosa TODO lo que entra en su valor: de qué emisor se cree que es su
// luz, el pleno de ese emisor, el camino que dice haber andado, la distancia recta, el coseno con el haz y el
// factor. El término que cambie de golpe es el culpable; los demás se mueven suave.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
const CX = +(process.argv[3] || 50), CY = +(process.argv[4] || 16), CZ = +(process.argv[5] || 48);
const G0 = +(process.argv[6] || -39), G1 = +(process.argv[7] || -38);
const FOCUS = process.argv[8] ? +process.argv[8] : 1;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  ERROR DE PÁGINA: ' + e.message));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async ({ CX, CY, CZ, G0, G1, FOCUS }) => {
    mc.glowFocus = FOCUS;
    const mide = async (g) => {
      mc.pitch = g * Math.PI / 180;
      await mcSyncHeldToolStruct();
      mc._dynSig = null; mcDynSync();
      const D = mc.dynLight, OR = mc._dynOR, DI = mc._dynDI, MX = mc._dynMX, BD = mc._dynBD;
      const lx = CX - D.x0, ly = CY - D.y0, lz = CZ - D.z0;
      const i = lx + ly * D.W + lz * D.W * D.H;
      const ox = OR[i * 3] / MC_LUZ_ORG, oy = OR[i * 3 + 1] / MC_LUZ_ORG, oz = OR[i * 3 + 2] / MC_LUZ_ORG;
      const vx = (CX + 0.5) - ox, vy = (CY + 0.5) - oy, vz = (CZ + 0.5) - oz;
      const e = Math.hypot(vx, vy, vz);
      const bx = BD[i * 3], by = BD[i * 3 + 1], bz = BD[i * 3 + 2];
      const cos = e > 1e-6 ? (vx * bx + vy * by + vz * bz) / (100 * e) : 1;
      // Las semillas, para ver si cambia el reparto o alguna cruza de celda
      const sem = (mc._dynSem || []).slice(0, D.luces).map(s => ({
        cel: [s.x, s.y, s.z], f: [+s.fx.toFixed(3), +s.fy.toFixed(3), +s.fz.toFixed(3)],
        nivel: s.nivel, haz: s.haz ? s.haz.map(v => +v.toFixed(3)) : null }));
      return { nivel: +mcDynNivel(CX, CY, CZ).toFixed(2),
               bl: D.BL[i * 4 + 3], emisor: [+ox.toFixed(3), +oy.toFixed(3), +oz.toFixed(3)],
               MX: MX[i], camino: +(DI[i] / MC_LUZ_DRES).toFixed(3),
               recta: +(Math.abs(vx) + Math.abs(vy) + Math.abs(vz)).toFixed(3),
               BD: [bx, by, bz], cos: +cos.toFixed(4), k: +mcLuzFactorHaz(FOCUS, cos).toFixed(4),
               caja: [D.x0, D.y0, D.z0, D.W, D.H, D.P], luces: D.luces, sem };
    };
    return { a: await mide(G0), b: await mide(G1) };
  }, { CX, CY, CZ, G0, G1, FOCUS });

  const f = (k, a, b) => {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    console.log('  %s %s %s %s', k.padEnd(22), sa.padEnd(26), sa === sb ? '=' : '→', sa === sb ? '' : sb);
  };
  console.log('celda [' + CX + ',' + CY + ',' + CZ + ']   pitch ' + G0 + '° → ' + G1 + '°   focus ' + FOCUS + '\n');
  for (const k of ['nivel', 'bl', 'emisor', 'MX', 'camino', 'recta', 'BD', 'cos', 'k', 'caja', 'luces'])
    f(k, r.a[k], r.b[k]);
  console.log('\n  SEMILLAS');
  for (let i = 0; i < Math.max(r.a.sem.length, r.b.sem.length); i++) {
    const x = r.a.sem[i], y = r.b.sem[i];
    const s = JSON.stringify(x), t = JSON.stringify(y);
    console.log('   %d %s %s', i, s === t ? ' =' : '→→', s === t ? s : s + '\n        ' + t);
  }
  await b.close();
})();
