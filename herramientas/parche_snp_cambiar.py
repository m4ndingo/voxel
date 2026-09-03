#!/usr/bin/env python3
# @area: snippets
#
# REQ-IMPACTO4 · «cambiar» — reemplazar una pieza por otra sin escribir el reemplazo a mano.
#
# EL PORQUE, del dueño (2026-09-03): «me gustaria que una vez impactada la antorcha reemplazarla por
# otra, por ejemplo por su version encendida/apagada» → «funciona correcto aunque me gustaria alguna
# funcion que haga el swap sin tanto codigo para que quede todo mas limpio».
#
# Lo que tenia que escribir el dueño para cambiar una antorcha por su version apagada:
#
#   alImpactar(c) {
#     if (c.tipo === 'estructura') {
#       await game.stamp('antorcha-apagada', c.x, c.y, c.z, c.ori);
#       // ⚠️ y AQUI el detalle que no se adivina: game.stamp RECREA los objetos de mc.structures,
#       // asi que la referencia de antes esta muerta y hay que volver a buscar la vieja DESPUES
#       var vieja = mc.structures.find(s => s.ox===c.x && s.oy===c.y && s.oz===c.z
#                                           && s.key===c.claveExacta);
#       if (vieja) mcRemoveStruct(vieja, true);
#     } else {
#       setVoxel(c.x, c.y, c.z, 'antorcha-apagada');
#     }
#   }
#
# …y ahora:
#
#   'asset:assets/antorcha.vox.json': { impactos: 2, alImpactar: 'cambiar',
#                                       cambiaPor: 'antorcha-apagada' },
#
# DOS FORMAS, y a proposito:
#   · declarativa · `alImpactar: 'cambiar'` + `cambiaPor: '<material>'`. Cuarto modo de despacho,
#     hermano de 'romper' y 'coger', que es como estaba pedido: una palabra que se lee de un vistazo.
#   · a mano     · `game.bloques.cambiar(ficha|x,y,z, nuevo)` → Promise<bool>, para quien ya esta
#     dentro de un `alImpactar` de JS suyo y solo quiere el cambio limpio.
#
# LO CARO, que es justo lo que este parche encapsula:
#   1. ⛔ PONER ANTES DE QUITAR. Al reves hay un frame con el agujero, y el dueño ya vio el parpadeo.
#   2. ⛔ `game.stamp` RECREA los objetos de `mc.structures`: la referencia de antes del estampado
#      queda huerfana (`indexOf` → -1) y el `mcRemoveStruct` no quita nada — quedan las DOS piezas
#      apiladas. La vieja se vuelve a buscar por `ox/oy/oz + clave` DESPUES de estampar.
#   3. El giro se hereda (`c.ori`): la version apagada mira a donde miraba la encendida.
#   4. El contador de impactos vive en `mc._impactos` indexado por clave+celda, asi que al cambiar de
#      material el contador de la nueva empieza en 0 solo. No hay que limpiarlo.
#
# ⚠️ LO QUE NO PROMETE, dicho aqui y no descubierto luego: en una ESTRUCTURA, `persistente:false` NO
#    vale con 'cambiar'. `game.stamp` acaba SIEMPRE en `mcFlushStamp` (app.js:22238), que llama a
#    `mcDirtyHeader()` + `mcScheduleSave()`: la pieza nueva se escribe en la cabecera y el cambio es
#    firme quiera uno o no. En la REJILLA si vale: ahi el cambio va a la capa volatil, que enseña la
#    nueva y guarda la vieja. `info()` lo dice con esas palabras.
#
# Y de paso REQ-XR2 · rayos-X: la cuarta linea no decia nada de `alImpactar`. `resumenCorto` (el que
# la escribe) se quedo sin actualizar cuando se añadio el modo, asi que un mundo lleno de piezas
# rompibles se veia igual que uno vacio. Ahora dice el modo, cuantos golpes lleva ESA celda de los
# que necesita, y a que cambia.
#
# ⛔ Idempotente y POR ANCLA. Publica por `POST /api/snippets`. Solo toca `mundo-autoarranque`.
#
#     python3 herramientas/parche_snp_cambiar.py --comprobar
#     python3 herramientas/parche_snp_cambiar.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'

