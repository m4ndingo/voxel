// @area: general
// @necesita: node
//
// Guardián de la partición de PLAN.md (2026-08-13): el detalle de los tickets cerrados vive en
// PLAN_ARCHIVO.md y el índice sigue en PLAN.md, así que ahora hay enlaces que CRUZAN de fichero.
// Un enlace roto entre dos ficheros no se nota al leer —el ancla simplemente no salta— y así es
// como este fichero llegó a tener 110 de 111 anclas muertas antes de la partición.
//
// Comprueba cuatro cosas:
//   1. Todo `](#ancla)` resuelve dentro de SU PROPIO fichero.
//   2. Todo `](OTRO.md#ancla)` resuelve en el otro fichero.
//   3. Ningún ancla explícita está duplicada (dos `<a id>` iguales = el enlace salta al azar).
//   4. La deuda conocida no crece: hay 21 anclas citadas cuyo ticket NUNCA tuvo sección escrita
//      (BUG-RS12, REQ-PICK3…). Están en DEUDA abajo. Si aparece una nueva, esto se pone rojo.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FICHEROS = ['PLAN.md', 'PLAN_ARCHIVO.md'];

// Anclas citadas que no tienen sección en ninguno de los dos ficheros. NO son daño de la
// partición: ya estaban muertas antes (tickets cerrados cuyo detalle no llegó a escribirse).
// Se listan para que la lista no pueda crecer sin que alguien lo vea.
const DEUDA = new Set([
  '-bug-ag14', '-bug-ag16', '-bug-fluid2', '-bug-pick2', '-bug-ray1', '-bug-rs11',
  '-bug-rs12', '-bug-rs13', '-bug-rs14', '-bug-rs18', '-req-ag15', '-req-ed1',
  '-req-ed2', '-req-fluid1', '-req-pick3', '-req-rs13', '-req-rs14', '-req-rs15',
  '-req-rs16', '-req-rs17', '-req-rs18',
]);

let ok = 0, fallos = 0;
const check = (cond, msg) => cond ? (ok++, console.log('  ok  ' + msg))
                                  : (fallos++, console.log('  FALLO  ' + msg));

