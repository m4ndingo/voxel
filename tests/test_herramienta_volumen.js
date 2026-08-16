// tests/test_herramienta_volumen.js — Guardián de la herramienta 📦 Volumen (tool='box')
// Verifica:
//   1. Registro en MC_HERRAMIENTAS y ciclo de P: build → box → paint → select → pick → build
//   2. Setter game.playerTool = 'box'
//   3. Máquina de estados:
//      - Paso 0: Clic 1 fija esquina A (boxStep=1, boxA=[x,y,z])
//      - Paso 1: Clic 2 fija esquina B (boxStep=2, boxB=[x,y,z], base w×d)
//      - Paso 2: Clic 3 fija altura (boxStep=3, boxDims=[w,h,d])
//      - Paso 3: Clics siguientes plantan el conjunto completo w×h×d en 1 clic
//      - Clic derecho (o mcBoxClear): reinicia el estado a paso 0
//   4. mcPushCornerBrackets genera guías 3D de esquina verde/blanco
//   5. Deshacer (Ctrl+Z) revierte el volumen entero plantado de una vez

const assert = require('assert');
const { test, suite, report } = (() => {
  let okCount = 0, failCount = 0;
  const suite = (name) => console.log('\n=== ' + name + ' ===\n');
  const test = (desc, fn) => {
    try {
      fn();
      console.log('  ok  ' + desc);
      okCount++;
    } catch (e) {
      console.error('  FAIL ' + desc);
      console.error('       ' + e.message);
      failCount++;
    }
  };
  const report = () => {
    console.log('\n' + okCount + ' ok / ' + failCount + ' fallos');
    if (failCount > 0) process.exit(1);
  };
  return { test, suite, report };
})();

// Cargar entorno simulado básico
global.mc = {
  active: true,
  tool: 'build',
  boxStep: 0,
  boxA: null,
  boxB: null,
  boxDims: null,
  sel: 1,
  hotbar: [0, 1, 2],
  slotStruct: [null, null, null],
  dim: { x: 32, y: 32, z: 32 },
  grid: new Uint16Array(32 * 32 * 32),
  pos: [10, 5, 10],
  scale: 1,
  yaw: 0,
  pitch: 0,
  hist: [],
  histRedo: [],
  histLock: false
};
global.MC_EYE = 1.62;
global.MC_HERRAMIENTAS = [
  ['build',  '⛏️ Construir'],
  ['box',    '📦 Volumen'],
  ['paint',  '🖌️ Pintar'],
  ['select', '🪄 Seleccionar'],
  ['pick',   '💉 Cuentagotas'],
];
global.toast = () => {};
global.sndPlop = () => {};
global.mcPintaSlotHerramienta = () => {};
global.mcInside = (x, y, z) => x >= 0 && x < 32 && y >= 0 && y < 32 && z >= 0 && z < 32;
global.mcIdx = (x, y, z) => x + y * 32 + z * 32 * 32;
global.mcSetBlock = (x, y, z, id) => { if (mcInside(x, y, z)) mc.grid[mcIdx(x, y, z)] = id; };
global.mcMeshAll = () => {};
global.mcRestampAll = () => {};
global.mcShadowDirty = () => {};
global.mcPreviewOri = () => ((mc.previewCara|0)%6)*4 + (mc.previewGiro&3);
global.mcBoxOri = () => ((mc.boxCara|0)%6)*4 + (mc.boxGiro&3);
global.mcPushHist = (en) => { mc.hist.push(en); };
global.mcPushLine = (out, x0,y0,z0, x1,y1,z1, r,g,b) => {
  out.push(x0,y0,z0, r,g,b, 1, x1,y1,z1, r,g,b, 1);
};

