// @area: agentes
// @necesita: servidor, playwright
// test_bug_ag14_min_sticked_time.js
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;

  function ok(cond, txt, extra) {
    if (!cond) fallos++;
    console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra ? '   · ' + extra : ''));
  }

  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(async () => {
    const res = {};
    res.defecto = game.minStickedTime;

    // Cambiar umbral a 0.5 s
    game.minStickedTime = 0.5;
    res.modificado = game.minStickedTime;

    // Probar micro-colisión de 0.2 s (menos del umbral de 0.5 s)
    mc.autoUnstick = false;
    mc.stuckTime = 0;
    mc._atascado = false;

    // Forzar colisión simulada mediante mcUpdate
    const originalCollides = mcCollides;

    // Colisión durante 0.2 s
    window.mcCollides = () => true;
    for (let i = 0; i < 10; i++) {
      mcUpdate(0.02); // 10 * 0.02s = 0.2s acumulados
    }
    res.atascadoMicro = mc._atascado;
    res.stuckTimeMicro = mc.stuckTime;

    // Continuar colisión hasta 0.6 s (> 0.5s)
    for (let i = 0; i < 20; i++) {
      mcUpdate(0.02); // +0.4s = 0.6s total acumulado
    }
    res.atascadoProlongado = mc._atascado;
    res.stuckTimeProlongado = mc.stuckTime;

    // Restaurar colisión normal
    window.mcCollides = originalCollides;
    mcUpdate(0.02);
    res.atascadoRestaurado = mc._atascado;
    res.stuckTimeRestaurado = mc.stuckTime;

    // Dejar game.minStickedTime en 1.0 s por defecto
    game.minStickedTime = 1.0;
    res.finalMinTime = game.minStickedTime;

    return res;
  });

  console.log('\n── BUG-AG14 · Umbral de tiempo mínimo para aviso de atasco ──');
  ok(r.defecto === 1, 'game.minStickedTime por defecto es 1.0 s', r.defecto);
  ok(r.modificado === 0.5, 'game.minStickedTime se puede modificar con F12 inspector', r.modificado);
  ok(r.atascadoMicro === false, 'micro-colisión (< umbral minStickedTime) NO dispara el toast de atasco', 'stuckTime=' + Math.round(r.stuckTimeMicro * 100) / 100 + 's');
  ok(r.atascadoProlongado === true, 'colisión continuada (> umbral minStickedTime) SÍ dispara el toast de atasco', 'stuckTime=' + Math.round(r.stuckTimeProlongado * 100) / 100 + 's');
  ok(r.atascadoRestaurado === false, 'al salir de la colisión se resetea el temporizador y el aviso', 'stuckTime=' + r.stuckTimeRestaurado);
  ok(r.finalMinTime === 1, 'se restaura game.minStickedTime a 1.0 s', r.finalMinTime);

  ok(errores.length === 0, 'sin errores JS', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();