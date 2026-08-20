# La Ley de la Luz

> «La iluminación debe ser real y consistente para todo el motor; no puede haber apaños o trucos
> para quedar bien.»

Éste es el documento maestro de la iluminación de VoxelForge. Todo lo que brilla, alumbra, sombrea u
oscurece en el mundo obedece lo que hay aquí escrito. Y se lee al revés de lo normal: **si algo en la
iluminación se ve mal, no es "un bug raro" — es que algo está infringiendo la Ley de la Luz**, y este
documento dice cuál de sus artículos.

Está contado en tres alturas, de arriba a abajo:

1. **Los Mandamientos** — lo que no se negocia nunca, para grabar a fuego.
2. **Las Leyes** — cómo funciona de verdad, a nivel humano.
3. **El Sótano** — los arrays, las constantes y las funciones, para quien baja al código.

---

## Los Diez Mandamientos

1. **Ni un voxel quedará incorrectamente iluminado.** El campo de luz es el juez de todo lo demás:
   da igual lo bonito que quede un efecto — si una sola celda tiene un nivel que la ley no le da,
   está mal y se arregla.

2. **La ley será una sola.** Todo lo que emite —una antorcha plantada, la espada en la mano, una
   partícula, una pieza montada en un agente— se rige por la misma fórmula, el mismo código y la
   misma tabla de opacos. Un «modelo aparte para este caso» es un apaño, y los apaños están vetados
   por orden del dueño.

3. **No tendrás dos ideas de qué es opaco.** Hay UNA tabla que dice por dónde pasa la luz. Si dos
   sitios del motor preguntan cosas distintas, una vidriera parará una luz y no la otra, y el mundo
   editado dejará de coincidir con el recién cargado.

4. **Lo quieto y lo que se mueve alumbrarán con la misma luz.** El halo de la pieza que llevas en la
   mano es indistinguible del de esa misma pieza plantada en el suelo, porque lo produce el mismo
   código — no una imitación.

5. **La luz no sabrá dónde empiezan ni acaban las celdas.** Girar la mirada un grado, mover un emisor
   un pelo o cruzar de celda no puede pegar un bandazo: la rejilla es cómo se guarda el campo, no
   parte de la ley.

6. **Evaluarás la ley de una vez; no encadenarás restas.** Restar celda a celda arrastra el error de
   redondeo con la distancia. La ley es una función continua: se calcula entera y se redondea una
   sola vez, al guardar.

7. **Poner un bloque no costará el mundo entero — y el atajo será exacto.** La luz se recalcula en
   una caja acotada, y el resultado tiene que coincidir **byte a byte** con el barrido global. Un
   atajo que se parece mucho no es un atajo: es otro modelo de luz.

8. **No confundirás las dos sombras.** La penumbra de interiores (skylight, horneada en el vértice) y
   la silueta del sol en el suelo (mapa de sombra en GPU) son dos sistemas distintos con mandos
   distintos. Confundirlas ES el bug.

9. **No confundirás la difusión con la siembra.** Por dónde se propaga la luz y hasta dónde baja la
   columna de cielo son dos preguntas con dos tablas. Que un material «deje pasar la luz» no abre el
   cielo: un bosque tiene que seguir dando sombra.

10. **No creerás lo que se razona: creerás lo que se mide.** Cada arreglo de luz se demuestra con
    números —informes de foto, comparadores, guardianes—, no con «ahora debería verse bien». Y un
    test en verde en el navegador headless no garantiza la GPU real del dueño.

---

## Las Leyes

### Ley I — La fórmula única (desarrolla los mandamientos 2 y 6)

Toda la luz artificial del motor es esta línea y nada más que esta línea:

```
nivel = MX − máx(0, camino − 1) · k

MX      = pleno del emisor, en subniveles
camino  = distancia Manhattan REAL andada por el aire (fraccionaria: el emisor
          está donde está, no en el centro de su celda)
k       = 1 sin haz · mcLuzFactorHaz(focus, cos) con haz (de 1 de frente a 6 de espaldas)
```

