#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`sel-guia-extrusion`: al dejar pulsado Shift o Ctrl con la herramienta Seleccionar, la selección
enseña POR DÓNDE va a crecer (+ verde) y POR DÓNDE va a encoger (− rojo).

Dueño (2026-08-28): «*necesito un nuevo snippet parche en caliente para saber visualmente hacia donde se
crece o encoge la pieza con shift y control presionados en la herramienta de seleccion, se tiene que
mostrar cuando se deja pulsado shift o control nada más, en ese momento quiero ver visualmente al igual
que hacen los brackets si empujar o traer con shift o hacer crecer o decrecer con control va a sumar o
restar en cada direccion posible segun se esten viendo los bloques seleccionados*».

Pegando (Ctrl+V) el gesto NO va sobre la caja de origen sino sobre EL CÚMULO EN VUELO, donde caería
ahora mismo, y allí Ctrl/⇧+rueda lo engordan o lo adelgazan por la cara marcada. Dueño (2026-08-28):
«*pegando sí hay extrusión que predecir, pero donde se está pegando la pieza, no de donde se copió*» y
«*con desaparecer sigue funcionando control+rueda en la seleccion previa*» — por eso el snippet corta la
rueda en `window`/captura antes de que llegue a la del canvas.

Parcheo EN CALIENTE (Ley de Oro): no toca `app.js`. Dibuja con `game.voxelesUI` y se cuelga de
`mcUpdate` para repintar cuando el jugador se gira (con Shift el eje lo manda la mirada).

  game.selGuia.on() / .off() / .conmutar() / .estado() / .marcas(modo) / .puesto()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'sel-guia-extrusion'
NOMBRE = '🎯 Selección · Shift/Ctrl enseñan por dónde suma (+) y por dónde resta (−)'

