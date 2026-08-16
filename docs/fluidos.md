# Fluidos: hundirse, nadar y fuentes infinitas

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## 🏊 Física dentro de un líquido: hundirse, nadar y avanzar (REQ-FLUID6 · REQ-FLUID7 · REQ-FLUID9)

**Fuera del agua no cambia absolutamente nada.** Era la condición del dueño y es el primer test de los
dos guardianes: en el aire la gravedad sigue siendo `22 bloques/s²` clavada y el salto sigue siendo un
impulso de `8·√scale`. Todo lo de abajo pasa **solo** dentro de un líquido.

### Una sola función de caída, tres puntos de llamada

```js
mcCaidaPaso(vy, dt, x, y, z, nadando, mira)   // en app.js, declaración global (no const)
```

Es **la** pieza de arquitectura de estos dos tickets, y no es un detalle de estilo. El dueño pidió que
**«los agentes se comporten a nivel de físicas como los jugadores en todos los casos»**, y los agentes
articulados **no pasan por `mcUpdate`**: tienen sus propios integradores en el snippet, y son **dos**
(`asentar`, la caída libre de la raíz, y `movPaso`, lo que el cuerpo lleva encima — golpe, trampolín,
borde). Copiar la fórmula en los tres sitios habría cumplido la petición **hoy** y la habría roto en el
primer retoque. Así que:

- `app.js` **ofrece** el paso de caída; quien tenga un cuerpo lo llama. Mismo patrón que `mc.sunExtra`
  y `mcXrayExtra`: el motor da la capacidad, el snippet decide el comportamiento.
- Se declara con `function` y no con `const` **a propósito**: el snippet corre dentro de un
  `new Function`, donde un `const` de `app.js` es invisible.
- El snippet llama a través de un puente con respaldo
  (`typeof mcCaidaPaso === 'function' ? … : vy - GRAVEDAD*dt`), que es lo que lo mantiene ejecutable en
  el mundo de juguete de los tests, donde no hay motor.

⚠️ Si añades un cuarto sitio que integre una velocidad vertical, **llámala**. Y si envuelves
`mcCaidaPaso`, **pasa todos los argumentos**: comerse el sexto apaga el nadar y comerse el séptimo apaga
la mirada y el Shift, las dos cosas **sin que nada falle**.

### Los números son RELATIVOS, y por qué

El dueño da cifras de Minecraft en **bloques/tick**; nuestro motor va en **bloques/segundo**. Lo que se
implementa es la **razón**, nunca la cifra: el empuje de subida se dice **relativo a la gravedad de
dentro** (`empuje: 3` = 3× esa gravedad, neto **+2×** hacia arriba con la tecla pulsada). Anclarlo así es
lo que hace que tocar una perilla no descoloque la otra.

```js
const MC_FISICA_FLUIDO = {                              // app.js:5937 — los valores que TUNEÓ el dueño
  WATER: { gravedad: 0.5, arrastre: 0.22, empuje: 3 },  // ⇒ baja a ~2,42 bloques/s · sube a ~4,84
  LAVA:  { gravedad: 1,   arrastre: 0.11, empuje: 2 },  // ⇒ baja a ~2,42 igual · sube a ~2,42
};
// v ← (v + a·dt) · e^(−dt/arrastre)   con a = g_dentro·(m·empuje − 1)  y  m ∈ [−1, 1]  (ver REQ-FLUID9)
```

⚠️ **Estas cifras NO son las de REQ-FLUID6/7** (allí eran `1/16` y `empuje 8` para los dos líquidos, con
la misma gravedad, y la lava se separaba del agua **solo** por el `arrastre`). Las retuneó el dueño
después, y con ellas la lava se hunde **igual** que el agua y se nada en ella **más despacio**.
`test_nadar.js` y `test_hundirse.js` siguen escritos contra las viejas y por eso están en rojo — es
**BUG-FLUID5** en `PLAN.md`, no una regresión; se comprobó con A/B.

