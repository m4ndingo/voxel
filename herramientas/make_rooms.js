/* Genera las 3 HABITACIONES (Taberna, Herrería, Mazmorra) como assets voxel del servidor,
   RECREADAS A ESCALA DE PERSONAJE: los helpers dibujan en unidades "gruesas" (la geometría de
   siempre, 28×28×16) pero cada unidad son S=4 voxels finos => salas 112×112×52 con paredes de 40
   frente a personajes 32³ (proporción correcta, sin escalar personajes). Solo se guarda la
   CÁSCARA (superficie) y el JSON va compacto para contener el tamaño de archivo.
   Salida: assets/taberna.vox.json, herreria.vox.json, mazmorra.vox.json  +  actualiza assets/index.json
   Uso: node herramientas/make_rooms.js */
const fs = require('fs');
const path = require('path');

const S  = 4;                          // voxels finos por unidad gruesa (32/altura de personaje)
const NX = 28, NY = 28, NZ = 13;       // unidades gruesas: ancho · fondo · alto (13*4=52 fino)
const FX = NX*S, FY = NY*S, FZ = NZ*S; // dimensiones finas del asset
const WALL_H = 10;                     // unidades gruesas => 40 fino (> personaje 32)

// --- fábrica de habitación: helpers en unidades GRUESAS que escriben bloques finos S³ ---
function room(build){
  const V = new Map();
  const K = (x,y,z)=>x+','+y+','+z;
  const inb = (x,y,z)=>x>=0&&y>=0&&z>=0&&x<FX&&y<FY&&z<FZ;
  const fset = (x,y,z,c)=>{ if(inb(x,y,z)) V.set(K(x,y,z),c); };
  const set = (x,y,z,c)=>{ for(let dx=0;dx<S;dx++)for(let dy=0;dy<S;dy++)for(let dz=0;dz<S;dz++) fset(x*S+dx,y*S+dy,z*S+dz,c); };
  const del = (x,y,z)=>{ for(let dx=0;dx<S;dx++)for(let dy=0;dy<S;dy++)for(let dz=0;dz<S;dz++) V.delete(K(x*S+dx,y*S+dy,z*S+dz)); };
  const box = (x0,x1,y0,y1,z0,z1,c)=>{ for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++) set(x,y,z,c); };
  // cilindro vertical (barril/columna): radio r grueso, test en la rejilla FINA (curva más suave)
  const cyl = (cx,cy,r,z0,z1,c)=>{
    const fcx=cx*S+S/2, fcy=cy*S+S/2, fr=r*S+S*0.45;
    for(let x=Math.floor(fcx-fr);x<=Math.ceil(fcx+fr);x++)for(let y=Math.floor(fcy-fr);y<=Math.ceil(fcy+fr);y++){
      const dx=x+0.5-fcx, dy=y+0.5-fcy;
      if(dx*dx+dy*dy<=fr*fr) for(let z=z0*S;z<=z1*S+S-1;z++) fset(x,y,z,c);
    }
  };
  build({set,del,box,cyl,V});
  // conservar solo la CÁSCARA: un voxel fino se queda si alguna de sus 6 caras da al vacío
  const shellV = new Map();
  for(const [k,c] of V){
    const [x,y,z]=k.split(',').map(Number);
    if(!V.has((x+1)+','+y+','+z)||!V.has((x-1)+','+y+','+z)||
       !V.has(x+','+(y+1)+','+z)||!V.has(x+','+(y-1)+','+z)||
       !V.has(x+','+y+','+(z+1))||!V.has(x+','+y+','+(z-1))) shellV.set(k,c);
  }
  return shellV;
}