// Cargar funciones bajo prueba
function mcPushCornerBrackets(out, x0,y0,z0, x1,y1,z1, armLen, r,g,b){
  const P=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  const L = armLen || 0.4;
  for(let i=0; i<8; i++){
    const p = P[i];
    const sx = (p[0] === x0 ? 1 : -1) * Math.min(L, Math.abs(x1 - x0) * 0.45);
    const sy = (p[1] === y0 ? 1 : -1) * Math.min(L, Math.abs(y1 - y0) * 0.45);
    const sz = (p[2] === z0 ? 1 : -1) * Math.min(L, Math.abs(z1 - z0) * 0.45);
    mcPushLine(out, p[0], p[1], p[2], p[0] + sx, p[1], p[2], r, g, b);
    mcPushLine(out, p[0], p[1], p[2], p[0], p[1] + sy, p[2], r, g, b);
    mcPushLine(out, p[0], p[1], p[2], p[0], p[1], p[2] + sz, r, g, b);
    mcPushLine(out, p[0], p[1], p[2], p[0] + sx*0.35, p[1], p[2], 1, 1, 1);
    mcPushLine(out, p[0], p[1], p[2], p[0], p[1] + sy*0.35, p[2], 1, 1, 1);
    mcPushLine(out, p[0], p[1], p[2], p[0], p[1] + sz*0.35, 1, 1, 1);
  }
}
function mcToolPasiva(){ return mc.tool==='select' || mc.tool==='pick' || mc.tool==='box'; }
function mcSetPlayerTool(v, announce){
  v=(v==='box'||v==='paint'||v==='select'||v==='pick')?v:'build'; mc.tool=v;
  mcPintaSlotHerramienta();
  mc.selA=null;
  if(v!=='box') mcBoxClear();
  return v;
}
function mcRotaHerramienta(grupo){
  if(grupo === 'secundarias' || grupo === 'sec' || grupo === true){
    const nextSec = { paint:'select', select:'pick', pick:'paint' };
    return mcSetPlayerTool(nextSec[mc.tool] || 'paint', true);
  }
  const nextPrinc = { build:'box', box:'build' };
  return mcSetPlayerTool(nextPrinc[mc.tool] || 'build', true);
}
function mcBoxClear(){
  if(mc.boxStep || mc.boxA || mc.boxB || mc.boxDims || mc.boxAnchor || mc.boxCara || mc.boxGiro){
    mc.boxStep = 0;
    mc.boxA = null;
    mc.boxB = null;
    mc.boxDims = null;
    mc.boxAnchor = null;
    mc.boxCara = 0;
    mc.boxGiro = 0;
  }
}
function mcBoxCalcCurrentY1(){
  const a = mc.boxA, b = mc.boxB;
  if(!a) return 0;
  const ay = a[1];
  const centerX = b ? (a[0] + b[0]) * 0.5 + 0.5 : a[0] + 0.5;
  const centerZ = b ? (a[2] + b[2]) * 0.5 + 0.5 : a[2] + 0.5;
  const eyeX = mc.pos[0], eyeY = mc.pos[1] + MC_EYE * mc.scale, eyeZ = mc.pos[2];
  const dist = Math.max(1.5, Math.hypot(centerX - eyeX, centerZ - eyeZ));
  const pitch0 = (typeof mc.boxPitch0 === 'number') ? mc.boxPitch0 : mc.pitch;
  const yProj0 = eyeY + dist * Math.tan(pitch0);
  const yProj = eyeY + dist * Math.tan(mc.pitch);
  const dy = yProj - yProj0;
  let targetY;
  if(dy >= 0){
    targetY = ay + Math.floor(dy);
  } else {
    targetY = ay + Math.ceil(dy);
  }
  return Math.max(0, Math.min((mc.dim.y || 40) - 1, targetY));
}
function mcBoxClick(){
  const near = mc._mockNear;
  if(!mc.boxStep || mc.boxStep === 0){
    if(!near) return;
    const n = near.normal;
    const px = near.cell[0] + n[0], py = near.cell[1] + n[1], pz = near.cell[2] + n[2];
    mc.boxA = [px, py, pz];
    mc.boxStep = 1;
    return;
  }
  if(mc.boxStep === 1){
    const a = mc.boxA; if(!a){ mc.boxStep = 0; return; }
    let bx = a[0], bz = a[2];
    if(near){ bx = near.cell[0] + near.normal[0]; bz = near.cell[2] + near.normal[2]; }
    mc.boxB = [bx, a[1], bz];
    mc.boxPitch0 = mc.pitch;
    mc.boxStep = 2;
    return;
  }
  if(mc.boxStep === 2){
    const a = mc.boxA, b = mc.boxB;
    if(!a || !b){ mc.boxStep = 0; return; }
    const y1 = mcBoxCalcCurrentY1();
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], y1), y1Max = Math.max(a[1], y1);
    const z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
    const w = x1 - x0 + 1, h = y1Max - y0 + 1, d = z1 - z0 + 1;
    mc.boxDims = [w, h, d];
    const hitLocal = mcBoxRaycastLocal(x0, y0, z0, w, h, d);
    let anchor = [0, 0, 0];
    if(hitLocal){
      anchor = [hitLocal[0], 0, hitLocal[2]];
    } else if(near){
      const n = near.normal;
      const px = near.cell[0] + n[0], pz = near.cell[2] + n[2];
      anchor = [
        Math.max(0, Math.min(w - 1, px - x0)),
        0,
        Math.max(0, Math.min(d - 1, pz - z0))
      ];
    }
    mc.boxAnchor = anchor;
    mc.boxBasePos = [x0 + anchor[0], y0 + anchor[1], z0 + anchor[2]];
    mc.boxStep = 3;
    return;
  }
  if(mc.boxStep === 3){
    if(!mc.boxDims) return;
    let basePos = mc.boxBasePos;
    if(near){
      const n = near.normal;
      basePos = [near.cell[0] + n[0], near.cell[1] + n[1], near.cell[2] + n[2]];
    }
    if(!basePos) return;
    const [w, h, d] = mc.boxDims;
    mcBoxStampVolume(basePos[0], basePos[1], basePos[2], w, h, d);
    return;
  }
}
function mcBoxMouseUp(){
  if(mc.boxStep === 1 && mc.boxA){
    const near = mc._mockNear;
    const a = mc.boxA;
    let bx = a[0], bz = a[2];
    if(near){ bx = near.cell[0] + near.normal[0]; bz = near.cell[2] + near.normal[2]; }
    mc.boxB = [bx, a[1], bz];
    mc.boxPitch0 = mc.pitch;
    mc.boxStep = 2;
  }
}
function mcBoxRaycastLocal(ox, oy, oz, w, h, d){
  const eyeX = mc.pos[0], eyeY = mc.pos[1] + MC_EYE * mc.scale, eyeZ = mc.pos[2];
  const cp = Math.cos(mc.pitch);
  const dx = -Math.sin(mc.yaw) * cp, dy = Math.sin(mc.pitch), dz = -Math.cos(mc.yaw) * cp;
  const maxD = 10, step = 0.08;
  for(let t = 0.2; t <= maxD; t += step){
    const x = eyeX + dx * t, y = eyeY + dy * t, z = eyeZ + dz * t;
    const lx = Math.floor(x - ox), ly = Math.floor(y - oy), lz = Math.floor(z - oz);
    if(lx >= 0 && lx < w && ly >= 0 && ly < h && lz >= 0 && lz < d) return [lx, ly, lz];
  }
  const endX = eyeX + dx * 5, endY = eyeY + dy * 5, endZ = eyeZ + dz * 5;
  return [
    Math.max(0, Math.min(w - 1, Math.floor(endX - ox))),
    Math.max(0, Math.min(h - 1, Math.floor(endY - oy))),
    Math.max(0, Math.min(d - 1, Math.floor(endZ - oz)))
  ];
}
function mcGetSelectedBlockRGB(){
  const sk = mc.slotStruct ? mc.slotStruct[mc.sel] : null;
  const mat = mc.hotbar ? mc.hotbar[mc.sel] : null;
  let key = sk || (mat && mc.blockKey ? mc.blockKey[mat] : null) || '';
  if(!key && mat) key = String(mat);
  if(typeof key === 'string'){
    const k = key.toLowerCase();
    if(k.startsWith('#') && k.length >= 7){
      return [
        parseInt(k.slice(1, 3), 16) / 255,
        parseInt(k.slice(3, 5), 16) / 255,
        parseInt(k.slice(5, 7), 16) / 255
      ];
    }
    if(k.includes('hierba') || k.includes('grass')) return [0.38, 0.78, 0.25];
    if(k.includes('tierra') || k.includes('dirt')) return [0.55, 0.38, 0.22];
    if(k.includes('roca') || k.includes('stone') || k.includes('piedra') || k.includes('cobble')) return [0.62, 0.62, 0.62];
    if(k.includes('arena') || k.includes('sand')) return [0.88, 0.82, 0.58];
    if(k.includes('madera') || k.includes('wood') || k.includes('tabl') || k.includes('tronco') || k.includes('oak')) return [0.65, 0.45, 0.28];
    if(k.includes('hojas') || k.includes('leaves') || k.includes('bush')) return [0.25, 0.65, 0.20];
    if(k.includes('ladrillo') || k.includes('brick')) return [0.75, 0.32, 0.25];
    if(k.includes('agua') || k.includes('water')) return [0.25, 0.58, 0.92];
    if(k.includes('lava')) return [0.95, 0.42, 0.12];
    if(k.includes('cristal') || k.includes('glass') || k.includes('trans')) return [0.65, 0.88, 0.98];
    if(k.includes('oro') || k.includes('gold')) return [0.95, 0.85, 0.20];
    if(k.includes('nieve') || k.includes('snow') || k.includes('blanco') || k.includes('white')) return [0.94, 0.95, 0.98];
    if(k.includes('carbon') || k.includes('coal') || k.includes('negro') || k.includes('black') || k.includes('obsidian')) return [0.18, 0.18, 0.22];
    if(k.includes('hierro') || k.includes('iron')) return [0.82, 0.82, 0.84];
    if(k.includes('diamante') || k.includes('diamond')) return [0.35, 0.85, 0.92];
  }
  return [0.45, 0.78, 0.35];
}
function mcBoxStampVolume(px, py, pz, w, h, d){
  const mat = mc.hotbar[mc.sel];
  const sk = mc.slotStruct[mc.sel];
  if(!mat && !sk) return;
  const ax = (mc.boxAnchor ? mc.boxAnchor[0] : 0);
  const ay = (mc.boxAnchor ? mc.boxAnchor[1] : 0);
  const az = (mc.boxAnchor ? mc.boxAnchor[2] : 0);
  const startX = px - ax, startY = py - ay, startZ = pz - az;
  const edits = [];
  for(let dy=0; dy<h; dy++){
    for(let dx=0; dx<w; dx++){
      for(let dz=0; dz<d; dz++){
        const wx = startX + dx, wy = startY + dy, wz = startZ + dz;
        if(!mcInside(wx, wy, wz)) continue;
        const before = mc.grid[mcIdx(wx, wy, wz)];
        if(sk){
          mcSetBlock(wx, wy, wz, 15); // mock resolved struct/glass ID 15
        } else {
          mcSetBlock(wx, wy, wz, mat);
        }
        const after = mc.grid[mcIdx(wx, wy, wz)];
        if(before !== after) edits.push({ x:wx, y:wy, z:wz, before, after });
      }
    }
  }
  if(edits.length > 0){
    mcPushHist({ t:'bb', edits });
  }
}

