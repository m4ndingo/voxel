const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) =>
    (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o); });
  await p.goto('http://localhost:8500/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  console.log(JSON.stringify(await p.evaluate(() => {
    const d = mc.dim, cx = Math.floor(d.x/2), cz = Math.floor(d.z/2);
    let gy=0; for(let y=d.y-1;y>=0;y--) if(mcSolid(mc.grid[mcIdx(cx,y,cz)])){ gy=y; break; }
    const sem=[{x:cx,y:gy+2,z:cz,fx:cx+0.5,fy:gy+2.5,fz:cz+0.5,nivel:12,col:[255,255,230],haz:null}];
    mc._dynSig=null; mcDynBake(sem);
    const D=mc.dynLight;
    return { gy, dim:[d.x,d.y,d.z], luzDinamica:mc.luzDinamica, caja:D?[D.x0,D.y0,D.z0,D.W,D.H,D.P,D.luces]:null,
      nivelCentro: D?mcDynNivel(cx,gy+2,cz):null,
      fila: [0,1,2,3,4,5,6].map(k=>+mcDynNivel(cx+k,gy+2,cz).toFixed(3)),
      suelo: [0,1,2,3,4,5,6].map(k=>+mcDynNivel(cx+k,gy+1,cz).toFixed(3)),
      solidoEnGy1: mcSolid(mc.grid[mcIdx(cx,gy+1,cz)]), solidoEnGy: mcSolid(mc.grid[mcIdx(cx,gy,cz)]) };
  }), null, 1));
  await b.close();
})();
