#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enciende `sel-cara-auto` en el arranque del Mundo. Parche IDEMPOTENTE sobre mundo-autoarranque.

El dueño (2026-08-29): «*aplica el parche sel-cara-auto*». El snippet entero vive en
`data/snippets/sel-cara-auto.json` y no se toca aquí: esto solo lo ENCIENDE, que es lo unico que el
mundo tiene que saber. Asi el comportamiento se cambia publicando el snippet, sin volver a pasar por
este parche.

QUE HACE EL SNIPPET: la extrusion de Seleccionar elige sola su cara mirando donde hay aire (Ctrl
arriba/abajo, Shift adelante/hacia ti). No inventa ninguna extrusion nueva — pone solo el interruptor
`mc.selOpuesta` que ya existe (REQ-EXTRU4). El clic central sigue mandando.

ANCLA: `// ==FIN-REDSTONE-ARRANQUE==`, que es PUBLICA y esta en todas las copias. ⛔ NO se ancla en
`==FIN-RELEVO-MULTI==`, que solo existe en la copia viva del dueño (es el gancho al repo privado) y
dejaria este parche sin ancla en un clon limpio.

⚠️ NO sube `VERSION`. `VERSION` es la de `game.bloques` y subirla fuerza la reinstalacion de sus
envoltorios (`mcUpdate`, `mcBreak`); esto no toca ninguno de los dos, va en su propio IIFE al final.

⚠️ EL SNIPPET DEL MUNDO TIENE 2 COPIAS VIVAS: esta y la que el dueño pueda tener abierta en el modal
Alt+C. Si la tiene abierta con una copia anterior, su proximo «guardar» se lleva este parche por
delante. Cerrar el modal (o recargarlo) antes de correr esto.

Uso: python3 herramientas/parche_snp_sel_cara_auto.py
"""
import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data/snippets/mundo-autoarranque.json')

MARCA = '==SEL-CARA-AUTO=='

ANCLA = '// ==FIN-REDSTONE-ARRANQUE=='

NUEVO = ANCLA + """

// ==SEL-CARA-AUTO== (lo pone herramientas/parche_snp_sel_cara_auto.py)
// La extrusion de Seleccionar se orienta sola hacia donde hay aire (dueño, 2026-08-29). Aqui solo se
// enciende; el codigo vive en `data/snippets/sel-cara-auto.json`. Se quita en caliente con
// `game.selAuto.off()` y se pregunta con `game.selAuto.estado()`.
(function () {
  // Aplazado un tick, como el relevo del multi y por lo mismo: `mundo-<mapa>` corre justo despues de
  // este snippet, y alguno trae sus propios envoltorios de la herramienta. Yendo el ultimo, los suyos
  // quedan debajo y se siguen llamando (el envoltorio guarda `._orig` y lo invoca), en vez de que el
  // suyo pise el nuestro.
  setTimeout(function () {
    if (!window.game || typeof game.snippet !== 'function') return;
    // Si el dueño ya lo puso a mano, no se carga otra vez: cargarlo dos veces no rompe nada (el
    // snippet se reemplaza a si mismo por `._orig`), pero suelta un segundo toast sin motivo.
    if (game.selAuto && typeof game.selAuto.puesto === 'function' && game.selAuto.puesto()) return;
    game.snippet('sel-cara-auto');
  }, 0);
})();
// ==FIN-SEL-CARA-AUTO=="""


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('Ya estaba puesto (%s aparece en el snippet). No se toca nada.' % MARCA)
        return 0

    # Todo o nada: se valida el ancla ANTES de tocar una sola letra (el dueño edita en vivo).
    n = code.count(ANCLA)
    if n != 1:
        print('✗ ancla «%s»: aparece %d veces, esperaba 1. No se escribe nada.' % (ANCLA, n),
              file=sys.stderr)
        return 1
    code = code.replace(ANCLA, NUEVO, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, RUTA)
    print('parcheado · el Mundo arranca con sel-cara-auto → %s' % RUTA)
    print('Recarga el mapa para verlo. Quitarlo en caliente: game.selAuto.off()')
    return 0


if __name__ == '__main__':
    sys.exit(main())
