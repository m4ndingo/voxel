const { chromium } = require('playwright');
const B = process.env.VOXEL_URL || 'http://localhost:8500';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(B + '/map/redstone', { waitUntil:'load', timeout:120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, {timeout:180000});
  await p.waitForFunction('window.game && game.redstone', null, {timeout:60000});
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = {};
    const Y=15, COLS=[62], FILAS=[52];
    const clave=(x,y,z)=>mc.blockKey[mc.grid[mcIdx(x,y,z)]]||null;
    const pl=[COLS[0]+8, Y, FILAS[0]+11];
    game.redstone.encender(pl[0],pl[1],pl[2],false);
    for (let i=0;i<10;i++) game.redstone.tick();
    out.placaInicio = clave(pl[0],pl[1],pl[2]);
    // De pie EXACTAMENTE sobre la placa, sin caer sobre ella (que es lo que pasa al andar).
    mc.pos[0]=pl[0]+0.5; mc.pos[1]=Y; mc.pos[2]=pl[2]+0.5; mc.vel[0]=mc.vel[1]=mc.vel[2]=0;
    for (let i=0;i<30;i++) mcUpdate(1/60);
    out.pos = mc.pos.map(v=>+v.toFixed(4));
    out.placaDePie = clave(pl[0],pl[1],pl[2]);
    // ¿qué ve el sondeo del pie exactamente?
    const T = (typeof MC_T!=='undefined'?MC_T:16), EPS = 1/(T*2);
    const yb = mc.pos[1]-EPS;
    out.bajoPies = { y:+yb.toFixed(4), celda:[Math.floor(mc.pos[0]),Math.floor(yb),Math.floor(mc.pos[2])],
                     clave: clave(Math.floor(mc.pos[0]),Math.floor(yb),Math.floor(mc.pos[2])) };
    out.enPies = { celda:[Math.floor(mc.pos[0]),Math.floor(mc.pos[1]),Math.floor(mc.pos[2])],
                   clave: clave(Math.floor(mc.pos[0]),Math.floor(mc.pos[1]),Math.floor(mc.pos[2])) };
    // …y andando de verdad hasta ella (desde +Z, mirando a -Z)
    game.redstone.encender(pl[0],pl[1],pl[2],false); for (let i=0;i<10;i++) game.redstone.tick();
    mc.pos[0]=pl[0]+0.5; mc.pos[1]=Y; mc.pos[2]=pl[2]+3.5; mc.vel=[0,0,0];
    for (let i=0;i<20;i++) mcUpdate(1/60);
    mc.yaw = 0; mc.keys = mc.keys || {};
    mc.keys['w']=mc.keys['W']=mc.keys['ArrowUp']=true;
    let cruzo=false;
    for (let i=0;i<200 && !cruzo;i++){ mcUpdate(1/60); if(Math.floor(mc.pos[2])===pl[2] && Math.floor(mc.pos[0])===pl[0]) cruzo=true; }
    out.llegoAndando = cruzo; out.posAndando = mc.pos.map(v=>+v.toFixed(3));
    for (let i=0;i<20;i++) mcUpdate(1/60);
    mc.keys['w']=mc.keys['W']=mc.keys['ArrowUp']=false;
    out.placaAndando = clave(pl[0],pl[1],pl[2]);
    out.puerta = clave(COLS[0]+8, Y, FILAS[0]+8);
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
