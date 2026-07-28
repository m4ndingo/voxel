'use strict';
/* VoxelForge — MVP editor de assets voxel para RPG.
   Sin dependencias: rejilla NxNxN editada por capas (Z) + preview isométrico.
   Modelo: Map "x,y,z" -> "#rrggbb". Base cuadrada para rotar limpio. */

// ===================== Estado =====================
let SX = 16, SY = 16, SZ = 16;  // dimensiones de la rejilla (ancho X, fondo Y, alto Z)
const state = {
  voxels: new Map(),
  color: '#8a5a3b',       // hex BASE del pincel (#rrggbb); alpha/emisivo van aparte y se componen en paintValue()
  alpha: 1,               // opacidad del pincel 0..1 (1 = opaco); <1 pinta '#rrggbbaa' translúcido
  emit: false,            // pincel emisivo: pinta '*#rrggbb…' (a pleno brillo en el Mundo, ignora sombra/niebla)
  tex: null,              // textura-pincel activa (clave getRoomData) o null = color plano
  tool: 'paint',
  layer: 0,
  rot: 0,                 // 0..3
  meta: { name: 'Objeto sin título', type: 'objeto' },
};

// Paletas temáticas conmutables. Cada color es [hex, nombre]; la elegida se
// recuerda en localStorage (vf_palette) y se pinta en el panel "Paleta".
const PALETTES = {
  clasica: { name:'Clásica', emoji:'🧱', colors:[
    ['#f2d5b8','piel clara'],['#d9a066','madera'],['#8a5a3b','madera osc'],['#5e3617','nogal'],
    ['#c9ced6','piedra'],['#8f97a6','piedra media'],['#5b6172','pizarra'],['#33384a','antracita'],
    ['#7ec850','hoja'],['#4f9e3a','hierba'],['#2f6d29','pino'],['#1c4a1c','bosque'],
    ['#e2685a','rojo teja'],['#b8322b','carmesí'],['#e2a44a','ámbar'],['#f6d94a','oro'],
    ['#5aa0e2','azul'],['#356fb8','añil'],['#7a5ad9','violeta'],['#3a2f6d','índigo'],
    ['#f5f7fb','blanco'],['#c0c6d4','gris claro'],['#3a4152','gris osc'],['#101218','negro']] },
  bosque: { name:'Bosque encantado', emoji:'🌳', colors:[
    ['#eaf7cf','brote'],['#b6e07a','hoja tierna'],['#7ec850','hoja'],['#4f9e3a','hierba'],
    ['#2f6d29','pino'],['#1c4a1c','bosque'],['#c99b63','corteza clara'],['#8a5a3b','corteza'],
    ['#5e3617','tronco'],['#3a2416','raíz'],['#e2685a','seta roja'],['#d94a8f','seta rosa'],
    ['#f6d94a','polen'],['#6fd6c0','musgo lúmi'],['#a6c078','liquen'],['#f5f7fb','esporas']] },
  mazmorra: { name:'Mazmorra húmeda', emoji:'🏰', colors:[
    ['#c9ced6','sillar'],['#8f97a6','piedra'],['#5b6172','pizarra'],['#33384a','sombra'],
    ['#1a1d26','muro osc'],['#4f6b3a','musgo'],['#6d7a3a','moho'],['#6d4a2f','madera vieja'],
    ['#b8632b','óxido'],['#8a3320','herrumbre'],['#f6b84a','antorcha'],['#ef8a3a','llama'],
    ['#6fd6e2','cristal'],['#356fb8','agua'],['#c0c6d4','hueso'],['#0c0e14','abismo']] },
  fuego: { name:'Fuego y lava', emoji:'🔥', colors:[
    ['#fff3c4','chispa'],['#ffe27a','fulgor'],['#f6d94a','oro'],['#f6b84a','ámbar'],
    ['#ef8a3a','naranja'],['#e2685a','ascua'],['#d43a2b','fuego'],['#b8322b','carmesí'],
    ['#8a2320','brasa'],['#5e1417','rescoldo'],['#33121a','humo'],['#151016','ceniza'],
    ['#ff9a3a','lava clara'],['#c94a1a','lava'],['#6d7488','roca'],['#2a2f3d','basalto']] },
  hielo: { name:'Hielo y agua', emoji:'🧊', colors:[
    ['#f2fbff','escarcha'],['#d6f2ff','hielo clv'],['#a6e2f6','hielo'],['#6fd6e2','cian'],
    ['#4ab8d9','glaciar'],['#2f8ab8','mar'],['#356fb8','añil'],['#2a4a8a','abisal'],
    ['#1c2f5e','fondo'],['#b6c0d9','nieve gris'],['#8fa0c0','bruma'],['#f5f7fb','nieve'],
    ['#a6f6d6','aguamarina'],['#5ad9b8','turquesa'],['#c4b8f6','helada'],['#101826','noche']] },
  cienaga: { name:'Ciénaga tóxica', emoji:'☠️', colors:[
    ['#e2f67a','ácido'],['#b8e04a','veneno clv'],['#8fb83a','veneno'],['#5f8a2a','légamo'],
    ['#3a5e1c','pantano'],['#24380f','fango'],['#6fd6a0','fosforescente'],['#3ab88a','baba'],
    ['#a04ad9','toxina'],['#7a2fb8','morado veneno'],['#4a1c6d','púrpura osc'],['#2a1a3a','miasma'],
    ['#8a7a3a','cieno'],['#5e5024','turbera'],['#c0c6a6','gas'],['#0f140c','abismo']] },
  corte: { name:'Corte real / oro', emoji:'👑', colors:[
    ['#fff3c4','marfil'],['#f6e2a4','pergamino'],['#f6d94a','oro'],['#e2a44a','oro viejo'],
    ['#c98a2f','bronce'],['#8a5e1a','ámbar osc'],['#e2685a','rubí clv'],['#b8322b','rubí'],
    ['#a04ad9','púrpura'],['#7a2fb8','amatista'],['#4a1c6d','regio'],['#356fb8','zafiro'],
    ['#5ad9b8','esmeralda'],['#f5f7fb','mármol'],['#c0c6d4','plata'],['#33384a','ébano']] },
  desierto: { name:'Desierto y ruinas', emoji:'🏜️', colors:[
    ['#f6e8c4','arena clv'],['#e2c98a','arena'],['#d9a066','duna'],['#c98a5a','terracota'],
    ['#a6602f','arcilla'],['#7a4424','barro'],['#5e3617','madera'],['#c9ced6','caliza'],
    ['#8f97a6','ruina'],['#f6d94a','sol'],['#e2a44a','ámbar'],['#8fb85a','oasis'],
    ['#4f9e3a','cactus'],['#f5f2e2','hueso'],['#c0b8a6','polvo'],['#2a2418','sombra']] },
  noche: { name:'Noche espectral', emoji:'👻', colors:[
    ['#e6ecff','luna'],['#c4cbf2','bruma'],['#9aa6e2','espectro'],['#6f7ad9','fantasma'],
    ['#4a4ab8','nocturno'],['#2f2f8a','índigo'],['#1c1c5e','medianoche'],['#101026','abismo'],
    ['#a6f6d6','ectoplasma'],['#6fd6c0','aparición'],['#c4a4e2','malva'],['#a04ad9','arcano'],
    ['#f6d94a','vela'],['#8fa0c0','cripta'],['#5b6172','lápida'],['#0a0a14','vacío']] },
  pieles: { name:'Pieles y cabellos', emoji:'🧑', colors:[
    ['#ffe0c4','piel muy clv'],['#f2d5b8','piel clara'],['#e2b48a','piel media'],['#c98a5a','piel tostada'],
    ['#9a6b45','piel oscura'],['#6d4a30','piel muy osc'],['#b8d68a','orco'],['#8fb85a','goblin'],
    ['#a6c0d9','no-muerto'],['#a04ad9','dracónico'],['#1a1a1a','pelo negro'],['#6d4a2f','pelo castaño'],
    ['#d9a066','pelo rubio'],['#b8322b','pelo rojo'],['#c0c6d4','pelo canoso'],['#5aa0e2','pelo fantasía']] },
  metal: { name:'Metal y forja', emoji:'⚒️', colors:[
    ['#eef1f6','plata'],['#c6ccd8','acero clv'],['#a6adba','acero'],['#6d7488','hierro'],
    ['#464c5e','hierro osc'],['#2a2f3d','forjado'],['#c98a5a','cobre'],['#a6602f','cobre osc'],
    ['#e2a44a','bronce'],['#f6d94a','oro']] },
  pastel: { name:'Aldea pastel', emoji:'🍬', colors:[
    ['#f7d6c4','durazno'],['#f2b8a6','salmón'],['#e2a4b8','rosa'],['#c4a4e2','lavanda'],
    ['#a4bce2','celeste'],['#a4e2c4','menta'],['#d6e2a4','lima suave'],['#f2e2a4','mantequilla'],
    ['#f5f7fb','crema'],['#9aa3b5','gris suave']] },
  retro: { name:'Retro 8-bit', emoji:'🕹️', colors:[
    ['#000000','negro'],['#1D2B53','azul osc'],['#7E2553','vino'],['#008751','verde'],
    ['#AB5236','marrón'],['#5F574F','gris osc'],['#C2C3C7','gris'],['#FFF1E8','blanco'],
    ['#FF004D','rojo'],['#FFA300','naranja'],['#FFEC27','amarillo'],['#00E436','lima'],
    ['#29ADFF','celeste'],['#83769C','malva'],['#FF77A8','rosa'],['#FFCCAA','piel']] },
};
// Paleta activa (id + colores hex derivados) — se recuerda en localStorage.
let paletteId = 'clasica';
try{ const s=localStorage.getItem('vf_palette'); if(s && PALETTES[s]) paletteId=s; }catch(e){}
let PALETTE = PALETTES[paletteId].colors.map(c=>c[0]);

// Roster mock del "mundo" más grande. Los que traen preset son editables ya.
const HABITANTES = [
  { n:'Aldeano',    ic:'🧑‍🌾' },
  { n:'Herrero',    ic:'🧔' },
  { n:'Slime',      ic:'🟢', preset:'slime' },
  { n:'Murciélago', ic:'🦇' },
];
const key = (x,y,z)=>x+','+y+','+z;

// ===================== DOM =====================
const $  = s => document.querySelector(s);
const editCv = $('#edit'), isoCv = $('#iso'), edit3d = $('#edit3d');
const ectx = editCv.getContext('2d'), ictx = isoCv.getContext('2d'), e3ctx = edit3d.getContext('2d');
// Interruptor del PREVIEW 3D (botón en la tarjeta «Vista 3D» del panel derecho): la miniatura iso
// (#iso, drawIso) es O(modelo) y con salas enormes (~50k voxels) se repinta en cada cambio; este
// switch OCULTA esa tarjeta y evita su coste, sin tocar el lienzo de edición 3D del centro.
// applyShowPreview() vive más abajo.
let _showPreview=true; try{ _showPreview = localStorage.getItem('vf_showpreview')!=='0'; }catch(e){}
let hover = null, painting = false;
let mode = 'capas';                 // 'capas' (2D por capas) | '3d' (edición 3D)
let hover3d = null, g3d = null;                  // voxel resaltado y geometría de la vista 3D
let isoGeom = null;                              // geometría de la miniatura iso (plano de capa + interacción)
let isolateMode = 'off';                         // 'off' | 'upto' (1..capa) | 'only' (solo la capa) — resto fantasma
const isoOn = ()=>isolateMode!=='off';
const isoSolid = z => isolateMode==='only' ? z===state.layer : z<=state.layer;
const selection = new Set();                     // voxels seleccionados ("x,y,z")
let modalOpen = false, spinTimer = null, modalSeams = true;
let skyOn = localStorage.getItem('vf_sky')==='1';                     // cielo en la vista grande (Ampliar)
let skyColor = localStorage.getItem('vf_sky_color') || '#77b6f0';    // color del cielo
const SKY_GROUND = '#6f8f4e';                                        // color de la tierra bajo el horizonte
const skyArg = ()=> skyOn ? skyColor : null;
let shadowOn = localStorage.getItem('vf_shadow')==='1';              // sombra proyectada al suelo en la vista grande (Ampliar)
const shadowArg = ()=> shadowOn;
const modalView = { yaw:-2.42, pitch:0.62, zoom:1, panX:0, panY:0 };   // vista grande: rotación libre
let mdrag = false, mlast = null;
const view = { zoom:1, panX:0, panY:0 };   // zoom/pan del lienzo de edición
let panning = false, panLast = null, ctrlHeld = false, altHeld = false;

// Normaliza el campo `size` (número cúbico legado o {x,y,z}) a [x,y,z]
function normSize(s){
  if(typeof s==='number') return [s,s,s];
  if(s && typeof s==='object') return [s.x||16, s.y||16, s.z||16];
  return [16,16,16];
}
// Cambia las dimensiones de rejilla y ajusta la UI dependiente
function setSize(x,y,z){
  SX=x; SY=y; SZ=z;
  const sl=$('#layer-slider'); sl.max=SZ-1;
  if(state.layer>SZ-1) state.layer=SZ-1;
  const sx=$('#size-x'), sy=$('#size-y'), sz=$('#size-z');
  if(sx){ sx.value=SX; sy.value=SY; sz.value=SZ; }
}
// Redimensiona la rejilla del objeto actual (recorta voxels fuera de rango)
function resizeGrid(x,y,z){
  const changed = (x!==SX||y!==SY||z!==SZ);
  const before = snapshot();
  for(const k of [...state.voxels.keys()]){
    const [vx,vy,vz]=k.split(',').map(Number);
    if(vx>=x||vy>=y||vz>=z){ state.voxels.delete(k); mutated=true; voxRev++; }
  }
  if(changed||mutated) commit(before);
  setSize(x,y,z);
  view.zoom=1; view.panX=0; view.panY=0; updateZoomLabel(); hover3d=null; selection.clear();
  view3d.zoom=1; view3d.panX=0; view3d.panY=0;
  syncLayer(); render();
}
// Gira el objeto 90° sobre un eje (transforma los voxels). Así las capas de altura
// cortan por otro plano sin duplicar el sistema de capas (p.ej. girar en X = tumbarlo).
function rotateModel(ax, dir){
  const oSX=SX,oSY=SY,oSZ=SZ, before=snapshot();
  const R={
    'x+':[(x,y,z)=>[x, oSZ-1-z, y], oSX,oSZ,oSY],
    'x-':[(x,y,z)=>[x, z, oSY-1-y], oSX,oSZ,oSY],
    'y+':[(x,y,z)=>[z, y, oSX-1-x], oSZ,oSY,oSX],
    'y-':[(x,y,z)=>[oSZ-1-z, y, x], oSZ,oSY,oSX],
    'z+':[(x,y,z)=>[oSY-1-y, x, z], oSY,oSX,oSZ],
    'z-':[(x,y,z)=>[y, oSX-1-x, z], oSY,oSX,oSZ],
  }[ax+(dir<0?'-':'+')];
  const [fn,nx,ny,nz]=R, nv=new Map();
  for(const [k,c] of state.voxels){ const [x,y,z]=k.split(',').map(Number); const [a,b,cc]=fn(x,y,z); nv.set(a+','+b+','+cc,c); }
  state.voxels=nv; setSize(nx,ny,nz);
  if(state.layer>nz-1) state.layer=nz-1;
  hover3d=null; selection.clear();
  view.zoom=1; view.panX=0; view.panY=0; updateZoomLabel();
  view3d.zoom=1; view3d.panX=0; view3d.panY=0;
  commit(before); syncLayer(); render();
}

// ===================== Voxels =====================
let mutated = false;              // lo activa setVoxel cuando cambia algo (para el historial)
// Este `const` vive en el entorno léxico global y SOMBREA a window.getVoxel para todo el ámbito global
// (consola, snippets con `new Function`), así que es el ÚNICO getVoxel que ven los scripts. En el Mundo (🌍)
// delega en la rejilla densa 3D; en el editor de asset lee el modelo que editas. (setVoxel no sufre esto: es
// una `function`, vive en window y sí se puede reasignar a mcSetVoxel.)
const getVoxel = (x,y,z)=> (mc && mc.active && mc.grid) ? mcGetVoxel(x,y,z) : state.voxels.get(key(x,y,z));
// --- cachés de rendimiento (modelos grandes ~50k voxels) ---
let voxRev=0;                                        // revisión: se incrementa en cada mutación in-place
const _mapIds=new WeakMap(); let _mapIdSeq=0;        // identidad del Map (cambia al cargar/rotar/etc.)
const mapId=m=>{ let i=_mapIds.get(m); if(i===undefined){ i=++_mapIdSeq; _mapIds.set(m,i); } return i; };
const voxKey=()=>mapId(state.voxels)+':'+voxRev;
let _vlKey=null,_vl=null,_vlBox=null,_vlIdx=null,_occKey=null,_occSet=null;
let _silKey=null,_silUV=null;                        // caché de la silueta de encuadre (project3d)
let _perspProj=null;                                 // parámetros de la proyección cónica activa (culling), null si ortográfica
function voxParsed(){                                // lista parseada {x,y,z,c} + bbox, cacheada
  const k=voxKey(); if(_vlKey===k) return {list:_vl, box:_vlBox};
  const list=[], idx=new Map(); let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,minz=1e9,maxz=-1e9;
  for(const [kk,c] of state.voxels){
    const [x,y,z]=kk.split(',').map(Number); idx.set(kk,list.length); list.push({x,y,z,c,d:0});
    if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; if(z<minz)minz=z; if(z>maxz)maxz=z;
  }
  _vlKey=k; _vl=list; _vlBox={minx,maxx,miny,maxy,minz,maxz}; _vlIdx=idx;
  return {list,box:_vlBox};
}
const _rasters=new Map();                            // ImageData reutilizable por tamaño
function getRaster(ctx,W,H){ const k=W+'x'+H; let r=_rasters.get(k);
  if(!r){ r=ctx.createImageData(W,H); _rasters.set(k,r); } return r; }
const BIG3D=15000;                                   // umbral de "modelo grande"
const bigModel=()=>state.voxels.size>BIG3D;
function setVoxel(x,y,z,c){
  const k=key(x,y,z);
  const prev=state.voxels.get(k);
  if(c ? prev===c : prev===undefined) return;        // sin cambio real
  // BUG-P3D1: parchea las cachés en O(1) ANTES de invalidar voxRev; sin esto cada trazo del pincel
  // obligaba a re-parsear TODO el modelo (~50k split de strings + Set nuevo) en el frame siguiente.
  const kNow=voxKey(), vlFresh=(_vlKey===kNow && _vlIdx), occFresh=(_occKey===kNow && _occSet);
  if(c) state.voxels.set(k,c); else state.voxels.delete(k);
  mutated=true; voxRev++;
  const kNew=voxKey();
  if(vlFresh){
    if(c && prev===undefined){                       // alta: push + índice + bbox que crece
      _vlIdx.set(k,_vl.length); _vl.push({x,y,z,c,d:0});
      const b=_vlBox; if(x<b.minx)b.minx=x; if(x>b.maxx)b.maxx=x; if(y<b.miny)b.miny=y; if(y>b.maxy)b.maxy=y; if(z<b.minz)b.minz=z; if(z>b.maxz)b.maxz=z;
      _vlKey=kNew;
    } else if(c){ _vl[_vlIdx.get(k)].c=c; _vlKey=kNew; }   // recolor in-place
    else {                                           // baja: swap-pop (el bbox queda holgado: solo afecta al encuadre)
      const i=_vlIdx.get(k), last=_vl.pop(); _vlIdx.delete(k);
      if(i<_vl.length){ _vl[i]=last; _vlIdx.set(last.x+','+last.y+','+last.z, i); }
      _vlKey=kNew;
    }
  }
  if(occFresh){ if(c) _occSet.add(k); else _occSet.delete(k); _occKey=kNew; }
}

// --- Texturas como valor de voxel: 'tex:'+clave getRoomData ('asset:…'|'hab:…') ---
const isTex    = c => typeof c==='string' && c.slice(0,4)==='tex:';
const texKeyOf = c => c.slice(4);
// --- Color con alpha (#rrggbbaa) y emisivo (prefijo '*') ---------------------
// El valor de un voxel #hex puede ser: '#rrggbb' (opaco, iluminado, formato de siempre),
// '#rrggbbaa' (translúcido, alpha 00..ff) y con prefijo '*' = emisivo ('*#rrggbb…', a pleno
// brillo en el Mundo: ignora sombra y niebla). Estos helpers descomponen ese string.
const isGlow   = c => typeof c==='string' && c[0]==='*';                       // ¿emisivo? (prefijo '*')
const bareColor= c => isGlow(c) ? c.slice(1) : c;                              // sin '*': hex CSS válido (#rrggbb / #rrggbbaa)
function hex6(c){ c=bareColor(c); if(typeof c!=='string'||c[0]!=='#') return c;  // solo '#rrggbb' (sin alpha, sin '*')
  let h=c.slice(1); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; return '#'+h.slice(0,6); }
function colorAlpha(c){ c=bareColor(c); if(typeof c!=='string'||c[0]!=='#') return 1;  // alpha 0..1 (1 si no lleva par aa)
  const h=c.slice(1); return h.length>=8 ? parseInt(h.slice(6,8),16)/255 : 1; }
const alphaHex = a => Math.round(Math.max(0,Math.min(1,a))*255).toString(16).padStart(2,'0');
function paintValue(){                                                          // valor a escribir según pincel activo
  if(state.tex) return 'tex:'+state.tex;
  let c=state.color;                                                            // #rrggbb base
  if(state.alpha<1) c=hex6(c)+alphaHex(state.alpha);                            // → #rrggbbaa translúcido
  return state.emit ? '*'+c : c;                                               // → '*…' emisivo
}
const texReprCache=new Map();                          // clave -> color representativo (para celdas 2D / tira)
function texRepr(key){ return texReprCache.get(key) || '#8a8f94'; }
function voxFill(c){ return isTex(c) ? texRepr(texKeyOf(c)) : bareColor(c); }   // color plano para pintar en 2D (canvas admite #rrggbbaa)

function applyTool(cx,cy){
  if(cx<0||cy<0||cx>=SX||cy>=SY) return;
  const z = state.layer;
  switch(state.tool){
    case 'paint': setVoxel(cx,cy,z,paintValue()); break;
    case 'build': if(getVoxel(cx,cy,z)===undefined) setVoxel(cx,cy,z,paintValue()); break;  // Construir: solo rellena huecos, no repinta
    case 'erase': setVoxel(cx,cy,z,null); break;
    case 'pick':  { const c=getVoxel(cx,cy,z); if(c) pickColorTool(c); break; }
    case 'fill':  floodFill(cx,cy,z); break;
  }
  render();
}

function floodFill(sx,sy,z){
  const target = getVoxel(sx,sy,z) || null;
  const repl = paintValue();
  if(target === repl) return;
  const stack=[[sx,sy]], seen=new Set();
  while(stack.length){
    const [x,y]=stack.pop();
    if(x<0||y<0||x>=SX||y>=SY) continue;
    const k=x+','+y; if(seen.has(k)) continue; seen.add(k);
    if((getVoxel(x,y,z)||null)!==target) continue;
    setVoxel(x,y,z,repl);
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
}

// ===================== Historial (deshacer / rehacer) =====================
// Snapshot = {voxels, size}. Se registra una entrada por "gesto" (trazo, borrado,
// relleno, redimensionado…). `mutated` (en setVoxel) evita registrar cambios nulos.
const undoStack=[], redoStack=[]; const MAXUNDO=80;
const snapshot=()=>({ v:[...state.voxels], s:[SX,SY,SZ], sel:[...selection] });
function applySnapshot(snap){
  state.voxels=new Map(snap.v); setSize(...snap.s);
  selection.clear(); if(snap.sel) for(const k of snap.sel) selection.add(k);   // restaura la selección
  hover=null; hover3d=null;
  syncLayer(); render();
}
function updateUndoUI(){
  const u=$('#btn-undo'), r=$('#btn-redo');
  if(u) u.disabled=!undoStack.length;
  if(r) r.disabled=!redoStack.length;
}
function commit(before){ undoStack.push(before); if(undoStack.length>MAXUNDO) undoStack.shift(); redoStack.length=0; updateUndoUI(); }
function undo(){ if(!undoStack.length) return; redoStack.push(snapshot()); applySnapshot(undoStack.pop()); updateUndoUI(); }
function redo(){ if(!redoStack.length) return; undoStack.push(snapshot()); applySnapshot(redoStack.pop()); updateUndoUI(); }
function clearHistory(){ undoStack.length=0; redoStack.length=0; updateUndoUI(); }
// Gestos (trazos con arrastre): snapshot al empezar, se registra al soltar si hubo cambios.
let gestureBefore=null;
function beginGesture(){ gestureBefore=snapshot(); mutated=false; }
function endGesture(){ if(gestureBefore && mutated) commit(gestureBefore); gestureBefore=null; mutated=false; }
// Acción atómica (borrar selección, vaciar capa, redimensionar…).
function edit(fn){ const before=snapshot(); mutated=false; fn(); if(mutated) commit(before); }

// ===================== Color =====================
function shade(hex,f){
  let a=1;
  if(hex.length!==7){ a=colorAlpha(hex); hex=hex6(hex); }   // ruta rápida para '#rrggbb'; el resto lleva '*' o alpha
  const n=parseInt(hex.slice(1),16);
  const r=Math.min(255,Math.round(((n>>16)&255)*f));
  const g=Math.min(255,Math.round(((n>>8)&255)*f));
  const b=Math.min(255,Math.round((n&255)*f));
  return a>=1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

// ===================== Render: lienzo de capa =====================
// Geometría de la vista (celda y origen) según zoom/pan; usada por dibujo y hit-test.
function baseCell(W,H){ return Math.min(W*0.99/SX, H*0.99/SY); }   // celda cuadrada que encaja X×Y
function viewGeom(){
  const W=editCv.width, H=editCv.height;
  const cell=baseCell(W,H)*view.zoom;
  const gx=cell*SX, gy=cell*SY;
  const originX=(W-gx)/2+view.panX;
  const originY=(H-gy)/2+view.panY;
  return {W,H,cell,gx,gy,originX,originY};
}

// Pinta una celda 2D: si el voxel es textura, su cara superior (+Z) real (indexada col=x/row=y, encaja
// con la rejilla de Capas); si no, color plano. Cae al color representativo si la textura aún no cargó.
function drawVoxCell(c, X, Y, W, H){
  if(isTex(c)){ const fc=getTexFaces(texKeyOf(c)); if(fc){ ectx.imageSmoothingEnabled=false; ectx.drawImage(fc.faces[0], X, Y, W, H); return; } }
  ectx.fillStyle=voxFill(c); ectx.fillRect(X, Y, W, H);
}
function drawEdit(){
  const {W,H,cell,gx,gy,originX,originY}=viewGeom();
  ectx.fillStyle='#0e1119'; ectx.fillRect(0,0,W,H);
  // fondo de la rejilla
  ectx.fillStyle='#12151d'; ectx.fillRect(originX,originY,gx,gy);

  const gap=Math.max(0, Math.min(1.5, cell*0.06));   // separación entre celdas según zoom
  const px=(x)=>originX+x*cell, py=(y)=>originY+y*cell;

  // fantasma de la capa inferior
  if(state.layer>0){
    ectx.globalAlpha=0.18;
    for(let x=0;x<SX;x++)for(let y=0;y<SY;y++){
      const c=getVoxel(x,y,state.layer-1);
      if(c){ drawVoxCell(c, px(x), py(y), cell, cell); }
    }
    ectx.globalAlpha=1;
  }
  // capa actual
  for(let x=0;x<SX;x++)for(let y=0;y<SY;y++){
    const c=getVoxel(x,y,state.layer);
    if(c){ drawVoxCell(c, px(x)+gap, py(y)+gap, cell-2*gap, cell-2*gap); }
  }
  // rejilla
  ectx.strokeStyle='rgba(255,255,255,0.06)'; ectx.lineWidth=1;
  ectx.beginPath();
  for(let i=0;i<=SX;i++){ ectx.moveTo(px(i),originY); ectx.lineTo(px(i),originY+gy); }
  for(let j=0;j<=SY;j++){ ectx.moveTo(originX,py(j)); ectx.lineTo(originX+gx,py(j)); }
  ectx.stroke();
  // selección (compartida con la vista 3D): tinte cian en los voxels seleccionados de ESTA capa
  if(selection.size){
    let others=0;
    for(const k of selection){
      const [x,y,z]=k.split(',').map(Number);
      if(z!==state.layer){ others++; continue; }
      ectx.fillStyle='rgba(63,224,255,0.35)'; ectx.fillRect(px(x)+gap,py(y)+gap,cell-2*gap,cell-2*gap);
      ectx.strokeStyle='#3fe0ff'; ectx.lineWidth=1.5;
      ectx.strokeRect(px(x)+gap+0.5,py(y)+gap+0.5,cell-2*gap-1,cell-2*gap-1);
    }
    if(others){                                   // aviso de selección en otras capas
      ectx.fillStyle='rgba(63,224,255,0.85)'; ectx.font='11px system-ui'; ectx.textAlign='left';
      ectx.fillText('◧ '+others+' seleccionado(s) en otras capas', originX+4, originY-6<10?originY+gy+14:originY-6);
    }
  }
  // hover
  if(hover){
    ectx.strokeStyle=state.tool==='erase'?'#e2685a':'#e2a44a';
    ectx.lineWidth=2;
    ectx.strokeRect(px(hover.x)+gap,py(hover.y)+gap,cell-2*gap,cell-2*gap);
  }
  // recuadro de selección (Shift+arrastre con la herramienta Selección)
  if(marquee){
    const mx0=Math.min(marquee.x0,marquee.x1), mx1=Math.max(marquee.x0,marquee.x1)+1;
    const my0=Math.min(marquee.y0,marquee.y1), my1=Math.max(marquee.y0,marquee.y1)+1;
    const rx=px(mx0), ry=py(my0), rw=(mx1-mx0)*cell, rh=(my1-my0)*cell;
    ectx.save();
    ectx.fillStyle='rgba(63,224,255,0.12)'; ectx.fillRect(rx,ry,rw,rh);
    ectx.strokeStyle='#3fe0ff'; ectx.lineWidth=1.5; ectx.setLineDash([5,4]);
    ectx.strokeRect(rx+0.5,ry+0.5,rw-1,rh-1);
    ectx.restore();
  }
  // vista previa del pegado (Ctrl+V): fantasma que sigue al cursor; muestra lo que cae en la capa visible
  if(pasting && hover){
    const ox=hover.x-pasting.gx, oy=hover.y-pasting.gy;
    ectx.save();
    for(const cel of pasting.cells){ if(cel.dz!==0) continue;   // en 2D solo se ve lo de la capa actual (dz=0)
      const x=ox+cel.dx, y=oy+cel.dy; if(x<0||y<0||x>=SX||y>=SY) continue;
      ectx.globalAlpha=0.55; ectx.fillStyle=voxFill(cel.c); ectx.fillRect(px(x)+gap,py(y)+gap,cell-2*gap,cell-2*gap);
      ectx.globalAlpha=1; ectx.strokeStyle='#3fe0ff'; ectx.lineWidth=1; ectx.setLineDash([3,3]);
      ectx.strokeRect(px(x)+gap+0.5,py(y)+gap+0.5,cell-2*gap-1,cell-2*gap-1);
    }
    ectx.restore();
  }
}

// Ajusta el tamaño interno del canvas a su contenedor (usa todo el espacio)
function resizeEdit(){
  const wrap=editCv.parentElement;
  const dpr=Math.min(2, window.devicePixelRatio||1);
  const w=Math.max(200, wrap.clientWidth), h=Math.max(200, wrap.clientHeight);
  editCv.width=Math.round(w*dpr); editCv.height=Math.round(h*dpr);
  drawEdit();
}
function resetView(){ view.zoom=1; view.panX=0; view.panY=0; updateZoomLabel(); drawEdit(); }
function updateZoomLabel(){ const el=document.getElementById('zoom-label'); if(el) el.textContent=Math.round(view.zoom*100)+'%'; }
function zoomAt(cx,cy,factor){
  const b=viewGeom();
  const gx=(cx-b.originX)/b.cell, gy=(cy-b.originY)/b.cell;
  view.zoom=Math.max(0.4, Math.min(10, view.zoom*factor));
  const W=editCv.width,H=editCv.height;
  const cell=baseCell(W,H)*view.zoom;
  view.panX = cx - gx*cell - (W-cell*SX)/2;
  view.panY = cy - gy*cell - (H-cell*SY)/2;
  updateZoomLabel(); drawEdit();
}

// ===================== Render: isométrico =====================
function rotXY(x,y,rot){
  const mx=SX-1, my=SY-1;               // rotación 90° válida también para base rectangular
  switch(rot&3){
    case 0: return [x,y];
    case 1: return [y,mx-x];
    case 2: return [mx-x,my-y];
    default:return [my-y,x];
  }
}

// Proyección iso reutilizable (dibujo y picking): devuelve escala, origen,
// lista ordenada de atrás→adelante (con rx,ry y x,y originales) y el set de ocupación.
function isoProject(W, H, rot, maxS, zoom, panX, panY){
  const list=[];
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,minz=1e9,maxz=-1e9;
  for(const p of voxParsed().list){                 // lista parseada cacheada (sin splits)
    const [rx,ry]=rotXY(p.x,p.y,rot), z=p.z;
    list.push({rx,ry,z,c:p.c,x:p.x,y:p.y});
    minx=Math.min(minx,rx); maxx=Math.max(maxx,rx);
    miny=Math.min(miny,ry); maxy=Math.max(maxy,ry);
    minz=Math.min(minz,z);  maxz=Math.max(maxz,z);
  }
  if(!list.length) return null;
  const wu=(maxx-minx)+(maxy-miny), hu=wu;
  let S=Math.min(W*0.9/(wu+2), H*0.9/(hu*0.5+(maxz-minz)+2));
  S=Math.max(4,Math.min(maxS||26,S))*(zoom||1);
  const h=S*0.5, V=S;
  list.sort((a,b)=>(a.rx+a.ry)-(b.rx+b.ry) || a.z-b.z);
  let pminX=1e9,pmaxX=-1e9,pminY=1e9,pmaxY=-1e9;
  for(const v of list){
    const X=(v.rx-v.ry)*S, Y=(v.rx+v.ry)*h - v.z*V;
    pminX=Math.min(pminX,X-S); pmaxX=Math.max(pmaxX,X+S);
    pminY=Math.min(pminY,Y-h); pmaxY=Math.max(pmaxY,Y+h+V);
  }
  const ox=(W-(pmaxX-pminX))/2-pminX+(panX||0);
  const oy=(H-(pmaxY-pminY))/2-pminY+(panY||0);
  const occupied=new Set(list.map(v=>v.rx+','+v.ry+','+v.z));
  return {S,h,V,ox,oy,list,occupied,rot};
}
const faceTop=(sx,sy,S,h)=>[[sx,sy-h],[sx+S,sy],[sx,sy+h],[sx-S,sy]];
const faceLeft=(sx,sy,S,h,V)=>[[sx-S,sy],[sx,sy+h],[sx,sy+h+V],[sx-S,sy+V]];
const faceRight=(sx,sy,S,h,V)=>[[sx+S,sy],[sx,sy+h],[sx,sy+h+V],[sx+S,sy+V]];

// Render iso a cualquier ctx/canvas (lo usan la vista lateral, el modal y la edición 3D)
function renderIso(ctx, W, H, rot, maxS, seams, zoom, panX, panY){
  ctx.clearRect(0,0,W,H);
  if(state.voxels.size===0){
    ctx.fillStyle='#4a5266'; ctx.font='13px system-ui'; ctx.textAlign='center';
    ctx.fillText('Sin voxels — pinta en la capa', W/2, H/2);
    return;
  }
  drawIsoFaces(ctx, W, H, isoProject(W,H,rot,maxS,zoom,panX,panY), seams);
}

// Dibuja las caras (con culling) de una proyección ya calculada.
// Rasterizador sin antialiasing (scanline half-open) reutilizable: color en uint32 (ABGR).
const _colCache=new Map();
function col32(hex,f){
  const k=hex+'|'+f; let u=_colCache.get(k);
  if(u===undefined){
    let a=255; if(hex.length!==7){ a=Math.round(colorAlpha(hex)*255); hex=hex6(hex); }   // admite '*' emisivo y '#rrggbbaa'
    const n=parseInt(hex.slice(1),16);
    const r=Math.min(255,Math.round(((n>>16)&255)*f)), g=Math.min(255,Math.round(((n>>8)&255)*f)), b=Math.min(255,Math.round((n&255)*f));
    u=(a<<24)|(b<<16)|(g<<8)|r; _colCache.set(k,u);
  }
  return u;
}
const _sx=new Float64Array(8);
function scanQuad(buf, W, H, c, x0,y0,x1,y1,x2,y2,x3,y3){
  const X=[x0,x1,x2,x3], Y=[y0,y1,y2,y3];
  const yMin=Math.max(0, Math.ceil(Math.min(y0,y1,y2,y3)-0.5)), yMax=Math.min(H-1, Math.floor(Math.max(y0,y1,y2,y3)-0.5));
  for(let py=yMin; py<=yMax; py++){
    const yc=py+0.5; let n=0;
    for(let i=0;i<4;i++){ const j=(i+1)&3, yi=Y[i], yj=Y[j];
      if((yi<=yc && yc<yj)||(yj<=yc && yc<yi)) _sx[n++]=X[i]+(yc-yi)*(X[j]-X[i])/(yj-yi); }
    if(n<2) continue;
    let a=_sx[0], b2=_sx[1];
    for(let i=2;i<n;i++){ if(_sx[i]<a) a=_sx[i]; else if(_sx[i]>b2) b2=_sx[i]; }
    if(a>b2){ const t=a; a=b2; b2=t; }
    const xA=Math.max(0, Math.ceil(a-0.5)), xB=Math.min(W-1, Math.ceil(b2-0.5)-1);
    if(xA<=xB) buf.fill(c, py*W+xA, py*W+xB+1);
  }
}

function drawIsoFaces(ctx, W, H, g, seams){
  const {S,h,V,ox,oy,list,occupied}=g;
  const pos=v=>[(v.rx-v.ry)*S+ox, (v.rx+v.ry)*h - v.z*V + oy];
  const topVis=v=>!occupied.has(v.rx+','+v.ry+','+(v.z+1));
  const leftVis=v=>!occupied.has(v.rx+','+(v.ry+1)+','+v.z);
  const rightVis=v=>!occupied.has((v.rx+1)+','+v.ry+','+v.z);

  // Con texturas hay que dibujar la cara real (drawImage) → no cabe en el raster plano (color medio).
  const hasTex = list.some(v=>isTex(v.c));
  if(seams===false && !hasTex){
    const img=getRaster(ctx,W,H), buf=new Uint32Array(img.data.buffer);
    buf.fill(0);                                   // reutilizado => limpiar (transparente)
    for(const v of list){
      const [sx,sy]=pos(v);
      if(topVis(v))   scanQuad(buf,W,H,rasterCol(v.c,0,1.10), sx,sy-h, sx+S,sy, sx,sy+h, sx-S,sy);
      if(leftVis(v))  scanQuad(buf,W,H,rasterCol(v.c,4,0.72), sx-S,sy, sx,sy+h, sx,sy+h+V, sx-S,sy+V);
      if(rightVis(v)) scanQuad(buf,W,H,rasterCol(v.c,2,0.55), sx+S,sy, sx,sy+h, sx,sy+h+V, sx+S,sy+V);
    }
    ctx.putImageData(img,0,0);
  } else {
    // Con rejilla (o con texturas): solo caras visibles (culling), textura real si isTex.
    for(const v of list){
      const [sx,sy]=pos(v);
      if(topVis(v))   isoFace(ctx, v, 0, [[sx,sy-h],[sx+S,sy],[sx,sy+h],[sx-S,sy]], 1.10);
      if(leftVis(v))  isoFace(ctx, v, 4, [[sx-S,sy+V],[sx-S,sy],[sx,sy+h],[sx,sy+h+V]], 0.72);
      if(rightVis(v)) isoFace(ctx, v, 2, [[sx+S,sy+V],[sx,sy+h+V],[sx,sy+h],[sx+S,sy]], 0.55);
    }
  }
}
// Una cara del iso: textura real proyectada (drawTexFace) si el voxel es tex:, si no relleno plano sombreado.
// El poly va en el orden de esquinas de CUBE_FACES[fi].c para que la textura quede bien orientada.
// below=true (corte de Capas): bajo el plano de corte, se atenúa (tinte azulado plano / oscurecido en textura).
function isoFace(ctx, v, fi, poly, factor, below){
  if(isTex(v.c)){ const fc=getTexFaces(texKeyOf(v.c)); if(fc){ drawTexFace(ctx, fc.faces[fi], below?factor*0.55:factor, poly); return; } }
  face(ctx, poly, (below?shadeBelow:shade)(voxFill(v.c), factor));
}

function drawIso(){
  // Preview 3D oculto (interruptor de la tarjeta): no gastar CPU en la miniatura iso; el modal
  // «Ampliar» es independiente y sí debe seguir pintándose si está abierto.
  if(!_showPreview){ if(modalOpen) drawIsoBig(); return; }
  const W=isoCv.width, H=isoCv.height;
  ictx.clearRect(0,0,W,H);
  if(state.voxels.size===0){
    ictx.fillStyle='#4a5266'; ictx.font='13px system-ui'; ictx.textAlign='center';
    ictx.fillText('Sin voxels — pinta en la capa', W/2, H/2); isoGeom=null;
  } else {
    const g=isoProject(W,H,state.rot,26,1,0,0);
    isoGeom=g;
    if(isoOn()) drawIsoIsolate(g);                   // aislar (hasta/solo la capa) + fantasma
    else if(mode!=='3d') (bigModel()?drawIsoSlicedBig:drawIsoSliced)(g, state.layer);  // Capas: corte
    else drawIsoFaces(ictx,W,H,g, !bigModel());      // modelos grandes: raster sin costuras (rápido)
  }
  if(modalOpen) drawIsoBig();
}
// Aislar: voxels sólidos (isoSolid) con culling solo contra sólidos; el resto, alpha casi transparente.
function drawIsoIsolate(g){
  const {S,h,V,ox,oy,list,occupied}=g;
  const solidOcc=new Set();
  for(const v of list) if(isoSolid(v.z)) solidOcc.add(v.rx+','+v.ry+','+v.z);
  ictx.lineJoin='round'; ictx.lineWidth=1;
  for(const v of list){
    const ghost = !isoSolid(v.z), occ = ghost ? occupied : solidOcc;
    const sx=(v.rx-v.ry)*S+ox, sy=(v.rx+v.ry)*h - v.z*V + oy;
    ictx.globalAlpha = ghost ? 0.12 : 1;
    if(!occ.has(v.rx+','+v.ry+','+(v.z+1))) isoFace(ictx, v, 0, [[sx,sy-h],[sx+S,sy],[sx,sy+h],[sx-S,sy]], 1.10);
    if(!occ.has(v.rx+','+(v.ry+1)+','+v.z)) isoFace(ictx, v, 4, [[sx-S,sy+V],[sx-S,sy],[sx,sy+h],[sx,sy+h+V]], 0.72);
    if(!occ.has((v.rx+1)+','+v.ry+','+v.z)) isoFace(ictx, v, 2, [[sx+S,sy+V],[sx,sy+h+V],[sx,sy+h],[sx+S,sy]], 0.55);
  }
  ictx.globalAlpha=1;
}
// Tinte para voxels por DEBAJO del corte: desaturado + oscuro + frío => se distinguen del resto
function shadeBelow(hex,f){
  if(hex.length!==7) hex=hex6(hex);   // admite '*' emisivo y '#rrggbbaa' (el tinte de corte va opaco)
  const n=parseInt(hex.slice(1),16);
  let r=((n>>16)&255)*f, g=((n>>8)&255)*f, b=(n&255)*f;
  const lum=r*0.3+g*0.59+b*0.11, t=0.6;
  r=(r*(1-t)+lum*t)*0.72; g=(g*(1-t)+lum*t)*0.78; b=(b*(1-t)+lum*t)*0.92+16;
  return `rgb(${Math.min(255,r|0)},${Math.min(255,g|0)},${Math.min(255,b|0)})`;
}
// Miniatura como CORTE transversal: plano integrado en el orden de profundidad (los voxels
// de delante lo tapan) + voxels bajo el plano tintados; sobre el plano, color normal.
// Variante rápida del corte para modelos grandes: raster sin AA (bajo el corte, atenuado) y el
// plano como UN solo rombo translúcido encima (sin intercalar 12k celdas en el orden pintor).
function drawIsoSlicedBig(g, layer){
  const {S,h,V,ox,oy,list,occupied}=g, zp=layer+0.5, W=isoCv.width, H=isoCv.height;
  const topVis=v=>!occupied.has(v.rx+','+v.ry+','+(v.z+1));
  const leftVis=v=>!occupied.has(v.rx+','+(v.ry+1)+','+v.z);
  const rightVis=v=>!occupied.has((v.rx+1)+','+v.ry+','+v.z);
  const img=getRaster(ictx,W,H), buf=new Uint32Array(img.data.buffer); buf.fill(0);
  let minr=1e9,maxr=-1e9,mins=1e9,maxs=-1e9;
  for(const v of list){
    if(v.rx<minr)minr=v.rx; if(v.rx>maxr)maxr=v.rx; if(v.ry<mins)mins=v.ry; if(v.ry>maxs)maxs=v.ry;
    const sx=(v.rx-v.ry)*S+ox, sy=(v.rx+v.ry)*h - v.z*V + oy;
    const dim = v.z<zp ? 0.55 : 1;                            // bajo el corte => atenuado
    if(topVis(v))   scanQuad(buf,W,H,rasterCol(v.c,0,1.10*dim), sx,sy-h, sx+S,sy, sx,sy+h, sx-S,sy);
    if(leftVis(v))  scanQuad(buf,W,H,rasterCol(v.c,4,0.72*dim), sx-S,sy, sx,sy+h, sx,sy+h+V, sx-S,sy+V);
    if(rightVis(v)) scanQuad(buf,W,H,rasterCol(v.c,2,0.55*dim), sx+S,sy, sx,sy+h, sx,sy+h+V, sx+S,sy+V);
  }
  ictx.putImageData(img,0,0);
  const P=(rx,ry)=>[(rx-ry)*S+ox, (rx+ry)*h - zp*V + oy];     // plano = un rombo del bbox a la altura zp
  const a=P(minr,mins), b=P(maxr+1,mins), c=P(maxr+1,maxs+1), d=P(minr,maxs+1);
  ictx.beginPath(); ictx.moveTo(a[0],a[1]); ictx.lineTo(b[0],b[1]); ictx.lineTo(c[0],c[1]); ictx.lineTo(d[0],d[1]); ictx.closePath();
  ictx.fillStyle='rgba(95,215,255,0.28)'; ictx.fill();
  ictx.strokeStyle='rgba(95,215,255,0.7)'; ictx.lineWidth=1.5; ictx.stroke();
}
function drawIsoSliced(g, layer){
  const {S,h,V,ox,oy,list,occupied}=g, zp=layer+0.5;
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(const v of list){ if(v.x<minx)minx=v.x; if(v.x>maxx)maxx=v.x; if(v.y<miny)miny=v.y; if(v.y>maxy)maxy=v.y; }
  const items=list.slice();                                   // voxels + celdas de plano
  for(let x=minx;x<=maxx;x++)for(let y=miny;y<=maxy;y++){
    const [rx,ry]=rotXY(x,y,state.rot); items.push({rx,ry,z:zp,plane:true});
  }
  items.sort((a,b)=>(a.rx+a.ry)-(b.rx+b.ry) || a.z-b.z);      // orden pintor (plano incluido)
  const topVis=v=>!occupied.has(v.rx+','+v.ry+','+(v.z+1));
  const leftVis=v=>!occupied.has(v.rx+','+(v.ry+1)+','+v.z);
  const rightVis=v=>!occupied.has((v.rx+1)+','+v.ry+','+v.z);
  ictx.lineJoin='round'; ictx.lineWidth=1;
  for(const it of items){
    const sx=(it.rx-it.ry)*S+ox, sy=(it.rx+it.ry)*h - it.z*V + oy;
    if(it.plane){                                             // superficie del corte (rombo translúcido)
      ictx.beginPath(); ictx.moveTo(sx,sy-h); ictx.lineTo(sx+S,sy); ictx.lineTo(sx,sy+h); ictx.lineTo(sx-S,sy); ictx.closePath();
      ictx.fillStyle='rgba(95,215,255,0.32)'; ictx.fill();
      continue;
    }
    const below = it.z<zp;                                    // bajo el corte => tintado / textura atenuada
    if(topVis(it))   isoFace(ictx, it, 0, [[sx,sy-h],[sx+S,sy],[sx,sy+h],[sx-S,sy]], 1.10, below);
    if(leftVis(it))  isoFace(ictx, it, 4, [[sx-S,sy+V],[sx-S,sy],[sx,sy+h],[sx,sy+h+V]], 0.72, below);
    if(rightVis(it)) isoFace(ictx, it, 2, [[sx+S,sy+V],[sx,sy+h+V],[sx,sy+h],[sx+S,sy]], 0.55, below);
  }
}

// ================== Vista de edición 3D REAL (rotación libre) ==================
const view3d = { yaw:-2.42, pitch:0.62, zoom:1, panX:0, panY:0 };   // orbit + zoom rueda
let camFront=false, camSaved=null;   // bloqueo de proyección ortogonal frontal (yaw=pitch=0) + orientación libre guardada
let perspOn = localStorage.getItem('vf_persp')==='1';   // proyección cónica (perspectiva lineal): divide por la profundidad
view3d.persp = perspOn;                                 // el flag viaja en la vista (project3d lo lee), NO en modal/play
let _perspK=10; try{ const s=parseFloat(localStorage.getItem('vf_perspK')); if(isFinite(s)&&s>1) _perspK=s; }catch(e){}  // distancia focal = K·radio de profundidad; menor = perspectiva más dramática (ajustable con game.perspStrength)
// 6 caras del cubo unidad: vecino (culling), normal (backface), sombra base y 4 esquinas (dx,dy,dz)
const CUBE_FACES = [
  { nb:[0,0,1],  n:[0,0,1],  s:1.12, c:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, // +Z arriba
  { nb:[0,0,-1], n:[0,0,-1], s:0.40, c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }, // -Z abajo
  { nb:[1,0,0],  n:[1,0,0],  s:0.64, c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]] }, // +X
  { nb:[-1,0,0], n:[-1,0,0], s:0.82, c:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }, // -X
  { nb:[0,1,0],  n:[0,1,0],  s:0.52, c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]] }, // +Y
  { nb:[0,-1,0], n:[0,-1,0], s:0.92, c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }, // -Y
];
function resizeEdit3d(){
  const wrap=edit3d.parentElement;
  const dpr=Math.min(2, window.devicePixelRatio||1);
  const w=Math.max(200, wrap.clientWidth), h=Math.max(200, wrap.clientHeight);
  edit3d.width=Math.round(w*dpr); edit3d.height=Math.round(h*dpr);
}
// Construye la proyección para la rotación actual (auto-encuadre por el bbox)
// Recorte de cercanía: al pasar de CLIP_START el zoom, se pelan los voxels más próximos a la
// cámara para ver el INTERIOR. t=0 (nada) → 0.92 (casi todo, deja el fondo).
// _clipStart = zoom a partir del cual empieza el pelado (ajustable en vivo con `game.nearClip`);
// CLIP_SPAN = ancho del ramp (de 0 a 0.92). Subir _clipStart => los voxels desaparecen MÁS TARDE.
let _clipStart=40; try{ const s=parseFloat(localStorage.getItem('vf_clipStart')); if(isFinite(s)&&s>=0) _clipStart=s; }catch(e){}
const CLIP_SPAN=12;
function nearClipT(zoom){ return Math.max(0, Math.min(0.92, ((zoom||1)-_clipStart)/CLIP_SPAN)); }
function project3d(W,H,view){
  view=view||view3d;
  const {yaw,pitch}=view;
  const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
  const vp=voxParsed(), list=vp.list;                       // lista parseada cacheada (sin splits)
  const {minx,maxx,miny,maxy,minz,maxz}=vp.box;
  const cx=(minx+maxx+1)/2, cyc=(miny+maxy+1)/2, cz=(minz+maxz+1)/2;
  // punto rotado -> [u(derecha), depth(hacia el fondo), w(arriba)]
  const rotP=(x,y,z)=>{
    const X=x-cx, Y=y-cyc, Z=z-cz;
    const x1=X*cy - Y*sy, y1=X*sy + Y*cy;
    return [-x1, y1*cp - Z*sp, y1*sp + Z*cp];   // -x1: espejo horizontal para coincidir con la miniatura iso
  };
  // componente de profundidad de una dirección (para backface culling)
  const depthDir=(nx,ny,nz)=>(nx*sy + ny*cy)*cp - nz*sp;
  // escala/centro por la SILUETA REAL de los voxels (no las esquinas de la caja, que reservan
  // hueco donde no hay geometría). Recorre los voxels de los BORDES del bbox (suficiente para el
  // contorno) proyectando sus 8 vértices; pad = medio voxel de margen.
  // BUG-P3D1: la silueta NO depende de voxRev => se cachea por (modelo, caja, orientación); así cada
  // trazo del pincel no re-recorre la corteza (8×rotP por voxel) y el encuadre queda ESTABLE al pintar.
  let minu,maxu,minv,maxv,mind,maxd;
  const silK=mapId(state.voxels)+'|'+minx+','+maxx+','+miny+','+maxy+','+minz+','+maxz+'|'+view.yaw.toFixed(4)+','+view.pitch.toFixed(4);
  if(_silKey===silK){ minu=_silUV[0]; maxu=_silUV[1]; minv=_silUV[2]; maxv=_silUV[3]; mind=_silUV[4]; maxd=_silUV[5]; }
  else {
    minu=1e9;maxu=-1e9;minv=1e9;maxv=-1e9;mind=1e9;maxd=-1e9;
    const eat=(x,y,z)=>{ const [u,dd,w]=rotP(x,y,z), v=-w; if(u<minu)minu=u; if(u>maxu)maxu=u; if(v<minv)minv=v; if(v>maxv)maxv=v; if(dd<mind)mind=dd; if(dd>maxd)maxd=dd; };
    for(const p of list){
      if(p.x!==minx&&p.x!==maxx&&p.y!==miny&&p.y!==maxy&&p.z!==minz&&p.z!==maxz) continue;  // solo la corteza del bbox
      eat(p.x,p.y,p.z); eat(p.x+1,p.y,p.z); eat(p.x,p.y+1,p.z); eat(p.x+1,p.y+1,p.z);
      eat(p.x,p.y,p.z+1); eat(p.x+1,p.y,p.z+1); eat(p.x,p.y+1,p.z+1); eat(p.x+1,p.y+1,p.z+1);
    }
    _silKey=silK; _silUV=[minu,maxu,minv,maxv,mind,maxd];
  }
  const fx=view.fillX||0.92, fy=view.fillY||0.92;    // >1 en un eje = permite que las esquinas vacías se salgan
  const S=Math.min(W*fx/((maxu-minu)||1), H*fy/((maxv-minv)||1))*(view.zoom||1);
  const ox=W/2-((minu+maxu)/2)*S+(view.panX||0), oy=H/2-((minv+maxv)/2)*S+(view.panY||0);
  // Proyección cónica (perspectiva lineal): solo en la edición 3D real (view===view3d). Divide cada
  // vértice por su profundidad (PD/(PD+d)) => lo cercano crece, lo lejano mengua hacia un punto de fuga
  // en el centro del modelo. El encaje absorbe la magnificación máxima (Sp) para que nada se salga del
  // cuadro; con vista Frontal (yaw=pitch=0) da la perspectiva de 1 punto clásica. Coste: 1 división/vértice.
  const usePersp = view.persp===true;
  let screen;
  if(usePersp){
    const Rd=Math.max(maxd,-mind,1e-6), PD=_perspK*Rd, near=PD/(PD+mind);    // near = magnificación del vértice más cercano
    const mau=Math.max(Math.abs(minu),Math.abs(maxu))||1, mav=Math.max(Math.abs(minv),Math.abs(maxv))||1;
    const Sp=Math.min(W*fx/(2*mau*near), H*fy/(2*mav*near))*(view.zoom||1);   // escala que hace caber el modelo ya magnificado
    const oxp=W/2+(view.panX||0), oyp=H/2+(view.panY||0);                     // punto de fuga = centro del modelo (0,0) al centro del lienzo
    screen=(x,y,z)=>{ const [u,dd,w]=rotP(x,y,z), q=PD/(PD+dd); return [u*q*Sp+oxp, -w*q*Sp+oyp]; };
    _perspProj={PD,Sp,oxp,oyp};
  } else { _perspProj=null;
    screen=(x,y,z)=>{ const [u,,w]=rotP(x,y,z); return [u*S+ox, -w*S+oy]; };
  }
  const front=CUBE_FACES.map(f=>depthDir(f.n[0],f.n[1],f.n[2])<0);   // normal hacia cámara
  for(const v of list){ const r=rotP(v.x+0.5,v.y+0.5,v.z+0.5); v.d=r[1]; v.u=r[0]; v.w=r[2]; }  // profundidad + coords rotadas del centro
  // recorte de cercanía por zoom: quita los voxels con menor d (los más cerca) → se ve el interior
  const t=nearClipT(view.zoom);
  let vis=list;
  if(t>0){
    let dmin=1e9,dmax=-1e9; for(const v of list){ if(v.d<dmin)dmin=v.d; if(v.d>dmax)dmax=v.d; }
    const cut=dmin + t*(dmax-dmin);
    vis=list.filter(v=>v.d>=cut);
    if(!vis.length) vis=[list.reduce((a,b)=>b.d>a.d?b:a)];             // deja al menos el más al fondo
  }
  // lejos → cerca (orden pintor). Modelos grandes: counting sort O(n) por buckets de profundidad
  // (bucket ≪ 1 voxel => mismo resultado visual que el sort exacto, ~10× más rápido).
  if(vis.length>BIG3D){
    let dmin=1e9,dmax=-1e9; for(const v of vis){ if(v.d<dmin)dmin=v.d; if(v.d>dmax)dmax=v.d; }
    const NB=4096, sc=(NB-1)/((dmax-dmin)||1), cnt=new Uint32Array(NB+1);
    for(const v of vis) cnt[NB-1-((v.d-dmin)*sc|0)]++;                // invertido: mayor d (lejos) primero
    for(let i=1;i<NB;i++) cnt[i]+=cnt[i-1];
    const out=new Array(vis.length);
    for(let i=vis.length-1;i>=0;i--){ const v=vis[i]; out[--cnt[NB-1-((v.d-dmin)*sc|0)]]=v; }
    vis=out;
  } else {
    // NO ordenar `list` in situ: cuando vis===list es el MISMO array que la caché `_vl`, y sort()
    // lo reordena rompiendo `_vlIdx` (key->índice) => el siguiente setVoxel parchea el slot equivocado
    // y se pierden/duplican voxels (huecos que solo recargar arreglaba). Copiamos si aliasa la caché.
    if(vis===list) vis=vis.slice();
    vis.sort((a,b)=>b.d-a.d);
  }
  let occupied;
  if(t>0 && !_fast3d){ occupied=new Set(vis.map(v=>v.x+','+v.y+','+v.z)); } // con recorte: solo lo visible
  else {                                                              // sin recorte (o pincel): cacheado por revisión
    // BUG-P3D1: durante el pincel se usa la ocupación COMPLETA aunque haya recorte de cercanía
    // (construir un Set de strings de lo visible CADA frame era O(modelo)); las "tapas" del corte
    // pueden desaparecer durante el arrastre y se restauran al soltar.
    if(_occKey!==voxKey()){ _occKey=voxKey(); _occSet=new Set(state.voxels.keys()); }
    occupied=_occSet;
  }
  // CULLING POR VISOR: no se dibujan los voxels cuyo cubo cae entero fuera del lienzo (centro fuera
  // con margen ~1 voxel; la media diagonal proyectada de un cubo unidad es ≤0.87·S, así que S basta
  // y no recorta cubos a medio salir). `occupied` se deja COMPLETO => el culling de caras no cambia
  // (no afloran caras interiores en el borde). Reduce los voxels dibujados al ACERCAR el zoom.
  const mrg=(_perspProj?_perspProj.Sp:S)+2;
  let drawn=vis;
  if(vis.length){
    const d=[];
    const pp=_perspProj;
    for(const v of vis){ let sx,sy;
      if(pp){ const q=pp.PD/(pp.PD+v.d); sx=v.u*q*pp.Sp+pp.oxp; sy=-v.w*q*pp.Sp+pp.oyp; }
      else { sx=v.u*S+ox; sy=-v.w*S+oy; }
      if(sx>=-mrg && sx<=W+mrg && sy>=-mrg && sy<=H+mrg) d.push(v); }
    drawn=d;
  }
  _voxDrawnLast=drawn.length;
  const depthOf=(x,y,z)=>rotP(x,y,z)[1];                             // profundidad (para componer el jugador)
  return {screen,S,ox,oy,list:drawn,occupied,front,depthOf,drawn:drawn.length,total:list.length};
}
let _voxDrawnLast=0;   // voxels dibujados (dentro del visor) en el último project3d
// ¿cara fi del voxel v visible? front-facing Y sin vecino delante
function faceVis3d(g,v,fi){
  if(!g.front[fi]) return false;
  const f=CUBE_FACES[fi];
  return !g.occupied.has((v.x+f.nb[0])+','+(v.y+f.nb[1])+','+(v.z+f.nb[2]));
}
// En modo aislado, culling y picking solo contra la ocupación SÓLIDA (capas visibles)
const occIso = g => (isoOn() && g.solidOcc) ? g.solidOcc : g.occupied;
function faceVisIso(g,v,fi){
  if(!g.front[fi]) return false;
  const f=CUBE_FACES[fi];
  return !occIso(g).has((v.x+f.nb[0])+','+(v.y+f.nb[1])+','+(v.z+f.nb[2]));
}
function facePoly3d(g,v,fi){
  const c=CUBE_FACES[fi].c;
  return [ g.screen(v.x+c[0][0],v.y+c[0][1],v.z+c[0][2]),
           g.screen(v.x+c[1][0],v.y+c[1][1],v.z+c[1][2]),
           g.screen(v.x+c[2][0],v.y+c[2][1],v.z+c[2][2]),
           g.screen(v.x+c[3][0],v.y+c[3][1],v.z+c[3][2]) ];
}
function fillPoly3d(pts){
  e3ctx.beginPath(); e3ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<4;i++) e3ctx.lineTo(pts[i][0],pts[i][1]); e3ctx.closePath();
}

// ===== Texturas en 3D: proyección ortográfica de cada cara =====
// Cada cara fi de un voxel texturizado se rellena con la vista del objeto-textura desde su normal:
// el voxel MÁS EXTERNO en esa dirección da el color de cada píxel (verde arriba, tierra a los lados…).
const texFaceCache=new Map();   // clave -> {faces:[canvas×6], avg:[hex×6]}
function buildTexFaces(def){
  const N=texSize(def.size), vox=def.voxels||{};   // size puede venir como {x,y,z}; texSize lo normaliza a un entero cúbico
  const faces=[], avg=[];
  for(let fi=0; fi<6; fi++){
    const f=CUBE_FACES[fi], c=f.c, n=f.n;
    const du=[c[1][0]-c[0][0], c[1][1]-c[0][1], c[1][2]-c[0][2]];   // eje imagen-col (p1-p0)
    const dv=[c[3][0]-c[0][0], c[3][1]-c[0][1], c[3][2]-c[0][2]];   // eje imagen-fila (p3-p0)
    const na = n[0]?0 : n[1]?1 : 2;                                 // eje normal
    const dir = (n[0]+n[1]+n[2])>0 ? -1 : 1;                        // marcha hacia el interior
    const start = dir<0 ? N-1 : 0;
    const cv=document.createElement('canvas'); cv.width=cv.height=N;
    const cx=cv.getContext('2d'); const img=cx.createImageData(N,N); const d=img.data;
    let Rs=0,Gs=0,Bs=0,ns=0;
    for(let row=0; row<N; row++) for(let col=0; col<N; col++){
      const uu=(col+0.5)/N, vv=(row+0.5)/N;
      let vx=Math.min(N-1,Math.max(0,Math.floor((c[0][0]+uu*du[0]+vv*dv[0])*N)));
      let vy=Math.min(N-1,Math.max(0,Math.floor((c[0][1]+uu*du[1]+vv*dv[1])*N)));
      let vz=Math.min(N-1,Math.max(0,Math.floor((c[0][2]+uu*du[2]+vv*dv[2])*N)));
      let hex=null;
      for(let k=0;k<N;k++){                                         // busca el primer voxel opaco por la normal
        const idx=start+dir*k;
        if(na===0) vx=idx; else if(na===1) vy=idx; else vz=idx;
        const cc=vox[vx+','+vy+','+vz];
        if(cc){ hex=cc; break; }
      }
      const o=(row*N+col)*4;
      if(hex && hex[0]==='*') hex=hex.slice(1);   // ignora '*' emisivo al hornear la textura
      if(hex && hex[0]==='#'){ const val=parseInt(hex.slice(1,7),16); d[o]=val>>16&255; d[o+1]=val>>8&255; d[o+2]=val&255; d[o+3]=255; Rs+=d[o]; Gs+=d[o+1]; Bs+=d[o+2]; ns++; }
      else d[o+3]=0;
    }
    cx.putImageData(img,0,0);
    faces.push(cv);
    avg.push(ns ? '#'+((1<<24)+((Rs/ns&255)<<16)+((Gs/ns&255)<<8)+(Bs/ns&255)).toString(16).slice(1) : '#8a8f94');
  }
  return {faces, avg};
}
function getTexFaces(key){
  let fc=texFaceCache.get(key);
  if(!fc){ const def=texDefs.get(key); if(!def){ getTexDef(key).then(()=>{ e3baseKey=''; render&&render(); }).catch(()=>{}); return null; } fc=buildTexFaces(def); texFaceCache.set(key,fc); }
  return fc;
}
// Pinta una cara texturizada: mapea el cuadrado unidad de la textura al paralelogramo de la cara.
function drawTexFace(ctx, faceImg, s, p){
  const TS=faceImg.width;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(p[0][0],p[0][1]); for(let i=1;i<4;i++) ctx.lineTo(p[i][0],p[i][1]); ctx.closePath(); ctx.clip();
  ctx.imageSmoothingEnabled=false;
  ctx.setTransform((p[1][0]-p[0][0])/TS,(p[1][1]-p[0][1])/TS,(p[3][0]-p[0][0])/TS,(p[3][1]-p[0][1])/TS,p[0][0],p[0][1]);
  ctx.drawImage(faceImg,0,0);
  if(s<1){ ctx.fillStyle='rgba(0,0,0,'+(1-s)+')'; ctx.fillRect(0,0,TS,TS); }      // tinte de sombra por orientación
  else if(s>1){ ctx.fillStyle='rgba(255,255,255,'+Math.min(1,s-1)+')'; ctx.fillRect(0,0,TS,TS); }
  ctx.restore();
}
// Rellena la cara actual (path ya construido): textura si isTex, si no color plano sombreado.
// SIEMPRE traza el borde: con rejilla=negro (costura visible); sin rejilla=color de la propia cara,
// que tapa el hueco de antialias entre caras adyacentes sin dibujar una malla.
function paintFace3d(ctx, v, fi, p, s, seams=true){
  if(isTex(v.c)){ const fc=getTexFaces(texKeyOf(v.c)); if(fc){
    drawTexFace(ctx, fc.faces[fi], s, p);
    ctx.strokeStyle = seams ? 'rgba(0,0,0,0.18)' : shade(fc.avg[fi], s); ctx.stroke(); return;
  } }
  const col=shade(isTex(v.c)?voxFill(v.c):v.c, s);
  ctx.fillStyle=col; ctx.fill();
  ctx.strokeStyle = seams ? 'rgba(0,0,0,0.18)' : col; ctx.stroke();
}
// Color sólido (uint32) para el rasterizador: cara media de la textura, o color plano.
function rasterCol(c, fi, s){
  if(isTex(c)){ const fc=getTexFaces(texKeyOf(c)); return col32(fc?fc.avg[fi]:texRepr(texKeyOf(c)), s); }
  return col32(c, s);
}
// Sombra al suelo (vista grande): cada voxel proyecta su huella sobre el plano del suelo (z=minz),
// desplazada según su altura (sol alto ⇒ estela corta). Se rasteriza a una máscara para NO apilar
// alfas y luego se compone una sola vez como una mancha negra translúcida.
const GSHADOW_DX=0.55, GSHADOW_DY=0.35, GSHADOW_LEN=0.9;   // dirección del sol en el suelo + estela por unidad de altura
function groundShadowMask(W, H, g){
  let minz=Infinity, maxz=-Infinity;
  for(const v of g.list){ if(v.z<minz)minz=v.z; if(v.z>maxz)maxz=v.z; }
  if(minz>maxz) return null;
  const zg=minz;                                           // plano del suelo = base del modelo
  if(!groundShadowMask._m || groundShadowMask._m.length!==W*H) groundShadowMask._m=new Uint8Array(W*H);
  const m=groundShadowMask._m; m.fill(0);
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;
  for(const v of g.list){
    const off=(v.z-zg)*GSHADOW_LEN, sx=v.x+off*GSHADOW_DX, sy=v.y+off*GSHADOW_DY;
    const p0=g.screen(sx,sy,zg), p1=g.screen(sx+1,sy,zg), p2=g.screen(sx+1,sy+1,zg), p3=g.screen(sx,sy+1,zg);
    for(const q of [p0,p1,p2,p3]){ if(q[0]<bx0)bx0=q[0]; if(q[0]>bx1)bx1=q[0]; if(q[1]<by0)by0=q[1]; if(q[1]>by1)by1=q[1]; }
    scanQuad(m,W,H,1, p0[0],p0[1],p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);
  }
  if(bx1<bx0) return null;
  const cx0=Math.max(0,Math.floor(bx0)), cy0=Math.max(0,Math.floor(by0));
  const cw=Math.max(1,Math.min(W-cx0, Math.ceil(bx1)-cx0+1)), chh=Math.max(1,Math.min(H-cy0, Math.ceil(by1)-cy0+1));
  return {m,cx0,cy0,cw,chh,W};
}
// Ruta canvas (paintFace3d): la sombra ya vive sobre el fondo => mancha negra translúcida por drawImage.
function blitShadowDecal(ctx, sh){
  const {m,cx0,cy0,cw,chh,W}=sh;
  const cvs=blitShadowDecal._cv || (blitShadowDecal._cv=document.createElement('canvas'));
  cvs.width=cw; cvs.height=chh;
  const octx=cvs.getContext('2d'), img=octx.createImageData(cw,chh), ib=new Uint32Array(img.data.buffer);
  for(let y=0;y<chh;y++) for(let x=0;x<cw;x++) if(m[(cy0+y)*W+(cx0+x)]) ib[y*cw+x]=(92<<24)|0x00080808;
  octx.putImageData(img,0,0);
  ctx.drawImage(cvs,cx0,cy0);
}
// Ruta raster (putImageData reemplaza, no compone): mezclamos la sombra dentro del buffer del fondo.
function blendShadowBuf(buf, sh){
  const {m,cx0,cy0,cw,chh,W}=sh, a=92/255, ia=1-a;
  for(let y=0;y<chh;y++) for(let x=0;x<cw;x++){
    const i=(cy0+y)*W+(cx0+x); if(!m[i]) continue;
    const p=buf[i], r=p&255, gg=(p>>8)&255, b=(p>>16)&255;
    buf[i]=(255<<24)|((((b*ia+8*a)|0)&255)<<16)|((((gg*ia+8*a)|0)&255)<<8)|(((r*ia+8*a)|0)&255);
  }
}
// Render 3D libre (rotación yaw/pitch) a cualquier ctx — usado por la vista grande.
// seams=true: caras con borde (rejilla); seams=false: rasterizado sin AA (fundido, sin costuras).
function renderFree3d(ctx, W, H, view, seams, skyColor, shadowOn){
  ctx.clearRect(0,0,W,H);
  if(state.voxels.size===0){
    if(skyColor){ ctx.fillStyle=skyColor; ctx.fillRect(0,0,W,H); }
    ctx.fillStyle='#4a5266'; ctx.font='14px system-ui'; ctx.textAlign='center';
    ctx.fillText('Sin voxels', W/2, H/2); return;
  }
  const g=project3d(W,H,view);
  // Cielo: telón de dos tonos separados por el horizonte. La proporción cielo/tierra la fija el ángulo de cámara (pitch):
  // cenital (pitch→+) toda tierra; desde abajo (pitch→−) todo cielo; de lado (pitch 0) horizonte al centro. Le sumamos
  // el paneo vertical (panY) para que el horizonte SIGA al objeto al arrastrar (la tierra está pegada al objeto en z=0).
  // Coste nulo: 2 fillRect (path) o 2 typed-fill (raster).
  const hy = skyColor==null ? 0 : Math.max(0, Math.min(H, Math.round(H/2*(1-Math.sin(view.pitch)) + (view.panY||0))));
  // Path por cara si hay rejilla O si hay texturas (que necesitan detalle); si no, raster plano rápido.
  const hasTex = g.list.some(v=>isTex(v.c));
  if(g.list.length<=BIG3D && (seams || hasTex)){     // con modelos grandes, SIEMPRE raster (velocidad)
    if(skyColor){ ctx.fillStyle=SKY_GROUND; ctx.fillRect(0,hy,W,H-hy); ctx.fillStyle=skyColor; ctx.fillRect(0,0,W,hy); }
    if(shadowOn){ const sh=groundShadowMask(W,H,g); if(sh) blitShadowDecal(ctx,sh); }  // sombra al suelo bajo los voxels
    ctx.lineJoin='round'; ctx.lineWidth=1; ctx.strokeStyle='rgba(0,0,0,0.18)';
    for(const v of g.list) for(let fi=0; fi<6; fi++){
      if(!faceVis3d(g,v,fi)) continue;
      const p=facePoly3d(g,v,fi);
      ctx.beginPath(); ctx.moveTo(p[0][0],p[0][1]); for(let i=1;i<4;i++) ctx.lineTo(p[i][0],p[i][1]); ctx.closePath();
      paintFace3d(ctx, v, fi, p, CUBE_FACES[fi].s, seams);
    }
  } else {
    const img=getRaster(ctx,W,H), buf=new Uint32Array(img.data.buffer);
    if(skyColor){ buf.fill(col32(skyColor,1), 0, hy*W); buf.fill(col32(SKY_GROUND,1), hy*W, W*H); }  // fondo raster: cielo sobre el horizonte, tierra debajo (putImageData reemplaza, no compone)
    else buf.fill(0);                                // sin cielo => transparente (reutilizado)
    if(shadowOn){ const sh=groundShadowMask(W,H,g); if(sh) blendShadowBuf(buf,sh); }  // sombra al suelo bajo los voxels
    for(const v of g.list) for(let fi=0; fi<6; fi++){
      if(!faceVis3d(g,v,fi)) continue;
      const p=facePoly3d(g,v,fi);
      scanQuad(buf,W,H, rasterCol(v.c,fi,CUBE_FACES[fi].s), p[0][0],p[0][1],p[1][0],p[1][1],p[2][0],p[2][1],p[3][0],p[3][1]);
    }
    ctx.putImageData(img,0,0);
  }
}
// Escena 3D SIN overlays. Con modelos grandes usa el rasterizador sin AA (sin rejilla) — mucho
// más rápido que un path+stroke por cara. Devuelve la proyección usada.
let _fast3d=false;    // BUG-P3D1: pincel activo => project3d usa la ocupación COMPLETA cacheada (evita un Set de strings por frame)
function renderEdit3dScene(ctx,W,H,view){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0e1119'; ctx.fillRect(0,0,W,H);
  const g=project3d(W,H,view);
  // modo aislar: voxels sólidos (isoSolid) con culling solo contra sólidos; el resto fantasma
  const iso=isoOn();
  let solidOcc=null;
  if(iso){ solidOcc=new Set(); for(const v of g.list) if(isoSolid(v.z)) solidOcc.add(v.x+','+v.y+','+v.z); }
  g.solidOcc=solidOcc;                              // para picking/hover/selección en modo aislado
  if(!iso && g.list.length>BIG3D){                  // modelo grande => raster sin costuras (el pincel rasteriza aparte en drawEdit3d)
    const img=getRaster(ctx,W,H), buf=new Uint32Array(img.data.buffer);
    buf.fill(col32('#0e1119',1));
    for(const v of g.list) for(let fi=0; fi<6; fi++){
      if(!faceVis3d(g,v,fi)) continue;
      const p=facePoly3d(g,v,fi);
      scanQuad(buf,W,H, rasterCol(v.c,fi,CUBE_FACES[fi].s), p[0][0],p[0][1],p[1][0],p[1][1],p[2][0],p[2][1],p[3][0],p[3][1]);
    }
    ctx.putImageData(img,0,0);
    return g;
  }
  ctx.lineJoin='round'; ctx.lineWidth=1; ctx.strokeStyle='rgba(0,0,0,0.18)';
  for(const v of g.list){
    const ghost = iso && !isoSolid(v.z);
    ctx.globalAlpha = ghost ? 0.12 : 1;
    for(let fi=0; fi<6; fi++){
      if(!g.front[fi]) continue;
      const f=CUBE_FACES[fi];
      const occ = (iso && !ghost) ? solidOcc : g.occupied;
      if(occ.has((v.x+f.nb[0])+','+(v.y+f.nb[1])+','+(v.z+f.nb[2]))) continue;
      const p=facePoly3d(g,v,fi);
      ctx.beginPath(); ctx.moveTo(p[0][0],p[0][1]);
      for(let i=1;i<4;i++) ctx.lineTo(p[i][0],p[i][1]); ctx.closePath();
      paintFace3d(ctx, v, fi, p, CUBE_FACES[fi].s);
    }
  }
  ctx.globalAlpha=1;
  return g;
}
// Caché de la escena: el hover/selección se dibujan encima de un blit (no se re-renderiza todo).
const e3base=document.createElement('canvas'); let e3baseKey='';
// FPS de la vista 3D: repintados por segundo en una ventana de 500 ms (no 1/Δt instantáneo, que se
// dispara en ráfagas de pointermove sub-ms). En reposo el medidor conserva el último valor; tras una
// pausa (>600 ms sin repintar) se reinicia la ventana para no arrastrar un promedio viejo.
let _e3fpsCount=0, _e3fpsWinT=0, _e3fpsLastT=0, _e3fpsShown=0;
function e3fpsTick(){
  const t=performance.now();
  if(_e3fpsLastT && t-_e3fpsLastT>600){ _e3fpsWinT=t; _e3fpsCount=0; }   // reanudar tras reposo
  _e3fpsLastT=t;
  if(!_e3fpsWinT) _e3fpsWinT=t;
  _e3fpsCount++;
  const dt=t-_e3fpsWinT;
  if(dt>=500){ _e3fpsShown=Math.round(_e3fpsCount*1000/dt); _e3fpsCount=0; _e3fpsWinT=t;
    if(window.game) window.game.fps=_e3fpsShown;
    const el=$('#e3-fps'); if(el) el.textContent=_e3fpsShown+' fps'; }
}
function drawEdit3d(){
  e3fpsTick();
  const W=edit3d.width, H=edit3d.height;
  if(state.voxels.size===0){
    e3ctx.clearRect(0,0,W,H); e3ctx.fillStyle='#0e1119'; e3ctx.fillRect(0,0,W,H);
    e3ctx.fillStyle='#4a5266'; e3ctx.font='14px system-ui'; e3ctx.textAlign='center';
    e3ctx.fillText('Sin voxels', W/2, H/2); g3d=null; _voxDrawnLast=0; updateVoxMeter(); return;
  }
  // BUG-P3D1 (3ª ronda): al pintar, UNA sola proyección por frame (resolución REAL, la misma que usa
  // el picking) y raster rápido a ½ escala desde ESA geometría — sin segunda proyección, sin
  // fill+stroke por cara y sin reconstruir cachés (setVoxel las parchea en O(1)).
  const paintDrag=paint3d;
  const interact=(orbiting||pan3d||paintDrag);
  const key=[voxKey(),view3d.yaw.toFixed(4),view3d.pitch.toFixed(4),view3d.zoom.toFixed(3),
             Math.round(view3d.panX),Math.round(view3d.panY),W,H,isolateMode,isoOn()?state.layer:-1,interact?1:0,paintDrag?1:0,
             view3d.persp?1:0,_perspK].join('|');
  if(key!==e3baseKey){
    e3baseKey=key;
    if(paintDrag && !isoOn()){
      _fast3d=true; g3d=project3d(W,H,view3d); _fast3d=false;   // ocupación completa cacheada (ver project3d)
      const w2=W>>1, h2=H>>1;
      if(e3base.width!==w2||e3base.height!==h2){ e3base.width=w2; e3base.height=h2; }
      const bctx=e3base.getContext('2d');
      const img=getRaster(bctx,w2,h2), buf=new Uint32Array(img.data.buffer);
      buf.fill(col32('#0e1119',1));
      for(const v of g3d.list) for(let fi=0; fi<6; fi++){
        if(!faceVis3d(g3d,v,fi)) continue;
        const p=facePoly3d(g3d,v,fi);
        scanQuad(buf,w2,h2, rasterCol(v.c,fi,CUBE_FACES[fi].s), p[0][0]*.5,p[0][1]*.5,p[1][0]*.5,p[1][1]*.5,p[2][0]*.5,p[2][1]*.5,p[3][0]*.5,p[3][1]*.5);
      }
      bctx.putImageData(img,0,0);
    } else if(interact){
      const w2=W>>1, h2=H>>1;
      if(e3base.width!==w2||e3base.height!==h2){ e3base.width=w2; e3base.height=h2; }
      const half={yaw:view3d.yaw,pitch:view3d.pitch,zoom:view3d.zoom,panX:view3d.panX/2,panY:view3d.panY/2,persp:view3d.persp};
      renderEdit3dScene(e3base.getContext('2d'), w2,h2, half);
      if(paintDrag) g3d=project3d(W,H,view3d);       // pincel en modo aislar: camino antiguo (poco frecuente)
    } else {
      if(e3base.width!==W||e3base.height!==H){ e3base.width=W; e3base.height=H; }
      g3d=renderEdit3dScene(e3base.getContext('2d'), W,H, view3d);
    }
  }
  e3ctx.clearRect(0,0,W,H);
  e3ctx.imageSmoothingEnabled=false;
  e3ctx.drawImage(e3base,0,0,W,H);
  if(!interact){                                     // overlays solo fuera del arrastre
    if(selection.size) drawSelection3d();
    if(hover3d) drawHover3d();
    if(state.tool==='build' && buildGhost) drawBuildGhost();
    if(pasting) drawPasteGhost3d();
  }
  updateVoxMeter();                                  // voxels dibujados en este frame
}
function updateVoxMeter(){
  const el=$('#e3-vox'); if(el) el.textContent=_voxDrawnLast+' vox';
  if(window.game) window.game.voxels=_voxDrawnLast;
}
// BUG-P3D1: coalesce varios pointermove en UN repintado por frame (antes cada evento llamaba a
// drawEdit3d síncrono => N renders/frame). El medidor #e3-fps pasa a contar frames reales.
let _e3rafPending=false;
function scheduleEdit3d(){ if(_e3rafPending) return; _e3rafPending=true;
  requestAnimationFrame(()=>{ _e3rafPending=false; if(mode==='3d') drawEdit3d(); }); }
// Selección: RELLENA cada voxel (tinte cian) + borde por voxel → se distingue uno a uno.
function drawSelection3d(){
  const g=g3d; if(!g) return;
  e3ctx.save(); e3ctx.lineJoin='round'; e3ctx.lineWidth=Math.max(1,g.S*0.05);
  e3ctx.strokeStyle='rgba(200,245,255,0.95)';
  const fills=['rgba(95,215,255,0.6)','rgba(40,150,205,0.6)','rgba(60,175,225,0.6)','rgba(75,190,235,0.6)','rgba(50,160,215,0.6)','rgba(85,205,250,0.6)'];
  for(const key of selection){
    if(!g.occupied.has(key)) continue;
    const [x,y,z]=key.split(',').map(Number); const v={x,y,z};
    if(isoOn() && !isoSolid(z)) continue;          // no resaltar selección fantasma
    for(let fi=0; fi<6; fi++){ if(!faceVisIso(g,v,fi)) continue;
      fillPoly3d(facePoly3d(g,v,fi)); e3ctx.fillStyle=fills[fi]; e3ctx.fill(); e3ctx.stroke(); }
  }
  e3ctx.restore();
}
function drawHover3d(){
  const g=g3d, v=hover3d; if(!g||!v) return;
  e3ctx.save(); e3ctx.strokeStyle='#ffe23a'; e3ctx.lineWidth=Math.max(2,g.S*0.12);
  e3ctx.lineJoin='round'; e3ctx.shadowColor='#ffe23a'; e3ctx.shadowBlur=14;
  for(let fi=0; fi<6; fi++){ if(!faceVisIso(g,v,fi)) continue; fillPoly3d(facePoly3d(g,v,fi)); e3ctx.stroke(); }
  e3ctx.restore();
}
// punto dentro de un cuadrilátero convexo (lista de [x,y])
function inQuad(px,py,pts){
  let sign=0;
  for(let i=0;i<4;i++){
    const [xi,yi]=pts[i], [xj,yj]=pts[(i+1)&3];
    const cross=(xj-xi)*(py-yi)-(yj-yi)*(px-xi);
    if(cross!==0){ const s=cross>0?1:-1; if(!sign) sign=s; else if(s!==sign) return false; }
  }
  return true;
}
// voxel bajo el cursor: el más al frente cuya cara visible contiene el punto
// (en modo aislado, ignora los voxels fantasma de otras capas)
function pickVoxel3d(px,py,g){
  g=g||g3d; if(!g) return null;                  // `g` opcional: geometría congelada durante un arrastre (borrar/construir)
  const iso=isoOn();
  for(let i=g.list.length-1;i>=0;i--){          // de cerca a lejos
    const v=g.list[i];
    if(iso && !isoSolid(v.z)) continue;          // no elegir voxels fantasma
    for(let fi=0; fi<6; fi++){ if(!faceVisIso(g,v,fi)) continue;
      if(inQuad(px,py,facePoly3d(g,v,fi))) return v; }
  }
  return null;
}
// Como pickVoxel3d, pero devuelve también la CARA clicada: {x,y,z,fi} (fi = índice en CUBE_FACES).
// `g` opcional: geometría contra la que trazar (por defecto la viva `g3d`; durante un arrastre de
// Construir se pasa la CONGELADA para no apilar sobre los voxels recién creados en el mismo gesto).
function pickFace3d(px,py,g){
  g=g||g3d; if(!g) return null;
  const iso=isoOn();
  for(let i=g.list.length-1;i>=0;i--){
    const v=g.list[i];
    if(iso && !isoSolid(v.z)) continue;
    for(let fi=0; fi<6; fi++){ if(!faceVisIso(g,v,fi)) continue;
      if(inQuad(px,py,facePoly3d(g,v,fi))) return {x:v.x,y:v.y,z:v.z,fi}; }
  }
  return null;
}
// Celda vacía adyacente a la cara bajo el cursor (dentro de la rejilla) donde "Construir" pondría el voxel.
function buildTargetAt(e,g){
  const {px,py}=edit3dPx(e); const f=pickFace3d(px,py,g); if(!f) return null;
  const nb=CUBE_FACES[f.fi].nb, x=f.x+nb[0], y=f.y+nb[1], z=f.z+nb[2];
  if(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ) return null;   // no salir de la rejilla
  if(getVoxel(x,y,z)!==undefined) return null;          // ya ocupado (incluye los que acabas de poner)
  return {x,y,z};
}
// Congela la geometría 3D al empezar un arrastre: misma proyección (la vista no cambia durante el gesto)
// pero con `list`/`occupied` COPIADOS. Así el trazado ignora los cambios hechos EN el gesto y sigue
// apoyándose en la superficie original: Construir pinta una fila plana (no una torre) y Borrar arrasa
// solo la superficie visible al empezar (no cava hacia dentro exponiendo capas de detrás).
function snapshotGeom3d(){
  const g=g3d; if(!g) return null;
  return Object.assign({}, g, {
    list: g.list.slice(),
    occupied: new Set(g.occupied),
    solidOcc: g.solidOcc ? new Set(g.solidOcc) : g.solidOcc
  });
}
// Fantasma verde del hueco donde caerá el próximo voxel de Construir.
function drawBuildGhost(){
  const g=g3d, v=buildGhost; if(!g||!v) return;
  e3ctx.save(); e3ctx.lineJoin='round';
  e3ctx.strokeStyle='#8fe36a'; e3ctx.lineWidth=Math.max(2,g.S*0.10);
  e3ctx.fillStyle='rgba(120,220,90,0.28)';
  for(let fi=0; fi<6; fi++){ if(!faceVisIso(g,v,fi)) continue; fillPoly3d(facePoly3d(g,v,fi)); e3ctx.fill(); e3ctx.stroke(); }
  e3ctx.restore();
}
// Fantasma del pegado (Ctrl+V) en la vista 3D: dibuja el cúmulo del portapapeles anclado en la celda apuntada,
// culleando las caras internas al propio cúmulo (occ) y las ocultas por el modelo (faceVisIso).
function drawPasteGhost3d(){
  const g=g3d; if(!g||!pasting||!pasteHover3d) return;
  const ox=pasteHover3d.x-pasting.gx, oy=pasteHover3d.y-pasting.gy, oz=pasteHover3d.z;
  const occ=new Set();
  for(const cel of pasting.cells) occ.add((ox+cel.dx)+','+(oy+cel.dy)+','+(oz+cel.dz));
  e3ctx.save(); e3ctx.lineJoin='round';
  e3ctx.strokeStyle='#6ad0ff'; e3ctx.lineWidth=Math.max(1.5,g.S*0.07);
  e3ctx.fillStyle='rgba(90,190,255,0.26)';
  for(const cel of pasting.cells){ const x=ox+cel.dx, y=oy+cel.dy, z=oz+cel.dz;
    if(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ) continue;
    const v={x,y,z};
    for(let fi=0; fi<6; fi++){ const f=CUBE_FACES[fi];
      if(occ.has((x+f.nb[0])+','+(y+f.nb[1])+','+(z+f.nb[2]))) continue;   // cara interna del cúmulo pegado
      if(!faceVisIso(g,v,fi)) continue;                                    // oculta por el modelo o mirando hacia atrás
      fillPoly3d(facePoly3d(g,v,fi)); e3ctx.fill(); e3ctx.stroke();
    }
  }
  e3ctx.restore();
}
function edit3dPx(e){
  const r=edit3d.getBoundingClientRect();
  return { px:(e.clientX-r.left)/r.width*edit3d.width, py:(e.clientY-r.top)/r.height*edit3d.height };
}

function face(ctx,pts,fill){
  ctx.beginPath();
  ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.16)'; ctx.lineWidth=1; ctx.stroke();
}

// ===================== Info / UI sync =====================
function updateInfo(){
  const n=state.voxels.size;
  $('#voxel-count').textContent=n+' vox';
  if(n===0){ $('#dims').textContent='— · 0 voxels'; return; }
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,minz=1e9,maxz=-1e9;
  for(const k of state.voxels.keys()){
    const [x,y,z]=k.split(',').map(Number);
    minx=Math.min(minx,x);maxx=Math.max(maxx,x);
    miny=Math.min(miny,y);maxy=Math.max(maxy,y);
    minz=Math.min(minz,z);maxz=Math.max(maxz,z);
  }
  $('#dims').textContent=`${maxx-minx+1}×${maxy-miny+1}×${maxz-minz+1} · ${n} voxels`;
}

function syncLayer(){
  $('#layer-label').textContent=(state.layer+1)+' / '+SZ;
  $('#lf-label').textContent=(state.layer+1)+'/'+SZ;
  if(mode!=='3d') $('#stage-title').textContent='Edición · capa '+(state.layer+1);
  $('#layer-slider').value=state.layer;
}
function syncColor(){
  $('#color-custom').value=/^#[0-9a-f]{6}$/i.test(state.color)?state.color:'#000000';
  let cv=hex6(state.color); if(state.alpha<1) cv+=alphaHex(state.alpha); if(state.emit) cv='*'+cv;   // muestra el valor real que se pinta
  $('#color-hex').textContent=cv;
  const sa=$('#color-alpha'); if(sa) sa.value=Math.round(state.alpha*100);                            // slider de opacidad
  const sav=$('#color-alpha-val'); if(sav) sav.textContent=Math.round(state.alpha*100)+'%';
  const be=$('#btn-emit'); if(be) be.classList.toggle('is-active', state.emit);                       // botón emisivo
  document.querySelectorAll('.sw').forEach(s=>s.classList.toggle('is-active',!state.tex && s.dataset.c===state.color));
  document.querySelectorAll('.tool-swatch').forEach(s=>{                       // pincel/construir activos: miniatura si es textura, color plano si no
    if(state.tex){
      s.classList.add('is-tex'); const key=state.tex;
      texSwatchUrl(key, url=>{ if(state.tex===key) s.style.backgroundImage='url('+url+')'; });
    }else{
      s.classList.remove('is-tex'); s.style.backgroundImage=''; s.style.background=state.color;
    }
  });
  document.querySelectorAll('#texstrip .texchip').forEach(c=>c.classList.toggle('is-active', !!state.tex && c.dataset.key===state.tex));
}
// Miniatura iso de una textura (para el chip del pincel/construir), cacheada como dataURL.
const texSwatchCache=new Map();
function texSwatchUrl(key, cb){
  if(texSwatchCache.has(key)){ cb(texSwatchCache.get(key)); return; }
  getRoomData(key).then(d=>{
    const cv=document.createElement('canvas'); cv.width=cv.height=40; drawThumb(cv,d);
    const url=cv.toDataURL(); texSwatchCache.set(key,url); cb(url);
  }).catch(()=>{});
}
// Elegir color => fijarlo, desactivar textura y pasar automáticamente a Pincel
function chooseColor(c){ state.color=hex6(c); state.tex=null; syncColor(); }  // color plano (base #rrggbb): apaga la textura-pincel; alpha/emisivo son pegajosos aparte
function pickColorPalette(c){ chooseColor(c); }                        // paleta/input: elegir color sin cambiar de herramienta
function pickColorTool(c){ if(isTex(c)) chooseTex(texKeyOf(c));                     // cuentagotas: recupera textura, o color con su alpha/emisivo
  else { state.emit=isGlow(c); state.alpha=colorAlpha(c); chooseColor(hex6(c)); }
  setTool(prevTool); }
// Coalescencia: varias mutaciones en el mismo frame => UN repintado (clave en trazos sobre modelos grandes)
let _renderPending=false;
function render(){
  if(_renderPending) return;
  _renderPending=true;
  requestAnimationFrame(()=>{ _renderPending=false; drawEdit(); if(!painting) drawIso(); updateInfo(); if(mode==='3d') drawEdit3d(); });
  // La miniatura 3D (drawIso, O(modelo)) NO se repinta mientras se pinta en Capas (painting): se difiere
  // al soltar (endPointer). El lienzo 2D y el contador sí se actualizan en cada trazo.
}

// ===================== Plantillas =====================
function presetVacio(){ return new Map(); }

function presetBarril(){
  const m=new Map(), R=4.4;
  const wood='#7a4a24', woodD='#5e3617', metal='#8f97a6', cap='#8a5a2f';
  for(let z=0;z<=8;z++)for(let x=0;x<16;x++)for(let y=0;y<16;y++){
    const d=Math.hypot(x+0.5-8,y+0.5-8);
    if(z===0||z===8){ if(d<=R-0.4) m.set(key(x,y,z), z===8?cap:woodD); }
    else if(d<=R && d>=R-1.15){
      let col=wood;
      if(z===2||z===6) col=metal;
      else if(((x+y)&1)===0) col=woodD;
      m.set(key(x,y,z),col);
    }
  }
  return m;
}

function presetSlime(){
  const m=new Map();
  const body='#5fbf4a', top='#8fe06a', eye='#101014';
  for(let z=0;z<=5;z++){
    const r=4.6-z*0.65;
    for(let x=0;x<16;x++)for(let y=0;y<16;y++){
      if(Math.hypot(x+0.5-8,y+0.5-8)<=r) m.set(key(x,y,z), z>=4?top:body);
    }
  }
  m.set(key(6,4,3),eye); m.set(key(9,4,3),eye);   // ojos al frente
  return m;
}

const PRESETS={ vacio:presetVacio, barril:presetBarril, slime:presetSlime };

function load(map,meta,size){
  setSize(...normSize(size||16));
  state.voxels=map;
  if(meta){ state.meta={...meta}; }
  state.layer=0; state.rot=0; hover3d=null; selection.clear(); serverId=null;
  view3d.zoom=1; view3d.panX=0; view3d.panY=0;
  view.zoom=1; view.panX=0; view.panY=0; updateZoomLabel();
  clearHistory();                       // documento nuevo: sin historial que cruzar
  $('#meta-name').value=state.meta.name;
  $('#meta-type').value=state.meta.type;
  const roleEl=$('#meta-role');
  roleEl.textContent=state.meta.role||'';
  roleEl.hidden=!state.meta.role;
  syncLayer(); render();
}

// ---- Assets servidos por HTTP (assets/index.json) ----
let mcAssetsRegistry = {};
function mcIndexAssets(idx){
  if(!Array.isArray(idx)) return;
  for(const a of idx){
    if(!a || !a.file) continue;
    const fileKey = 'asset:' + a.file;
    if(a.id){
      const k1 = String(a.id).trim().toLowerCase();
      mcAssetsRegistry[k1] = a.file;
      MC_MAT_ALIAS[k1] = fileKey;
    }
    if(a.name){
      const k2 = String(a.name).trim().toLowerCase();
      mcAssetsRegistry[k2] = a.file;
      MC_MAT_ALIAS[k2] = fileKey;
    }
    const fileBase = a.file.split('/').pop().replace(/\.vox\.json$/, '').toLowerCase();
    mcAssetsRegistry[fileBase] = a.file;
    MC_MAT_ALIAS[fileBase] = fileKey;
  }
}
async function loadServerAssets(){
  const ul=$('#roster-assets');
  try{
    const idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
    mcIndexAssets(idx);
    ul.innerHTML='';
    if(!idx.length){ ul.innerHTML='<li class="muted">(sin assets)</li>'; return; }
    const npcs=idx.filter(a=>a.type!=='bloque' && a.type!=='textura');   // bloque→Habitaciones, textura→tira propia
    if(!npcs.length){ ul.innerHTML='<li class="muted">(sin assets)</li>'; }
    npcs.forEach(a=>{
      const li=document.createElement('li');
      li.innerHTML=`<span class="ic">${a.icon||'🗡️'}</span><div><span>${a.name}</span>`+
                   `<span class="badge" style="margin:0">${a.role||a.type||''}</span></div>`;
      li.title='Cargar '+a.name;
      li.onclick=()=>loadFromUrl(a.file);
      ul.appendChild(li);
    });
    loadRooms(idx);   // reutiliza el mismo índice para poblar Habitaciones
    refreshTexturas(idx);   // y la tira de texturas
  }catch(e){
    ul.innerHTML='<li class="muted">Sirve por HTTP para cargar assets</li>';
  }
}
async function loadFromUrl(url){
  try{
    const d=await fetch(url,{cache:'no-store'}).then(r=>r.json());
    ingestTextures(d);
    load(new Map(Object.entries(d.voxels||{})), d.meta||{name:url,type:'objeto'}, d.size);
    toast('Cargado «'+((d.meta&&d.meta.name)||url)+'»');
  }catch(e){ toast('No se pudo cargar '+url); }
}

// ================== Habitantes (guardados en el servidor) ==================
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtDate(iso){
  if(!iso) return '';
  const d=new Date(iso); if(isNaN(d)) return '';
  return '🕒 '+d.toLocaleDateString('es-ES',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
}
async function apiHabitantes(){ return fetch('/api/habitantes',{cache:'no-store'}).then(r=>r.json()); }
// miniatura iso de un objeto voxel (usa renderIso con swap temporal de state.voxels)
function drawThumb(cv, d){
  const saved=state.voxels;
  state.voxels=new Map(Object.entries(d.voxels||{}));
  renderIso(cv.getContext('2d'), cv.width, cv.height, 0, 40, false);   // rot 0 (no depende de SX/SY), sin rejilla
  state.voxels=saved;
}
async function loadHabitante(id){
  try{
    const d=await fetch('/api/habitantes/'+id,{cache:'no-store'}).then(r=>r.json());
    ingestTextures(d);
    load(new Map(Object.entries(d.voxels||{})), d.meta||{name:id,type:'personaje'}, d.size);
    serverId=id; closeHabitantes();
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('is-active',x.dataset.tab==='objeto'));
    toast('Cargado «'+((d.meta&&d.meta.name)||id)+'»');
  }catch(e){ toast('No se pudo cargar'); }
}
async function renameHabitante(id,cur){
  const name=prompt('Nuevo nombre del habitante:', cur||'');
  if(name==null || !name.trim() || name===cur) return;
  await fetch('/api/habitantes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});
  if(serverId===id) state.meta.name=name.trim(), $('#meta-name').value=name.trim();
  openHabitantes(); refreshRosters();
}
async function delHabitante(id,name){
  if(!confirm('¿Borrar «'+(name||id)+'» del servidor? No se puede deshacer.')) return;
  await fetch('/api/habitantes/'+id,{method:'DELETE'});
  if(serverId===id) serverId=null;
  openHabitantes(); refreshRosters();
}
// Galería (modal)
// clasifica un item guardado por su tipo: habitación (bloque), objeto (objeto/decoración) o habitante (resto)
function habBucket(t){ return t==='bloque' ? 'habitacion' : t==='textura' ? 'textura' : (t==='objeto'||t==='decoracion') ? 'objeto' : 'habitante'; }
const HAB_TITLE={habitacion:'Habitaciones', objeto:'Objetos', habitante:'Habitantes', textura:'Texturas'};
const HAB_EMPTY={habitacion:'Aún no hay habitaciones guardadas.', objeto:'Aún no hay objetos guardados.', habitante:'Aún no hay habitantes guardados.', textura:'Aún no hay texturas guardadas.'};
let habKind='habitante';   // 'habitante' | 'objeto' | 'habitacion' — qué muestra la galería (por tipo)
async function openHabitantes(kind){
  if(typeof kind==='string') habKind=kind;
  const modal=$('#hab-modal'), grid=$('#hab-grid');
  const titleEl=$('#hab-title'); if(titleEl) titleEl.textContent = HAB_TITLE[habKind]||'Habitantes';
  modal.hidden=false;
  grid.innerHTML='<p class="hab-empty">Cargando…</p>';
  let list;
  try{ list=await apiHabitantes(); }
  catch(e){ grid.innerHTML='<p class="hab-empty">No se pudo conectar con el servidor.</p>'; return; }
  list=list.filter(h=> habBucket(h.type)===habKind);   // enruta por tipo
  // Assets del juego del mismo tipo (assets/index.json): también se pueden CARGAR desde la galería (como punto
  // de partida). Son ficheros de solo lectura → sin Renombrar/Borrar; cargarlos limpia serverId para que Guardar
  // cree un habitante nuevo en vez de intentar sobrescribir el asset.
  let assets=[];
  try{ const idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
       assets=idx.filter(a=> habBucket(a.type)===habKind); }catch(e){}
  if(!list.length && !assets.length){ grid.innerHTML='<p class="hab-empty">'+(HAB_EMPTY[habKind]||HAB_EMPTY.habitante)+'<br>Crea un objeto y pulsa <b>Guardar</b>.</p>'; return; }
  grid.innerHTML='';
  for(const a of assets){
    const card=document.createElement('div'); card.className='hab-card';
    card.innerHTML=`<div class="hab-thumb"><canvas width="150" height="150"></canvas></div>
      <div class="hab-name" title="${esc(a.name)}">${(a.icon?esc(a.icon)+' ':'')}${esc(a.name)} <span class="badge" style="margin:0">asset</span></div>
      <p class="hab-sub">${esc(a.role||a.type||'')} · del juego</p>
      <p class="hab-date">🎮 Asset del juego</p>
      <div class="hab-acts">
        <button class="btn sm" data-a="load">Cargar</button>
      </div>`;
    grid.appendChild(card);
    getRoomData('asset:'+a.file).then(d=>drawThumb(card.querySelector('canvas'),d)).catch(()=>{});
    card.querySelector('[data-a=load]').onclick=async()=>{
      await loadFromUrl(a.file); serverId=null;   // asset = punto de partida, no un guardado que se sobrescriba
      closeHabitantes();
      document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('is-active',x.dataset.tab==='objeto'));
    };
  }
  for(const h of list){
    const card=document.createElement('div'); card.className='hab-card';
    card.innerHTML=`<div class="hab-thumb"><canvas width="150" height="150"></canvas></div>
      <div class="hab-name" title="${esc(h.name)}">${esc(h.name)}</div>
      <p class="hab-sub">${esc(h.role||h.type||'')} · ${h.count} vox</p>
      <p class="hab-date">${fmtDate(h.savedAt)}</p>
      <div class="hab-acts">
        <button class="btn sm" data-a="load">Cargar</button>
        <button class="btn sm" data-a="ren">Renombrar</button>
        <button class="btn sm danger" data-a="del">Borrar</button>
      </div>`;
    grid.appendChild(card);
    fetch('/api/habitantes/'+h.id,{cache:'no-store'}).then(r=>r.json()).then(d=>drawThumb(card.querySelector('canvas'),d)).catch(()=>{});
    card.querySelector('[data-a=load]').onclick=()=>loadHabitante(h.id);
    card.querySelector('[data-a=ren]').onclick=()=>renameHabitante(h.id,h.name);
    card.querySelector('[data-a=del]').onclick=()=>delHabitante(h.id,h.name);
  }
}
function closeHabitantes(){ $('#hab-modal').hidden=true; }
// Lista lateral de habitantes (carga rápida)
async function refreshHabitantesList(){
  const ul=$('#roster-habitantes'); if(!ul) return;
  let list;
  try{ list=await apiHabitantes(); }
  catch(e){ ul.innerHTML='<li class="muted">servidor no disponible</li>'; return; }
  list=list.filter(h=>habBucket(h.type)==='habitante');   // objetos y habitaciones van a sus propios rosters/galerías
  if(!list.length){ ul.innerHTML='<li class="muted">(ninguno · pulsa Guardar)</li>'; return; }
  ul.innerHTML='';
  list.forEach(h=>{
    const li=document.createElement('li');
    li.innerHTML=`<span class="ic">🧍</span><div><span>${esc(h.name)}</span>`+
                 `<span class="badge" style="margin:0">${esc(h.role||h.type||'')}</span></div>`;
    li.title='Cargar '+h.name;
    li.onclick=()=>loadHabitante(h.id);
    ul.appendChild(li);
  });
}
// refresca los dos rosters laterales (habitantes ≠ bloque · habitaciones = bloque + assets)
function refreshRosters(){ refreshHabitantesList(); loadRooms(); refreshTexturas(); }

// ===================== Persistencia =====================
const LS='voxelforge:current';
let serverId=null;                 // id del habitante en el servidor (si el objeto viene/va allí)
// Defs de las texturas realmente usadas => se embeben para un modelo autocontenido (render offline)
function embeddedTextures(){
  const used=new Set(); for(const v of state.voxels.values()) if(isTex(v)) used.add(texKeyOf(v));
  if(!used.size) return undefined;
  const t={}; for(const k of used){ const d=texDefs.get(k); if(d) t[k]={size:d.size, voxels:d.voxels}; } return t;
}
function currentVox(){
  const doc={format:'voxelforge-1', size:{x:SX,y:SY,z:SZ}, meta:state.meta, voxels:Object.fromEntries(state.voxels)};
  const t=embeddedTextures(); if(t) doc.textures=t;
  return doc;
}
function localSnap(){ const s={size:{x:SX,y:SY,z:SZ}, meta:state.meta, voxels:[...state.voxels]}; const t=embeddedTextures(); if(t) s.textures=t; return JSON.stringify(s); }
async function save(){
  // copia local siempre (para recuperar al recargar)
  localStorage.setItem(LS, localSnap());
  if(state.voxels.size===0){ toast('Nada que guardar'); return; }
  const body=currentVox(); if(serverId) body.id=serverId;
  try{
    const isTex = state.meta && state.meta.type === 'textura';
    const endpoint = isTex ? '/api/assets' : '/api/habitantes';
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!r.ok) throw new Error('HTTP ' + r.status + ' - El servidor API no soporta ' + endpoint);
    const j=await r.json();
    if (!j || !j.id) throw new Error('Respuesta inválida del servidor');
    serverId=j.id;
    if(isTex) {
      invalidateTex('asset:assets/' + j.id + '.vox.json');
      if(typeof refreshTexturas === 'function') refreshTexturas();
      if(typeof mcBuildPalette === 'function') await mcBuildPalette();
    }
    toast('Guardado en el servidor: «'+state.meta.name+'»');
    refreshRosters();
  }catch(e){ toast('Guardado local (servidor API no disponible en esta versión git/estática)'); }
}
// "Guardar como…": crea SIEMPRE un habitante/asset nuevo (id nuevo) con el nombre indicado
async function saveAs(){
  if(state.voxels.size===0){ toast('Nada que guardar'); return; }
  const name=prompt('Guardar como (nombre del objeto):', state.meta.name||'Objeto');
  if(name==null || !name.trim()) return;
  state.meta.name=name.trim(); $('#meta-name').value=state.meta.name;
  const body=currentVox();                      // sin id => nuevo registro
  try{
    const isTex = state.meta && state.meta.type === 'textura';
    const endpoint = isTex ? '/api/assets' : '/api/habitantes';
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!r.ok) throw new Error('HTTP ' + r.status + ' - El servidor API no soporta ' + endpoint);
    const j=await r.json();
    if (!j || !j.id) throw new Error('Respuesta inválida del servidor');
    serverId=j.id;
    localStorage.setItem(LS, localSnap());
    if(isTex) {
      invalidateTex('asset:assets/' + j.id + '.vox.json');
      if(typeof refreshTexturas === 'function') refreshTexturas();
      if(typeof mcBuildPalette === 'function') await mcBuildPalette();
    }
    toast('Guardado como «'+state.meta.name+'»');
    refreshRosters();
  }catch(e){ toast('No se pudo guardar en servidor (versión estática/git)'); }
}
function restore(){
  try{
    const raw=localStorage.getItem(LS); if(!raw) return false;
    const d=JSON.parse(raw);
    ingestTextures(d);
    setSize(...normSize(d.size));
    state.meta=d.meta||state.meta;
    state.voxels=new Map(d.voxels||[]);
    return true;
  }catch(e){ return false; }
}
function slug(s){ return (s||'objeto').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'objeto'; }
function exportJSON(){
  const data={format:'voxelforge-1', size:{x:SX,y:SY,z:SZ}, meta:state.meta,
    voxels:Object.fromEntries(state.voxels)};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=slug(state.meta.name)+'.vox.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Exportado '+a.download);
}
function importJSON(file){
  const rd=new FileReader();
  rd.onload=async ()=>{
    try{
      const d=JSON.parse(rd.result);
      const m=new Map(Object.entries(d.voxels||{}));
      load(m, d.meta||{name:file.name.replace(/\.vox\.json$/,''),type:'objeto'}, d.size);
      try {
        const isTex = (d.meta && d.meta.type === 'textura');
        const endpoint = isTex ? '/api/assets' : '/api/habitantes';
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d)
        });
        if (r.ok) {
          if (typeof refreshTexturas === 'function') refreshTexturas();
          if (typeof mcBuildPalette === 'function') await mcBuildPalette();
        }
      } catch(err) {
        console.warn('No se pudo persistir en servidor (versión estática/git):', err);
      }
      toast('Importado '+file.name);
    }catch(e){ toast('Archivo no válido'); }
  };
  rd.readAsText(file);
}

// ===================== Toast =====================
let toastT;
function toast(msg, secs){                          // secs opcional = duración en segundos (def. 1.8 s)
  const el=$('#toast'); el.textContent=msg;
  el.classList.toggle('mc-mode', !$('#mc-modal').hidden);   // en el Mundo, el toast sube por encima de la hotbar
  el.hidden=false;
  clearTimeout(toastT);
  const ms=(typeof secs==='number' && secs>0) ? secs*1000 : 1800;
  toastT=setTimeout(()=>el.hidden=true, ms);
}

// ===================== Eventos =====================
function canvasPx(e){                              // coords cliente -> píxeles internos del canvas
  const r=editCv.getBoundingClientRect();
  return { px:(e.clientX-r.left)/r.width*editCv.width, py:(e.clientY-r.top)/r.height*editCv.height };
}
function cellFromEvent(e){
  const {px,py}=canvasPx(e);
  const b=viewGeom();
  return { x:Math.floor((px-b.originX)/b.cell), y:Math.floor((py-b.originY)/b.cell) };
}
let sel2d=null;   // (heredado) pincelado voxel a voxel; ya no se usa con la caja de selección
let marquee=null; // caja de selección en celdas (herramienta Selección): {x0,y0,x1,y1,base,mode,moved,emptyStart}
function applyMarquee(){   // recalcula la selección = base ± voxels OCUPADOS de ESTA capa dentro del recuadro (como la caja 3D)
  selection.clear(); for(const k of marquee.base) selection.add(k);
  const x0=Math.max(0,Math.min(marquee.x0,marquee.x1)), x1=Math.min(SX-1,Math.max(marquee.x0,marquee.x1));
  const y0=Math.max(0,Math.min(marquee.y0,marquee.y1)), y1=Math.min(SY-1,Math.max(marquee.y0,marquee.y1));
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
    if(getVoxel(x,y,state.layer)===undefined) continue;
    const k=x+','+y+','+state.layer;
    if(marquee.mode==='remove') selection.delete(k); else selection.add(k);
  }
  render();
}
function apply2dSelect(c){
  if(c.x<0||c.y<0||c.x>=SX||c.y>=SY) return;
  const k=c.x+','+c.y+','+state.layer;
  if(sel2d==='add'){ if(getVoxel(c.x,c.y,state.layer)!==undefined) selection.add(k); }
  else selection.delete(k);
  render();
}
// ---- Copiar / Pegar en 2D (Ctrl+C / Ctrl+V) ----
let clipboard=null;   // {cells:[{dx,dy,dz,c}], gx,gy} — offsets relativos al mínimo + punto de agarre (centro)
let pasting=null;     // colocación activa: copia del portapapeles que sigue al ratón hasta soltar (clic)
let pasteHover3d=null; // en la vista 3D: celda-ancla bajo el cursor mientras se pega (fantasma), o null
function copySelection(){                              // Ctrl+C: guarda los voxels seleccionados (posición relativa + color)
  if(!selection.size) return false;
  let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity;
  const raw=[];
  for(const k of selection){ const [x,y,z]=k.split(',').map(Number); const c=getVoxel(x,y,z); if(c===undefined) continue;
    raw.push({x,y,z,c}); if(x<minx)minx=x; if(y<miny)miny=y; if(z<minz)minz=z; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
  if(!raw.length) return false;
  clipboard={ cells:raw.map(v=>({dx:v.x-minx, dy:v.y-miny, dz:v.z-minz, c:v.c})),
              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  toast(clipboard.cells.length+' voxel(s) copiados');
  return true;
}
function selectAll(){                                  // Ctrl+A: selecciona TODOS los voxels del modelo (Capas y 3D comparten `selection`)
  if(!state.voxels.size){ toast('No hay voxels que seleccionar'); return false; }
  selection.clear();
  for(const k of state.voxels.keys()) selection.add(k);
  toast(selection.size+' voxel(s) seleccionados');
  if(mode==='3d') drawEdit3d(); else drawEdit();
  return true;
}
function startPaste(){                                 // Ctrl+V: entra en modo colocación (fantasma que sigue al cursor) · Capas y 3D
  if(!clipboard || !clipboard.cells.length){ toast('Nada que pegar'); return false; }
  pasting={ cells:clipboard.cells, gx:clipboard.gx, gy:clipboard.gy };
  if(mode==='3d'){ pasteHover3d=null; update3dCursor(); scheduleEdit3d(); toast('Apunta a una cara · clic pega · Esc cancela'); }
  else { refreshEditCursor(); drawEdit(); toast('Coloca con el ratón · clic para pegar · Esc cancela'); }
  return true;
}
function pasteAt(ax,ay,az){                             // materializa el pegado: mínimo en (ax-gx, ay-gy); Z = az (3D: cara apuntada) o la capa actual (2D)
  if(!pasting) return;
  const ox=ax-pasting.gx, oy=ay-pasting.gy, oz=(az==null?state.layer:az), placed=new Set();
  edit(()=>{ for(const cel of pasting.cells){ const x=ox+cel.dx, y=oy+cel.dy, z=oz+cel.dz;
    if(x<0||y<0||z<0||x>=SX||y>=SY||z>=SZ) continue; setVoxel(x,y,z,cel.c); placed.add(x+','+y+','+z); } });
  selection.clear(); for(const k of placed) selection.add(k);   // la selección pasa a lo recién pegado
  pasting=null; pasteHover3d=null; if(mode==='3d') update3dCursor(); else refreshEditCursor(); render();
  toast(placed.size+' voxel(s) pegados');
}
function cancelPaste(){ if(!pasting) return false; pasting=null; pasteHover3d=null; if(mode==='3d') update3dCursor(); else refreshEditCursor(); render(); return true; }
// Materializa el pegado en la vista 3D contra la celda-ancla apuntada (hueco pegado a la cara). Reutiliza pasteAt con Z=ancla.
function pasteAt3d(anchor){ if(!pasting||!anchor) return; pasteAt(anchor.x, anchor.y, anchor.z); }
editCv.addEventListener('pointerdown',e=>{
  editCv.setPointerCapture(e.pointerId);
  if(pasting){                                     // modo colocación (Ctrl+V): clic izq suelta aquí; otro botón cancela
    if(e.button===0){ const c=cellFromEvent(e); pasteAt(c.x,c.y); } else cancelPaste();
    e.preventDefault(); return;
  }
  const selTool=state.tool==='select';
  if(e.button===1 || (e.button===2 && !selTool) || e.ctrlKey || e.metaKey || (e.button===0 && state.tool==='hand')){   // central/derecho, Ctrl o Mano = pan (der con Selección = deseleccionar)
    panning=true; panLast=canvasPx(e); editCv.style.cursor='grabbing'; e.preventDefault(); return;
  }
  if(e.button===0 && (e.altKey||altHeld)){         // Alt+clic = cuentagotas momentáneo
    const c=cellFromEvent(e), col=getVoxel(c.x,c.y,state.layer);
    if(col) chooseColor(col);                      // solo toma el color; mantiene la herramienta actual
    e.preventDefault(); return;
  }
  if(state.tool==='orbit') return;                 // giro no aplica en la vista 2D
  if(selTool){                                     // selección por CAJA como en 3D: arrastrar marca del voxel inicial al final
    const c=cellFromEvent(e);
    marquee={ x0:c.x, y0:c.y, x1:c.x, y1:c.y, base:new Set(selection),
              mode:(e.button===2?'remove':'add'), moved:false,
              emptyStart:getVoxel(c.x,c.y,state.layer)===undefined };
    painting=true; hover=c; applyMarquee(); e.preventDefault(); return;
  }
  painting=true; beginGesture(); const c=cellFromEvent(e); hover=c; applyTool(c.x,c.y);
});
editCv.addEventListener('pointermove',e=>{
  if(pasting){                                      // modo colocación: el fantasma sigue al cursor (no pinta)
    const c=cellFromEvent(e);
    if(!hover||hover.x!==c.x||hover.y!==c.y){ hover=c; drawEdit(); }
    return;
  }
  if(panning){
    const p=canvasPx(e);
    view.panX+=p.px-panLast.px; view.panY+=p.py-panLast.py; panLast=p; drawEdit(); return;
  }
  if(marquee){                                     // arrastrando la caja de selección: recalcula en vivo (como en 3D)
    const c=cellFromEvent(e);
    if(c.x!==marquee.x1||c.y!==marquee.y1){ marquee.x1=c.x; marquee.y1=c.y; marquee.moved=true; hover=c; applyMarquee(); }
    return;
  }
  const c=cellFromEvent(e);
  if(!hover||hover.x!==c.x||hover.y!==c.y){
    hover=c;
    if(painting && sel2d) apply2dSelect(c);
    else if(painting) applyTool(c.x,c.y);
    else drawEdit();
  }
});
function endPointer(){ const wasPaint=painting;
  if(marquee){                                               // caja de selección: al soltar, un clic sobre vacío deshace (como 3D)
    if(!marquee.moved && marquee.mode==='add' && marquee.emptyStart){ selection.clear(); render(); }
    marquee=null;
  }
  else if(painting && !sel2d) endGesture();
  painting=false; panning=false; sel2d=null; refreshEditCursor();
  if(wasPaint) drawIso(); }   // miniatura 3D diferida: se actualiza UNA vez al soltar, no en cada trazo
editCv.addEventListener('pointerup',endPointer);
editCv.addEventListener('pointerleave',()=>{ hover=null; endPointer(); drawEdit(); });
editCv.addEventListener('contextmenu',e=>e.preventDefault());   // permitir pan con botón derecho
editCv.addEventListener('wheel',e=>{
  e.preventDefault();
  const {px,py}=canvasPx(e);
  zoomAt(px,py, e.deltaY<0 ? 1.12 : 1/1.12);
},{passive:false});

// controles de zoom
$('#zoom-in').onclick =()=>{ if(mode==='3d') zoom3dAt(edit3d.width/2, edit3d.height/2, 1.12); else zoomAt(editCv.width/2, editCv.height/2, 1.12); };
$('#zoom-out').onclick=()=>{ if(mode==='3d') zoom3dAt(edit3d.width/2, edit3d.height/2, 1/1.12); else zoomAt(editCv.width/2, editCv.height/2, 1/1.12); };
$('#zoom-reset').onclick=()=>{ if(mode==='3d'){ view3d.zoom=1; view3d.panX=0; view3d.panY=0; drawEdit3d(); } else resetView(); };

// tecla Ctrl = modo mover (pan) en ambas vistas, con cursor de mano
function refreshEditCursor(){ if(!panning) editCv.style.cursor = pasting ? 'move' : altHeld ? CURSORS.pick : (ctrlHeld||state.tool==='hand') ? 'grab' : 'crosshair'; }
function refreshBigCursor(){ if(modalOpen && !mdrag && !mrot) bigCv.style.cursor = ctrlHeld ? CURSORS.orbit : 'grab'; }
window.addEventListener('keydown',e=>{
  if(e.key==='Control'||e.key==='Meta'){ ctrlHeld=true; refreshEditCursor(); update3dCursor(); refreshBigCursor(); }
  else if(e.key==='Alt'){ altHeld=true; refreshEditCursor(); update3dCursor(); e.preventDefault(); }
});
window.addEventListener('keyup',e=>{
  if(e.key==='Control'||e.key==='Meta'){ ctrlHeld=false; refreshEditCursor(); update3dCursor(); refreshBigCursor(); }
  else if(e.key==='Alt'){ altHeld=false; refreshEditCursor(); update3dCursor(); }
});
window.addEventListener('blur',()=>{ ctrlHeld=false; altHeld=false; refreshEditCursor(); update3dCursor();
  if(typeof mc!=='undefined'){ if(mc.keys){ for(const k in mc.keys) mc.keys[k]=false; } mc.vel=[0,0,0]; } });
window.addEventListener('resize',()=>{ if(mode==='3d'){ resizeEdit3d(); drawEdit3d(); } else resizeEdit(); });

// ---- Conmutar Capas / 3D ----
function setMode(m){
  mode=m;
  const is3=(m==='3d');
  // Al pasar de 3D a Capas, saltar a la última capa editada en 3D (construir/pintar/borrar)
  if(!is3 && last3dLayer!=null){ state.layer=Math.max(0,Math.min(SZ-1,last3dLayer)); syncLayer(); }
  $('#edit').hidden=is3; $('#edit3d').hidden=!is3;
  $('#ctrl-2d').hidden=is3;                    // zoom solo en Capas
  $('#tool-float').hidden=!is3;                // herramientas flotantes solo en 3D
  $('#rot-float').hidden=!is3;                 // rotar (abajo-dcha) solo en 3D
  $('#e3-fps').hidden=!(is3 && _showFPS);       // medidor de FPS: en 3D y si game.showFPS
  $('#e3-vox').hidden=!(is3 && _showVox);       // medidor de voxels: en 3D y si game.showVoxels
  if(window.game) window.game.mode=m;
  if(!is3){ _e3fpsWinT=0; _e3fpsCount=0; _e3fpsLastT=0; }   // reinicia la ventana al salir de 3D
  updateLayerFloat();                          // subir/bajar capa: en Capas o si "aislar" está activo
  $('#stage-title').textContent = is3 ? 'Edición 3D' : 'Edición · capa '+(state.layer+1);
  $('#stage-hint').textContent = is3
    ? 'pasa el ratón para resaltar el voxel bajo el cursor'
    : 'clic pinta · Alt+clic color · rueda zoom · Ctrl+arrastre mueve · B/E/I/G · [ ] capa · R rota';
  document.querySelectorAll('#mode-tabs button').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.mode===m));
  if(is3){ hover3d=null; setTool(state.tool); resizeEdit3d(); drawEdit3d(); update3dCursor(); } else { resizeEdit(); }
  drawIso();   // refrescar miniatura (con/sin plano según el modo)
}
// Interruptor del PREVIEW 3D (tarjeta «Vista 3D», panel derecho): oculta la miniatura iso y evita su
// coste (drawIso es O(modelo)); NO afecta al lienzo de edición 3D del centro. Persistido en localStorage.
function updateTogglePreview(){
  const b=$('#toggle-preview'); if(!b) return;
  b.classList.toggle('off', !_showPreview);
  b.textContent = _showPreview ? '👁' : '🚫';
  b.title = _showPreview ? 'Ocultar el preview 3D' : 'Mostrar el preview 3D';
}
function applyShowPreview(v){
  _showPreview=!!v;
  try{ localStorage.setItem('vf_showpreview', _showPreview?'1':'0'); }catch(e){}
  const body=$('#iso-body'); if(body) body.hidden=!_showPreview;   // oculta lienzo + controles del preview
  updateTogglePreview();
  if(_showPreview) drawIso();                                      // repinta la miniatura al reanudar
  return _showPreview;
}
$('#mode-tabs').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) setMode(b.dataset.mode); });
$('#e3-rot-left').onclick =()=>{ view3d.yaw+=Math.PI/4; leaveCamFront(); hover3d=null; drawEdit3d(); };
$('#e3-rot-right').onclick=()=>{ view3d.yaw-=Math.PI/4; leaveCamFront(); hover3d=null; drawEdit3d(); };
// Alternar entre la orientación libre actual y la proyección ortogonal frontal (yaw=pitch=0, se ve X↔horizontal, Z↔vertical)
function updateCamBtn(){ const b=$('#e3-cam'); if(!b) return;
  b.classList.toggle('on', camFront);
  b.textContent = camFront ? 'Libre' : 'Frontal';
  b.title = camFront ? 'Volver a la vista libre (orientación anterior)' : 'Proyección ortogonal frontal (vista de frente)';
}
function leaveCamFront(){ if(!camFront) return; camFront=false; camSaved=null; updateCamBtn(); }  // el usuario rotó: deja de estar bloqueado en frontal
function toggleCamFront(){
  if(camFront){ if(camSaved){ view3d.yaw=camSaved.yaw; view3d.pitch=camSaved.pitch; } camSaved=null; camFront=false; }
  else { camSaved={yaw:view3d.yaw, pitch:view3d.pitch}; view3d.yaw=0; view3d.pitch=0; camFront=true; }
  hover3d=null; updateCamBtn(); drawEdit3d();
}
$('#e3-cam').onclick=toggleCamFront;
updateCamBtn();
function updatePerspBtn(){ const b=$('#e3-persp'); if(!b) return;
  b.classList.toggle('on', perspOn);
  b.title = perspOn ? 'Proyección paralela (ortográfica)' : 'Perspectiva cónica (3D lineal): fuga por profundidad'; }
function togglePersp(){ perspOn=!perspOn; view3d.persp=perspOn;
  try{ localStorage.setItem('vf_persp', perspOn?'1':'0'); }catch(e){}
  hover3d=null; updatePerspBtn(); drawEdit3d();
}
if($('#e3-persp')){ $('#e3-persp').onclick=togglePersp; updatePerspBtn(); }
$('#toggle-preview').onclick=()=>applyShowPreview(!_showPreview); // interruptor: ocultar/mostrar el preview 3D
// estado inicial (según vf_showpreview): solo aplica visibilidad; el primer render del arranque ya pinta
{ const body=$('#iso-body'); if(body) body.hidden=!_showPreview; updateTogglePreview(); }

// ---- Herramientas sobre el voxel elegido en 3D ----
function flood3d(x,y,z){                // relleno 3D: reemplaza la región conexa del mismo color
  const target=getVoxel(x,y,z)||null, repl=paintValue();
  if(target===null || target===repl) return;
  const stack=[[x,y,z]], seen=new Set();
  while(stack.length){
    const [a,b,c]=stack.pop(), k=a+','+b+','+c;
    if(seen.has(k)) continue; seen.add(k);
    if((getVoxel(a,b,c)||null)!==target) continue;
    setVoxel(a,b,c,repl);
    stack.push([a+1,b,c],[a-1,b,c],[a,b+1,c],[a,b-1,c],[a,b,c+1],[a,b,c-1]);
  }
}
let _aux2dReq=0, _aux2dDefer=false;
function scheduleAux2d(){                 // BUG-P3D1: coalesce el refresco de paneles 2D/mini/info a 1 por frame…
  if(paint3d){ _aux2dDefer=true; return; }// …y DIFERIDO a pointerup durante el pincel (drawIso es O(modelo) por frame)
  if(_aux2dReq) return;
  _aux2dReq=requestAnimationFrame(()=>{ _aux2dReq=0; drawEdit(); drawIso(); updateInfo(); });
}
function applyTool3d(v){                // v: voxel elegido {x,y,z}
  switch(state.tool){
    case 'paint': setVoxel(v.x,v.y,v.z,paintValue()); last3dLayer=v.z; break;
    case 'erase': setVoxel(v.x,v.y,v.z,null); last3dLayer=v.z; break;
    case 'pick':  { const c=getVoxel(v.x,v.y,v.z); if(c) pickColorTool(c); break; }
    case 'fill':  flood3d(v.x,v.y,v.z); last3dLayer=v.z; break;
  }
  scheduleAux2d();                       // refresca paneles 2D/mini/info coalescido (el 3D lo hace el handler)
}
let paint3d=false, selecting=false, orbiting=false, orbitLast=null, orbitMoved=false;
let building=false, buildGhost=null, buildGeom=null;    // Construir: colocar voxels contra la cara clicada (estilo Minecraft); buildGeom = geometría congelada del arrastre
let dragGeom=null;                                      // Borrar: geometría congelada del arrastre (arrasa solo la superficie inicial, no cava hacia dentro)
let last3dLayer=null;                                   // última z editada en 3D (construir/pintar/borrar); al pasar a Capas se activa esa capa
let selBox=null;                  // {a,b,base:Set,mode} arrastre de Selección en 3D = caja de voxels de A a B
let pan3d=false, pan3dLast=null;
let moving=false, moveStart=null, moveApplied={x:0,y:0}, moveAx=0,moveAy=0,moveBx=0,moveBy=0;
let extruding=false, exBase=null, exOcc=null, exCells=null, exCarved=null, exStart=null, exVx=0,exVy=0, exDir=[0,0,1];

// Cursores contextuales de la vista 3D (SVG data-URI): herramienta sobre voxel, rotar sobre fondo
const _cur=(svg,hx,hy,fb)=>`url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, ${fb}`;
const _pencil=`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M4 24 L6.5 18 L19 5.5 L22.5 9 L10 21.5 Z' fill='#f4a72c' stroke='#111' stroke-width='1.6' stroke-linejoin='round'/><path d='M19 5.5 L22 2.5 L25.5 6 L22.5 9 Z' fill='#c9ced6' stroke='#111' stroke-width='1.6' stroke-linejoin='round'/><path d='M4 24 L6.5 18 L10 21.5 Z' fill='#111'/></svg>`;
const _eraser=`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g stroke='#111' stroke-width='1.6' stroke-linejoin='round'><path d='M4 20 L14 10 L22 18 L12 28 Z' fill='#e2685a'/><path d='M4 20 L9 25 L19 15 L14 10 Z' fill='#f2f4f8'/></g></svg>`;
const _dropper=`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g stroke='#111' stroke-width='1.6' stroke-linejoin='round'><rect x='16.5' y='2.5' width='8' height='4.5' rx='2.2' fill='#c9ced6' transform='rotate(45 20.5 4.7)'/><path d='M18 9 L5.5 21.5 L4 26 L8.5 24.5 L21 12 Z' fill='#5aa0e2'/></g></svg>`;
const _bucket=`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g stroke='#111' stroke-width='1.6' stroke-linejoin='round'><path d='M5 11 L14 3 L23 12 L14 21 Z' fill='#5aa0e2'/><path d='M23 12 q3.5 4 0.5 7 q-3 -3 -0.5 -7 Z' fill='#f6d94a'/></g></svg>`;
const _rotate=`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g fill='none' stroke='#111' stroke-width='4' stroke-linecap='round'><path d='M6.5 11 A8 8 0 0 1 20 8.5'/><path d='M21.5 17 A8 8 0 0 1 8 19.5'/></g><g fill='none' stroke='#f2f4f8' stroke-width='2' stroke-linecap='round'><path d='M6.5 11 A8 8 0 0 1 20 8.5'/><path d='M21.5 17 A8 8 0 0 1 8 19.5'/></g><g fill='#f2f4f8' stroke='#111' stroke-width='0.8' stroke-linejoin='round'><path d='M20 3.5 L24.5 9 L18 9.5 Z'/><path d='M8 24.5 L3.5 19 L10 18.5 Z'/></g></svg>`;
const CURSORS={
  paint:_cur(_pencil,3,25,'crosshair'), erase:_cur(_eraser,5,24,'crosshair'),
  pick:_cur(_dropper,4,26,'crosshair'), fill:_cur(_bucket,8,20,'crosshair'),
  select:'crosshair', orbit:_cur(_rotate,14,14,'grab'), build:'copy',
};
function update3dCursor(){
  edit3d.style.cursor =
    pasting             ? 'move' :                       // pegando (Ctrl+V): el fantasma sigue al cursor
    (moving||extruding) ? 'grabbing' :                   // moviendo/extruyendo
    state.tool==='extrude' ? 'ns-resize' :               // extruir (arrastre)
    (state.tool==='select' && hover3d && selection.has(selKey(hover3d))) ? 'move' :   // sobre selección
    pan3d               ? 'grabbing' :                   // arrastrando pan
    ctrlHeld            ? 'grab' :                       // Ctrl = pan
    orbiting            ? CURSORS.orbit :                // rotando
    altHeld             ? CURSORS.pick :                 // Alt = cuentagotas
    state.tool==='build'? (buildGhost?CURSORS.build:'crosshair') :  // Construir: + si hay hueco válido
    state.tool==='orbit'? CURSORS.orbit :                // herramienta Giro
    state.tool==='hand' ? 'grab' :                       // herramienta Mano
    hover3d             ? (CURSORS[state.tool]||'crosshair') :
                          'default';                     // fondo, sin acción
}
const selKey=v=>v.x+','+v.y+','+v.z;
// Añade a la selección la región conexa de voxels en la misma capa (z) que `v`,
// contando solo los que se tocan cara con cara (4-vecindad en el plano XY). Es aditivo.
// Selecciona la SUPERFICIE superior conexa: por cada columna (x,y) alcanzable desde la clicada,
// el voxel sólido MÁS ALTO. Así "seleccionar el plano" abarca todo el techo aunque sea irregular
// y extruir hacia abajo no deja columnas (pilares) sin recortar. En un bloque de techo plano
// equivale a seleccionar esa capa entera (mismo resultado que antes).
function floodSelectLayer(v){
  const topZ=(x,y)=>{ for(let z=SZ-1; z>=0; z--) if(getVoxel(x,y,z)!==undefined) return z; return -1; };
  const stack=[[v.x,v.y]], seen=new Set();
  while(stack.length){
    const [x,y]=stack.pop(), key=x+','+y;
    if(seen.has(key)) continue; seen.add(key);
    const z=topZ(x,y);
    if(z<0) continue;                            // columna vacía o fuera de rejilla => corta la expansión
    selection.add(x+','+y+','+z);
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
}
// Arrastre de Selección en 3D: caja de voxels desde el voxel del clic (a) hasta el actual (b).
// Rehace la selección desde `base` (lo que había al empezar) + los voxels OCUPADOS dentro de la caja
// [min..max] en cada eje: si el arrastre se queda en una cara (Y o Z constante) sale un plano
// (vertical u horizontal); si cruza a otra cara, sale un volumen. mode 'add' añade, 'remove' quita.
function applySelBox(){
  if(!selBox) return;
  const {a,b,base,mode}=selBox;
  selection.clear(); for(const k of base) selection.add(k);
  const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x);
  const y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
  const z0=Math.min(a.z,b.z),z1=Math.max(a.z,b.z);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
    if(getVoxel(x,y,z)!==undefined){ const k=x+','+y+','+z; mode==='remove'?selection.delete(k):selection.add(k); }
  }
}
function pick3dAt(e,g){ const {px,py}=edit3dPx(e); return pickVoxel3d(px,py,g); }
function deleteSelection(){
  if(!selection.size) return false;
  const n=selection.size;
  edit(()=>{ for(const k of selection){ const [x,y,z]=k.split(',').map(Number); setVoxel(x,y,z,null); } });
  selection.clear(); render(); toast(n+' voxel(s) borrados'); return true;
}
// "Cubo de pintura" con una selección activa => pinta los seleccionados del color actual
// (solo celdas ocupadas); vuelve a la herramienta de Selección y MANTIENE la selección.
function paintSelection(){
  if(!selection.size) return false;
  let n=0;
  edit(()=>{ for(const k of selection){ const [x,y,z]=k.split(',').map(Number);
    if(getVoxel(x,y,z)!==undefined){ setVoxel(x,y,z,paintValue()); n++; } } });
  setTool('select'); render(); toast(n+' voxel(s) pintados'); return true;
}
// Desplaza los voxels seleccionados (dx,dy,dz). Sin commit (lo envuelve edit()/gesto). false si sale de la rejilla.
function moveSel(dx,dy,dz){
  if(!selection.size) return false;
  const items=[];
  for(const k of selection){ const [x,y,z]=k.split(',').map(Number); items.push({x,y,z,c:getVoxel(x,y,z)}); }
  for(const m of items){ const nx=m.x+dx,ny=m.y+dy,nz=m.z+dz; if(nx<0||ny<0||nz<0||nx>=SX||ny>=SY||nz>=SZ) return false; }
  for(const m of items) setVoxel(m.x,m.y,m.z,null);                        // vaciar origen
  const ns=new Set();
  for(const m of items){ const nx=m.x+dx,ny=m.y+dy,nz=m.z+dz; setVoxel(nx,ny,nz,m.c); ns.add(nx+','+ny+','+nz); }
  selection.clear(); for(const k of ns) selection.add(k);                  // la selección sigue a los voxels
  return true;
}
const MAXDIM=128;
// Desplaza TODO (voxels, selección, estado de extrude) +offset en un eje y agranda la dimensión.
function worldShift(axis, offset){
  if(offset<=0) return;
  const sh=k=>{ const p=k.split(',').map(Number); p[axis]+=offset; return p.join(','); };
  const nv=new Map(); for(const [k,c] of state.voxels) nv.set(sh(k),c); state.voxels=nv;
  const ns=new Set(); for(const k of selection) ns.add(sh(k)); selection.clear(); for(const k of ns) selection.add(k);
  if(exBase) for(const b of exBase){ const p=[b.x,b.y,b.z]; p[axis]+=offset; b.x=p[0]; b.y=p[1]; b.z=p[2]; }
  if(exOcc){ const no=new Set(); for(const k of exOcc) no.add(sh(k)); exOcc=no; }
  if(exCells){ const nc=new Set(); for(const k of exCells) nc.add(sh(k)); exCells=nc; }
  if(exCarved){ const nc=new Map(); for(const [k,c] of exCarved) nc.set(sh(k),c); exCarved=nc; }
  const nd=[SX,SY,SZ]; nd[axis]+=offset; setSize(nd[0],nd[1],nd[2]); mutated=true;
}
// Asegura sitio para extruir `n` capas en `axis` con signo `sign` desde el rango [mn,mx] de la base.
function ensureExtrudeRoom(axis, sign, mn, mx, n){
  const dims=[SX,SY,SZ];
  if(sign>0){ const need=mx+n; if(need>=dims[axis] && need<MAXDIM){ const nd=[SX,SY,SZ]; nd[axis]=need+1; setSize(nd[0],nd[1],nd[2]); mutated=true; } }
  else { const need=mn-n; if(need<0 && (dims[axis]-need)<=MAXDIM) worldShift(axis, -need); }
}
// Normal de la selección = dirección con MÁS caras expuestas (sin vecino) entre los seleccionados.
const EX_DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function selectionNormal(){
  const cnt=[0,0,0,0,0,0];
  for(const k of selection){ const [x,y,z]=k.split(',').map(Number);
    for(let i=0;i<6;i++){ const d=EX_DIRS[i]; if(getVoxel(x+d[0],y+d[1],z+d[2])===undefined) cnt[i]++; } }
  // Empate => preferir la vertical (+Z primero): en superficies caóticas los lados empatan con
  // el techo y sin esta preferencia saldría +X, extruyendo de lado cuando se espera bajar/subir.
  let bi=4; for(const i of [5,0,1,2,3]) if(cnt[i]>cnt[bi]) bi=i;
  return EX_DIRS[bi];
}
// Extrude por ARRASTRE a lo largo de la NORMAL (exDir): reconstruye cada frame; signo => sentido.
// Trabaja por PLANOS ABSOLUTOS desde la superficie (ref), no capa-a-capa por celda: así un techo
// irregular baja/sube a un plano limpio, sin dejar columnas (pilares) sueltas por el camino.
// steps>=0 => HACIA FUERA (eleva el plano, añade volumen). steps<0 => HACIA DENTRO (aplana, vacía).
function applyExtrudeDrag(steps){
  for(const k of exCells){ const [x,y,z]=k.split(',').map(Number); setVoxel(x,y,z,null); }   // deshacer lo añadido antes
  exCells.clear();
  for(const [k,c] of exCarved){ const [x,y,z]=k.split(',').map(Number); setVoxel(x,y,z,c); }   // restaurar lo vaciado antes
  exCarved.clear();
  let n=Math.abs(steps); const [dx,dy,dz]=exDir;
  const axis = dx?0:dy?1:2, sign = (dx||dy||dz);
  const setAxis=(b,a)=>{ const p=[b.x,b.y,b.z]; p[axis]=a; return p; };
  const surfRef=()=>{ let r = sign>0 ? -1e9 : 1e9;   // plano de la superficie seleccionada (coord del eje)
    for(const b of exBase){ const a=[b.x,b.y,b.z][axis]; r = sign>0 ? Math.max(r,a) : Math.min(r,a); } return r; };
  let ref = surfRef();
  if(steps>=0){
    // HACIA FUERA = ELEVAR: añade n planos ENCIMA de la superficie en TODO el footprint (la cara sube plana).
    ensureExtrudeRoom(axis, sign, ref, ref, n);
    ref = surfRef();   // ensureExtrudeRoom (dir negativa) puede desplazar el mundo → recalcula ref
    for(let L=1; L<=n; L++) for(const b of exBase){
      const p=setAxis(b, ref + sign*L);
      if(p[axis]<0||p[axis]>=[SX,SY,SZ][axis]) continue;
      const k=p.join(',');
      if(getVoxel(p[0],p[1],p[2])===undefined){ setVoxel(p[0],p[1],p[2], b.c); exCells.add(k); }
    }
  } else {
    // HACIA DENTRO = APLANAR: quita los n planos superiores (absolutos desde ref) en TODO el footprint.
    // Tope: nunca comerse el último plano (queda al menos 1 capa; arrastrar de más no vacía el modelo).
    const maxN = sign>0 ? ref : ([SX,SY,SZ][axis]-1-ref);
    n = Math.min(n, Math.max(0,maxN));   // también acota target al reconstruir la selección
    for(let L=0; L<n; L++) for(const b of exBase){
      const p=setAxis(b, ref - sign*L);
      if(p[axis]<0||p[axis]>=[SX,SY,SZ][axis]) continue;
      const c=getVoxel(p[0],p[1],p[2]);
      if(c!==undefined){ exCarved.set(p.join(','), c); setVoxel(p[0],p[1],p[2],null); }
    }
  }
  // reconstruir la selección = nueva superficie de cada columna del footprint (sólido extremo hacia +normal)
  selection.clear();
  const dimA=[SX,SY,SZ][axis], target = ref + (steps>=0 ? sign*n : -sign*n);
  for(const b of exBase){
    for(let a=target; a>=0 && a<dimA; a -= sign){
      const p=setAxis(b,a);
      if(getVoxel(p[0],p[1],p[2])!==undefined){ selection.add(p.join(',')); break; }
    }
  }
}
edit3d.addEventListener('contextmenu',e=>e.preventDefault());
edit3d.addEventListener('pointerdown',e=>{
  edit3d.setPointerCapture(e.pointerId);
  const v=pick3dAt(e);
  if(pasting){                                       // modo pegado (Ctrl+V) en 3D: izq pega en la cara apuntada; otro botón cancela
    if(e.button===0){ const t=buildTargetAt(e, g3d) || v; if(t) pasteAt3d(t); else toast('Apunta a una cara'); }
    else cancelPaste();
    e.preventDefault(); return;
  }
  const panKey=e.ctrlKey||e.metaKey||ctrlHeld, pickKey=e.altKey||altHeld;
  // Prioridad del TECLADO sobre la herramienta: Ctrl = pan · Alt = cuentagotas · der/central = rotar
  if(e.button===0 && panKey){
    pan3d=true; pan3dLast=edit3dPx(e); update3dCursor(); e.preventDefault(); return;
  }
  if(e.button===0 && pickKey){                       // Alt+clic = tomar color del voxel
    if(v){ const c=getVoxel(v.x,v.y,v.z); if(c) chooseColor(c); }
    e.preventDefault(); return;
  }
  if(e.button===1 || (e.button===2 && state.tool!=='select')){   // rotar: botón derecho (o central); con Selección el der deselecciona
    orbiting=true; orbitLast=edit3dPx(e); orbitMoved=false; hover3d=null; update3dCursor(); drawEdit3d(); return;
  }
  // Según la herramienta activa (sin modificador)
  if(e.button===0 && state.tool==='orbit'){          // Giro
    orbiting=true; orbitLast=edit3dPx(e); orbitMoved=false; hover3d=null; update3dCursor(); drawEdit3d(); return;
  }
  if(e.button===0 && state.tool==='hand'){           // Mano
    pan3d=true; pan3dLast=edit3dPx(e); update3dCursor(); e.preventDefault(); return;
  }
  if(e.button===0 && state.tool==='extrude'){        // Extruir la selección (arrastre hacia frente/fondo)
    if(!selection.size){ toast('Selecciona voxels primero'); return; }
    extruding=true; beginGesture();
    exBase=[]; for(const k of selection){ const [x,y,z]=k.split(',').map(Number); exBase.push({x,y,z,c:getVoxel(x,y,z)}); }
    exOcc=new Set(state.voxels.keys()); exCells=new Set(); exCarved=new Map();
    exDir=selectionNormal();                                       // extruir según la normal expuesta
    const p0=g3d.screen(0,0,0), pN=g3d.screen(exDir[0],exDir[1],exDir[2]); exVx=pN[0]-p0[0]; exVy=pN[1]-p0[1];
    exStart=edit3dPx(e); update3dCursor(); e.preventDefault(); return;
  }
  if(e.button===0 && state.tool==='build'){          // Construir: añade un voxel sobre la cara clicada
    buildGeom=snapshotGeom3d();                      // congela la superficie: el arrastre construye una fila plana, no una torre
    const t=buildTargetAt(e, buildGeom);
    if(t){ building=true; beginGesture(); setVoxel(t.x,t.y,t.z,paintValue()); last3dLayer=t.z; buildGhost=null; scheduleEdit3d(); scheduleAux2d(); }
    e.preventDefault(); return;
  }
  if(state.tool==='select'){
    // Shift+clic = añade la región conexa de voxels en la MISMA capa (z) que el clicado
    if(e.button===0 && e.shiftKey && v){
      floodSelectLayer(v); hover3d=v; drawEdit3d(); e.preventDefault(); return;
    }
    // clic izq sobre un voxel YA seleccionado => MOVER la selección (arrastrar en la capa)
    if(e.button===0 && v && selection.has(selKey(v))){
      moving=true; beginGesture(); moveStart=edit3dPx(e); moveApplied={x:0,y:0};
      const p0=g3d.screen(0,0,state.layer), pX=g3d.screen(1,0,state.layer), pY=g3d.screen(0,1,state.layer);
      moveAx=pX[0]-p0[0]; moveAy=pX[1]-p0[1]; moveBx=pY[0]-p0[0]; moveBy=pY[1]-p0[1];
      update3dCursor(); e.preventDefault(); return;
    }
    selecting = (e.button===2) ? 'remove' : 'add';      // izq añade · der quita
    if(!v){ if(selecting==='add' && selection.size){ selection.clear(); drawEdit3d(); } e.preventDefault(); return; } // clic izq fuera = deshacer
    // Arrastre = caja de A (este voxel) a B (el del arrastre). Un clic sin mover = caja A..A = 1 voxel.
    selBox={a:v, b:v, base:new Set(selection), mode:selecting}; applySelBox();
    hover3d=v; drawEdit3d(); e.preventDefault(); return;
  }
  if(e.button===0 && v){
    if(state.tool==='erase') dragGeom=snapshotGeom3d();  // Borrar: congela la superficie para no cavar hacia dentro durante el arrastre
    paint3d=true; beginGesture(); applyTool3d(v); hover3d=v; scheduleEdit3d(); // BUG-P3D1: 1 repintado coalescido (antes 2 render+2 pick síncronos)
  }
});
edit3d.addEventListener('pointermove',e=>{
  if(pasting){                                     // el fantasma de pegado sigue al cursor en 3D (celda-ancla apuntada)
    const t=buildTargetAt(e, g3d) || pick3dAt(e);
    if(t && (!pasteHover3d || pasteHover3d.x!==t.x||pasteHover3d.y!==t.y||pasteHover3d.z!==t.z)){ pasteHover3d={x:t.x,y:t.y,z:t.z}; scheduleEdit3d(); }
    return;
  }
  if(pan3d){                                       // Ctrl+arrastre = desplazar la vista
    const p=edit3dPx(e);
    view3d.panX+=p.px-pan3dLast.px; view3d.panY+=p.py-pan3dLast.py; pan3dLast=p; scheduleEdit3d(); return;
  }
  if(orbiting){                                    // arrastre = orbitar (yaw/pitch libres)
    const p=edit3dPx(e), dx=p.px-orbitLast.px, dy=p.py-orbitLast.py;
    if(Math.abs(dx)+Math.abs(dy)>3) orbitMoved=true;
    view3d.yaw -= dx/edit3d.width*3.2;               // signo acorde al espejo horizontal de la proyección
    view3d.pitch = Math.max(-1.45, Math.min(1.45, view3d.pitch + dy/edit3d.height*3.2));
    if(orbitMoved) leaveCamFront();                  // orbitar con el ratón abandona el bloqueo frontal
    orbitLast=p; scheduleEdit3d(); return;
  }
  if(extruding){                                   // arrastre = extruir hacia frente/fondo (eje Y)
    const p=edit3dPx(e), dx=p.px-exStart.px, dy=p.py-exStart.py, den=exVx*exVx+exVy*exVy;
    applyExtrudeDrag(den>1e-6 ? Math.round((dx*exVx+dy*exVy)/den) : 0);
    scheduleEdit3d(); return;
  }
  if(moving){                                      // arrastre = recolocar la selección en la capa
    const p=edit3dPx(e), dpx=p.px-moveStart.px, dpy=p.py-moveStart.py;
    const det=moveAx*moveBy-moveBx*moveAy;
    if(Math.abs(det)>1e-6){
      const tx=Math.round((dpx*moveBy - moveBx*dpy)/det), ty=Math.round((moveAx*dpy - dpx*moveAy)/det);
      const ddx=tx-moveApplied.x, ddy=ty-moveApplied.y;
      if((ddx||ddy) && moveSel(ddx,ddy,0)){ moveApplied.x=tx; moveApplied.y=ty; scheduleEdit3d(); }
    }
    return;
  }
  if(selecting){                                   // arrastre = caja de A al voxel actual (añade o quita)
    const v=pick3dAt(e);
    if(v && selBox && (v.x!==selBox.b.x||v.y!==selBox.b.y||v.z!==selBox.b.z)){ selBox.b=v; applySelBox(); hover3d=v; }
    scheduleEdit3d(); return;
  }
  if(building){                                    // arrastre = extender la fila sobre la superficie ORIGINAL (geometría congelada), no apilar
    const t=buildTargetAt(e, buildGeom);
    if(t){ setVoxel(t.x,t.y,t.z,paintValue()); last3dLayer=t.z; scheduleEdit3d(); scheduleAux2d(); }
    return;
  }
  if(paint3d){                                     // BUG-P3D1: pick+aplica por evento (muestrea todo el arrastre),
    const v=pick3dAt(e, dragGeom);                  // dragGeom≠null al borrar → traza contra la superficie original (no cava). Pincel: null → geometría viva
    if(v){ applyTool3d(v); hover3d=v; scheduleEdit3d(); }
    return;
  }
  if(state.tool==='build'){                         // Construir: fantasma verde del hueco donde caería el voxel
    const t=buildTargetAt(e);
    const tk=t?t.x+','+t.y+','+t.z:null, gk=buildGhost?buildGhost.x+','+buildGhost.y+','+buildGhost.z:null;
    if(tk!==gk){ buildGhost=t; scheduleEdit3d(); }
    update3dCursor(); return;
  }
  const v=(state.tool==='hand'||state.tool==='orbit'||state.tool==='extrude') ? null : pick3dAt(e);   // sin resaltado con herramientas de vista/extrude
  const nk=v?v.x+','+v.y+','+v.z:null, ck=hover3d?hover3d.x+','+hover3d.y+','+hover3d.z:null;
  if(nk!==ck){ hover3d=v; scheduleEdit3d(); }
  update3dCursor();
});
function end3d(){
  const wasPaint=paint3d||building;
  if(paint3d||building) endGesture();
  if(moving || extruding){ endGesture(); render(); }
  const wasView=orbiting||pan3d;
  paint3d=false; building=false; buildGeom=null; dragGeom=null; selecting=false; selBox=null; orbiting=false; pan3d=false; moving=false; extruding=false;
  if(wasPaint && _aux2dDefer){ _aux2dDefer=false; scheduleAux2d(); }  // paneles 2D/mini/info diferidos al soltar
  if(wasView||wasPaint) drawEdit3d();                // volver a resolución completa tras arrastre de vista o pincel
  update3dCursor();
}
edit3d.addEventListener('pointerup',end3d);
edit3d.addEventListener('pointerleave',()=>{ end3d(); if(hover3d){ hover3d=null; drawEdit3d(); } if(buildGhost){ buildGhost=null; drawEdit3d(); } });
// zoom con la rueda, centrado en el cursor
function zoom3dAt(cx,cy,factor){
  const z0=view3d.zoom; view3d.zoom=Math.max(0.3, Math.min(32, z0*factor));   // hasta 32 (3200%): se ve el interior
  const f=view3d.zoom/z0, W=edit3d.width, H=edit3d.height;
  view3d.panX = cx - W/2 - (cx - W/2 - view3d.panX)*f;
  view3d.panY = cy - H/2 - (cy - H/2 - view3d.panY)*f;
  drawEdit3d();
}
edit3d.addEventListener('wheel',e=>{
  e.preventDefault();
  const {px,py}=edit3dPx(e);
  zoom3dAt(px,py, e.deltaY<0 ? 1.12 : 1/1.12);
},{passive:false});

// herramientas (sincroniza panel izquierdo y barra flotante 3D)
let prevTool='paint';                       // herramienta previa a elegir Color (para volver a ella)
function setTool(t){
  if(t==='pick' && state.tool!=='pick') prevTool=state.tool;
  if(t!=='build' && buildGhost){ buildGhost=null; if(mode==='3d') scheduleEdit3d(); }  // limpia el fantasma al salir de Construir
  state.tool=t;
  document.querySelectorAll('#tools .tool, #tool-float .tool')
    .forEach(b=>b.classList.toggle('is-active', b.dataset.tool===t));
  if(mode==='3d'){
    $('#stage-hint').textContent = (
      t==='hand'   ? 'arrastra para desplazar la vista' :
      t==='extrude' ? 'extruye la selección según su normal (arrastra, o ↑ fuera / ↓ dentro)' :
      t==='select' ? 'selecciona (izq) · deselecciona (der) · arrastra o flechas mueve · Supr elimina' :
                     'clic aplica la herramienta al voxel'
    ) + ' · botón der. rota · Alt+clic color · Ctrl+arrastre mueve · rueda zoom (acerca para ver el interior)';
    update3dCursor();
  } else {
    editCv.style.cursor = (t==='hand'||ctrlHeld) ? 'grab' : 'crosshair';
  }
}
function onToolClick(e){
  const b=e.target.closest('.tool'); if(!b) return;
  // "Borrar" con una selección activa => borra los seleccionados (no cambia de herramienta)
  if(b.dataset.tool==='erase' && deleteSelection()) return;
  // "Cubo de pintura" con una selección activa => pinta los seleccionados del color actual
  if(b.dataset.tool==='fill' && paintSelection()) return;
  setTool(b.dataset.tool);
}
$('#tools').addEventListener('click', onToolClick);
$('#tool-float').addEventListener('click', onToolClick);
// Botón derecho sobre "Selección" => deseleccionar todos los voxels
function onToolContext(e){
  const b=e.target.closest('.tool'); if(!b) return;
  if(b.dataset.tool==='select'){
    e.preventDefault();
    if(selection.size){ selection.clear(); render(); toast('Selección vaciada'); }
  }
}
$('#tools').addEventListener('contextmenu', onToolContext);
$('#tool-float').addEventListener('contextmenu', onToolContext);

// capas
function setLayer(z){ state.layer=Math.max(0,Math.min(SZ-1,z)); syncLayer(); render(); }
$('#layer-up').onclick   =()=>setLayer(state.layer+1);
$('#layer-down').onclick =()=>setLayer(state.layer-1);
$('#layer-slider').oninput=e=>setLayer(+e.target.value);
$('#layer-clear').onclick=()=>{
  edit(()=>{ for(let x=0;x<SX;x++)for(let y=0;y<SY;y++) setVoxel(x,y,state.layer,null); });
  render(); toast('Capa '+(state.layer+1)+' vaciada');
};

// rotación
$('#rot-left').onclick =()=>{ state.rot=(state.rot+3)&3; drawIso(); };
$('#rot-right').onclick=()=>{ state.rot=(state.rot+1)&3; drawIso(); };

// Botones ▲▼ solo en Capas; en 3D la capa del aislado se cambia con rueda/arrastre en la miniatura
function updateLayerFloat(){
  $('#layer-float').hidden = (mode==='3d');
  isoCv.style.cursor = ((mode!=='3d')||isoOn()) ? 'ns-resize' : 'default';
}
// Botones flotantes de capa
$('#lf-up').onclick   =()=>setLayer(state.layer+1);
$('#lf-down').onclick =()=>setLayer(state.layer-1);
// Toggles de aislado: 'upto' (hasta la capa) y 'only' (solo la capa); excluyentes
function setIsolate(m){
  isolateMode = (isolateMode===m) ? 'off' : m;
  $('#iso-isolate').classList.toggle('on', isolateMode==='upto');
  $('#iso-only').classList.toggle('on', isolateMode==='only');
  updateLayerFloat();
  drawIso(); if(mode==='3d') drawEdit3d();
}
$('#iso-isolate').onclick=()=>setIsolate('upto');
$('#iso-only').onclick   =()=>setIsolate('only');

// Cambiar de capa desde la miniatura 3D: arrastre vertical o rueda (como cortes transversales)
let isoDrag=false, isoStartY=0, isoStartLayer=0;
isoCv.addEventListener('pointerdown',e=>{
  if(mode==='3d' && !isoOn()) return;
  isoCv.setPointerCapture(e.pointerId); isoDrag=true;
  isoStartY=e.clientY; isoStartLayer=state.layer; e.preventDefault();
});
isoCv.addEventListener('pointermove',e=>{
  if(!isoDrag) return;
  const r=isoCv.getBoundingClientRect();
  const step=(isoGeom&&isoGeom.V)||12;                 // 1 capa = altura de un voxel en pantalla
  const dyDev=(isoStartY-e.clientY)*(isoCv.height/r.height);
  const nz=isoStartLayer+Math.round(dyDev/step);       // arrastrar arriba = subir capa
  if(nz!==state.layer && nz>=0 && nz<SZ) setLayer(nz);
});
isoCv.addEventListener('pointerup',()=>{ isoDrag=false; });
isoCv.addEventListener('pointerleave',()=>{ isoDrag=false; });
isoCv.addEventListener('wheel',e=>{
  if(mode==='3d' && !isoOn()) return;
  e.preventDefault(); setLayer(state.layer + (e.deltaY<0?1:-1));
},{passive:false});

// ---- Modal vista 3D grande ----
const bigCv=$('#iso-big'), bigctx=bigCv.getContext('2d'), modalEl=$('#iso-modal');
function sizeBig(){
  const st=document.querySelector('.modal-stage');
  const dpr=Math.min(2, window.devicePixelRatio||1);
  const w=Math.max(320, st.clientWidth-24), h=Math.max(320, st.clientHeight-24);
  bigCv.style.width=w+'px'; bigCv.style.height=h+'px';
  bigCv.width=Math.round(w*dpr); bigCv.height=Math.round(h*dpr);
}
const bigHalf=document.createElement('canvas');
function drawIsoBig(){
  const W=bigCv.width, H=bigCv.height;
  if((mdrag||mrot) && bigModel()){                   // arrastre en modelos grandes: media resolución
    const w2=W>>1, h2=H>>1;
    if(bigHalf.width!==w2||bigHalf.height!==h2){ bigHalf.width=w2; bigHalf.height=h2; }
    const half={yaw:modalView.yaw,pitch:modalView.pitch,zoom:modalView.zoom,panX:modalView.panX/2,panY:modalView.panY/2,persp:modalView.persp};
    renderFree3d(bigHalf.getContext('2d'), w2,h2, half, modalSeams, skyArg(), shadowArg());
    bigctx.clearRect(0,0,W,H); bigctx.imageSmoothingEnabled=false; bigctx.drawImage(bigHalf,0,0,W,H);
    return;
  }
  renderFree3d(bigctx, W, H, modalView, modalSeams, skyArg(), shadowArg());
}
function syncGridBtn(){ $('#modal-grid').textContent = modalSeams ? '▦ Ocultar rejilla' : '▢ Mostrar rejilla'; }
function updateModalZoom(){ const el=$('#modal-zoom'); if(el) el.textContent=Math.round(modalView.zoom*100)+'%'; }
function modalZoomAt(px,py,factor){
  const cx=bigCv.width/2, cy=bigCv.height/2;
  const dx=px-cx-modalView.panX, dy=py-cy-modalView.panY;
  const z0=modalView.zoom; modalView.zoom=Math.max(0.3, Math.min(32, z0*factor));   // hasta 32 (3200%): se ve el interior
  const r=modalView.zoom/z0;
  modalView.panX=px-cx-dx*r; modalView.panY=py-cy-dy*r;
  updateModalZoom(); drawIsoBig();
}
function resetModalView(){ modalView.zoom=1; modalView.panX=0; modalView.panY=0; updateModalZoom(); drawIsoBig(); }
function openModal(){
  modalOpen=true; modalEl.hidden=false;
  modalView.yaw=view3d.yaw; modalView.pitch=view3d.pitch;   // abre al ángulo de la vista de edición
  modalView.persp=view3d.persp;                             // ...y con la misma proyección (cónica si lo estaba)
  modalView.zoom=1; modalView.panX=0; modalView.panY=0;
  $('#modal-name').textContent=state.meta.name||'Vista 3D';
  $('#modal-sub').textContent=state.meta.role||'';
  syncGridBtn(); updateModalZoom(); sizeBig(); drawIsoBig();
}
function stopSpin(){ if(spinTimer){ clearInterval(spinTimer); spinTimer=null; $('#modal-spin').textContent='▶ Girar'; } }
function closeModal(){ modalOpen=false; stopSpin(); modalEl.hidden=true; }
$('#iso-expand').onclick=openModal;
$('#iso-expand2').onclick=openModal;
$('#modal-close').onclick=closeModal;
$('#modal-rot-left').onclick =()=>{ modalView.yaw+=Math.PI/4; drawIsoBig(); };
$('#modal-rot-right').onclick=()=>{ modalView.yaw-=Math.PI/4; drawIsoBig(); };
$('#modal-grid').onclick=()=>{ modalSeams=!modalSeams; syncGridBtn(); drawIsoBig(); };
function syncSkyBtn(){ const b=$('#modal-sky'); if(b) b.classList.toggle('on', skyOn);
  const c=$('#modal-sky-color'); if(c){ c.value=skyColor; c.hidden=!skyOn; } }
$('#modal-sky').onclick=()=>{ skyOn=!skyOn; localStorage.setItem('vf_sky', skyOn?'1':'0'); syncSkyBtn(); drawIsoBig(); };
$('#modal-sky-color').oninput=e=>{ skyColor=e.target.value; localStorage.setItem('vf_sky_color', skyColor); if(skyOn) drawIsoBig(); };
syncSkyBtn();
function syncShadowBtn(){ const b=$('#modal-shadow'); if(b) b.classList.toggle('on', shadowOn); }
if($('#modal-shadow')) $('#modal-shadow').onclick=()=>{ shadowOn=!shadowOn; localStorage.setItem('vf_shadow', shadowOn?'1':'0'); syncShadowBtn(); drawIsoBig(); };
syncShadowBtn();
$('#modal-zoom-in').onclick =()=>modalZoomAt(bigCv.width/2, bigCv.height/2, 1.12);
$('#modal-zoom-out').onclick=()=>modalZoomAt(bigCv.width/2, bigCv.height/2, 1/1.12);
$('#modal-zoom-reset').onclick=resetModalView;
// Ctrl+arrastre = rotar (libre); arrastre = pan; rueda = zoom al cursor
function bigPx(e){ const r=bigCv.getBoundingClientRect(); return {px:(e.clientX-r.left)/r.width*bigCv.width, py:(e.clientY-r.top)/r.height*bigCv.height}; }
let mrot=false;
bigCv.style.cursor='grab';
bigCv.addEventListener('pointerdown',e=>{
  bigCv.setPointerCapture(e.pointerId); mlast=bigPx(e);
  mrot = e.ctrlKey||e.metaKey||ctrlHeld;             // Ctrl = rotar, si no pan
  mdrag = !mrot;
  bigCv.style.cursor = mrot ? CURSORS.orbit : 'grabbing';
});
bigCv.addEventListener('pointermove',e=>{
  if(!mdrag && !mrot) return;
  const p=bigPx(e), dx=p.px-mlast.px, dy=p.py-mlast.py; mlast=p;
  if(mrot){ modalView.yaw -= dx/bigCv.width*3.2; modalView.pitch=Math.max(-1.45,Math.min(1.45, modalView.pitch + dy/bigCv.height*3.2)); }
  else    { modalView.panX+=dx; modalView.panY+=dy; }
  drawIsoBig();
});
bigCv.addEventListener('pointerup',()=>{ const was=mdrag||mrot; mdrag=false; mrot=false; if(was) drawIsoBig(); bigCv.style.cursor=ctrlHeld?CURSORS.orbit:'grab'; });
bigCv.addEventListener('wheel',e=>{ e.preventDefault(); const {px,py}=bigPx(e); modalZoomAt(px,py, e.deltaY<0?1.12:1/1.12); },{passive:false});
$('#modal-spin').onclick=()=>{
  if(spinTimer) stopSpin();
  else { $('#modal-spin').textContent='⏸ Parar'; spinTimer=setInterval(()=>{ modalView.yaw+=0.05; drawIsoBig(); }, 40); }
};
modalEl.addEventListener('click',e=>{ if(e.target===modalEl) closeModal(); });  // clic fuera cierra
window.addEventListener('resize',()=>{ if(modalOpen){ sizeBig(); drawIsoBig(); } });

// meta
$('#meta-name').oninput=e=>state.meta.name=e.target.value;
$('#meta-type').onchange=e=>state.meta.type=e.target.value;

// tamaño del objeto (X×Y×Z)
$('#size-apply').onclick=()=>{
  const clamp=v=>Math.max(1,Math.min(128,Math.round(+v)||1));
  const x=clamp($('#size-x').value), y=clamp($('#size-y').value), z=clamp($('#size-z').value);
  const lost=[...state.voxels.keys()].some(k=>{const[a,b,c]=k.split(',').map(Number);return a>=x||b>=y||c>=z;});
  if(lost && !confirm('Reducir el tamaño recortará los voxels que queden fuera. ¿Continuar?')){
    setSize(SX,SY,SZ); return;   // revierte los inputs
  }
  resizeGrid(x,y,z);
  toast('Tamaño '+x+'×'+y+'×'+z);
};
// Girar el objeto 90° sobre cada eje
$('#rotobj-x').onclick=()=>{ rotateModel('x',1); toast('Girado en X'); };
$('#rotobj-y').onclick=()=>{ rotateModel('y',1); toast('Girado en Y'); };
$('#rotobj-z').onclick=()=>{ rotateModel('z',1); toast('Girado en Z'); };

// color custom (los controles de alpha/emisivo se enlazan con guardas: si el index.html está cacheado y no
// existen aún, no deben abortar el resto de la inicialización —tirarían de todos los botones/herramientas—).
$('#color-custom').oninput=e=>pickColorPalette(e.target.value);
{ const _ca=$('#color-alpha'); if(_ca) _ca.oninput=e=>{ state.alpha=(+e.target.value)/100; if(state.tex) state.tex=null; syncColor(); }; }  // opacidad del pincel (translúcido en el Mundo)
{ const _be=$('#btn-emit'); if(_be) _be.onclick=()=>{ state.emit=!state.emit; if(state.tex) state.tex=null; syncColor(); }; }                // alterna pincel emisivo

// acciones cabecera
$('#btn-undo').onclick=undo;
$('#btn-redo').onclick=redo;
$('#btn-nuevo').onclick=()=>{ if(confirm('¿Vaciar el objeto actual?')) load(new Map(),{name:'Objeto sin título',type:'objeto'}); };
$('#btn-guardar').onclick=save;
$('#btn-guardar-como').onclick=saveAs;
$('#btn-exportar').onclick=exportJSON;
$('#file-importar').onchange=e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value=''; };

// plantillas
document.querySelector('.templates').addEventListener('click',e=>{
  const b=e.target.closest('.chip'); if(!b) return;
  const p=b.dataset.preset;
  load(PRESETS[p](), {name:b.textContent.trim().replace(/^\S+\s/,''), type:p==='slime'?'personaje':'objeto'});
});

// tabs: Habitantes abre la galería; Habitaciones/Mapa mock
$('#tabs').addEventListener('click',e=>{
  const t=e.target.closest('.tab'); if(!t) return;
  if(t.dataset.tab==='habitantes'){ openHabitantes('habitante'); return; }    // overlay, no cambia de pestaña
  if(t.dataset.tab==='objetos'){ openHabitantes('objeto'); return; }          // overlay galería de objetos
  if(t.dataset.tab==='habitaciones'){ openHabitantes('habitacion'); return; } // overlay galería de habitaciones
  if(t.dataset.tab==='texturas'){ openHabitantes('textura'); return; }         // overlay galería de texturas
  if(t.dataset.tab==='mapa'){ openMapa(); return; }                            // overlay mapa del mundo
  if(t.dataset.tab==='jugar'){ quickPlay(); return; }                          // jugar ya (sala + personaje al azar)
  if(t.dataset.tab==='mundo'){ openWorld(); return; }                          // sandbox 3D en primera persona (WebGL)
  if(t.dataset.tab==='codigo'){ openSnips(); return; }                         // gestor de snippets de código
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('is-active',x===t));
  if(t.dataset.tab!=='objeto') toast('Vista mock — el MVP se centra en el editor de objeto');
});
$('#btn-habitantes').onclick=()=>openHabitantes('habitante');
$('#btn-habitaciones').onclick=()=>openHabitantes('habitacion');
$('#btn-texturas').onclick=()=>openHabitantes('textura');
$('#hab-close').onclick=closeHabitantes;
$('#hab-refresh').onclick=()=>openHabitantes();   // reusa el tipo actual
$('#hab-modal').addEventListener('click',e=>{ if(e.target.id==='hab-modal') closeHabitantes(); });

// atajos
window.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !$('#mc-modal').hidden){                               // Mundo (REQ-MC): Esc de 2 pasos
    if(!$('#snip-modal').hidden){ closeSnips(); return; }                         // 1º si el modal de código está abierto → cerrarlo
    if(!$('#mc-note').hidden){ mcCloseNote(); return; }                         // 1º si el editor de nota está abierto → cerrarlo
    if(!$('#mc-picker').hidden){ mcClosePicker(); return; }                     // 1º si el selector está abierto → cerrarlo
    if(mc.active && (document.pointerLockElement===mc.canvas || performance.now()-mc.unlockedAt<350)){ document.exitPointerLock(); return; } // 1º Esc: suelta el ratón, NO cierra
    closeWorld(); return;                                                       // 2º Esc (ratón ya libre): cierra el Mundo
  }
  if(!$('#mc-modal').hidden) return;                                            // en Mundo, los atajos del editor no aplican
  if(e.key==='Escape' && !$('#play-modal').hidden){ closePlay(); return; }
  if(e.key==='Escape' && !$('#room-modal').hidden){ closeRoom(); return; }
  if(!$('#room-modal').hidden && (e.key==='Delete'||e.key==='Backspace') && roomSelHab>=0){
    e.preventDefault(); const habs=mapa.cells[roomCell].habs; habs.splice(roomSelHab,1); roomSelHab=-1; updateRoomDel(); renderRoomCanvas(); saveMapa(); return;
  }
  if(e.key==='Escape' && !$('#mapa-picker').hidden){ closePicker(); return; }
  if(e.key==='Escape' && !$('#snip-modal').hidden){ closeSnips(); return; }
  if(e.key==='Escape' && !$('#mapa-modal').hidden){ closeMapa(); return; }
  if(e.key==='Escape' && !$('#hab-modal').hidden){ closeHabitantes(); return; }
  if(e.key==='Escape' && modalOpen){ closeModal(); return; }
  if(e.key==='Escape' && cancelPaste()) return;      // Esc cancela la colocación de un pegado
  if(e.target.matches('input,select,textarea')) return;
  if(modalOpen){
    if(e.key.toLowerCase()==='r'){ modalView.yaw+=Math.PI/4; drawIsoBig(); }
    else if(e.key.toLowerCase()==='f') closeModal();
    else if(e.key==='+'||e.key==='=') modalZoomAt(bigCv.width/2, bigCv.height/2, 1.12);
    else if(e.key==='-'||e.key==='_') modalZoomAt(bigCv.width/2, bigCv.height/2, 1/1.12);
    else if(e.key==='0') resetModalView();
    return;
  }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a'){ e.preventDefault(); selectAll(); return; }           // seleccionar todos los voxels (2D Capas y 3D)
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){ if(copySelection()) e.preventDefault(); return; }   // copiar selección (2D Capas y 3D comparten `selection`)
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){ if(startPaste()) e.preventDefault(); return; }       // pegar (modo colocación · Capas y 3D)
  if(e.key==='Delete'||e.key==='Backspace'){ if(deleteSelection()) return; }
  // flechas con selección: extruir (herramienta Extruir) o recolocar (resto)
  if(selection.size){
    if(state.tool==='extrude'){
      if(e.key==='ArrowUp'||e.key==='ArrowDown'){                  // ↑ hacia fuera (eleva) · ↓ hacia dentro (aplana)
        e.preventDefault(); const dir = e.key==='ArrowUp' ? 1 : -1;
        edit(()=>{                                                 // un paso planar, mismo motor que el arrastre
          exBase=[]; for(const k of selection){ const [x,y,z]=k.split(',').map(Number); exBase.push({x,y,z,c:getVoxel(x,y,z)}); }
          exCells=new Set(); exCarved=new Map(); exDir=selectionNormal();
          applyExtrudeDrag(dir);
        });
        render(); return;
      }
    } else {
      const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(d){ e.preventDefault(); edit(()=>moveSel(d[0],d[1],0)); render(); return; }
    }
  }
  // en 3D (sin selección que recolocar) ←/→ giran la vista como los botones #e3-rot-left/right
  if(mode==='3d' && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
    e.preventDefault();
    view3d.yaw += (e.key==='ArrowLeft' ? Math.PI/4 : -Math.PI/4);
    hover3d=null; buildGhost=null; drawEdit3d(); return;
  }
  const map={b:'paint',e:'erase',i:'pick',g:'fill',s:'select',h:'hand',o:'orbit',x:'extrude',c:'build'};
  if(map[e.key]){ setTool(map[e.key]); }
  else if(e.key===']') setLayer(state.layer+1);
  else if(e.key==='[') setLayer(state.layer-1);
  else if(e.key.toLowerCase()==='r'){ state.rot=(state.rot+1)&3; drawIso(); }
  else if(e.key.toLowerCase()==='f') openModal();
  else if(e.key==='+'||e.key==='=') { if(mode==='3d') zoom3dAt(edit3d.width/2, edit3d.height/2, 1.12); else zoomAt(editCv.width/2, editCv.height/2, 1.12); }
  else if(e.key==='-'||e.key==='_') { if(mode==='3d') zoom3dAt(edit3d.width/2, edit3d.height/2, 1/1.12); else zoomAt(editCv.width/2, editCv.height/2, 1/1.12); }
  else if(e.key==='0') resetView();
});

// ===================== Init =====================
function buildPalette(){
  buildPalettePicker();
  const p=$('#palette');
  p.innerHTML='';
  PALETTES[paletteId].colors.forEach(([c,name])=>{
    const d=document.createElement('div');
    d.className='sw'; d.style.background=c; d.dataset.c=c; d.title=name+' · '+c;
    d.onclick=()=>pickColorPalette(c);
    p.appendChild(d);
  });
  syncColor();   // remarca la muestra activa si el color actual sigue en la paleta
}
// Rellena el <select> de paletas una sola vez y refleja la elegida.
function buildPalettePicker(){
  const sel=$('#palette-picker'); if(!sel) return;
  if(!sel.options.length){
    for(const [id,pal] of Object.entries(PALETTES)){
      const o=document.createElement('option');
      o.value=id; o.textContent=pal.emoji+' '+pal.name;
      sel.appendChild(o);
    }
    sel.onchange=()=>setPalette(sel.value);
  }
  sel.value=paletteId;
}
// Cambia la paleta activa: recuerda la elección, redibuja las muestras.
function setPalette(id){
  if(!PALETTES[id]) return;
  paletteId=id;
  PALETTE=PALETTES[id].colors.map(c=>c[0]);
  try{ localStorage.setItem('vf_palette',id); }catch(e){}
  buildPalette();
}
// Habitaciones = assets del servidor de tipo 'bloque' (Habitantes lo llena refreshHabitantesList()).
// Recibe el índice ya cargado por loadServerAssets, o lo pide si se llama suelto.
async function loadRooms(idx){
  const ul=$('#roster-habitaciones'); if(!ul) return;
  try{
    if(!idx) idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
    const rooms=idx.filter(a=>a.type==='bloque');
    let saved=[]; try{ saved=(await apiHabitantes()).filter(h=>h.type==='bloque'); }catch(e){}   // guardadas por el usuario
    ul.innerHTML='';
    if(!rooms.length && !saved.length){ ul.innerHTML='<li class="muted">(sin habitaciones)</li>'; return; }
    rooms.forEach(a=>{
      const li=document.createElement('li');
      li.innerHTML=`<span class="ic">${a.icon||'🏠'}</span>${a.name}<span class="badge">asset</span>`;
      li.title='Cargar «'+a.name+'»';
      li.onclick=()=>loadFromUrl(a.file);
      ul.appendChild(li);
    });
    saved.forEach(h=>{
      const li=document.createElement('li');
      li.innerHTML=`<span class="ic">${h.icon||'🏠'}</span><div><span>${esc(h.name)}</span>`+
                   `<span class="badge" style="margin:0">guardada</span></div>`;
      li.title='Cargar «'+h.name+'»';
      li.onclick=()=>loadHabitante(h.id);
      ul.appendChild(li);
    });
  }catch(e){ ul.innerHTML='<li class="muted">Sirve por HTTP para cargar habitaciones</li>'; }
}

// ================== MAPA DEL MUNDO (F2) ==================
// Modelo: {cols,rows,cells:{"col,row":{room:<key>|null, habs:[{ref,x,y}]}}}
// key de habitación: 'asset:<file>' (asset del server) | 'hab:<id>' (habitación guardada).
let mapa=null, mapaCatalog=null, mapaSel=null;
const roomDataCache=new Map();     // key -> objeto {voxels,...}

async function getRoomData(key){
  if(roomDataCache.has(key)) return roomDataCache.get(key);
  const p=(async()=>{
    if(key.startsWith('asset:')) return fetch(key.slice(6),{cache:'no-store'}).then(r=>r.json());
    if(key.startsWith('hab:'))   return fetch('/api/habitantes/'+key.slice(4),{cache:'no-store'}).then(r=>r.json());
    return {voxels:{}};
  })();
  roomDataCache.set(key,p); return p;
}

// --- Defs de textura (comparten resolución/caché con getRoomData) ---
const texDefs=new Map();               // clave -> {size, voxels} de la textura ya resuelta
function computeTexRepr(def){          // color medio del bloque: representativo para 2D/tira
  let R=0,G=0,B=0,n=0;
  for(let c of Object.values(def.voxels||{})){ if(typeof c!=='string') continue; if(c[0]==='*') c=c.slice(1); if(c[0]!=='#') continue; const v=parseInt(c.slice(1,7),16); R+=v>>16&255; G+=v>>8&255; B+=v&255; n++; }
  if(!n) return '#8a8f94';
  return '#'+((1<<24)+((R/n&255)<<16)+((G/n&255)<<8)+(B/n&255)).toString(16).slice(1);
}
// El `size` de un doc puede ser escalar (texturas de fábrica, 16) o {x,y,z} (formato del editor).
// Una textura es cúbica: normaliza a un entero N>0 válido para createImageData/proyección.
function texSize(sz){
  let n = (sz && typeof sz==='object') ? (sz.x ?? sz.w ?? sz.size) : sz;
  n = Math.round(+n);
  return (Number.isFinite(n) && n>0) ? n : 16;
}
async function getTexDef(key){
  if(texDefs.has(key)) return texDefs.get(key);
  const d=await getRoomData(key);
  const def={ size:texSize(d.size), voxels:d.voxels||{} };
  texDefs.set(key,def); texReprCache.set(key, computeTexRepr(def));
  return def;
}
// Olvida todo lo cacheado de una textura (tras editarla y re-guardarla) => se recarga fresca
function invalidateTex(key){ texDefs.delete(key); texFaceCache.delete(key); texReprCache.delete(key); roomDataCache.delete(key); e3baseKey=''; }
// Rehidrata texturas embebidas en un modelo cargado: pobla defs+caché+repr (render offline)
function ingestTextures(doc){
  if(!doc || !doc.textures) return;
  for(const [k,def] of Object.entries(doc.textures)){
    const d={ size:texSize(def.size), voxels:def.voxels||{} };
    texDefs.set(k,d); texReprCache.set(k, computeTexRepr(d));
    roomDataCache.set(k, Promise.resolve(d));
  }
}
async function buildRoomCatalog(){
  const cat=[];
  try{ const idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
    idx.filter(a=>a.type==='bloque').forEach(a=>cat.push({key:'asset:'+a.file, name:a.name, icon:a.icon||'🏠', badge:'asset'})); }catch(e){}
  try{ (await apiHabitantes()).filter(h=>h.type==='bloque').forEach(h=>cat.push({key:'hab:'+h.id, name:h.name, icon:h.icon||'🏠', badge:'guardada'})); }catch(e){}
  mapaCatalog=cat; return cat;
}
function catEntry(key){ return (mapaCatalog||[]).find(c=>c.key===key); }

// ================== TEXTURAS (pinceles-objeto) ==================
// Una textura es un objeto de tipo 'textura'. Su id de pincel es la clave getRoomData
// ('asset:<file>' | 'hab:<id>'); el voxel pintado guardará 'tex:'+clave (F2/F3).
let texItems=[];                 // texturas cargadas {key,name,icon,group}
let texCat=null;                 // categoría activa del desplegable
async function refreshTexturas(idx){
  const strip=$('#texstrip'); if(!strip) return;
  try{
    if(!idx) idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
    const assets=idx.filter(a=>a.type==='textura').map(a=>({key:'asset:'+a.file, name:a.name, icon:a.icon||'🎨', group:a.group||'Básicas'}));
    let saved=[]; try{ saved=(await apiHabitantes()).filter(h=>h.type==='textura').map(h=>({key:'hab:'+h.id, name:h.name, icon:h.icon||'🎨', group:'Mis texturas'})); }catch(e){}
    texItems=assets.concat(saved);
    buildTexCatPicker();          // llena/actualiza el <select> de categorías (como el de paletas)
    renderTexStrip();             // pinta solo las chips de la categoría activa
  }catch(e){ strip.innerHTML='<span class="muted">Sirve por HTTP para ver texturas</span>'; }
}
// Rellena el desplegable con las categorías presentes (orden de aparición) y recuerda la elegida.
function buildTexCatPicker(){
  const sel=$('#tex-cat'); if(!sel) return;
  const groups=[]; for(const it of texItems) if(!groups.includes(it.group)) groups.push(it.group);
  sel.innerHTML='';
  for(const g of groups){ const o=document.createElement('option'); o.value=g; o.textContent=g; sel.appendChild(o); }
  if(!texCat || !groups.includes(texCat)){
    let s=null; try{ s=localStorage.getItem('vf_texcat'); }catch(e){}
    texCat=(s && groups.includes(s)) ? s : groups[0];
  }
  sel.value=texCat||'';
  sel.hidden=groups.length<2;     // sin desplegable si solo hay una categoría
  sel.onchange=()=>{ texCat=sel.value; try{ localStorage.setItem('vf_texcat',texCat); }catch(e){} renderTexStrip(); };
}
// Pinta la tira con las texturas de la categoría activa.
function renderTexStrip(){
  const strip=$('#texstrip'); if(!strip) return;
  const items=texItems.filter(it=>it.group===texCat);
  strip.innerHTML='';
  if(!items.length){ strip.innerHTML='<span class="muted">(sin texturas)</span>'; return; }
  for(const it of items){
    const b=document.createElement('button');
    b.className='texchip'+(state.tex===it.key?' is-active':'');
    b.title=it.name; b.dataset.key=it.key;
    const cv=document.createElement('canvas'); cv.width=cv.height=34; b.appendChild(cv);
    b.onclick=()=>chooseTex(it.key);
    b.onmouseenter=()=>showTexPreview(it, b);   // vista previa grande al pasar por encima
    b.onmouseleave=hideTexPreview;
    strip.appendChild(b);
    getRoomData(it.key).then(d=>drawThumb(cv,d)).catch(()=>{});   // miniatura iso real
  }
}
// Popup de vista previa (miniatura grande) junto al chip apuntado.
function showTexPreview(it, anchor){
  const pv=$('#tex-preview'); if(!pv) return;
  pv.querySelector('.tp-name').textContent=(it.icon?it.icon+' ':'')+it.name;
  getRoomData(it.key).then(d=>drawThumb(pv.querySelector('canvas'), d)).catch(()=>{});
  pv.hidden=false;
  const r=anchor.getBoundingClientRect(), pw=pv.offsetWidth||184, ph=pv.offsetHeight||210;
  let x=r.right+10; if(x+pw>innerWidth-6) x=r.left-pw-10;   // a la derecha del chip, o a la izquierda si no cabe
  const y=Math.max(6, Math.min(innerHeight-ph-6, r.top+r.height/2-ph/2));
  pv.style.left=x+'px'; pv.style.top=y+'px';
}
function hideTexPreview(){ const pv=$('#tex-preview'); if(pv) pv.hidden=true; }
// Activa una textura como pincel; al pintar se escribe 'tex:'+key. Elegir un color la desactiva.
function chooseTex(key){
  state.tex=key;
  getTexDef(key).then(()=>syncColor()).catch(()=>{});   // asegura def + color representativo cargados
  syncColor();
}

// ---- Composición con escala (F4): habitación + habitantes reducidos, de pie sobre el suelo ----
// Downsample no destructivo: cada bloque f³ -> color mayoritario, si el bloque está bastante lleno.
function downsampleVox(d, f){
  const s=d.size||32, dim=(typeof s==='number')?{x:s,y:s,z:s}:s;
  const blocks=new Map();                       // "bx,by,bz" -> Map(color->conteo)
  for(const k in (d.voxels||{})){ const [x,y,z]=k.split(',').map(Number);
    const bk=Math.floor(x/f)+','+Math.floor(y/f)+','+Math.floor(z/f);
    let b=blocks.get(bk); if(!b){ b=new Map(); blocks.set(bk,b); }
    const c=d.voxels[k]; b.set(c,(b.get(c)||0)+1);
  }
  const minFill=Math.max(2, Math.round(f*f*f*0.10));   // evita inflar detalles finos a un pegote
  const out={}; let ex=0,ey=0,ez=0;
  for(const [bk,counts] of blocks){
    let best=null,bn=0,tot=0; for(const [c,n] of counts){ tot+=n; if(n>bn){bn=n;best=c;} }
    if(tot<minFill) continue;
    out[bk]=best; const [bx,by,bz]=bk.split(',').map(Number);
    ex=Math.max(ex,bx+1); ey=Math.max(ey,by+1); ez=Math.max(ez,bz+1);
  }
  return {voxels:out, ext:{x:ex,y:ey,z:ez}, dim:{x:Math.ceil(dim.x/f),y:Math.ceil(dim.y/f),z:Math.ceil(dim.z/f)}};
}
// Devuelve {voxels, size} = habitación + habitantes (habEntries=[{h:{x,y,ref}, d:datosHab}]) compuestos.
function composeRoomData(roomData, habEntries){
  const rs=roomData.size||28, rdim=(typeof rs==='number')?{x:rs,y:rs,z:rs}:rs;
  const native=rdim.x>=64;                     // sala a escala de personaje => personaje NATIVO
  const standZ=native?4:1;                     // losa de suelo 4 en las salas nativas
  const voxels={}; for(const k in (roomData.voxels||{})) voxels[k]=roomData.voxels[k];
  for(const {h,d} of (habEntries||[])){
    const ds=native ? (()=>{ const c=charShell(d); return {voxels:c.voxels, ext:c.ext}; })() : downsampleVox(d,4);
    const cx=Math.floor(ds.ext.x/2), cy=Math.floor(ds.ext.y/2);   // centra la huella en (h.x,h.y)
    for(const k in ds.voxels){ const [lx,ly,lz]=k.split(',').map(Number);
      const wx=h.x+(lx-cx), wy=h.y+(ly-cy), wz=standZ+lz;         // de pie sobre el suelo
      if(wx<0||wy<0||wz<0||wx>=rdim.x||wy>=rdim.y||wz>=rdim.z) continue;
      voxels[wx+','+wy+','+wz]=ds.voxels[k];
    }
  }
  return {voxels, size:rdim};
}
// Dibuja en `cv` la miniatura de una celda = habitación + sus habitantes compuestos.
async function drawCellComposed(cv, cell){
  try{
    const roomData=await getRoomData(cell.room);
    const habs=cell.habs||[];
    const entries=(await Promise.all(habs.map(h=>getRoomData(h.ref).then(d=>({h,d})).catch(()=>null)))).filter(Boolean);
    drawThumb(cv, composeRoomData(roomData, entries));
  }catch(e){}
}

async function openMapa(){
  const modal=$('#mapa-modal'); modal.hidden=false;
  const grid=$('#mapa-grid'); grid.innerHTML='<p class="hab-empty">Cargando…</p>';
  try{ mapa=await fetch('/api/mapa',{cache:'no-store'}).then(r=>r.json()); }
  catch(e){ grid.innerHTML='<p class="hab-empty">No se pudo cargar el mapa.</p>'; return; }
  if(!mapa.cells) mapa.cells={};
  await buildRoomCatalog();
  renderMapaGrid();
}
function closeMapa(){ $('#mapa-modal').hidden=true; closePicker(); }

// ===================== Gestor de snippets de código =====================
// Guarda/edita/ejecuta código (p.ej. constructores como buildMayanPyramid) contra el Mundo vía setVoxel.
// Persistencia en el servidor: /api/snippets (lista/uno/POST guardar/DELETE) → data/snippets/<id>.json.
let snips=[], snipCur=null;
const SNIP_TEMPLATE=
`// Snippet nuevo · usa setVoxel(x,y,z,material) para construir en el Mundo.
// Materiales: stone, smooth_stone, sandstone, stone_bricks, log, grass, dirt, sand, obsidian…
// Recuerda LLAMAR a tu función al final para que se ejecute (▶ Ejecutar / Ctrl+Enter).

function build(cx, cy, cz){
  for (let i = 0; i < 6; i++) setVoxel(cx, cy + i, cz, 'log');   // ejemplo: un tronco de 6
}
build(50, 15, 50);
`;
async function openSnips(){
  $('#snip-modal').hidden=false;
  await snipReload();
  if(snips.length) snipLoad(snips[0].id); else snipNew();
}
function closeSnips(){ $('#snip-modal').hidden=true; }
async function snipReload(){
  const list=$('#snip-list'); list.innerHTML='<p class="snip-empty">Cargando…</p>';
  try{ snips=await fetch('/api/snippets',{cache:'no-store'}).then(r=>r.json()); }
  catch(e){ list.innerHTML='<p class="snip-empty">No se pudo cargar.</p>'; return; }
  renderSnipList();
}
function renderSnipList(){
  const list=$('#snip-list'); list.innerHTML='';
  if(!snips.length){ list.innerHTML='<p class="snip-empty">Sin snippets. Crea uno con «+ Nuevo».</p>'; return; }
  for(const s of snips){
    const b=document.createElement('button'); b.className='snip-item'+(s.id===snipCur?' is-active':'');
    b.innerHTML='<b></b><small></small>';
    b.querySelector('b').textContent=s.name||'(sin nombre)';
    b.querySelector('small').textContent=(s.lines||1)+' líneas · '+(s.savedAt||'').replace('T',' ').slice(0,16);
    b.onclick=()=>snipLoad(s.id);
    list.appendChild(b);
  }
}
async function snipLoad(id){
  let d=null;
  try{ d=await fetch('/api/snippets/'+id,{cache:'no-store'}).then(r=>r.json()); }catch(e){}
  if(!d || d.error){ toast('No se pudo abrir el snippet'); return; }
  snipCur=d.id; $('#snip-name').value=d.name||''; $('#snip-code').value=d.code||'';
  $('#snip-del').hidden=false; renderSnipList();
}
function snipNew(){
  snipCur=null; $('#snip-name').value=''; $('#snip-code').value=SNIP_TEMPLATE;
  $('#snip-del').hidden=true; renderSnipList(); $('#snip-name').focus();
}
async function snipSave(){
  const name=$('#snip-name').value.trim()||'Sin nombre', code=$('#snip-code').value;
  const body={ name, code }; if(snipCur) body.id=snipCur;
  let r=null;
  try{ r=await fetch('/api/snippets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(x=>x.json()); }catch(e){}
  if(!r || !r.id){ toast('No se pudo guardar'); return; }
  snipCur=r.id; await snipReload(); $('#snip-del').hidden=false; toast('Snippet guardado');
}
async function snipDelete(){
  if(!snipCur){ snipNew(); return; }
  if(!confirm('¿Borrar este snippet? (va a la papelera del servidor)')) return;
  try{ await fetch('/api/snippets/'+snipCur,{method:'DELETE'}); }catch(e){}
  toast('Snippet borrado'); snipCur=null; await snipReload();
  if(snips.length) snipLoad(snips[0].id); else snipNew();
}
async function snipRun(){
  const code=$('#snip-code').value;
  try{
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    await (new AsyncFunction(code))();
    toast('▶ Snippet ejecutado');
  }catch(err){ console.error('[snippet]',err); toast('Error en el snippet: '+err.message); }
}
$('#snip-close').onclick=closeSnips;
$('#snip-refresh').onclick=snipReload;
$('#snip-new').onclick=snipNew;
$('#snip-save').onclick=snipSave;
$('#snip-run').onclick=snipRun;
$('#snip-del').onclick=snipDelete;
$('#snip-code').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); snipSave(); }
  else if((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); snipRun(); }
  else if(e.key==='Tab'){ e.preventDefault(); const t=e.target, s=t.selectionStart, en=t.selectionEnd;   // Tab = 2 espacios
    t.value=t.value.slice(0,s)+'  '+t.value.slice(en); t.selectionStart=t.selectionEnd=s+2; }
});
function renderMapaGrid(){
  const grid=$('#mapa-grid'); const {cols,rows}=mapa;
  grid.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
  grid.innerHTML='';
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const ck=c+','+r, cell=mapa.cells[ck];
    const el=document.createElement('div'); el.className='mapa-cell'+(cell&&cell.room?' filled':'');
    el.title='Celda '+ck;
    if(cell&&cell.room){
      const ent=catEntry(cell.room);
      const cv=document.createElement('canvas'); cv.width=cv.height=180; el.appendChild(cv);
      drawCellComposed(cv, cell);   // habitación + habitantes (escalados) compuestos
      const tag=document.createElement('span'); tag.className='mc-tag'; tag.textContent=ent?ent.name:'(borrada)'; el.appendChild(tag);
      const nh=(cell.habs||[]).length; if(nh){ const b=document.createElement('span'); b.className='mc-hab'; b.textContent='🧍'+nh; el.appendChild(b); }
      const pe=document.createElement('span'); pe.className='mc-people'; pe.textContent='🧍+'; pe.title='Colocar habitantes dentro';
      pe.onclick=(ev)=>{ ev.stopPropagation(); openRoom(ck); }; el.appendChild(pe);
    } else {
      const p=document.createElement('span'); p.className='mc-plus'; p.textContent='+'; el.appendChild(p);
    }
    el.onclick=()=>openPicker(ck);
    grid.appendChild(el);
  }
}
function openPicker(ck){
  mapaSel=ck;
  const pk=$('#mapa-picker'), g=$('#mapa-picker-grid');
  $('#mapa-picker-title').textContent='Habitación para la celda '+ck;
  g.innerHTML='';
  (mapaCatalog||[]).forEach(c=>{
    const o=document.createElement('div'); o.className='mapa-opt';
    o.innerHTML=`<div class="mo-thumb"><canvas width="120" height="120"></canvas></div>`+
                `<div class="mo-name">${c.icon} ${esc(c.name)}</div><div class="mo-badge">${c.badge}</div>`;
    getRoomData(c.key).then(d=>drawThumb(o.querySelector('canvas'),d)).catch(()=>{});
    o.onclick=()=>setCell(ck,c.key);
    g.appendChild(o);
  });
  if(!mapaCatalog||!mapaCatalog.length) g.innerHTML='<p class="hab-empty">No hay habitaciones. Crea una y guárdala como «Bloque de habitación».</p>';
  const occupied=!!(mapa.cells[ck]&&mapa.cells[ck].room);
  $('#mapa-picker-remove').hidden=!occupied;
  pk.hidden=false;
}
function closePicker(){ $('#mapa-picker').hidden=true; mapaSel=null; }
async function setCell(ck,roomKey){
  const prev=mapa.cells[ck]||{};
  mapa.cells[ck]={room:roomKey, habs:prev.habs||[]};
  closePicker(); renderMapaGrid(); await saveMapa();
}
async function removeCell(){
  if(!mapaSel) return;
  delete mapa.cells[mapaSel];
  closePicker(); renderMapaGrid(); await saveMapa();
}
let mapaSaveT=null;
function saveMapa(){                 // POST con pequeño debounce por si hay cambios rápidos
  clearTimeout(mapaSaveT);
  return new Promise(res=>{ mapaSaveT=setTimeout(async()=>{
    try{ await fetch('/api/mapa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mapa)}); toast('Mapa guardado'); }
    catch(e){ toast('No se pudo guardar el mapa'); } res();
  },120); });
}
$('#mapa-close').onclick=closeMapa;
$('#mapa-refresh').onclick=openMapa;
$('#mapa-picker-close').onclick=closePicker;
$('#mapa-picker-remove').onclick=removeCell;
$('#mapa-modal').addEventListener('click',e=>{ if(e.target.id==='mapa-modal') closeMapa(); });

// ================== HABITANTES DENTRO DE UNA HABITACIÓN (F3) ==================
// cells[ck].habs = [{ref:'hab:<id>', x, y}]  (x,y = celda del suelo de la habitación)
let roomCell=null, roomData=null, roomDim=null, roomTop=null, roomGeom=null, roomSelHab=-1, roomDragging=false, roomDown=null;
let roomHabNames={};   // ref -> {name, role}
const faceCache=new Map(), faceLoading=new Set();   // ref -> canvas con la cara (vista frontal, recorte cabeza)

// Cara del habitante: vista frontal (color del voxel de MÁS y por cada x,z) recortada a la cabeza+hombros.
function renderFace(cv,d){
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height; ctx.clearRect(0,0,W,H);
  const s=d.size||32, dim=(typeof s==='number')?{x:s,y:s,z:s}:s;
  const col={}, front={}; let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for(const k in (d.voxels||{})){ const [x,y,z]=k.split(',').map(Number), key=x+','+z;
    if(front[key]===undefined||y>front[key]){ front[key]=y; col[key]=d.voxels[k]; }
    if(x<minx)minx=x; if(x>maxx)maxx=x; if(z<minz)minz=z; if(z>maxz)maxz=z; }
  if(maxx<minx) return;
  const bw=(maxx-minx+1)||1, fullh=(maxz-minz+1)||1;
  const cropH=Math.min(fullh, Math.max(bw, Math.round(bw*1.2)));   // cuadrado superior ≈ cabeza+hombros
  const zBot=maxz-cropH+1, cell=Math.min(W/bw, H/cropH), ox=(W-cell*bw)/2, oy=(H-cell*cropH)/2;
  for(const key in col){ const [x,z]=key.split(',').map(Number); if(z<zBot) continue;
    ctx.fillStyle=col[key]; ctx.fillRect(Math.floor(ox+(x-minx)*cell), Math.floor(oy+(maxz-z)*cell), Math.ceil(cell), Math.ceil(cell)); }
}
function ensureFace(ref){
  if(faceCache.has(ref)||faceLoading.has(ref)) return;
  faceLoading.add(ref);
  getRoomData(ref).then(d=>{ const c=document.createElement('canvas'); c.width=c.height=64; renderFace(c,d);
    faceCache.set(ref,c); faceLoading.delete(ref); if(roomCell) renderRoomCanvas(); })
    .catch(()=>faceLoading.delete(ref));
}

async function openRoom(ck){
  const cell=mapa.cells[ck]; if(!cell||!cell.room) return;
  roomCell=ck; roomSelHab=-1; roomDragging=false;
  if(!cell.habs) cell.habs=[];
  $('#room-modal').hidden=false;
  const ent=catEntry(cell.room);
  $('#room-title').textContent=(ent?ent.name:'Habitación')+' · celda '+ck;
  roomData=await getRoomData(cell.room);
  computeRoomTop();
  await buildRoomHabList();
  updateRoomDel(); renderRoomCanvas();
}
function closeRoom(){ $('#room-modal').hidden=true; roomCell=null; if(mapa) renderMapaGrid(); }

function computeRoomTop(){
  const s=roomData.size||28, dim=(typeof s==='number')?{x:s,y:s,z:s}:s;
  roomDim={x:dim.x||28, y:dim.y||28, z:dim.z||16};
  roomTop=new Array(roomDim.x*roomDim.y).fill(null);
  const topz=new Array(roomDim.x*roomDim.y).fill(-1);
  for(const k in (roomData.voxels||{})){ const [x,y,z]=k.split(',').map(Number);
    if(x<0||y<0||x>=roomDim.x||y>=roomDim.y) continue;
    const i=y*roomDim.x+x; if(z>topz[i]){ topz[i]=z; roomTop[i]=roomData.voxels[k]; } }
}
async function buildRoomHabList(){
  const ul=$('#room-hablist'); ul.innerHTML='<li class="muted">Cargando…</li>';
  let list; try{ list=await apiHabitantes(); }catch(e){ ul.innerHTML='<li class="muted">servidor no disponible</li>'; return; }
  list=list.filter(h=>habBucket(h.type)==='habitante');    // solo personajes/habitantes (no objetos ni bloques)
  roomHabNames={}; list.forEach(h=>roomHabNames['hab:'+h.id]={name:h.name, role:h.role||h.type});
  if(!list.length){ ul.innerHTML='<li class="muted">No hay habitantes. Crea uno y pulsa Guardar.</li>'; return; }
  ul.innerHTML='';
  list.forEach(h=>{
    const li=document.createElement('li');
    li.innerHTML=`<canvas width="60" height="60"></canvas>`+
                 `<div style="min-width:0"><div class="rh-name">${esc(h.name)}</div><div class="rh-role">${esc(h.role||h.type)}</div></div>`;
    fetch('/api/habitantes/'+h.id,{cache:'no-store'}).then(r=>r.json()).then(d=>drawThumb(li.querySelector('canvas'),d)).catch(()=>{});
    li.title='Añadir «'+h.name+'» a la habitación';
    li.onclick=()=>addHabToRoom('hab:'+h.id);
    ul.appendChild(li);
  });
}
function addHabToRoom(ref){
  const habs=mapa.cells[roomCell].habs;
  const n=habs.length;                                              // escalona para que no se apilen
  const x=Math.min(roomDim.x-1, Math.floor(roomDim.x*0.5)+(n%4)*2),
        y=Math.min(roomDim.y-1, Math.floor(roomDim.y*0.5)+Math.floor(n/4)*2);
  habs.push({ref, x, y}); roomSelHab=habs.length-1;
  updateRoomDel(); renderRoomCanvas(); saveMapa();
  const nm=roomHabNames[ref]; toast('Añadido «'+((nm&&nm.name)||ref)+'» · arrástralo para colocarlo');
}
function updateRoomDel(){
  const b=$('#room-del'), habs=(mapa.cells[roomCell]||{}).habs||[];
  if(roomSelHab>=0 && habs[roomSelHab]){ const nm=roomHabNames[habs[roomSelHab].ref];
    b.hidden=false; b.textContent='Quitar: '+((nm&&nm.name)||'habitante'); }
  else b.hidden=true;
}
function renderRoomCanvas(){
  const cv=$('#room-canvas'), ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#0a0c12'; ctx.fillRect(0,0,W,H);
  const cell=Math.min(W/roomDim.x, H/roomDim.y), ox=(W-cell*roomDim.x)/2, oy=(H-cell*roomDim.y)/2;
  roomGeom={cell,ox,oy};
  for(let y=0;y<roomDim.y;y++) for(let x=0;x<roomDim.x;x++){
    const c=roomTop[y*roomDim.x+x]; if(!c) continue;
    ctx.fillStyle=c; ctx.fillRect(Math.floor(ox+x*cell), Math.floor(oy+y*cell), Math.ceil(cell), Math.ceil(cell));
  }
  // borde del suelo
  ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1; ctx.strokeRect(ox,oy,cell*roomDim.x,cell*roomDim.y);
  // marcadores de habitantes = su CARA (vista frontal) en un círculo
  const habs=mapa.cells[roomCell].habs||[], R=Math.max(10, cell*1.4);
  habs.forEach((h,i)=>{
    const px=ox+(h.x+0.5)*cell, py=oy+(h.y+0.5)*cell, sel=i===roomSelHab;
    ensureFace(h.ref);
    const face=faceCache.get(h.ref);
    ctx.save();
    ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.closePath();
    ctx.fillStyle='#0a0c12'; ctx.fill(); ctx.clip();
    if(face) ctx.drawImage(face, px-R, py-R, 2*R, 2*R);
    ctx.restore();
    ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2);
    ctx.lineWidth=sel?4:2.5; ctx.strokeStyle=sel?'#ffd36a':'#3fe0ff';
    if(sel){ ctx.shadowColor='#ffd36a'; ctx.shadowBlur=8; } ctx.stroke(); ctx.shadowBlur=0;
  });
}
function roomPosFromEvent(e){
  const cv=$('#room-canvas'), r=cv.getBoundingClientRect();
  const sx=(e.clientX-r.left)*cv.width/r.width, sy=(e.clientY-r.top)*cv.height/r.height;
  const {cell,ox,oy}=roomGeom;
  return { gx:Math.max(0,Math.min(roomDim.x-1,Math.floor((sx-ox)/cell))),
           gy:Math.max(0,Math.min(roomDim.y-1,Math.floor((sy-oy)/cell))), sx, sy };
}
function roomHitMarker(sx,sy){
  const habs=mapa.cells[roomCell].habs||[], {cell,ox,oy}=roomGeom, R=Math.max(9, cell);
  for(let i=habs.length-1;i>=0;i--){ const px=ox+(habs[i].x+0.5)*cell, py=oy+(habs[i].y+0.5)*cell;
    if((sx-px)**2+(sy-py)**2<=R*R) return i; }
  return -1;
}
(function initRoomCanvas(){
  const cv=$('#room-canvas');
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('pointerdown',e=>{
    if(!roomCell) return; cv.setPointerCapture(e.pointerId);
    const p=roomPosFromEvent(e), hit=roomHitMarker(p.sx,p.sy);
    if(e.button===2){ if(hit>=0){ mapa.cells[roomCell].habs.splice(hit,1); roomSelHab=-1; updateRoomDel(); renderRoomCanvas(); saveMapa(); } return; }
    if(hit>=0){ roomSelHab=hit; roomDown={sx:p.sx,sy:p.sy}; roomDragging=false; }  // selecciona; mover requiere ARRASTRAR
    else { roomSelHab=-1; roomDown=null; }                                          // clic en vacío deselecciona
    updateRoomDel(); renderRoomCanvas();
  });
  cv.addEventListener('pointermove',e=>{
    if(!roomDown||roomSelHab<0) return;
    const p=roomPosFromEvent(e);
    if(!roomDragging && Math.hypot(p.sx-roomDown.sx, p.sy-roomDown.sy)<5) return;   // umbral: un clic no mueve
    roomDragging=true;
    const h=mapa.cells[roomCell].habs[roomSelHab]; h.x=p.gx; h.y=p.gy; renderRoomCanvas();
  });
  const end=()=>{ if(roomDragging) saveMapa(); roomDown=null; roomDragging=false; };
  cv.addEventListener('pointerup',end); cv.addEventListener('pointerleave',end);
})();
$('#room-del').onclick=()=>{ const habs=mapa.cells[roomCell].habs; if(roomSelHab>=0){ habs.splice(roomSelHab,1); roomSelHab=-1; updateRoomDel(); renderRoomCanvas(); saveMapa(); } };
$('#room-close').onclick=closeRoom;
$('#room-back').onclick=()=>{ closeRoom(); };
$('#room-modal').addEventListener('click',e=>{ if(e.target.id==='room-modal') closeRoom(); });

// ================== JUGAR (F5) ==================
// Clic en el suelo => ruta (esquiva sólidos) => el personaje camina y gira hacia la dirección.
const play={ active:false, cellKey:null, charRef:null, base:null, g:null, dim:null, walk:null,
             sprites:null, refFoot:null, baseImg:null, depth:null, exits:{}, transitioning:false, fade:0,
             pos:{x:0,y:0}, facing:0, path:[], speed:6.5, last:0, raf:0 };
let PLAY_W=760, PLAY_H=560;                          // se ajustan al tamaño real del escenario al cargar
// Encuadre del modo jugar: fillX>1 deja que las esquinas iso vacías se salgan por los lados para
// APROVECHAR el alto. Las salas anchas y bajas quedan limitadas por el ancho => subir fillX las
// agranda hasta llenar la altura (ajustable en vivo con `game.playFill`, persistido). fillY=1 para
// no recortar el suelo/techo de las salas altas (que ya llenan el alto).
let _playFillX=0.8; try{ const s=parseFloat(localStorage.getItem('vf_playFillX')); if(isFinite(s)&&s>=0.5) _playFillX=s; }catch(e){}
// Las salas son cáscaras SIN techo: la silueta de encuadre reserva alto para la tapa de los muros
// del FONDO (que se proyecta arriba pero queda OCLUIDA tras los muros de delante) => margen muerto
// arriba. Se corrige con un zoom (acerca) + una subida vertical (`playLift`, fracción del alto) que
// se comen ese margen. Ambos ajustables en vivo por consola (`game.playZoom` / `game.playLift`).
let _playZoom=1.05; try{ const s=parseFloat(localStorage.getItem('vf_playZoom')); if(isFinite(s)&&s>0.2) _playZoom=s; }catch(e){}
let _playLift=0.035; try{ const s=parseFloat(localStorage.getItem('vf_playLift')); if(isFinite(s)) _playLift=Math.max(0,Math.min(0.45,s)); }catch(e){}
const PLAY_VIEW={yaw:-2.42, pitch:0.62, zoom:_playZoom, panX:0, panY:0, fillX:_playFillX, fillY:1.0};
let PLAY_FACING_OFFSET=0;   // ajuste si el personaje mira al revés (0..3 giros de 90°)
// RECORTE del carril de puerta: voxels a cada lado del centro que se despejan de mueble para abrir
// un vano recto (media anchura del carril). Ajustable EN VIVO desde el visor de Jugar; se recuerda
// entre sesiones. Menos = muebles más intactos pero paso más estrecho; más = puerta ancha, recorta
// más mueble. carveDoorways/clearExitLanes y checkExit usan este valor.
let playTrim = 7;
try{ const v=parseInt(localStorage.getItem('vf_playTrim'),10); if(Number.isFinite(v)) playTrim=v; }catch(e){}
let _trimReloadT=null;
// Sin tope: acepta CUALQUIER entero (0, negativo = puerta cerrada, o enorme = vano de toda la sala).
// Los bucles de carveDoorways/clearExitLanes están acotados a la rejilla, así que no rompe nada.
function setPlayTrim(v, live){
  const n=Number(v);
  if(!Number.isFinite(n)){ console.warn('room.doorTrim: dame un número'); return playTrim; }
  playTrim=Math.round(n);
  try{ localStorage.setItem('vf_playTrim', playTrim); }catch(e){}
  if(live!==false && play.active){ clearTimeout(_trimReloadT); _trimReloadT=setTimeout(reloadPlayRoom, 90); }  // recarga en vivo (debounce)
  syncGameRoom();
  return playTrim;
}
// Inspector por CONSOLA (F12), sin UI. Teclear `room` a secas lista TODAS sus propiedades con su
// valor actual; leer una la devuelve (`room.doorTrim` => nº), y `room.doorTrim = 4` la ajusta y
// recarga la sala en vivo. Propiedades escribibles = solo las que tienen `set`; el resto es de solo
// lectura (reflejan el estado de la partida). `doorTrim` se recuerda entre sesiones.
const ROOM_PROPS = {
  doorTrim: { get:()=>playTrim, set:v=>setPlayTrim(v,true) },                       // recorte del carril de puerta (vox)
  name:  { get:()=>{ const c=mapa&&mapa.cells&&play.cellKey&&mapa.cells[play.cellKey], e=c&&catEntry(c.room); return e?e.name:null; } },
  cell:  { get:()=>play.cellKey||null },                                            // celda del mapa actual "col,row"
  exits: { get:()=>Object.keys(play.exits||{}) },                                   // salidas con vecino: W/E/N/S
  pos:   { get:()=>play.active?{x:Math.round(play.pos.x), y:Math.round(play.pos.y)}:null },
};
// BUG-RM1: `room` es un OBJETO PLANO (no Proxy) con accessors enumerables → la consola lo muestra
// como diccionario `{doorTrim, name, cell, exits, pos}` en vez de los slots internos del Proxy.
// `room.doorTrim` => nº · `room.doorTrim = 4` => ajusta y recarga · el resto es de solo lectura.
const room = {};
for(const k in ROOM_PROPS){ const p=ROOM_PROPS[k];
  Object.defineProperty(room, k, { enumerable:true,
    get:p.get, set:p.set || (()=>console.warn('room.'+k+' es de solo lectura')) });
}
window.room = room;

// `game`: inspector global de consola. Teclear `game` a secas vuelca el diccionario con valores:
// {fps, mode, room:{doorTrim,…}, showFPS}. El medidor de FPS se muestra/oculta con
// `game.showFPS(false)` o `game.showFPS = false` (persistido). fps/mode/room se refrescan solos
// (fps en cada frame de la vista 3D; room en cada carga/tick de partida y al tocar doorTrim).
let _showFPS=true; try{ _showFPS = localStorage.getItem('vf_showFPS')!=='0'; }catch(e){}
function applyShowFPS(v){ _showFPS=!!v;
  try{ localStorage.setItem('vf_showFPS', _showFPS?'1':'0'); }catch(e){}
  const el=$('#e3-fps'); if(el) el.hidden = !(_showFPS && mode==='3d');   // el medidor vive en la vista 3D
  updatePlayMeters();                                                     // REQ-DBG1: y en el modo Play
  return _showFPS; }
let _showVox=false; try{ _showVox = localStorage.getItem('vf_showVox')==='1'; }catch(e){}
function applyShowVox(v){ _showVox=!!v;
  try{ localStorage.setItem('vf_showVox', _showVox?'1':'0'); }catch(e){}
  const el=$('#e3-vox'); if(el) el.hidden = !(_showVox && mode==='3d');
  updatePlayMeters();                                                     // REQ-DBG1: y en el modo Play
  return _showVox; }
// REQ-DBG1: los mismos toggles de depuración F12 valen en Play. Los medidores viven sobre
// #play-stage y se refrescan desde playTick (FPS real de pantalla) y playLoadRoom (voxels de sala).
function updatePlayMeters(){
  const on=!!(play && play.active);
  const ef=$('#play-fps'); if(ef){ ef.hidden=!(_showFPS && on); ef.textContent=Math.round(game.fps)+' fps'; }
  const ev=$('#play-vox'); if(ev){ ev.hidden=!(_showVox && on); ev.textContent=game.voxels+' vox'; }
}
function roomSnapshot(){ const o={}; for(const k in ROOM_PROPS){ try{ o[k]=ROOM_PROPS[k].get(); }catch(e){ o[k]=null; } } return o; }
const game = { fps:0, voxels:0, mode:mode, room:roomSnapshot() };
Object.defineProperty(game, 'showFPS', { enumerable:true,   // callable `game.showFPS(false)` y asignable `game.showFPS=false`
  get(){ const f=v=>applyShowFPS(v===undefined?!_showFPS:v); f.valueOf=()=>_showFPS; f.toString=()=>String(_showFPS); return f; },
  set(v){ applyShowFPS(v); } });
Object.defineProperty(game, 'showVoxels', { enumerable:true,   // muestra/oculta el nº de voxels dibujados
  get(){ const f=v=>applyShowVox(v===undefined?!_showVox:v); f.valueOf=()=>_showVox; f.toString=()=>String(_showVox); return f; },
  set(v){ applyShowVox(v); } });
const applyPaintAlpha=v=>{ state.alpha=Math.max(0,Math.min(1,+v)); if(state.tex) state.tex=null; syncColor(); return state.alpha; };
Object.defineProperty(game, 'paintAlpha', { enumerable:true,   // `game.paintAlpha(0.5)` o `game.paintAlpha=0.5`: opacidad del pincel (0..1)
  get(){ const f=v=>applyPaintAlpha(v===undefined?state.alpha:v); f.valueOf=()=>state.alpha; f.toString=()=>String(state.alpha); return f; },
  set(v){ applyPaintAlpha(v); } });
const applyPaintGlow=v=>{ state.emit=!!v; if(state.tex) state.tex=null; syncColor(); return state.emit; };
Object.defineProperty(game, 'paintGlow', { enumerable:true,   // `game.paintGlow()` alterna / `game.paintGlow=true`: pincel emisivo (brilla en el Mundo)
  get(){ const f=v=>applyPaintGlow(v===undefined?!state.emit:v); f.valueOf=()=>state.emit; f.toString=()=>String(state.emit); return f; },
  set(v){ applyPaintGlow(v); } });
// game.nearClip = zoom a partir del cual se pelan los voxels más cercanos a la cámara.
// Subirlo => desaparecen más tarde (0 = pelar desde el principio). Persistido, se refleja al vuelo.
function applyNearClip(v){ _clipStart=Math.max(0, +v||0);
  try{ localStorage.setItem('vf_clipStart', String(_clipStart)); }catch(e){}
  render();                                                                // reflejar el recorte al instante
  return _clipStart; }
// game.perspStrength = fuerza de la perspectiva cónica (distancia focal = K·radio de profundidad).
// Menor => más dramática (más punto de fuga); mayor => tiende a ortográfica. Mínimo 1.05. Persistido.
function applyPerspStrength(v){ _perspK=Math.max(1.05, +v||0);
  try{ localStorage.setItem('vf_perspK', String(_perspK)); }catch(e){}
  _silKey=null; render();                                                   // invalida la silueta y repinta al instante
  return _perspK; }
Object.defineProperty(game, 'nearClip', { enumerable:true,   // `game.nearClip` => nº · `game.nearClip = 8` => ajusta
  get(){ return _clipStart; },
  set(v){ applyNearClip(v); } });
Object.defineProperty(game, 'perspStrength', { enumerable:true,   // fuerza de la perspectiva cónica (edición 3D) · menor = más dramática
  get(){ return _perspK; },
  set(v){ applyPerspStrength(v); } });
// game.playFill = cuánto agranda la sala en modo jugar para aprovechar el alto (fillX del encuadre).
// Mayor => llena más (las esquinas iso vacías se salen por los lados). Mínimo 0.5. Persistido; recarga en vivo.
function applyPlayFill(v){ _playFillX=Math.max(0.5, +v||0);
  PLAY_VIEW.fillX=_playFillX;
  try{ localStorage.setItem('vf_playFillX', String(_playFillX)); }catch(e){}
  if(play.active) reloadPlayRoom();                                         // re-encuadra la sala al vuelo
  return _playFillX; }
Object.defineProperty(game, 'playFill', { enumerable:true,   // `game.playFill` => nº · `game.playFill = 2` => agranda la sala en modo jugar
  get(){ return _playFillX; },
  set(v){ applyPlayFill(v); } });
// game.playZoom = acercamiento de la cámara en modo jugar (1 = encuadre por silueta; >1 acerca).
// game.playLift = cuánto sube la sala (fracción del alto, 0..0.45) para comerse el margen del techo.
function applyPlayZoom(v){ _playZoom=Math.max(0.2, +v||0);
  try{ localStorage.setItem('vf_playZoom', String(_playZoom)); }catch(e){}
  if(play.active) reloadPlayRoom(); return _playZoom; }
function applyPlayLift(v){ _playLift=Math.max(0, Math.min(0.45, +v||0));
  try{ localStorage.setItem('vf_playLift', String(_playLift)); }catch(e){}
  if(play.active) reloadPlayRoom(); return _playLift; }
Object.defineProperty(game, 'playZoom', { enumerable:true,   // `game.playZoom` => nº · `game.playZoom = 1.6` => acerca la cámara
  get(){ return _playZoom; },
  set(v){ applyPlayZoom(v); } });
Object.defineProperty(game, 'playLift', { enumerable:true,   // `game.playLift` => nº · `game.playLift = 0.2` => sube la sala (fracción del alto)
  get(){ return _playLift; },
  set(v){ applyPlayLift(v); } });
function syncGameRoom(){ if(window.game) game.room = roomSnapshot(); }
window.game = game;
// Recarga la sala actual conservando personaje y posición (para reflejar el recorte al vuelo).
async function reloadPlayRoom(){
  if(!play.active || !play.cellKey) return;
  const keep=[Math.round(play.pos.x), Math.round(play.pos.y)];
  play.transitioning=true; play.path=[];
  await playLoadRoom(play.cellKey, keep);
  play.transitioning=false; play.last=performance.now(); renderPlay();
}

async function openPlay(cellKey){
  const cell=mapa.cells[cellKey]; if(!cell||!cell.room) return;
  play.cellKey=cellKey;
  $('#play-modal').hidden=false; $('#play-choose').hidden=false; $('#play-stage').hidden=true;
  const ent=catEntry(cell.room); $('#play-sub').textContent=ent?('· '+ent.name):'';
  // selector de personaje (galería, no bloques)
  const g=$('#play-choose-grid'); g.innerHTML='<p class="hab-empty">Cargando…</p>';
  let list; try{ list=(await apiHabitantes()).filter(h=>habBucket(h.type)==='habitante'); }catch(e){ g.innerHTML='<p class="hab-empty">Servidor no disponible.</p>'; return; }
  if(!list.length){ g.innerHTML='<p class="hab-empty">No hay personajes. Crea uno y pulsa Guardar.</p>'; return; }
  g.innerHTML='';
  list.forEach(h=>{
    const o=document.createElement('div'); o.className='mapa-opt';
    o.innerHTML=`<div class="mo-thumb"><canvas width="120" height="120"></canvas></div>`+
                `<div class="mo-name">${esc(h.name)}</div><div class="mo-badge">${esc(h.role||h.type)}</div>`;
    getRoomData('hab:'+h.id).then(d=>drawThumb(o.querySelector('canvas'),d)).catch(()=>{});
    o.onclick=()=>enterPlay('hab:'+h.id);
    g.appendChild(o);
  });
}
// Jugar YA: salta el flujo Mapa→elegir sala→elegir personaje. Escoge una celda con sala y un
// personaje al AZAR y entra directo al escenario. Requiere el mapa cargado y al menos 1 personaje.
async function quickPlay(){
  if(!mapa){ try{ mapa=await fetch('/api/mapa',{cache:'no-store'}).then(r=>r.json()); }
             catch(e){ toast('Servidor no disponible'); return; } }
  if(!mapaCatalog) try{ await buildRoomCatalog(); }catch(e){}
  const cells=Object.keys(mapa.cells||{}).filter(k=>mapa.cells[k] && mapa.cells[k].room);
  if(!cells.length){ toast('El mapa no tiene habitaciones. Ve a «Mapa» y coloca alguna.'); return; }
  let chars; try{ chars=(await apiHabitantes()).filter(h=>habBucket(h.type)==='habitante'); }
             catch(e){ toast('Servidor no disponible'); return; }
  if(!chars.length){ toast('No hay personajes. Crea uno y pulsa «Guardar».'); return; }
  const cellKey=cells[Math.floor(Math.random()*cells.length)];
  const ch=chars[Math.floor(Math.random()*chars.length)];
  play.cellKey=cellKey;
  $('#play-modal').hidden=false; $('#play-choose').hidden=true; $('#play-stage').hidden=false;  // visible ANTES de medir
  const ent=catEntry(mapa.cells[cellKey].room); $('#play-sub').textContent=ent?('· '+ent.name):'';
  await enterPlay('hab:'+ch.id);
}
function closePlay(){ stopPlayLoop(); $('#play-modal').hidden=true; play.active=false; updatePlayMeters(); }
function stopPlayLoop(){ if(play.raf) cancelAnimationFrame(play.raf); play.raf=0; }

// ---- Escala: la SALA se amplía ×PLAY_SCALE al jugar; el personaje va a resolución NATIVA ----
const PLAY_SCALE=4;
// Upscale ×f de la sala, SOLO superficie (un voxel fino se conserva si alguna de sus caras da a
// un bloque grueso vacío) => misma imagen, fracción de los voxels.
function upscaleRoom(vox, dim, f){
  const has=(cx,cy,cz)=> vox[cx+','+cy+','+cz]!==undefined;
  const out={};
  for(const k in vox){ const [cx,cy,cz]=k.split(',').map(Number), c=vox[k];
    for(let dx=0;dx<f;dx++)for(let dy=0;dy<f;dy++)for(let dz=0;dz<f;dz++){
      const surf =
        (dx===0   && !has(cx-1,cy,cz)) || (dx===f-1 && !has(cx+1,cy,cz)) ||
        (dy===0   && !has(cx,cy-1,cz)) || (dy===f-1 && !has(cx,cy+1,cz)) ||
        (dz===0   && !has(cx,cy,cz-1)) || (dz===f-1 && !has(cx,cy,cz+1));
      if(surf) out[(cx*f+dx)+','+(cy*f+dy)+','+(cz*f+dz)]=c;
    }
  }
  return {vox:out, dim:{x:dim.x*f, y:dim.y*f, z:dim.z*f}};
}
// personaje a resolución nativa, recortado a su caja y re-basado a (0,0,0)
function charShell(d){
  const vox=d.voxels||{}; let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for(const k in vox){ const p=k.split(',').map(Number);
    for(let i=0;i<3;i++){ if(p[i]<mn[i])mn[i]=p[i]; if(p[i]>mx[i])mx[i]=p[i]; } }
  const out={}; for(const k in vox){ const [x,y,z]=k.split(',').map(Number);
    out[(x-mn[0])+','+(y-mn[1])+','+(z-mn[2])]=vox[k]; }
  return {voxels:out, ext:{x:mx[0]-mn[0]+1, y:mx[1]-mn[1]+1, z:mx[2]-mn[2]+1}};
}
// rejilla pisable: hay suelo (tapa en floorTop) y nada sólido a la altura del cuerpo
function buildWalk(vox, dim, floorTop, bodyH){
  const solid=new Set(Object.keys(vox));
  const walk=new Uint8Array(dim.x*dim.y), obst=new Uint8Array(dim.x*dim.y);
  for(let x=0;x<dim.x;x++) for(let y=0;y<dim.y;y++){
    if(!solid.has(x+','+y+','+floorTop)) continue;
    let blocked=false;
    for(let z=floorTop+1; z<=floorTop+bodyH && z<dim.z; z++) if(solid.has(x+','+y+','+z)){ blocked=true; break; }
    if(blocked) obst[x*dim.y+y]=1; else walk[x*dim.y+y]=1;
  }
  return {walk,obst};
}
// dilata los OBSTÁCULOS r celdas (huella del personaje ~8 de ancho) — los bordes del grid no dilatan
function erodeWalk(walk, obst, dim, r){
  const out=walk.slice();
  for(let x=0;x<dim.x;x++) for(let y=0;y<dim.y;y++) if(obst[x*dim.y+y])
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&ny>=0&&nx<dim.x&&ny<dim.y) out[nx*dim.y+ny]=0;
    }
  return out;
}
const isWalk=(x,y)=> x>=0&&y>=0&&x<play.dim.x&&y<play.dim.y && play.walk[x*play.dim.y+y]===1;
function nearestWalk(tx,ty){ let best=null,bd=1e9;
  for(let x=0;x<play.dim.x;x++) for(let y=0;y<play.dim.y;y++) if(play.walk[x*play.dim.y+y]){ const d=(x-tx)**2+(y-ty)**2; if(d<bd){bd=d;best=[x,y];} }
  return best; }
// A* octile con penalización por rozar paredes => la ruta se despega de los muebles.
function wallPenalty(x,y){
  let n=0; for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){ if(!dx&&!dy) continue; if(!isWalk(x+dx,y+dy)) n++; }
  return n*0.08;
}
function findPath(sx,sy,tx,ty){
  if(!isWalk(tx,ty)){ const n=nearestWalk(tx,ty); if(!n) return null; tx=n[0]; ty=n[1]; }
  const Y=play.dim.y, key=(x,y)=>x*Y+y;
  const open=new Map(), gsc=new Map(), prev=new Map(), closed=new Set();
  const h=(x,y)=>{ const ax=Math.abs(x-tx), ay=Math.abs(y-ty); return Math.max(ax,ay)+0.4142*Math.min(ax,ay); };
  const sk=key(sx,sy); gsc.set(sk,0); open.set(sk,h(sx,sy));
  const dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
  let found=false;
  while(open.size){
    let bk=null,bf=1e18; for(const [k,f] of open) if(f<bf){ bf=f; bk=k; }
    open.delete(bk); closed.add(bk);
    const x=Math.floor(bk/Y), y=bk%Y;
    if(x===tx&&y===ty){ found=true; break; }
    for(const [dx,dy,c] of dirs){
      const nx=x+dx, ny=y+dy; if(!isWalk(nx,ny)) continue;
      if(dx&&dy && (!isWalk(x+dx,y)||!isWalk(x,y+dy))) continue;         // no cortar esquinas
      const nk=key(nx,ny); if(closed.has(nk)) continue;
      const ng=gsc.get(bk)+c+wallPenalty(nx,ny);
      if(ng < (gsc.get(nk) ?? 1e18)){ gsc.set(nk,ng); prev.set(nk,bk); open.set(nk, ng+h(nx,ny)); }
    }
  }
  if(!found) return null;
  const cells=[]; let k=key(tx,ty);
  while(k!==undefined && k!==sk){ cells.unshift({x:Math.floor(k/Y), y:k%Y}); k=prev.get(k); }
  return smoothPath({x:sx,y:sy}, cells);
}
// visión pisable entre dos puntos (muestreo fino del segmento)
function losWalk(ax,ay,bx,by){
  const steps=Math.max(1, Math.ceil(Math.hypot(bx-ax,by-ay)*3));
  for(let i=0;i<=steps;i++){ const t=i/steps;
    if(!isWalk(Math.round(ax+(bx-ax)*t), Math.round(ay+(by-ay)*t))) return false; }
  return true;
}
// string-pulling: deja solo los puntos de giro necesarios => tramos rectos, sin escalera
function smoothPath(start, cells){
  if(!cells.length) return cells;
  const out=[]; let anchor=start, i=0;
  while(i<cells.length){
    let j=i;
    while(j+1<cells.length && losWalk(anchor.x,anchor.y, cells[j+1].x,cells[j+1].y)) j++;
    out.push(cells[j]); anchor=cells[j]; i=j+1;
  }
  return out;
}
// rota 90° CW alrededor del eje vertical
function rotate90(vox, ext){
  const out={}; for(const k in vox){ const [x,y,z]=k.split(',').map(Number); out[y+','+(ext.x-1-x)+','+z]=vox[k]; }
  return {vox:out, ext:{x:ext.y, y:ext.x, z:ext.z}};
}
// Renderiza el jugador (una orientación) a un sprite del tamaño del lienzo, con la huella centrada
// en (refX,refY) usando la MISMA proyección que la sala. Luego solo se traslada => movimiento suave.
function renderPlayerSprite(vox, ext, refX, refY){
  const cvs=document.createElement('canvas'); cvs.width=PLAY_W; cvs.height=PLAY_H;
  const ctx=cvs.getContext('2d');
  const g=play.g, occ=new Set(Object.keys(vox)), ox=refX-ext.x/2, oy=refY-ext.y/2, list=[];
  for(const k in vox){ const [x,y,z]=k.split(',').map(Number), c=vox[k];
    for(let fi=0;fi<6;fi++){ if(!g.front[fi]) continue; const nb=CUBE_FACES[fi].nb;
      if(!occ.has((x+nb[0])+','+(y+nb[1])+','+(z+nb[2]))) list.push({x,y,z,c,fi}); } }
  list.sort((a,b)=> g.depthOf(b.x+.5,b.y+.5,b.z+.5)-g.depthOf(a.x+.5,a.y+.5,a.z+.5));   // lejos→cerca
  // raster sin AA (como la sala): cero grietas/"rejilla" en el personaje; fondo transparente
  // + BUFFER DE PROFUNDIDAD por píxel (para la oclusión correcta: pared detrás no tapa)
  const img=getRaster(ctx,PLAY_W,PLAY_H), buf=new Uint32Array(img.data.buffer); buf.fill(0);
  if(!renderPlayerSprite._dep || renderPlayerSprite._dep.length!==PLAY_W*PLAY_H) renderPlayerSprite._dep=new Float32Array(PLAY_W*PLAY_H);
  const dep=renderPlayerSprite._dep; dep.fill(Infinity);
  let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
  for(const f of list){ const c=CUBE_FACES[f.fi].c, wx=ox+f.x, wy=oy+f.y, wz=play.standZ+f.z;
    const p0=g.screen(wx+c[0][0],wy+c[0][1],wz+c[0][2]), p1=g.screen(wx+c[1][0],wy+c[1][1],wz+c[1][2]),
          p2=g.screen(wx+c[2][0],wy+c[2][1],wz+c[2][2]), p3=g.screen(wx+c[3][0],wy+c[3][1],wz+c[3][2]);
    for(const q of [p0,p1,p2,p3]){ if(q[0]<bx0)bx0=q[0]; if(q[0]>bx1)bx1=q[0]; if(q[1]<by0)by0=q[1]; if(q[1]>by1)by1=q[1]; }
    scanQuad(buf,PLAY_W,PLAY_H, rasterCol(f.c,f.fi,CUBE_FACES[f.fi].s), p0[0],p0[1],p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);
    scanQuad(dep,PLAY_W,PLAY_H, g.depthOf(wx+.5,wy+.5,wz+.5), p0[0],p0[1],p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);  // orden lejos→cerca => queda la más cercana
  }
  // recortar al bbox: el lienzo del sprite es pequeño y se dibuja con su offset (menos memoria)
  const cx0=Math.max(0,Math.floor(bx0)-1), cy0=Math.max(0,Math.floor(by0)-1);
  const cw=Math.min(PLAY_W-cx0, Math.ceil(bx1)-cx0+2), chh=Math.min(PLAY_H-cy0, Math.ceil(by1)-cy0+2);
  cvs.width=Math.max(1,cw); cvs.height=Math.max(1,chh);
  cvs.getContext('2d').putImageData(img, -cx0, -cy0);
  const depC=new Float32Array(cw*chh);                          // profundidad recortada, en coords del sprite
  for(let y=0;y<chh;y++) for(let x=0;x<cw;x++) depC[y*cw+x]=dep[(cy0+y)*PLAY_W+(cx0+x)];
  return {cvs, ox:cx0, oy:cy0, dw:cw, dh:chh, depth:depC, bbox:{x0:bx0,y0:by0,x1:bx1,y1:by1}};
}
// SOMBRA proyectada (plan SOMBRAS.md, opción C): sol ALTO => estela corta (SHADOW_LEN celdas),
// gradiente de alfa (contacto oscuro -> punta tenue), alfa horneada en el sprite, y depth del
// suelo por píxel para poder ocluirla (no pintarse sobre muebles/paredes).
const SHADOW_LEN=6;                          // longitud máxima de la estela, en celdas
const SHADOW_DX=0.84, SHADOW_DY=0.54;        // dirección unitaria de la sombra en el suelo
function renderShadowSprite(vox, ext, refX, refY){
  const g=play.g, ox=refX-ext.x/2, oy=refY-ext.y/2, Z=play.standZ, W=PLAY_W, H=PLAY_H;
  if(!renderShadowSprite._bk || renderShadowSprite._bk.length!==W*H){
    renderShadowSprite._bk=new Uint8Array(W*H); renderShadowSprite._dp=new Float32Array(W*H);
  }
  const bk=renderShadowSprite._bk, dp=renderShadowSprite._dp; bk.fill(255); dp.fill(Infinity);
  const kk=SHADOW_LEN/Math.max(1,ext.z);     // desplazamiento por unidad de altura
  const items=[]; for(const k in vox){ const [x,y,z]=k.split(',').map(Number); items.push([x,y,z]); }
  items.sort((a,b)=>b[2]-a[2]);              // z alto primero => el contacto (z bajo) se pinta ENCIMA
  let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
  // z de la superficie bajo la celda (x,y): tapa del mueble/suelo => la sombra se posa ENCIMA
  const cap=Z+ext.z;                          // BUG-SH1: la sombra SOLO trepa a columnas más bajas que el personaje;
  const surfAt=(cx,cy)=>{ if(!play.surfZ) return Z;   // lo más alto que él (paredes) NO se trepa: se posa en el suelo
    const xi=Math.floor(cx), yi=Math.floor(cy);
    if(xi<0||yi<0||xi>=play.surfW||yi>=play.surfH) return Z;
    const t=play.surfZ[yi*play.surfW+xi]; return (t>=0 && t+1<=cap) ? t+1 : Z; };
  for(const [x,y,z] of items){
    const off=z*kk, sx=ox+x+off*SHADOW_DX, sy=oy+y+off*SHADOW_DY;
    const zc=surfAt(sx+0.5, sy+0.5);         // BUG-SH1: plano de proyección = tapa de la columna, no suelo fijo
    const p0=g.screen(sx,sy,zc), p1=g.screen(sx+1,sy,zc), p2=g.screen(sx+1,sy+1,zc), p3=g.screen(sx,sy+1,zc);
    for(const q of [p0,p1,p2,p3]){ if(q[0]<bx0)bx0=q[0]; if(q[0]>bx1)bx1=q[0]; if(q[1]<by0)by0=q[1]; if(q[1]>by1)by1=q[1]; }
    const bucket=Math.min(9, off|0);         // cercanía a los pies (0 = contacto)
    scanQuad(bk,W,H, bucket, p0[0],p0[1],p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);
    scanQuad(dp,W,H, g.depthOf(sx+0.5,sy+0.5,zc), p0[0],p0[1],p1[0],p1[1],p2[0],p2[1],p3[0],p3[1]);
  }
  if(bx1<bx0) return {cvs:document.createElement('canvas'), ox:0, oy:0, dw:0, dh:0, depth:new Float32Array(0)};
  const cx0=Math.max(0,Math.floor(bx0)-1), cy0=Math.max(0,Math.floor(by0)-1);
  const cw=Math.max(1,Math.min(W-cx0, Math.ceil(bx1)-cx0+2)), chh=Math.max(1,Math.min(H-cy0, Math.ceil(by1)-cy0+2));
  const cvs=document.createElement('canvas'); cvs.width=cw; cvs.height=chh;
  const octx=cvs.getContext('2d'), img=octx.createImageData(cw,chh), ib=new Uint32Array(img.data.buffer);
  const depC=new Float32Array(cw*chh);
  for(let y=0;y<chh;y++) for(let x=0;x<cw;x++){
    const i=(cy0+y)*W+(cx0+x), b=bk[i];
    depC[y*cw+x]=dp[i];
    if(b===255) continue;
    const a=Math.max(26, Math.round(255*(0.40-0.030*b)));      // gradiente: 0.40 contacto -> ~0.13 punta
    ib[y*cw+x]=(a<<24)|0x000a0806;                             // negro azulado, alfa horneada
  }
  octx.putImageData(img,0,0);
  return {cvs, ox:cx0, oy:cy0, dw:cw, dh:chh, depth:depC};
}
// BUG-SH1: (re)hornea la sombra de la orientación `fi` centrada en la CELDA real del jugador, para
// que el campo de alturas (surfAt) muestree los muebles/paredes JUNTO al jugador y la sombra trepe
// a ellos. Se llama solo al cambiar de celda/orientación (barato); entre medias se traslada el decal.
function bakeShadowAt(fi, cxi, cyi){
  const c=play.charRot&&play.charRot[fi]; if(!c){ play.curShadow=null; return; }
  play.curShadow=renderShadowSprite(c.vox, c.ext, cxi+0.5, cyi+0.5);
  play.curShadowFoot=play.g.screen(cxi+0.5, cyi+0.5, 0);
  play.curShadowDepth0=play.g.depthOf(cxi+0.5, cyi+0.5, 0);
}
// índice de sprite por dirección de avance, con histéresis (en diagonales no oscila).
// orden de sprites por rotación CW desde el frente (+y): 0:+y · 1:+x · 2:-y · 3:-x
function faceFromDelta(dx,dy,cur){
  const ax=Math.abs(dx), ay=Math.abs(dy);
  if(Math.max(ax,ay)<1e-3) return cur;
  if(ax>ay*1.2) return dx>0?1:3;   // +x→1 · -x→3
  if(ay>ax*1.2) return dy>0?0:2;   // +y→0 · -y→2   (frente del modelo = +y)
  return cur;
}

const DOOR_HW=2;   // media anchura de la puerta (=> 5 casillas)
// Media anchura MÍNIMA del vano tallado en el muro, en unidades NATIVAS: garantiza una puerta
// pisable pase el doorTrim que pase (doorTrim=0 abre el vano mínimo sin recortar muebles; el
// "láser" de 1 vóxel era por acotar la banda a 1 fila). El recorte de MUEBLE (doorTrim) es aparte.
const WALL_HW_NATIVE=3;   // => vano de 7 nativo, ≥ huella erosionada (r=3)
// Vecinos del mapa con sala => a qué celda lleva cada lado.
function roomExits(cellKey){
  const [c,r]=cellKey.split(',').map(Number), cand={W:[c-1,r], E:[c+1,r], N:[c,r-1], S:[c,r+1]}, out={};
  for(const dir in cand){ const [nc,nr]=cand[dir]; if(nc<0||nr<0||nc>=mapa.cols||nr>=mapa.rows) continue;
    const nk=nc+','+nr; if(mapa.cells[nk]&&mapa.cells[nk].room) out[dir]=nk; }
  return out;
}
// Talla una puerta (quita muro + asegura suelo) en cada lado con vecino. No destructivo (sobre copia).
// hw = media anchura · depth = grosor a atravesar · floorTop = tapa del suelo que debe quedar pisable.
// Taladra la puerta ATRAVESANDO SOLO EL MURO: desde el borde hacia dentro mientras la columna
// tiene voxels sobre el suelo, y se PARA al llegar al interior (hueco). Así, en bordes abiertos
// (sin muro) no toca nada, y nunca parte muebles que estén separados del muro por suelo.
function carveDoorways(vox, dim, exits, hw, maxDepth, floorTop){
  hw=hw??DOOR_HW; maxDepth=maxDepth??3; floorTop=floorTop??0;
  const cxm=Math.floor(dim.x/2), cym=Math.floor(dim.y/2);
  const floorC = vox[cxm+','+cym+','+floorTop] || '#3a3f48';
  const solidAbove=(x,y)=>{ for(let z=floorTop+1;z<dim.z;z++) if(vox[x+','+y+','+z]!==undefined) return true; return false; };
  const clearCol=(x,y)=>{ for(let z=floorTop+1;z<dim.z;z++) delete vox[x+','+y+','+z];
    vox[x+','+y+','+floorTop]=vox[x+','+y+','+floorTop]||floorC; };
  // Avanza desde el borde: SALTA el margen vacío (las salas nativas tienen el muro embutido, no en
  // el borde de la rejilla), taladra la banda sólida del muro y para en el primer hueco INTERIOR.
  // Así doorTrim=0 abre igualmente un vano pisable (antes punch cortaba en el margen y no llegaba al muro).
  const punch=(x0,y0,dx,dy)=>{ let started=false;
    for(let i=0;i<maxDepth;i++){ const x=x0+dx*i, y=y0+dy*i;
      if(x<0||y<0||x>=dim.x||y>=dim.y) break;
      if(solidAbove(x,y)){ clearCol(x,y); started=true; }
      else if(started) break; } };
  // banda acotada a la rejilla: hw arbitrario (incl. 0/negativo/enorme) no crea voxels fuera ni cuelga
  const yA=Math.max(0,cym-hw), yB=Math.min(dim.y-1,cym+hw), xA=Math.max(0,cxm-hw), xB=Math.min(dim.x-1,cxm+hw);
  if(exits.W) for(let y=yA;y<=yB;y++) punch(0,y, 1,0);
  if(exits.E) for(let y=yA;y<=yB;y++) punch(dim.x-1,y, -1,0);
  if(exits.N) for(let x=xA;x<=xB;x++) punch(x,0, 0,1);
  if(exits.S) for(let x=xA;x<=xB;x++) punch(x,dim.y-1, 0,-1);
}
// Despeja el CARRIL de cada salida REAL: quita el mueble sobre el suelo en la banda de la puerta,
// del borde hacia dentro pero SOLO hasta `maxDepth` casillas (NO hasta el centro) => un mueble
// LEJANO o CÉNTRICO (celda, yunque) al otro lado de la sala queda intacto (BUG-DT1). Solo actúa en
// los lados CON vecino (play.exits) y sobre la copia coarse (el ASSET de origen no se toca).
// Conserva la tapa del suelo. carveDoorways ya abrió el muro; esto despeja el mueble junto al vano.
function clearExitLanes(vox, dim, exits, hw, floorTop, maxDepth){
  hw=hw??DOOR_HW; floorTop=floorTop??0; maxDepth=maxDepth??Math.max(dim.x,dim.y);
  const cxm=Math.floor(dim.x/2), cym=Math.floor(dim.y/2);
  const floorC = vox[cxm+','+cym+','+floorTop] || '#3a3f48';
  const clearCol=(x,y)=>{ if(x<0||y<0||x>=dim.x||y>=dim.y) return;
    for(let z=floorTop+1;z<dim.z;z++) delete vox[x+','+y+','+z];
    vox[x+','+y+','+floorTop]=vox[x+','+y+','+floorTop]||floorC; };
  const lane=(x0,y0,dx,dy)=>{ for(let i=0;i<maxDepth;i++) clearCol(x0+dx*i, y0+dy*i); };
  // banda acotada a la rejilla: hw arbitrario no crea voxels fuera ni itera de más
  const yA=Math.max(0,cym-hw), yB=Math.min(dim.y-1,cym+hw), xA=Math.max(0,cxm-hw), xB=Math.min(dim.x-1,cxm+hw);
  if(exits.E) for(let y=yA;y<=yB;y++) lane(dim.x-1,y, -1,0);
  if(exits.W) for(let y=yA;y<=yB;y++) lane(0,y, 1,0);
  if(exits.S) for(let x=xA;x<=xB;x++) lane(x,dim.y-1, 0,-1);
  if(exits.N) for(let x=xA;x<=xB;x++) lane(x,0, 0,1);
}
// Carga una sala en el modo juego manteniendo el personaje (play.charRef). spawn opcional [x,y].
async function playLoadRoom(cellKey, spawn){
  PLAY_VIEW.persp = view3d.persp;                     // REQ-PERSP: el modo jugar hereda la proyección de la edición 3D (cónica u ortográfica)
  play.cellKey=cellKey; const cell=mapa.cells[cellKey];
  const raw=await getRoomData(cell.room);
  const coarse=Object.assign({}, raw.voxels||{});                  // copia => tallar puertas sin tocar el asset
  const s=raw.size||28, cdim=(typeof s==='number')?{x:s,y:s,z:s}:s;
  play.exits=roomExits(cellKey);
  // Salas NATIVAS a escala de personaje (dim>=64, assets recreados) se usan tal cual; las de
  // rejilla pequeña (legado/guardadas 28³) se escalan ×4 al vuelo. El personaje SIEMPRE nativo.
  const native = cdim.x>=64, f = native ? 1 : PLAY_SCALE;
  const trimC = native ? playTrim : Math.round(playTrim/PLAY_SCALE);   // recorte de MUEBLE (gate de apertura va por playTrim<=0=cerrada)
  const wallMinC = native ? WALL_HW_NATIVE : Math.max(1, Math.round(WALL_HW_NATIVE/PLAY_SCALE));
  const wallHwC = Math.max(trimC, wallMinC);      // vano del MURO: SIEMPRE pisable aunque doorTrim=0
  const floorTopC = native ? PLAY_SCALE-1 : 0, depthC = native ? 16 : 4;
  if(playTrim>0){                                 // doorTrim<=0 = puerta CERRADA (muro intacto); >0 abre el vano y recorta
    carveDoorways(coarse, cdim, play.exits, wallHwC, depthC, floorTopC);        // taladra el muro con anchura mínima garantizada
    if(trimC>0) clearExitLanes(coarse, cdim, play.exits, trimC, floorTopC, depthC); // recorta el mueble SOLO junto al vano (nada si el recorte redondea a 0)
  }
  const up = f>1 ? upscaleRoom(coarse, cdim, f) : {vox:coarse, dim:cdim};
  const roomVox=up.vox, dim=up.dim;
  const big = native || f>1;                                       // "escala personaje" en cualquiera de las vías
  play.scale = big ? PLAY_SCALE : 1;
  play.standZ = big ? PLAY_SCALE : 1;                              // suelo de losa 4 => pies a z=4
  play.doorHw = big ? wallHwC*f : DOOR_HW;         // zona de disparo de salida = vano real del muro (no el trim), en rejilla final
  play.speed = 6.5*play.scale;                                     // misma velocidad aparente
  // aprovechar TODO el escenario: el canvas se estira al 100% del stage y el buffer toma su
  // tamaño REAL renderizado (medir el canvas ya estirado, no el padre; dpr 1 = estética pixelada)
  const cv=$('#play-canvas');
  cv.style.width='100%'; cv.style.height='100%';
  PLAY_W=Math.max(480, cv.clientWidth||760);
  PLAY_H=Math.max(360, cv.clientHeight||560);
  cv.width=PLAY_W; cv.height=PLAY_H;
  PLAY_VIEW.zoom=_playZoom; PLAY_VIEW.panX=0; PLAY_VIEW.panY=-_playLift*PLAY_H;   // REQ-PLAYFIT: acerca y sube la sala para comerse el margen del techo abierto (fondo ocluido)
  const saved=state.voxels; state.voxels=new Map(Object.entries(roomVox));
  const base=document.createElement('canvas'); base.width=PLAY_W; base.height=PLAY_H;
  renderFree3d(base.getContext('2d'), PLAY_W, PLAY_H, PLAY_VIEW, false);
  play.g=project3d(PLAY_W, PLAY_H, PLAY_VIEW); state.voxels=saved; play.base=base;
  game.voxels=_voxDrawnLast; updatePlayMeters();                  // REQ-DBG1: voxels dibujados de la sala (tras culling)
  // Oclusión POR PÍXEL: imagen base + buffer de profundidad de la superficie visible
  // (raster en orden pintor => por píxel queda la profundidad de lo más CERCANO). Sin AA.
  play.baseImg=base.getContext('2d').getImageData(0,0,PLAY_W,PLAY_H);
  const depth=new Float32Array(PLAY_W*PLAY_H); depth.fill(Infinity);
  for(const v of play.g.list) for(let fi=0;fi<6;fi++){
    if(!faceVis3d(play.g,v,fi)) continue;
    const p=facePoly3d(play.g,v,fi);
    scanQuad(depth,PLAY_W,PLAY_H, v.d, p[0][0],p[0][1],p[1][0],p[1][1],p[2][0],p[2][1],p[3][0],p[3][1]);
  }
  play.depth=depth;
  // rejilla pisable (puertas ya abiertas): cuerpo ~28 de alto y huella dilatada 3 (personaje nativo)
  const bodyH = big ? 28 : 5, w=buildWalk(roomVox, dim, play.standZ-1, bodyH);
  play.walk = big ? erodeWalk(w.walk, w.obst, dim, 3) : w.walk;
  play.dim=dim;
  // BUG-SH1: campo de alturas de la sala (z de la SUPERFICIE por columna) para que la sombra TREPE
  // a la tapa de muebles/escalones/paredes en vez de que estos la oculten. -1 = fuera de la sala.
  const surf=new Int16Array(dim.x*dim.y); surf.fill(-1);
  for(const k in roomVox){ const c=k.indexOf(','), c2=k.indexOf(',',c+1);
    const x=+k.slice(0,c), y=+k.slice(c+1,c2), z=+k.slice(c2+1), idx=y*dim.x+x;
    if(z>surf[idx]) surf[idx]=z; }
  play.surfZ=surf; play.surfW=dim.x; play.surfH=dim.y;
  // sprites del personaje SIN reducir (resolución nativa) + su sombra proyectada por orientación
  const charData=await getRoomData(play.charRef), ch=charShell(charData);
  const refX=dim.x/2, refY=dim.y/2; play.refFoot=play.g.screen(refX,refY,0);
  play.refDepth0=play.g.depthOf(refX,refY,0);                    // profundidad de referencia (z=0) para la oclusión
  play.sprites=[]; play.charRot=[];
  let cur={vox:ch.voxels, ext:ch.ext};
  for(let i=0;i<4;i++){ play.charRot.push(cur);                       // BUG-SH1: guardo cada orientación para re-hornear la sombra al andar
    play.sprites.push(renderPlayerSprite(cur.vox,cur.ext,refX,refY)); cur=rotate90(cur.vox,cur.ext); }
  play.shadowKey=''; play.spriteKey='';                               // fuerza hornear sombra y sprite en la celda real en el primer render
  // spawn
  let sp = spawn && isWalk(spawn[0],spawn[1]) ? spawn
         : spawn ? nearestWalk(spawn[0],spawn[1])
         : (nearestWalk(Math.floor(dim.x*0.6),Math.floor(dim.y*0.6)) || nearestWalk(Math.floor(dim.x/2),Math.floor(dim.y/2)) || [Math.floor(dim.x/2),Math.floor(dim.y/2)]);
  play.pos={x:sp[0], y:sp[1]}; play.path=[];
  const ent=catEntry(cell.room); $('#play-sub').textContent=ent?('· '+ent.name):'';
  syncGameRoom();                                     // refresca game.room (name/cell/exits/pos/doorTrim)
}
async function enterPlay(ref){
  play.charRef=ref;
  $('#play-choose').hidden=true; $('#play-stage').hidden=false;   // visible ANTES para poder medirlo
  await playLoadRoom(play.cellKey, null);
  play.facing=0;
  play.active=true; play.fade=0; renderPlay(); updatePlayMeters();   // REQ-DBG1: medidores visibles ya activa la partida
  play.last=performance.now(); stopPlayLoop(); play.raf=requestAnimationFrame(playTick);
}
// ¿el jugador está en una puerta con vecino? => dir + celda destino
function checkExit(){
  const {x,y}=play.pos, d=play.dim, cxm=Math.floor(d.x/2), cym=Math.floor(d.y/2), ex=play.exits||{};
  const hw=play.doorHw||DOOR_HW, edge=0.5+(play.scale>1?2:0), far=1.5+(play.scale>1?2:0);
  if(ex.W && x<=edge  && Math.abs(y-cym)<=hw) return {dir:'W', to:ex.W};
  if(ex.E && x>=d.x-far && Math.abs(y-cym)<=hw) return {dir:'E', to:ex.E};
  if(ex.N && y<=edge  && Math.abs(x-cxm)<=hw) return {dir:'N', to:ex.N};
  if(ex.S && y>=d.y-far && Math.abs(x-cxm)<=hw) return {dir:'S', to:ex.S};
  return null;
}
async function playTransition(ex){
  play.transitioning=true; play.path=[]; play.fade=1;              // fundido a negro
  const d=play.dim, cxm=Math.floor(d.x/2), cym=Math.floor(d.y/2);
  const m=1+play.scale; const spawn = ex.dir==='W' ? [d.x-1-m,cym] : ex.dir==='E' ? [m,cym] : ex.dir==='N' ? [cxm,d.y-1-m] : [cxm,m];
  await playLoadRoom(ex.to, spawn);
  play.transitioning=false; play.last=performance.now(); renderPlay();  // pinta ya la sala nueva; el fade se disuelve en los ticks siguientes
}
function playTick(now){
  if(!play.active) return;
  const dt=Math.min(0.05,(now-play.last)/1000); play.last=now;
  if(!play.transitioning && play.path.length){
    const t=play.path[0], dx=t.x-play.pos.x, dy=t.y-play.pos.y, dist=Math.hypot(dx,dy), step=play.speed*dt;
    play.facing=faceFromDelta(dx,dy,play.facing);
    if(dist<=step){ play.pos.x=t.x; play.pos.y=t.y; play.path.shift(); }
    else { play.pos.x+=dx/dist*step; play.pos.y+=dy/dist*step; }
    const ex=checkExit(); if(ex){ playTransition(ex); }   // pisó una puerta => cambia de sala
    renderPlay(); syncGameRoom();                          // game.room.pos al día mientras camina
  } else if(play.fade>0 && !play.transitioning){ renderPlay(); }
  if(!play.transitioning && play.fade>0) play.fade=Math.max(0, play.fade-dt*2.5);   // el fade se mantiene lleno durante la carga; solo se disuelve tras completar la transición
  // REQ-DBG1: FPS REAL de pantalla (ventana ~0.5 s) → game.fps + medidor de Play
  play.fpsN=(play.fpsN||0)+1;
  if(play.fpsT===undefined) play.fpsT=now;
  if(now-play.fpsT>=500){ game.fps=play.fpsN*1000/(now-play.fpsT); play.fpsN=0; play.fpsT=now; if(_showFPS) updatePlayMeters(); }
  play.raf=requestAnimationFrame(playTick);
}
function renderPlay(){
  const ctx=$('#play-canvas').getContext('2d');
  ctx.clearRect(0,0,PLAY_W,PLAY_H); ctx.drawImage(play.base,0,0);
  const cur=play.g.screen(play.pos.x, play.pos.y, 0);          // traslada el sprite al pie del jugador
  const fi=(play.facing+PLAY_FACING_OFFSET)%4;
  const ci=Math.floor(play.pos.x), cj=Math.floor(play.pos.y);
  // REQ-PERSP: en proyección cónica la escala del billboard varía con la profundidad, así que
  //   re-horneo el sprite en la CELDA real (como la sombra) y solo traslado la fracción sub-celda.
  //   En ortográfica la escala es constante => sprite horneado una vez y trasladado (sin regresión).
  let sp, spFoot, spDepth0;
  if(PLAY_VIEW.persp){
    const pkey=ci+','+cj+','+fi;
    if(pkey!==play.spriteKey){
      const c=play.charRot[fi], acx=ci+0.5, acy=cj+0.5;
      play.curSprite=renderPlayerSprite(c.vox,c.ext,acx,acy);
      play.curSpriteFoot=play.g.screen(acx,acy,0);
      play.curSpriteDepth0=play.g.depthOf(acx,acy,0);
      play.spriteKey=pkey;
    }
    sp=play.curSprite; spFoot=play.curSpriteFoot; spDepth0=play.curSpriteDepth0;
  } else { sp=play.sprites[fi]; spFoot=play.refFoot; spDepth0=play.refDepth0; }
  const dx=cur[0]-spFoot[0], dy=cur[1]-spFoot[1];
  const dd=play.g.depthOf(play.pos.x, play.pos.y, 0) - spDepth0;   // Δ profundidad por moverse (afín en la celda)
  const dep=play.depth, bb=new Uint32Array(play.baseImg.data.buffer);
  // 1) SOMBRA (alfa ya horneada). BUG-SH1: se hornea en la CELDA real del jugador (surfAt muestrea
  //    los muebles de al lado => la sombra trepa a su tapa) y se traslada por la fracción sub-celda.
  //    La oclusión restaura la base solo donde la sala está MÁS CERCA que la SUPERFICIE de la sombra
  //    (un objeto MÁS ALTO por delante), no donde la sombra reposa sobre la tapa de un mueble.
  const skey=ci+','+cj+','+fi;
  if(skey!==play.shadowKey){ bakeShadowAt(fi, ci, cj); play.shadowKey=skey; }
  const sh=play.curShadow;
  if(sh && sh.cvs.width>1){
    const sdx=cur[0]-play.curShadowFoot[0], sdy=cur[1]-play.curShadowFoot[1];   // desplazamiento sub-celda
    const sdd=play.g.depthOf(play.pos.x, play.pos.y, 0) - play.curShadowDepth0;
    const sx0=Math.round(sdx+sh.ox), sy0=Math.round(sdy+sh.oy), sw=sh.dw, sh2=sh.dh;
    ctx.drawImage(sh.cvs, sx0, sy0);
    const ax0=Math.max(0,sx0), ay0=Math.max(0,sy0), ax1=Math.min(PLAY_W-1,sx0+sw-1), ay1=Math.min(PLAY_H-1,sy0+sh2-1);
    if(ax1>=ax0 && ay1>=ay0){
      const w=ax1-ax0+1, h=ay1-ay0+1, reg=ctx.getImageData(ax0,ay0,w,h), rb=new Uint32Array(reg.data.buffer);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const cX=ax0+x, cY=ay0+y, i=cY*PLAY_W+cX, lp=(cY-sy0)*sw+(cX-sx0);
        if(sh.depth[lp]!==Infinity && dep[i] < sh.depth[lp]+sdd-0.6) rb[y*w+x]=bb[i]; }   // objeto MÁS ALTO por delante => tapa la sombra
      ctx.putImageData(reg,ax0,ay0);
    }
  }
  // 2) JUGADOR + oclusión POR PÍXEL de su profundidad: la sala solo lo tapa donde el JUGADOR existe
  //    (sdep finito) Y está más cerca que él. Así una pared DETRÁS no lo oculta y NO se toca la sombra.
  ctx.drawImage(sp.cvs, dx+sp.ox, dy+sp.oy);
  const spx=Math.round(dx+sp.ox), spy=Math.round(dy+sp.oy), cw=sp.dw, chh=sp.dh, sdep=sp.depth;
  const bx0=Math.max(0,spx), by0=Math.max(0,spy), bx1=Math.min(PLAY_W-1,spx+cw-1), by1=Math.min(PLAY_H-1,spy+chh-1);
  if(bx1>=bx0 && by1>=by0){
    const w=bx1-bx0+1, h=by1-by0+1;
    const reg=ctx.getImageData(bx0,by0,w,h), rb=new Uint32Array(reg.data.buffer);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const cX=bx0+x, cY=by0+y, i=cY*PLAY_W+cX, lp=(cY-spy)*cw+(cX-spx), pd=sdep[lp];
      if(pd!==Infinity && dep[i] < pd+dd) rb[y*w+x]=bb[i];        // solo donde hay jugador y la sala está delante
    }
    ctx.putImageData(reg,bx0,by0);
  }
  if(play.fade>0){ ctx.fillStyle='rgba(6,8,14,'+play.fade+')'; ctx.fillRect(0,0,PLAY_W,PLAY_H); }   // fundido de transición
}
// clic en el suelo => calcula ruta hasta la casilla (inversa de la proyección del plano z=Z a pantalla).
// El plano→pantalla es una HOMOGRAFÍA (afín en ortográfica, proyectiva en cónica): muestreo las 4
// esquinas del cuadrado unidad (0,0)(1,0)(1,1)(0,1) en pantalla, construyo la matriz cuadrado→pantalla
// (forma cerrada de Heckbert) y la invierto. Exacta en AMBAS proyecciones (REQ-PERSP en modo jugar).
function playScreenToCell(sx,sy){
  const g=play.g, Z=play.standZ;
  const q0=g.screen(0,0,Z), q1=g.screen(1,0,Z), q2=g.screen(1,1,Z), q3=g.screen(0,1,Z);
  const x0=q0[0],y0=q0[1], x1=q1[0],y1=q1[1], x2=q2[0],y2=q2[1], x3=q3[0],y3=q3[1];
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3, dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
  let a,b,c,d,e,f,gg,hh;
  if(Math.abs(dx3)<1e-9 && Math.abs(dy3)<1e-9){                       // afín (ortográfica)
    a=x1-x0; b=x3-x0; c=x0; d=y1-y0; e=y3-y0; f=y0; gg=0; hh=0;
  } else {                                                            // proyectiva (cónica)
    const den=dx1*dy2-dx2*dy1;
    gg=(dx3*dy2-dx2*dy3)/den; hh=(dx1*dy3-dx3*dy1)/den;
    a=x1-x0+gg*x1; b=x3-x0+hh*x3; c=x0; d=y1-y0+gg*y1; e=y3-y0+hh*y3; f=y0;
  }
  // M = [[a,b,c],[d,e,f],[gg,hh,1]] mapea (u,v,1)->(x·w,y·w,w). Invierto 3×3 y aplico al clic.
  const A=e-f*hh, B=c*hh-b, C=b*f-c*e,
        D=f*gg-d, E=a-c*gg, F=c*d-a*f,
        G=d*hh-e*gg, H=b*gg-a*hh, I=a*e-b*d;
  const w=G*sx+H*sy+I, u=(A*sx+B*sy+C)/w, v=(D*sx+E*sy+F)/w;
  return { x:Math.floor(u), y:Math.floor(v) };
}
$('#play-canvas').addEventListener('pointerdown',e=>{
  if(!play.active) return;
  const cv=$('#play-canvas'), r=cv.getBoundingClientRect();
  const sx=(e.clientX-r.left)*cv.width/r.width, sy=(e.clientY-r.top)*cv.height/r.height;
  const c=playScreenToCell(sx,sy);
  const path=findPath(Math.round(play.pos.x), Math.round(play.pos.y), c.x, c.y);
  if(path && path.length) play.path=path;
});
// redimensionar la ventana en modo juego => re-renderizar al nuevo tamaño manteniendo la posición
let playResizeT=null;
window.addEventListener('resize',()=>{
  if(!play.active || $('#play-stage').hidden) return;
  clearTimeout(playResizeT);
  playResizeT=setTimeout(async()=>{
    const p=[Math.round(play.pos.x), Math.round(play.pos.y)];
    await playLoadRoom(play.cellKey, p); renderPlay();
  }, 200);
});
$('#room-play').onclick=()=>{ if(roomCell) openPlay(roomCell); };
$('#play-close').onclick=closePlay;
$('#play-back').onclick=()=>{ closePlay(); };
$('#play-modal').addEventListener('click',e=>{ if(e.target.id==='play-modal') closePlay(); });

/* ===================== Mundo (REQ-MC · sandbox 3D en primera persona, WebGL) =====================
 * Sección aparte del editor 2D/3D: rasteriza por GPU con WebGL crudo (sin three.js, sin build; GLSL
 * como strings). El mundo se divide en chunks que se meshan una vez y se dibujan en pocas llamadas,
 * así el coste por fotograma va con los chunks visibles (frustum cull + far-plane), no con el nº total
 * de voxels → 60fps holgados incluso con cientos de miles de bloques. F1 monta la pantalla, el
 * contexto GL, el bucle por rAF y el medidor de FPS; el terreno, meshing y física llegan en F2-F5. */
const MC_SKY=[0.549,0.776,1.0];   // color cielo (calca .mc-modal en CSS)
const MC_CHUNK=16;                // lado del chunk en x/z (la columna vertical y entera va en un chunk)
const MC_MAXLIGHT=15;             // nivel máximo de luz del cielo (t7 skylight): se pierde 1 por bloque al difundirse por el aire
const MC_TILE=16;                 // px por cara en el atlas (las texturas son 16³)
// Bloques del terreno/hotbar. `top`/`side`/`bottom` fijan qué cara del asset (proyección de buildTexFaces,
// orden CUBE_FACES) se usa como superior/lateral/inferior — para hierba: verde arriba, tierra a los lados.
const MC_BLOCKS=[
  { name:'hierba',  key:'asset:assets/hierba.vox.json'  },
  { name:'tierra',  key:'asset:assets/tierra.vox.json'  },
  { name:'roca',    key:'asset:assets/roca.vox.json'    },
  { name:'tablones',key:'asset:assets/tablones.vox.json'},
  { name:'adoquin', key:'asset:assets/adoquin.vox.json' },
  { name:'arena',   key:'asset:assets/arena.vox.json'   },
];
// 6 caras del voxel en mundo Y-ARRIBA, DERIVADAS de CUBE_FACES (asset Z-arriba) por el cambio de eje
// world=(ax,az,ay). Así `corners` (orden c0..c3) y el mapeo UV coinciden EXACTO con drawTexFace del editor
// → la textura sale igual orientada que en la galería (el borde hierba/tierra queda arriba en los laterales).
// `tex` = índice de cara en buildTexFaces; `s` = misma sombra base que el editor; `dir` = normal (culling).
const MC_FACES=[
  { dir:[0, 1,0], tex:0, s:1.12, corners:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]] }, // +Y arriba  ← asset +Z
  { dir:[0,-1,0], tex:1, s:0.40, corners:[[0,0,0],[0,0,1],[1,0,1],[1,0,0]] }, // -Y abajo   ← asset -Z
  { dir:[1, 0,0], tex:2, s:0.64, corners:[[1,0,0],[1,0,1],[1,1,1],[1,1,0]] }, // +X         ← asset +X
  { dir:[-1,0,0], tex:3, s:0.82, corners:[[0,0,0],[0,1,0],[0,1,1],[0,0,1]] }, // -X         ← asset -X
  { dir:[0,0, 1], tex:4, s:0.52, corners:[[0,0,1],[0,1,1],[1,1,1],[1,0,1]] }, // +Z         ← asset +Y
  { dir:[0,0,-1], tex:5, s:0.92, corners:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]] }, // -Z         ← asset -Y
];
// Meta por cara para el greedy meshing: eje normal (nAx) + los dos ejes en el plano de la cara (A<B), y a qué
// eje de MUNDO corresponde cada eje de la TEXTURA (tuAx = varía entre corner0→1; tvAx = entre corner1→2). Con
// esto una cara fusionada W×H repite la textura W/H veces por voxel (fract en el shader) sin subdividir geometría.
const MC_FMETA=MC_FACES.map(F=>{
  const q=F.corners, nAx=F.dir[0]?0:(F.dir[1]?1:2), inpl=[0,1,2].filter(a=>a!==nAx);
  const diff=(p,r)=>{ for(let a=0;a<3;a++) if(p[a]!==r[a]) return a; return inpl[0]; };
  return { nAx, A:inpl[0], B:inpl[1], tuAx:diff(q[0],q[1]), tvAx:diff(q[1],q[2]) };
});
const mc={
  active:false, raf:0, last:0,
  gl:null, canvas:null,
  fps:0, fpsN:0, fpsT:0,          // medidor de FPS reales (calca play.fps*)
  grid:null, dim:{x:0,y:0,z:0},   // rejilla densa Uint16Array (0=aire, >0=id de bloque); Y es vertical
  spawn:{x:0,y:0,z:0},
  blocks:[],                      // lista MUTABLE de bloques {name,key} (arranca = MC_BLOCKS; crece desde la galería)
  palette:[], blockKey:[], name2id:{}, // paleta: por id, sus 6 rects UV; blockKey[id]=clave para serializar
  atlas:null, atlasTex:null,      // canvas del atlas + textura GL
  atlasHasAlpha:true,             // ¿el atlas del terreno tiene texels translúcidos? (si no, shader sin discard → early-z)
  catalog:null, pickSlot:-1,      // catálogo de galería (bloques+texturas) y ranura que edita el selector
  structs:{},                     // caché por sala: malla fina {colLocal,colCount, texLocal,texCount, ext, solid}
  slotStruct:[],                  // por ranura: srcKey si la ranura lleva una ESTRUCTURA (habitación), null si bloque suelto
  structures:[],                  // instancias estampadas: {key, ox,oy,oz, rot, colVbo,colCount, texVbo,texCount, aabb} (voxeles finos, malla propia 1/16; rot=cuartos de vuelta que la orientan al jugador)
  structAtlas:null, structAtlasTex:null, // atlas de TEXTURAS de estructuras (gemelo de atlas/atlasTex) — solo claves tex: usadas por las estructuras vivas
  structUV:{},                    // clave tex: → [6 rects UV] dentro del atlas de estructuras
  notes:{}, noteCell:null,        // t1 · notas post-it: "x,y,z" → texto (persiste en mundo.json); noteCell = bloque que edita el panel
  noteAlpha:0.85,                 // opacidad del marcador flotante de nota (game.noteAlpha)
  unlockedAt:0,                   // instante (perf.now) en que se soltó el pointer-lock (para el Esc de 2 pasos)
  chunks:new Map(),               // "cx,cz" -> {vbo, count, dirty}
  prog:null, loc:null,            // programa GLSL del terreno (atlas) + localizaciones
  structProg:null, structLoc:null,// programa GLSL de estructuras (color por vértice) + localizaciones
  pos:[0,0,0], yaw:0, pitch:-0.15,// jugador: pos = PIES (x,z centro; y base del AABB); el ojo = pos.y+MC_EYE
  vel:[0,0,0], onGround:false, keys:{}, // física (F4)
  hotbar:[], sel:0,               // hotbar (F5): 9 ranuras (id de bloque, 0=vacía) y ranura activa
  fov:1.15, renderDist:8,         // tunables (game.fov / game.renderDist)
  renderScale:1,                  // escala de la resolución de render (game.renderScale; <1 = menos píxeles = más fps)
  sens:0.000625,                  // sensibilidad del ratón, rad/px (base 0.0025 × mouseSpeed 0.25 por defecto; game.mouseSpeed = múltiplo)
  reach:16,                       // alcance de romper/poner en bloques (game.reach)
  speed:10,                       // velocidad de marcha en u/s (game.playerSpeed; Shift = mitad)
  airControl:true,                // game.airControl: movimiento en el aire estilo Quake (air-strafe). true = girar el ratón NO redirige el salto y W/A/S/D solo nudgea; false = clásico (velocidad reescrita cada frame)
  airAccel:6,                     // game.airAccel: aceleración hacia wishdir en el aire (mayor = el nudge alcanza el tope más rápido)
  airCap:3,                       // game.airCap: tope (u/s, ∝√scale) de la componente de velocidad que se puede AÑADIR en el aire por dirección → cuánto se puede desviar/ganar. Mientras sea < velocidad de salto no hay acel. recta hacia delante (anti-truco)
  scale:1,                        // escala del jugador (game.playerScale; >1 = grande → todo más pequeño)
  tool:'build',                   // acción del clic derecho (game.playerTool: 'build' pone al lado | 'paint' repinta el bloque)
  structTextures:true,            // game.structTextures: true = estructuras texturadas de verdad (detalle del editor, coste nivel 1) · false = color plano por cara (media, más barato)
  structGreedy:true,              // game.structGreedy: true = greedy meshing (fusiona caras coplanares de la misma textura/color → muchas menos caras) · false = una cara por voxel (como antes)
  heldBtn:-1, actAt:0,            // botón de ratón mantenido (construir/romper continuo) y último instante de acción
  xray:false,                     // modo rayos-X (tecla X): dibuja el volumen de colisión translúcido a través de las paredes
  ovbo:null,                      // VBO reutilizable para overlays (fantasma de colocación, marcador «demasiado lejos», rayos-X)
  ghostAlpha:0,                   // transparencia del fantasma de bloque suelto —verde (colocable) y ámbar («demasiado lejos»)— (game.ghostAlpha, 0..1; 0=invisible)
  structGhostAlpha:1,             // transparencia de la vista-previa de estructuras/habitaciones —caja de huella + malla renderizada— (game.structGhostAlpha, 0..1)
  preview:null,                   // instancia-malla de la vista-previa mientras se mantiene el clic derecho (habitación renderizada siguiendo la mira)
  previewKey:null,                // memo "sk|ox|oy|oz|rot" de la vista-previa actual (para no re-mallar cada frame)
  previewStructKey:null,          // clave de sala cuyas texturas deben estar en el atlas para la vista-previa
  previewBusy:null,               // memo en construcción (evita solapar builds asíncronos de la vista-previa)
  previewRot:0,                   // giro (yaw) a mano para estampar estructuras (0..3 = 0/90/180/270° sobre el eje vertical; tecla R); persiste entre colocaciones
  previewTilt:0,                   // vuelco (tilt) a mano: 0..3 = 0/90/180/270° sobre el eje X (plano altura↔profundidad; Shift+R); se combina con previewRot en la orientación estampada
  stampCenter:false,              // modo de pegado en pared lateral: false = por CANTO (flush, def) · true = CENTRADO (hundido); tecla S alterna MIENTRAS se mantiene el clic derecho
  selA:null,                      // herramienta Seleccionar (tool='select'): 1ª esquina pendiente [x,y,z] tras el 1er clic, o null
  selBox:null,                    // selección confirmada {a:[x,y,z], b:[x,y,z]} (caja inclusiva de mundo) para resaltar y copiar (Ctrl+C)
  hotbarShown:1,                  // 0..1 · animación de ocultado de la hotbar en carrera (1 = en su sitio, 0 = hundida abajo y transparente)
  hbTarget:1,                     // objetivo de hotbarShown (0 ocultar / 1 mostrar)
  hbRunDist:0,                    // distancia recorrida (bloques) en marcha continua sin dibujar; al superar game.hotbarHide se oculta
  hbEl:null,                      // cache del nodo #mc-hotbar
  hotbarHide:14,                  // distancia (bloques) de carrera continua tras la que se oculta la hotbar (game.hotbarHide; 0 = desactiva)
  hist:[], histRedo:[],           // historial de edición del Mundo (z=deshacer / Z=rehacer): pila y su inversa
  histLock:false, histBusy:false, // histLock: no registrar mientras se aplica un undo/redo; histBusy: evita solapar dos a la vez
  interiorDark:0.08,              // factor de sombra en el fondo sin luz (interiores/pasillos, t7 skylight); 1 = desactivado (game.interiorDark)
  light:null,                     // Uint8Array 0..MC_MAXLIGHT por celda: luz del cielo difundida por el aire (mcComputeLight)
  blockLight:null,                // Uint8Array 0..MC_MAXLIGHT por celda: luz de BLOQUE emisiva (*#hex) difundida por el aire (mcComputeBlockLight); escalar/neutra (no tiñe)
  glowLevel:15,                   // nivel de siembra de la luz emisiva (game.glowLevel; 0 = sin luz de bloque; 15 = MC_MAXLIGHT = alcance máximo)
 glowFocus:0.2,                  // foco del haz emisivo 0..1 (game.glowFocus): 0=omnidireccional (antorcha), 1=haz estrecho hacia la normal neta de las caras emisivas
  hasGlow:false,                  // ¿alguna estructura viva tiene ≥1 voxel emisivo? cache para saltar BFS/mallado sin brillo
  quads:0,                        // caras dibujadas este frame (→ game.voxels)
  agents:new Map(),               // agentes/NPC vivos (id → handle); ver «AGENTES» al final (game.defineAgent)
};
function mcIdx(x,y,z){ return x + y*mc.dim.x + z*mc.dim.x*mc.dim.y; }
function mcInside(x,y,z){ return x>=0&&y>=0&&z>=0&&x<mc.dim.x&&y<mc.dim.y&&z<mc.dim.z; }
function mcSolid(x,y,z){ if(y<0) return true;   // suelo del mundo: sólido hacia abajo (no mesha la cara inferior, nunca se ve)
  return mcInside(x,y,z) ? mc.grid[mcIdx(x,y,z)]!==0 : false; }
function mcSetBlock(x,y,z,id){ if(mcInside(x,y,z)) mc.grid[mcIdx(x,y,z)]=id; }

// --- Helpers mat4 (column-major, como GL) e infra de shaders. Sin deps, ~40 líneas; los usan F3+. ---
const mat4={
  ident(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a,b){ const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; }
    return o; },
  perspective(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return new Float32Array([ f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0 ]); },
  translate(x,y,z){ const m=mat4.ident(); m[12]=x; m[13]=y; m[14]=z; return m; },
  rotX(a){ const c=Math.cos(a),s=Math.sin(a); const m=mat4.ident(); m[5]=c;m[6]=s;m[9]=-s;m[10]=c; return m; },
  rotY(a){ const c=Math.cos(a),s=Math.sin(a); const m=mat4.ident(); m[0]=c;m[2]=-s;m[8]=s;m[10]=c; return m; },
};
function glCompile(gl,type,src){ const sh=gl.createShader(type); gl.shaderSource(sh,src); gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) console.error('[mundo] shader:',gl.getShaderInfoLog(sh));
  return sh; }
function glProgram(gl,vs,fs){ const p=gl.createProgram();
  gl.attachShader(p,glCompile(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,glCompile(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) console.error('[mundo] program:',gl.getProgramInfoLog(p));
  return p; }

function mcInitGL(){
  const cv=$('#mc-canvas'); mc.canvas=cv;
  const gl=cv.getContext('webgl2')||cv.getContext('webgl');
  if(!gl){ toast('Tu navegador no soporta WebGL — el Mundo necesita GPU'); return null; }
  mc.gl=gl;
  gl.clearColor(MC_SKY[0],MC_SKY[1],MC_SKY[2],1);
  gl.enable(gl.DEPTH_TEST);
  cv.addEventListener('webglcontextlost',e=>{ e.preventDefault(); }, false);   // MVP: mínimo (F3 re-mesha al volver)
  return gl;
}
function mcResize(){
  const cv=mc.canvas, gl=mc.gl; if(!cv||!gl) return;
  const dpr=Math.min(window.devicePixelRatio||1,2)*mc.renderScale;   // game.renderScale reduce la resolución interna → menos píxeles (fill-rate)
  const w=Math.max(1,Math.round(cv.clientWidth*dpr)), h=Math.max(1,Math.round(cv.clientHeight*dpr));
  if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
  gl.viewport(0,0,cv.width,cv.height);   // el canvas queda con image-rendering:pixelated (CSS) → ampliar mantiene el pixel-art
}
// Medidor propio del Mundo (#mc-fps/#mc-vox), gemelo de updatePlayMeters. Reusa game.showFPS (_showFPS).
function updateWorldMeters(){
  const ef=$('#mc-fps'); if(ef){ ef.hidden=!(_showFPS && mc.active); ef.textContent=Math.round(mc.fps)+' fps'; }
  const ev=$('#mc-vox'); if(ev){ ev.hidden=!(_showFPS && mc.active); ev.textContent=(game.voxels||0)+' vox'; }
}
const MC_EYE=1.62;   // altura del ojo sobre los pies del jugador

// --- F2 · terreno plano + rejilla densa + paleta + atlas de textura GL ---
function mcFreeStruct(s){         // libera las VBO de una instancia (color opaco + translúcido + textura)
  const gl=mc.gl; if(!gl) return;
  if(s.colVbo) gl.deleteBuffer(s.colVbo);
  if(s.alphaVbo) gl.deleteBuffer(s.alphaVbo);
  if(s.texVbo) gl.deleteBuffer(s.texVbo);
  // Anula handles y counts: mcRestampAll libera las instancias y LUEGO hace await (atlas/geom) antes de reconstruir;
  // en ese hueco el bucle de render dibujaría esta instancia y bindearía un buffer ya borrado (INVALID_OPERATION:
  // bindBuffer: attempt to use a deleted object). Con handles null + count 0 el render la salta hasta que se reemplaza.
  s.colVbo=s.alphaVbo=s.texVbo=null; s.colCount=s.alphaCount=s.texCount=0;
}
function mcClearStructures(){    // suelta las VBO de las estructuras estampadas y vacía instancias + huella de colisión
  for(const s of mc.structures) mcFreeStruct(s);
  mc.structures=[];
  if(mc.gl && mc.structAtlasTex){ mc.gl.deleteTexture(mc.structAtlasTex); mc.structAtlasTex=null; }
  mc.structAtlas=null; mc.structUV={};
  mc.hist.length=0; mc.histRedo.length=0;   // (re)generar el mundo reinicia el historial de deshacer/rehacer
}
function mcGenFlat(){
  const dim={x:96, y:40, z:96};                 // horizontal x/z, vertical y
  mcClearStructures();
  mc.notes={};                                   // terreno nuevo → sin notas
  mc.dim=dim; mc.grid=new Uint16Array(dim.x*dim.y*dim.z);
  const idH=mc.name2id['hierba'], idT=mc.name2id['tierra'], idR=mc.name2id['roca'];
  const GH=14;                                   // altura de la capa de hierba (superficie)
  for(let z=0;z<dim.z;z++) for(let x=0;x<dim.x;x++) for(let y=0;y<=GH;y++){
    mc.grid[mcIdx(x,y,z)] = (y===GH) ? idH : (y>=GH-3 ? idT : idR);
  }
  mc.spawn={x:dim.x>>1, y:GH+1, z:dim.z>>1};      // de pie sobre la hierba (pies en y=GH+1)
  mc.pos=[mc.spawn.x+0.5, mc.spawn.y, mc.spawn.z+0.5]; mc.vel=[0,0,0]; mc.onGround=false;
}
// --- Estructuras (habitaciones) con sus VOXELES REALES a escala 1/16 de bloque de mundo ---
// Una sala grande (Taberna 112×112×52, etc.) se estampa como una malla FINA propia (mcStructGeom +
// mcBuildStructMesh, color por vértice) que conserva mesas/barriles/taburetes/huecos — NO se submuestrea
// a cubos. Aquí solo se calcula la HUELLA gruesa en bloques de mundo 16³ (badge «N bloques» + colisión).
// Huella gruesa de una sala en bloques de mundo 16³ (para el badge «N bloques» y la colisión). Eje del
// Mundo world=(ax,az,ay): cx←asset x, cy(alto)←asset z, cz←asset y. Solo celdas con ≥1 voxel. Cacheada.
async function mcStructCells(srcKey){
  if(mc.structs[srcKey] && mc.structs[srcKey].cells) return mc.structs[srcKey];
  const doc=await getRoomData(srcKey);
  const src=doc.voxels||{};
  const seen=new Set(); const cells=[]; let w=0,h=0,d=0, nvox=0;
  for(const k in src){
    const p=k.split(','), ax=+p[0], ay=+p[1], az=+p[2];
    if(!Number.isFinite(ax)||!Number.isFinite(ay)||!Number.isFinite(az)) continue;
    if(src[k]==null) continue;
    nvox++;
    const cx=Math.floor(ax/MC_TILE), cy=Math.floor(az/MC_TILE), cz=Math.floor(ay/MC_TILE);
    const ck=cx+','+cy+','+cz;
    if(!seen.has(ck)){ seen.add(ck); cells.push({cx,cy,cz}); }
    if(cx+1>w)w=cx+1; if(cy+1>h)h=cy+1; if(cz+1>d)d=cz+1;
  }
  // blockLike = bloque de terreno macizo (un 16³ COMPLETO, p.ej. hierba/roca = 4096 voxels). Un objeto/prop con
  // forma o huecos que cabe en <1 bloque (llama = 191 vox) NO es blockLike → se estampa como ESTRUCTURA FINA
  // (voxels reales, como el editor 3D) en vez de proyectarse en las 6 caras de un cubo (silueta con huecos → cielo).
  const blockLike = (w<=1 && h<=1 && d<=1 && nvox >= MC_TILE*MC_TILE*MC_TILE);
  const rec=Object.assign(mc.structs[srcKey]||{}, {cells, w,h,d, count:cells.length, nvox, blockLike});
  mc.structs[srcKey]=rec; return rec;
}
// Ancla la estructura por el CENTRO de su base (no por la esquina): convierte la celda apuntada por la mira
// en la esquina min de estampado restando media huella horizontal —según el giro (90°/270° intercambian
// ancho↔fondo)—. La Y (base) NO se desplaza: la sala se apoya en la celda apuntada. Facilita colocarla.
// Usa la huella cacheada (mcStructCells, calentada cada frame por el overlay); sin caché ⇒ 1×1 (esquina).
function mcStructOrigin(sk, tx,ty,tz, rot, n){
  const rec=mc.structs[sk];
  const [w,,d]=mcOriDims((rec&&rec.w)||1, (rec&&rec.h)||1, (rec&&rec.d)||1, rot|0);  // huella tras giro+vuelco
  // Por defecto (suelo/techo, normal vertical): se centra en horizontal sobre la celda apuntada.
  let ox=tx-((w/2)|0), oz=tz-((d/2)|0);
  // Pared LATERAL (normal horizontal): en el EJE DE LA NORMAL se pega por el CANTO —flush contra la cara, como una
  // pieza de puzzle— en vez de hundir media estructura dentro de la pared; el otro eje horizontal sigue centrado.
  // tx/tz es la celda vacía pegada a la cara: +eje → min del objeto ahí; -eje → max del objeto ahí. (1 celda = flush igual.)
  // mc.stampCenter (tecla S durante el clic derecho) desactiva esto → vuelve al centrado (hundido) en ambos ejes.
  if(n && !mc.stampCenter){
    if(n[0])      ox = n[0]>0 ? tx : (tx+1-w);
    else if(n[2]) oz = n[2]>0 ? tz : (tz+1-d);
  }
  return [ox, ty, oz];
}
// Hex "#rgb"/"#rrggbb"/"#rrggbbaa" (con '*' emisivo opcional) → [r,g,b] en 0..1 (ignora alpha/'*'; gris si inválido).
function mcHexRGB(h){
  if(typeof h==='string' && h[0]==='*') h=h.slice(1);
  h=(typeof h==='string' && h[0]==='#') ? h.slice(1) : '8a8f94';
  if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n=parseInt(h.slice(0,6),16); if(!Number.isFinite(n)) return [0.54,0.56,0.58];
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
}
// Geometría FINA de una sala (a escala 1/16 de bloque de mundo), en coords locales con la esquina min en 0.
// Mesha por caras con culling de vecinos (igual que mcMeshChunk pero a 1/16) en DOS flujos:
//  · col: voxeles `#hex` SIEMPRE, y los `tex:` cuando game.structTextures=false (media por cara) — color por vértice.
//  · tex: voxeles `tex:` cuando game.structTextures=true — texturados de verdad vía atlas de estructuras (UV
//    igual que el terreno) → detalle del editor a coste de nivel 1 (sin subdividir, sin tope).
// Cacheada en mc.structs[srcKey].meshRot[rot] = {colLocal, colCount, texLocal, texCount, ext:{x,y,z}, bits, fdim}.
// Rota (x,z) `rot` cuartos de vuelta (0..3) alrededor del eje vertical, dentro de una huella W×D (índices
// 0..W-1 / 0..D-1). El resultado sigue en rango; rot impar intercambia las extensiones (W↔D).
function mcRotXZ(x,z,rot,W,D){
  switch(rot&3){
    case 1: return [D-1-z, x];          // 90°
    case 2: return [W-1-x, D-1-z];      // 180°
    case 3: return [z, W-1-x];          // 270°
    default: return [x, z];             // 0°
  }
}
// Orientación estampada = entero combinado 0..15: bits 0-1 = giro (yaw, cuartos sobre el eje vertical Y, la sala
// gira para MIRAR al jugador, ticket #3); bits 2-3 = vuelco (tilt, cuartos sobre el eje X, plano altura↔profundidad,
// Shift+R). `rot&3`=yaw, `(rot>>2)&3`=tilt. Con tilt=0 es idéntico al comportamiento previo (compat con saves viejos).
// Huella efectiva (celdas w×h×d) de una estructura tras aplicar la orientación combinada. Reutilizada por el origen
// de estampado y por el fantasma de huella, para que ambos coincidan.
function mcOriDims(w, h, d, rot){
  const tilt=(rot>>2)&3, yaw=rot&3;
  if(tilt&1){ const t=d; d=h; h=t; }   // vuelco impar (90°/270° sobre X): profundidad↔altura
  if(yaw&1){ const t=w; w=d; d=t; }     // giro impar (90°/270° sobre Y): ancho↔fondo
  return [w, h, d];
}
// Orientación combinada elegida a mano para la vista-previa/estampado (R = yaw, Shift+R = vuelco).
function mcPreviewOri(){ return (mc.previewRot&3) | ((mc.previewTilt&3)<<2); }
// La geometría depende de rot ⇒ se cachea por (srcKey, rot) en mc.structs[srcKey].meshRot[rot].
async function mcStructGeom(srcKey, rot){
  rot=(rot|0)&15;                       // orientación combinada: yaw=rot&3 (eje Y), tilt=(rot>>2)&3 (eje X)
  const yaw=rot&3, tilt=(rot>>2)&3;
  const cached=mc.structs[srcKey] && mc.structs[srcKey].meshRot;
  if(cached && cached[rot]) return cached[rot];
  const doc=await getRoomData(srcKey);
  const src=doc.voxels||{};
  // Paso 1: coords finas base (swap del terreno, sin rotar) + extensiones base para poder rotar el plano horizontal.
  const base=[]; let minx=Infinity, miny=Infinity, minz=Infinity;
  for(const k in src){
    const p=k.split(','), ax=+p[0], ay=+p[1], az=+p[2];
    if(!Number.isFinite(ax)||!Number.isFinite(ay)||!Number.isFinite(az)) continue;
    const v=src[k]; if(v==null) continue;
    const x=ax, z=ay;                   // asset X→x de mundo, asset Y→profundidad z (asset Z→altura, más abajo)
    base.push([x, az, z, v]);           // [x, altura, z, valor]
    if(x<minx)minx=x; if(az<miny)miny=az; if(z<minz)minz=z;
  }
  // Normaliza al ORIGEN DE LA CELDA que contiene el mínimo, NO al mínimo del contenido: quita el desplazamiento de
  // celdas enteras (para que la huella empiece en la celda 0) pero CONSERVA la posición del contenido DENTRO de su
  // 16³. Así un objeto centrado en su rejilla 16×16 (p.ej. la `llama`, x4..14/z5..9) sigue centrado SOBRE la celda
  // destino en vez de pegarse a la esquina; para salas (autoradas desde 0) es un no-op. La caja de rotación se
  // redondea a múltiplos de 16 (celda entera) → un objeto centrado gira alrededor del centro de su celda, no se va.
  const cminx=Math.floor(minx/MC_TILE)*MC_TILE, cminy=Math.floor(miny/MC_TILE)*MC_TILE, cminz=Math.floor(minz/MC_TILE)*MC_TILE;
  let bx=0, by=0, bz=0;
  for(const b of base){ b[0]-=cminx; b[1]-=cminy; b[2]-=cminz; if(b[0]+1>bx)bx=b[0]+1; if(b[1]+1>by)by=b[1]+1; if(b[2]+1>bz)bz=b[2]+1; }
  bx=Math.ceil(bx/MC_TILE)*MC_TILE; by=Math.ceil(by/MC_TILE)*MC_TILE; bz=Math.ceil(bz/MC_TILE)*MC_TILE;
  const bzT=(tilt&1)?by:bz;   // tras un vuelco impar (Shift+R 90°/270°) la profundidad pasa a ser la altura original
  const solid=new Set(); const raw=[]; let mx=0,my=0,mz=0;
  const emitCells=new Set();   // celdas-de-bloque locales (floor(fine/16)) con ≥1 voxel emisivo (Parte B: siembra de luz de bloque)
  const emitDir=new Map();     // celda-bloque local → [dx,dy,dz]: suma de normales de sus caras emisivas EXPUESTAS = dirección del HAZ (Parte B foco)
  for(const b of base){
    const t=mcRotXZ(b[1], b[2], tilt, by, bz);     // Paso 2a: vuelco `tilt` cuartos sobre el eje X → rota el par (altura,profundidad)
    const r=mcRotXZ(b[0], t[1], yaw, bx, bzT);     // Paso 2b: giro `yaw` cuartos sobre el eje Y → rota el plano (fx,fz)
    const fx=r[0], fy=t[0], fz=r[1], v=b[3];       // todo queda en [0,ext)
    solid.add(fx+','+fy+','+fz); raw.push([fx,fy,fz,v]);
    if(isGlow(v)) emitCells.add(Math.floor(fx/MC_TILE)+','+Math.floor(fy/MC_TILE)+','+Math.floor(fz/MC_TILE));
    if(fx+1>mx)mx=fx+1; if(fy+1>my)my=fy+1; if(fz+1>mz)mz=fz+1;
  }
  // Dirección del haz por celda emisiva: suma de las normales de las caras emisivas EXPUESTAS (vecino fino NO sólido).
  // Con `solid` ya completo. Un culo que asoma a un lado → la suma apunta hacia fuera (haz). Un voxel emisivo por todas
  // sus caras (antorcha) → las normales se cancelan (≈0) → mcComputeBlockLight lo trata como omnidireccional a pleno.
  for(const r of raw){ if(!isGlow(r[3])) continue; const fx=r[0], fy=r[1], fz=r[2];
    const ck=Math.floor(fx/MC_TILE)+','+Math.floor(fy/MC_TILE)+','+Math.floor(fz/MC_TILE);
    let acc=emitDir.get(ck); if(!acc){ acc=[0,0,0]; emitDir.set(ck,acc); }
    for(let f=0;f<6;f++){ const d=MC_FACES[f].dir;
      if(!solid.has((fx+d[0])+','+(fy+d[1])+','+(fz+d[2]))){ acc[0]+=d[0]; acc[1]+=d[1]; acc[2]+=d[2]; } }
  }
  const useTex=mc.structTextures!==false;    // texturar de verdad (detalle del editor) vs. color plano por cara
  const greedy=mc.structGreedy!==false;      // fusionar caras coplanares de la misma textura/color (game.structGreedy)
  const S=1/MC_TILE, col=[], alpha=[], tex=[], avgCache={}, dim=[mx,my,mz];   // col=opaco, alpha=translúcido (pasada con blend aparte)
  // Celda-muestra por CARA (luz): 3 enteros (celda de BLOQUE, relativa al origen de la estructura) por cara, en
  // arrays paralelos a col/alpha/tex (mismo orden de push). mcBuildStructMesh los usa para hornear shade*=lightLut[lv]
  // según la luz del entorno (skylight + luz de bloque), igual que el terreno muestrea la celda de aire vecina.
  const colSC=[], alphaSC=[], texSC=[];
  const TRI=[0,1,2,0,2,3];
  const valAt=new Map(); for(const r of raw) valAt.set(r[0]+','+r[1]+','+r[2], r[3]);
  const has=(a,b,c)=>solid.has(a+','+b+','+c);
  // Material de una celda para la cara f: {t:1,key} texturado real, o {t:0,col} color plano por cara; `id` agrupa el greedy.
  function matAt(cx,cy,cz,f){
    const v=valAt.get(cx+','+cy+','+cz); if(v==null) return null;
    const isTexV=(typeof v==='string' && v.slice(0,4)==='tex:'), key=isTexV?v.slice(4):null;
    if(isTexV && useTex && mc.structUV && mc.structUV[key]) return {t:1, key, id:'T'+key};
    let c, emit=0, a=1;   // color plano: media de la cara (tex:, opaco) o el hex del voxel (#hex admite alpha '…aa' y emisivo '*')
    if(isTexV){ let avg=avgCache[key]; if(avg===undefined){ const fc=getTexFaces(key); avg=fc?fc.avg.map(mcHexRGB):null; avgCache[key]=avg; }
                c = avg ? avg[MC_FACES[f].tex] : mcHexRGB(texRepr(key)); }
    else { c = mcHexRGB(v); emit=isGlow(v)?1:0; a=colorAlpha(v); }
    return {t:0, col:c, emit, a,   // el id agrupa el greedy: no fusiona colores distintos ni mezcla emisivo/alpha
            id:'C'+Math.round(c[0]*255)+','+Math.round(c[1]*255)+','+Math.round(c[2]*255)+(emit?'*':'')+(a<1?('/'+Math.round(a*255)):'')};
  }
  // Emite una cara (posiblemente fusionada W×H): base = celda min del rectángulo; size = extensión por eje (1 en
  // el eje normal → plano de la cara). Texturado: aTile repite el tile por voxel (fract en el shader); color: plano.
  function emitQuad(f, base, size, m){
    const F=MC_FACES[f], q=F.corners, M=MC_FMETA[f], d=F.dir;
    // Celda-muestra por CARA (v1): la celda de BLOQUE del lado aire de la esquina mínima. base es la esquina fina
    // mínima; sumar d (±1 en la normal, 0 en el plano) cruza a la celda de aire vecina, luego floor a bloque.
    const sx=Math.floor((base[0]+d[0])/MC_TILE), sy=Math.floor((base[1]+d[1])/MC_TILE), sz=Math.floor((base[2]+d[2])/MC_TILE);
    if(m.t===1){
      const r=mc.structUV[m.key][F.tex], repU=size[M.tuAx], repV=size[M.tvAx];
      const tileC=[[0,0],[repU,0],[repU,repV],[0,repV]];   // corners q0..q3 ↔ (u0v0,u1v0,u1v1,u0v1) en espacio de repetición
      for(const k of TRI){ const c=q[k];
        tex.push((base[0]+(c[0]?size[0]:0))*S, (base[1]+(c[1]?size[1]:0))*S, (base[2]+(c[2]?size[2]:0))*S,
                 tileC[k][0], tileC[k][1], r.u0, r.v0, r.u1, r.v1, F.s); }
      texSC.push(sx,sy,sz);
    } else {
      const c3=m.col, isA=(m.a>=0.996), arr=(isA ? col : alpha);   // opaco al VBO normal; translúcido al VBO de la pasada con blend
      for(const k of TRI){ const c=q[k];
        arr.push((base[0]+(c[0]?size[0]:0))*S, (base[1]+(c[1]?size[1]:0))*S, (base[2]+(c[2]?size[2]:0))*S,
                 c3[0],c3[1],c3[2], F.s, m.emit, m.a); }
      (isA?colSC:alphaSC).push(sx,sy,sz);
    }
  }
  // Por cada cara: en cada capa se construye la máscara (celdas sólidas, expuestas, con su material) y se
  // fusionan rectángulos maximales del mismo material (greedy). Con greedy=false cada celda es su propia cara.
  // NO BLOQUEANTE: una sala compleja (Taberna ~120k caras) tarda segundos en mallar; se cede el hilo cada ~10ms
  // (macrotarea → el navegador pinta un frame y sigue) para que el mundo no se congele mientras aparecen las salas.
  let _yt=performance.now();
  for(let f=0;f<6;f++){
    const d=MC_FACES[f].dir, M=MC_FMETA[f], nAx=M.nAx, A=M.A, B=M.B;
    const dimA=dim[A], dimB=dim[B], dimN=dim[nAx];
    for(let ln=0; ln<dimN; ln++){
      if(performance.now()-_yt>10){ await new Promise(r=>setTimeout(r)); _yt=performance.now(); }   // cede el hilo (sin congelar el render/física)
      const mask=new Array(dimA*dimB).fill(null), pay=new Array(dimA*dimB);
      for(let b=0;b<dimB;b++) for(let a=0;a<dimA;a++){
        const cx=(nAx===0?ln:A===0?a:b), cy=(nAx===1?ln:A===1?a:b), cz=(nAx===2?ln:A===2?a:b);
        if(!has(cx,cy,cz) || has(cx+d[0],cy+d[1],cz+d[2])) continue;   // no sólida o cara interna
        const m=matAt(cx,cy,cz,f); if(!m) continue;
        const i=a+b*dimA; mask[i]=m.id; pay[i]=m;
      }
      const vis=new Uint8Array(dimA*dimB);
      for(let b=0;b<dimB;b++) for(let a=0;a<dimA;a++){
        const i=a+b*dimA; if(vis[i]||mask[i]==null) continue;
        let wa=1, hb=1;
        if(greedy){
          const id=mask[i];
          while(a+wa<dimA && !vis[i+wa] && mask[i+wa]===id) wa++;
          grow: while(b+hb<dimB){ for(let ia=0;ia<wa;ia++){ const j=(a+ia)+(b+hb)*dimA; if(vis[j]||mask[j]!==id) break grow; } hb++; }
          for(let jb=0;jb<hb;jb++) for(let ia=0;ia<wa;ia++) vis[(a+ia)+(b+jb)*dimA]=1;
        } else vis[i]=1;
        const bc=[0,0,0]; bc[nAx]=ln; bc[A]=a; bc[B]=b;
        const size=[1,1,1]; size[A]=wa; size[B]=hb;
        emitQuad(f, bc, size, pay[i]);
      }
    }
  }
  // Bitset denso de ocupación fina (índice [y][z][x]): la colisión/raycast sondean por acceso directo a
  // array (O(1) sin hashing ni strings) tras recortar contra el AABB de la estructura — coste ~cero si el
  // jugador no la toca, y barato aunque esté dentro (antes: Set global con una consulta hash por celda).
  const bits=new Uint8Array(mx*my*mz);
  for(const k of solid){ const p=k.split(','); bits[((+p[1])*mz + +p[2])*mx + +p[0]]=1; }
  // emitCells del Set → Int16Array plano [cx,cy,cz,…] (celdas-de-bloque locales con voxel emisivo) para sembrar luz de bloque.
  const emitArr=new Int16Array(emitCells.size*3), emitDirArr=new Int16Array(emitCells.size*3);
  { let i=0; for(const k of emitCells){ const p=k.split(','), dd=emitDir.get(k)||[0,0,0];
      emitArr[i]=+p[0]; emitDirArr[i]=dd[0]; i++; emitArr[i]=+p[1]; emitDirArr[i]=dd[1]; i++; emitArr[i]=+p[2]; emitDirArr[i]=dd[2]; i++; } }
  const mesh={ colLocal:new Float32Array(col), colCount:col.length/9,          // opaco: x,y,z, r,g,b, shade, emit, alpha (9)
               alphaLocal:new Float32Array(alpha), alphaCount:alpha.length/9,  // translúcido: mismo layout, pasada con blend
               texLocal:new Float32Array(tex), texCount:tex.length/10,
               colSC:new Int16Array(colSC), alphaSC:new Int16Array(alphaSC), texSC:new Int16Array(texSC),  // celda-muestra de luz por CARA (3 int/cara)
               emitCells:emitArr,                                              // celdas-de-bloque locales con ≥1 voxel emisivo (Parte B)
               emitDir:emitDirArr,                                             // dirección del haz por celda emisiva (normal neta de caras expuestas)
               ext:{x:mx*S, y:my*S, z:mz*S}, bits, fdim:[mx,my,mz] };
  const rec=(mc.structs[srcKey]=mc.structs[srcKey]||{}); (rec.meshRot=rec.meshRot||{})[rot]=mesh; return mesh;
}
// Malla de una INSTANCIA estampada: traslada cada flujo fino a la celda de mundo (ox,oy,oz) y sube DOS VBO.
async function mcBuildStructMesh(srcKey, ox,oy,oz, rot){
  rot=(rot|0)&15;                       // orientación combinada (yaw + vuelco); ver mcStructGeom
  const geom=await mcStructGeom(srcKey, rot);
  const gl=mc.gl;
  // Luz del entorno horneada por CARA (Parte A): igual que el terreno, cada cara se oscurece por la luz de la celda
  // de aire vecina (celda-muestra en geom.*SC, en unidades de bloque relativas al origen). lv = max(skylight, luz de
  // bloque). Sin luz activa (interiorDark>=1 y sin brillo) → factor 1: comportamiento de hoy (plena luz).
  const dark=mc.interiorDark, L=mc.light, BL=mc.blockLight;
  const doLight=(dark<1 || mc.hasGlow) && (L || BL);
  let lightLut=null;
  if(dark<1 && L){ lightLut=new Float32Array(MC_MAXLIGHT+1);
    for(let lv=0;lv<=MC_MAXLIGHT;lv++) lightLut[lv]=Math.pow(dark,(MC_MAXLIGHT-lv)/MC_MAXLIGHT); }
  // Factor de luz para la cara fi de un flujo, desde su celda-muestra (celda de bloque local → mundo).
  const faceFactor=(sc,fi)=>{
    if(!lightLut) return 1;                                    // interiorDark>=1: la luz de bloque no puede sobre-iluminar → sin efecto
    const wx=ox+sc[fi*3], wy=oy+sc[fi*3+1], wz=oz+sc[fi*3+2];  // celda de bloque de mundo del lado aire
    const lv = mcInside(wx,wy,wz) ? Math.max(L?L[mcIdx(wx,wy,wz)]:0, BL?BL[mcIdx(wx,wy,wz)]:0) : MC_MAXLIGHT;  // fuera de rejilla = cielo
    return lightLut[lv];
  };
  // Desplaza un array por vértice (stride s, pos en 0..2) a coords de mundo, hornea shade (offset shOff) por CARA
  // (6 vértices) con faceFactor, y lo sube como VBO STATIC_DRAW. Caras emisivas: el shader ignora vShade → no-op.
  const upload=(src,count,s,sc,shOff)=>{ if(!count) return null; const world=new Float32Array(src.length);
    for(let i=0;i<count;i++){ const b=i*s; world[b]=src[b]+ox; world[b+1]=src[b+1]+oy; world[b+2]=src[b+2]+oz;
      for(let j=3;j<s;j++) world[b+j]=src[b+j]; }
    if(doLight && sc){ const faces=count/6; for(let fi=0;fi<faces;fi++){ const f=faceFactor(sc,fi);
      if(f!==1){ for(let v=0;v<6;v++){ const o=(fi*6+v)*s+shOff; world[o]*=f; } } } }
    const vbo=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, world, gl.STATIC_DRAW); return vbo; };
  const colCount=geom.colCount,   colVbo  =upload(geom.colLocal,   colCount,   9, geom.colSC,   6);   // opaco: pos(3)+rgb(3)+shade(6)+emit+alpha
  const alphaCount=geom.alphaCount, alphaVbo=upload(geom.alphaLocal, alphaCount, 9, geom.alphaSC, 6);   // translúcido: mismo layout
  const texCount=geom.texCount,   texVbo  =upload(geom.texLocal,   texCount,  10, geom.texSC,   9);   // stride 10: pos(3)+aTile(2)+aRect(4)+aShade(9)
  const aabb=[ox,oy,oz, ox+geom.ext.x, oy+geom.ext.y, oz+geom.ext.z];
  return {key:srcKey, ox,oy,oz, rot, colVbo,colCount, alphaVbo,alphaCount, texVbo,texCount, aabb, emitCells:geom.emitCells, emitDir:geom.emitDir};
}
// Atlas de TEXTURAS de estructuras (gemelo de mcBuildPalette/mcUploadAtlas): compone las 6 caras de cada
// CLAVE `tex:` distinta usada por las estructuras vivas (6 cols × Nclaves filas, NEAREST, medio téxel de
// inset como el terreno) y sube la textura GL. mc.structUV[clave] = [6 rects UV]. Solo entran claves de
// textura (pocas: suelo/paredes/…), NO los `#hex` → el atlas queda pequeño.
async function mcBuildStructAtlas(){
  const keys=new Set();
  const srcs=mc.structures.map(s=>s.key);
  if(mc.previewStructKey) srcs.push(mc.previewStructKey);   // la sala en vista-previa aún no está estampada: sus texturas también van al atlas
  for(const key of srcs){
    let doc; try{ doc=await getRoomData(key); }catch(e){ continue; }
    const vox=doc.voxels||{};
    for(const k in vox){ const v=vox[k]; if(typeof v==='string' && v.slice(0,4)==='tex:') keys.add(v.slice(4)); }
  }
  const list=[...keys]; const uvMap={};
  const AW=6*MC_TILE, AH=Math.max(1,list.length)*MC_TILE;
  const cv=document.createElement('canvas'); cv.width=AW; cv.height=AH;
  const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
  const ins=0;                                                                // alineación exacta 1-a-1 con el sub-voxel grid
  for(let ki=0; ki<list.length; ki++){
    const key=list[ki]; let faces=null;
    try{ faces=buildTexFaces(await getTexDef(key)).faces; }catch(e){}
    const rects=[];
    for(let fi=0; fi<6; fi++){
      const dx=fi*MC_TILE, dy=ki*MC_TILE;
      if(faces && faces[fi]) ctx.drawImage(faces[fi],0,0,faces[fi].width,faces[fi].height, dx,dy,MC_TILE,MC_TILE);
      else { ctx.fillStyle='#b0468c'; ctx.fillRect(dx,dy,MC_TILE,MC_TILE); }   // fucsia = textura ausente
      rects.push({ u0:(dx+ins)/AW, v0:(dy+ins)/AH, u1:(dx+MC_TILE-ins)/AW, v1:(dy+MC_TILE-ins)/AH });
    }
    uvMap[key]=rects;
  }
  mc.structUV=uvMap; mc.structAtlas=cv; mcUploadStructAtlas();
}
function mcUploadStructAtlas(){
  const gl=mc.gl; if(!gl || !mc.structAtlas) return;
  if(mc.structAtlasTex) gl.deleteTexture(mc.structAtlasTex);                    // al recomponer: sin fugas
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, mc.structAtlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);           // look pixel-art (igual que el terreno)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  mc.structAtlasTex=tex;
}
async function mcBuildPalette(onProgress){
  mc.palette=[null]; mc.blockKey=[null]; mc.name2id={};
  const AW=6*MC_TILE, AH=Math.max(1,mc.blocks.length)*MC_TILE;
  const cv=document.createElement('canvas'); cv.width=AW; cv.height=AH;
  const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
  for(let bi=0; bi<mc.blocks.length; bi++){
    const b=mc.blocks[bi], id=bi+1; let faces=null;
    const _tB=performance.now(), _cached=texDefs.has(b.key);   // ¿ya estaba en caché o toca descargarla?
    try{ faces=buildTexFaces(await getTexDef(b.key)).faces; }catch(e){}
    if(onProgress) onProgress(bi+1, mc.blocks.length, b.name, b.key, performance.now()-_tB, _cached);
    mc.name2id[b.name]=id; mc.blockKey[id]=b.key;
    const rects=[];
    for(let fi=0; fi<6; fi++){
      const dx=fi*MC_TILE, dy=bi*MC_TILE;
      if(faces && faces[fi]) ctx.drawImage(faces[fi],0,0,faces[fi].width,faces[fi].height, dx,dy,MC_TILE,MC_TILE);
      else { ctx.fillStyle='#b0468c'; ctx.fillRect(dx,dy,MC_TILE,MC_TILE); }   // fucsia = textura ausente
      const ins=0;                                                              // alineación exacta 1-a-1 con el sub-voxel grid
      rects.push({ u0:(dx+ins)/AW, v0:(dy+ins)/AH, u1:(dx+MC_TILE-ins)/AW, v1:(dy+MC_TILE-ins)/AH });
    }
    mc.palette[id]=rects;
  }
  mc.atlas=cv;
  // ¿algún texel translúcido (alpha<0.5)? Si NO, el terreno usa el shader sin `discard` (early-z activo → menos
  // overdraw). Si SÍ (o el canvas está contaminado y no se puede leer), alpha-test para no rellenar los huecos.
  mc.atlasHasAlpha=false;
  const _tA=performance.now();
  try{ const d=ctx.getImageData(0,0,AW,AH).data;
       for(let i=3;i<d.length;i+=4){ if(d[i]<128){ mc.atlasHasAlpha=true; break; } } }
  catch(e){ mc.atlasHasAlpha=true; }
  mcLoadNote('Escaneo de alpha del atlas ('+AW+'x'+AH+'): '+(performance.now()-_tA).toFixed(1)
    +' ms → atlasHasAlpha='+mc.atlasHasAlpha+(mc.atlasHasAlpha?' (shader con discard)':' (shader opaco, early-z)'));
}
function mcUploadAtlas(){
  const gl=mc.gl;
  if(mc.atlasTex) gl.deleteTexture(mc.atlasTex);                                // al reejecutar (mcAddBlock): sin fugas
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, mc.atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);          // look pixel-art (sin mipmaps: se pierde el encanto)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  mc.atlasTex=tex;
}
// Añade un bloque de la galería a la paleta (si no está ya) y devuelve su id. Solo APENDA => ids estables,
// no hace falta remeshar (el id nuevo aún no está en la rejilla). Reconstruye atlas+textura GL.
async function mcAddBlock(key, name){
  const ex=mc.blockKey.indexOf(key); if(ex>0) return ex;                        // ya en la paleta
  mc.blocks.push({name:name||key, key});
  await mcBuildPalette(); mcUploadAtlas();
  if(mc.grid) mcMeshAll();   // el atlas creció de alto → las UV (v) de TODOS los bloques cambian: remeshar chunks
  return mc.blocks.length;                                                      // id = índice+1 (el recién apendado)
}

// --- F3 · meshing por chunks + shaders + cámara + frustum cull ---
const MC_VS=`
attribute vec3 aPos; attribute vec2 aUV; attribute float aShade;
uniform mat4 uProj; uniform mat4 uView;
varying vec2 vUV; varying float vShade; varying float vDist;
void main(){ vec4 vp=uView*vec4(aPos,1.0); gl_Position=uProj*vp; vUV=aUV; vShade=aShade; vDist=length(vp.xyz); }`;
const MC_FS=`
precision mediump float;
varying vec2 vUV; varying float vShade; varying float vDist;
uniform sampler2D uTex; uniform vec3 uSky; uniform float uFogNear; uniform float uFogFar;
void main(){ vec4 t=texture2D(uTex,vUV); if(t.a<0.5) discard;
  vec3 col=t.rgb*vShade; float f=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
  gl_FragColor=vec4(mix(col,uSky,f),1.0); }`;
// Gemelo SIN `discard`: cuando el atlas del terreno es 100% opaco (mc.atlasHasAlpha=false), este shader deja al
// hardware rechazar por early-z los fragmentos ocultos antes de correr → menos overdraw (la otra mitad del fill-rate).
const MC_FS_OPAQUE=`
precision mediump float;
varying vec2 vUV; varying float vShade; varying float vDist;
uniform sampler2D uTex; uniform vec3 uSky; uniform float uFogNear; uniform float uFogFar;
void main(){ vec3 col=texture2D(uTex,vUV).rgb*vShade; float f=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
  gl_FragColor=vec4(mix(col,uSky,f),1.0); }`;
// Fija EXACTAMENTE los arrays de atributos activos: deshabilita 0..N y habilita solo los de `list`. Necesario
// porque en WebGL un atributo habilitado SIN buffer (p.ej. tras liberar su VBO al re-mallar, o un pase que
// habilita y no dibuja porque todo quedó culleado) hace fallar TODOS los drawArrays con INVALID_OPERATION.
const MC_ATTR_N=5;
function mcAttribs(list){ const gl=mc.gl; for(let i=0;i<MC_ATTR_N;i++) gl.disableVertexAttribArray(i); for(const l of list) if(l>=0) gl.enableVertexAttribArray(l); }
// Punteros de vértice del layout de estructuras (color por vértice): pos(3)+rgb(3)+shade+emit+alpha, stride en bytes.
function mcStructAttrib(SL, stride){ const gl=mc.gl;
  gl.vertexAttribPointer(SL.aPos,3,gl.FLOAT,false,stride,0);
  gl.vertexAttribPointer(SL.aColor,3,gl.FLOAT,false,stride,12);
  gl.vertexAttribPointer(SL.aShade,1,gl.FLOAT,false,stride,24);
  gl.vertexAttribPointer(SL.aEmit,1,gl.FLOAT,false,stride,28);
  gl.vertexAttribPointer(SL.aAlpha,1,gl.FLOAT,false,stride,32);
}
function mcLocOf(p){ const gl=mc.gl; return {
  aPos:gl.getAttribLocation(p,'aPos'), aUV:gl.getAttribLocation(p,'aUV'), aShade:gl.getAttribLocation(p,'aShade'),
  uProj:gl.getUniformLocation(p,'uProj'), uView:gl.getUniformLocation(p,'uView'),
  uTex:gl.getUniformLocation(p,'uTex'), uSky:gl.getUniformLocation(p,'uSky'),
  uFogNear:gl.getUniformLocation(p,'uFogNear'), uFogFar:gl.getUniformLocation(p,'uFogFar') }; }
function mcBuildProgram(){
  const gl=mc.gl;
  mc.prog=glProgram(gl,MC_VS,MC_FS); mc.loc=mcLocOf(mc.prog);                   // alpha-test (con discard)
  mc.progOpaque=glProgram(gl,MC_VS,MC_FS_OPAQUE); mc.locOpaque=mcLocOf(mc.progOpaque); // opaco (early-z)
}
// Programa de estructuras: gemelo del terreno pero con COLOR POR VÉRTICE (no atlas) → cada voxel fino su color.
const MC_STRUCT_VS=`
attribute vec3 aPos; attribute vec3 aColor; attribute float aShade; attribute float aEmit; attribute float aAlpha;
uniform mat4 uProj; uniform mat4 uView;
varying vec3 vColor; varying float vShade; varying float vDist; varying float vEmit; varying float vAlpha;
void main(){ vec4 vp=uView*vec4(aPos,1.0); gl_Position=uProj*vp; vColor=aColor; vShade=aShade; vDist=length(vp.xyz); vEmit=aEmit; vAlpha=aAlpha; }`;
const MC_STRUCT_FS=`
precision mediump float;
varying vec3 vColor; varying float vShade; varying float vDist; varying float vEmit; varying float vAlpha;
uniform vec3 uSky; uniform float uFogNear; uniform float uFogFar;
void main(){ vec3 lit=mix(vColor*vShade, vColor, vEmit);                         // emisivo (vEmit=1) = a pleno brillo, sin sombra
  float f=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0)*(1.0-vEmit);        // ni niebla: el emisivo brilla a través
  gl_FragColor=vec4(mix(lit,uSky,f), vAlpha); }`;
function mcBuildStructProgram(){
  const gl=mc.gl, p=glProgram(gl,MC_STRUCT_VS,MC_STRUCT_FS); mc.structProg=p;
  mc.structLoc={ aPos:gl.getAttribLocation(p,'aPos'), aColor:gl.getAttribLocation(p,'aColor'), aShade:gl.getAttribLocation(p,'aShade'),
    aEmit:gl.getAttribLocation(p,'aEmit'), aAlpha:gl.getAttribLocation(p,'aAlpha'),
    uProj:gl.getUniformLocation(p,'uProj'), uView:gl.getUniformLocation(p,'uView'),
    uSky:gl.getUniformLocation(p,'uSky'), uFogNear:gl.getUniformLocation(p,'uFogNear'), uFogFar:gl.getUniformLocation(p,'uFogFar') };
}
// Programa de estructuras TEXTURADAS con repetición por voxel: aTile = coord de tile (0..W / 0..H sobre la cara
// fusionada), aRect = rect UV del tile en el atlas (u0,v0,u1,v1). El FS repite el tile con fract(aTile) → una cara
// greedy de N voxeles muestra N copias del tile (detalle idéntico a voxel-a-voxel) sin subdividir geometría. highp
// para que aTile no pierda precisión en paredes grandes (fract de valores altos) ni en GPUs móviles.
const MC_STEX_VS=`
attribute vec3 aPos; attribute vec2 aTile; attribute vec4 aRect; attribute float aShade;
uniform mat4 uProj; uniform mat4 uView;
varying highp vec2 vTile; varying vec4 vRect; varying float vShade; varying float vDist;
void main(){ vec4 vp=uView*vec4(aPos,1.0); gl_Position=uProj*vp; vTile=aTile; vRect=aRect; vShade=aShade; vDist=length(vp.xyz); }`;
const MC_STEX_FS=`
precision highp float;
varying highp vec2 vTile; varying vec4 vRect; varying float vShade; varying float vDist;
uniform sampler2D uTex; uniform vec3 uSky; uniform float uFogNear; uniform float uFogFar;
void main(){ vec2 uv=vRect.xy+(vRect.zw-vRect.xy)*fract(vTile); vec4 t=texture2D(uTex,uv); if(t.a<0.5) discard;
  vec3 col=t.rgb*vShade; float f=clamp((vDist-uFogNear)/(uFogFar-uFogNear),0.0,1.0);
  gl_FragColor=vec4(mix(col,uSky,f),1.0); }`;
function mcBuildStructTexProgram(){
  const gl=mc.gl, p=glProgram(gl,MC_STEX_VS,MC_STEX_FS); mc.stexProg=p;
  mc.stexLoc={ aPos:gl.getAttribLocation(p,'aPos'), aTile:gl.getAttribLocation(p,'aTile'), aRect:gl.getAttribLocation(p,'aRect'), aShade:gl.getAttribLocation(p,'aShade'),
    uProj:gl.getUniformLocation(p,'uProj'), uView:gl.getUniformLocation(p,'uView'), uTex:gl.getUniformLocation(p,'uTex'),
    uSky:gl.getUniformLocation(p,'uSky'), uFogNear:gl.getUniformLocation(p,'uFogNear'), uFogFar:gl.getUniformLocation(p,'uFogFar') };
}
// Mesha un chunk: por cada cara con vecino aire emite un quad (culling de caras internas) → VBO. O(chunk).
function mcMeshChunk(cx,cz){
  const gl=mc.gl, dim=mc.dim;
  const x0=cx*MC_CHUNK, z0=cz*MC_CHUNK, x1=Math.min(x0+MC_CHUNK,dim.x), z1=Math.min(z0+MC_CHUNK,dim.z);
  const verts=[];   // interleaved: x,y,z, u,v, shade
  // t7 · penumbra de interiores por SKYLIGHT: la sombra de cada cara se atenúa según la LUZ del hueco de aire al
  // que da (mc.light, calculada en mcComputeLight difundiendo la luz del cielo por el aire). lightLut mapea nivel
  // 0..MC_MAXLIGHT → factor `interiorDark^((MAX-lv)/MAX)`: luz plena (lv=MAX) = 1; cada nivel de MENOS luz multiplica
  // más por interiorDark (curva exponencial en el déficit de luz). Por eso interiorDark=0 puede llegar a NEGRO en el
  // interior de una sala (no solo en el fondo con luz 0), mientras el default 0.55 queda casi como el mapeo lineal.
  // Al depender de la luz REAL, no hay bandas por el grosor de tierra encima y una figura flotante apenas ensombrece
  // el suelo (la luz entra de lado). interiorDark = 1 ⇒ desactivado.
  const dark=mc.interiorDark, L=mc.light, BL=mc.blockLight;
  let lightLut=null;
  if(dark<1 && L){
    lightLut=new Float32Array(MC_MAXLIGHT+1);
    for(let lv=0;lv<=MC_MAXLIGHT;lv++) lightLut[lv]=Math.pow(dark,(MC_MAXLIGHT-lv)/MC_MAXLIGHT);
  }
  for(let z=z0;z<z1;z++) for(let x=x0;x<x1;x++) for(let y=0;y<dim.y;y++){
    const id=mc.grid[mcIdx(x,y,z)]; if(!id) continue;
    const rects=mc.palette[id]; if(!rects) continue;
    for(let f=0;f<6;f++){
      const F=MC_FACES[f], d=F.dir;
      const ax=x+d[0], ay=y+d[1], az=z+d[2];
      if(mcSolid(ax,ay,az)) continue;   // vecino sólido => cara interna, se pela
      const r=rects[F.tex], C=F.corners;
      let s=F.s;
      if(lightLut){ let lv=MC_MAXLIGHT; if(mcInside(ax,ay,az)){ const li=mcIdx(ax,ay,az); lv=Math.max(L[li], BL?BL[li]:0); } s*=lightLut[lv]; }   // fuera de la rejilla = cielo abierto; max(skylight, luz de bloque)
      const uv=[[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]];
      for(const k of [0,1,2,0,2,3]){ const c=C[k]; verts.push(x+c[0], y+c[1], z+c[2], uv[k][0], uv[k][1], s); }
    }
  }
  const key=cx+','+cz; let ch=mc.chunks.get(key);
  if(!ch){ ch={vbo:gl.createBuffer(), count:0}; mc.chunks.set(key,ch); }
  gl.bindBuffer(gl.ARRAY_BUFFER, ch.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  ch.count=verts.length/6; ch.aabb=[x0,0,z0, x1,dim.y,z1];
}
// t7 · SKYLIGHT: propaga la luz del cielo por el aire → mc.light[idx] en 0..MC_MAXLIGHT. Reciben luz plena (cielo)
// el aire abierto por ARRIBA (cada columna, de arriba abajo hasta topar con sólido) y el de las 4 CARAS LATERALES
// del mundo (el vacío del borde también es cielo → una ventana al borde ilumina). Luego la luz se difunde a los 6
// vecinos de aire perdiendo 1 nivel por paso (buckets por nivel: cada celda se fija una vez, del más alto al más
// bajo). Así junto a una boca hay luz plena y al fondo de un túnel penumbra, sin depender del grosor de tierra encima.
function mcComputeLight(){
  const dim=mc.dim, g=mc.grid, NX=dim.x, NY=dim.y, NZ=dim.z, sxy=NX*NY, N=NX*NY*NZ;
  const L=(mc.light&&mc.light.length===N)?mc.light:(mc.light=new Uint8Array(N));
  if(mc.interiorDark>=1) return;   // desactivado: mcMeshChunk no muestrea la luz, no hace falta calcularla
  L.fill(0);
  const buckets=[]; for(let i=0;i<=MC_MAXLIGHT;i++) buckets.push([]);
  const top=buckets[MC_MAXLIGHT];
  const seed=i=>{ if(g[i]===0 && L[i]!==MC_MAXLIGHT){ L[i]=MC_MAXLIGHT; top.push(i); } };
  for(let z=0;z<NZ;z++) for(let x=0;x<NX;x++)   // siembra: cada columna, de arriba abajo, mientras sea aire = cielo
    for(let y=NY-1;y>=0;y--){ const i=x+y*NX+z*sxy; if(g[i]!==0) break; seed(i); }
  // El "vacío" fuera del mundo también es cielo (se dibuja azul): deja entrar luz por las 4 CARAS LATERALES, para
  // que una ventana/hueco abierto al borde ilumine el interior (antes la luz solo entraba por arriba).
  for(let y=0;y<NY;y++){
    for(let z=0;z<NZ;z++){ seed(y*NX + z*sxy); seed((NX-1) + y*NX + z*sxy); }        // caras x=0 y x=NX-1
    for(let x=0;x<NX;x++){ seed(x + y*NX);      seed(x + y*NX + (NZ-1)*sxy); }        // caras z=0 y z=NZ-1
  }
  for(let lvl=MC_MAXLIGHT; lvl>=1; lvl--){
    const b=buckets[lvl], nl=lvl-1;
    for(let bi=0;bi<b.length;bi++){
      const i=b[bi]; if(L[i]!==lvl) continue;   // fijada a un nivel mayor por otra ruta → obsoleta
      const x=i%NX, y=((i/NX)|0)%NY, z=(i/sxy)|0;
      if(x>0){    const j=i-1;   if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
      if(x<NX-1){ const j=i+1;   if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
      if(y>0){    const j=i-NX;  if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
      if(y<NY-1){ const j=i+NX;  if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
      if(z>0){    const j=i-sxy; if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
      if(z<NZ-1){ const j=i+sxy; if(g[j]===0&&L[j]<nl){ L[j]=nl; buckets[nl].push(j); } }
    }
  }
}
// Luz de BLOQUE emisiva (Parte B), gemela de mcComputeLight: los voxeles *#hex (isGlow) siembran luz que se difunde
// por el AIRE (−1/paso, buckets), a RESOLUCIÓN DE BLOQUE (16³) desde las celdas que contienen ≥1 voxel emisivo. Escalar/
// neutra (no tiñe). Sin brillo (mc.hasGlow=false) o glowLevel<=0 → BL.fill(0) y return: coste 0 cuando no hay emisivos.
function mcComputeBlockLight(){
  const dim=mc.dim, g=mc.grid, NX=dim.x, NY=dim.y, NZ=dim.z, sxy=NX*NY, N=NX*NY*NZ;
  const BL=(mc.blockLight&&mc.blockLight.length===N)?mc.blockLight:(mc.blockLight=new Uint8Array(N));
  BL.fill(0);
  const lv0=Math.min(MC_MAXLIGHT, mc.glowLevel|0);
  if(!mc.hasGlow || lv0<=0) return;   // sin emisivos: BL en 0, mcMeshChunk lo trata como sin luz de bloque
  const focus=Math.max(0, Math.min(1, mc.glowFocus));   // 0=omnidireccional (antorcha), 1=haz estrecho
  const NARROW=Math.round(focus*5);   // penalización de paso PERPENDICULAR al haz: 0=isótropo (diamante ancho), 5=haz fino
  // Dirección del haz POR CELDA (Int8 ×3, componentes de la normal neta ×100): se propaga célula a célula para que el
  // BFS sea ANISÓTROPO — un paso a lo largo del haz cuesta 1 nivel; uno de lado cuesta 1+NARROW → la luz llega lejos
  // delante y se apaga pronto de costado (cono estrecho, no diamante). Sin haz (BD=0) el paso cuesta 1 (isótropo).
  const BD=(mc.blockLightDir&&mc.blockLightDir.length===N*3)?mc.blockLightDir:(mc.blockLightDir=new Int8Array(N*3));
  BD.fill(0);
  const buckets=[]; for(let i=0;i<=MC_MAXLIGHT;i++) buckets.push([]);
  const seedFull=i=>{ if(g[i]===0 && BL[i]<lv0){ BL[i]=lv0; buckets[lv0].push(i); } };   // siembra plena (omnidireccional): escapa solo por aire
  // Siembra: por cada estructura viva, cada emitCell (celda de bloque local → mundo). La celda emisiva SÓLIDA se marca
  // a lv0 como MUESTRA para caras a ras (sin propagar). Con foco y haz definido (normal neta de caras emisivas expuestas
  // ≠ 0) se siembran solo los vecinos de aire del HEMISFERIO delantero, con su dirección de haz → cono. Si el haz es ≈0
  // (antorcha: emite igual por todas las caras) o focus=0 → omnidireccional a pleno (comportamiento clásico).
  for(const s of mc.structures){ const ec=s.emitCells; if(!ec||!ec.length) continue; const ed=s.emitDir;
    for(let k=0;k<ec.length;k+=3){ const cx=s.ox+ec[k], cy=s.oy+ec[k+1], cz=s.oz+ec[k+2];
      if(!mcInside(cx,cy,cz)) continue; const i=cx+cy*NX+cz*sxy;
      let nx=0,ny=0,nz=0,nl=0; if(ed){ nx=ed[k]; ny=ed[k+1]; nz=ed[k+2]; nl=Math.sqrt(nx*nx+ny*ny+nz*nz); }
      const directional = focus>0 && nl>0.5;
      if(g[i]!==0 && BL[i]<lv0) BL[i]=lv0;   // muestra sólida a ras (celda emisiva sólida), sin propagar
      if(!directional){
        seedFull(i);
        if(cx>0)    seedFull(i-1);   if(cx<NX-1) seedFull(i+1);
        if(cy>0)    seedFull(i-NX);  if(cy<NY-1) seedFull(i+NX);
        if(cz>0)    seedFull(i-sxy); if(cz<NZ-1) seedFull(i+sxy);
      } else {
        const inv=1/nl; nx*=inv; ny*=inv; nz*=inv;
        const qx=Math.round(nx*100), qy=Math.round(ny*100), qz=Math.round(nz*100);   // haz cuantizado a Int8 (−100..100)
        // Fuente fijada a lv0 SIN empujar al BFS: muestra a ras Y bloquea que el vecino delantero relaye luz por detrás.
        if(BL[i]<lv0) BL[i]=lv0;
        // Siembra solo el hemisferio delantero (d·n>0) a lv0, con la dirección del haz → el BFS anisótropo lo estrecha.
        const nb=(j,dx,dy,dz)=>{ if(g[j]!==0) return; if(dx*nx+dy*ny+dz*nz<=0.01) return;
          if(BL[j]<lv0){ BL[j]=lv0; BD[j*3]=qx; BD[j*3+1]=qy; BD[j*3+2]=qz; buckets[lv0].push(j); } };
        if(cx>0)    nb(i-1,-1,0,0);   if(cx<NX-1) nb(i+1,1,0,0);
        if(cy>0)    nb(i-NX,0,-1,0);  if(cy<NY-1) nb(i+NX,0,1,0);
        if(cz>0)    nb(i-sxy,0,0,-1); if(cz<NZ-1) nb(i+sxy,0,0,1);
      }
    }
  }
  // BFS por buckets con COSTE VARIABLE (≥1) según alineación del paso con el haz de la celda origen; lleva el haz al vecino.
  // Coste entero ≥1 ⇒ el nivel destino siempre baja ⇒ cae en un bucket inferior (procesado después): relajación válida.
  const relax=(i,j,dx,dy,dz)=>{
    if(g[j]!==0) return; const bx=BD[i*3], by=BD[i*3+1], bz=BD[i*3+2];
    let cost=1;
    if(bx||by||bz){ const dot=(dx*bx+dy*by+dz*bz)/100; cost=1+Math.round(NARROW*(1-Math.max(0,Math.min(1,dot)))); }
    const nl=BL[i]-cost; if(nl<1 || BL[j]>=nl) return;
    BL[j]=nl; if(bx||by||bz){ BD[j*3]=bx; BD[j*3+1]=by; BD[j*3+2]=bz; } buckets[nl].push(j);
  };
  for(let lvl=lv0; lvl>=1; lvl--){
    const b=buckets[lvl];
    for(let bi=0;bi<b.length;bi++){
      const i=b[bi]; if(BL[i]!==lvl) continue;
      const x=i%NX, y=((i/NX)|0)%NY, z=(i/sxy)|0;
      if(x>0)    relax(i,i-1,-1,0,0);   if(x<NX-1) relax(i,i+1,1,0,0);
      if(y>0)    relax(i,i-NX,0,-1,0);  if(y<NY-1) relax(i,i+NX,0,1,0);
      if(z>0)    relax(i,i-sxy,0,0,-1); if(z<NZ-1) relax(i,i+sxy,0,0,1);
    }
  }
}
// Recalcula mc.hasGlow: ¿alguna estructura viva tiene ≥1 celda emisiva? (cache para saltar BFS/mallado de luz de bloque).
function mcRecomputeHasGlow(){ mc.hasGlow=false; for(const s of mc.structures){ if(s.emitCells&&s.emitCells.length){ mc.hasGlow=true; break; } } }
function mcMeshAll(){
  mcComputeLight();
  mcComputeBlockLight();
  const ncx=Math.ceil(mc.dim.x/MC_CHUNK), ncz=Math.ceil(mc.dim.z/MC_CHUNK);
  for(let cz=0;cz<ncz;cz++) for(let cx=0;cx<ncx;cx++) mcMeshChunk(cx,cz);
  // Los cuerpos de los agentes usan el mismo atlas: si creció (game.addMaterial) sus UV quedarían obsoletas.
  for(const a of mc.agents.values()) if(a.vbo){ a.blockId=mcResolveMat(a.block); mcAgentMesh(a); }
}
// t8 · redimensiona el mundo EN VIVO (game.resizeWorld). Reasigna la rejilla densa conservando los bloques
// anclados en el origen (0,0,0), libera las VBO de todos los chunks, recoloca spawn/jugador dentro de los nuevos
// límites y re-malla entero. Las estructuras estampadas mantienen sus coords de mundo. Clamps: x/z 16..512, y 8..256.
function mcResizeWorld(nx,ny,nz){
  if(mc.agents.size) mcStopAgents('resizeWorld');   // la rejilla se reasigna: los agentes quedarían con coords inválidas
  const old=mc.dim, og=mc.grid;
  nx=Math.max(16,Math.min(512,Math.round(+nx)||old.x));
  ny=Math.max(8, Math.min(256,Math.round(+ny)||old.y));
  nz=Math.max(16,Math.min(512,Math.round(+nz)||old.z));
  if(nx===old.x && ny===old.y && nz===old.z) return mc.dim;   // sin cambios reales
  const ng=new Uint16Array(nx*ny*nz);
  // Redimensionado CENTRADO en el plano XZ: el mundo crece/recorta la mitad por cada lado (no ancla en el origen),
  // así el contenido queda centrado y no "se comen" dos esquinas al reducir. La vertical (Y) sigue anclada al suelo.
  const dx=Math.floor((nx-old.x)/2), dz=Math.floor((nz-old.z)/2);
  const cy=Math.min(old.y,ny);
  for(let z=0;z<old.z;z++){ const nzp=z+dz; if(nzp<0||nzp>=nz) continue;
    for(let y=0;y<cy;y++) for(let x=0;x<old.x;x++){ const nxp=x+dx; if(nxp<0||nxp>=nx) continue;
      const id=og[x + y*old.x + z*old.x*old.y]; if(id) ng[nxp + y*nx + nzp*nx*ny]=id;
    }
  }
  const gl=mc.gl; if(gl) for(const [,ch] of mc.chunks) if(ch.vbo) gl.deleteBuffer(ch.vbo);   // sin fugas de VBO
  mc.chunks.clear();
  mc.dim={x:nx,y:ny,z:nz}; mc.grid=ng;
  for(const s of mc.structures){ s.ox+=dx; s.oz+=dz; }   // las estructuras se desplazan con el terreno para no descuadrarse
  const nn={}; for(const k in mc.notes){ const p=k.split(','), x=+p[0]+dx, y=+p[1], z=+p[2]+dz;   // las notas siguen a su bloque (mismo desplazamiento centrado)
    if(x>=0&&x<nx&&y>=0&&y<ny&&z>=0&&z<nz) nn[x+','+y+','+z]=mc.notes[k]; }
  mc.notes=nn;
  const clamp=(v,hi)=>Math.max(0,Math.min(v,hi));
  mc.spawn={x:clamp((mc.spawn.x|0)+dx,nx-1), y:Math.min(mc.spawn.y|0,ny-1), z:clamp((mc.spawn.z|0)+dz,nz-1)};   // spawn con el mundo
  if(mc.pos){ mc.pos[0]=Math.max(0.5,Math.min(mc.pos[0]+dx,nx-0.5)); mc.pos[2]=Math.max(0.5,Math.min(mc.pos[2]+dz,nz-0.5));
              if(mc.pos[1]>ny-0.1) mc.pos[1]=ny-0.1; }
  mcMeshAll();
  if(mc.structures.length) mcRestampAll().then(()=>{ if(mc.active) mcUnstick(); });   // re-malla las estructuras en sus nuevas coords
  else if(mc.active) mcUnstick();
  mcScheduleSave();
  return mc.dim;
}
// Re-mesha el chunk que contiene (x,z) y, si la celda toca borde, el vecino (para que las caras del borde cuadren).
function mcRemeshAround(x,z){
  mcComputeLight();        // un bloque puesto/roto reabre o tapa el paso de luz → recalcular el skylight del mundo
  mcComputeBlockLight();   // …e igual para la luz de bloque emisiva (el hueco reabierto puede dejarla pasar/taparla)
  // La luz se difunde hasta MC_MAXLIGHT bloques (~1 chunk); re-mallar el vecindario 3×3 evita costuras de sombra en los bordes.
  const cx=Math.floor(x/MC_CHUNK), cz=Math.floor(z/MC_CHUNK);
  const ncx=Math.ceil(mc.dim.x/MC_CHUNK), ncz=Math.ceil(mc.dim.z/MC_CHUNK);
  for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){
    const nx=cx+dx, nz=cz+dz;
    if(nx>=0&&nz>=0&&nx<ncx&&nz<ncz) mcMeshChunk(nx,nz);
  }
  // Las estructuras hornean su shade al construir la instancia (posición-independiente): una edición del terreno que
  // reabre/tapa el paso de luz re-oscurece/aclara el terreno vecino pero NO la estructura por sí sola. Re-hornean
  // las cercanas re-muestreando la luz fresca (skylight + luz de bloque) → abrir el techo aclara también la figura.
  if(mc.structures.length) mcRebakeStructsNear(x,z);
}
// Re-hornea el shade de las estructuras cuyo AABB solapa el vecindario del edit (la luz se difunde ≤MC_MAXLIGHT bloques,
// +1 de margen): reconstruye su instancia con mcBuildStructMesh, que vuelve a muestrear max(skylight, luz de bloque) por
// cara. Acotado a las cercanas ⇒ ~1 estructura por edición. Fire-and-forget: el geom ya está cacheado (sin await de red).
async function mcRebakeStructsNear(x,z){
  const R=MC_MAXLIGHT+1;
  const affected=mc.structures.filter(s=>{ const a=s.aabb; return x>=a[0]-R&&x<=a[3]+R&&z>=a[2]-R&&z<=a[5]+R; });
  for(const s of affected){
    if(mc.structures.indexOf(s)<0) continue;                 // se retiró mientras se reconstruía otra
    const rebuilt=await mcBuildStructMesh(s.key, s.ox, s.oy, s.oz, s.rot);
    const j=mc.structures.indexOf(s);
    if(j>=0){ mcFreeStruct(s); mc.structures[j]=rebuilt; } else mcFreeStruct(rebuilt);
  }
}
// --- F4 · física: colisión AABB + gravedad + WASD ---
const MC_HW=0.3, MC_PH=1.8;   // medio ancho y alto del jugador a escala 1 (0.6×0.6×1.8); game.playerScale los escala
const MC_STEP=0.6;            // altura de auto-escalón a escala 1 (como Minecraft: sube losas, NO bloques enteros); ∝ game.playerScale
// Mueve el eje `ai` (0=x, 2=z) del jugador hacia `target`; si choca, intenta subir un escalón (hasta MC_STEP·scale)
// y pasar por encima (un x8 sube sobre un bloque de altura 1 sin saltar, como pisaría un bordillo).
function mcMoveAxis(ai, target){
  const p=mc.pos, t=[p[0],p[1],p[2]]; t[ai]=target;
  if(!mcCollides(t[0],t[1],t[2])){ p[ai]=target; return; }   // libre: mueve directo
  const stepH=MC_STEP*mc.scale, inc=Math.max(1/MC_TILE, stepH/12);
  for(let h=inc; h<=stepH+1e-6; h+=inc){                      // sube en pasos finos y prueba a colar el eje ahí arriba
    if(!mcCollides(t[0], p[1]+h, t[2])){ p[ai]=target; p[1]+=h; if(mc.vel[1]<0) mc.vel[1]=0; mc.onGround=true; return; }
  }
  // no cupo el escalón: el eje queda bloqueado (choca de verdad contra un muro más alto que el escalón)
}
// ¿Hay algún voxel fino de estructura en la caja fina [fx0..fx1]×[fy0..fy1]×[fz0..fz1] (inclusive)?
// Por estructura: recorte contra su AABB fino (si no solapa, coste cero) y sondeo del bitset denso de su
// malla cacheada por acceso directo. Sustituye al Set global `structFine` cuyo coste crecía con el VOLUMEN
// del AABB del jugador (∝ playerScale³: 1M consultas hash/frame a escala 5 → 31fps pegado a la Taberna).
function mcFineBoxHit(fx0,fy0,fz0,fx1,fy1,fz1){
  const T=MC_TILE;
  for(const s of mc.structures){
    const rr=mc.structs[s.key] && mc.structs[s.key].meshRot, g=rr && rr[s.rot|0]; if(!g||!g.bits) continue;
    const d=g.fdim, bx=s.ox*T, by=s.oy*T, bz=s.oz*T;
    const x0=Math.max(fx0-bx,0), x1=Math.min(fx1-bx,d[0]-1); if(x0>x1) continue;
    const y0=Math.max(fy0-by,0), y1=Math.min(fy1-by,d[1]-1); if(y0>y1) continue;
    const z0=Math.max(fz0-bz,0), z1=Math.min(fz1-bz,d[2]-1); if(z0>z1) continue;
    for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++){
      const row=(y*d[2]+z)*d[0];
      for(let x=x0;x<=x1;x++) if(g.bits[row+x]) return true;
    }
  }
  return false;
}
function mcFineSolidAt(fx,fy,fz){ return mcFineBoxHit(fx,fy,fz, fx,fy,fz); }
function mcCollidesWorld(px,py,pz){   // ¿el AABB del jugador en (px,py,pz) solapa bloques del terreno o estructuras?
  const HW=MC_HW*mc.scale, PH=MC_PH*mc.scale;
  const x0=Math.floor(px-HW), x1=Math.floor(px+HW);
  const y0=Math.floor(py),    y1=Math.floor(py+PH-1e-4);
  const z0=Math.floor(pz-HW), z1=Math.floor(pz+HW);
  for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++)
    if(mcSolid(x,y,z)) return true;
  if(mc.structures.length){
    const T=MC_TILE;
    if(mcFineBoxHit(Math.floor((px-HW)*T), Math.floor(py*T),           Math.floor((pz-HW)*T),
                    Math.floor((px+HW)*T), Math.floor((py+PH-1e-4)*T), Math.floor((pz+HW)*T))) return true;
  }
  return false;
}
function mcCollides(px,py,pz){   // ¿el AABB del jugador en (px,py,pz) solapa algún voxel sólido?
  const HW=MC_HW*mc.scale, PH=MC_PH*mc.scale;
  // Terreno: resolución de bloque de mundo (16³).
  const x0=Math.floor(px-HW), x1=Math.floor(px+HW);
  const y0=Math.floor(py),    y1=Math.floor(py+PH-1e-4);
  const z0=Math.floor(pz-HW), z1=Math.floor(pz+HW);
  for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++)
    if(mcSolid(x,y,z)) return true;
  // Estructuras: resolución FINA (1/16), igual que su malla → se camina por el interior y los vanos,
  // no por la huella gruesa (que atraparía al jugador dentro de una sala llena de muebles).
  if(mc.structures.length){
    const T=MC_TILE;
    if(mcFineBoxHit(Math.floor((px-HW)*T), Math.floor(py*T),           Math.floor((pz-HW)*T),
                    Math.floor((px+HW)*T), Math.floor((py+PH-1e-4)*T), Math.floor((pz+HW)*T))) return true;
  }
  // Agentes (NPCs): colisión física AABB 1×1×1 en su posición de renderizado (renderX, renderY+1, renderZ)
  if(mc.agents && mc.agents.size){
    const minX = px - HW, maxX = px + HW;
    const minY = py,      maxY = py + PH - 1e-4;
    const minZ = pz - HW, maxZ = pz + HW;
    for(const a of mc.agents.values()){
      if(a.state === 'stopped') continue;
      const rx = a.renderX !== undefined ? a.renderX : a.x;
      const ry = a.renderY !== undefined ? a.renderY : a.y;
      const rz = a.renderZ !== undefined ? a.renderZ : a.z;
      const ax0 = rx,     ax1 = rx + 1;
      const ay0 = ry + 1, ay1 = ry + 2;
      const az0 = rz,     az1 = rz + 1;
      if(maxX > ax0 && minX < ax1 && maxY > ay0 && minY < ay1 && maxZ > az0 && minZ < az1) return true;
    }
  }
  return false;
}
// Si el jugador quedó EMBUTIDO (p.ej. tras estampar/cargar una sala bajo sus pies), lo sube en pasos finos
// hasta quedar libre (lo deja de pie encima de lo que estorbe). El techo escala con el jugador: un gigante
// (playerScale alto) mide 1.8·scale de alto, así que subir 3 bloques fijos no lo sacaba de la estructura.
function mcUnstick(){
  if(!mcCollides(mc.pos[0], mc.pos[1], mc.pos[2])) return true;
  const step=1/MC_TILE, top=mc.dim.y+MC_PH*mc.scale+2;   // por encima del mundo y de la estructura más alta → siempre hay aire
  for(let y=mc.pos[1]+step; y<=top; y+=step){
    if(!mcCollides(mc.pos[0], y, mc.pos[2])){ mc.pos[1]=y; mc.vel[1]=0; mc.onGround=true; return true; }
  }
  return false;   // no encontró hueco subiendo (raro) → el llamador reubica al spawn
}
// Desatasco «duro» (tecla U / game.unstick()): intenta subir; si no sale, teletransporta al spawn y sube ahí.
function mcForceUnstick(){
  if(mcUnstick()) return true;
  const s=mc.spawn; mc.pos=[s.x+0.5, s.y, s.z+0.5]; mc.vel=[0,0,0];   // reubica al spawn
  if(mcUnstick()) return true;
  mc.pos[1]=mc.dim.y+MC_PH*mc.scale+1; mc.vel=[0,0,0]; return true;   // último recurso: sobre el mundo (cae limpio)
}
// Un agente que te EMBISTE te aparta de un empujón; no te sube a caballito. Sin esto, el solape lo resolvía
// la auto-curación de mcUpdate, y mcUnstick solo sabe buscar salida HACIA ARRIBA: el primer hueco de aire
// sobre el cuerpo del agente es justo la cota de montar (ry+2), así que la serpiente te ensartaba y aparecías
// montado encima sin haber saltado. Aquí se resuelve el solape en horizontal, que es lo que hace un empujón.
// Devuelve true si apartó al jugador; false si no había agente encima o estaba acorralado (→ mcUnstick).
function mcAgentShove(){
  if(!mc.agents || !mc.agents.size) return false;
  const p=mc.pos, HW=MC_HW*mc.scale, PH=MC_PH*mc.scale;
  const minX=p[0]-HW, maxX=p[0]+HW, minY=p[1], maxY=p[1]+PH-1e-4, minZ=p[2]-HW, maxZ=p[2]+HW;
  for(const a of mc.agents.values()){
    if(a.state==='stopped') continue;
    const rx=a.renderX!==undefined?a.renderX:a.x;
    const ry=a.renderY!==undefined?a.renderY:a.y;
    const rz=a.renderZ!==undefined?a.renderZ:a.z;
    // Mismo AABB del agente que usa mcCollides: [ry+1, ry+2). Quien va montado tiene los pies EN ry+2, así que
    // no solapa y no le llega ningún empujón: montar sigue siendo cosa de saltar encima.
    if(!(maxX>rx && minX<rx+1 && maxY>ry+1 && minY<ry+2 && maxZ>rz && minZ<rz+1)) continue;
    const eps=1e-3;
    // Dirección del empujón = hacia donde VA el agente (su celda destino menos la interpolada). Ordenar solo por
    // «salida más corta» no vale: a mitad de embestida la salida corta es la de ATRÁS, y el agente te escupía
    // hacia su cola y te atravesaba. Si ya llegó a destino (no se mueve), se empuja radialmente desde su centro.
    let hx=a.x-rx, hz=a.z-rz;
    if(Math.abs(hx)<1e-4 && Math.abs(hz)<1e-4){ hx=p[0]-(rx+0.5); hz=p[2]-(rz+0.5); }
    // Las 4 salidas horizontales: primero las que van A FAVOR del empujón, y entre esas la más corta.
    const salidas=[{dx:(rx-HW-eps)-p[0], dz:0}, {dx:(rx+1+HW+eps)-p[0], dz:0},
                   {dx:0, dz:(rz-HW-eps)-p[2]}, {dx:0, dz:(rz+1+HW+eps)-p[2]}];
    for(const s of salidas){ s.dist=Math.abs(s.dx)+Math.abs(s.dz); s.contra=(s.dx*hx+s.dz*hz)>0?0:1; }
    salidas.sort((u,v)=>(u.contra-v.contra)||(u.dist-v.dist));
    for(const s of salidas){
      const nx=p[0]+s.dx, nz=p[2]+s.dz;
      if(mcCollides(nx, p[1], nz)) continue;   // ese hueco lo ocupa terreno, una estructura u otro agente
      p[0]=nx; p[2]=nz; return true;
    }
    return false;   // acorralado contra una pared → que mcUnstick haga lo de siempre y te suba
  }
  return false;
}
function mcUpdate(dt){
  if(dt<=0) return; dt=Math.min(dt,0.05);   // clamp para no atravesar bloques en un frame lento
  // Auto-curación: si acabamos INCRUSTADOS (sala mallada tras aparecer, estampada encima, resize…), el
  // siguiente frame nos saca solo. Evita quedar congelado sin poder andar/saltar sin depender de la tecla U.
  // Un agente encima se resuelve APARTANDO en horizontal (empujón); solo si eso falla se sube al aire.
  if(mcCollides(mc.pos[0], mc.pos[1], mc.pos[2])){ if(!mcAgentShove()) mcUnstick(); }
  const k=mc.keys, sp=mc.speed*(k['shift']?0.5:1)*Math.sqrt(mc.scale);   // game.playerSpeed; Shift = mitad. Velocidad ∝ √scale (sublineal): un gigante avanza más en absoluto pero LENTO respecto a su cuerpo → sensación de mole/peso (antes ∝ scale = mismo ritmo relativo = ligero)
  const sinY=Math.sin(mc.yaw), cosY=Math.cos(mc.yaw);
  const fwd=[-sinY,0,-cosY], right=[cosY,0,-sinY];   // horizontal, relativo al yaw (no al pitch)
  let mx=0,mz=0;
  if(k['w']){ mx+=fwd[0]; mz+=fwd[2]; }
  if(k['s']){ mx-=fwd[0]; mz-=fwd[2]; }
  if(k['d']){ mx+=right[0]; mz+=right[2]; }
  if(k['a']){ mx-=right[0]; mz-=right[2]; }
  const ml=Math.hypot(mx,mz);
  if(mc.onGround || !mc.airControl){
    // Suelo (o air-control off): la velocidad horizontal se fija DIRECTA desde la dirección de vista → marcha responsiva
    // e instantánea (y frena en seco al soltar). Comportamiento clásico.
    if(ml>0){ mx=mx/ml*sp; mz=mz/ml*sp; } else { mx=0; mz=0; }
    mc.vel[0]=mx; mc.vel[2]=mz;
  } else {
    // Aire estilo Quake (air-strafe): NO se reescribe la velocidad (girar el ratón no redirige el salto; soltar teclas
    // conserva la inercia). Se acelera de forma acotada, pero por EJES SEPARADOS (adelante/atrás y lateral): con un solo
    // wishdir, ir corriendo (W) hacía que W+D apuntara en diagonal y la proyección ya superaba el tope → A/D no se notaba
    // al correr. Cada eje acelera contra SU propia componente de velocidad, así el lateral (A/D) siempre te desvía aunque
    // mantengas W. La componente por eje no pasa de airCap (< velocidad de salto ⇒ sin acel. recta gratis; strafe-jump sale
    // combinando A/D con giro del ratón, que rota el eje 'right' y deja ganar velocidad).
    const cap=mc.airCap*Math.sqrt(mc.scale), acc=mc.airAccel*sp*dt;
    const airAxis=(dx,dz)=>{ const cur=mc.vel[0]*dx+mc.vel[2]*dz, add=cap-cur; if(add<=0) return;
      const a=acc<add?acc:add; mc.vel[0]+=dx*a; mc.vel[2]+=dz*a; };
    let f=0, st=0;
    if(k['w']) f+=1; if(k['s']) f-=1; if(k['d']) st+=1; if(k['a']) st-=1;
    if(f)  airAxis(fwd[0]*f,   fwd[2]*f);     // adelante/atrás relativo a la vista
    if(st) airAxis(right[0]*st, right[2]*st);  // lateral (strafe) relativo a la vista
  }   // en aire sin input: la velocidad horizontal se conserva intacta (inercia del salto)
  mc.vel[1]-=22*dt;                                  // gravedad
  if(k[' '] && mc.onGround){ mc.vel[1]=8.0*Math.sqrt(mc.scale); mc.onGround=false; }   // salto: altura ∝ scale (√ porque h=v²/2g) → el doble de grande salta el doble de bloques, igual que la marcha escala con el tamaño
  const p=mc.pos;
  // Horizontal eje a eje CON auto-escalón (∝ tamaño): un bloque de altura 1 es un escalón enano para un
  // gigante, así que si un eje choca probamos a subir hasta MC_STEP·scale y pasar por encima. Sin esto,
  // cualquier saliente de 1 bloque frena a un x8 y ni siquiera se puede montar el terreno (borde de 15).
  mcMoveAxis(0, p[0]+mc.vel[0]*dt);
  mcMoveAxis(2, p[2]+mc.vel[2]*dt);
  let ny=p[1]+mc.vel[1]*dt;
  if(!mcCollides(p[0],ny,p[2])){ p[1]=ny; mc.onGround=false; }
  else { if(mc.vel[1]<0) mc.onGround=true; mc.vel[1]=0; }         // choca arriba o aterriza
}
function mcViewMatrix(){
  const p=mc.pos, ex=p[0], ey=p[1]+MC_EYE*mc.scale, ez=p[2];   // ojo = pies + altura del ojo (escala con game.playerScale)
  // view = rotX(-pitch)·rotY(-yaw)·translate(-ojo)  (Y-arriba, mira a -Z con yaw=0)
  return mat4.mul(mat4.rotX(-mc.pitch), mat4.mul(mat4.rotY(-mc.yaw), mat4.translate(-ex,-ey,-ez)));
}
function mcProjMatrix(){
  const cv=mc.canvas, aspect=cv.width/Math.max(1,cv.height);
  const far=Math.max(24, mc.renderDist*MC_CHUNK*1.7);
  return { m:mat4.perspective(mc.fov, aspect, 0.1, far), far };
}
// Frustum cull por AABB del chunk: descarta si sus 8 esquinas caen todas fuera del mismo plano de clip.
function mcChunkVisible(ch, pv){
  const a=ch.aabb, out=[0,0,0,0,0,0];
  for(let i=0;i<8;i++){
    const x=(i&1)?a[3]:a[0], y=(i&2)?a[4]:a[1], z=(i&4)?a[5]:a[2];
    const cx=pv[0]*x+pv[4]*y+pv[8]*z+pv[12], cy=pv[1]*x+pv[5]*y+pv[9]*z+pv[13];
    const cz=pv[2]*x+pv[6]*y+pv[10]*z+pv[14], cw=pv[3]*x+pv[7]*y+pv[11]*z+pv[15];
    if(cx<-cw) out[0]++; if(cx>cw) out[1]++;
    if(cy<-cw) out[2]++; if(cy>cw) out[3]++;
    if(cz<-cw) out[4]++; if(cz>cw) out[5]++;
  }
  for(let k=0;k<6;k++) if(out[k]===8) return false;
  return true;
}
function mcRender(){
  const gl=mc.gl; if(!gl) return;
  mcResize();
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(!mc.prog || !mc.atlasTex) return;
  const view=mcViewMatrix(), pj=mcProjMatrix(), pv=mat4.mul(pj.m,view);
  // Terreno: atlas opaco → shader sin discard (early-z); con huecos → alpha-test. Las estructuras texturadas
  // (2º pase) siempre usan mc.prog (su atlas suele tener huecos), así que ese programa se prepara aparte allí.
  const opaque=!mc.atlasHasAlpha && mc.progOpaque;
  const TP=opaque?mc.progOpaque:mc.prog, L=opaque?mc.locOpaque:mc.loc;
  gl.useProgram(TP);
  mcAttribs([L.aPos,L.aUV,L.aShade]);   // limpia cualquier atributo suelto (p.ej. aTile/aRect de estructuras) que haría fallar el draw
  gl.uniformMatrix4fv(L.uProj,false,pj.m);
  gl.uniformMatrix4fv(L.uView,false,view);
  gl.uniform3f(L.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
  gl.uniform1f(L.uFogNear, pj.far*0.55); gl.uniform1f(L.uFogFar, pj.far*0.98);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mc.atlasTex); gl.uniform1i(L.uTex,0);
  const stride=6*4, cxp=Math.floor(mc.pos[0]/MC_CHUNK), czp=Math.floor(mc.pos[2]/MC_CHUNK);
  const fx=mc.pos[0]/MC_CHUNK, fz=mc.pos[2]/MC_CHUNK;                                // chunk (fraccional) del jugador
  const vis=mc._visChunks||(mc._visChunks=[]); vis.length=0;                         // scratch reutilizado (sin GC por frame)
  for(const [key,ch] of mc.chunks){
    if(!ch.count) continue;
    const p=key.split(','), ccx=+p[0], ccz=+p[1];
    if(Math.abs(ccx-cxp)>mc.renderDist || Math.abs(ccz-czp)>mc.renderDist) continue; // distancia de render
    if(!mcChunkVisible(ch,pv)) continue;                                             // frustum cull
    const dx=ccx+0.5-fx, dz=ccz+0.5-fz; ch._d=dx*dx+dz*dz;                           // distancia² horizontal al ojo
    vis.push(ch);
  }
  vis.sort((a,b)=>a._d-b._d);   // cercano→lejano: con el early-z, el terreno próximo tapa (por depth) a los fragmentos de detrás antes de sombrearlos → menos overdraw
  let quads=0;
  for(const ch of vis){
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.vbo);
    gl.enableVertexAttribArray(L.aPos);   gl.vertexAttribPointer(L.aPos,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(L.aUV);    gl.vertexAttribPointer(L.aUV,2,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(L.aShade); gl.vertexAttribPointer(L.aShade,1,gl.FLOAT,false,stride,20);
    gl.drawArrays(gl.TRIANGLES,0,ch.count);
    quads+=ch.count/6;
  }
  // Agentes (NPC): su cuerpo es un cubo suelto con el MISMO formato de vértice que el terreno (x,y,z,u,v,shade)
  // y el mismo atlas, así que se dibuja aquí sin cambiar de programa. No vive en mc.grid (ver mcAgentSetBlock).
  for(const a of mc.agents.values()){
    if(!a.vbo || !a.count) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, a.vbo);
    gl.enableVertexAttribArray(L.aPos);   gl.vertexAttribPointer(L.aPos,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(L.aUV);    gl.vertexAttribPointer(L.aUV,2,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(L.aShade); gl.vertexAttribPointer(L.aShade,1,gl.FLOAT,false,stride,20);
    gl.drawArrays(gl.TRIANGLES,0,a.count);
    quads+=a.count/6;
  }
  // Estructuras estampadas (voxeles finos), frustum-culled por su aabb — DOS pasadas:
  if(mc.structures.length){
    // 1) Color por vértice (voxeles #hex, y tex: cuando game.structTextures=false) — programa de estructuras.
    if(mc.structProg){
      const SL=mc.structLoc, sstr=9*4;
      gl.useProgram(mc.structProg);
      gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
      gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
      gl.uniform1f(SL.uFogNear, pj.far*0.55); gl.uniform1f(SL.uFogFar, pj.far*0.98);
      mcAttribs([SL.aPos,SL.aColor,SL.aShade,SL.aEmit,SL.aAlpha]);
      for(const s of mc.structures){
        if(!s.colCount || !mcChunkVisible(s,pv)) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, s.colVbo);
        mcStructAttrib(SL, sstr);
        gl.drawArrays(gl.TRIANGLES,0,s.colCount);
        quads+=s.colCount/6;
      }
    }
    // 2) Texturado real (voxeles tex: con game.structTextures) — shader propio con repetición por voxel
    //    (mc.stexProg, aPos/aTile/aRect/aShade, stride 10·4) → el greedy fusiona caras sin perder el tile por voxel.
    if(mc.structAtlasTex && mc.stexProg){
      const stride2=10*4, SL=mc.stexLoc;   // alpha-test en el FS (el atlas de estructuras tiene huecos)
      gl.useProgram(mc.stexProg);
      gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
      gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
      gl.uniform1f(SL.uFogNear, pj.far*0.55); gl.uniform1f(SL.uFogFar, pj.far*0.98);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mc.structAtlasTex); gl.uniform1i(SL.uTex,0);
      mcAttribs([SL.aPos,SL.aTile,SL.aRect,SL.aShade]);
      for(const s of mc.structures){
        if(!s.texCount || !mcChunkVisible(s,pv)) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, s.texVbo);
        gl.vertexAttribPointer(SL.aPos,3,gl.FLOAT,false,stride2,0);
        gl.vertexAttribPointer(SL.aTile,2,gl.FLOAT,false,stride2,12);
        gl.vertexAttribPointer(SL.aRect,4,gl.FLOAT,false,stride2,20);
        gl.vertexAttribPointer(SL.aShade,1,gl.FLOAT,false,stride2,36);
        gl.drawArrays(gl.TRIANGLES,0,s.texCount);
        quads+=s.texCount/6;
      }
    }
    // 3) Translúcido (voxeles #rrggbbaa) — pasada con blend SIN escribir profundidad (sin ordenar: pixel-art,
    //    order-independent, barato). Va después de TODO lo opaco (terreno + estructuras) para mezclarse encima.
    if(mc.structProg){
      let any=false; for(const s of mc.structures){ if(s.alphaCount && mcChunkVisible(s,pv)){ any=true; break; } }
      if(any){
        const SL=mc.structLoc, sstr=9*4;
        gl.useProgram(mc.structProg);
        gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
        gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
        gl.uniform1f(SL.uFogNear, pj.far*0.55); gl.uniform1f(SL.uFogFar, pj.far*0.98);
        mcAttribs([SL.aPos,SL.aColor,SL.aShade,SL.aEmit,SL.aAlpha]);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        for(const s of mc.structures){
          if(!s.alphaCount || !mcChunkVisible(s,pv)) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, s.alphaVbo);
          mcStructAttrib(SL, sstr);
          gl.drawArrays(gl.TRIANGLES,0,s.alphaCount);
          quads+=s.alphaCount/6;
        }
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
  }
  mcDrawPreview(pj, view);        // vista-previa translúcida de la habitación mientras se mantiene el clic derecho
  mcDrawOverlays(pj, view);
  mc.quads=quads; game.voxels=Math.round(quads);
}
// Dibuja la vista-previa de una estructura (mc.preview) como MALLA renderizada de verdad, translúcida
// (game.structGhostAlpha), siguiendo la mira antes de estampar. Dos pasadas idénticas al render de estructuras
// (color por vértice + textura vía atlas de estructuras), con mezcla por alfa constante y sin escribir profundidad.
function mcDrawPreview(pj, view){
  const gl=mc.gl, s=mc.preview; if(!s || mc.structGhostAlpha<=0) return;
  gl.enable(gl.BLEND); gl.blendColor(0,0,0,mc.structGhostAlpha); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
  gl.depthMask(false);
  if(mc.structProg && (s.colCount || s.alphaCount)){                          // pasada 1 · color por vértice (#hex opaco+translúcido y tex: en modo plano)
    const SL=mc.structLoc, sstr=9*4;
    gl.useProgram(mc.structProg);
    gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
    gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
    gl.uniform1f(SL.uFogNear, pj.far*0.55); gl.uniform1f(SL.uFogFar, pj.far*0.98);
    mcAttribs([SL.aPos,SL.aColor,SL.aShade,SL.aEmit,SL.aAlpha]);                // el blend del fantasma usa CONSTANT_ALPHA → ignora vAlpha (el vidrio se ve al alpha del fantasma)
    if(s.colCount){ gl.bindBuffer(gl.ARRAY_BUFFER, s.colVbo); mcStructAttrib(SL, sstr); gl.drawArrays(gl.TRIANGLES,0,s.colCount); }
    if(s.alphaCount){ gl.bindBuffer(gl.ARRAY_BUFFER, s.alphaVbo); mcStructAttrib(SL, sstr); gl.drawArrays(gl.TRIANGLES,0,s.alphaCount); }
  }
  if(mc.structAtlasTex && mc.stexProg && s.texCount){                         // pasada 2 · textura completa (mc.stexProg + atlas de estructuras)
    const SL=mc.stexLoc, stride2=10*4;
    gl.useProgram(mc.stexProg);
    gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
    gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
    gl.uniform1f(SL.uFogNear, pj.far*0.55); gl.uniform1f(SL.uFogFar, pj.far*0.98);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mc.structAtlasTex); gl.uniform1i(SL.uTex,0);
    mcAttribs([SL.aPos,SL.aTile,SL.aRect,SL.aShade]);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.texVbo);
    gl.vertexAttribPointer(SL.aPos,3,gl.FLOAT,false,stride2,0);
    gl.vertexAttribPointer(SL.aTile,2,gl.FLOAT,false,stride2,12);
    gl.vertexAttribPointer(SL.aRect,4,gl.FLOAT,false,stride2,20);
    gl.vertexAttribPointer(SL.aShade,1,gl.FLOAT,false,stride2,36);
    gl.drawArrays(gl.TRIANGLES,0,s.texCount);
    gl.bindTexture(gl.TEXTURE_2D, mc.atlasTex);                               // restaura el atlas del terreno
  }
  gl.disable(gl.BLEND); gl.depthMask(true);
}
// Libera la vista-previa de estructura (VBO) y olvida su memo. Se llama al soltar, al perder el foco o al cerrar.
function mcClearPreview(){ if(mc.preview){ mcFreeStruct(mc.preview); mc.preview=null; } mc.previewKey=null; mc.previewBusy=null; mc.previewStructKey=null; }
// ¿la sala usa texturas `tex:` que aún NO están en el atlas de estructuras? (⇒ hay que recomponerlo para la vista-previa)
async function mcRoomNeedsAtlas(sk){
  try{ const d=await getRoomData(sk); const vox=d.voxels||{};
    for(const k in vox){ const v=vox[k]; if(typeof v==='string' && v.slice(0,4)==='tex:' && !(mc.structUV && mc.structUV[v.slice(4)])) return true; }
  }catch(e){}
  return false;
}
// Mantiene mc.preview: mientras se MANTIENE el clic derecho con una ranura de estructura, construye (o reubica) la
// malla real de la habitación en la celda apuntada + giro al jugador. Sólo re-malla si cambió el objetivo/giro
// (memo) → no revienta fps al mirar quieto; al soltar/perder foco se limpia. Asíncrona (no bloquea el frame).
async function mcUpdatePreview(){
  const sk=mc.slotStruct[mc.sel];
  const on = mc.active && mc.heldBtn===2 && sk && document.pointerLockElement===mc.canvas && mc.structGhostAlpha>0;
  if(!on){ if(mc.preview||mc.previewKey||mc.previewStructKey) mcClearPreview(); return; }
  const hit=mcRaycast(mcReach(), true); if(!hit){ if(mc.preview) mcClearPreview(); return; }   // el fantasma se ancla también a caras de estructura (lo que ves = lo que colocas)
  const c=hit.cell, n=hit.normal, tx=c[0]+n[0], ty=c[1]+n[1], tz=c[2]+n[2];   // celda apuntada (centro de la base)
  if(!mcInside(tx,ty,tz)){ if(mc.preview) mcClearPreview(); return; }
  await mcStructCells(sk);                                                    // asegura la huella para centrar bien
  const rot=mcPreviewOri(), [ox,oy,oz]=mcStructOrigin(sk, tx,ty,tz, rot, n);    // orientación a mano (R giro / Shift+R vuelco); centro en suelo, canto en pared
  const memo=sk+'|'+ox+'|'+oy+'|'+oz+'|'+rot;
  if(memo===mc.previewKey || memo===mc.previewBusy) return;      // ya dibujada o en construcción → nada que hacer
  mc.previewBusy=memo;
  // Sala nueva (nunca estampada): mete sus texturas en el atlas una vez para que la vista-previa salga texturada.
  if(mc.previewStructKey!==sk){ mc.previewStructKey=sk; if(await mcRoomNeedsAtlas(sk)) await mcRestampAll(); }
  const mesh=await mcBuildStructMesh(sk, ox,oy,oz, rot);
  if(mc.previewBusy!==memo){ mcFreeStruct(mesh); return; }       // el objetivo cambió mientras construía → descarta
  if(mc.preview) mcFreeStruct(mc.preview);
  mc.preview=mesh; mc.previewKey=memo; mc.previewBusy=null;
}

// Overlays de depuración/ayuda (usan mc.structProg, color por vértice): fantasma de colocación, marcador
// «demasiado lejos» y volumen de colisión en rayos-X. No cuentan como voxeles dibujados.
function mcPushBoxEdges(out, x0,y0,z0, x1,y1,z1, r,g,b){   // 12 aristas → gl.LINES
  const P=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  const E=[0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
  for(const i of E){ const p=P[i]; out.push(p[0],p[1],p[2], r,g,b, 1); }
}
function mcPushBoxTris(out, x0,y0,z0, x1,y1,z1, r,g,b){    // 12 tris → gl.TRIANGLES (relleno)
  const P=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  const F=[0,3,2,0,2,1, 4,5,6,4,6,7, 0,1,5,0,5,4, 2,3,7,2,7,6, 1,2,6,1,6,5, 3,0,4,3,4,7];
  for(const i of F){ const p=P[i]; out.push(p[0],p[1],p[2], r,g,b, 1); }
}
function mcDrawArr(SL, arr, mode){   // sube arr (7 floats/vért) al VBO de overlays y dibuja
  if(!arr.length) return;
  const gl=mc.gl; if(!mc.ovbo) mc.ovbo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mc.ovbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(SL.aPos,3,gl.FLOAT,false,7*4,0);
  gl.vertexAttribPointer(SL.aColor,3,gl.FLOAT,false,7*4,12);
  gl.vertexAttribPointer(SL.aShade,1,gl.FLOAT,false,7*4,24);
  gl.drawArrays(mode,0,arr.length/7);
}
function mcDrawOverlays(pj, view){
  const gl=mc.gl, SL=mc.structLoc; if(!mc.structProg) return;
  const playing=(document.pointerLockElement===mc.canvas);
  const lines=[], structLines=[], xray=[];   // lines/structLines: fantasma de bloque (game.ghostAlpha) vs. huella de estructura (game.structGhostAlpha)
  // 1) Fantasma de colocación / marcador «demasiado lejos» (solo mientras juegas y con algo que colocar).
  const sk=mc.slotStruct[mc.sel];
  if(playing && (sk || mc.hotbar[mc.sel]) && mc.tool!=='paint'){
    const near=mcRaycast(mcReach(), true);   // el fantasma de colocación también aparece sobre caras de estructura
    if(near){
      const n=near.normal, px=near.cell[0]+n[0], py=near.cell[1]+n[1], pz=near.cell[2]+n[2];
      if(sk){                                    // estructura: caja de su huella (mcStructCells cacheada)
        const rec=mc.structs[sk]; if(!rec||rec.w==null) mcStructCells(sk);   // calienta la caché para el próximo frame
        const rot=mcPreviewOri();                    // orientación a mano (R giro / Shift+R vuelco)
        const [w,h,d]=mcOriDims((rec&&rec.w)||1, (rec&&rec.h)||1, (rec&&rec.d)||1, rot);   // huella tras giro+vuelco
        const o=mcStructOrigin(sk, px,py,pz, rot, n);   // centro en suelo, canto (flush) en pared lateral
        mcPushBoxEdges(structLines, o[0],o[1],o[2], o[0]+w,o[1]+h,o[2]+d, 0.42,1,0.55);   // caja de huella (game.structGhostAlpha)
      } else if(mcInside(px,py,pz) && !mcSolid(px,py,pz)){
        mcPushBoxEdges(lines, px,py,pz, px+1,py+1,pz+1, 0.42,1,0.55);        // hueco adyacente: verde
      }
    } else {
      // Nada sólido dentro del alcance: si hay algo más lejos, avisa «demasiado lejos» (ámbar, discreto).
      const far=mcRaycast(Math.min(80, mc.renderDist*MC_CHUNK));
      if(far){ const c=far.cell; mcPushBoxEdges(lines, c[0],c[1],c[2], c[0]+1,c[1]+1,c[2]+1, 0.95,0.55,0.15); }
    }
  }
  // 2) Rayos-X (tecla X): volumen de colisión alrededor del jugador, VISIBLE a través de las paredes.
  if(mc.xray) mcXrayVolume(xray);
  // 3) t1 · marcadores de nota: un post-it amarillo flotando sobre cada bloque anotado (dentro de la distancia de render).
  const notes=[]; const R=mc.renderDist*MC_CHUNK, p=mc.pos;
  if(mc.noteAlpha>0) for(const k in mc.notes){ const q=k.split(','), x=+q[0], y=+q[1], z=+q[2];
    if(Math.abs(x+0.5-p[0])>R || Math.abs(z+0.5-p[2])>R) continue;
    mcPushBoxTris(notes, x+0.34,y+1.16,z+0.44, x+0.66,y+1.5,z+0.5, 1,0.84,0.22);   // hoja del post-it (cara amarilla)
    mcPushBoxTris(notes, x+0.47,y+1.0,z+0.47,  x+0.53,y+1.18,z+0.53, 0.55,0.4,0.12); // «pincho» que lo clava al bloque
  }
  // 4) Herramienta Seleccionar: caja CIAN de la selección confirmada + previa ámbar de la esquina A hacia la mira.
  const selLines=[];
  if(mc.selBox && mc.tool==='select'){ const a=mc.selBox.a, b=mc.selBox.b;
    mcPushBoxEdges(selLines, Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),
                             Math.max(a[0],b[0])+1,Math.max(a[1],b[1])+1,Math.max(a[2],b[2])+1, 0.3,0.9,1);
  }
  if(mc.tool==='select' && mc.selA && playing){ const near=mcRaycast();
    if(near && near.cell[1]>=0){ const a=mc.selA, c=near.cell;
      mcPushBoxEdges(selLines, Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.min(a[2],c[2]),
                               Math.max(a[0],c[0])+1,Math.max(a[1],c[1])+1,Math.max(a[2],c[2])+1, 1,0.85,0.2);
    }
  }
  const showGhost=lines.length && mc.ghostAlpha>0;
  const showStruct=structLines.length && mc.structGhostAlpha>0;
  if(!showGhost && !showStruct && !xray.length && !notes.length && !selLines.length) return;

  gl.useProgram(mc.structProg);
  gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
  gl.uniform3f(SL.uSky,MC_SKY[0],MC_SKY[1],MC_SKY[2]);
  gl.uniform1f(SL.uFogNear, pj.far*8); gl.uniform1f(SL.uFogFar, pj.far*10);   // sin niebla sobre el overlay
  mcAttribs([SL.aPos, SL.aColor, SL.aShade]);   // deja habilitados SOLO estos 3; ningún atributo huérfano con VBO nulo
  // Rayos-X: relleno translúcido (alpha constante vía blendColor) y SIN test de profundidad (atraviesa muros).
  if(xray.length){
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendColor(0,0,0,0.38); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    mcDrawArr(SL, xray, gl.TRIANGLES);
    gl.disable(gl.BLEND);
  }
  // Fantasma de bloque suelto (verde) + marcador «demasiado lejos» (ámbar): game.ghostAlpha, y caja de huella de
  // estructura: game.structGhostAlpha. Ambos por mezcla de alfa constante, respetando la profundidad de la escena.
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
  if(showGhost){  gl.blendColor(0,0,0,mc.ghostAlpha);       mcDrawArr(SL, lines,       gl.LINES); }
  if(showStruct){ gl.blendColor(0,0,0,mc.structGhostAlpha); mcDrawArr(SL, structLines, gl.LINES); }
  if(notes.length){ gl.blendColor(0,0,0,mc.noteAlpha);      mcDrawArr(SL, notes, gl.TRIANGLES); }   // t1 · post-its (relleno, ocluidos por muros)
  if(selLines.length){ gl.blendColor(0,0,0,0.9);            mcDrawArr(SL, selLines, gl.LINES); }    // herramienta Seleccionar: caja(s) de selección
  gl.disable(gl.BLEND);
  gl.depthMask(true); gl.enable(gl.DEPTH_TEST);   // restaura estado para el próximo frame
}
// Volumen de colisión alrededor del jugador (para justificar por qué no avanza): terreno sólido (bloques 16³,
// rojo) en un radio corto + voxeles finos de estructuras (1/16, naranja) que solapan su AABB. Debug, sin textura.
// Rayos-X: etiquetas DOM con las coordenadas de cada bloque rojo (mismo volumen que mcXrayVolume, rama de rejilla).
// Proyecta el centro de cada celda con pv=proj·view (columna-mayor) y reutiliza un pool de nodos para no crear/borrar.
let mcXlbls=[];
let mcXnameCache={len:-1, map:{}};   // reverse id→nombre de paleta, cacheado por tamaño de paleta
// Nombre del material de un id de bloque (lo que acepta setVoxel/tntMat). Prioriza el nombre de la paleta
// (name2id); si no, acorta la clave (asset:assets/roca.vox.json → roca; hab:like-water → like-water).
function mcMatName(id){
  if(!id) return '';
  if(mcXnameCache.len!==mc.blockKey.length){                                 // la paleta cambió → reconstruye el reverse
    const map={}; for(const nm in mc.name2id) map[mc.name2id[nm]]=nm;
    mcXnameCache={len:mc.blockKey.length, map};
  }
  return mcXnameCache.map[id] || String(mc.blockKey[id]||'').replace(/^asset:assets\//,'').replace(/^hab:/,'').replace(/\.vox\.json$/,'') || ('#'+id);
}
function mcUpdateXrayLabels(){
  const box=$('#mc-xray-labels'); if(!box) return;
  if(!mc.active || !mc.xray || !mc.grid){ if(!box.hidden) box.hidden=true; return; }
  box.hidden=false;
  const cv=mc.canvas, W=cv.clientWidth, H=cv.clientHeight;
  const pv=mat4.mul(mcProjMatrix().m, mcViewMatrix());
  const p=mc.pos, R=3, cx=Math.floor(p[0]), cy=Math.floor(p[1]), cz=Math.floor(p[2]);
  let n=0;
  // Coloca (o reutiliza del pool) una etiqueta de dos líneas (coords / material) en el punto de mundo (wx,wy,wz).
  // isStruct la tiñe como estructura (naranja, igual que su caja de rayos-X). Devuelve true si quedó en pantalla.
  function emit(wx,wy,wz, coText, matText, isStruct){
    const cw=pv[3]*wx+pv[7]*wy+pv[11]*wz+pv[15];
    if(cw<=0.01) return false;                                               // detrás de la cámara
    const ndx=(pv[0]*wx+pv[4]*wy+pv[8]*wz+pv[12])/cw, ndy=(pv[1]*wx+pv[5]*wy+pv[9]*wz+pv[13])/cw;
    if(ndx<-1.05||ndx>1.05||ndy<-1.05||ndy>1.05) return false;               // fuera de pantalla
    const sx=(ndx*0.5+0.5)*W, sy=(1-(ndy*0.5+0.5))*H;
    let el=mcXlbls[n];
    if(!el){ el=document.createElement('div'); el.className='mc-xlbl';
      el._c=document.createElement('span'); el._c.className='mc-xlbl-xyz';   // línea 1: coordenadas
      el._m=document.createElement('span'); el._m.className='mc-xlbl-mat';   // línea 2: nombre de material
      el.appendChild(el._c); el.appendChild(el._m); box.appendChild(el); mcXlbls[n]=el; }
    el.style.transform='translate('+sx.toFixed(1)+'px,'+sy.toFixed(1)+'px) translate(-50%,-50%)';
    if(el._c.textContent!==coText) el._c.textContent=coText;
    if(el._m.textContent!==matText) el._m.textContent=matText;
    el.classList.toggle('mc-xlbl-struct', !!isStruct);                       // el pool se comparte → refresca el marcador cada vez
    if(el.hidden) el.hidden=false; n++;
    return true;
  }
  // Bloques de rejilla del entorno.
  for(let x=cx-R;x<=cx+R;x++) for(let y=cy-1;y<=cy+3;y++) for(let z=cz-R;z<=cz+R;z++){
    if(mcInside(x,y,z) && mc.grid[mcIdx(x,y,z)]) emit(x+0.5,y+0.5,z+0.5, x+','+y+','+z, mcMatName(mc.grid[mcIdx(x,y,z)]), false);
  }
  // Estructuras finas cercanas: una etiqueta por instancia en el centro de su AABB (rayos-X ya dibuja su caja naranja).
  // La coord es su celda de origen y el «material» su clave cruda (hab:cristal / asset:…) — igual que la muestran los bloques.
  for(const s of mc.structures){
    const a=s.aabb; if(!a) continue;
    const mxc=(a[0]+a[3])/2, myc=(a[1]+a[4])/2, mzc=(a[2]+a[5])/2;
    if(Math.abs(mxc-p[0])>R+8 || Math.abs(mzc-p[2])>R+8) continue;           // solo el entorno (como los bloques)
    emit(mxc, myc, mzc, s.ox+','+s.oy+','+s.oz, String(s.key), true);
  }
  for(let i=n;i<mcXlbls.length;i++) if(!mcXlbls[i].hidden) mcXlbls[i].hidden=true;   // sobrantes ocultos
}
function mcXrayVolume(out){
  const p=mc.pos, R=3;
  const cx=Math.floor(p[0]), cy=Math.floor(p[1]), cz=Math.floor(p[2]);
  for(let x=cx-R;x<=cx+R;x++) for(let y=cy-1;y<=cy+3;y++) for(let z=cz-R;z<=cz+R;z++){
    if(mcInside(x,y,z) && mc.grid[mcIdx(x,y,z)]) mcPushBoxTris(out, x+0.03,y+0.03,z+0.03, x+0.97,y+0.97,z+0.97, 0.95,0.2,0.2);
  }
  if(mc.structures.length){
    const T=MC_TILE, HW=MC_HW*mc.scale, PH=MC_PH*mc.scale, M=0.35;   // AABB del jugador + margen
    const fx0=Math.floor((p[0]-HW-M)*T), fx1=Math.floor((p[0]+HW+M)*T);
    const fy0=Math.floor((p[1]-M)*T),    fy1=Math.floor((p[1]+PH+M)*T);
    const fz0=Math.floor((p[2]-HW-M)*T), fz1=Math.floor((p[2]+HW+M)*T);
    for(let x=fx0;x<=fx1;x++) for(let y=fy0;y<=fy1;y++) for(let z=fz0;z<=fz1;z++)
      if(mcFineSolidAt(x,y,z)) mcPushBoxTris(out, x/T,y/T,z/T, (x+1)/T,(y+1)/T,(z+1)/T, 1,0.55,0.1);
  }
}

// --- F5 · interacción: raycast del crosshair (DDA Amanatides–Woo) + romper/poner + hotbar ---
// Alcance efectivo de romper/poner: game.reach con un plus MUY suave por tamaño (raíz cúbica) y TOPE al doble
// del alcance base — así un gigante llega algo más lejos (brazos largos) pero NUNCA domina el mapa (lineal/√
// lo cruzaban de lado a lado). A escala 1 = mc.reach tal cual; el tope (×2) se alcanza hacia scale 8.
function mcReach(){ return mc.reach*Math.min(Math.cbrt(mc.scale), 2); }
function mcRaycast(maxd, hitStruct){   // desde el ojo, dirección de mirada; devuelve {cell,normal} del primer sólido a ≤ maxd bloques (def alcance escalado). hitStruct: una celda también cuenta si una estructura fina la ocupa (para apuntar/pegar a sus caras)
  const o=[mc.pos[0], mc.pos[1]+MC_EYE*mc.scale, mc.pos[2]], cp=Math.cos(mc.pitch);
  const d=[-Math.sin(mc.yaw)*cp, Math.sin(mc.pitch), -Math.cos(mc.yaw)*cp];
  let x=Math.floor(o[0]), y=Math.floor(o[1]), z=Math.floor(o[2]);
  const inf=1e9, MAXD=(maxd||mcReach());
  const sX=d[0]>0?1:-1, sY=d[1]>0?1:-1, sZ=d[2]>0?1:-1;
  const dX=d[0]!==0?Math.abs(1/d[0]):inf, dY=d[1]!==0?Math.abs(1/d[1]):inf, dZ=d[2]!==0?Math.abs(1/d[2]):inf;
  let tX=d[0]!==0?((d[0]>0?(x+1-o[0]):(o[0]-x))*dX):inf;
  let tY=d[1]!==0?((d[1]>0?(y+1-o[1]):(o[1]-y))*dY):inf;
  let tZ=d[2]!==0?((d[2]>0?(z+1-o[2]):(o[2]-z))*dZ):inf;
  let nx=0,ny=0,nz=0;
  const cap=Math.ceil(MAXD*3)+12;   // el DDA avanza ~1 bloque por eje/paso; cota holgada para el alcance
  for(let i=0;i<cap;i++){
    if(mcSolid(x,y,z) || (hitStruct && mcStructCellSolid(x,y,z))) return { cell:[x,y,z], normal:[nx,ny,nz] };
    if(tX<tY && tX<tZ){ if(tX>MAXD) break; x+=sX; tX+=dX; nx=-sX; ny=0; nz=0; }
    else if(tY<tZ){    if(tY>MAXD) break; y+=sY; tY+=dY; nx=0; ny=-sY; nz=0; }
    else {             if(tZ>MAXD) break; z+=sZ; tZ+=dZ; nx=0; ny=0; nz=-sZ; }
  }
  return null;
}
// ¿qué instancia de estructura ocupa el voxel fino de mundo (fx,fy,fz)? (busca en su malla cacheada)
function mcStructAt(px,py,pz){
  const T=MC_TILE, fx=Math.floor(px*T), fy=Math.floor(py*T), fz=Math.floor(pz*T);
  for(const s of mc.structures){
    const rr=mc.structs[s.key] && mc.structs[s.key].meshRot, g=rr && rr[s.rot|0]; if(!g||!g.bits) continue;
    const d=g.fdim, lx=fx-s.ox*T, ly=fy-s.oy*T, lz=fz-s.oz*T;
    if(lx<0||ly<0||lz<0||lx>=d[0]||ly>=d[1]||lz>=d[2]) continue;
    if(g.bits[(ly*d[2]+lz)*d[0]+lx]) return s;
  }
  return null;
}
// ¿alguna estructura fina ocupa ALGÚN voxel de la celda de bloque de mundo (x,y,z)? Para apuntar/pegar bloques a
// sus caras: trata la celda que contiene la estructura como sólida a nivel de bloque (no fino). Reusa mcFineBoxHit
// (recorte por AABB de cada estructura → barato para celdas lejos de cualquier estructura).
function mcStructCellSolid(x,y,z){
  if(!mc.structures.length || y<0) return false;
  const T=MC_TILE;
  return mcFineBoxHit(x*T, y*T, z*T, x*T+T-1, y*T+T-1, z*T+T-1);
}
// Re-malla TODAS las estructuras vivas (al cambiar game.structTextures): invalida la geometría fina cacheada
// (el modo de textura cambió), recompone el atlas y reconstruye las VBO de cada instancia. La colisión fina
// no necesita rehacerse: sondea el bitset de la malla cacheada de cada instancia viva.
async function mcRestampAll(){
  for(const k in mc.structs){ if(mc.structs[k]) mc.structs[k].meshRot={}; }
  const insts=mc.structures.slice();   // las instancias VIVAS siguen dibujándose mientras se re-hornean (no se liberan aún)
  await mcBuildStructAtlas();          // el atlas recolecta claves de las estructuras vivas (siguen en mc.structures)
  // emitCells de cada inst desde su geom CACHEADO (posición-independiente). Las instancias cargadas de disco son
  // {key,ox,oy,oz,rot} SIN emitCells, así que hay que poblarlo ANTES de la luz de bloque; si no, mcRecomputeHasGlow
  // da hasGlow=false → mcComputeBlockLight sale en 0 → las estructuras se horneaban a oscuras y solo se iluminaban
  // al re-estamparlas a mano (mcStampStruct forzaba hasGlow=true). mcStructGeom cachea en meshRot[rot], así que el
  // mcBuildStructMesh de abajo reutiliza el greedy (sin doble coste).
  for(const s of insts){ const g=await mcStructGeom(s.key, (s.rot|0)&15); s.emitCells=g.emitCells; s.emitDir=g.emitDir; }
  // Luz de bloque FRESCA antes de reconstruir → mcBuildStructMesh hornea la luz correcta por cara (corrige luz
  // estructura-sobre-estructura y post-edición). El terreno se re-malla al final por si el brillo cambió.
  mcRecomputeHasGlow(); mcComputeBlockLight();
  // Reconstruye cada instancia en un objeto NUEVO y solo entonces libera la vieja y la sustituye en su sitio: así
  // ninguna estructura desaparece del render mientras se re-hornea (evita el parpadeo de ~1s al colocar emisivos).
  for(const s of insts){
    const rebuilt=await mcBuildStructMesh(s.key, s.ox, s.oy, s.oz, s.rot);
    const j=mc.structures.indexOf(s);
    if(j>=0){ mcFreeStruct(s); mc.structures[j]=rebuilt; } else mcFreeStruct(rebuilt);   // se retiró mientras se reconstruía
  }
  mcMeshAll();   // el terreno vecino toma la luz de bloque de las estructuras (paredes encendidas)
}
// Retira una estructura entera (se estampó de una pieza → se borra de una pieza): libera su VBO y la saca
// de mc.structures (su colisión fina desaparece con ella: se sondea por instancia viva).
function mcRemoveStruct(s, quiet){
  const hadGlow=!!(s.emitCells&&s.emitCells.length);
  mcFreeStruct(s);
  const i=mc.structures.indexOf(s); if(i>=0) mc.structures.splice(i,1);
  if(hadGlow){ mcRecomputeHasGlow(); mcComputeBlockLight(); mcMeshAll(); }   // se fue una fuente: apagar paredes que encendía (terreno) y re-oscurecer estructuras vecinas requiere restamp aparte
  if(!quiet){ mcScheduleSave(); toast('Estructura retirada'); }
}
// --- Historial de edición (z=deshacer / Z=rehacer) ---
// Entradas: {t:'b',x,y,z,before,after} (bloque) · {t:'bb',edits:[{x,y,z,before,after}]} (pegado en bloque) · {t:'s+'|'s-', sp:{key,ox,oy,oz,rot}} (estampar/retirar estructura).
const MC_HIST_MAX=200;
function mcPushHist(en){ if(mc.histLock) return; mc.hist.push(en); if(mc.hist.length>MC_HIST_MAX) mc.hist.shift(); mc.histRedo.length=0; }
function mcFindStruct(sp){ return mc.structures.find(s=>s.key===sp.key && s.ox===sp.ox && s.oy===sp.oy && s.oz===sp.oz && (s.rot|0)===(sp.rot|0)); }
// Aplica una entrada en un sentido: forward=true reproduce la acción original; false su inversa. histLock evita re-registrar.
async function mcApplyHist(en, forward){
  mc.histLock=true;
  try{
    if(en.t==='b'){ const id=forward?en.after:en.before; mcSetBlock(en.x,en.y,en.z,id); mcRemeshAround(en.x,en.z); }
    else if(en.t==='bb'){ for(const e of en.edits) mcSetBlock(e.x,e.y,e.z, forward?e.after:e.before); mcMeshAll(); }   // pegado en bloque (Ctrl+V): deshace/rehace de una
    else { const add=((en.t==='s+')===forward);   // s+ hacia delante = estampar; s- hacia delante = retirar
      if(add) await mcStampStruct(en.sp.key, en.sp.ox, en.sp.oy, en.sp.oz, en.sp.rot, true);
      else { const s=mcFindStruct(en.sp); if(s) mcRemoveStruct(s, true); }
    }
  } finally { mc.histLock=false; }
  mcScheduleSave();
}
async function mcUndo(){ if(mc.histBusy) return; if(!mc.hist.length){ toast('Nada que deshacer'); return; }
  mc.histBusy=true; const en=mc.hist.pop();
  try{ await mcApplyHist(en, false); mc.histRedo.push(en); toast('Deshecho'); mcRevealHotbar(); } finally{ mc.histBusy=false; } }
async function mcRedo(){ if(mc.histBusy) return; if(!mc.histRedo.length){ toast('Nada que rehacer'); return; }
  mc.histBusy=true; const en=mc.histRedo.pop();
  try{ await mcApplyHist(en, true); mc.hist.push(en); toast('Rehecho'); mcRevealHotbar(); } finally{ mc.histBusy=false; } }
function mcBreak(){
  // Marcha fina desde el ojo: lo primero que toca gana. Una estructura se retira ENTERA; el terreno,
  // el bloque golpeado. Apuntar por un vano/ventana rompe el terreno de detrás (no hay voxel fino en medio).
  const o=[mc.pos[0], mc.pos[1]+MC_EYE*mc.scale, mc.pos[2]], cp=Math.cos(mc.pitch);
  const d=[-Math.sin(mc.yaw)*cp, Math.sin(mc.pitch), -Math.cos(mc.yaw)*cp];   // unitario ⇒ t = distancia en bloques
  const T=MC_TILE, MAXD=mcReach(), step=1/T;
  for(let t=step; t<=MAXD; t+=step){
    const px=o[0]+d[0]*t, py=o[1]+d[1]*t, pz=o[2]+d[2]*t;
    if(mc.structures.length && mcFineSolidAt(Math.floor(px*T),Math.floor(py*T),Math.floor(pz*T))){
      const s=mcStructAt(px,py,pz); if(s){ mcPushHist({t:'s-', sp:{key:s.key,ox:s.ox,oy:s.oy,oz:s.oz,rot:s.rot|0}}); mcRemoveStruct(s); return; }
    }
    const bx=Math.floor(px), by=Math.floor(py), bz=Math.floor(pz);
    if(by>=0 && mcSolid(bx,by,bz)){ const before=mc.grid[mcIdx(bx,by,bz)]; mcSetBlock(bx,by,bz,0); mcPushHist({t:'b',x:bx,y:by,z:bz,before,after:0}); mcRemeshAround(bx,bz); mcScheduleSave(); return; }
  }
}
// Cuarto de vuelta (0..3) para que el FRENTE de la sala mire al jugador: se toma de hacia dónde mira (yaw),
// ajustado a la dirección cardinal más cercana. Colocarla desde distintos lados la orienta distinto (ticket #3).
function mcPlace(){
  mcRevealHotbar();                       // colocar (bloque o estructura) trae la hotbar de vuelta
  const hit=mcRaycast(mcReach(), true); if(!hit) return;   // hitStruct: se puede pegar a las caras de una estructura fina (cristal/llama…), no solo al terreno
  const c=hit.cell, n=hit.normal, nx=c[0]+n[0], ny=c[1]+n[1], nz=c[2]+n[2];
  if(!mcInside(nx,ny,nz) || mcSolid(nx,ny,nz)) return;
  const sk=mc.slotStruct[mc.sel];
  if(sk){ const rot=mcPreviewOri(), o=mcStructOrigin(sk, nx, ny, nz, rot, n);     // orientación a mano (R giro / Shift+R vuelco); centro en suelo, canto en pared
    mcStampStruct(sk, o[0], o[1], o[2], rot); return; }           // ranura de estructura: estampa la habitación entera con la orientación elegida
  const id=mc.hotbar[mc.sel]; if(!id) return;
  mcSetBlock(nx,ny,nz,id);
  if(mcCollides(mc.pos[0],mc.pos[1],mc.pos[2])){ mcSetBlock(nx,ny,nz,0); return; } // no encajonar al jugador
  mcPushHist({t:'b',x:nx,y:ny,z:nz,before:0,after:id});
  mcRemeshAround(nx,nz); mcScheduleSave();
}
// game.playerTool 'paint': repinta el bloque APUNTADO con el bloque seleccionado (no crea uno nuevo al lado).
// Solo sobre terreno normal (las estructuras no son rejilla). No encajona: cambiar color no cambia el volumen.
function mcPaint(){
  const id=mc.hotbar[mc.sel]; if(!id) return;                 // pintar necesita un bloque normal en la ranura
  const hit=mcRaycast(); if(!hit) return;
  const c=hit.cell; if(c[1]<0 || !mcSolid(c[0],c[1],c[2])) return;
  const before=mc.grid[mcIdx(c[0],c[1],c[2])];
  if(before===id) return;                                     // ya es ese bloque
  mcSetBlock(c[0],c[1],c[2],id); mcPushHist({t:'b',x:c[0],y:c[1],z:c[2],before,after:id}); mcRemeshAround(c[0],c[2]); mcScheduleSave();
}
// Clic derecho: 'paint' repinta el bloque apuntado; 'build' (o ranura de estructura) pone al lado / estampa.
function mcUseRight(){ if(mc.tool==='paint' && !mc.slotStruct[mc.sel]) mcPaint(); else mcPlace(); }
// Acción de un botón de ratón (para el clic inicial y la repetición al mantener pulsado).
function mcDoAction(btn){
  if(mc.tool==='select'){ if(btn===0) mcSelectClick(); else if(btn===2) mcSelectClear(); mcRevealHotbar(); return; }   // Seleccionar: izq marca esquinas, dcho limpia (NO rompe/pone)
  if(btn===0) mcBreak(); else if(btn===2) mcUseRight(); mcRevealHotbar();   // dibujar/romper trae la hotbar de vuelta
}
// ── Herramienta Seleccionar (tool='select') ────────────────────────────────────────────────────────────
// Marca una CAJA de bloques del mundo con dos clics (esquina A, esquina B), la resalta y la copia a `clipboard`
// (Ctrl+C) en el formato del editor para pegarla (Ctrl+V) y trabajarla en la vista de edición 3D.
function mcSelectClick(){                                    // izq en modo Seleccionar: fija esquina A, luego B (= caja A→B)
  const hit=mcRaycast(); if(!hit) return;
  const c=hit.cell; if(c[1]<0 || !mcSolid(c[0],c[1],c[2])) return;   // apunta a un bloque sólido real (no al suelo infinito)
  if(!mc.selA){ mc.selA=c.slice(); mc.selBox=null; toast('Esquina A fijada — apunta a la opuesta y clic'); }
  else { mc.selBox={a:mc.selA.slice(), b:c.slice()}; mc.selA=null;
         const n=mcSelCount(); toast(n ? n+' bloque(s) — Ctrl+C para copiar' : 'Caja vacía (sin bloques)'); }
}
function mcSelectClear(){ if(mc.selA||mc.selBox){ mc.selA=null; mc.selBox=null; toast('Selección limpiada'); } }
// Recorre los bloques SÓLIDOS del mundo dentro de la caja confirmada, llamando fn(x,y,z,id).
function mcSelForEach(fn){
  const s=mc.selBox; if(!s) return;
  const x0=Math.min(s.a[0],s.b[0]), x1=Math.max(s.a[0],s.b[0]);
  const y0=Math.min(s.a[1],s.b[1]), y1=Math.max(s.a[1],s.b[1]);
  const z0=Math.min(s.a[2],s.b[2]), z1=Math.max(s.a[2],s.b[2]);
  for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++){
    if(!mcInside(x,y,z)) continue; const id=mc.grid[mcIdx(x,y,z)]; if(id) fn(x,y,z,id);
  }
}
function mcSelCount(){ let n=0; mcSelForEach(()=>n++); return n; }
// Ctrl+C: vuelca la caja seleccionada a `clipboard` (portapapeles global del editor). Cada bloque de mundo se
// convierte en un voxel `tex:`+clave, y se REMAPEAN los ejes al convenio del editor (importa igual que estampar,
// a la inversa): mundo-X→editor-X, mundo-Z(profundidad)→editor-Y, mundo-Y(altura)→editor-Z(capa). Así la pieza
// queda derecha en la vista 3D. gx/gy = punto de agarre (centro) en el plano X/Y del editor.
function mcCopySelection(){
  if(!mc.selBox){ toast(mc.tool==='select'?'Nada seleccionado (marca 2 esquinas)':'Usa la herramienta Seleccionar (P)'); return false; }
  let minx=Infinity,miny=Infinity,minz=Infinity, maxx=-Infinity,maxy=-Infinity; const raw=[];
  mcSelForEach((x,y,z,id)=>{ const key=mc.blockKey[id]; if(!key) return;
    raw.push({x,y,z,key});
    if(x<minx)minx=x; if(z<miny)miny=z; if(y<minz)minz=y;       // editor-X=mundo-x · editor-Y=mundo-z · editor-Z(capa)=mundo-y
    if(x>maxx)maxx=x; if(z>maxy)maxy=z;
  });
  if(!raw.length){ toast('Nada que copiar'); return false; }
  clipboard={ cells:raw.map(v=>({ dx:v.x-minx, dy:v.z-miny, dz:v.y-minz, c:'tex:'+v.key })),
              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  toast(raw.length+' bloque(s) copiados — Ctrl+V para pegar en el editor');
  return true;
}
// Ctrl+V dentro del Mundo: pega el portapapeles EN EL MAPA, apoyado en la cara apuntada (esquina min en la celda
// vacía adyacente, como colocar un bloque). El Mundo NO se cierra (se cierra a mano). Portapapeles del editor y del
// Mundo es el MISMO, así que sirve tanto para copiar aquí→pegar allí como para cortar en el editor 3D→pegar aquí.
// Reinvierte los ejes editor→mundo: editor-X→x, editor-Y→z(prof.), editor-Z(capa)→y(altura). Solo voxeles `tex:`
// (el mundo es texturado); los `#hex` no tienen bloque de mundo y se omiten (se avisa cuántos).
// El Mundo no tiene bloques de color puro: un voxel `#rrggbb` del editor se mapea al material EXISTENTE
// cuyo color representativo (texRepr) es el más parecido en RGB. Devuelve un id de mundo (1..N) o 0 si no hay ninguno.
function mcNearestMaterial(hex){
  const t=mcHexRGB(hex[0]==='*'?hex.slice(1):hex); let best=0, bd=Infinity;   // *#rrggbb = emisivo: quita el marcador para leer el RGB
  for(let id=1; id<mc.blockKey.length; id++){ const key=mc.blockKey[id]; if(!key) continue;
    const kc=(key[0]==='#'||key[0]==='*') ? key.replace(/^\*/,'') : texRepr(key);  // material de color puro o texturado
    const r=mcHexRGB(kc), d=(r[0]-t[0])**2+(r[1]-t[1])**2+(r[2]-t[2])**2;
    if(d<bd){ bd=d; best=id; } }
  return best;
}
// Tecla R con la herramienta Seleccionar y una caja marcada (sin ranura de estructura armada, ver abajo): gira los
// bloques de esa caja 90° en el plano horizontal (X/Z), igual que rotXY en el editor. Reutiliza mcRotXZ; el eje
// vertical (altura) no cambia. La caja se ancla por su esquina min (x0,z0) — si W≠D (no es cuadrada), el nuevo
// ancho/fondo cambia y la caja puede invadir celdas vecinas fuera de la selección original (igual que al rotar
// una estructura). mc.selBox se actualiza a la caja rotada para poder seguir girando o copiando lo mismo.
function mcRotateSelBox(){
  if(!mc.selBox) return false;
  const s=mc.selBox;
  const x0=Math.min(s.a[0],s.b[0]), x1=Math.max(s.a[0],s.b[0]);
  const y0=Math.min(s.a[1],s.b[1]), y1=Math.max(s.a[1],s.b[1]);
  const z0=Math.min(s.a[2],s.b[2]), z1=Math.max(s.a[2],s.b[2]);
  const W=x1-x0+1, H=y1-y0+1, D=z1-z0+1;
  const old=new mc.grid.constructor(W*H*D);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) for(let z=0;z<D;z++){
    const wx=x0+x, wz=z0+z;
    old[(y*W+x)*D+z]=mcInside(wx,y0+y,wz) ? mc.grid[mcIdx(wx,y0+y,wz)] : 0;
  }
  const nx1=x0+D-1, nz1=z0+W-1;                        // rot 90°: ancho↔fondo se intercambian
  const rotated=new Map();
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) for(let z=0;z<D;z++){
    const v=old[(y*W+x)*D+z]; if(!v) continue;         // 0 = aire, no hace falta anotarlo (se limpia por defecto)
    const [nx,nz]=mcRotXZ(x,z,1,W,D);
    rotated.set((x0+nx)+','+(y0+y)+','+(z0+nz), v);
  }
  const edits=[];
  for(let y=y0; y<=y1; y++)
    for(let x=x0; x<=Math.max(x1,nx1); x++)
      for(let z=z0; z<=Math.max(z1,nz1); z++){
        if(!mcInside(x,y,z)) continue;
        const inOld=x<=x1 && z<=z1, inNew=x<=nx1 && z<=nz1;
        if(!inOld && !inNew) continue;
        const after=rotated.get(x+','+y+','+z)||0;
        const before=mc.grid[mcIdx(x,y,z)];
        if(before===after) continue;
        mc.grid[mcIdx(x,y,z)]=after; edits.push({x,y,z,before,after});
      }
  if(!edits.length){ toast('Nada que rotar'); return false; }
  mcMeshAll(); mcPushHist({t:'bb', edits}); mcScheduleSave();
  mc.selBox={a:[x0,y0,z0], b:[nx1,y1,nz1]};
  toast('Selección rotada 90°');
  return true;
}
async function mcPasteWorld(){
  if(!clipboard || !clipboard.cells || !clipboard.cells.length){ toast('Nada que pegar (Ctrl+C/X primero)'); return; }
  const hit=mcRaycast(mcReach(), true); if(!hit){ toast('Apunta dónde pegar'); return; }
  const c=hit.cell, n=hit.normal, bx=c[0]+n[0], by=c[1]+n[1], bz=c[2]+n[2];   // celda vacía pegada a la cara = esquina min
  const keyId={}, colorId={}; let fellBack=0;
  for(const cel of clipboard.cells){ const v=cel.c;
    if(typeof v==='string' && v.slice(0,4)==='tex:'){ const key=v.slice(4);   // tex: → resuelve (o crea) su id de mundo
      if(!(key in keyId)) keyId[key]=await mcAddBlock(key); }
    else { const hx=String(v);                                               // color puro → material existente más parecido
      if(!(hx in colorId)) colorId[hx]=mcNearestMaterial(hx); }
  }
  const edits=[]; let minx=Infinity,miny=Infinity,minz=Infinity,maxx=-Infinity,maxy=-Infinity,maxz=-Infinity;
  for(const cel of clipboard.cells){ const v=cel.c;
    let id, isColor=false;
    if(typeof v==='string' && v.slice(0,4)==='tex:') id=keyId[v.slice(4)];
    else { id=colorId[String(v)]; isColor=true; }
    if(!id) continue;
    const wx=bx+cel.dx, wy=by+cel.dz, wz=bz+cel.dy;                            // editor(dx,dy,dz) → mundo(x, z, y)
    if(!mcInside(wx,wy,wz)) continue;
    if(wx<minx)minx=wx; if(wy<miny)miny=wy; if(wz<minz)minz=wz;                // caja de lo pegado, para dejarlo seleccionado
    if(wx>maxx)maxx=wx; if(wy>maxy)maxy=wy; if(wz>maxz)maxz=wz;
    const before=mc.grid[mcIdx(wx,wy,wz)]; if(before===id) continue;
    mc.grid[mcIdx(wx,wy,wz)]=id; edits.push({x:wx,y:wy,z:wz,before,after:id});
    if(isColor) fellBack++;
  }
  if(minx===Infinity){ toast('Nada colocado (fuera del mapa o sin material)'); return; }
  if(edits.length){ mcMeshAll(); mcPushHist({t:'bb', edits}); mcScheduleSave(); }
  mc.selBox={a:[minx,miny,minz], b:[maxx,maxy,maxz]}; mc.selA=null;            // deja lo pegado seleccionado: Ctrl+C / R (rotar) siguen operando sobre ello
  mcSetPlayerTool('select', false);
  toast((edits.length||'0')+' bloque(s) pegados y seleccionados'+(fellBack?' · '+fellBack+' de color al material más parecido':'')+' · R rota');
}
// --- t1 · notas post-it sobre un bloque ---
function mcNoteKey(c){ return c[0]+','+c[1]+','+c[2]; }
const MC_NOTE_MAX=280;                                  // tope de una nota (post-it, no un ensayo)
// Tecla N: abre el panel para el bloque apuntado (crea o edita). Como el editor libera el ratón, guarda la celda.
function mcOpenNote(){
  const hit=mcRaycast(mcReach()); if(!hit){ toast('Apunta a un bloque para anotarlo'); return; }
  mc.noteCell=hit.cell.slice();
  const k=mcNoteKey(hit.cell);
  const cur=mc.notes[k]||'';
  if(document.pointerLockElement===mc.canvas) document.exitPointerLock();   // suelta el ratón para poder escribir
  const ta=$('#mc-note-text'); ta.value=cur; ta.maxLength=MC_NOTE_MAX;
  $('#mc-note-del').hidden=!cur;                        // «Borrar» solo si ya había nota
  
  const hasTrace = (typeof game !== 'undefined' && game.noteTraces && (game.noteTraces[k] || game.noteTraces[hit.cell[0] + ',' + (hit.cell[1]-1) + ',' + hit.cell[2]] || game.noteTraces[hit.cell[0] + ',' + (hit.cell[1]+1) + ',' + hit.cell[2]]));
  const traceBtn = $('#mc-note-trace');
  if (traceBtn) traceBtn.hidden = !hasTrace;

  $('#mc-note').hidden=false; setTimeout(()=>{ ta.focus(); ta.select(); }, 0);
}
function mcCloseNote(){ $('#mc-note').hidden=true; mc.noteCell=null; }
function mcSaveNote(){
  if(mc.noteCell){ const k=mcNoteKey(mc.noteCell), txt=$('#mc-note-text').value.trim();
    if(txt){ mc.notes[k]=txt.slice(0,MC_NOTE_MAX); toast('Nota guardada'); }
    else if(mc.notes[k]){ delete mc.notes[k]; toast('Nota borrada'); }   // guardar en blanco = borrar
    mcScheduleSave();
  }
  mcCloseNote();
}
function mcDeleteNote(){ if(mc.noteCell){ delete mc.notes[mcNoteKey(mc.noteCell)]; mcScheduleSave(); toast('Nota borrada'); } mcCloseNote(); }

function mcShowTraceModal(){
  if(!mc.noteCell) return;
  const c = mc.noteCell.slice();
  mcCloseNote();
  const k = mcNoteKey(c);
  let trace = (typeof game !== 'undefined' && game.noteTraces) ? (game.noteTraces[k] || game.noteTraces[c[0] + ',' + (c[1]-1) + ',' + c[2]] || game.noteTraces[c[0] + ',' + (c[1]+1) + ',' + c[2]]) : null;
  
  if(!trace && typeof game !== 'undefined' && typeof game.traceNote === 'function'){
    trace = game.traceNote(c[0], c[1], c[2]);
  }

  const modal = $('#trace-modal');
  const content = $('#trace-content');
  if(!modal || !content) return;

  if(!trace){
    content.textContent = '❌ No hay traza histórica registrada para este bloque [' + k + '].';
  } else {
    let out = '=== TRAZA COMPLETA DE EJECUCIÓN DE NOTA: "' + trace.noteType + '" en [' + trace.pos + '] ===\n';
    out += 'Agente: ' + trace.agentName + ' (' + trace.agentId + ') | RunID: ' + trace.runId + ' | Emitida en Tick #' + trace.tick + '\n';
    out += 'Pila de Llamadas: ' + trace.callStack + '\n';
    out += 'Causa Declarada: ' + trace.cause + '\n';
    out += (trace.grid3x3 || '') + '\n\n';
    out += '--- HISTORIAL DE DECISIONES Y LLAMADAS DESDE EL INICIO (' + (trace.history ? trace.history.length : 0) + ' PASOS) ---\n';
    if(trace.history && trace.history.length){
      for(let i = 0; i < trace.history.length; i++){
        const h = trace.history[i];
        out += '[' + h.time + ' | Tick ' + String(h.tick).padStart(3, '0') + '] ' + String(h.action).padEnd(14) + ' Pos:[' + h.pos + '] Dir:[' + h.dir + '] ' + h.details + '\n';
      }
    }
    content.textContent = out;
  }
  modal.hidden = false;
}

function mcCloseTraceModal(){
  const modal = $('#trace-modal');
  if(modal) modal.hidden = true;
}

// OJO: navigator.clipboard SOLO existe en contexto seguro (HTTPS o localhost). El Mundo se sirve por HTTP
// plano en :8500, así que abriéndolo por IP desde otra máquina `navigator.clipboard` es undefined y leer
// .writeText lanzaba TypeError — el .catch() no lo cubría, porque el fallo es síncrono. Se cae a
// execCommand('copy'), que sí funciona sin contexto seguro, y en último término a la consola.
function mcCopyTraceText(){
  const content = $('#trace-content');
  const txt = content && content.textContent;
  if(!txt) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt)
      .then(()=>{ toast('📋 Traza copiada al portapapeles'); })
      .catch(()=>{ mcCopyFallback(txt); });
    return;
  }
  mcCopyFallback(txt);
}
function mcCopyFallback(txt){
  try{
    const ta=document.createElement('textarea');
    ta.value=txt; ta.style.position='fixed'; ta.style.top='-1000px'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    if(ok){ toast('📋 Traza copiada al portapapeles'); return; }
  }catch(e){}
  console.log(txt);
  toast('Traza volcada a la consola F12');
}
// Al mirar un bloque con nota (jugando), muestra su texto bajo la mira; si no, oculta el visor.
function mcUpdateNoteView(){
  const el=$('#mc-noteview'); if(!el) return;
  if(!mc.active || document.pointerLockElement!==mc.canvas || !$('#mc-note').hidden){ el.hidden=true; return; }
  const hit = Object.keys(mc.notes).length ? mcRaycast(mcReach()) : null;
  const txt = hit ? mc.notes[mcNoteKey(hit.cell)] : null;
  if(txt){ if(el.textContent!==txt) el.textContent=txt; el.hidden=false; } else el.hidden=true;
}
// Estampa una habitación como MALLA DE SUS VOXELES FINOS (no cubos): construye la malla en (ox,oy,oz) y
// la añade a mc.structures (el render la dibuja; la colisión fina sondea el bitset de su malla cacheada →
// se camina por el interior y los vanos). No toca la paleta ni mc.grid, así el terreno
// alrededor queda intacto. quiet=true al re-hornear desde disco.
// Claves de textura (tex:) distintas usadas por una sala (para saber si el atlas de estructuras debe crecer).
async function mcStructTexKeys(srcKey){
  let doc; try{ doc=await getRoomData(srcKey); }catch(e){ return []; }
  const vox=doc.voxels||{}, out=new Set();
  for(const k in vox){ const v=vox[k]; if(typeof v==='string' && v.slice(0,4)==='tex:') out.add(v.slice(4)); }
  return [...out];
}
async function mcStampStruct(srcKey, ox, oy, oz, rot, quiet){
  rot=(rot|0)&15;                       // orientación combinada (yaw + vuelco); ver mcStructGeom
  const s={key:srcKey, ox,oy,oz, rot, colVbo:null, colCount:0, alphaVbo:null, alphaCount:0, texVbo:null, texCount:0, aabb:[ox,oy,oz,ox,oy,oz]};
  mc.structures.push(s);                                        // en la lista ya (el render la ignora sin malla; el atlas la ve)
  // ¿aparece alguna clave tex: nueva? ⇒ recomponer el atlas de estructuras y re-mallar TODO (las UV cambian de fila),
  // como el terreno remesha al crecer su atlas. Solo importa con textureado activo (si no, van al flujo de color).
  const keys=await mcStructTexKeys(srcKey);
  const grow=mc.structTextures!==false && keys.some(k=>!(mc.structUV && mc.structUV[k]));
  if(grow){
    await mcRestampAll();                                       // recompone atlas (ya incluye la nueva) + re-malla todas (ya recomputa luz de bloque)
  } else {
    Object.assign(s, await mcBuildStructMesh(srcKey, ox, oy, oz, rot));   // cachea también el bitset de colisión fina
    if(s.emitCells && s.emitCells.length){                      // la nueva estructura tiene voxeles emisivos:
      mc.hasGlow=true; mcComputeBlockLight();                   // …enciende su luz de bloque…
      if(mc.structures.length>1) await mcRestampAll(); else mcMeshAll();   // …y re-oscurece/ilumina terreno (y estructuras vecinas vía restamp)
    }
  }
  const rec=await mcStructCells(srcKey);
  if(!quiet){ mcPushHist({t:'s+', sp:{key:srcKey,ox,oy,oz,rot}}); mcUnstick(); mcScheduleSave(); toast('Estructura colocada · '+rec.count+' celdas'); }
}
const MC_SLOTS=9;                                     // ranuras de la hotbar (teclas 1-9)
// Pinta las 9 ranuras desde mc.hotbar (id de bloque, 0=vacía). Clic izq: vacía→selector, llena→seleccionar;
// clic der: abre el selector (cambiar). NO fija mc.hotbar (eso lo hace openWorld al restaurar el loadout).
function mcBuildHotbar(){
  const bar=$('#mc-hotbar'); if(!bar) return; bar.innerHTML='';
  for(let i=0;i<MC_SLOTS;i++){
    const id=mc.hotbar[i]|0, b=id?mc.blocks[id-1]:null;
    const slot=document.createElement('div');
    slot.className='mc-slot'+(i===mc.sel?' is-active':'')+(b?'':' empty');
    slot.title=b?b.name:'Vacía · clic para elegir de la galería';
    const cv=document.createElement('canvas'); cv.width=cv.height=MC_TILE;
    const cx=cv.getContext('2d'); cx.imageSmoothingEnabled=false;
    if(b && mc.atlas) cx.drawImage(mc.atlas, 0, (id-1)*MC_TILE, MC_TILE, MC_TILE, 0,0, MC_TILE,MC_TILE); // cara superior
    slot.appendChild(cv);
    const key=document.createElement('span'); key.className='mc-slot-key'; key.textContent=(i+1); slot.appendChild(key);
    slot.onclick=()=>{ if(mc.hotbar[i]){ mc.sel=i; mcSelectSlot(); } else mcOpenPicker(i); };
    slot.oncontextmenu=e=>{ e.preventDefault(); mcOpenPicker(i); };
    bar.appendChild(slot);
  }
}
function mcSelectSlot(){ [...$('#mc-hotbar').children].forEach((s,i)=>s.classList.toggle('is-active',i===mc.sel)); mcRevealHotbar(); }
// La hotbar se OCULTA (se hunde abajo desvaneciéndose) tras correr bastante sin dibujar —«modo carrera»— y
// REEMERGE desde abajo (transparente → su sitio) al detenerse y mover el ratón, al dibujar o al cambiar de ranura.
function mcRevealHotbar(){ mc.hbTarget=1; mc.hbRunDist=0; }   // la trae de vuelta y reinicia la distancia de carrera
function mcUpdateHotbar(dt){
  const el=mc.hbEl || (mc.hbEl=$('#mc-hotbar')); if(!el) return;
  const hide=(typeof game!=='undefined' && game.hotbarHide)|0;   // 0 = función desactivada por consola (game.hotbarHide=0)
  if(hide>0){
    const sp=Math.hypot(mc.vel[0], mc.vel[2]);                   // velocidad horizontal (bloques/s)
    if(sp>0.6){ mc.hbRunDist+=sp*dt; if(mc.hbRunDist>hide) mc.hbTarget=0; }   // corriendo: acumula; al pasar el umbral, oculta
  } else mc.hbTarget=1;
  const s=mc.hotbarShown + (mc.hbTarget-mc.hotbarShown)*Math.min(1,dt*7);     // suaviza hacia el objetivo
  mc.hotbarShown = Math.abs(s-mc.hbTarget)<0.001 ? mc.hbTarget : s;
  const drop=(el.offsetHeight||52)+24;                                        // px para hundirla bajo el borde inferior
  el.style.transform='translateX(-50%) translateY('+((1-mc.hotbarShown)*drop).toFixed(1)+'px)';
  el.style.opacity=mc.hotbarShown.toFixed(3);
  el.style.pointerEvents=mc.hotbarShown<0.05?'none':'';
}
// Guarda/restaura el loadout (qué bloque hay en cada ranura) por su key, para que sobreviva a recargas.
function mcSaveLoadout(){ try{
  localStorage.setItem('vf_mcHotbar', JSON.stringify(mc.hotbar.map(id=>id?mc.blockKey[id]:null)));
  localStorage.setItem('vf_mcSlotStruct', JSON.stringify(Array.from({length:MC_SLOTS},(_,i)=>mc.slotStruct[i]||null)));
}catch(e){} }
function mcLoadoutKeys(){ try{ const a=JSON.parse(localStorage.getItem('vf_mcHotbar')); if(Array.isArray(a)) return a; }catch(e){} return null; }
function mcSlotStructKeys(){ try{ const a=JSON.parse(localStorage.getItem('vf_mcSlotStruct')); if(Array.isArray(a)) return a; }catch(e){} return null; }

// --- Selector de galería para la hotbar (calca buildRoomCatalog/openPicker del Mapa) ---
// Catálogo = bloques (type:bloque) + texturas (type:textura), assets + guardados.
async function mcBuildCatalog(){
  const cat=[];
  try{ const idx=await fetch('assets/index.json',{cache:'no-store'}).then(r=>r.json());
    idx.filter(a=>a.type==='bloque'||a.type==='textura').forEach(a=>cat.push({key:'asset:'+a.file, name:a.name, icon:a.icon||(a.type==='textura'?'🎨':'🏠'), badge:a.type})); }catch(e){}
  try{ (await apiHabitantes()).filter(h=>h.type==='bloque'||h.type==='textura').forEach(h=>cat.push({key:'hab:'+h.id, name:h.name, icon:h.icon||(h.type==='textura'?'🎨':'🏠'), badge:'guardada'})); }catch(e){}
  mc.catalog=cat; return cat;
}
async function mcOpenPicker(slot){
  mc.pickSlot=slot;
  if(document.pointerLockElement===mc.canvas) document.exitPointerLock();       // liberar el ratón para poder elegir
  const pk=$('#mc-picker'), g=$('#mc-picker-grid');
  $('#mc-picker-title').textContent='Bloque o textura · ranura '+(slot+1);
  g.innerHTML='<p class="hab-empty">Cargando galería…</p>';
  pk.hidden=false;
  if(!mc.catalog) try{ await mcBuildCatalog(); }catch(e){}
  g.innerHTML='';
  (mc.catalog||[]).forEach(c=>{
    const o=document.createElement('div'); o.className='mapa-opt';
    o.innerHTML=`<div class="mo-thumb"><canvas width="120" height="120"></canvas></div>`+
                `<div class="mo-name">${c.icon} ${esc(c.name)}</div><div class="mo-badge">${c.badge}</div>`;
    getRoomData(c.key).then(d=>drawThumb(o.querySelector('canvas'),d)).catch(()=>{});
    // Si el ítem es una ESTRUCTURA (habitación de varios bloques), el badge muestra de cuántos se compone.
    mcStructCells(c.key).then(rec=>{ if(rec.w>1||rec.h>1||rec.d>1){ const bd=o.querySelector('.mo-badge'); if(bd) bd.textContent=rec.count+' bloques'; } }).catch(()=>{});
    o.onclick=()=>mcAssignSlot(slot,c.key,c.name);
    g.appendChild(o);
  });
  if(!mc.catalog||!mc.catalog.length) g.innerHTML='<p class="hab-empty">No hay bloques ni texturas en la galería.</p>';
  $('#mc-picker-remove').hidden=!mc.hotbar[slot];
}
function mcClosePicker(){ $('#mc-picker').hidden=true; mc.pickSlot=-1; }
async function mcAssignSlot(slot,key,name){
  const id=await mcAddBlock(key,name);                 // apenda a la paleta si hace falta (atlas se reconstruye); sirve de icono
  mc.hotbar[slot]=id; mc.sel=slot;
  const rec=await mcStructCells(key);                  // ¿bloque de terreno macizo 16³ o estructura fina (objeto/sala)?
  mc.slotStruct[slot]=rec.blockLike?null:key;          // solo un 16³ COMPLETO es bloque suelto; lo demás va como voxeles reales
  mcBuildHotbar(); mcSelectSlot(); mcSaveLoadout(); mcClosePicker();
  mcRelock();                                          // elegir un bloque devuelve el foco (pointer-lock) al juego
}
function mcRemoveSlot(){
  if(mc.pickSlot<0) return;
  mc.hotbar[mc.pickSlot]=0; mc.slotStruct[mc.pickSlot]=null;
  mcBuildHotbar(); mcSaveLoadout(); mcClosePicker();
  mcRelock();
}
// Recaptura el ratón para el Mundo. Se llama tras cerrar el selector por una ACCIÓN (elegir/vaciar), no por Esc
// —donde el usuario quiere el ratón libre—. El clic del ítem es gesto de usuario, así que el navegador lo permite.
// requestPointerLock() devuelve una PROMESA que rechaza (SecurityError «cannot be acquired immediately after user
// has exited lock») si se pide dentro del enfriamiento tras salir del lock; el try/catch síncrono NO la captura →
// "Uncaught (in promise)". mcLockPointer() traga ese rechazo: el ratón se capturará en el siguiente clic/tecla.
function mcLockPointer(){ if(!mc.active || document.pointerLockElement===mc.canvas) return;
  try{ const p=mc.canvas.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }
function mcRelock(){ mcLockPointer(); }                // elegir un bloque/estructura devuelve el foco al juego

// --- F6 · persistencia en el servidor (/api/mundo) ---
// Mapa elegido por URL: /map/<nombre> selecciona un mundo persistente propio; sin /map/ (o /map/default) = el
// mundo «sagrado» de siempre. mcWorldUrl() añade ?map=<nombre> a /api/mundo para cargar/guardar ESE mundo.
function mcMapName(){ const m=location.pathname.match(/^\/map\/([^\/?#]+)/); return m ? decodeURIComponent(m[1]) : 'default'; }
function mcWorldUrl(){ const n=mcMapName(); return (n && n.toLowerCase()!=='default') ? '/api/mundo?map='+encodeURIComponent(n) : '/api/mundo'; }
// Serializa la rejilla densa a mapa disperso autocontenido (como el editor). Los bloques son todos assets
// servidos (asset:…) → no hace falta embeber texturas.
function mcSerialize(){
  const dim=mc.dim, g=mc.grid, vox={};
  for(let z=0;z<dim.z;z++) for(let y=0;y<dim.y;y++) for(let x=0;x<dim.x;x++){
    const id=g[mcIdx(x,y,z)]; if(!id) continue;
    vox[x+','+y+','+z]='tex:'+mc.blockKey[id];
  }
  const structures=mc.structures.map(s=>({key:s.key, x:s.ox, y:s.oy, z:s.oz, rot:s.rot|0}));   // estructuras: sala + posición + giro (se re-mallan al cargar)
  return { format:'voxelworld-1', dim:{x:dim.x,y:dim.y,z:dim.z}, spawn:mc.spawn, voxels:vox, structures, notes:{...mc.notes} };   // t1 · notas post-it "x,y,z"→texto
}
function mcBake(doc){                          // hornea un mundo guardado a la rejilla densa + meshes
  if(mc.agents.size){ mcStopAgents('mapa recargado'); for(const a of mc.agents.values()) mcAgentFreeMesh(a); mc.agents.clear(); }   // otro mundo = otra rejilla
  const d=doc.dim||{}; mc.dim={x:(d.x|0)||96, y:(d.y|0)||40, z:(d.z|0)||96};
  mcClearStructures();
  mc.grid=new Uint16Array(mc.dim.x*mc.dim.y*mc.dim.z);
  const key2id={}; for(let id=1;id<mc.blockKey.length;id++) key2id[mc.blockKey[id]]=id;
  const vox=doc.voxels||{};
  for(const k in vox){
    const val=vox[k]; if(typeof val!=='string' || val.slice(0,4)!=='tex:') continue;
    const id=key2id[val.slice(4)]; if(!id) continue;             // bloque fuera de la paleta actual → se ignora
    const p=k.split(','), x=+p[0], y=+p[1], z=+p[2];
    if(mcInside(x,y,z)) mc.grid[mcIdx(x,y,z)]=id;
  }
  const s=doc.spawn||{x:mc.dim.x>>1, y:15, z:mc.dim.z>>1};
  mc.spawn=s; mc.pos=[s.x+0.5, s.y, s.z+0.5]; mc.vel=[0,0,0]; mc.onGround=false;
  // t1 · notas: solo pares "x,y,z"→texto dentro de los límites (una nota sobre un bloque que ya no existe se conserva igual: es del bloque, no exige sólido)
  mc.notes={}; const dn=doc.notes; if(dn && typeof dn==='object') for(const k in dn){ const p=k.split(','); if(p.length===3 && typeof dn[k]==='string') mc.notes[k]=dn[k]; }
  mcMeshAll();
  // re-hornear estructuras (malla fina) — apila las instancias y deja que mcRestampAll componga el atlas UNA vez
  // y malle todo (evita la carrera de estampar N a la vez, cada una recomponiendo el atlas). El render las dibuja
  // en cuanto están listas.
  for(const st of (doc.structures||[])){ if(st&&st.key)
    mc.structures.push({key:st.key, ox:st.x|0, oy:st.y|0, oz:st.z|0, rot:(st.rot|0)&15, colVbo:null, colCount:0, alphaVbo:null, alphaCount:0, texVbo:null, texCount:0, aabb:[st.x|0,st.y|0,st.z|0,st.x|0,st.y|0,st.z|0]}); }
  if(mc.structures.length) mcRestampAll().then(mcForceUnstick);   // al terminar de mallar, sácalo si una sala cayó sobre el spawn (p.ej. escala grande la última vez)
}
// game.reloadWorld() · recarga el mundo desde el servidor SIN teletransportar: re-hornea /api/mundo pero
// conserva tu posición/mirada/velocidad. Útil para ver cambios guardados por otra vía (edición del fichero,
// otra pestaña) sin volver al spawn. mcBake reubica al spawn, así que guardamos y restauramos tu sitio.
async function mcReloadWorld(){
  if(!mc.active){ toast('Abre el Mundo primero'); return; }
  let doc=null;
  try{ doc=await fetch(mcWorldUrl(),{cache:'no-store'}).then(r=>r.json()); }catch(e){}
  if(!doc || !doc.voxels){ toast('No se pudo recargar el mundo'); return; }
  // claves nuevas en el guardado ⇒ amplía la lista de bloques y recompón paleta/atlas (si no, mcBake las ignora)
  let grew=false;
  for(const v of Object.values(doc.voxels)){ const k=String(v).replace(/^tex:/,'');
    if(k && !mc.blocks.some(b=>b.key===k)){ mc.blocks.push({name:k, key:k}); grew=true; } }
  if(grew){ await mcBuildPalette(); mcUploadAtlas(); }
  const pos=mc.pos.slice(), vel=mc.vel.slice(), yaw=mc.yaw, pitch=mc.pitch, onG=mc.onGround;   // dónde estás ahora
  mcBake(doc);                                                                                  // re-hornea (reubicaría al spawn…)
  mc.pos=pos; mc.vel=vel; mc.yaw=yaw; mc.pitch=pitch; mc.onGround=onG;                           // …pero te devolvemos a tu sitio
  toast('Mundo recargado (sin mover)');
}
game.reloadWorld=mcReloadWorld;
// Desglose de la última carga del Mundo: en qué se fue el tiempo bajo «Preparando bloques…» y compañía.
game.loadReport=mcLoadReport;
// game.mapName = nombre del mapa actual (de la URL /map/<nombre>; 'default' = mundo sagrado).
Object.defineProperty(game,'mapName',{ enumerable:true, get:()=>mcMapName() });
// game.map('loquesea') navega a otro mundo persistente (recarga en /map/loquesea; sin arg = nombre actual).
// El nombre se acota a [a-z0-9-]; 'default' (o vacío) vuelve al mundo de siempre.
game.map=function(name){ if(name==null) return mcMapName();
  const s=String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  location.href = (!s||s==='default') ? '/' : '/map/'+s; };
// game.wipeMap([nombre][,true]) · BORRA todos los bloques de un mapa y lo deja como VACÍO TOTAL (sin suelo, ni un voxel).
// La GARANTÍA de borrar el mapa correcto: NO usa setVoxel (que según el Mundo esté abierto o no editaría el objeto
// del editor, no el mapa); escribe directo en el servidor apuntando al mapa por NOMBRE explícito — sin arg = el de la
// URL /map/<n> (o 'default'). Funciona con el Mundo abierto o cerrado (consola o snippet). Reversible: el servidor
// respalda el mundo anterior en la papelera (data/habitantes_trash) antes de sobrescribir. Pide confirmación salvo
// que pases true como 2º argumento. Ejemplos: game.wipeMap()  ·  game.wipeMap('loquesea')  ·  game.wipeMap('loquesea',true)
game.wipeMap=async function(name, force){
  const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const shown=(name!=null && String(name).trim()!=='') ? (slug(name)||'default') : (mcMapName()||'default');
  if(!force && !confirm('¿Borrar TODOS los bloques del mapa «'+shown+'»?\nQuedará VACÍO TOTAL (sin suelo). El mundo anterior se respalda en la papelera del servidor.')){ console.log('[wipeMap] cancelado'); return false; }
  const url=(shown && shown!=='default') ? '/api/mundo?map='+encodeURIComponent(shown) : '/api/mundo';
  let dim=null; try{ const cur=await fetch(url,{cache:'no-store'}).then(r=>r.json()); dim=cur&&cur.dim; }catch(e){}
  try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ dim: dim||{x:96,y:40,z:96}, voxels:{}, notes:{} })}); if(!r.ok) throw 0; }
  catch(e){ console.error('[wipeMap] no se pudo guardar'); toast('No se pudo borrar el mapa'); return false; }
  console.log('[wipeMap] mapa «'+shown+'» borrado → vacío total (sin suelo).');
  toast('Mapa «'+shown+'» borrado');
  // Si es el mapa que tienes cargado AHORA en el Mundo, refréscalo en vivo a vacío total (mcBake con voxels:{} = rejilla vacía, sin suelo).
  if(mc.active && mc.grid && (mcMapName()||'default')===shown){ mcBake({dim: dim||mc.dim, voxels:{}, notes:{}}); }   // mcBake malla solo (mcMeshAll interno)
  return true;
};
// game.buildTerrain() · REGENERA el terreno plano por defecto (hierba Y=14, tierra Y=11..13, roca Y=0..10).
game.buildTerrain=function(){
  if(typeof mcGenFlat==='function' && typeof mcMeshAll==='function'){
    mcGenFlat();
    mcMeshAll();
    if(typeof mcScheduleSave==='function') mcScheduleSave();
    toast('🌱 Terreno por defecto regenerado');
    console.log('[game.buildTerrain] Terreno plano por defecto regenerado con éxito.');
    return true;
  }
  console.error('[game.buildTerrain] Motor 3D no listo.');
  return false;
};
// game.tp(x,y,z) · salta a esas coordenadas de mundo (pies sobre el bloque; si el destino es sólido —p.ej. un
// tronco— mcUnstick sube al primer hueco de aire). Conserva la mirada. game.notes()/game.gotoNote(i) para las notas.
function mcTeleport(x,y,z){
  if(!mc.active){ toast('Abre el Mundo primero'); return false; }
  x=Math.floor(x); y=Math.floor(y); z=Math.floor(z);
  if(x<0||x>=mc.dim.x||z<0||z>=mc.dim.z){ toast('Fuera del mundo'); return false; }
  mc.pos=[x+0.5, y+1, z+0.5]; mc.vel=[0,0,0]; mc.onGround=false;
  mcUnstick();                                       // si caes dentro de sólido, sube al aire
  toast('Saltaste a '+x+','+y+','+z);
  return true;
}
game.tp=mcTeleport;
// game.aim([alcance]) · devuelve [x,y,z] del bloque al que apunta la mira (crosshair), pensado para scripts:
//   throwAndExplodeTNT(...game.aim(), {radius:8})
// Si no hay sólido en el alcance (miras al cielo), devuelve el punto en el aire a `alcance` bloques delante
// (así el spread nunca rompe). Alcance por defecto 64 bloques (más largo que romper/poner, para apuntar lejos).
game.aim=function(alcance){
  if(!mc.active||!mc.grid){ console.warn('game.aim: abre el Mundo (🌍) primero'); return null; }
  const d=+alcance>0?+alcance:64, h=mcRaycast(d);
  if(h) return h.cell.slice();                         // bloque sólido apuntado
  const cp=Math.cos(mc.pitch), dir=[-Math.sin(mc.yaw)*cp, Math.sin(mc.pitch), -Math.cos(mc.yaw)*cp];
  const o=[mc.pos[0], mc.pos[1]+MC_EYE*mc.scale, mc.pos[2]];
  return [Math.floor(o[0]+dir[0]*d), Math.floor(o[1]+dir[1]*d), Math.floor(o[2]+dir[2]*d)];
};
// game.notes() · tabla de las notas post-it del mundo ("x,y,z" → texto) para copiar coords a game.tp / game.gotoNote.
game.notes=function(){
  const ks=Object.keys(mc.notes);
  if(!ks.length){ console.log('(sin notas)'); return []; }
  const rows=ks.map((k,i)=>({ '#':i, coords:k, texto:mc.notes[k] }));
  console.table(rows); return rows;
};
// game.gotoNote(i) · salta a la nota nº i (0 por defecto; ver los índices con game.notes()).
game.gotoNote=function(i){
  const ks=Object.keys(mc.notes);
  if(!ks.length){ toast('No hay notas'); return false; }
  i=i|0; if(i<0||i>=ks.length){ toast('No existe la nota '+i); return false; }
  const [x,y,z]=ks[i].split(',').map(Number);
  return mcTeleport(x,y,z);
};
// ── setVoxel(x,y,z,material): puente para scripts de construcción por consola ──────────────────────────
const MC_MAT_ALIAS={ stone:'asset:assets/roca.vox.json', smooth_stone:'asset:assets/adoquin.vox.json',
  cobblestone:'asset:assets/adoquin.vox.json', mossy_cobblestone:'asset:assets/musgo_adoquin.vox.json',
  stone_bricks:'asset:assets/ladrillo.vox.json', bricks:'asset:assets/ladrillo.vox.json',
  sandstone:'asset:assets/arenisca.vox.json', dirt:'asset:assets/tierra.vox.json',
  grass:'asset:assets/hierba.vox.json', wood:'asset:assets/tablones.vox.json',
  planks:'asset:assets/tablones.vox.json', sand:'asset:assets/arena.vox.json',
  log:'asset:assets/tronco.vox.json', obsidian:'asset:assets/obsidiana.vox.json',
  red_concrete:'asset:assets/red_concrete.vox.json', red_concrete_block:'asset:assets/red_concrete.vox.json' };
let mcMat2id={}, mcWarnedMat={};                    // caché material→id de la ráfaga + avisos ya dados

function mcResolveMat(material){
  if(material===0||material==null||material===false) return 0;   // aire: setVoxel(x,y,z,0/null) ROMPE el bloque (explosiones)
  if(typeof material==='number') return (material>0 && material<mc.blockKey.length)?material:(mc.name2id['roca']||1);
  const m=String(material==null?'':material).trim();
  if(m==='' || m.toLowerCase()==='air' || m.toLowerCase()==='aire') return 0;   // alias de aire por nombre
  if(m in mcMat2id) return mcMat2id[m];
  const mLow = m.toLowerCase();
  let key = MC_MAT_ALIAS[mLow] || (mc.name2id[m]?mc.blockKey[mc.name2id[m]]:null);
  if(!key && mcAssetsRegistry[mLow]) key = 'asset:' + mcAssetsRegistry[mLow];
  if(!key && mcAssetsRegistry[mLow.replace(/\s+/g, '_')]) key = 'asset:' + mcAssetsRegistry[mLow.replace(/\s+/g, '_')];
  if(!key) key = m;
  let id = mc.blockKey.indexOf(key); if(id<1) id = mc.name2id[m] || mc.name2id[mLow] || -1;
  if(id<1){                                          // desconocido (p.ej. '#hex' no aplica al terreno) → roca + aviso 1 vez
    if(!mcWarnedMat[m]){ console.warn('setVoxel: material desconocido "'+m+'" → uso roca. Precarga texturas con game.addMaterial("'+m+'") o usa un nombre de la paleta.'); mcWarnedMat[m]=true; }
    id=mc.name2id['roca']||1;
  }
  mcMat2id[m]=id; return id;
}
let mcBuildT=0, mcBuildN=0;
function mcFlushBuild(){ mcBuildT=0; mcMeshAll(); if(mc.active) mcUnstick(); mcScheduleSave();
  toast('setVoxel: '+mcBuildN+' bloques colocados'); mcBuildN=0; mcMat2id={}; }
function mcSetVoxel(x,y,z,material){
  if(!mc.grid){ console.warn('setVoxel: abre el Mundo (🌍) primero'); return false; }
  x=Math.round(x); y=Math.round(y); z=Math.round(z);
  if(!mcInside(x,y,z)) return false;                 // fuera de límites: se ignora sin romper el script
  mcSetBlock(x,y,z, mcResolveMat(material)); mcBuildN++;
  // En modo lote (beginBatch/endBatch) NO se re-malla por bloque; endBatch() dispara un único mcFlushBuild al cerrar.
  if(!mc.batching){ clearTimeout(mcBuildT); mcBuildT=setTimeout(mcFlushBuild, 80); }   // re-malla+guarda una vez al acabar la ráfaga
  return true;
}
function mcGetVoxel(x,y,z){
  if(!mc.grid) return 0;
  x=Math.round(x); y=Math.round(y); z=Math.round(z);
  if(!mcInside(x,y,z)) return 0;                     // fuera de límites = aire para el script
  return mc.grid[mcIdx(x,y,z)] || 0;                 // 0 = aire
}
let mcBatchDepth=0;
function mcBeginBatch(){ mcBatchDepth++; mc.batching=true; clearTimeout(mcBuildT); mcBuildT=0; }
function mcEndBatch(){
  if(mcBatchDepth>0) mcBatchDepth--;
  if(mcBatchDepth>0) return;                          // seguimos dentro de un lote exterior
  mc.batching=false;
  clearTimeout(mcBuildT); mcBuildT=0;
  if(mcBuildN>0) mcFlushBuild();                      // un único re-mallado + guardado de toda la ráfaga
}
const _editSetVoxel=setVoxel;
window.setVoxel=(x,y,z,c)=> (mc && mc.active && mc.grid) ? mcSetVoxel(x,y,z,c) : _editSetVoxel(x,y,z,c);
game.setVoxel=window.setVoxel;
game.getVoxel=mcGetVoxel;
window.beginBatch=mcBeginBatch; game.beginBatch=mcBeginBatch;
window.endBatch=mcEndBatch; game.endBatch=mcEndBatch;
game.addMaterial=async function(key,name){
  let realKey = String(key||'').trim();
  const kLow = realKey.toLowerCase();
  if(mcAssetsRegistry[kLow]){
    realKey = 'asset:' + mcAssetsRegistry[kLow];
  } else if(mcAssetsRegistry[kLow.replace(/\s+/g, '_')]){
    realKey = 'asset:' + mcAssetsRegistry[kLow.replace(/\s+/g, '_')];
  } else if(!realKey.startsWith('asset:') && !realKey.endsWith('.json')){
    const found = MC_MAT_ALIAS[kLow];
    if(found) realKey = found;
  }
  const id=await mcAddBlock(realKey, name||key);
  mcMat2id={};
  return id;
};
let mcSaveT=0;
function mcScheduleSave(){ clearTimeout(mcSaveT); mcSaveT=setTimeout(mcSaveWorld, 900); }   // debounce (serializa dentro)
async function mcSaveWorld(){
  if(!mc.grid) return;
  try{ await fetch(mcWorldUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mcSerialize())}); }
  catch(e){ toast('No se pudo guardar el mundo'); }
}
function mcTick(now){
  if(!mc.active) return;
  const dt=mc.last ? (now-mc.last)/1000 : 0;
  // FPS reales de pantalla ~cada 0.5s (calca playTick)
  mc.fpsN++;
  if(!mc.fpsT) mc.fpsT=now;
  if(now-mc.fpsT>=500){ mc.fps=mc.fpsN*1000/(now-mc.fpsT); game.fps=mc.fps; mc.fpsN=0; mc.fpsT=now; }
  if(mc.grid) mcUpdate(dt);
  if(mc.agents.size){ mcAgentsTick(now); mcAgentsSmoothUpdate(dt); }   // agentes/NPC: ticks lógicos + interpolación continua de renderizado
  // Construir/romper CONTINUO: mientras se mantiene el botón (y el puntero está bloqueado), repite la acción
  // a intervalos (no cada frame). El estampado de estructuras NO se repite (una pieza por pulsación).
  if(mc.heldBtn>=0 && document.pointerLockElement===mc.canvas && now-mc.actAt>=MC_ACT_MS){
    if(mc.tool!=='select' && !(mc.heldBtn===2 && mc.slotStruct[mc.sel])) mcDoAction(mc.heldBtn);   // Seleccionar NO se repite: cada clic marca una esquina
    mc.actAt=now;
  }
  mcUpdatePreview();              // refresca la malla de la vista-previa si cambió el objetivo/giro (asíncrono, no bloquea)
  mcUpdateHotbar(dt);             // hunde/emerge la hotbar según la carrera (ver mcUpdateHotbar)
  mcRender();
  mcUpdateNoteView();            // t1 · muestra/oculta el texto de la nota apuntada
  mcUpdateXrayLabels();          // rayos-X · etiquetas de coordenadas sobre los bloques rojos
  updateWorldMeters();
  mc.last=now;
  mc.raf=requestAnimationFrame(mcTick);
}
// Overlay de carga del Mundo (t12): evita ver «solo cielo» mientras se hornea el mundo/atlas/meshes.
function mcYield(){ return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }   // cede 2 frames para que el navegador pinte
// ── CRONÓMETRO DE CARGA DEL MUNDO ────────────────────────────────────────────────────────────────
// Por qué existe: el overlay solo mostraba 3 mensajes ('Cargando mundo…', 'Preparando bloques…',
// 'Construyendo el mundo…') para un proceso con 8 etapas bien distintas. «Preparando bloques…» en
// particular esconde N descargas de assets EN SERIE (una por bloque de la paleta), la rasterización de
// 6 caras por bloque, un escaneo de alpha sobre el atlas entero, la subida del atlas a la GPU y hasta 9
// resoluciones de estructura de la hotbar. Sin desglose, una carga lenta es indistinguible de un cuelgue.
// Consola: game.loadReport() repite el informe de la última carga.
let mcLoad=null;
function mcLoadStart(){ mcLoad={ t0:performance.now(), fases:[], abierta:null, bloques:[], notas:[] }; }
function mcLoadPhase(nombre){ mcLoadStop(); if(mcLoad) mcLoad.abierta={ nombre, t:performance.now() }; }
function mcLoadStop(){
  if(!mcLoad || !mcLoad.abierta) return;
  const f=mcLoad.abierta;
  mcLoad.fases.push({ fase:f.nombre, ms:+(performance.now()-f.t).toFixed(1) });
  mcLoad.abierta=null;
}
function mcLoadNote(txt){ if(mcLoad) mcLoad.notas.push(txt); }
function mcLoadReport(){
  if(!mcLoad){ console.log('Aún no se ha cargado ningún mundo en esta sesión.'); return null; }
  const total=+(performance.now()-mcLoad.t0).toFixed(1);
  const filas=mcLoad.fases.map(f=>({ fase:f.fase, ms:f.ms, '%':+(f.ms*100/Math.max(total,0.01)).toFixed(1) }));
  console.log('=== CARGA DEL MUNDO · '+total+' ms en total ===');
  console.table(filas);
  if(mcLoad.notas.length) console.log('  '+mcLoad.notas.join('\n  '));
  if(mcLoad.bloques.length){
    const orden=mcLoad.bloques.slice().sort((a,b)=>b.ms-a.ms);
    console.log('--- BLOQUES DE LA PALETA (cada uno = 1 asset + 6 caras rasterizadas) ---');
    console.table(orden.map(b=>({ bloque:b.name, ms:+b.ms.toFixed(1), origen:b.cached?'caché':'descarga', clave:b.key })));
    const desc=mcLoad.bloques.filter(b=>!b.cached);
    console.log('  '+desc.length+' de '+mcLoad.bloques.length+' bloques hubo que descargarlos ('
      +desc.reduce((s,b)=>s+b.ms,0).toFixed(0)+' ms). Las descargas son EN SERIE: es el tramo que más'
      +' se nota en «Preparando bloques…».');
  }
  return { total, fases:mcLoad.fases, bloques:mcLoad.bloques };
}
function mcShowLoading(txt){ const el=$('#mc-loading'); if(!el) return; const t=$('#mc-loading-text'); if(t) t.textContent=txt||'Cargando…'; el.hidden=false; }
function mcHideLoading(){ const el=$('#mc-loading'); if(el) el.hidden=true; }
async function openWorld(){
  $('#mc-modal').hidden=false;
  mcLoadStart();
  mcLoadPhase('WebGL: crear contexto');
  if(!mc.gl && !mcInitGL()){ $('#mc-modal').hidden=true; mcLoadStop(); return; }
  mcLoadPhase('WebGL: compilar shaders');
  if(!mc.prog) mcBuildProgram();
  if(!mc.structProg) mcBuildStructProgram();
  if(!mc.stexProg) mcBuildStructTexProgram();
  mcLoadStop();
  if(!mc.grid){                       // primera entrada: paleta+atlas, hotbar y mundo (guardado o terreno plano)
    mcShowLoading('Descargando el mundo…'); await mcYield();   // pinta el overlay antes del trabajo pesado (evita el «solo cielo»)
    mcLoadPhase('Red: descargar mundo.json');
    let doc=null;
    try{ doc=await fetch(mcWorldUrl(),{cache:'no-store'}).then(r=>r.json()); }catch(e){}
    mcLoadStop();
    mcLoadNote('Mundo: '+(doc&&doc.voxels?Object.keys(doc.voxels).length:0)+' voxels guardados, '
      +(doc&&doc.structures?Object.keys(doc.structures).length:0)+' estructuras, '
      +(doc&&doc.notes?Object.keys(doc.notes).length:0)+' notas.');
    // Lista de bloques = defaults ∪ keys del loadout ∪ keys presentes en el mundo guardado (así todo
    // lo colocado/guardado tiene su cara en el atlas y mcBake lo hornea).
    mcLoadPhase('Componer lista de bloques');
    mc.blocks=MC_BLOCKS.map(b=>({name:b.name, key:b.key}));
    const addKey=(k,n)=>{ if(k && !mc.blocks.some(b=>b.key===k)) mc.blocks.push({name:n||k, key:k}); };
    const loadout=mcLoadoutKeys();
    if(loadout) loadout.forEach(k=>addKey(k));
    if(doc && doc.voxels) for(const v of Object.values(doc.voxels)) addKey(String(v).replace(/^tex:/,''));
    mcLoadStop();
    mcLoadNote('Paleta: '+mc.blocks.length+' bloques ('+MC_BLOCKS.length+' por defecto + los de la hotbar'
      +' + los presentes en el mundo guardado).');
    mcShowLoading('Preparando bloques… (0/'+mc.blocks.length+')'); await mcYield();
    mcLoadPhase('Paleta: assets + rasterizar caras');
    await mcBuildPalette((n,total,name,key,ms,cached)=>{
      // El overlay deja de mentir: dice QUÉ bloque va y cuántos quedan, en vez de un mensaje fijo.
      mcShowLoading('Preparando bloques… ('+n+'/'+total+') '+name+(cached?'':' ⬇'));
      if(mcLoad) mcLoad.bloques.push({ name, key, ms, cached });
    });
    mcLoadPhase('Atlas → GPU');
    mcUploadAtlas();
    mcLoadStop();
    // Hotbar: restaura el loadout (key→id) o el default [hierba..arena, 3 vacías].
    if(loadout) mc.hotbar=Array.from({length:MC_SLOTS},(_,i)=>{ const k=loadout[i]; const id=k?mc.blockKey.indexOf(k):-1; return id>0?id:0; });
    else mc.hotbar=[1,2,3,4,5,6,0,0,0];
    // Recalcula qué ranura es estructura DESDE su clave (no confíes en el slotStruct guardado: puede ser viejo,
    // cuando un objeto <16 vox se guardaba como bloque suelto). blockLike ⇒ bloque de terreno; el resto ⇒ estructura.
    mcLoadPhase('Hotbar: resolver estructuras');
    mc.slotStruct=[];
    if(loadout){ for(let i=0;i<MC_SLOTS;i++){ const k=loadout[i]; if(!k){ mc.slotStruct[i]=null; continue; }
      try{ const rec=await mcStructCells(k); mc.slotStruct[i]=rec.blockLike?null:k; }catch(e){ mc.slotStruct[i]=null; } } }
    mcLoadStop();
    mcLoadPhase('Hotbar: construir UI');
    mcBuildHotbar();
    mcLoadStop();
    const hasVox = !!(doc && doc.voxels && Object.keys(doc.voxels).length);
    mcShowLoading(hasVox ? 'Construyendo el mundo…' : (doc && doc.fresh ? 'Generando terreno…' : 'Cargando mundo vacío…')); await mcYield();
    mcLoadPhase(hasVox ? 'Bake del mundo guardado + mallado' : (doc && doc.fresh ? 'Generar terreno + mallado' : 'Bake de mundo vacío'));
    if(hasVox) mcBake(doc);              // conserva lo construido
    else if(doc && doc.fresh) { mcGenFlat(); mcMeshAll(); }   // mundo recién nacido (sin fichero) → terreno plano
    else mcBake(doc || {voxels:{}});     // vacío GUARDADO (p.ej. wipeMap) → vacío total, sin voxels
    mcLoadStop();
    mcHideLoading();
    mcLoadReport();
  }
  mcResize();
  mc.hotbarShown=1; mcRevealHotbar();     // la hotbar arranca visible en su sitio
  mc.active=true; mc.fpsN=0; mc.fpsT=0; mc.last=performance.now();
  mcResumeAgents();     // reanudar agentes pausados al volver del editor
  mc.raf=requestAnimationFrame(mcTick);
}
// Tunables de consola del Mundo (patrón game.nearClip): game.fov (grados) y game.renderDist (nº de chunks).
try{ const f=parseFloat(localStorage.getItem('vf_mcFov')); if(f) mc.fov=f*Math.PI/180; }catch(e){}
try{ const r=parseInt(localStorage.getItem('vf_mcRD')); if(r) mc.renderDist=r; }catch(e){}
Object.defineProperty(game,'fov',{ get:()=>Math.round(mc.fov*180/Math.PI),
  set:v=>{ v=Math.max(30,Math.min(110,+v||66)); mc.fov=v*Math.PI/180; try{localStorage.setItem('vf_mcFov',v);}catch(e){} return v; } });
Object.defineProperty(game,'renderDist',{ get:()=>mc.renderDist,
  set:v=>{ v=Math.max(2,Math.min(24,Math.round(+v)||8)); mc.renderDist=v; try{localStorage.setItem('vf_mcRD',v);}catch(e){} return v; } });
// game.renderScale = escala de la resolución de RENDER (0.25..1; 1 = nativa). El cuello de botella del Mundo es
// fill-rate (píxeles × fragment shader), no geometría: renderDist/fov recortan triángulos pero no píxeles. Bajar
// esto pinta menos píxeles (p.ej. 0.7 ≈ mitad) y reescala el framebuffer a pantalla con filtrado suave → sube fps
// aunque haya muchos voxels o el jugador sea grande (game.playerScale). Persiste; se aplica en vivo.
try{ const rs=parseFloat(localStorage.getItem('vf_mcRScale')); if(isFinite(rs)&&rs>0) mc.renderScale=Math.max(0.25,Math.min(1,rs)); }catch(e){}
Object.defineProperty(game,'renderScale',{ enumerable:true, get:()=>mc.renderScale,
  set:v=>{ v=Math.max(0.25,Math.min(1,+v||1)); mc.renderScale=v; try{localStorage.setItem('vf_mcRScale',v);}catch(e){} if(mc.active) mcResize(); return v; } });
// game.mouseSpeed = múltiplo de la sensibilidad base (1 = normal); persistido. yaw/pitch en vivo (grados).
const MC_SENS_BASE=0.0025;
try{ const s=parseFloat(localStorage.getItem('vf_mcSens')); if(isFinite(s)&&s>0) mc.sens=MC_SENS_BASE*s; }catch(e){}
Object.defineProperty(game,'mouseSpeed',{ enumerable:true, get:()=>+(mc.sens/MC_SENS_BASE).toFixed(2),
  set:v=>{ v=Math.max(0.1,Math.min(10,+v||1)); mc.sens=MC_SENS_BASE*v; try{localStorage.setItem('vf_mcSens',v);}catch(e){} return v; } });
// yaw/pitch en grados, lectura/escritura en tiempo real (se ven cambiar al mover el ratón; asignarlos gira la cámara).
Object.defineProperty(game,'yaw',{ enumerable:true, get:()=>Math.round(((mc.yaw*180/Math.PI)%360+540)%360-180),
  set:v=>{ mc.yaw=(+v||0)*Math.PI/180; return v; } });
Object.defineProperty(game,'pitch',{ enumerable:true, get:()=>Math.round(mc.pitch*180/Math.PI),
  set:v=>{ v=Math.max(-89,Math.min(89,+v||0)); mc.pitch=v*Math.PI/180; return v; } });
// game.reach = alcance de romper/poner en bloques (hoy 6); game.playerSpeed = marcha en u/s; ambos persistidos.
try{ const r=parseFloat(localStorage.getItem('vf_mcReach')); if(isFinite(r)&&r>0) mc.reach=r; }catch(e){}
try{ const s=parseFloat(localStorage.getItem('vf_mcSpeed')); if(isFinite(s)&&s>0) mc.speed=s; }catch(e){}
try{ const h=parseFloat(localStorage.getItem('vf_mcHotbarHide')); if(isFinite(h)&&h>=0) mc.hotbarHide=h; }catch(e){}
Object.defineProperty(game,'hotbarHide',{ enumerable:true, get:()=>mc.hotbarHide,   // 0 = no ocultar; N = ocultar tras N bloques de carrera
  set:v=>{ v=Math.max(0,Math.min(200,isFinite(+v)?+v:14)); mc.hotbarHide=v; try{localStorage.setItem('vf_mcHotbarHide',v);}catch(e){} if(v===0) mcRevealHotbar(); return v; } });
Object.defineProperty(game,'reach',{ enumerable:true, get:()=>mc.reach,
  set:v=>{ v=Math.max(1,Math.min(64,+v||16)); mc.reach=v; try{localStorage.setItem('vf_mcReach',v);}catch(e){} return v; } });
try{ let a=parseFloat(localStorage.getItem('vf_mcGhostAlpha'));
     if(!isFinite(a)) a=parseFloat(localStorage.getItem('vf_mcTooFarAlpha'));   // migra el nombre viejo
     if(isFinite(a)) mc.ghostAlpha=Math.max(0,Math.min(1,a)); }catch(e){}
// Transparencia del fantasma/marcador de colocación —verde (colocable) y ámbar («demasiado lejos»)— (0..1):
// 0 = invisible, 1 = opaco. Se ve en vivo al asignarlo. `game.tooFarAlpha` es un alias del mismo valor.
function mcSetGhostAlpha(v){ v=Math.max(0,Math.min(1, isFinite(+v)?+v:0)); mc.ghostAlpha=v; try{localStorage.setItem('vf_mcGhostAlpha',v);}catch(e){} return v; }
Object.defineProperty(game,'ghostAlpha',{ enumerable:true, get:()=>mc.ghostAlpha, set:mcSetGhostAlpha });
Object.defineProperty(game,'tooFarAlpha',{ enumerable:true, get:()=>mc.ghostAlpha, set:mcSetGhostAlpha });
try{ const a=parseFloat(localStorage.getItem('vf_mcStructGhostAlpha')); if(isFinite(a)) mc.structGhostAlpha=Math.max(0,Math.min(1,a)); }catch(e){}
// Transparencia de la vista-previa de estructuras/habitaciones (caja de huella + malla renderizada al mantener el
// clic derecho) (0..1): 0 = sin vista-previa, 1 = opaca. Separada de game.ghostAlpha (bloque suelto).
Object.defineProperty(game,'structGhostAlpha',{ enumerable:true, get:()=>mc.structGhostAlpha,
  set:v=>{ v=Math.max(0,Math.min(1, isFinite(+v)?+v:1)); mc.structGhostAlpha=v; try{localStorage.setItem('vf_mcStructGhostAlpha',v);}catch(e){} return v; } });
try{ const a=parseFloat(localStorage.getItem('vf_mcNoteAlpha')); if(isFinite(a)) mc.noteAlpha=Math.max(0,Math.min(1,a)); }catch(e){}
// game.noteAlpha (t1) = opacidad del post-it flotante que marca un bloque anotado (0..1; 0 = ocultar marcadores).
// El texto de la nota se ve al mirar el bloque, independientemente de esto. Se ve en vivo y persiste.
Object.defineProperty(game,'noteAlpha',{ enumerable:true, get:()=>mc.noteAlpha,
  set:v=>{ v=Math.max(0,Math.min(1, isFinite(+v)?+v:0.85)); mc.noteAlpha=v; try{localStorage.setItem('vf_mcNoteAlpha',v);}catch(e){} return v; } });
Object.defineProperty(game,'playerSpeed',{ enumerable:true, get:()=>mc.speed,
  set:v=>{ v=Math.max(1,Math.min(40,+v||10)); mc.speed=v; try{localStorage.setItem('vf_mcSpeed',v);}catch(e){} return v; } });
// game.airControl / airAccel / airCap = movimiento en el AIRE estilo Quake (air-strafe). airControl on: la velocidad
// horizontal NO se reescribe en el aire, así girar el ratón no redirige el salto y soltar teclas conserva la inercia;
// W/A/S/D solo aceleran de forma acotada hacia donde miras (la componente en esa dirección no pasa de airCap·√scale).
// Combinando strafe + giro se gana algo de velocidad (strafe-jump). airControl off = comportamiento clásico. Persisten.
try{ const a=localStorage.getItem('vf_mcAirCtl'); if(a!==null) mc.airControl=(a!=='0'); }catch(e){}
try{ const a=parseFloat(localStorage.getItem('vf_mcAirAccel')); if(isFinite(a)) mc.airAccel=Math.max(0,Math.min(50,a)); }catch(e){}
try{ const a=parseFloat(localStorage.getItem('vf_mcAirCap')); if(isFinite(a)) mc.airCap=Math.max(0,Math.min(20,a)); }catch(e){}
Object.defineProperty(game,'airControl',{ enumerable:true, get:()=>mc.airControl,
  set:v=>{ v=!!v; mc.airControl=v; try{localStorage.setItem('vf_mcAirCtl', v?'1':'0');}catch(e){} return v; } });
Object.defineProperty(game,'airAccel',{ enumerable:true, get:()=>mc.airAccel,
  set:v=>{ v=Math.max(0,Math.min(50, isFinite(+v)?+v:6)); mc.airAccel=v; try{localStorage.setItem('vf_mcAirAccel',v);}catch(e){} return v; } });
Object.defineProperty(game,'airCap',{ enumerable:true, get:()=>mc.airCap,
  set:v=>{ v=Math.max(0,Math.min(20, isFinite(+v)?+v:3)); mc.airCap=v; try{localStorage.setItem('vf_mcAirCap',v);}catch(e){} return v; } });
// game.playerScale = tamaño del jugador (>1 grande → todo se ve más pequeño; <1 pequeño → todo más grande).
try{ const s=parseFloat(localStorage.getItem('vf_mcScale')); if(isFinite(s)&&s>0) mc.scale=s; }catch(e){}
Object.defineProperty(game,'playerScale',{ enumerable:true, get:()=>mc.scale,
  set:v=>{ v=Math.max(0.25,Math.min(64,+v||1)); mc.scale=v; try{localStorage.setItem('vf_mcScale',v);}catch(e){} if(mc.active) mcUnstick(); return v; } });
// game.playerTool = acción del clic derecho: 'build' (pone al lado) | 'paint' (repinta el bloque apuntado).
try{ const t=localStorage.getItem('vf_mcTool'); if(t==='build'||t==='paint') mc.tool=t; }catch(e){}
function mcSetPlayerTool(v, announce){    // centraliza mc.tool (setter de consola + atajos B/P); persiste
  v=(v==='paint'||v==='select')?v:'build'; mc.tool=v; try{localStorage.setItem('vf_mcTool',v);}catch(e){}
  mc.selA=null;                                      // al cambiar de herramienta, olvida la esquina a medio marcar (la caja confirmada se conserva para Ctrl+C)
  if(announce && mc.active) toast(v==='select' ? 'Seleccionar: clic marca 2 esquinas · Ctrl+C copia · clic dcho limpia'
                                : 'Clic derecho: '+(v==='paint'?'Pintar bloque':'Construir'));
  return v;
}
Object.defineProperty(game,'playerTool',{ enumerable:true, get:()=>mc.tool, set:v=>mcSetPlayerTool(v) });
try{ const t=localStorage.getItem('vf_mcStructTex'); if(t!==null) mc.structTextures=(t!=='0'); }catch(e){}
// Textureado de las estructuras estampadas. true (por defecto) = textura COMPLETA por voxel como el editor 3D,
// vía atlas + shader del terreno (coste de geometría de nivel 1, sin tope aunque la sala sea la Taberna).
// false = color plano por cara (media, más barato) como escape de rendimiento. Re-malla en vivo todas las estructuras.
Object.defineProperty(game,'structTextures',{ enumerable:true, get:()=>mc.structTextures,
  set:v=>{ v=!!v; mc.structTextures=v; try{localStorage.setItem('vf_mcStructTex', v?'1':'0');}catch(e){}
    for(const k in mc.structs){ if(mc.structs[k]) mc.structs[k].meshRot={}; }   // invalida geometría (rebuild al reabrir si no está activo)
    if(mc.active) mcRestampAll(); return v; } });
try{ const t=localStorage.getItem('vf_mcStructGreedy'); if(t!==null) mc.structGreedy=(t!=='0'); }catch(e){}
// game.structGreedy = greedy meshing de las estructuras: fusiona caras coplanares del mismo material en rectángulos
// grandes (una pared lisa pasa de miles de cuadraditos a un puñado de quads) → muchas menos caras a dibujar, mismo
// aspecto (el tile se repite por voxel vía shader). true por defecto; false = una cara por voxel (comportamiento
// anterior, escape si algo se viera raro). Re-malla en vivo todas las estructuras.
Object.defineProperty(game,'structGreedy',{ enumerable:true, get:()=>mc.structGreedy,
  set:v=>{ v=!!v; mc.structGreedy=v; try{localStorage.setItem('vf_mcStructGreedy', v?'1':'0');}catch(e){}
    for(const k in mc.structs){ if(mc.structs[k]) mc.structs[k].meshRot={}; }   // invalida geometría cacheada
    if(mc.active) mcRestampAll(); return v; } });
// game.interiorDark (t7) = penumbra automática de interiores por SKYLIGHT. La luz del cielo se difunde por el aire
// (mcComputeLight) perdiendo 1 nivel por bloque; la sombra de cada cara depende de la LUZ que le llega: plena junto
// a una boca / a cielo abierto, y hasta interiorDark en el fondo sin luz de un túnel. Al basarse en la luz REAL, no
// hay bandas por el grosor de tierra encima y una figura flotante apenas ensombrece el suelo (la luz entra de lado).
// Mapeo exponencial `interiorDark^((MAX-lv)/MAX)`: 1 = desactivado; 0.55 por defecto; **0 = interiores hasta negro**
// (una sala con poca luz se apaga del todo, no solo el fondo con luz 0). Re-malla el terreno en vivo y persiste.
try{ const d=parseFloat(localStorage.getItem('vf_mcInteriorDark')); if(isFinite(d)) mc.interiorDark=Math.max(0,Math.min(1,d)); }catch(e){}
Object.defineProperty(game,'interiorDark',{ enumerable:true, get:()=>mc.interiorDark,
  set:v=>{ v=Math.max(0,Math.min(1, isFinite(+v)?+v:0.08)); mc.interiorDark=v; try{localStorage.setItem('vf_mcInteriorDark',v);}catch(e){}
    if(mc.grid){ mcMeshAll(); if(mc.structures.length) mcRestampAll(); }   // re-oscurece terreno Y estructuras en vivo
    return v; } });
// game.glowLevel = alcance de la LUZ DE BLOQUE emisiva (voxeles *#hex): nivel de siembra 0..MC_MAXLIGHT (−1/paso por el
// aire). 0 = sin luz de bloque; 15 (=MC_MAXLIGHT, alcance máx) por defecto. La luz es escalar/neutra (no tiñe) en v1. Persiste en vf_mcGlow; al
// cambiarlo recalcula la luz de bloque, re-malla el terreno y re-hornea las estructuras (paredes cercanas encendidas).
try{ const g=parseInt(localStorage.getItem('vf_mcGlow'),10); if(isFinite(g)) mc.glowLevel=Math.max(0,Math.min(MC_MAXLIGHT,g)); }catch(e){}
Object.defineProperty(game,'glowLevel',{ enumerable:true, get:()=>mc.glowLevel,
  set:v=>{ v=Math.max(0,Math.min(MC_MAXLIGHT, isFinite(+v)?(+v|0):15)); mc.glowLevel=v; try{localStorage.setItem('vf_mcGlow',v);}catch(e){}
    if(mc.grid){ mcComputeBlockLight(); mcMeshAll(); if(mc.structures.length) mcRestampAll(); }
    return v; } });
// game.glowFocus = ESTRECHEZ del HAZ emisivo 0..1. 0 = omnidireccional (antorcha: la luz sale por igual en todas direcciones);
// sube = haz más estrecho y largo hacia la normal neta de las caras emisivas expuestas (mapea a la penalización de paso
// PERPENDICULAR en el BFS anisótropo: focus·5 → un paso de lado cuesta hasta 6 niveles, así el cono se cierra). 0.2 por
// defecto (1 = lo más fino). La dirección es geométrica: si pintas todas las caras visibles emisivas las normales se
// cancelan → omnidireccional aunque focus=1. Persiste en vf_mcGlowFocus; recalcula la luz de bloque + re-hornea.
try{ const gf=parseFloat(localStorage.getItem('vf_mcGlowFocus')); if(isFinite(gf)) mc.glowFocus=Math.max(0,Math.min(1,gf)); }catch(e){}
Object.defineProperty(game,'glowFocus',{ enumerable:true, get:()=>mc.glowFocus,
  set:v=>{ v=Math.max(0,Math.min(1, isFinite(+v)?+v:0.2)); mc.glowFocus=v; try{localStorage.setItem('vf_mcGlowFocus',v);}catch(e){}
    if(mc.grid){ mcComputeBlockLight(); mcMeshAll(); if(mc.structures.length) mcRestampAll(); }
    return v; } });
// game.worldSize (t8) = límites del mundo. Lectura: '96×40×96'. Redimensionar en vivo: game.resizeWorld(x,y,z)
// (x/z 16..512, y 8..256). Conserva los bloques anclados en el origen, recoloca al jugador dentro y re-malla; las
// estructuras estampadas mantienen sus coords de mundo. Persiste en el servidor (dim viaja en el guardado).
Object.defineProperty(game,'worldSize',{ enumerable:true, get:()=>mc.dim.x+'×'+mc.dim.y+'×'+mc.dim.z });
game.resizeWorld=function(x,y,z){
  // Admite tres números — resizeWorld(90,40,90) — o una sola cadena "AxBxC" (x, X o ×): resizeWorld("90x40x90").
  if(typeof x==='string' && y===undefined){
    const p=x.split(/[x×X*,\s]+/).filter(s=>s.length);
    if(p.length===3){ x=+p[0]; y=+p[1]; z=+p[2]; }
  }
  const d=mcResizeWorld(x,y,z); if(mc.active) toast('Mundo: '+d.x+'×'+d.y+'×'+d.z); return d.x+'×'+d.y+'×'+d.z;
};
// game.unstick() = sácame de donde esté incrustado (equivale a la tecla U): sube por encima de lo que estorbe;
// si no encuentra hueco, teletransporta al spawn. Útil si cargaste el mundo dentro de una estructura.
game.unstick=function(){ if(!mc.active) return 'abre el Mundo primero'; mcForceUnstick(); return 'ok'; };
// game.toast("mensaje", segundos) = muestra un aviso efímero desde la consola, en CUALQUIER vista de la app
// (Capas, editor 3D o Mundo). El 2º argumento es opcional (duración en segundos; def. 1.8 s). En el Mundo el
// toast sube por encima de la hotbar automáticamente (clase mc-mode en toast()). game.showToast es alias.
game.toast=game.showToast=function(msg, secs){ toast(String(msg), secs); return 'ok'; };
// game.dumpVars() = vuelca a la consola los VALORES ACTUALES de los tunables de F12 (los que voy ajustando en vivo)
// como un objeto plano copiable — sin funciones ni prototipos: `game` a secas muestra los accesores como `(...)`/`ƒ`
// y no se leen. Sirve para pasártelos como nuevos valores por defecto. Lee cada getter (fuente única, ya redondeado
// como se muestra); showFPS/showVoxels se resuelven a su booleano (sus getters devuelven funciones invocables).
game.dumpVars=function(){
  const keys=['nearClip','perspStrength','playFill','playZoom','playLift',   // edición 3D / modo jugar
    'fov','renderDist','renderScale','mouseSpeed','yaw','pitch','hotbarHide','reach',   // Mundo (WebGL)
    'ghostAlpha','structGhostAlpha','noteAlpha','playerSpeed','playerScale','playerTool',
    'airControl','airAccel','airCap',
    'structTextures','structGreedy','interiorDark','glowLevel','glowFocus','worldSize',
    'agentSpeed','agentSaveMs'];
  const V={ showFPS:_showFPS, showVoxels:_showVox };                          // callables → su booleano subyacente
  for(const k of keys) V[k]=game[k];
  try{ console.table(V); }catch(e){}
  console.log(JSON.stringify(V,null,2));                                      // copiable como literal
  return V;
};
function closeWorld(){
  mc.active=false; mc.keys={}; mc.heldBtn=-1; mcClearPreview();
  mcPauseAgents();   // los agentes se pausan al salir al editor: retienen memoria y coords hasta reabrir el Mundo
  mcCloseNote(); { const nv=$('#mc-noteview'); if(nv) nv.hidden=true; }   // t1 · cierra el editor/visor de notas al salir
  if(mc.grid){ clearTimeout(mcSaveT); mcSaveWorld(); }   // vuelca cualquier edición pendiente al salir
  if(document.pointerLockElement===mc.canvas) document.exitPointerLock();
  if(mc.raf){ cancelAnimationFrame(mc.raf); mc.raf=0; }
  $('#mc-modal').hidden=true;
}
$('#mc-close').onclick=closeWorld;
if($('#mc-code-btn')) $('#mc-code-btn').onclick=openSnips;
$('#mc-picker-close').onclick=mcClosePicker;
$('#mc-picker-remove').onclick=mcRemoveSlot;
$('#mc-note-save').onclick=mcSaveNote;
$('#mc-note-del').onclick=mcDeleteNote;
if($('#mc-note-trace')) $('#mc-note-trace').onclick=mcShowTraceModal;
if($('#trace-close')) $('#trace-close').onclick=mcCloseTraceModal;
if($('#trace-copy')) $('#trace-copy').onclick=mcCopyTraceText;
$('#mc-note-cancel').onclick=mcCloseNote;
$('#mc-note-text').addEventListener('keydown',e=>{                    // Ctrl/⌘+Enter guarda (Esc lo cierra el handler del Mundo; los atajos del editor no aplican con el Mundo abierto)
  if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); mcSaveNote(); }
});
window.addEventListener('resize',()=>{ if(mc.active) mcResize(); });

// --- F4 · entrada: pointer-lock para mirar + teclas mantenidas para WASD/salto ---
const MC_KEYS=['w','a','s','d',' ','shift'];
const MC_ACT_MS=140;   // periodo de repetición al mantener el botón (construir/romper continuo)
const mcUserKeys={};   // atajos de teclado definidos por el usuario vía game.onKey (tecla → función)
// Teclas que usa el motor y NO se pueden re-ligar (evita romper controles por accidente).
const MC_RESERVED=new Set([...MC_KEYS,'p','b','x','u','n','r','z','escape','1','2','3','4','5','6','7','8','9']);
$('#mc-canvas').addEventListener('click',()=>{ mcLockPointer(); });
// Marca cuándo se soltó el pointer-lock: así el mismo Esc que lo libera no cierra el Mundo (Esc de 2 pasos).
document.addEventListener('pointerlockchange',()=>{ if(mc.active && document.pointerLockElement!==mc.canvas){ mc.unlockedAt=performance.now(); mc.heldBtn=-1; mcClearPreview(); } });
document.addEventListener('mousemove',e=>{
  if(!mc.active || document.pointerLockElement!==mc.canvas) return;
  const gs=mc.sens/Math.sqrt(mc.scale);   // giro ∝ 1/√scale: un gigante mueve la cabezota despacio (mole/peso), coherente con marcha y salto; a escala 1 no cambia
  mc.yaw-=e.movementX*gs; mc.pitch-=e.movementY*gs;   // dcha=mirar dcha, abajo=mirar abajo (mc.sens ← game.mouseSpeed)
  mc.pitch=Math.max(-1.55,Math.min(1.55,mc.pitch));
  // Reemerge la hotbar si el jugador está PARADO y mueve el ratón (gesto de «volver a mirar el inventario»).
  if(mc.hbTarget===0 && Math.hypot(mc.vel[0],mc.vel[2])<0.6 && (Math.abs(e.movementX)+Math.abs(e.movementY))>1) mcRevealHotbar();
});
window.addEventListener('keydown',e=>{ if(!mc.active || !$('#mc-picker').hidden || !$('#mc-note').hidden || !$('#snip-modal').hidden || (e.target && e.target.matches && e.target.matches('input,select,textarea'))) return;   // selector/editor de nota/código abierto ⇒ no mover/seleccionar
  if(/^[1-9]$/.test(e.key)){ const i=+e.key-1;
    // Alt+número: abre el selector de esa ranura (sin Esc+clic derecho); si no, selecciona la ranura.
    if(i<mc.hotbar.length){ if(e.altKey) mcOpenPicker(i); else { mc.sel=i; mcSelectSlot(); } }
    e.preventDefault(); return; }
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey) && k==='c'){ mcCopySelection(); e.preventDefault(); return; }   // Ctrl+C: copia la selección (tool=select) al portapapeles compatible con el editor
  if((e.ctrlKey||e.metaKey) && k==='v'){ mcPasteWorld(); e.preventDefault(); return; }        // Ctrl+V: pega el portapapeles EN EL MAPA, apoyado en la cara apuntada (el Mundo no se cierra)
  if(k==='p'){ const next={build:'paint',paint:'select',select:'build'}; mcSetPlayerTool(next[mc.tool]||'build', true); e.preventDefault(); return; }   // P = rota la herramienta de clic derecho: Construir → Pintar → Seleccionar
  if(k==='b'){ const st=1.15; game.playerScale=mc.scale*(e.shiftKey?1/st:st); toast('Tamaño ×'+(+mc.scale.toFixed(2))); e.preventDefault(); return; }   // b = más grande («big») · B (mayús) = más pequeño (paso fino ×1.15)
  if(k==='x'){ mc.xray=!mc.xray; toast('Rayos-X: '+(mc.xray?'ON':'OFF')); e.preventDefault(); return; }    // modo depuración: ver el volumen de colisión
  if(k==='u'){ mcForceUnstick(); toast('Desatascado'); e.preventDefault(); return; }                       // U = sácame de aquí (sube sobre lo que estorbe; si no, al spawn)
  if(k==='n'){ mcOpenNote(); e.preventDefault(); return; }                                                  // N = anota el bloque apuntado (post-it)
  if(k==='r' && mc.slotStruct[mc.sel]){                                                                       // gira/vuelca la estructura 90° (mantén clic derecho para ver la vista-previa; suelta = estampa así)
    if(e.shiftKey){ mc.previewTilt=(mc.previewTilt+1)&3; toast('Vuelco: '+(mc.previewTilt*90)+'°'); }          // Shift+R = vuelco sobre el eje X (plano altura↔profundidad)
    else { mc.previewRot=(mc.previewRot+1)&3; toast('Giro: '+(mc.previewRot*90)+'°'); }                        // R = giro sobre el eje vertical (plano horizontal)
    e.preventDefault(); return; }
  if(k==='r' && mc.tool==='select' && mc.selBox){ mcRotateSelBox(); e.preventDefault(); return; }              // gira 90° (horizontal) los bloques de la caja seleccionada — p.ej. tras Ctrl+V pegar
  // S SOLO mientras se MANTIENE el clic derecho colocando una estructura: alterna pegado canto↔centrado (la
  // vista-previa se re-malla sola). Fuera de ese gesto, S sigue siendo andar hacia atrás (no lo tocamos). !e.repeat
  // evita que mantener S pulsado parpadee entre modos.
  if(k==='s' && !e.repeat && mc.heldBtn===2 && mc.slotStruct[mc.sel]){ mc.stampCenter=!mc.stampCenter; toast('Pegado: '+(mc.stampCenter?'centrado':'canto')); e.preventDefault(); return; }
  if(k==='z'){ if(e.shiftKey) mcRedo(); else mcUndo(); e.preventDefault(); return; }   // z = deshacer · Z (mayús) = rehacer (romper/poner/pintar/estampar/retirar)
  if(mcUserKeys[k]){ try{ mcUserKeys[k](e); }catch(err){ console.error('game.onKey("'+k+'"):', err); } e.preventDefault(); return; }   // atajos del usuario (game.onKey)
  if(MC_KEYS.includes(k)){
    mc.keys[k]=true; if(k!=='shift') e.preventDefault();
    // Si el ratón no está capturado, moverse con WASD/salto lo captura (como un clic) — keydown es gesto de usuario.
    if(document.pointerLockElement!==mc.canvas){ mcLockPointer(); }
  }
});
window.addEventListener('keyup',e=>{ if(!mc.active || !$('#snip-modal').hidden) return; mc.keys[e.key.toLowerCase()]=false; });
// game.onKey('t', fn) · liga una tecla a tu función mientras el Mundo (🌍) esté activo. Ejemplo:
//   game.onKey('t', ()=> throwAndExplodeTNT(...game.aim(), {radius:8, fuseTimeMs:500, tntMat:'roca'}));
// Re-registrar la misma tecla la REEMPLAZA (no acumula listeners); game.onKey('t', null) la quita.
// Las teclas del motor (WASD, espacio, shift, 1-9, p/b/x/u/n/r/z, Esc) están reservadas. game.keys() lista las tuyas.
game.onKey=function(tecla, fn){
  const k=String(tecla==null?'':tecla).toLowerCase();
  if(k.length!==1 && k!=='escape'){ console.warn('game.onKey: indica UNA tecla, p.ej. game.onKey("t", fn)'); return; }
  if(fn==null){ delete mcUserKeys[k]; return k; }                 // quitar
  if(typeof fn!=='function'){ console.warn('game.onKey: el 2º argumento debe ser una función (o null para quitar)'); return; }
  if(MC_RESERVED.has(k)){ console.warn('game.onKey: la tecla "'+k+'" la usa el Mundo; elige una libre (t,g,h,j,k,l,y,f,c,v,m,q,e…)'); return; }
  mcUserKeys[k]=fn; return k;
};
// game.keys() · lista las teclas que has ligado con game.onKey
game.keys=function(){ const ks=Object.keys(mcUserKeys); console.log(ks.length?('teclas ligadas: '+ks.join(', ')):'sin teclas ligadas (game.onKey)'); return ks; };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// AGENTES (NPC) del Mundo · game.defineAgent
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Reparto de responsabilidades: AQUÍ va la MECÁNICA (tick, andar, pintar, notas, telemetría, dibujo); la
// HEURÍSTICA (a dónde girar, cómo evitar la propia cola, cuándo terminar, qué anotar) va en tu snippet, en
// onTick(a). El framework nunca decide política.
//   game.defineAgent({ id:'pintor', block:'sand', tickMs:120, onTick(a){ a.walk(1,0); a.paint('grass'); } })
// Redefinir un id existente DETIENE el viejo y lo reemplaza (iterar la heurística sin recargar la página).
// Inspección en F12: game.agents() · game.agent('pintor').vars / .stats · game.stopAgents().
const MC_AGENT_MAX_STEPS=4;      // pasos máximos por agente y frame (para tickMs < duración de frame)
const MC_AGENT_SAVE_MS=30000;    // cada cuánto se vuelca el mundo mientras hay agentes escribiendo
let mcAgentSpeed=1;              // game.agentSpeed: multiplicador global de tickMs (2 = la mitad de rápido)
let mcAgentSaveMs=MC_AGENT_SAVE_MS;
const mcAgentDirty=new Set();    // chunks "cx,cz" pendientes de re-mallar por escrituras de agentes
let mcAgentSaveDirty=false, mcAgentSaveAt=0;

// Escritura BARATA para agentes. mcSetVoxel/mcFlushBuild no valen en un bucle continuo: hacen mcMeshAll()
// completo, mcUnstick, guardado y un toast cada 80ms. Aquí: mc.grid + marcar el chunk, y remallar UNA vez por
// frame. La luz solo cambia si se rompe el invariante sólido↔aire (mcComputeLight difunde por aire y hasGlow
// sale de mc.structures) → sólido→sólido (pintar) puede saltarse el BFS; aire↔sólido cae al camino caro.
function mcAgentSetBlock(x,y,z,id){
  if(!mc.grid || !mcInside(x,y,z)) return false;
  const i=mcIdx(x,y,z), prev=mc.grid[i];
  if(prev===id) return false;
  mc.grid[i]=id;
  mcAgentSaveDirty=true;
  if(prev===0 || id===0) mcRemeshAround(x,z);   // cambia la luz: recomputar + re-mallar 3×3 (raro: los agentes pintan)
  else mcAgentDirty.add(Math.floor(x/MC_CHUNK)+','+Math.floor(z/MC_CHUNK));
  return true;
}
function mcAgentFlushDirty(){
  if(!mcAgentDirty.size) return;
  for(const k of mcAgentDirty){ const p=k.split(','); mcMeshChunk(+p[0], +p[1]); }
  mcAgentDirty.clear();
}
// Guardado espaciado: mcSaveWorld POSTea el mundo ENTERO, así que un agente que corre minutos no puede usar
// el debounce normal de 900ms. Se vuelca cada mcAgentSaveMs y siempre al parar/fallar/cerrar.
function mcAgentMaybeSave(now){
  if(!mcAgentSaveDirty) return;
  if(!mcAgentSaveAt){ mcAgentSaveAt=now; return; }
  if(now-mcAgentSaveAt<mcAgentSaveMs) return;
  mcAgentSaveAt=now; mcAgentSaveDirty=false;
  clearTimeout(mcSaveT); mcSaveWorld();
}
function mcAgentFlushSave(){ if(!mcAgentSaveDirty) return; mcAgentSaveDirty=false; mcAgentSaveAt=0; mcScheduleSave(); }

// Suelo: bloque sólido más alto de la columna (−1 si la columna está vacía).
function mcSurfaceY(x,z){
  if(!mc.grid || !mcInside(x,0,z)) return -1;
  for(let y=mc.dim.y-1;y>=0;y--) if(mc.grid[mcIdx(x,y,z)]) return y;
  return -1;
}
// Suelo PISABLE cerca de la altura actual: sólido con aire encima, a ±climb de y0. Evita escanear la columna
// entera en cada paso (mcSurfaceY es O(alto) y se llamaría 4 veces por tick y agente).
function mcSurfaceNear(x,z,y0,climb,drop){
  if(!mc.grid || !mcInside(x,0,z)) return -1;
  const H=mc.dim.y;
  const maxUp = climb !== undefined ? climb : 1;
  const maxDown = drop !== undefined ? drop : 3;
  const maxD = Math.max(maxUp, maxDown);
  for(let d=0; d<=maxD; d++){
    const candidates = [];
    if(d <= maxUp) candidates.push(y0 + d);
    if(d > 0 && d <= maxDown) candidates.push(y0 - d);
    for(const y of candidates){
      if(y<0||y>=H) continue;
      if(mc.grid[mcIdx(x,y,z)] && (y+1>=H || !mc.grid[mcIdx(x,y+1,z)])) return y;
    }
  }
  return -1;
}

// Cuerpo del agente: cubo suelto de 36 vértices con el formato del terreno (x,y,z,u,v,shade) y su atlas.
// Va en un VBO propio y NO en mc.grid: en la rejilla el jugador colisionaría con los agentes, ensuciaría el
// mundo guardado y obligaría a re-mallar dos chunks por paso. Siempre a pleno brillo (se ve en salas oscuras).
const MC_AGENT_INSET_XZ=0.02;     // ligero inset en X y Z para no hacer z-fighting con paredes adyacentes
const MC_AGENT_INSET_Y=0.001;     // asentamiento de la cara inferior totalmente pegado a la cota del suelo
function mcAgentMesh(a){
  const gl=mc.gl; if(!gl) return;
  let rects=mc.palette[a.blockId];
  if(!rects && mc.palette.length > 1){ a.blockId = 1; rects = mc.palette[1]; }
  if(!rects){ a.count=0; return; }
  const rx = a.renderX !== undefined ? a.renderX : a.x;
  const ry = a.renderY !== undefined ? a.renderY : a.y;
  const rz = a.renderZ !== undefined ? a.renderZ : a.z;
  const Sx=1-2*MC_AGENT_INSET_XZ, Sy=1-2*MC_AGENT_INSET_Y, Sz=1-2*MC_AGENT_INSET_XZ;
  const ox=rx+MC_AGENT_INSET_XZ, oy=ry+1+MC_AGENT_INSET_Y, oz=rz+MC_AGENT_INSET_XZ;
  const verts=[];
  for(let f=0;f<6;f++){
    const F=MC_FACES[f], r=rects[F.tex], C=F.corners;
    const uv=[[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]];
    for(const k of [0,1,2,0,2,3]){
      const c=C[k];
      verts.push(ox+c[0]*Sx, oy+c[1]*Sy, oz+c[2]*Sz, uv[k][0], uv[k][1], F.s);
    }
  }
  if(!a.vbo) a.vbo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, a.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
  a.count=36;
}
function mcAgentFreeMesh(a){ if(a.vbo && mc.gl) mc.gl.deleteBuffer(a.vbo); a.vbo=null; a.count=0; }

// Notas: REUTILIZAN los post-it del Mundo (mc.notes), así que se serializan en el JSON del mundo y se pueden
// leer/procesar desde FUERA del juego para mejorar las heurísticas. Formato compacto «[id] texto».
function mcAgentNoteForce(a, texto, celda){
  const txt=('['+a.id+'] '+String(texto)).slice(0, MC_NOTE_MAX);
  const c = celda ? [Math.round(celda[0]),Math.round(celda[1]),Math.round(celda[2])] : [a.x, a.y, a.z];
  let k=mcNoteKey(c);
  for(let r=1; r<=3 && mc.notes[k]; r++){          // espiral hacia fuera: no pisar una nota que ya existe
    let libre=null;
    for(let dz=-r; dz<=r && !libre; dz++) for(let dx=-r; dx<=r && !libre; dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
      const nx=c[0]+dx, nz=c[2]+dz, ny=mcSurfaceY(nx,nz);
      if(ny<0) continue;
      const nk=nx+','+ny+','+nz; if(!mc.notes[nk]) libre=nk;
    }
    if(libre){ k=libre; break; }
  }
  if(mc.notes[k]){                                  // sin hueco alrededor: acumula en la existente (o la sustituye si no cabe)
    const j=mc.notes[k]+' | '+txt;
    mc.notes[k] = j.length<=MC_NOTE_MAX ? j : txt;
  } else mc.notes[k]=txt;
  a.stats.notes++; a._noteAt=performance.now(); mcAgentSaveDirty=true;
  return true;
}
function mcAgentNote(a, texto, celda){              // con cuota antiinundación (noteMax / noteMinMs)
  const now=performance.now();
  const urgente = a.state==='stopped' || a.state==='error';   // el informe final nunca se pierde por cadencia
  if(a.stats.notes>=a.noteMax || (!urgente && a._noteAt && now-a._noteAt<a.noteMinMs)){ a.stats.notesDropped++; return false; }
  return mcAgentNoteForce(a, texto, celda);
}

// Una heurística rota NUNCA puede matar el bucle del Mundo: se aísla el agente, se deja rastro y se sigue.
function mcAgentFail(a, err, donde){
  a.state='error';
  const msg = (err && err.message) ? err.message : String(err);
  console.error('[agente '+a.id+'] '+(donde||'onTick')+': '+msg);
  mcAgentNoteForce(a, 'ERROR '+msg);   // la nota de error se salta la cuota
  toast('Agente '+a.id+': error (ver consola F12)');
  try{ if(a.cfg.onError) a.cfg.onError(a, err); }catch(e2){ console.error('[agente '+a.id+'] onError: '+(e2&&e2.message?e2.message:e2)); }
  mcAgentFlushDirty(); mcAgentFlushSave();
}

// Celda destino de un paso: devuelve la Y de suelo pisable, o −1 si no se puede ir (borde, abismo, desnivel).
function mcAgentTarget(a, dx, dz){
  dx=dx|0; dz=dz|0;
  const nx=a.x+dx, nz=a.z+dz, m=a.margin;
  if(nx<m || nz<m || nx>=mc.dim.x-m || nz>=mc.dim.z-m) return -1;
  return mcSurfaceNear(nx, nz, a.y, a.climb, a.drop);
}

function mcAgentMake(id, cfg){
  const num=(v,d)=>isFinite(+v)?+v:d;
  // Posición inicial: la que pidas, o dos celdas por delante del jugador (así «invocar un agente» funciona en
  // CUALQUIER mapa, sin depender de uno dedicado).
  let sx, sz;
  if(cfg.start && isFinite(+cfg.start.x) && isFinite(+cfg.start.z)){ sx=Math.round(+cfg.start.x); sz=Math.round(+cfg.start.z); }
  else { sx=Math.floor(mc.pos[0]-Math.sin(mc.yaw)*2); sz=Math.floor(mc.pos[2]-Math.cos(mc.yaw)*2); }
  sx=Math.max(1, Math.min(mc.dim.x-2, sx)); sz=Math.max(1, Math.min(mc.dim.z-2, sz));
  const a={
    id, cfg,
    name: String(cfg.name||id),
    goal: String(cfg.goal||''),
    block: cfg.block==null ? 'stone' : cfg.block,
    blockId: 0,
    x:sx, y:Math.max(0, mcSurfaceY(sx,sz)), z:sz, dir:[1,0],
    vars: (cfg.vars && typeof cfg.vars==='object') ? cfg.vars : {},   // estado libre del snippet: el framework NO lo toca
    state:'idle',
    tickMs: Math.max(16, num(cfg.tickMs,120)),
    climb: Math.max(0, num(cfg.climb,1)|0),
    drop: Math.max(0, num(cfg.drop,3)|0),
    margin: Math.max(0, num(cfg.margin,1)|0),
    maxTicks: Math.max(0, num(cfg.maxTicks,0)|0),
    noteMax: Math.max(0, num(cfg.noteMax,20)|0),
    noteMinMs: Math.max(0, num(cfg.noteMinMs,3000)),
    debug: !!cfg.debug,
    stats:{ ticks:0, steps:0, painted:0, repainted:0, blocked:0, idleTicks:0, distance:0,
            notes:0, notesDropped:0, startedAt:0, lastMoveAt:0, elapsedMs:0 },
    vbo:null, count:0, _nextAt:0, _noteAt:0, _moved:false, _mat:{},
  };
  a.passengers = cfg.passengers !== false && cfg.rideable !== false;
  a.isMounted = function(){
    if(a._dismountedAt && (performance.now() - a._dismountedAt < 2500)) return false;
    const p = mc.pos;
    const rx = a.renderX !== undefined ? a.renderX : a.x;
    const ry = a.renderY !== undefined ? a.renderY : a.y;
    const rz = a.renderZ !== undefined ? a.renderZ : a.z;
    // Si el jugador está apoyado sobre un bloque sólido del mundo (suelo/arena/hormigón), NO está montado en el agente
    const px = Math.floor(p[0]), py = Math.floor(p[1]), pz = Math.floor(p[2]);
    if(typeof mcGetVoxel === 'function' && mcGetVoxel(px, py - 1, pz) > 0) return false;
    // COTAS (no tocar sin releer esto): a.y/renderY = celda de SUELO SÓLIDA bajo el agente; el cuerpo se dibuja
    // en ry+1 (mcAgentMesh: oy=ry+1) y mcCollides le da un AABB en [ry+1, ry+2). Por tanto, quien va de paseo
    // encima tiene los PIES en ry+2, no en ry+1: la ventana antigua (ry+0.95..ry+1.25) caía DENTRO del propio
    // cuerpo del agente, una cota inaccesible, así que isMounted() no devolvía true jamás y nunca te llevaba.
    return (p[0] >= rx + 0.1 && p[0] <= rx + 0.9 &&
            p[2] >= rz + 0.1 && p[2] <= rz + 0.9 &&
            p[1] >= ry + 1.9 && p[1] <= ry + 2.5);
  };
  // OJO: a.blockId NO se resuelve aquí. onStart puede precargar la textura del cuerpo con game.addMaterial
  // (p.ej. obsidiana, que no está en la paleta por defecto); resolverlo antes poblaría la caché de
  // mcResolveMat con el fallback a roca. Se resuelve en start(), después de onStart.
  // ── Skills (mecánica). La política —girar, evitar la cola, terminar— la pone tu onTick. ──
  a.matId=function(mat){ const k=String(mat); if(a._mat[k]===undefined) a._mat[k]=mcResolveMat(mat); return a._mat[k]; };
  a.canWalk=function(dx,dz){ return mcAgentTarget(a,dx,dz)>=0; };
  a.walk=function(dx,dz){
    const ny=mcAgentTarget(a,dx,dz);
    if(ny<0){ a.stats.blocked++; return false; }
    if(a.renderX === undefined){ a.renderX = a.x; a.renderY = a.y; a.renderZ = a.z; }
    a.x+=dx|0; a.z+=dz|0; a.y=ny;
    if(dx||dz) a.dir=[Math.sign(dx|0), Math.sign(dz|0)];
    a.stats.steps++; a.stats.distance+=Math.abs(dx|0)+Math.abs(dz|0); a.stats.lastMoveAt=performance.now();
    a._moved=true; mcAgentMesh(a);
    return true;
  };
  a.surfaceY=function(x,z){ return mcSurfaceY(Math.round(x), Math.round(z)); };
  a.getBlock=function(x,y,z){ const px=(x===undefined?a.x:Math.round(x)), py=(y===undefined?a.y:Math.round(y)), pz=(z===undefined?a.z:Math.round(z)); return mcGetVoxel(px,py,pz); };
  a.floor=function(x,z){                        // id del bloque de suelo (0 = aire/nada) en (x,z) o bajo el agente
    const px=(x===undefined?a.x:Math.round(x)), pz=(z===undefined?a.z:Math.round(z));
    const py=(px===a.x&&pz===a.z)?a.y:mcSurfaceY(px,pz);
    return py<0 ? 0 : mc.grid[mcIdx(px,py,pz)];
  };
  a.paint=function(mat, x, z){                  // devuelve true SOLO si cambió algo (repintar cuenta aparte)
    if(x!==undefined || z!==undefined){
      const px=Math.round(x), pz=Math.round(z), py=mcSurfaceY(px,pz);
      if(py<0) return false;
      const id=a.matId(mat); if(!id) return false;
      const prev=mc.grid[mcIdx(px,py,pz)];
      if(!prev) return false;
      if(prev===id){ a.stats.repainted++; return false; }
      mcAgentSetBlock(px,py,pz,id); a.stats.painted++; return true;
    }
    const id=a.matId(mat); if(!id) return false;
    a._pendingPaint = { matId: id, targetX: a.x, targetY: a.y, targetZ: a.z };
    return true;
  };
  a.setBlock=function(x,y,z,mat){ return mcAgentSetBlock(Math.round(x),Math.round(y),Math.round(z), a.matId(mat)); };
  a.agentsAt=function(x,z){                     // otros agentes en esa celda (evitarse entre ellos es política tuya)
    const px=Math.round(x), pz=Math.round(z), out=[];
    for(const o of mc.agents.values()) if(o!==a && o.x===px && o.z===pz) out.push(o.id);
    return out;
  };
  a.note=function(texto, celda){ return mcAgentNote(a, texto, celda); };
  a.getNote=function(x,y,z){
    const px=(x===undefined?a.x:Math.round(x)), py=(y===undefined?a.y:Math.round(y)), pz=(z===undefined?a.z:Math.round(z));
    return (mc.notes && mc.notes[px+','+py+','+pz]) || '';
  };
  a.rnd=function(n){ return n==null ? Math.random() : Math.floor(Math.random()*n); };
  a.log=function(){ console.log('[agente '+a.id+']', a.state, 'pos', a.x+','+a.y+','+a.z, a.stats, a.vars); return a; };
  // ── Ciclo de vida ──
  a.start=function(){
    if(a.state==='running') return a;
    a.state='running'; a._nextAt=0;
    if(!a.stats.startedAt) a.stats.startedAt=performance.now();
    let p=null;
    try{ if(a.cfg.onStart) p=a.cfg.onStart(a); }catch(err){ mcAgentFail(a, err, 'onStart'); return a; }
    // onStart puede ser ASÍNCRONO (típico: `await game.addMaterial('asset:…')` para precargar la textura del
    // cuerpo). Si devuelve una promesa, el cuerpo se malla al resolverse —ya con el material bueno— y hasta
    // entonces el agente no da su primer paso (_nextAt=Infinity lo deja fuera del planificador).
    const listo=()=>{ a._mat={}; a.blockId=mcResolveMat(a.block); mcAgentMesh(a); };
    if(p && typeof p.then==='function'){ a._nextAt=Infinity; p.then(()=>{ listo(); a._nextAt=0; }, err=>mcAgentFail(a, err, 'onStart')); }
    else listo();
    return a;
  };
  a.pause=function(){ if(a.state==='running'){ a.state='paused'; mcAgentFlushDirty(); mcAgentFlushSave(); } return a; };
  a.resume=function(){ if(a.state==='paused'){ a.state='running'; a._nextAt=0; } return a; };
  a.stop=function(motivo){
    if(a.state==='stopped') return a;
    a.state='stopped';
    try{ if(a.cfg.onStop) a.cfg.onStop(a, motivo||'stop'); }catch(err){ console.error('[agente '+a.id+'] onStop:', err); }
    mcAgentFlushDirty(); mcAgentFlushSave();
    return a;
  };
  a.step=function(){ mcAgentStep(a); return a; };   // un tick manual desde consola, para depurar la heurística
  return a;
}

function mcAgentStep(a){
  a.stats.ticks++;
  a._moved=false;
  try{ a.cfg.onTick(a); }
  catch(err){ mcAgentFail(a, err); return; }
  if(!a._moved) a.stats.idleTicks++;
  a.stats.elapsedMs=performance.now()-(a.stats.startedAt||performance.now());
  if(a.maxTicks>0 && a.stats.ticks>=a.maxTicks && a.state==='running') a.stop('maxTicks');
}

function mcAgentsTick(now){
  let vivos=0;
  for(const a of mc.agents.values()){
    if(a.state!=='running') continue;
    vivos++;
    const speedMult = mcAgentSpeed > 0 ? mcAgentSpeed : 1;
    const paso = Math.max(16, a.tickMs / speedMult);
    if(!a._nextAt) a._nextAt=now;
    let n=0;
    while(a.state==='running' && now>=a._nextAt && n<MC_AGENT_MAX_STEPS){ n++; a._nextAt+=paso; mcAgentStep(a); }
    if(a._nextAt<now) a._nextAt=now;   // sin catch-up: tras un parón del navegador no se acumulan pasos atrasados
  }
  mcAgentFlushDirty();
  if(vivos) mcAgentMaybeSave(now);
}

function mcAgentsSmoothUpdate(dt){
  if(dt <= 0 || !mc.agents || !mc.agents.size) return;
  for(const a of mc.agents.values()){
    if(a.state === 'stopped') continue;
    if(a.renderX === undefined){ a.renderX = a.x; a.renderY = a.y; a.renderZ = a.z; continue; }
    const dx = a.x - a.renderX, dz = a.z - a.renderZ;
    const distHoriz = Math.hypot(dx, dz);
    const oldRx = a.renderX, oldRy = a.renderY, oldRz = a.renderZ;
    const mounted = a.passengers && a.isMounted();
    if(distHoriz > 1e-4){
      const speedMult = mcAgentSpeed > 0 ? mcAgentSpeed : 1;
      const effectiveTickMs = Math.max(16, a.tickMs / speedMult);
      const speed = 1000 / effectiveTickMs;
      const maxMove = Math.min(distHoriz, dt * speed);
      a.renderX += (dx / distHoriz) * maxMove;
      a.renderZ += (dz / distHoriz) * maxMove;
    } else {
      a.renderX = a.x;
      a.renderZ = a.z;
    }
    const xMin = Math.floor(a.renderX + 0.05), xMax = Math.floor(a.renderX + 0.95);
    const zMin = Math.floor(a.renderZ + 0.05), zMax = Math.floor(a.renderZ + 0.95);
    const baseTargetY = Math.round(a.y);
    let maxY = Math.min(a.y, mcSurfaceNear(Math.round(a.renderX), Math.round(a.renderZ), baseTargetY, 1));
    if(maxY < 0) maxY = a.y;
    for(let ix = xMin; ix <= xMax; ix++){
      for(let iz = zMin; iz <= zMax; iz++){
        const sy = mcSurfaceNear(ix, iz, baseTargetY, 1);
        if(sy > maxY) maxY = sy;
      }
    }
    a.renderY = maxY;
    if(a._pendingPaint){
      const p = a._pendingPaint;
      const distToTarget = Math.hypot(a.renderX - p.targetX, a.renderZ - p.targetZ);
      if(distToTarget < 0.25){
        const prev = mc.grid[mcIdx(p.targetX, p.targetY, p.targetZ)];
        if(prev && prev !== p.matId){
          mcAgentSetBlock(p.targetX, p.targetY, p.targetZ, p.matId);
          a.stats.painted++;
        } else if(prev === p.matId){
          a.stats.repainted++;
        }
        a._pendingPaint = null;
      }
    }
    mcAgentMesh(a);
    if(mounted){
      const dxP = a.renderX - oldRx;
      const dyP = a.renderY - oldRy;
      const dzP = a.renderZ - oldRz;
      const targetPx = mc.pos[0] + dxP;
      const targetPy = mc.pos[1] + dyP;
      const targetPz = mc.pos[2] + dzP;

      if(mcCollidesWorld(targetPx, targetPy, targetPz)){
        a._dismountedAt = performance.now();
        const pushDx = oldRx - a.renderX;
        const pushDz = oldRz - a.renderZ;
        const pushLen = Math.hypot(pushDx, pushDz) || 1;
        const dirX = pushDx / pushLen;
        const dirZ = pushDz / pushLen;

        // Posicionar al jugador fuera del perímetro del túnel (atrás, sobre suelo libre) sin saltos bruscos en Y
        mc.pos[0] = oldRx + 0.5 + dirX * 0.6;
        mc.pos[2] = oldRz + 0.5 + dirZ * 0.6;

        // Inercia de caída parabólica suave a 60 FPS impulsada por la gravedad del juego
        mc.vel[0] = dirX * 2.5;
        mc.vel[2] = dirZ * 2.5;
        mc.vel[1] = -1.8;

        if(!a._warnedKnockoff){
          toast('💥 ¡Te has chocado con un bloque y has caído al suelo!');
          a._warnedKnockoff = true;
          setTimeout(() => { a._warnedKnockoff = false; }, 2500);
        }
      } else {
        mc.pos[0] = targetPx;
        mc.pos[1] = targetPy;
        mc.pos[2] = targetPz;
      }
    }
  }
}

function mcStopAgents(motivo){
  for(const a of mc.agents.values()) a.stop(motivo||'stop');
  return mc.agents.size;
}

function mcPauseAgents(){
  let n=0;
  for(const a of mc.agents.values()) if(a.state==='running'){ a.pause(); n++; }
  return n;
}

function mcResumeAgents(){
  let n=0;
  for(const a of mc.agents.values()) if(a.state==='paused'){ a.resume(); n++; }
  return n;
}

// game.defineAgent(cfg) · registra (o REEMPLAZA) un agente. Mismo contrato que game.onKey: valida, avisa por
// consola y devuelve null si algo falta. Devuelve el handle VIVO → game.agent(id).vars/.stats en F12.
game.defineAgent=function(cfg){
  if(!cfg || typeof cfg!=='object'){ console.warn('game.defineAgent: pasa un objeto, p.ej. game.defineAgent({id:"pintor", onTick(a){…}})'); return null; }
  const id=String(cfg.id==null?'':cfg.id).trim();
  if(!id){ console.warn('game.defineAgent: falta `id` (cadena no vacía)'); return null; }
  if(typeof cfg.onTick!=='function'){ console.warn('game.defineAgent("'+id+'"): falta `onTick(a)`, que es la heurística del agente'); return null; }
  if(!mc.grid){ console.warn('game.defineAgent("'+id+'"): abre el Mundo (🌍) antes de invocar agentes'); return null; }
  const viejo=mc.agents.get(id);
  if(viejo){ viejo.stop('redefinido'); mcAgentFreeMesh(viejo); mc.agents.delete(id); }   // redefinir = reemplazar
  const a=mcAgentMake(id, cfg);
  mc.agents.set(id, a);
  if(cfg.autostart!==false) a.start();
  return a;
};

// game.agents() · tabla de agentes vivos · game.agents.killAll() · game.agents.kill(id) · game.agents.stopAll()
function getAgentsTable(){
  const filas=[...mc.agents.values()].map(a=>({ id:a.id, estado:a.state, pos:a.x+','+a.y+','+a.z,
    ticks:a.stats.ticks, pasos:a.stats.steps, pintados:a.stats.painted, notas:a.stats.notes, meta:a.goal }));
  if(!filas.length) console.log('sin agentes (game.defineAgent)'); else console.table(filas);
  return filas;
}
game.agents=getAgentsTable;
game.agents.killAll=function(){
  const count=mc.agents.size;
  if(!count){ console.log('Sin agentes activos para eliminar.'); return 0; }
  for(const a of [...mc.agents.values()]){ a.stop('killAll'); mcAgentFreeMesh(a); mc.agents.delete(a.id); }
  toast('💀 '+count+' agente(s) eliminado(s)');
  console.log('💀 '+count+' agente(s) eliminado(s) desde game.agents.killAll()');
  return count;
};
game.agents.kill=function(id){
  if(id===undefined || id===null || id==='all' || id==='*') return game.agents.killAll();
  const a=mc.agents.get(String(id));
  if(!a){ console.warn('game.agents.kill: no existe el agente "'+id+'"'); return false; }
  a.stop('killed_from_console'); mcAgentFreeMesh(a); mc.agents.delete(a.id);
  toast('💀 Agente "'+a.name+'" eliminado');
  console.log('💀 Agente "'+a.id+'" ('+a.name+') eliminado desde game.agents.kill("'+id+'")');
  return true;
};
game.agents.stopAll=function(){ const n=mcStopAgents('game.agents.stopAll'); toast(n+' agente(s) detenido(s)'); return n; };
game.agents.get=function(id){ return mc.agents.get(String(id)) || null; };

game.showToastsEnabled = false;
game.agents.showToasts = function(enable){
  if(enable === undefined) return game.showToastsEnabled;
  game.showToastsEnabled = Boolean(enable);
  const status = game.showToastsEnabled ? 'ACTIVADAS' : 'DESACTIVADAS (silenciosas por defecto)';
  console.log('🔔 Notificaciones toast de agentes: ' + status);
  return game.showToastsEnabled;
};
game.showToasts = game.agents.showToasts;

game.agent=function(id){ return mc.agents.get(String(id)) || null; };
game.stopAgents=game.agents.stopAll;
game.removeAgent=game.agents.kill;
game.kill=game.agents.kill;
game.killAll=game.agents.killAll;
window.kill=game.agents.kill;
window.killAll=game.agents.killAll;
window.stopAgents=game.agents.stopAll;
// game.pruneAgentNotes(id) · borra SOLO las notas escritas por ese agente (prefijo «[id] »). Nunca toca las
// notas del usuario ni las de otros agentes.
game.pruneAgentNotes=function(id){
  const pre='['+String(id)+'] '; let n=0;
  for(const k of Object.keys(mc.notes)) if(String(mc.notes[k]).startsWith(pre)){ delete mc.notes[k]; n++; }
  if(n){ mcScheduleSave(); mcUpdateNoteView(); }
  console.log(n+' nota(s) de "'+id+'" borradas'); return n;
};
// game.agentSpeed = multiplicador global de tickMs (0.5 = el doble de rápido; 2 = la mitad). Persiste.
try{ const s=parseFloat(localStorage.getItem('vf_agentSpeed')); if(isFinite(s)) mcAgentSpeed=Math.max(0.1,Math.min(20,s)); }catch(e){}
Object.defineProperty(game,'agentSpeed',{ enumerable:true, get:()=>mcAgentSpeed,
  set:v=>{ v=Math.max(0.1, Math.min(20, isFinite(+v)?+v:1)); mcAgentSpeed=v; try{localStorage.setItem('vf_agentSpeed',v);}catch(e){}
    for(const a of mc.agents.values()) a._nextAt=0; } });
// game.agentSaveMs = cada cuánto (ms) se vuelca el mundo mientras los agentes escriben (mcSaveWorld POSTea el
// mundo ENTERO, así que bajarlo mucho satura la red). Persiste.
try{ const s=parseFloat(localStorage.getItem('vf_agentSaveMs')); if(isFinite(s)) mcAgentSaveMs=Math.max(2000,s); }catch(e){}
Object.defineProperty(game,'agentSaveMs',{ enumerable:true, get:()=>mcAgentSaveMs,
  set:v=>{ v=Math.max(2000, isFinite(+v)?+v:MC_AGENT_SAVE_MS); mcAgentSaveMs=v; try{localStorage.setItem('vf_agentSaveMs',v);}catch(e){} } });
// clic izq = romper · clic der = poner/pintar (solo con pointer-lock activo; el 1er clic solo bloquea el puntero).
// Mantener el botón repite la acción (mcTick, cada MC_ACT_MS) → construir/romper en fila arrastrando la mira.
$('#mc-canvas').addEventListener('mousedown',e=>{
  if(!mc.active || document.pointerLockElement!==mc.canvas) return;
  if(e.button!==0 && e.button!==2) return;
  mc.heldBtn=e.button; mc.actAt=performance.now();
  // Estructuras (clic derecho sobre una ranura-estructura): NO se colocan al pulsar; el fantasma sigue la mira y
  // se estampa al SOLTAR (colocación precisa). R gira 90° la vista-previa. El resto de acciones actúan al pulsar.
  if(mc.tool!=='select' && e.button===2 && mc.slotStruct[mc.sel]) toast('Mantén clic derecho · R gira · suelta coloca');
  else mcDoAction(e.button);
});
window.addEventListener('mouseup',e=>{ if(!mc.active) return;
  if(mc.tool!=='select' && mc.heldBtn===2 && mc.slotStruct[mc.sel] && document.pointerLockElement===mc.canvas) mcPlace();   // soltar = estampa la estructura donde apunta el fantasma
  mc.heldBtn=-1; mcClearPreview(); });
$('#mc-canvas').addEventListener('contextmenu',e=>{ if(mc.active) e.preventDefault(); });

buildPalette();
loadServerAssets();   // llena Assets del servidor (personajes) y Habitaciones (bloques) desde index.json
refreshHabitantesList();
if(!restore()){ setSize(16,16,16); state.voxels=presetBarril(); }
$('#meta-name').value=state.meta.name;
$('#meta-type').value=state.meta.type;
$('#meta-role').textContent=state.meta.role||'';
$('#meta-role').hidden=!state.meta.role;
setTool(state.tool);
isoCv.style.cursor='ns-resize';
syncLayer(); syncColor(); updateZoomLabel(); updateUndoUI(); render(); resizeEdit();
setMode('3d');   // arrancar en Edición 3D (no en Capas)
// URL /map/<nombre>: entrar directo a ese mundo (persistente y propio). Sin /map/ arranca en el editor como siempre.
if(/^\/map\//.test(location.pathname)) openWorld();
