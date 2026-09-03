# Luz: skylight incremental, emisores y sombras

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

> ## 🔒 CANDADO — léete la Ley antes de tocar nada
>
> ⛔ **No se toca la iluminación del motor sin haber entendido antes la
> [Ley de la Luz](../wiki/paginas/ley-de-la-luz.md)** (orden del dueño, 2026-08-20). Se lee **entera**
> —10 mandamientos, 8 leyes y el Sótano— y se **cita el artículo** que se está aplicando.
>
> Dueño: «*la iluminación debe ser real y consistente para todo el motor; no puede haber apaños o
> trucos para quedar bien*». Corolario, y es la forma de leerlo: **si algo de la luz se ve mal, no es
> «un bug raro» — es que algo infringe un artículo**, y la Ley dice cuál.
>
> Este fichero es el **cómo está construido**; la Ley es el **qué debe cumplirse**. Cuando los dos no
> coincidan, manda la Ley y este fichero está desfasado.

⚡ **`mcComputeLight` está MEMORIZADA al entrar a un mapa** (snippet `perf-mallado`, 2026-08-31): es
una función pura y se la llamaba 5 veces con las mismas entradas, ~1 s cada una. Memoriza **la firma
de las entradas**, no el resultado, así que un cambio de rejilla la invalida sola. Si tocas lo que
entra en la luz —rejilla, `mcTablaLuz`, `mcTablaCielo`, `dim`, `interiorDark`— **mira que entre en la
firma** o servirá luz vieja. Reversible: `game.perfMallado.off()`. Detalle y medidas →
[`rendimiento-de-entrada.md`](rendimiento-de-entrada.md). Guardián `tests/test_perf_mallado.js`.

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

---

## Mandos de la sombra proyectada — `game.shadowSuave` y `game.sunShadeNoche` (REQ-SHADOW3)

Ojo a la confusión de siempre: esto es la **sombra proyectada del sol** (mapa de sombra en la GPU), no
la skylight horneada en el vértice (ésa es `game.interiorDark`).

**`game.shadowSuave`** — radio del filtrado PCF, **en téxeles** del mapa de sombra. `0` = **borde
duro**, `1` = el difuminado de siempre, hasta `MC_SHADOW_SUAVE_MAX` = 4. Sale gratis: el filtro de 9
muestras ya estaba y **sus pesos suman 1**, así que con radio 0 las nueve caen en el mismo téxel y el
resultado *es* la sombra dura. Ni una rama nueva por fragmento.

```glsl
vec2 texel = uSunSuave / vec2(uSunDim.x * 16.0, uSunDim.z * 16.0);
```

Por encima de 4 el filtro deja de difuminar y empieza a hacer **ruido** (los taps caen en sombras
distintas y la silueta se rompe en manchas). Si hiciera falta más suave, la respuesta no es subir el
tope sino **tomar más muestras**.

**`game.sunShadeNoche`** — cuánto apaga la sombra con la exposición (`game.luz`) a 0; se interpola con
ella, así que `game.sunShade` sigue mandando de día. **`null` = sin mando puesto**, la misma fuerza a
todas horas (comportamiento de siempre).

Por qué hacía falta: la sombra es un **factor** que multiplica el color, y de noche ese color ya viene
multiplicado por la exposición. Un 0,55 sobre algo casi negro no se distingue de nada — de ahí «*de
noche la sombra sale muy difuminada y casi no se ve*». No era un problema de difuminado: era de
contraste. Se resuelve en la CPU (`mcSunShadeEf`), que es un número por frame y no por fragmento.

⚠️ El «apagado» del mapa de sombra mira el valor **efectivo**: con `sunShade = 1` (sin sombra de día) y
`sunShadeNoche` puesto, preguntar por `mc.sunShade` a secas dejaría el mapa sin reservar y la sombra de
noche no llegaría a existir.

