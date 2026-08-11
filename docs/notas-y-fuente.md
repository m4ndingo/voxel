# Notas, carteles y la fuente del juego

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## 🔠 La fuente del juego (`--font-game`) es solo del Mundo

Los textos que se leen **jugando** van en **Pixeloid Sans** (`assets/fonts/`, licencia SIL OFL en
`Pixeloid-OFL.txt`): el visor de notas, el panel de la nota, los toast del modo Mundo, el
fps/vox flotante, las teclas de la barra rápida y el rótulo de un cartel. **La UI del editor sigue con
la del sistema**, que es la que aguanta formularios densos — la de pixel art es muy ancha.

⚠️ **Solo los múltiplos de 9 salen nítidos.** Pixeloid tiene 1836 unidades por em y su píxel de
diseño mide 204, o sea `font-size/9`; a 13px o a 10px las letras caen entre rejilla y empastan. Por
eso *todos* los cuerpos de `--font-game` son `9px` y la jerarquía se hace con peso y color, no con el
tamaño (el escalón siguiente, 18px, es el doble). Lo mismo obliga a `MC_NOTE_TEXT_MIN=9` en `app.js`
y a que la búsqueda de tamaño de `mcNoteTexture` baje **de 9 en 9**.

⚠️ **Y obliga a que el lienzo del rótulo NO tenga un tamaño fijo: se elige por texto.** Con el escalón
atado a 9 y el lienzo fijo, el cuerpo se redondea siempre hacia abajo, y eso se paga entero en tamaño
de letra: en la tabla del cartel (2,14:1) el cuerpo que llena la caja es 25,2 px sobre un lienzo de
256, pero solo valen 9/18/27… así que se horneaba a **18 → un 29 % más pequeño de lo que cabía**.
`mcNoteTexture` lo resuelve al revés, en dos pasos:

1. **Mide la razón**, no el cuerpo. El ajuste es invariante de escala, así que busca por bisección —a
   `MC_NOTE_TEXT_REF=1024`, donde no se dibuja nada: `measureText` no depende del lienzo— la razón
   continua `cuerpo/alto-de-lienzo` con la que el texto llena la caja.
2. **Estira el lienzo para que un múltiplo de 9 caiga justo en esa razón**: coge el mayor múltiplo de
   9 que quepa bajo los topes (`MC_NOTE_TEXT_H=384` de alto, `MC_NOTE_TEXT_WMAX` de ancho, el ancho
   sale del aspecto de la tabla) y pone el alto en `cuerpo/razón`. Re-comprueba en la caja definitiva
   y baja de 9 en 9 si el redondeo a entero de márgenes e interlineado se lo come.

Medido en la tabla real: una nota de 271 caracteres pasa de ocupar 0,070 del alto a **0,096 (+36 %)**;
los mensajes cortos ya estaban cerca del óptimo y suben un 1-2 %. El tope de alto es 384 y no 256
porque a más lienzo, más múltiplos de 9 donde elegir y más píxeles de lienzo por píxel de diseño (4 en
vez de 2), que es lo que se ve al acercarse. La clave de la caché es `texto|aspecto` **y no
`texto|alto`**, justamente porque el alto ya es una consecuencia del texto.

Vino a sustituir a Press Start 2P por petición del dueño («parece más compacta») y lo es de verdad:
es **proporcional** — la `A` gasta 0.67 em y la `i` 0.22 — frente al **1.0 em de TODO carácter** en
Press Start 2P. Los ficheros de Press Start 2P siguen en `assets/fonts/` sin referenciar.

⚠️ Cuatro trampas al tocarlo en `style.css`: (1) el bloque que aplica `--font-game` tiene que ir
**DESPUÉS** de las reglas de `.mc-note*`, o gana la que se declaró luego; (2) `.mc-note textarea`
usa la taquigrafía `font:`, que **también reinicia la familia**; (3) el `:root` lleva
`font-synthesis:none`, así que la negrita **no existe** si falta la cara `@font-face` de peso 700; y
(4) el mismo nombre lo pide `app.js` como `MC_GAME_FONT` para hornear el rótulo de los carteles: si
cambia aquí, cambia allí.

## 📝 Una nota se ve como un CARTEL de verdad

