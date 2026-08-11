# Luz: skylight incremental, emisores y sombras

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

### 💡 Poner un bloque no puede costar el mundo entero (skylight incremental)

Hasta aquí, **cada bloque puesto o roto recalculaba la luz del mundo entero**: `mcRemeshAround` llamaba
a `mcComputeLight()`, que barre las `NX·NY·NZ` celdas. Medido con SwiftShader, una sola edición:

| mundo | celdas | skylight global | edición entera (hoy) |
|---|---|---|---|
| 96×40×96 | 368 640 | 42 ms | **7,2 ms** |
| 256×40×256 | 2 621 440 | 199 ms | **6,0 ms** |
| 512×40×512 | 10 485 760 | **680 ms** | **8,5 ms** |

O sea que el coste **crecía con el volumen del mundo aunque el bloque tocado fuera uno**, y en un mundo
grande se comía 40 frames de golpe. Ahora `mcRelightBox(x,z)` recalcula solo **una caja**: `±17` en X/Z y
la **columna entera** en Y. Esa forma no es arbitraria — la luz pierde 1 nivel por paso, así que una
edición no llega a más de `MC_MAXLIGHT`=15 pasos por aire, **salvo hacia abajo**, donde abrir o tapar una
columna le cambia el cielo de arriba abajo de una vez.

**Es exacto, no una aproximación.** Las celdas de fuera de la caja no han podido cambiar, así que valen
de condición de contorno: se siembran hacia dentro con su nivel actual −1. Cualquier camino de luz que
salga y vuelva pasa por el borde, y el borde ya trae su mejor valor. Eso no se cree, **se comprueba**:
`node test_luz_incremental_navegador.js` compara `mc.light` **celda a celda** contra `mcComputeLight()`
tras 120 ediciones al azar más los casos que duelen (abrir el techo de una cueva y taparlo, las caras del
mundo, la frontera de un chunk, el fondo).

Dos cosas más que iban en el mismo frame:

- **Se re-malla lo que cambió, no un 3×3 fijo.** `mcRelightBox` devuelve el AABB de las celdas que
  *realmente* cambiaron de luz; normalmente es **1 chunk en vez de 9**. El `±1` en bloques que se le une
  es la **geometría**: si la celda tocada está en el borde del chunk, la cara que se ve es la del vecino.
  ⚠️ Si esa caja se quedara corta el síntoma no sería un error sino **sombras viejas pegadas** en
  pantalla, así que tiene aserción propia.
- **`mcComputeBlockLight` ya no pone a cero lo que ya estaba a cero.** Sin emisivos hacía un `fill(0)` de
  N bytes por edición (3 ms en 512²) para no cambiar ni un byte; lo corta la bandera `mc._blCero`, que
  vive junto al único sitio que escribe `BL`.

#### …y una ráfaga de script tampoco (`mcBuildBox`)

Lo de arriba arregla **el clic**, que va por `mcRemeshAround`. Una **ráfaga de `setVoxel`** iba por otro
camino —`mcFlushBuild`— y ese seguía llamando a **`mcMeshAll()`**, o sea el mundo entero: skylight global
más los 1024 chunks. Con `beginBatch`/`endBatch` eso es **un `mcMeshAll` por lote**, y un snippet que
anima algo hace un lote **por fotograma**. El dueño lo reportó con el suyo de TNT: «en mundos grandes va
suuuper lento, llegando a tardar unos 40 seg», y su propia teoría era la correcta — «se actualiza el mapa
cada vez que se borran voxels… los fps caen a 0».

La ráfaga apunta su **caja en planta** (`mcBuildBox`, poblada por `mcMarcaBuild` en los dos únicos sitios
que escriben contando: `mcSetVoxel` y el volcado de `mcApuntaPendiente`) y el flush re-malla **solo eso**.
Las tres funciones de la edición de un bloque aceptan ahora una **segunda esquina** opcional —
`mcRelightBox(x,z,x1,z1)`, `mcRemeshAround(x,z,x1,z1)`, `mcRebakeStructsNear(x,z,x1,z1)` —; sin ella se
comportan **exactamente** como antes, que es lo que mantiene intacto el camino del clic.

- **Sigue habiendo vuelta a `mcMeshAll`**, y no es cosmética: `mcCajaCompensa` compara la caja **más el
  halo de ±`MC_RELIGHT_R`** que necesita el skylight contra media planta del mundo. Un script que reescribe
  el mundo entero de un lote no puede pagar el halo dos veces.