**No hay tope duro de velocidad, ni al bajar ni al subir: lo da el rozamiento.** Entrar al agua a 10
bloques/s frena en ~0,2 s en vez de chocar con un techo invisible, y la terminal es una *consecuencia*.

⚠️ **La terminal real NO es `a·τ`.** El motor integra en pasos discretos, así que el punto fijo es
`a·dt·k/(1−k)` con `k = e^(−dt/τ)` — a 60 fps se separan un **3,7 %**, más que cualquier tolerancia
honrada. La consola anuncia `a·τ` a propósito (es lo que no depende de `dt`), pero **un test que compare
contra `a·τ` con tolerancia fina está mal escrito, no está cazando un fallo**. Esto mordió **seis** veces
entre los tres tickets, siempre con el motor teniendo razón. Y la sexta añadió la otra mitad: **a los 40
frames tampoco se ha llegado todavía a la terminal discreta** (son 3,03·τ, o sea el **95,2 %**), así que
lo único que admite tolerancia fina es el término n-ésimo exacto, `vT·(1−kⁿ)`.

### Quién decide que estás «dentro»: los PIES, y el punto, no la celda

- Se sondea el **punto** con `mcGetFluidHeight` (`y − cy <= h`), no la celda entera: unos pies apoyados
  en el aire que deja un fluido a medio nivel **no** se hunden. Es la diferencia deliberada con
  `mcFluidoOjo` de REQ-FLUID4 fase 3, que sí mira la celda del **ojo** porque tiñe la pantalla.
- Para nadar manda `mc.pos[1]`, o sea **los pies**. Es lo que deja **salir a la orilla**: subes hasta que
  los pies asoman y ahí vuelve a mandar la gravedad de fuera. Con el ojo o con el cuerpo entero te
  quedarías flotando pegado al borde.
- **Con suelo debajo gana el salto de siempre** (`mc.onGround` tiene prioridad). Nadar es «en líquido
  **y sin suelo**», como en Minecraft — no «en líquido». Sin esa segunda mitad, vadear un charco de un
  bloque se sentiría como andar por pegamento.

La identidad del fluido es su **TIPO** (`WATER`/`LAVA`) vía `game.fluidos.getProps`, **nunca** su id ni
su nombre: `hab:agua-1`…`hab:agua-7` son ids distintos del mismo líquido.

### `W` te lleva DONDE MIRAS y Shift te hunde (REQ-FLUID9)

Dentro de un líquido y **sin suelo debajo** (el mismo «dentro» de arriba), `W`/`S` reparten lo que
aportan entre **avanzar** (×`cos` del cabeceo) y **sumergirse/emerger** (×`sen`): mirar al fondo con `W`
te hunde y mirar al cielo te saca. **Shift** añade empuje hacia abajo. Son tres piezas:

1. **El séptimo argumento `mira`**, no una función nueva. Subir, bajar y dejarse caer son el **mismo**
   empuje con distinto signo, así que la vista y Shift entran por donde ya entraba la tecla de nadar:

   ```js
   const m = Math.max(-1, Math.min(1, (mira||0) + (nadando?1:0)));
   const a = g*(m*(f.empuje||0) - 1);   // m=0 ⇒ −g · m=1 ⇒ (empuje−1)·g · m=−1 ⇒ −(empuje+1)·g
   ```

   ⚠️ **`mira` y la tecla de nadar comparten UN presupuesto acotado a ±1.** Es lo que hace que
   salto+Shift a la vez den «ni una cosa ni la otra» y que mirar arriba **con** el salto pulsado no
   empuje el doble. `m = 0` devuelve `−g` byte a byte, así que fuera del líquido no cambia ni un float.
   Bajar sale más rápido que subir **sin ninguna cifra nueva** —la gravedad ayuda en un sentido y estorba
   en el otro—: `−(empuje+1)·g` contra `(empuje−1)·g`.

