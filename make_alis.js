/* Genera el NPC "Alis la Duplicadora" como asset voxel del servidor.
   Estilo aventurera Zelda (túnica teal, cyber-goggles, pelo rubio, llave holográfica).
   Rejilla 32³.  Salida: assets/alis.vox.json  +  actualiza assets/index.json
   Uso: node make_alis.js */
const fs = require('fs');
const path = require('path');

const N = 32;
const V = new Map();
const K = (x,y,z)=>x+','+y+','+z;
const set = (x,y,z,c)=>{ if(x<0||y<0||z<0||x>=N||y>=N||z>=N) return; V.set(K(x,y,z),c); };
const del = (x,y,z)=>V.delete(K(x,y,z));
const box = (x0,x1,y0,y1,z0,z1,c)=>{ for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++) set(x,y,z,c); };
const M = N-1;
const symbox = (x0,x1,y0,y1,z0,z1,c)=>{ box(x0,x1,y0,y1,z0,z1,c); box(M-x1,M-x0,y0,y1,z0,z1,c); };

// Front = cara hacia y alto (y=20). Llave holográfica a la izquierda (x bajo).
const C = {
  boot:'#5a3a22', bootCuff:'#8a6a44', bootD:'#432a18', sole:'#2a1c12',
  skin:'#f0c69a', skinS:'#e0ad78', cheek:'#e8907a',
  hair:'#d99a4a', hairL:'#f2ba6a', hairD:'#b07a34',
  tunic:'#2f7d6e', tunicD:'#245f54', tunicL:'#7fd0c2', under:'#bfe6de',
  pants:'#243f3a', pantsD:'#1a2f2b',
  belt:'#5a3a22', beltD:'#432a18', buckle:'#e2a44a', strap:'#6b4a2a',
  metal:'#9aa2b2', metalD:'#5b6274',
  lens:'#8ef0ff', glow:'#3fe0ff', glowMid:'#7af0ff', glowCore:'#eaffff',
  eye:'#161620', tongue:'#e8907a',
};

// ---- Botas marrones con vuelta clara ----
symbox(11,14, 12,17, 0,4, C.boot);
symbox(11,14, 12,17, 5,6, C.bootCuff);
symbox(11,14, 12,12, 0,4, C.bootD);
symbox(11,14, 12,17, 0,0, C.sole);

// ---- Pantalón teal oscuro ----
symbox(12,14, 13,16, 7,12, C.pants);
symbox(12,14, 13,13, 7,12, C.pantsD);

// ---- Falda corta de la túnica + cinturón ----
box(11,20, 12,19, 12,14, C.tunic);
box(11,20, 12,12, 12,14, C.tunicD);
box(11,20, 12,20, 13,13, C.belt);
set(15,20,13,C.buckle); set(16,20,13,C.buckle);
set(13,20,12,C.beltD); set(14,20,12,C.beltD);       // bolsa del cinturón
// correa diagonal al pecho
set(13,20,15,C.strap); set(14,20,16,C.strap); set(15,20,17,C.strap); set(16,20,18,C.strap);

// ---- Torso / túnica teal (z14-21) ----
box(11,20, 12,19, 14,21, C.tunic);
box(11,20, 12,12, 14,21, C.tunicD);                 // espalda
box(10,21, 13,18, 20,21, C.tunic);                  // hombros
box(12,12, 20,20, 14,20, C.tunicL);                 // ribetes claros
box(19,19, 20,20, 14,20, C.tunicL);
box(14,17, 20,20, 18,21, C.under);                  // escote claro
set(15,20,17,C.under); set(16,20,17,C.under);

// ---- Brazo izquierdo: sostiene la llave holográfica ----
box(8,9, 13,17, 14,20, C.tunic);
box(8,9, 13,17, 20,20, C.tunicL);
box(8,9, 15,20, 13,15, C.belt);                     // brazalete de cuero
box(8,9, 20,21, 13,14, C.skin);                     // mano al frente
// ---- Brazo derecho: cae al costado ----
box(22,23, 13,17, 14,20, C.tunic);
box(22,23, 13,17, 20,20, C.tunicL);
box(22,23, 14,17, 9,13, C.skin);                    // antebrazo
box(22,23, 14,17, 8,9, C.skinS);                    // mano

