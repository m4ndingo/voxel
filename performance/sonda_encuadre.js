// sonda REQ-OSD7 · ¿por qué el encuadre del OSD no coincide con el del mapa a pelo?
const { chromium } = require('playwright');
const POS = [49.54, 18.2, 54.7], YAW = 0, PITCH = -50;

const estado = () => ({
  pos: mc.pos.slice(), yaw: mc.yaw, pitch: mc.pitch, gyaw: game.yaw, gpitch: game.pitch,
  fov: mc.fov, scale: mc.scale, esc: mc.escaparate, volar: mc.volar,
  cvW: mc.canvas.width, cvH: mc.canvas.height,
  cssW: mc.canvas.clientWidth, cssH: mc.canvas.clientHeight,
  rect: (r => [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)])(mc.canvas.getBoundingClientRect()),
  aspect: +(mc.canvas.width / mc.canvas.height).toFixed(4),
  renderScale: mc.renderScale, dpr: window.devicePixelRatio,
  vp: (() => { const v = mc.gl.getParameter(mc.gl.VIEWPORT); return [v[0], v[1], v[2], v[3]]; })()
});

const congela = ([p, y, pi]) => {
  mc.volar = true; mc.vel = [0, 0, 0];
  mc.pos = p.slice();
  mc.yaw = y * Math.PI / 180; mc.pitch = pi * Math.PI / 180;
  mcRender();
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });

  // A · el mapa a pelo, colocando la cámara a mano (lo que el dueño ve al encuadrar)
  const a = await ctx.newPage();
  await a.goto('http://localhost:8500/map/menu1');
  await a.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await a.evaluate(congela, [POS, YAW, PITCH]);
  await a.waitForTimeout(1500);
  await a.evaluate(congela, [POS, YAW, PITCH]);
  const datosA = await a.evaluate(estado);
  await a.locator('#mc-canvas').screenshot({ path: '/tmp/enc_a.png' });

  // B · el mismo mapa como pantalla OSD, con el encuadre declarado
  const p = await ctx.newPage();
  await p.goto('http://localhost:8500/map/test');
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await p.evaluate(([pos, yaw, pitch]) => {
    game.osd.define('menu', { mapa: 'menu1', pos, yaw, pitch });
    game.osd.abrir('menu');
  }, [POS, YAW, PITCH]);
  let hijo = null;
  for (let i = 0; i < 120 && !hijo; i++) {
    hijo = p.frames().find(f => f !== p.mainFrame() && /osd=1/.test(f.url()));
    if (!hijo) await p.waitForTimeout(500);
  }
  console.log('URL hijo:', hijo.url());
  await hijo.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 240000 });
  await p.waitForFunction(() => { const f = document.querySelector('#mc-osd iframe'); return f && !f.classList.contains('cargando'); }, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const datosB = await hijo.evaluate(estado);
  await hijo.locator('#mc-canvas').screenshot({ path: '/tmp/enc_b.png' });
  const marco = await p.evaluate(() => {
    const f = document.querySelector('#mc-osd iframe'); const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    return { rect: [r.x, r.y, r.width, r.height], w: f.width, h: f.height, transform: cs.transform, zoom: cs.zoom };
  });

  console.log('A (mapa a pelo):', JSON.stringify(datosA));
  console.log('B (como OSD)   :', JSON.stringify(datosB));
  console.log('marco iframe   :', JSON.stringify(marco));
  const dif = Object.keys(datosA).filter(k => JSON.stringify(datosA[k]) !== JSON.stringify(datosB[k]));
  console.log('DIFERENCIAS:', dif.map(k => k + ': ' + JSON.stringify(datosA[k]) + ' → ' + JSON.stringify(datosB[k])).join(' | '));
  await b.close();
})();
