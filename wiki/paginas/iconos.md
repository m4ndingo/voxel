# Los iconos de la aplicación salen de dibujos tuyos

En `/images` decides **qué dibujo vóxel** es el favicon de la pestaña, la marca de la esquina y cada
uno de los 11 botones de herramienta. No se sube un PNG: se elige un dibujo del catálogo, se le da
una **postura** y un **tamaño**, y VoxelForge lo hornea.

Mientras no publiques nada, la aplicación se ve **exactamente como siempre** —con sus emojis y su
`◧`—, así que puedes trastear sin consecuencias.

## Cómo se usa

1. **Elige la ranura** (Favicon, Marca, o una herramienta) y pulsa el dibujo que quieras del
   catálogo de la izquierda.
2. **Ajusta la postura.** Debajo de cada ranura salen las 24 posturas posibles; la que elijas es la
   que se hornea. A 16 px la diferencia entre dos posturas vecinas es casi todo lo que hay para
   decidir, así que vale la pena mirarlas.
3. **Modo `iso` o `plano`.** `iso` es el dibujo en perspectiva, como la miniatura del editor;
   `plano` mira una cara de frente, un vóxel por píxel.
4. **Suavizado** (AA) encendido o apagado. Ver más abajo.
5. **Publicar.** Ahí se escribe de verdad.

Cada ranura se hornea a **los tamaños que necesita** quien la consume: el favicon a 16 y 32, la
marca a 64, las herramientas a 32.

## El sandbox

Abajo del todo hay un banco de pruebas: cualquier dibujo, cualquier tamaño, cualquier postura, y un
botón para **descargar el PNG**. No toca ninguna ranura ni publica nada — es para sacar una imagen
de un dibujo tuyo y llevártela a otro sitio.

## Suavizado: enciéndelo o no según el tamaño

El suavizado es **de silueta**, no de la imagen entera: los píxeles interiores del dibujo salen
idénticos y solo se suaviza el borde contra el fondo.

A tamaños de icono eso es mucho más de lo que parece. En un icono de 16×16, el **31,6 %** de los
píxeles son borde a medio pintar (en modo `plano` es el 0 %). Por eso:

- **con AA**, el icono se lee mejor de lejos pero tiene un fleco semitransparente alrededor: sobre
  un fondo claro se ve deslavado, y sobre uno oscuro no;
- **sin AA**, el borde es duro y el icono se ve «pixelón», que a 16 px suele ser lo que quieres.

Pruébalo en la previa antes de publicar, y ten en cuenta el color del sitio donde va a acabar.

## Qué se guarda

Lo que manda es la **asignación**: qué dibujo, en qué postura, con qué modo y con qué suavizado.
Los PNG son su derivado y se rehornean enteros; **no los edites a mano**, porque la siguiente
publicación los pisa.

Al volver a abrir `/images` reaparece lo que tenías publicado, resuelto contra el catálogo. Si un
dibujo se renombra o desaparece, su ranura se queda sin resolver y basta con volver a asignarla.

> Los dibujos los rasteriza tu propio navegador, con las mismas fórmulas que la miniatura
> isométrica del editor. Lo que ves en la previa es, píxel a píxel, el PNG que se publica.
