const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({viewport:{width:1280,height:720}});
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.addInitScript(() => { const o=window.fetch; window.fetch=(u,x)=>{const url=String((u&&u.url)||u);
    if(x&&String(x.method||'GET').toUpperCase()==='POST'&&/\/api\//.test(url)) return Promise.resolve(new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json'}}));
    return o(u,x);};});
  await p.goto('http://localhost:8500/map/default', { waitUntil:'load', timeout:180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, {timeout:240000});
  await p.waitForTimeout(9000);
  const r = await p.evaluate(async () => {
    const out={};
    out.sello = window.mcXrayExtra && window.mcXrayExtra._redstone;
    out.hayRs = !!(window.game && window.game.redstone);
    const [X,Y,Z]=[267,15,262];
    out.directo = window.mcXrayExtra ? window.mcXrayExtra(mc.blockKey[mc.grid[mcIdx(X,Y,Z)]], null, X,Y,Z) : 'sin enganche';
    mc.pos[0]=X+0.5; mc.pos[1]=Y; mc.pos[2]=Z+2.5; mc.yaw=Math.PI; mc.pitch=-0.35; mc.xray=true;
    mcRender(); mcUpdateXrayLabels();
    out.labels = [...document.querySelectorAll('.mc-xlbl')].filter(e=>!e.hidden).map(e=>JSON.stringify(e.textContent)).slice(0,20);
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