**¿La espada de luz proyecta sombra?** No. El mapa de sombra tiene **una sola fuente, el sol**, y las
luces dinámicas no entran en él; otra fuente sería otro mapa, otra pasada de geometría y otro coste. Lo
que se veía «poco definido» era el degradado de su propia caída. Lo que sí da desde BUG-GLOW6 un corte
limpio es la oclusión: una cara **de espaldas** a la espada deja de recibirla (sección de abajo).

Guardián: `node tests/test_shadow3_mandos.js`.

---

## Dos bakes en el motor, y cuál manda — `game.luzLey` (2026-08-25)

La caja de luz de lo que se MUEVE (la herramienta en la mano, un agente, una partícula) tiene **dos** implementaciones
vivas en `app.js`, y un despachador de tres líneas que elige:

| | quién | cuándo |
|---|---|---|
| **`mcDynBakeLey`** | BFS por el aire, haz anisótropo, posición fina en la siembra, oclusión real | **por defecto** — es la Ley |
| `mcDynBakeRC` | Radiance Cascades LUT (commit 5940da4) | `game.luzLey.off()`, para comparar de noche · se ajusta con `game.rcLUT` |

`function mcDynBake(sem)` es el despachador; el resto del motor lo sigue llamando por su nombre y no sabe que hay dos.

