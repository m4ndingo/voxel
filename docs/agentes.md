# Agentes / NPC articulados (`game.esqueletos`)

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## Ir montado en una pieza de un agente (REQ-MNT1 · REQ-MNT2)

**El sitio normal de la marca es el DOCUMENTO del agente**, casilla «te lleva montado» del editor
(REQ-MNT2). Es un campo más de la pieza, al lado de `articula` y `mirar`, y vale también en la raíz
(un agente-plataforma no tiene más pieza que su torso):

```json
{ "nombre": "cabeza", "pieza": "asset:assets/cabeza-zombie.vox.json", "en": [...], "montable": true }
```

Así **todos** los que plantes nacen con ella y no hay que llamar a nada. El reparto es el de §0: la
casilla es UI y va en `app.js`, que solo escribe la clave; **quien la aplica es el snippet**
(`crearEsqueleto` la copia a la parte al plantar). Apagarla **borra** la clave, así que un agente que
no la use se guarda igual que antes.

⚠️ `crearEsqueleto` **no reenvía `def.raiz`**: se fabrica la pieza 0 a mano con cuatro campos
elegidos. Todo campo nuevo del documento hay que traerlo ahí explícitamente o no llega a la raíz.

Y la **válvula por instancia**, que sigue viva y manda sobre el documento **en los dos sentidos**
(mismo patrón que `mc.finoExtra` sobre `mc.finoRejilla`):

```js
game.esqueletos.montable(1, 'cabeza');          // enciéndela en ESE bicho aunque su documento no la traiga
game.esqueletos.montable(1, 'cabeza', false);   // ...o apágala aunque sí
```

Va por **instancia y pieza** (la cabeza de *ese* zombie), no por material — que es justo la
diferencia con `game.bloques`, donde el comportamiento cuelga de la clave. El acarreo vive **entero
en el snippet**, `app.js` no tiene ni una línea de él: es comportamiento de agentes (§0) y `esqueletosPaso` ya
corre por frame, ya compone la matriz de cada miembro y es **lo último del frame del jugador**
(después de la física, de `pisar` y de `suavizarPaso`), o sea la misma posición en la cadena que
ocupa el acarreo de los NPC-cubo.

⚠️ **No confundir con `passengers`** (`app.js:10966`). Ése es de `mc.agents`, los **NPC-cubo**, y su
`isMounted()` está cableado a la caja 1×1×1 (`ry+1.9..ry+2.5`): no se ejecuta ni significa nada para
un agente articulado. Ver «dos sistemas de agente» en la sección del toast «Atascado».

⚠️ **El acarreo es RÍGIDO**: `L = Rᵀ·(p − t)` con la matriz del frame anterior, `p' = R'·L + t'` con
la de éste. Por eso el **giro también te lleva** (orbitas) en vez de dejarte resbalar cuando la pieza
se vuelve. Misma traspuesta que la atribución del abrazo y que la solidez de las piezas movidas
(BUG-AG4). Tres cosas que hay que respetar si se toca:

- Se mide y se escribe sobre la **Y física** (`mc._pasoDesfase ? mc._pasoReal : mc.pos[1]`), y **por
  delta**, o `suavizarPaso` y esto se pisan.
- El guardia de colisión es **«no empeorar»**, no «no chocar»: de pie encima ya rozas la caja
  inflada de la pieza, así que exigir un destino limpio no te subiría jamás.
- La matriz **se reusa** cada frame (`matrizDe`), así que la anterior hay que **copiarla** antes de
  recomponer o se compara consigo misma.

No gira la cámara contigo (como una vagoneta). Tests: `node test_montar_agente.js` (el invariante del
acarreo) y `node test_montable_editor.js` (la casilla del editor y que la marca llegue al Mundo sin
llamar a nada).

## El toast «Atascado» dice POR QUÉ, y si es un agente dice CUÁL y QUÉ PIEZA (REQ-DBG2)

`mcStuckShow(true)` ya no pone un cartel mudo: llama **una vez, en el flanco** a `mcStuckWhy(x,y,z)`,
que mira quién solapa la caja del jugador y devuelve `{atascado, motivo, terreno[], piezas[],
npcs[], cuando}`. `mcStuckMotivo` lo resume para el toast por orden de utilidad —**piezas con
etiqueta → NPCs → piezas sin etiqueta → terreno**— y con más de un culpable dice `«torso» de zombie
(+2 más)` en vez de escupir la lista. Lo mismo bajo demanda con **`game.atasco()`** (dónde estás
ahora) y **`game.atasco('ultimo')`**, que guarda el último con su `cuando`: el toast dura 4 s y la
consola del móvil se abre después.

⚠️ **`npcs[]` NO son los agentes articulados.** Son los NPC-cubo de `mc.agents` (`game.defineAgent`,
1×1×1, malla propia), que es **otro sistema** que `game.esqueletos`/`game.agentes`. Un zombie está
hecho de estructuras finas, así que sale en **`piezas[]`, un miembro por entrada**. El campo se
llamaba `agentes` y el dueño se topó de frente con la trampa: un zombie abrazándole y un
`agentes: []` al lado. Si vuelve a hacer falta un nombre, que no sea «agente» a secas.

**El nombre bonito NO lo pone `app.js`: es el hueco `mcStuckExtra(s) => 'texto'`**, hermano exacto de
`mcXrayExtra` y `mc.sunExtra` (§0: el motor expone la capacidad, el snippet decide). El motor sabe
que le estorba la estructura `asset:assets/brazo-zombie.vox.json`; que **esa instancia** es el brazo
izquierdo del zombie de la esquina solo lo sabe la tabla de rigs, que vive en
`mundo-autoarranque` (`quienAtasca`, puesto por `parche_snp_atasco.py`). Es `var` y no `let`, o un
snippet en `new Function` no podría engancharse; si el hook lanza se **desengancha y avisa una vez**.
Se nombra siempre **la pieza Y el agente**, porque con dos avisos idénticos no se sabe si te agarran
dos bichos o uno con los dos brazos — que es el «abrazo» que motivó el ticket. Y el agente va por su
**instancia**, `nombre (#id)`: «personaje 1» no identifica a nadie cuando hay tres personaje 1 en el
mapa, porque ése es el nombre de la *definición*. El `#id` además es accionable —
`game.esqueletos.empujar(id)` / `.quitar(id)` / `.aturdir(id)` aceptan ese número—, así que del aviso
se pasa a quitárselo de encima sin buscar nada.

Por eso el hueco admite **dos formas**: una cadena, o un objeto `{texto, agente, agenteId}` que
`app.js` copia tal cual a la ficha de la pieza. `motivo` es prosa y de la prosa no se saca un número:
con `agenteId` como **campo** se encadena `game.atasco().piezas[0].agenteId` → `empujar(id)` sin una
regex por medio. El motor no sabe qué es un rig — copia tres campos y no los mira; sin snippet no
pone ni `agente` ni `agenteId`.

⚠️ **`mcStuckWhy` busca en DOS sitios, y el segundo es el que importa.** El bucle normal recorre
`mc.structures` con `mcStructColl(s)`, pero para una pieza de rig eso devuelve **`null`**: el
envoltorio del snippet apaga su ancla, porque la pieza se dibuja en otro sitio y su solidez la pone
el envoltorio de `mcFineBoxHit` pasando la caja por la **inversa de `s.model`** (BUG-AG4, ver «La
solidez son tres envoltorios»). Mirando solo las anclas, un agente articulado **no aparece jamás**.

⚠️⚠️ **Y en la segunda pasada NO se puede preguntar por puntos.** Es la lección cara del ticket, y
cuesta un día si se ignora: para una pieza movida, la colisión mete la caja **entera** del jugador en
el espacio local de la pieza y redondea **hacia fuera** (`cajaEnLocal`, `floor`/`ceil` — el snippet lo
dice: *«antes sobrar que faltar»*). O sea que **te frena un brazo que todavía no te toca**, y el
abrazo *es* justo esa holgura. Preguntando `mcStructAt` en el voxel exacto no hay **nadie en ninguna
celda** de tu caja: medido, `mcCollides`=`true`, `mcFineBoxHit`=`true` y `mcStructAt`=`null` en las
~3000 celdas, con el brazo a **un voxel fino** por fuera. Un muestreo en rejilla y una bisección
sobre `mcFineBoxHit` fallan las dos —la rejilla se salta la esquirla y la bisección se mete en
mitades vacías, porque el oráculo que la guía está inflado—.

Lo que sí funciona es **atribuir como dibuja el motor**: se pasa la caja del jugador al espacio local
de cada pieza con la **traspuesta** de `s.model` (la 3×3 es ortonormal ⇒ inversa = traspuesta), se le
suma `MC_STUCK_HOLGURA` y se cruza con `s.aabb`. Es `O(estructuras)`, sin sondeos, y se ordena por
volumen de solape: en un abrazo la primera que se nombra es **la que más te agarra**. Ojo con la
tentación de comparar dos cajas de mundo con una holgura fija: no vale, porque una pieza inclinada
convierte la caja del jugador en un AABB local mucho más gordo y por eso agarra desde lejos.

