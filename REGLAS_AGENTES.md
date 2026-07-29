# Especificación Oficial de Reglas de Comportamiento de Agentes (v4.45) 📜🤖

Este documento establece las especificaciones técnicas obligatorias y sacrosantas para todos los agentes del motor VoxelForge.

---

## 0. Regla de Arquitectura (SACROSANTA) 🚧

**NO SE MODIFICA `app.js` (EL FRAMEWORK) PARA HACER CAMBIOS EN LOS AGENTES**, salvo que sea imposible
realizarlo de otra manera **y esté aprobado por el dueño del proyecto**.

**`app.js` debe ser AGNÓSTICO a cómo son o cómo se comportan los agentes.** El framework aporta la
mecánica (planificador, andar, pintar, notas, telemetría, dibujo del cuerpo); la identidad y la
política de cada agente NO viven ahí.

Orden de prioridad obligatorio ante cualquier cambio de agente:

1. **Mejorar la librería de agentes** — `data/snippets/base-npc-skills.json` — si el cambio sirve a
   más de un agente.
2. **Añadir el código necesario al propio snippet del agente** si es muy particular de él.
3. **Tocar `app.js`** — únicamente si 1 y 2 son imposibles, y **preguntando antes**.

Nota técnica que hace innecesario el paso 3 casi siempre: los snippets se ejecutan en ámbito global
con `AsyncFunction`, así que **alcanzan los internos de `app.js`** (`mc`, `mcAgentMesh`,
`mcSurfaceY`…) sin modificarlo — `base-npc-skills.json` ya lo hace.

**Precedente**: el cuerpo multi-celda de la serpiente (cola de 10 segmentos) se resolvió **sin tocar
el framework**, creando cada segmento como **otro agente pausado** (`autostart:false` + `pause()`):
`mcAgentsTick` salta lo que no está `'running'`, pero `mcAgentsSmoothUpdate` solo salta `'stopped'`
(le interpola la posición y le re-malla el cubo) y el bucle de dibujo solo mira `vbo && count`.

---

## 1. Métrica Principal de Objetivo (`goal`)
- La meta `goal` de todo agente de exploración o construcción es alcanzable en tiempo real y debe reflejar la **Cobertura 100% 3D Real del Terreno**:
  - `a.goal = 'Cobertura 100% 3D: XX% (visited/totalWalkable)'`

---

## 2. Detección y Sacrosantidad de Tickets
- La emisión de tickets en consola F12 y detención final tras **5 tickets idénticos acumulados** son **sacrosantas** e **intocables**.
- **Regla de Cobertura Estancada**: El ticket `COBERTURA_ESTANCADA` exige una ventana de 50 ticks (10 segundos) y oscilación real (`uniqueRecent.size <= 2`).
- **Reseteo Dinámico por Progreso**: Si el agente descubre 30+ celdas 3D nuevas respecto a su última medición, la cuenta de tickets de estancamiento se resetea dinámicamente a 0.

---

## 3. Notas 3D en el Mundo Voxel
- Las notas en bloques 3D (`a.note(texto, [x, y, z])`) son la memoria compartida e individual de los agentes.
- Formatos de notas oficiales:
  - **Callejones sin salida**: `'callejon sin salida\n[NombreAgente]: N veces'`
  - **Fosos trampa**: `'foso trampa\n[NombreAgente]: N veces'`
  - **Visitas a la cima**: `'visitas a la cima\n[NombreAgente]: N veces'`
  - **Escapes de bucle**: `'escape de bucle\n[NombreAgente]: N veces'`
  - **Pino de emergencia**: `'pino de emergencia\n[NombreAgente]: [Motivo del rescate]'`

---

## 4. Evitación de Pozos Trampa 3D (`isTrapPit`)
- Se considera pozo trampa cualquier celda sin suelo o donde el desnivel con las 4 direcciones adyacentes impida la salida física.

---

## 5. Prevención de Bucle por Desgaste de Frecuencia (Mapa de Calor Temporal)
- El agente evalúa las pisadas recientes en los últimos 50 ticks (`v.recentVisits`).
- Si una casilla ha sido pisada $\ge 4$ veces en la ventana temporal de 10 segundos, se marca como punto caliente y el agente gira automáticamente hacia la celda adyacente más fría.

---

## 6. Jerarquía Estricta de Desatasco Físico (Sacrosanta)
Cuando `moved === false` o cuando se alcanza el umbral adaptativo de pasos sin progreso:
1. **Prioridad 1 (Desvío Físico Ortogonal)**: Intentar caminata a celdas libres adyacentes no transitadas.
2. **Prioridad 2 (Minado de Emergencia Físico 3D)**: Destruir bloques de muro entorpecedores en las 4 direcciones adyacentes para abrir salida física. Si tras picar sigue sin haber salida, se deja un **Pino Piramidal 3D** como hito, con nota justificativa y uno solo por sitio.
3. **Prioridad 3 (Salto Táctico)**: Teletransporte como **ÚLTIMO RECURSO ABSOLUTO** únicamente si los intentos de desvío y minado físico no abrieron salida.

**El escalón solo se considera cumplido si el mundo CAMBIÓ a mejor, no si el agente hizo algo** (v4.36, ver
§21). Cada peldaño devuelve `true` únicamente cuando *después* de actuar existe un vecino pisable; si no, el
control tiene que caer al siguiente. Un peldaño que devuelve `true` por haber *intentado* algo convierte la
jerarquía en un bucle de un solo escalón y los tres de abajo dejan de existir.

---

## 7. Freno Estricto de Spam de Toasts (Cooldown de 10s)
- Para evitar la inundación emergente en pantalla, los avisos de aviso de escape tienen un **cooldown obligatorio de 10 segundos por agente**. La maniobra de huida en 3D se ejecuta silenciosamente sin interrumpir al jugador.

---

## 8. Inspector F12 de Historial de Toasts (`game.toastLog()`)
- `game.toastLog()`: Muestra en la consola F12 el registro global cronológico de todos los toasts emitidos por los agentes.
- `a.vars.showToastHistory()`: Muestra los toasts específicos del agente seleccionado.

---

## 9. Rejilla de Oscilación Limpia (`game.heatmap()`)
- `game.heatmap()`: Muestra la rejilla 2D del terreno silenciando los pasos de avance lineal (`.` para 1-2 pasadas) y destacando gráficamente las **zonas de oscilación**:
  - `.` : Tránsito fluido / Lineal.
  - `░` : Templado (3-5 pasadas en micro-zona).
  - `▒` : Oscilación activa (6-9 pasadas).
  - `█` : **¡ATASCO CRÍTICO!** (10+ pasadas repetidas en micro-zona).

---

## 10. Diagnóstico Directo de Atascos (`game.stuck()`)
- `game.stuck()`: Comando en F12 que devuelve una tabla interactiva con todos los agentes atrapados en tiempo real (incluyendo alertas de `🌲 CIMA_PINO_ESTANCADA`).

---

## 11. Redirección Automática de Borde de Mapa (`isBorderZone`)
- Cuando un agente se encuentra a menos de 2 bloques del perímetro del mapa y **merodea** por esa zona, se
  le impone una **redirección automática hacia el interior del terreno** (hacia el centro libre).
