# El panel de Agentes (crear y editar un bicho)

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

### El panel de agentes (pestaña **Agentes**, v1.22)

Lista de agentes guardados, formulario por pieza (dibujo, `rot`, pivote / eje / base / reposo /
amplitud / fase) y **preview 3D animado** con los dos interruptores de verdad (*te ve* / *anda*), un
mando de giro y un botón **Plantar** que lo suelta delante del jugador.

**Cada campo se explica solo.** `base` / `reposo` / `amplitud` / `desfase` no se adivinan mirándolos
(«en edición de agentes articulados no queda claro qué es cada una de estas opciones»), así que la
etiqueta de un campo puede ser `'amplitud'` o **`{t:'amplitud', ayuda:'…'}`**. Va como objeto y no
como un argumento más porque en `agCampoNum` el último ya lo tiene pillado `esDef`: así cualquier
campo se explica sin tocar ninguna firma. La ayuda sale por **dos vías** — el `title` del `<label>`
(el globo de siempre) y un **«?» que la despliega debajo**, porque en el móvil no hay hover ni globo —
y se abre con **`:focus` y no con `:hover`** para que las dos no se pisen. Nada de estado en el DOM:
el formulario se reconstruye entero en cada tecla (por eso `agAbiertas` vive fuera), y el foco se
pierde solo, que es justo lo que se quiere. ⚠️ El «?» es un `<button>` **dentro del `<label>`**: se
salva de robarle el clic al campo porque es *contenido interactivo* y la activación del label lo
salta — lo prueba `test_panel_agentes.js`. Efecto lateral querido: `.ag-fld.con-ayuda` lleva
`flex-wrap:wrap`, así que en el móvil una terna como `en (x, alto, z)` cae a su propia fila entera en
vez de partir el rótulo por la mitad.

**El preview NO calcula la pose: se la pide a la librería.** `app.js` llama a

```js
const pl = await game.esqueletos.preparar(doc);        // no planta nada ni deja esqueletos vivos
game.esqueletos.pose(pl, {fase, giro, activo, andando});   // devuelve las piezas con su `m` puesta
```

y solo **dibuja** esas matrices. Es lo que mantiene el §0 en pie (el framework sigue sin saber qué es
un zombie) y, sobre todo, lo que hace **imposible que la pose del panel se desvíe de la del Mundo**:
las dos salen de la misma `matrizPieza`. Por eso el refactor que extrajo `matrizPieza`/`centroGiro`
va **antes** que el panel — con dos composiciones parecidas, la divergencia es cuestión de tiempo.

**La única divergencia, y es a propósito:** en el Mundo la fase del ciclo de andar avanza con la
**distancia** recorrida; en el panel no hay distancia, así que la adelanta el **reloj**. El panel es
un maniquí, no un bicho andando.

Lo que sí vive en `app.js` es un **rasterizador** (`agDibujar`), y ahí hay cuatro cosas que costaron:

- **Backface culling por la normal GIRADA** contra el gradiente de profundidad, no por el orden de los
  vértices: la matriz de una pieza puede **espejar** y entonces el winding miente.
- **Fusión ávida de caras coplanares** (`agGeom`): el zombie entero baja de ~3.300 caras a **803
  cuadros**. No es solo velocidad — menos cuadros son menos bordes tocándose, o sea menos costuras del
  antialias de canvas (la misma lección que el rasterizador del iso).
- ⚠️ **`s.aabb` es CEÑIDO, no la celda 16³**, así que el atajo de «con `rot` impar se intercambian X y
  Z» **es falso** para cualquier dibujo que no llene su celda (el brazo del zombie es 5×5×14 centrado).
  Hay que pasar la caja **redondeada a celda** por `mcRotXZ`, igual que `mcStructGeom`.
- ⚠️ **La luz va atada a la CÁMARA**, no al mundo (`AG_LUZ` = `[derecha, arriba, hacia el
  espectador]`). Con un sol fijo en coordenadas de mundo, girar el preview a un **perfil** dejaba las
  caras visibles en el suelo del término ambiente y el muñeco se veía casi negro.