2. **Una rama propia en el mando horizontal, y va DIRECTA.** Nadar es «sin suelo», así que hasta este
   ticket el cuerpo dentro del agua lo gobernaba el **air-strafe**, que *por definición* no reescribe la
   velocidad ⇒ girar la vista no podía redirigirte. Es la trampa de **BUG-ESC1 vista por el otro lado**.
   La rama va **antes** del reparto por `mc.onGround` y escribe `mc.vel[0]/[2]` directo.
   ⚠️ El rumbo se **ACOTA, no se normaliza** (`if(hl>1)`): normalizando, mirar a plomo devolvería la
   marcha entera en horizontal; acotando, todo lo que aporta `W` se va en descenso. Y el rewrite va bajo
   `if(ml>0)`, o sea que **sin tecla de rumbo no se toca la velocidad horizontal** y la inercia de hoy
   queda intacta.

3. **Shift es `mira -= 1`**, acotado con el resto. ⚠️ `mc.keys` guarda `e.key.toLowerCase()`, así que
   **`k['shift']` son las DOS teclas Shift**; distinguir la izquierda pediría `e.code === 'ShiftLeft'`.

Guardián: `node test_nadar_avance.js` (14 ok). Monta su propio pozo estanco de **11×18×11** —más ancho
que el de `test_nadar.js` a propósito: a ~5 bloques/s se cruza un interior de 5 en un suspiro y lo que
se mediría es la pared, no el rumbo— y llama al `mcUpdate` **de verdad** frame a frame.

### Perillas y válvula

```js
game.fisicaAgua()                       // lee: gravedad, arrastre, empuje y las dos terminales
game.fisicaAgua({ arrastre: 0.5 })      // menos espeso: tarda más en frenar y termina más rápido
game.fisicaAgua({ empuje: 1 })          // el empuje compensa la gravedad justo: se flota quieto
game.fisicaLava({ arrastre: 0.05 })     // lava más espesa aún
game.fisicaAgua('reset')
mc.sinFisicaFluido = true               // devuelve la física de antes de los tres tickets, exacta
```

**Lo que se afine PERSISTE** (`localStorage`, `vf_fis_agua` / `vf_fis_lava`), como `game.nearClip` o
`game.parkour`: se juega desde el móvil y una perilla que se olvida al recargar hay que volver a
teclearla en cada partida. `'reset'` **borra la preferencia**, no solo el valor en memoria. El defecto
del motor se copia **antes** de leer el disco (en los argumentos de `_mcTunableFisica`), así que
`'reset'` vuelve al de fábrica y no a lo último guardado.

⚠️ **El hundimiento es el producto de DOS perillas, y ninguna lo mueve a solas**:

```
   bajada        = MC_GRAVEDAD · gravedad · arrastre                 (2,42 bloques/s de fábrica)
   subida        = MC_GRAVEDAD · gravedad · (empuje − 1) · arrastre  (4,84)
   bajada+Shift  = MC_GRAVEDAD · gravedad · (empuje + 1) · arrastre  (9,68 — REQ-FLUID9)
```

`gravedad` y `arrastre` escalan **las tres** por igual, porque el empuje se define **relativo** a la
gravedad de dentro (ver arriba) — eso es lo que hace que tocar una perilla no descoloque la otra, y
es a propósito. Para hundirse ×4 **sin cambiar cómo se nada** hay que compensar con `empuje`, que es
el único que solo mira hacia arriba: `game.fisicaAgua({ gravedad: 2, empuje: 1.5 })`
(`empuje − 1` dividido por el mismo 4). La consola imprime las velocidades resultantes en cada
llamada, así que se afina mirándolas y no a ciegas.

Tests: `node test_nadar_avance.js` (**14 ok**, REQ-FLUID9). Los tres montan un pozo **estanco** en
`/map/test` —suelo y cuatro paredes: un fluido que se escapa se reparte por medio mundo en niveles
finísimos y a los tres segundos no queda columna que medir— y llaman al `mcUpdate` **de verdad** frame a
frame, no a un calco de la física.