- **El razonamiento de exactitud no cambia** al pasar de celda a caja: lo que vale es que el halo quede
  dentro, no que la edición sea un solo bloque. Lo comprueba celda a celda el mismo
  `test_luz_incremental_navegador.js`.
- **`mcPonEnRejilla` limpia `mcBuildBox`** al quedarse él con el volcado; y en la otra rama (había
  escrituras de script a medio volcar) su `mcSetVoxel` ya metió la celda en la caja, así que el flush
  ajeno la incluye. Antes eso lo garantizaba el `mcMeshAll`.
- **Lo que el camino de la caja NO hace**, igual que ya pasaba con el clic: re-mallar los cuerpos de
  agente por si creció el atlas, y refrescar `mc.blockLightMeshed`. No hace falta porque la paleta **no
  puede crecer dentro de un lote** (`mcResolveMat` manda a roca lo desconocido); lo que sí la hace crecer
  —una textura que llega tarde por `mcApuntaPendiente`— pasa por `game.addMaterial`, que ya re-malla entero
  **antes** de escribir sus celdas.

Medido en 512×40×512 (SwiftShader, ~10× una GPU), con el snippet `explosion-tnt` del dueño: la segunda
explosión pasa de **36 209 ms y 9 `mcMeshAll`** a **5 689 ms y 0**. Repartido: de los 35 789 ms que se
iban en mallado quedan **304 ms** en los 9 flushes (74 ms de skylight, 42 de luz de bloque, 185 en **4
chunks por flush** en vez de 1024). Lo que queda es tiempo de **fotograma**, no de edición: en reposo ese
mundo ya cuesta 196 ms/frame con SwiftShader.

**El tope de `game.resizeWorld` sigue en 512×256×512, y es de memoria, no de capricho.** Las cuatro
rejillas densas son `grid` Uint16 + `light` Uint8 + `blockLight` Uint8 + `blockLightDir` Int8×3 = **7
bytes por celda**: 512×40×512 son 73 MB, pero un `1000×40×1000` serían **280 MB** solo en arrays, antes
de las mallas de 3 844 chunks. Subir el tope es una decisión de presupuesto de memoria, aparte de esta.

### Una antorcha alumbra esté donde esté (emisores en la rejilla)

`mcComputeBlockLight` nació cuando una pieza luminosa **solo podía existir estampada suelta**, así que
sembraba la luz recorriendo `mc.structures` y leyendo sus `emitCells`. Desde que el clic derecho mete
en `mc.grid` todo lo que cabe en su celda, una antorcha puesta ahí **se veía encendida pero no
alumbraba nada**: no estaba en esa lista, así que no existía como foco. Es el mismo patrón que el giro
en la clave — la pieza no cambió, cambió por dónde entra.

La geometría fina de la rejilla **ya trae** `emitCells`/`emitDir` horneados (los mismos que consume la
siembra), así que la corrección es dónde mirar, no cómo alumbrar: `siembra(cx,cy,cz,ed,k)` es una sola
función con **dos fuentes**, las estructuras y la rejilla. Una antorcha en cualquiera de las dos vías da
el **mismo perfil de luz**, y eso es lo que fija `node test_luz_en_rejilla.js`.

⚠️ **Encontrarlas es el problema, no sembrarlas.** Barrer `mc.grid` entera en cada edición cuesta ~60 ms
en 512×40×512 (medido), y la luz se recalcula en **cada bloque puesto o roto**. Por eso hay un índice
disperso, `mc._glowCeldas` (Set de índices de celda), con dos reglas:

- Se **rehace de cero** solo cuando cambia *qué materiales emiten* (`mc._glowFirma`: paleta nueva o
  geometría fina recién horneada) o cuando cambia la rejilla entera (`mc._glowRef`: cargar o
  redimensionar). Ése es el único barrido O(celdas) que existe.
- Se **corrige celda a celda** en `mcGlowTocada(x,y,z)`, que se llama **después** de escribir en
  `mc.grid`. `mcDirty` no vale de embudo: se corta sola cuando el guardado ya está marcado entero.

