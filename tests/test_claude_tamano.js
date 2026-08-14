// @area: general
// @necesita: node
//
// Guardián del tope de 15 KB de CLAUDE.md (encargo del dueño, 2026-08-13).
//
// CLAUDE.md se inyecta en el contexto ENTERO en CADA turno: cada byte se paga una y otra vez, en todas
// las conversaciones, para siempre. Un fichero que crece «solo un párrafo» por ticket es la fuga de
// contexto más cara del repo, y no la nota nadie porque nunca falla nada.
//
// La cura no es borrar: es MOVER. El detalle baja verbatim a su `docs/*.md` (que se lee a demanda) y en
// CLAUDE.md queda la regla más el enlace. Por eso este test comprueba las dos mitades del trato:
// el tamaño, y que los punteros a `docs/` sigan resolviendo a ficheros que existen — un índice que
// enlaza a la nada es peor que no tener índice.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TOPE = 15 * 1024;

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok  ' + m)) : (fallos++, console.log('  FALLO  ' + m));

const ruta = path.join(RAIZ, 'CLAUDE.md');
const texto = fs.readFileSync(ruta, 'utf8');
const bytes = Buffer.byteLength(texto, 'utf8');

console.log('\n§1 CLAUDE.md cabe en el tope');
const pct = (100 * bytes / TOPE).toFixed(1);
check(bytes <= TOPE, `${bytes} B ≤ ${TOPE} B  (${pct} % del tope, quedan ${TOPE - bytes} B)`);
if (bytes > TOPE) {
  console.log(`\n  ⚠️  Se pasa por ${bytes - TOPE} B. NO se borra contenido: se MUEVE.`);
  console.log('      Coge la sección más gorda, pégala VERBATIM al final de su docs/<area>.md con una');
  console.log('      nota «(movido verbatim desde CLAUDE.md el <fecha>)», y deja aquí la regla + el enlace.');
}

console.log('\n§2 los punteros a docs/ existen');
const enlaces = [...new Set([...texto.matchAll(/\]\((docs\/[^)#]+\.md)\)/g)].map(m => m[1]))];
check(enlaces.length >= 10, `hay punteros que comprobar (${enlaces.length})`);
for (const e of enlaces) check(fs.existsSync(path.join(RAIZ, e)), e);

console.log('\n§3 sigue siendo un índice y no un manual');
// Si vuelve a haber secciones larguísimas es que alguien está escribiendo el manual aquí otra vez.
const secciones = texto.split(/^## /m).slice(1);
const gorda = secciones.map(s => ({ t: s.split('\n')[0].trim(), n: Buffer.byteLength(s, 'utf8') }))
                       .sort((a, b) => b.n - a.n)[0];
check(gorda.n <= 2600, `la sección más gorda cabe en 2600 B: «${gorda.t}» = ${gorda.n} B`);

console.log(`\n${ok} ok / ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
