# Especificación Oficial de Reglas de Comportamiento de Agentes (v4.39) 📜🤖

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
2. **Prioridad 2 (Minado de Emergencia Físico 3D)**: Destruir bloques de muro entorpecedores en las 4 direcciones adyacentes para abrir 2 túneles de salida física en el mundo 3D. Antes de picar, el agente planta un **Pino Piramidal 3D** con una nota justificativa.
3. **Prioridad 3 (Salto Táctico)**: Teletransporte como **ÚLTIMO RECURSO ABSOLUTO** únicamente si los intentos de desvío y minado físico no abrieron salida.

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

⚠️ **Limitación**: la **colisión** sigue siendo el cubo 1×1×1 de `app.js` (`mcCollides` da un AABB fijo
en `[renderY+1, renderY+2)`). Un cuerpo a escala 3 se ve grande y se choca pequeño. Arreglarlo **sí**
exigiría `app.js` ⇒ hay que pedirlo (§0, paso 3). Por eso el agente `nube` va con `passengers:false`.

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

