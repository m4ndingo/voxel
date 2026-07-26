# Plan de movimiento del jugador (modo Jugar · F5) — v2 (revisado)

Cómo se mueve el personaje dentro de una habitación. Vive en `app.js` (módulo `JUGAR (F5)`),
sobre el motor iso existente (`project3d` / `renderFree3d`).

> **v2**: revisión tras probarlo — el movimiento v1 no convencía. Diagnóstico y cambios en §7.

## 1. Modelo de datos en juego (`play`)
```
play = {
  active, cellKey, roomData,      // sala en curso (celda del mapa)
  base,                           // imagen iso de la sala, renderizada UNA vez (cache)
  g,                              // proyección fija (screen(), front[], depthOf())
  dim, walk,                      // rejilla pisable (Uint8Array dim.x*dim.y)
  sprites[4],                     // 4 orientaciones del jugador: {cvs, bbox} (sprite + su caja)
  refFoot,                        // ancla: proyección del pie de referencia de los sprites
  occFaces[],                     // caras de la sala {d, poly, bbox, fill} ordenadas cerca→lejos
  pos:{x,y}, facing, path[],      // posición fraccionaria, orientación, waypoints
  speed, last, raf                // velocidad (celdas/s), tiempo, id de rAF
}
```
La posición del jugador NO persiste (partida efímera). Lo que persiste es la colocación de
habitantes (mapa, F3).

## 2. Rejilla pisable (colisión) — `buildWalk`
`(x,y)` es pisable si hay **suelo** en `(x,y,0)` y **nada sólido** a la altura del cuerpo
(`z = 1..PH`, PH=5). Paredes, barra, barriles, fragua, mesas… bloquean.

## 3. Ruta por clic — A* octile + penalización de pared (`findPath`)
1. Clic → casilla del suelo invirtiendo la proyección iso (`playScreenToCell`, sistema 2×2).
2. Destino no pisable → se redirige a la **pisable más cercana** (`nearestWalk`).
3. **A\*** con coste octile (diagonal=√2), sin cortar esquinas, **+ `wallPenalty`**: cada vecino
   no pisable suma 0.08 al coste ⇒ la ruta óptima **se despega** de muros y muebles en vez de
   rozarlos (v1 se pegaba porque BFS ignora costes).

## 4. Suavizado de ruta — `smoothPath` (string-pulling) + `losWalk`
La ruta de A* (casilla a casilla) se reduce a los **puntos de giro imprescindibles**: desde cada
ancla se avanza mientras haya **línea de visión pisable** (`losWalk`, muestreo fino del segmento)
hasta el siguiente candidato. Resultado medido en la Taberna: 19 casillas → **3 waypoints rectos**.
El jugador camina en **tramos rectos con ángulo libre**, no en escalera.

## 5. Recorrido y orientación — `playTick` + `faceFromDelta`
- Avance continuo hacia `path[0]` a `speed` celdas/s (`pos` fraccionaria, `dt` acotado).
- Al llegar a un waypoint se encaja y pasa al siguiente; sin ruta no se renderiza (0 coste en reposo).
- Orientación = eje dominante del vector de avance, con **histéresis** del 20% (en diagonales
  mantiene la actual, no oscila). Orden de sprites (frente del modelo = **+y**):
  `0:+y · 1:+x · 2:-y · 3:-x`. `PLAY_FACING_OFFSET` corrige un desfase global si hiciera falta.

## 6. Render — sala cacheada + sprite + OCLUSIÓN POR PÍXEL (`renderPlay`)
1. `drawImage(base)` — la sala prerenderizada (raster sin AA).
2. `drawImage(sprite[facing], pie−refFoot)` — el jugador como traslación de bitmap. Los sprites se
   rasterizan con `scanQuad` (SIN AA): cero grietas/"rejilla" en el personaje.