- El `máx(0, camino − 1)` es la meseta de radio 1: pegado al emisor no se pierde nada.
- Con haz, el ángulo se mide entre el **emisor y la celda destino** — nunca entre el haz y el eje del
  paso, que es lo que convertía el cono en una estrella de seis puntas.
- La ley se evalúa **de una vez** contra el pleno (`MX`), no restando al valor del vecino: así el
  error es el de UN redondeo esté la celda donde esté.
- El paso del BFS cuesta **lo que aleja del emisor**, y nunca menos que la recta: en aire libre el
  camino sale igual que la recta, y rodear una esquina se sigue pagando.

El skylight tiene su ley gemela y más vieja: **15 donde ve el cielo, −1 por paso de aire**, y la
penumbra final es el factor `interiorDark^((15−nivel)/15)`.

### Ley II — Las tres luces y quién calcula cada una

| luz | quién la calcula | dónde vive |
|---|---|---|
| **Cielo** (skylight) | `mcComputeLight` (global) / `mcRelightBox` (incremental) | `mc.light`, horneada en el sombreado del vértice al mallar |
| **Emisores quietos** (luz de bloque) | `mcComputeBlockLight`, BFS por el aire | `mc.blockLight`, textura 3D leída por fragmento |
| **Emisores que se mueven** (luz dinámica) | `mcDynBake`, una caja alrededor | `mc.dynLight`, otra textura 3D |

Los dos campos artificiales se mezclan con `max()` — exactamente como se mezclan dos antorchas dentro
de un mismo campo — y **no comparten celdas**: el del mundo salta a los emisores seguidos
(`mcEmisorSeguido`) y el de la caja solo lleva a ésos. Sin esa exclusión, mover una luz obligaría a
re-sembrar el mundo y re-mallar su halo en cada paso.

La luz dinámica **respeta los sólidos por construcción**: es luz de bloque de verdad (misma siembra,
misma difusión, misma tabla de opacos), no una esfera analítica en el shader. Una pared la para porque
el BFS no la atraviesa, no porque un parche lo disimule.

### Ley III — Una sola tabla de opacos (desarrolla el mandamiento 3)

`mcTablaLuz()` es la única respuesta a «¿por aquí pasa la luz?», y la consultan **todos** los caminos:
el barrido global, el incremental y la difusión de la luz artificial.

- **El defecto no se declara**: si la textura del bloque tiene agujeros (`mc.recorte`), la luz pasa —
  «si se ve a través, se ve a través». Roca, tierra y hierba siguen tapando; las cuevas siguen a
  oscuras.
- Toda celda con **geometría fina** también deja pasar (una flor no llena su celda).
- La excepción se pide por material: `game.bloques.define(clave, { luz:'pasa' })` o `luz:'tapa'`
  (una vidriera de recorte que SÍ debe sombrear).
- La tabla se construye **una por llamada**, a propósito: sus dos fuentes cambian sin avisar y una
  tabla cacheada se quedaría vieja sin que nadie la invalidara.

### Ley IV — Difusión ≠ siembra (desarrolla el mandamiento 9)

- `mcTablaLuz()` gobierna la **DIFUSIÓN**: por dónde se propaga la luz una vez sembrada.
- `mcTablaCielo()` gobierna la **SIEMBRA**: hasta dónde baja la columna de cielo por la vertical.

`luz:'pasa'` **no** abre la columna — un dosel de hojas sigue dando sombra a lo que tiene debajo, y es
una decisión, no un olvido. Lo único que abre la columna es `proyectaSombra:false` («yo no proyecto
sombra», el material de las nubes) y la geometría fina (su sombra real ya la dibuja el mapa del sol).

### Ley V — Las dos sombras (desarrolla el mandamiento 8)

| | qué es | mando |
|---|---|---|
| **Skylight** | oclusión ambiental horneada en el sombreado de cada vértice; oscurece cuevas e interiores | `game.interiorDark` |
| **Sombra del sol** | mapa de sombra en GPU que dibuja la silueta en el suelo | `game.sunShade`, `game.shadowSuave`, `game.sunShadeNoche` |