Historia, porque explica la forma: la LUT daba sombras sin sentido de día (foto #115) y lo que se veía **no era una
sombra**, era su caja de luz escrita fuera de escala y sin haz — byte 101 contra un techo legal de 64, y temblando 8,85
entre rondas idénticas por la fusión temporal. La vuelta a la Ley nació como snippet (`parche-luz-dia-ley`, LEY DE ORO:
se valida en caliente antes de tocar el motor), se comparó a fotos durante toda la tanda #115–#139, y el dueño la dio
por buena. La bajó `herramientas/parche_app_luz_ley.py`, que **extrae el cuerpo VERBATIM de git** (el padre del commit
que metió `MC_LUT_SPHERES`) en vez de copiarlo a mano: copiarlo a mano es cómo derivan las cosas.

Del snippet **solo queda el informe de foto** `color-particulas` (Alt+F): es una herramienta de depuración y su sitio
son los snippets. Al cargarse detecta que el motor ya trae la Ley (`typeof mcDynBakeLey === 'function'`) y entonces no
instala nada — instalar sería poner una segunda copia encima, y `off()` acabaría devolviendo el despachador en vez de
la LUT.

### El color propio de las partículas — `game.luzLey.color(v)`

`mcDynSync` siembra la capa `game.voxelesUI` con `(-1,-1,-1)` en el color = «sin color propio», y entonces
`mcLuzSiembra` reparte el cálido de la casa: una luciérnaga verde alumbraba naranja. `mcLuzColorPinta` le devuelve a
cada semilla el color de SU voxel (que `mc.voxUI` sí guarda y `mcVoxUILuces` tira al agrupar por celda) **antes** de
entregarla al bake.

- `0` = el cálido de siempre · `1` = su color exacto · hasta `MC_LUZ_SAT_MAX` (3) = exagerado. Por defecto **2**.
- ⚠️ **No infringe la Ley**: la Ley habla de NIVELES y aquí no se sube ni un byte. Se cambia la PROPORCIÓN entre canales
  (`rgbCol` en `mcLitGlow`), y exagerar **solo baja** canales — el más alto, que es el que fija el nivel (`a = max(…)`),
  no se toca.
- Con `1` casi no se nota, y no es culpa del mando: la paleta de las luciérnagas de `efectos-demo` **ya es** el cálido
  de la casa. Lo que sí se nota es el alcance (ver `docs/particulas-y-efectos.md`: el color se cuantiza en el nivel).

---

## UNA sola ley, y por qué el campo daba bandazos (BUG-GLOW8h)

Orden del dueño: «*la iluminación debe ser real y consistente para todo el motor, no puede haber apaños ni trucos
para quedar bien*». La ley es **una** y se evalúa de una vez en cada celda, nunca encadenando restas:

```
nivel = MX − máx(0, camino − 1) · k        MX = pleno del emisor (subniveles)
                                           k  = 1 sin haz · mcLuzFactorHaz(focus, cos) con haz
```

Tres cosas la rompían, y las tres se vieron **midiendo**, no razonando (informe `luz-continuidad`, fotos #91–#94):

1. **El paso costaba siempre un bloque.** La siembra mide el camino con la distancia Manhattan **real**
   (fraccionaria: el emisor está donde está, no en el centro de su celda) y la difusión le sumaba `+1` por paso
   aunque el paso fuera **de lado**. Al cruzar el plano del emisor la recta no se movía y el camino sí, así que la
   misma celda valía 2,75 por un vecino y 3,75 por otro — y cuál ganaba dependía del ángulo. Ahora el paso cuesta
   **lo que aleja del emisor**, y nunca menos que la recta (un rodeo que primero se *acerca* no cobra al volver).
2. **`OR` y `DI` eran escalones de la ley, no un detalle de almacenaje.** Un salto de un paso en `OR` mueve la
   distancia al emisor ese paso entero y se cobra `×k×MC_LUZ_SUB`; con 1/8 de bloque eso eran **0,75 niveles de
   golpe**. Con 1/32 (`MC_LUZ_ORG`) y 1/128 (`MC_LUZ_DRES`) el escalón baja del suelo del campo. Techo: `OR` es
   `Int16`, así que 1/32 da mundos de hasta 1023 bloques de lado — y los hay de 512.
3. **La siembra con haz sembraba los dos anillos solo por los 6 ejes** (su propio comentario decía «los dos
   anillos completos» y el código no lo hacía). Las **diagonales** pegadas al emisor —a 1,7 bloques, donde el
   error angular de una escalera de celdas es enorme— se le dejaban al BFS, que llegaba por el vecino que ganase
   la carrera. Ahora la siembra es **una sola rutina** con haz y sin él.

Y el cuarto, que era el gordo: **quien ganaba una celda le imponía SU ley a todo lo que colgara de ella.** Las
celdas de un emisor omnidireccional no guardaban `OR`/`MX`, así que se propagaban por una rama distinta —coste
constante, restando al valor del vecino— mientras que las del cono se propagaban con la ley del haz. Una celda
ganada por el cono decae `×k` (hasta 6 por bloque) y **estrangulaba ahí** la luz de una antorcha, que decae 1 por
bloque. Medido en la foto #94: mover los emisores de la espada un pelín cambiaba celdas entre 1,25 y 6,5 niveles
según qué ley acabara mandando. Ahora `OR`/`MX` viajan **siempre** y la rama de coste constante queda solo para
los campos que se construyen sin ellos (`focus = 0`).

### Y por eso el campo se resuelve en DOS PASADAS: primero lo que no tiene haz

Unificar la ley no bastaba, porque cada celda solo puede guardar **un** emisor y `relax` corta (`BL[j] >= nl`)
cuando una luz pierde una celda: pierde **y no puede seguir**, aunque más allá volviera a ganar. Con el cono
resuelto primero, una sola celda suya por el camino estrangulaba a la antorcha para siempre.

`mcDynBake` y `mcComputeBlockLight` siembran y difunden **dos veces**: la 1ª pasada, los emisores **sin haz**; la
2ª, los de cono. No es un apaño de orden, es el único que da el máximo correcto: si un cono pierde una celda
frente a una omnidireccional, **tampoco puede ganar más allá** —su `k` nunca baja de 1, así que la diferencia solo
puede crecer a favor de la omnidireccional—. Entre conos distintos el efecto sigue existiendo, pero es pequeño.

⚠️ El número que **nunca** puede moverse es `cruzarCelda` del informe `luz-continuidad`: la luz no sabe dónde
están las paredes de las celdas. Si el campo cambia porque el emisor salta de celda, hay artefacto, punto.

## La luz dinámica respeta los sólidos — `game.luzOcluye` (BUG-GLOW6)

Hay **dos** luces artificiales y hasta el 2026-08-20 solo una respetaba la materia:

| | quién la calcula | ¿la para una pared? |
|---|---|---|
| **horneada** | `mcComputeBlockLight()`, BFS **por el aire** desde cada emisor quieto | sí, siempre lo hizo |
| **dinámica** | `mcDynSync()` → `uDynPos`/`uDynDir`, sumada **en el fragmento** por distancia y ángulo | **no** — de ahí el bug |

Lo que veía el dueño en `/map/bugfinder` eran seis síntomas del mismo agujero: estrellas alumbrando un
cuarto cerrado, la espada de luz iluminando la cara de enfrente de un muro, la espada metida **dentro**
de un bloque alumbrando fuera, y una pared de 2 bloques filtrando menos que una de 1.

**No hay una sola solución, hay dos mitades**, y hacen falta las dos porque cada una llega donde la otra
no puede. La exacta —un raycast por fragmento y por luz— no se puede pagar: con 8 luces y una decena de
pasos son ~100 lecturas por píxel.

**1 · Por fragmento (shader, `dynLuz`).** Una cara **no recibe la luz que le da por detrás**:

```glsl
if(uDynCara>0.5 && d>uDynCerca && dot(nCara, P-w)<0.0) continue;
```

Es **exacto** para luz directa y sale **gratis**: `nCara` son las derivadas de la posición de mundo
(`cross(dFdx(w),dFdy(w))`), que ya se calculan aquí mismo para `sunFactor` y `blkLuz` — ni un atributo
nuevo ni una lectura de textura. Esto arregla las quejas de **grosor**: la cara de enfrente de un muro
mira al otro lado, así que deja de recibir, y con eso 1 bloque y 2 bloques filtran lo mismo (nada).

`uDynCerca` (0,6 bloques) es un margen de cortesía: el emisor que llevas **en la mano es geometría**, y
sin él las caras traseras de la propia espada se apagarían. Meterla dentro de un bloque no vuelve a
colar luz fuera — de eso se encarga la otra mitad.

Sin `OES_standard_derivatives` (WebGL1 antiguo, `mc.deriv` a false) esta mitad no se compila y todo
queda como antes; la de CPU sigue funcionando.

**2 · Por luz (CPU, `mcDynSync` → `mcLuzLibre`).** Una luz que **no ve al ojo** no se sube al shader.
`mcLuzLibre(ax,ay,az, bx,by,bz, P)` recorre las celdas entre los dos puntos (Amanatides-Woo, tope
`MC_DYN_PASOS`) y decide con **la misma tabla que gobierna la difusión de la luz horneada**
(`mcTablaLuz`, que se le pasa ya hecha). ⚠️ Eso no es un detalle: si aquí se usara otro predicado, el
mundo tendría **dos ideas distintas de qué es opaco** y una vidriera pararía una luz y no la otra.

Esto es lo que apaga el **cuarto cerrado** y la espada metida dentro de un bloque (el origen cae en
celda sólida ⇒ ocluida). Cuesta **una línea por luz y por frame**, ≤ `MC_DYN_MAX` = 8.

Es una **aproximación**: juzga por lo que ve el **ojo**, no cada fragmento. Lo que se le escapa es una
luz que tú ves pero que una esquina esconde de la pared que estás mirando, y en la práctica la tapa la
mitad 1 en cuanto la cara está de espaldas.

La visibilidad **se desvanece** (`MC_DYN_FUNDE`, 0,18 s) en vez de conmutar: cruzar una puerta con una
antorcha fuera encendería y apagaría en un frame, y eso se ve peor que el fallo. El fundido se indexa
por **posición redondeada**, no por índice de plaza: las plazas se reparten por cercanía al ojo y su
índice no identifica a la misma luz de un frame al siguiente. Una luz que **se estrena** nace con su
valor y no funde, o cada estrella que entra en las plazas aparecería subiendo desde negro.

**El mando.** `game.luzOcluye` (por defecto **true**, persiste en `vf_mcLuzOcluye`) enciende y apaga
**las dos mitades a la vez**. No re-siembra luz ni re-malla nada: es un uniforme y un filtro por frame,
así que conmutarlo cuesta cero y sirve para medir fps con y sin. `false` = comportamiento anterior al
2026-08-20, la luz atraviesa la materia.

Guardián: `node tests/test_glow6_luz_ocluida.js`.

---

## Luz global (exposición) — `game.luz` (REQ-ENV3)

Aparte del skylight y de la sombra del sol, hay una **exposición global** para oscurecer el mundo entero
(noche, tormenta): `game.luz(0..1)`, 1 = pleno día. Es el uniforme **`uExpo`**, que multiplica el color
de las superficies en los **tres programas de color** (`MC_FS`/`MC_FS_OPAQUE` terreno, `MC_STRUCT_FS`
estructuras/agua, `MC_STEX_FS` estructuras con textura). Se sube en **un solo sitio**, al principio de
`mcSunUniforms` (por donde pasan los tres programas, y antes del early-return de la sombra), leyendo
`mc.luzGlobal`.

- **Por defecto 1 ⇒ idéntico a hoy** (`col*1.0`, ni un float). No re-malla: es un uniforme.
- ⚠️ **Las fuentes emisivas NO se atenúan.** En `MC_STRUCT_FS` la exposición multiplica solo la parte
  sombreada: `mix(shaded*uExpo, vColor, em)`, así que una lámpara (`em=1`) sigue a pleno brillo.

Test: `node test_luz_global.js` (mide la pantalla: `luz(0.3)` ≈ 1/3 de brillo, `luz(1)` restaura al
pixel). Detalle y decisiones en `PLAN.md` (REQ-ENV3). El cielo se apaga aparte con `game.cieloColor`.

### La luz de bloque RESISTE la exposición (REQ-ENV4)

Para que `game.luz` (la noche) no apague también las antorchas al aire libre, la luz de bloque
(`mc.blockLight`) va a una **textura 3D R8** (`mc.blkTex`, unidad 2) que sube `mcUploadBlkTex` cuando
cambia (`mc._blkTexDirty` lo marca `mcComputeBlockLight`; el orden de `mcIdx` coincide con `texImage3D`,
se sube tal cual). El helper GLSL **`blkLuz(w)`** (`MC_BLK_LIB`, en los 3 programas de color) lee la
textura en la celda de **aire** que da a la cara (medio bloque hacia el ojo, normal de las derivadas) y
la exposición pasa a `col *= mix(uExpo, 1.0, blkLuz)`: donde hay antorcha no se apaga. Solo WebGL2
(`sampler3D`); en WebGL1 degrada a la exposición uniforme de REQ-ENV3.

⚠️ **Dos trampas (una casi tira el render entero):**
- Un **`sampler3D` va SIEMPRE a una unidad propia** (aquí la 2). Dejarlo caer en la 0 choca con el atlas
  (`sampler2D`) y **WebGL invalida el draw** ⇒ no se ve NI UN BLOQUE. Se ata una textura 3D **dummy
  1×1×1** a la unidad 2 aunque no haya antorchas, para que el sampler nunca esté incompleto.
- **SwiftShader (el headless de los tests) TOLERA ese error; una GPU real NO.** Un guardián en verde no
  garantiza que se vea en el navegador del dueño — lo destapó él probando, no el test.

Test: `node test_luz_artificial.js` (de noche, el sitio con antorcha retiene el brillo y el lejano se
oscurece). Detalle en `PLAN.md` (REQ-ENV4).

### La luz de un agente le SIGUE al moverse — luz DINÁMICA (BUG-GLOW2 → BUG-GLOW3)

Una antorcha (voxels autoiluminados) montada en una pieza de esqueleto se **dibuja** con la matriz de pose
viva `s.model`, pero su luz salía de la celda **estampada** y se quedaba en el spawn. El primer intento
(BUG-GLOW2) hizo que la **luz de bloque** siguiera al agente re-sembrándola por cada cruce de celda; funcionó
pero es el mecanismo equivocado para una luz en marcha: la luz de bloque es **granular a 1 bloque** (saltos /
trompicones) y cara de re-sembrar (BFS + remallado ⇒ caídas de fps). **BUG-GLOW3 lo sustituye por una luz
DINÁMICA por-fragmento.**

- **Emisor montado ≠ luz de bloque.** `mcEmisorSeguido(s)` (tiene `emitCells`, el seguimiento está on, y
  `s.model` ≠ identidad) marca al emisor como *montado en un agente que se mueve*. `mcComputeBlockLight`
  **lo salta** (no lo hornea). Un emisor **quieto** (`s.model` null/identidad) sí se hornea, como siempre.
- **`mcDynSync()`** (una vez por frame en `mcTick`, tras `mcUpdate`) recolecta la posición **viva y continua**
  de cada celda emisiva montada (las `MC_DYN_MAX=8` más cercanas al ojo) en `mc._dynArr` → uniform del shader.
  Sin cuantizar a celda, sin BFS, sin remallado ⇒ **suave y sin retardo**. Solo cuando un emisor pasa de
  montado↔quieto (cambia la *membresía*) re-siembra la luz de bloque **una** vez y re-malla su halo estampado
  (al arrancar/parar, no por paso).
- **Shader (`MC_DYNLIGHT_LIB`, en los 4 fragment shaders):** `dynLuz(vWorld)` da el mismo nivel `[0,1]` con el
  **mismo desvanecido lineal (−1/bloque sobre `MC_MAXLIGHT`)** que la luz de bloque; se mezcla con `blkLuz` por
  `max()` y resiste la exposición nocturna igual (`mix(uExpo,1,·)`). `dynLift(vShade,dyn)` repone el **brillo
  horneado** que la luz de bloque daría (curva `pow(interiorDark, dyn)`, tope 1.12 = shade de cara pleno), para
  que una cueva se encienda también de día. **No proyecta sombra** (como `blkLuz`); no usa `sampler3D` ⇒ vale en
  WebGL1. Se comporta como la luz de bloque/voxels de siempre (orden del dueño).
- **DIRECCIONAL, como la luz de bloque** (`siembra` es anisótropa: solo hemisferio delantero del haz + `glowFocus`).
  Cada luz lleva su haz `uDynDir` = la **normal neta de la cara emisiva** (`s.emitDir`) **rotada por `s.model`**
  (gira con la pieza), y `dynLuz` solo alumbra el hemisferio delantero (`dot((w−P), haz)>0`), estrechado con
  `pow(c, 1+glowFocus·8)`. Así el brillo de unas gafas alumbra **hacia delante, no todo alrededor ni hacia atrás**.
  Haz ≈ 0 (una antorcha que asoma por todas las caras) o `glowFocus`=0 ⇒ omnidireccional. Alcance/foco se ajustan
  con `game.glowLevel` / `game.glowFocus` (los mismos que la luz de bloque).

**Conmutable: `game.agentsLightTracking(true|false)`** (defecto on). `false` deja la luz en la celda estampada
(comportamiento viejo, coste cero) para **medir** la diferencia de fps o apagarlo. ⚠️ Deuda: los NPC-cubo
(`mc.agents`) siguen sin ser fuente de luz (ni block light ni dinámica). Test: `node test_agente_luz_sigue.js`
(sigue continua + cero BFS por paso). Detalle en `PLAN.md` (BUG-GLOW2, BUG-GLOW3).

### Mandos de la luz artificial (los 3, y en qué se diferencian)

Valen igual para la luz de bloque (antorchas fijas) y para la dinámica (emisor montado en agente):

- **`game.glowLevel`** (0..`MC_MAXLIGHT`, defecto 15) = **ALCANCE**: nivel de siembra; la luz pierde 1 por bloque
  ⇒ radio ≈ glowLevel. `0` = sin luz artificial.
- **`game.glowFocus`** (0..1, defecto 0.2) = **FOCO del haz**: `0` = omnidireccional (antorcha); →1 = haz fino en la
  dirección de la cara emisiva (`emitDir`). Solo actúa si el emisor tiene haz (una cara emisiva neta); un cubo que
  emite por las 6 caras es omnidireccional pase lo que pase.
- **`game.glowGain`** (≥0, defecto 1) = **INTENSIDAD**: `1` = tope normal (a plena luz = brillo de pleno día); `>1`
  **sobreexpone** (una antorcha/gafas brillan MÁS que el día, se «queman» a blanco). Es el techo del `mix` de
  exposición (`uGlowGain`), **solo un uniforme** ⇒ cambio LIVE y baratísimo (ni re-siembra ni re-malla).
  ⚠️ **`MC_MAXLIGHT` NO es la intensidad** — son los NIVELES de gradación/alcance; `lightLut` normaliza `/MC_MAXLIGHT`
  ⇒ a tope siempre ×1. Subirlo no da más brillo (y encima des-normaliza las semillas): para más brillo, `glowGain`.

`glowLevel` y `glowFocus` re-siembran + re-mallan al asignarlos (`mc._blEmiSig=null` fuerza el recálculo — **sin eso el
cambio no se veía hasta editar un bloque**, que era el síntoma de BUG-GLOW1). `glowGain` no necesita nada, se ve al frame.

⛔ **`game.flowFocus` no existe** (REQ-GLOW7). Es la errata de `glowFocus` que el dueño escribió tres veces. Desde
REQ-GLOW7 hay un alias que **avisa y reenvía** en vez de tragarse el valor callado, que era lo que hacía parecer que
el mando estaba topado. Y el tope de `glowFocus` **sí es 1 de verdad**: es el extremo del recorrido, no un recorte.
Para «ver hasta dónde llega la espada» el mando es `glowLevel` (alcance en bloques), no el foco.

### `game.interiorDark` pasa de 1: la sobreexposición (REQ-GLOW7)

`interiorDark` es un **factor de sombra**, `interiorDark^((MAX−lv)/MAX)`:

| valor | qué hace |
|---|---|
| `0` | la penumbra baja **hasta negro** — ⛔ y es una **vía muerta**, ver abajo |
| `0.15` (defecto desde 2026-08-25) | penumbra normal |
| `1` | **desactivado** (neutro: todo a plena luz) |
| `>1`, hasta `MC_INTERIOR_DARK_MAX` = **4** | **SOBREEXPONE**: lo que NO tiene luz sale más claro que lo que la tiene |

El `>1` es un **revelado de inspección**, no un modo de juego: lo pidió el dueño para ver qué está alumbrando la espada
en una escena a oscuras. A 4 el fondo sin luz ya sale a tope y subir más no enseña nada nuevo.

⚠️ **El «apagado» es el 1 EXACTO, nunca `>=1`.** `mcComputeLight` y `mcRelightBox` se saltan el cálculo entero cuando
vale 1, y `mcMeshChunk` / `mcCapaGeom` solo construyen la `lightLut` si `dark!==1`. Si alguna de esas comparaciones
vuelve a `<1` / `>=1`, la sobreexposición se queda **sin `mc.light` que leer** y no se ve nada. La excepción es
`dynLift` en el shader, que sí sigue en `uDynDark>=1.0`: con la penumbra ya subida en el vértice, dividir la bajaría.

### ⛔ `interiorDark = 0` mata la luz móvil (y no hay parche que lo salve)

El dueño, 2026-08-25: «*con `game.interiorDark` a 0 no iluminan ni las luciérnagas ni la herramienta el caseto por
dentro*». No es una decisión de diseño, es una **degeneración aritmética**, y la cadena tiene tres piezas:

1. **el horneado** (`mcMeshChunk`, y por cara en `mcStructGeom`): `s *= lightLut[lv]`, con
   `lightLut[lv] = Math.pow(dark,(15−lv)/15)`. Con `dark = 0`, toda cara sin skylight pleno se hornea a **shade = 0**;
2. **la reposición** (`dynLift`): repone **DIVIDIENDO** — `shade / pow(max(uDynDark,0.001), dyn)`. El `max` protege el
   divisor, pero el dividendo ya es cero. **0 entre lo que sea sigue siendo 0**;
3. **`mcLitGlow`** multiplica sobre esa base, que ya venía anulada.

O sea: las semillas están ahí y el campo se siembra (el informe las cuenta), pero el píxel no puede subir porque su
multiplicador murió en el vértice. **Si quieres «lo más negro posible» con las lámparas vivas, `0.02`, no `0`**: a
0.02 el interior queda en 5/255 y la herramienta en mano (dyn≈1) lo repone entero.

| `interiorDark` | shade horneado (lv 0) | con luciérnaga (dyn≈0,18) | con la herramienta (dyn≈1) |
|---|---|---|---|
| **0** | 0 | **0** | **0** |
| 0.02 | 0,020 | 0,040 | **1,0** |
| 0.15 (defecto) | 0,150 | 0,213 | **1,0** |

### El mando no refrescaba nada: `interiorDark` en la firma de malla (BUG-DARK1)

Foto **#138**: `game.interiorDark = 0.1` y el interior seguía como estaba; **romper un bloque lo arreglaba**, y solo
en ese chunk (de ahí el aspecto «a rejillas» de la #136). La firma de malla del chunk (PERF-RS1) se calculaba con
paleta + `gridGen` + fluidos + banderas de sombra + `grid`/`light`/`blockLight` — y **`interiorDark` no estaba**. Como
no cambia ni la rejilla ni `mc.light`, la firma salía **idéntica**: `mcMeshChunk` se iba por su *early return* y el
`mcMeshAll()` del setter no re-horneaba nada. Romper un bloque sube `gridGen` ⇒ firma nueva ⇒ re-horneado de ESE chunk.
Y peor: el ping-pong de `_cache` podía devolver un VBO horneado con **otro** valor del mando (el riesgo que su propio
comentario ya avisaba).

Arreglado con **`mcMeshSigSemilla()`**: una sola función con todo lo que se hornea en el vértice y no se lee celda a
celda, usada por los **dos** caminos que guardaban firma (que además se habían desincronizado: uno metía las banderas
de sombra y el otro no). **Regla**: lo que se hornee en el shade y no viva en `grid`/`light`/`blockLight` va ahí, o no
se refresca hasta que alguien rompa un bloque. Lo que es **uniforme** (`sunShade`, `luzGlobal`, `glowGain`…) no: eso
cambia en el frame siguiente y no toca la malla.

---

## Movido VERBATIM desde `CLAUDE.md` (2026-08-20)

Al poner el **candado de la Ley de la Luz** en `CLAUDE.md` se pasó el tope de 15 KB, así que estos dos
puntos bajan aquí tal cual estaban escritos (regla del propio `CLAUDE.md`: el detalle se mueve, nada se
borra). Lo que queda arriba es el candado + el enlace.

- Poner un bloque **no recalcula la luz del mundo**: `mcRelightBox` trabaja en caja acotada y es
  **exacto**. `mcComputeLight` y `mcRelightBox` **usan los mismos predicados, sin excepción**, o el mundo
  editado deja de coincidir con el recién cargado → es lo que compara celda a celda
  `test_luz_incremental_navegador.js`.
- **Difusión ≠ siembra**: `mcTablaLuz()` = por dónde se propaga; `mcTablaCielo()` = hasta dónde baja la
  columna de cielo (`luz:'pasa'` **no** la abre). **Cambiarlas invalida las mallas cacheadas** aunque no
  se mueva un voxel: entran en la firma del chunk.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

(Minimización de `CLAUDE.md` pedida por el dueño; arriba queda el candado y el enlace.)

**2 sombras distintas**: **skylight** (`mc.light`, horneado) vs **sombra proyectada** (GPU).
**2 bakes** de luz móvil: `mcDynBake` sólo **despacha** → `mcDynBakeLey` (defecto) / `mcDynBakeRC` (LUT,
`game.luzLey.off()`).
⛔ `interiorDark` **a 0 mata** la luz móvil (shade 0 y `dynLift` DIVIDE); lo horneado en el shade va a
**`mcMeshSigSemilla`** o no refresca.
