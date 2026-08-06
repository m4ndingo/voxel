#!/usr/bin/env python3
"""Genera los assets 16³ de las piezas de redstone en data/habitantes/.

   Uso: python3 redstone/make_piezas.py [--forzar]

   Los dibujos se generan y no se dibujan a mano por dos razones: cada pieza necesita DOS variantes
   (apagada y encendida) que solo se diferencian en el color y en el `*` de emisión, y mantener eso a
   mano a base de copiar-pegar se desincroniza a la primera. Aquí la variante encendida se deriva de
   la apagada, así que no puede quedar torcida.

   ⚠️ Nunca sobrescribe un fichero que ya exista salvo con --forzar: en data/habitantes/ viven los
   dibujos del dueño y aquí no se pisa nada suyo.
"""
import json, os, sys, datetime, time, shutil

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'habitantes')
PAPELERA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'habitantes_trash')
FORZAR = '--forzar' in sys.argv

# Colores. La variante ENCENDIDA lleva '*' delante: en este formato el asterisco es emisión, y es lo
# que hace que mcGlowTocada meta la celda en el índice de emisores y la pieza ALUMBRE de verdad.
ROJO_OFF, ROJO_ON = '#5a1010', '*#ff2d2d'
MADERA, PIEDRA, HIERRO = '#8a5a3b', '#8a8a8a', '#c9c9c9'


# ⚠️ Aquí se dibuja en coordenadas DEL MUNDO —(x, altura, profundidad)— y no en las del fichero.
# El Mundo NO lee el 16³ con la Y hacia arriba: `asset X→x, asset Y→profundidad, asset Z→altura`
# (app.js, dentro de mcStructGeom). O sea que la altura de una pieza puesta es la TERCERA coordenada
# del fichero, no la segunda. Dibujar «a ojo» con la Y arriba —que es lo que parece natural, y lo que
# se hizo la primera vez— sale tumbado 90°: los cables y las placas de pie como una pared y las
# puertas planas por el suelo. Se traduce en un solo sitio, aquí, para que las piezas se puedan
# describir como se ven.
def caja(v, x0, x1, alt0, alt1, prof0, prof1, color):
    for x in range(x0, x1 + 1):
        for alt in range(alt0, alt1 + 1):
            for prof in range(prof0, prof1 + 1):
                v['%d,%d,%d' % (x, prof, alt)] = color   # ← el swap: (x, profundidad, altura)
    return v


def cable(color):
    """Tendido: dos bandas cruzadas pegadas al suelo, para que valga en las cuatro direcciones."""
    v = {}
    caja(v, 0, 15, 0, 0, 6, 9, color)   # banda a lo largo de X
    caja(v, 6, 9, 0, 0, 0, 15, color)   # banda a lo largo de Z
    return v


def placa(color, pisada):
    """Placa de presión: una lámina. Pisada baja un voxel — se ve que está pisada."""
    y = 0 if pisada else 1
    return caja({}, 2, 13, y, y, 2, 13, color)


def palanca(color, arriba):
    """Palanca: peana de piedra y varilla inclinada a un lado u otro según el estado."""
    v = caja({}, 5, 10, 0, 1, 5, 10, PIEDRA)
    for i in range(6):                                   # la varilla se tumba al conmutar
        x = 8 + (i if arriba else -i) // 2
        caja(v, x, x + 1, 2 + i, 2 + i, 7, 8, color)
    return v


def puerta(abierta):
    """Puerta: hoja de 2 voxels de grosor. Abierta gira al lateral y deja el hueco libre."""
    if abierta:
        return caja({}, 0, 1, 0, 15, 0, 15, MADERA)      # replegada contra la jamba
    v = caja({}, 0, 15, 0, 15, 7, 8, MADERA)             # cerrada: tapa el vano
    caja(v, 12, 13, 7, 8, 6, 9, HIERRO)                  # tirador
    return v


def inversor(color):
    """Inversor (la antorcha de Minecraft): luce cuando NO le llega señal. Es el NOT del juego.

       Escucha solo por su ESPALDA (`mira`), y como el lado sale del giro de la clave, el dibujo
       lleva un tope en la cara de delante: sin esa marca no hay forma de ver hacia dónde mira una
       pieza puesta, y un anillo de inversores mal orientado no se distingue de uno bien puesto."""
    v = caja({}, 3, 12, 0, 1, 3, 12, PIEDRA)             # peana
    caja(v, 13, 15, 0, 1, 6, 9, HIERRO)                  # el tope: esta es la cara de DELANTE (+X)
    caja(v, 7, 8, 2, 9, 7, 8, MADERA)                    # varilla
    caja(v, 6, 9, 10, 12, 6, 9, color)                   # cabeza
    return v