Son caminos separados: uno vive en la malla, el otro en el fragment shader. El mapa de sombra tiene
**una sola fuente, el sol**: las luces artificiales no proyectan sombra (otra fuente sería otro mapa y
otra pasada de geometría). Un material se saca de las dos con `recibeSombra:false` /
`proyectaSombra:false`, que viajan sumadas al sombreado del vértice — y por eso **cambiarlas invalida
las mallas cacheadas** aunque no se mueva un voxel.

### Ley VI — La continuidad (desarrolla los mandamientos 1 y 5)

El suelo irreducible del campo es **1/4 de nivel** (`MC_LUZ_SUB`): por debajo de eso no hay nada que
arreglar; varios niveles de golpe son un artefacto, siempre. Para que ningún escalón artificial supere
ese suelo:

- La posición del emisor (`OR`) se guarda a **1/32 de bloque** y el camino andado (`DI`) a **1/128**:
  sus escalones de cuantización quedan por debajo de lo que el campo sabe representar. No son detalles
  de almacenaje — son escalones de la ley.
- La siembra es **UNA sola rutina**, con haz y sin él, y cubre los dos anillos completos (las
  diagonales pegadas al emisor son donde el error angular es enorme).
- El campo se resuelve en **DOS PASADAS: primero lo que no tiene haz**. Cada celda guarda un solo
  emisor y quien la gana corta al otro; con el cono resuelto primero, una celda suya estrangulaba a la
  antorcha para siempre. El orden es correcto, no un apaño: si un cono pierde una celda frente a una
  omnidireccional, tampoco puede ganar más allá (su `k` nunca baja de 1).
- La pena del haz se cuenta en **subniveles** y se redondea **una vez, al guardar**.

Y el juramento que lo resume: **`cruzarCelda` no puede moverse nunca.** Si el campo cambia porque el
emisor salta de celda, hay artefacto, punto.

### Ley VII — El coste (desarrolla el mandamiento 7)

- Editar un bloque relanza la luz **solo en una caja**: ±17 en X/Z y la columna entera en Y (la luz
  pierde 1 por paso, salvo hacia abajo, donde una columna cambia el cielo de arriba abajo de una vez).
  Las celdas de fuera no han podido cambiar, así que valen de condición de contorno: el resultado es
  **exacto**, y lo comprueba celda a celda un guardián.
- Una ráfaga de script re-malla **su caja** (`mcBuildBox`), no el mundo; con vuelta al barrido global
  solo cuando la caja más su halo no compensa.
- Los emisores no se buscan barriendo la rejilla (60 ms en un mundo grande): hay un índice disperso
  (`mcGlowCeldas`) que se corrige celda a celda al editar.
- Si nada que afecte al BFS cambió, la pasada entera es un no-op (firma de emisores + generación de
  topología).

### Ley VIII — La medida (desarrolla el mandamiento 10)

Una foto (Alt+F) no es una foto: es un estudio. Cada captura corre los **informes de luz** y guarda
sus números en la ficha:

- `luz-continuidad` — el bandazo, medido en el sitio: `girarHaz` (1° con el emisor clavado),
  `moverEmisor` (1/32 de bloque) y `cruzarCelda` (el que no puede moverse nunca).
- `luz-campo` — el campo medido contra la ley; `desvio.max` es cuánto se aparta el motor de su propia
  ley.
- `luz-tope` — por qué se pierde la luz que falta; su residuo vivo es `caminoVsRecta` (`sobra` ≈ 0 en
  aire libre, o la luz llegó por donde no era).
- `luz-agujeros` — celdas que la ley enciende y el frente del BFS no alcanza.
- `luz-barrido` — la referencia sintética en aire libre; `anisotropia` 1,00 = cono perfecto.

Dos fotos se comparan con `herramientas/comparar_fotos.py`. Y la advertencia que ya mordió: el
navegador headless de los tests (SwiftShader) **tolera errores de GPU que una tarjeta real no
perdona** — lo que decide es la pantalla del dueño.

---

