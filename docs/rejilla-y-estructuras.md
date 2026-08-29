# Rejilla, estructuras finas, caras y apuntado

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## El rayo de apuntado y las estructuras finas

`mcRaycast(maxd, hitStruct)` decide **dónde cae el bloque que colocas** (`cell + normal`). Con
`hitStruct` mira también las estructuras finas, y ahí está la trampa: `mcStructCellSolid` responde por
la **caja de la celda entera** (`mcFineBoxHit` de `x*T` a `x*T+T-1`), o sea que **una escalera daba por
sólida su celda estando casi toda hueca**. El rayo se paraba en la caja, la normal era la de la celda y
el bloque nuevo salía **flotando delante** en vez de pegarse a la pared del fondo a la que apuntabas.

`mcStructRayHit(x,y,z, o,d, t0)` lo arregla: sub-DDA a **resolución fina** acotado a esa celda (≤48
pasos), y solo cuenta como impacto si el rayo cruza un voxel fino **lleno**. Solo se entra ahí si
`mcStructCellSolid` ya dijo que sí, así que el coste va con las celdas de estructura que cruza el rayo,
**no** con el alcance. `mcRaycast` devuelve además `point` (impacto exacto), `dist` y `fina`.

**Depuración (tecla `X`)**: rayos-X dibuja el rayo (magenta), un cubo en el impacto, la celda que lo
**para** (blanco) y la celda donde **iría el bloque** (verde), sin test de profundidad para verlo a
través de la estructura. ⚠️ **Desde el ojo el rayo se proyecta justo en la mira, o sea que se ve como un
punto**: para verlo como segmento hay que congelarlo con **`game.rayoFijo()`** y apartarse a mirarlo de
lado. La etiqueta DOM del impacto dice si paró en `voxel fino` o en `bloque` y en qué celda pone.

⚠️ **El volumen se marca con ARISTAS, no con relleno** (REQ-XR1), y las cajas van a las cotas
**exactas** de la celda. Los cubos macizos a alfa constante 0.38 componían capa sobre capa
(`1 − 0.62^k`, y con `CULL_FACE` apagado cada caja cuenta **dos**), así que tres bloques en la línea
de visión saturaban a blanco: medido, tapaban el **92,2 %** de la pantalla; con aristas, el 4,9 %.
Bajar el alfa no lo arregla, solo mueve dónde satura. Lo de las cotas exactas tampoco es cosmético:
con el margen viejo (`x+0.03 … x+0.97`) dos celdas vecinas dibujan **dos líneas paralelas** donde
debe verse una. Y `gl.lineWidth` está topado a 1 en Chrome/ANGLE, así que el grosor **no** es una
palanca disponible. Guardián: `node test_rayos_x_lineas.js`, con cota por arriba y **por abajo**.

⚠️ **El volumen son 7×5×7 celdas alrededor de los PIES.** Mirando al horizonte no entra nada en
cuadro y parece que la tecla `X` no hace nada: hay que mirar hacia abajo, y para verlo sobre una
pieza concreta hay que **plantarse encima**.

**Cuarta línea de la etiqueta = punto de extensión `mcXrayExtra`.** `app.js` pinta tres líneas
(coordenadas · tipo · material) y deja un hueco: `mcXrayExtra(clave, s|null, x, y, z) => 'texto'`, que
rellena quien sepa algo que el framework no sabe. `(x,y,z)` es la **celda** de la etiqueta —de la rejilla,
o el origen de la estructura— y va suelta y no en un array a propósito: esto corre una vez por etiqueta y
frame (hasta ~250), y un array por llamada es basura para el GC a 60 fps. El texto puede llevar **varias
líneas** (`\n`): `.mc-xlbl-extra` es `white-space:pre-line` contra el `nowrap` del padre.

⚠️ **El hueco lo comparten dos enganches, y no de la misma forma.** `mundo-autoarranque` lo **asigna**
(`window.mcXrayExtra = etiquetaRayosX`) y `redstone/redstone.js` lo **envuelve** encadenando al anterior
(sello `_redstone` para no apilarse al re-ejecutarse, `_orig` debajo). Funciona porque el orden es fijo:
el snippet asigna en su línea 3189 y arranca redstone en la 3366, así que el motor siempre llega después;
y si el snippet se re-ejecuta y borra el envoltorio, vuelve a cargar redstone y se rehace solo. **Un
enganche nuevo debe envolver, no asignar** — asignar borra en silencio las líneas de los demás.

`mundo-autoarranque` muestra **el comportamiento del
material y los giros de ESA instancia** (`X` cabeceo · `Y` giro · `Z —`, más `(origen …°)` con el horneado
de `rot`+`frente`). Si la pieza está parada dice **por qué**: `en reposo (pide 90°, cono -90..30°)` o
`en reposo (a 14 bloques, alcance 12)` — son arreglos distintos (abrir `limites` / recolocar la pieza vs
subir `alcance`). **`limites` se cuenta desde la pose horneada de CADA instancia**, así que dos piezas del
mismo material puestas con `rot` distinto tienen conos que apuntan a sitios distintos del mundo: es la
causa de «un brazo me sigue y el otro solo si paso por detrás», y se ve comparando sus `(origen …°)`. Es `var` y no `let` a propósito: un `let` de nivel superior **no** es propiedad de
`window`, así que un snippet (que corre en `new Function`) no podría engancharse. Si el hook lanza, `app.js`
lo **desengancha y avisa una vez** — si no, sería un warning por etiqueta y frame.

**Quinta línea: el NIVEL de señal (`redstone/redstone.js`, REQ-XR2).** Es lo único de un circuito que no
se ve mirándolo — la clave dice si una lámpara está encendida, pero no con cuánto, y un cable a 1 y otro a
14 son el mismo bloque. Dos casos, y son dos a propósito:

- **pieza de circuito** → `⚡ recibe`, y `⚡ recibe → saca` si entrega algo distinto. Un repetidor sale
  `⚡ 13 → 15`, que es justo la respuesta a «por qué el tendido de después no se acorta».
- **bloque macizo cualquiera** → solo si de verdad está haciendo de **puente** (r1.2), y la energía
  **débil** se marca como tal: un cable no la lee, así que «le llega 12 débil, la lámpara de al lado
  enciende y el cable no» deja de ser un misterio. **El 0 no se pinta**: serían ~245 etiquetas de ruido.
  Válvula de escape si un material no debería transportar: `game.redstone.aislante(clave)`.

Solo bloques de rejilla: el motor lee `mc.grid`, así que una estructura fina (`s` no nulo) no lleva línea
—su celda de origen contendría otra cosa y la cifra sería mentira—. Y salida rápida por `hayCircuito`: un
mundo sin redstone no paga nada.

Test: `node test_rayo_apuntado.js` (extrae las funciones verbatim de `app.js`; fija la regresión
comprobando que la celda **sí** da sólida por AABB pero el rayo **no** cruza voxel lleno) ·
`node test_rayos_x_power.js` (la línea de señal, el encadenado con `mundo-autoarranque` y que app.js
pase la celda de verdad en las ~100 etiquetas de una vuelta real de `mcUpdateXrayLabels`).

**Coste de rayos-X: se recorre la ESTRUCTURA, nunca el voxel.** `mcXrayVolume` dibujaba las cajas
naranjas preguntando `mcFineSolidAt` **voxel fino a voxel fino** de la caja del jugador, y cada pregunta
recorre todas las estructuras del mundo: `|caja| × |estructuras|` = ~17 600 × 48 ≈ **850 000 pruebas por
frame** (17 ms medidos: el frame entero), y crecía con `playerScale³`. Ahora se itera **estructura a
estructura recortando** la caja del jugador contra la suya (mismo recorte que `mcFineBoxHit`) y solo se
recorren los voxels que de verdad caen dentro: 17 ms → **0,23 ms**. Es la misma lección de la colisión
fina — **barrer el AABB en voxels finos no escala**. Test: `node test_rayos_x.js` (dibuja el mismo
conjunto que la versión ingenua, no llama a `mcFineSolidAt` ni una vez, y 200 estructuras lejanas no
reciben ni una lectura).

## `atravesable` — se ve, se apunta y se rompe, pero no frena (`bits` vs `bitsAim`)

Una mata de hierba se cruza al andar y sin embargo tiene que seguir pudiéndose romper de un clic. Son
**dos preguntas distintas sobre la misma materia**, y por eso hay dos bitsets, no uno:

| | qué significa | quién lo lee |
|---|---|---|
| `g.bits` | **¿me frena?** (colisión) | `mcFineSolidAt` → `mcCollidesWorld` → `mcCollides` |
| `g.bitsAim` | **¿hay materia aquí?** (ocupación real) | `mcStructCellSolid`, `mcStructRayHit`, `mcStructAt`, `mcBreak`, `mcXrayVolume` |

Por defecto **`bitsAim` es la MISMA referencia** que `bits` (cero memoria, cero divergencia). Solo
divergen las piezas atravesables: `bits` = `Uint8Array` de **ceros**, `bitsAim` = la ocupación real.

