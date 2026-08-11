const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('console', m => { const t = m.text(); if (t.includes('renderMode')) console.log(t); });
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = {};
    out.rmDefault = game.renderMode;
    out.sunShadePre = mc.sunShade;
    out.interiorDarkPre = mc.interiorDark;
    out.skipBlockLightPre = !!mc._skipBlockLight;

    // Cambiar a fast
    game.renderMode = 'fast';
    await new Promise(s => setTimeout(s, 200));
    out.rmFast = game.renderMode;
    out.sunShadeFast = mc.sunShade;
    out.interiorDarkFast = mc.interiorDark;
    out.skipBlockLightFast = !!mc._skipBlockLight;

    // Volver a normal
    game.renderMode = 'normal';
    await new Promise(s => setTimeout(s, 200));
    out.rmNormal = game.renderMode;
    out.sunShadeNormal = mc.sunShade;
    out.interiorDarkNormal = mc.interiorDark;
    out.skipBlockLightNormal = !!mc._skipBlockLight;

    // Modo inválido → advertencia + no cambia.
    game.renderMode = 'basura';
    out.rmTrasBasura = game.renderMode;

    return out;
  });

  console.log('Default:      ', r.rmDefault, '(esperado normal)');
  console.log('Tras "fast":  ', r.rmFast, '(esperado fast)');
  console.log('  sunShade    :', r.sunShadePre, '→', r.sunShadeFast, '(esperado 1)');
  console.log('  interiorDark:', r.interiorDarkPre, '→', r.interiorDarkFast, '(esperado 1)');
  console.log('  skipBlockL. :', r.skipBlockLightPre, '→', r.skipBlockLightFast, '(esperado true)');
  console.log('Tras "normal":', r.rmNormal, '(esperado normal)');
  console.log('  sunShade    :', r.sunShadeNormal, '(esperado', r.sunShadePre, ')');
  console.log('  interiorDark:', r.interiorDarkNormal, '(esperado', r.interiorDarkPre, ')');
  console.log('  skipBlockL. :', r.skipBlockLightNormal, '(esperado false)');
  console.log('Tras "basura":', r.rmTrasBasura, '(esperado normal, con warning)');

  await b.close();
})();