- El merodeo se mide contando las pisadas de los últimos 50 ticks dentro de una **caja de 5×5** centrada en
  el agente, y exige **`BORDER_LOITER_MIN = 8`** (v4.34; antes eran 3).
- **Por qué 8 y no 3 — no bajarlo.** La caja de 5×5 contiene **siempre** la celda actual más las 2 que se
  acaban de dejar atrás, así que cualquier umbral ≤3 es **verdadero por construcción** desde el tercer
  paso: el contador dejaba de medir estancamiento y era un simple "estoy cerca del borde". Medido sobre el
  bloque real, con umbral 3 la línea recta, el ping-pong y el zigzag 2×2 disparaban **los tres en el mismo
  tick** — no discriminaba nada. Cruzar la caja en línea recta deposita como mucho 5 visitas, de ahí que 8
  separe "paso de largo" de "estoy dando vueltas aquí": recta → no dispara; ping-pong y zigzag → sí.
- **Se prueban TODAS las direcciones que no acercan más al borde, no solo la normal** (v4.36). Antes se
  calculaba una única `interiorDir` (la perpendicular al borde más cercano) y, si esa celda no era salida
  válida, **no pasaba absolutamente nada**: dos agentes atascados en `x=94` con `W=96` entraban aquí en cada
  tick y no se redirigían jamás. Ahora se prueba primero la normal y, si está tapiada, las **paralelas al
  borde** en los dos sentidos (que tampoco acercan a él).
- **Se mantiene la caja, no se cambia a "misma celda"**: contar solo repeticiones de la celda exacta se
  pierde los bucles de 2×2 y de 3-4 celdas, que son el atasco típico pegado al borde.
- **Agente parado** (`BORDER_QUIETO_MIN = 8`, v4.35): la caja por sí sola no ve al que está **congelado**,
  porque `recentVisits` solo apila cuando la celda **cambia** y un agente inmóvil deposita **una sola
  entrada** — justo el caso que más falta hace detectar. Se cuenta aparte, en `v.ticksQuieto`, **sin tocar
  `recentVisits`**, del que dependen el mapa de calor (§9), el escape por frecuencia (§5) y el pintado de
  lava (§13). El borde redirige si hay merodeo **o** 8 ticks seguidos sin moverse.
- Efecto secundario: al dejar de dispararse en trayectos rectos, desaparecen las notas `escape de bucle`
  espurias que sembraba junto al borde (ver §17 sobre por qué la maniobra de borde acaba escribiendo esa
  nota).

---

## 12. Umbral Adaptativo Dinámico al Terreno (`calculateDynamicStuckThreshold`)
- La tolerancia máxima a los pasos sin descubrimiento de celdas nuevas se calcula en tiempo real según la densidad de celdas libres locales en $5 \times 5$.

---

## 13. Pintado de Lava 3D Bajo Pies en Puntos de Calor Sólido `█`
- Cuando la celda que el agente está pisando alcanza el nivel de calor **`█` (10+ pasadas / Atasco Crítico)** o atasco elevado, el agente **reemplaza el bloque de suelo bajo sus pies por Lava incandescente (`'lava'`)**, dejando un rastro 3D visible en el mundo voxel.

---

## 14. Bajada Automática de Pinos y Precarga Asíncrona de Materiales
- **Precarga Asíncrona (`async onStart`)**: `game.defineStandardAgent` utiliza `async onStart(a)` devolviendo una Promesa al motor VoxelForge. El motor aguarda síncronamente la descarga y registro de `'obsidiana'`, `'obsidian'`, `'red_concrete'`, `'tronco'`, `'hierba'` y `'lava'` en el atlas antes de llamar a `listo()`. El Agente Obsidiana se renderiza con su verdadero cuerpo de Obsidiana negra y pinta correctamente en **rojo (`red_concrete`)** (v4.30).
- **Seguimiento Planar 2D**: El contador `stepsWithoutNewCell` evalúa el descubrimiento de nuevas columnas $(X, Z)$.
- **Bajada Forzada de Cima**: Tras 4 pasos girando en la copa de un pino ($Y > \text{sueloOriginal} + 2$), el agente fuerza un desvío hacia la cota de suelo natural inferior.

---

## 15. Límite de Desnivel por Paso (`climb` / `drop`) ⛰️

Perilla **genérica de todo agente**, configurable desde su snippet: cuántos bloques puede salvar **de una
vez**. Subir 1+1+1 por una escalera es legítimo; lo que se limita es el salto de 2 o 3 de golpe.

- `climb` (por defecto 1) = desnivel máximo que **sube** por paso; `drop` (por defecto 3) = el que **baja**.
- **`defineStandardAgent` no los reenviaba a `defineAgent`**: se descartaban en silencio. Ya se propagan.
- **El desnivel se mide suelo-contra-suelo en la librería**, no se delega en `app.js`: `mcAgentTarget`
  (`app.js:6292`) mide el paso contra `a.y`, y la librería reescribe `a.y = surfaceY + 1` tras cada tick
  (`base-npc-skills` :1062 y :1616) — un bloque **por encima** de la cota que usa `app.js` (`mcAgentMake`
  pone `a.y = mcSurfaceY`, y `mcSurfaceNear` devuelve también la Y del bloque sólido). Esa unidad de más
  corre la ventana entera: **con `climb:1` el agente subía de hecho 2 bloques de golpe**, y bajaba uno
  menos de lo declarado.
- **No se corrige `a.y`**: la cota inflada está metida en las claves de cobertura 3D (`a.vars.visited` y el
  `bodyY = cy + 1` de la BFS); cambiarla invalidaría la cobertura de todos los agentes. Se aplica en la
  puerta de paso, envolviendo `a.canWalk` y `a.walk` (helper `game.skills.desnivelProhibido`).
- Los rechazos se cuentan en `a.stats.blockedBySlope`.
- **No cubre** el teletransporte (`saltoTactico`) ni el pino de emergencia: esos no pasan por `walk`.

---

## 16. Modo Serpiente (`skills.modoSerpiente`) 🐍

Habilidad **de la librería** (`base-npc-skills`), no del snippet: el agente arrastra un cuerpo de
`largoSerpiente` celdas (por defecto 10) y **no puede morderse ni dar media vuelta**.

- Se activa con `skills: { modoSerpiente: true }` y se dimensiona con `largoSerpiente: N`.
- **Se implementa envolviendo `a.walk`**, no comprobando en `onTick`: el tick estándar llama a `a.walk`
  desde ~6 sitios (BFS, escape de oscilación, escape por frecuencia, desatasco, desmontar del pino), así
  que una comprobación en `onTick` solo cubriría uno de ellos.
- Prohibiciones: **giro de 180°** (`dx,dz` opuestos a `a.vars.ultimoPaso`) y **pisar el propio cuerpo**.
- **Válvula de escape (obligatoria)**: si **ninguna** otra dirección es a la vez no prohibida y
  `a.canWalk`-able, el movimiento **se permite**, antes que congelar al agente emitiendo tickets de
  estancamiento para siempre. Cada rechazo se cuenta en `a.stats.blockedBySelf`.
- Estado que publica para el snippet: `a.vars.cuerpo` (celdas, la `0` pegada a la cabeza),
  `a.vars.cuerpoSalientes` (celdas que acaban de salir por la punta — el snippet las **drena**) y
  `a.vars.ultimoPaso`.
