# Partículas y efectos — `sondas-mundo`, `particulas-voxel`, `efectos-demo`

*(REQ-SNP-LIB1 / REQ-SNP-LIB2, 2026-08-19. **Cero líneas de `app.js`**: los tres son snippets.)*

Todo esto nació dentro de `herramienta-espada` como «la sangre» ([REQ-SANGRE1](../PLAN_ARCHIVO.md#-req-sangre1)).
Al pedir el dueño adelgazar ese snippet se vio que lo reutilizable **no era la sangre**: eran dos capas que
habían acabado pegadas, y **la espada era la única de las tres copias del repo que estaba arreglada**.

| snippet | qué es | quién lo usa |
|---|---|---|
| **`sondas-mundo`** | preguntar al mundo **por forma fina**, no por celda | cualquiera que tire, camine o dispare algo |
| **`particulas-voxel`** | el motor de partículas (gravedad, rebote, posarse, caducar, pintar) | la espada, `efectos-demo` |
| **`efectos-demo`** | siete efectos de ejemplo, ~8 líneas de config cada uno | demostración |

`herramienta-espada` quedó en **125 líneas (venía de 271, −54 %)** y solo con lo suyo: el tajo, el punto de
impacto y el rojo.

---

## 1. `sondas-mundo` — el mundo por FORMA, no por celda

```js
const S = await game.snippet('sondas-mundo');
S.solido(x, y, z)            // ¿hay materia en este punto? (rejilla + estructuras)
S.solidoRejilla(x, y, z)     // solo terreno, por forma
S.solidoEstructura(x, y, z)  // solo piezas de mc.structures
S.geoFina(id)                // el {bits, fdim} de un material, o null
S.suelo(x, y, z, maxCaida)   // primera superficie por debajo, bajando de 1/16 en 1/16
S.MC_T                       // = MC_TILE = 16, subceldas por bloque

// …y las dos de VELOCIDAD, para quien sondee en bucle (ver «El coste por frame»)
S.cajaVacia(x0,y0,z0, x1,y1,z1)  // ¿en TODA esta caja no hay nada? conservadora: `false` = «pregunta»
S.refrescaEstructuras()          // índice grueso de lo estampado; UNA vez por frame, tú lo llamas
```

**El punto entero de que exista este fichero**: `mcSolid` contesta *«¿hay material en esta CELDA?»*, y para
una antorcha, una flor o un repetidor eso es `true` en el **cubo 1×1×1 entero**. Lo que caiga se posa sobre
una **caja invisible** flotando alrededor de la pieza — que es exactamente lo que reportó el dueño con la
foto #56. La forma de verdad está en **`mc._geoFina[id] = {bits, fdim}`** (bitset en 1/16), que es justo lo
que mira `mcTerrenoChoca` para chocar al jugador ⇒ preguntando por ahí, **lo que cae se cuela por donde se
cuela el jugador**. Medido sobre una antorcha: por celda salen macizas **4096 de 4096** subceldas; por
forma, **48** (el palo, 2×12×2).

Índice fino **local a la celda**: `Math.floor(x*MC_TILE) - bx*MC_TILE`, en `0..fdim-1`,
`bits[(fy*fdim[2] + fz)*fdim[0] + fx]`.

⚠️ **Las estructuras se preguntan con `mcFineBoxHit._orig`, NUNCA con `mcFineBoxHit`.** `mundo-autoarranque`
la envuelve para meter a los agentes articulados (eso es [BUG-AG19](../PLAN_ARCHIVO.md#-bug-ag19)); con la
envuelta, lo que tires **se posa encima del bicho** y se queda flotando en cuanto el bicho se va. Medido: 9
de 22 gotas «posadas» a los 0,1 s a media altura, sin haber caído. Si lo que quieres *es* preguntar por
agentes, esa es otra pregunta y tiene su puerta: `game.esqueletos.enPunto()`.

⚠️ **La rejilla se pregunta con `mcSolidWalk`.** ⛔ `mcSolid` **no se parchea nunca** — lo comparten mallado,
rayo y romper/poner.

⚠️ **Había tres copias de este predicado** en el repo (`mundo-autoarranque.json:1703`,
`redstone-piezas.json:738` y la espada), cada una un poco distinta. Si tocas la forma fina, tócala aquí.

---

## 2. `particulas-voxel` — el motor

```js
const P = await game.snippet('particulas-voxel');
const s = P.crea({ grupo:'chispas', chorro:16, fuerza:7, grav:30, colores:[[1,0.9,0.5]] });

s.salpica(punto, cuantas)   // un chorro desde un punto
s.enciende(porSegundo)      // siembra continua alrededor del jugador
s.para();  s.limpia();  s.info()
P.info();  P.limpia()       // todos los sistemas
```

Pinta en **`game.voxelesUI`**, un grupo por sistema. Al no ser mundo: **no colisiona, no se guarda, no sale
en la foto del mapa, se pierde al recargar.**

**Configuración** (todo en caliente, `s.grav = 40` y ya): `chorro`, `dura`, `desvanece`, `grav` (negativa ⇒
sube), `fuerza`, `hacia` (`'mirada'|'radial'|'arriba'`), `rebote`, `roza`, `parada`, `disperso`, `tope`,
`vuelo`, `deriva`/`derivaHz` (vaivén lateral), `posarse`, `grosorPosada` (⇒ más abajo), y para la siembra
continua `porSegundo`, `radio`, `alto`, `fondo`.

⚠️ `grosorPosada` es lo único que **no** se puede cambiar en caliente: el grosor se registra en el grupo al
crear el sistema. En caliente se cambia por la puerta de la capa, `game.voxelesUI.grosor('nieve:posada', 4)`.

⚠️ **El vuelo se cuenta en tiempo SIMULADO; el descanso, en el de RELOJ.** `dt` va acotado
(`Math.min(0.05,…)`), así que a pocos fps un segundo de reloj es una fracción de segundo de caída: midiendo
el tope de vuelo por reloj se matan partículas **que aún están en el aire** (medido: 16 de 22). En cambio
«30 segundos tirada en el suelo» son 30 s de reloj, y se cuentan **desde que se posa**.

⚠️ **Se repinta el grupo entero cada frame a propósito**: `mcVoxUIGeom()` remalla *toda* la capa en cuanto
está sucia, así que pintar partícula a partícula no ahorra nada.

⚠️ **Al llegar a `tope` se RECICLA lo posado más viejo; NUNCA se deja de sembrar.** Antes se dejaba, y por
eso «la nieve nevaba un rato y paraba varios segundos, en ciclo» (dueño, 2026-08-19). No era impresión, era
la cuenta: lo posado dura `dura` segundos y **ocupa cupo**, así que sostener 55 copos/s con `dura: 25` pide
1375 sitios contra un `tope` de 420. La primera tanda entra junta y **caduca junta** ⇒ el ciclo se
automantiene. Medido en `/map/test`, dt fijo 1/30:

| | siembra/s | vivas | volando |
|---|---|---|---|
| antes, s. 0–7 | 55 | →420 | ~195 |
| antes, s. **12–27** | **0** | 420 | **0** ← 21 s sin un copo en el aire |
| antes, s. 30 | 55 | 415 | 125 ← caduca la tanda y vuelve a nevar |
| **ahora, s. 0–70** | **55** | 420 | **~195, sin un solo hueco** |

Solo se recicla lo **posado**: quitar una partícula en el aire sería verla desaparecer. El barrido es
O(vivas) y sale ~2 veces por frame a 55 copos/s (~3 µs) — una cola ordenada por antigüedad costaría más de
mantener que esto. Guardián: `tests/test_particulas_fase_gruesa.js` mira **lo peor de cada segundo** durante
40 s, no el promedio — un promedio bonito tapa exactamente este agujero.

### `grosorPosada` — la alfombra, gratis

Reciclar tiene una consecuencia que se ve enseguida: volando y posados **comparten `tope`**, así que al
suelo solo le quedan ~225 plazas de 420 y cada copo cuajado se derrite en ~4 s, no en los 25 de `dura`.
225 motas de 1/16 de bloque repartidas por 26×26 bloques es **0,3 por bloque: no se ve nada**, y el dueño
lo leyó como «la nieve ya no se posa, lo atraviesa todo» (2026-08-19). No lo atravesaba —228 posadas, 0
dentro de la materia—, es que no se veía.

⚠️ **Comprarlo con voxeles no sale.** El remallado de la capa es POR VOXEL y es lineal (medido con
`mcVoxUIGeom` en caliente, swiftshader):

| voxeles | 500 | 1 000 | 2 000 | 4 000 | 8 000 | 16 000 |
|---|---|---|---|---|---|---|
| ms/frame | 0,63 | 1,28 | 2,56 | 5,16 | 10,8 | 22,5 |

Son **1,28 µs por voxel**, sin codo. Una alfombra de 1375 copos (la que hace falta para `dura: 25` a 55/s)
cuesta **1,76 ms/frame**: exactamente lo que se acababa de ahorrar. Por eso `tope` **no** se sube.

La palanca barata es `grosor`, que **agranda el CUBO y no el número de voxeles**: un copo posado de grosor
3 tapa **9 veces** más suelo por el mismo 1,28 µs. Para poder engordar lo cuajado **sin** engordar lo que
cae —que serían pedriscos—, lo posado se pinta en **su propio grupo**, `«<grupo>:posada»`, y ese grupo
lleva el grosor. Lo enciende `grosorPosada` (0 = apagado, que es lo que quieren la sangre y las chispas:
engordar al tocar les sienta fatal). La nieve pide `grosorPosada: 3` en `efectos-demo`.

Resultado: cada copo posado tapa **9 celdas finas** por el mismo voxel.

⚠️ Engordar **no** hace que se quede: el dueño lo vio enseguida —«se hacen más grandes un instante antes
de desaparecer, queda bonito como gota de agua, pero no se mantiene como copo de hielo»—. Que **aguante**
es cosa de `tope`, porque volando y posados comparten cupo. Medido, 40 s simulados a 55 copos/s:

| `tope` | posadas | voxeles capa | vida de lo cuajado | remallado |
|---|---|---|---|---|
| 420 | 226 | 418 | 4,1 s | 0,60 ms |
| 1 000 | 809 | 982 | 14,6 s | 1,14 ms |
| **1 600** | **1 375** | 1 516 | **25 s = `dura`** | **1,73 ms** |
| 2 400 | 1 374 | 1 525 | 25 s | 1,78 ms |

`efectos-demo` usa **1 600**: es donde el cupo deja de cortar y manda `dura: 25`. Cuesta 1,1 ms/frame más
que 420, y aun así el efecto entero sigue muy por debajo de los 5,66 ms/frame de antes. **El mando para
abaratar es `tope`, no `dura`.**

⚠️ Lo posado se ajusta además a la **retícula del cubo gordo**, y **no es por ahorro**: medido, colapsa
**1,0 copos por voxel** con `radio: 13` (caen repartidos por 26×26 bloques y casi nunca coinciden en la
misma placa). Es para que la alfombra quede **embaldosada** en vez de hecha de cubos solapados a 1/16 de
bloque. Solo ahorra si la nieve se amontona en poco sitio.

⚠️ **Un solo `requestAnimationFrame` global** para todos los sistemas (`window.__vfParticulas`), que **se
apaga solo** cuando no queda nada vivo y se cancela al reejecutar el snippet — se puede retunear desde el
editor sin dejar dos simulaciones corriendo.

⚠️ `game.snippet()` **no tiene guardia de ciclos**: A→B→A cuelga la pestaña. Estas librerías son hojas
(`particulas-voxel` llama a `sondas-mundo` y ahí se acaba).

---

## 3. `efectos-demo` — siete efectos, ni una línea de física

| tecla | efecto | lo que lo define |
|---|---|---|
| **Y** | chispas | `grav:30`, `posarse:false` ⇒ se apagan al tocar |
| **M** | polvo al romper | `hacia:'radial'`, `roza:0.2` |
| **T** | hojas | `grav:1.6` (pluma) + `deriva:0.9` ⇒ planean en zigzag |
| **H** | humo | `grav:-1.8` **negativa** ⇒ sube |
| **C** | estrellas | no son partículas (abajo) |
| **V** | nieve | `posarse:true`, `dura:25` ⇒ **cuaja** |
| **L** | lluvia | `posarse:false`, `dura:0.1` ⇒ revienta al tocar |

`game.efectos.info()` / `game.efectos.para()`.

**La capacidad nueva que pidieron nieve y lluvia**: siembra continua sobre una caja que **viaja con el
jugador** (`porSegundo`, `radio`, `alto`, `fondo`). Es la diferencia entre practicable e inviable: **no se
siembra el mapa**, se siembra un cubo alrededor del jugador y lo que se sale por detrás se recoge. Andar
bajo la nieve no deja un rastro de copos vivos a la espalda.

**Las estrellas no son partículas.** `game.voxelesUI` se dibuja en el overlay con el shader plano, **sin luz
ni sombreado del sol** (`app.js:13199`) ⇒ un voxel blanco se ve blanco a medianoche: **autoiluminadas por
construcción**, sin pedirle nada a [`luz-y-sombra.md`](luz-y-sombra.md). 240 voxeles plantados **una vez**
sobre una **media esfera** (media esfera, no disco, o se amontonan sobre tu cabeza) y ahí se quedan: coste
cero por frame. Por eso **no titilan por defecto** — titilar es repintar, y repintar es remallar la capa
entera; el mando (`titila`) está ahí si lo quieres pagar.

## Que un voxel de la capa ALUMBRE (REQ-GLOW5)

⚠️ **Autoiluminarse ≠ alumbrar, y confundirlo es la pregunta que hizo el dueño.** Toda la capa va con
`aEmit=1`: una estrella blanca se ve blanca a medianoche **porque ignora la luz**, no porque la emita. Al
suelo de debajo no le llega nada.

Para que **caiga luz sobre el terreno** se pide el efecto por **CLAVE DE MATERIAL**, no metiéndolo dentro del
color. El color es el color; lo que el voxel *hace* va aparte, para que la siguiente clave (`alfa`, `metal`…)
entre sin inventar otro prefijo ni tocar una sola llamada a `pon()` (decisión del dueño, 2026-08-19):

```js
game.voxelesUI.material('fuego', { emite: true, luz: 6 });   // ← LO NORMAL: el efecto es del GRUPO
game.voxelesUI.pon(x, y, z, col, 'fuego');                   //   …y pon() no cambia

game.voxelesUI.pon(x, y, z, { col: col, emite: true }, 'g');  // por VOXEL, la excepción
game.voxelesUI.pon(x, y, z, '*#ffaa00', 'g');                 // el '*' de siempre sigue valiendo (isGlow, app.js:272)

game.voxelesUI.luces = false;                       // interruptor de TODA la luz de la capa (medir fps)
game.voxelesUI.info().focosVivos                    // cuántas luces está aportando ahora mismo
```

Claves de hoy: **`emite`** (¿alumbra?) y **`luz`** (**alcance en bloques**; por defecto `game.glowLevel`, 15).

⚠️ **El `luz` de un grupo no es solo alcance: es CUÁNTO COLOR deja pasar.** `mcLuzSiembra` cuantiza el color de
la semilla contra su propio nivel (`round(col/255 · lv0)`), así que con `luz: 6` el color solo tiene **6
escalones** y una luciérnaga cálida acaba indistinguible del cálido de la casa (1 · 0,85 · 0,50); encima
`mcLitGlow` mete el tinte con fuerza proporcional al nivel (`mix(vec3(1.0), rgbCol, b*0.75)`). Por eso las
luciérnagas de `efectos-demo` pasaron a **`luz: 10`** (dueño, 2026-08-25, fotos #134/#139): subir el alcance es
la vía barata de ganar color, cuesta caja de BFS y **cero draw calls**.


`material(grupo, {…})` **mezcla**, no reemplaza; `material(grupo)` lee; `material(grupo, null)` borra. Una clave
desconocida **avisa por consola** en vez de tragársela.

⚠️ **`'*' + [r,g,b]` NO es un color emisivo.** JS concatena el array como texto (`'*0.6,0.7,0.9'`), eso no es
hex y sale **blanco**: se come el tinte sin avisar. Fue exactamente lo que le pasó a las estrellas de
`efectos-demo`. Hoy lo avisa por consola, pero la forma buena es la clave.

Va por la **vía dinámica** (`mcDynSync` → `uDynPos`, por fragmento), la misma que un emisor montado en un
agente y la misma que la herramienta en la mano — nunca por la siembra estática de bloque, que es un BFS más
un re-mallado de chunk y una partícula se mueve cada frame ([BUG-GLOW3](../PLAN_ARCHIVO.md),
[BUG-GLOW4](../PLAN.md#-bug-glow4)). Coste por frame: recorrer los voxeles emisivos, y solo cuando la capa
está sucia.

⚠️ **`luz` es ALCANCE EN BLOQUES, no intensidad, y aquí NO topa en 15.** Ese 15 (`MC_MAXLIGHT`) es el tope de la
siembra **estática**: el BFS pierde un nivel por bloque, el nivel viaja en la textura de luz y subirlo invalida
mallas cacheadas — por eso está prohibido. La vía **dinámica** no pasa por ahí: es aritmética por fragmento y
admite el alcance que se pida. Para **intensidad** (no alcance) el mando es `game.glowGain`.

**La caída es relativa al alcance**, `rad = clamp(1 − d·coste/nivel, 0, 1)`: la luz se apaga justo a los `nivel`
bloques y reparte el degradado por todo ese camino. Con el alcance normal (15) es **la misma cuenta de antes**
—`(15−d)/15 == 1−d/15`—, así que la ley del BFS que exige [BUG-GLOW4](../PLAN.md#-bug-glow4) se conserva exacta;
solo cambia para alcances mayores. Antes era una rampa **fija de 15 bloques** sobre la distancia, y eso hacía el
mando inservible de lejos: una estrella a 34 bloques pasaba de **nada** (`luz:34`) a **saturada** (`luz:49`).

Medido con las 240 estrellas de `efectos-demo` (alturas 26,8–50,1; distancia al ojo **33,7 la más cerca, 62,1 de
mediana, 78,6 la más lejos**) de noche, luminancia del suelo — apagadas **7,4**:

| `luz` | 15 | 25 | 30 | 35 | 40 | 50 | 60 | 80 | 120 | 200 |
|---|---|---|---|---|---|---|---|---|---|---|
| suelo | 7,5 | 7,0 | 7,7 | 6,9 | **18,7** | 39,5 | 56,0 | 76,1 | 94,7 | 108,7 |

Por debajo de ~34 no llega **ninguna**, y hace falta ~78 para que lleguen **todas**: ese reparto tan ancho es de
la escena, no del mando. Si quieres un rango de ajuste estrecho, junta las fuentes o usa menos.

⚠️ **Techo real: `MC_DYN_MAX = 8` luces a la vez, y son las 8 más cercanas AL OJO.** Con 240 estrellas hay 240
focos candidatos y solo 8 suben, así que la iluminación es un **charco que se recoloca al andar** (medido: tras
25 bloques, las 8 elegidas son otras). Para un cielo entero eso se nota. Si quieres luz de estrellas coherente,
marca **emisoras solo unas pocas** (8–16) en vez de las 240: menos competencia por las plazas y ningún salto.

⚠️ **Las luces se agrupan POR CELDA DE BLOQUE, no una por voxel.** 200 voxeles de fuego pegados son 200
cuerpos de 1/16 de bloque: sin agrupar se comerían las **8** plazas de `MC_DYN_MAX` con ocho luces
prácticamente en el mismo punto —dejando fuera la antorcha de al lado y **sin alumbrar ni un poco más**—.
Una luz por celda, en el centroide de sus voxeles, con el nivel más alto de los que caen en ella.

⚠️ **Para agrandarlas se usa `game.voxelesUI.grosor(grupo, n)`, NUNCA apilando voxeles** (REQ-VOXUI1).
El grosor agranda **el cubo**, no el paso: el voxel se queda donde está y **una estrella sigue siendo un
voxel, mida lo que mida**. Apilar un cubo de `n³` para engordarla multiplica la geometría por `n³`, y como
`mcDrawArr` **sube la capa entera a la GPU cada frame**, eso se come los fps de verdad. Medido con 240
estrellas a grosor 16 (cubos de un bloque):

| | voxeles | vértices | remallado |
|---|---|---|---|
| apilando (`n³` voxeles por estrella) | 983 040 | 5,5 M | **~1 640 ms por frame** |
| `grosor(grupo, 16)` | **240** | 8 640 | **2,1 ms** |

De grosor 1 a 16 el coste es **el mismo** (medido: −0,07 fps de diferencia, o sea ruido).

⚠️ **La capa se dibuja CON EL MUNDO, no en el overlay** ([BUG-VOXUI1](../PLAN_ARCHIVO.md#-bug-voxui1)):
`mcDrawVoxUI(pj, view)`, después del terreno opaco y **antes** de las estructuras, del cielo y del
translúcido. Estaba en `mcDrawOverlays` (al final) y ahí, aunque el test de profundidad esté puesto, **no
hay contra qué probar**: la pasada translúcida va con `depthMask(false)` a propósito ⇒ el agua, el cristal,
los carteles y **la herramienta en la mano** no dejan profundidad, y la capa se les pintaba encima. No se
notó hasta que el dueño bajó las estrellas a la altura de la escena. Medido con una cortina de cubos a 8
bloques, mismo fotograma y misma cámara: **103 662 px sin tapar antes → 60 624 ahora**.
**`game.voxelesUI.encima = true`** recupera lo de antes (marcadores que se quieren ver a través de las
paredes); es solo **dónde** se dibuja, ni la geometría ni el coste cambian.

---

## Cómo se mide esto (y cómo NO)

⚠️ **El navegador de pruebas va a ~1,4 fps** (swiftshader por software). Con `dt` acotado, **9 s de reloj son
0,6 s simulados**: mirando el rAF la nieve sale con `posadas: 0` y parece rota. **Es artefacto de medida, no
un bug.** Y los fps no dicen nada: daban 1,4 con todo encendido y 1,4 con todo apagado.

Se mide llamando al motor a mano con `dt` fijo, así «20 s» son 20 s de verdad:

```js
const s = game.efectos.nieve; let t = performance.now()/1000, dt = 1/30;
for(let i = 0; i*dt < 20; i++){ t += dt; s._siembra(dt, t); s._paso(dt, t); }
s._pinta();
```

Resultados (suelo en `y=15`):

```
NIEVE  20 s · vivas 420 · posadas 420          ✅ cuaja
LLUVIA 20 s · vivas  58 · posadas   0          ✅ no cuaja, y el tope aguanta (58 ≤ 500)
polvo   2 s · y media 16,52 → 15,02 · 26 posadas
hojas   6 s · y media 16,50 → 15,00 · 14 posadas
humo  1,2 s · y media 16,55 → 18,73            ✅ SUBE
```

## El coste por frame: son DOS, y el que se veía no era el caro

⚠️ **Esta sección decía que remallar la capa era «lo único que se paga». Era falso**, y por eso el dueño
encontró la lluvia injugable (REQ-SNP-LIB3, 2026-08-19). Se pagan dos cosas, y hasta el arreglo la grande
era la otra: **las sondas al mundo de la física**.

**1 · Sondas al mundo (`_paso`).** El paso se trocea en subpasos de medio voxel fino para no atravesar el
suelo de un frame, y **cada trozo preguntaba al mundo**. Lo caro no es cuántas partículas hay, es **a qué
velocidad van**: `S.solido` acaba en `mcFineBoxHit`, que recorre `mc.structures` **entero** en cada llamada
—no hay índice espacial—, así que el troceo multiplica ese bucle.

| medido en `/map/test`, 80 estructuras, `dt` 1/30 | lluvia (150/s) | nieve (55/s) |
|---|---|---|
| partículas volando | 61 | 176 |
| sondas por partícula **antes** | **22,5** (el tope de troceo) | 3,8 |
| sondas por partícula **hoy** | **2,3** | **1,2** |
| `_paso` antes → hoy | **11,15 ms → 1,3 ms** | 5,33 ms → 1,9 ms |

La lluvia sale a `fuerza:16` y acelera a `grav:42` ⇒ ~40 bloques/s ⇒ **1,3 bloques por frame** ⇒ topaba en
los 24 trozos **siempre**. La nieve, con 7 veces más copos pero 7 veces más lenta, troceaba en 4 y por eso
costaba la mitad con siete veces más partículas: **el número que se dispara es la velocidad**.

El arreglo es una **fase gruesa** en `sondas-mundo` (`S.cajaVacia(x0,y0,z0,x1,y1,z1)`): se pregunta **una
vez por el tramo entero del frame** y, si está limpio —el caso normal de cualquier cosa que cae por el
aire—, se avanza de un tirón. En cuanto la caja roza algo se vuelve al troceo de siempre, así que **la
precisión del choque no cambia**: la caja es la fase ancha, no la respuesta.

⚠️ **`cajaVacia` es conservadora, y la asimetría es la razón de que se pueda usar**: mira la rejilla **por
celda**, sin afinar la forma, así que sobre una antorcha contesta «puede haber algo» aunque el tramo pase
por el aire de su celda. Un `false` de más solo cuesta volver al camino lento; un `true` de más sería
atravesar una pared. ⛔ No la «mejores» afinándola por forma sin volver a medir: ahí es donde se compra el
bug. Guardián: [`tests/test_particulas_fase_gruesa.js`](../tests/test_particulas_fase_gruesa.js).

⚠️ **Y el segundo piso del mismo problema: `mcFineBoxHit` no tiene índice espacial.** Recorre TODAS
las estructuras y, para poder descartar una por su caja, antes hace `mcStructColl(s)` — un acceso a
`mc.structs[s.key]` y tres cadenas de propiedades. Con 80 estructuras eso son **9,2 µs por sonda**, así
que aun con la fase gruesa la nieve seguía pagando 1,91 ms de los 2,28 ms de su paso.

Arreglado con un **índice grueso** en `sondas-mundo`: la lista plana de las cajas de lo estampado, más
la caja de todas juntas, **rehecha una vez por frame** (`S.refrescaEstructuras()`). Descartar con
aritmética pura sobre esa lista es ~20 veces más barato, y la caja global despacha de un golpe todo lo
que caiga lejos. Llamadas a `mcFineBoxHit` con la nieve puesta: **208 por frame → 3**.

⛔ **Y por eso el índice NO va dentro de `mcFineBoxHit`**: `test_rayo_apuntado.js` la extrae **verbatim
por texto** y una referencia nueva ahí dentro la revienta con `ReferenceError` (CLAUDE.md). Va donde se
pregunta.

⚠️ **El contrato es explícito, sin relojes ni caducidades**: quien sondee en bucle llama a
`S.refrescaEstructuras()` una vez por frame — lo hace `particulas-voxel` al empezar `paso()`. Quien no
lo llame (la espada, que sondea una vez y ya) **no tiene índice y va por el camino de siempre**, que
sigue intacto. El índice nunca contesta que sí por su cuenta: solo evita preguntar. Perderlo es lento,
no incorrecto.

**2 · Remallar la capa (`mcVoxUIGeom`).** Esto sí es por voxel:

| voxeles en la capa | ms/remallado |
|---|---|
| 0 | 0,06 |
| 100 | 0,48 |
| 250 | 1,16 |
| 500 | 2,88 |
| 1000 | 6,29 |

Es de **toda la capa**, no del grupo que se ha movido: con el cielo de estrellas encendido, los 240
voxeles de las estrellas se remallan otra vez por cada copo que cae. Con 420 copos eran **2,53 ms**, y
el reparto sorprende:

| dentro de `mcVoxUIGeom`, 420 voxeles | ms |
|---|---|
| emitir la geometría (`mcPushVoxCubo`) | **2,15** |
| máscara de caras (partir la clave `"x,y,z"` y mirar 6 vecinos) | 0,46 |
| …y además, en el dibujado, `new Float32Array(arr)` | 0,58 |

⚠️ **El 85 % eran los `out.push()`**: 36 vértices × 7 flotantes por voxel sobre un array de JS normal,
más una `P` de 8 arrays intermedios por cubo. Y luego `mcDrawArr` **volvía a copiar los 105 840
flotantes** a un typed array para subirlos.

Hoy `mcVoxUIGeom` escribe **por índice en un Float32Array reutilizado** (`mcPushVoxCuboBuf`, misma
tabla de caras ⇒ misma geometría vértice a vértice, lo comprueba el guardián) y devuelve una **vista**
que `mcDrawArr` sube tal cual, sin copiar: **2,53 ms → 0,72 ms**. El búfer no encoge: crece hasta el
máximo pedido nunca (420 copos ≈ 0,4 MB) y así ningún frame asigna memoria.

## Dónde quedó el frame

| | `_paso` | `_pinta` | remallado | **total** |
|---|---|---|---|---|
| **lluvia 150/s** antes → hoy | 11,15 → **0,22** | 0,02 | 0,20 → **0,07** | **11,4 → 0,31 ms** |
| **nieve 55/s** antes → hoy | 5,33 → **0,37** | 0,13 | 2,05 → **0,68** | **5,7 → 1,18 ms** |

Lo que queda de la nieve es casi todo remallado, y es **por voxel** (1,28 µs cada uno): son ~1 565 —190
volando y ~1 375 cuajados— contra las ~58 gotas de la lluvia. El mando de configuración para bajarlo es
`tope` (tabla arriba); `grosorPosada` da **más nieve a la vista sin más frame**, porque el coste va por
voxel y él va por cubo.

⛔ **Y aquí está el techo de este diseño, que hay que saber antes de pedirle más**: la alfombra se
**remalla entera 60 veces por segundo aunque no se mueva**, porque lo que cae ensucia la capa y
`mcVoxUIGeom` la rehace **completa**. Cubrir *el paisaje* —no el cuadrado de `radio` bloques alrededor del
jugador— serían decenas de miles de voxeles: a 1,28 µs son **decenas de ms por frame**. Por partículas no
sale, a ningún `tope`. Para eso hacen falta dos cosas que **no están hechas**: geometría **cacheada por
grupo** (que un grupo quieto no se remalle) y la alfombra **troceada por chunk** (que al posarse un copo
solo se rehaga su trozo). La alternativa es no usar la capa: hornear la nieve en la **malla del mundo**,
que es gratis por frame pero **escribe en el mundo del dueño**.

## El manto: la alfombra que cuaja (2026-08-19)

Lo de arriba se quedó corto, y lo que lo resolvió no fue afinar la capa de partículas sino **una capa
nueva**. Hoy el manto no lo pintan los copos: es un espesor **por columna de bloque** que sube con el
tiempo en toda la zona a la vez, en orden aleatorio, y cada columna es **una celda achatada con la
textura del material** — `game.volatiles.ponCapa(x, y, z, alto, material)`, con `alto` en 1/16.

| | cajas de la capa fina (hasta hoy) | celda achatada (`ponCapa`) |
|---|---|---|
| color | uno plano por caja | **la textura del bloque**, del atlas |
| copiar una textura 16×16 | 256 cajas/bloque ⇒ ~2 M en el mapa, ~2 GB | gratis, va en la UV |
| mapa entero nevado (7 833 columnas) | 31 332 cajas ≈ 31 MB | **11 915 quads ≈ 1,6 MB** (medido) |
| niebla y sombra del sol | **no** (pasada aparte, sin niebla) | sí, va en la pasada del terreno |

Por qué no valía subir el detalle del mosaico: la textura de un bloque **no se puede fundir en
rectángulos**. Medido baldosa a baldosa sobre la loncha de arriba: el oro da **248 rectángulos de 256**,
la tierra 251, el adoquín 250. Es ruido. Solo la nieve se funde (200 → 1 si se cuantiza), y por eso el
manto blanco colaba y el de oro cantó a la primera.

Mandos del manto (en la config del sistema, cambiables en caliente): `manto` (espesor en 1/16),
`mantoDe` (**el material**, como en `setVoxel`), `mantoEn`, `mantoDura`, `mantoRadio`, `mantoPorFrame`,
`mantoRevisaPorFrame`, `mantoChunks`, `mantoRitmo`.

⚠️ `mantoDe` tiene que estar **en la paleta de este mundo** o se pinta roca, igual que con `setVoxel`:
el snippet lo detecta y lo trae con `game.addMaterial` antes de repintar.

⚠️ La capa fina (`ponFino`/`ponCajaFina`) **sigue existiendo** para lo que se acumula suelto, y desde
hoy **se dibuja con niebla**. Ojo: en el shader la niebla va multiplicada por `(1 - emit)`, así que
ponerla no bastaba — hubo que bajar `aEmit` a 0 en esa pasada. Son el mismo interruptor.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

(Minimización de `CLAUDE.md` pedida por el dueño; arriba queda la regla y el enlace.)

3 snippets, **0 líneas de `app.js`**: `sondas-mundo` (mundo por **FORMA**, no por celda) +
`particulas-voxel` (motor) + `efectos-demo` (7 efectos: nieve, lluvia, estrellas, chispas, polvo, hojas,
humo).

- ⛔ `mcSolid` dice **celda**: lo que caiga se posa en la **caja invisible** de una antorcha. Forma real =
  `mc._geoFina[id]`. Estructuras con **`mcFineBoxHit._orig`** (la envuelta trae agentes, BUG-AG19).
- Agrandar = **`game.voxelesUI.grosor(grupo,n)`** (agranda el cubo, no el paso), ⛔ NUNCA apilar voxeles:
  `mcDrawArr` sube la capa **entera** a la GPU cada frame (240 estrellas g16 = 983 040 vox vs **240**).
- Se dibuja **con el mundo** (`mcDrawVoxUI`), NO en el overlay: el translúcido no escribe z (BUG-VOXUI1).
- Vuelo en tiempo **simulado**, reposo en el de **reloj** (`dt` va acotado). Medir con `dt` fijo a mano:
  el navegador de pruebas va a 1,4 fps ⇒ 9 s de reloj = 0,6 s simulados, y sus fps no miden nada.