// --- cascarón común: suelo a damero + pared trasera (y bajo) e izquierda (x bajo) ---
function shell(api, mat){
  const {set,box} = api;
  // suelo damero (z=0), dejando hueco para las paredes (x,y desde 2)
  for(let x=2;x<NX;x++) for(let y=2;y<NY;y++){
    const t = (((x>>1)+(y>>1))&1);
    set(x,y,0, t ? mat.floorA : mat.floorB);
  }
  // pared trasera (y=0..1) e izquierda (x=0..1), altura WALL_H
  box(0,NX-1, 0,1, 1,WALL_H, mat.wall);
  box(0,1, 0,NY-1, 1,WALL_H, mat.wall);
  // sombra en la cara interior baja + zócalo
  box(2,NX-1, 2,2, 1,WALL_H, mat.wallD);
  box(2,2, 2,NY-1, 1,WALL_H, mat.wallD);
  box(0,NX-1, 0,1, 1,2, mat.wallD);
  box(0,1, 0,NY-1, 1,2, mat.wallD);
  // remate/cornisa clara arriba
  box(0,NX-1, 0,1, WALL_H,WALL_H, mat.wallL);
  box(0,1, 0,NY-1, WALL_H,WALL_H, mat.wallL);
}

// ============================================================ TABERNA
const taberna = room(api=>{
  const {set,box,cyl} = api;
  const C = {
    floorA:'#6b4a2c', floorB:'#5a3d24',
    wall:'#8a6a44', wallD:'#6e5236', wallL:'#a98a5e',
    wood:'#7a5230', woodD:'#5e3f24', woodL:'#9a6b40', top:'#a9773f',
    hoop:'#3a4048', ale:'#e0a63a', foam:'#f4e9cf',
    fire:'#ff9a2e', fireC:'#ffe08a', mug:'#c9cdd6', mugD:'#9aa0ab',
  };
  shell(api, C);
  // --- barra en L (mostrador) frente a la pared izquierda ---
  box(4,7, 5,22, 1,3, C.wood);        // cuerpo de la barra
  box(4,7, 5,22, 2,2, C.woodD);       // veta
  box(3,8, 4,23, 4,4, C.top);         // tablero (vuela un poco)
  // taburetes delante de la barra
  for(const y of [8,13,18]){ cyl(11,y,1, 1,2, C.woodL); cyl(11,y,1, 3,3, C.woodD); }
  // jarras de cerveza sobre la barra
  for(const y of [7,12,20]){ box(5,6, y,y, 5,6, C.mug); set(5,y,6,C.foam); set(6,y,6,C.ale); }
  // --- barriles apilados en la esquina derecha ---
  cyl(22,7,3, 1,5, C.wood);  cyl(22,7,3, 2,2, C.hoop); cyl(22,7,3, 4,4, C.hoop); box(19,25,4,10,6,6,C.top);
  cyl(22,15,3, 1,5, C.wood); cyl(22,15,3, 2,2, C.hoop); cyl(22,15,3, 4,4, C.hoop); box(19,25,12,18,6,6,C.top);
  // --- mesa redonda con dos taburetes ---
  cyl(18,22,4, 4,4, C.woodL); box(18,18,22,22,1,3,C.woodD);   // tablero + pata
  cyl(13,24,1, 1,2, C.woodL); cyl(23,24,1, 1,2, C.woodL);
  // --- chimenea/hogar cálido en la pared trasera ---
  box(20,25, 1,2, 1,5, C.woodD); box(21,24, 2,2, 1,3, C.fire); box(22,23, 2,2, 3,4, C.fireC);
  // --- farol colgante para dar calidez ---
  box(9,9, 20,20, 8,9, C.hoop); set(9,20,7,C.fireC);
});