Dos consecuencias que no se ven en el diff: `mcRecomputeHasGlow` mira también la rejilla (si no, quitar
una estructura apagaría una antorcha que sigue puesta), y `mcAgentSetBlock` ya no puede saltarse el BFS
en un sólido→sólido si la celda **gana o pierde** un emisor (pintar una antorcha encima de piedra).
`mc.hasGlow` solo se **enciende** aquí, nunca se apaga: con `BL` a cero se ve igual (`lv=max(L,BL)`) y
apagarla pisaría el mallado a medio poblar.

### Si se ve a través, la luz pasa (`mc.recorte` por defecto · `luz:'pasa'`/`'tapa'` a mano)

`leaves` estampada como **bloque** se ve negra por dentro; la **misma** pieza estampada como
estructura fina se ve iluminada. No es el mapa de sombras del sol, es el **skylight**: el bloque ocupa
la celda 16³ y corta la difusión (dentro `mc.light=0` ⇒ factor `interiorDark^1` = ×0,1), mientras que
la estructura fina deja la celda como **aire** y la luz la cruza (`mc.light=15` ⇒ ×1). Por eso el
mismo dibujo se veía de dos maneras según cómo se hubiera puesto.

**Va POR DEFECTO y no hay que declarar nada**: el criterio es `mc.recorte` — si la textura del bloque
tiene **agujeros**, la luz pasa. Es el mismo sí/no que ya usa el shader para hacer `discard` y el
mesher para dejar de pelar caras contra él, o sea: **«si se ve a través, se ve a través»**. Roca,
tierra y hierba son macizas y siguen tapando, así que **las cuevas siguen a oscuras**.

⚠️ **Lo mide la PROYECCIÓN a las 6 caras del cubo (`buildTexFaces`), no el número de voxels.** Una
pieza dispersa cuya cáscara tapa las seis caras **no** es de recorte y **no** es permeable por
defecto. Se ve en los dos assets gemelos: `leaves.vox.json` (con máscara de `caras`) es de recorte;
`demo-hojas-sin-caras.vox.json`, mismos 1548 voxels **sin** máscara, no lo es.

⚠️ **Y `mc.recorte` tiene una SEGUNDA fuente desde BUG-STR1: toda celda que se dibuje con geometría
fina** (`mc.finoRejilla`), aunque su textura no tenga un solo agujero. Ahí el atlas ni se mira, así que
«¿tiene agujeros la textura?» no es la pregunta buena; la buena sigue siendo «¿se ve a través?», y la
respuesta es que sí. Sin esto un techo de `hab:cubo-trans` dejaría a oscuras lo de debajo, que es
**menos** de lo que hacía estampado suelto (una estructura no está en `mc.grid` y la luz le pasaba
entera). `mc.atlasHasAlpha` **no** se toca por este camino: eso enciende el `discard` para todo el
terreno y cuesta el early-z. Ojo con lo que esto **no** hace: la siembra de cielo de `mcComputeLight`
corta en el primer bloque que no es aire, diga lo que diga la tabla, así que un dosel sigue dando
sombra — la tabla gobierna la **difusión**, no abre la columna.

Para la excepción está `game.bloques`, con `mc.traspasaLuz` como gancho — `Uint8Array` por id,
**1 = pasa, 2 = tapa, 0 = lo que diga el defecto** (o `null` = nadie ha dicho nada, lo normal):

```js
game.bloques.define('hab:vidriera', { luz:'tapa' });   // es de recorte pero SÍ debe dar sombra
game.bloques.define('hab:reja',     { luz:'pasa' });   // es maciza pero debe dejar pasar la luz
game.bloques.quitar('hab:vidriera');                    // vuelve al defecto
```

El `'tapa'` no es adorno: desde que el defecto está encendido, sin él **no habría forma** de decir que
una vidriera de recorte tiene que sombrear.

Las dos fuentes se combinan en **`mcTablaLuz()`** (primero `mc.recorte`, encima `mc.traspasaLuz`), que
se lee en **dos sitios y solo dos**: `mcComputeLight` (barrido global) y `mcRelightBox` (incremental).
Añade el aire (id 0) pase lo que pase y tolera que la paleta haya crecido después. Se construye **una
por llamada** a propósito: `mc.recorte` lo rehornea `mcBuildPalette` y `mc.traspasaLuz` lo escribe el
snippet, así que una tabla cacheada se quedaría vieja sin que nadie la invalidara. Que el defecto no se
quede viejo lo garantiza `mcAddBlock` → `mcMeshAll` → `mcComputeLight`.

