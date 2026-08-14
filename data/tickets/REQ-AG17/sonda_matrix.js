// Sonda REQ-AG17 · la queja del dueño tal cual: DOS «Agente Matrix» persiguiendo al JUGADOR (no a
// un punto), que es el caso que el guardián no cubría — los dos quieren el mismo sitio (`distancia`
// 2 alrededor de ti), así que se pelean por él en vez de cruzarse.
//   node data/tickets/REQ-AG17/sonda_matrix.js
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/test';

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
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
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const esperar = (ms) => new Promise(res => setTimeout(res, ms));
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(res => requestAnimationFrame(res)); };
    try { out.version = game.esqueletos().version || (game.bloques.info && 'n/d'); } catch (e) { out.version = 'n/d'; }

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };
    // Descampado con suelo, igual que el guardián.
    const AN = 20, AL = 8, PR = 20;
    let caja = null;
    const yTop = Math.min(38, mc.dim.y - AL - 2);
    for (let y = 8; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;
    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    for (let i = -1; i <= AN; i++) for (let k = -1; k <= PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);
    await esperar(400);

    // El jugador, quieto en medio: es EL objetivo.
    mc.pos[0] = X + 10.5; mc.pos[1] = Y; mc.pos[2] = Z + 10.5;
    mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;

    game.esqueletos.quitar();
    const plantar = async (x, z) => {
      const rig = await game.esqueletos.crear('agente-matrix', x, Y, z);
      if (!rig) return null;
      for (let i = 0; i < 200 && !rig.partes.every(P => P.s); i++) await esperar(50);
      if (!rig.partes.every(P => P.s)) return null;
      rig.G.vision = 360;          // que no dependa de hacia dónde nació mirando (BUG-AG10)
      return rig;
    };
    const A = await plantar(X + 4, Z + 10);
    const B = await plantar(X + 16, Z + 10);
    if (!A || !B) { out.errs.push('no se plantaron'); return out; }
    out.escalarA = A.escalar;

    const g_ = (r) => r.partes[0].s._sig || { x: 0, y: 0, z: 0 };
    const cajaDe = (r) => { const c = r.cuerpo, g = g_(r);
      return [c[0]+g.x, c[1]+g.y, c[2]+g.z, c[3]+g.x, c[4]+g.y, c[5]+g.z]; };
    const solapan = (a, b) => a[0] < b[3]-1e-4 && a[3] > b[0]+1e-4
                           && a[1] < b[4]-1e-4 && a[4] > b[1]+1e-4
                           && a[2] < b[5]-1e-4 && a[5] > b[2]+1e-4;
    let nSolape = 0, peor = 0;
    for (let t = 0; t < 600; t++) {
      await frames(1);
      const a = cajaDe(A), b = cajaDe(B);
      if (solapan(a, b)) {
        nSolape++;
        const ov = Math.min(a[3]-b[0], b[3]-a[0], a[5]-b[2], b[5]-a[2]);
        if (ov > peor) peor = ov;
      }
    }
    const a = cajaDe(A), b = cajaDe(B);
    out.res = { framesConSolape: nSolape, de: 600, penetracionMax: +peor.toFixed(3),
                cajaA: a.map(v => +v.toFixed(2)), cajaB: b.map(v => +v.toFixed(2)),
                solapanAlFinal: solapan(a, b), porA: g_(A).por, porB: g_(B).por };
    game.esqueletos.quitar();
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
    return out;
  });

  console.log(JSON.stringify(r, null, 2));
  console.log('errores de página:', errs.length ? errs.slice(0, 5) : 'ninguno');
  await b.close();
})();