CODE = r"""// ── 🎯 sel-guia-extrusion · la selección enseña por dónde crece y por dónde encoge ────────────────
//
// Dueño (2026-08-28): «*saber visualmente hacia donde se crece o encoge la pieza con shift y control
// presionados en la herramienta de seleccion, se tiene que mostrar cuando se deja pulsado shift o
// control nada más […] al igual que hacen los brackets si empujar o traer con shift o hacer crecer o
// decrecer con control va a sumar o restar en cada direccion posible segun se esten viendo los bloques
// seleccionados*».
//
// QUÉ SE VE. Mientras se mantiene Shift (o Ctrl) a secas, con Seleccionar y una caja confirmada:
//   ✚ VERDE   flotando en la celda donde la rueda PONDRÍA bloque
//   ▬ ROJO    pegado a la piel del bloque que la rueda SE COMERÍA
// Los dos a la vez, porque la rueda gira en los dos sentidos: el verde dice «por aquí sumo» y el rojo
// «por aquí resto». No se dibuja una capa plana: se dibuja LA SILUETA, marca a marca, la misma que
// recorre el motor —el bloque que da la cara de cada columna/fila—, así una pared irregular enseña sus
// escalones en vez de una plancha que mentiría.
//
// LA REGLA, UNA SOLA (y por eso este snippet no repite los cuatro gestos del motor). Los cuatro
// extrusores de app.js hacen lo mismo con distinta cara: se quedan con el bloque más lejano de cada
// fila EN EL SENTIDO DE TRABAJO `out`, se lo comen, o ponen uno en `cara + out`. Entonces:
//
//        gesto            cara de trabajo   out         suma con   resta con   función del motor
//   Ctrl normal           la CIMA           +Y          rueda ↑    rueda ↓     mcSelExtruir
//   Ctrl cara opuesta     el SUELO          −Y          rueda ↓    rueda ↑     mcSelExtruirAbajo
//   Shift normal          la que TE MIRA    −sN (a ti)  rueda ↓    rueda ↑     mcSelExtruirFrente
//   Shift cara opuesta    el FONDO          +sN         rueda ↑    rueda ↓     mcSelExtruirFondo
//
// (`sN` = mcEjeMirada(), el sentido que se ALEJA del jugador. Ctrl gana a Shift si se pulsan los dos,
// que es lo que hace la rueda en app.js: `extru = e.ctrlKey && …` se mira primero.)
// ⚠️ Ojo con los dos Shift: el «suma» de Shift normal es rueda ABAJO (traer hacia ti). No es un despiste
// copiando Ctrl — son los sentidos INVERSOS a posta desde REQ-EXTRU2.
//
// La celda verde se salta si cae fuera del mundo (`mcInside`), que es exactamente lo que hace el motor
// con su `continue`: si ahí no va a poner nada, prometerlo sería mentir.
//
// CÓMO SE DIBUJA. Con `game.voxelesUI`, que se pinta CON el mundo (no en el overlay) y por tanto lo
// tapan los bloques de delante — que es lo que se quiere: la marca de la cara de atrás no debe verse.
// Cada trazo es UN voxel de grupo con `grosor(grupo,5)`: el ✚ son 5 voxeles, no 125 (⛔ nunca apilar
// voxeles, BUG del `mcDrawArr`). Como los cubos van a grosor 5 y separados 5, se tocan y sus caras
// interiores se comen entre sí: sale una pieza sólida, no cinco dados.
//   · el ✚ va en el CENTRO de la celda que se ganaría (flota en el aire, se ve desde fuera)
//   · el ▬ va en la ÚLTIMA capa fina del bloque que se perdería, así queda pintado sobre su piel
//     y a 9 finos del ✚: no se solapan ni se confunde cuál es cuál.
//
// CAJA VACÍA (sin un solo bloque sólido): el motor no crea ni destruye, MUEVE la caja entera
// (REQ-EXTRU3, `mcSelMueveVacia`). Sería falso pintar verde/rojo, así que se pinta UN ▬ CIAN en la cara
// de trabajo de cada caja: «esto se mueve, no fabrica».
//
// CUÁNDO SE RECALCULA. No cada frame: sólo si cambia la FIRMA (modo, cara opuesta, `mc.gridGen`, las
// cajas y —con Shift— el eje mirado). Girar la cabeza cambia el eje y por eso hay que colgarse de
// `mcUpdate`; quieto, un ✚ de 400 celdas no cuesta nada porque no se vuelve a calcular.
//
// EL ESTADO DE LAS TECLAS SE LEE DE LOS MODIFICADORES DEL EVENTO (`e.ctrlKey`, `e.shiftKey`), nunca de
// un contador de pulsaciones propio: si el navegador se lleva el foco con Ctrl pulsado no llega el
// keyup y el contador se queda mintiendo para siempre. El `blur` de la VENTANA lo limpia, igual que
// hace app.js con `mc.selCtrlHeld` (app.js:2993).
// ⛔ Y SÓLO de `keydown`/`keyup`. Se probó a refrescar también con `mousemove` —parecía gratis— y es
// una trampa: hay `mousemove` de confianza con movimiento (0,0) y SIN los modificadores puestos (el
// navegador de pruebas los suelta a chorro), así que apagaban la guía a media pulsación. Además no
// hacían falta para nada: no hay forma de cambiar de modificador sin un keydown o un keyup.
//
// NO TOCA `app.js` NI EL MUNDO: sólo lee. Ni un `mcSetBlock`, ni historial, ni autoguardado.
//
// API: game.selGuia.on() / .off() / .conmutar() / .estado() / .marcas(modo) / .puesto()

const W = window;
const VERSION = 'sel-guia-v1';

// `mc` es un `const` de nivel superior de app.js: NO está en `window`, sólo se alcanza por identificador
// pelado. Por eso el guardián mira `typeof mc` y no `W.mc` (que siempre sería undefined).
if (typeof mc === 'undefined' || !mc) {
  console.warn('🎯 sel-guia-extrusion: no hay motor de mundo. Abre /map/<nombre>.');
  return 'sin motor';
}

const NECESITA = ['mcSelForEach', 'mcEjeMirada', 'mcInside', 'mcUpdate'];
const faltan = NECESITA.filter(n => typeof W[n] !== 'function');
if (faltan.length) {
  console.warn('🎯 sel-guia-extrusion: faltan ' + faltan.join(', ') + ' — ¿app.js sin REQ-EXTRU2?');
  return 'motor incompleto: falta ' + faltan.join(', ');
}
if (!W.game || !W.game.voxelesUI) return 'motor incompleto: falta game.voxelesUI';

const VUI = W.game.voxelesUI;
const G_MAS = 'sel-guia-mas', G_MENOS = 'sel-guia-menos', G_MUEVE = 'sel-guia-mueve';
const GRUPOS = [G_MAS, G_MENOS, G_MUEVE];
const VERDE = '#2fe36a', ROJO = '#ff3b30', CIAN = '#35d6ff';

const FINOS = 16;    // voxeles finos por bloque (MC_VOX = 1/16 de unidad de mundo)
const GROSOR = 5;    // lado del cubo de cada trazo, en finos: a 5 los trazos se tocan y sueldan
// ⚠️ UN VOXEL DE LA CAPA UI NO ESTÁ CENTRADO EN SU COORDENADA: `mcVoxUIGeom` planta el cubo con la
// ESQUINA en `q*paso` y lo hace crecer `grosor` finos hacia +. Por eso los trazos se dan en ESQUINAS
// medidas desde la esquina del bloque, y no como ±5 alrededor del centro (8): eso fue el primer intento
// y salía corrido 2,5 finos —lo vio el dueño de un vistazo, «*no esta bien centrado del todo*»—.
// Con grosor 5, un glifo centrado son tres trazos en 0, 5 y 10: ocupa 0..15 de los 16 de la celda.
const GLIFO_MAS = [[5, 5], [0, 5], [10, 5], [5, 0], [5, 10]];
const GLIFO_MENOS = [[0, 5], [5, 5], [10, 5]];
const GLIFO_PUNTO = [[5, 5]];
const DA_CENTRO = (FINOS - GROSOR - 1) >> 1;          // 5 · el ✚ centrado en la celda que se gana
const DA_PIEL = FINOS - 3;                            // 13 · el ▬ mordiendo la piel: 3 finos dentro, 2 fuera
const TOPE_GLIFO = 220;   // más caras que esto ⇒ un punto por celda en vez del glifo (legible igual, y barato)
const TOPE_VOX = 4000;    // tope duro: por encima se dibuja una de cada N celdas

// ── qué cara toca y qué haría la rueda ────────────────────────────────────────────────────────────
// La cara opuesta la manda el motor (REQ-EXTRU4, `mc.selOpuesta`); se mira también `mc._selOpuesta` por
// si el mundo lleva puesto el snippet viejo `sel-cara-opuesta` sobre un app.js anterior.
function caraOpuesta() { return !!(mc.selOpuesta || mc._selOpuesta); }

function gesto(modo) {
  const op = caraOpuesta();
  if (modo === 'ctrl') {
    return { eje: 1, out: op ? -1 : 1, nombre: op ? '−Y (suelo)' : '+Y (cima)',
             ruedaMas: op ? 'abajo' : 'arriba', ruedaMenos: op ? 'arriba' : 'abajo',
             que: op ? 'patas' : 'extruir' };
  }
  const m = mcEjeMirada();
  const out = op ? m.sN : -m.sN;
  return { eje: m.eje, out, nombre: (out > 0 ? '+' : '−') + 'XYZ'[m.eje] + (op ? ' (fondo)' : ' (hacia ti)'),
           ruedaMas: op ? 'arriba' : 'abajo', ruedaMenos: op ? 'abajo' : 'arriba',
           que: op ? 'puente' : 'traer', mirada: m.nombre };
}

// La cara de trabajo: por cada fila de la selección, el bloque MÁS LEJANO en el sentido `out`. La fila
// es (caja, las otras dos coordenadas) y NO sólo las coordenadas: dos cajas pueden caer sobre la misma
// fila a distinta profundidad y son dos caras, no una — el mismo motivo por el que el motor mete `ci`
// en la clave (REQ-SEL1).
// PEGANDO, el gesto NO va sobre la selección sino sobre la PIEZA EN VUELO, y en el sitio donde caería
// ahora mismo. Dueño (2026-08-28): «*pegando sí hay extrusión que predecir, pero donde se está pegando
// la pieza, no de donde se copió*». `mcPasteOrigen` es el ÚNICO que sabe dónde cae (agarre + postura),
// así que se le pregunta a él en vez de rehacer la cuenta: si él no lo sabe (no hay superficie a la
// vista), no hay nada que prometer. Sólo se llama con la tecla pulsada ⇒ ningún rayo de más al andar.
let vueloCache = null;   // caché de UN frame: `repinta()` la tira al empezar. Con la tecla pulsada esto se
                         // pregunta dos veces por frame (la firma y el cálculo) y son dos rayos, no uno.
function piezaEnVuelo() {
  if (vueloCache) return vueloCache.v;
  let v = null;
  if (mc.pasteActive && clipboard && clipboard.cells && clipboard.cells.length) {
    v = mcPasteOrigen(mcRaycast(mcReach(), true)) || null;
  }
  vueloCache = { v };
  return v;
}

// Las celdas del gesto en coordenadas de MUNDO. Ojo al remapeo del portapapeles, que es el del editor:
// pieza-X = `dx`, pieza-Y(altura) = `dz`, pieza-Z(profundidad) = `dy`, igual que en `mcClipboardDims`.
// ⛔ PEGANDO NO HAY RESPALDO: si el cúmulo no tiene dónde caer (nada a la vista), no se marca NADA. Caer
// aquí en la selección sería justo el bug que se está arreglando, pero disfrazado de «por si acaso».
function celdasDelGesto(cb) {
  if (mc.pasteActive) {
    const org = piezaEnVuelo();
    if (!org) return null;
    for (const cel of clipboard.cells) {
      const q = org.mueve(cel.dx, cel.dz, cel.dy);
      cb(org.ox + q[0], org.oy + q[1], org.oz + q[2], 0);
    }
    return org;
  }
  mcSelForEach((x, y, z, id, ci) => cb(x, y, z, ci));
  return null;
}

function calcula(modo) {
  const g = gesto(modo), eje = g.eje, out = g.out;
  const cara = new Map();
  const vuelo = celdasDelGesto((x, y, z, ci) => {
    const p = eje === 0 ? x : (eje === 1 ? y : z);
    const k = ci + ':' + (eje === 0 ? y + ',' + z : (eje === 1 ? x + ',' + z : x + ',' + y));
    const v = cara.get(k);
    if (!v || (out > 0 ? p > v.p : p < v.p)) cara.set(k, { x, y, z, p });
  });
  const mas = [], menos = [];
  for (const c of cara.values()) {
    menos.push([c.x, c.y, c.z]);
    const x = c.x + (eje === 0 ? out : 0), y = c.y + (eje === 1 ? out : 0), z = c.z + (eje === 2 ? out : 0);
    if (mcInside(x, y, z)) mas.push([x, y, z]);   // fuera del mundo el motor hace `continue`: no se promete
  }
  return { modo, eje, out, cara: g, mas, menos, vacia: cara.size === 0, pegando: !!vuelo };
}

// ── pintar ────────────────────────────────────────────────────────────────────────────────────────
// `da` = esquina del trazo por el EJE DE TRABAJO, en finos desde la esquina de la celda (puede ser
// negativa: el ▬ de una cara «hacia −» se planta un poco por fuera del bloque).
function glifo(cel, eje, da, trazos, color, grupo) {
  const b = [cel[0] * FINOS, cel[1] * FINOS, cel[2] * FINOS];
  const uv = eje === 0 ? [2, 1] : (eje === 1 ? [0, 2] : [0, 1]);
  for (const t of trazos) {
    const p = [b[0], b[1], b[2]];
    p[eje] += da;
    p[uv[0]] += t[0]; p[uv[1]] += t[1];
    VUI.pon(p[0], p[1], p[2], color, grupo);
  }
  return trazos.length;
}

// La cara «hacia −» es el espejo de la «hacia +»: si por arriba el ▬ va en 13..18, por abajo va en
// −2..3. `FINOS − DA_PIEL − GROSOR` es justo eso, y así no hay dos números que ajustar a mano.
function daPiel(out) { return out > 0 ? DA_PIEL : (FINOS - DA_PIEL - GROSOR); }

function limpiaGrupos() { for (const g of GRUPOS) VUI.limpia(g); }

function dibuja(m) {
  limpiaGrupos();
  let n = 0;
  if (m.vacia) {
    // Caja vacía: el motor la MUEVE (REQ-EXTRU3). Un ▬ cian en la cara de trabajo de cada caja.
    for (const s of mc.selCajas) {
      const lo = [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.min(s.a[2], s.b[2])];
      const hi = [Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]), Math.max(s.a[2], s.b[2])];
      const cel = [(lo[0] + hi[0]) >> 1, (lo[1] + hi[1]) >> 1, (lo[2] + hi[2]) >> 1];
      cel[m.eje] = m.out > 0 ? hi[m.eje] : lo[m.eje];
      n += glifo(cel, m.eje, daPiel(m.out), GLIFO_MENOS, CIAN, G_MUEVE);
    }
    return n;
  }
  const total = m.mas.length + m.menos.length;
  const completo = total <= TOPE_GLIFO;
  const trazosMas = completo ? GLIFO_MAS : GLIFO_PUNTO;
  const trazosMenos = completo ? GLIFO_MENOS : GLIFO_PUNTO;
  const coste = trazosMas.length + trazosMenos.length;
  const paso = Math.max(1, Math.ceil(total * coste / TOPE_VOX));   // selección gigante: una de cada `paso`
  for (let i = 0; i < m.mas.length; i += paso) n += glifo(m.mas[i], m.eje, DA_CENTRO, trazosMas, VERDE, G_MAS);
  for (let i = 0; i < m.menos.length; i += paso)
    n += glifo(m.menos[i], m.eje, daPiel(m.out), trazosMenos, ROJO, G_MENOS);
  return n;
}

// ── la ACCIÓN sobre la pieza en vuelo ─────────────────────────────────────────────────────────────
// Dueño (2026-08-28): «*deberian de verse en la pieza a pegar y realizar la accion sobre ella; ademas
// con desaparecer sigue funcionando control+rueda en la seleccion previa*». Dos mitades:
//   · pegando, Ctrl/⇧+rueda ENGORDA o ADELGAZA el cúmulo del portapapeles por la cara marcada;
//   · y ⛔ ese mismo evento NO puede llegar a la rueda de `app.js`, que extruiría la caja de ORIGEN.
// El cúmulo se guarda SIN ROTAR y el gesto viene en ejes de MUNDO ⇒ primero se traduce el eje. `mueve`
// es afín, así que el eje de la pieza que alimenta un eje de mundo se saca probando un paso en cada uno
// (tres restas, y sólo al girar la rueda); no hay tabla inversa escrita en el motor y no merece añadirla.
function ejePieza(mueve, eje) {
  const o = mueve(0, 0, 0);
  for (let k = 0; k < 3; k++) {
    const p = [0, 0, 0]; p[k] = 1;
    const q = mueve(p[0], p[1], p[2]);
    if (q[eje] !== o[eje]) return { k, signo: q[eje] > o[eje] ? 1 : -1 };
  }
  return null;
}

// Engordar por el lado bajo deja celdas en −1, y tanto `mcClipboardDims` como el agarre cuentan desde 0.
// Se recorre la pieza al origen Y EL AGARRE CON ELLA: el agarre es la celda que se clava en la mira, así
// que moverlo igual es lo que mantiene la pieza quieta en la mano mientras le sale la capa nueva.
function normalizaPieza() {
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const c of clipboard.cells) {
    if (c.dx < mx) mx = c.dx; if (c.dz < my) my = c.dz; if (c.dy < mz) mz = c.dy;
  }
  if (!isFinite(mx) || (mx === 0 && my === 0 && mz === 0)) return;
  for (const c of clipboard.cells) { c.dx -= mx; c.dz -= my; c.dy -= mz; }
  const a = mc.pasteAnchor;   // ejes de la pieza: [x, y(altura), z] = [dx, dz, dy]
  if (a) { a[0] = Math.max(0, a[0] - mx); a[1] = Math.max(0, a[1] - my); a[2] = Math.max(0, a[2] - mz); }
}

// LA MISMA REGLA QUE DIBUJA LA GUÍA, aplicada al portapapeles: por cada fila, la celda más lejana en el
// sentido `out`. Engordar la copia un paso más allá (con su material); adelgazar se la come.
function creceEncoge(paso, m) {
  if (!mc.pasteActive || !clipboard || !clipboard.cells || !clipboard.cells.length) return false;
  const g = gesto(m), dims = mcClipboardDims();
  if (!g || !dims) return false;
  const ep = ejePieza(mcOriMove(mcPasteOri(), dims.w, dims.h, dims.d), g.eje);
  if (!ep) return false;
  const k = ep.k, out = g.out * ep.signo;
  const crece = (paso > 0) === (g.ruedaMas === 'arriba');
  const filas = new Map();
  for (const c of clipboard.cells) {
    const p = [c.dx, c.dz, c.dy], q = p[k];
    const f = p[(k + 1) % 3] + ',' + p[(k + 2) % 3];
    const v = filas.get(f);
    if (!v || (out > 0 ? q > v.q : q < v.q)) filas.set(f, { c, q, p });
  }
  if (!filas.size) return false;
  if (crece) {
    for (const v of filas.values()) {
      const p = v.p.slice(); p[k] += out;
      clipboard.cells.push(Object.assign({}, v.c, { dx: p[0], dz: p[1], dy: p[2] }));
    }
  } else {
    const fuera = new Set();
    for (const v of filas.values()) fuera.add(v.c);
    if (fuera.size >= clipboard.cells.length) { toast('La pieza se quedaría sin un solo bloque'); return false; }
    clipboard.cells = clipboard.cells.filter(c => !fuera.has(c));
  }
  normalizaPieza();
  vueloCache = null;                           // la pieza es otra: el sitio donde cae hay que rehacerlo
  mc._pasteCache = null;                     // la vista previa lleva la geometría dentro: hay que rehacerla
  const d = mcClipboardDims();
  toast('Pegar: la pieza ' + (crece ? 'engorda' : 'adelgaza') + ' por ' + g.nombre +
        ' · ' + clipboard.cells.length + ' bloque(s), ' + d.w + '×' + d.h + '×' + d.d, 3);
  return true;
}

// ── cuándo hay que enseñar algo ───────────────────────────────────────────────────────────────────
// Mismas condiciones que la rueda de app.js: Ctrl manda sobre Shift, y Shift sólo cuenta a secas.
let modo = '';            // '' | 'ctrl' | 'shift'
let firma = null;         // última firma dibujada (null = nada dibujado)
let ultimo = null;        // último cálculo, para estado()
let vivo = false;         // interruptor DENTRO del envoltorio: ver `off()`

function modoDe(e) {
  if (e.ctrlKey) return 'ctrl';
  if (e.shiftKey && !e.altKey && !e.metaKey) return 'shift';
  return '';
}

// Hay DOS piezas que pueden llevar el gesto y NO se solapan: pegando manda el cúmulo en vuelo (y la
// herramienta da igual: se pega con cualquiera); si no, la caja de Seleccionar.
function hayPieza() { return mc.pasteActive ? !!piezaEnVuelo()                       // sin sitio, sin promesa
                                            : !!(mc.tool === 'select' && mc.selBox); }
function toca() { return !!(modo && mc.active && hayPieza()); }

function firmaDe() {
  if (!toca()) return '';
  let s = modo + '|' + (caraOpuesta() ? 1 : 0) + '|' + (mc.gridGen | 0);
  if (mc.pasteActive) {
    // La pieza VUELA: su sitio cambia con la mira, así que la firma lleva dónde cae y cómo está puesta.
    const o = piezaEnVuelo();
    if (!o) return '';                                     // sin superficie a la vista no hay promesa
    s += '|pega:' + o.ox + ',' + o.oy + ',' + o.oz + '/' + o.ori + '/' + clipboard.cells.length +
         '/' + o.dims.w + ',' + o.dims.h + ',' + o.dims.d;
  } else {
    for (const c of mc.selCajas) s += '|' + c.a.join(',') + '/' + c.b.join(',');
  }
  if (modo === 'shift') s += '|' + mcEjeMirada().nombre;   // girar la cabeza gira el gesto
  return s;
}

function repinta() {
  if (!vivo) return;
  vueloCache = null;                 // frame nuevo: el cúmulo ya no está donde estaba
  const f = firmaDe();
  if (f === firma) return;
  firma = f;
  if (!f) { limpiaGrupos(); ultimo = null; return; }
  ultimo = calcula(modo);
  ultimo.voxeles = dibuja(ultimo);
}

// ── costura ───────────────────────────────────────────────────────────────────────────────────────
// UNA SOLA envoltura de `mcUpdate`. `base` sale de `._orig` si ya había envoltorio nuestro, así que
// recargar el snippet reemplaza el de antes en vez de apilarse encima.
// ⚠️ Se re-envuelve SIEMPRE, aunque la versión ya coincida: al recargar el snippet, todo esto es un
// CIERRE NUEVO, y dejar puesto el envoltorio viejo sería dejar corriendo el `repinta()` del cierre
// anterior (con su `vivo` y su `firma`) mientras `game.selGuia` habla del nuevo. Dos que pintan en los
// mismos grupos y se pisan la firma: parpadeo.
function envuelve() {
  const f = W.mcUpdate;
  const ya = !!f._selGuia;
  const base = ya ? f._orig : f;
  const env = function (dt) {
    const r = base.apply(this, arguments);
    try { repinta(); } catch (err) { console.warn('🎯 sel-guia: ' + err.message); }
    return r;                                  // ⛔ lo que devuelva el motor, intacto
  };
  env._selGuia = VERSION;
  env._orig = base;
  W.mcUpdate = env;                            // app.js llama por identificador pelado, y en script
  return ya ? 'recargado' : 'puesto';          // clásico eso ES window.mcUpdate
}

// Los oyentes van en `window` y en CAPTURA para llegar antes que nadie, pero NO tocan el evento: sólo
// leen sus modificadores. Ni preventDefault ni stopPropagation: el agarre del giro (Ctrl, REQ-SEL1) y
// todos los atajos siguen funcionando igual.
function alTeclado(e) { modo = modoDe(e); }

// Perder el foco con la tecla pulsada es el caso feo: el `keyup` NUNCA llega y el modo se quedaría
// encendido para siempre. Pero ⚠️ `focus`/`blur` NO BURBUJEAN y aun así un oyente en CAPTURA sobre
// `window` los ve TODOS: enfocar el canvas, un `input` del OSD o cualquier cosa apagaría la guía a
// media pulsación. Por eso estos dos van SIN captura y además comprueban que el que va y viene es la
// VENTANA, no un trozo de la página.
function alFocoVentana(e) { if (!e.target || e.target === W || e.target === document) modo = ''; }

const CAPTURA = { keydown: alTeclado, keyup: alTeclado };
const VENTANA = { blur: alFocoVentana, focus: alFocoVentana };

// ⛔ ÉSTE SÍ TOCA EL EVENTO, y es el único: la rueda de `app.js` cuelga del CANVAS y, pegando, Ctrl+rueda
// le extruía la selección de ORIGEN aunque el cúmulo estuviera volando a diez metros. Se corta antes de
// que llegue —en `window` y en captura, que va delante del canvas—; `preventDefault` mata además el zoom
// del navegador, igual que hace app.js. Sin tecla NO se toca nada: la rueda pelada sigue siendo la rosca.
// Va con `passive:false` explícito: en `window` el navegador da la rueda por pasiva y no dejaría cortarla.
const RUEDA = { capture: true, passive: false };
function alaRueda(e) {
  if (!vivo || !mc.active || !mc.pasteActive) return;
  if (document.pointerLockElement !== mc.canvas) return;
  const m = modoDe(e);
  if (!m) return;
  e.preventDefault(); e.stopPropagation();
  const sello = 'pega:' + m;                   // mismo acumulador y mismo umbral que la rueda del motor:
  if (mc._ruedaExtru !== sello) { mc._ruedaExtru = sello; mc._ruedaAcum = 0; }   // cambiar de gesto lo
  mc._ruedaAcum = (mc._ruedaAcum || 0) + e.deltaY;                               // pone a cero
  const umbral = (isFinite(+mc.ruedaUmbral) && +mc.ruedaUmbral > 0) ? +mc.ruedaUmbral : 30;
  if (Math.abs(mc._ruedaAcum) < umbral) return;
  const paso = mc._ruedaAcum > 0 ? -1 : 1;     // deltaY > 0 = rosca hacia abajo
  mc._ruedaAcum = 0;
  if (creceEncoge(paso, m)) firma = null;      // la pieza ha cambiado: repinta ya, sin esperar a la mira
}

// Se quitan por lo APUNTADO en `window`, no por lo que tenga a mano este cierre: al recargar el snippet
// las funciones son otras, y borrar «las mías» dejaría enganchadas las del cierre anterior para siempre.
function ponOyentes() {
  quitaOyentes();
  const puestos = [];
  for (const k in CAPTURA) { W.addEventListener(k, CAPTURA[k], true); puestos.push([k, CAPTURA[k], true]); }
  for (const k in VENTANA) { W.addEventListener(k, VENTANA[k], false); puestos.push([k, VENTANA[k], false]); }
  W.addEventListener('wheel', alaRueda, RUEDA);
  puestos.push(['wheel', alaRueda, RUEDA]);
  W._selGuiaOyentes = puestos;
}

function quitaOyentes() {
  const puestos = W._selGuiaOyentes;
  if (!puestos) return;
  for (const [k, fn, opc] of puestos) W.removeEventListener(k, fn, opc);
  W._selGuiaOyentes = null;
}

// ── mando ─────────────────────────────────────────────────────────────────────────────────────────
function on() {
  // El grosor y el material sobreviven a `limpia()`, así que se ponen UNA vez: un ✚ de 5 voxeles gordos
  // en vez de 625 finos. `emite` es brillo GRATIS (no ilumina nada) para que la marca se lea en un
  // sótano; `luz:0` para no meter un foco en la escena, que sí costaría.
  for (const g of GRUPOS) { VUI.grosor(g, GROSOR); VUI.material(g, { emite: true, luz: 0 }); }
  const r = envuelve();
  ponOyentes();
  firma = null; vivo = true;
  return (r === 'recargado' ? 'recargado · ' : '') +
         'Shift o Ctrl (con Seleccionar) enseñan por dónde suma ✚ y por dónde resta ▬';
}

// Desenrosca el envoltorio SÓLO si sigue siendo el de fuera. Si otro snippet ha envuelto `mcUpdate`
// después que nosotros, devolverle `._orig` a `window` se llevaría por delante al otro; en ese caso el
// envoltorio se queda en la cadena y lo que se apaga es `vivo`, que es lo que mira `repinta()`.
function off() {
  quitaOyentes();
  modo = ''; firma = null; ultimo = null; vivo = false;
  limpiaGrupos();
  const f = W.mcUpdate;
  if (f && f._selGuia === VERSION && f._orig) { W.mcUpdate = f._orig; return 'fuera — sin marcas y sin envoltorio'; }
  if (f && f._selGuia) return 'fuera — mudo (otro snippet envolvió mcUpdate después: el envoltorio se queda)';
  return 'ya estaba fuera';
}

function puesto() { return vivo && typeof mcUpdate === 'function' && !!mcUpdate._selGuia; }
function conmutar() { return puesto() ? off() : on(); }

// `marcas(modo)` calcula SIN pintar y sin tener que mantener la tecla pulsada: es la puerta para la
// sonda y para la consola. Sin argumento, el modo que esté activo ahora mismo.
function marcas(m) {
  const usa = m || modo;
  if (!usa) return null;
  if (!hayPieza()) return null;
  return calcula(usa === 'ctrl' ? 'ctrl' : 'shift');
}

function estado() {
  const g = modo ? gesto(modo) : null;
  return {
    puesto: puesto(), version: VERSION,
    modo: modo || '(ninguno)',
    dibujando: !!firma,
    caraOpuesta: caraOpuesta(),
    herramienta: mc.tool,
    cajas: mc.selCajas.length,
    hayCaja: !!mc.selBox,
    pegando: !!mc.pasteActive,                                  // pegando el gesto va sobre la pieza en
    piezaBloques: (mc.pasteActive && clipboard && clipboard.cells) ? clipboard.cells.length : 0,   // vuelo,
    piezaCabe: mc.pasteActive ? !!piezaEnVuelo() : null,         // no sobre la caja de origen
    cara: g ? g.nombre : null,
    sumaConRueda: g ? g.ruedaMas : null,
    restaConRueda: g ? g.ruedaMenos : null,
    marcasMas: ultimo ? ultimo.mas.length : 0,
    marcasMenos: ultimo ? ultimo.menos.length : 0,
    cajaVacia: ultimo ? ultimo.vacia : null,
    voxelesPintados: ultimo ? (ultimo.voxeles | 0) : 0,
    grupos: GRUPOS,
    oyentes: !!W._selGuiaOyentes,
    ayuda: 'Mantén Shift o Ctrl con Seleccionar y una caja hecha. ✚ verde = ahí pone · ▬ rojo = eso se come.'
  };
}

W.game.selGuia = { on, off, conmutar, estado, marcas, puesto };

const r = on();
toast('🎯 Mantén Shift o Ctrl con Seleccionar: ✚ verde = por ahí suma · ▬ rojo = por ahí resta · game.selGuia.off()', 6);
return 'sel-guia-extrusion · ' + r;
"""


def publicar():
    data = {'id': ID, 'name': NOMBRE, 'code': CODE}
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s' % ID)
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if publicar() else 1)