- **Reparto**: la regla anti-mordisco es de la librería; **dibujar** el cuerpo y **qué material** deja el
  rastro es del snippet (`agente-serpiente`), coherente con §0.
- El hook `config.onTick` del snippet se invoca en un `try/finally` **siempre una vez por tick**, aunque el
  tick estándar salga por cualquiera de sus salidas tempranas — de lo contrario el cuerpo se despegaría de
  la cabeza.

---

## 17. La nota `escape de bucle` NO la dispara detectar un bucle ⚠️

Comportamiento **conocido y engañoso**, documentado aquí porque despista al leer las trazas.

- `recordLoopEscapeVisit` se invoca desde **un único sitio** del tick estándar: cuando la cuenta atrás
  `v.escapeSteps` llega a 0. No hay ninguna comprobación de oscilación en ese momento.
- Pero hay **9 sitios** que ponen `v.escapeSteps` (redirección de borde §11, escape por frecuencia §5,
  salida de ciclo, desvíos de desatasco §6, desmonte de pino §14), y **todos** acaban escribiendo la misma
  nota con el mismo texto fijo: `'Causa: Maniobra de ruptura de oscilación/bucle en micro-zona.'`
- Consecuencia práctica: una serpiente que camina **en línea perfectamente recta** puede sembrar una nota
  `escape de bucle` cinco ticks después de una redirección de borde, sin haber oscilado jamás. Caso real
  observado: `BORDER_ESCAPE` en el tick 47 → nota en el tick 52, en `[88,14,47]`.
- **Resuelto en v4.35**: cada una de las 9 maniobras deja su motivo en `v.escapeMotivo`, y la nota lo
  declara tal cual: `Causa: Fin de maniobra de escape (redireccion de borde de mapa).` La pila de llamadas
  de la traza también lo lleva: `onTick() -> [<maniobra>] -> recordLoopEscapeVisit() -> a.note()`. Si no
  hay motivo registrado lo dice, en vez de inventarse una causa.
- La **primera línea** de la nota sigue siendo `escape de bucle`, intacta: es el formato oficial de §3 y de
  ella depende la deduplicación por `findExistingNoteInRadius`. Solo cambia la línea `Causa:`.
- **Sigue siendo cierto** que la nota no prueba que hubiera un bucle: prueba que terminó una maniobra de
  escape. Ahora al menos dice cuál.
- **v4.35 estaba a medias — corregido en v4.37**: las dos asignaciones de `escapeMotivo` del desvío
  ortogonal estaban escritas **después del `return`**, o sea que no se ejecutaban nunca. 2 de los 9 motivos
  eran inalcanzables y todo desvío ortogonal acababa etiquetado con el motivo genérico del padre
  (`pasos sin descubrir celda nueva`). Síntoma en una auditoría real: 8 de 9 notas de un mapa con la misma
  causa palabra por palabra, todas en llano perfecto (3x3 todo a 14).
- **La nota ahora exige que la maniobra haya FALLADO (v4.37)**. Antes se escribía nada más superar el
  umbral, aunque un simple giro resolviera la situación. Dos compuertas:
  1. al superar el umbral solo se anota si **ningún desvío ortogonal está libre** (encajonado de verdad);
  2. al agotarse `v.escapeSteps` solo se anota si `v.stepsWithoutNewCell > 0`, es decir si durante el
     escape **no se descubrió ninguna celda nueva**.
  Distingue lo único que importa: «ya he recorrido casi todo el mapa» (normal, no es noticia) de «no salgo
  de aquí» (lo que merece un post-it). El umbral es `calculateDynamicStuckThreshold` =
  `min(30, round(caminables_5x5 × 1.2))` = **30 pasos** en llano abierto, y ahí se llega por pura
  saturación cuando el mapa ya está recorrido.

## 18. Coste del tick: por qué el Mundo perdía frames con el mapa cubierto 🔥

**Síntoma** (v4.36): tras cubrir la serpiente todo el mapa de rastro, el Mundo 3D caía a pocos fps y
llegaba a congelarse ~27 s de golpe. Ni `game.notes()`, ni `game.stuck()`, ni `game.heatmap()` lo
explicaban: **describen lo que el agente DECIDE, no lo que CUESTA**. La pista estaba en las marcas de
tiempo de la traza (`game.traceNote`): el intervalo entre ticks se degradaba 14 ms → 100 ms → 682 ms →
**26 881 ms**, o sea que el hilo principal estaba saturado de JS, no de render.

Dos rutas se disparaban precisamente **cuando ya no queda nada por visitar**, que es el estado en el que
la intuición dice «el agente no sabe qué hacer»:

1. **`findNextStepToNearestUnvisited` sin objetivo.** La BFS recorría el mapa entero (~8 800 nodos) y
   devolvía `null`; se llamaba 1-2 veces por tick, para siempre. Dentro del bucle, por **cada vecino de
   cada nodo**, invocaba `findExistingNoteInRadius(a, '', 1)`:
   - `headerKey = ''` ⇒ `indexOf('') >= 0` es **siempre cierto**, así que devolvía la primera nota que
     hubiera;
   - escaneaba 3×3×3 = **27 `getNote`** (cada uno construyendo una clave `"x,y,z"`);
   - y lo hacía alrededor de **`a.x/a.y/a.z` (el AGENTE), no de la celda candidata** ⇒ era invariante del
     bucle y **ni siquiera vetaba lo que pretendía vetar**.

   Medido: **944 136 llamadas a `getNote` y 116 ms de reloj por BFS**.

2. **`saltoTactico` sin destino.** Hace un barrido doble de 96×96. El cooldown de 3 s (`lastJumpAt`) solo
   se armaba **en el camino de éxito**, así que con el mapa cubierto (`bestCell === null`) no se armaba
   nunca y el barrido infructuoso se repetía en cada llamada.

**Arreglo (todo en la librería, `app.js` intacto — §0):**
- El veto por nota se resuelve con un índice de columnas construido **una vez por BFS** desde `mc.notes`
  (son unas pocas entradas) y se consulta **sobre la celda candidata**, que es lo que se pretendía.
- Cola BFS con puntero (`qi`) en vez de `shift()`, que es O(n).
- **Memo `v.bfsSinFrontera`**: si una BFS completa **sin exclusiones** no encuentra frontera, el resultado
  no puede cambiar solo (`visited` únicamente crece). Se invalida por tamaño de `visited`, por
  `v.bfsEpoca` (que incrementa `saltoTactico` al teletransportar, porque el salto **sí** puede llevar a
  otra región conectada) y por rearme cada 600 ticks como red de seguridad.
- `saltoTactico` arma `lastJumpFailAt` también al fallar.

Medido en el escenario del usuario (mapa cubierto, 2 BFS + 1 salto por tick): **24,5 ms/tick → 0,2
ms/tick**. El presupuesto de un frame a 60 fps es 16,7 ms.

⚠️ **Cambio de comportamiento consciente**: el veto por nota (`callejon sin salida`, `foso trampa`,
`visitas a la cima`) **antes no funcionaba** — miraba la celda equivocada. Ahora sí veta. Un agente puede
por tanto descartar destinos que antes perseguía.

