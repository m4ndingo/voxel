# Redstone (vive fuera de `app.js`, en `redstone/`)

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## 🔴 Redstone — vive FUERA de `app.js`, en `redstone/`

Petición explícita del dueño: **«todo lo de redstone va en ficheros aparte, aunque luego se llamen
desde otros de scripting»**. Los fuentes son `.js` normales en `redstone/` (editables, con resaltado,
comparables en git) y `node redstone/make_snippets.js` los publica en `data/snippets/` por
`POST /api/snippets` — por la API y no escribiendo el `.json` a mano, que es lo que da el respaldo en
papelera y la escritura atómica. Que un snippet cargue a otro no es nuevo: `agente-nube` ya se traía
código por `/api/snippets/<id>` y lo corría con `AsyncFunction` en el ámbito global.

| fichero | qué es |
|---|---|
| `redstone/redstone.js` | el **motor**: mueve señal. No sabe qué es una antorcha. |
| `redstone/redstone-arranque.js` | lo que **carga solo** el mundo: motor + tabla `DEFECTOS` de circuitos de serie. |
| `redstone/redstone-piezas.js` | las **piezas** (cable, palanca, placa, puerta, repetidor, inversor, pistón, bloque de redstone): circuito + física + el botón central que las acciona. |
| `redstone/redstone-demo-antorcha.js` | el **circuito** de ejemplo: planta la antorcha y te da el bloque rojo. |
| `redstone/redstone-ejemplos.js` | monta las **nueve parcelas** de `/map/redstone`, cada una con su cartel. |
| `redstone/montar_ejemplos.js` | lo lanza en un navegador de verdad, lo **acciona y lo comprueba**, y guarda. |
| `redstone/plantar_piston.js` | igual, para la banqueta del **pistón** en `/map/test` (x=70..81, z=45..49). Aborta si la parcela tiene algo que no sea suyo. |
| `redstone/make_piezas.py` | genera los 19 dibujos de las piezas en `data/habitantes/`. **No pisa un fichero existente sin `--forzar`** (ahí viven los dibujos del dueño). |
| `redstone/partir_puerta.py` | parte la puerta de la galería (24 de alto) en las **cuatro piezas de una celda** y deriva las abiertas girándolas. Respalda lo que pisa. |
| `data/habitantes/antorcha-apagada.json` | copia de `antorcha.json` con los 12 voxels emisores **sin el `*`**. |
| `data/habitantes/{cable,placa,palanca,puerta,repetidor}[-on|-abierta].json` | las 10 piezas (más `puerta-alta[-abierta]`: la puerta son **dos celdas**). El `*` del color encendido no es decorativo: es lo que hace que `mcGlowTocada` indexe la celda y la pieza **alumbre**. |

**Para añadir un material al redstone del mundo se toca la tabla `DEFECTOS` de `redstone-arranque.js`
y nada más** — ni el motor ni `mundo-autoarranque` se abren.

**El comportamiento cuelga del MATERIAL, igual que `game.bloques`** (misma razón: 442 368 celdas no
admiten un objeto por voxel). Lo único por celda es el nivel de señal, en un `Map` **disperso** que solo
tiene entradas donde hay circuito. Y la vecindad es una **cola** drenada en el `rAF` con tope
(`MAX_POR_DRENADO`), no una llamada recursiva: en recursión, un cable largo se come el frame y un anillo
de cable cuelga el navegador.

```js
game.redstone.define('asset:assets/bloque_redstone.vox.json', { emite: 15 }); // fuente
game.redstone.define('hab:antorcha-apagada', { encendida: 'hab:antorcha' }); // lámpara
game.redstone.info(x, y, z);   // el descubridor: qué material hay ahí y con cuánta señal
```

**«Encender» y «alumbrar» son la MISMA operación**, y por eso el sistema de luz no se toca: encender es
cambiar el id de la celda por el del material encendido, y esa escritura ya pasa por `mcSetBlock` →
`mcGlowTocada` → `mcComputeBlockLight` (ver «Una antorcha alumbra esté donde esté»). Los dos materiales
se dan de alta en `define()` **y no al encenderse**: `game.addMaterial` cuesta ~3 873 ms en 512×40×512
(la paleta se re-hornea y el atlas crece ⇒ `mcMeshAll`), o sea un congelado de 4 s en el primer clic.

⚠️ **`define('apagada', {encendida:'X'})` registra TAMBIÉN `X` en la tabla, con la misma cfg.** Sin eso
la lámpara se enciende una vez y **no vuelve jamás**: en cuanto la celda cambia de material su clave
pasa a ser la encendida, la tabla no la reconoce y la celda se cae del circuito. Minecraft registra
`redstone_lamp` y `lit_redstone_lamp` como dos bloques del mismo comportamiento por esto mismo.
`quitar()` se lleva el alias con él.

### Un bloque macizo TRANSPORTA la señal (r1.2) — fuerte / débil

