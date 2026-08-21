const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method()==='POST' ? r.fulfill({status:200,body:'{"ok":true}'}) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method()==='POST' ? r.fulfill({status:200,body:'{"ok":true}'}) : r.continue());
  const mapa = process.argv[2] || 'plan';
  await p.goto('http://localhost:8500/map/'+mapa, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout:180000 });
  await p.waitForTimeout(15000);
  await p.evaluate(() => {
    window._e = { n:{}, pilas:{} };
    for (const k of ['mcComputeLight','mcComputeBlockLight','mcSetBlock','mcRestampAll','mcBuildStructAtlas','mcMeshAll','mcRelightBox']) {
      const o = window[k]; if (typeof o !== 'function') continue;
      window[k] = function(...a){
        window._e.n[k] = (window._e.n[k]||0)+1;
        const P = window._e.pilas[k] = window._e.pilas[k] || [];
        if (P.length < 2) P.push(new Error().stack.split('\n').slice(1,8).join(' ⇦ ').replace(/https?:\/\/[^/]+/g,''));
        return o.apply(this,a);
      };
      window[k]._orig = o;
    }
  });
  await p.waitForTimeout(10000);
  const r = await p.evaluate(() => ({ n: window._e.n, pilas: window._e.pilas, fps: Math.round(mc.fps||0) }));
  console.log('== 10 s QUIETO (arrancado hace 25 s) en /map/'+mapa+' · '+r.fps+' fps ==');
  console.log(JSON.stringify(r.n, null, 1));
  for (const k in r.pilas) { console.log('\n-- '+k+' --'); r.pilas[k].forEach(s=>console.log('   '+s)); }
  await b.close();
})();