# ── A · el motor del cambio, justo antes de quien lo va a usar ───────────────────────────────────
A_VIEJO = """  function localizarImpacto(px, py, pz) {"""
# Se compone de tres trozos para poder reordenarlos en A0 sin tener dos copias del texto.
SONDA = """  // Que hay en esta CELDA, tenga comportamiento o no. `localizarImpacto` no vale aqui: aquel solo
  // devuelve lo que tiene `alImpactar` (es el sondeo del choque) y `game.bloques.cambiar(x,y,z,…)`
  // tiene que poder cambiar cualquier cosa. Devuelve la ficha de siempre o null.
  function sondaEn(x, y, z) {
    if (typeof mc === 'undefined' || !mc.grid) return null;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    var ests = mc.structures || [];
    for (var i = 0; i < ests.length; i++) {
      var e = ests[i];
      if (e.ox === x && e.oy === y && e.oz === z) {
        return { tipo: 'estructura', clave: claveBase(e.key), claveExacta: e.key,
                 x: x, y: y, z: z, ori: e.rot | 0 };
      }
    }
    if (typeof mcInside !== 'function' || !mcInside(x, y, z)) return null;
    var id = mc.grid[mcIdx(x, y, z)];
    if (!id) return null;
    var k = mc.blockKey[id] || '';
    var m = /@(\\d{1,2})$/.exec(k);
    return { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
             x: x, y: y, z: z, ori: m ? (+m[1]) : 0 };
  }
"""
DOC_CAMBIAR = """  // REQ-IMPACTO4 · cambiar una pieza por otra. Es la unica funcion del snippet que es ASINCRONA, y
  // no por gusto: `game.stamp` lo es (tiene que resolver el modelo del asset antes de colocarlo).
  //
  // ⛔ PONER ANTES DE QUITAR. Al reves hay un frame con el hueco a la vista, y el dueño lo caza:
  // «se ve un flash entre que se rompe una antorcha y sale la siguiente».
  //
  // ⛔ Y el detalle que cuesta una tarde: `game.stamp` RECREA los objetos de `mc.structures`, asi
  // que la referencia que teniamos de la pieza vieja queda huerfana (`indexOf` → -1) y quitarla no
  // quita nada: quedan las dos apiladas. Hay que volver a buscarla por origen + clave DESPUES.
  //
  // Devuelve una promesa que resuelve a true si de verdad cambio algo.
"""
RESTO_CAMBIAR = """  async function cambiarPieza(b, nuevo, persistente) {
    if (!nuevo || typeof mc === 'undefined' || !mc.grid) return false;
    var x = b.x, y = b.y, z = b.z, ori = b.ori | 0;

    if (b.tipo === 'estructura') {
      if (typeof game === 'undefined' || typeof game.stamp !== 'function') return false;
      // El giro se HEREDA: la version apagada mira a donde miraba la encendida. Es lo que se espera
      // de un reemplazo y lo que el dueño escribio a mano (`c.ori`).
      var puesta = await game.stamp(nuevo, x, y, z, ori);
      if (!puesta) return false;
      // ⛔ AQUI, y no antes: `mc.structures` es otro array con otros objetos.
      var ests = mc.structures || [];
      for (var i = 0; i < ests.length; i++) {
        var s = ests[i];
        if (s.ox === x && s.oy === y && s.oz === z && s.key === b.claveExacta) {
          if (typeof mcRemoveStruct === 'function') mcRemoveStruct(s, true);   // callado
          break;                                    // solo UNA: la que acabamos de poner se queda
        }
      }
      return true;
    }

    // Rejilla. ⚠️ El material se mete en la paleta ANTES, y no es adorno: `setVoxel` con un
    // material que todavia no esta en la de este mundo no lo pone, lo APUNTA para cuando cargue
    // (`mcMatPendiente` → `mcApuntaPendiente`, app.js:22164) y devuelve true con la celda intacta.
    // Como esto promete «la promesa resuelve = ya esta cambiado», se carga y se espera.
    //
    // ⛔ Y se pregunta a `game.addMaterial`, NO a `mcResolveMat`: ese ultimo, ante un material que
    // no conoce, no devuelve 0 — devuelve ROCA (app.js:21966). O sea que el `if (!id)` de rigor no
    // salta nunca y lo que se ve es una antorcha convertida en un cubo de piedra, sin un aviso.
    // `game.addMaterial` resuelve el nombre corto, lo da de alta si hace falta, se sale sola si ya
    // estaba (`mcAddBlock`, app.js:10064) y devuelve el id de verdad.
    if (typeof game === 'undefined' || typeof game.addMaterial !== 'function') return false;
    var id = await game.addMaterial(nuevo);
    if (!(id > 0)) return false;
    // Con `persistente:false` el cambio va a la CAPA VOLATIL: enseña el material nuevo y quien
    // guarde escribe el viejo, o sea que al recargar vuelve la antorcha encendida. Es la misma capa
    // de la nieve (`mcPonVolatil`, app.js:8152).
    if (persistente === false) {
      if (typeof mcPonVolatil !== 'function') return false;
      if (!mcPonVolatil(x, y, z, id)) return false;
      if (typeof mcVolatilRemalla === 'function') mcVolatilRemalla();
      return true;
    }
    // Y lo normal: `setVoxel` remalla y marca el guardado el solo. Se le pasa el ID ya resuelto.
    if (typeof setVoxel !== 'function') return false;
    setVoxel(x, y, z, id);
    return true;
  }
  // El aviso de que ha cambiado, con el mismo trato que alRomper/alCoger: opcional, en try/catch y
  // con la ficha de siempre + `nuevo`.
  function dispararAlCambiar(cfg, b, nuevo, ctx) {
    if (!cfg || typeof cfg.alCambiar !== 'function') return null;
    try {
      var f = { x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg,
                nuevo: nuevo, por: null, info: null };
      if (ctx) { for (var kk in ctx) f[kk] = ctx[kk]; }
      return cfg.alCambiar(f);
    } catch (e) {
      console.warn('alCambiar de "' + b.clave + '": ' + (e && e.message ? e.message : e));
    }
    return null;
  }
  function localizarImpacto(px, py, pz) {"""

