// @area: general
// @necesita: servidor, playwright
// Los tres interruptores de depuracion de F12 —game.showFPS, game.showVoxels y game.showColors— y sus medidores.
//
// El principio que fija REQ-DBG1 es que un toggle de depuracion vale IGUAL en los tres modos
// (editor 3D, Play y Mundo). BUG-DBG2 fue justo lo contrario y ademas de la peor manera: en el Mundo
// los dos medidores colgaban de _showFPS, asi que #mc-vox se encendia con los fps y game.showVoxels()
// parecia rota aunque guardaba su valor. Un solo caracter de diferencia y ningun test que lo viera.
//
// Lo que se guarda aqui:
//   1. cada medidor obedece SOLO a su interruptor, en el Mundo y en el editor 3D;
//   2. el cambio se ve SIN esperar al siguiente frame (applyShow* refresca los tres modos);
//   3. los tres sobreviven a recargar (localStorage vf_showFPS / vf_showVox / vf_showColors);
//   4. el defecto es fps si, voxels no, colores no.
// No persiste nada en el mundo: solo lee, y bloquea el POST por si la SPA autoguarda al abrirse.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const RAIZ = 'http://localhost:8500';

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  // ── 1 · en el Mundo, cada medidor con su interruptor ────────────────────────────────────────
  await p.goto(RAIZ + '/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(1500);

  console.log('\nEl Mundo: cada medidor obedece a SU interruptor');
  const r1 = await p.evaluate(() => {
    const out = {};
    const ve = () => ({ fps: !document.querySelector('#mc-fps').hidden,
                        vox: !document.querySelector('#mc-vox').hidden,
                        col: !document.querySelector('#mc-col').hidden });
    // Defecto de fabrica: fps si, voxels no, colors no. Se fuerza para no depender de lo que haya en localStorage.
    game.showFPS(true); game.showVoxels(false); game.showColors(false);
    out.defecto = ve();
    // El toggle de fps NO puede tocar el contador de voxels ni colores
    game.showFPS(false);
    out.sinFps = ve();
    game.showFPS(true);
    // Y el de voxels tiene que hacer algo
    game.showVoxels(true);
    out.conVox = ve();
    game.showVoxels(false);
    out.sinVox = ve();
    // Y el de colores tiene que encender solo colores
    game.showColors(true);
    out.conCol = ve();
    game.showColors(false);
    out.sinCol = ve();
    // Los cruces, sin dejar pasar un frame: applyShow* refresca el Mundo, no mcTick.
    game.showFPS(false); game.showVoxels(true); game.showColors(true);
    out.cruzado = ve();
    game.showFPS(true); game.showVoxels(true); game.showColors(true);
    out.todos = ve();
    out.guardado = { fps: localStorage.getItem('vf_showFPS'), vox: localStorage.getItem('vf_showVox'), col: localStorage.getItem('vf_showColors') };
    return out;
  });
  ok('de partida se ven los fps y no los voxels ni colores', r1.defecto.fps === true && r1.defecto.vox === false && r1.defecto.col === false,
     JSON.stringify(r1.defecto));
  ok('showFPS(false) apaga los fps', r1.sinFps.fps === false);
  ok('…y NO toca el contador de voxels ni colores', r1.sinFps.vox === false && r1.sinFps.col === false);
  ok('showVoxels(true) enciende el contador de voxels', r1.conVox.vox === true);
  ok('showVoxels(false) lo apaga', r1.sinVox.vox === false);
  ok('…y NO toca los fps ni colores', r1.sinVox.fps === true && r1.sinVox.col === false);
  ok('showColors(true) enciende el contador de colores', r1.conCol.col === true);
  ok('showColors(false) lo apaga', r1.sinCol.col === false);
  ok('…y NO toca los fps ni voxels', r1.sinCol.fps === true && r1.sinCol.vox === false);
  ok('se pueden cruzar: vox+col si, fps no', r1.cruzado.fps === false && r1.cruzado.vox === true && r1.cruzado.col === true,
     JSON.stringify(r1.cruzado));
  ok('y los tres a la vez', r1.todos.fps === true && r1.todos.vox === true && r1.todos.col === true);
  ok('los tres se guardan en localStorage', r1.guardado.fps === '1' && r1.guardado.vox === '1' && r1.guardado.col === '1',
     JSON.stringify(r1.guardado));

  // ── 2 · sobreviven a recargar ───────────────────────────────────────────────────────────────
  console.log('\nSobreviven a recargar');
  await p.goto(RAIZ + '/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(1500);
  const r2 = await p.evaluate(() => ({
    fps: !document.querySelector('#mc-fps').hidden,
    vox: !document.querySelector('#mc-vox').hidden,
    col: !document.querySelector('#mc-col').hidden,
    valores: { fps: String(game.showFPS), vox: String(game.showVoxels), col: String(game.showColors) },
  }));
  ok('vuelven encendidos los tres', r2.fps === true && r2.vox === true && r2.col === true, JSON.stringify(r2.valores));

  // Se dejan voxels y colores como estaban de fabrica (apagados).
  await p.evaluate(() => { game.showVoxels(false); game.showColors(false); });

  // ── 3 · el mismo interruptor en el editor 3D ────────────────────────────────────────────────
  console.log('\nEl editor 3D obedece los mismos tres');
  // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
  await p.goto(RAIZ + '/?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof setMode === "function" && typeof game !== "undefined"', { timeout: 120000 });
  await p.waitForTimeout(1000);
  const r3 = await p.evaluate(() => {
    setMode('3d');
    const ve = () => ({ fps: !document.querySelector('#e3-fps').hidden,
                        vox: !document.querySelector('#e3-vox').hidden,
                        col: !document.querySelector('#e3-col').hidden });
    const out = {};
    game.showFPS(true); game.showVoxels(false); game.showColors(false); out.soloFps = ve();
    game.showFPS(false); game.showVoxels(true); game.showColors(false); out.soloVox = ve();
    game.showFPS(false); game.showVoxels(false); game.showColors(true); out.soloCol = ve();
    game.showFPS(true); game.showVoxels(false); game.showColors(false);
    return out;
  });
  ok('solo fps => solo #e3-fps', r3.soloFps.fps === true && r3.soloFps.vox === false && r3.soloFps.col === false, JSON.stringify(r3.soloFps));
  ok('solo voxels => solo #e3-vox', r3.soloVox.fps === false && r3.soloVox.vox === true && r3.soloVox.col === false, JSON.stringify(r3.soloVox));
  ok('solo colors => solo #e3-col', r3.soloCol.fps === false && r3.soloCol.vox === false && r3.soloCol.col === true, JSON.stringify(r3.soloCol));

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\ntodo ok');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();