// ============================================================ HERRERÍA
const herreria = room(api=>{
  const {set,box,cyl} = api;
  const C = {
    floorA:'#6a6f78', floorB:'#585d66',
    wall:'#767b85', wallD:'#565b64', wallL:'#9297a1',
    stone:'#5c616b', stoneD:'#44484f', stoneL:'#7c818b',
    iron:'#3c4250', ironD:'#282c36', ironL:'#5a6272',
    ember:'#ff7a1e', fire:'#ffb64a', fireC:'#ffe9a6', coal:'#2a2622',
    wood:'#6e4a2a', water:'#3f7fd0', waterL:'#79b0ef', spark:'#ffd36a',
  };
  shell(api, C);
  // --- fragua/hogar de piedra con fuego y chimenea ---
  box(3,10, 3,9, 1,5, C.stone); box(4,9, 4,8, 1,4, C.coal);   // hueco del carbón
  box(5,8, 5,7, 2,3, C.ember); box(6,7, 6,6, 3,4, C.fire); set(6,6,5,C.fireC);
  box(4,9, 3,3, 5,6, C.stoneD);                                // frente
  box(5,8, 4,7, 6,6, C.stoneL);                                // repisa
  box(5,7, 5,7, 7,12, C.stone); box(5,7,5,7,10,12,C.stoneD);   // campana/chimenea
  // --- yunque en el centro ---
  box(14,17, 11,13, 1,1, C.ironD);        // base
  box(15,16, 12,12, 2,2, C.iron);         // cuello
  box(13,18, 11,13, 3,3, C.iron);         // tas (mesa)
  box(18,20, 12,12, 3,3, C.iron);         // cuerno hacia +x
  box(13,18, 11,13, 4,4, C.ironL);        // brillo superior
  // --- pila de temple (agua) ---
  box(20,25, 4,9, 1,4, C.wood); box(21,24, 5,8, 4,4, C.water); box(21,24,5,8,4,4,C.water); set(22,6,4,C.waterL); set(23,7,4,C.waterL);
  // --- yunque pequeño / tocón con martillo ---
  cyl(22,15,2, 1,4, C.wood); box(21,23,15,15,5,7,C.ironL); box(23,23,14,16,7,7,C.iron); // mango + cabeza del martillo
  // --- panoplia de herramientas en la pared izquierda ---
  box(2,2, 6,18, 8,8, C.wood);
  box(2,2, 8,8, 4,8, C.ironL); box(2,2,7,9,4,4,C.iron);   // tenazas
  box(2,2, 13,13, 5,8, C.wood); box(2,2,12,14,8,8,C.iron); // martillo colgado
  // --- chispas sobre el yunque ---
  set(16,12,6,C.spark); set(15,13,7,C.spark); set(17,11,7,C.ember);
});

// ============================================================ MAZMORRA
const mazmorra = room(api=>{
  const {set,del,box,cyl} = api;
  const C = {
    floorA:'#3f434c', floorB:'#33363d',
    wall:'#4a4e57', wallD:'#34373e', wallL:'#5e636d',
    moss:'#4f7038', mossD:'#3a5228',
    bar:'#7f8794', barL:'#a4acba', barD:'#565d69',   // barrotes de acero (claros para que resalten)
    iron:'#3a4150',
    torch:'#7a5230', flame:'#ff8a2a', flameC:'#ffe08a',
    bone:'#e6e0cc', boneD:'#b3aa8f', water:'#26343a', waterL:'#33474d',
    chain:'#6b7280',
  };
  shell(api, C);
  // musgo salpicado en paredes y suelo
  for(const [x,y,z] of [[6,1,3],[6,1,4],[13,1,2],[19,1,5],[24,1,3],[1,9,4],[1,10,4],[1,16,2],[1,21,5]]){
    set(x,y,z,C.moss); set(x,y,z-1,C.mossD);
  }
  for(const [x,y] of [[9,20],[10,20],[15,10],[3,14]]) set(x,y,0,C.mossD);
  // juntas de sillería (líneas oscuras) en pared trasera
  for(let x=2;x<NX;x++){ set(x,1,4,C.wallD); set(x,1,8,C.wallD); }
  // --- CELDA EXENTA de barrotes (footprint x18..26, y8..16) con frente y lados visibles ---
  const cx0=18,cx1=26, cy0=8,cy1=16, bh=11;    // altura barrotes
  const rail=(x0,x1,y0,y1,z)=>box(x0,x1,y0,y1,z,z,C.bar);
  // travesaños superior e inferior de las cuatro caras
  for(const z of [1,bh]){ rail(cx0,cx1,cy0,cy0,z); rail(cx0,cx1,cy1,cy1,z); rail(cx0,cx0,cy0,cy1,z); rail(cx1,cx1,cy0,cy1,z); }
  // barrotes verticales (cada 2) en las cuatro caras
  for(let x=cx0;x<=cx1;x+=2){ box(x,x,cy0,cy0,1,bh,C.bar); box(x,x,cy1,cy1,1,bh,C.bar); }
  for(let y=cy0;y<=cy1;y+=2){ box(cx0,cx0,y,y,1,bh,C.bar); box(cx1,cx1,y,y,1,bh,C.bar); }
  // brillos en los barrotes del frente
  set(cx0,cy1,6,C.barL); set(cx0+2,cy1,7,C.barL); set(cx1,cy0+2,6,C.barL);
  // hueco de puerta en la reja frontal (quita dos barrotes)
  for(let z=1;z<=bh;z++){ del(cx0+3,cy1,z); del(cx0+4,cy1,z); }
  // --- esqueleto encadenado dentro de la celda ---
  box(21,23, 11,12, 1,1, C.boneD); set(22,11,2,C.bone); set(22,12,2,C.bone); set(22,11,3,C.bone); // cráneo
  set(20,11,1,C.bone); set(24,12,1,C.bone);
  // --- antorchas en las paredes con luz ---
  for(const [x,y] of [[9,1],[18,1]]){ box(x,x,y,y+1,6,7,C.torch); set(x,y+1,8,C.flame); set(x,y+1,9,C.flameC); }
  box(1,2, 12,12, 6,7, C.torch); set(2,12,8,C.flame); set(2,12,9,C.flameC);
  // --- cadenas y grilletes colgando de la pared trasera ---
  for(const x of [5,12]){ for(let z=6;z<=9;z++) set(x,2,z,C.chain); set(x,2,5,C.iron); }
  // --- charco de agua turbia + adoquín suelto ---
  box(7,11, 18,22, 0,0, C.water); set(8,19,0,C.waterL); set(10,21,0,C.waterL); del(9,20,0);
  // --- puerta de madera reforzada en la pared izquierda ---
  box(0,1, 19,24, 1,8, C.torch); box(0,1,19,24,4,4,C.iron); set(1,20,3,C.barL); set(1,23,6,C.barL);
});