**`w.atascado` sale de `mcCollides`, no de mis listas.** Si se toma de lo que se ha sabido nombrar, un
culpable que se escape se convierte en `atascado:false` con el cartel rojo puesto — pasó, y es lo que
destapó todo esto. Cuando choca y no hay nombre, `w.sinIdentificar` y el motivo lo dice en voz alta
(«algo que no consigo identificar»): callar parece que no pasa nada.

`mcStuckWhy` **duplica a propósito** los bucles de `mcTerrenoChoca` y `mcFineBoxHit` en vez de
compartirlos: esas dos deben quedar **byte-idénticas** porque el snippet las envuelve y
`test_rayo_apuntado.js` las extrae *verbatim* por texto. Test: `node test_atasco_motivo.js`.

### `seguir` — la pieza se mueve de sitio (v1.18)

Es la primera capacidad que **desplaza** una estructura. Mover una estructura en este motor tiene dos
mitades que se pueden desincronizar, y casi todo el diseño va de mantenerlas pegadas:

| | dónde vive | ¿sabe de `s.model`? |
|---|---|---|
| lo que se **ve** | `s.model` (matriz por instancia) | sí: culling (`app.js:5249`) y sombra del sol (`app.js:4758`, `4789`) ya transforman por ella |
| lo que se **toca** | bitset fino de `mc.structs[key]` | **no**: se sondea con base `bx = s.ox*T` (`app.js:5064`) |

**Por qué el movimiento NO toca `s.ox/oy/oz`.** El ancla es lo que `mcSerialize` escribe en
`mundo.json` (`app.js:6333`) y lo que al cargar se trunca con `|0` (`app.js:6358`). Moverla dejaría la
pieza dando saltos de bloque entero y **guardaría una posición que el dueño no puso**. Así que el
desplazamiento va en `s.model` (traslación en la última columna) y el ancla se queda quieta.
Consecuencia buscada: **al recargar el mundo la pieza vuelve a su ancla**.

**La solidez son tres envoltorios, ninguno en `app.js`** (§0). Todo el sondeo fino del motor entra por
dos globales, así que basta envolverlas:

1. `mcStructColl(s)` → `null` si la instancia está desplazada. Con eso **el ancla deja de ser sólida**
   en cuanto la pieza se va (si no, quedaría un muro invisible donde estaba), y vale de golpe para
   colisión, raycast, pegar bloques y el resaltado.
2. `mcFineBoxHit(...)` → si el original dice que no, resta el desplazamiento (redondeado a voxel fino)
   a la caja de consulta y prueba el mismo bitset. Como **toda** la colisión fina pasa por aquí, con
   un solo envoltorio la pieza es sólida para el jugador, para el rayo de romper y para pegar bloques.
3. `mcStructAt(...)` → lo mismo, para poder **romperla donde se la ve**.

Salida rápida: si no hay ninguna desplazada, los tres devuelven lo del original sin mirar nada
(`mcCollides` se llama varias veces por frame **y por eje**).

**Detalles que no se adivinan:**

- Con `ejes:'xz'` la distancia se mide **en planta**, y la Y la manda el suelo (`mcSurfaceNear` sobre
  la **huella entera**, quedándose con la columna más alta). Sondeando solo la columna del centro, un
  escalón se comporta como un muro: lo tiene bajo el morro y no bajo el centro.
- Seguir a **otra pieza** usa los centros **leídos antes de mover a nadie**. Ese desfase de un frame
  es lo que hace que el orden del array no importe y que un ciclo (A sigue a B y B sigue a A) sea una
  pareja que se persigue, no un cuelgue.
- `distancia` es un **sitio donde estar**, no un mínimo: si te acercas de más, retrocede.
- La `correa` pinza la **meta**, no el resultado: pinzar el desplazamiento después de moverse sería un
  tirón hacia el ancla sin comprobar el terreno por el camino.
- Quitar `seguir` (o `quitar()`, o redefinir sin él) **recoge la pieza**. Es obligatorio: una pieza
  desplazada sin nadie que la mueva se quedaría ahí para siempre y, como el ancla ya no es sólida,
  sería un fantasma permanente. Un `define` que **sí** trae `seguir` no la recoge, para que afinar
  `velocidad` no sea un teletransporte a media persecución.

**Límites conocidos** (a propósito, no pendientes):

1. **Sin pathing**: va en línea recta y resbala por las paredes; un laberinto la atasca (`por = 3`).
2. **La luz emisiva no se mueve**: `emitCells` se siembra desde `s.ox` (`app.js:4908`), así que el
   brillo de una pieza emisiva se queda en el ancla.
3. **La sombra de suelo del aabb** (`app.js:6433`) usa `s.aabb`: se queda en el ancla.
4. **No te lleva encima**: si estás subido y se mueve, no te arrastra (no hay plataformas móviles).
5. **La colisión no gira**: con `mirar`, la forma sólida es la horneada sin el giro — igual que hoy.
6. **Dos seguidores no chocan entre sí**: a propósito. Sí chocan con el **decorado** desde v1.24
   (abajo); lo que no se sondea son las estructuras **desplazadas**, que son justo los demás
   seguidores.
7. **Se guarda el ancla, no el sitio.**

#### El decorado también para a un agente (v1.24)

Hasta v1.23 un seguidor —el zombie, el perro— **atravesaba las casas**: el sondeo miraba solo
`mc.grid`, así que el terreno le paraba y las estructuras no. Ahora `pasoSeguir` prueba **las dos
solideces** (`chocaMundo = chocaTerreno || chocaEstructura`), y la fina pasa por
**`mcFineBoxHit._orig`** — el original, no el envoltorio de v1.18. Es lo que mantiene el límite 6: el
envoltorio es quien añade las estructuras **desplazadas**, o sea los demás seguidores, y saltárselo
evita además pagar un barrido fino por eje y frame sobre piezas que se están moviendo. Lo que se
sondea es el **decorado**, que es lo que se queda quieto. El sondeo se marca con el mismo centinela
`yoSondeando` que ya evitaba que una pieza se encontrara a sí misma.

**«Como hacen los bloques» tiene dos mitades**, y la segunda es igual de importante: un bloque de 1 de
alto **se sube**, no para. Así que en `asentar`, si lo que estorba es **solo** estructura
(`!chocaTerreno && chocaEstructura`), se prueba a treparla en pasos de 1/16 hasta 1 bloque —
exactamente lo que el jugador hace con `mcMoveAxis`/`MC_STEP` y lo que `mcSurfaceNear` ya le sube al
agente por el terreno. Sin esto, una alfombra o un bordillo de 1/16 sería un muro invisible. Un muro
de más de un bloque sigue parando, porque ninguna de las 16 alturas queda libre.

⚠️ **Consecuencia nueva: un agente plantado DENTRO de una estructura nace atascado para siempre.**
`mcSurfaceY`/`mcSurfaceNear` solo leen `mc.grid`, así que eligen una altura ciega al decorado; antes
daba igual porque se atravesaba, y ahora no. Se ve en `game.esqueletos.lista()` como `por: 3`
(`estado: "bloqueada"`) sin haberse movido nunca. Si pasa, plantar el bicho en otro sitio.

#### El clic izquierdo sobre un agente es un GOLPE, no un roto (v1.25)

Un agente **no se rompe a clics**. Antes sí: `mcBreak` (`app.js:6414`) marcha el rayo fino desde el
ojo y **retira entera** la primera estructura que toca, y si es `efimera` se va además **sin historial
y sin guardar** (`app.js:6426`) — que es exactamente lo que son sus piezas. Y como la única pieza
**sólida** de un rig es su **raíz** (las extremidades no tienen colisión), lo que el rayo encontraba
era el torso: el clic se llevaba *el cuerpo* y quedaban cinco miembros congelados en el aire.

Ahora ese clic **empuja**, como pegarle a un mob de Minecraft: el bicho sale despedido hacia atrás,
**pega un brinco** y vuelve andando. Se hace envolviendo `mcBreak` desde la librería (**ni una línea
de `app.js`**, §0), repitiendo **su mismo rayo** — mismo ojo, mismo paso de 1/16, mismo alcance — para
saber qué gana: si lo primero que toca es una pieza de agente, el clic **se come ahí**, así que
tampoco se rompe el terreno de detrás. Cualquier otra cosa va al original y se rompe como siempre.
**Para retirar un agente está `game.esqueletos.quitar(id)`**, no el pico.

```js
game.esqueletos.empujar(rig)              // el golpe a mano: lo aleja del jugador (lo que hace el clic)
game.esqueletos.empujar(rig, 20)          // ...con la fuerza que se diga (0 = la del documento)
game.esqueletos.empujar(rig, 8, 1, 0)     // ...o en la dirección que se diga (en planta)
```

En el documento del agente, opcional: `empuje: { fuerza: 8, freno: 0.15, salto: 4.5 }` (u/s, τ del
frenado en s, y velocidad vertical del brinco). Sin ponerlo, todos los bichos ya golpean igual.