def boton(color, pulsado):
    """Botón: la única entrada que NO va en el suelo. Es la pastilla de pared de Minecraft, y va de
       pie MIRANDO al jugador —si se tumba, se confunde con la placa y además no se ve al pulsarla.
       Sobresale del marco y se hunde al pulsarse; se suelta sola (`pulso`)."""
    saliente = 1 if pulsado else 2           # pulsada = a ras del marco
    v = caja({}, 5, 10, 5, 10, 0, 1, PIEDRA)          # el marco, pegado al fondo de la celda
    caja(v, 6, 9, 6, 9, 1, saliente, color)           # la pastilla, que asoma hacia el frente
    return v


def repetidor(color):
    """Repetidor: peana con dos antorchitas y un tope en la cara de DELANTE (+X).

       El tope NO es adorno. `mira` hace que el repetidor escuche solo por su espalda, así que hay un
       lado por el que se le da de comer y otro por el que saca; pero la pieza era simétrica y al
       girarla con R no había forma de ver hacia dónde miraba. Un repetidor que se ve igual por los
       cuatro lados es un repetidor que un día «deja de funcionar» sin motivo aparente. Las antorchas
       van juntas hacia atrás, como en Minecraft, y el tope marca el frente."""
    v = caja({}, 1, 14, 0, 1, 1, 14, PIEDRA)
    caja(v, 3, 4, 2, 5, 7, 8, color)          # la de la entrada, pegada a la espalda
    caja(v, 7, 8, 2, 5, 7, 8, color)          # la del retardo
    caja(v, 13, 14, 2, 3, 4, 11, PIEDRA)      # el tope: cara de DELANTE (+X), como en el inversor
    return v


PIEZAS = {
    'cable':           cable(ROJO_OFF),
    'cable-on':        cable(ROJO_ON),
    'placa':           placa(MADERA, False),
    'placa-on':        placa(ROJO_ON, True),
    'palanca':         palanca(MADERA, False),
    'palanca-on':      palanca(ROJO_ON, True),
    'puerta':          puerta(False),
    'puerta-abierta':  puerta(True),
    'repetidor':       repetidor(ROJO_OFF),
    'repetidor-on':    repetidor(ROJO_ON),
    'inversor':        inversor(ROJO_OFF),
    'inversor-on':     inversor(ROJO_ON),
    'boton':           boton(MADERA, False),
    'boton-on':        boton(ROJO_ON, True),
}


def main():
    ahora = datetime.datetime.now().replace(microsecond=0).isoformat()
    for nombre, voxels in PIEZAS.items():
        ruta = os.path.join(DIR, nombre + '.json')
        if os.path.exists(ruta) and not FORZAR:
            print('  = %-16s ya existe (--forzar para rehacerlo)' % nombre)
            continue
        doc = {
            'format': 'voxelforge-1',
            'size': {'x': 16, 'y': 16, 'z': 16},
            'meta': {'name': nombre, 'type': 'textura'},
            'voxels': voxels,
            'savedAt': ahora,
        }
        # Rehacer una pieza PISA un habitante del dueño, así que antes se copia a la papelera con el
        # mismo formato que usa el servidor (data/habitantes_trash/<ms>__<nombre>.json). Si alguien
        # había retocado la pieza a mano, la versión anterior sigue estando.
        if os.path.exists(ruta):
            os.makedirs(PAPELERA, exist_ok=True)
            respaldo = os.path.join(PAPELERA, '%d__%s.json' % (time.time() * 1000, nombre))
            shutil.copyfile(ruta, respaldo)
        tmp = ruta + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        os.replace(tmp, ruta)          # atómico: el servidor puede estar leyendo la galería
        print('  ✓ %-16s %4d voxels' % (nombre, len(voxels)))
    print('Listo. Claves en el Mundo: ' + ', '.join('hab:' + k for k in PIEZAS))


if __name__ == '__main__':
    main()
