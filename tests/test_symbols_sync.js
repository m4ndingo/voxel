// @area: general
// @necesita: node
// Guardián de SYMBOLS.md, el mapa `función → web/app.js:línea`: existe para NO leer app.js entero
// (13k líneas / ~217k tokens, no cabe en la ventana). Un mapa que envejece en silencio es peor que
// no tenerlo: manda al agente a una línea equivocada y se pierde la confianza en él, así que se vuelve
// a los sondeos a ciegas que el mapa venía a evitar.
//
// El mapa se genera con:  grep -nE '^[[:space:]]*(async )?function ' web/app.js
// Este test RE-DERIVA esa lista desde app.js con el mismo criterio y exige que SYMBOLS.md la reproduzca
// EXACTA (nombre + línea, en orden). Si falla, la cura es una línea (regenerar), y el test la imprime.

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0, fallos = 0;
function comprueba(cond, nombre, detalle) {
  if (cond) { ok++; console.log('  ok  ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
}

// 1. Verdad de referencia: las funciones de app.js, con su línea, en el MISMO orden y criterio
//    que el grep que genera el mapa. `\bfunction NOMBRE` al principio de línea (con `async` opcional).
const RE = /^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_][A-Za-z0-9_]*)/;
const appLineas = fs.readFileSync(path.join(raiz, 'web', 'app.js'), 'utf8').split('\n');
const esperado = [];
appLineas.forEach((linea, i) => {
  const m = linea.match(RE);
  if (m) esperado.push({ linea: i + 1, nombre: m[1] });
});

// 2. Lo que dice SYMBOLS.md: filas `web/app.js:<línea>  <nombre>` (se ignora la cabecera con `#`)
const symPath = path.join(raiz, 'SYMBOLS.md');
comprueba(fs.existsSync(symPath), 'SYMBOLS.md existe');
const symTexto = fs.existsSync(symPath) ? fs.readFileSync(symPath, 'utf8') : '';
const RE_FILA = /^web\/app\.js:(\d+)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/;
const enMapa = [];
symTexto.split('\n').forEach(l => {
  const m = l.match(RE_FILA);
  if (m) enMapa.push({ linea: parseInt(m[1], 10), nombre: m[2] });
});

console.log('\n§1 el mapa cubre todas las funciones de app.js (ni de más ni de menos)');
comprueba(enMapa.length === esperado.length, 'mismo número de entradas',
  'app.js=' + esperado.length + '  SYMBOLS.md=' + enMapa.length);

console.log('\n§2 cada entrada apunta a la línea correcta, en orden');
let primerFallo = null;
const n = Math.min(esperado.length, enMapa.length);
for (let i = 0; i < n; i++) {
  if (esperado[i].nombre !== enMapa[i].nombre || esperado[i].linea !== enMapa[i].linea) {
    primerFallo = { i, esp: esperado[i], got: enMapa[i] };
    break;
  }
}
comprueba(primerFallo === null, 'todas las filas coinciden',
  primerFallo ? ('1ª divergencia en fila #' + primerFallo.i +
    ': app.js dice ' + primerFallo.esp.nombre + '@' + primerFallo.esp.linea +
    ', mapa dice ' + primerFallo.got.nombre + '@' + primerFallo.got.linea) : '');

console.log('\n§3 sondeo dirigido: las 6 funciones de "poner un bloque" están y apuntan bien');
const claves = ['setVoxel', 'mcSetVoxel', 'mcSetBlock', 'mcCabeEnRejilla', 'mcPlace', 'mcResolveMat'];
for (const c of claves) {
  const real = esperado.find(e => e.nombre === c);
  const fila = enMapa.find(e => e.nombre === c);
  comprueba(real && fila && real.linea === fila.linea,
    c, real ? ('web/app.js:' + real.linea + (fila ? '' : ' — FALTA en el mapa')) : 'no está en app.js');
}

if (fallos) {
  console.log('\n⚠️  El mapa está desincronizado. Regenéralo desde /root/voxel con:');
  console.log("    grep -nE '^[[:space:]]*(async )?function ' web/app.js | \\");
  console.log("      sed -E 's|^([0-9]+):[[:space:]]*(async )?function ([A-Za-z_][A-Za-z0-9_]*).*|web/app.js:\\1  \\3|'");
  console.log('    (conservando la cabecera de comentarios de SYMBOLS.md)');
}

console.log('\n' + ok + ' ok / ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