## El Sótano

Para quien baja al código. Las líneas exactas no se escriben aquí (mienten con el tiempo): cada
símbolo se busca en `SYMBOLS.md`.

### Los campos y sus bytes

| array | tipo (por celda) | qué guarda |
|---|---|---|
| `mc.light` | Uint8 | skylight 0..15 |
| `mc.blockLight` (`BL`) | Uint8 ×4 | r, g, b y nivel — todo ×`MC_LUZ_SUB` |
| `BD` | Int8 ×3 | haz de la celda, ×100 |
| `OR` | Int16 ×3 | posición del emisor, ×`MC_LUZ_ORG` |
| `DI` | Uint16 | camino andado, ×`MC_LUZ_DRES` |
| `MX` | Uint8 | pleno del emisor, en subniveles |
| `mc.dynLight` | caja (`mcCampoLuz`) | el campo de lo que se mueve |

`OR`, `DI` y `MX` existen para que la difusión pueda **evaluar la ley** (ángulo y distancia reales
celda↔emisor) en vez de encadenar restas; solo se reservan con foco. Los campos suben a la GPU como
texturas 3D (`sampler3D`, **cada una en su unidad, nunca la 0** — chocar con el atlas invalida el draw
y no se ve NI UN BLOQUE; por eso hay dummy 1×1×1 atada siempre).

### Las constantes

| constante | valor | qué es |
|---|---|---|
| `MC_MAXLIGHT` | 15 | niveles de gradación y alcance. **NO es la intensidad**: para más brillo, `game.glowGain` |
| `MC_LUZ_SUB` | 4 | subniveles por nivel — el suelo de 0,25 |
| `MC_LUZ_ORG` | 32 | resolución de `OR` (1/32 de bloque; Int16 ⇒ mundos de hasta 1023 de lado) |
| `MC_LUZ_DRES` | 128 | resolución de `DI` (1/128 de bloque) |
| `MC_RELIGHT_R` | 17 | radio de la caja del skylight incremental (15 bastaría; 2 de margen) |
| `MC_DYN_SEMILLAS` | 160 | tope de voxeles emisivos móviles (los más cercanos al ojo **que pueden sembrar**) |
| `MC_DYN_CELDAS` | 450 000 | presupuesto de la caja dinámica; al pasarse, la caja se **encoge hacia el ojo** — nunca se apaga una luz |
| `MC_INTERIOR_DARK_MAX` | 4 | tope de `game.interiorDark` (>1 = revelado de inspección) |
| `MC_SHADOW_SUAVE_MAX` | 4 | tope de `game.shadowSuave`; más allá, el PCF hace ruido, no suavidad |

### Las funciones (símbolo → papel)

| símbolo | papel |
|---|---|
| `mcTablaLuz` / `mcTablaCielo` | las dos tablas: difusión / columna de cielo |
| `mcComputeLight` / `mcRelightBox` | skylight global / incremental — **mismos predicados, sin excepción** |
| `mcComputeBlockLight` | luz de bloque de los emisores quietos (dos pasadas) |
| `mcGlowCeldas` / `mcGlowTocada` / `mcRecomputeHasGlow` | el índice disperso de emisores en la rejilla |
| `mcCampoLuz` | el descriptor de un campo (BL, BD, OR, DI, MX y su caja) |
| `mcLuzFactorHaz` / `mcLuzPenaHaz` | la ley del foco entera, en una línea (en niveles / en subniveles) |
| `mcLuzSiembra` | la siembra única: celda MUESTRA + dos anillos completos |
| `mcLuzDifunde` | el BFS por buckets con coste variable ≥1 |
| `mcDynSync` / `mcDynBake` | recolectar los emisores vivos / rehacer la caja dinámica |
| `mcDynNivel` | leer el nivel dinámico de una celda (lo usan los informes) |
| `mcLuzDiag` | la radiografía: `game.luz.diag()` |
| `mcUploadBlkTex` | subir la textura 3D cuando el campo cambia |
| `mcRenderShadow` / `mcShadowDirty` / `mcSunUniforms` | el mapa de sombra del sol y sus uniformes |

