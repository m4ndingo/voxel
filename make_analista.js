/* Genera el NPC "El Analista de Espectro" como asset voxel del servidor.
   Tecnomante élfico con capucha granate analizando ondas de sonido (ecualizador cian)
   que van de su boca a un sintonizador gris que sostiene en la mano extendida.
   Rejilla 32³.  Salida: assets/analista.vox.json  +  actualiza assets/index.json
   Uso: node make_analista.js */
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

// Front = cara hacia y alto (y=20), como Alis/chef. Sintonizador en x alto (dcha del personaje).
const C = {
  hood:'#8a3b32', hoodD:'#6e2d26', hoodL:'#a04a3e',      // capucha/capa granate
  tunic:'#1f4256', tunicD:'#16303f', tunicL:'#2a5a6a',   // túnica azul marino/teal
  gold:'#e2b13a', goldL:'#f2cd6a',
  skin:'#f0c69a', skinS:'#e0ad78',
  hair:'#e8c05a', hairL:'#f2d47a',
  boot:'#5a3a26', bootD:'#46281a', cuff:'#e8d8b0',
  dev:'#9aa2ac', devD:'#6b737d', devL:'#d8dde2',         // sintonizador gris
  wave:'#7fe9ff', waveM:'#3fd6f2', waveC:'#cffaff',      // ondas cian
  eye:'#1a1a24',
};

// ---- Botas marrones ----
symbox(11,14, 12,17, 0,4, C.boot);
symbox(11,14, 12,12, 0,3, C.bootD);
symbox(11,14, 12,17, 0,0, C.bootD);
symbox(11,14, 12,17, 5,5, C.cuff);                    // vuelta clara

// ---- Piernas / pantalón azul marino ----
symbox(12,14, 13,16, 6,11, C.tunic);
symbox(12,14, 13,13, 6,11, C.tunicD);

// ---- Túnica (z12-20) con bajo granate y cinturón dorado ----
box(11,20, 12,19, 12,20, C.tunic);
box(11,20, 12,12, 12,20, C.tunicD);                   // espalda en sombra
box(11,20, 12,19, 12,12, C.hoodD);                    // ribete granate del bajo
box(11,20, 19,19, 12,12, C.hood);
box(11,20, 12,19, 14,14, C.boot);                     // cinturón cuero
set(15,19,14,C.gold); set(16,19,14,C.goldL);          // hebilla dorada
box(12,12, 19,19, 12,20, C.tunicL);                   // ribetes teal
box(19,19, 19,19, 12,20, C.tunicL);
set(15,19,18,C.gold); set(16,19,18,C.gold);           // broche dorado del pecho
set(15,19,19,C.goldL);

// ---- Capa granate: espalda + manto sobre los hombros ----
box(10,21, 11,12, 6,19, C.hood);                      // capa cayendo por detrás
box(10,21, 11,11, 6,19, C.hoodD);
box(10,21, 12,19, 19,20, C.hood);                     // manto sobre hombros
box(10,21, 12,12, 19,20, C.hoodD);
for(let x=14;x<=17;x++){ del(x,19,19); del(x,19,20); del(x,18,19); del(x,18,20); }  // abertura frontal (se ve el broche)
box(10,10, 12,19, 12,20, C.hood);                     // caída lateral izq
box(21,21, 12,19, 12,20, C.hood);                     // caída lateral dcha
set(10,19,12,C.hoodL); set(21,19,12,C.hoodL);

// ---- Brazo izq (x bajo) recogido bajo la capa ----
box(9,10, 13,17, 13,18, C.hood);
box(9,10, 13,13, 13,18, C.hoodD);

// ---- Brazo dcho extendido (manga marino) + mano ----
box(21,23, 14,17, 15,18, C.tunic);                    // hombro/manga
box(23,25, 14,17, 12,15, C.tunicD);                   // antebrazo bajando
box(25,26, 14,16, 11,13, C.skin);                     // mano

// ---- Sintonizador gris (tablilla vertical) ----
box(26,28, 13,17, 10,19, C.dev);
box(26,28, 13,13, 10,19, C.devD);                     // trasera en sombra
box(26,26, 14,16, 12,18, C.devL);                     // pantalla clara hacia el personaje
set(26,15,17,C.wave); set(26,15,15,C.waveM);          // lectura en pantalla
box(26,28, 13,17, 19,19, C.devD);                     // remate superior
set(27,17,10,C.devD); set(27,13,10,C.devD);