**Dos cosas que no son detalles:**

1. **El empujón es una velocidad que se frena sola, no un teletransporte.** De ahí salen gratis que
   se pare contra una pared (mueve la raíz por `moverRaiz` → `asentar`, la misma colisión que un
   paso) y que el bicho **vuelva solo**, porque el que persigue sigue persiguiendo mientras vuela.
2. **El brinco no puede vivir en `g.y`.** Con `ejes:'xz'`, `asentar()` **reescribe** la Y de la raíz
   desde el suelo cada vez que la pieza se mueve — pero *solo* cuando se mueve. Va aparte (`alto`,
   altura sobre el suelo), se **descuenta antes de andar** y se vuelve a sumar después; dejándolo
   puesto se acumula en los frames en que el bicho está quieto y el zombie acaba en el cielo.

Y el efecto colateral que faltaba: si a un rig le desaparece la raíz por cualquier otro camino (un
script, una versión vieja), **se retiran sus piezas sueltas y el agente se da de baja** en vez de
quedarse a medias. La condición distingue eso de un `mcRestampAll`, donde faltan **todas** a la vez y
lo correcto es esperar a que vuelvan.

**Límites, a propósito:** el empujón avanza **eje a eje y sin sub-paso**, igual que andar, así que un
golpe fuerte contra una pared muy cerca lo deja quieto en vez de pegarlo a ella; el golpe **no hace
daño** (no hay vida ni combate) y **no hay animación de dolor**.

#### Los agentes pisan el mismo suelo que tú (v1.26)

Las conductas de `game.bloques.define` (`velocidad`, `altura`, `deslizamiento`, `impulso`) estaban
escritas **solo para el jugador**: son envoltorios de `mcPlayerStep` que tocan `mc.speed`,
`mc.vel[1]` y `mc._deslizVel`. Un agente articulado andaba por encima de todo eso: sobre hielo iba
igual de lento, el trampolín no le hacía nada y un borde no le hacía caer.

v1.26 lee **esa misma tabla** desde los pies del bicho, con `sueloDe(aabb, g)`: medio voxel **bajo**
su caja, en el centro de la huella y con la **misma identidad de flanco** (celda + clave de
material) que usa `pieEn` para el jugador. Va **encendida por defecto** — un agente que ignora el
suelo que pisa es el fallo, no la conducta normal. En el documento del agente:

```js
fisica: { marcha:true, desliza:true, impulso:true, cae:true, placas:false, peso:1, caida:12 }
fisica: false   // apagada entera
```

- **`marcha`** — el `velocidad` del bloque multiplica su paso (hielo ×2, barro ×0.5).
- **`cae`** — `asentar()` pega la raíz al suelo de su nueva columna **de golpe**; ese salto hacia
  abajo se convierte en altura sobre el suelo (`mov.alto`) y **cae**, con la misma `GRAVEDAD` (22)
  que tú. `caida` son los bloques que **se atreve a bajar**: más que eso y no da el paso.
- **`impulso`** — el trampolín lo lanza, dividido por `peso` (un bicho pesado bota menos). Dispara
  **una vez por flanco**, con la misma clave `pisada` que evita el rebote infinito del jugador.
- **`desliza`** — al dejar de andar sigue rodando; el `deslizamiento` del material es la τ del
  frenado exponencial, no una distancia.

**Tres decisiones que no son detalles:**

1. **`alPisar` NO se dispara** (`placas:false` por defecto). Los `alPisar` ya escritos están
   pensados para el jugador y llaman a `game.tp(...)`: un zombie pisando una placa **te
   teletransportaría a ti**. Se enciende a sabiendas, con un `alPisar` que mire quién pisa.
2. **El brinco y la caída viven en `mov.alto`, no en `g.y`**, por lo mismo que el golpe de v1.25: en
   `xz` la Y de la raíz la **reescribe** `asentar()` desde el suelo cada vez que la pieza se mueve.
3. **El camino del jugador queda byte a byte igual**: la física del agente entra por un parámetro
   opcional al final (`F`) que solo pasan los esqueletos, así que `seguir` por material no cambia de
   comportamiento.

⚠️ **`asentar()` solo corre cuando el agente SE MUEVE** — vive dentro del `if (vd >= 1e-4)` de
`pasoSeguir`. O sea que un agente que no anda **nunca toca el suelo**: se queda flotando donde lo
plantaste, y la gravedad de `mov.alto` no lo baja porque `mov.alto` mide desde una `g.y` que nadie ha
calculado. Es la misma trampa por los dos lados: congelar un agente en un test con
`rig.G.velocidad = 0` apaga `asentar()` y da verdes falsos, y el modo **quieto** (agente sin «te
persigue», BUG-AG3) tiene que llamarlo **a mano**.

**Apagar «te persigue» no apaga el agente** (BUG-AG3). `seguir:false` planta una **estatua que te
mira**: `G.quieto` reusa el estado de «te he perdido de vista» (`g.por = 1` ⇒ postura de reposo, ni un
paso), y `mirar` (por pieza) y `empuje` (por documento) son capacidades **aparte** que siguen
funcionando. Lo que **no** hace es girar el cuerpo hacia ti — eso es del que persigue
(`if (g.por !== 1 && hay)` en `esqueletosPaso`); solo le sigue la cabeza.

**Trepar (escaleras) se queda fuera a propósito**: `trepableEnColumna()` está atado a las claves de
`mc.pos` y hay que extraerlo para que acepte una caja cualquiera. Es un trabajo aparte, no un olvido.

Test: `§18` de `node test_bloques_comportamiento.js` — velocidad ×1/×2/×0.5, caída de 4 bloques,
`impulso:12` subiendo los 3,17 bloques que predice `v²/2g`, y el patinazo de hielo pasándose de largo
(1,199 frente a 0,716 en seco).

#### El panel enseña TODAS las capacidades, una tarjeta cada una

El formulario del panel de Agentes enseñaba 4 de los ~20 parámetros del bicho entero, y `empuje`
(v1.25) y `fisica` (v1.26) **no aparecían por ninguna parte** aunque el agente las tuviera: se podía
tener encendido algo que el panel no sabía contar. Ahora el bloque «El bicho entero» son **tarjetas
plegables**, una por capacidad (`seguir` 👁, `andar` 🚶, `empuje` 👊, `fisica` 🧊, `cuerpo` 🧱), más las
dos por pieza que ya existían (`articula` 🔩, `mirar` 👀). Plegada, la tarjeta dice si está encendida y
con qué valores; abierta, saca **todos** sus parámetros. Bajo el preview hay una fila de **chips** con
lo mismo resumido, para leerlo sin abrir nada.

**Tres reglas que no son cosméticas:**

1. **Los valores por defecto son los de la librería, y salen en gris (`.def`).** Un campo vacío o a 0
   mentiría: `distancia:0` significa «se te echa encima» y es lo contrario de «no lo he tocado». Los
   números que ves cuando el documento no trae la clave son los que `normalizarSeguir`/`crearEsqueleto`
   /`normalizarFisica` van a usar de verdad.
2. **Abrir el panel no engorda el documento.** Una capacidad encendida en su valor por defecto se
   guarda **sin la clave**; tocar un campo escribe solo esa clave; apagar y volver a encender la borra.
   Los defectos viven en un sitio (la librería), no duplicados en el panel.
3. **El panel no ofrece lo que la librería va a rechazar.** `seguir.objetivo` solo da «el jugador» y «un
   punto fijo»: seguir a **otra clave de material** busca la instancia más cercana con ese material y un
   rig no es una instancia. Y «trepa por las escaleras» sale **deshabilitada** — todavía no existe para
   un agente; quitarla de la lista haría pensar que se olvidó.

Apagar una capacidad que no tiene clave de apagado se escribe con sus valores neutros: `empuje` off es
`{fuerza:0, salto:0}` (aguanta el golpe sin moverse) y `andar` off es `{cadencia:0}` (no mueve las
patas). `seguir` off sí es `false`, y la tarjeta avisa de que **la librería se niega a plantarlo**.

Qué tarjetas quedan abiertas vive en `agAbiertas`, **no en el DOM**: el formulario se reconstruye
entero en cada cambio y cualquier estado guardado en el nodo se perdería a la primera tecla. Y
`agCargar` lleva billete (`agCargaId`, como el `agPrepId` de `agPreparar`): elegir dos agentes seguidos
no puede dejar que la respuesta vieja pise a la nueva.

Test: `node test_panel_agentes.js` (Chromium real, 30 casos).

**Punto de extensión `mundo-autoarranque` (excepción al §0, aprobada por el dueño).** Los snippets no
se autoejecutan (solo a mano desde Alt+C), así que la escalera dejaba de ser escalera en cada recarga.
`mcAutoarranque()` (final de `openWorld`) ejecuta ese snippet si existe: `app.js` **no sabe qué hace**,
solo ofrece dónde engancharse; si no hay snippet, el Mundo se comporta como antes. Editar el snippet
exige recargar la pestaña (o reejecutarlo a mano, que es idempotente).

