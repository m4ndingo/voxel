/* Genera el NPC "El Cocinero del Sabor SQL" como asset voxel del servidor.
   Estilo chibi (cabeza grande, cuerpo rechoncho). Rejilla 32³.
   Salida: assets/chef.vox.json  +  actualiza assets/index.json
   Uso: node make_chef.js */
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

// Front = cara hacia y alto (y=20). Libro sostenido a la izquierda (x bajo).
const C = {
  boot:'#5a3a22', bootD:'#432a18', sole:'#8a6a4a',
  white:'#f2f4f8', whiteD:'#d3d7e0',
  skin:'#f0c69a', skinS:'#e0ad78', cheek:'#e8907a',
  hair:'#6b4a2a', hairD:'#4a3320',
  red:'#d24a3a', redD:'#b0392b', button:'#1e1e24',
  eye:'#161620', hi:'#f2f4f8', mouth:'#5a2020', tongue:'#e8907a',
  book:'#141418', bookEdge:'#0a0a0c',
  page:'#8affa0', codeA:'#7ae6ff', codeB:'#ff6bd0', codeC:'#ffe66b', glow:'#9dfcae',
};
const codeCols=[C.page,C.codeA,C.codeB,C.codeC];

// ---- Botas marrones y piernas cortas ----
symbox(11,14, 12,17, 0,4, C.boot);
symbox(11,14, 12,12, 0,4, C.bootD);
symbox(11,14, 12,17, 0,0, C.sole);

// ---- Chaqueta de chef (cuerpo rechoncho, z5-15) ----
box(10,21, 11,19, 5,15, C.white);
box(10,21, 11,11, 5,15, C.whiteD);        // espalda en sombra
box(11,20, 20,20, 6,14, C.white);         // barriga saliente
// ribetes rojos de la apertura + faja + botonadura negra
[12,19].forEach(x=>box(x,x,20,20,6,14,C.red));
[14,17].forEach(x=>[7,9,11,13].forEach(z=>set(x,20,z,C.button)));
box(11,20, 20,20, 5,5, C.red);            // faja roja
// pañuelo rojo con nudo y colas
box(12,19, 20,20, 14,15, C.red);
box(12,19, 19,19, 15,15, C.redD);
set(15,20,14,C.redD); set(16,20,14,C.redD);   // nudo
set(15,20,13,C.red);  set(15,20,12,C.redD);    // colas
set(16,20,13,C.red);

// ---- Brazo izquierdo: sostiene el libro en alto ----
box(8,9, 13,16, 8,13, C.white);           // brazo
box(8,9, 13,16, 13,14, C.red);            // puño rojo
box(8,9, 17,20, 9,11, C.white);           // antebrazo hacia el frente
box(8,9, 20,21, 9,11, C.skin);            // mano
// ---- Brazo derecho: cae al costado ----
box(22,23, 13,17, 7,14, C.white);
box(22,23, 13,17, 7,8, C.red);            // puño rojo
box(22,23, 14,17, 4,7, C.skin);           // mano

// ---- Libro de recetas digital (tapa negra, página de código a cámara) ----
box(8,14, 21,23, 8,14, C.book);
box(8,14, 23,23, 8,14, C.bookEdge);       // canto
box(8,8, 21,23, 8,14, C.bookEdge);        // lomo
for(let z=9;z<=13;z++)for(let x=9;x<=13;x++){   // líneas de "código" en la página
  if((x+z)%2===0) set(x,23,z, codeCols[(x+z)%4]);
}
set(10,23,14,C.glow); set(12,23,14,C.glow);      // resplandor

// ---- Cabeza grande (chibi, z16-27) ----
box(10,21, 11,20, 16,27, C.skin);
const corners=[[10,11],[10,20],[21,11],[21,20]];
for(const [x,y] of corners){
  for(let z=16;z<=27;z++) del(x,y,z);
  del(x,y,26); del(x,y,17);
}
for(const [x,y] of corners) del(x+(x<15?1:-1), y+(y<15?1:-1), 27);

