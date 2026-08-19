#!/usr/bin/env python3
# «Al caer/impactar los copos se hacen más grandes un instante antes de desaparecer; queda bonito como
#  gota de agua, pero no se mantiene como copo de hielo» (dueño, 2026-08-19).
#
# El engorde es `grosorPosada`, y eso funciona. Lo que falla es que dura un instante: al reciclar para que
# la nieve no pare, volando y posados comparten `tope`, asi que el copo cuajado vive ~4 s (225 plazas /
# 55 copos por segundo) en vez de los 25 de `dura`. O sea: cuaja, se ve, y se lo lleva el reciclado.
#
# Subir `tope` a secas costaria 1,28 us por voxel y por frame (medido, lineal hasta 16 000): los 1375
# posados que pide `dura: 25` serian 1,76 ms/frame, justo lo que se acababa de ahorrar en fps.
#
# Asi que se paga, y aqui esta la factura MEDIDA en /map/test (40 s simulados, 55 copos/s, dt 1/30):
#
#     tope   posadas  volando  voxeles capa  vida de lo cuajado  remallado
#      420     226      194        418            4,1 s           0,60 ms
#     1000     809      191        982           14,6 s           1,14 ms
#     1600    1375      190       1516           25,0 s  <- `dura` 1,73 ms
#     2400    1374      195       1525           25,0 s           1,78 ms
#
# `tope: 1600` es el punto donde `dura: 25` vuelve a mandar; de ahi para arriba no cambia nada porque ya
# no es el cupo quien corta. Cuesta 1,73 ms/frame de remallado contra 0,60: son 1,1 ms mas por tener
# nieve que se queda. Aun asi el efecto entero sigue MUY por debajo de los 5,66 ms/frame que costaba
# antes de todo esto. El mando para bajarlo es `tope` (la tabla de arriba), no `dura`.
#
# ⚠️ De paso, lo cuajado se ajusta a la reticula del cubo gordo. NO es por ahorro: medido, colapsa 1,0
# copos por voxel con `radio: 13` —los copos caen repartidos por 26x26 bloques y casi nunca coinciden en
# la misma placa—, o sea que no ahorra NADA ahi. Es para que la alfombra quede embaldosada en vez de
# hecha de cubos solapados a 1/16 de bloque, que es lo que la hace parecer hielo y no espuma; solo ahorra
# cuando la nieve se amontona en poco sitio.
#
#   python3 herramientas/parche_snp_nieve_hielo.py
#   curl -X POST localhost:8500/api/snippets -d @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -d @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')
MARCA = 'la retícula del cubo GORDO'

PINTA_V = """      // El cubo gordo crece hacia +x/+y/+z desde su esquina, así que lo cuajado se apila HACIA ARRIBA
      // sobre la cara en la que se paró: es lo que se quiere, no hay que recolocar nada.
      U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f],
            (gordo && g.posada) ? GP : C.grupo);"""

PINTA_N = """      // El cubo gordo crece hacia +x/+y/+z desde su esquina, así que lo cuajado se apila HACIA ARRIBA
      // sobre la cara en la que se paró: es lo que se quiere, no hay que recolocar nada.
      // ⚠️ Lo cuajado se ajusta a la retícula del cubo GORDO, y NO es por ahorrar: medido, colapsa 1,0
      // copos por voxel con `radio: 13` —caen repartidos por 26×26 bloques y casi nunca coinciden en la
      // misma placa—, así que ahí no ahorra nada; solo ahorra si la nieve se amontona en poco sitio.
      // Es para que la alfombra quede EMBALDOSADA en vez de hecha de cubos solapados a 1/16 de bloque:
      // es lo que la hace parecer hielo y no espuma. La capa es un mapa POR CELDA, así que dos copos en
      // la misma placa son una sola clave y un solo voxel.
      if(gordo && g.posada){
        const q = C.grosorPosada;
        U.pon(Math.floor(g.x/(p*q))*q, Math.floor(g.y/(p*q))*q, Math.floor(g.z/(p*q))*q,
              [c[0]*f, c[1]*f, c[2]*f], GP);
      }else{
        U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f], C.grupo);
      }"""

TOPE_V = """  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,"""
TOPE_N = """  // `tope` alto A PROPÓSITO, y es el mando caro del efecto: es lo que deja que `dura: 25` mande de
  // verdad y el copo se quede de hielo en el suelo, en vez de derretirse a los 4 s por falta de plaza
  // (volando y posados comparten cupo, y caen 55/s). Medido, 40 s simulados en /map/test:
  //   tope  420 → 226 posadas ·  4,1 s de vida · 0,60 ms/frame de remallado
  //   tope 1000 → 809 posadas · 14,6 s         · 1,14 ms
  //   tope 1600 →1375 posadas · 25,0 s = `dura`· 1,73 ms   ⬅️ aquí deja de cortar el cupo
  // Es 1,1 ms/frame más caro que 420 por tener nieve que se queda, y aun así el efecto entero sigue muy
  // por debajo de los 5,66 ms/frame que costaba antes. Para abaratarlo se baja ESTO, no `dura`.
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 1600,"""


