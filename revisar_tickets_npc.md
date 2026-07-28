# Registro de Tickets de Comportamiento NPC y Errores Derivados 🎟️🤖

Este documento registra los tickets detectados y su estado de resolución. Siguiendo la directiva del usuario, **nos enfocaremos en resolver los tickets UNO A UNO**.

---

## Estado Actual de Tickets

**Sin tickets abiertos (2026-07-28).** El #1 quedó completado en v4.31 y los #2, #3 y #4 se descartaron: el
comportamiento observado ya es el correcto con los cambios realizados. Se conservan a continuación como
historial — si alguno reaparece en ejecución, reabrirlo en vez de crear uno nuevo.

### ✅ TICKET #1: Actualización Real e Incremental de Contadores de Notas 3D
- **Estado**: **[COMPLETADO - v4.31]**
- **Descripción**: Las funciones de notas (`recordPeakVisit`, `recordDeadEndVisit`, `recordLoopEscapeVisit`, `recordTrapPitVisit`) buscan notas existentes en un radio $3 \times 3 \times 3$ local con `findExistingNoteInRadius(a, headerKey, radius)`.
- **Resultado**: En lugar de crear notas duplicadas estáticas de `: 1 veces` en cada cota $Y$ o bloque adyacente de un pino/estructura, el agente actualiza la nota existente e incrementa el contador acumulado a `: 2 veces`, `: 3 veces`, `: 4 veces`, etc.

---

### 🚫 TICKET #2: Memoria Explícita de Cima/Pino basada en Notas Existentes
- **Estado**: **[DESCARTADO - 2026-07-28]** — el comportamiento ya es correcto con los cambios de v4.31; no se llegó a observar el fallo en ejecución.
- **Descripción**: Si una nota de `'pino de emergencia'` o `'visitas a la cima'` ya está colocada en la estructura o radio local, el agente debe usar esa nota como un **flag directo de memoria de cima/pino**, reconociendo inmediatamente que se encuentra sobre una estructura elevada sin necesidad de depender de cálculos estáticos de cota Y.
- **Solución Propuesta**: Integrar `findExistingNoteInRadius(a, 'visitas a la cima', 2)` y `findExistingNoteInRadius(a, 'pino de emergencia', 2)` directamente en el control de progreso para forzar la activación de la rutina de bajada de la cima al detectar reincidencia en la nota.

---

### 🚫 TICKET #3: Detonación de Lava y Alerta `game.stuck()` tras Reincidencia de Nota
- **Estado**: **[DESCARTADO - 2026-07-28]** — su causa (contadores de nota que no incrementaban) quedó resuelta en el TICKET #1.
- **Descripción**: Al no incrementarse el contador de las notas en versiones anteriores, `game.stuck()` devolvía `[]` y no se pintaba Lava en la cima.
- **Solución Propuesta**: Cuando el contador de una nota en la cima alcance $\ge 2$ pasadas, activar inmediatamente la alarma `🌲 CIMA_PINO_ESTANCADA` en `game.stuck()` y pintar Lava bajo los pies.

---

### 🚫 TICKET #4: Rutina Forzada de Bajada de Cima / Desmonte de Pino
- **Estado**: **[DESCARTADO - 2026-07-28]** — los agentes ya bajan de las estructuras elevadas con la jerarquía de desatasco vigente.
- **Descripción**: El agente se queda atrapado en lo alto sin saber descender.
- **Solución Propuesta**: Picar el bloque de la copa o forzar caminata hacia la cota inferior más cercana.