# ── B · el cuarto modo de despacho ───────────────────────────────────────────────────────────────
B_VIEJO = """      } else if (cfg.alImpactar === 'coger') {"""
B_NUEVO = """      } else if (cfg.alImpactar === 'cambiar') {
        // REQ-IMPACTO4 · el cambio es ASINCRONO (game.stamp lo es) y `impacto()` no lo es: quien
        // choca —la flecha— no puede quedarse esperando a que se resuelva un asset. Asi que se
        // lanza y `res.valor` es LA PROMESA, para quien la quiera esperar.
        res.accion = 'cambiar';
        res.nuevo = cfg.cambiaPor || null;
        res.valor = cambiarPieza(b, cfg.cambiaPor, cfg.persistente).then(function (hecho) {
          if (hecho) dispararAlCambiar(cfg, b, cfg.cambiaPor, { por: 'impacto', info: info || null,
                                                                golpe: n, de: cfg.impactos,
                                                                punto: [px, py, pz] });
          return hecho;
        });
      } else if (cfg.alImpactar === 'coger') {"""

# ── C · la puerta publica, para quien ya esta dentro de su propio JS ─────────────────────────────
C_VIEJO = """    avisoDeRotura: function (x, y, z, por) {"""
C_NUEVO = """    // REQ-IMPACTO4 · el cambio a mano, para quien tiene su `alImpactar` de JS y solo quiere el
    // reemplazo limpio (poner antes de quitar, y la busqueda de la vieja DESPUES del estampado).
    //
    //   game.bloques.cambiar(c, 'antorcha-apagada')            // con la ficha que ya tienes
    //   game.bloques.cambiar(x, y, z, 'antorcha-apagada')      // o a pelo, por coordenadas
    //
    // Devuelve una PROMESA a true/false. Sin ficha se averigua sola que hay ahi (estructura o
    // rejilla) y con que giro, que es justo lo que nadie quiere volver a escribir.
    cambiar: function (a, b2, c2, d2) {
      var ficha, nuevo;
      if (a && typeof a === 'object') { ficha = a; nuevo = b2; }
      else {
        nuevo = d2;
        var h = sondaEn(a, b2, c2);
        if (!h) return Promise.resolve(false);
        ficha = h;
      }
      if (!ficha || !nuevo) return Promise.resolve(false);
      var cfg = cfgDeClave(ficha.claveExacta || ficha.clave) || null;
      var pers = (ficha.cfg && ficha.cfg.persistente !== undefined)
        ? ficha.cfg.persistente : (cfg ? cfg.persistente : undefined);
      return cambiarPieza(ficha, nuevo, pers).then(function (hecho) {
        if (hecho && cfg) dispararAlCambiar(cfg, ficha, nuevo, { por: 'mano' });
        return hecho;
      });
    },
    avisoDeRotura: function (x, y, z, por) {"""

