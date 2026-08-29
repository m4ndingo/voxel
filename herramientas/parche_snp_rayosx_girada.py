#!/usr/bin/env python3
# @area: mundo
#
# REQ-ORI1 (remate) · En rayos-X, la pieza girada no dice su comportamiento.
#
# EL PARTE DEL DUEÑO (2026-08-28): «solamente "casita" indica "alRomper" en rayosx, las otras no sale,
# aunque todas son rompibles/activables». Y tiene razon en las dos mitades: se PORTAN bien (romper una
# `casita@2` levanta su casa igual) y sin embargo la cuarta linea de la etiqueta sale vacia.
#
# POR QUE. El comportamiento se declara UNA vez, por la clave sin giro (`game.bloques.define('casita')`),
# y las 24 posturas se derivan metiendo el giro EN LA CLAVE (`casita@2`). Por eso este snippet resuelve
# la tabla con `cfgDeClave`, que prueba la clave exacta y despues la base — y asi lo hacen los dos sitios
# donde el comportamiento tiene que NOTARSE: el bucle de pisar (linea 289) y el disparo de `alRomper`
# (3777). Pero `etiquetaRayosX` se quedo con el lookup crudo `tabla[clave]`, sin el respaldo a la base:
#
#     function etiquetaRayosX(clave, s) {
#       var cfg = tabla[clave];        ← 'hab:casita@2' no esta en la tabla; 'hab:casita' si
#       if (!cfg) return '';           ← y se va sin cuarta linea
#
# O sea que no es que la girada no tenga comportamiento: es que el CARTEL no sabe buscarlo. Justo el
# caso en que mas falta hace, porque rayos-X es lo que el dueño usa para comprobar que una pieza quedo
# bien puesta.
#
# EL ARREGLO son cuatro palabras: usar `cfgDeClave`, que ya existe diez lineas mas arriba y ya es la
# forma de preguntar de este snippet. No se añade tabla ni caso especial: se deja de preguntar mal.
#
# Sube VERSION (v1.38 → v1.39) porque el mundo vivo la compara para recargar su copia del snippet: sin
# eso, el mapa abierto seguiria con el codigo viejo.
#
#   python3 herramientas/parche_snp_rayosx_girada.py
#
# Idempotente por ancla; solo toca `code`; escritura atomica (temp + os.replace).
import json, os, sys, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

VIEJO = """  function etiquetaRayosX(clave, s) {
    var cfg = tabla[clave];"""

NUEVO = """  function etiquetaRayosX(clave, s) {
    // REQ-ORI1 · por `cfgDeClave` y no por `tabla[clave]`: el comportamiento se declara UNA vez con la
    // clave sin giro y las 24 posturas se derivan metiendolo EN la clave (`casita@2`). Preguntando en
    // crudo, la girada salia sin cuarta linea aunque se porte igual que la recta.
    var cfg = cfgDeClave(clave);"""

VIEJO_V = "var VERSION = 'v1.38';"
NUEVO_V = "var VERSION = 'v1.39';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if NUEVO in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    pares = [('etiquetaRayosX', VIEJO, NUEVO), ("VERSION 'v1.38'", VIEJO_V, NUEVO_V)]
    # Todo o nada: se validan las anclas ANTES de tocar una sola letra (el dueño edita en vivo).
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?)' % (nombre, n),
                  file=sys.stderr)
            return 1
    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado · VERSION v1.39')
    return 0


if __name__ == '__main__':
    sys.exit(main())