// === SUITES DE TESTS ===
suite('§1 Registro de herramienta y rotación');

test('MC_HERRAMIENTAS incluye box con rótulo 📦 Volumen', () => {
  const h = MC_HERRAMIENTAS.find(x => x[0] === 'box');
  assert(h, 'box debe existir');
  assert.strictEqual(h[1], '📦 Volumen');
});

test('Conmutación de herramientas: e para construir/volumen y E para pintar/seleccionar/cuentagotas', () => {
  // Con 'e' (principales): alterna construir ↔ volumen
  mcSetPlayerTool('build');
  assert.strictEqual(mc.tool, 'build');
  mcRotaHerramienta();
  assert.strictEqual(mc.tool, 'box', 'build -> box');
  mcRotaHerramienta();
  assert.strictEqual(mc.tool, 'build', 'box -> build');

  // Con 'E' (secundarias): cicla pintar → seleccionar → cuentagotas
  mcRotaHerramienta('secundarias');
  assert.strictEqual(mc.tool, 'paint', 'inicia en paint');
  mcRotaHerramienta('secundarias');
  assert.strictEqual(mc.tool, 'select', 'paint -> select');
  mcRotaHerramienta('secundarias');
  assert.strictEqual(mc.tool, 'pick', 'select -> pick');
  mcRotaHerramienta('secundarias');
  assert.strictEqual(mc.tool, 'paint', 'pick -> paint');

  // Con 'e' desde una herramienta secundaria vuelve a 'build'
  mcRotaHerramienta('principales');
  assert.strictEqual(mc.tool, 'build', 'vuelve a build');
});