Test: `node test_bloques_comportamiento.js` (headless, con un mundo de juguete; sin navegador),
`node test_giro_navegador.js` (el `mirar` de arriba: comprueba en Chromium que la **identidad dibuja
exactamente lo mismo** que no poner matriz, que una traslación **sí** mueve la pieza — o sea que
`uModel` llega al shader y no se queda en una variable que nadie lee — y que a la distancia donde la
caja cruda ya sale del visor la inflada sigue dibujando; los ángulos y límites se prueban headless,
porque lo que el navegador aporta es que **se dibuje**) y
`node test_fisica_navegador.js` (**el `app.js` de verdad** con playwright: monta una plataforma con un
escalón, anda contra él llamando al `mcUpdate` real, lee la altura de la cámara de la matriz de vista y
cronometra el avance con y sin `velocidad`; deshace los bloques y bloquea `POST /api/mundo`). El segundo
existe porque el juguete **calcaba mal el orden de `mcUpdate`** (gravedad después del horizontal) y dio
81 ok a un suavizado que en el juego no hacía nada: cuando la física del juguete se separa de la real,
esa diferencia es exactamente el bug. Todo lo que dependa de la **secuencia** de `mcUpdate` (o de que un
enganche corra en el sitio correcto) se prueba ahí, no en el juguete.

### `game.esqueletos` — agentes articulados (v1.19)

`seguir` cuelga del **material**: dos brazos de la misma clave perseguirían cada uno por su cuenta y
acabarían amontonados en el mismo punto. Un muñeco necesita lo contrario — varias piezas que se mueven
como **un solo cuerpo** —, así que un rig es **por instancia** y vive en un registro aparte
(`esqueletos[]`), no en la tabla por material. El primero es un zombie
(`data/agentes/zombie.json`), pero la librería **no sabe qué es un zombie**: recibe un
documento con piezas, articulaciones y guion.

```js
game.esqueletos.crear(doc, x, y, z)   // lo planta de pie ahí; promesa con su handle
game.esqueletos.crear('zombie', ...)  // …o el id de uno guardado, que es lo normal
game.esqueletos.lista()               // quién hay vivo, dónde, y qué está haciendo
game.esqueletos.quitar(id)            // o .quitar() para llevárselos a todos
game.esqueletos.enCaja(x0,y0,z0, x1,y1,z1)  // quién tiene el cuerpo dentro de esa caja
game.esqueletos.desplazar(rig, dx,dy,dz)    // TRASLADA el cuerpo; false si no cabe. NO trepa
game.esqueletos.aturdir(rig, segundos)      // «shock»: deja de andar ese rato. aturdir(rig,0) despierta
```

⚠️ **Las tres últimas son CAPACIDADES, no comportamiento** (BUG-AG1). Las pide el pistón, y por eso son
genéricas: la librería expone *qué se puede hacer con un cuerpo* y cada material decide *qué hace con
ello*. La política del pistón —hasta dónde barrer, y qué hacer si no cabe— vive en
`redstone/redstone-piezas.js`. Un `game.esqueletos.empujaPiston()` habría metido el redstone dentro
del motor de agentes. `desplazar` es de **un solo tiro** a propósito: quien empuja decide en cuántos
pasos, porque de eso depende no tunelar a través de una pared.

⚠️⚠️ **`desplazar` NO reasienta en el suelo, y eso no es un descuido: es el arreglo.** Reasentar es lo
que hace un **paso** del agente (`moverRaiz` → `asentar`), y `asentar` sube un bloque entero para
salvar escalones. Con eso, empujar a un agente contra la cabeza recién salida de un pistón lo montaba
**encima** en vez de apartarlo — el mismo desenlace que `mcUnstick` le daba al jugador en BUG-RS9 y
por el mismo motivo. **Un empujón no es un paso: no trepa.** Que vuelva a pisar suelo es cosa de su
gravedad, en el frame siguiente. Para lo otro ya está andar, que es `pasoSeguir`.

#### El «shock»: dos dueños del mismo cuerpo en el mismo frame (BUG-AG5)

`desplazar` da su empujón **de un tiro**; `pasoSeguir` hace andar al bicho **cada frame**. Un agente
que camina hacia el pistón se come su propio empujón —«tenía que desplazarlo 16 y no llega a ese
valor»— y, andando contra la cabeza recién salida, `asentar` la trata como un escalón y **se le sube
encima**. No es un fallo de la colisión: es que nadie decía cuál de los dos manda.

`aturdir(rig, segundos)` pone `rig.aturdido`, y mientras dure, **`pasoSeguir` se llama con `dt = 0`**.

⚠️ **Con `dt = 0`, no saltándose la llamada.** `pasoSeguir` es además quien hace la cuenta de
`nDesplazados` que mantiene vivas las envolturas de colisión: saltársela volvería fantasma al agente
justo en el frame en que lo están empujando. Con `dt = 0` el avance sale exactamente 0, la cuenta se
hace y `g.por`/`g.pide` se siguen actualizando — **te sigue viendo, solo que no se mueve**. Y las
piernas se paran solas, sin una línea más, porque el ciclo de andar avanza con la **distancia
recorrida** y no con el reloj.

Lo que **no** se congela: gravedad, bote, patinaje y golpe (`rig.mov`), que corren con el `dt` de
verdad. Un shock que apagara la gravedad dejaría al bicho flotando si lo empujan sobre un borde.

**La capacidad es de la librería; la política, de la pieza** — igual que `enCaja`/`desplazar`. El
pistón llama a `aturdir` justo después de desplazar, **también si no cupo** (ahí es cuando más falta
hace: si no, se pasa el rato empotrándose contra la pared de enfrente). La duración vive en
`redstone/redstone-piezas.js` y se toca en vivo: **`game.redstone.shockPiston = 0`** lo apaga, `2` lo
alarga. El golpe del clic izquierdo **no** aturde: eso no lo pidió nadie y cambiaría cómo se siente
pegarle.

`node test_agente_aturdido.js`. Lo que impide el falso verde es el tramo **C**, que repite el pase con
`shockPiston = 0`: sin shock el agente acaba **dos bloques más atrás y subido a la cabeza** (`dy=2`).
Y ojo con cómo se mide: los tres pases entran **andando** hasta apoyarse en el pistón y se comparan
las posiciones **finales**, no los deltas — el bicho se planta asintóticamente contra el pistón y para
donde para (~0,1 de dispersión), así que restar deltas de sitios distintos da diferencias que no son
de nadie. Se falló así una vez.

#### Un agente tiene DOS preguntas para los pies, no una (BUG-AG1)

- `sueloDe(a,g)` = medio voxel fino **bajo** su caja → lo que le **sostiene** (hielo, barro, trampolín).
- `dentroDe(a,g)` = medio voxel fino **sobre** su planta → la celda que **ocupa**.

Son `pieEn()` y `pieDentro()` del jugador con la caja del bicho, y **hacen falta las dos**: una placa
de presión es un bloque `atravesable` dentro del cual te quedas de pie, así que mirando solo bajo los
pies se ve la losa de debajo y la placa no salta jamás. Es la regla de Minecraft — *la placa es el
bloque que OCUPAS, no el que te sostiene*. Ambas comparten identidad de **flanco** (celda + clave):
quedarse encima de un trampolín no lo repisa, salir y volver sí.

El payload de `alPisar` lleva **`quien`** (`'jugador'` | `'agente'`) y `agente:{id,nombre}`. Eso es lo
que permite que `fisica.placas` esté **encendida por defecto** (una placa que solo notas tú no es una
placa); se apaga por bicho con `fisica:{placas:false}`. Un `alPisar` escrito para el jugador debe
mirar `c.quien` antes de hacer nada personal (`game.tp`, etc.).

#### Y respeta el cuerpo real de los bloques (BUG-AG2)

`mcSurfaceNear` devuelve la altura en **celdas enteras**; plantar los pies en el techo de la celda
sube al agente hasta **16 voxels** sobre una placa de 2. `asentar()` baja en pasos de **1/16** hasta
apoyarlo donde de verdad hay materia, y `chocaTerreno()` sondea `bits` en 1/16 en vez de tratar la
celda como un cubo (sin lo segundo, lo primero no sirve: el primer escalón ya chocaría).

⚠️ **Guarda de coste:** la bajada fina solo se dispara si la celda de apoyo **se dibuja fina**
(`celdaFina()` → `mc._geoFina[id].bits`). Sobre terreno macizo no se sondea ni una vez y andar cuesta
lo que costaba. `node test_agente_cuerpo_real.js` · `node test_agente_pisa_placa.js`.

#### Lo que un agente puede VER son dos preguntas distintas (BUG-AG9 · BUG-AG10)

El dueño lo reportó junto pero son dos mecanismos, y mezclarlos habría roto uno de los dos: «si me
pongo encima de su cabeza no debería verme, los ojos no pueden mirar en ese ángulo; y si paso por
detrás tampoco debería poder verme **para comenzar a seguirme**». O sea **atención** (¿te sigue con
la cabeza?) y **detección** (¿arranca a perseguirte?).