## 19. Perfilador por fases (`game.perf()`) ⏱️

Existe porque el caso de §18 no era diagnosticable con las herramientas de comportamiento. Mide **reloj
real por fase del tick**:

```js
game.perf()        // tabla por fase + los peores ticks, ordenados
game.perf(20)      // idem, con los 20 peores
game.perf.reset()  // reinicia el muestreo
```

- **`ms/s`** = milisegundos de CPU por segundo de reloj. **1000 ms/s = un núcleo saturado**; es la
  columna que delata una caída de frames.
- **`% CPU`** por encima de ~30 en una fase ⇒ esa fase se está comiendo los frames.
- **Peores ticks**: solo se guardan los que superan **30 ms** (los que se notan como tirón), con hora,
  tick, agente y desglose por fase.
- Si el coste de `tick` supera con mucho la suma de las fases medidas, el desglose lo dice
  explícitamente (`sin instrumentar (N ms fuera de fases)`) — **la ausencia de dato también es dato**.

Fases instrumentadas: `tick` (envuelve el tick entero), `bfs`, `saltoTactico`, `onTick` (el del snippet).
Para añadir una fase nueva desde un snippet: `game.skills_medir('mi_fase', function(){ ... })`.

⚠️ El perfilador mide con `performance.now()` en el hilo principal: **medir con DevTools cerrado**, igual
que los fps (con DevTools abierto el coste se infla).

---

## 20. Cuerpo del agente: escala, vuelo y cuerpo de estructura (`skills.cuerpo`) ☁️

El framework dibuja **siempre el mismo cuerpo**: un cubo 1×1×1 del atlas del terreno, apoyado en
`renderY+1` (`mcAgentMesh`, app.js). Ni escala, ni altura libre, ni voxeles finos.

Se amplía **sin tocar `app.js`** (§0), envolviendo dos funciones globales desde la librería:

| Función envuelta | Por qué ahí |
|---|---|
| `mcAgentMesh(a)` | La llama `mcAgentsSmoothUpdate` **cada frame**, justo después de pegar `a.renderY` al suelo: es el único punto donde se puede devolver la altura de vuelo y construir un cubo a escala. |
| `mcRender()` | Se le encadena una pasada al final, con el depth buffer del frame ya puesto, para los cuerpos de **estructura** (usan `mc.structProg`/`mc.stexProg`, que el bucle de agentes no toca). |

```js
game.skills.cuerpo(a, { bloque:'snow', escala:3, altura:26 });          // cubo del atlas a escala
await game.skills.cuerpo(a, { estructura:'hab:nube', escala:2, altura:26 });  // voxeles finos
game.skills.liberarCuerpo(a);                                           // en onStop
```

- `escala` — lado del cuerpo en bloques (admite decimales). Centrado en la celda, base en `renderY+1`.
- `altura` — Y de la **base** del cuerpo. Con `altura`, el agente **vuela**: deja de pegarse al suelo.
  Vuela de verdad solo si además mueves `a.x`/`a.z` a mano; `a.walk()` exige suelo pisable.
- La malla de estructura se sube **una sola vez en coordenadas locales** y se coloca cada frame con
  `uView = vista × traslación` ⇒ moverse no re-sube nada.

⚠️ **Por qué NO se meten en `mc.structures`**, que ya se dibujan solas: **`mcSerialize()` las guarda en
el JSON del mundo**. La nube quedaría **estampada para siempre** donde la pillara el autoguardado.

⚠️ **Lo que este cuerpo NO trae por sí solo** (cada una tiene su sección):

- La **colisión** de serie sigue siendo el cubo 1×1×1 de `app.js` (`mcCollides` da un AABB fijo en
  `[renderY+1, renderY+2)`): un cuerpo a escala 3 se ve grande y se choca pequeño. Se corrige con
  **`skills.solido`** (§20.2).
- La **sombra** la hace el motor y va sola (§20.3): la pasada del sol dibuja las mismas VBO que se ven, así
  que el cuerpo proyecta por el mero hecho de dibujarse. Un cuerpo de **estructura** es la excepción —lo
  dibuja esta librería con matriz propia—, y por eso se registra en `mc.sunExtra`.

**Precedente aplicado**: el mismo patrón que la cola de la serpiente — ampliar el cuerpo desde fuera del
framework, sin que `app.js` se entere de qué es una nube.

### 20.1 Un snippet que depende de la librería SE LA CARGA SOLO

Los snippets son de **un solo disparo** y no comparten sesión: ejecutar `agente-nube` en una pestaña
recién abierta no ejecuta `base-npc-skills`. Avisar por consola y seguir adelante **no vale** — el agente
se crea igual y revienta en `onStart` con `Cannot read properties of undefined (reading 'cuerpo')`.

Patrón obligatorio para cualquier snippet que use `game.skills.*`:

```js
async function ejecutarSnippet(id) {                      // igual que el editor de scripts
  var r = await fetch('/api/snippets/' + id, { cache:'no-store' });   // ruta ABSOLUTA: la SPA vive en /map/<nombre>
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var d = await r.json();
  var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await (new AsyncFunction(d.code))();
}
if (!(await asegurarLibreria())) return;                  // si no aparece, NO crear el agente
```

Tres reglas: **cargar** la dependencia si falta; **abortar** (no crear el agente) si aun así no aparece,
en vez de dejar un cubo 1×1×1 pegado al suelo; y **tolerar su ausencia en `onStop`**
(`if (game.skills && game.skills.liberarCuerpo) …`), porque se puede recargar la librería a media
ejecución.

### 20.2 Física del agente a su tamaño real (`skills.solido`) 🧊

`app.js` le da a **todo** agente la misma caja de física: **1×1×1** en `[rx,rx+1] × [ry+1,ry+2) × [rz,rz+1]`.
Por eso un cuerpo a escala 9 **se ve enorme y se choca diminuto**, y subirse encima de una nube es buscar
un píxel invisible. La caja está cableada en tres sitios:

| Dónde | Qué decide |
|---|---|
| `mcCollides` (app.js) | con qué choca el jugador |
| `mcAgentShove` (app.js) | el empujón cuando un agente te embiste |
| `a.isMounted` (app.js) | ir montado encima; su ventana es `[ry+1.9, ry+2.5]`, la tapa de un cubo de 1 |

Los tres se corrigen **desde la librería, sin tocar `app.js`** (§0): los dos primeros son funciones globales
y se envuelven igual que `mcAgentMesh` o `mcSerialize`; el tercero es un método del handle y se reemplaza.

```js
game.skills.cuerpo(a, { bloque:'nube-snow', escala:9, altura:26 });
game.skills.solido(a);          // ahora choca, empuja y te lleva a escala 9
game.skills.solido(a, false);   // vuelve al 1×1×1 del framework
```

El agente **sigue siendo un agente normal** con toda su mecánica: el framework interpola su posición entre
celdas (se mueve **suave**, no a trompicones), te empuja si te embiste y te lleva encima. Lo único que
cambia es que la medida que usa la física es la de verdad. La caja sale del cuerpo que ya declaraste con
`skills.cuerpo` (`escala`/`altura`): **lo que se ve y lo que se choca son la misma medida**, no dos
verdades que mantener a la vez.