El lienzo se estira por CSS y su resolución la fija `agResize` (caja × `dpr`); apilado en móvil el
escenario lleva **su** alto (`46vh`), porque con `flex:1` la lista y el formulario lo dejaban en una
banda de ~80 px.

### Hacer un agente NUEVO desde el panel (v1.23) — y el segundo bicho, un perro

Hasta v1.22 el panel **editaba** agentes pero no dejaba **crear** uno: el zombie existía porque su
documento se escribió a mano. Montar el perro entero desde el formulario destapó dos huecos, los dos
genéricos (ni una línea de `app.js` sabe qué es un perro):

1. **El desplegable de dibujos no ofrecía ni una pieza de agente.** `agCatalogo` filtraba
   `type!=='textura'` — un filtro que está para no listar los 34 azulejos de 1×1 como piezas de un
   muñeco — y las piezas del zombie **son** `type:'textura'`, así que se las llevaba por delante. Y
   tienen que serlo: ese tipo es lo que enruta el guardado del editor a `/api/assets`, que es lo
   único que deja **reponer un pivote** con 📍 y guardar la pieza de vuelta. Se salvó el `group`:
   `a.type!=='textura' || a.group==='Agentes'`. ⚠️ **Ese filtro ya no está** — ver abajo por qué.
2. **Faltaba la mitad del documento.** El formulario cubría las piezas pero no la **conducta**, que
   no es de ninguna pieza sino del bicho entero: `seguir` (detección / se para a / velocidad),
   `andar.cadencia`, `cuerpo` (caja de choque) y el `mirar` de la cabeza. Sin eso, un agente nuevo
   nacía sin perseguir nada. Van en un bloque aparte, **«El bicho entero»**, separado del de la pieza.

⚠️ Los números que enseña ese bloque cuando el documento **no** trae la clave son los que de verdad
usará `normalizarSeguir` (detección 16, se para a 2.5, velocidad 3), no ceros: un 0 en «se para a»
diría que se te echa encima, que es justo lo contrario de lo que hace un agente sin `seguir`.

**«Seguir a una distancia» ya lo sabía hacer el motor**, y conviene no reimplementarlo: `distancia`
no es un mínimo, es **un sitio donde estar** — si te acercas más, `pasoSeguir` hace retroceder al
agente. Medido en el Mundo del dueño con el perro: 3.06 → 4.33 → 3.02 → 3.00 y ahí se queda clavado,
con `teVe=1` y `andando` decayendo a 0.

`data/agentes/perro.json` es el primer **cuadrúpedo**: 4 patas del mismo dibujo, en diagonal (`fase`
0 / 180 / 180 / 0), cabeza con `mirar` y cola meneando sobre el eje **y**. Que salga de la misma
librería sin tocarla es la prueba de que el rig **por instancia** era la decisión correcta: la pata
delantera izquierda y la trasera derecha son el mismo material con distinta fase.

`node test_panel_agentes.js` (18 ok) fija las dos cosas: que el desplegable ofrece las piezas de
agente **sin** comerse el resto del catálogo, y que al agente montado por el formulario no le falta
ningún campo — construye un bicho de usar y tirar entero por la UI, comprueba el JSON resultante
campo a campo, comprueba que esos campos también **leen** un agente guardado (el zombie) y **no
hace ni un POST**.

#### «Guardar como…» — el `id` manda sobre el nombre

`POST /api/agentes` deriva el fichero de **`d.id || d.nombre`** (`server.py:437`), así que **el `id`
gana**: cargar el zombie, renombrarlo y darle a **Guardar** reescribía `data/agentes/zombie.json` con
otro nombre dentro. No había forma de sacar una copia ni de partir de un bicho que ya funciona para
hacerle una variante. `agGuardarComo()` **le quita el `id` al documento** — eso, y solo eso, es lo
que convierte el guardado en un «como…».

- El aviso de «ya existe» usa `slug()` (`app.js:1680`), que es **el mismo** que `slugify` de
  `server.py:33-35`; calculado de otra forma mentiría justo en los casos raros (acentos, símbolos) y
  la copia pisaría un agente en silencio. Sobrescribir se confirma, y la versión anterior va a la
  papelera igual (`to_trash`).
