# Atajos de teclado

VoxelForge tiene **dos teclados distintos**, y el que está activo depende de si el Mundo (🌍) está
abierto o no. No es un capricho: en el editor la `b` elige el Pincel, y en el Mundo la `b` te hace
más grande. Si un atajo «no funciona», casi siempre es que estás en el otro lado.

Con un campo de texto enfocado (`input`, `textarea`, el panel de Código, el editor de notas) **no
hay atajos**: lo que escribes es texto.

---

## Los que funcionan en los dos sitios

| Tecla | Qué hace |
|---|---|
| `Alt`+`C` | abre / cierra el panel de **Código** (snippets) |
| `Alt`+`A` | abre / cierra el panel de **Agentes** |
| `Esc` | cierra lo más superficial que haya abierto (ver abajo) |

Estos dos van a propósito **antes** que todo lo demás, para que también funcionen con el Mundo
abierto: si no, retocar un snippet o un bicho obligaría a salirse del Mundo primero. Miran la tecla
**física**, así que funcionan en teclados donde `Alt`+`C` produce otro carácter.

### `Esc` va por capas, no cierra todo de golpe

Se cierra **una** cosa por pulsación, empezando por la de encima: el menú `⋯` → el panel de Código →
el de Agentes → el editor de nota → el selector de bloque → una pantalla OSD → el ratón capturado →
y solo entonces el Mundo. En el editor, `Esc` cancela además la colocación de un pegado.

O sea: dentro del Mundo, el **primer** `Esc` te devuelve el cursor y el **segundo** cierra el Mundo.

En **táctil no hay `Esc`**: la salida del Mundo es el **✕** de arriba a la derecha, que sale junto con
el joystick y los demás mandos.

---

## Editor 2D / 3D

### Elegir herramienta

Una letra, en **minúscula** (con `Shift` no cuentan):

| | | | |
|---|---|---|---|
| `b` Pincel | `e` Borrar | `i` Cuentagotas | `g` Relleno |
| `s` Seleccionar | `h` Mano (mover vista) | `o` Girar la vista | `x` Extruir |
| `c` Construir | `p` Pivote | `a` Caras | |

### Capas y vista

| Tecla | Qué hace |
|---|---|
| `[` / `]` | capa anterior / siguiente |
| `+` / `-` | acercar / alejar (vale en Capas y en 3D) |
| `0` | reencuadrar |
| `r` | gira la **miniatura** isométrica del panel derecho |
| `f` | abre la vista grande. Dentro: `r` gira, `+`/`-` zoom, `0` reencuadra, `f` o `Esc` cierra |
| `←` `→` | en 3D **y sin selección**, giran la vista 45° |

### Selección y portapapeles

| Tecla | Qué hace |
|---|---|
| `Ctrl`+`A` | seleccionar todos los vóxeles (Capas y 3D comparten la selección) |
| `Ctrl`+`C` / `Ctrl`+`V` | copiar / pegar. Al pegar entras en **modo colocación**: clic para soltar, `Esc` para cancelar |
| `Supr` / `Retroceso` | borra la selección |
| flechas | **mueven** la selección… |
| `↑` / `↓` | …salvo con la herramienta **Extruir** activa, donde sacan (`↑`) o hunden (`↓`) un paso |

### Deshacer

`Ctrl`+`Z` deshace y `Ctrl`+`Shift`+`Z` rehace; `Ctrl`+`Y` también rehace. Una entrada de historial
es **un gesto entero**, no un vóxel: un trazo de pincel se deshace de una vez.

### Ratón

| | Capas (2D) | Edición 3D |
|---|---|---|
| clic izq. | pinta / la herramienta activa | la herramienta activa |
| `Alt`+clic izq. | cuentagotas (toma el color) | cuentagotas |
| botón der. | borra | **gira** la vista (salvo con Seleccionar, donde quita de la selección) |
| botón central | mover la vista | mover la vista |
| `Ctrl`+arrastrar | mover la vista | mover la vista |
| rueda | zoom | zoom |

---

## El Mundo (🌍)

### Moverse

`W` `A` `S` `D` andar, `Espacio` saltar, `Shift` correr. Si el ratón no está capturado, **pulsar una
tecla de movimiento lo captura** — no hace falta volver a hacer clic en el lienzo.

| Tecla | Qué hace |
|---|---|
| `f` | **volar** (y al volar, `Espacio` sube y `Shift` baja) |
| `Alt`+`F` | **foto** de lo que ves → se guarda en `/fotos` con su ficha quemada en la imagen |
| `u` | «sácame de aquí»: te sube sobre lo que te esté atascando, o al spawn |
| `b` / `B` | hacerte más grande / más pequeño (paso de ×1,15) |
| `x` | rayos-X: dibuja el volumen de colisión (depuración) |

> `f` era la foto y ahora es volar, porque volar es de cada minuto y la foto de vez en cuando. En
> táctil no hay `Alt`: el botón 📷 sigue siendo la foto.

### La hotbar y las herramientas

| Tecla | Qué hace |
|---|---|
| `1`…`9` | elegir ranura |
| `Alt`+`1`…`9` | abrir la **galería** de esa ranura (sin soltar el ratón ni usar el clic derecho) |
| `p` | rota la herramienta del clic derecho: Construir → Pintar → Seleccionar → Cuentagotas |
| `Alt`+`P` | galería de **herramientas** (la ranura 10) |

### Colocar, girar y deshacer

| Tecla | Qué hace |
|---|---|
| `r` | con una **estructura** en la ranura: cambia qué **cara** queda arriba (6 opciones) |
| `Shift`+`R` | …y los 4 **giros** dentro de esa cara. Entre las dos salen las 24 posturas |
| `r` | con la herramienta **Seleccionar** y una caja marcada: la gira 90° |
| `s` | **solo mientras mantienes el clic derecho** colocando una estructura: alterna pegado centrado ↔ al canto. Fuera de ese gesto, `s` sigue siendo andar hacia atrás |
| `n` | anota el bloque al que apuntas (sale como cartel 3D legible) |
| `z` / `Z` | deshacer / rehacer (romper, poner, pintar, estampar, retirar) |
| `Ctrl`+`C` | copiar la caja seleccionada, en el formato del editor |
| `Ctrl`+`V` | pegarla **en el mapa**, apoyada en la cara que apuntas (el Mundo no se cierra) |

### Ratón

Clic **izquierdo** rompe, clic **derecho** usa / coloca; mantenerlos pulsados **repite** la acción.
Con **Seleccionar** activa no rompen nada: el izquierdo marca las dos esquinas de la caja y el
derecho la limpia. Con **Cuentagotas**, los dos botones toman el material.

---

## Añadir los tuyos

```js
game.onKey('t', () => toast('¡hola!'));   // liga una tecla mientras el Mundo esté activo
game.onKey('t', null);                    // quitarla
game.keys();                              // qué teclas tienes puestas
```

Registrar la misma tecla otra vez la **reemplaza**, no acumula manejadores.

Las que ya usa el Mundo están **reservadas** y `game.onKey` las rechaza con un aviso en consola:
`w` `a` `s` `d` `Espacio` `Shift` `p` `b` `x` `u` `n` `r` `z` `f` `Esc` y `1`…`9`. Libres, por
ejemplo: `t` `g` `h` `j` `k` `l` `y` `c` `v` `m` `q` `e`.

La lista de reservadas y el orden del manejador tienen que ir juntos: el motor atiende sus teclas
**antes** de mirar las tuyas, así que una tecla suya que no estuviera en la lista se aceptaría sin
protestar y luego no haría nada. Si añades una tecla al motor, añádela también ahí.