def parchea(ruta, pares, marca, reparos=()):
    """`reparos` = (texto viejo, texto nuevo) que se aplican AUNQUE ya esté parcheado.

    Existe porque la primera versión de este parche se publicó con dos cifras que me inventé antes de
    medir («1375 copos → 401 voxeles»): al medirlas de verdad colapsan 1,0 por voxel, o sea nada. Un
    comentario con un número falso es peor que no tener comentario, así que el script las repara en lo
    ya publicado en vez de saltárselo por la marca.
    """
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    for falso, cierto in reparos:
        if falso in code:
            code = code.replace(falso, cierto)
            doc['code'] = code
            guarda(ruta, doc)
            print('reparadas las cifras inventadas en ' + os.path.basename(ruta))
    if marca in code:
        print('ya estaba parcheado, no se toca: ' + os.path.basename(ruta))
        return 0
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    guarda(ruta, doc)
    print('parcheado: ' + os.path.basename(ruta))
    return 0


def guarda(ruta, doc):
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


# Lo que se publicó con cifras inventadas → lo mismo con las medidas. Ver `parchea()`.
REPARO_PARTIC = ("""      // ⚠️ Y lo cuajado se ajusta a la retícula del cubo GORDO. Esto es lo que hace que la alfombra
      // AGUANTE: la capa es un mapa POR CELDA, así que los copos que caen en la misma placa colapsan
      // en UNA clave y cuestan UN voxel (medido: 1375 copos → 401 voxeles, 3,4 por voxel). Sin ajustar,
      // dos copos a 1/16 de bloque pintaban dos cubos casi superpuestos: se pagaban dos y se veía uno.
      // Como el coste de la capa es POR VOXEL (1,28 µs), esto es lo que permite subir `tope` hasta que
      // `dura` vuelva a mandar en vez de que el reciclado se lleve el copo a los 4 segundos.""",
      """      // ⚠️ Lo cuajado se ajusta a la retícula del cubo GORDO, y NO es por ahorrar: medido, colapsa 1,0
      // copos por voxel con `radio: 13` —caen repartidos por 26×26 bloques y casi nunca coinciden en la
      // misma placa—, así que ahí no ahorra nada; solo ahorra si la nieve se amontona en poco sitio.
      // Es para que la alfombra quede EMBALDOSADA en vez de hecha de cubos solapados a 1/16 de bloque:
      // es lo que la hace parecer hielo y no espuma. La capa es un mapa POR CELDA, así que dos copos en
      // la misma placa son una sola clave y un solo voxel.""")

REPARO_EFECTOS = ("""  // `tope` alto A PROPÓSITO: es lo que deja que `dura: 25` mande de verdad y el copo se quede de hielo
  // en el suelo en vez de derretirse a los 4 s por falta de plaza (volando y posados comparten cupo, y
  // caen 55/s). Se puede porque la alfombra ya no cuesta un voxel por copo: lo cuajado se ajusta a la
  // retícula del cubo gordo y colapsa, así que estos 1600 copos pintan ~600 voxeles, no 1600.""",
      """  // `tope` alto A PROPÓSITO, y es el mando caro del efecto: es lo que deja que `dura: 25` mande de
  // verdad y el copo se quede de hielo en el suelo, en vez de derretirse a los 4 s por falta de plaza
  // (volando y posados comparten cupo, y caen 55/s). Medido, 40 s simulados en /map/test:
  //   tope  420 → 226 posadas ·  4,1 s de vida · 0,60 ms/frame de remallado
  //   tope 1000 → 809 posadas · 14,6 s         · 1,14 ms
  //   tope 1600 →1375 posadas · 25,0 s = `dura`· 1,73 ms   ⬅️ aquí deja de cortar el cupo
  // Es 1,1 ms/frame más caro que 420 por tener nieve que se queda, y aun así el efecto entero sigue muy
  // por debajo de los 5,66 ms/frame que costaba antes. Para abaratarlo se baja ESTO, no `dura`.""")


def main():
    return (parchea(PARTIC, [('pinta()', PINTA_V, PINTA_N)], MARCA, [REPARO_PARTIC])
            or parchea(EFECTOS, [('el tope de la nieve', TOPE_V, TOPE_N)], 'tope: 1600', [REPARO_EFECTOS]))


if __name__ == '__main__':
    sys.exit(main())