⚠️ **Los dos tienen que usar los MISMOS predicados, sin excepciones.** En cuanto difieran en un solo
`if`, el mundo editado deja de coincidir con el recién cargado — que es exactamente lo que compara
celda a celda `test_luz_incremental_navegador.js`.

⚠️ **`luz:'pasa'` NO abre la columna de cielo, y ésa es justo la línea que separa las dos preguntas.**
`mcTablaLuz()` gobierna la **DIFUSIÓN** (por dónde se propaga la luz una vez sembrada) y
**`mcTablaCielo()` la SIEMBRA** (hasta dónde baja el cielo por la vertical). Los dos bucles de siembra
vertical —`mcComputeLight` y `mcRelightBox`— preguntan por la segunda (`if(!CIELO[g[i]]) break;`), así
que un dosel de hojas **sigue dando sombra** a lo que tiene debajo (medido: bajo el dosel 11, al aire
libre 15). Es una decisión, no un olvido: si `luz:'pasa'` abriera la columna, un bosque dejaría de dar
sombra.

La **única** excepción es **`proyectaSombra:false`** (bit 2 de `mc.sinSombra`, ver REQ-SHADOW2 más
abajo): ahí el material dice literalmente «yo no proyecto sombra», así que el cielo le atraviesa la
columna entera. Con `mc.sinSombra` en `null` —lo normal— `mcTablaCielo()` es la de siempre: solo el
aire. Fue **BUG-SH2**, y es la mitad que le faltaba a REQ-SHADOW2.

**No cuesta nada.** Medido en los dos mundos reales (96×40×96), el barrido de skylight va de 23,6 a
23,6 ms en `/map/test` y de 20,5 a 16,5 ms en `/map/agents`. Y la fuga está acotada: encender el
defecto solo sube la luz de **98 celdas de aire de 230 821**, porque el único material de recorte que
hay en los dos mapas es `leaves`.

Cambiar la lista de excepciones obliga a recalcular la luz y **re-hornearla en las mallas**
(`mcMeshAll` + `mcRestampAll`), que es lo más caro del snippet. Por eso solo se dispara cuando cambia
de verdad la **lista de ids** (`luzFirma`, con el `id:valor` para distinguir `pasa` de `tapa`), no el
array: `reconstruirCache()` también salta cuando la paleta crece por `game.addMaterial`, y comparar
arrays de distinto largo remallaría el mundo entero por un material que no tiene nada que ver.

Test: `node test_luz_traspasa.js` (24 ok) — el interior de una masa de hojas pasa de 0 a 12 y
**ninguna** celda de aire pierde luz; el dosel sigue sombreando; el incremental coincide con el global;
un material de recorte se ilumina **sin declarar nada** y `luz:'tapa'` lo devuelve a 0; y, metiendo la
cámara en un hueco rodeado de hojas (la foto del dueño), el brillo de pantalla va de **2,4 a 16,9**.

⚠️ Para VER la diferencia hay que estar en un **hueco de aire** rodeado del material, no en el macizo:
las caras interiores de una masa maciza no se mallan (el greedy solo emite la que da a aire), así que
desde dentro del macizo no se ve la masa sino el mundo de fuera, y la medida sale idéntica. Es el
error que dio 46,4 → 46,4 en la primera versión del test.

## ☁️ Materiales que no reciben ni proyectan sombra (REQ-SHADOW2)

Petición del dueño: **«que no tengan "receive shadows" ni "cast shadows" para poder hacer unas nubes
semirealistas, configurable a nivel de autorun por si quiero elegir otro material»**. Como con
`atravesable` y `luz`, **`app.js` expone la capacidad y el snippet decide a qué material se le
aplica**: en el motor no hay ni un material cableado.

```js
game.bloques.define('hab:white-wool', { recibeSombra:false, proyectaSombra:false });
game.bloques.quitar('hab:white-wool');   // vuelve al defecto
```

⚠️ **Aquí hay DOS sombras distintas, y esto es lo que gobierna todo lo demás.** Una es el
**skylight**, oclusión ambiental horneada en el sombreado de cada vértice al mallar
(`mcComputeLight` / `mc.light`), que es la que oscurece lo que está bajo un techo. La otra es la
**sombra proyectada del sol**, un mapa de sombra en GPU (`mcRenderShadow`, FBO, 16 muestras
`NEAREST`), que es la que dibuja la silueta en el suelo. Son caminos separados: uno vive en la malla
y el otro en el fragment shader.

