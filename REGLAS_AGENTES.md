# Especificación Oficial de Reglas de Comportamiento de Agentes (v4.30) 📜🤖

Este documento establece las especificaciones técnicas obligatorias y sacrosantas para todos los agentes del motor VoxelForge.

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
- Cuando un agente se encuentra a menos de 2 bloques del perímetro del mapa y registra 3+ pasadas recientes, se le impone una **redirección automática hacia el interior del terreno** (hacia el centro libre).

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
