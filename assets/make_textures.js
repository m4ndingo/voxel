#!/usr/bin/env node
// Genera 4 texturas de ejemplo (objetos 16³ de tipo 'textura') y las inscribe en index.json.
// Una textura es un objeto voxel normal; su "color" al pintar lo dan sus 6 proyecciones (F3).
// +Z es ARRIBA (ver CUBE_FACES en app.js), así que las caras superiores mandan verde/etc.
// Uso: node make_textures.js   (idempotente: reescribe los .vox.json y refresca sus entradas)
const fs = require('fs'), path = require('path');
const DIR = __dirname, N = 16;

// PRNG determinista para un moteado estable entre ejecuciones
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function jitter(hex, amt, r){                       // varía el color ±amt para dar textura
  const n=parseInt(hex.slice(1),16); let R=n>>16&255,G=n>>8&255,B=n&255;
  const d=Math.round((r()*2-1)*amt); R=Math.max(0,Math.min(255,R+d)); G=Math.max(0,Math.min(255,G+d)); B=Math.max(0,Math.min(255,B+d));
  return '#'+((1<<24)+(R<<16)+(G<<8)+B).toString(16).slice(1);
}

// cada textura define color(x,y,z)->hex (16³ macizo)
const TEX = {
  hierba: { name:'Hierba', icon:'🌿', role:'Textura · césped sobre tierra',
    color:(x,y,z,r)=> z>=14 ? jitter('#5aa02c',22,r) : jitter('#7a5230',18,r) },
  tierra: { name:'Tierra', icon:'🟫', role:'Textura · tierra',
    color:(x,y,z,r)=> jitter('#7a5230',22,r) },
  madera: { name:'Madera', icon:'🪵', role:'Textura · tablones',
    color:(x,y,z,r)=> (z%4===0) ? jitter('#5f3d24',10,r) : jitter('#8a5a3b',14,r) },
  roca:   { name:'Roca', icon:'🪨', role:'Textura · piedra',
    color:(x,y,z,r)=> jitter('#8a8f94',26,r) },
};

const idxPath = path.join(DIR,'index.json');
const idx = JSON.parse(fs.readFileSync(idxPath,'utf8'));

for(const [id,def] of Object.entries(TEX)){
  const r = mulberry32(0x9e3779b1 ^ id.split('').reduce((a,c)=>a*33+c.charCodeAt(0)|0,7));
  const voxels = {};
  for(let x=0;x<N;x++) for(let y=0;y<N;y++) for(let z=0;z<N;z++) voxels[`${x},${y},${z}`]=def.color(x,y,z,r);
  const doc = { format:'voxelforge-1', size:N,
    meta:{ name:def.name, type:'textura', role:def.role, icon:def.icon,
           description:`Textura ${def.name} — objeto 16³ usado como pincel.` },
    voxels };
  const file = `assets/${id}.vox.json`;
  fs.writeFileSync(path.join(DIR,`${id}.vox.json`), JSON.stringify(doc));
  const entry = { id, name:def.name, role:def.role, type:'textura', icon:def.icon, size:N, file };
  const at = idx.findIndex(e=>e.id===id);
  if(at>=0) idx[at]=entry; else idx.push(entry);
  console.log('escrito', file);
}

fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2)+'\n');
console.log('index.json actualizado con', Object.keys(TEX).length, 'texturas');