| | dónde vive | qué acota | quién lo lee |
|---|---|---|---|
| `mirar.limites.x` | la **pieza** (BUG-AG9) | el cono **vertical** de la cabeza | `esqueletosPaso`, por pieza |
| `seguir.vision` | el **agente entero** (BUG-AG10) | el cono en el que **EMPIEZA** a perseguirte | `esqueletosPaso`, una vez |

**BUG-AG9 · `limites.x` es el tope arriba/abajo, y fuera del cono se vuelve a reposo.** `limites` ya
existía y solo tenía `y` (izquierda/derecha); ahora también `x`, con el mismo defecto `[-70,70]` —
que es un cuello humano. Y se aplica con la regla que ya estaba escrita para `mirar`: **fuera del
cono la pieza se RINDE** (vuelve despacio a su pose de origen), no se queda pinzada en el tope. Es
la diferencia con el `mirar` **por material**, donde el cabeceo al tope **no** cuenta como rendirse
—«pegar un salto apagaría la cabeza entera de golpe»—: un rig **no cabecea en absoluto** (solo yaw),
así que lo único que puede hacer con un objetivo que se le va por arriba es dejar de mirarlo. Sin
esto la cabeza se quedaba clavada mirando al techo, que es la postura de un maniquí.

**BUG-AG10 · `vision` decide EMPEZAR, y solo empezar.** Grados de cono (`360` = esfera = el
comportamiento de antes), por defecto **180**: solo te ve lo que tiene delante. Una vez persiguiendo
manda `deteccion` como siempre, así que **rodearle no le hace perderte** — si el cono gobernara
también la persecución, andar en círculos a su alrededor lo dejaría parpadeando entre perseguir y
soltar en el borde del cono.

⚠️ **El cono solo se aplica cuando el objetivo es el JUGADOR.** Con un `objetivo:[x,y,z]` fijo «no lo
ve» no es un estado transitorio: es un **atasco definitivo**. El cuerpo solo se gira mientras
persigue, así que un punto a su espalda no entraría en el cono jamás y el bicho se quedaría plantado
de por vida. Se pinza además a `[0,360]`, y un valor de más avisa por consola.

⚠️ **`g.pide` se sigue actualizando aunque esté ciego** (la ceguera entra por la misma puerta que «te
he perdido de vista», *después* de anotar la distancia). Si no, `game.esqueletos()` diría `0` y
parecería que no estás ahí. La tabla lleva además la columna **`frente`** = `rig.angObj`, a cuántos
grados te tiene: con eso, «no me sigue» se distingue de «me tiene a 175° y su cono es de 180».

Las dos válvulas van **en los dos sentidos**, como manda el §0 de defectos automáticos:
`mirar:{limites:{x:[-90,90]}}` abre el cuello y `seguir:{vision:360}` devuelve la esfera. En el panel
son dos campos más («tope arriba y abajo (±°)» y «campo de visión (°)»). ⚠️ El setter del tope de
cuello **escribe la clave del eje, no el objeto `limites` entero**: el de antes hacía
`mir.limites={y:[…]}` y con eso poner el tope horizontal **borraba** el vertical.

Se aplica con `python3 parche_snp_vision_agentes.py` (idempotente, 16 costuras) porque el snippet lo
edita el dueño en vivo. ⚠️ `crearEsqueleto` **rehace el `seguir` campo a campo** al reconstruir por
clave: un campo nuevo hay que traerlo ahí a mano o no llega. Tests: `node test_vision_agente.js`
(11 ok; sus tramos **A bis** y **B bis** son los anti-falso-verde: con el cono abierto ese mismo
sitio **sí** gira la cabeza y esa misma espalda **sí** arranca la persecución) y el caso de
`test_panel_agentes.js` que fija que el tope horizontal no se lleva por delante al vertical.

#### Y hay una TERCERA: ir montado encima no es ni delante ni detrás (BUG-AG11)

El dueño, justo después: «qué parámetros tendría que poner para que una vez dentro no me vea? he
hecho varias pruebas y no lo consigo» y «puse *tope arriba y abajo = 0* y lo que hace es **dar
vueltas en círculo** si me subo a su cabeza». La respuesta honesta era **ninguno**, y por eso ahora
no es un parámetro sino un **defecto automático**:

- **`seguir.vision` no llega**: el cono solo decide EMPEZAR y montado estás siempre *dentro* de
  `deteccion`, o sea permanentemente en faena — el cono ni se consulta.
- **`mirar.limites.x` calla el cuello, no la persecución**: por eso ponerlo a 0 dejaba la cabeza
  quieta y el cuerpo girando. Eran los dos mecanismos de arriba haciendo cada uno su trabajo.

⚠️ **Las vueltas no eran un efecto secundario: era un caso DEGENERADO.** A distancia horizontal ~0
la meta «a `distancia` de ti» sale de `dx/d` con `d ≈ 0` (dirección de puro ruido) y el giro del
cuerpo de `atan2(≈0, ≈0)`. Encima, `distancia` le pide **apartarse** de ti — y al apartarse **te
lleva consigo**, así que el error no se satisface jamás. Van **dos arreglos independientes**:

| | qué hace | por qué separado |
|---|---|---|
| `rig.llevando` | te lleva encima ⇒ **no te ve**: ni persigue ni te encara con el cuello (pero sí `volver`) | es semántico: «montado» es un estado del bicho |
| guardia de `atan2` | sin distancia **horizontal** el cuerpo se queda como está | es numérico: vale también sobre una pieza **no** montable |

**La señal ya existía**: `llevarPasajero()` deja puesto `P.llevando` al final del frame, así que el
motor ya sabía que te lleva; solo faltaba mirarlo. Se sube a `rig.llevando` (es del **bicho**, no de
la pieza) y se lee al frame siguiente, antes de decidir. Solo contra el **jugador**: con un
`objetivo:[x,y,z]` fijo, llevarte encima es ser un **vehículo** y tiene que seguir su camino.

⚠️ **`montado` ≠ `cabalgable`, y la diferencia la marcó el dueño.** Yo había excluido a los montados
de `volver` para que `game.esqueletos.desplazar()` pudiera pasearlos; su corrección: «*"montado" no
es lo mismo que "cabalgable"; si fuese cabalgable tiene sentido que se quede quieto y que además
pueda moverlo; si estás montado y no te ve, pues que sea como tonto y vuelva a su ancla*». Así que
un agente con `volver:true` (el defecto) **te pasea hasta su ancla** — es lo correcto: no te ve, y
un bicho que no ve a nadie se vuelve a su sitio. **`cabalgable` es otra capacidad y no existe.**

⚠️ Consecuencia práctica para los tests: **un rig montado se pelea con
`game.esqueletos.desplazar()`**, porque cada frame deshace el paseo andando hacia el ancla. Los
tests que pasean un rig a mano (`test_montar_agente.js`, `test_montable_editor.js`) le ponen
`rig.G.volver = false`: prueban el **acarreo**, no el seguimiento.

La válvula de escape es **bajarte**: no hay bandera para «que me vea mientras me lleva» porque el
estado es observable —`game.esqueletos.lista()` pone **«te lleva encima»** en `estado`, que si no un
«fuera de alcance» a 0,3 bloques parece una avería— y volver a él es dar un paso.

`python3 parche_snp_agente_montado.py` (idempotente, 7 costuras). Test:
`node test_agente_montado.js` — sus casos **A** y **D** son los anti-falso-verde (de pie delante
**sí** te ve y **sí** te encara el cuello; bajarte lo revierte), el **C** abre `limites.x` a
`[-90,90]` para probar que el cuello calla por BUG-AG11 y **no** por BUG-AG9, y el **E** comprueba
que el jugador está *de verdad* sobre el eje antes de dar por buena la guardia.

⚠️ Dos formas de medir que costaron un falso rojo cada una:
- **«Da vueltas» ≠ «gira mucho».** Volviendo al ancla el bicho se da la vuelta entera, y eso es un
  giro grande y legítimo. Lo que delata al `atan2(0,0)` es girar **sin ir a ninguna parte**:
  se compara el **recorrido acumulado** contra el **giro neto** (51,6° / 51,6° = limpio).
- **«De pie delante» no es un `-z` fijo.** En cuanto el agente anda deja de mirar al norte, y desde
  BUG-AG10 el cono lo dejaría ciego: hay que colocarse en `giro + horneado`, o el control mide lo
  contrario de lo que cree.

**`game.agentes` y `game.esqueletos` no son sinónimos** (v1.21): `game.agentes` son los **documentos
guardados** en `data/agentes/*.json` (qué bichos sabemos hacer) y `game.esqueletos` es lo **vivo en este
mundo** (qué bichos hay ahora y dónde). Guardar no planta nada; plantar no guarda nada.

```js
game.agentes.lista()            // [{id, nombre, piezas, savedAt}] — GET /api/agentes
game.agentes.cargar('zombie')   // el documento entero
game.agentes.guardar(doc)       // POST; el id sale del slug de `nombre`
```

