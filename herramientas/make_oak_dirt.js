#!/usr/bin/env node
// Genera los materiales 'oak' (tablones de roble) y 'dirt' (tierra) estilo Minecraft (16³ de tipo 'textura')
// y los inscribe en assets/index.json para que aparezcan en la Galería.
//
// +Z es ARRIBA (CUBE_FACES en app.js).
// Uso: node herramientas/make_oak_dirt.js (idempotente)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const INDEX_PATH = path.join(ASSETS_DIR, 'index.json');
const N = 16, TOP = N - 1;

// PRNG determinista mulberry32
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function jitter(hex, amt, r) {
  const n = parseInt(hex.slice(1), 16);
  let R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  const d = Math.round((r() * 2 - 1) * amt);
  R = Math.max(0, Math.min(255, R + d));
  G = Math.max(0, Math.min(255, G + d));
  B = Math.max(0, Math.min(255, B + d));
  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const R = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const G = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const B = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

// ── 1. Textura Oak (Madera / Tablones de roble estilo Minecraft) ───────────
// 4 tablas horizontales en Z (alto 4), juntas horizontales oscuras en z=0,4,8,12,
// juntas verticales alternadas por tabla, veta cálida dorada/miel.
function getOakColor(x, y, z, r) {
  const plank = Math.floor(z / 4); // 0, 1, 2, 3
  const inPlankZ = z % 4;
  const isHorizontalSeam = (inPlankZ === 0);

  // Juntas verticales escalonadas según tabla
  const vOffsets = [0, 8, 4, 12];
  const isVerticalSeamX = ((x + vOffsets[plank]) % 16 === 0);
  const isVerticalSeamY = ((y + vOffsets[plank]) % 16 === 0);

  // Clavos / nudos en las esquinas de juntas
  const isNailX = ((x + vOffsets[plank] + 1) % 16 === 0 || (x + vOffsets[plank] + 15) % 16 === 0) && (inPlankZ === 1);
  const isNailY = ((y + vOffsets[plank] + 1) % 16 === 0 || (y + vOffsets[plank] + 15) % 16 === 0) && (inPlankZ === 1);

  if (isHorizontalSeam) {
    return jitter('#68441b', 8, r);
  }
  if (isVerticalSeamX || isVerticalSeamY) {
    return jitter('#573814', 10, r);
  }
  if (isNailX || isNailY) {
    return jitter('#4a2e0e', 12, r);
  }

  // Vetas y variación dentro de la tabla
  // Tonos característicos de roble Minecraft: #b88748, #c69656, #a8793b, #9e6f32
  const baseTones = ['#b88748', '#c49454', '#ab7c3e', '#b18344'];
  const base = baseTones[plank % baseTones.length];
  
  if (inPlankZ === 1) {
    return mix(jitter(base, 10, r), '#cca062', 0.25); // ligero brillo superior de tabla
  } else if (inPlankZ === 3) {
    return mix(jitter(base, 10, r), '#8f642c', 0.2);  // ligera sombra inferior de tabla
  }
  return jitter(base, 14, r);
}

// ── 2. Textura Dirt (Tierra estilo Minecraft) ──────────────────────────────
// Tierra marrón terrosa rica con motas oscuras de humus y motas claras de gravilla.
function getDirtColor(x, y, z, r) {
  const rnd = r();

  if (rnd < 0.12) {
    // Motas oscuras profundas / humus
    return jitter('#4e331c', 10, r);
  } else if (rnd < 0.26) {
    // Sombras intermedias
    return jitter('#5c3e25', 12, r);
  } else if (rnd > 0.88) {
    // Guijarros / gravilla clara
    return jitter('#9c744f', 14, r);
  } else if (rnd > 0.76) {
    // Tierra clara / arena terrosa
    return jitter('#8f6745', 14, r);
  }
  // Tono base de tierra Minecraft (#735135 - #866043)
  return jitter('#7a5538', 16, r);
}

// Generación de los dos materiales
const MATERIALS = {
  oak: {
    name: 'Oak',
    icon: '🪵',
    role: 'Bloque · madera de roble (oak)',
    description: 'Bloque de madera de roble estilo Minecraft.',
    alias: 'oak_wood',
    categoria: 'construccion',
    group: 'Bloques de construcción',
    colorFn: getOakColor
  },
  dirt: {
    name: 'Dirt',
    icon: '🟫',
    role: 'Bloque · tierra (dirt)',
    description: 'Bloque de tierra estilo Minecraft.',
    alias: 'dirt_block',
    categoria: 'construccion',
    group: 'Bloques de construcción',
    colorFn: getDirtColor
  }
};

let indexData = [];
if (fs.existsSync(INDEX_PATH)) {
  try {
    indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    console.error('Error leyendo index.json:', e);
  }
}

const nowIso = new Date().toISOString().slice(0, 19);

for (const [id, def] of Object.entries(MATERIALS)) {
  const seed = id.split('').reduce((acc, c) => acc * 33 + c.charCodeAt(0) | 0, 1337);
  const r = mulberry32(seed);
  const voxels = {};

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        voxels[`${x},${y},${z}`] = def.colorFn(x, y, z, r);
      }
    }
  }

  const doc = {
    format: 'voxelforge-1',
    size: N,
    meta: {
      name: def.name,
      type: 'textura',
      role: def.role,
      icon: def.icon,
      description: def.description,
      alias: def.alias,
      categoria: def.categoria,
      group: def.group
    },
    voxels
  };

  const filePath = path.join(ASSETS_DIR, `${id}.vox.json`);
  fs.writeFileSync(filePath, JSON.stringify(doc));
  console.log(`Generado ${filePath} (${Object.keys(voxels).length} voxels)`);

  const relFile = `assets/${id}.vox.json`;
  const existingIdx = indexData.findIndex(item => item.id === id);

  const entry = {
    id: id,
    name: def.name,
    role: def.role,
    icon: def.icon,
    type: 'textura',
    group: def.group,
    size: N,
    file: relFile,
    description: def.description,
    alias: def.alias,
    categoria: def.categoria,
    savedAt: existingIdx >= 0 && indexData[existingIdx].savedAt ? indexData[existingIdx].savedAt : nowIso,
    createdAt: existingIdx >= 0 && indexData[existingIdx].createdAt ? indexData[existingIdx].createdAt : nowIso,
    count: N * N * N
  };

  if (existingIdx >= 0) {
    indexData[existingIdx] = Object.assign({}, indexData[existingIdx], entry);
  } else {
    indexData.push(entry);
  }
}

fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData, null, 2) + '\n');
console.log(`Actualizado ${INDEX_PATH} con los materiales oak y dirt.`);
