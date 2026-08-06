// Los dos interruptores de depuracion de F12 —game.showFPS y game.showVoxels— y sus medidores.
//
// El principio que fija REQ-DBG1 es que un toggle de depuracion vale IGUAL en los tres modos
// (editor 3D, Play y Mundo). BUG-DBG2 fue justo lo contrario y ademas de la peor manera: en el Mundo
// los dos medidores colgaban de _showFPS, asi que #mc-vox se encendia con los fps y game.showVoxels()
// parecia rota aunque guardaba su valor. Un solo caracter de diferencia y ningun test que lo viera.
//
// Lo que se guarda aqui:
//   1. cada medidor obedece SOLO a su interruptor, en el Mundo y en el editor 3D;
//   2. el cambio se ve SIN esperar al siguiente frame (applyShow* refresca los tres modos);
//   3. los dos sobreviven a recargar (localStorage vf_showFPS / vf_showVox);
//   4. el defecto es fps si, voxels no.
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
                        vox: !document.querySelector('#mc-vox').hidden });
    // Defecto de fabrica: fps si, voxels no. Se fuerza para no depender de lo que haya en localStorage.
    game.showFPS(true); game.showVoxels(false);
    out.defecto = ve();
    // El toggle de fps NO puede tocar el contador de voxels: ese era el bug.
    game.showFPS(false);
    out.sinFps = ve();
    game.showFPS(true);
    // Y el de voxels tiene que hacer algo, que era la otra mitad del reporte.
    game.showVoxels(true);
    out.conVox = ve();
    game.showVoxels(false);
    out.sinVox = ve();
    // Los cuatro cruces, sin dejar pasar un frame: applyShow* refresca el Mundo, no mcTick.
    game.showFPS(false); game.showVoxels(true);
    out.cruzado = ve();
    game.showFPS(true); game.showVoxels(true);
    out.ambos = ve();
    out.guardado = { fps: localStorage.getItem('vf_showFPS'), vox: localStorage.getItem('vf_showVox') };
    return out;
  });
  ok('de partida se ven los fps y no los voxels', r1.defecto.fps === true && r1.defecto.vox === false,
     JSON.stringify(r1.defecto));
  ok('showFPS(false) apaga los fps', r1.sinFps.fps === false);
  ok('…y NO toca el contador de voxels', r1.sinFps.vox === false, 'BUG-DBG2: aqui se apagaban los dos');
  ok('showVoxels(true) enciende el contador de voxels', r1.conVox.vox === true, 'antes no hacia nada');
  ok('showVoxels(false) lo apaga', r1.sinVox.vox === false);
  ok('…y NO toca los fps', r1.sinVox.fps === true);
  ok('se pueden cruzar: vox si, fps no', r1.cruzado.fps === false && r1.cruzado.vox === true,
     JSON.stringify(r1.cruzado));
  ok('y los dos a la vez', r1.ambos.fps === true && r1.ambos.vox === true);
  ok('los dos se guardan en localStorage', r1.guardado.fps === '1' && r1.guardado.vox === '1',
     JSON.stringify(r1.guardado));

  // ── 2 · sobreviven a recargar ───────────────────────────────────────────────────────────────
  console.log('\nSobreviven a recargar');
  await p.goto(RAIZ + '/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(1500);
  const r2 = await p.evaluate(() => ({
    fps: !document.querySelector('#mc-fps').hidden,
    vox: !document.querySelector('#mc-vox').hidden,
    valores: { fps: String(game.showFPS), vox: String(game.showVoxels) },
  }));
  ok('vuelven encendidos los dos', r2.fps === true && r2.vox === true, JSON.stringify(r2.valores));

  // Se deja el contador de voxels como estaba de fabrica, que es apagado.
  await p.evaluate(() => { game.showVoxels(false); });

  // ── 3 · el mismo interruptor en el editor 3D ────────────────────────────────────────────────
  console.log('\nEl editor 3D obedece los mismos dos');
  await p.goto(RAIZ + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof setMode === "function" && typeof game !== "undefined"', { timeout: 120000 });
  await p.waitForTimeout(1000);
  const r3 = await p.evaluate(() => {
    setMode('3d');
    const ve = () => ({ fps: !document.querySelector('#e3-fps').hidden,
                        vox: !document.querySelector('#e3-vox').hidden });
    const out = {};
    game.showFPS(true); game.showVoxels(false); out.soloFps = ve();
    game.showFPS(false); game.showVoxels(true); out.soloVox = ve();
    game.showFPS(true); game.showVoxels(false);
    return out;
  });
  ok('solo fps => solo #e3-fps', r3.soloFps.fps === true && r3.soloFps.vox === false, JSON.stringify(r3.soloFps));
  ok('solo voxels => solo #e3-vox', r3.soloVox.fps === false && r3.soloVox.vox === true, JSON.stringify(r3.soloVox));

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\ntodo ok');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
