#!/usr/bin/env node
// MOCK · Bloques de construcción tipo Minecraft (objetos 16³ de tipo 'textura').
// Genera un CATÁLOGO DE PRUEBA en assets/blocks_mock/ SIN tocar el index.json real:
// escribe cada <id>.vox.json + un index.json propio (mismo formato de entrada que el
// registro real) para poder revisarlos antes de decidir cuáles se promueven a assets.
//
// Promover uno a asset real: mover assets/blocks_mock/<id>.vox.json -> assets/<id>.vox.json
// y añadir su entrada (con file:"assets/<id>.vox.json") a assets/index.json.
//
// +Z es ARRIBA (ver CUBE_FACES en app.js): la cara superior manda en las proyecciones.
// Un bloque es un objeto 16³ macizo; sus 6 caras salen de proyectar el voxel más externo.
// Uso: node make_blocks.js   (idempotente)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'blocks_mock'), N = 16, TOP = N - 1;
fs.mkdirSync(DIR, { recursive: true });

// PRNG determinista => moteado estable entre ejecuciones
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function jitter(hex, amt, r){                 // varía el color ±amt para dar grano
  const n=parseInt(hex.slice(1),16); let R=n>>16&255,G=n>>8&255,B=n&255;
  const d=Math.round((r()*2-1)*amt);
  R=Math.max(0,Math.min(255,R+d)); G=Math.max(0,Math.min(255,G+d)); B=Math.max(0,Math.min(255,B+d));
  return '#'+((1<<24)+(R<<16)+(G<<8)+B).toString(16).slice(1);
}
function mix(a,b,t){                          // interpola dos hex
  const na=parseInt(a.slice(1),16), nb=parseInt(b.slice(1),16);
  const R=Math.round((na>>16&255)*(1-t)+(nb>>16&255)*t);
  const G=Math.round((na>>8&255)*(1-t)+(nb>>8&255)*t);
  const B=Math.round((na&255)*(1-t)+(nb&255)*t);
  return '#'+((1<<24)+(R<<16)+(G<<8)+B).toString(16).slice(1);
}
// ¿estamos en una junta de mampostería? filas horizontales cada `rh` en z,
// con juntas verticales desfasadas por fila (aparejo a soga). `u` = columna del lateral.
function brickSeam(u, z, rh, bw){
  const row = Math.floor(z/rh);
  const inRowSeam = (z % rh) === 0;                 // línea de mortero horizontal
  const off = (row % 2) ? Math.floor(bw/2) : 0;     // desfase alterno
  const inColSeam = ((u + off) % bw) === 0;         // junta vertical
  return inRowSeam || inColSeam;
}

