# BUG-SNP1 · la consola de `/map/empty`, antes y después

Medido con Playwright sobre el mundo de verdad (`http://localhost:8500/map/empty`), sin escribir nada:
los POST a la API van bloqueados. Aquí no hay capturas de pantalla a propósito — **el síntoma es texto
de consola**, y una foto de la consola diría menos que el texto.

## Antes — 11 avisos, cada uno con su traza de pila

```
game.bloques.define: no existe el material "asset:assets/diana.vox.json". Ponte encima y usa game.bloques.info() para ver su clave exacta.
game.bloques.define: no existe el material "hielo". …
game.bloques.define: no existe el material "hielo-pista-de-patinaje". …
game.bloques.define: no existe el material "cabeza". …
game.bloques.define: no existe el material "brazo". …          ← desde mundo-autoarranque
game.bloques.define: no existe el material "hab:cable". …
game.bloques.define: no existe el material "hab:cable-on". …
game.bloques.define: no existe el material "hab:placa-on". …
game.bloques.define: no existe el material "hab:puerta-abierta". …
game.bloques.define: no existe el material "hab:boton". …
game.bloques.define: no existe el material "hab:boton-on". …   ← desde redstone-piezas
```

Y el aviso **mentía**: los once existen en el disco (`data/habitantes/`, `assets/`). Lo que pasa es que
la paleta de un mundo solo lleva lo **colocado** (+ hotbar + los 6 de serie) — en `/map/empty` son
**8 materiales**. Detrás del ruido estaba el fallo de verdad: `define()` hacía `return null` **sin
guardar nada**, así que la definición se perdía para toda la sesión aunque el material se colocara
después.

## Después — dos líneas, una por tanda de defines

```
game.bloques: 5 material(es) en espera (no están en este mundo todavía; se aplican solos al colocarlos) · game.bloques.lista()
game.bloques: 6 material(es) en espera (no están en este mundo todavía; se aplican solos al colocarlos) · game.bloques.lista()
```

Son **dos** y no una porque son dos snippets independientes (`mundo-autoarranque` y `redstone-piezas`),
cada uno con su propia tanda. `game.bloques.lista()` enseña los once como *en espera*, y al colocar el
material la definición entra sola.

Un typo de verdad **sigue avisando**: `game.bloques.define('eskalera', …)` → «no existe el material
"eskalera". ¿Querías "hab:escalera"?».

## Cómo reproducirlo

```bash
node test_materiales_en_espera.js      # desde /root/voxel (playwright solo resuelve ahí)
```
