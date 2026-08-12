// @area: materiales
// @necesita: node
// BUG-SNP2 · `hab:placa-on` se avisaba como si fuera un dedo torcido de `hab:palanca-on`:
//
//     game.bloques.define: no existe el material "hab:placa-on". ¿Querías "hab:palanca-on"?
//
// Falso positivo de BUG-SNP1. `placa-on` existe de verdad; lo que pasa es que en un mundo donde no
// esta COLOCADO no entra en la paleta, y tendria que ESPERAR EN SILENCIO. Pero la distancia de
// edicion entre 'placa-on' y 'palanca-on' es 2 y el tope en palabras largas es 2, asi que colaba.
//
// Y de propina BUG-ROT2 · `game.esqueletos.crear` recortaba la postura de cada pieza con `& 15`,
// que no rechaza un 16..23: lo convierte EN SILENCIO en 0..7, o sea en otra postura. Es el mismo
// fallo que costo BUG-RS7 y BUG-RS8, y aqui saldria como «el brazo mira a otro lado» sin un aviso.
//
// Las dos cosas viven en data/snippets/mundo-autoarranque.json, que el dueño edita EN VIVO. Se
// extraen VERBATIM del snippet y se corren en un vm: si alguien las reescribe, este arnes se entera.
// No abre servidor ni navegador.
'use strict';
const fs = require('fs');
const vm = require('vm');

const doc = JSON.parse(fs.readFileSync(__dirname + '/../data/snippets/mundo-autoarranque.json', 'utf8'));
const src = doc.code;

// El snippet vive dentro de una IIFE, asi que sus funciones cierran con '}' en la columna 2 (no en
// la 0 como las de app.js) — y por eso NO vale el corte por '\n}' de los otros arneses.
function extraer(nombre) {
  const ini = src.indexOf('\n  function ' + nombre + '(');
  if (ini < 0) throw new Error('no encuentro function ' + nombre + ' en el snippet');
  const fin = src.indexOf('\n  }\n', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 4);
}

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

// ── El sandbox: las funciones de verdad + una paleta de mentira que se puede mover ────────────
// `clavesConocidas` es lo unico que se sustituye: en el navegador lee mc.blockKey/mc.catalog, aqui
// devuelve la lista que le pongamos. Todo lo demas (nombreCorto, distancia, parecidos, deLaFamilia,
// resolver) es el codigo tal cual esta en el snippet.
const ctx = { console, PALETA: [] };
vm.createContext(ctx);
vm.runInContext('function clavesConocidas(){ return PALETA.slice(); }', ctx);
for (const f of ['nombreCorto', 'distancia', 'parecidos', 'deLaFamilia', 'resolver'])
  vm.runInContext(extraer(f), ctx);

const resolver = (clave, paleta) => { ctx.PALETA = paleta; return vm.runInContext('resolver', ctx)(clave); };

// La paleta del caso real: /map/empty con la palanca puesta y la placa NO puesta. `placa` si esta,
// que es la señal que decide el caso.
const P = ['hab:placa', 'hab:palanca', 'hab:palanca-on', 'hab:escalera', 'asset:assets/arena.vox.json'];

console.log('\n── A · el falso positivo que reporto el dueño ──');
{
  const r = resolver('hab:placa-on', P);
  ok('«hab:placa-on» NO se canta como typo de «hab:palanca-on»', !/Querías/.test(r.error || ''), r.error || '(sin error)');
  ok('…se aplaza, que es lo que hace un material que todavía no está puesto', r.aplazable === true);
  ok('…y el motivo que se guarda dice justo eso', /no esta en este mundo todavia/.test(r.error || ''), r.error);
}

console.log('\n── B · lo que NO se puede haber roto: los typos de verdad siguen cantando ──');
{
  // 'palnca' es un dedo torcido autentico: no es pariente de nadie y esta a distancia 1.
  const r = resolver('hab:palnca', P);
  ok('«hab:palnca» sigue sugiriendo «hab:palanca»', /Querías/.test(r.error || '') && /hab:palanca/.test(r.error || ''), r.error);
  ok('…y NO se aplaza (un typo no es una espera)', !r.aplazable);
}
{
  // El guion no es un salvoconducto: 'palanca-on' NO es pariente de 'placa', asi que si la palanca
  // no estuviera en la paleta habria que seguir sugiriendo lo parecido.
  const r = resolver('hab:palanca-on', ['hab:placa', 'hab:placa-on']);
  ok('un guion detrás de un nombre DESCONOCIDO no exime: «palanca-on» vs «placa» sigue avisando',
    /Querías/.test(r.error || ''), r.error);
}

console.log('\n── C · la familia, en los casos que hay en el disco ──');
[['hab:cable-on', 'hab:cable'], ['hab:boton-on', 'hab:boton'], ['hab:puerta-abierta', 'hab:puerta'],
 ['hab:antorcha-apagada', 'hab:antorcha'], ['hab:repetidor-on', 'hab:repetidor']].forEach(([hijo, padre]) => {
  const r = resolver(hijo, [padre, 'hab:palanca-on', 'hab:escalera']);
  ok('«' + hijo + '» espera en silencio si «' + padre + '» está en la paleta',
    r.aplazable === true && !/Querías/.test(r.error || ''), r.error);
});

console.log('\n── D · y lo que ya funcionaba sigue igual ──');
{
  ok('un material que SÍ está en la paleta se resuelve tal cual', resolver('hab:escalera', P).clave === 'hab:escalera');
  ok('el nombre corto sigue valiendo de alias', resolver('arena', P).clave === 'asset:assets/arena.vox.json');
  ok('sin paleta (Mundo sin abrir) no se valida contra nada', resolver('hab:loquesea', []).clave === 'hab:loquesea');
  const r = resolver('hab:noexistenada', P);
  ok('algo que no se parece a nada se sigue aplazando', r.aplazable === true, r.error);
}

// ── E · BUG-ROT2: las 24 posturas de una pieza de esqueleto ────────────────────────────────────
console.log('\n── E · BUG-ROT2 · las piezas de un esqueleto llegan a las 24 posturas ──');
{
  const ctx2 = { console };
  vm.createContext(ctx2);
  vm.runInContext(extraer('oriDePieza'), ctx2);
  const ori = vm.runInContext('oriDePieza', ctx2);

  ok('el recorte `& 15` ya no está en el snippet', src.indexOf('(q.rot | 0) & 15') < 0);
  ok('las 24 posturas se conservan tal cual', Array.from({ length: 24 }, (_, i) => ori(i)).every((v, i) => v === i));
  // Lo que fallaba: 16..23 no se rechazaba, se convertia en 0..7 (16 & 15 === 0).
  ok('la 16 ya no se lee como la 0', ori(16) === 16);
  ok('la 23 ya no se lee como la 7', ori(23) === 23);
  // El criterio del motor (mcOriNorm): lo desconocido no gira, NUNCA se lee como otra postura.
  ok('lo que no es una postura conocida se lee como «sin girar»',
    ori(24) === 0 && ori(99) === 0 && ori(-1) === 0 && ori(undefined) === 0 && ori(null) === 0);
  // Y con el motor delante manda el motor, no el calco.
  const ctx3 = { console, mcOriNorm: (r) => 7 };
  vm.createContext(ctx3);
  vm.runInContext(extraer('oriDePieza'), ctx3);
  ok('si app.js está cargado, decide app.js (mcOriNorm) y no el calco', vm.runInContext('oriDePieza', ctx3)(16) === 7);
}

console.log('\n' + (fallos ? '  ' + fallos + ' FALLO(S)' : '  todo ok'));
process.exit(fallos ? 1 : 0);