// Cada bloque define color(x,y,z,r)->hex sobre un cubo 16³ macizo.
const BLOCKS = {
  adoquin: { name:'Adoquín', icon:'🪨', role:'Bloque · piedra irregular (cobblestone)',
    color:(x,y,z,r)=>{
      // celdas pseudo-Voronoi: bordes oscuros entre guijarros
      const cell = (Math.floor(x/4)*7 + Math.floor(y/4)*13 + Math.floor(z/4)*17) & 7;
      const edge = (x%4===0)||(y%4===0)||(z%4===0);
      const base = ['#8b9096','#7d8288','#93989e','#84898f'][cell&3];
      return edge ? jitter('#565b61',14,r) : jitter(base,20,r);
    } },
  ladrillo_piedra: { name:'Ladrillo de piedra', icon:'🧱', role:'Bloque · sillar gris (stone bricks)',
    color:(x,y,z,r)=> brickSeam(x, z, 8, 8) || brickSeam(y, z, 8, 8)
      ? jitter('#5c6166',10,r) : jitter('#8a9096',16,r) },
  ladrillo: { name:'Ladrillo', icon:'🧱', role:'Bloque · ladrillo rojo (bricks)',
    color:(x,y,z,r)=> brickSeam(x, z, 4, 8) || brickSeam(y, z, 4, 8)
      ? jitter('#b9b3a6',8,r) : jitter('#9a4b39',20,r) },
  tablones: { name:'Tablones', icon:'🪵', role:'Bloque · madera de roble (oak planks)',
    color:(x,y,z,r)=>{
      const plank = Math.floor(z/4);                 // vetas horizontales por tabla
      const seam = (z%4===0);
      const base = (plank%2) ? '#a9814e' : '#b98d55';
      return seam ? jitter('#7a5a34',10,r) : jitter(base,16,r);
    } },
  tronco: { name:'Tronco', icon:'🌳', role:'Bloque · tronco de roble (oak log)',
    color:(x,y,z,r)=>{
      if(z===TOP || z===0){                          // tapas: anillos concéntricos
        const dx=x-7.5, dy=y-7.5, d=Math.sqrt(dx*dx+dy*dy);
        return (Math.floor(d)%2) ? jitter('#c8a45e',12,r) : jitter('#b08a48',12,r);
      }
      const bark = (x%3===0)||(y%3===0);             // corteza vertical
      return bark ? jitter('#4a3620',14,r) : jitter('#6b4e2e',16,r);
    } },
  arena: { name:'Arena', icon:'🏜️', role:'Bloque · arena (sand)',
    color:(x,y,z,r)=> jitter('#dfce8f',18,r) },
  arenisca: { name:'Arenisca', icon:'🧱', role:'Bloque · arenisca en capas (sandstone)',
    color:(x,y,z,r)=>{
      if(z>=TOP-1) return jitter('#efe6c2',10,r);    // losa superior clara
      const band = (Math.floor(z/2)%2);
      return jitter(band ? '#d8c58a' : '#cdb87c', 12, r);
    } },
  grava: { name:'Grava', icon:'⚪', role:'Bloque · grava (gravel)',
    color:(x,y,z,r)=>{
      const t=r();
      return t<0.12 ? jitter('#4f5257',20,r) : t<0.3 ? jitter('#b8b4ad',18,r) : jitter('#8f8b84',22,r);
    } },
  musgo_adoquin: { name:'Adoquín musgoso', icon:'🟩', role:'Bloque · adoquín con musgo (mossy)',
    color:(x,y,z,r)=>{
      const moss = r()<0.34;                          // parches de musgo
      const edge = (x%4===0)||(y%4===0)||(z%4===0);
      if(moss) return jitter('#5f7a3a',18,r);
      return edge ? jitter('#565b61',14,r) : jitter('#868b91',18,r);
    } },
  obsidiana: { name:'Obsidiana', icon:'🟣', role:'Bloque · obsidiana (obsidian)',
    color:(x,y,z,r)=>{
      const spark = r()<0.06;
      return spark ? jitter('#6a4bd0',24,r) : mix('#140f24','#241a3e', r()*0.6);
    } },
};

// --- Escribe cada bloque + un índice mock (formato de entrada del registro real) ---
const mockIdx = [];
for(const [id, def] of Object.entries(BLOCKS)){
  const r = mulberry32(0x9e3779b1 ^ id.split('').reduce((a,c)=>a*33+c.charCodeAt(0)|0, 7));
  const voxels = {};
  for(let x=0;x<N;x++)for(let y=0;y<N;y++)for(let z=0;z<N;z++) voxels[`${x},${y},${z}`]=def.color(x,y,z,r);
  const doc = {
    format:'voxelforge-1', size:N,
    meta:{ name:def.name, type:'textura', role:def.role, icon:def.icon,
           description:`${def.name} — bloque de construcción 16³ (MOCK, aún no es asset).` },
    voxels,
  };
  fs.writeFileSync(path.join(DIR, `${id}.vox.json`), JSON.stringify(doc));
  mockIdx.push({ id, name:def.name, role:def.role, icon:def.icon, type:'textura', size:N,
                 file:`assets/blocks_mock/${id}.vox.json` });
  console.log('escrito', `${id}.vox.json`);
}
fs.writeFileSync(path.join(DIR,'index.json'), JSON.stringify(mockIdx, null, 2)+'\n');
console.log('catálogo mock:', mockIdx.length, 'bloques ->', path.join(DIR,'index.json'));