Hasta r1.1 una celda sin `cfg` era un **agujero**: `señalQueLlega` la saltaba y ahí se acababa el
circuito. Desde r1.2 **cualquier bloque de la rejilla que no sea circuito hace de puente**: recibe de
sus vecinos y alimenta a lo que tenga pegado por las otras cinco caras (REQ-RS4, la regla de
Minecraft). No hay estado nuevo — la energía del bloque **se calcula al vuelo** en `energiaDeBloque()`
y no se guarda en `potencia`.

⚠️ **Nunca bloque → bloque.** Un bloque solo mira vecinos *con* `cfg`. Eso acota el coste a un salto y
evita que un cable suelto energice un muro entero por efecto dominó. Dos bloques en fila **no** llevan
la señal, y eso es a propósito.

⚠️ **La asimetría FUERTE/DÉBIL es lo que impide que el cambio se coma el modelo de señal.** Un
**cable** energiza el bloque solo **DÉBILMENTE** y otro cable **no lee** lo débil; todo lo demás
(antorcha, palanca, repetidor) energiza **FUERTE**, y eso lo lee todo el mundo. Sin esa asimetría dos
tendidos separados por un bloque se contagiarían **saltándose la pérdida**, y peor: un tendido se
realimentaría a través del bloque que él mismo alimenta y no bajaría de nivel nunca. Una pieza que no
es cable (una lámpara) **sí** lee lo débil — de ahí que una lámpara bajo un cable se encienda. Lo que
llega por un bloque **no paga pérdida**: se sigue cobrando solo en el salto cable→cable.

⚠️ **El aviso salta a DOS celdas a través del bloque, y salta SIEMPRE** (`encolarPuenteando`). Es
tentador ahorrárselo cuando quien cambia es un bloque normal, pero **«¿era esta celda circuito?» no se
puede responder después de la escritura**: una *fuente* (una palanca) no deja entrada en `potencia`,
así que al arrancarla parecía un bloque cualquiera y la lámpara del otro lado del muro se quedaba
encendida. El filtro que importa sigue en pie — **solo se encola lo que tiene `cfg`**, así que la
ráfaga del TNT deja la cola vacía igual que antes; lo que sube son lecturas de array (7 → 43), y 600
escrituras siguen midiendo <1 ms.

Válvula de escape: **`game.redstone.aislante('hab:cristal')`** (y `(clave, false)` para quitarlo,
`aislante()` para listarlos). Vive en su propia tabla y **no** en `define()` a propósito: un aislante
no es una pieza de circuito y no debe entrar en la cola ni gastar una entrada de `potencia`.

Para depurar, `game.redstone.info(x,y,z)` añade `vecinos[i].bloque = {fuerte, debil}` en los vecinos
que son bloques macizos — sin eso, «le llega corriente y no enciende» se mira a ciegas justo en el
caso nuevo.

Test: **`node test_redstone_bloques.js`** (transporte, fuerte/débil, un solo salto, `aislante()`, el
despertar a 2 celdas y el coste de la ráfaga). Medido además contra los nueve circuitos reales con
`node redstone/montar_ejemplos.js`.

### El bloque de redstone (la fuente permanente) — y los dos rojos que no son lo mismo

`asset:assets/bloque_redstone.vox.json`, declarado con **`{ emite: 15 }` y nada más**. Es la pieza más
corta de la tabla y cada cosa que le falta es deliberada:

- **sin `encendida`/`apagada`** → no tiene dos estados, así que `aplicar()` no le cambia el material
  nunca y no hay nada que persistir. Una fuente que no se apaga es literalmente eso.
- **sin `manual`** → no se conmuta con clic; no es una entrada del circuito, es un cimiento.
- **sin `mira` ni `soloAlFrente`** → reparte 15 por sus **seis** caras. Es el opuesto exacto del
  repetidor, y es lo que lo hace útil: pegas cable a cualquier lado y arrancas a 15.

⚠️ **Un repetidor ENCIMA de un bloque de redstone no se enciende, y no es un fallo.** Un repetidor
solo escucha por su espalda (`mira`), y un repetidor puesto en horizontal —los giros `@0..@3`, que son
los normales— tiene la espalda en horizontal: el `−Y` no es su lado. En Minecraft pasa lo mismo — el bloque de debajo de un repetidor es *solo soporte*, la entrada
se lee del bloque de **detrás**. Abrir el `−Y` rompería la asimetría que impide que un repetidor se
realimente por su propia salida, que es lo que costó el BUG-RS2. `info(x,y,z)` ya lo explica solo:
devuelve `escuchaPor: '−X'` y una `pista` del tipo *«tiene señal por −Y, pero esta pieza solo escucha
por −X»*.

⚠️ **No confundir con `asset:assets/red_concrete.vox.json`**, que es **decoración y no emite nada**.
Hasta 2026-08-06 sí emitía: `redstone/redstone-arranque.js` lo traía en su tabla `DEFECTOS` con
`{ power: 15 }`, o sea que **cualquier pared roja de cualquier mapa era una fuente permanente** y no
había forma de mirar un circuito y saber de dónde salía la señal. Se quitó de `DEFECTOS`. Si hoy un
hormigón rojo enciende algo es porque alguien le ha pegado un cable y está **haciendo de puente**,
como cualquier otro bloque macizo desde r1.2 — y por eso **no** se declara aislante: el puente es el
comportamiento general de los bloques, no algo suyo. Para distinguirlos de un vistazo el bloque de
redstone va **moteado** y el hormigón es **liso** — se generan los dos con `node assets/make_blocks.js`.