Detalles que no son obvios:

- **Al original se le esconden los agentes** (`mc.agents` vacío durante la llamada) para quedarse solo con
  terreno + estructuras. Sin eso la caja 1×1×1 seguiría ahí, y en un agente que **vuela** es un obstáculo
  invisible **a ras de suelo**, justo debajo de la nube.
- **Al agente que no pide `solido` no se le cambia nada**: conserva su 1×1×1 exacto.
- **La caja sigue a `renderX/Y/Z`** (posición interpolada), no a la celda lógica.
- El empujón usa **la misma política que `app.js`**: salida horizontal más corta *a favor* de la marcha del
  agente; si está parado, radial desde su centro.

**LIMITACIÓN**: para un cuerpo de **estructura** la caja es el cubo de lado `escala`, no la silueta fina de
la malla — una estructura con huecos se choca como si fuera maciza. Afinarlo pediría muestrear
`mcStructGeom` por celda (lo que hace `mcFineBoxHit` con las salas), y **eso sí tocaría `app.js`**.

### 20.3 La sombra del agente la hace el motor (mapa de sombra) 🌑

**El agente no tiene sombra propia. Se dibuja, y por eso proyecta.** Esta sección ya no describe código de la
librería: describe una capacidad de `app.js` y **la única línea** que hace falta aquí para engancharse.

**Cómo funciona** (`mcRenderShadow` en `app.js`): antes de pintar el frame, se renderiza el mundo **desde el
sol** —proyección ortográfica vertical— a una textura, y cada téxel guarda **la altura de la superficie más
alta** de esa columna. Al sombrear, cada fragmento mira su téxel y pregunta si hay algo por encima. Es el
algoritmo estándar (*shadow map*), el mismo que te da `three.js` con `light.castShadow = true`, escrito a
mano en ~150 líneas de WebGL porque el Mundo tiene su propio mallado por chunks y portarlo a una librería
sería reescribir el render entero.

Lo que importa para los agentes: **le entra la malla, no la rejilla**. La pasada del sol dibuja las **mismas
VBO** que se dibujan en pantalla, así que terreno, estructuras estampadas y **cuerpos de agente** proyectan
por igual, sin que ninguno tenga una línea de código de sombra. Y como es geometría real y no `mc.grid`, la
sombra tiene **resolución de subcelda**: se desliza con el agente en vez de saltar de celda en celda.

**Las seis caras salen solas.** La normal geométrica se saca de las derivadas de la posición de mundo
(`dFdx`/`dFdy`; las caras son planas ⇒ exacta) y el mapa se muestrea **media celda hacia fuera**: el suelo
pregunta por el aire de encima y una pared por el aire de su lado. Es la misma regla que sigue `mcMeshChunk`
al mirar la celda vecina de cada cara. Por eso un cubo dentro de una sombra sale oscuro **por los cinco
lados que se ven**, no solo por la tapa. De regalo, medio bloque de separación deja el **acné de sombra**
fuera de discusión: sin `polygonOffset` y sin *bias* afinado a mano.

**Lo único que hay que hacer desde un snippet** es registrar la geometría que dibuje **él**, porque app.js no
la conoce. Para eso está el gancho genérico `mc.sunExtra`, al que se le presta el dibujante ya configurado:

```js
mc.sunExtra = function (dibuja) {          // dibuja(vbo, count, stride, matrizModelo)
  dibuja(malla.colVbo, malla.colCount,  9*4, modelo);
  dibuja(malla.texVbo, malla.texCount, 10*4, modelo);
};
```

La librería ya lo usa para los **cuerpos de estructura** (§20), que van con matriz de modelo propia y no
están en ninguna lista de `app.js`. Los cuerpos de **bloque** no necesitan nada: viven en `a.vbo`, que la
pasada del sol ya barre. Y todo lo que mueva geometría debe llamar a **`mcShadowDirty()`** — el mapa solo se
rehace cuando algo cambió, así que un mundo quieto no cuesta nada.

**Mandos** (consola F12, persistidos, sin re-mallar nada — son uniformes):

```js
game.sunShade  = 0.55;   // 1 = sin sombra de sol (y entonces ni se renderiza el mapa: coste cero); 0 = a negro
game.shadowSize = 2048;  // lado del mapa en téxeles; cubre mundo+margen ⇒ 2048/(96+32) = 16 téxeles por bloque
game.skills.sombra(a, false);   // ya no hace nada: si se dibuja, proyecta. Se conserva por compatibilidad
```

⚠️ **Limitaciones conocidas**:

- **Sol vertical.** Un pilar apoyado en el suelo proyecta justo debajo de sí mismo, o sea que **no se le ve
  sombra**. Se ve bajo voladizos, salas y cosas que vuelan. Un sol inclinado es cambiar la matriz de la
  pasada y la consulta; el resto del diseño no se entera.
- **Sombra dura, sin penumbra.** Un téxel está en sombra o no lo está. A 16 téxeles por bloque el borde es
  limpio; para suavizarlo haría falta PCF (varias muestras) en `sunFactor`.
- **El pase translúcido no proyecta**: un cristal no hace un agujero negro. Tampoco el fantasma de
  colocación. El terreno con alpha-test (hojas) **sí** proyecta macizo.
- El mapa **cubre el mundo entero más un margen** de `MC_SUN_MARGIN` bloques (16) por lado, así que la
  resolución real baja si se agranda mucho el mundo (`game.shadowSize` lo compensa a costa de memoria:
  2048² RGBA = 16 MB). El margen **no es cosmético**: un cuerpo que asoma por el borde del terreno cae
  **fuera del volumen de la pasada del sol**, se recorta, y su parte de fuera sale **sin sombra debajo** —
  justo lo que cantó el dueño. Por eso el mapa se indexa con **origen + tamaño** (`uSunOrg`/`uSunDim`, los
  manda `mcSunFrustum` a los cuatro programas) y **no** con `mc.dim`: quien porte esa aritmética a otro sitio
  (o a un test) tiene que portar **las dos**.
- Sin `OES_standard_derivatives` (WebGL1 muy viejo) la sombra **se apaga sola**: `mc.deriv=false` ⇒ no se
  define `SUN_DERIV` ⇒ `sunFactor` compila a `return 1.0`. El Mundo se ve como siempre, sin sombra de sol.

⚠️ **Si el cuerpo se mueve, hay que caducar el mapa.** `mcAgentsSmoothUpdate` marca `mcShadowDirty()` cuando
la posición de render de un agente cambia, y `mcAgentMesh` se salta el trabajo si los vértices van a salir
idénticos (un agente quieto ya no rehace la sombra 60 veces por segundo). La regla es del motor: **da igual
quién construya la malla**. La nube no pasa por `mcAgentMesh` —`skills.cuerpo` le hace una malla a escala
propia—, y por eso se deslizaba con **la sombra clavada** donde estuvo, saltando solo al colocar un bloque
(que sí marcaba el mapa). Si algún día se dibuja geometría movida por otro sitio, mismo deber: avisar.

Y el reverso del mismo error: un cuerpo que **nace y se queda quieto** tampoco entraba en el mapa (nadie lo
marcaba nunca) ⇒ **no proyectaba nada**. Por eso la firma barata de `mcRenderShadow` cubre `mc.structures`
**y `mc.agents`** (cuenta de vértices + posición de render): aparecer también es un cambio.