⚠️ **`bits` nunca es `null`.** `mcStructColl` devuelve `null` si la pieza no tiene `bits`, y entonces
la hierba desaparecería también del **apuntado** — no se podría romper. Además
`data/snippets/mundo-autoarranque.json` **re-implementa el bucle leyendo `g.bits`** (`golpe`,
`claveFinaEn`, el barrido de `trepable`), con un `if(!g || !g.bits) continue`. Por eso `mcFineBoxHit`,
`mcFineSolidAt` y `mcStructColl` **no cambian de firma ni de significado**: la capa de apuntado va
**encima** de ellas. (Lo único que se les ha añadido desde entonces es la rama de `s.esc`, ver
[escala de instancia](#-la-escala-vive-en-la-instancia-req-agesc1); con `esc` 1 o sin `esc` el bucle es
byte a byte el de siempre, que es lo que exige el extractor *verbatim* de `test_rayo_apuntado.js`.)

**Un material se declara atravesable por dos vías que producen la MISMA forma**, así que `app.js` no
necesita saber de cuál vino:

1. **El documento** — `"atravesable": true` en su `.vox.json` (casilla en la tarjeta *Objeto*). Es
   intrínseco del material. **No se deriva de la máscara de `caras`**, y los dos casos reales dicen por
   qué: el tallo de la mata es un voxel normal de 6 caras y debe atravesarse igual, mientras que una
   vidriera enmascarada tiene que seguir chocando. Derivarlo daría lo contrario en ambos.
2. **El mundo** — `game.bloques.define('hab:hierba', { atravesable:true })` en el snippet, que envuelve
   `mcStructColl` y clona el `g` (cacheado por `clave|rot`). `game.bloques.quitar()` lo deshace.

Y **también hay dos mitades por material**, porque un material vive en uno de dos sitios:

- **Estructura fina** — lo de arriba, cero líneas de `app.js` para la vía 2.
- **Bloque de terreno (`mc.grid`)** — `mcSolid` **NO se parchea** (lo usan a la vez el mallado, el rayo
  de apuntar y romper/poner: apagarlo ahí descosería las caras de los vecinos y borraría la pieza del
  apuntado). Va por **otra pregunta sobre la misma rejilla**, `mcSolidWalk` («¿me frena al andar?»),
  que consulta **dos** arrays indexados por id de bloque, los dos `null` mientras nadie sea atravesable:
  `mc.atraviesa` (lo escribe el **snippet**) y `mc.atraviesaDoc` (lo hornea **`mcBuildPalette`** desde
  el `"atravesable"` del propio documento). Se leen en **ese solo sitio**. Para que un material del
  documento vuelva a chocar hay que quitarle el flag al `.vox.json`: `game.bloques.quitar()` solo
  deshace lo que puso el snippet.

### Desde scripting: una hoja es un BLOQUE, como en Minecraft (`setVoxel`)

`setVoxel` escribe siempre en `mc.grid`, y ahí un material se dibuja proyectando su dibujo sobre las 6
caras del cubo (`buildTexFaces`). Eso **ya no pierde** la máscara de `caras` ni el `atravesable`, así
que un bosque entero de hojas se planta desde un script **sin un solo draw call extra**:

```js
setVoxel(x, y, z, 'leaves');          // TERRENO: bloque de RECORTE, con sus agujeros, y se cruza al andar
game.stamp('leaves', x, y, z, rot);   // PIEZA FINA: para lo que NO cabe en una celda (forma, alpha real)
```

Medido con 200 hojas (`test_stamp_scripting.js`): **`setVoxel` = 60 ms y 0 draw calls extra**;
`game.stamp` = **385 ms y 200 draw calls**. Con 2000, `game.stamp` son ~2,4 s — el snippet de montañas
del dueño se colgaba con eso. Son **cuatro piezas**, y las cuatro hacen falta:

1. **La máscara llega a la textura** — `buildTexFaces` respeta `caras`: si el bit de esa cara está
   apagado, el texel sale con **alpha 0** y la textura pasa a ser de **RECORTE**. ⚠️ Manda el **primer**
   voxel de la columna, tenga la cara encendida o apagada: seguir buscando detrás rellenaría el agujero
   con la cara opuesta de la cáscara y el bloque volvería a salir macizo. Un solo texel transparente
   enciende `mc.atlasHasAlpha` ⇒ el shader del terreno hace `discard`.
2. **Un bloque de recorte NO tapa** — `mcTapaCara(x,y,z)` es la **tercera** pregunta sobre la misma
   rejilla (`mcSolid` = «¿hay materia?», `mcSolidWalk` = «¿me frena?» —que en las celdas finas se afina
   por la FORMA, ver `mcTerrenoChoca`—, `mcTapaCara` = «¿tapa esta cara?»), y otra vez lo que la separa
   de `mcSolid` es un array: **`mc.recorte`**, `Uint8Array` por id
   de bloque que hornea `mcBuildPalette` junto al alpha del atlas. La lee **un solo sitio**, el mallado
   del chunk; **`mcSolid` queda byte-idéntico** porque lo comparten el rayo de apuntar y romper/poner.
   Sin esto, por los agujeros de una copa se ve el **vacío**: las caras de dentro estaban peladas. Es la
   regla de las hojas «fancy» de Minecraft. Medido sobre una copa de 311 bloques: **+15,8 % de
   vértices, los MISMOS 36 draw calls y el mismo ms/frame** — el culling de chunk cambia el tamaño del
   VBO, no el número de llamadas. Con `mc.recorte = null` (nadie tiene agujeros) es `mcSolid` pelado.
3. **`mc.atraviesaDoc`** — el `"atravesable"` del documento vale también en la rejilla (arriba).
4. **`mc.finoRejilla` — lo que NO llena su celda se dibuja con su GEOMETRÍA DE VERDAD, dentro de la
   malla del chunk.** Proyectar sobre las 6 caras solo es fiel si el dibujo **toca las paredes** de la
   celda (`leaves` va de 0 a 15: es una cáscara). Una **flor** vive en x 6..10, y 6..10: su silueta se
   pega a las 4 paredes y de lejos se veían **cuatro tiras verticales separadas** con un **cuadrado
   oscuro** debajo. La señal que las separa ya existía: **`rec.pielCubre`** de `mcStructCells`. Con
   ella `mcBuildPalette` hornea `mc.finoRejilla` (`app.js:5469`), `Uint8Array` por id de bloque,
   1 = «este material no llena su celda», y deja la geometría de `rot 0` lista en `mc.finoGeom`
   (`:5476`, caché **aparte** de `mc.structs[k].meshRot`, que `mcRestampAll` borra en cada estampado).
   ⚠️ **La celda sigue siendo celda de rejilla; lo que cambia es lo que emite el mallador.**
   `mcMeshChunk` (`:6512`) pide la tabla a `mcTablaFina()`, aparta esas celdas del bucle de cubos y
   copia su geometría real —trasladada a coordenadas de mundo y con la luz de la celda horneada por
   cara— a **dos lotes por chunk**, `finoVbo` (opaco) y `finoAVbo` (con alfa), que se dibujan con
   `mc.structProg` (stride 9: pos3, rgb3, shade, emit, alpha). Es el **mismo programa que las piezas
   finas**, y por eso geometrías distintas caben en un mismo buffer: va a **color por vértice**, no al
   atlas del terreno. **Un lote por chunk, no uno por flor** ⇒ 200 flores siguen costando **0 draw
   calls** (medido: 60 ms en rejilla frente a 397 ms y 200 draw calls como piezas sueltas).
   El lote entra **también en el pase del sol** (`:6468`), así que la flor proyecta la sombra de su
   silueta y no la de un cubo. `mcTapaCara` (`:5507`) devuelve `false` sobre una celda fina: no es un
   cubo, no puede tapar la cara del vecino.
   Válvula: `mc.finoExtra[id]`, en los dos sentidos y con el idioma de `mc.traspasaLuz` (1 = geometría
   real siempre, 2 = nunca, proyéctalo como cubo). Guardián: `test_flor_en_rejilla.js`.

5. **Un macizo TRANSLÚCIDO también va por ahí** (BUG-STR1). No llenar la celda no es el único motivo
   para no proyectarse: `hab:cubo-trans` es un 16³ **completo** —4096 voxels— pero su color trae alpha
   (`#4ab8d924`), y la proyección lo sacaría **macizo**, porque `buildTexFaces` hornea el atlas con
   `d[o+3]=255` y el shader del terreno solo recorta. Antes se le echaba del terreno entero; ahora entra
   por el punto 4, con su geometría de verdad, y el lote `finoAVbo` lo **mezcla de verdad**.
   ⚠️ **`mcRecFina(rec)` es la FUENTE ÚNICA de esta regla** (`app.js`, junto a `mcCabeEnRejilla`). La
   condición estaba copiada en tres sitios —`mcCabeEnRejilla`, `mcEsFinaEnRejilla` y el horneado de
   `mc.finoRejilla` en `mcBuildPalette`— y por eso pudo quedarse a medias. Si la tocas, tócala ahí y en
   ningún otro sitio. `blockLike` **no** cambió: sigue en `false` para el translúcido, porque lo que
   afirma es «la proyección es fiel». Lo que cambió es que dejar de ser `blockLike` ya no significa
   salir de `mc.grid`. Lo que **sigue fuera** del terreno es la piel que cubre **con `caras`**: una
   máscara sobre un macizo enseñaría el otro lado en vez de lo de dentro.
   ⚠️ Y por eso `mc.recorte[id]` se enciende para **toda** celda fina, no solo para las texturas con
   agujeros: si no, un techo de cristal dejaría a oscuras lo de debajo, que es **menos** de lo que hacía
   estampado suelto (una estructura no está en `mc.grid` y la luz le pasaba entera).
   Guardián: `test_cubo_translucido.js`. De regalo, el **pistón** ya lo empuja: empuja `mc.grid`, y el
   cubo por fin está ahí (`sonda_str1_piston.js`).

6. **Un macizo «CASI COMPLETO» también va por ahí** (BUG-RS19). El **observador** es el único material
   del juego con `pielCubre=true` y `blockLike=false`: 4092 voxels (cubre las 6 caras del cubo pero le
   faltan 4 huecos internos), sin alpha, sin `caras`, sin `atravesable`. El caso no estaba previsto en
   `mcRecFina` y el observador acababa por la ruta blockLike-like — que **no gira**: el atlas se
   hornea con 6 caras por bloque y sus UVs están orientadas para su normal, así que permutar la
   textura por variante `@n` deja la cara girada dentro del cuadro. Efecto visible: el observador
   sin girar iba a `mc.grid`, girado con `R` caía a `mcStampStruct`. La regla queda ahora **`pielCubre
   && !blockLike && !conCaras ⇒ geometría fina`**, así el observador (y cualquier futuro «casi macizo»)
   entra en la rejilla en las 24 posturas — el giro va gratis en la clave `@n` porque `mcStructGeom`
   la hornea por `(base, ori)` y `mcAltaVariante` la registra sin re-hornear el atlas. Todas las demás
   piezas de redstone (cable, palanca, repetidor, pistón, placa, puerta, antorcha, botón, inversor…)
   ya iban por esta ruta porque tienen `pielCubre=false`; el observador era el único afectado.
   Guardianes: `sonda_bug_rs19.js` (A/B puro en Node sobre 10 assets reales, sin navegador) y
   `test_observador_rotacion.js` (24 posturas caben en la rejilla como fino, `mcAltaVariante` registra
   la variante `@1` por el camino rápido, y `mcPonEnRejilla` la escribe en `mc.grid` sin crear
   estructuras).

7. **Un FLUIDO va por ahí siempre, y por eso necesita su propio culling** (REQ-FLUID4). El agua y la
   lava son macizos 16³ (4096 voxels, `pielCubre`) pero **translúcidos**, así que por el punto 5 caen
   en el camino fino: cada celda de un lago copia su geometría entera —las **seis** caras— al lote
   `finoAVbo`. El mallador de cubos lleva desde siempre su regla de «no emitas la cara que da a un
   vecino sólido», pero **el camino fino no tenía ninguna**: una charca de 9×9×3 emitía **1458 caras**
   y se veía como lo que era, cubos apilados con las costuras marcadas. Con el culling son **81**
   (18×), y desde fuera parece una masa de líquido. Cómo:

   - **La geometría fina lleva la dirección de cada cara**, `colFD`/`alphaFD`/`texFD`: un byte por
     quad, **0..5 = está en la piel de la pieza y mira hacia ahí** (índice de `MC_FACES`), **6 = no
     está en la piel**. El 6 no es relleno: un quad interior —el techo de una cueva dentro del propio
     dibujo— vive en mitad de la pieza y **no lo tapa ningún vecino**, así que hay que poder decir «a
     éste no lo mires». El envés de una cara con `caras` hereda la dirección de su anverso (mismo
     plano ⇒ si un vecino tapa una, tapa las dos).
   - **Se cullea con tres reglas** (`tapadasFluido`, máscara de 6 bits que `copia()` salta al volcar):
     vecino **opaco** que tapa la cara entera (`mcTapaCara`, la misma pregunta que el camino de cubo);
     vecino del **mismo fluido en vertical** (dos celdas apiladas comparten el plano exacto, porque
     `mcGetFluidHeight` ya devuelve 1.0 cuando hay fluido encima); y vecino del mismo fluido **en
     horizontal** solo si **llega tan alto** como esta celda — si no, la cara asoma y se ve.
     ⚠️ La regla del vecino opaco solo vale con la celda **llena**: un fluido que no llega arriba del
     todo no alcanza el plano que el vecino tapa (salvo por abajo).
   - ⚠️ **La identidad de un fluido es su TIPO, no su id.** `hab:agua-1`…`hab:agua-7` son ids
     distintos de la misma agua, y comparando ids el culling no habría cullado ni un lago con
     corriente. `mcTablaFluido()` construye `id → 'WATER'|'LAVA'` preguntándole a
     `game.fluidos.getProps`, y su caché se invalida por **dos** cosas: el tamaño de la paleta **y la
     identidad de `game.fluidos`** — sin lo segundo, el `null` de antes de que el snippet instale la
     API se quedaría cacheado para siempre y el culling no se encendería jamás.
   - **Válvula: `mc.sinCullingFluido = true`** (tests y F12) vuelve al lago-rejilla. Va **sumada a la
     firma del chunk** en los dos sitios donde se calcula, porque cambia la malla y si no el caché LRU
     de PERF-RS1 devuelve el VBO de antes — medido: la A/B daba el mismo número las dos veces.
   - El **alpha es del asset**, no del motor: `assets/agua.vox.json` pasó de `#3377ff1a` a
     `#3377ff66` porque una lámina de una celda era invisible (la lava se quedó en `#ff5500bd`). Se
     retoca en el editor.

   ⚠️ **Y la trampa que había debajo, que era la mitad visible del problema:** `mc.finoRejilla`,
   `mc.finoExtra`, `mc.recorte` y `mc.atraviesaDoc` son `Uint8Array` dimensionados **cuando los horneó
   `mcBuildPalette`**. `setFluid` apenda un id nuevo a la paleta (el nivel `agua-3`) y escribía sus
   flags en `[id]` **fuera del array**: JS lo tira sin decir nada, el nivel perdía «me dibujo con mi
   geometría fina» y volvía al camino de cubo ⇒ un **cubo azul opaco** (el atlas de terreno se hornea
   con `d[o+3]=255`) en medio de un lago translúcido. Todo id apendado después del horneado tiene que
   **hacer crecer** esos arrays, como ya hacía `mcAltaVariante`.

   Guardián: `node test_caras_fluido.js` (las 1458→81 caras y el ida y vuelta de la válvula; que los
   niveles siguen por el camino fino; que agua y lava cullean igual, con la cuenta **derivada de la
   rejilla real** con los propios ayudantes del motor y no escrita a mano; y que una pieza sin fluido
   —`flor-roja`— da una malla byte a byte idéntica).

**Lo que `setVoxel` avisa se reduce a lo que de verdad no cabe en una celda**: la **FORMA** (la piel no
cubre el cubo **y ocupa varias celdas**, así que cada una se proyecta suelta como un cubo lleno). La
**transparencia real** ya no es motivo de aviso desde BUG-STR1: cabe, y se mezcla.
Una mata o una flor **ya no avisan**: caben en una celda, el mallador emite su geometría de verdad y
se ven como el documento (punto 4 de arriba). Lo decide `rec.pielCubre`, que
`mcStructCells` calcula con las tres proyecciones de 16×16 del dibujo. `caras` y `atravesable` **ya no
son motivo de aviso**. Se avisa una sola vez por material, por consola **y por toast**: el dueño
construye desde el móvil y ahí un `console.warn` es indistinguible de «el script no hace nada».

⚠️ **`buildTexFaces` tiene que aplicar la regla del OBJETO, y no aplicarla fue el «cubo verde».**
El dueño reportó con una captura que las mismas hojas puestas por script salían como un cubo verde
macizo y puestas a mano salían frondosas. La causa era **una línea** del horneado de la textura
(`app.js:1078`): al buscar el primer voxel opaco de cada columna trataba «este voxel **no tiene**
entrada en `caras`» como **63** (pinta las seis) en vez de **0** (no pinta ninguna), que es la regla
que sí siguen `caraMask` y `mcStructGeom`. Efecto: los voxels **de dentro** del follaje, que en la
pieza fina no pintan nada, al proyectarse **tapaban todos los agujeros de la cáscara**. Medido sobre
`assets/leaves.vox.json`: las 6 caras salían **85-93 % opacas**; con la regla correcta salen
**34-45 %** y `hueco` pasa a `true`, o sea el shader del terreno hace `discard` y se ve a través.
**Era un fallo del motor, no de autoría del asset.** La zona de pruebas de `/map/test` deja el A/B
plantado (ver abajo).

⚠️ **Límite que sí sigue en pie: `pielCubre` mide la SILUETA, no el aspecto.** Un dibujo volumétrico
y denso —un follaje— cubre sus 16×16 columnas en los tres ejes, así que pasa el test y `setVoxel`
**no avisa**, aunque el terreno solo pueda pintar su cáscara sobre 6 caras. Con el horneado ya
correcto eso deja de doler para un asset con `caras`, pero para uno **sin** máscara y con interior
interesante el aviso sigue sin saltar: `pielCubre` responde «¿cabe la silueta?» y la pregunta que
importa es «¿se parece?». Es un límite conocido, no un pendiente.

`game.stamp(material, x,y,z, rot)` sigue siendo lo mismo que hace la mano (`mcPlace` →
`mcStampStruct`): acepta nombre corto (mismo `mcResolveMat` que `setVoxel`) o clave exacta
`asset:…`/`hab:…`, respeta `beginBatch`/`endBatch` y devuelve `false` fuera de límites. **Precio
explícito: cada pieza es una entrada de `mc.structures` = UN DRAW CALL y una línea en el `structures[]`
de `mundo.json`.** Es la vía para una mata de hierba o una llama; para un bosque, `setVoxel`.

**Colocar A MANO usa la MISMA función**, desde que el punto 4 hace fiel a la rejilla lo que no llena su
celda: el clic derecho sobre una ranura de estructura ya no estampa siempre una instancia, sino que
pregunta **`mcCabeEnRejilla(key)`** y, si cabe, llama a `mcSetVoxel`. Una flor puesta a mano deja de
costar un draw call y de ocupar una línea del `structures[]` de `mundo.json`. Dice que **no** cabe —y
entonces se estampa como siempre— en tres casos: **varias celdas** (una sala, un árbol), la piel cubre
el cubo **y** es translúcida o tiene `caras` (el atlas recorta y no enseña lo de dentro), y **sin huella
todavía** (se calienta `mcStructCells` y esa vez va de pieza).

**El giro también cabe: va en la CLAVE.** Una celda de `mc.grid` es un `Uint16` con el id del bloque y no
tiene hueco para la orientación — pero sí puede guardar **otro id**. «Esta pieza, girada así» entra en la
paleta como un material más, con la clave del original y el sufijo **`@<ori>`** (1..23; el 0 no se
escribe, y la clave admite dos dígitos: `/@\d{1,2}$/`). Puesto ahí, el giro viaja **solo** por todo lo que ya existía, sin
tocar una línea: `mc.grid` sigue siendo ids, el guardado sigue escribiendo `tex:<clave>`, la paleta del
`.vox` v2 y `/api/mundo/edits` tratan la clave como cadena opaca (`server.py` ni se entera) y al recargar
el mundo la variante se da de alta sola como cualquier material que venga del fichero. Y como
`mc._geoFina[id]` devuelve la geometría horneada **de ese id**, el mallado, la sombra y la colisión por
forma salen girados gratis. Las tres piezas: `mcClaveBase` / `mcClaveOri` / `mcClaveConOri`; `getRoomData`
comparte el documento con la clave base (ni un `fetch` de más) y `mcBuildPalette` hornea
`mcStructGeom(base, ori)`. `setVoxel(x,y,z,'flor@1')` también lo entiende (`mcMatKey`), y rayos-X enseña
ese mismo nombre. `R`/`Shift+R` **precargan** la variante mientras miras el fantasma
(`mcPrecargaGirada`), para que el clic sea el camino normal y no el de «material pendiente».

#### Las 24 posturas de un cubo se DERIVAN, no se escriben a mano (BUG-ROT1)

Un cubo tiene **6 caras × 4 giros = 24** orientaciones. Hasta BUG-ROT1 solo se llegaba a **16**, porque
`ori` componía **dos** cuartos de vuelta (`giro | vuelco<<2`): con dos ejes, `+Y` y `−Y` se llevan 4
giros cada una y las otras cuatro caras se quedan con **2**. El dueño lo reportó como colocaciones
imposibles, e hizo la cuenta él. Falta un **tercer** cuarto de vuelta (`roll`, sobre Z) y va **antes**
del vuelco.

**`MC_ORI` es una tabla derivada** (`app.js`): se recorren las 64 ternas `(roll, tilt, yaw)`, se firma
cada una por lo que le hace a los tres vectores base y se descartan las repetidas. Salen 24, y salen en
el orden que hacía falta:

- las **16 primeras** son las `(0, tilt, yaw)` en el orden viejo ⇒ `@0..@15` significan **byte a byte
  lo mismo** y los mundos guardados no se mueven un grado. Las nuevas se apenden como `@16..@23`.
- quedan **agrupadas de cuatro en cuatro por cara arriba**, así que el gesto es directo:
  **`ori = cara*4 + giro`**, sin tabla intermedia. `R` cambia la **cara** (6, rótulos en
  `MC_ORI_CARA`: `arriba · −Z · abajo · +Z · +X · −X`) y `Shift+R` el **giro dentro de esa cara** (4);
  el estado es `mc.previewCara` / `mc.previewGiro`.

⚠️ **Nada de `(rot|0)&15`** — ese recorte convertía en silencio una postura nueva en una vieja. Se
decodifica siempre con `mcOriNorm` / `mcOriParts(ori) → [roll, tilt, yaw]`. Un `&15` olvidado en
`redstone/redstone.js` costó **dos tickets** (BUG-RS7 y BUG-RS8, que resultaron ser el mismo fallo):
`hab:palanca@19` volvía de encenderse como `@3`, y `hab:piston@16` (mirando arriba) se acostaba en el
instante de soltarlo, porque el motor le «devuelve» su postura a toda celda que repasa. Y como esas
piezas son **finas** y no llenan su celda, cambiar de postura las **mueve dentro** de la celda — se ve
como «se ha ido de sitio», no como «se ha girado».

⚠️ **La composición vive en UN solo sitio: `mcOriMove(rot, bx, by, bz)`.** Devuelve el `mueve(x,y,z)`
con las tres pasadas de `mcRotXZ`, y lo piden **a la vez** el bucle de voxels de `mcStructGeom` y
`mcFacePerm` (la permutación de normales de la máscara `caras`): con dos copias, la máscara y la
geometría se desincronizan a la primera. Y cada cuarto de vuelta impar intercambia los dos ejes de su
plano, así que son **tres** intercambios encadenados, no dos.

**Y quien no tiene la geometría delante pregunta por `mcOriPerm(rot)`** — `mcFacePerm` sobre la caja
unidad, o sea la permutación de caras de la postura. Es como una pieza de redstone sabe hacia dónde
**mira**: su frente es el `+X` de su dibujo, `MC_FACES[2]`, y `mcOriPerm(rot)[2]` dice en qué cara del
mundo acaba. Que salga de la misma composición es lo que impide que una pieza **haga** una cosa y se
**vea** otra. Las dimensiones de la caja solo desplazan (la parte lineal de `mcRotXZ` no las mira) y
`mcFacePerm` resta el origen, por eso la caja unidad basta.

⚠️ **`mundo-autoarranque` calca esa composición** en `caraEnMundo` y `dimsMundo` (para `pivote:'auto'`),
y el dueño lo edita en vivo ⇒ se parchea con **`parche_snp_rot24.py`**, idempotente; pregunta a
`mcOriParts` y deja el calco viejo de red por si corre sin motor.

⚠️ **`rot & 15` es SIEMPRE un bug** (BUG-RS7, BUG-RS8, BUG-ROT2): no rechaza una postura de 16..23, la
convierte **en silencio** en otra de 0..7. El criterio único es `mcOriNorm`: lo que no es una postura
conocida se lee **como «sin girar», nunca como otra**. El último que quedaba vivo era el de las piezas
de un esqueleto (`game.esqueletos.crear`), hoy `oriDePieza` — `parche_snp_rot24_esqueletos.py`.

Tests: `node test_posturas_24.js` (headless: 24 distintas, determinante 1 —nada de espejos—, `@0..@15`
intactas, `R`×6 y `Shift+R`×4 vuelven al inicio, `mcOriDims` cuadra con la composición, y §E que
`mcOriMove` **es** la composición de `mcStructGeom` y que el frente de `@0..@15` no se ha movido) ·
`node test_posturas_mundo.js` (Chromium, con una pieza **asimétrica** de verdad: 24 geometrías
distintas y ni un voxel perdido). ⚠️ Ese segundo lee **`g.bitsAim || g.bits`** (la flor es
`atravesable`) y **no** compara `mcOriDims` con `g.fdim`: aquél habla de **celdas** y éste de voxels
finos **ajustados al contenido**, y el giro se hace dentro de la caja redondeada a celdas — una pieza
de 11 de ancho en una caja de 16 sale 10 u 11 según dónde caiga. Y elegir una pieza **simétrica** (un
16³ macizo como `hierba`) da 24 falsos verdes: el test lleva guardia contra eso.

⚠️ **Dar de alta una variante NO puede pasar por el camino largo de `mcAddBlock`.** Medido en el mapa de
512×40×512: **3 873 ms** por `mcBuildPalette` (re-hornea los N materiales) + el atlas creciendo de alto,
que cambia las UV de **todos** los bloques y obliga a `mcMeshAll`. El atajo es `mcAltaVariante`: apende las
casillas de la paleta a mano y le pasa **las UV del original**, así que el atlas no crece, nada de lo ya
mallado caduca y no se re-malla nada → **6 ms en frío** (hornear la geometría girada incluida). Es la regla
general: *si el atlas no cambia de alto, no hay que re-mallar el mundo*.

Lo único que sí se sigue estampando al girarlo es **lo que se proyecta sobre las 6 caras del cubo**
(`mcEsFinaEnRejilla` en `false`, o sea `mcRecFina` en `false`: `blockLike`, o `pielCubre` sin ser
translúcido): ahí el giro no se vería, y perderlo en silencio sería peor que gastar el draw call.

Y **la celda fina también choca por su FORMA**, no como el cubo de 16/16 — que fue justo lo que se rompió
al estrenar esto: una placa de **un voxel de alto** puesta con el clic derecho se convertía en un muro de
bloque entero y ya no se podía pisar. `mcTerrenoChoca` (el bucle de terreno que comparten `mcCollides` y
`mcCollidesWorld`, extraído para que la regla viva en **un solo sitio**) sondea el mismo bitset `bits` que
usa la instancia estampada, en 1/16, cuando la celda está en `mc._geoFina`. Sin materiales finos esa tabla
es `null` y el bucle es el de siempre; con ellos, el sondeo fino solo entra en las celdas que lo son y no
reserva memoria (el pecado histórico de esta zona fue sondear el AABB fino con claves `string`).
Válvula por si acaso: `game.useOldStructBuildCall = true` (persiste en `localStorage`,
`vf_mcOldStructBuild`) devuelve el `mcStampStruct` de siempre. El único punto de decisión es `mcPlace`:
los dos gestos que construyen (`pointerdown` y `mouseup` con el botón derecho) pasan por ahí. Guardianes:
`test_clic_derecho_rejilla.js`, el §6 de `test_flor_en_rejilla.js` y `test_cubo_translucido.js`.

⚠️ **La válvula no es la que decide.** Se dio el caso (BUG-STR1) de que el dueño vio un `hab:cubo-trans`
como estructura y dedujo que la válvula estaría encendida. No: `mcPlace` pregunta **primero** a
`mcCabeEnRejilla`, y si ésa dice que no, `useOldStructBuildCall` no llega a opinar. Al depurar un «esto
se colocó como estructura», mirar `mcRecFina`/`mcCabeEnRejilla` **antes** que la válvula.

⚠️ Lo que **no** hereda la celda: el par `bits`/`bitsAim` — en la rejilla, `atravesable` lo resuelve
`mc.atraviesaDoc`, que hace la celda caminable entera (`mcSolidWalk`), y ahí ni se llega a mirar la forma.

### La textura que falta se carga sola (`setVoxel` ya no pone roca por ti)

`setVoxel(x,y,z,'flor_amarilla')` **sin haber llamado antes a `game.addMaterial`** ponía un bloque de
**roca gris**. Y no por falta de información: `assets/index.json` ya decía que `flor_amarilla` es
`assets/flor-amarilla.vox.json`. El motor sabía exactamente qué fichero querías y aun así ponía piedra,
porque `mcResolveMat` solo mira la **paleta cargada** y su fallback es roca. Ahora:

```js
setVoxel(x, y, z, 'flor_amarilla');   // se carga la textura sola; NO hace falta el addMaterial de antes
```

La mitad de `mcResolveMat` que traduce motes está separada en **`mcMatKey(m, mLow)`** (alias →
`asset:…`/`hab:…`), y sobre ella se apoya **`mcMatPendiente`**: si el nombre resuelve a una clave que se
puede ir a buscar a disco y **no** está cargada, la celda se **apunta** en `mcPendCel`, se pide la
textura en segundo plano (**una carga por material**, `mcPendCarga`, no una por voxel) y al llegar se
pintan de golpe todas las celdas apuntadas + `mcFlushBuild()`. Reglas que hay que respetar al tocar esto:

- **El nombre inventado sigue cayendo a roca al momento, con su aviso.** Solo se difiere lo que empieza
  por `asset:`/`hab:` o acaba en `.json`; si no hay fichero que pedir, no hay nada que esperar.
- **Manda la última escritura.** Un `setVoxel` normal sobre una celda apuntada la desapunta.
- **Antes de dar de alta el material se comprueba que el fichero existe y trae voxels** (`getTexDef`,
  que cachea, así que el `game.addMaterial` de después no re-descarga). `mcBuildPalette` se **traga** una
  textura que falla —la pinta fucsia— y el bloque se quedaría para siempre en la lista de materiales del
  mundo, **que se guarda en disco**: una errata no puede ensuciar el mundo.
- **Se carga por `game.addMaterial` y no por `mcAddBlock`**: es quien invalida la caché `mcMat2id`.
- `mcStampSrc` usa la misma pregunta, así que `game.stamp('flor_amarilla', …)` con la textura sin cargar
  tampoco da roca — ahí no hay que esperar a nada, porque estampar no necesita la paleta.

⚠️ **Efecto visible, y es el precio de todo esto: el bloque aparece un instante después.** `setVoxel` es
**síncrono** y cargar una textura es **asíncrono**, así que un `getVoxel` inmediatamente después de un
`setVoxel` con material sin cargar todavía devuelve **lo que había** (aire, normalmente). Lo que no hace
es mentir poniendo otro bloque.

⚠️ **`mcBuildPalette` vacía `mc.palette`/`mc.blockKey`/`mc.name2id` de golpe** y los rellena textura a
textura: **mientras corre, TODO material parece «sin cargar»** (y `mcResolveMat` devuelve el fallback).
Por eso la pregunta «¿está cargado?» se le hace a **`mc.blocks`** (`mcClaveCargada`), que es estable, y
por eso existe **`mc.paletaEnObra`**: durante esa ventana la celda también se apunta y se espera a que
la paleta termine (`mcEsperaPaleta`) en vez de escribir el bloque equivocado — pedir otra vez un
material que ya está en `mc.blocks` lo **duplicaría**. El cuerpo real vive en `mcBuildPaletteImpl`; el
`mcBuildPalette` de fuera solo lleva la cuenta con `try/finally`.

Guardián: `node test_setvoxel_autocarga.js` (21 ok). Busca solo él un mote del índice que **no** esté
ya en la paleta del mundo, porque las flores ya están plantadas en `/map/test`.

### `mcSetBlock` es la puerta de ABAJO, y desde un snippet avisa (REQ-SETBLOCK1)

`mcSetBlock(x,y,z,id)` quiere un **índice numérico** de la paleta de **este** mundo, así que quien la
llama a pelo traduce nombre→índice a mano. Ahí se cae todo lo de arriba, y **en silencio**:

- un índice que no existe **no falla: pinta aire** ⇒ la construcción sale a medias sin que nada grite;
- **se salta la autocarga** de esta misma sección, que solo vive en `mcSetVoxel` porque es la que pide
  el material **por NOMBRE** ⇒ revienta en un mapa cuya paleta aún no lo tenga (así se rompió
  `construye-casa`: «la paleta de este mundo no tiene "farolillo-zen"»);
- **no re-malla**: apunta la celda en `mcDirty`, que es la cola de **guardado**, no la de mallado ⇒ lo
  construido puede quedarse **invisible** aunque esté de verdad en la rejilla.

La puerta buena es **`setVoxel(x, y, z, 'nombre')`**. Los ~25 llamadores de `mcSetBlock` **dentro** de
`app.js` son legítimos (`mcSetVoxel` el primero), así que el aviso **solo le habla a quien la llama
directamente desde un snippet**: se mira `mc._snippetActual` y el marco `[3]` de la pila, que
`mcCorreSnippet` marca con `//# sourceURL=vf-snippet/<nombre>`. Como construir una pila es caro, se
sondea ≤30 veces por snippet y se calla para siempre en cuanto avisa una vez — 20 000 bloques cuestan
30 pilas, no 20 000. Sonda: `node tests/probe_aviso_setblock.js` (avisa · calla con `setVoxel` · un
solo aviso para 300 bloques).

⚠️ **El bucle de `mcBuildPaletteImpl` va EN SERIE a propósito y no se paraleliza** (PERF-MC3): rasteriza
sobre un canvas compartido y escribe `mc.palette[id]` en orden, y **el id de bloque es la posición en
`mc.blockKey`**, que es lo que llevan dentro los mundos guardados — desordenarlo los corrompe. Lo que sí
va en paralelo son las **descargas**, y por una vía que no toca el bucle: `mcPrecargarDocs(keys, tope)`
las suelta antes en tandas de 8 y **no se espera**, porque **`getRoomData` cachea la PROMESA y no el
resultado**; cuando el bucle llega a un bloque, su documento ya está en vuelo. Si algún día hace falta
más, el sitio **no** es el bucle: es el tope, o servir las caras ya rasterizadas.

El tope de 8 no es un número mágico: **el navegador solo abre ~6 conexiones por host**, y el editor está
pidiendo lo suyo por el mismo sitio mientras el Mundo carga (`renderTexStrip`, los catálogos). Soltar
200 de golpe no baja nada antes y sí retrasa al resto. Por eso `test_paleta_paralela.js` mide el **pico
de peticiones en vuelo** (≥ 4; en serie sería 1) y **no** el reloj de pared: en localhost lo que domina
el reloj es esa cola, no el código.

⚠️ **En `/map/<nombre>` el editor NO arranca antes que el Mundo, y eso es a propósito.** El Mundo se abre
encima del editor y lo tapa entero, pero las galerías del editor bajan **un documento por miniatura**
(decenas de habitantes, megas) **por el mismo host**. Con ~6 sockets, arrancarlas antes deja a la paleta
del Mundo *esperando turno*, no descargando: 10 s medidos en el portátil del dueño, con la red terminada
en 1,3 s. Las tres últimas líneas de `app.js` separan los dos trabajos del índice de assets —
`mcIndexAssets` (nombres cortos, los usa el snippet de autoarranque, hace falta **antes** de `openWorld`)
y llenar las galerías (**después**)— compartiendo la promesa de `assetIndex()`. **Si añades algo al
arranque, pregúntate si se ve mientras el Mundo carga**; si no se ve, va detrás de `openWorld()`.

Para repartir la culpa sin suponer, `game.loadReport()` da: el `ms` de cada bloque partido en **`doc` /
`caras` / `geom`** (esperar el documento · rasterizar las 6 caras · hornear geometría fina), y una línea
`RED ·` con **`esperando TURNO de socket`** (`requestStart − fetchStart`) y cuántas **peticiones ajenas**
competían en esa ventana. El veredicto **solapa** la ventana de red con la duración de la fase; no mires
los KB/s para decidir si la red es el cuello — un caudal bajo solo dice que los documentos son pequeños
para lo que tarda un viaje, y ese error ya costó una vuelta entera de diagnóstico falso.

### La zona de pruebas de `/map/test`

`herramientas/monta_zona_caras.js` planta en **`/map/test`** cinco puestos en fila con una **nota
post-it** al lado de cada uno, para poder mirar con los ojos lo que los tests miden. Es idempotente:
barre lo fino que hubiera en la caja `x 34-62 · z 40-46` antes de repoblar, porque `game.stamp` **no**
lo es (cada pasada apila otra estructura en la misma celda).

| puesto | x | qué enseña |
|---|---|---|
| 1 | 36 | hojas por `setVoxel` → bloque de terreno con la textura **calada** por `caras` |
| 2 | 42 | las mismas por `game.stamp` → pieza fina; tiene que **parecerse** al 1 |
| 3 | 48 | `demo-hojas-sin-caras` = el mismo dibujo **sin** la clave `caras` → el cubo verde de antes |
| 4 | 54 | `hierba-alta`: 2 caras por voxel, se ve por los 4 lados y se **atraviesa** |
| 5 | 60 | muro de tablones para probar a mano `game.bloques.define(…,{atravesable:true})` |

Medido con la cámara a 5 bloques y un recuadro central de 64 px: por el puesto 1 se ve **11,8 % de
cielo** a través del follaje y por el puesto 3 **0 %**. `assets/demo-hojas-sin-caras.vox.json` existe
**solo** para ese A/B y está dado de alta en `assets/index.json` (el registro del cliente se alimenta
de ese índice, no del directorio: un `.vox.json` suelto **no** se resuelve por nombre corto).

Test: `node test_stamp_scripting.js` (que la hoja es de recorte y **ya no avisa**; que dos hojas
pegadas emiten sus 12 caras y dos rocas solo 10; que la mata va al lote fino del chunk y ya no avisa;
que `mcSolid` no cambia; que `game.stamp` crea la pieza con `bits` en ceros y `bitsAim` ocupado; y el
precio de cada vía en ms y draw calls).

## Atar una pieza al motor: que lo declare el dibujo (REQ-TOOL1)

*(movido verbatim desde `CLAUDE.md` el 2026-08-13, tope de 15 KB)*

El patrón para atar una pieza a algo del motor es al revés de lo que parece: **que lo declare el dibujo**
en su `meta` y el motor lo derive del catálogo, como hace la ranura de herramienta
(`meta.categoria:'herramienta'` + `meta.herramienta`, REQ-TOOL1). Escribir la tabla en el motor obliga a
poner claves `hab:` a mano, que es exactamente lo que rompió BUG-RS23 y BUG-FLUID3.

## Extruir y cavar con la selección (REQ-EXTRU1)

*(2026-08-20, nota del dueño en `/map/bugfinder`, 56,14,71: «*me gustaria hacer una extrusion con la
herramienta de seleccion, podria ser seleccionar, y una vez seleccionado, usar shift+wheel up o down,
para estruir hacia arriba o hacia abajo (hacia abajo cavaria)*»)*

Con la herramienta **Seleccionar** y una caja confirmada (`mc.selBox`), **Ctrl + rueda** llama a
`mcSelExtruir(±1)`: arriba **construye**, abajo **cava**.

> **El gesto nació en Shift + rueda y el dueño lo mudó a Ctrl el mismo día** (2026-08-20), al pedir que
> **Shift + clic** sirviera para añadir cajas a la selección (REQ-SEL1). Ojo con Ctrl+rueda: es el **zoom
> del navegador**, así que el manejador le corta el paso (`preventDefault`) a *cualquier* Ctrl+rueda
> dentro del Mundo, toque extruir o no; si no, la página se va de escala y el mapa con ella.

Tres decisiones que no son obvias y que sujeta `tests/test_extru1_seleccion.js`:

- **Por columnas, no por capas.** Para cada `(x,z)` se busca el bloque sólido más **alto** *de dentro de
  la caja*: subir escribe una celda por encima de él, bajar se lo lleva. Sobre terreno desigual eso sube
  y baja siguiendo la **silueta**; una capa plana sobre `y1` habría dejado una plancha flotando sobre los
  valles. El material que se copia es el **id** de ese bloque, columna a columna.
- **La caja se mueve por su borde de ARRIBA**, que es donde está pasando todo, aunque *alguna* columna no
  haya podido escribir (tope del mundo, celda ocupada — extruir **no pisa** lo que ya hay). Al subir se
  estira una celda; al bajar se encoge una, y cuando ya no puede encogerse más (alto 1) **baja entera** y
  sigue cavando en el terreno. Ahí está la gracia: la muesca siguiente ya ve lo recién puesto, o el
  terreno que acaba de entrar en la caja, y se sigue sin volver a marcar esquinas. Si **ninguna** columna
  escribió, en cambio, la caja **tampoco se mueve**: no ha pasado nada que enseñar, y moverla rompía la
  regla de abajo (con la selección tapada por arriba, el `wup` no ponía nada pero subía el marco, y el
  `wdown` de vuelta se comía el bloque ajeno que estorbaba).
- **Los dos sentidos SON inversos**: una muesca arriba y otra abajo dejan los bloques **como estaban**.
  No lo eran en la v1 —cavaba por el bloque más **bajo** de la caja— y el dueño lo devolvió el mismo día
  (fotos 62 y 63): bajar no deshacía nada, encima no se veía (el bloque que se comía estaba enterrado) y
  la caja **crecía hacia abajo** en vez de bajar. El tramo G del guardián es un *property test*: fotografía
  las columnas enteras, da una muesca arriba y otra abajo y exige el mismo mapa. Deshacer de verdad sigue
  siendo **Ctrl+Z**, y cada muesca es **un** gesto `'bb'`.

Se escribe con **`mcSetBlock`**, no con `mc.grid[i]=`: aquí cambia la **topología** (aire↔sólido) y es
`mcSetBlock` quien mueve `mc.gridGen`, que es lo que hace que `mcRemeshEdiciones` → `mcRemeshAround`
re-ilumine la caja en vez de saltárselo (PERF-RS1). Rellenar de material (`mcSelectFillId`) sí puede
escribir directo porque no cambia la topología.

En el manejador de la rueda (`#mc-canvas`, junto a la rosca de herramientas de REQ-TOOL6) el gesto se
mira **antes** que la rosca y **sin** consultar `mc.ruedaTool`: lleva Ctrl, así que es otro gesto, y
quien haya apagado la rosca sigue queriendo extruir. El acumulador `mc._ruedaAcum` es el mismo para los
dos, pero se **vacía al cambiar de gesto** (`mc._ruedaExtru`) o media muesca de rosca acabaría
extruyendo.

### La caja VACÍA también se mueve (REQ-EXTRU3)

*(2026-08-28, dueño: «*cuando hago shift+wheel o control+wheel me dice a veces "la seleccion no tiene
bloques, nada que cavar", no importa si no tiene bloques, la seleccion ha de moverse igualmente*»)*

Marcas la caja en el aire y el gesto se quedaba en un aviso: ni extruía —no hay de qué— ni movía el
marco, así que para bajarla al suelo había que volver a marcar las dos esquinas. Ahora las dos guardas de
«no tiene bloques» (una en `mcSelExtruir`, otra en `mcSelExtruirFrente`) llaman a **`mcSelMueveVacia`**.

⚠️ **Cada una de esas dos funciones tiene DOS guardas que se parecen y están a veinte líneas la una de la
otra. Sólo una mueve la caja:**

| guarda | significa | qué hace |
|---|---|---|
| `!col.size` / `!fila.size` | la caja **no tiene ni un bloque** | **mueve** el marco (esto) |
| `!edits.length` | hay bloques, pero **ninguno se pudo escribir** | **no lo mueve** — regla del dueño de 2026-08-20 (un `wup` y un `wdown` dejan los bloques como estaban) |

Tres decisiones, todas medidas en `tests/probe_sel_vacia.js`:

- **Se traslada, NO se estira.** Con bloques dentro la caja se mueve por su borde **activo** (el de
  arriba con Ctrl, el que da la cara con Shift) porque ahí acaba de aparecer o desaparecer una capa.
  Vacía no aparece ni desaparece nada, así que encoger un borde no significaría nada — y una caja vacía
  de alto 3 se quedaría **quieta dos muescas** antes de empezar a bajar. Viaja **entera**, conservando la
  forma que costó marcar, hasta meterse en el terreno; en cuanto pilla un bloque manda otra vez la
  extrusión de siempre.
- **El tope del mundo se mira sobre el CONJUNTO de cajas** (REQ-SEL1): recortar caja a caja las
  deformaría y les cambiaría las distancias entre ellas. O se mueven todas o no se mueve ninguna. El
  **agarre** del giro (`mc.selPivote`) viaja con ellas, o el motor lo daría por fuera de la selección
  (`mcSelCajaDe(...)<0`) y rotar pasaría a pivotar por la esquina mínima sin avisar.
- **No hay deshacer de este viaje.** Ctrl+Z restaura la caja sólo si va pegada a una edición
  (`mc._selCajasBeforeEdit`, que consume `mcPushHist`), y aquí no se edita ni un bloque. Por eso
  **tampoco se toca esa variable**: dejarla puesta pegaría el viaje a la **siguiente** edición y el
  deshacer teletransportaría el marco.

Nació como snippet (`data/snippets/sel-mueve-vacia.json`, Ley de Oro) y bajó al motor con
`herramientas/parche_app_sel_vacia.py`. El snippet sigue publicado y **se aparta solo** al ver
`mcSelMueveVacia` en `app.js`. En el motor sale además más barato: el snippet tenía que recorrer la
selección por su cuenta antes de cada muesca para saber si estaba vacía, y aquí la respuesta ya está
hecha —`col`/`fila` salen de la única pasada que da el original—, así que desaparece el segundo barrido.

### …y la caja VACÍA también se RELLENA desde una ranura

*(2026-08-29, dueño: «*seleccionar suelo, clic central, control arriba → sube seleccion pero nada en ella
(vacia), clic en ranura dice "Nada que reemplazar" pero en realidad hay "aire" que reemplazar*»)*

Clic en una ranura (o su número) con la selección hecha **rellena la caja entera, aire incluido**; con
**Shift** sólo reemplaza los **sólidos**. Con la caja vacía lo primero no hacía nada… **según lo que
llevara la ranura**, y de ahí las otras dos frases del dueño («*si tiene 16x16x16 voxels funciona, pero si
tiene menos no*», «*si seleccionas un solido, y luego uno que no lo es, entonces sí deja … se puede hacer
con un paso extra, no deberia requerirse*»). Las tres son el mismo fallo visto por tres sitios, porque
`mcSelectFill` reparte por **dos caminos**:

| lo que hay en la ranura | quién lo atiende | por qué |
|---|---|---|
| **16³ macizo** | `mcSelectFillId` | es `blockLike`: va a `mc.hotbar` como un id más de la paleta, y esa función **ya** elige `mcSelForEachConAire` cuando no le piden sólo-sólidos ⇒ funcionaba |
| **menos de 16³** | `mcSelectFillPieza` | es una PIEZA: va a `mc.slotStruct`, y para resolver la clave a un id tiene que **escribir una primera celda** por el camino de plantar a mano (`mcPonEnRejilla`, el único que da de alta la clave en la paleta) |

Esa **celda semilla** se buscaba siempre con `mcSelForEach` —sólidos—, así que sin un solo sólido no había
por dónde empezar y salía por «Nada que reemplazar» teniendo aire de sobra que rellenar. El «paso extra»
del dueño era justo eso: rellenar antes con un sólido le dejaba la semilla. El arreglo es **una línea** —
la semilla sale del mismo reparto que va a hacer el reparto de después (`soloSolidos ? mcSelForEach :
mcSelForEachConAire`), porque sin Shift **todas** las celdas de la caja se van a tocar y cualquiera vale.

⛔ **Shift+ranura sigue sin rellenar**: «sólo sólidos» y no hay ninguno es que de verdad no hay nada que
reemplazar; rellenar ahí convertiría el gesto de REEMPLAZAR en uno de CREAR. Es la §4 del guardián.

Nació como snippet (`data/snippets/sel-rellena-vacia.json`, Ley de Oro), medido con
`tests/probe_sel_rellena_vacia.js` —§1 bloque suelto, §2 el fallo, §3 lo que ya iba, §4 Shift, §5 que el
iterador prestado se devuelva— y bajó al motor con `herramientas/parche_app_sel_rellena_vacia.py`. El
snippet sigue publicado y **se aparta solo** al ver `mcSelForEachConAire` dentro de `mcSelectFillPieza`.

### El clic CENTRAL cambia la CARA de trabajo (REQ-EXTRU4)

*(2026-08-28, dueño: «*si un bloque esta en el aire se le podrian poner patas seleccionando sus bloques,
clic central, y luego control+abajo*» · «*seguir empujando hacia adelante pero rellenando con los bloques
seleccionados (por ejemplo para construir puentes)*».)*

Seleccionar trabaja **siempre por una cara** de la caja: la de **arriba** con Ctrl, la que **da la cara**
al jugador con Shift. Por esa cara construye en un sentido de la rueda y come en el otro. El **clic
central** (con la herramienta puesta) cambia **cuál es esa cara**: pasa a la de **abajo** y a la del
**fondo**. El estado vive en `mc.selOpuesta` y **no se persiste**.

| | normal | `mc.selOpuesta` |
|---|---|---|
| **Ctrl** | ↑ construye ENCIMA · ↓ come por arriba | **↓ construye DEBAJO** (patas) · ↑ come por abajo |
| **Shift** | ↑ come por la cara (hueco) · ↓ construye hacia ti | **↑ construye ADELANTE** (puente) · ↓ come por el fondo |

⛔ **NO es «invertir la rueda».** Ése fue el primer intento y el dueño lo rechazó: «*no se cambia la
direccion de la rueda, se cambia como se comporta la herramienta*». Darle la vuelta al signo deja Shift↑
**trayendo** bloques hacia el jugador, que es justo lo contrario de lo que pidió (seguir empujando hacia
adelante, pero rellenando). El snippet `sel-rueda-invertida` que hacía eso está en la papelera.

Tres decisiones que no se ven en el código:

- **Las dos muescas que COMEN (Ctrl↑, Shift↓) no las pidió nadie**: son la inversa de las que sí pidió, y sin
  ellas se rompe dentro de este modo la regla del dueño de 2026-08-20 («*un wup seguido de un wdown
  debería dejar los bloques iguales que como estaban*»).
- **El bloque nuevo se replica del que hay EN ESA CARA** (`c.id`), no del de la mano: «*replicando los
  seleccionados*». Un muro de varios materiales se prolonga entero, cada columna con el suyo.
- **La caja se estira por esa misma cara** (crece al construir, encoge al comer, y con grosor 1 se
  desplaza entera), igual que el motor hace por la suya. Es lo que permite que las patas salgan de una
  tacada sin volver a marcar esquinas.

⚠️ **El clic central lo comparte con redstone** (`redstone/redstone-piezas.js`, conmuta palancas), que
escucha en `window` en **captura** y llega antes. Por eso esto sólo mira con `mc.tool==='select'`; aun
así, clic central apuntando a una palanca conmuta la palanca **también**.

Nació como snippet (`data/snippets/sel-cara-opuesta.json`, Ley de Oro), validado con
`tests/probe_sel_cara_opuesta.js`, y bajó al motor con `herramientas/parche_app_sel_cara_opuesta.py`
(`mcSelExtruirAbajo`, `mcSelExtruirFondo`, `mcSelConmutaCaraOpuesta`). El snippet sigue publicado y **se
aparta solo** al ver `mcSelExtruirAbajo` en `app.js`.

### La guía ✚/▬ dice qué va a pasar ANTES de girar la rueda (REQ-EXTRU5)

*(2026-08-27/28, dueño: «*funcionan correctos ambos el-guia-extrusion y paste-ancla aplicalos a app.js*»)*

Cuatro puertas (Ctrl/Shift × cara normal/opuesta) y una rueda que sube o baja: **la mitad de las veces no
sabes qué va a salir hasta que sale**. Mientras se mantiene **Ctrl o Shift** con la herramienta Seleccionar,
la guía pinta sobre la selección **lo que la próxima muesca va a hacer**: una **✚ verde** en cada celda que
va a NACER y un **▬ rojo** en cada una que va a MORIR. Se dibuja con
[`game.voxelesUI`](particulas-y-efectos.md) en tres grupos (`sel-guia-mas`, `sel-guia-menos`,
`sel-guia-mueve`), **no** con overlays: así el agua y el cristal la tapan en vez de quedar pintada encima.

- **Lee la MISMA tabla que la rueda**, no una copia: `mcSelGuiaGesto(modo)` resuelve la cara con
  `mc.selOpuesta` y `mcEjeMirada()` exactamente como el manejador. Si alguien cambia la tabla y no la guía,
  ésta miente — y mentir es peor que no estar.
- **La celda que va a nacer no existe todavía**, así que la ✚ se dibuja **centrada en el aire** de su celda
  (`MC_SELGUIA_DACENTRO`); el ▬ va **pegado a la piel** del bloque que se lleva (`MC_SELGUIA_DAPIEL`), que es
  donde el ojo lo busca.
- **Escala o no sirve**: por encima de `MC_SELGUIA_TOPE_GLIFO` (220 caras) cada celda pasa a **un punto**, y
  `MC_SELGUIA_TOPE_VOX` (4000) es el tope duro —a partir de ahí se dibuja **una de cada N**—. Una selección de
  un chunk entero pintada glifo a glifo sería un tirón de segundos por frame.
- **Un solo rayo por frame**: `mcSelGuiaFirma()` resume el estado (gesto + cajas + `mc.gridGen` + pieza en
  vuelo) y `mcSelGuiaRepinta()` sólo rehace la geometría si la firma cambia.

**Con UNA sola esquina marcada también** *(2026-08-28, dueño: «*cuando se hace una seleccion solamente con un
click ya se puede hacer shift o control rueda, sin esperar al segundo, pero eso no muestra los -+ y
deberia*»)*. La rueda ya confirmaba sola la caja a medio marcar; la guía no lo sabía y se quedaba muda justo
cuando más falta hace. `mcSelGuiaFantasma()` fabrica la **caja fantasma** que la rueda va a confirmar
—`mc.selA` contra la celda apuntada— y `mcSelGuiaCeldasFantasma()` la recorre como **una caja más**, con su
propio `ci` (`= mc.selCajas.length`), que es como REQ-SEL1 indexa las filas. ⚠️ La caja fantasma se invalida
por **sello de estado** (`mcSelGuiaSelloPre`: `pasteActive|tool|selA|selBox|nº cajas|gridGen`), no sólo por
frame: a 1,4 fps del navegador de pruebas pasan varias órdenes entre frame y frame y la caché serviría una
caja vieja. Tope aparte: `MC_SELGUIA_TOPE_PRE` (200 000 celdas), porque el fantasma se recorre entero.

Nació como snippets (`sel-guia-extrusion`, `sel-guia-preseleccion`) y bajó con
`herramientas/parche_app_sel_guia_extrusion.py` y `parche_app_sel_guia_preseleccion.py`. Guardián: el
**tramo I** de
`tests/test_extru1_seleccion.js` (promete las cimas, gira la rueda y exige **exactamente** esas celdas).

### Pegar hereda el agarre de lo copiado (`clipboard.ancla`)

El agarre elegido con Ctrl+apuntar (`mc.selPivote`, REQ-SEL1) decía por dónde giraba la selección, pero al
copiar se perdía: el pegado volvía a agarrar por su esquina y había que recolocar a ojo lo que ya estaba
colocado. Ahora `mcAnclaDeCopia()` lo traduce a coordenadas **relativas al recorte** al copiar/cortar y lo
guarda en `clipboard.ancla`; el fantasma de pegado y el pegado real agarran por ahí.

⚠️ Va **en coordenadas del recorte, no del mundo**: si cae fuera de sus dimensiones (`mcClipboardDims`) se
devuelve `null` y se agarra por la esquina, como antes. Y al extruir, `mcSelGuiaNormaliza()` lo **arrastra
con la caja** (`clipboard.ancla = a.slice()`) o el agarre se quedaría donde ya no hay nada.

### Alt+rueda ESCALA la pieza en vuelo (×2 / ÷2)

*(2026-08-28, dueño: «*si en el mapa hago control+c para copiarme unos bloques y luego hago control+v,
empieza el modo preview, me gustaria que alt+rueda sirva para escalar x2 (rueda arriba) y dividir (rueda
abajo) el objeto*» · «*si puede tener alguna previsualizacion cuando se pulse alt que indique que se va
modificar su tamaño como hacen shift y control al dejarse pulsados*»)*

Con la pieza **en vuelo** (Ctrl+V), **Alt + rueda** la escala: arriba **×2**, abajo **÷2**
(`mcPasteEscala`). Se escala **el portapapeles**, no el mundo: ×2 convierte cada celda en las 8 de su
cubo; ÷2 funde cada cubo de 8 en una, y se queda el material **más repetido** de las ocho — elegir «la
primera» sería más corto, pero haría que el resultado dependiera del orden en que se copió, que no es una
propiedad de la pieza. El **agarre** (`mc.pasteAnchor`, en ejes de pieza) se escala con ella o la pieza
saltaría de sitio justo al crecer, y `MC_PASTE_ESC_TOPE` (40 000 bloques) corta el ×2 antes de que una
pieza mediana se vaya a millones.

**La promesa de Alt** (`mcPasteEscGuia`) va con el mismo idioma que la guía ✚/▬ y con sus dos colores,
pero **en cajas**: Shift y Ctrl tocan una capa y prometen celda a celda; Alt cambia la pieza entera. En
**verde** la caja que dejaría la rueda arriba y en **rojo** la de la rueda abajo, calculadas rehaciendo la
cuenta de `mcPasteOrigen` con las dimensiones y el agarre ya escalados — ⛔ **una promesa no puede escalar
el portapapeles para preguntar**.

⚠️ **La caja del ÷2 cae DENTRO de la pieza, y la capa UI se dibuja CON el mundo** (BUG-VOXUI1: el
translúcido no escribe z) ⇒ enterrada ahí no se ve **ni una arista** — la primera versión plantaba los
voxeles y la sonda medía **cero** pixeles rojos en la foto. Sacarla «un pelo» tampoco vale: no está un
pelo dentro, sino media pieza. Se pinta donde sí hay superficie que mirar: su **sombra ortogonal
estampada en las seis caras** de la pieza, mordiendo la piel como los ▬. Por eso el guardián cuenta
**pixeles** (`readPixels`, como `test_luz_global.js`) y no voxeles puestos.

En el motor el gesto es **uno más de la rueda del canvas** (`esc`, junto a `pega`/`extru`/`extruF`): entra
en el mismo acumulador `mc._ruedaAcum` con el mismo `mc.ruedaUmbral`, y **manda sobre la rosca de
herramientas** —Alt+rueda giraba la herramienta en mano (REQ-TOOL6)— sin pelearse con ella. Alt se anota
en los **mismos** oyentes de teclado que `mc.selGuiaModo` (`mc._escAlt`), que ya resuelven el caso feo de
perder el foco con la tecla pulsada.

Nació como snippet (`data/snippets/pegar-escala.json`, Ley de Oro), medido con
`tests/probe_pegar_escala.js` (ida y vuelta ×2→÷2 devuelve **la misma pieza**, el agarre viaja, la rosca
no se lo lleva y la guía **se ve**), y bajó al motor con `herramientas/parche_app_pegar_escala.py`. El
snippet sigue publicado y **se aparta solo** al ver `mcPasteEscala` en `app.js` — si no, habría **dos**
oyentes de `wheel` contando el mismo gesto.

### El fantasma de estructura SE PIDE, NO SE IMPONE (`mc.previewMudo`)

*(2026-08-28, dueño: «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura no
quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura saldran los
previews, pero si solamente cambio esa tool no tiene que salir*» · «*desde cualquier herramienta a pico me
refiero*», pico = construir)*

**Cambiar de herramienta y elegir qué colocar son DOS decisiones**, y el motor las trataba como una: la
ranura activa se queda como estaba al irse a Seleccionar, así que al volver al pico aparecía media habitación
translúcida delante de la cara sin que nadie la hubiese pedido. El pestillo `mc.previewMudo` las separa:

| gesto | qué hace |
|---|---|
| cambiar de herramienta (`mcSetPlayerTool`) | **echa** el pestillo y tira al momento la malla que hubiera |
| pulsar una ranura (`mcSelectSlot`) | lo **quita** — la que sea, **incluso la misma** |
| reafirmar la herramienta que ya hay | **nada**: sólo cuenta si `mc.tool` cambia de verdad |

- **Callan LAS DOS PIEZAS o ninguna**: la **malla** translúcida (`mc.preview`, la construye `mcUpdatePreview`)
  y la **caja de huella** verde (`structLines`, la dibuja `mcDrawOverlays`). La huella **no depende de la
  malla** —se calcula desde `mc.slotStruct[mc.sel]` y el rayo—, así que callar sólo una deja el contorno
  flotando: no arregla nada.
- **`mcSelectSlot` es la puerta ÚNICA** por la que pasa «he pulsado una ranura», venga de la tecla 1-9, del
  clic en la hotbar o del selector de bloques (`mcAssignSlot`). Por eso el pestillo se levanta ahí y no en un
  `mc.sel` que cambie solo; y pulsar la MISMA ranura cuenta, porque el jugador está diciendo «ésta, la de
  ahora».
- ⚠️ **Sólo si la herramienta CAMBIA**: `mcSetPlayerTool` se llama también para reafirmar la que ya hay (la
  rueda de herramientas, la consola, un snippet). Callar el fantasma que el jugador acaba de pedir, porque
  algo reafirmó la herramienta que ya tenía, sería el mismo fallo al revés.
- ⛔ **No se tocan** el fantasma de **bloque suelto** (`game.ghostAlpha`) ni el de las **notas**: son otra cosa
  y el gesto de colocar nota ya es explícito (por eso `mcPreviewCallada()` mira `!mc.notePlacing`).
- El pestillo **no pisa `game.structGhostAlpha`**: el ajuste del dueño se lee tal cual, el pestillo es una
  condición aparte en las dos puertas.

Nació como snippet (`data/snippets/preview-tras-ranura.json`, Ley de Oro), validado con
`tests/probe_preview_ranura.js`, y bajó con `herramientas/parche_app_preview_tras_ranura.py`
(`mcPreviewCallada` / `mcPreviewCalla` / `mcPreviewHabla`). El snippet **se aparta solo** al ver
`mcPreviewCallada` en `app.js`. Guardián: `tests/test_preview_ranura.js`.

## La selección son N cajas, y giran las 24 posturas (REQ-SEL1)

*(2026-08-20, dueño: «*si teniendo ya una seleccion hago shift y click sea para añadir nuevas selecciones
a la seleccion actual […] y operar con esa herramienta con todas a la vez; cortarlas, pegarlas,
guardarlas, extruirlas, etc*»)*

**`mc.selCajas`** es la selección: un array de `{a:[x,y,z], b:[x,y,z]}`, cajas inclusivas de mundo.
**`mc.selBox` ya no es un campo, es un accesor**: leerlo da la **última** caja, asignarlo **sustituye** la
selección entera y ponerlo a `null` **la limpia**. Se hizo así a propósito, porque hay veinte sitios del
motor que llevan desde el principio tratando la selección como una sola caja y no había por qué tocarlos.

Añadir sin borrar tiene **una sola puerta**: `mc.selCajas.push(...)` en `mcSelectClick`, cuando la esquina
**A** se marcó con **Shift**. El Shift se mira en la A y se recuerda en `mc.selSuma` hasta la B — si se
mirase en la B, soltar Shift a mitad de gesto se cargaría las cajas anteriores sin que nadie lo pidiera.

Y **`mcSelForEach(fn)` es LA puerta** de todo lo demás: recorre las N cajas, pasa `fn(x,y,z,id,ci)` (`ci`
= qué caja) y **no repite las celdas del solape**. De ahí salen gratis contar, copiar, cortar, guardar el
recorte y extruir; la multiselección no costó una rama en cada operación, costó esa función.

**Girar (`R` / `⇧R` / `⌥R`)**: cada caja gira **sobre su base, en orden y sin saber de las demás** («*si
cada una se hace desde su base se pueden abrir las ventanas*», dueño con la foto 64). Los tres ejes salen
de **`MC_ORI`**, la tabla de las 24 posturas del motor (`MC_SEL_GIRO` guarda el código de un cuarto de
vuelta en cada eje y `mcOriMove`/`mcOriDims` hacen el trabajo): ⛔ nada de rotar «a mano» en el plano, que
es lo que hacía la v1 y por eso solo giraba en planta. Encadenando los tres ejes salen las 24.

**El agarre (`mc.selPivote`)**: **Ctrl + apuntar** un bloque de la selección marca la celda sobre la que
**pivota** el giro; se pinta en **magenta** y se suelta con un Ctrl apuntando fuera. Es el mismo gesto que
ya tenían la herramienta volumen y el pegado continuo, no uno nuevo que aprenderse. Sin agarre, la caja
gira anclada en su **esquina mínima**, exactamente como antes. Con él, se mira dónde caería esa celda tras
el giro y se corre la huella entera lo justo para devolverla a su sitio: como es una rotación rígida
alrededor de un punto fijo, **cuatro vueltas devuelven caja y pieza al sitio**. El agarre es **de una
caja**: si cae fuera de una, esa gira como siempre.

> Ctrl es aquí tecla **muy** ocupada (extruye con la rueda, y lleva Ctrl+C/X/V/S), así que el agarre solo
> se fija si al soltar el Ctrl **no se usó ninguno de esos atajos**: quien atienda el atajo marca
> `mc.selCtrlUsado` y el gesto del agarre queda en «Ctrl a secas + ratón». Sin foco (`blur`) no llega el
> `keyup`, así que ahí se cancela.

Guardián: `tests/test_sel1_multiseleccion.js` (tramos A→H).

## La ranura 11: recortes guardados (REQ-RANURA1)

*(2026-08-20, nota del dueño en `/map/bugfinder`, 46,14,65: «*La herramienta de seleccionar deberia
poder guardar los bloques seleccionados, de forma que desde una ranura se puedan volver a cargar. Usar
la ranura 11 para ello, tecla "K" por ejemplo; alt+k o pulsar ranura "K" mostraria bloques guardados y
seleccionables para usar.*»)*

**Un recorte NO es el portapapeles.** El portapapeles (`clipboard`, Ctrl+C/Ctrl+V) es **uno solo** y lo
pisa el siguiente copiado. Un recorte es una copia **guardada con nombre**, y hay **varias** a la vez:
por eso el ticket pedía una galería para elegir cuál va a la ranura.

Pero **el formato es el mismo** (`{cells:[{dx,dy,dz,c}], gx, gy}`), y ahí está toda la gracia del
diseño: **armar un recorte = ponerlo en `clipboard` y llamar a `mcPasteWorld()`**. De eso salen gratis,
sin una línea nueva, las **24 posturas** (`R` cara / `Shift+R` giro), el **plantado con el derecho** que
no se desarma, el material con **1-9** (`mcPasteMaterial`) y el agarre con Ctrl. Si un día armar dejara
de pasar por el pegado, el tramo D de `tests/test_ranura1_recortes.js` es el que avisa.

Gestos:

| gesto | qué hace |
|---|---|
| `K` con la herramienta Seleccionar y caja marcada | guarda el recorte (y lo pone en la ranura) |
| `K` sin caja | pone en la mano el recorte de la ranura (modo pegar) |
| `Alt+K`, clic derecho en la ranura, o clic con la ranura vacía | abre la galería |
| en la galería: clic / doble clic / clic derecho | poner en la mano / renombrar / borrar |

**Dónde viven — decisión escrita en el ticket y REVOCABLE:** en `localStorage` (`vf_mcRecortes`), o sea
**del usuario y no del mundo**. Un recorte es material de taller —se copia de un mapa para plantarlo en
otro—, y los ficheros de `data/` son autoría del dueño. Si él los prefiere del mundo, se mudan a la
cabecera sin tocar nada más: el formato ya es serializable. Al guardar, las claves de material van a una
**paleta** y las celdas a un array plano de números (`{p:[…], c:[dx,dy,dz,i, …]}`): un recorte de 5 000
bloques repetiría 5 000 veces la misma cadena `tex:hab:roca`. Topes: `MC_RECORTES_MAX` = 12 recortes
(el decimotercero empuja al más viejo) y `MC_RECORTE_CELDAS` = 40 000 bloques por recorte.

Dos detalles que parecen de adorno y no lo son:

- **Guardar se apoya en `mcCopySelection`**, no recorre la caja por su cuenta. Dos recorridos distintos
  de la misma selección serían dos ideas de qué entra en ella, y una de las dos se quedaría atrás al
  primer cambio. Efecto lateral querido: guardar un recorte **también** lo deja en el portapapeles.
- **Al armar, las celdas se COPIAN.** Pegando, `1-9` repinta el cúmulo escribiendo en `cel.c`; con la
  referencia compartida eso le llegaría al recorte guardado y lo estropearía para siempre.

La miniatura (`mcDibujaRecorte`) es la silueta de frente con el color representativo de cada material
(`texRepr`), pintada de atrás hacia delante y oscureciendo con la profundidad. No se malla nada ni se
pide un dibujo por red: un recorte no es una pieza del catálogo, es una caja de bloques del mundo.