// --- descripciones para el pipeline de mocks (estilo Zelda 3/4, fondo croma) ---
const DESC = s =>
  'video game environment asset, retro 16-bit isometric pixel art, classic RPG room diorama, '+
  'limited vibrant palette, '+s+', seen from a classic Zelda 3/4 axonometric perspective, '+
  'isometric top-down camera angled slightly above, clean angles, isolated on a flat self-luminous '+
  'chroma key green background, solid hex #00ff00 backdrop, absolutely no shadows, clean cutout, '+
  'detailed game asset, high quality, consistent voxel geometry';

const ROOMS = [
  { id:'taberna',  file:'taberna.vox.json',  V:taberna,  name:'Taberna',  ic:'🍺',
    desc:'a cozy medieval tavern room with a wooden L-shaped bar counter, stools, stacked ale barrels, a round table and a warm hearth' },
  { id:'herreria', file:'herreria.vox.json', V:herreria, name:'Herrería', ic:'🔨',
    desc:"a blacksmith's forge room with a glowing stone furnace and chimney, a central iron anvil, a water quench trough and a wall tool rack with hammer and tongs" },
  { id:'mazmorra', file:'mazmorra.vox.json', V:mazmorra, name:'Mazmorra', ic:'🕯️',
    desc:'a grim stone dungeon room with mossy brick walls, an iron-barred prison cell with bones, wall torches, hanging chains and a reinforced wooden door' },
];

const dir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive:true });

// escribe cada habitación (tamaño FINO; compacto — la cáscara son decenas de miles de voxels)
for(const r of ROOMS){
  const meta = { name:r.name, type:'bloque', role:'Habitación', icon:r.ic, description:DESC(r.desc) };
  const out = { format:'voxelforge-1', size:{x:FX,y:FY,z:FZ}, meta, voxels:Object.fromEntries(r.V) };
  fs.writeFileSync(path.join(dir, r.file), JSON.stringify(out));
  console.log(r.name+':', r.V.size, 'voxels (cáscara) · rejilla', FX+'×'+FY+'×'+FZ);
}

// registra en index.json (sin duplicar; conserva personajes)
const idxPath = path.join(dir,'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath,'utf8')); } catch(e){}
const ids = new Set(ROOMS.map(r=>r.id));
idx = idx.filter(a=>!ids.has(a.id));
for(const r of ROOMS){
  idx.push({ id:r.id, name:r.name, role:'Habitación', type:'bloque', icon:r.ic,
             size:{x:FX,y:FY,z:FZ}, file:'assets/'+r.file });
}
fs.writeFileSync(idxPath, JSON.stringify(idx,null,2));
console.log('index.json actualizado ·', idx.length, 'assets');
