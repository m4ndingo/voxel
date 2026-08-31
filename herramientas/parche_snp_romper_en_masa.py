#!/usr/bin/env python3
# @area: snippets
#
# REQ-TNT1 · una costura publica minima para que un BORRADO EN MASA mande el evento `alRomper` de lo
# que borra.
#
# EL PORQUE (el dueño, 2026-08-30): «quiero que modifiques el snippet "explosion-tnt" de forma que
# cuando borre un bloque la explosion active los comportamientos "alRomper" de los bloques que borra»
# + «que sea lo mas agnostico que se pueda el cambio en explosion-tnt, no tiene porque conocer los
# otros snippets, solamente enviarles el evento alRomper».
#
# POR QUE NO SE PUEDE HACER SOLO EN «explosion-tnt»: `dispararAlRomper`, `cfgDeClave` y la `tabla` de
# materiales son PRIVADOS de este snippet (viven en su closure), y `game.bloques` solo publicaba
# define/quitar/lista/info/avisos/... Ningun otro snippet podia ni saber si un material tiene
# `alRomper` ni mandarselo.
#
# UNA SOLA PRIMITIVA, Y DEVUELVE UNA FUNCION:
#
#     var avisa = game.bloques.avisoDeRotura(x, y, z);   // ANTES de borrar; null si no hay nada que avisar
#     ... borrar ...
#     if (avisa) avisa();                                // DESPUES de borrar
#
# Es una FUNCION y no una ficha A PROPOSITO: asi quien borra en masa no toca ni una clave, ni un giro,
# ni sabe que snippet hay detras — solo guarda el aviso y lo da. Y el orden (leer con el bloque puesto,
# disparar con la celda ya en aire) es el mismo del pico en `mcBreak`: «se rompe, se abre la sorpresa».
#
# ⛔ NO se toca `app.js`: el motor ya expone la capacidad, esto es solo la puerta del snippet.
#
# ⛔ Idempotente y POR ANCLA. Un snippet del Mundo tiene DOS COPIAS VIVAS, asi que esto nunca reescribe
# el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`, que es lo que da
# papelera y escritura atomica. Sube `VERSION` porque cambia `mundo-autoarranque` (regla de CLAUDE.md).
#
# Cada cambio admite VARIAS anclas: la primera es el original, las siguientes son formas intermedias que
# este mismo parche llego a publicar (aqui, la version de dos primitivas `romperEn`/`dispara` que el
# dueño mando simplificar). Asi vale tanto sobre un snippet virgen como sobre uno ya parcheado.
#
#     python3 herramientas/parche_snp_romper_en_masa.py --comprobar
#     python3 herramientas/parche_snp_romper_en_masa.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

CABECERA = """  game.bloques = {
    version: VERSION,
    define: define, quitar: quitar, lista: lista, info: info,
    avisos: function () { return avisos.slice(); },"""

# La forma intermedia (dos primitivas) que hubo que simplificar: se acepta como ancla para poder
# migrar en caliente un snippet que ya la tuviera publicada.
DOS_PRIMITIVAS = CABECERA + """
    // REQ-TNT1 · la puerta para que un borrado EN MASA (la explosion de TNT) abra las sorpresas de lo
    // que borra. Sin esto no habia forma: `tabla`, `cfgDeClave` y `dispararAlRomper` son privados de
    // este snippet. Son dos primitivas ortogonales, deliberadamente tontas:
    //   · romperEn(x,y,z) LEE (antes de borrar) y FILTRA: null si ahi no hay nada con `alRomper`.
    //   · dispara(ficha)  LANZA (despues de borrar), que es el orden del pico: primero desaparece el
    //     bloque, luego se abre la sorpresa. Devuelve la promesa (REQ-UNDO1b) para quien la espere.
    // La clave y el GIRO se leen igual que en blancoDelPico: la variante vive en la CLAVE ('clave@n'),
    // ⛔ nunca abriendo los bits a mano.
    romperEn: function (x, y, z) {
      if (typeof mc === 'undefined' || !mc.grid || typeof mcInside !== 'function') return null;
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (!mcInside(x, y, z)) return null;
      var id = mc.grid[mcIdx(x, y, z)];
      if (!id) return null;
      var k = mc.blockKey[id] || '';
      var cfg = cfgDeClave(k);
      if (!cfg || !cfg.alRomper) return null;
      var m = /@(\\d{1,2})$/.exec(k);
      return { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
               x: x, y: y, z: z, ori: m ? (+m[1]) : 0 };
    },
    dispara: function (ficha) { return dispararAlRomper(ficha); },"""

UNA_PRIMITIVA = CABECERA + """
    // REQ-TNT1 · la puerta para que un borrado EN MASA (la explosion de TNT) mande el evento
    // `alRomper` de lo que borra. Sin esto no habia forma: `tabla`, `cfgDeClave` y `dispararAlRomper`
    // son privados de este snippet.
    //
    // Devuelve UNA FUNCION (o null): el aviso ya cargado con lo que hay AHORA en esa celda. Se pide
    // ANTES de borrar —con el bloque puesto, que es cuando existen su clave y su giro— y se llama
    // DESPUES —con la celda ya en aire—, que es el orden del pico: «se rompe, se abre la sorpresa».
    //
    // Que sea una funcion y no una ficha es A PROPOSITO: asi quien borra en masa no toca ni una clave,
    // ni un giro, ni sabe que snippet hay detras; solo guarda el aviso y lo da. La variante girada vive
    // en la CLAVE ('clave@n'), como en blancoDelPico: ⛔ nunca se abren los bits a mano.
    avisoDeRotura: function (x, y, z) {
      if (typeof mc === 'undefined' || !mc.grid || typeof mcInside !== 'function') return null;
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (!mcInside(x, y, z)) return null;
      var id = mc.grid[mcIdx(x, y, z)];
      if (!id) return null;
      var k = mc.blockKey[id] || '';
      var cfg = cfgDeClave(k);
      if (!cfg || !cfg.alRomper) return null;
      var m = /@(\\d{1,2})$/.exec(k);
      var b = { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
                x: x, y: y, z: z, ori: m ? (+m[1]) : 0 };
      return function () { return dispararAlRomper(b); };
    },"""

CAMBIOS = [
    (
        'sube VERSION (cambia mundo-autoarranque)',
        ["""  var VERSION = 'v1.39';"""],
        """  var VERSION = 'v1.40';""",
    ),
    (
        'game.bloques publica avisoDeRotura()',
        [DOS_PRIMITIVAS, CABECERA],
        UNA_PRIMITIVA,
    ),
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
    for que, anclas, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        viejo = next((v for v in anclas if nuevo.count(v) == 1), None)
        if viejo is None:
            print('⛔ ninguna ancla de «%s» aparece exactamente una vez (%s).\n'
                  '   el snippet ha cambiado debajo: no lo toco.'
                  % (que, ', '.join(str(nuevo.count(v)) for v in anclas)))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