Test: **`node test_redstone_bloque_fuente.js`** (las seis caras, que no tiene estado, detrás sí /
debajo no, y que el `red_concrete` no emite pero sigue haciendo de puente).

### El vocabulario de `define()` (r1.1) — y por qué es Turing-completo

`define()` es un **intérprete de reglas**, no una lista de piezas: cada pieza del mundo es una
combinación de estas propiedades, y añadir una no abre el motor.

| propiedad | qué hace | la usa |
|---|---|---|
| `emite: 0..15` | es una fuente mientras esté encendida | palanca, placa, antorcha, repetidor |
| `conduce: {perdida}` | es cable: se queda con el **máximo** de sus vecinas menos la pérdida | cable |
| `encendida` / `apagada` | el par de materiales; **el estado ES la clave de la rejilla**, no hay nada que persistir | todas |
| `invertida` + `umbral` | enciende con señal **por debajo** del umbral ⇒ NOT | antorcha |
| `retardo: 0..64` | el cambio espera N pasadas ⇒ **TIEMPO** | repetidor |
| `manual` | la celda es una **ENTRADA**: la pone el jugador con `conmutar()`, no la señal | palanca, placa |
| `pulso: ms` | se suelta sola pasados N ms | placa, botón |
| `mira` | escucha **solo por su espalda**, y no emite por ahí; el lado sale de la postura de la clave (`mcOriPerm`, ver abajo) | antorcha |

**`mira` no es cosmético: es lo que hace posible la MEMORIA.** Sin él una antorcha leería el mismo
cable que ella alimenta, se realimentaría a sí misma y un anillo de inversores sería un oscilador en
vez de un biestable. Como el lado sale de la **postura**, no hay tabla que mantener — y por eso
`aplicar()` **arrastra la postura** al encender (`'hab:antorcha@3'` → `'hab:antorcha-on@3'`): si no,
la pieza se enderezaría sola al encenderse y dejaría de escuchar por donde escuchaba. Por lo mismo
`encendidaEn()` compara por **base** (`claveBase`), no por clave exacta.

⚠️ **La postura es la de app.js, ENTERA, y no se recorta ni se interpreta a mano.** Dos reglas que
costaron BUG-RS7 y BUG-RS8, que parecían dos fallos y eran uno:

1. `oriDe()` delega en `mcOriNorm`: son **24** posturas. Un `&15` no deja la pieza «casi bien», la
   deja en **otra** postura, y `conOri()` es el paso por el que **todo** cambio de bloque devuelve su
   postura a la celda — así que el recorte lo pagaban por igual la pieza que suelta el jugador
   (`conmutar()`) y la que sigue a la señal sola (`aplicar()`). Como estas piezas son finas, girarse
   equivale a **moverse dentro de la celda**: el dueño lo reporta como «aparece en otro sitio».
2. El **frente** sale de `mcOriPerm(ori)[2]` (dónde acaba el `+X` del dibujo) y ya puede ser `±Y`:
   un pistón mirando al techo empuja hacia arriba. `FRENTE = [0,4,1,5]` sigue en el fuente **solo
   como respaldo** por si el motor no está delante, y es horizontal. `atrasDe = frente ^ 1` vale
   porque `DIRS` va emparejada opuesto a opuesto (`test_posturas_24.js` §E lo fija).

**El flanco de bajada del cable tiene DOS mitades, y la segunda se llama REPESCA.** Un cable se queda
con el máximo de sus vecinas menos la pérdida, así que al quitar la fuente cada celda ve a su vecina
con el valor viejo, calcula uno menos y **se alimenta a sí misma**. La primera mitad es no fiarse de
una bajada: `nivel < antes` ⇒ la celda cae a **0** y avisa, y el tendido se desploma entero hasta que
una fuente de verdad lo rellena. Eso funciona cuando la fuente se ha ido *de verdad*, y falla justo
cuando no: si el desplome lo provoca un botón que se suelta en un tendido que **otra** fuente sigue
alimentando, la celda cae a 0 y ya **nadie la vuelve a mirar** — las vecinas avisan cuando *cambian*,
y la vecina que sigue teniendo el valor bueno no cambia. Quedaba un cable con `recibe=0` y su propio
recálculo diciendo `llega=12`, para siempre. Por eso el cable que se tira a 0 **teniendo señal real**
se anota en `repesca` y se vuelve a encolar **cuando la cola se vacía**: para entonces el desplome ha
terminado y las vecinas presentan su valor definitivo. Se veía en el biestable del ejemplo 6: al
soltar el botón de RESET el anillo entero se moría y el bit se le olvidaba.