⚠️ Los otros dos, `test_hundirse.js` (16 ok / **4 fallos**) y `test_nadar.js` (15 ok / **4 fallos**),
están **en rojo desde que el dueño retuneó las constantes**: sus tramos de 120 y 240 frames se
escribieron para la gravedad de dentro vieja y hoy cruzan enteros el pozo, así que miden el fondo y no
el fluido. Comprobado con A/B que **no es una regresión** de REQ-FLUID9. Es **BUG-FLUID5** en `PLAN.md`,
y está abierto a propósito: reescribirlos para que pasen borraría la única copia escrita del criterio de
REQ-FLUID6/7, y eso lo decide el dueño.

### ♾️ Fuentes infinitas (REQ-FLUID8)

Una celda de **corriente** que toca **DOS o más fuentes** por los lados (N/S/E/O) y tiene un bloque
**sólido** debajo asciende a **fuente**. Es lo que cierra un hoyo de 2×2 puesto con dos cubos en
diagonal y lo que hace que un pozo así no se agote nunca.

```
 [FUENTE][ aire ]   →   [FUENTE][FUENTE]
 [ aire ][FUENTE]       [FUENTE][FUENTE]
```

Las cuatro reglas, que son decisiones del dueño y no se cambian sin preguntarle:

1. **DOS, no una.** Con el umbral en 1, cada fuente convertiría a su vecina y ésa a la suya: el llano
   entero acabaría de fuentes. Eso no es una fuente infinita, es una inundación. `test_fuentes_infinitas.js`
   §3 es el guardián de esto y **es el test que importa**, más que el caso feliz.
2. **«Sólido» es sólido**: otra fuente debajo **no** vale. Consecuencia buscada: la regla solo prende en
   la capa que toca el fondo, así que un estanque de dos de hondo **no** vuelve infinita la de arriba.
   Se usa el mismo `!isReplaceable` que decide el flujo horizontal, para que «lo que sostiene un charco»
   signifique una sola cosa en toda la función.
3. **Vale para cualquier fluido**, agua y lava por igual. No hay bandera por tipo.
4. **Las derivadas son fuentes de pleno derecho**: romper una de las originales **no** degrada al resto.
   Sale gratis, porque nada degrada nunca una fuente.

Dónde vive: `processCell` en `app.js`, entre el paso 1 (¿me quedo sin alimentación?) y el paso 2 (¿caigo?).
Dos cosas que conviene saber antes de tocarlo:

- **«Fuente» ya existía**: es `fluidLevel === 0` (la clave de material es `base + '-' + nivel` y el `-0`
  no se escribe). Convertir es `setFluid(x, y, z, tipo, 0)` — sin concepto nuevo ni cambio de formato.
- **No hay barrido del mundo, y no debe haberlo.** La regla va dentro de la cola de ticks que ya existía:
  cuatro sondeos sobre una celda **que ya se estaba procesando**, y `notifyNeighbors` propaga la
  conversión por el hoyo. No hay bucle infinito porque ascender exige `level > 0` y una fuente ya no
  vuelve a entrar. Si alguna vez hace falta ampliar la regla, **que siga siendo así**.

Válvula: `mc.sinFuentesInfinitas = true`. Guardián: `node test_fuentes_infinitas.js` (8 ok), con la
bandeja partida en **cuatro compartimentos estancos**, uno por caso — con bandeja compartida el agua de
un caso se cuela en el de al lado y el verde deja de significar nada.

---

## 🪞 La lámina de agua refleja el cielo (REQ-FLUID5)

Fase 4 de REQ-FLUID4, sacada a ticket propio. Es lo que separa «un cristal azul tumbado» de «agua»:
a rasante la superficie tira al color del cielo y se opaca; en picado transparenta y se ve el fondo.
**Enfoque 1 del ticket** (Fresnel + color de cielo): sin pasada extra, sin FBO, sin doblar draw calls.
Vive en el **shader de estructuras** (el que dibuja el agua) + una marca al mallar; **nada de esto
cambia la simulación**, y **fuera del agua no toca un float**.