Petición del dueño: «reemplaza la forma que sale para las notas/posits por el asset "cartel" que he
creado». Cada nota de `mc.notes` planta **`assets/cartel.vox.json`** (poste + tabla, 2×2 celdas de
1/16 de canto) **encima** de su bloque, en vez del post-it amarillo que se dibujaba a mano; y el
cartel responde a la **tecla `N`** igual que el bloque anotado (ver / editar / borrar).

**Los carteles NO son datos del mundo: se DERIVAN de `mc.notes`.** Van marcados `efimera`, así que
`mcStructuresDoc` no los guarda y `mundo.json` sigue llevando **solo notas** — no hay dos fuentes de
verdad ni forma de que un cartel se quede huérfano en el fichero. Se sincronizan solos
(`mcSyncNoteSigns`), o sea que **quien escriba en `mc.notes` planta su cartel sin enterarse**: el
panel de la `N`, un snippet o un agente que va dejando notas.

- **Apuntar al cartel NO es apuntar a la nota**, y ése es el nudo: el cartel ocupa 2×2 celdas
  **encima** del bloque anotado. `mcNoteAnchor(celda)` es la vuelta —la celda misma si está anotada,
  o el bloque del cartel que la contiene— y es lo que hace que la `N` abra **esa** nota en vez de una
  nueva en el aire, y que el visor de texto se encienda mirando el cartel, que es justo lo que uno
  mira. Lo usan `mcOpenNote` y `mcUpdateNoteView`.
- ⚠️ **El rayo hay que pedirlo con `mcRaycast(alcance, true)`**: sin `hitStruct` una estructura fina
  no cuenta y el rayo **atraviesa el cartel**, así que la `N` anotaba la pared del fondo.
- ⚠️ **El cartel es `atravesable`** (clave en su `.vox.json`). Si cortara el paso, anotar el bloque
  que pisas te dejaría encerrado y un agente que va dejando notas se levantaría un muro a su espalda.
  Sigue siendo apuntable, rompible y visible en rayos-X — es exactamente para lo que está el par
  `bits`/`bitsAim` (ver más arriba).
- **Se plantan por tandas** (`MC_NOTE_SIGN_LOTE`, 8 por repaso) y con tope (`MC_NOTE_SIGN_MAX`, 64):
  cada cartel es una malla y **un draw call**, y estampar veinte de golpe congelaría el cuadro. Lo que
  se pase del tope se queda con el **post-it de siempre**, que sigue dibujándose para las notas **sin**
  cartel (`conCartel` en el overlay).
- **Las sincronizaciones se ENCOLAN, no se descartan** (`mcNoteSignQ`). Estampar es asíncrono; con una
  bandera de «ocupado» una nota escrita mientras se planta otra se quedaba sin cartel hasta el
  siguiente repaso, y un `await mcSyncNoteSigns()` volvía sin haber hecho nada — que fue justo lo que
  hizo fallar el interruptor en el test.
- El bucle paga un chequeo **barato** cada 500 ms (`mcNoteSignsDesfasados`, que recorre estructuras y
  no notas) y solo entonces sincroniza de verdad.
- Interruptor: **`game.noteSigns = false`** retira los carteles y devuelve el post-it (persistido en
  `vf_mcNoteSigns`).

En **`/map/redstone`** las diez notas ya montadas son carteles: `redstone-ejemplos.js` cuelga la nota
de la **losa del suelo** y el Mundo planta el cartel encima, así que ya no se levanta un poste de
tablones a mano. ⚠️ Al mover una nota hay que **borrar la vieja** (`delete mc.notes[…]`): una nota
sobrevive a que le quiten el bloque y se quedaría flotando —con su cartel— en la bandeja del dueño.3046: pasó a ser el valor general. Guardián: `node test_notas_panel.js`.

## Convenciones nota planta el cartel
y que va `efimera` y fuera de `mcStructuresDoc`, que las 4 celdas del cartel resuelven a la nota y el
aire de al lado no, que no corta el paso, que la `N` abre **esa** nota con su texto y su «Borrar», el
interruptor en los dos sentidos, y que borrar la nota se lleva el cartel sin dejar la estructura
suelta. `node redstone/montar_ejemplos.js` comprueba además que las 10 notas del mapa plantan sus 10
carteles y que **ninguno** entra en el documento.

### El texto de la nota, escrito en la tabla

Segunda petición: «me gustaría ver el contenido de la nota sobre el cartel cuando sea posible, de muy
lejos no haría falta». El texto se **hornea en una textura** y se pega como **calcomanía** sobre la
cara de la tabla que da al ojo (`mcDrawNoteTexts`, una pasada propia justo antes de `mcDrawPreview`,
con `depthMask` apagado: un muro por delante lo tapa, pero el rótulo no escribe profundidad).

