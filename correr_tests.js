#!/usr/bin/env node

/**
 * runner de la suite de pruebas del proyecto voxel.
 * REQ-TEST1 · Lee la cabecera declarativa de cada test_*.js y filtra por área / requisitos.
 *
 * USO:
 *   node correr_tests.js [opciones] [patrón_de_fichero]
 *
 * OPCIONES:
 *   --node               Ejecuta solo tests Node puro (rápidos, sin servidor ni navegador)
 *   --playwright, --pw   Ejecuta solo tests que requieren servidor (:8500) y Playwright
 *   --area=<nombre>      Filtra por área (redstone, agentes, caras, fisica, render, editor, materiales, general)
 *   --list               Muestra el catálogo/inventario de todos los tests y sale
 *   --help, -h           Muestra esta ayuda
 *
 * EJEMPLOS:
 *   node correr_tests.js --node
 *   node correr_tests.js --area=redstone
 *   node correr_tests.js --area=agentes --node
 *   node correr_tests.js test_redstone_*.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { tokenDueno, ENV_DUENO } = require('./tests/_token');

const ARGS = process.argv.slice(2);

if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log(`
Uso: node correr_tests.js [opciones] [patrón_de_fichero]

Opciones:
  --node               Ejecuta solo tests de Node puro (sin servidor ni Playwright)
  --playwright, --pw   Ejecuta solo tests con Chromium / servidor
  --area=<nombre>      Filtra por área (redstone, agentes, caras, fisica, render, editor, materiales, general)
  --list               Muestra el inventario completo de tests
  --help, -h           Muestra esta ayuda
`);
  process.exit(0);
}

// 1. Escanear ficheros test_*.js en la raíz
const dir = __dirname+"/tests";
const files = fs.readdirSync(dir)
  .filter(f => f.startsWith('test_') && f.endsWith('.js'))
  .sort();

// 2. Parsear cabeceras declarativas
function parseHeader(file) {
  const fullPath = path.join(dir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  let area = 'general';
  let necesita = 'node';

  const mArea = content.match(/\/\/\s*@area:\s*([^\r\n]+)/);
  if (mArea) area = mArea[1].trim();

  const mNec = content.match(/\/\/\s*@necesita:\s*([^\r\n]+)/);
  if (mNec) necesita = mNec[1].trim();

  const esNodePuro = !necesita.includes('playwright') && !necesita.includes('servidor');
  return { file, fullPath, area, necesita, esNodePuro };
}

const inventory = files.map(parseHeader);

// Opción --list
if (ARGS.includes('--list')) {
  console.log('\n── Catálogo de Pruebas (' + inventory.length + ' ficheros test_*.js) ──\n');
  const areas = {};
  inventory.forEach(item => {
    areas[item.area] = (areas[item.area] || 0) + 1;
    const reqStr = item.esNodePuro ? 'Node (puro)' : 'Servidor + Playwright';
    console.log(`  ${item.file.padEnd(42)} | área: ${item.area.padEnd(10)} | ${reqStr}`);
  });
  console.log('\nResumen por área:');
  Object.keys(areas).sort().forEach(a => {
    console.log(`  - ${a.padEnd(12)}: ${areas[a]} test(s)`);
  });
  process.exit(0);
}

// Parsear filtros de CLI
const flagNode = ARGS.includes('--node');
const flagPw = ARGS.includes('--playwright') || ARGS.includes('--pw');

let areaFilter = null;
const areaArg = ARGS.find(a => a.startsWith('--area='));
if (areaArg) {
  areaFilter = areaArg.split('=')[1].toLowerCase().split(',');
}

const filePatterns = ARGS.filter(a => !a.startsWith('--') && a.endsWith('.js'));

// Filtrar tests a ejecutar
let selected = inventory.filter(item => {
  if (flagNode && !item.esNodePuro) return false;
  if (flagPw && item.esNodePuro) return false;
  if (areaFilter && !areaFilter.includes(item.area.toLowerCase())) return false;
  if (filePatterns.length > 0) {
    const match = filePatterns.some(pat => {
      if (pat.includes('*')) {
        const regex = new RegExp('^' + pat.replace(/\*/g, '.*') + '$');
        return regex.test(item.file);
      }
      return item.file === pat || item.file.includes(pat);
    });
    if (!match) return false;
  }
  return true;
});

if (selected.length === 0) {
  console.log('⚠️ No se encontró ningún test que coincida con los criterios de búsqueda.');
  process.exit(0);
}

// Pre-flight check: si hay tests que requieren servidor / Playwright
const requiereServidor = selected.some(item => !item.esNodePuro);

function checkServerAvailable(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => resolve(res.statusCode >= 200 && res.statusCode < 400));
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function checkPlaywrightInstalled() {
  try {
    require('playwright');
    return true;
  } catch (e) {
    return false;
  }
}

