// Sonda REQ-AG17 · ¿un esqueleto atraviesa una pared, y se mete dentro de otro esqueleto?
// Solo lee y mide. Planta en /map/test y retira lo plantado al final.
const { chromium } = require('playwright');

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
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const suelo = (x, z) => (typeof mcSurfaceY === 'function' ? mcSurfaceY(x, z) : 20);
    const cajaDe = rig => {
      const g = rig.partes[0].s._sig || { x: 0, y: 0, z: 0 };
      return [rig.cuerpo[0] + g.x, rig.cuerpo[2] + g.z, rig.cuerpo[3] + g.x, rig.cuerpo[5] + g.z];
    };

    const X = 70, Z = 70, Y = suelo(X, Z) + 1;
    out.zona = [X, Y, Z];
    // El zombie de disco tiene el cono de vision limitado y nace mirando a donde le toca: parado
    // detras de el, no te ve nunca. Para MEDIR el andar se le da vision 360 y mas radio.
    const doc = await fetch('/data/agentes/zombie.json').then(r => r.json());
    doc.seguir = Object.assign({}, doc.seguir, { vision: 360, deteccion: 40 });
    out.seguir = doc.seguir;

    // ── 1. ¿atraviesa una pared de roca?
    game.tp(X + 8, Y, Z);
    const rig = await game.esqueletos.crear(doc, X, Y, Z);
    if (!rig) return { error: 'no se pudo plantar el zombie' };
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 0; dy < 3; dy++) game.setVoxel(X + 4, Y + dy, Z + dz, 'hab:roca');
    const x0 = rig.eje[0] + (rig.partes[0].s._sig ? rig.partes[0].s._sig.x : 0);
    await sleep(6000);
    const g = rig.partes[0].s._sig || { x: 0 };
    out.paredEnX = X + 4;
    out.xInicial = +x0.toFixed(2);
    out.xFinal = +(rig.eje[0] + g.x).toFixed(2);
    out.atravesoLaPared = (rig.eje[0] + g.x) > X + 4.5;
    out.por = g.por;
    out.estado = game.esqueletos.lista ? JSON.stringify(game.esqueletos.lista()).slice(0,400) : null;
    game.esqueletos.quitar(rig.id);
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 0; dy < 3; dy++) game.setVoxel(X + 4, Y + dy, Z + dz, 0);

    // ── 2. dos esqueletos al mismo cebo: ¿se solapan?
    const A = await game.esqueletos.crear(doc, X, Y, Z + 20);
    const B = await game.esqueletos.crear(doc, X + 1, Y, Z + 20);
    if (A && B) {
      game.tp(X + 10, Y, Z + 20);
      await sleep(6000);
      const ca = cajaDe(A), cb = cajaDe(B);
      out.cajaA = ca.map(v => +v.toFixed(2));
      out.cajaB = cb.map(v => +v.toFixed(2));
      out.seSolapan = ca[0] < cb[2] && ca[2] > cb[0] && ca[1] < cb[3] && ca[3] > cb[1];
      const dx = (ca[0] + ca[2]) / 2 - (cb[0] + cb[2]) / 2, dz = (ca[1] + ca[3]) / 2 - (cb[1] + cb[3]) / 2;
      out.distanciaCentros = +Math.sqrt(dx * dx + dz * dz).toFixed(3);
      out.anchoCuerpo = +(A.cuerpo[3] - A.cuerpo[0]).toFixed(3);
      game.esqueletos.quitar(A.id); game.esqueletos.quitar(B.id);
    }
    return out;
  });

  console.log(JSON.stringify(r, null, 2));
  if (errores.length) console.log('pageerror:', errores.slice(0, 3));
  await b.close();
})();