**¿Turing-completo?** Sí, con la misma letra pequeña que Minecraft, y hacen falta tres cosas que están:
(1) **juego de puertas completo** — `invertida` da el NOT y el cable da el OR, luego NOR, y NOR sola
genera cualquier booleana (no hay que añadir AND/XOR: se construyen); (2) **tiempo** — sin `retardo`
todo se estabiliza dentro de la misma pasada y una realimentación es un bucle combinacional que el
guardia de oscilación corta, con `retardo` es un **reloj**; (3) **memoria** — dos inversores cruzados =
biestable. La letra pequeña: la cinta son `mc.dim.x·y·z` celdas, o sea **finita** — autómata
linealmente acotado, la misma salvedad que se le pone a Minecraft, a una FPGA o a cualquier ordenador
real. El bloque de cabecera de `redstone.js` lo explica entero.

### Las piezas (`redstone-piezas.js`) — cero líneas de `app.js`

Cable, palanca, placa de presión, puerta y repetidor. Las tres mitades de una pieza salen de sitios
que ya existían:

- **circuito** → `game.redstone.define(...)`, todas con `precargar:false`.
- **física** → `game.bloques.define(k, { atravesable:true })` y `alPisar` (v1.29) para que la placa se
  hunda al pisarla.
- **gesto** → un oyente del **botón CENTRAL** (`mousedown`, fase de captura) **dentro del snippet**.
  `conmutar()` devuelve `false` sin protestar cuando la celda no es manual, así que apuntar mal se
  queda en nada en vez de en un error.
  ⛔ **El clic derecho NO conmuta** (BUG-RS27, 2026-08-20): construye, y solo construye. Hubo un
  envoltorio de `mcUseRight` que probaba a conmutar primero; el dueño lo quitó porque repartir un
  mismo botón entre construir y accionar deja un bloque encima del cable a cada fallo de puntería.
  El snippet **desenvuelve** `mcUseRight` al arrancar, para que una pestaña con la versión vieja
  cargada vuelva sola al comportamiento de `app.js` sin recargar.

`encender(x,y,z,on)` sí protesta (una vez) si la celda no es `manual` — porque ahí sí es un error de
quien escribe el circuito.

#### Apuntar: `miraFina`, y por qué **no** vale `game.aim()`

El rayo del motor trabaja en **celdas**: da por sólida la celda entera en cuanto tiene bloque, y aquí casi
todo son láminas de 1/16 — un cable plano tapa su celda de arriba abajo aunque el rayo le pase un palmo por
encima. Medido a dos bloques de la palanca del ejemplo 1: el cable de delante se comía el cabeceo de −50° a
−24° y la palanca solo respondía en una ventana de 8°. De ahí el «no sé cómo darle». `miraFina` marcha el rayo
a resolución fina contra `mc._geoFina` (`bitsAim||bits`), el mismo bitset con el que choca el jugador.
`game.redstone.apuntada()` lo enseña — `game.aim()` contesta con la celda gorda, que es justo la que engaña.

