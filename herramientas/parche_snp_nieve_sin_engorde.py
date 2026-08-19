#!/usr/bin/env python3
# «Los copos caen y engordan en el suelo, lo cual no tiene ninguna utilidad ni parece realista. Por otro
#  lado siguen cayendo los fps» (dueño, 2026-08-19).
#
# Las dos cosas son mias y las dos se deshacen aqui:
#
#   · `grosorPosada: 3` -> 0. Lo puse para que la alfombra se VIERA sin pagar mas voxeles (engorda el
#     cubo, no el numero de voxeles). Se ve, pero el copo crece al tocar el suelo y eso no parece nieve.
#   · `tope: 1600` -> 420. Lo subi para que lo cuajado durase los 25 s de `dura` en vez de 4, y eso son
#     1 375 voxeles remallados 60 veces por segundo = 1,73 ms/frame contra 0,60. O sea: la caida de fps
#     que sigue viendo es esa, y es mia.
#
# Acumular de verdad NO se arregla con estos dos numeros: mientras la nieve cuajada viva en la capa
# `game.voxelesUI`, se remalla ENTERA cada frame (lo que cae la ensucia), y son 1,28 us por voxel. Para
# llenar la escena hay que sacarla de la capa y hornearla en la MALLA DEL MUNDO, que es gratis por frame.
# Eso va aparte; esto solo deja de empeorar los fps mientras tanto.
#
#   python3 herramientas/parche_snp_nieve_sin_engorde.py
#   curl -X POST localhost:8500/api/snippets -d @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')

VIEJO_TOPE = """  // `tope` alto A PROPÓSITO, y es el mando caro del efecto: es lo que deja que `dura: 25` mande de
  // verdad y el copo se quede de hielo en el suelo, en vez de derretirse a los 4 s por falta de plaza
  // (volando y posados comparten cupo, y caen 55/s). Medido, 40 s simulados en /map/test:
  //   tope  420 → 226 posadas ·  4,1 s de vida · 0,60 ms/frame de remallado
  //   tope 1000 → 809 posadas · 14,6 s         · 1,14 ms
  //   tope 1600 →1375 posadas · 25,0 s = `dura`· 1,73 ms   ⬅️ aquí deja de cortar el cupo
  // Es 1,1 ms/frame más caro que 420 por tener nieve que se queda, y aun así el efecto entero sigue muy
  // por debajo de los 5,66 ms/frame que costaba antes. Para abaratarlo se baja ESTO, no `dura`.
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 1600,"""

NUEVO_TOPE = """  // ⛔ `tope` NO se sube para que la alfombra dure: lo posado se remalla con la capa entera cada frame
  // (1,28 µs por voxel), así que 1 600 costaban 1,73 ms/frame contra 0,60 — la caída de fps que se veía.
  // Acumular es cosa de la MALLA DEL MUNDO, no de este cupo. Aquí `tope` solo limita lo que VUELA.
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,"""

VIEJO_GROSOR = """  // ⬅️ La alfombra, GRATIS. Volando y posados comparten `tope`, así que al suelo solo le quedan ~225
  // plazas y con copos de 1/16 de bloque sobre 26×26 bloques no se ve nada. Engordar el cubo de lo
  // cuajado a 3 tapa 9 veces más por el mismo voxel; subir `tope` en su lugar costaría 1,28 µs/frame
  // por copo. Lo que CAE sigue siendo fino: son grupos distintos.
  grosorPosada: 3,"""

NUEVO_GROSOR = """  // ⛔ `grosorPosada` a 0 a propósito: engordar el copo al tocar el suelo tapaba más por el mismo voxel,
  // pero se ve crecer y no parece nieve («no tiene ninguna utilidad ni parece realista», el dueño).
  grosorPosada: 0,"""

PARES = [('el tope de la nieve', VIEJO_TOPE, NUEVO_TOPE),
         ('el grosor de lo posado', VIEJO_GROSOR, NUEVO_GROSOR)]


def main():
    with open(EFECTOS, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if 'grosorPosada: 0,' in code:
        print('ya estaba deshecho, no se toca')
        return 0
    for nombre, viejo, _ in PARES:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).' % (nombre, n),
                  file=sys.stderr)
            return 1
    for _, viejo, nuevo in PARES:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(EFECTOS)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, EFECTOS)
    print('deshecho: sin engorde al posarse, y tope de vuelo otra vez en 420')
    return 0


if __name__ == '__main__':
    sys.exit(main())
