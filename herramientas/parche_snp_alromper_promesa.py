#!/usr/bin/env python3
# @area: snippets
#
# REQ-UNDO1b · `alRomper` devuelve su promesa, y el envoltorio de `mcBreak` la propaga.
#
# EL PORQUE (el dueño, 2026-08-28): «haz que alRomper devuelva su promesa». Sin esto, el motor no tiene
# forma de saber cuando termina lo que un `alRomper` construye, y `parche_app_undo_construccion.py`
# tenia que adivinarlo con una ventana de 2 s. Con la promesa se sabe por CAUSA.
#
# LA CADENA COMPLETA (los eslabones 1 y 2 son este parche; el 3 esta en app.js):
#   1. `alRomper` hace `return game.snippet('construye-casa', c)` en vez de tirar la promesa.
#   2. el envoltorio de `mcBreak` devuelve esa promesa hacia arriba.
#   3. `mcDoAction` (app.js) la espera y cierra el gesto de historial cuando acaba.
#
# ⚠️ ESTO NO ROMPE LA REGLA DE «SNIPPETS AGNOSTICOS». Aqui no aparece `hist`, ni `gesto`, ni `undo`:
# solo se devuelve una promesa, que es lo normal en cualquier funcion asincrona. Quien sabe de
# historial es el motor, que es donde el dueño dijo que tenia que estar.
#
# ⛔ Idempotente y POR ANCLA. Y ojo: un snippet del Mundo tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye sus dos anclas. Publica por `POST /api/snippets`, que es
# lo que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_alromper_promesa.py --comprobar
#     python3 herramientas/parche_snp_alromper_promesa.py
import argparse
import json
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

CAMBIOS = [
    (
        'dispararAlRomper devuelve lo que devuelva el alRomper',
        """    try {
      cfg.alRomper({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                     claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });
    } catch (e) {""",
        """    try {
      // Se DEVUELVE lo que devuelva (REQ-UNDO1b): si es una promesa, el motor la espera para saber
      // cuando ha terminado de construirse lo que este roto ha disparado. Devolver una promesa no es
      // saber nada del motor; es lo que hace cualquier funcion asincrona.
      return cfg.alRomper({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                     claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });
    } catch (e) {""",
    ),
    (
        'el envoltorio de mcBreak propaga la promesa hacia arriba',
        """      var blanco = blancoDelPico();
      var res = orig.apply(this, arguments);
      dispararAlRomper(blanco);
      return res;""",
        """      var blanco = blancoDelPico();
      var res = orig.apply(this, arguments);
      // REQ-UNDO1b: si el alRomper devolvio una promesa, ES ella la que sube — el motor la espera para
      // cerrar el gesto de deshacer. Si no hay promesa se devuelve lo de siempre y nada cambia.
      var p = dispararAlRomper(blanco);
      return (p && typeof p.then === 'function') ? p : res;""",
    ),
    (
        'la casita devuelve la promesa de su snippet',
        """      alRomper: function (c) { game.snippet('construye-casa', c); } },""",
        """      alRomper: function (c) { return game.snippet('construye-casa', c); } },""",
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
