#!/usr/bin/env python3
# @area: snippets
#
# REQ-IMPACTO2 · dos cosas que el dueño vio en cuanto lo probo de verdad (2026-09-03):
#
#   1. «aunque sale el toast, no desaparece el farolillo» — Y ERA UN FALLO MIO, no del consume.
#      `retirarCogido` borraba la celda con `mcSetBlock` y se quedaba tan ancho. Pero ⛔ MCSETBLOCK
#      NO REMALLA (app.js:8105): escribe `mc.grid`, marca el guardado con `mcDirty` y ya. El chunk
#      sigue enseñando el bloque que ya no esta. De ahi el sintoma exacto que describio: no se ve
#      desaparecer, y al recargar ya no esta —porque borrado SI estaba; lo que faltaba era mallar—.
#      El pico no tenia el fallo porque `mcBreak` remalla el solo, y por eso «si rompo un bloque si
#      desaparece». Se arregla con `mcRemeshAround`, que es lo que hace todo el que escribe celdas
#      (ver `mcApplyHist`, app.js:16675).
#
#   2. «cuando desaparece es persistente […] me gustaria que al refrescar pudiese volver a aparecer,
#      que sea algo que pueda controlar con alguna otra variable» → `persistente`, por defecto true.
#
# EL PORQUE DE COMO SE HACE `persistente:false` — NO se inventa nada: app.js ya tiene exactamente
# esta idea montada para la nieve, la CAPA VOLATIL (`mcPonVolatil`, app.js:8152): celdas que viven
# en la malla pero NO en el fichero. Apunta el id que HABIA y quien guarda escribe ESE, no el 0.
# O sea que poner la celda a 0 por ahi es «quitalo de la vista, dejalo en el disco»: recargas y
# vuelve. Cero codigo nuevo de serializacion y cero riesgo de escribir un mundo a medias.
#
# ⚠️ LA ASIMETRIA DE LAS ESTRUCTURAS, dicha sin adornos: una pieza fina no vive en `mc.grid` sino en
# la CABECERA, y ahi no hay capa volatil. Lo que se hace es lo unico honesto: `mcRemoveStruct(quiet)`
# no marca la cabecera y no se guarda, asi que al recargar vuelve. Pero si CUALQUIER OTRA COSA
# guarda el mundo mientras tanto (poner un bloque, mover una nota), la cabecera se escribe sin ella
# y la perdida se hace firme. Para la rejilla `persistente:false` es una garantia; para una
# estructura es «vuelve mientras no guardes otra cosa». Se avisa en `game.bloques.info()`.
#
# ⚠️ Y el reverso, que tambien estaba mal: con `persistente:true` (lo de siempre) una ESTRUCTURA
# rota a flechazos NO se guardaba —`impacto()` no llamaba a `mcDirtyHeader`/`mcScheduleSave`, cosa
# que `recogerCercanos` si hacia—, asi que volvia al recargar sin que nadie lo hubiera pedido.
#
# ⛔ Idempotente y POR ANCLA. Publica por `POST /api/snippets`.
# ⛔ `retirarCogido` y la llamada de `recogerCercanos` estan DUPLICADAS en el snippet (dos copias
#    vivas de la zona ==AL-COGER==, anterior a este trabajo). Sus anclas se esperan 2 veces y se
#    sustituyen LAS DOS: son identicas byte a byte y la segunda es la que manda en tiempo de
#    ejecucion. Por eso cada cambio declara cuantas veces espera su ancla, en vez de exigir 1.
#
#     python3 herramientas/parche_snp_persistente.py --comprobar
#     python3 herramientas/parche_snp_persistente.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

# ── A · la opcion, con su defecto ────────────────────────────────────────────────────────────────
A_VIEJO = """      impactos: Math.max(1, Math.round(num(cfg.impactos, 1))),"""
A_NUEVO = """      impactos: Math.max(1, Math.round(num(cfg.impactos, 1))),
      // REQ-IMPACTO2 · ¿lo que se lleva por delante se va DEL FICHERO o solo de la vista?
      // Por defecto se va de verdad (es lo que hacia hasta ahora y lo que espera cualquiera que
      // rompa algo). Con `persistente:false` la pieza vuelve al recargar el mapa: dianas de
      // practica, cristales de un parkour, la fruta de un puzzle que se rejuega.
      persistente: (cfg.persistente !== false),"""