El almacén es el de habitantes clonado (`/api/agentes`, GET·POST·PATCH·DELETE, a papelera y nunca
borrado real), con **una diferencia que importa**: al guardar, el documento se copia **entero** y el
servidor solo le impone `id` y `savedAt`. Las claves que no conoce **viajan intactas**, para que ampliar
el formato no vacíe los agentes ya guardados al reguardarlos desde una versión vieja del panel. Es lo
único de esta parte que no se ve en pantalla y lo que más caro costaría descubrir tarde, así que tiene su
prueba: `node test_agentes_api.js`.

⚠️ **El bicho se edita en `data/agentes/zombie.json`**, no en el snippet. `agente-zombie.json` ya solo
dice *dónde* y *cuándo* se planta (`game.esqueletos.crear('zombie', …)`); hasta la fase 2 llevaba dentro
una segunda copia del documento y tocar una dejaba a la otra mandando en el test.

⚠️ Después de tocar `server.py` **hay que reiniciarlo** (`python3 server.py 8500`): Python no recarga el
fichero solo y los endpoints nuevos dan 404 hasta entonces — con el zombie eso se ve como «el snippet ya
no planta nada», que no se parece en nada a la causa.

**Sus piezas son efímeras.** `s.efimera` (la única marca del rig que vive en `app.js`, §0 aprobado) hace
que `mcSerialize` las salte y que no entren en el historial de deshacer: el zombie existe mientras
juegas y desaparece al recargar, y `mundo.json` queda byte a byte como estaba. Verificado en el Mundo del
dueño: con el zombie plantado, `mcSerialize()` sigue devolviendo sus **269** estructuras de siempre.

**Dos centros de giro, dos matrices.** El cuerpo gira sobre el eje vertical de su raíz y la extremidad
cabecea sobre **su** hombro, así que `M = T(g) · Ryaw(cuerpo) · T(o) · Rart(articulación)`. Con un solo
centro el hombro se despega del torso en cuanto el cuerpo gira 90°, que es justo lo que prueba §17.

**El ciclo de andar avanza con la DISTANCIA recorrida, no con el reloj** (`fase += avance · cadencia`).
Con el reloj, un zombie frenado contra una pared seguiría pedaleando en el sitio; así las piernas se
paran solas cuando el cuerpo no avanza, sin ninguna condición especial.

**`activo` y `andando` son dos interruptores distintos**, y confundirlos fue el bug v1.20: `activo` = *te
ve* (los brazos suben a su `base`), `andando` = *se está moviendo* (el vaivén). Con el vaivén colgado de
`activo`, al perderte y volver a su ancla el zombie se deslizaba de lado con las piernas rectas, como un
mueble empujado. Por lo mismo, si no persigue pero anda, mira **hacia donde va**.

**Tres costuras que no se pueden saltar** (las tres tienen su prueba en §17):

1. `mirarObjetivos` le pondría `s.model = null` a cada pieza en cada frame: lleva una guarda `if (s._rig)
   continue` — sobre una instancia del rig manda el rig.
2. `mcRestampAll` **sustituye cada objeto** de `mc.structures`; el rig **re-adquiere** sus piezas por
   `(key, ox, oy, oz)` en vez de animar objetos muertos. ⚠️ Y eso vale también para **quitarlas**
   (BUG-AG3): `quitarEsqueleto` borraba por referencia (`indexOf(s) >= 0`) y, tras un restampado, se
   saltaba **en silencio** las piezas cuyo objeto ya había sido sustituido — se quedaban en el mundo
   con `efimera:true` y `_rig:null`, visibles y sin nadie que las animara. Toda operación sobre las
   instancias de un rig empieza por `readquirir(rig)`, no solo el paso por frame.
3. **La celda es entera y el cuerpo no**: el resto fraccionario del plantado viaja en la matriz, así que
   una pieza del rig lleva `s.model` **siempre**, también parada. De ahí que `mcStructColl(raíz)` sea
   siempre `null` y la solidez salga del envoltorio de `mcFineBoxHit` — donde se la dibuja, no donde
   está su celda. Y desde BUG-AG4 eso vale para **todas** las piezas, no solo el torso: ver abajo.

**La solidez sigue a la MATRIZ, no al desplazamiento (BUG-AG4).** Durante un tiempo solo el **torso**
frenaba: el envoltorio sacaba la solidez restando `s._sig` a la caja de consulta, y `_sig` lo lleva
solo la raíz, así que cabeza y extremidades eran fantasmas (el dueño se lo encontró subiéndoseles
encima). Estaba escrito a propósito —el rig **gira** las piezas y restar un vector solo sabe
trasladar—, y lo que cambió fue esa premisa: la matriz de una pieza (`s.model`, la compone
`esqueletosPaso`) es un giro **rígido**, o sea que su 3×3 es ortonormal y **su inversa es la
traspuesta**. Se pasa la caja de consulta por esa inversa y allí la pieza vuelve a su celda de
estampado, donde el bitset de siempre vale tal cual. La caja acompaña al dibujo **por construcción**:
no hay ninguna caja inventada al lado de la pieza.

- Ramas separadas en `golpe()`/`envAt`: `seguir` (traslación pura) sigue **byte por byte** como estaba
  —es el bucle caliente y no tiene por qué pagar una matriz— y los rigs van por la inversa. Lo decide
  `comoSeMueve(s)` → `0` / `1` (vector) / `2` (matriz).
- Dos contadores, `nDesplazados` y `nPosadas`, no uno: son las dos ramas, y sumados en uno solo un
  mundo con un zombie quieto pondría a barrer a la otra. `nPosadas` se recuenta **cada frame y antes
  de la salida rápida** de `esqueletosPaso`, o al quitar el último agente se quedaría clavado.
- Los bordes de la caja en local se redondean **hacia fuera** (`floor` abajo, `ceil`−1 arriba): la
  pregunta es qué vóxeles *toca* la caja. Exacto en los cuartos de vuelta; en los ángulos intermedios
  sale un pelo más grande, que es el lado seguro (lo que falta se traspasa).
- Válvula de escape en el documento: **`solidez: 'raiz'`** vuelve al comportamiento viejo (solo el
  torso), por si un brazo en movimiento resulta molesto jugando. Por defecto chocan todas.
- ⚠️ No confundir con **`cuerpo`**, que es la caja con la que el agente choca contra **el mundo**.
  Esto es con qué piezas choca **el jugador** contra el agente. Son cosas distintas.

⚠️ La cabeza es **15³ a propósito**: un asset de 1×1×1 bloque con ≥4096 voxels macizos es **terreno**
(`blockLike`, `app.js:4126`) y el terreno no se puede animar. Con cualquier lado ≤15 el máximo posible es
3375 < 4096, así que no puede volverse terreno por mucho que se rellene.

Tests: `node test_bloques_comportamiento.js` **§17** (el motor, sobre el mundo de juguete: cuerpo rígido,
hombro orbitando, fase por distancia contra un muro, piernas y brazos en oposición, vuelta a casa
andando, `mcRestampAll`, solidez) y `node test_esqueleto_navegador.js` (Chromium + SwiftShader: que las 6
piezas **se dibujan** —píxeles, no `mc.structures.length`—, que sus matrices llegan al shader, que
`mcSerialize()` no las ve y que plantar un zombie **no dispara ningún guardado**). Los dos leen el
**documento de verdad** (`data/agentes/zombie.json`) y las **piezas de verdad** (`assets/*-zombie.vox.json`):
mover un pivote o regenerar un asset con otras medidas se entera aquí. El almacén, aparte:
`node test_agentes_api.js` (necesita el servidor vivo).

### 📏 La escala vive en la INSTANCIA (REQ-AGESC1)

Enanos y gigantes del mismo dibujo. **Escalas libres** (×1,4 vale), acotadas a **0,1..8** — un `0` o un
negativo harían desaparecer al bicho sin decir por qué. Tres nombres para lo mismo, en tres capas:

| dónde | clave | quién la escribe |
|---|---|---|
| documento del agente | `escala` | el panel (tarjeta 📏) o el script |
| rig vivo | `rig.esc` | `crearEsqueleto`, para que lo consulte el resto |
| instancia estampada | `s.esc` | `mcStampStruct(clave, ox,oy,oz, rot, quiet, esc)` |

```js
game.esqueletos.crear({ ...doc, escala: 2 }, x, y, z);     // gigante
game.stamp(...) / mcStampStruct(k, x,y,z, rot, true, 0.5); // una pieza suelta a media talla
```

⚠️ **La caché de `mcStructGeom` NO entra en juego, y por eso esto salió barato.** La geometría es
**local al origen** y `mcBuildStructMesh` la lleva al mundo **sumando** (`src + ox`): escalar es
multiplicar **antes** de sumar, así que la misma malla cacheada por `clave+rot` sirve para todas las
escalas y el atlas y las UV ni se enteran. La suposición contraria —que la escala tendría que entrar
en la clave— era falsa, y comprobarla primero (`test_escala_estructura.js`) es lo que evitó rehacer
el cacheado entero.