A_NUEVO = SONDA + DOC_CAMBIAR + RESTO_CAMBIAR

# ── A0 · RECONCILIACION, y por que existe ────────────────────────────────────────────────────────
# La primera version de este parche metia `sondaEn` por su cuenta, con un ancla que caia DENTRO del
# bloque de A: el comentario que explica `cambiarPieza` acababa colgando encima de `sondaEn`, y
# ademas A dejaba de ser idempotente (un segundo pase duplicaba `cambiarPieza`). Ya se publico asi,
# o sea que hay un snippet vivo con ese orden y hay que poder devolverlo a su sitio.
#
# Es OPCIONAL: en un snippet limpio, A ya deja los dos trozos en su sitio y este ancla no aparece.
# Son los MISMOS trozos, solo que al reves, asi que no hay una segunda copia del texto que mantener.
A0_VIEJO = DOC_CAMBIAR + SONDA + '  async function cambiarPieza(b, nuevo, persistente) {'
A0_NUEVO = SONDA + DOC_CAMBIAR + '  async function cambiarPieza(b, nuevo, persistente) {'

# ── A2 · RECONCILIACION · el material se resuelve ANTES de tocar la rejilla ──────────────────────
# Tambien publicado a medias, y este si era un fallo de verdad, cazado por el guardian (§3): con el
# material fuera de la paleta del mundo, `setVoxel` no lo pone —lo APUNTA para cuando cargue
# (`mcMatPendiente`, app.js:22164)— y devuelve true. La promesa resolvia a true con la celda intacta.
# Igual que A0: OPCIONAL, porque en un snippet limpio A ya lo trae bien.
A2_VIEJO = """    // Rejilla. Con `persistente:false` el cambio va a la CAPA VOLATIL: enseña el material nuevo y
    // quien guarde escribe el viejo, o sea que al recargar vuelve la antorcha encendida. Es la
    // misma capa de la nieve (`mcPonVolatil`, app.js:8152).
    if (persistente === false) {
      if (typeof mcPonVolatil !== 'function' || typeof mcResolveMat !== 'function') return false;
      var id = mcResolveMat(nuevo);
      if (!id && typeof game !== 'undefined' && typeof game.addMaterial === 'function') {
        await game.addMaterial(nuevo);              // no estaba en la paleta de este mundo
        id = mcResolveMat(nuevo);
      }
      if (!id) return false;
      if (!mcPonVolatil(x, y, z, id)) return false;
      if (typeof mcVolatilRemalla === 'function') mcVolatilRemalla();
      return true;
    }
    // Lo normal: `setVoxel` del Mundo resuelve el nombre corto, remalla y marca el guardado el solo
    // (`mcSetVoxel`, app.js:22164). No hace falta nada mas.
    if (typeof setVoxel !== 'function') return false;
    setVoxel(x, y, z, nuevo);
    return true;"""
# El texto bueno es el que ya lleva A: se saca de ahi y no hay dos copias que mantener.
A2_NUEVO = RESTO_CAMBIAR[RESTO_CAMBIAR.index('    // Rejilla. ⚠️'):
                         RESTO_CAMBIAR.index('    setVoxel(x, y, z, id);\n    return true;')
                         + len('    setVoxel(x, y, z, id);\n    return true;')]