# ── B · retirar de verdad: remallar, y la via volatil ────────────────────────────────────────────
B_VIEJO = """  function retirarCogido(it) {
    if (it.b.tipo === 'estructura') {
      if (typeof mcRemoveStruct !== 'function' || mc.structures.indexOf(it.s) < 0) return false;
      mcRemoveStruct(it.s, true);   // callado: el aviso lo da quien coge, si es que quiere darlo
      return true;
    }
    if (typeof mcSetBlock !== 'function') return false;
    mcSetBlock(it.b.x, it.b.y, it.b.z, 0);
    return true;
  }"""
B_NUEVO = """  // REQ-IMPACTO2 · quitar una pieza del mundo. Dos matices, y cada uno costo un fallo:
  //
  // 1. ⛔ `mcSetBlock` NO REMALLA (app.js:8105). Escribe la celda y marca el guardado, pero el chunk
  //    sigue dibujando el bloque que ya no esta: «sale el toast y no desaparece», y al recargar ya
  //    no estaba —borrado si estaba, faltaba mallar—. Remallar es lo que hace todo el que escribe
  //    celdas fuera del pico (`mcApplyHist`, app.js:16675).
  // 2. `persistente:false` = fuera de la VISTA, no del FICHERO. Es literalmente la capa volatil de
  //    la nieve (`mcPonVolatil`, app.js:8152): apunta el id que habia y quien guarda escribe ESE.
  //    Para una ESTRUCTURA no hay capa volatil: se retira callada y no se guarda, asi que vuelve
  //    mientras nada mas guarde el mundo. Es lo unico que se puede prometer y se dice en `info()`.
  //
  // ⛔ NO guarda: guarda el que llama, UNA vez y no por pieza (mismo trato que ya tenia).
  function retirarCogido(it, persistente) {
    if (it.b.tipo === 'estructura') {
      if (typeof mcRemoveStruct !== 'function' || mc.structures.indexOf(it.s) < 0) return false;
      mcRemoveStruct(it.s, true);   // callado: el aviso lo da quien coge, si es que quiere darlo
      return true;
    }
    var bx = it.b.x, by = it.b.y, bz = it.b.z;
    if (persistente === false) {
      if (typeof mcPonVolatil !== 'function') return false;
      if (!mcPonVolatil(bx, by, bz, 0)) return false;
      if (typeof mcVolatilRemalla === 'function') mcVolatilRemalla();
      return true;
    }
    if (typeof mcSetBlock !== 'function') return false;
    mcSetBlock(bx, by, bz, 0);
    if (typeof mcRemeshAround === 'function') mcRemeshAround(bx, bz);
    return true;
  }"""

# ── C · alCoger tambien lo respeta (mismo contrato, mismo disparador distinto) ────────────────────
# Lo que NO se guarda tampoco se apunta como tocado: si no, el `mcScheduleSave` del final escribiria
# la cabecera sin la estructura y la «no persistencia» duraria hasta el siguiente autoguardado.
C_VIEJO = """      if (it.cfg.consume) {
        if (!retirarCogido(it)) continue;   // si no se pudo retirar, no se ha cogido: no se dispara
        delete ahora[it.id];
        tocado = true;
        if (it.b.tipo === 'estructura') tocadaCabecera = true;
      }"""
C_NUEVO = """      if (it.cfg.consume) {
        // REQ-IMPACTO2 · `persistente:false` se lleva la pieza de la vista pero no del fichero, asi
        // que tampoco cuenta como «tocado»: guardar aqui haria firme justo lo que no queremos.
        if (!retirarCogido(it, it.cfg.persistente)) continue;   // no se pudo retirar: no se ha cogido
        delete ahora[it.id];
        if (it.cfg.persistente !== false) {
          tocado = true;
          if (it.b.tipo === 'estructura') tocadaCabecera = true;
        }
      }"""

