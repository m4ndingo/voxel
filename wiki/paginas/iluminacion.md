# Iluminación y ambiente

Cómo **se ve** el mundo: el color del cielo, cómo la lámina de agua refleja ese cielo, y qué ves con
la cabeza dentro de un líquido. Son mandos de consola (F12) — todos **instantáneos**, no hay que
guardar ni recargar, y ninguno cambia el mapa: son solo estéticos.

> **Nota.** Hoy estos mandos son **globales**: pintan todo el mundo por igual. El día que haya biomas
> (zonas con su propio clima), serán justo lo que cada bioma fije por su cuenta — el cielo de un
> desierto, el agua de un pantano.

## El color del cielo

El cielo se cambia con un mando, y **el agua lo refleja al instante**, así que es la forma más rápida
de darle otra hora al día:

```js
game.cieloColor('#ff8844');     // atardecer
game.cieloColor([0.1, 0.1, 0.2]); // noche (también acepta [r,g,b] en 0..1)
game.cieloColor();               // ver el de ahora
game.cieloColor('reset');        // volver al azul de siempre
```

Es el cielo **de arriba del agua**. Lo que ves buceando es otra cosa: eso lo manda `game.vistaAgua`
(más abajo).

## El agua refleja el cielo y el entorno

La superficie del agua refleja tanto el color del cielo como los **objetos del entorno** (nubes, terreno, árboles, estructuras y agentes) mediante un pase especular planar y micro-ondulaciones animadas. Mirándola **a ras** se aclara, se azula, refleja el entorno y se opaca —parece agua de verdad—; mirándola **desde arriba** transparenta y ves el fondo. Viene encendido por defecto, a media fuerza. Los mandos para jugar con él:

```js
game.reflejoAgua(0.8);             // más espejo (0 = apagado, 1 = espejo fuerte a rasante)
game.reflejoCurva(1);              // reflejar incluso mirando de frente (súbelo y solo a rasante)
game.reflejoBase(0.15);            // reflectividad mínima en picado/frontal (F0 de Fresnel, 0..1)
game.reflejoCausticas(1.5);        // fuerza de las cáusticas/refracción animada sobre el fondo sumergido
game.reflejoOpacidad(0.4);         // reflejar pero sin perder del todo el fondo
game.reflejoEntorno(true);         // reflejar objetos, terreno y nubes del entorno (false = solo color de cielo)
game.reflejoOndas(1.5);            // fuerza del oleaje/micro-ondulaciones en la superficie
game.reflejoPlanoY(14);            // altura Y del plano de agua ('auto' = autodetectada)
game.reflejoColor([1, 0.6, 0.4]);  // forzar reflejar un color fijo en vez del entorno/cielo
game.reflejoColor('cielo');        // volver a reflejar el entorno y cielo normal
game.reflejoAgua('reset');         // todo a fábrica
```

También puedes pasarle varios de una vez: `game.reflejoAgua({ fuerza: 0.7, curva: 2, base: 0.1, causticas: 1.2, opacidad: 0.8, entorno: true, ondas: 1.2 })`.

Cosas que conviene saber:

- **Refleja el entorno real**: nubes de lana blanca, montañas, árboles, edificios y agentes cercanos sobre la lámina.
- Si prefieres el modo ligero clásico sin pase extra de geometría, puedes desactivar el entorno con `game.reflejoEntorno(false)`.
- Es **solo del agua**. La lava no refleja (es otra cosa: brilla, no espeja).
- Si quieres que el reflejo y el fondo cambien **juntos**, mueve el cielo con `game.cieloColor` y deja `game.reflejoColor` en `'cielo'`.

## Niebla (días de niebla, tormenta)

Para que un día de niebla parezca niebla de verdad —no solo un cielo gris—, está `game.niebla`, que
difumina el mundo hacia el color del cielo con la distancia:

```js
game.niebla({ near: 3, far: 20, tinte: 0.16 }); // espesa: empieza a 3 bloques
game.niebla({ near: 8, far: 45, tinte: 0.1 });   // calima suave de tormenta
game.niebla('off');                              // quitarla
```

`near` es a cuántos bloques empieza, `far` a cuántos tapa del todo, y `tinte` (0..1) es la bruma que se
nota **hasta de cerca**. La niebla tira hacia el color del cielo, así que ponla con un `game.cieloColor`
gris (o plomizo, para tormenta) y cuadran. Por defecto está apagada.

## La luz global (día ↔ noche)

Para una noche o una tormenta no basta con oscurecer el cielo: hay que **apagar el mundo entero**. Eso
es `game.luz`, un nivel de luz global:

```js
game.luz(0.3);      // noche
game.luz(0.55);     // tormenta, día apagado
game.luz('reset');  // pleno día (1)
```

Una noche de verdad es bajar **los dos** a la vez: `game.cieloColor` (el cielo, oscuro) y `game.luz` (el
suelo, oscuro). Dos cosas importantes:

- La **luz artificial resiste**: una antorcha o lámpara sigue alumbrando su redonda cuando bajas la luz,
  también **al aire libre** — lo que se apaga es la luz del cielo, no la de las antorchas. Es lo que hace
  que de noche una calle con farolas se vea como debe.
- Por defecto está en 1 (pleno día), así que no cambia nada hasta que la tocas.

## Bajo el agua (y bajo la lava)

Con la cabeza dentro del agua, el mundo se tiñe y la niebla se acerca. Eso se ajusta aparte, porque es
la vista **de dentro**, no el reflejo de fuera:

```js
game.vistaAgua({ tinte: 0.5 }); // más azul, sin perder alcance
game.vistaAgua({ far: 40 });    // agua más turbia (se ve menos lejos)
game.vistaLava({ far: 6 });     // lo mismo para la lava (por defecto se ve poquísimo)
```

**Ojo con una cosa que sorprende:** el color de dentro del agua es **fijo** y **no** cambia con
`game.cieloColor`. O sea que si pones un cielo de atardecer y buceas, bajo el agua sigue el azul de
siempre — porque el cielo de arriba y el tinte de dentro son **mandos independientes** a propósito. Si
prefieres que el agua **siga la hora del cielo**, enciende el interruptor:

```js
game.vistaAgua({ sigueCielo: true });
game.cieloColor('#ff8844');   // ahora el atardecer también entibia el agua por dentro
```

Con `sigueCielo` apagado (lo de fábrica) y el cielo por defecto, todo se ve igual que siempre.

Para probarlo **sin meterte a nadar**, fuerza la vista con `mc.vistaFluido = 'WATER'` (o `'LAVA'`, o
`null` para quitarla).

## Y para depurar el rendimiento

Si quieres ver el mundo sin **ninguna** luz ni sombra —para saber si un tirón de fps es de la tarjeta
o del motor— está `game.renderMode = 'fast'` (y `'normal'` para volver). Y `game.sunShade = 1` apaga
solo la **sombra del sol** sin tocar el resto. Los dos son de diagnóstico, no de decorar.