// ¿El servidor de :8500 pide el token del dueño y nosotros no lo llevamos?
//
// Esto avisa de un fallo que MIENTE: los tests que escriben empiezan a recibir 401 y lo cuentan
// como «la protección no deja borrar lo que está en uso», que es justo lo que el test dice
// comprobar. Pasó de verdad: `test_en_uso_no_se_borra` daba 22/6 contra un 8500 con token y 28/0
// contra uno sin él, y los seis «fallos» no eran del servidor sino del test sin identificarse.
// `/api/panel/salud` sirve de sonda porque sin token configurado es dueño todo el mundo (200) y
// con token puesto responde 401 a quien no lo trae.
function checkTokenAusente() {
  if (tokenDueno()) return Promise.resolve(false);
  return new Promise(resolve => {
    const req = http.get('http://localhost:8500/api/panel/salud', res => resolve(res.statusCode === 401));
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  if (requiereServidor) {
    const pwOk = checkPlaywrightInstalled();
    if (!pwOk) {
      console.error('\n❌ ERROR: Módulo "playwright" no encontrado.');
      console.error('   Para ejecutar los tests de navegador instala playwright con: npm install playwright\n');
      process.exit(1);
    }

    const serverOk = await checkServerAvailable('http://localhost:8500/map/test');
    if (!serverOk) {
      console.error('\n❌ ERROR PRE-FLIGHT: Servidor HTTP no detectado en http://localhost:8500.');
      console.error('   Los tests con navegador requieren que el servidor esté en marcha.');
      console.error('   Arranca el servidor primero en otra terminal con:\n');
      console.error('       python server.py   (o npm run dev)\n');
      console.error('   O ejecuta solo los tests de Node puro con:\n');
      console.error('       node correr_tests.js --node\n');
      process.exit(1);
    }
  }

  if (await checkTokenAusente()) {
    // Ojo: si se llega aquí es que NO hay token en ninguna parte — ni en el entorno ni en
    // `/root/voxelforge.env`, que `tests/_token.js` ya ha intentado leer. Ya no sirve decir
    // «expórtalo»: el problema es que no está o que este usuario no puede leer ese fichero (600).
    console.error('\n⚠️  El servidor de :8500 pide el token del dueño y aquí no hay ninguno.');
    console.error('   Los tests que ESCRIBEN van a recibir 401 y contarlo como fallo de la');
    console.error('   protección que dicen comprobar. Comprueba que existe y es legible:\n');
    console.error('       sudo grep VOXELFORGE_TOKEN ' + ENV_DUENO + '\n');
  }

  console.log(`\n🚀 Ejecutando ${selected.length} test(s)...\n`);

  let pasados = 0;
  let fallados = 0;
  const fallosList = [];
  const tStartTotal = Date.now();

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const tagNum = `[${i + 1}/${selected.length}]`;
    const tStart = Date.now();

    const res = spawnSync(process.execPath, [item.fullPath], {
      // Raíz del repo, no `tests/`: los tests leen `data/...` y `assets/...` relativos al cwd
      // (así se escribieron cuando vivían en la raíz), y desde `tests/` esos ficheros no existen.
      cwd: __dirname,
      encoding: 'utf8',
      stdio: 'pipe',
      // El token del dueño va al hijo por el ENTORNO, nunca por la línea de órdenes (donde lo vería
      // cualquier `ps`). Así los ~12 tests que ya leen `process.env.VOXELFORGE_TOKEN` se identifican
      // solos contra un 8500 en modo público, sin que nadie tenga que acordarse de exportarlo.
      env: Object.assign({}, process.env, tokenDueno() ? { VOXELFORGE_TOKEN: tokenDueno() } : {})
    });

    const dur = ((Date.now() - tStart) / 1000).toFixed(1) + 's';
    const ok = (res.status === 0);

    if (ok) {
      pasados++;
      console.log(`  ✅ OK   ${tagNum} ${item.file.padEnd(42)} (${dur})`);
    } else {
      fallados++;
      fallosList.push({ file: item.file, output: res.stdout + '\n' + res.stderr });
      console.log(`  ❌ FAIL ${tagNum} ${item.file.padEnd(42)} (${dur})`);
    }
  }

  const durTotal = ((Date.now() - tStartTotal) / 1000).toFixed(1) + 's';

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`RESUMEN: ${pasados} ok, ${fallados} fallos | Total: ${selected.length} tests en ${durTotal}`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (fallados > 0) {
    console.log('DETALLE DE FALLOS:');
    fallosList.forEach((f, idx) => {
      console.log(`\n--- Fallo #${idx + 1}: ${f.file} ---`);
      console.log(f.output.trim());
    });
    console.log('');
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