// pelo castaño marcado (lados, nuca, flequillo)
box(10,10, 12,19, 20,27, C.hair);
box(21,21, 12,19, 20,27, C.hair);
box(10,21, 11,11, 23,27, C.hair);         // nuca
box(11,20, 20,20, 26,27, C.hair);         // flequillo bajo el gorro
box(11,20, 20,20, 25,25, C.hairD);
set(10,19,19,C.hair); set(21,19,19,C.hair);// patillas

// cara (frente y=20)
set(12,20,24,C.hair); set(13,20,24,C.hair);   // ceja izq
set(18,20,24,C.hair); set(19,20,24,C.hair);   // ceja der
box(12,13,20,20,22,23,C.eye);                 // ojo izq
box(18,19,20,20,22,23,C.eye);                 // ojo der
set(13,20,23,C.hi); set(18,20,23,C.hi);       // brillo de ojos
set(15,21,21,C.skinS); set(16,21,21,C.skinS); // nariz (sobresale)
box(11,12,20,20,20,20,C.cheek);               // mejillas
box(19,20,20,20,20,20,C.cheek);
box(14,17,20,20,18,19,C.mouth);               // boca abierta
set(14,20,17,C.mouth); set(17,20,17,C.mouth);
box(15,16,20,20,18,18,C.tongue);              // lengua

// ---- Gorro de chef (toque esponjoso, z28-31) ----
box(11,20, 12,19, 28,28, C.white);            // banda
box(11,20, 12,19, 28,28, C.white);
box(10,21, 12,19, 28,28, C.whiteD);           // sombra banda lados
box(9,22, 11,20, 29,31, C.white);             // copa ancha esponjosa
[11,14,17,20].forEach(x=>set(x,20,30,C.whiteD)); // pliegues frontales
const tcorners=[[9,11],[9,20],[22,11],[22,20]];
for(const [x,y] of tcorners){ del(x,y,31); del(x,y,29); }
for(const [x,y] of tcorners) del(x+(x<15?1:-1), y+(y<15?1:-1), 31);

// ---------- Escribir archivos ----------
const meta = {
  name: 'El Cocinero del Sabor SQL',
  type: 'personaje',
  role: "Chef de la Taberna 'Inyección'",
  description:
    'video game character asset, cute chibi anime 3D voxel cubic style, blocky structure, vibrant ' +
    'clean voxel game design, full body character sprite, complete figure shown from head to toe, ' +
    'representing: A chubby blocky 3D voxel tavern chef looking mischievous, holding a glowing ' +
    'digital voxel cookbook displaying glowing syntax codes, character standalone, only showing ' +
    'the character with its clothing and direct equipment, absolutely no extra background props, ' +
    'no structures, no walls, no environmental clutter behind, seen from a classic Zelda 3/4 ' +
    'axonometric perspective, isometric top-down camera angled slightly above, clean angles, ' +
    'isolated on a flat self-luminous chroma key green background, uniform glowing green screen ' +
    'emissive color backdrop, unlit flat shading texture map style, full emissive lighting canvas, ' +
    'solid hex #00ff00 backdrop, absolutely 100% no shadows, zero drop shadows, zero ambient ' +
    'occlusion, zero ground shadows, completely clean cutout, uniform tone across the entire ' +
    'canvas, infinite green plane, detailed game asset, high quality, consistent geometry',
};

const out = { format:'voxelforge-1', size:N, meta, voxels:Object.fromEntries(V) };
const dir = path.join(__dirname, 'assets');
fs.mkdirSync(dir, { recursive:true });
fs.writeFileSync(path.join(dir,'chef.vox.json'), JSON.stringify(out,null,2));

const idxPath = path.join(dir,'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath,'utf8')); } catch(e){}
idx = idx.filter(a=>a.id!=='chef');
idx.push({ id:'chef', name:meta.name, role:meta.role, type:meta.type, size:N, file:'assets/chef.vox.json' });
fs.writeFileSync(idxPath, JSON.stringify(idx,null,2));

console.log('Chef:', V.size, 'voxels · rejilla', N+'³');