ℹ️ Con el sol **vertical**, la **cara de abajo** de un cuerpo flotante sale **oscura entera**. No es un fallo:
esa cara no recibe sol. Lo que sí era un fallo era verla con un **cuadrado oscuro más pequeño** dentro —eso
era el mapa caducado, la huella de la nube donde ya no estaba.

⚠️ **`dFdx`/`dFdy` no están donde uno cree** (esto costó una pantalla en negro):

| contexto | qué hace falta |
|---|---|
| WebGL1 | `#extension GL_OES_standard_derivatives : enable`, **primera línea** del fuente |
| WebGL2 + shader ESSL 1.00 | **no hay manera**: la extensión no existe para ESSL1 (`extension is not supported`) y las derivadas no son núcleo hasta ESSL 3.00 |
| WebGL2 + shader ESSL 3.00 | núcleo, nada que pedir |

Como el contexto se pide `webgl2` con caída a `webgl`, los shaders se escriben **una sola vez en ESSL 1.00** y
`mcGLSL(src, esVS)` los **sube a `#version 300 es`** cuando toca (`attribute`→`in`, `varying`→`in`/`out`,
`texture2D`→`texture`, `gl_FragColor`→ un `out` declarado). **Todo** programa nuevo tiene que pasar por
`mcVS()`/`mcFS()`: mezclar un vertex ESSL1 con un fragment ESSL3 no linka.

**Esto sustituye a la estampa anterior**, y con ella se fueron sus dos fallos: las **esquinas sin sombrear**
(era el alpha desvaneciéndose en el borde del quad, más el `SOMBRA_EPS` desplazándolo en pantalla) y las
**zonas más claras del suelo junto a un bloque** (era el muestreo bilineal promediando celdas **sólidas**,
que no tenían dato). Los dos eran artefactos de la maquinaria, no de la sombra: existían solo porque el
agente no está en `mc.grid` y había que fabricarle una sombra aparte. Se borraron `medirCampo`,
`muestrearCampo`, `rehacerEstampa`, `actualizarAlfas` y `dibujarSombras` (~420 líneas), el oclusor efímero
`ID_SOMBRA` y su `mcComputeLight` relanzado, y el `mcSunTop`/`mcSunLit` por columna del terreno: **un solo
sistema**.

⚠️ **Lo que sí sigue prohibido en la librería**: fabricarse una segunda sombra. `test_cuerpo_solido.js`
rechaza `medirCampo`/`rehacerEstampa`/`dibujarSombras`/`ID_SOMBRA`/`calcomania`/`gl.blendFuncSeparate` y
exige que los cuerpos de estructura se enganchen por `mc.sunExtra`.