// El slug que genera GitHub a partir de un encabezado.
const slug = (t) => t.replace(/^#+\s/, '').toLowerCase()
  .split('').filter(c => /[a-z0-9áéíóúüñ]/i.test(c) || c === ' ' || c === '-' || c === '_')
  .join('').replace(/ /g, '-');

const doc = {};
for (const f of FICHEROS) {
  const lineas = fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r/g, '').split('\n');
  const explicitas = [];
  const slugs = new Set();
  lineas.forEach((l) => {
    // Solo cuenta la línea que ES un ancla. Citarla en prosa (`<a id="…">` dentro de
    // backticks, como hace la cabecera del archivo para explicarlo) no planta nada.
    const m = l.match(/^<a id="([^"]+)"><\/a>$/);
    if (m) explicitas.push(m[1]);
    if (/^#+\s/.test(l)) slugs.add(slug(l));
  });
  const enlaces = [];
  lineas.forEach((l, i) => {
    for (const m of l.matchAll(/\]\((PLAN\.md|PLAN_ARCHIVO\.md)?#([^)]+)\)/g)) {
      enlaces.push({ destino: m[1] || f, ancla: m[2], linea: i + 1 });
    }
  });
  doc[f] = { lineas, explicitas, anclas: new Set(explicitas), slugs, enlaces };
}

console.log('\n§1 cada enlace resuelve a una sección que existe');
for (const f of FICHEROS) {
  const rotos = doc[f].enlaces.filter((e) => {
    const d = doc[e.destino];
    return !d.anclas.has(e.ancla) && ![...d.slugs].some((s) => s === e.ancla);
  });
  const nuevos = rotos.filter((e) => !DEUDA.has(e.ancla));
  check(nuevos.length === 0,
    `${f}: ${doc[f].enlaces.length} enlaces, ${nuevos.length} rotos` +
    (nuevos.length ? ' -> ' + nuevos.slice(0, 5).map((e) => `${e.ancla} (línea ${e.linea})`).join(', ') : ''));
}

console.log('\n§2 en PLAN.md solo vive lo ABIERTO (orden del dueño, 2026-08-18)');
// Hasta el 2026-08-18 esto exigía >50 enlaces PLAN.md -> archivo, porque el índice de CERRADOS
// (una fila por ticket, cada una enlazando al archivo) vivía aquí. Ese índice y la bitácora se
// bajaron al archivo: PLAN.md ya no tiene ni una fila cerrada, así que lo que se vigila cambia.
const cruzan = doc['PLAN.md'].enlaces.filter((e) => e.destino === 'PLAN_ARCHIVO.md');
check(cruzan.length > 0, `PLAN.md apunta al archivo ${cruzan.length} veces (el puntero, >0)`);
check(doc['PLAN_ARCHIVO.md'].enlaces.some((e) => e.destino === 'PLAN.md'),
  'el archivo apunta de vuelta a PLAN.md');

// Un ticket cerrado se reconoce por su encabezado: `### ✅ …` o `— ✅ resuelto/hecho/done`.
const cerrados = doc['PLAN.md'].lineas
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => /^#{3,4} /.test(l) && /✅|\bresuelto\b|\bdone \(/.test(l));
check(cerrados.length === 0,
  `PLAN.md: 0 secciones de ticket cerrado` +
  (cerrados.length ? ' -> ' + cerrados.slice(0, 5).map((c) => `línea ${c.n}`).join(', ') : ''));

// El índice de ABIERTOS y las secciones de detalle tienen que cuadrar en los dos sentidos: una
// fila sin sección manda a la nada, y una sección sin fila es un ticket que ya no se ve al abrir.
const iIdx = doc['PLAN.md'].lineas.findIndex((l) => /^## .*Tickets ABIERTOS — índice/.test(l));
const iFin = doc['PLAN.md'].lineas.findIndex((l, i) => i > iIdx && /^## /.test(l));
const filas = new Set();
doc['PLAN.md'].lineas.slice(iIdx, iFin < 0 ? undefined : iFin)
  .filter((l) => l.startsWith('|'))
  .forEach((l) => [...l.matchAll(/\]\((#-[a-z0-9-]+)\)/g)].forEach((m) => filas.add(m[1].slice(1))));
const secciones = new Set(doc['PLAN.md'].explicitas);
const sinSeccion = [...filas].filter((a) => !secciones.has(a));
const sinFila = [...secciones].filter((a) => !filas.has(a));
check(sinSeccion.length === 0 && sinFila.length === 0,
  `índice de ABIERTOS ↔ detalle: ${filas.size} filas, ${secciones.size} secciones, cuadran` +
  (sinSeccion.length ? ` -> fila sin sección: ${sinSeccion.join(', ')}` : '') +
  (sinFila.length ? ` -> sección sin fila: ${sinFila.join(', ')}` : ''));

console.log('\n§3 ningún ancla explícita duplicada');
for (const f of FICHEROS) {
  const vistos = new Set(), dup = [];
  for (const a of doc[f].explicitas) vistos.has(a) ? dup.push(a) : vistos.add(a);
  check(dup.length === 0, `${f}: ${doc[f].explicitas.length} anclas, ${dup.length} duplicadas` +
    (dup.length ? ' -> ' + dup.slice(0, 5).join(', ') : ''));
}
const compartidas = [...doc['PLAN.md'].anclas].filter((a) => doc['PLAN_ARCHIVO.md'].anclas.has(a));
check(compartidas.length === 0,
  `ningún ancla vive en los dos ficheros a la vez (${compartidas.length})` +
  (compartidas.length ? ' -> ' + compartidas.slice(0, 5).join(', ') : ''));

console.log('\n§4 la deuda conocida no crece');
const todasRotas = new Set();
for (const f of FICHEROS) {
  for (const e of doc[f].enlaces) {
    const d = doc[e.destino];
    if (!d.anclas.has(e.ancla) && ![...d.slugs].some((s) => s === e.ancla)) todasRotas.add(e.ancla);
  }
}
const inesperadas = [...todasRotas].filter((a) => !DEUDA.has(a));
check(inesperadas.length === 0,
  `anclas muertas: ${todasRotas.size}, todas en la lista de deuda` +
  (inesperadas.length ? ' -> NUEVAS: ' + inesperadas.join(', ') : ''));
const saldadas = [...DEUDA].filter((a) => !todasRotas.has(a));
if (saldadas.length) console.log(`  nota  ${saldadas.length} de la deuda ya no se citan: quítalas de DEUDA (${saldadas.slice(0, 5).join(', ')})`);

console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
