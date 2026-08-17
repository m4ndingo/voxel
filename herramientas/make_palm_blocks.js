#!/usr/bin/env node
// Genera los materiales de palmera hiperrealistas para el bioma tropical:
// 1. 'tronco_palmera' (estípite anillado con corteza fibrosa y núcleo poroso)
// 2. 'hojas_palmera' (frondas pinnadas tropicales con calados y nervaduras)
// 3. 'coco' (nuez de coco con fibras tostadas y los 3 ojos germinativos)
//
// +Z es ARRIBA (CUBE_FACES en app.js).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const INDEX_PATH = path.join(ASSETS_DIR, 'index.json');
const N = 16;

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (clampByte(r) << 16) + (clampByte(g) << 8) + clampByte(b)).toString(16).slice(1);
}

function mix(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 * (1 - t) + r2 * t, g1 * (1 - t) + g2 * t, b1 * (1 - t) + b2 * t);
}

function jitter(hex, amt, rnd) {
  const [r, g, b] = hexToRgb(hex);
  const delta = (rnd() * 2 - 1) * amt;
  return rgbToHex(r + delta, g + delta, b + delta);
}

// ──────────────────────────────────────────────────────────────────────────
// 1. TRONCO DE PALMERA (tronco_palmera)
// ──────────────────────────────────────────────────────────────────────────
function generatePalmTrunk() {
  const rnd = mulberry32(982341);
  const voxels = {};

  // Paleta de corteza y anillos
  const BARK_BASE = '#7a5230';
  const BARK_DARK = '#4d3019';
  const BARK_DEEP = '#362010';
  const BARK_LIGHT = '#9c6f45';
  const BARK_FIBER = '#b08152';

  // Paleta de núcleo (tapas superior e inferior)
  const CORE_CENTER = '#cba374';
  const CORE_INNER = '#b89060';
  const CORE_RING = '#8f6840';
  const CORE_OUTER = '#4a2f17';

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        // Solo modelamos la superficie externa para texturas de bloque
        const isFace = (x === 0 || x === N - 1 || y === 0 || y === N - 1 || z === 0 || z === N - 1);
        if (!isFace) continue;

        let col;

        if (z === N - 1 || z === 0) {
          // Tapas de corte (+Z y -Z)
          const dx = x - 7.5;
          const dy = y - 7.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          if (dist > 7.0) {
            col = BARK_DARK;
          } else if (dist > 5.5) {
            col = CORE_OUTER;
          } else if (dist > 3.8) {
            // Anillo de fibras
            const ringNoise = Math.sin(angle * 8) * 0.3;
            col = (dist + ringNoise > 4.6) ? CORE_RING : CORE_INNER;
          } else {
            // Núcleo poroso
            const pore = Math.sin(x * 3.7 + y * 4.2) > 0.5;
            col = pore ? CORE_INNER : CORE_CENTER;
          }
          col = jitter(col, 8, rnd);
        } else {
          // Lados de la corteza (+X, -X, +Y, -Y)
          // Anillos de crecimiento cada 3 o 4 vóxeles en Z
          const ringZ = z % 4;
          const isRingGroove = (ringZ === 0);
          const isRingLip = (ringZ === 3);

          // Cicatriz foliar romboidal
          const u = (x === 0 || x === N - 1) ? y : x;
          const diamond = Math.abs((u % 8) - 4) + Math.abs(ringZ - 2);

          if (isRingGroove) {
            col = (diamond <= 1) ? BARK_DEEP : BARK_DARK;
          } else if (isRingLip) {
            col = (diamond <= 2) ? BARK_LIGHT : BARK_FIBER;
          } else {
            col = (diamond <= 2) ? BARK_BASE : mix(BARK_BASE, BARK_DARK, 0.4);
          }

          // Fibras verticales finas
          if (u % 2 === 0 && ringZ !== 0) {
            col = mix(col, BARK_FIBER, 0.25);
          }

          col = jitter(col, 10, rnd);
        }

        voxels[`${x},${y},${z}`] = col;
      }
    }
  }

  return {
    format: 'voxelforge-1',
    size: { x: N, y: N, z: N },
    meta: {
      name: 'Tronco Palmera',
      type: 'textura',
      role: 'Bloque · tronco de palmera tropical',
      icon: '🌴',
      description: 'Estípite de palmera con corteza anillada y fibras tropicales.',
      alias: 'tronco_palmera'
    },
    voxels
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 2. HOJAS DE PALMERA (hojas_palmera)
// ──────────────────────────────────────────────────────────────────────────
function generatePalmLeaves() {
  const rnd = mulberry32(456123);
  const voxels = {};

  const LEAF_DARK = '#1f5927';
  const LEAF_MID = '#2d7a38';
  const LEAF_VIBRANT = '#3da34c';
  const LEAF_LIME = '#5ec260';
  const LEAF_GOLD = '#8bc34a';
  const STEM_COLOR = '#a2d149';

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const isFace = (x === 0 || x === N - 1 || y === 0 || y === N - 1 || z === 0 || z === N - 1);
        if (!isFace) continue;

        // Proyección según cara
        let u, v;
        if (z === 0 || z === N - 1) { u = x; v = y; }
        else if (x === 0 || x === N - 1) { u = y; v = z; }
        else { u = x; v = z; }

        // Nervadura central diagonal / radial
        const diagDist = Math.abs(u - v);
        const isStem = (diagDist === 0 || (diagDist === 1 && (u + v) % 2 === 0));

        // Patrón de folíolos pinnados (peine de hojas)
        const leaflet = ((u + v * 2) % 3 === 0);
        const leaflet2 = ((u * 2 - v + 16) % 4 === 0);

        // Calados / huecos orgánicos con alpha test (~18% de recorte para frondas ligeras)
        const holeNoise = Math.sin(u * 1.5 + v * 2.3) + Math.cos(u * 2.1 - v * 1.7);
        const isHole = (holeNoise < -1.2 && !isStem && (u === 0 || u === N-1 || v === 0 || v === N-1 || (u % 3 === 0 && v % 3 === 0)));

        if (isHole) continue; // no genera voxel = hueco translúcido

        let col;
        if (isStem) {
          col = (u < 8) ? STEM_COLOR : LEAF_GOLD;
        } else if (leaflet) {
          col = LEAF_LIME;
        } else if (leaflet2) {
          col = LEAF_VIBRANT;
        } else {
          col = (holeNoise > 0.4) ? LEAF_MID : LEAF_DARK;
        }

        col = jitter(col, 8, rnd);
        voxels[`${x},${y},${z}`] = col;
      }
    }
  }

  return {
    format: 'voxelforge-1',
    size: { x: N, y: N, z: N },
    meta: {
      name: 'Hojas Palmera',
      type: 'textura',
      role: 'Bloque · hojas tropicales de palmera',
      icon: '🌿',
      description: 'Frondas de palmera con nervaduras doradas y calados al viento.',
      alias: 'hojas_palmera'
    },
    voxels
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 3. COCO (coco)
// ──────────────────────────────────────────────────────────────────────────
function generateCoconut() {
  const rnd = mulberry32(772199);
  const voxels = {};

  const HUSK_DARK = '#3d200f';
  const HUSK_MID = '#542d16';
  const HUSK_WARM = '#6b3a1d';
  const HUSK_LIGHT = '#824925';
  const FIBER_HIGHLIGHT = '#965a31';
  const EYE_DEEP = '#1a0b04';

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const isFace = (x === 0 || x === N - 1 || y === 0 || y === N - 1 || z === 0 || z === N - 1);
        if (!isFace) continue;

        let col;

        // En la cara frontal (+Y) o superior (+Z) colocamos los 3 ojos del coco
        if (y === N - 1) {
          // Tres ojos germinativos en forma de triángulo
          const isEye1 = (x === 6 && z === 10) || (x === 7 && z === 10);
          const isEye2 = (x === 9 && z === 10) || (x === 10 && z === 10);
          const isEye3 = (x === 8 && z === 6) || (x === 8 && z === 7);

          if (isEye1 || isEye2 || isEye3) {
            col = EYE_DEEP;
          } else {
            // Cáscara circundante con fibras radiales
            const dx = x - 8, dz = z - 8;
            const d = Math.sqrt(dx * dx + dz * dz);
            col = (d < 5) ? HUSK_MID : HUSK_WARM;
            if (z % 2 === 0) col = mix(col, FIBER_HIGHLIGHT, 0.3);
          }
        } else {
          // Fibras longitudinales de la cáscara del coco
          const u = (x === 0 || x === N - 1) ? y : x;
          const fiberRib = Math.sin(u * 1.8 + z * 0.4);
          const isHighlight = (u % 3 === 0 && z > 2 && z < 14);

          if (fiberRib > 0.6) {
            col = isHighlight ? FIBER_HIGHLIGHT : HUSK_LIGHT;
          } else if (fiberRib > -0.2) {
            col = HUSK_WARM;
          } else if (fiberRib > -0.7) {
            col = HUSK_MID;
          } else {
            col = HUSK_DARK;
          }
        }

        col = jitter(col, 7, rnd);
        voxels[`${x},${y},${z}`] = col;
      }
    }
  }

  return {
    format: 'voxelforge-1',
    size: { x: N, y: N, z: N },
    meta: {
      name: 'Coco',
      type: 'textura',
      role: 'Bloque · fruto de coco tropical',
      icon: '🥥',
      description: 'Nuez de coco con cáscara fibrosa y ojos germinativos.',
      alias: 'coco'
    },
    voxels
  };
}