# ── A3 · RECONCILIACION · ⛔ `mcResolveMat` no devuelve 0 para lo que no conoce: devuelve ROCA ───
# El paso anterior (A2) resolvia el material con `mcResolveMat` y comprobaba `if (!id) return false`.
# Esa comprobacion no salta NUNCA: `mcResolveMat` (app.js:21966) acaba en `mc.name2id['roca']||1`.
# El resultado era una antorcha convertida en un cubo de piedra, y en silencio. Lo caza el guardian
# (§3, «…y lleva el material nuevo» → salia `asset:assets/roca.vox.json`).
# Igual que A0 y A2: OPCIONAL, porque en un snippet limpio A ya lo trae bien.
A3_VIEJO = """    if (typeof mcResolveMat !== 'function') return false;
    var id = mcResolveMat(nuevo);
    if (!id && typeof game !== 'undefined' && typeof game.addMaterial === 'function') {
      await game.addMaterial(nuevo);                // no estaba en la paleta de este mundo
      id = mcResolveMat(nuevo);
    }
    if (!id) return false;"""
A3_NUEVO = A2_NUEVO[A2_NUEVO.index("    if (typeof game === 'undefined'"):
                    A2_NUEVO.index('    if (!(id > 0)) return false;')
                    + len('    if (!(id > 0)) return false;')]

# ── E · `info()` cuenta el cambio y su unica letra pequeña ───────────────────────────────────────
E_VIEJO = """      + (cfg.impactos > 1 ? ' (' + cfg.impactos + ' impactos)' : ''));"""
E_NUEVO = """      + (cfg.impactos > 1 ? ' (' + cfg.impactos + ' impactos)' : '')
      + (cfg.alImpactar === 'cambiar'
          ? (cfg.cambiaPor ? ' por ' + cfg.cambiaPor : ' ⛔ sin cambiaPor: no hara nada') : ''));"""

# ⚠️ Y la letra pequeña donde se va a mirar: `persistente:false` no vale para cambiar una ESTRUCTURA.
E2_VIEJO = """    if (cfg.persistente === false) partes.push('persistente:false (vuelve al recargar)');"""
E2_NUEVO = """    if (cfg.persistente === false) partes.push('persistente:false (vuelve al recargar)'
      + (cfg.alImpactar === 'cambiar' ? ' · ⚠️ no vale en estructuras: game.stamp guarda' : ''));"""

# ── F · REQ-XR2 · rayos-X: la cuarta linea se habia quedado sin `alImpactar` ─────────────────────
F_VIEJO = """    if (cfg.alSeguirPisando) p.push('sigue pisando');"""
F_NUEVO = """    if (cfg.alSeguirPisando) p.push('sigue pisando');
    // REQ-XR2 · esto faltaba: un mundo entero de piezas rompibles a flechazos se veia en rayos-X
    // igual que uno vacio. `golpes` es lo que lleva ESA celda, que es la mitad interesante: con
    // `impactos: 3` hay que poder ver cual va por dos.
    if (cfg.alImpactar) {
      var modo = (typeof cfg.alImpactar === 'function') ? 'js' : cfg.alImpactar;
      var imp = 'alImpactar→' + modo;
      if (modo === 'cambiar' && cfg.cambiaPor) imp += ' ' + cfg.cambiaPor;
      if (cfg.impactos > 1) imp += ' (' + (golpes || 0) + '/' + cfg.impactos + ')';
      if (cfg.consume === false) imp += ' ·no consume';
      p.push(imp);
    }
    if (cfg.persistente === false) p.push('vuelve al recargar');"""

F2_VIEJO = """  function resumenCorto(cfg) {"""
F2_NUEVO = """  // `golpes` = los impactos que lleva ESTA celda (rayos-X se lo pasa; el resto de llamadas no lo
  // tienen y se quedan sin esa parte, que es exactamente lo que se quiere).
  function resumenCorto(cfg, golpes) {"""

# ── G · …y que rayos-X sepa de que celda habla ───────────────────────────────────────────────────
# app.js YA pasa (clave, s, x, y, z) al hueco `mcXrayExtra` (app.js:16247) y lo documenta ahi: la
# celda va suelta y no en un array porque esto corre una vez por etiqueta y frame (~250) y un array
# por llamada es basura para el GC. Solo habia que cogerla.
G_VIEJO = """  function etiquetaRayosX(clave, s) {"""
G_NUEVO = """  function etiquetaRayosX(clave, s, x, y, z) {"""