De ahí salen los dos casos, y **por qué una sola bandera no basta** para el caso de la nube:

- **`recibeSombra:false`** = nada lo oscurece: se salta el `lightLut` al mallar **y** el término del
  sol al pintar. Una nube así se ve igual de blanca esté donde esté.
- **`proyectaSombra:false`** = su geometría no entra en el mapa del sol **y el cielo le atraviesa la
  columna**. Lo segundo hizo falta aparte (**BUG-SH2**): sacar la nube del mapa del sol no quitaba el
  pegote oscuro de debajo, porque ése no era la sombra proyectada sino el **skylight**, y los dos
  bucles de siembra cortaban la columna en todo lo que no fuera aire. Hoy lo abre el motor vía
  `mcTablaCielo()` (ver «Si se ve a través, la luz pasa»), no el snippet arrastrando `luz:'pasa'`.
  ⚠️ Y sigue siendo **lo único** que abre la columna: `luz:'pasa'` gobierna la difusión y un dosel de
  hojas tiene que seguir sombreando.

### El contrato: las banderas viajan sumadas al sombreado

No hay atributo nuevo en ningún vértice. Las dos banderas se **suman al `aShade`** que ya viaja en
todos los formatos, `aShade = sombreado + 2·bits`, con **1 = no recibe** y **2 = no proyecta**:

```glsl
// MC_SHADE_LIB, compartida por los seis programas
float mcShade(float s)     { return s - 2.0*floor(s*0.5); }        // el sombreado de verdad
float mcRecibeSol(float s) { return step(mod(floor(s*0.5),2.0), 0.5); }  // 1 = sí, 0 = no
```

Es seguro porque **`MC_FACES` va de 0,40 a 1,12 y nunca llega a 2**, así que la parte entera par
queda libre. Los vertex shaders decodifican y sacan un `varying float vSol`; los cuatro fragment
shaders envuelven el término del sol **sin `if`** (`col = t.rgb*vShade*mix(1.0, sunFactor(vWorld),
vSol)`), porque `sunFactor` usa derivadas y meterlas en control de flujo divergente es ilegal. En el
paso del sol (`MC_SUN_VS`) el bit 2 (⇒ `aShade>=4.0`) manda el vértice fuera del volumen de recorte,
que sale más barato que filtrar por CPU.

### Dos tablas, porque un material vive en uno de dos sitios

| tabla | indexada por | cubre |
|---|---|---|
| `mc.sinSombra` | **id de bloque** (`Uint8Array`, o `null`) | terreno de `mc.grid` |
| `mc.sinSombraKey` | **clave** (objeto, o `null`) | estructuras finas de `mc.structures` |

Las escribe el snippet y `app.js` **solo las consulta**, igual que `mc.atraviesa` y `mc.traspasaLuz`;
con las dos en `null` el coste es cero. Una instancia fina es de **un** material, así que sus
banderas se miran **una vez** en `mcBuildStructMesh` y no por cara, y la de «no proyecta» se guarda
como `st.sinProyectar` para saltarse la instancia **entera** en el paso del sol.

⚠️ **Cambiar las banderas invalida las mallas cacheadas aunque no se mueva un solo voxel**, porque se
hornean en el sombreado. Por eso la tabla entra en la **firma del chunk** (recorrer la paleta, unos
cientos, al lado del barrido del chunk, miles, no se nota) y el snippet llama a `mcMeshAll()` +
`mcRestampAll()` + **`mcShadowDirty()`** cuando la lista cambia — el mapa del sol se refresca solo
cuando cambia la *geometría*, y aquí la geometría es idéntica.

Test: `node test_sin_sombra.js`. Comprueba las tres capas por separado y no de oídas: lee el VBO real
con `getBufferSubData` (el sombreado máximo va de 1,120 a 5,120 con el bit 2 y a 7,120 con los dos),
lee el FBO del mapa del sol con `readPixels` para ver que la pieza marcada deja de escribir altura, y
mide brillo de pantalla. ⚠️ Al elegir un id de prueba hay que **filtrarlo por `mcTablaFina()`**: si
sale una pieza fina, su sombreado no está en `ch.vbo` y el test mide el búfer equivocado.