⚠️ **Las piezas manuales se miden finas como el resto, sin excepción**
([BUG-RS26](../PLAN_ARCHIVO.md#-bug-rs26)). Tuvieron una («a una palanca le vale la celda entera») y eso
convertía cada botón en una **caja invisible**: su dibujo ocupa 88 subceldas de 4096 (**el 2 %**) y el otro
98 % se tragaba el clic, así que con dos botones pegados el de delante se comía siempre el de detrás. Orden
del dueño: **apuntar al aire de la caja de un botón no lo activa**, haya o no algo detrás.

Lo que justificaba la excepción era que la varilla de la palanca es de 1/16 y **se mueve al girarla** ⇒
apuntando al voxel exacto la enciendes y a la siguiente el rayo se cuela por el hueco que ella acaba de
dejar. **Ya no hace falta**, y se comprobó pieza a pieza antes de quitarla: `palanca`/`palanca-on` comparten
**92 de 108** voxeles (la base, `z 0..3` entera) y `boton`/`boton-on` **72 de 88**, así que apuntando al
cuerpo siempre hay materia en los dos estados; la `placa` no comparte ninguno pero solo **se hunde 1/16
dentro de su misma celda** (`z 1` → `z 0`), y el rayo que bajaba hacia ella le sigue dando.

Ya **no hay `VERSION`** en `redstone-piezas.js`: servía para no re-envolver `mcUseRight` en cada
ejecución, y desde BUG-RS27 el clic derecho no se envuelve. El único oyente que queda —el central— se
quita y se vuelve a poner por `window._redstoneMedio`, así que re-ejecutar el snippet siempre deja
viva la `miraFina` recién cargada.

⚠️ **Una pieza se identifica por su NOMBRE, no por el espacio de nombres.** La tabla `CIRCUITOS` va
por nombre pelado (`piston-pegajoso-on`) y el bucle de registro la da de alta **dos veces**, en
`hab:<n>` y en `asset:assets/<n>.vox.json`, traduciendo `encendida`/`apagada` al mismo espacio (las
gemelas se registran con `callado:true` para no doblar el log de arranque). Los ayudantes son
`nombreDe(clave)` (quita espacio de nombres y `@giro`), `comoLa(claveRef, nombre)` (ese nombre en el
espacio de **la clave que hay puesta**) y `ambas(nombre)`. Motivo: el mismo dibujo entra por la
galería o empotrado en `assets/` según de dónde venga, y **exportar de una instancia e importar en
otra cambia justo eso** — con las claves `hab:` escritas a mano, un pistón importado dejaba de ser un
pistón. El espacio se **arrastra**, igual que el giro con `conOri`: un pistón de assets se extiende
con la cabeza de assets y una puerta de la galería mueve su hoja alta de la galería; mezclarlos pide
un material que ese mundo puede no tener. `game.bloques.define` (lo `atravesable`, la placa) va por la
misma vía. Lo cubre `test_piezas_importadas.js`.

**El enganche es un envoltorio de `mcSetBlock`**, que es el embudo de poner, romper, pintar,
deshacer/rehacer, `setVoxel` y la carga diferida de una textura. Lo que **no** pasa por ahí es generar
o cargar el mundo entero (escriben `mc.grid` directo) — y ahí no queremos notificaciones: 10⁷ celdas se
revisan al final, no una a una. Dos detalles que no se ven en el diff:

- Reejecutar el snippet **desenvuelve** el envoltorio anterior por `_orig` en vez de apilar otro; si no,
  cada recarga multiplicaría el trabajo por escritura.
- Salida rápida por `hayCircuito`: sin materiales declarados el envoltorio es una llamada de más y nada
  más (una ráfaga de TNT de 1000 bloques no puede pagar un `Map.set` por vecino). La bandera se declara
  **arriba, con el resto del estado**: declarada después del envoltorio que la lee funcionaba solo por
  el izado de `var` (valía `undefined`).

Un drenado entero re-malla **una sola vez**, con la caja envolvente de todas las celdas que cambiaron —
`mcRemeshAround` acepta dos esquinas desde el arreglo de BUG-TNT1. Un circuito cuesta su caja, no una
pasada por lámpara.

### Se carga solo, y por eso tiene que costar cero

`node redstone/make_snippets.js` publica los tres snippets **y parchea `mundo-autoarranque`** entre dos
marcadores (`// ==REDSTONE-ARRANQUE==`), que es lo que lo hace re-ejecutable sin acumular copias. Ese
snippet es del dueño y lo edita en vivo: **se inserta el bloque, no se reescribe el fichero**. El
`fetch` del bloque **no se espera** a propósito — no puede retrasar la entrada al Mundo.

La consecuencia es que esto corre **en todos los mapas**, así que las tres cosas que costaban poco
pasaron a tener que costar **nada**:

- **`precargar:false`** en los circuitos de serie. Dar de alta un material que ese mundo no usa cuesta
  un `mcMeshAll` **por carga y a cambio de nada**. Sin precarga el coste es cero: si el material no
  está en la paleta, ninguna celda puede tener su id, así que el circuito no existe. Si aparece más
  tarde (el dueño lo coge de la galería), `cargarYReintentar()` carga lo que falte **la primera vez que
  haya que encender algo**, una sola vez y avisando por `toast`.
  ⚠️ Ese reintento va **forzado**: `drenar()` apunta la potencia *antes* de llamar a `aplicar()`, así
  que al volver la celda ya tiene su nivel y `nivel === antes` la descartaría — la señal habría llegado
  y el bloque no habría cambiado nunca.
- **`encolarVecinos` filtra antes de encolar.** Solo entran celdas que son circuito (o que lo eran y
  hay que limpiarles la señal). Sin el filtro, una explosión de 1000 bloques serían 7000 `Map.set` y un
  drenado de 7000 celdas **para no hacer nada**; con él son 7 lecturas de array por bloque y la cola se
  queda vacía. Es semánticamente idéntico: `drenar()` ya descartaba las celdas sin cfg.
- **`repasarMundo()`** en el arranque, porque un mapa puede traer el circuito ya montado en disco y
  `potencia` nace vacía — una lámpara guardada encendida cuya fuente ya no está se quedaría encendida
  para siempre. Barrer `mc.grid` cuesta ~60 ms en 512×40×512 y **no se puede pagar en cada carga**: la
  guarda es que si ningún material del circuito está en la paleta no hay nada que buscar y se sale sin
  tocar la rejilla (un bucle sobre la paleta, ~50 iteraciones). El repaso arranca con `forzar` por el
  mismo motivo que el reintento.

Test: `node test_redstone_arranque.js` (20 ok). Mide **deltas**, no valores absolutos, y usa materiales
**ajenos elegidos en caliente**: `/map/test` ya tiene el circuito del dueño montado de verdad, así que
afirmar «la paleta no tiene la antorcha» ahí no probaría nada.

Test: `node test_redstone_antorcha.js` (20 ok) — inyecta `redstone/redstone.js` **desde el fichero
fuente**, no desde el snippet publicado, para que falle cuando se rompa el motor y no cuando alguien
olvide re-publicarlo. Cubre los dos sentidos (encender **y** apagar, dos veces seguidas), que la
diagonal no cuente, que `quitar()` desmonte, y que sin circuito 200 escrituras no encolen nada.

Test: `node test_redstone_dsl.js` (29 ok) — el del **vocabulario**, también desde el fuente. Prueba lo
que de verdad hay que demostrar: cable con pérdida y flanco de bajada, que una `manual` no se la lleve
el drenado, NOR completo, que `retardo` convierta la realimentación en un **reloj** (y que sin él el
guardia de oscilación la corte rápido en vez de colgar), `pulso`, y el **biestable**. El biestable se
prueba con SET desde el principio y midiendo lo único que importa —que al **retirar** la fuente se
quede donde lo dejaron, y que RESET lo deje en el otro estado—: arrancar el anillo en seco es su punto
metaestable y con el mismo `retardo` los dos inversores bascularían al unísono. Un biestable real
tampoco elige solo al darle corriente.

### El pistón (REQ-RS3) — y por qué NO usa `encendida`

La única pieza que **mueve materia** en vez de combinar capacidades del motor, y por eso la primera
que usa `alRecibirSeñal`. Vive entera en `redstone/redstone-piezas.js`: cero líneas de `app.js`, cero
del motor. Empuja **un bloque una celda** hacia su frente; al soltar recoge su cabeza y **no** tira de
lo que empujó (es un pistón normal, no pegajoso). Son tres materiales: `hab:piston`, `hab:piston-on` y
`hab:piston-cabeza`, que ocupa la celda de delante como bloque propio.

⚠️ **Se registra con DOS `define()`, uno por material, y eso no es un descuido.** Con `encendida`, el
motor cambia el bloque **él** (`redstone.js:448`) *antes* de llamar al callback, así que un pistón que
no puede extenderse —contra el borde del mundo, o con dos bloques delante— ya se habría pintado
abierto. Y devolverlo a su sitio **no aguanta**: escribir la celda la re-encola como «estrenada»
(`redstone.js:265`), lo que salta el atajo `nivel === antes` y la pasada siguiente la vuelve a abrir.
Con dos `define()` de la misma cfg, `apagada` es cada uno sí mismo, el motor no toca el bloque y quien
decide si se extiende es el callback. Los dos tienen que seguir siendo circuito o el pistón extendido
se cae de la cola y no se recoge jamás.

Otras dos que muerden a quien toque esto:

- **El motor solo re-malla lo que ha tocado él** (`remallar(tocadas)`, `redstone.js:421`). Las celdas
  del pistón están una y dos casillas más allá, así que el callback llama a `mcRemeshAround` por su
  cuenta — si no, el bloque se mueve en la rejilla y en pantalla no pasa nada.
- **Hacia dónde empuja se DERIVA**, con `mcOriPerm(ori)[2]`: el `+X` del dibujo pasado por la misma
  composición que gira la geometría al estampar. Una tabla escrita a mano se desincroniza del dibujo,
  que es exactamente lo que costó BUG-RS2 — y una tabla **horizontal**, aunque estuviera bien, es lo
  que impedía apuntar el pistón al techo (BUG-RS7). `@16..@19` empujan hacia arriba, `@20..@23` hacia
  abajo, y las otras 16 en horizontal.

**Límite conocido:** empuja lo que hay en `mc.grid`. Una estructura estampada (`mc.structures`) ocupa
varias celdas y no vive en la rejilla: delante del pistón se ve como aire.
`node test_redstone_piston.js` (los 4 giros horizontales **más las 8 verticales**) · banqueta en
`/map/test` con `node redstone/plantar_piston.js`.

#### ...y también empuja CUERPOS (`apartar`, BUG-RS9 / BUG-AG1)

Un pistón que atraviesa al jugador no es un pistón. Y el fallo **no estaba en el pistón**: estaba en
quién limpiaba el estropicio. El pistón escribía la cabeza dentro del jugador y se desentendía; el
solape lo resolvía la auto-curación de `mcUpdate`, que tira de `mcUnstick`, y **`mcUnstick` solo sabe
buscar salida HACIA ARRIBA**. El primer hueco de aire sobre la cabeza recién extendida es justo la
cota de montarse encima. O sea: el jugador no trepaba, lo *desatascaban* hacia arriba. Mismo
razonamiento y misma forma que `mcAgentShove` con las embestidas — **un empujón se resuelve en la
dirección del empujón**, no por el hueco más cercano.

Tres cosas que hay que respetar si se toca `apartar()`:

- **Va DESPUÉS de escribir los bloques.** Así no hay que saber ni la caja del jugador, ni la forma de
  la cabeza, ni su escala: se le pregunta a `mcCollides`, que ya sabe las tres. Antes de escribir, las
  celdas barridas son aire y no hay contra qué chocar.
- **`chocabaAntes` se mide antes de tocar nada.** Si ya venía embutido en algo, no lo ha metido ahí el
  pistón y no le toca a él sacarlo. Sin esa guarda, cada pistón del mundo es un desatascador remoto.
- **Si no cabe, no se mueve.** Se queda donde está y ya lo desatascará `mcUpdate`; colarlo dentro de
  la pared de enfrente es peor, de ahí no se sale andando.
- **El barrido prueba distancias CRECIENTES desde donde está, y acepta el primer hueco** (en pasos de
  1/16, para no saltar al otro lado de la pared). No es lo mismo que encadenar pasitos comprobando
  cada uno: cuando `apartar()` corre, la cabeza **ya está escrita** y el cuerpo ya está embutido en
  ella, así que el primer pasito tampoco cabe. `apartarAgentes` cayó en eso y los agentes salían
  movidos 1/16 y nada más.

⚠️ **Los agentes articulados NO son el mismo caso, aunque el síntoma se pareciera.** Con `mc.pos`
basta `mcCollides`; la caja de un agente son estructuras estampadas y su colisión es asunto de la
librería de esqueletos, que no asomaba nada. Por eso la librería creció **dos capacidades generales**
—`game.esqueletos.enCaja(x0,y0,z0,x1,y1,z1)` y `game.esqueletos.desplazar(rig,dx,dy,dz)`— y la
**política** se quedó en la pieza. Un `game.esqueletos.empujaPiston()` habría metido el redstone
dentro del motor de agentes, que es justo lo que la regla de arquitectura prohíbe.

⚠️ Y una tercera capacidad, por el mismo camino: **`aturdir`** (BUG-AG5). El empujón es de un tiro y
el agente anda cada frame, así que se comía su propio desplazamiento. `apartarAgentes` lo aturde
`game.redstone.shockPiston` segundos (1 por defecto) tras desplazarlo, **también si no cupo**. El
cómo está arriba, en «El shock: dos dueños del mismo cuerpo en el mismo frame».

`node test_piston_empuja.js`. Sus tramos B (al que está lejos no se le mueve **ni un float**) y C (un
pistón mirando arriba **sí** te levanta: eso no es el bug) son los que impiden el falso verde.

#### El «unstick» automático viene APAGADO (`game.autoUnstick`, BUG-AG7)

Tercera vez que aparece el mismo mecanismo, y por eso acabó apagado: **`mcUnstick` solo sabe buscar
salida HACIA ARRIBA**, así que cualquier cosa que te embuta te acaba plantando **encima** de ella. Con
la cabeza del pistón fue BUG-RS9; con la serpiente, `mcAgentShove`; y en cuanto los brazos de un
agente se volvieron sólidos (BUG-AG4), rozar uno te subía a caballito.

**`game.autoUnstick` = `false` por defecto**, persistido (`vf_mcAutoUnstick`) y en `dumpVars()`.
Atascarse se sale con la tecla **U** (`mcForceUnstick` / `game.unstick()`: sube, y si no cabe te manda
al spawn) — un gesto, no una sorpresa.

Lo que el interruptor **NO** apaga, y no se debe meter dentro sin pensarlo:

- **`mcAgentShove`**, que corre siempre. Aparta en **horizontal**: no aúpa a nadie, y desconectarlo
  desandaría el arreglo de la serpiente.
- **Los `mcUnstick()` de un solo tiro**: teletransportarse, estampar, cambiar `mc.scale`, re-mallar.
  Son deliberados. Apagarlos dejaría `game.tp` dentro de una pared sin salida.

Y un aviso por **`toast()`**, una vez por atasco (`mc._atascado`, que se rearma al quedar libre): sin
él, «no me puedo mover» se lee como el juego colgado, porque la tecla que lo arregla no se adivina.

⚠️ Esto trata el **síntoma**. Que el brazo de un agente te embuta al rozarlo sigue pasando; lo que ya
no pasa es que te planten encima. La cura sería que a las piezas de un rig les llegara algo como
`mcAgentShove`, y eso es otro ticket.

`node test_auto_unstick.js`. El tramo que impide el falso verde es **D**: con el interruptor
**encendido** la conducta de siempre sigue intacta. Y el defecto se mide **limpio** (el test borra
`vf_mcAutoUnstick` antes de cargar, o leería la preferencia de una sesión anterior en vez del defecto
del motor). El tramo E **espía** `mcAgentShove` en vez de leer el texto de `mcUpdate`: el snippet del
mundo envuelve funciones del motor, y `String(mcUpdate)` puede acabar siendo el envoltorio.

### La puerta son DOS celdas (BUG-RS6) — y por qué una pieza alta no puede ser una estructura

Agrandar la puerta de 16³ a **16×16×24** la sacó de la rejilla y la dejó muda. No fue el circuito:
**`mcCabeEnRejilla` exige `w/h/d ≤ 1` celda** para que una pieza entre en `mc.grid`, y 24 de alto son
dos, así que el clic derecho pasó a estamparla como **estructura suelta** — y una estructura no tiene
celda, ni vecinos, ni señal.

👉 **Regla general: una pieza de redstone no puede pasar de 16³.** Si necesita más, se **apila en
celdas** y una manda sobre las otras. Estampar la pieza grande como estructura no es alternativa: son
un draw call cada una y el dueño las descartó por lentas.

La puerta son cuatro dibujos —`puerta` / `puerta-alta` y sus dos `-abierta`— que salen de **un solo
dibujo de 24**: `redstone/partir_puerta.py` lo parte por celdas y **deriva la hoja abierta girando la
cerrada 90° sobre la jamba**. Dibujar la abierta aparte se desincroniza a la primera — ya pasó. El
script trabaja sobre lo que hay **en la galería**, así que respeta los retoques del dueño; lo que pisa
va a `data/habitantes_trash/`.

Al **unísono** significa la misma pasada, no «rápido»: `hab:puerta` y `hab:puerta-abierta` van con dos
`define()` y `alRecibirSeñal` (mismo motivo que el pistón), el callback escribe **las dos celdas y
remalla una vez**, y **la mitad de arriba no es pieza de redstone** — no tiene señal, no conduce, no
hace cola. Como todo va con `precargar:false`, si a la hoja de arriba le falta el material en la
paleta **no se mueve ninguna de las dos** y se reintenta entero.

- La puerta **ya no conduce**. El `conduce: {perdida:1}` de antes existía solo para que la hoja de
  arriba se enterase; con 0 las dos se sostenían la una a la otra y la puerta **no se cerraba jamás**.
- **No hay auto-completado al poner**: `game.bloques` no tiene gancho `alPoner`/`alRomper` y
  `alRecibirSeñal` solo salta con cambio de nivel. Se ponen las dos mitades a mano, y una puerta de
  **una sola celda sigue siendo legítima**. Lo que haya encima que no sea media puerta **no se pisa**.
- El giro se **arrastra** a la hoja de arriba (`'@3'` abajo ⇒ `'@3'` arriba).

`node test_redstone_puerta.js` — mide **en qué pasada** cambia cada hoja, tickeando de una en una.

### El mapa de ejemplos (`/map/redstone`)

`node redstone/montar_ejemplos.js` **construye, acciona y comprueba** las nueve parcelas de
`redstone/redstone-ejemplos.js`, y luego guarda. No es un test aparte: es el propio montador el que
verifica, porque **un circuito mal orientado se ve igual de bonito y no hace nada**. Reglas que se
pagaron caras:

- **Los lazos realimentados (5 reloj, 6 memoria, 8 XOR) necesitan un repetidor de VUELTA.** El cable
  pierde 1 por bloque y muere a los 15; un lazo que le da la vuelta a una parcela de 26×16 mide más
  que eso, así que **no cierra**: la señal llega a cero antes de volver. El reloj no oscilaba y el
  biestable no se acordaba.
- **Un reloj se mide contando CAMBIOS, no estados distintos.** `new Set(muestras).size > 1` lo cumple
  también un circuito que cambia **una** vez y se queda quieto — que es exactamente lo que pasaba:
  se estaba midiendo el pulso de soltar el freno. La prueba pasaba y el reloj no existía.
- **Las piezas giradas son otra entrada de paleta** (`hab:repetidor@2`), no la misma con un atributo:
  si no se precargan en `CLAVES`, salen roca.
- **Las parcelas no se mudan de sitio.** Las notas de los carteles van indexadas por coordenada, así
  que mover una parcela deja su nota vieja colgada en la bandeja del dueño para siempre. Las calles
  nuevas se abren **delante** (z menor); `FILAS = [30, 52, 72]`.
- **Ningún cable flota en el aire.** El motor lo permite (dos celdas separadas por un hueco no se
  tocan, así que un «puente» por arriba resuelve un cruce en dos líneas), pero es justo lo que en
  Minecraft no se ve nunca y el dueño lo cazó a la primera. Los cruces se rodean **por el suelo**
  aunque salga más largo que 15 y haya que pagar un repetidor de vuelta (ejemplo 8), y un cable que
  sube va **pegado a una pared** que lo sujete (ejemplo 9).
- **La puerta son dos celdas pero UNA puerta:** `hab:puerta` lleva `conduce: {perdida: 1}`, así que
  se alimenta la hoja de abajo y la señal sube sola. Antes hacía falta un cable para cada hoja, y el
  de la de arriba salía flotando a media altura. ⚠️ **La pérdida tiene que ser 1**: con `perdida: 0`
  las dos hojas se sostienen la una a la otra —sin gradiente ninguna baja nunca— y la puerta **no se
  cierra** al soltar la placa. Lo cazó «se cierra sola al soltarse la placa» en el montador.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

(Minimización de `CLAUDE.md` pedida por el dueño; arriba queda la regla y el enlace.)

- Tocas un fuente de `redstone/` → **re-publícalo** o el mundo sigue con el snippet viejo.
- **Pieza ≤ 16³**: más de una celda y `mcCabeEnRejilla` la manda a `mc.structures`, donde no tiene celda,
  ni vecinos, ni señal (BUG-RS6, la puerta muda).
- `define('apagada', {encendida:'X'})` **registra TAMBIÉN `X`**, o la lámpara se enciende una vez y no
  vuelve jamás. Todo con **`precargar:false`**.