G2_VIEJO = """    var txt = resumenCorto(cfg);"""
G2_NUEVO = """    // El contador vive en `mc._impactos` con la MISMA clave que usa `impacto()` — si se cambia
    // alli, esto deja de contar y no falla: la etiqueta sale sin la fraccion.
    var golpes = 0;
    if (cfg.impactos > 1 && mc._impactos && x !== undefined) {
      var idC = s ? ('e|' + clave + '|' + x + ',' + y + ',' + z)
                  : ('r|' + x + ',' + y + ',' + z);
      golpes = mc._impactos[idC] || 0;
    }
    var txt = resumenCorto(cfg, golpes);"""

# ── H · ⛔ define() TIENE UNA LISTA BLANCA, y sin esto no sirve de nada lo de arriba ─────────────
# `norm.alImpactar` solo admitia 'romper', 'coger' o una funcion; cualquier otra cosa se quedaba en
# null Y ADEMAS tumbaba el define entero (el guardia de «esto no hace nada» que hay justo debajo).
# O sea: `alImpactar:'cambiar'` no es que no cambiara, es que la definicion no llegaba a existir y
# el material se quedaba con lo que tuviera de antes. Se caza a la primera con el guardian, pero
# solo si el guardian existe.
H_VIEJO = """      alImpactar: (typeof cfg.alImpactar === 'function') ? cfg.alImpactar
        : (cfg.alImpactar === 'romper' || cfg.alImpactar === 'coger') ? cfg.alImpactar : null,"""
H_NUEVO = """      alImpactar: (typeof cfg.alImpactar === 'function') ? cfg.alImpactar
        : (cfg.alImpactar === 'romper' || cfg.alImpactar === 'coger'
           || cfg.alImpactar === 'cambiar') ? cfg.alImpactar : null,
      // REQ-IMPACTO4 · el material al que se cambia. Nombre corto ('antorcha-apagada') o clave
      // entera: lo resuelven `game.stamp` y `setVoxel`, que es lo mismo que ya aceptan en todo lo
      // demas. El GIRO no se declara: se hereda de la pieza que se cambia.
      cambiaPor: (cfg.cambiaPor == null) ? null : String(cfg.cambiaPor).trim(),
      // …y el aviso, opcional, con la ficha de siempre mas `nuevo`.
      alCambiar: (typeof cfg.alCambiar === 'function') ? cfg.alCambiar : null,"""

H2_VIEJO = """      //   'coger'   → dispara su alCoger, respetando su `consume`"""
H2_NUEVO = """      //   'coger'   → dispara su alCoger, respetando su `consume`
      //   'cambiar' → la reemplaza por `cambiaPor` heredando el giro, y dispara su alCambiar"""

H3_VIEJO = """      console.warn('game.bloques.define("' + clave + '"): alImpactar solo admite "romper", "coger" o una funcion; recibido '"""
H3_NUEVO = """      console.warn('game.bloques.define("' + clave + '"): alImpactar solo admite "romper", "coger", "cambiar" o una funcion; recibido '"""

# ⚠️ Y el otro mudo: 'cambiar' SIN `cambiaPor` pasa la lista blanca, define bien, despacha… y no
# cambia nada. Sin este aviso el dueño esta disparando flechas a una antorcha que no se apaga.
H4_VIEJO = """      persistente: (cfg.persistente !== false),"""
H4_NUEVO = """      persistente: (cfg.persistente !== false),
      // ⚠️ 'cambiar' sin `cambiaPor` define bien, despacha bien y no cambia nada: hay que decirlo.
      _sinCambiaPor: (cfg.alImpactar === 'cambiar' && !cfg.cambiaPor),"""

H5_VIEJO = """    if (cfg.luz !== undefined && cfg.luz !== 'pasa' && cfg.luz !== 'tapa' && cfg.luz !== true && cfg.luz !== false) {"""
H5_NUEVO = """    if (norm._sinCambiaPor) {
      console.warn('game.bloques.define("' + clave + '"): alImpactar:"cambiar" necesita `cambiaPor`'
        + ' con el material nuevo (p.ej. cambiaPor: "antorcha-apagada"). Asi no hara nada.');
    }
    if (cfg.luz !== undefined && cfg.luz !== 'pasa' && cfg.luz !== 'tapa' && cfg.luz !== true && cfg.luz !== false) {"""