// ---- Cabeza (z21-27) ----
box(11,20, 12,20, 21,27, C.skin);
// ---- Capucha granate rodeando la cabeza ----
box(10,21, 11,20, 27,29, C.hood);                     // casquete
box(11,20, 12,19, 29,29, C.hoodL);
box(10,10, 11,19, 21,28, C.hood);                     // lado izq
box(21,21, 11,19, 21,28, C.hood);                     // lado dcho
box(10,21, 11,11, 21,28, C.hoodD);                    // parte trasera
box(10,21, 20,20, 27,27, C.hoodD);                    // visera sobre la frente
box(13,18, 12,17, 30,30, C.hood);                     // copa alta
set(11,13,30,C.hood); set(20,13,30,C.hood);           // puntas laterales (pliegues)
set(12,14,31,C.hoodD); set(19,14,31,C.hoodD);

// ---- Flequillo rubio asomando bajo la capucha ----
box(11,20, 20,20, 26,26, C.hair);
set(13,20,25,C.hair); set(18,20,25,C.hairL);
set(15,20,26,C.hairL); set(16,20,26,C.hairL);

// ---- Orejas élficas puntiagudas atravesando la capucha ----
box(8,10, 15,17, 23,24, C.skin);                      // oreja izq
set(7,16,24,C.skinS); set(7,16,25,C.skinS);           // punta hacia arriba
box(21,23, 15,17, 23,24, C.skin);                     // oreja dcha
set(24,16,24,C.skinS); set(24,16,25,C.skinS);

// ---- Cara: ojos grandes oscuros, mejillas, emisor en la boca ----
box(12,13, 20,20, 23,24, C.eye);                      // ojo izq
box(18,19, 20,20, 23,24, C.eye);                      // ojo dcho
set(12,20,24,'#3a3a4a'); set(18,20,24,'#3a3a4a');     // brillo pupila
set(11,20,22,C.skinS); set(20,20,22,C.skinS);         // mejillas
set(15,21,23,C.skinS); set(16,21,23,C.skinS);         // nariz
box(15,16, 20,20, 21,21, C.devD);                     // emisor gris en la boca
set(15,21,21,C.dev);

// ---- Ecualizador de ondas: barras cian a la altura de la boca, descendiendo suave hasta el sintonizador ----
const bars=[ [17,22,24],[18,21,25],[19,22,23],[20,20,23],[21,19,24],[22,20,22],[23,18,22],[24,19,20],[25,18,21] ];
for(const [x,z0,z1] of bars){
  for(let z=z0;z<=z1;z++) set(x,21,z, (z===z0||z===z1) ? C.waveM : C.wave);
  set(x,21,Math.round((z0+z1)/2), C.waveC);           // núcleo brillante
}

// ---------- Escribir archivos ----------
const meta = {
  name: 'El Analista de Espectro',
  type: 'personaje',
  role: 'Sintonizador Forense',
  description:
    'video game character asset, isometric voxel 3D style portrait, cubic blocky aesthetic, flat ' +
    'voxel textures like a retro minecraft character, cute and blocky, full body character sprite, ' +
    'complete figure shown from head to toe, representing: elven technomancer in hooded pixelated ' +
    'cloak, analyzing soundwaves, character standalone, only showing the character with its ' +
    'clothing and direct equipment, absolutely no extra background props, no structures, no walls, ' +
    'no environmental clutter behind, seen from a 3/4 isometric perspective, dynamic 3D angle from ' +
    'above-left, isolated on a flat síncrono self-luminous chroma key green background, uniform ' +
    'glowing green screen emissive color backdrop, unlit flat shading texture map style, full ' +
    'emissive lighting canvas, solid hex #00ff00 backdrop, absolutely 100% no shadows, zero drop ' +
    'shadows, zero ambient occlusion, zero ground shadows, completely clean cutout, uniform tone ' +
    'across the entire canvas, infinite green plane, detailed game asset, high quality, consistent geometry',
};

const out = { format:'voxelforge-1', size:N, meta, voxels:Object.fromEntries(V) };
const dir = path.join(__dirname, 'assets');
fs.mkdirSync(dir, { recursive:true });
fs.writeFileSync(path.join(dir,'analista.vox.json'), JSON.stringify(out,null,2));

const idxPath = path.join(dir,'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath,'utf8')); } catch(e){}
idx = idx.filter(a=>a.id!=='analista');
const pos = idx.findIndex(a=>a.type==='bloque');       // personajes antes que habitaciones
idx.splice(pos<0?idx.length:pos, 0, { id:'analista', name:meta.name, role:meta.role, type:meta.type, size:N, file:'assets/analista.vox.json' });
fs.writeFileSync(idxPath, JSON.stringify(idx,null,2));

console.log('Analista:', V.size, 'voxels · rejilla', N+'³');
