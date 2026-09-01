#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F4.2 · engancha `sesion-guardia` a los DOS autoarranques del motor.

Qué hace `sesion-guardia`: quitarle los atajos de desarrollo (Alt+C, Alt+D, Alt+A) a quien no tenga
el permiso. Lo VISIBLE ya lo esconde `web/style.css` con `[data-solo-si=<permiso>]` contra el
`data-puede` que pone la propia página, y eso no pasa por aquí — el CSS llega con el documento y un
snippet llega después, así que si escondiera el snippet habría medio segundo con el panel a la vista.

⚠️ Esconder no es prohibir. `POST /api/snippets` contesta 403 a quien no tenga
`snippet.editar_sistema` aunque abra el panel desde la consola (F1). Esto es la cortina.

Tres cosas de forma, que son las que se pagan caras:

  · Se PARCHEA, no se reescribe. `mundo-autoarranque` son 300 KB de trabajo del dueño; aquí solo se
    mete un bloque entre anclas y se comprueba antes que no estaba ya.
  · Va AL PRINCIPIO del código, no al final. Al final de 300 KB de definiciones de bloques el
    guardia llegaría el último, y en `editor-autoarranque` ni siquiera llegaría: ese snippet termina
    con un `location.href` y lo que vaya detrás no corre.
  · NO se espera con `await`. Es cosmética y no puede retrasar la entrada al Mundo. Mismo criterio
    que el bloque de `redstone-arranque`, que ya hace exactamente esto unas líneas más abajo.

    python3 herramientas/parche_snp_guardia.py
    curl -X POST localhost:8500/api/snippets -d @data/snippets/mundo-autoarranque.json
    curl -X POST localhost:8500/api/snippets -d @data/snippets/editor-autoarranque.json
"""
import json, os, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data', 'snippets')
DESTINOS = ('mundo-autoarranque', 'editor-autoarranque')

ANCLA = '// ==GUARDIA-SESION=='
BLOQUE = ANCLA + """
// F4.2 · lo primero de todo: `sesion-guardia` le quita los atajos de desarrollo (Alt+C, Alt+D,
// Alt+A) a quien no tenga el permiso. No se espera a propósito — es cosmética y no puede retrasar
// la entrada al Mundo; y fallar aquí tampoco puede impedirla, de ahí el `catch`.
game.snippet('sesion-guardia').catch(function (e) {
  console.warn('sesion-guardia no se pudo arrancar:', e && e.message);
});
// ==FIN-GUARDIA-SESION==

"""


def main():
    puestos, ya = [], []
    for sid in DESTINOS:
        ruta = os.path.join(SNIPS, sid + '.json')
        if not os.path.exists(ruta):
            print('ABORTA: no existe %s' % ruta, file=sys.stderr)
            return 1
        with open(ruta, encoding='utf-8') as f:
            doc = json.load(f)
        code = doc.get('code', '')
        if ANCLA in code:
            ya.append(sid)
            continue
        doc['code'] = BLOQUE + code
        fd, tmp = tempfile.mkstemp(dir=SNIPS, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ruta)
        puestos.append(sid)

    if ya:
        print('ya lo llevaban, no se tocan: ' + ', '.join(ya))
    if puestos:
        print('guardia enganchado en: ' + ', '.join(puestos))
        print('publícalos:  ' + '  '.join(
            'curl -X POST localhost:8500/api/snippets -d @data/snippets/%s.json' % s for s in puestos))
    return 0


if __name__ == '__main__':
    sys.exit(main())