CAMBIOS = [
    ('H · ⛔ define() admite «cambiar» (+ cambiaPor, alCambiar)', H_VIEJO, H_NUEVO, 1),
    ('H2 · …y su linea en la chuleta de modos', H2_VIEJO, H2_NUEVO, 1),
    ('H3 · …y el aviso del typo lo nombra', H3_VIEJO, H3_NUEVO, 1),
    ('H4 · …y se marca el «cambiar» sin cambiaPor', H4_VIEJO, H4_NUEVO, 1),
    ('H5 · …y se avisa: si no, no cambia nada y no dice por que', H5_VIEJO, H5_NUEVO, 1),
    # ⛔ A se detecta por MARCA, no por «esta el bloque entero»: en cuanto una reconciliacion (A0,
    # A2) le retoca una linea dentro, el bloque deja de aparecer tal cual y A se volveria a meter
    # entero. Con la marca, «ya hay un cambiarPieza» basta y las correcciones van por su ancla, que
    # es como se parchean los snippets en este repo.
    ('A · sondaEn + cambiarPieza + dispararAlCambiar', A_VIEJO, A_NUEVO, 1, False,
     'async function cambiarPieza('),
    ('A0 · recoloca el comentario de cambiarPieza', A0_VIEJO, A0_NUEVO, 1, True),
    ('A2 · resuelve el material antes de tocar la rejilla', A2_VIEJO, A2_NUEVO, 1, True),
    ('A3 · …y por game.addMaterial: mcResolveMat devuelve ROCA', A3_VIEJO, A3_NUEVO, 1, True),
    ("B · despacho: alImpactar:'cambiar'", B_VIEJO, B_NUEVO, 1),
    ('C · game.bloques.cambiar()', C_VIEJO, C_NUEVO, 1),
    ('E · info() dice a que cambia', E_VIEJO, E_NUEVO, 1),
    ('E2 · …y la letra pequeña de persistente', E2_VIEJO, E2_NUEVO, 1),
    ('F · REQ-XR2 · rayos-X enseña alImpactar y el contador', F_VIEJO, F_NUEVO, 1),
    ('F2 · …y resumenCorto recibe los golpes', F2_VIEJO, F2_NUEVO, 1),
    ('G · etiquetaRayosX recibe la celda', G_VIEJO, G_NUEVO, 1),
    ('G2 · …y la usa para el contador', G2_VIEJO, G2_NUEVO, 1),
]

TRABAJO = [('mundo-autoarranque', CAMBIOS)]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    pendientes = []
    for sid, cambios in TRABAJO:
        snip = pide('%s/api/snippets/%s' % (a.sitio, sid))
        code = snip.get('code') or ''
        if not code:
            print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % sid)
            return 1
        print('· %s' % sid)
        nuevo, hechos = code, []
        for c in cambios:
            que, viejo, bueno, veces = c[0], c[1], c[2], c[3]
            opcional = len(c) > 4 and c[4]
            marca = c[5] if len(c) > 5 else None
            if marca and marca in nuevo:
                print('    ya estaba · %s' % que)
                continue
            if bueno and bueno in nuevo:
                print('    ya estaba · %s' % que)
                continue
            n = nuevo.count(viejo)
            # Un cambio OPCIONAL es el que solo hace falta en un snippet que quedo a medias: si su
            # ancla no esta, es que no habia nada que reconciliar y no es un error.
            if opcional and n == 0:
                print('    no aplica · %s' % que)
                continue
            if n != veces:
                print('  ⛔ el ancla de «%s» aparece %d veces (esperaba %d).\n'
                      '     el snippet ha cambiado debajo: no toco NADA.' % (que, n, veces))
                return 2
            nuevo = nuevo.replace(viejo, bueno)
            hechos.append(que)
        for q in hechos:
            print('    cambio    · %s' % q)
        if hechos:
            pendientes.append((sid, snip, code, nuevo))
        else:
            print('    nada que hacer.')

    if not pendientes:
        return 0
    if a.comprobar:
        print('\n--comprobar: no se publica nada.')
        return 0
    for sid, snip, code, nuevo in pendientes:
        pide('%s/api/snippets' % a.sitio,
             json.dumps({'id': sid, 'name': snip.get('name') or sid,
                         'code': nuevo}).encode('utf-8'))
        print('✓ «%s» publicado (%d → %d chars).' % (sid, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
