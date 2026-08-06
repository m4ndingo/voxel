/* Empaqueta los .js de redstone/ como snippets del Mundo (data/snippets/<id>.json).
   Uso: node redstone/make_snippets.js   (con el servidor levantado en :8500)

   El código vive en ficheros .js normales —editables, con resaltado, comparables en git— y el
   Mundo los consume como snippets. Se publican por la API en vez de escribir el .json a mano
   porque POST /api/snippets respalda la versión anterior en la papelera y escribe de forma
   atómica; a mano se pierden las dos cosas. */
const fs = require('fs');
const path = require('path');

const DIR  = __dirname;
const BASE = process.env.VOXEL_URL || 'http://localhost:8500';

// id del snippet → fichero y nombre visible en el gestor.
const PIEZAS = [
  { id: 'redstone',                fichero: 'redstone.js',                nombre: 'Redstone · motor ⚡' },
  { id: 'redstone-arranque',       fichero: 'redstone-arranque.js',       nombre: 'Redstone · arranque 🔌' },
  { id: 'redstone-piezas',         fichero: 'redstone-piezas.js',         nombre: 'Redstone · piezas 🔩' },
  { id: 'redstone-demo-antorcha',  fichero: 'redstone-demo-antorcha.js',  nombre: 'Redstone · demo antorcha 🔦' },
  { id: 'redstone-ejemplos',       fichero: 'redstone-ejemplos.js',       nombre: 'Redstone · 6 ejemplos con cartel 🪧' },
];

async function publicar(p) {
  const code = fs.readFileSync(path.join(DIR, p.fichero), 'utf8');
  const r = await fetch(BASE + '/api/snippets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id, name: p.nombre, code }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' publicando ' + p.id);
  const d = await r.json();
  console.log('  ✓ ' + p.id.padEnd(24) + (code.length / 1024).toFixed(1).padStart(6) + ' KB   ' + d.savedAt);
}

// Para que redstone se cargue SOLO hace falta entrar por el único gancho de autoarranque que hay:
// `mundo-autoarranque`, que mcAutoarranque() ejecuta al final de openWorld en todos los mapas.
//
// ⚠️ Ese snippet es del dueño y lo edita EN VIVO, así que aquí no se reescribe: se inserta (o se
// reemplaza) solo lo que hay entre los dos marcadores, y el resto del fichero se deja intacto. Por
// eso es re-ejecutable sin acumular copias.
const INI = '// ==REDSTONE-ARRANQUE== (generado por redstone/make_snippets.js — no editar a mano)';
const FIN = '// ==FIN-REDSTONE-ARRANQUE==';
const BLOQUE = [
  INI,
  '// Carga redstone/redstone-arranque.js (motor + circuitos de serie). No se espera a propósito: no',
  '// puede retrasar la entrada al Mundo, y el repaso del circuito se hace solo cuando termina.',
  '(function () {',
  "  fetch('/api/snippets/redstone-arranque', { cache: 'no-store' })",
  '    .then(function (r) { return r.ok ? r.json() : null; })',
  '    .then(function (d) {',
  '      if (!d || !d.code) return;',
  '      var AsyncFn = Object.getPrototypeOf(async function () {}).constructor;',
  '      return new AsyncFn(d.code)();',
  '    })',
  "    .catch(function (e) { console.warn('redstone: arranque no cargado:', e && e.message); });",
  '})();',
  FIN,
].join('\n');

async function parcharAutoarranque() {
  const r = await fetch(BASE + '/api/snippets/mundo-autoarranque');
  if (!r.ok) { console.log('  · no hay mundo-autoarranque: nada que parchear'); return; }
  const d = await r.json();
  const i = d.code.indexOf(INI), f = d.code.indexOf(FIN);
  let code, que;
  if (i >= 0 && f > i) { code = d.code.slice(0, i) + BLOQUE + d.code.slice(f + FIN.length); que = 'actualizado'; }
  else { code = d.code.replace(/\s*$/, '') + '\n\n' + BLOQUE + '\n'; que = 'añadido'; }
  if (code === d.code) { console.log('  = mundo-autoarranque ya estaba al día'); return; }
  const p = await fetch(BASE + '/api/snippets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'mundo-autoarranque', name: d.name, code }),
  });
  if (!p.ok) throw new Error('HTTP ' + p.status + ' parcheando mundo-autoarranque');
  console.log('  ✓ mundo-autoarranque: bloque de redstone ' + que + ' (' + d.code.split('\n').length
    + ' → ' + code.split('\n').length + ' líneas)');
}

(async () => {
  console.log('Publicando snippets de redstone en ' + BASE);
  try {
    for (const p of PIEZAS) await publicar(p);
    await parcharAutoarranque();
  } catch (e) {
    console.error('✗ ' + e.message + '\n  ¿está el servidor levantado? (python3 server.py)');
    process.exit(1);
  }
  console.log('Listo. Redstone se carga solo al entrar al Mundo (recarga la pestaña).');
  console.log('Demo de la antorcha: ▶ «Redstone · demo antorcha 🔦» en /map/test.');
})();
