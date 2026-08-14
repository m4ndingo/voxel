// Sonda REQ-AG17b · el puñetazo contra otro agente, fotograma a fotograma.
//   node data/tickets/REQ-AG17/sonda_punetazo.js
// La pregunta: cuando el golpeado acaba al otro lado del que tenia delante, ¿lo RODEA (apartado en
// z) o lo ATRAVIESA de un salto grande sin que ningun fotograma llegue a verlos solapados?
// Por eso se apunta el dx de cada fotograma: si algun paso mide mas que el ancho del cuerpo (0.8),
// el muestreo no puede distinguir «rodear» de «tunelar» y la medida del guardian no vale.
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

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };
    const AN = 24, AL = 8, PR = 10;
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
    const ZC = Z + 5;
    out.caja = caja;
    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    const idRoca = mc.name2id['asset:assets/roca.vox.json'] || idSuelo;
    for (let i = -1; i <= AN; i++) for (let k = -1; k <= PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);
    for (let i = 4; i <= 20; i++) for (let j = 0; j < 3; j++) {
      pon(X + i, Y + j, ZC - 2, idRoca); pon(X + i, Y + j, ZC + 1, idRoca);
    }
    mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
    await esperar(500);

    const g_ = (r) => r.partes[0].s._sig || { x: 0, y: 0, z: 0 };
    const cajaDe = (r) => { const c = r.cuerpo, g = g_(r);
      return [c[0]+g.x, c[1]+g.y, c[2]+g.z, c[3]+g.x, c[4]+g.y, c[5]+g.z]; };
    const cen = (r) => { const a = cajaDe(r); return [(a[0]+a[3])/2, (a[1]+a[4])/2, (a[2]+a[5])/2]; };
    const solapan = (a, b) => a[0] < b[3]-1e-4 && a[3] > b[0]+1e-4
                           && a[1] < b[4]-1e-4 && a[4] > b[1]+1e-4
                           && a[2] < b[5]-1e-4 && a[5] > b[2]+1e-4;

    game.esqueletos.quitar();
    const plantar = async (x, z) => {
      const rig = await game.esqueletos.crear('zombie', x, Y, z);
      if (!rig) return null;
      for (let i = 0; i < 200 && !rig.partes.every(P => P.s); i++) await esperar(50);
      if (!rig.partes.every(P => P.s)) return null;
      rig.G.porClave = false; rig.G.quieto = true;
      return rig;
    };
    const golpeado = await plantar(X + 8, ZC);
    const escudo = await plantar(X + 10, ZC);
    if (!golpeado || !escudo) { out.errs.push('no se plantaron'); return out; }

    mc.pos[0] = X + 6; mc.pos[1] = Y; mc.pos[2] = ZC + 0.5;
    mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frames(30);

    out.ancho = +(golpeado.cuerpo[3] - golpeado.cuerpo[0]).toFixed(3);
    out.anchoZ = +(golpeado.cuerpo[5] - golpeado.cuerpo[2]).toFixed(3);
    game.esqueletos.empujar(golpeado, 40);
    const traza = [];
    let xPrev = cen(golpeado)[0], dxMax = 0, nSolape = 0, cruce = null;
    for (let t = 0; t < 240; t++) {
      await frames(1);
      const cg = cen(golpeado), ce = cen(escudo);
      const dx = cg[0] - xPrev; xPrev = cg[0];
      if (Math.abs(dx) > dxMax) dxMax = Math.abs(dx);
      const sol = solapan(cajaDe(golpeado), cajaDe(escudo));
      if (sol) nSolape++;
      if (cruce === null && cg[0] > ce[0]) cruce = t;
      if (t < 40 || (cruce !== null && Math.abs(t - cruce) <= 4))
        traza.push({ t, xg: +cg[0].toFixed(3), xe: +ce[0].toFixed(3),
                     zg: +cg[2].toFixed(3), ze: +ce[2].toFixed(3),
                     dx: +dx.toFixed(3), sol, alto: +((golpeado.mov && golpeado.mov.alto) || 0).toFixed(3) });
    }
    out.res = { framesConSolape: nSolape, pasoMax: +dxMax.toFixed(3), frameDelCruce: cruce };
    out.traza = traza;
    game.esqueletos.quitar();
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
    return out;
  });

  console.log(JSON.stringify(r, null, 1));
  console.log('errores de página:', errs.length ? errs.slice(0, 5) : 'ninguno');
  await b.close();
})();