- **Si el POST falla se deshace el cambio** (`id` y `nombre` vuelven a los de antes, y el campo
  también): si no, el panel se quedaría apuntando a un fichero que no existe y el siguiente
  **Guardar** escribiría en el sitio equivocado.
- El nombre propuesto es el primero libre (`zombie 2`, `zombie 3`…), comprobado contra `agLista`.

⚠️ **Renombrar sigue sin estar cableado.** `PATCH /api/agentes/<id>` sabe mover el fichero
(`server.py:539-545`) pero **nada en `app.js` lo llama**: cambiar el nombre y pulsar Guardar deja el
fichero con el id viejo y el nombre nuevo dentro. El toast lo dice (`guardado en
data/agentes/<id>.json`), y con «Guardar como…» ya hay una salida, pero es un cabo suelto.

#### El desplegable «dibujo» no esconde nada, y el catálogo no se cachea de por vida

El filtro de v1.23 (`a.type!=='textura' || a.group==='Agentes'`) tenía una consecuencia que solo se ve
al **crear una pieza nueva**: `POST /api/assets` guarda todo como `type:'textura'` +
`group:'Bloques de construcción'` (`server.py:484-485`) y **no hay UI para elegir el grupo**, así que
copiar la cabeza, llamarla «Cabeza de Personaje» y guardarla la dejaba **invisible para siempre** en
el desplegable. Les pasaba también a `cabeza` y `brazo`, las dos piezas del zombie original. Ahora
`agCatalogo()` ofrece **todo**, repartido en `<optgroup>` con **Agentes primero** (`AG_GRUPOS`): eso
resuelve lo que el filtro resolvía de verdad — que los azulejos no tapen los brazos — sin ocultar
nada. `sort` es estable, así que dentro de cada grupo manda el orden del índice, o sea el orden en
que se fueron guardando.

(Que exista una «Cabeza de Personaje» aparte de la del zombie es la otra mitad del mismo defecto: el
guardado deducía el id del rótulo y bifurcaba. Ver **«Retocar una pieza y que el bicho vivo se
entere»**, más abajo.)

Y `agCat` se **invalida al abrir el panel** (`openAgentes`). Se cacheaba una sola vez por carga de
página: guardabas una pieza en el editor, volvías al panel y seguía sin estar. Refrescarlo cuesta un
`fetch` del índice por apertura.

⚠️ La pieza que el documento ya trae se antepone al catálogo aunque este no la conozca (grupo «En el
documento»): si no, elegir otra pieza y volver dejaría el `<select>` apuntando a un dibujo distinto
del que dice el JSON.

Test: `node test_panel_agentes.js` (**40 ok**) — que el catálogo ofrece un `textura` fuera del grupo
Agentes (`adoquin`), que el primer `<optgroup>` es «Agentes» y que cada grupo sale ordenado. El
«Guardar como…» se prueba **sin escribir nada**: los `POST` van abortados y se inspecciona el
documento que *habría* salido (sin `id`, con el nombre nuevo) más la marcha atrás al fallar. Las
ayudas se comprueban por las dos vías a la vez (que el `title` y la nota digan **lo mismo**) y con un
**clic de verdad** de Playwright, no solo con un `focus()` a mano: lo que se quiere saber es que un
dedo llega a ellas.

#### Retocar una pieza y que el bicho vivo se entere — el asset se identifica por su FICHERO

La queja: «los cambios que se realizan en el bloque/estructura una vez guardado no se reflejan en el
personaje». **No era el refresco**: `mcRefreshSavedKey()` funcionaba (una sonda le cambió a un rig
vivo el `colCount` de 1578 a 8472 en caliente). Era **dónde aterrizaba el dibujo**.