- **La tabla no se declara en ninguna parte: se DERIVA de la pieza estampada** (`mcNoteBoardRect`,
  cacheada en la instancia por `key|rot|origen`). Lee el bitset fino de la malla —**`bitsAim`**, la
  ocupación real, porque el cartel es `atravesable` y su `bits` de colisión son ceros— que ya viene en
  orientación de mundo, o sea que **el giro no hay que aplicarlo otra vez**. De ahí saca el eje normal
  (el horizontal delgado, ≤ 4 voxels finos), y llama tabla a las filas **anchas de arriba**, hasta la
  primera que baja del 70 % del ancho máximo: el poste. Si los dos ejes horizontales son gruesos, eso
  no es un cartel y **no se rotula** — y si alguien redibuja `cartel.vox.json`, el rótulo se
  re-encuadra solo.
- **Fuente del juego**: `MC_GAME_FONT` = `--font-game` de `style.css` (Pixeloid Sans, en
  `assets/fonts/`). ⚠️ Es un `@font-face`: hornear antes de que llegue dejaría la de reserva **pegada
  en la textura** hasta recargar, así que se espera a `document.fonts.load` y **se tira la caché**
  cuando está lista. Las dos constantes tienen que decir lo mismo.
- El tamaño de letra **lo fija la caja**, no un número mágico: un texto corto se lee de lejos y uno
  largo encoge, como un cartel de verdad (bisección + lienzo a medida, ver arriba). Lo que no cabe ni
  a la mínima se recorta con `…` — Pixeloid **sí** trae el U+2026, que gasta un carácter en vez de
  tres en un cartel ya justo; con Press Start 2P no lo traía y había que usar `...`.
- **El rótulo releva al visor de debajo de la mira** (`mc._noteTextDrawn` → `mcUpdateNoteView`), pero
  solo si se lee **entero y a tamaño legible**: se mide en **píxeles de pantalla por letra**
  (`MC_NOTE_TEXT_LEGIBLE`), no en «¿cupo?». Una parrafada cabe encogida hasta ser un borrón, y ahí el
  visor es lo único que salva — pasa con las notas largas de `/map/redstone`.
- Caché LRU de texturas (`MC_NOTE_TEXT_CACHE`, 24) por `texto|aspecto`, con `deleteTexture` al desalojar
  y al cerrar el Mundo.
- Tunables: **`game.noteText`** (apaga el rótulo; el cartel queda en blanco y se lee apuntando) y
  **`game.noteTextDist`** (14 bloques, escala con `game.playerScale`; el último cuarto se desvanece y
  más allá no se dibuja — «de muy lejos no haría falta»). Persistidos y en `game.dumpVars()`.

### El panel DOM de la nota (≠ el cartel 3D)

Lo de arriba es el **cartel del mundo**. El diálogo de la tecla `N` (`#mc-note`) y el visor que sale
al apuntar (`#mc-noteview`) son **DOM**, y su tamaño sale de dos variables CSS con fallback en la
propia regla, `--note-fs` (18px) y `--note-w` (720px). El alto del `textarea` **no es un número
suelto**: es `min(calc(var(--note-fs) * 18), 46vh)`, o sea 10 líneas del cuerpo actual, así que subir
la letra agranda la caja sola.

- **`game.noteFont`** ⚠️ **redondea a múltiplo de 9** y topa en 9..45. El píxel de diseño de Pixeloid
  es `font-size/9`: un 20 saldría borroso y nadie lo ataría a haber tocado esto. Escalones reales:
  9 · 18 · 27 · 36 · 45. El 9 era el valor de antes de REQ-CART2 y es el que resultó ilegible.
- **`game.noteWidth`** (240..1600) mueve el ancho del diálogo y, con él, el `max-width` del visor
  (60 %). Los dos persisten y salen en `game.dumpVars()`.

Las notas son **la excepción** a la regla de «todo a 9px» del bloque `--font-game` de `style.css`, y
está escrito allí: las notas de los agentes son volcados largos que hay que leer enteros.
La media query de 680px **ya no toca el cuerpo** — el móvil dejó de ser un caso especial cuando 18
pasó a ser el valor general. Guardián: `node test_notas_panel.js`.
