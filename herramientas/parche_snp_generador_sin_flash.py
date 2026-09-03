#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-PLANT1 · quita el FLASHAZO de antes de la pantalla de carga del bioma.

El dueño: «*cuando se está generando el bioma, antes de empezar a salir los mensajes graciosos,
aparece un flashazo que muestra el mundo vacío y la herramienta, para luego quitarse de golpe, que
resulta molesto*».

QUÉ PASABA. `openWorld` apaga la pantalla de carga en cuanto termina de abrir el mapa
(`app.js:22717`), y `generador-mundo` la vuelve a encender un instante después — no puede antes,
porque para construir necesita `mc.active`, que `openWorld` no pone hasta DOS líneas más abajo. En
ese hueco se ve el mundo recién nacido (vacío) con toda la herramienta encima, y acto seguido se
tapa de golpe.

CÓMO SE ARREGLA, SIN TOCAR `app.js` (ley de oro). El corredor ya sabe, ANTES de que `openWorld`
apague nada, si hay bioma que construir: se lo ha dicho `/api/mundos/<slug>/plantilla` y esa
petición se resuelve dentro del `await mcAutoarranque()`. Así que ahí mismo se ANULA
`mcHideLoading` —guardando el original en `_orig`— y se devuelve byte a byte en cuanto la
generación acaba, falla, o el Mundo no llega a abrirse. La pantalla de carga nunca llega a
apagarse: pasa de las fases de `openWorld` a las frases del bioma sin un solo fotograma en medio.

⛔ ES UN PARCHE Y NO UN FICHERO A MANO porque hay DOS copias vivas del snippet (el `.json` del
disco y lo que sirve `POST /api/snippets`): reescribir una deja la otra vieja. Idempotente por la
marca `==SIN-FLASHAZO==`; correrlo dos veces no hace nada la segunda.

    python3 herramientas/parche_snp_generador_sin_flash.py          # contra localhost:8500
    VOXEL_URL=http://localhost:8577 python3 herramientas/parche_snp_generador_sin_flash.py
    python3 herramientas/parche_snp_generador_sin_flash.py --ver    # sólo mirar
"""
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIP = os.path.join(RAIZ, 'data', 'snippets', 'generador-mundo.json')
BASE = os.environ.get('VOXEL_URL', 'http://localhost:8500').rstrip('/')
TOKEN = os.environ.get('VOXELFORGE_TOKEN', '').strip()

MARCA = '==SIN-FLASHAZO=='

# ── El ancla: la línea que ya sabe que hay bioma y todavía nadie ha apagado nada ─────────────────
ANCLA = ("const frases = (ficha.frases && ficha.frases.length) ? ficha.frases "
         ": ['Construyendo el mundo…'];\n")

BLOQUE = """
// ── ⛔ ==SIN-FLASHAZO== · la carga NO se apaga entre openWorld y nosotros ────────────────────────
//
// `openWorld` apaga la pantalla de carga en cuanto acaba (`app.js:22717`) y este corredor la vuelve
// a encender un instante después, ya con `mc.active` puesto. En ese hueco se veía el mundo vacío
// con la herramienta encima y luego se tapaba de golpe: el flashazo que reportó el dueño.
//
// Aquí ya sabemos que HAY bioma que construir (las dos guardas de arriba nos han dejado pasar) y
// seguimos dentro del `await mcAutoarranque()`, o sea ANTES de que nadie apague nada. Así que se
// anula el apagado hasta que terminemos. Ley de oro: el original se guarda en `_orig` y lo devuelve
// `destapa()`, que se llama en TODAS las salidas — fin, fallo, y «el Mundo no llegó a abrirse».
const _hide = (typeof mcHideLoading === 'function') ? mcHideLoading : null;
if (_hide && !_hide._sinFlash) {
  window.mcHideLoading = function () { /* callado a propósito: hay un bioma construyéndose */ };
  window.mcHideLoading._sinFlash = true;
  window.mcHideLoading._orig = _hide;
}
// `apagando` es lo que quería el que llamaba: devolver el motor y ADEMÁS quitar el cartel.
const destapa = (apagando) => {
  const f = window.mcHideLoading;
  if (f && f._sinFlash && f._orig) window.mcHideLoading = f._orig;
  if (apagando) { try { mcHideLoading(); } catch (e) {} }
};
"""

# ── Las tres salidas ────────────────────────────────────────────────────────────────────────────
SALIDAS = [
    # el Mundo no llegó a abrirse: sin esto la pantalla de carga se quedaría puesta PARA SIEMPRE
    ("console.warn('[generador-mundo] el Mundo no llegó a abrirse; no se genera nada "
     "(el mapa sigue pendiente).');\n    return;",
     "console.warn('[generador-mundo] el Mundo no llegó a abrirse; no se genera nada "
     "(el mapa sigue pendiente).');\n    destapa(true);   // ==SIN-FLASHAZO==\n    return;"),
    # la generación falló
    ("if (!bien) { try { mcHideLoading(); } catch (e) {} return; }",
     "if (!bien) { destapa(true); return; }   // ==SIN-FLASHAZO=="),
    # el final feliz
    ("try { mcHideLoading(); } catch (e) {}\nconsole.log('[generador-mundo] «'",
     "destapa(true);   // ==SIN-FLASHAZO==\nconsole.log('[generador-mundo] «'"),
]


def parchea(codigo):
    """Devuelve `(codigo_nuevo, motivo)`. `motivo` sólo cuando NO se puede parchear."""
    if MARCA in codigo:
        return codigo, 'ya está parcheado'
    if codigo.count(ANCLA) != 1:
        return codigo, 'el ancla de las frases no aparece EXACTAMENTE una vez (%d)' % codigo.count(ANCLA)
    nuevo = codigo.replace(ANCLA, ANCLA + BLOQUE)
    for viejo, con in SALIDAS:
        if nuevo.count(viejo) != 1:
            return codigo, 'la salida «%s…» no aparece una sola vez (%d)' % (viejo[:46], nuevo.count(viejo))
        nuevo = nuevo.replace(viejo, con)
    return nuevo, None


def main():
    ver = '--ver' in sys.argv
    doc = json.load(open(SNIP, encoding='utf-8'))
    nuevo, motivo = parchea(doc.get('code', ''))
    if motivo:
        print(('  = ' if motivo == 'ya está parcheado' else '  ⛔ ') + 'generador-mundo: ' + motivo)
        return 0 if motivo == 'ya está parcheado' else 1
    print('  ~ generador-mundo: %d B → %d B' % (len(doc['code']), len(nuevo)))
    if ver:
        return 0

    # El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se pierde.
    cuerpo = {'id': 'generador-mundo', 'name': doc.get('name') or 'Generador de mundo', 'code': nuevo}
    for campo in ('categoria', 'ficha'):
        if doc.get(campo):
            cuerpo[campo] = doc[campo]
    if doc.get('protegido') is True:
        cuerpo['protegido'] = True
    pet = urllib.request.Request(BASE + '/api/snippets',
                                 data=json.dumps(cuerpo, ensure_ascii=False).encode('utf-8'),
                                 method='POST', headers={'Content-Type': 'application/json'})
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
    try:
        with urllib.request.urlopen(pet, timeout=20) as r:
            r.read()
    except urllib.error.HTTPError as e:
        print('  ⛔ HTTP %d — %s' % (e.code, e.read()[:200].decode('utf-8', 'replace')))
        return 1
    except Exception as e:
        print('  ⛔ %s' % e)
        return 1
    print('  ✓ publicado en ' + BASE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
