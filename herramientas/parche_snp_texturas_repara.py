#!/usr/bin/env python3
# @area: snippets
#
# REQ-RED1 · `reparar()` deja de bajarse el mundo entero por segunda vez.
#
# EL PORQUE (el dueño, 2026-09-02): «que no haya tantas peticiones de red 404 al cargar los mapas
# […] si se conoce que assets hay no tendria porque pasar esto», y «no solamente [una salida] mas
# limpia, sino que no haya errores ni sobrecarga de red con peticiones innecesarias».
#
# LO MEDIDO (tests/_probe_red.js sobre un mapa clonado de `tools`, 42 materiales), ANTES:
#     121 peticiones · 23 respuestas 404 · 25 documentos bajados DOS veces · 23 errores en consola
# La carga hacia DOS pasadas identicas sobre la misma paleta:
#     pasada 1 (1276-1853 ms) — `mcBuildPalette`, la legitima.
#     pasada 2 (4174-5804 ms) — arranca 50 ms despues de que se cargue ESTE snippet.
#
# LA CAUSA, exacta: `reparar()` recorre `mc.blockKey` ENTERA y toma «este documento no tiene `caras`»
# como prueba de que es la copia coja del editor. No lo es: **no tener `caras` es el estado normal de
# cualquier textura 16³ maciza**, o sea de casi toda la paleta. Asi que para cada material invalidaba
# la cache (`invalidateTex`) y volvia a pedir el documento (`getRoomData`)… para descubrir dos lineas
# mas abajo (`nCaras(real) === 0`) que no habia absolutamente nada que cambiar. Puro peaje: la mitad
# del trafico de la carga, en cada entrada y en cada mapa. Y como de paso repetia las claves `hab:`
# que en realidad son assets, repetia tambien sus 404.
#
# EL ARREGLO: quien puede estar envenenado **se sabe, no se adivina**. El veneno lo mete `restore()`
# al arrancar y viene de un solo sitio —la copia embebida que el editor guarda en localStorage—, tal
# y como explica la cabecera del propio snippet. De ahi salen las claves a revisar, que es justo lo
# que ya calculaba `limpiarLS()`. Si no hay copia embebida (el caso normal: navegador recien
# abierto), la lista es vacia y `reparar()` no pide ni un byte.
#
# ⚠️ EL ORDEN IMPORTA: `on()` llamaba a `limpiarLS()` ANTES que a `reparar()`. Daba igual mientras se
# barria la paleta entera; ahora no, porque `limpiarLS()` borra justo la prueba. Por eso el tercer
# cambio apunta la lista ANTES de limpiar.
#
# ⛔ NO toca el arreglo de BUG-TEX1, que es la razon de ser del snippet: la copia embebida sigue sin
# poder pisar al fichero (`ingestSano`), el escritor sigue guardando `caras` (`embSano`) y lo que si
# este envenenado se sigue reparando. Lo unico que se quita es revisar a quien nunca estuvo enfermo.
#
# ⛔ Idempotente y POR ANCLA: no reescribe el fichero entero, solo sustituye sus anclas. Publica por
# `POST /api/snippets`, que es lo que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_texturas_repara.py --comprobar
#     python3 herramientas/parche_snp_texturas_repara.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'texturas-embebidas'

CAMBIOS = [
    (
        'VERSION v1.3 → v1.4',
        """  var VERSION = 'v1.3';""",
        """  var VERSION = 'v1.4';""",
    ),
    (
        'reparar() solo mira a los sospechosos, no a la paleta entera',
        """  async function reparar() {
    if (typeof mc === 'undefined' || !mc.blockKey) return { revisadas: 0, arregladas: 0, claves: [] };
    var vistas = {}, arregladas = [];
    for (var i = 0; i < mc.blockKey.length; i++) {
      var k = mc.blockKey[i];
      if (!k || !conFuente(k)) continue;""",
        """  // ⛔ REQ-RED1 · QUIEN PUEDE ESTAR ENVENENADO SE SABE, NO SE ADIVINA.
  // El veneno lo mete `restore()` al arrancar y viene de un solo sitio: la copia embebida que el
  // editor guarda en localStorage. De esa copia solo hacen daño las COJAS —las que perdieron
  // `caras`— y de claves con fuente propia en el servidor, que es letra por letra lo que ya calcula
  // `limpiarLS()`. Esa lista, y ninguna otra, es la que hay que revisar.
  function sospechosas() {
    try {
      var d = JSON.parse(localStorage.getItem('voxelforge:current') || 'null');
      if (!d || !d.textures) return [];
      return Object.keys(d.textures).filter(function (k) {
        return conFuente(k) && !(d.textures[k] && d.textures[k].caras);
      });
    } catch (e) { return []; }
  }

  // `claves` = a quien revisar. Sin argumento se deduce de localStorage, para poder llamarlo a mano
  // con `game.texturasEmbebidas.revisar()`; `on()` la pasa ya hecha, porque para entonces
  // `limpiarLS()` ya ha borrado la prueba.
  async function reparar(claves) {
    if (typeof mc === 'undefined' || !mc.blockKey) return { revisadas: 0, arregladas: 0, claves: [] };
    // ANTES se barria `mc.blockKey` ENTERA y se invalidaba todo lo que no tuviera `caras`. Pero «sin
    // caras» es el estado NORMAL de cualquier textura 16³ maciza, o sea de casi toda la paleta: se
    // volvia a bajar el documento de cada material para descubrir dos lineas mas abajo que no habia
    // nada que cambiar. Medido en un mapa de 42 materiales: 24 documentos bajados DOS veces y 22
    // peticiones 404 repetidas, ~50 % del trafico de la carga, en cada entrada y en cada mapa.
    var lista = claves || sospechosas();
    var vistas = {}, arregladas = [];
    for (var i = 0; i < lista.length; i++) {
      var k = lista[i];
      if (!k || !conFuente(k)) continue;""",
    ),
    (
        'on() apunta a los sospechosos ANTES de que limpiarLS borre la prueba',
        """      instalar();
      limpiarLS();          // lo primero: que la PROXIMA carga no tenga nada que reparar
      this.listo = reparar().then(function (r) {""",
        """      instalar();
      // ⚠️ ORDEN (REQ-RED1): se apunta a QUIEN reparar ANTES de limpiar, porque `limpiarLS()` borra
      // justo la prueba. Antes daba igual —se barria la paleta entera—; ahora que solo se mira a los
      // sospechosos, limpiar primero dejaria la lista vacia y no se repararia nada.
      var sosp = sospechosas();
      limpiarLS();          // lo primero: que la PROXIMA carga no tenga nada que reparar
      this.listo = reparar(sosp).then(function (r) {""",
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
    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n))
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