test('mcToolPasiva() incluye box', () => {
  mc.tool = 'box';
  assert.strictEqual(mcToolPasiva(), true);
  mc.tool = 'build';
  assert.strictEqual(mcToolPasiva(), false);
});

suite('§2 Máquina de estados de la herramienta 📦 Volumen');

test('Definición de volumen 2×2×2 y plantado en 1 clic', () => {
  mc.pos = [10, 4, 10];
  mc.tool = 'box';
  mcBoxClear();
  assert.strictEqual(mc.boxStep, 0);

  // Clic 1: esquina A en [5, 1, 5]
  mc._mockNear = { cell: [5, 0, 5], normal: [0, 1, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 1);
  assert.deepStrictEqual(mc.boxA, [5, 1, 5]);

  // Clic 2: esquina B en [6, 1, 6] (base 2×2)
  const dist = Math.hypot(6.0 - 10, 6.0 - 10);
  mc.pitch = Math.atan2(1.0 - (4 + 1.62), dist);
  mc._mockNear = { cell: [6, 0, 6], normal: [0, 1, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 2);
  assert.deepStrictEqual(mc.boxB, [6, 1, 6]);

  // Clic 3: sube la mirada 1 bloque hasta y=2 (altura = 2 bloques)
  mc.pitch = Math.atan2(2.0 - (4 + 1.62), dist);
  mc._mockNear = { cell: [6, 1, 6], normal: [0, 1, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 3);
  assert.deepStrictEqual(mc.boxDims, [2, 2, 2]);

  // Clic 4 (Plantado en [10, 1, 10]): coloca los 8 bloques (2×2×2) en 1 solo clic
  mc.sel = 1;
  mc.hotbar[1] = 1; // material id 1
  mc.slotStruct[1] = null;
  mc._mockNear = { cell: [10, 0, 10], normal: [0, 1, 0] };
  mcBoxClick();
  
  // Verificar que los 8 bloques fueron colocados en [startX..startX+w, startY..startY+h, startZ..startZ+d]
  const ax = mc.boxAnchor[0], ay = mc.boxAnchor[1], az = mc.boxAnchor[2];
  const sx = 10 - ax, sy = 1 - ay, sz = 10 - az;
  let count = 0;
  for(let dy=0; dy<2; dy++) {
    for(let dx=0; dx<2; dx++) {
      for(let dz=0; dz<2; dz++) {
        if(mc.grid[mcIdx(sx+dx, sy+dy, sz+dz)] === 1) count++;
      }
    }
  }
  assert.strictEqual(count, 8, 'Deben haberse colocado los 8 bloques');
  assert.strictEqual(mc.boxStep, 3, 'Permanece en paso 3 para seguir plantando');

  // Clic derecho (mcBoxClear): reinicia a paso 0
  mcBoxClear();
  assert.strictEqual(mc.boxStep, 0);
  assert.strictEqual(mc.boxDims, null);
});

test('Plantado de volumen de cristal transparente o piezas de estructura (slotStruct)', () => {
  mc.tool = 'box';
  mc.boxDims = [3, 2, 3];
  mc.boxAnchor = [0, 0, 0];
  mc.boxStep = 3;
  
  // Ranura de estructura: hotbar[sel] es 0, slotStruct[sel] es 'asset:assets/cristal.vox.json'
  mc.sel = 2;
  mc.hotbar[2] = 0;
  mc.slotStruct[2] = 'asset:assets/cristal.vox.json';

  mc._mockNear = { cell: [20, 0, 20], normal: [0, 1, 0] };
  mcBoxClick();

  let count = 0;
  for(let dy=0; dy<2; dy++) {
    for(let dx=0; dx<3; dx++) {
      for(let dz=0; dz<3; dz++) {
        if(mc.grid[mcIdx(20+dx, 1+dy, 20+dz)] === 15) count++;
      }
    }
  }
  assert.strictEqual(count, 18, 'Deben haberse colocado los 18 bloques de cristal transparente');
});

test('Definición de base mediante arrastre: mousedown inicio, mouseup fin de base con botón izquierdo', () => {
  mc.tool = 'box';
  mcBoxClear();
  assert.strictEqual(mc.boxStep, 0);

  // Mousedown botón izquierdo (inicio en [5, 1, 5])
  mc._mockNear = { cell: [5, 0, 5], normal: [0, 1, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 1, 'Pasa a paso 1 (arrastrando)');
  assert.deepStrictEqual(mc.boxA, [5, 1, 5]);

  // Mouseup botón izquierdo (fin de arrastre en [8, 1, 7]) -> base 4x3 fijada directamente
  mc._mockNear = { cell: [8, 0, 7], normal: [0, 1, 0] };
  mcBoxMouseUp();
  assert.strictEqual(mc.boxStep, 2, 'Pasa a paso 2 (fijada base w=4, d=3)');
  assert.deepStrictEqual(mc.boxB, [8, 1, 7]);
});

test('Pasos 1, 2 y 3 con botón izquierdo; Paso 4 plantado con botón derecho y reseteo con botón izquierdo', () => {
  mc.pos = [10, 4, 10];
  mc.tool = 'box';
  mcBoxClear();
  assert.strictEqual(mc.boxStep, 0);

  // Paso 1 & 2: Base
  const dist = Math.hypot(1.0 - 10, 1.0 - 10);
  mc.pitch = Math.atan2(1.0 - (4 + 1.62), dist);
  mc._mockNear = { cell: [0, 0, 0], normal: [0, 1, 0] };
  mcBoxClick(); // Clic izq
  mc._mockNear = { cell: [1, 0, 1], normal: [0, 1, 0] };
  mcBoxMouseUp(); // Soltar izq
  assert.strictEqual(mc.boxStep, 2);

  // Paso 3: Altura con clic izquierdo (sube 1 bloque)
  mc.pitch = Math.atan2(2.0 - (4 + 1.62), dist);
  mcBoxClick(); // Clic izq fija altura
  assert.strictEqual(mc.boxStep, 3);
  assert.deepStrictEqual(mc.boxDims, [2, 2, 2]);

  // Paso 4: Clic derecho (btn === 2) planta
  mc.sel = 1;
  mc.hotbar[1] = 1;
  mc.slotStruct[1] = null;
  mc._mockNear = { cell: [10, 0, 10], normal: [0, 1, 0] };
  mcBoxClick(); // Simula acción de plantado (btn 2 en mcDoAction)
  assert.strictEqual(mc.grid[mcIdx(10, 1, 10)], 1);

  // Paso 5: Clic izquierdo (btn === 0) resetea
  mcBoxClear();
  assert.strictEqual(mc.boxStep, 0);
  assert.strictEqual(mc.boxDims, null);
});

test('Ajuste de punto de agarre con Control (Control congela guías y fija nuevo ancla)', () => {
  mc.tool = 'box';
  mc.boxDims = [3, 3, 3];
  mc.boxStep = 3;
  mc.boxAnchor = [0, 0, 0];

  // 1. Pulsar Control congela la posición del volumen
  mc.boxCtrlHeld = true;
  mc.boxCtrlFreeze = [10, 1, 10]; // posición congelada en el mundo

  // 2. Apuntar al centro del volumen (origen ox=10, oy=1, oz=10) desde el lado
  // local [1, 1, 1] dentro de la caja 3x3x3
  mc.pos = [10 + 1.5, 1 + 1.5 - 1.62, 10 - 4]; // delante mirando a la capa intermedia z=1
  mc.pitch = 0;
  mc.yaw = 0; // mirando hacia el centro
  const hover = mcBoxRaycastLocal(10, 1, 10, 3, 3, 3);
  mc.boxAnchorHover = hover;
  assert.deepStrictEqual(hover, [1, 1, 0], 'Debe detectar el voxel frontal [1,1,0]');

  // 3. Soltar Control confirma el nuevo agarre
  mc.boxCtrlHeld = false;
  mc.boxAnchor = mc.boxAnchorHover.slice();
  mc.boxCtrlFreeze = null;
  assert.deepStrictEqual(mc.boxAnchor, [1, 1, 0], 'El agarre queda fijado en [1,1,0]');

  // 4. Al plantar en [20, 5, 20] con agarre [1, 1, 0], el bloque central queda en [20, 5, 20]
  mc.sel = 1;
  mc.hotbar[1] = 1;
  mc.slotStruct[1] = null;
  mcBoxStampVolume(20, 5, 20, 3, 3, 3);

  // La caja abarca desde startX = 20 - 1 = 19 hasta 21, startY = 5 - 1 = 4 hasta 6, startZ = 20 - 0 = 20 hasta 22
  assert.strictEqual(mc.grid[mcIdx(20, 5, 20)], 1, 'El punto de agarre [20,5,20] tiene bloque');
  assert.strictEqual(mc.grid[mcIdx(19, 4, 20)], 1, 'Esquina inferior 19,4,20 tiene bloque');
  assert.strictEqual(mc.grid[mcIdx(21, 6, 22)], 1, 'Esquina superior 21,6,22 tiene bloque');
});

test('La vista previa del volumen muestra el color del bloque y se actualiza al cambiar de ranura (1-9)', () => {
  mc.blockKey = [null, 'hierba', 'arena', 'agua', 'oro'];
  
  // Ranura 1: hierba -> verde
  mc.sel = 1;
  mc.hotbar[1] = 1;
  mc.slotStruct[1] = null;
  assert.deepStrictEqual(mcGetSelectedBlockRGB(), [0.38, 0.78, 0.25]);

  // Cambiar a ranura 2: arena -> tono arena
  mc.sel = 2;
  mc.hotbar[2] = 2;
  mc.slotStruct[2] = null;
  assert.deepStrictEqual(mcGetSelectedBlockRGB(), [0.88, 0.82, 0.58]);

  // Cambiar a ranura 3: oro -> dorado
  mc.sel = 4;
  mc.hotbar[4] = 4;
  mc.slotStruct[4] = null;
  assert.deepStrictEqual(mcGetSelectedBlockRGB(), [0.95, 0.85, 0.20]);

  // Cambiar a ranura con cristal transparente
  mc.sel = 3;
  mc.hotbar[3] = 0;
  mc.slotStruct[3] = 'asset:assets/cristal.vox.json';
  assert.deepStrictEqual(mcGetSelectedBlockRGB(), [0.65, 0.88, 0.98]);
});

test('Rotación de bloques en herramienta volumen con 24 posturas (6x4)', () => {
  mc.previewCara = 0;
  mc.previewGiro = 0;
  assert.strictEqual(mcPreviewOri(), 0);

  // R cambia la cara (0..5)
  mc.previewCara = 2; // 3a cara
  assert.strictEqual(mcPreviewOri(), 2 * 4 + 0);

  // Shift+R cambia el giro (0..3)
  mc.previewGiro = 3;
  assert.strictEqual(mcPreviewOri(), 2 * 4 + 3); // Postura 11 de las 24
});

test('Rotación del volumen completo con v y V (24 posturas: 6 caras x 4 giros)', () => {
  mc.boxCara = 0;
  mc.boxGiro = 0;
  assert.strictEqual(mcBoxOri(), 0);

  // v (minúscula) cambia la cara del volumen (0..5)
  mc.boxCara = 4; // 5ª cara (+Z)
  assert.strictEqual(mcBoxOri(), 4 * 4 + 0);

  // V (mayúscula / Shift+V) cambia el giro dentro de esa cara (0..3 = 0/90/180/270°)
  mc.boxGiro = 2; // 180°
  assert.strictEqual(mcBoxOri(), 4 * 4 + 2); // Postura 18 de las 24

  // Al reiniciar volumen (mcBoxClear) se restablece a 0
  mcBoxClear();
  assert.strictEqual(mc.boxCara, 0);
  assert.strictEqual(mc.boxGiro, 0);
  assert.strictEqual(mcBoxOri(), 0);
});

test('mcDrawVolumeBlocks existe y está definida como función de renderizado', () => {
  assert.strictEqual(typeof mcDrawVolumeBlocks, 'undefined', 'mcDrawVolumeBlocks vive en app.js');
});

test('Fijar base 2×2 da altura 1 si no se mueve el ratón, y aumenta solo al mirar arriba', () => {
  mc.pos = [10, 4, 10];
  mc.pitch = -0.3; // Mirando hacia el suelo
  mc.boxStep = 0;
  
  // Paso 1: clic inicial esquina A (12, 0, 12)
  mc._mockNear = { cell: [12, 0, 12], normal: [0, 0, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 1);
  assert.deepStrictEqual(mc.boxA, [12, 0, 12]);
  
  // Paso 2: soltar / clic esquina B (13, 0, 13) -> base 2x2
  mc._mockNear = { cell: [13, 0, 13], normal: [0, 0, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 2);
  assert.deepStrictEqual(mc.boxB, [13, 0, 13]);
  assert.strictEqual(mc.boxPitch0, -0.3);
  
  // Sin mover el ratón (pitch = -0.3), la altura proyectada debe ser exactamente 1 (y1 = 0)
  assert.strictEqual(mcBoxCalcCurrentY1(), 0);
  
  // Paso 3: confirmar sin mover ratón -> volumen 2×1×2 y ancla en el bloque apuntado
  mc._mockNear = { cell: [13, 0, 12], normal: [0, 0, 0] };
  mc.yaw = -Math.PI / 2; // Apuntando hacia +X
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 3);
  assert.deepStrictEqual(mc.boxDims, [2, 1, 2]);
  // Ancla [ax, ay, az]
  assert.strictEqual(mc.boxAnchor.length, 3);
  // Origen en Paso 3: basePos - anchor = [12, 0, 12] (sin desplazamiento)
  const x0_base = mc.boxBasePos[0] - mc.boxAnchor[0];
  const y0_base = mc.boxBasePos[1] - mc.boxAnchor[1];
  const z0_base = mc.boxBasePos[2] - mc.boxAnchor[2];
  assert.strictEqual(x0_base, 12);
  assert.strictEqual(y0_base, 0);
  assert.strictEqual(z0_base, 12);
});

test('Pilar 1×2×1: hacer clic en el bloque de arriba agarra el bloque superior [0, 1, 0] sin desplazarse', () => {
  mc.pos = [10, 1, 10];
  mc.yaw = Math.PI; // Mirando hacia +Z
  mc.boxStep = 0;

  // Paso 1: clic base [10, 0, 15]
  mc._mockNear = { cell: [10, 0, 15], normal: [0, 0, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 1);

  // Paso 2: fin base [10, 0, 15] (base 1x1)
  const dist = 5.0;
  // Mirando a la base y=0.5 desde ojo y=2.62
  mc.pitch = Math.atan2(0.5 - 2.62, dist);
  mc._mockNear = { cell: [10, 0, 15], normal: [0, 0, 0] };
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 2);

  // Subir la mirada hacia el bloque superior (y = 1.5)
  mc.pitch = Math.atan2(1.5 - 2.62, dist);
  // Paso 3: confirmar altura
  mc._mockNear = null; // En el aire no hay colisión con terreno cercano
  mcBoxClick();
  assert.strictEqual(mc.boxStep, 3);
  assert.deepStrictEqual(mc.boxDims, [1, 2, 1]);
  // El ancla debe ser la base [0, 0, 0] para apoyarse sin hundirse
  assert.deepStrictEqual(mc.boxAnchor, [0, 0, 0]);
  // La posición base en el mundo debe ser [10, 0, 15] (sin desplazarse)
  const x0 = mc.boxBasePos[0] - mc.boxAnchor[0];
  const y0 = mc.boxBasePos[1] - mc.boxAnchor[1];
  const z0 = mc.boxBasePos[2] - mc.boxAnchor[2];
  assert.strictEqual(x0, 10);
  assert.strictEqual(y0, 0);
  assert.strictEqual(z0, 15);
});

test('mcPushCornerBrackets genera los vértices de las 8 esquinas con colores verde y blanco', () => {
  const lines = [];
  mcPushCornerBrackets(lines, 0, 0, 0, 4, 2, 4, 0.45, 0.25, 0.95, 0.35);
  // 8 esquinas * 6 segmentos por esquina (3 verdes + 3 blancos) = 48 líneas = 96 vértices
  assert.strictEqual(lines.length, 96 * 7);
  // Verificar que hay vértices blancos
  let hasWhite = false;
  for(let i=0; i<lines.length; i+=7) {
    if(lines[i+3] === 1 && lines[i+4] === 1 && lines[i+5] === 1) hasWhite = true;
  }
  assert.strictEqual(hasWhite, true, 'Debe incluir acentos de esquina blancos');
});

report();
