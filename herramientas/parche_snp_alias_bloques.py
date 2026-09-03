#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-SNP8 · `game.bloques.define('espada', …)` no encontraba la espada.

EL FALLO, en palabras del dueño: la ficha de `assets/espada-de-diamante.vox.json` promete que
«espada» (su nombre corto) vale para esta pieza, y sin embargo el comportamiento solo se activa
escribiendo la clave entera `asset:assets/espada-de-diamante.vox.json`.

LA CAUSA. `resolver()` (dentro de este mismo snippet) se inventa su propio nombre corto: parte la
clave por `:` y por `/`, así que de `asset:assets/espada-de-diamante.vox.json` saca
`espada-de-diamante`. El ALIAS del asset —el nombre corto que le puso su autor y que vive en
`assets/index.json`— no aparece por ningún lado: `resolver()` nunca consulta las tablas del motor
(`mcAssetsRegistry`, `MC_MAT_ALIAS`, `mcClaveDeNombre`). Resultado: «espada» no casaba con nada, se
caía por el camino de las pistas, encontraba las DOS espadas por subcadena y cantaba un
«¿Querías…?» engañoso — cuando el motor, preguntado a la cara, contesta la clave buena sin dudar.
O sea: la promesa de la ficha era cierta para `setVoxel` y mentira para `game.bloques.define`.

QUÉ HACE ESTE PARCHE. Añade UNA puerta más en `resolver()`: preguntarle al motor por su propio
resolvedor de nombres. Nada más.

⚠️ LAS DOS DECISIONES QUE IMPORTAN, y por qué:

  1. Va DESPUÉS de los dos `cand.*` y ANTES de `pistas`. Los caminos de arriba (clave exacta, nombre
     corto único, nombre corto ambiguo) quedan byte a byte como estaban; los de abajo (BUG-SNP1
     «todavía no está en este mundo», BUG-SNP2 la familia, los parecidos) solo se pisan cuando la
     respuesta del motor es FIRME. Un alias que existe no es un dedo torcido.

  2. Solo se acepta si la clave está en `conocidas`. ⛔ Esto no es una comprobación de más:
     `mcClaveDeNombre` acaba en `return 'hab:' + n` para CUALQUIER nombre que no conozca
     (`app.js:9320`), así que fiarse de ella a ciegas convertiría cada errata en una clave válida y
     se llevaría por delante justo los avisos de BUG-SNP1/BUG-SNP2.

⛔ Y UNA TRAMPA QUE COSTÓ UNA PASADA DE TESTS: dentro de `resolver()` no puede quedar un `}` en la
COLUMNA 2. `tests/test_material_familia.js` extrae esta función VERBATIM POR TEXTO del snippet y la
corta por el primer `\\n  }\\n` (las funciones del snippet viven en una IIFE, así que cierran ahí), de
modo que un `if (…) { … }` de varias líneas la parte por la mitad y el `vm` casca con
«Unexpected end of input». Es el mismo cuidado que ya pide `mcFineBoxHit` con
`test_rayo_apuntado.js`. Por eso el `try` y el `if` van cada uno en UNA línea.

⚠️ Y LA SEGUNDA, de propina: el ancla lleva su indentación EXACTA (cuatro espacios). Con dos casaba
igual —es subcadena de la línea buena— pero dejaba el injerto desalineado y, sobre todo, partía la
línea del ancla, de modo que la siguiente pasada ya no reconocía lo puesto y volvía a inyectarlo.

    python3 herramientas/parche_snp_alias_bloques.py --comprobar
    python3 herramientas/parche_snp_alias_bloques.py
"""
import argparse
import json
import os
import sys
import urllib.request

SITIO = os.environ.get('VOXELFORGE_SITIO') or 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

# ⚠️ CUATRO espacios, que es como está indentado el cuerpo de `resolver()` en el snippet. Con dos el
# ancla casa igual (es subcadena de la línea de verdad) y el parche entra... desalineado y partiendo
# la línea del ancla en dos trozos, que es lo que convierte una segunda pasada en un duplicado.
ANCLA = """    var pistas = conocidas.filter(function (k) { return k.indexOf(clave) >= 0; });"""

# ⛔ Ni un `}` en la columna 4 (ver la trampa de arriba): el `try` y el `if` caben cada uno en una
# línea, y así `test_material_familia.js` sigue pudiendo recortar `resolver()` por texto.
PUERTA = """    // BUG-SNP8: el nombre corto que el autor le puso a un asset (`assets/index.json`) lo sabe el
    // MOTOR, no `nombreCorto()`: de `asset:assets/espada-de-diamante.vox.json` aquí sale
    // `espada-de-diamante`, y la ficha promete que «espada» también vale. Se lo preguntamos a quien
    // tiene la tabla, que es el mismo que va a colocar la pieza.
    // ⛔ Solo si la respuesta está en `conocidas`: `mcClaveDeNombre` devuelve `'hab:'+nombre` para
    // cualquier cosa que no conozca, y darla por buena haría «pasable» cada errata, matando los
    // avisos de BUG-SNP1 y BUG-SNP2 que hay tres líneas más abajo.
    var porAlias = null;
    try { if (typeof mcClaveDeNombre === 'function') porAlias = mcClaveDeNombre(clave); } catch (e) { porAlias = null; }
    if (porAlias && porAlias !== clave && conocidas.indexOf(porAlias) >= 0) return { clave: porAlias, alias: true };
"""

CAMBIOS = [
    ('resolver() pregunta al motor por el alias del asset', ANCLA, PUERTA + ANCLA),
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

    # ⛔ El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se PIERDE
    # (`categoria: sistema` y `protegido: true` son justamente lo que impide que se borre por error).
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