⚠️ **Un agente no es una malla: son piezas sueltas, y hay que escalar DOS cosas.** El tamaño de cada
pieza *y* la separación entre ellas (`en`, y con ella `baseY`). Escalando solo lo primero el gigante
sale **desmontado** —cabeza flotando, piernas dentro del torso— y eso no se ve en una captura si no
sabes qué buscar: por eso `test_escala_agente.js` mide el **hueco máximo entre una pieza y el resto**,
no el bulto.

**Tres cosas no se derivan solas** y hay que escalarlas a mano:

- **`parte.piv`** — el pivote va en bloques **dentro** de la caja de la pieza; si la caja crece y él
  no, el brazo gira sobre un hombro que ya no está ahí.
- **`def.cuerpo`** — la caja de choque «esbelta» viene en bloques **absolutos** (para caber por una
  puerta), así que un gigante se vería enorme y chocaría como un zombie normal. ⚠️ Pero su `alto` **por
  defecto** es la unión de las piezas, que **ya viene escalada**: solo se escala el alto que pide el
  documento, o se aplica dos veces.
- **El preview del panel NO escala** — va por `prepararEsqueleto`, que no estampa nada y monta las
  cajas a mano, y ahí `def.escala` **no se lee**: el maniquí se ve igual a ×1, ×2 y ×0,5. Llegó a
  escalarse, con el argumento de que el panel no puede enseñar otro tamaño que el Mundo, y el dueño lo
  tumbó (BUG-AG6): a escala 2 el maniquí salía **desmontado**, y *el panel es un maniquí, la escala es
  del juego*. Queda escrito para que no se vuelva a derivar solo. Ya divergen a propósito en otra cosa:
  aquí la fase de andar la lleva el reloj y no la distancia recorrida.

**La colisión se mapea al revés: el bitset es siempre el de la pieza a tamaño 1**, así que la caja del
mundo baja a coordenadas de la pieza **dividiendo por `esc`**. Son cuatro sondas en `app.js`
—`mcFineBoxHit` (chocar) · `mcAimBoxHit` (apuntar) · `mcStructAt` (de quién es este voxel) ·
`mcXrayVolume` (que además dibuja la cajita ×`esc`)— y el snippet **re-implementa** ese mismo bucle en
`golpe` y `envAt`, así que la corrección va también ahí. `mcStructRayHit` no se toca: delega en
`mcAimSolidAt`.

⚠️ **El camino `esc === 1` va en un `if` aparte, byte a byte como estaba.** Esto lo recorre la física
en **cada frame**, y además `mcFineBoxHit`/`mcAimBoxHit` las extrae **verbatim** (por texto)
`test_rayo_apuntado.js`: un helper nuevo le revienta el sandbox con `ReferenceError`. Por eso la rama
va **inlineada tres veces** en vez de factorizada — es a propósito, no descuido.

⚠️ **El snippet se parchea, no se reescribe**: `data/snippets/mundo-autoarranque.json` lo edita el
dueño en vivo ⇒ `python3 parche_snp_escala_agente.py`, idempotente, **8 costuras en `CAMBIOS`** (el
Mundo) **+ 3 en `REVERTIR`** (la vuelta atrás del preview, BUG-AG6), con ancla única (si una ancla no
aparece exactamente una vez, aborta en vez de insistir). En `REVERTIR` la comprobación de idempotencia
va **al revés** —se pregunta por el texto parcheado, no por el limpio—, porque el original es
subcadena del parcheado y `if nuevo in code` diría «ya estaba» para siempre.

**Lo que NO escala, a propósito:** la **altura de escalón** (`asentar()` sube un bloque, sea enano o
gigante), la **gravedad** y el **alcance del `seguir`**. Son *comportamiento*, no *tamaño*, y lo que se
pidió es tamaño. Si un gigante debe subir escalones de dos bloques, es otro ticket.

Tests: `node test_escala_estructura.js` (la sonda del motor: píxeles a ×1,4 y ×0,5, AABB, colisión,
apuntado, y que volver a ×1 deja la foto **idéntica**) · `node test_escala_agente.js` (el bicho
entero: que no se desmonta, pivote, caja de choque, guardas, y que el **preview IGNORA la escala**
mientras el Mundo sí la aplica).

### 🚧 Un agente no se mete dentro de otro (REQ-AG17)

Solo para **`game.esqueletos`** (lo acotó el dueño): `mc.agents` es otro cuerpo y otro sistema. Vive
entero en `data/snippets/mundo-autoarranque.json`, en tres parches idempotentes por marca
(`herramientas/parche_snp_ag17.py` → `ag17b.py` → `ag17c.py`, v1.32 → v1.35). **En `app.js` no hay
nada de esto.**

**La regla, en una línea:** antes de aceptar un paso se mira si la caja del cuerpo cae dentro de la de
otro rig vivo; si cae, se intenta **empujarlo** el mismo delta (validado igual), y si el otro no puede
moverse, el paso **no vale** y el que empuja se queda con `g.por = 3` («bloqueada»), que es el estado
que ya sale en el diagnóstico de atasco. No hizo falta un quinto `POR_SIG`.

**Un solo embudo, y por eso salió barato.** Todo movimiento de raíz pasa por `moverRaiz`: el paso
andando (`movPaso`), el brinco del puñetazo (`empujarEsqueleto`) y el patinaje sobre hielo
(`fisicaPaso`). Cambiar ahí `asentar` por `avanzar` (= `asentar` + «¿hay alguien?») los cubrió los
tres de una vez.

⚠️ **Tres trampas, las tres pagadas con un fallo real:**

- **El perdón al que ya estorbaba tiene que ser CONDICIONAL.** La primera versión ignoraba al que ya
  se solapaba antes del paso, para no dejar clavado de por vida a un par nacido embutido. Eso vuelve
  al par **invisible el uno para el otro para siempre**, y ese par se consigue solo: dos agentes
  persiguiéndote a la misma `distancia` van **al mismo punto** del anillo que te rodea. Ahora el paso
  vale solo si **aleja los centros en planta** (`seAparta`) — «te perdono si te estás yendo».
- **Hace falta un desatasco.** Si ya están dentro el uno del otro, ninguna validación de paso los
  saca. `separarDeAgentes` los aparta 1,5 bloques/s **cada uno**, y cada empujoncito pasa por
  `asentar` y por el jugador, así que nunca mete a nadie en la roca ni en un abismo. Con los centros
  exactamente encima manda el `id`, para que se vayan a lados **opuestos** en vez de elegir el mismo.
- **⚠️ Validar el destino NO es validar el camino.** `avanzar` mira **dónde se aterriza**. Mientras el
  paso sea más corto que el cuerpo da igual, pero el puñetazo no anda: gasta la fuerza en
  `mov.vx * dt`, o sea **0,67 bloques por fotograma a 60 fps** con fuerza 40 —ya rozando los 0,8 del
  cuerpo— y **3 o 4 en un fotograma lento**. Medido: saltaba de x=34,4 a x=37,2 con el otro en 36,4,
  sin solaparse **ni un fotograma**. Por eso `moverRaiz` parte el desplazamiento en **trozos de medio
  cuerpo** (tope 32) y valida cada uno. No es una colisión nueva: es la de siempre, llamada las veces
  que hagan falta.

⚠️ **Y la lección de método:** «no solapan en ningún fotograma» **no demuestra** que no se atraviesen,
si el paso puede medir más que el cuerpo. Hay que mirar el **tamaño del paso**. El guardián apunta
`dzAlCruzar` justo por eso: si adelanta al de delante, tiene que ser apartado **al menos su propio
ancho**. Y el pasillo de roca del caso G va en `ZC-2`/`ZC+1`, no en `ZC±1`: el cuerpo mide 0,8 y nace
**centrado en `ZC`**, o sea que pisa las dos celdas — emparedarlo en `ZC±1` lo deja tocando la pared y
no se mueve ni un milímetro.

