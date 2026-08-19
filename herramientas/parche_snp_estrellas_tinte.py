#!/usr/bin/env python3
# efectos-demo · las estrellas salían TODAS BLANCAS, perdiendo el tinte azulado/anaranjado.
#
# La causa: `"*"+col` con `col` array. JS concatena el array como texto y sale `"*0.675,0.765,0.9"`, que no es
# ningún color → mcVoxUIColor no lo entiende y cae al blanco. (Ahora, además, avisa por consola en vez de callarse.)
#
# Y el `*` sobraba de todas formas: las estrellas YA eran autoiluminadas sin pedir nada, porque toda la capa
# game.voxelesUI se dibuja con aEmit=1 —una estrella blanca se ve blanca a medianoche—. El `*` es lo OTRO
# (REQ-GLOW5): que le caiga luz al terreno. A 40 bloques de altura no alumbra nada y encima gasta plaza en las
# MC_DYN_MAX=8 luces dinámicas, dejando fuera la antorcha que tengas al lado.
#
# Se deja escrito ahí mismo cómo se pide el efecto cuando SÍ se quiere (bajarlas a nivel del suelo), ya por CLAVE
# y no metiéndolo dentro del color: game.voxelesUI.material('estrellas', {emite:true, luz:6}).
#
#   python3 herramientas/parche_snp_estrellas_tinte.py
#   …y publicarlo:  curl -X POST localhost:8500/api/snippets -d @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'efectos-demo.json')
MARCA = 'material(this.grupo'

VIEJO = """      U.pon(Math.round((cx + Math.cos(t) * r) / p), Math.round(alt / p),
            Math.round((cz + Math.sin(t) * r) / p), "*"+col, this.grupo);"""

NUEVO = """      // ⚠️ El color es SOLO el color. Autoiluminarse es gratis y ya lo hace la capa entera (aEmit=1): una
      // estrella blanca se ve blanca a medianoche sin pedir nada. Si algún día las bajas a nivel del suelo y
      // quieres que ALUMBREN el terreno, eso es una CLAVE DE MATERIAL, no un prefijo del color:
      //     U.material(this.grupo, { emite: true, luz: 6 });
      U.pon(Math.round((cx + Math.cos(t) * r) / p), Math.round(alt / p),
            Math.round((cz + Math.sin(t) * r) / p), col, this.grupo);"""

VIEJO2 = """    U.grosor(this.grupo, this.grosor);      // ⬅️ el tamaño lo pone la CAPA, no el número de voxeles"""

NUEVO2 = """    U.grosor(this.grupo, this.grosor);      // ⬅️ el tamaño lo pone la CAPA, no el número de voxeles
    U.material(this.grupo, { emite: false });   // ⬅️ los efectos de material van por CLAVE (emite; luego alfa, metal…)"""


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    pares = [('la llamada a U.pon de las estrellas', VIEJO, NUEVO),
             ('la llamada a U.grosor de las estrellas', VIEJO2, NUEVO2)]

    # Todo o nada: se validan las anclas ANTES de tocar una sola letra (el dueño edita este snippet a mano).
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: las estrellas recuperan su tinte; el efecto de material queda por clave')
    return 0


if __name__ == '__main__':
    sys.exit(main())