### Cómo, sin atributo nuevo ni VBO aparte

La clave es que la cara de arriba del agua **ya se distingue al mallar**: `mcMeshChunk` conoce el tipo
de fluido de la celda (`mcTablaFluido()` → `'WATER'`) y la dirección de cada cara (`alphaFD`, `0` =
`MC_FACES[0]` = +Y). Así que en `copia()` la **cara superior del agua** se hornea con **`emit = 2`**.
El agua no es emisiva (su emit real es 0), así que ese 2 es una **bandera libre** en un canal que ya
viaja al shader. El fragment la separa: `refl = step(1.5, vEmit)`, `em = vEmit - 2·refl` recupera el
emit de verdad. **Ni un atributo nuevo, ni un VBO nuevo, ni una costura más en la caché de chunks** —
que es justo donde REQ-FLUID4 se pinchó una vez.

Como la bandera está **horneada** pero el reflejo se escala con el uniforme **`uReflejo`**, encender y
apagar el efecto **no re-malla**: por eso el guardián puede medir ON/OFF sobre el mismo VBO.

### Las tres condiciones, y por qué

- **Solo agua.** La lava comparte la pasada translúcida pero **no** se marca (`copia` recibe
  `agua = FT[id]==='WATER'`); su emit es 0/1, nunca dispara `refl`. La lava refleja distinto (es
  emisiva) y el dueño la dejó fuera a propósito.
- **Solo la cara de arriba.** Las caras laterales del agua no reflejan cielo; marcar solo `fd===0` las
  excluye gratis.
- **Solo desde arriba** (`uEye.y > vWorld.y`). Buceando, la cara de arriba se mira por el envés y un
  reflejo de cielo ahí quedaría mal; además el reflejo se apaga entero si el ojo está sumergido
  (`mcFluidoOjo()` en la subida del uniforme).

El Fresnel es Schlick: `fr = pow(1 - clamp(dot(n, vista), 0, 1), curva) · uReflejo`, con la normal
sacada de las **derivadas de la posición de mundo** (`cross(dFdx, dFdy)`), igual que `sunFactor` — o
sea, tampoco cuesta un atributo. A rasante el agua además se **opaca** (`aOut = mix(vAlpha, 1, fr)`),
que es lo que la vuelve espejo en el borde.

### El playground: afinarlo en vivo desde F12

Todo son uniformes ⇒ cambios **instantáneos, sin re-mallar**. Son solo estéticos y solo del agua.

| función | qué mueve |
|---|---|
| `game.reflejoAgua(0.7)` | **fuerza** global (0 = apagado, la válvula; 1 = espejo a rasante). Defecto 0,5 |
| `game.reflejoAgua({fuerza, curva, opacidad, color})` | varias de una vez |
| `game.reflejoCurva(3)` | lo **cerrado** del ángulo: 1 refleja hasta casi de frente (espejo); subirla lo deja solo a rasante. Defecto 5 |
| `game.reflejoOpacidad(0.8)` | cuánto se **opaca** el agua a rasante (0 = sigue transparente; 1 = tapa). Defecto 1 |
| `game.reflejoColor([1,0.6,0.4])` | refleja **ese** color en vez del cielo (un atardecer). `game.reflejoColor('cielo')` vuelve a lo normal |
| `game.cieloColor('#88ccff')` | el **color del cielo** (`MC_SKY`): cambia el fondo **y** lo que refleja el agua a la vez. Acepta `[r,g,b]` 0..1, `#rrggbb` o `'r,g,b'`; `'reset'` vuelve a MC_SKY |

`game.reflejoAgua('reset')` devuelve fuerza/curva/opacidad/color a fábrica; `game.cieloColor('reset')`
el cielo. (Bajo el agua el color de fondo manda `game.vistaAgua`, cosa aparte.)