Un agente guarda sus piezas como `asset:assets/<id>.vox.json`. Pero al guardar, el id se deducía del
**rótulo**: `POST /api/assets` hacía `idd = slugify(meta.name)`. Retocar «Torso de zombie» escribía
en `torso-de-zombie.vox.json` — **un asset nuevo que no usaba nadie** — mientras el agente seguía
leyendo `torso-zombie.vox.json`, y el refresco se mandaba con la clave del fichero nuevo, así que
tampoco había forma de que se notara. **17 de los 49 assets** tenían `id != slug(nombre)`,
**incluidas las 8 piezas de agente**: ninguna se podía retocar. Los `assets/*-de-personaje.vox.json`
del dueño son las esquirlas de esto.

Es **el mismo defecto que ya se arregló para los agentes** («Guardar como…», arriba): el `id` manda
sobre el nombre. Ahora:

- **`POST /api/assets` respeta `d.id`** si viene (acotado a `[A-Za-z0-9_.-]`, así que un
  `../../data/habitantes/diana` se queda en `assets/`); sin `id`, alta nueva y ahí sí manda el nombre
  — que es justo lo que hace **«Guardar como…»**, y por eso sigue bifurcando.
- **Cargar un asset de la galería se queda con su id** (`loadFromUrl(url, id)`). Antes lo ponía a
  `null` a propósito («punto de partida»), y eso era lo que forzaba la bifurcación.
- **El id viaja en la copia local** (`localSnap`/`restore`): sin eso, recargar la página perdía el
  origen y el siguiente Guardar volvía a bifurcar.
- **Se respalda antes de pisar** (`to_trash(..., move=False)`): ahora que Guardar reescribe assets,
  perder la versión anterior sería un roto de verdad. Y el índice refresca también el `size` (el
  dibujo pudo cambiar de tamaño), pero **nunca el `group`**: no hay UI para elegirlo y machacarlo
  mandaría una pieza de «Agentes» a «Bloques de construcción».
- El toast dice **el fichero**, no solo el rótulo: es lo que enseña de un vistazo que el dibujo fue
  donde lo buscan los agentes.

⚠️ **Renombrar y darle a Guardar pregunta.** Es el otro camino que usa el dueño (cargar una pieza del
zombie, llamarla «de personaje» y guardar) y las dos lecturas son razonables: *retoco esta* o *parto
de ella para hacer otra*. Manda el id, así que sin el aviso ese «hazme una variante» se habría
convertido en **pisar el original**. Sin cambio de nombre no se pregunta nada.

**Y una segunda mitad, la del panel** («en el Mundo al guardar se ven los cambios, es en el editor de
agentes donde no»): el preview del panel **no pasa por el Mundo** y tiene sus propias cachés —
`agGeomCache` (caras ya fusionadas, por `clave|rot`) en `app.js` y `docsCache` (el doc del dibujo)
dentro de la librería de esqueletos, en el snippet. `mcRefreshSaved` las suelta ahora **antes** del
corte por `mc.gl` (el panel tira con el Mundo sin abrir, si no no se llegaría nunca) y le pide al
snippet que olvide lo suyo con **`game.esqueletos.olvidarDibujo(clave)`** — se le pide, no se le
hurga dentro.

⚠️ Y el sitio donde se vacía `agGeomCache` importa: tiene que ser **justo cuando entra el plan nuevo**
(dentro del `.then` de `agPreparar`), no al guardar. Entre la petición y la respuesta el bucle de
dibujo sigue pintando el plan viejo y **vuelve a llenar la caché con el dibujo de antes**; limpiando
solo al guardar, el torso viejo sobrevivía igual. La sonda lo enseñó sin ambigüedad: el doc ya traía
el dibujo nuevo (1320 → 660 voxels) y las caras dibujadas seguían clavadas en 803.

Test: `node test_guardar_pieza.js` (**13 ok**) — se crea **su propia** pieza con `id != slug(nombre)`
(y la borra en el `finally`, comprobando que los 49 assets del dueño siguen enteros), la carga desde
la galería con un clic de verdad, la retoca, guarda, y mira **el fichero en disco**: que cambió el de
siempre, que **no** apareció el bifurcado, y que la clave que se manda refrescar es exactamente la
que usa un agente. Más el F5, y las dos ramas del aviso al renombrar.
