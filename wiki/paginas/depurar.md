# Depurar un snippet que revienta

Un snippet no es un fichero: se compila al vuelo con `new AsyncFunction(code)`. Por eso el navegador
lo llamaba **«VM2571»** y daba números de línea que no eran los del panel. Con esto:

```js
toast("default")
console.log("aaa")
game.bloques.define('asset:assets/cabeza.vox.json': { mirar: { ejes:'xy', alcance:12 } })
```

…la consola decía `SyntaxError: missing ) after argument list (at VM2571:5:21)`. El fallo está en la
línea **3** —un `:` que tenía que ser `,`, copiado de una tabla donde sí lleva dos puntos porque allí
es un objeto literal— y «VM2571:5» no lleva a ningún sitio.

## Lo que sale ahora

VoxelForge imprime un informe con la línea **del panel** y su texto alrededor:

```
✖ snippet «mundo-default» · SyntaxError en la línea 3: missing ) after argument list
      1 │ toast("default")
      2 │ console.log("aaa")
 →    3 │ game.bloques.define('asset:assets/cabeza.vox.json': { mirar: { ejes:'xy', alcance:12 } })
      4 │ game.bloques.define('asset:assets/brazo.vox.json', { mirar: { ejes:'xy' } })
   (es la primera línea donde el análisis se rompe; el descuido puede venir de la de antes)
```

Y si estabas en el panel **Código**, el cursor se va solo a esa línea y la deja seleccionada: leer un
número no es lo mismo que tener el bicho delante.

> ⚠️ Esa última nota va en serio con los errores de sintaxis. La línea que se señala es donde el
> análisis **se rompe**, que no siempre es donde está el descuido: un paréntesis sin cerrar en la 3
> puede no dar la cara hasta la 9.

## Los tres arreglos que lo hacen posible

**1 · La pila dice el nombre del snippet.** Se le pega un `//# sourceURL=vf-snippet/<nombre>` al
final del código —al final, así no desplaza ni una línea—. La pila deja de decir «VM2571» y dice de
qué snippet salió, que es lo que se busca cuando el error aparece tres capas más abajo.

**2 · El desfase se MIDE, no se cablea.** `AsyncFunction` mete un preámbulo antes de tu código, así
que la línea de la pila no es la tuya. En vez de restar un 2 escrito a mano, se compila una sonda y
se mira qué línea dice ser: si el motor cambia el preámbulo, el número se ajusta solo.

**3 · Un `SyntaxError` no tiene pila** —el código nunca llega a existir—, así que ahí no hay nada que
descontar. La línea se busca **compilando prefijos**: las 1..n primeras líneas, una a una, hasta que
la compilación empieza a fallar. La primera que rompe es la que se señala.

## Desde la consola

La línea culpable **viaja dentro del propio error**, en `err.vfLinea`, para que quien lo recoja no
tenga que volver a calcularla:

```js
try {
  await game.snippet('mi-snippet');
} catch (err) {
  console.log('petó en la línea', err.vfLinea);
}
```

## Los otros descubridores

Cuando el problema no es que reviente sino que **no hace nada**, la pregunta suele ser «¿y esto dónde
lo cambio?» o «¿cuál es la clave exacta?». Hay una función para cada una:

```js
game.osd.dump();       // qué pantallas y botones hay, y DESDE QUÉ SNIPPET se registró cada acción
game.osd.acciones();   // un botón que no está en esta lista es un botón que no hace nada
game.bloques.info();   // la clave EXACTA del material que piso / tengo delante
game.keys();           // qué teclas hay atadas con game.onKey
```

`game.bloques.info()` es el que más disgustos ahorra: **un id sin espacio de nombres no identifica
nada**. `hab:cable` y `asset:assets/cable.vox.json` son el mismo dibujo entrando por puertas
distintas, y exportar o importar cambia cuál de las dos es. La clave se pregunta, no se adivina.

Y si lo que no aparece es una acción de OSD que sí registraste, mira que el **texto** coincida: se
normaliza a mayúsculas y sin espacios de los lados, pero «JUGAR YA» y «JUGAR» son botones distintos.
