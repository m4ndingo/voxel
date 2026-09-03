#!/usr/bin/env python3
# @area: snippets
#
# REQ-SAVE1 · `mundo-autoarranque` engancha «guardado-fiel».
#
# QUE ARREGLA. `mcSaveWorldFull` (`web/app.js:22364`) hace `await fetch(...)` y no mira `r.ok`. Un
# 401/403/500 no tira el `fetch` — solo lo hace un corte de red —, asi que la respuesta de un
# servidor que ha dicho «no» sigue de largo: se marca `mc.v2=true`, se VACIA `mc.pend` (la unica
# memoria de lo que faltaba por escribir) y se devuelve `true` a quien pregunto. En modo publico, un
# 403 al guardar un mapa ajeno es la respuesta normal: se construye una tarde entera contra un
# servidor que rechaza cada POST y no se ve un aviso hasta recargar.
#
# POR QUE UN SNIPPET Y NO `app.js` (ley de oro). El arreglo son dos lineas de motor, pero el motor no
# se toca hasta que el cambio haya rodado. «guardado-fiel» sustituye `window.mcSaveWorldFull`
# guardando el original en `_orig`, y `game.guardado.off()` lo devuelve byte a byte. Las tres
# referencias internas de `app.js` (`return mcSaveWorldFull()` en :22322, :22343 y :22350) leen la
# propiedad del objeto global, asi que pasan por el envoltorio sin modificar nada.
# Sonda: `tests/test_guardado_fiel.js` (Playwright) — su §1 demuestra el fallo en el motor pelado.
#
# DONDE SE ENGANCHA. Justo antes de ==TEXTURAS-EMBEBIDAS==, o sea antes de que nada del autoarranque
# pueda disparar un guardado (los `construye-*` de `generador-mundo` guardan el mundo entero). El
# `game.snippet` es idempotente: el propio snippet se va si ya esta puesto.
#
# ⛔ Idempotente y POR ANCLA. Un snippet publicado tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo inserta su bloque. Publica por `POST /api/snippets`, que es lo
# que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_guardado_fiel.py --comprobar
#     python3 herramientas/parche_snp_guardado_fiel.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

ANCLA = '// ==TEXTURAS-EMBEBIDAS== (parche_snp_texturas_embebidas.py — no editar a mano)'

BLOQUE = """// ==GUARDADO-FIEL==
// REQ-SAVE1 · (parche_snp_guardado_fiel.py — no editar a mano)
// PRONTO, y tiene que serlo: a partir de aquí cualquier cosa puede guardar el mundo, y sin esto un
// guardado RECHAZADO por el servidor (401/403/500) se da por bueno, vacía `mc.pend` y devuelve
// `true`. Ley de oro: el motor no se toca; el snippet envuelve `mcSaveWorldFull` guardando `_orig` y
// `game.guardado.off()` lo devuelve. Ver `tests/test_guardado_fiel.js`.
try { await game.snippet("guardado-fiel", { noshow: true }); }
catch (e) { console.warn('guardado-fiel no se pudo cargar:', e && e.message); }
// ==FIN-GUARDADO-FIEL==

"""

CAMBIOS = [
    ('el autoarranque engancha guardado-fiel', ANCLA, BLOQUE + ANCLA),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    # En modo publico `POST /api/snippets` es solo del dueño (F0.4): sin token, 401.
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
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
        if '// ==GUARDADO-FIEL==' in nuevo:
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

    # ⛔ El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se PIERDE.
    cuerpo = {'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}
    for campo in ('categoria', 'ficha'):
        if snip.get(campo):
            cuerpo[campo] = snip[campo]
    if snip.get('protegido') is True:
        cuerpo['protegido'] = True
    pide('%s/api/snippets' % a.sitio, json.dumps(cuerpo, ensure_ascii=False).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