3. **Sombra proyectada** (v2.2): `renderShadowSprite` aplana los voxels del personaje al plano del
   suelo con un sesgo de luz (`SHADOW_SDX/SDY`) y rasteriza la silueta opaca; se precalcula por
   orientación (como los sprites, recortada a su bbox) y se dibuja translúcida (α≈0.3) **antes** del
   jugador. La oclusión por píxel la respeta sola: el suelo nunca está más cerca que el jugador, así
   que la sombra se mantiene sobre el suelo y solo la tapa el mobiliario que está por delante.
> **v2.3 · oclusión con profundidad del jugador por píxel**: antes se comparaba la sala contra UN
> punto del jugador (centro del cuerpo) ⇒ una pared *detrás* podía tapar la cabeza (más cercana que
> ese punto). Ahora cada sprite lleva su **depth buffer** (profundidad de la superficie del jugador
> por píxel, a la posición de referencia); en juego se le suma el desplazamiento `Δd = depthOf(pos)−
> refDepth0` (afín en x,y) y se compara **por píxel**: la sala solo tapa donde su superficie está más
> cerca que la del jugador en ese píxel. Una pared detrás (más lejos) nunca oculta al personaje.

4. **Oclusión por píxel** (v2.1): al cargar la sala se guardan `baseImg` (ImageData de la base) y
   `play.depth` (Float32 por píxel = profundidad de la superficie visible, rasterizada en orden
   pintor). Cada frame, SOLO en el bbox del sprite: si `depth[i] < profundidad(jugador)` se
   restaura el píxel de la base ⇒ el mueble tapa al personaje con precisión de píxel y sin AA.
   (La v2 re-dibujaba caras con canvas+AA sobre el raster ⇒ se veía una "rejilla" de costuras
   alrededor del jugador — ese fue el motivo del cambio.)

## 7. Diagnóstico v1 → decisiones v2
| Síntoma observado | Causa | Arreglo v2 |
|---|---|---|
| Saltos al girar | el “centro” del modelo cambiaba entre orientaciones | sprites anclados al mismo pie (`refFoot`) |
| Temblequeos | polígonos con AA re-rasterizados en sub-píxel cada frame | rasterizar 1 vez → trasladar bitmap |
| Andaba hacia atrás | numeración de direcciones ≠ orden de rotación | `faceFromDelta` alineado a frente=+y |
| Oscilación en diagonal | `|dx|≈|dy|` cambiaba el frente cada frame | histéresis 20% |
| Zigzag “en escalera” | BFS sin coste diagonal ni suavizado | A* octile + string-pulling (§3–4) |
| Se pegaba a los muebles | coste uniforme | `wallPenalty` en A* |
| Pasaba por delante de los objetos | sin oclusión | pase de oclusión por profundidad (§6) |

## 8. Limitaciones que QUEDAN (asumidas para el MVP)
- **Sin animación de pasos** (se desliza). Mejora: 2–3 fotogramas por orientación.
- **Huella de colisión 1 casilla** aunque el modelo ocupe ~3 de ancho: puede rozar visualmente.
  Mitigado por `wallPenalty`; mejora: huella 2×2 o radio.
- Oclusión por **profundidad del centro** del jugador: en solapes extremos puede parpadear una cara.
- ~~Una sola sala~~ → **F6 hecho**: puertas talladas dinámicas + cruce a la sala vecina con fundido
  (`carveDoorways`/`roomExits`/`checkExit`/`playTransition`/`playLoadRoom`).

## 9. Parámetros ajustables
- `play.speed` (celdas/s) · `PLAY_VIEW` (ángulo/zoom) · `PLAY_W/H` (lienzo).
- `PH` altura de colisión (`buildWalk`) · `wallPenalty` (0.08/vecino) · histéresis (1.2).
- `PLAY_FACING_OFFSET` (0..3) · factor de reducción (`downsampleVox(charData, 4)`).

## 10. Verificación (headless, Taberna)
- Rejilla: 373 casillas pisables de 784; paredes/barra/barriles bloquean.
- A*: ruta (16,16)→(3,3) = 19 casillas, todas pisables; suavizada = **3 waypoints** con visión
  pisable en todos los tramos. Clic sobre sólido redirige a la pisable más cercana.
