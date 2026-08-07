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


ALTO_PUERTA = 24        # 16 se quedaba baja: se pasa por debajo agachando la cámara


def puerta_hoja():
    """La hoja CERRADA entera, tal como se ve puesta: 24 voxels de alto, o sea celda y media.

       No cabe en un 16³, y ahí está BUG-RS6: mcCabeEnRejilla exige w/h/d ≤ 1 celda, así que una
       pieza de 16×16×24 deja de poder entrar en mc.grid, el clic derecho la estampa como estructura
       suelta y una estructura NO es una celda de rejilla — o sea que deja de ser redstone. Por eso
       el dibujo se hace entero aquí y se PARTE en dos piezas de una celda cada una (ver partir())."""
    v = caja({}, 0, 15, 0, ALTO_PUERTA - 1, 7, 8, MADERA)
    caja(v, 12, 13, ALTO_PUERTA // 2 - 1, ALTO_PUERTA // 2, 6, 9, HIERRO)   # tirador, a media altura
    return v


def abatir(v):
    """Abre la hoja: la gira 90° sobre la jamba (x=0), que es lo que hace una puerta de verdad.

       Es un GIRO del dibujo cerrado, no un dibujo aparte, y eso importa: así la abierta hereda el
       grosor, el tirador y los colores de la cerrada. Dibujarlas por separado se desincroniza a la
       primera —de hecho ya pasó: el dueño subió la cerrada a 24 y la abierta se quedó en 16."""
    ys = [int(k.split(',')[1]) for k in v]
    y0 = min(ys) if ys else 0
    fuera = {}
    for k, c in v.items():
        x, y, z = (int(t) for t in k.split(','))
        fuera['%d,%d,%d' % (y - y0, x, z)] = c       # la anchura pasa a ser profundidad y al revés
    return fuera


def partir(v, piso):
    """El trozo del dibujo que cae en la celda `piso` (0 = abajo), con la altura re-basada a 0..15."""
    lo, hi = piso * 16, piso * 16 + 15
    fuera = {}
    for k, c in v.items():
        x, y, z = (int(t) for t in k.split(','))
        if lo <= z <= hi:
            fuera['%d,%d,%d' % (x, y, z - lo)] = c
    return fuera


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


def piston(extendido):
    """Pistón: cuerpo de piedra con la placa de madera en la cara de DELANTE (+X), que es por donde
       empuja. La marca del frente es obligatoria por lo mismo que en el inversor y el repetidor: la
       dirección sale del giro de la clave (`@n`) y sin dibujo que la enseñe no hay forma de saber
       hacia dónde va a empujar uno ya puesto.

       ⚠️ NO llega a 16³ macizo a propósito. Con 4096 voxels el Mundo lo mete en mc.grid como bloque
       (blockLike) y lo dibuja proyectando 6 caras planas: la placa esculpida —lo único que distingue
       el frente— se perdería. Con el marco rehundido son 3856 y sigue siendo geometría de verdad."""
    v = caja({}, 0, 11, 0, 15, 0, 15, PIEDRA)            # el cuerpo
    if extendido:
        caja(v, 11, 11, 1, 14, 1, 14, ROJO_ON)           # la boca, ya vacía y encendida
    else:
        caja(v, 12, 15, 1, 14, 1, 14, MADERA)            # la placa, rehundida en su marco
    return v


def piston_cabeza():
    """La cabeza del pistón extendido, que ocupa la celda de DELANTE como un bloque propio: lleva la
       placa en su cara +X (la de fuera) y el vástago que la une al cuerpo cruzando la celda."""
    v = caja({}, 12, 15, 1, 14, 1, 14, MADERA)           # la placa, en el extremo de fuera
    caja(v, 0, 11, 6, 9, 6, 9, HIERRO)                   # el vástago, de vuelta hasta el cuerpo
    return v


_HOJA = puerta_hoja()
_HOJA_ABIERTA = abatir(_HOJA)

PIEZAS = {
    'cable':           cable(ROJO_OFF),
    'cable-on':        cable(ROJO_ON),
    'placa':           placa(MADERA, False),
    'placa-on':        placa(ROJO_ON, True),
    'palanca':         palanca(MADERA, False),
    'palanca-on':      palanca(ROJO_ON, True),
    # Una puerta son CUATRO piezas porque son DOS celdas (abajo/arriba) por DOS estados. Las cuatro
    # salen del mismo dibujo de 24: partir() las corta y abatir() las abre. Quien las mantiene juntas
    # en el mundo es el snippet (redstone-piezas.js), que mueve las dos en la misma pasada.
    'puerta':              partir(_HOJA, 0),
    'puerta-alta':         partir(_HOJA, 1),
    'puerta-abierta':      partir(_HOJA_ABIERTA, 0),
    'puerta-alta-abierta': partir(_HOJA_ABIERTA, 1),
    'repetidor':       repetidor(ROJO_OFF),
    'repetidor-on':    repetidor(ROJO_ON),
    'inversor':        inversor(ROJO_OFF),
    'inversor-on':     inversor(ROJO_ON),
    'boton':           boton(MADERA, False),
    'boton-on':        boton(ROJO_ON, True),
    'piston':          piston(False),
    'piston-on':       piston(True),
    'piston-cabeza':   piston_cabeza(),
}


def guardar(nombre, voxels, ahora=None):
    """Escribe una pieza en la galería. Lo usa también partir_puerta.py, que reparte el dibujo del
       dueño en varias celdas: el respaldo y la escritura atómica tienen que ser los mismos."""
    ruta = os.path.join(DIR, nombre + '.json')
    doc = {
        'format': 'voxelforge-1',
        'size': {'x': 16, 'y': 16, 'z': 16},
        'meta': {'name': nombre, 'type': 'textura'},
        'voxels': voxels,
        'savedAt': ahora or datetime.datetime.now().replace(microsecond=0).isoformat(),
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
    os.replace(tmp, ruta)              # atómico: el servidor puede estar leyendo la galería
    print('  ✓ %-20s %4d voxels' % (nombre, len(voxels)))


def main():
    ahora = datetime.datetime.now().replace(microsecond=0).isoformat()
    for nombre, voxels in PIEZAS.items():
        ruta = os.path.join(DIR, nombre + '.json')
        if os.path.exists(ruta) and not FORZAR:
            print('  = %-20s ya existe (--forzar para rehacerlo)' % nombre)
            continue
        guardar(nombre, voxels, ahora)
    print('Listo. Claves en el Mundo: ' + ', '.join('hab:' + k for k in PIEZAS))


if __name__ == '__main__':
    main()
