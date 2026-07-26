#!/usr/bin/env node
// MOCK · Árboles voxel (tronco + ramas + copa). 3 diseños en assets/trees_mock/ SIN tocar index.json.
// Modelos 32³ tipo 'objeto' (z ARRIBA, ver CUBE_FACES en app.js). Uso: node make_trees.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname), S = 32;
fs.mkdirSync(DIR, { recursive: true });

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function jitter(hex, amt, r){
  const n=parseInt(hex.slice(1),16); let R=n>>16&255,G=n>>8&255,B=n&255;
  const d=Math.round((r()*2-1)*amt);
  R=Math.max(0,Math.min(255,R+d)); G=Math.max(0,Math.min(255,G+d)); B=Math.max(0,Math.min(255,B+d));
  return '#'+((1<<24)+(R<<16)+(G<<8)+B).toString(16).slice(1);
}
const inb = v => v>=0 && v<S;

function make(builder, seed){
  const r = mulberry32(seed);
  const vox = {};
  const put = (x,y,z,c,over=true)=>{ x=Math.round(x);y=Math.round(y);z=Math.round(z);
    if(!inb(x)||!inb(y)||!inb(z)) return; const k=x+','+y+','+z;
    if(over || !(k in vox)) vox[k]=c; };
  // cilindro/tronco vertical (o inclinado) de radio rad
  const trunk = (x0,y0,z0,z1,rad,col)=>{ for(let z=z0;z<=z1;z++){ const t=(z-z0)/Math.max(1,z1-z0);
    const cx=x0+(builder.lean?builder.lean*t:0);
    for(let dx=-rad;dx<=rad;dx++)for(let dy=-rad;dy<=rad;dy++)
      if(dx*dx+dy*dy<=rad*rad+0.5) put(cx+dx,y0+dy,z,col(r)); } };
  // rama: línea gruesa de a->b con bolita de radio rb
  const branch = (ax,ay,az,bx,by,bz,rb,col)=>{ const n=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay),Math.abs(bz-az)))*2;
    for(let i=0;i<=n;i++){ const t=i/n, x=ax+(bx-ax)*t, y=ay+(by-ay)*t, z=az+(bz-az)*t;
      for(let dx=-rb;dx<=rb;dx++)for(let dy=-rb;dy<=rb;dy++)for(let dz=-rb;dz<=rb;dz++)
        if(dx*dx+dy*dy+dz*dz<=rb*rb+0.3) put(x+dx,y+dy,z+dz,col(r)); } };
  // esfera de follaje (no pisa la madera), con matices de superficie
  const blob = (cx,cy,cz,rad,inner,edge)=>{ const R2=rad*rad;
    for(let dx=-rad-1;dx<=rad+1;dx++)for(let dy=-rad-1;dy<=rad+1;dy++)for(let dz=-rad-1;dz<=rad+1;dz++){
      const d2=dx*dx+dy*dy+dz*dz, wob=(r()*2-1)*rad*0.55;
      if(d2<=R2+wob){ const near=d2>R2-rad*1.4; put(cx+dx,cy+dy,cz+dz, (near?edge:inner)(r), false); } } };
  // cono/falda de conífera: discos que menguan de z0(rad) a z1(0)
  const skirt = (cx,cy,z0,z1,rad,col)=>{ for(let z=z0;z<=z1;z++){ const rr=rad*(z1-z)/Math.max(1,z1-z0);
    const R2=rr*rr; for(let dx=-rr-1;dx<=rr+1;dx++)for(let dy=-rr-1;dy<=rr+1;dy++){
      const d2=dx*dx+dy*dy, wob=(r()*2-1)*1.4; if(d2<=R2+wob) put(cx+dx,cy+dy,z,col(r),false); } } };
  builder.build({ put, trunk, branch, blob, skirt, r });
  return vox;
}

const C = 16; // centro x/y
const TREES = {
  roble: { name:'Roble', icon:'🌳', role:'Árbol · roble frondoso',
    build:({trunk,branch,blob,r})=>{
      const bark = rr=> jitter('#6b4a2a',16,rr);
      const leaf = rr=> jitter('#4e8b3a',24,rr);
      const leafHi = rr=> rr()<0.5 ? jitter('#6db64a',22,rr) : jitter('#3f7a30',20,rr);
      trunk(C,C,0,13,2.4,bark);
      const ends=[[6,6,20],[-6,5,19],[5,-6,20],[-5,-6,18],[0,0,23]];
      for(const [ex,ey,ez] of ends) branch(C,C,11, C+ex,C+ey,ez, 1.4, bark);
      blob(C,C,22,8, leaf, leafHi);
      for(const [ex,ey,ez] of ends) blob(C+ex,C+ey,ez+1,4.5, leaf, leafHi);
    } },
  pino: { name:'Pino', icon:'🌲', role:'Árbol · pino conífera',
    lean:0,
    build:({trunk,skirt,blob,r})=>{
      const bark = rr=> jitter('#4f3a22',14,rr);
      const nd   = rr=> rr()<0.18 ? jitter('#3f7a3a',18,rr) : jitter('#2f6b3a',18,rr);
      trunk(C,C,0,22,1.4,bark);
      skirt(C,C,4,12,8.5,nd);
      skirt(C,C,10,17,6.5,nd);
      skirt(C,C,15,22,5,nd);
      skirt(C,C,20,28,3.2,nd);
      blob(C,C,29,1.4, nd, nd);   // puntita
    } },
  cerezo: { name:'Cerezo', icon:'🌸', role:'Árbol · cerezo en flor',
    lean:1.5,
    build:({trunk,branch,blob,r})=>{
      const bark = rr=> jitter('#8a6b52',14,rr);
      const petal= rr=>{ const t=rr(); return t<0.10?'#ffffff': t<0.5? jitter('#f2a9cb',16,rr): jitter('#e07ba8',16,rr); };
      const petalHi=rr=> rr()<0.45? jitter('#ffd0e6',12,rr): jitter('#f2a9cb',14,rr);
      trunk(C,C,0,10,2.2,bark);
      const ends=[[7,6,17],[-7,6,16],[6,-7,17],[-6,-7,15],[0,2,19],[2,-1,18]];
      for(const [ex,ey,ez] of ends) branch(C,C+2,9, C+ex,C+ey,ez, 1.2, bark);
      for(const [ex,ey,ez] of ends) blob(C+ex,C+ey,ez+1,4, petal, petalHi);
      blob(C,C,17,5, petal, petalHi);
    } },
};

const idx=[];
for(const [id,def] of Object.entries(TREES)){
  const seed = 0x9e3779b1 ^ id.split('').reduce((a,c)=>a*33+c.charCodeAt(0)|0, 11);
  const vox = make(def, seed);
  const doc = { format:'voxelforge-1', size:S,
    meta:{ name:def.name, type:'objeto', role:def.role, icon:def.icon,
           description:`${def.name} — árbol voxel ${S}³ (MOCK, aún no es asset).` },
    voxels: vox };
  fs.writeFileSync(path.join(DIR,`${id}.vox.json`), JSON.stringify(doc));
  idx.push({ id, name:def.name, role:def.role, icon:def.icon, type:'objeto', size:S, file:`assets/trees_mock/${id}.vox.json` });
  console.log('escrito', `${id}.vox.json`, '·', Object.keys(vox).length, 'voxels');
}
fs.writeFileSync(path.join(DIR,'index.json'), JSON.stringify(idx, null, 2)+'\n');
console.log('catálogo mock:', idx.length, 'árboles ->', path.join(DIR,'index.json'));