### Los mandos

| mando | qué toca |
|---|---|
| `game.glowLevel` | ALCANCE (0..15). `game.flowFocus` **no existe**: es la errata de siempre |
| `game.glowFocus` | FOCO del haz (0 = antorcha, 1 = haz fino) |
| `game.glowGain` | INTENSIDAD (>1 sobreexpone). Solo un uniforme: live y barato |
| `game.interiorDark` | penumbra de interiores (defecto 0,1; **el apagado es el 1 EXACTO**; >1 revelado) |
| `game.luz` | exposición global (noche). La luz artificial la resiste |
| `game.sunShade` / `game.sunShadeNoche` / `game.shadowSuave` | la sombra del sol: fuerza, fuerza de noche, borde |
| `game.luzDinamica` | ¿se siembra la caja de lo que se mueve? (`game.luzOcluye` ya no hace nada: quedó dentro de la ley) |
| `game.luzSuave` | ¿la caja se muestrea en la posición fina del emisor o en el centro de su celda? |
| `game.luzDinCeldas` | presupuesto de celdas de esa caja |
| `game.agentsLightTracking` | ¿la luz sigue a los agentes en movimiento? |
| `game.bloques.define(clave, {luz, recibeSombra, proyectaSombra})` | las excepciones por material |

### Juramentos del que toca el código

Cada uno de éstos ya mordió una vez. Romperlos es reincidir:

- **El «apagado» de `interiorDark` es el 1 EXACTO, nunca `>=1`**: con `>1` la sobreexposición necesita
  `mc.light` calculada.
- **`mc.hasGlow` solo se enciende, nunca se apaga aquí**: con `BL` a cero se ve igual, y apagarla
  pisaría el mallado a medio poblar.
- **El coste de un paso del BFS es entero y ≥1**: el nivel destino siempre baja y cae en un bucket
  posterior — eso es lo que hace válida la relajación. Un coste 0 rompe el orden.
- **`OR` viaja siempre con la luz; `BD` se borra cuando no hay haz** — si no, la celda hereda la ley
  del dueño anterior.
- **La celda de un emisor sólido es MUESTRA**: se marca para las caras a ras, pero no propaga.
- **El pleno de un emisor no es su alcance**: la siembra escala el color al alcance y `MX` guarda el
  canal más fuerte. Un informe que evalúe la ley con `s.nivel` a pelo apunta artefactos inexistentes
  (pasó: 4,17 niveles de fantasma).
- **Cambiar `mcTablaLuz`/`mcTablaCielo` o las banderas de sombra invalida las mallas cacheadas**
  aunque no se mueva un voxel: entran en la firma del chunk.
- **`mcComputeLight` y `mcRelightBox` usan los mismos predicados, sin excepción** — un `if` de
  diferencia y el mundo editado deja de coincidir con el recién cargado.
- **El reparto de semillas dinámicas pregunta lo mismo que la siembra** (`mcLuzPuedeSembrar`): sin
  eso, 154 de 160 plazas se las llevaban emisores fuera del mundo y las luces reales se apagaban
  enteras al andar.

### Los guardianes

`test_luz_incremental_navegador.js` (el incremental es exacto) · `test_luz_traspasa.js` (recorte y
`luz:'pasa'/'tapa'`) · `test_luz_en_rejilla.js` (mismo perfil por las dos vías) · `test_luz_global.js`
y `test_luz_artificial.js` (exposición y su resistencia) · `test_sin_sombra.js` y
`test_shadow3_mandos.js` (las dos sombras) · `test_glow7_topes_luz.js` y `test_glow8_luz_una_sola.js`
(los mandos y la ley única) · `test_agente_luz_sigue.js` (la luz que sigue). Y los informes de foto,
que son los que miden **en el mundo del dueño**, no en el del test.

---

Relacionado: [Iluminación y ambiente](#/iluminacion) (los mandos estéticos: cielo, agua, niebla) ·
[Depurar un snippet](#/depurar) · la [referencia de API](#/api).