⚠️ **El cielo de arriba y el tinte de dentro son independientes a propósito.** `game.cieloColor` mueve
`MC_SKY` (fuera del agua); bajo el agua el fondo lo fija `game.vistaAgua({sky})`, un color propio que
por defecto **ignora** `MC_SKY` — bucear no debe dejarte ver el cielo nítido de fuera. El dueño lo notó
(«cambio el color del cielo pero buceando lo sigo viendo azul») y la respuesta fue un interruptor, no
atar los dos: **`game.vistaAgua({sigueCielo:true})`** hace que el tinte de dentro **module** su color
base por lo que haya cambiado `MC_SKY` respecto a su azul de fábrica (`mcCieloEf[i] = sky[i]·MC_SKY[i]/
MC_SKY_DEF[i]`, en `mcActualizaVista`). Con el cielo por defecto el ratio es 1 ⇒ **sale el mismo tinte
de siempre**, así que encenderlo no rompe nada; un atardecer naranja lo entibia y oscurece. Defecto
`false`. Guardián: `test_vista_subacuatica.js` §5b.

**Guardián:** `node tests/test_reflejo_agua.js` (`@area: render`) — mide la **pantalla** (`readPixels`)
sobre una charca en `/map/test`, ON vs OFF con la misma cámara: a rasante aclara y azula, en picado
apenas cambia (prueba que es por ángulo), la lava no se inmuta (prueba que es solo agua), y
`reflejoColor`/`cieloColor` tiñen el reflejo de rojo.

---

## 🏞️ Reflejo realista del entorno en el agua (REQ-ENV5)

Ampliación directa de REQ-FLUID5. El agua no solo refleja el cielo plano sino los **objetos del entorno**:
terreno cercano, nubes de lana, montañas, construcciones, estructuras y agentes.

### Técnica: Cámara especular planar (FBO) + Micro-ondulaciones

1. **Pase especular invertido**: Cuando hay agua visible y `mcReflEntorno > 0`, se renderiza una pasada
   previa a un framebuffer 2D (`mc.refl.fbo`, 512×512) reflejando la posición y cabeceo de la cámara respecto
   al plano de agua ($Y = y_{agua}$, autodetectado o fijado con `game.reflejoPlanoY`).
2. **Inversión de winding**: La reflexión en Y invierte el orden de los triángulos; el pase activa `gl.frontFace(gl.CW)`
   y restaura `gl.frontFace(gl.CCW)`.
3. **Mapeo proyectivo**: La superficie del agua en el fragment shader proyecta las coordenadas de pantalla
   al framebuffer de reflexión (`1.0 - suv.y`), incorporando una sutil perturbación sinusoidal animada
   (`uReflOndas`, modulable con `game.reflejoOndas`).
4. **Textura unidad 3**: La textura de reflexión planar viaja en `TEXTURE3` (`sampler2D uReflTex`), conviviendo
   limpiamente con atlas (`TEXTURE0`), sombra (`TEXTURE1`) y luz de bloque 3D (`TEXTURE2`).

| función | qué mueve |
|---|---|
| `game.reflejoEntorno(true/false)` | activa o desactiva el reflejo de objetos del entorno (defecto 1 / true) |
| `game.reflejoOndas(1.5)` | fuerza de las ondas y ondulaciones superficiales del agua (defecto 1) |
| `game.reflejoPlanoY(14)` | fija la altura $Y$ del plano de agua para la reflexión (`'auto'` o `null` = autodetectada) |
| `game.reflejoSubacuatico(1.5)` | intensidad de la superficie del agua vista desde abajo: Ventana de Snell, refracción, TIR y cáusticas (defecto 0.7; 0 = apagado; `'reset'`) |
| `game.reflejoAbsorcion(1.0)` | absorción espectral y profundidad del agua (Beer-Lambert): amarillo en orilla → turquesa/esmeralda → azul marino (defecto 1; 0 = apagado; `'reset'`) |

**Guardián:** `node tests/test_req_env5_reflejo_entorno.js` (`@area: render`).