# ── D · el impacto que rompe ─────────────────────────────────────────────────────────────────────
# ⚠️ `recogerCercanos` ya guardaba lo suyo; `impacto()` no guardaba NADA, y por eso una ESTRUCTURA
# rota a flechazos volvia al recargar aunque nadie lo hubiera pedido. La rejilla colaba de
# casualidad, porque `mcSetBlock` marca `mcDirty` y el autoguardado la recoge de rebote.
D_VIEJO = """        if (!retirarCogido(it)) return res;
        res.accion = 'romper';
        res.valor = dispararAlRomper(b);"""
D_NUEVO = """        if (!retirarCogido(it, cfg.persistente)) return res;
        if (cfg.persistente !== false) {
          // La rejilla se guardaba sola (mcSetBlock → mcDirty); la CABECERA no, y por eso una
          // estructura rota a flechazos volvia al recargar sin que nadie lo pidiera.
          if (b.tipo === 'estructura' && typeof mcDirtyHeader === 'function') mcDirtyHeader();
          if (typeof mcScheduleSave === 'function') mcScheduleSave();
        }
        res.accion = 'romper';
        res.valor = dispararAlRomper(b);"""

# ── E · el impacto que coge ──────────────────────────────────────────────────────────────────────
E_VIEJO = """        if (cfg.consume && !retirarCogido(it)) return res;
        res.accion = 'coger';"""
E_NUEVO = """        if (cfg.consume && !retirarCogido(it, cfg.persistente)) return res;
        if (cfg.consume && cfg.persistente !== false) {
          if (b.tipo === 'estructura' && typeof mcDirtyHeader === 'function') mcDirtyHeader();
          if (typeof mcScheduleSave === 'function') mcScheduleSave();
        }
        res.accion = 'coger';"""

# ── F · que `info()` lo cuente: es EL descubridor, y lo que no sale ahi no existe ────────────────
F_VIEJO = """    if (cfg.alImpactar) partes.push('alImpactar → '
      + (typeof cfg.alImpactar === 'function' ? 'js' : cfg.alImpactar)
      + (cfg.impactos > 1 ? ' (' + cfg.impactos + ' impactos)' : ''));"""
F_NUEVO = """    if (cfg.alImpactar) partes.push('alImpactar → '
      + (typeof cfg.alImpactar === 'function' ? 'js' : cfg.alImpactar)
      + (cfg.impactos > 1 ? ' (' + cfg.impactos + ' impactos)' : ''));
    // REQ-IMPACTO2 · solo se dice cuando NO es lo de siempre: una linea por cada defecto seria
    // ruido, y `info()` se lee de un vistazo o no se lee.
    if (cfg.persistente === false) partes.push('persistente:false (vuelve al recargar)');"""

CAMBIOS = [
    # (que, viejo, nuevo, veces_esperadas)
    ('A · opcion `persistente` (por defecto true)', A_VIEJO, A_NUEVO, 1),
    ('B · retirarCogido: remalla, y via volatil si no es persistente', B_VIEJO, B_NUEVO, 2),
    ('C · alCoger respeta `persistente`', C_VIEJO, C_NUEVO, 2),
    ('D · impacto «romper»: pasa `persistente` y guarda', D_VIEJO, D_NUEVO, 1),
    ('E · impacto «coger»: pasa `persistente` y guarda', E_VIEJO, E_NUEVO, 1),
    ('F · game.bloques.info() lo cuenta', F_VIEJO, F_NUEVO, 1),
]


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

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code') or ''
    if not code:
        print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % SNIP)
        return 1

    nuevo, hechos, ya = code, [], []
    for que, viejo, bueno, veces in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != veces:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba %d).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n, veces))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('  ya estaba · %s' % q)
    for q in hechos:
        print('  cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no se publica nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\n✓ «%s» publicado (%d → %d chars).' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