**Los montados siguen siendo la excepción** ([REQ-AG15](../PLAN_ARCHIVO.md#-req-ag15)): el jinete
ocupa el espacio del montado a propósito, y `separarDeAgentes` no toca a quien tiene `g.montado`.

### 🧗 `escalar`: cuánto trepa DE UNA VEZ al atascarse (REQ-AG18)

Campo del documento, **dentro de la capacidad «anda»** (`def.andar.escalar`), acotado a **0..8**, por
defecto **3**. `herramientas/parche_snp_ag18.py` (v1.31 → v1.32) + el campo en el panel.

**No es la altura de escalón.** Andando se sube **siempre uno**, y eso no se toca. `escalar` es lo que
se atreve a trepar **de una vez** cuando lleva un rato (`ATASCO_S`, 0,35 s) queriendo ir a algún sitio
y **no avanza ni un milímetro** — o sea, en el fondo de un hoyo. Antes se teletransportaba hasta
arriba sin importar lo hondo que hubiera caído, que es justo lo que el dueño pidió acotar.

`escalar: 0` es **«no trepa»**: ni el escalón de andar, así que se queda donde lo dejen.

### 🗡️ Apuntar a un agente y saber DÓNDE le das (BUG-AG19)

**Chocar y apuntar son DOS caminos distintos en `app.js`**, y ésta es la trampa cara del área. La librería
envuelve **cuatro** sondas, no tres, y cada una está en un camino:

| envoltura | para qué | quién la llama |
|---|---|---|
| `mcStructColl` | apaga el ancla vacía de la pieza | todas las demás |
| `mcFineBoxHit` | **chocar** con la pieza donde se la ve | la física |
| `mcStructAt` | **romper/identificar** la pieza donde se la ve | el clic, `mcBreak` |
| `mcAimBoxHit` | **apuntar** a la pieza donde se la ve | `mcRaycast(d,true) → mcStructRayHit → mcAimSolidAt` |

Faltando la cuarta, el rayo de la mira **atravesaba entero** a todos los agentes articulados y se clavaba en
el terreno de detrás: la espada de `game.herramientas` anunciaba «tajo al aire» con el bicho delante. Las
cuatro se ponen en `envolverColision()` de `mundo-autoarranque`, y las tres últimas comparten el mismo
`golpe()`; la de apuntar le pasa `mirar = true`, que cambia sólo tres cosas: lee `bitsAim || bits`, **no**
salta las piezas `atravesable` y salta `s._isHeldTool`.

Para las herramientas, la ficha del impacto:

```js
const h = game.esqueletos.enLaMira();          // o .enPunto(x,y,z) / .enPunto(c.punto)
// { id, nombre, agente, agenteId, pieza, texto, punto, dist, local, dim, alto, rig, s, parte }
if (h) toast('tajo a ' + h.texto + ' · voxel ' + h.local.join(',') + ' (alto ' + h.alto.toFixed(2) + ')');
```

Existe porque el `c` de `game.herramientas` habla de **celdas y materiales** y una pieza de agente no es
ninguna de las dos cosas. `local` es el voxel **dentro del dibujo de la pieza** (índices del editor, no del
mundo) — ahí es donde va el efecto, sea un tajo o plantar una margarita.

⚠️ **`s.model[12..14]` NO es la posición** de la pieza: es el resto fraccionario del plantado; dónde se la ve
lo dice su `aabb`.
⚠️ Para el bitset de una pieza hay que llamar a **`mcStructColl._orig`**: la envuelta devuelve `null` para
todo lo que no sea la raíz del rig.
⚠️ `enLaMira()` usa el rayo del **golpe** (atraviesa lo que no tiene colisión); `mcRaycast` se para en ello.
Con un cartel de por medio uno dice «el zombi» y `c.celda` dice «el cartel» — quien quiera ser estricto usa
`enPunto(c.punto)`.

### 🩸 `game.sangre` — el efecto que sale de ese punto (REQ-SANGRE1)

📌 **2026-08-19 (REQ-SNP-LIB1): el motor ya no vive aquí.** Salió a dos librerías —`sondas-mundo` (preguntar
al mundo por forma fina) y `particulas-voxel` (la física)— y `herramienta-espada` bajó de 271 a 125 líneas.
Lo de abajo sigue describiendo bien **el comportamiento**, pero para tocarlo o reutilizarlo la puerta es
**[`particulas-y-efectos.md`](particulas-y-efectos.md)**; ahí están también los siete efectos que salieron
gratis (nieve, lluvia, estrellas autoiluminadas, chispas, polvo, hojas, humo) y cómo se miden.

Primer consumidor de `enLaMira()`, y el ejemplo de que **el efecto no es cosa del motor**: vive entero en el
snippet `herramienta-espada` (`herramientas/parche_snp_sangre.py`), cero líneas de `app.js`. La espada, donde
ya sabía que había acertado, añade una línea:

```js
game.sangre.salpica(h.punto);        // sale DE la herida, no del centro del bicho
```

Pinta en **`game.voxelesUI`**, grupo `'sangre'`, con `tam:1` ⇒ cubos de `MC_VOX` (1/16 de bloque, el voxel
1×1×1 del editor). Al no ser mundo: no colisiona, no se guarda, no sale en la foto del mapa. Mandos en
caliente: `activa`, `chorro` (22), `dura` (30 s en el suelo), `desvanece` (4), `grav`, `fuerza`, `rebote`,
`vuelo` (8), `tope` (500); más `salpica(punto)`, `limpia()` e `info()`.

⚠️ **La sonda del suelo se pide SIN ENVOLVER: `mcFineBoxHit._orig`.** La envuelta por `mundo-autoarranque`
incluye a los agentes articulados (es justo lo de BUG-AG19, arriba) y con ella las gotas se posan **sobre el
propio bicho**: medido, 9 de 22 «posadas» a los 0,1 s a media altura, sin haber caído. Vale para cualquier
efecto que quiera saber dónde está *el mundo*, no dónde está el monstruo.

⚠️ **El vuelo se cuenta en tiempo simulado; el descanso, en el de reloj.** `dt` va acotado (`Math.min(0.05,…)`),
así que en una máquina a pocos fps un segundo de reloj es una fracción de segundo de caída: midiendo el tope
de vuelo por reloj se matan gotas **que aún están en el aire** (medido: 16 de 22). Los 30 s del suelo sí son
de reloj —«30 segundos son 30 segundos»— y se cuentan **desde que la gota se posa**, no desde el tajo.

⚠️ **La rejilla se pregunta por FORMA, no por celda.** `mcSolid` contesta «¿hay materia en esta celda?», que
para una antorcha, una flor o un repetidor es `true` en el **cubo entero**: la gota se posa sobre una caja
invisible de 1×1×1 flotando alrededor de la pieza. La forma de verdad está en **`mc._geoFina[id]`**
(`{bits, fdim}`, en 1/16), indexada con las coordenadas finas **locales a la celda** (`Math.floor(x*MC_TILE) -
bx*MC_TILE`, 0..`fdim-1`), exactamente como hace `mcTerrenoChoca` para chocar al jugador. Medido sobre una
antorcha: por celda salen macizas 4096 de 4096 subceldas; por forma, 48 —el palo, 2×12×2—. Vale para
cualquier cosa que caiga, ruede o se pose: si no preguntas por `_geoFina`, el mundo tiene cajas invisibles.

⚠️ `pinta()` repinta el grupo entero cada frame **a propósito**: `mcVoxUIGeom()` remalla *toda* la capa en
cuanto está sucia, así que pintar gota a gota no ahorra nada. El `requestAnimationFrame` **se apaga solo**
cuando no queda ninguna gota, y reejecutar el snippet cancela el bucle anterior (`window.__sangre`) — se puede
retunear desde el editor sin dejar dos simulaciones vivas.

## El planificador: presupuesto por frame repartido por turnos

*(movido verbatim desde `CLAUDE.md` el 2026-08-13, tope de 15 KB)*

**Planificador de agentes (`mcAgentsTick`, `app.js`)**: el presupuesto de CPU por frame
(`MC_AGENT_FRAME_MS`, 8 ms) se reparte **por turnos rotatorios** — el frame siguiente empieza por el agente
que se quedó sin turno, y ninguno puede pasarse de su rodaja (`presupuesto / nº de agentes vivos`). Antes se
recorría el `Map` en orden fijo y el primero se comía el presupuesto entero: con `game.agentSpeed=10` se
quedaban **a cero 4 de 6 agentes**, y a 100, 5 de 6 (medido). `game.agentSpeed` no tiene tope: el freno es el
tiempo, no el número de pasos.

## Un snippet no es un fichero: `mcSnippetInforme` (REQ-SNIP1)

*(movido verbatim desde `CLAUDE.md` el 2026-08-13, tope de 15 KB)*

Los snippets se ejecutan en ámbito global con `AsyncFunction`, así que **alcanzan los internos de
`app.js`** (`mc`, `mcAgentMesh`, `mcSurfaceY`…) sin necesidad de modificarlo — y por lo mismo **no son
un fichero**: el navegador los llama «VM2571» y da una línea corrida por el preámbulo. Eso lo traduce
`mcSnippetInforme` (REQ-SNIP1), que imprime la línea **del panel** con su texto y lleva el cursor hasta
ella; lo hereda todo lo que pase por `mcCorreSnippet` (Ejecutar, autoarranque, intro). `base-npc-skills.json`
ya lo hace. Ejemplo de lo que se resuelve así: el cuerpo multi-celda de la serpiente son **agentes
extra pausados** (`autostart:false` + `pause()`), porque `mcAgentsTick` salta lo que no está
`'running'` pero `mcAgentsSmoothUpdate` solo salta `'stopped'` y el bucle de dibujo solo mira
`vbo && count`. Especificación de comportamiento: **[`REGLAS_AGENTES.md`](REGLAS_AGENTES.md)**
(bajó de la raíz el 2026-08-13; `PLAN.md`, `tests/test_informe.js` y los snippets lo citan por
nombre y sección —«REGLAS_AGENTES.md §21»—, no por ruta, así que esas citas siguen valiendo).