**No confundir con `mcComputeLight`**, que sigue existiendo y es **otra cosa**: oclusión ambiental. Difunde
la luz del cielo por el aire perdiendo un nivel por vecino, así que mide la **distancia horizontal** al cielo
abierto — por eso un pilar apoyado en el suelo no oscurece **nada** a su alrededor y una losa flotante de
1×1 deja la celda de debajo a luz 14 de 15 (*"si la luz viene de arriba y hay un objeto en medio, cómo puede
estar iluminado lo de abajo"* — tenía razón: eso no era una sombra). Los dos efectos **se multiplican**.

**Verificado headless**, en dos niveles:

**`test_navegador.js` (12 tests) — el único que compila GLSL de verdad.** Abre el Mundo en un Chromium con
Playwright (WebGL sobre SwiftShader): comprueba que **no hay ni un error de shader en consola**, que el mapa
de sombra **contiene la geometría** (pone una losa flotante y lee el téxel de su columna en el FBO: la altura
guardada es la cara de arriba de la losa con < 0.05 de error), y que **en pantalla** el suelo bajo un techo
sale **×0.55** — exactamente `sunShade`. Repite la carga **forzando WebGL1** (tapando `getContext('webgl2')`)
para compilar también el camino ESSL 1.00. Escribe con `mcSetBlock`+`mcMeshChunk` a pelo y lo deshace, así
que **no toca el mundo del disco**. Requiere `npm i -D playwright@1.47.2 && npx playwright install chromium`
(la 1.48+ pide Node 20; aquí hay 18); los fps de SwiftShader **no valen para nada**.

**`test_shadow_map.js` (20 tests)** no compila GLSL, así que
comprueba las dos cosas que sí se pueden sin GPU: **(a) coherencia de los shaders** —que cada *varying* que usa un
fragment shader lo escriba y asigne su vertex shader, que `vWorld` sea `aPos` y no la posición de vista, y
que cada uniforme que se busca con `getUniformLocation` exista en el fuente— y **(b) el algoritmo**, con un
puerto del mapa de altura y de `sunFactor` cuyas constantes (el desplazamiento de media celda, el margen
contra el acné) se **leen del GLSL de `app.js`**, no se copian: cambiar el shader sin tocar el test se nota.
Los escenarios son los fallos reales de las capturas — cubo bajo la nube oscuro en las cinco caras, cara
entera con un único valor (nada de esquinas), anillo de suelo alrededor del bloque barrido medio téxel a
medio téxel sin un solo punto claro, un bloque apoyado que no se sombrea a sí mismo, y el borde de la sombra
siguiendo al oclusor cuando se mueve **0.37 de bloque**.

---

## 21. Por qué la cadena de rescate no rescataba (v4.36) 🪤

Tres fallos independientes que se tapaban entre sí. Síntoma que los destapó: `[MINADO EMERGENCIA] … en torno
a 78,17,46` **1178 veces seguidas con las mismas coordenadas**, y `game.stuck()` con tres agentes a 25 pasadas
por la misma celda dando vueltas al perímetro de un rectángulo hueco que ellos mismos habían levantado.

**1. `minadoEmergencia` declaraba éxito por haber picado, no por haber abierto.** Devolvía `true` en cuanto
quitaba un bloque, y el llamador hace `if (mined) return;`. Con un constructor vecino reponiendo el mismo
bloque, «queda algo que picar» es cierto **para siempre**: el agente se quedaba en el peldaño 2 de §6 y
`rebobinadoHistorico` y `saltoTactico` **no se alcanzaban nunca**. Ahora el éxito se **mide** (`a.canWalk`
en las 4 direcciones *después* de picar) y hay **presupuesto por celda** (`MINADO_MAX_POR_CELDA = 8`): tras 8
intentos infructuosos desde la misma celda deja de picar y cede el turno. Se reinicia al moverse.

**2. `minadoEmergencia` picaba a la altura equivocada.** Usaba `cy = a.surfaceY(a.x, a.z)`, que es el bloque
sólido **más alto de la columna** — bajo un techo, o dentro de lo que el propio agente acababa de construir,
eso está metros por encima de su cabeza y se picaba aire. El suelo del agente es **`a.y - 1`** (`a.y` es la
celda de sus pies; la librería reescribe `a.y = surfaceY + 1` al final de cada tick). Y se pica **solo pies y
cabeza** (`cy+1`, `cy+2`): un paso necesita dos celdas de aire, no derribar la columna vecina entera de un
tick, que es lo que hacía `Math.max(my, cy + 2)`.

**3. `saltoTactico` no podía encontrar destino JAMÁS para un agente atrapado** — el peor de los tres.
El barrido de 96×96 evaluaba cada celda candidata con
`for (k…) if (a.canWalk(dirs[k][0], dirs[k][1])) openCount++`. **`a.canWalk(dx, dz)` mide siempre desde la
posición del AGENTE**, no desde `(x, z)`: `openCount` valía lo mismo para las ~9.000 candidatas, y ese valor
era el de la celda donde el agente está encerrado, que por definición tiene **0 vecinos abiertos** (por eso
pide rescate). Como el filtro es `openCount >= 2`, **ninguna celda calificaba nunca** y el último recurso
absoluto devolvía `false` justo cuando hacía falta. La celda candidata se mide ahora con
`game.skills.vecinosPisablesEn(a, x, y, z)`, que replica el criterio de `mcSurfaceNear` (subir ≤ `climb`,
bajar ≤ `drop`, aire sobre el suelo) sobre la celda **que se le pasa**. Se evalúa **después** del filtro de
distancia, porque cuesta 4 barridos de columna y aquí se recorre el mapa entero.

⚠️ **Regla general:** una habilidad que consulta el entorno recibe `(a, x, y, z)` o no se puede usar en un
barrido. Los métodos del handle (`a.canWalk`, `a.paint`, `a.walk`) son **relativos al agente** por contrato;
usarlos para preguntar por *otra* celda compila, no falla y devuelve un resultado plausible — el peor tipo
de fallo.

**Verificado**: `node test_rescate.js` (8 tests) carga la librería real con stubs mínimos de `mc`/`game` y un
mundo de juguete. Comprueba que un muro de una hilada se pica y **abre** (`true`), que un voladizo sin suelo
debajo se pica y **no abre** (`false` siempre, y para a los 8 intentos), y que 30 minados consecutivos dejan
**una sola línea** de consola. Contra el `base-npc-skills.json` anterior **falla 5 de 8**.

---

## 22. El log de consola es un recurso acotado 📉

Un agente atascado repite la misma decisión **~10 veces por segundo** (`tickMs` 90-200). Una sola sesión dejó
**1178 líneas idénticas** de `[MINADO EMERGENCIA]`; el `[TICKET]`, que arrastra el diagrama 3×3 entero,
salía cada 1500 ms por motivo = 40 por minuto. Eso no se puede leer y además retiene las cadenas en memoria.

- **Nada de `console.log` directo en el camino del tick.** Se usa **`logAgente(clave, msg[, msMin])`**:
  imprime la primera aparición de esa clave y luego, como mucho, **una línea cada `LOG_REPEAT_MS` (10 s)**
  con cuántas repeticiones se omitieron. La clave es **del emisor** (`'minado:' + a.id`), **no del texto**:
  así también se acota un mensaje que lleva contadores dentro y por tanto nunca se repite literal.
- `[TICKET]` va con `msMin = 15000`. La lista completa sigue en `a.vars.showTickets()`.
- **Los historiales son anillos, no listas**: `MAX_HISTORIAL = 200` por agente (`toastHistory`, `ticketLog`)
  y `MAX_HISTORIAL_GLOBAL = 500` para `game.toastHistory`. Antes crecían sin tope mientras el mundo
  estuviera abierto.
- Los `console.log` de **diagnóstico bajo demanda** (`game.stuck()`, `game.heatmap()`, `game.perf()`,
  `a.vars.asciiMap()`…) **no** se tocan: los dispara el dueño, no el bucle.

---

## 23. El informe de atascos (`game.informe()`) 🔎

Los tres fallos de §21 se cazaron **leyendo código**, no leyendo diagnósticos. Eso es la prueba de que el
instrumental estaba incompleto: `game.stuck()`, `game.heatmap()`, `showTickets()` y `traceNote()` dicen
**dónde** está el agente, nunca **por qué su rescate no funciona**. `game.informe()` es la pieza que faltaba:
un texto autosuficiente que se genera desde F12 y se pasa tal cual a quien depura.

```js
game.informe()                     // todos; guarda en el servidor y devuelve el string
game.informe({ guardar:false })    // solo devuelve  →  copy(game.informe({guardar:false}))
game.informe({ agentes:['constructor'], ticks:400, max:30000, todos:true })
game.informe.ultimo                // el último generado, por si se perdió el scroll
```

**Entrega doble.** Va por `POST /api/snippets` a `data/snippets/informe-atascos.json` (el respaldo del
anterior lo hace `to_trash`, no se pierde ninguno) **y** se devuelve como string. Dentro del snippet el
Markdown viaja **crudo, en un comentario de bloque** —no como string escapado— para poder leerlo sin `\n`
por medio; el `code` es JS válido y ejecutarlo no rompe nada. Si el `fetch` falla, el string sigue estando.

### El listón: el informe solo tenía que haber bastado para cazar §21

| Fallo de §21 | Qué lo delata |
|---|---|
| `minadoEmergencia` decía éxito sin abrir paso | **3.3**: peldaño con N intentos y **0 con efecto** |
| Picaba siempre desde la misma celda | **3.3**: columna «misma celda» + **R2** |
| `saltoTactico` nunca encontraba destino | **3.3**: intentos > 0, ejecuciones con efecto = 0 |
| Otro agente reponía el bloque picado | **4**: escrituras del mundo con **autor por celda** (**R3**) |

### Lo que hace posible la tabla 3.3

**Un peldaño se anota al INTENTARLO y se juzga por su EFECTO.** `minadoEmergencia` solo llamaba a
`logExecutionStep` en su **camino de éxito**: las 1178 pasadas sin abrir salida no dejaban ni una línea de
telemetría, justo las que había que contar. Ahora los peldaños llaman a `anotarAccion(a, tipo)` **al entrar**
(deduplicado por `(tick, tipo)`, así el log de éxito no cuenta dos veces) y la acción queda **pendiente**;
5 ticks después se resuelve: **hubo efecto si `visited` creció o el agente cambió de celda**. Nada de esto
imprime: §22 sigue en pie, el resultado solo sale por el informe.

Tres anillos O(1) alimentan el informe, todos fuera de bucles calientes:

| Anillo | Dónde se llena | Tamaño | Para qué |
|---|---|---|---|
| `a.vars.acciones` | `anotarAccion` / `logExecutionStep` | por tipo | tabla 3.3 y R1/R2 |
| `game.worldWrites` | envoltorios de `a.setBlock`/`a.paint` | 600 | sección 4 y R3/R4 |
| `a.vars.progreso` | `ejecutarTickEstandar`, cada 25 ticks | 40 | curva de cobertura |

`game.worldWrites` es el **único** sitio por el que pasan todas las escrituras de agente (incluida la cola
asíncrona de construcción), y solo anota si el bloque **cambió de verdad**.

### Normas del informe

- **Toda hipótesis cita el § que la respalda o no se imprime.** Un informe que opina sin respaldo es ruido,
  y el ruido ya costó 1178 líneas. Reglas: R1 peldaño ineficaz (§21.1), R2 celda imán (§6), R3 guerra de
  bloques (§21.2), R4 autojaula (§11), R5 es `climb`/`drop` y no la heurística (§15), R6 escalera sin último
  recurso (§6), R7 puede ser CPU (§18, §19), R8 cubre poco de su caja de merodeo (§11).
- **No modifica lo que diagnostica.** `game.skills.isTrapPit()` **escribe una nota** cuando acierta
  (`recordTrapPitVisit`), así que el informe usa una copia de solo lectura. Misma razón para no llamar a
  nada que pueda plantar un pino.
- **Un veredicto no puede ser `ok` con 0 celdas ganadas.** Cambiar de celda **no es** avanzar: una serpiente
  que hace ping-pong entre dos casillas cambia de celda siempre. Con ≥10 juzgadas y `celdasGanadas === 0` el
  veredicto es `SIN AVANCE` y **R1 dispara**. Y R1/R2 **no** se condicionan a que el detector marque atasco:
  la serpiente andaba en cada tick, así que salía «sana» llevando 975 ticks sin ganar una celda.
- **Mide con la vara del framework.** El vecindario 5×5 pregunta por `mcSurfaceNear(x, z, a.y, climb, drop)`,
  no por `a.surfaceY` (que es el sólido más alto de la columna) ni por `a.canWalk` (que es **relativo al
  agente**, §21.3). De ahí que distinga `TAPIADO` —sólido a cota alcanzable, se pica— de `DESNIVEL` —no se
  arregla picando—. **Y la vara incluye los envoltorios**: `a.canWalk` va envuelto por `desnivelProhibido`
  (§15), que mide **cima contra cima**, así que un vecino con suelo pisable y voladizo encima se rechaza
  porque el paso acabaría en la azotea. El informe lo etiqueta `AZOTEA +n`; imprimir `LIBRE · canWalk=false`
  era la contradicción que delataba que medía una vuelta de envoltorio por detrás.
- **Los segundos hacen caso a `game.agentSpeed`.** La ventana no es `ticks × 0.2`: con `agentSpeed=100` eran
  ~0,8 s y el informe anunciaba 80. Y si un solo agente ha llenado el anillo de escrituras (>70 %), se avisa
  en PROCEDENCIA: de los demás **no se puede decir nada**, sus pruebas fueron desalojadas.
- **El informe también está sujeto a §22.** Presupuesto duro (`max`, 30 000 por defecto). Orden de
  sacrificio: traza → heatmap → tickets → notas → agentes sanos. Cada recorte **se declara en la sección 6**;
  el corte duro se hace **sobre el cuerpo**, nunca sobre la sección 6, que es la que avisa de que se cortó.
  El heatmap va **recortado a la caja de merodeo** (~0,3 KB) en vez de 96×96 (~9 KB por agente). Cuidado
  con las dos cajas: la **caja de merodeo** es el bbox real de lo pisado (es la que se compara con las celdas
  distintas y la que juzga R8); la **ventana dibujada** es como mucho de 24 de lado alrededor del agente, y
  cuando recorta dice cuántas de las celdas se ven — el porcentaje NUNCA se calcula contra la ventana.

- **Las columnas de la escalera cuadran a la vista.** `veces` son **intentos**; `con efecto` + `sin efecto`
  solo cuenta las ya juzgadas, y la diferencia (las que aún no cumplieron los 5 ticks de espera) se declara
  bajo la tabla. Si no, parece que se pierden acciones.
- **No se vuelca a la consola.** 30 000 caracteres son ~600 líneas. `game.informe()` imprime dos líneas de
  resumen; el texto está en el fichero, en el valor devuelto y en `game.informe.ultimo`.

### Límites conocidos

1. **Es un retrato del instante.** Cubre hacia atrás lo que quepa en los anillos (~500 entradas de traza,
   600 escrituras, 40 muestras de cobertura). Si el atasco lleva media hora, la sección 4 solo ve el final;
   la curva de cobertura lo hace explícito en vez de fingir que lo vio todo.
2. **No lleva losa del mundo**, así que el caso no se reproduce: se reconstruye mentalmente desde 3.4 y 3.5.
3. `game.worldWrites` **solo ve escrituras de agente** (las que pasan por el handle). Lo que ponga el
   jugador a mano o `game.setVoxel` no aparece.
4. La vía fichero necesita el servidor; la vía string funciona siempre.
5. No lleva captura ni datos de render: si la sospecha es visual, la captura la manda el dueño.

**Verificado**: `node test_informe.js` (23 tests) — un agente de juguete que pica 14 veces sin abrir paso
produce un informe con **R1, R2 y `INEFICAZ`**; dos agentes turnándose una celda producen **R3** con los dos
autores; `max: 2000` respeta el presupuesto **y** declara los recortes; `guardar:false` no toca `fetch`; el
`code` enviado al servidor es JS válido y contiene el Markdown íntegro; generar el informe **no crea notas**.
En el navegador (Playwright + SwiftShader, 3 agentes reales corriendo): `game.informe({todos:true})` genera
las secciones 3.1-3.8 contra el mundo real sin un solo error de consola, y `game.informe()` deja
`data/snippets/informe-atascos.json` en el servidor.

---

## 24. Muerte por la propia cola (`modoSerpiente`) ☠️

El envoltorio de `a.walk` prohíbe pisar cuerpo propio y girar 180°, y tenía una **válvula de escape**: si
ninguna otra dirección era viable, dejaba pasar el paso prohibido «antes que congelar al agente». En un
callejón de 1 de ancho esa válvula se abre **siempre**, y la única celda a la que la cabeza puede entrar es
la que acaba de dejar: el cuerpo entero se pliega en dos casillas y hace ping-pong para siempre.

Medido en un informe real: **52.825 ticks, 975 sin ganar una celda**, `UTURN_DEADEND` 44.606 veces con **0
celdas ganadas**, y las dos casillas repintadas 300 veces cada una. Lo peor: **no contaba como atasco**
porque el agente *andaba* en cada tick (`bloqueos 0`), así que la cadena de rescate no llegó a mirarlo
(`picados 0`).

Ahora esa situación es la **muerte**: `game.skills.serpienteMuerePorSuCola(a)`

1. planta una lápida con **el pino de siempre** (`plantarPinoDeEmergencia(a, {alto: 16, …})` — la misma
   función, con el tronco estirado; **no se duplica el pino**) y deja la nota *«serpiente muerta por su
   propia cola»* con la causa y el largo del cuerpo;
2. **reaparece** en una celda sorteada al azar (`celdaLibreAlAzar`) con ≥2 vecinos pisables y a ≥10 de
   distancia — se sortea, no se barre el mapa, para que dos muertes seguidas no la manden al mismo sitio;
3. renace entera: cuerpo, rumbo, historial y contadores de atasco a cero (`a.stats.muertes` lleva la cuenta).

**La marca de lava también tiene tope.** «Aquí no hay lava» no basta como condición: si alguien repone el
suelo —el propio cuerpo de la serpiente lo hacía— se repinta en cada tick. Se marca **una vez por celda**
(`v.lavaCeldas`, cota 300); si te la borran, no se pelea.

**Verificado**: `node test_serpiente.js` (17 tests) — la lápida mide ≥12 de tronco con su copa, la nota lleva
causa, reaparece lejos y sobre suelo con salida, y **sin `opts` el pino de emergencia sigue midiendo 5
exactamente como antes**.