// ──────────────────────────────────────────────────────────────────────────
// EJECUCIÓN Y REGISTRO EN INDEX.JSON
// ──────────────────────────────────────────────────────────────────────────
const trunkData = generatePalmTrunk();
const leavesData = generatePalmLeaves();
const coconutData = generateCoconut();

const trunkFile = path.join(ASSETS_DIR, 'tronco_palmera.vox.json');
const leavesFile = path.join(ASSETS_DIR, 'hojas_palmera.vox.json');
const coconutFile = path.join(ASSETS_DIR, 'coco.vox.json');

fs.writeFileSync(trunkFile, JSON.stringify(trunkData, null, 2));
fs.writeFileSync(leavesFile, JSON.stringify(leavesData, null, 2));
fs.writeFileSync(coconutFile, JSON.stringify(coconutData, null, 2));

console.log('✓ Creados assets/tronco_palmera.vox.json, hojas_palmera.vox.json, coco.vox.json');

// Inscribir en assets/index.json
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

function registerInIndex(fileName, meta) {
  const existingIdx = index.findIndex(item => item.path === fileName);
  const entry = {
    name: meta.name,
    type: meta.type,
    path: fileName,
    role: meta.role,
    icon: meta.icon,
    description: meta.description,
    alias: meta.alias
  };
  if (existingIdx >= 0) {
    index[existingIdx] = entry;
  } else {
    index.push(entry);
  }
}

registerInIndex('tronco_palmera.vox.json', trunkData.meta);
registerInIndex('hojas_palmera.vox.json', leavesData.meta);
registerInIndex('coco.vox.json', coconutData.meta);

fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
console.log('✓ Registrados en assets/index.json');