// ---- Llave holográfica (panel/wireframe cian, frente-izq) ----
const py=22, px0=7, px1=13, pz0=14, pz1=21;
for(let x=px0;x<=px1;x++){ set(x,py,pz0,C.glow); set(x,py,pz1,C.glow); }
for(let z=pz0;z<=pz1;z++){ set(px0,py,z,C.glow); set(px1,py,z,C.glow); }
// símbolo de llave dentro del panel
set(10,py,19,C.glowCore); set(10,py,18,C.glowCore); set(10,py,17,C.glowCore); set(10,py,16,C.glowCore);
set(9,py,20,C.glowCore); set(10,py,20,C.glowCore); set(11,py,20,C.glowCore);   // anillo
set(9,py,16,C.glowMid); set(11,py,16,C.glowMid);                               // dientes
set(px0,py,pz1,C.glowMid); set(px1,py,pz0,C.glowMid);                          // brillo esquinas
set(10,py,13,C.glowMid); set(10,py,12,C.glow);                                 // destello inferior

// ---- Cabeza grande (z22-29) ----
box(11,20, 12,20, 22,29, C.skin);
const corners=[[11,12],[11,20],[20,12],[20,20]];
for(const [x,y] of corners){ for(let z=22;z<=29;z++) del(x,y,z); del(x,y,28); del(x,y,23); }

// ---- Pelo rubio voluminoso ----
box(10,21, 11,20, 30,31, C.hair);                   // copa voluminosa
box(11,20, 12,19, 31,31, C.hairL);                  // brillo superior
box(10,21, 11,11, 22,30, C.hair);                   // melena atrás
box(10,10, 11,19, 20,30, C.hair);                   // lado izq (hasta hombros)
box(21,21, 11,19, 20,30, C.hair);                   // lado der
box(11,20, 20,20, 27,29, C.hair);                   // flequillo
set(12,20,26,C.hair); set(19,20,26,C.hair);
set(14,20,26,C.hairD); set(17,20,26,C.hairD);       // picos del flequillo

// ---- Cara: goggles cian (=ojos), nariz, mejillas, sonrisa ----
box(11,20, 20,20, 26,26, C.metalD);                 // marco de goggles
box(12,13, 20,20, 25,26, C.lens);                   // lente/ojo izq
box(18,19, 20,20, 25,26, C.lens);                   // lente/ojo der
set(12,20,26,C.glow); set(19,20,26,C.glow);         // brillo
set(11,20,26,C.metal); set(20,20,26,C.metal);       // remaches
box(10,21, 11,11, 25,26, C.metalD);                 // correa por detrás
box(10,10, 15,19, 25,26, C.metalD); box(21,21,15,19,25,26,C.metalD); // correa lados
set(15,21,24,C.skinS); set(16,21,24,C.skinS);       // nariz
set(12,20,23,C.cheek); set(19,20,23,C.cheek);       // mejillas
box(14,17, 20,20, 21,22, C.eye);                    // boca abierta
box(15,16, 20,20, 22,22, C.tongue);

// ---------- Escribir archivos ----------
const meta = {
  name: 'Alis la Duplicadora',
  type: 'personaje',
  role: 'Maestra de Forja del Exponente',
  description:
    'video game character asset, retro 16-bit pixel art style game portrait, classic video ' +
    'game sprite sheet portrait, limited vibrant palette, full body character sprite, complete ' +
    'figure shown from head to toe, representing: A blocky 3D voxel female blacksmith holding a ' +
    'glowing holographic neon blue digital key, wearing protective cyber-goggles, character ' +
    'standalone, only showing the character with its clothing and direct equipment, absolutely ' +
    'no extra background props, no structures, no walls, no environmental clutter behind, seen ' +
    'from a classic Zelda 3/4 axonometric perspective, isometric top-down camera angled slightly ' +
    'above, clean angles, isolated on a flat self-luminous chroma key green background, uniform ' +
    'glowing green screen emissive color backdrop, unlit flat shading texture map style, full ' +
    'emissive lighting canvas, solid hex #00ff00 backdrop, absolutely 100% no shadows, zero drop ' +
    'shadows, zero ambient occlusion, zero ground shadows, completely clean cutout, uniform tone ' +
    'across the entire canvas, infinite green plane, detailed game asset, high quality, consistent geometry',
};

const out = { format:'voxelforge-1', size:N, meta, voxels:Object.fromEntries(V) };
const dir = path.join(__dirname, 'assets');
fs.mkdirSync(dir, { recursive:true });
fs.writeFileSync(path.join(dir,'alis.vox.json'), JSON.stringify(out,null,2));

const idxPath = path.join(dir,'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath,'utf8')); } catch(e){}
idx = idx.filter(a=>a.id!=='alis');
idx.unshift({ id:'alis', name:meta.name, role:meta.role, type:meta.type, size:N, file:'assets/alis.vox.json' });
fs.writeFileSync(idxPath, JSON.stringify(idx,null,2));

console.log('Alis:', V.size, 'voxels · rejilla', N+'³');
