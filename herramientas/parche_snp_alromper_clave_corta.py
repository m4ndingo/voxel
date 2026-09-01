#!/usr/bin/env python3
# @area: snippets
#
# BUG-SNP4 · `alRomper` (y todo comportamiento) se pierde segun COMO se escriba la clave del material.
#
# EL SINTOMA (el dueño, 2026-08-31): «no funciona bien el comportamiento alRomper, por eso estuve
# cambiando entre "casita" y "asset:assets/casita.vox.json"» · «en el mapa test me funciona pero en
# empty no» · «he creado una casa y funciono, no entiendo porque ahora funciona».
#
# LA CAUSA (medido con sonda en /map/test y /map/empty, 2026-08-31):
#   La MISMA casita tiene DOS claves de material segun de donde salga: `hab:casita` (la de la paleta,
#   la que se coloca y se rompe) y `asset:assets/casita.vox.json` (la del disco, la que se estampa).
#   `define()` pasa por `resolver()`, que elige UNA de las dos segun lo que el mundo tenga PUESTO en
#   el momento de arrancar:
#     · /map/test  → la paleta tiene `hab:casita`, no hay clave exacta ⇒ resolver hace ALIAS y
#                    registra en `tabla['hab:casita']`  → romper la casita de la paleta SI dispara.
#     · /map/empty → el catalogo ya trae `asset:assets/casita.vox.json` ⇒ clave exacta, registra en
#                    `tabla['asset:assets/casita.vox.json']` → romper `hab:casita` NO dispara.
#   Y `cfgDeClave()` solo mira la clave EXACTA (y su base sin `@ori`), asi que la otra mitad de la
#   moneda no encuentra nada. De ahi que cambiar el nombre a mano «arreglara» un mapa y rompiera otro.
#
#   Sonda de la prueba (BUG-SNP4, /map/empty): `game.bloques.lista()` tenia
#   `asset:assets/casita.vox.json`, el bloque colocado era `mc.blockKey[34] === 'hab:casita'`, y
#   romperlo daba CERO disparos de `alRomper`.
#
# EL ARREGLO · el mismo criterio que YA usa `resolver()` al dar de alta, aplicado tambien al BUSCAR:
#   si la clave exacta no esta en la tabla, se mira por NOMBRE CORTO (sin namespace, sin carpeta y sin
#   extension: `hab:casita` y `asset:assets/casita.vox.json` son los dos «casita»). Solo cuando ese
#   nombre corto lleva a UN unico comportamiento — si dos materiales distintos comparten nombre corto
#   con configuraciones distintas, el atajo se apaga y todo sigue exactamente como antes.
#
#   Con esto da igual como escriba el dueño la clave: las dos formas funcionan en todos los mapas.
#
# Y de paso: 'castillo' y 'tnt' a secas eran AMBIGUOS en /map/empty («vale para 2 materiales
# (hab:castillo, asset:assets/castillo.vox.json). Escribe la clave entera») ⇒ define() se abortaba y
# esos dos no tenian NINGUN comportamiento alli. Se escriben enteros; el nombre corto cubre el otro.
#
# ⛔ Idempotente y POR ANCLA. Un snippet del Mundo tiene DOS COPIAS VIVAS, asi que esto nunca reescribe
# el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`, que es lo que da
# papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_alromper_clave_corta.py --comprobar
#     python3 herramientas/parche_snp_alromper_clave_corta.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

CAMBIOS = [
    (
        'cfgDeClave tambien busca por nombre corto (BUG-SNP4)',
        """  function claveBase(k) { return k ? String(k).replace(/@\\d{1,2}$/, '') : k; }
  function cfgDeClave(k) { return (k && (tabla[k] || tabla[claveBase(k)])) || null; }""",
        """  function claveBase(k) { return k ? String(k).replace(/@\\d{1,2}$/, '') : k; }
  // BUG-SNP4: la MISMA casita se llama `hab:casita` cuando sale de la paleta y
  // `asset:assets/casita.vox.json` cuando sale del disco. `define()` registra bajo UNA de las dos (la
  // que `resolver()` encuentre en el mundo al arrancar, que cambia de mapa a mapa), y buscar solo por
  // clave exacta dejaba la otra mitad sin comportamiento: en /map/test la casita levantaba la casa y
  // en /map/empty no. Aqui se aplica al BUSCAR el mismo criterio que `resolver()` ya usa al DAR DE
  // ALTA: por nombre corto. Y solo cuando ese nombre corto lleva a un unico comportamiento — si dos
  // materiales distintos lo comparten, el atajo se apaga y se busca como siempre.
  var porCorto = null;   // nombre corto -> cfg (null = hay que rehacerlo; lo invalida reconstruirCache)
  function indicePorCorto() {
    if (porCorto) return porCorto;
    porCorto = {};
    var choque = {};
    Object.keys(tabla).forEach(function (k) {
      var corto = nombreCorto(claveBase(k));
      if (!corto) return;
      if (porCorto[corto] && porCorto[corto] !== tabla[k]) choque[corto] = 1;
      porCorto[corto] = tabla[k];
    });
    Object.keys(choque).forEach(function (c) { delete porCorto[c]; });
    return porCorto;
  }
  function cfgDeClave(k) {
    if (!k) return null;
    var cfg = tabla[k] || tabla[claveBase(k)];
    if (cfg) return cfg;
    return indicePorCorto()[nombreCorto(claveBase(k))] || null;
  }""",
    ),
    (
        'reconstruirCache invalida el indice por nombre corto',
        """  function reconstruirCache() {
    // Solo cuando la paleta CAMBIA de tamaño: es la unica forma de que aparezca un material nuevo, y
    // asi un define() normal no barre la lista de espera por nada.""",
        """  function reconstruirCache() {
    // BUG-SNP4: la tabla acaba de cambiar, asi que el indice por nombre corto se rehace a la primera
    // pregunta. Va aqui porque reconstruirCache() es por donde pasan define() y quitar().
    porCorto = null;
    // Solo cuando la paleta CAMBIA de tamaño: es la unica forma de que aparezca un material nuevo, y
    // asi un define() normal no barre la lista de espera por nada.""",
    ),
    (
        'castillo y tnt con la clave entera (a secas eran ambiguos)',
        """    'castillo': { nota: 'Sorpresa: rompelo con el pico y se levanta un castillo.',
      alRomper: function (c) { return game.snippet('castillo-del-dueno', c); } },
    'tnt': { nota: 'Sorpresa: explota!',
      alRomper: function (c) { return game.snippet('explosion-tnt', c); } },""",
        """    // BUG-SNP4: 'castillo' y 'tnt' a secas valian para DOS materiales (hab:… y asset:…), y ante la
    // duda define() abortaba: en /map/empty ninguno de los dos tenia comportamiento. Con la clave
    // entera el alta es inequivoca, y la busqueda por nombre corto cubre igualmente la otra forma.
    'asset:assets/castillo.vox.json': { nota: 'Sorpresa: rompelo con el pico y se levanta un castillo.',
      alRomper: function (c) { return game.snippet('castillo-del-dueno', c); } },
    'asset:assets/tnt.vox.json': { nota: 'Sorpresa: explota!',
      alRomper: function (c) { return game.snippet('explosion-tnt', c); } },""",
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
