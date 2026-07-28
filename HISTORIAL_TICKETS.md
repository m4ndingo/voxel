# Historial de Tickets, Diagnósticos y Soluciones Técnicas 📜🤖

Este documento registra de forma metódica cada ticket de error o atasco de los agentes enviado desde la consola F12 de VoxelForge, detallando el diagnóstico topográfico 3x3 local, la causa raíz, la solución técnica aplicada en los snippets y la lección aprendida.

---

## Registro de Entradas

### Ticket #001 - `TypeError: a.getBlockName is not a function`
- **Fecha y Hora**: 2026-07-26 ~22:40
- **Agente**: Constructor Héroe / Varios Agentes
- **Tipo de Incidencia**: Error de Ejecución JS en Consola F12 (`TypeError`)
- **Log de Consola**:
  ```text
  app.js:6197 [agente constructor_heroe] onTick: TypeError: a.getBlockName is not a function
      at getMatName (VM12898:480)
      at local3x3Diagnostic (VM12898:495)
      at emitTicket (VM12898:530)
  ```

#### Diagnóstico y Causa Raíz
El método `a.getBlockName` no existía en el API de agentes (`game.defineAgent` / `app.js`). En su lugar, los bloques se devuelven como números ID (`a.getBlock(x, y, z)`) y la conversión a nombre de material se almacena en el diccionario global `mc.blockKey[id]`.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.2)
- **Cambio**: Implementación de la función auxiliar `getMatName(blockId)`:
  ```javascript
  function getMatName(blockId) {
    if (!blockId) return 'aire';
    if (typeof mc !== 'undefined' && mc.blockKey && mc.blockKey[blockId]) {
      var key = mc.blockKey[blockId];
      if (typeof key === 'string' && key.indexOf('asset:assets/') === 0) {
        key = key.replace('asset:assets/', '').replace('.vox.json', '');
      }
      return key;
    }
    return 'id_' + blockId;
  }
  ```

#### Aprendizaje
- *Regla*: Toda inspección de materiales en los snippets debe usar `a.getBlock(x, y, z)` y mapearlo con `mc.blockKey` en lugar de asumir la existencia de helpers en el objeto agente.

---

### Ticket #002 - Ticket `[BUCLE_DETECTADO]` en Posición `[92,19,94]`
- **Fecha y Hora**: 2026-07-26 22:41:02
- **Agente**: `Constructor (Arena sobre Rojo)` (Run: 22:41:02)
- **Tipo de Incidencia**: Bucle de Oscilación de 2 Celdas (`BUCLE_DETECTADO`)
- **Cadena Compacta del Ticket**:
  ```text
  Ticket 22:41:02 [BUCLE_DETECTADO] Run:22:41:02 #1/1 Pos:[92,19,94] Dir:[1,0] Y:[19-19] Abil:[caminataAzotea:ON,lookAheadPrevent:ON,visitaCimaUnaSolaVez:ON,minadoEmergencia:OFF,rebobinadoHistorico:OFF,saltoTactico:OFF,pintadoSincrono:OFF,construccionEnCapa:ON] Recientes:2/10 Cobertura3D:790/8836 Hist:[92,19,94->91,19,94->92,19,94->91,19,94->92,19,94]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Constructor (Arena sobre Rojo) en [92,19,94], Cota Suelo Y=18) ===
    [Z\X]       X=91                      X=92                      X=93                      
   Z=93:      Y=15 (-3:BLOQUEADO:red_concrete)Y=15 (-3:BLOQUEADO:red_concrete)Y=15 (-3:NOTA_FOSO:red_concrete)
   Z=94:      Y=18 (+0:LIBRE:yellow_concrete)Y=18 (@AGENTE:yellow_concrete)Y=17 (-1:CALLEJÓN:arena)  
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Disposición Topográfica**:
   - $Z=95$ ($+Z$): Borde del mapa (`BORDE_MAPA`).
   - $Z=93$ ($-Z$): Desnivel de 3 bloques a `red_concrete` ($Y=15$), bloqueado por límite de caída ($drop \le 2$).
   - $X=93, Z=94$ ($+X$): Bloque con nota 3D de `CALLEJÓN` (`callejon sin salida`).
   - $X=91, Z=94$ ($-X$): Única dirección libre.
2. **Origen de la Oscilación**:
   En el paso 5 del snippet v4.2, `canFront` evaluaba sólo la colisión física pura `a.canWalk(1, 0)`, que devolvía `true` ignorando la nota de callejón existente en $+X$. El paso 5 creía que la dirección $+X$ estaba abierta y **no ponía la nota 3D en $[92, 19, 94]$**. Posteriormente, el paso 7 rechazaba avanzar a $+X$ por la nota de callejón y obligaba a dar la vuelta $180^\circ$ a $[91,19,94]$, generando una oscilación infinita entre $[92,19,94]$ y $[91,19,94]$.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.3)
- **Cambios**:
  1. Implementación de `isCellValidExit(a, dx, dz)`:
     ```javascript
     function isCellValidExit(a, dx, dz) {
       if (!a.canWalk(dx, dz)) return false;
       var nx = a.x + dx, nz = a.z + dz;
       if (game.skills.isTrapPit(a, nx, nz)) return false;
       if (typeof a.getNote === 'function') {
         var ny = a.surfaceY(nx, nz);
         if (ny >= 0) {
           var note = a.getNote(nx, ny, nz);
           if (note && note.indexOf('callejon sin salida') >= 0 && note.indexOf(a.name + ':') >= 0) {
             return false;
           }
         }
       }
       return true;
     }
     ```
  2. Evaluación del paso 5 con `isCellValidExit`: al comprobar $+X$, $+Z$ y $-Z$, los 3 frentes resultan inválidos. El agente califica $[92,19,94]$ como callejón sin salida, escribe la **nota Post-It 3D en el bloque de suelo $[92,18,94]$** y retrocede a $[91,19,94]$.
  3. Al llegar a $[91,19,94]$, el bloque $[92,19,94]$ ya tiene la nota de callejón, por lo que $[91,19,94]$ también se califica como callejón sin salida, recibe su nota 3D y el agente retrocede continuamente a $[90,19,94]$ saliendo al terreno abierto sin necesidad de teletransporte.

#### Aprendizaje
- *Regla*: La evaluación de salidas disponibles en un callejón sin salida debe integrar tanto las barreras físicas como la presencia de notas 3D registradas previamente (`callejon sin salida` y `foso trampa`). De este modo, las notas 3D se propagan marcha atrás celda por celda liberando al agente de forma 100% natural.

---

### Ticket #003 - Ticket `[BUCLE_DETECTADO]` y `[COBERTURA_ESTANCADA]` en Posiciones `[93,18,93]` y `[92,20,93]`
- **Fecha y Hora**: 2026-07-26 22:47:38
- **Agente**: `Constructor (Arena sobre Rojo)` (Run: 22:47:38)
- **Tipo de Incidencia**: Bucle de Oscilación en Presencia de Nota 3D `NOTA_FOSO`
- **Cadena Compacta del Ticket**:
  ```text
  Ticket 22:47:38 [BUCLE_DETECTADO] Run:22:47:38 #1/1 Pos:[93,18,93] Dir:[1,0] Y:[18-19] Abil:[caminataAzotea:ON,lookAheadPrevent:ON,visitaCimaUnaSolaVez:ON,minadoEmergencia:OFF,rebobinadoHistorico:OFF,saltoTactico:OFF,pintadoSincrono:OFF,construccionEnCapa:ON] Recientes:3/10 Cobertura3D:1376/8836 Hist:[93,18,93->92,18,93->93,18,93->92,18,93->93,18,93]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Constructor (Arena sobre Rojo) en [93,18,93], Cota Suelo Y=17) ===
    [Z\X]       X=92                      X=93                      X=94                      
   Z=92:      Y=14 (-3:BLOQUEADO:red_concrete)Y=14 (-3:BLOQUEADO:hierba)Y=17 (+0:LIBRE:red_concrete)
   Z=93:      Y=18 (+1:LIBRE:arena)     Y=17 (@AGENTE:arena)      Y=17 (+0:NOTA_FOSO:red_concrete)
   Z=94:      Y=18 (+1:LIBRE:yellow_concrete)Y=17 (+0:CALLEJÓN:arena)  Y=14 (-3:NOTA_FOSO:red_concrete)
  ```

#### Diagnóstico y Causa Raíz
1. **Disposición Topográfica**:
   - $X=94, Z=93$ ($+X$): Bloque a la misma cota $Y=17$ con nota 3D `NOTA_FOSO` (`foso trampa`).
   - $X=93, Z=94$ ($+Z$): Bloque a la misma cota $Y=17$ con nota 3D `CALLEJÓN` (`callejon sin salida`).
   - $X=93, Z=92$ ($-Z$): Desnivel de 3 bloques a hierba ($Y=14$), `BLOQUEADO`.
   - $X=92, Z=93$ ($-X$): Cota $Y=18$ (`arena`), única celda transitable.
2. **Origen de la Oscilación**:
   En la versión 4.4, la función `isTrapPit(a, nx, nz)` comprobaba primero si `ny >= cy` (cota destino mayor o igual a cota actual) y devolvía `false` **antes** de leer si la celda destino tenía la nota `foso trampa`. Además, `isCellValidExit` sólo descartaba notas de `callejon sin salida`.
   Por ello, al estar en $[93,18,93]$, la celda $+X$ ($X=94, Z=93$, $Y=17$) se consideraba falsamente válida. El paso 5 no identificaba la celda $[93,18,93]$ como un callejón y no escribía la nota 3D en $[93,17,93]$, obligando al agente a rebotar infinitamente con $[92,18,93]$.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.5)
- **Cambios**:
  1. Anteposición de la verificación de notas 3D en `isTrapPit`:
     ```javascript
     var existingNote = (typeof a.getNote === 'function') ? a.getNote(nx, ny, nz) : '';
     if (existingNote && existingNote.indexOf('foso trampa') >= 0 && existingNote.indexOf(a.name + ':') >= 0) {
       return true;
     }
     var cy = a.surfaceY(a.x, a.z);
     if (ny >= cy) return false;
     ```
  2. Inclusión explícita de notas `foso trampa` dentro de `isCellValidExit`:
     ```javascript
     if (note.indexOf('callejon sin salida') >= 0 && note.indexOf(a.name + ':') >= 0) return false;
     if (note.indexOf('foso trampa') >= 0 && note.indexOf(a.name + ':') >= 0) return false;
     ```
  3. Al evaluar el paso 5 en $[93,18,93]$, las 3 salidas frotales/laterales $+X$, $+Z$, $-Z$ se evalúan como inválidas. El agente marca $[93,18,93]$ con su propia nota 3D de `callejon sin salida` en el suelo $[93,17,93]$ y retrocede a $[92,18,93]$.
  4. En $[92,18,93]$, $+X$ ($[93,93]$) ya posee la nota de callejón, por lo que el agente gira hacia $+Z$ ($X=92, Z=94$, cota $Y=18$) y se libera hacia el terreno abierto.

#### Aprendizaje
- *Regla*: Las notas Post-It 3D del mundo (`foso trampa` y `callejon sin salida`) actúan como bloqueos absolutos de navegación independientemente de la cota $Y$ del bloque. Toda verificación de salibilidad (`isCellValidExit` e `isTrapPit`) debe leer e invalidar las celdas con estas notas antes de aplicar cualquier heurística física.

---

### Ticket #004 - Oscilación 1D de Ping-Pong en Pasillo de Borde $Z=94$
- **Fecha y Hora**: 2026-07-26 22:50:20 / 22:50:27
- **Agentes**: `Constructor Héroe (Yellow Concrete)` (Run: 22:50:27) y `Explorador v3` (Run: 22:50:20)
- **Tipo de Incidencia**: Bucle de Oscilación 1D en Pasillo Estrecho Paralelo al Borde (`BUCLE_DETECTADO`)
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 22:50:27 [BUCLE_DETECTADO] Pos:[90,18,94] Dir:[-1,0] Hist:[90,18,94->91,18,94->90,18,94->91,18,94->90,18,94]
  Ticket 22:50:20 [BUCLE_DETECTADO] Pos:[92,18,94] Dir:[1,0]  Hist:[92,18,94->91,18,94->92,18,94->91,18,94->92,18,94]
  Ticket 22:50:27 [BUCLE_DETECTADO] Pos:[88,18,94] Dir:[-1,0] Hist:[88,18,94->89,18,94->88,18,94->89,18,94->88,18,94]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Constructor Héroe en [90,18,94], Cota Suelo Y=17) ===
    [Z\X]       X=89                      X=90                      X=91                      
   Z=93:      Y=14 (-3:BLOQUEADO:red_concrete)Y=14 (-3:BLOQUEADO:red_concrete)Y=14 (-3:BLOQUEADO:red_concrete)
   Z=94:      Y=17 (+0:LIBRE:arena)     Y=17 (@AGENTE:arena)      Y=17 (+0:LIBRE:arena)     
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Morfología Topográfica del Mapa**:
   La franja de celdas $Z=94$ forma un **pasillo recto de 1 sola celda de ancho** colindante con el perímetro exterior del mapa ($Z=95$).
   - Flanco $+Z$ ($Z=95$): `BORDE_MAPA` (límite del mapa).
   - Flanco $-Z$ ($Z=93$): Muro infranqueable / caída de 3 bloques a $Y=14$ (`BLOQUEADO`).
   - Salidas abiertas: Únicamente avanzar o retroceder a lo largo del pasillo ($+X$ y $-X$).
2. **Origen de la Oscilación 1D BFS**:
   Al recorrer este pasillo de 1 sola celda de ancho sobre celdas ya visitadas, el paso 7 ejecutaba `findNextStepToNearestUnvisited(a)` sin restricciones. Si la celda no visitada más cercana distaba 20 celdas por la derecha ($+X$) y 21 por la izquierda ($-X$), el algoritmo BFS invertía la marcha $180^\circ$ a $+X$. Al avanzar un único paso a $+X$, las distancias globales se invertían (20 por la izquierda, 21 por la derecha), provocando que BFS volviera a girar al agente $180^\circ$ a $-X$. Esto creaba un bucle de ping-pong continuo $X \leftrightarrow X+1$.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.6)
- **Cambios**:
  - **Inercia de Pasillo Estrecho en Paso 7**:
    ```javascript
    var inCorridor = !canOrtho1 && !canOrtho2;

    if (!curIsUnvis) {
      if (inCorridor && canFront) {
        // Mantener inercia recta en pasillo estrecho sin invertir dirección con BFS
      } else {
        var bfsStep = game.skills.findNextStepToNearestUnvisited(a);
        if (bfsStep) {
          v.dir = bfsStep;
        }
      }
    }
    ```
  - Al estar en un pasillo de 1 celda de ancho (`inCorridor`), si la celda frontal sigue estando libre y transitada (`canFront`), el agente preserva la **inercia del movimiento hacia adelante** en lugar de permitir que BFS invierta la dirección $180^\circ$. El agente camina fluidamente a lo largo del pasillo hasta llegar a una intersección abierta o al final del pasillo.

#### Aprendizaje
- *Regla*: En pasillos estrechos de 1 sola celda de ancho (donde ambos ortogonales laterales están bloqueados), debe imponerse inercia de avance directo mientras el frente siga abierto. Nunca se debe consultar BFS para invertir la dirección en pasillos 1D, ya que las fluctuaciones de distancia a la frontera causan oscilaciones de ping-pong.

---

### Ticket #005 - Saturación Dominó de 52 Notas 3D en Pasillos Transitables
- **Fecha y Hora**: 2026-07-26 22:55:40
- **Agentes**: `Explorador v3`, `Constructor (Arena sobre Rojo)` y `Constructor Héroe (Yellow Concrete)`
- **Tipo de Incidencia**: Proliferación Masiva y Saturación de 52+ Notas 3D en Consola (`game.notes()`)
- **Extacto de `game.notes()` (52 elementos)**:
  ```text
  '94,14,94' -> [constructor] foso trampa
  '93,14,93' -> [explorador] foso trampa
  '94,17,93' -> [constructor] callejon sin salida
  '92,17,94' -> [constructor] callejon sin salida
  '91,17,94' -> [constructor] callejon sin salida
  '90,17,94' -> [constructor] callejon sin salida
  '89,17,94' -> [constructor] callejon sin salida
  '88,17,94' -> [constructor] callejon sin salida
  ... (52 notas a lo largo de todo el pasillo Z=94)
  ```

#### Diagnóstico y Causa Raíz
1. **Mecanismo de Cascada Dominó**:
   En la versión 4.6, al llegar a una esquina muerta física ($[94, 94]$), un agente registraba la primera nota `callejon sin salida`. Al dar un paso atrás a $[93, 94]$, la celda $+X$ ($[94, 94]$) devolvía `isCellValidExit = false` por la nota recién colocada. El paso 5 interpretaba que $+X$ (con nota), $+Z$ (borde) y $-Z$ (caída) no eran salidas válidas y **escribía otra nota 3D en $[93, 94]$**.
   Al dar el siguiente paso atrás a $[92, 94]$, la nota escrita en $[93, 94]$ provocaba la creación de otra nota en $[92, 94]$, propagando un efecto dominó que sembraba notas 3D en cada una de las 52 celdas del pasillo transitable.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.7)
- **Cambios**:
  - **Inscripción Exclusiva en Callejones Físicos Reales**:
    ```javascript
    var physFront = a.canWalk(v.dir[0], v.dir[1]) && !game.skills.isTrapPit(a, a.x + v.dir[0], a.z + v.dir[1]);
    var physOrtho1 = a.canWalk(ortho1[0], ortho1[1]) && !game.skills.isTrapPit(a, a.x + ortho1[0], a.z + ortho1[1]);
    var physOrtho2 = a.canWalk(ortho2[0], ortho2[1]) && !game.skills.isTrapPit(a, a.x + ortho2[0], a.z + ortho2[1]);
    var isPhysicalDeadEnd = !physFront && !physOrtho1 && !physOrtho2;

    if (!canFront && !canOrtho1 && !canOrtho2) {
      if (isPhysicalDeadEnd) {
        game.skills.recordDeadEndVisit(a);
      }
      v.dir = [-v.dir[0], -v.dir[1]];
    }
    ```
  - La nota Post-It 3D se escribe **únicamente en el punto de origen del callejón físico real** (`isPhysicalDeadEnd`). Durante la marcha atrás a lo largo de un pasillo transitable, el agente simplemente invierte su marcha $180^\circ$ y camina sin atiborrar de notas dominó redundantes las superficies transitables.

#### Aprendizaje
- *Regla*: Las notas Post-It 3D deben colocarse de forma quirúrgica y puntual solo en los puntos finales de bloqueo físico o cumbres. Nunca se deben inscribir notas 3D en celdas transitables durante el proceso de retirada por pasillos, evitando la saturación del mapa y conservando la lista `game.notes()` limpia.

---

### Ticket #006 - Atasco por Emparedado de Notas en $[92,18,94]$ y Contadores de Visitas Fijos
- **Fecha y Hora**: 2026-07-26 22:57:37
- **Agentes**: `Explorador v3` (Run: 22:57:37) y resto de agentes
- **Tipo de Incidencia**: Congelación de Agentes por Emparedado entre Notas y Recuento de Visitas Invariable en 1
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 22:57:37 [BUCLE_DETECTADO] Pos:[92,18,94] Dir:[-1,0] Hist:[92,18,94->93,18,94->92,18,94->93,18,94->92,18,94]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Explorador v3 en [92,18,94], Cota Suelo Y=17) ===
    [Z\X]       X=91                      X=92                      X=93                      
   Z=93:      Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:NOTA_FOSO:hierba)
   Z=94:      Y=17 (+0:CALLEJÓN:red_concrete)Y=17 (@AGENTE:red_concrete)Y=17 (+0:CALLEJÓN:red_concrete)
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Causa del Contador Fijo en `1 veces`**:
   Las funciones `recordDeadEndVisit`, `recordTrapPitVisit` y `recordPeakVisit` contenían una cláusula `if (indexOf(a.name + ':') >= 0) return;` que abortaba la función inmediatamente si el agente ya había firmado la nota una vez. Por tanto, el contador para ese agente no volvía a incrementarse nunca a pesar de re-visitar la casilla.
2. **Causa del Atasco por Emparedado**:
   Al situarse en $[92,18,94]$, el agente observó:
   - $+Z$ ($Z=95$): `BORDE_MAPA`.
   - $-Z$ ($Z=93$): Caída de 3 bloques a $Y=14$ con nota de `CALLEJÓN`.
   - $+X$ ($X=93$): Nota 3D de `CALLEJÓN`.
   - $-X$ ($X=91$): Nota 3D de `CALLEJÓN`.
   Dado que todas las celdas adyacentes tenían notas de prevención o barreras físicas, `isCellValidExit` devolvió `false` para las 4 direcciones. En la versión 4.7 no existía un mecanismo de escape en el paso 8 para avanzar sobre celdas transitables que tuvieran notas cuando no quedara ninguna celda sin nota, provocando la congelación permanente del agente.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.8)
- **Cambios**:
  1. **Incremento Real de Visitas**: Eliminado el `return` en `recordDeadEndVisit` y `recordTrapPitVisit`. El contador parsea las visitas anteriores del agente, las incrementa (`count + 1`) y actualiza la nota 3D en el mundo.
  2. **Fallback 2 de Escape de Emparedados (Paso 8)**:
     ```javascript
     if (!moved) {
       for (var k = 0; k < 4; k++) {
         var dx = dirs[k][0], dz = dirs[k][1];
         if (a.canWalk(dx, dz) && !game.skills.isTrapPit(a, a.x + dx, a.z + dz)) {
           v.dir = dirs[k];
           moved = a.walk(v.dir[0], v.dir[1]);
           if (moved) break;
         }
       }
     }
     ```
     Si un agente queda rodeado de notas y no dispone de salidas limpias, se le permite avanzar físicamente a cualquier celda caminable libre de pozos trampa reales, rompiendo el emparedado y liberando el movimiento.

#### Aprendizaje
- *Regla*: Las notas 3D previenen recorridos innecesarios pero NUNCA deben causar la congelación total del agente si éste queda emparedado entre ellas. Ante la ausencia de salidas limpias, el motor de navegación debe permitir traspasar temporalmente una nota caminable para liberarse del cerco.

---

### Ticket #007 - Oscilación Residual Ping-Pong en $[92,18,94]$ e Indicación Cardinal de Orientación
- **Fecha y Hora**: 2026-07-26 23:03:39
- **Agente**: `Explorador v3` (Run: 23:03:39)
- **Tipo de Incidencia**: Bucle de Oscilación Residual entre 2 Celdas ($92 \leftrightarrow 93$) y Mejora de Depuración
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 23:03:39 [BUCLE_DETECTADO] Pos:[92,18,94] Dir:[-1,0] (OESTE (-X)) Hist:[92,18,94->93,18,94->92,18,94->93,18,94->92,18,94]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Explorador v3 en [92,18,94], Cota Suelo Y=17, Mirando: [-1,0] OESTE (-X)) ===
    [Z\X]       X=91                      X=92                      X=93                      
   Z=93:      Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:NOTA_FOSO:hierba)
   Z=94:      Y=17 (+0:CALLEJÓN:red_concrete)Y=17 (@AGENTE:red_concrete)Y=17 (+0:CALLEJÓN:red_concrete)
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Rebote de $180^\circ$ Continuo en Paso 5**:
   Al estar en $[92,18,94]$ mirando a $-X$ ($X=91$, con nota), el Paso 5 giraba al agente $180^\circ$ a $+X$ ($X=93$). Al dar el paso y llegar a $[93,18,94]$ mirando a $+X$ ($X=94$, con nota), el Paso 5 de nuevo lo giraba $180^\circ$ a $-X$ ($X=92$).
2. **Incapacidad del Paso 6 en v4.8**:
   En v4.8, el Paso 6 exigía `isPhysicalDeadEnd` para actuar. Como el tramo entre $X=91$ y $X=94$ era plano, `isPhysicalDeadEnd` devolvió `false`, impidiendo que el Paso 6 rompiera la oscilación.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.9)
- **Cambios**:
  1. **Rompimiento Forzado de Oscilación (Paso 6)**: Eliminado el requisito `isPhysicalDeadEnd` en bucles de 2 celdas (`uniqueRecent.size <= 2`). Tras 6 ticks rebotando entre 2 celdas, el motor fuerza al agente a **avanzar físicamente atravesando la nota del frente**, despejando el historial y liberando el recorrido.
  2. **Orientación Cardinal en Depuración F12**: Implementada la función `getCardinalName(dir)` que añade `ESTE (+X)`, `OESTE (-X)`, `SUR (+Z)` y `NORTE (-Z)` tanto en la cabecera 3x3 como en las cadenas de tickets.

#### Aprendizaje
- *Regla*: Toda detección de bucles por historial en 2 celdas debe romper de forma imperativa la oscilación atravesando el bloqueo de prevención, sin depender de verificaciones topográficas estrictas que puedan ser burladas por terrenos planos.

---

### Ticket #008 - Detección por Mapa de Calor v4.10, Escape Multi-Paso y Nota 3D `escape de bucle`
- **Fecha y Hora**: 2026-07-26 23:08:24 / 23:16:31
- **Agente**: `Explorador v3` (Run: 23:08:24)
- **Tipo de Incidencia**: Atasco por Re-visita de Cadenas de Notas y Bucle de Reconciliación Frecuencial
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 23:08:24 [COBERTURA_ESTANCADA] Pos:[92,18,94] Dir:[-1,0] (OESTE (-X)) Hist:[92,18,94->93,18,94->92,18,94->93,18,94->92,18,94]
  ```
- **Matriz Topográfica 3x3 Local**:
  ```text
  === DIAGNÓSTICO LOCAL 3x3 (Explorador v3 en [92,18,94], Cota Suelo Y=17, Mirando: [-1,0] OESTE (-X)) ===
    [Z\X]       X=91                      X=92                      X=93                      
   Z=93:      Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:CALLEJÓN:red_concrete)Y=14 (-3:NOTA_FOSO:hierba)
   Z=94:      Y=17 (+0:CALLEJÓN:red_concrete)Y=17 (@AGENTE:red_concrete)Y=17 (+0:CALLEJÓN:red_concrete)
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Conflicto de Orden entre Paso 5 y Paso 6 en v4.9**:
   El Paso 5 se ejecutaba antes del Paso 6 y modificaba `v.dir` invirtiéndolo al detectar la nota en $X=91$. Cuando el Paso 6 se ejecutaba a continuación, forzaba el movimiento en el `v.dir` recién invertido, enviando al agente de vuelta a $X=93$ en lugar de sacarlo a $X=91$.
2. **Cadenas de Notas Consecutivas**:
   Al intentar atravesar 1 sola nota, la existencia de una segunda nota en la casilla $N+1$ hacía rebotar al agente $180^\circ$ en el siguiente tick, reenviándolo al bucle.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.10)
- **Cambios**:
  1. **Mapa de Calor por Celda (`v.cellVisits`)**: Registro continuo del número exacto de visitas a cada celda. Si `v.cellVisits >= 4`, activa la huida imperativa hacia la casilla adyacente más fresca (menor contador de visitas).
  2. **Vector de Escape Imperativo**: Para bucles de 2 celdas, el escape calcula de forma matemática el vector opuesto a la celda de rebote: `escapeDx = a.x - otherX`, `escapeDz = a.z - otherZ`.
  3. **Modo Escape Multi-Paso (`v.escapeSteps = 3`)**: Durante 3 ticks (`v.escapeSteps > 0`), el Paso 5 no gira $180^\circ$ por notas, permitiendo atravesar toda la cadena de notas consecutivas hasta alcanzar suelo limpio.
  4. **Nota Post-It 3D Landmark `escape de bucle`**: Al desembarcar en terreno limpio tras el escape, se inscribe la nota 3D `escape de bucle` con su recuento de visitas por agente.

#### Aprendizaje
- *Regla*: Las maniobras de escape deben ser inmunes a rebotes por notas durante varios pasos de inercia para atravesar cadenas complejas de avisos, e inscribir un waypoint positivo de salida (`escape de bucle`) para documentar el desatasco en el mundo 3D.

---

### Ticket #009 - Prohibición de Giros de 180°, Preferencia Ortogonal de 90° e Inercia Post-Escape
- **Fecha y Hora**: 2026-07-26 23:18:20 / 23:21:10
- **Agente**: `Explorador v3` (Run: 23:18:20)
- **Tipo de Incidencia**: Bucle de Retorno Inmediato tras Escape por Giros de $180^\circ$ en BFS
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 23:18:20 [COBERTURA_ESTANCADA] Pos:[94,18,88] Dir:[0,-1] (NORTE (-Z)) Hist:[94,18,88]
  === DIAGNÓSTICO LOCAL 3x3 (Explorador v3 en [94,18,88], Cota Suelo Y=17, Mirando: [0,-1] NORTE (-Z)) ===
    [Z\X]       X=93                      X=94                      X=95                      
   Z=87:      Y=14 (-3:BLOQUEADO:hierba)Y=17 (+0:NOTA_ESCAPE:red_concrete)BORDE_MAPA                
   Z=88:      Y=14 (-3:BLOQUEADO:hierba)Y=17 (@AGENTE:red_concrete)BORDE_MAPA                
   Z=89:      Y=14 (-3:NOTA_ESCAPE:hierba)Y=17 (+0:LIBRE:red_concrete)BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Rebote Inmediato de $180^\circ$ Tras Finalizar Escape**:
   Al terminar los 3 pasos de escape (`v.escapeSteps = 0`), BFS recalculaba la celda no visitada más cercana. Al estar la celda más cercana al otro extremo del pasillo, BFS devolvía un giro de $180^\circ$ que reenviaba al agente de regreso a la zona del bucle recién abandonada.
2. **Generación de Ping-Pong por U-Turns de $180^\circ$**:
   Un giro de $180^\circ$ obliga al agente a caminar sobre las huellas que acaba de dejar. En cualquier pasillo con notas, un U-turn de $180^\circ$ desencadena un bucle infinito de oscilación.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.11)
- **Cambios**:
  1. **Preferencia Estricta de Giros Ortogonales de $90^\circ$ (Izquierda/Derecha)**: Si el frente está bloqueado o notado, el motor evalúa primero la izquierda (`ortho1`) y la derecha (`ortho2`). Los giros de $180^\circ$ quedan restringidos como último recurso únicamente cuando ambos laterales estén físicamente cerrados por 3 paredes.
  2. **Inercia Post-Escape Direccional (`v.postEscapeInertia = 10`)**: Tras romper un bucle, el agente mantiene 10 pasos de inercia recta en `v.dir`, prohibiendo a BFS dar giros de $180^\circ$ para consolidar la salida hacia zonas abiertas lejanas.
  3. **Penalización de U-Turns en BFS**: Si BFS sugiere dar un giro de $180^\circ$ pero existe una salida lateral a $90^\circ$, se escoge imperativamente la vía de $90^\circ$.
  4. **Cooldown y Distancia Mínima para Notas `escape de bucle`**: Cooldown de 15 segundos y radio de 5 bloques para evitar duplicar notas de escape en pasillos.

#### Aprendizaje
- *Regla*: Los giros de $180^\circ$ son la causa raíz primaria de la oscilación. En la navegación de agentes, siempre deben priorizarse los desvíos ortogonales de $90^\circ$ (izquierda o derecha) sobre los retornos de $180^\circ$, manteniendo inercia recta de alejamiento tras resolver atascos.

---

### Ticket #010 - Reseteo Dinámico por Progreso Real (30+ Celdas) y Ventana de 50 Ticks
- **Fecha y Hora**: 2026-07-26 23:22:00
- **Agente**: `Constructor (Arena sobre Rojo)` (Run: 23:22:00)
- **Tipo de Incidencia**: Falso Positivo de Detención en `COBERTURA_ESTANCADA` tras Alcanzar el 87.5% de Cobertura
- **Cadena Compacta de Tickets**:
  ```text
  Ticket 23:22:00 [COBERTURA_ESTANCADA] Pos:[19,15,17] Dir:[1,0] (ESTE (+X)) Cobertura3D:7735/8836
  === DIAGNÓSTICO LOCAL 3x3 (Constructor (Arena sobre Rojo) en [19,15,17], Cota Suelo Y=14, Mirando: [1,0] ESTE (+X)) ===
    [Z\X]       X=18                      X=19                      X=20                      
   Z=16:      Y=14 (+0:LIBRE:hierba)    Y=14 (+0:LIBRE:hierba)    Y=14 (+0:LIBRE:hierba)    
   Z=17:      Y=14 (+0:LIBRE:hierba)    Y=14 (@AGENTE:hierba)     Y=14 (+0:LIBRE:hierba)    
   Z=18:      Y=14 (+0:LIBRE:hierba)    Y=14 (+0:LIBRE:hierba)    Y=14 (+0:LIBRE:hierba)    
  ```

#### Diagnóstico y Causa Raíz
1. **Acumulación de Tickets sin Reseteo**:
   El agente recorrió **7.735 celdas 3D de 8.836 totales (87.5% del mapa)**. Sin embargo, acumuló 5 tickets de estancamiento emitidos en la celda 2.879, 3.234, 3.239, 4.212 y 7.735. Aunque el agente exploró casi 5.000 celdas nuevas entre tickets, la falta de un mecanismo de reseteo por progreso real provocó su detención injusta.
2. **Ventana Demasiado Corta (20 Ticks / 4s)**:
   Evaluar el estancamiento cada 4 segundos causaba que los traslados del agente sobre pasillos ya recorridos para ir a rincones lejanos emitieran avisos falsos de falta de progreso.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.12)
- **Cambios**:
  1. **Reseteo Dinámico del Contador por Progreso Real**: Si el agente descubre 30 celdas 3D nuevas desde su último ticket (`v.visited.size >= v.lastTicketCoverage + 30`), el contador `v.tickets['COBERTURA_ESTANCADA']` se resetea automáticamente a cero.
  2. **Amplificación de la Ventana a 50 Ticks (10s)**: La regla de estancamiento evalúa el progreso cada 10 segundos y exige oscilación real (`uniqueRecent.size <= 2`), estando prohibida durante periodos de escape o inercia.

#### Aprendizaje
- *Regla*: Los acumuladores de tickets de estancamiento deben resetearse dinámicamente en cuanto el agente demuestre progreso real descubriendo terreno nuevo. De lo contrario, los agentes que exploren pacientemente grandes mapas serán detenidos erróneamente antes de completar el 100%.

---

### Ticket #011 - Minado de Emergencia Físico para Apertura de Túneles en Muros v4.13
- **Fecha y Hora**: 2026-07-27 09:07:17
- **Agente**: `Constructor (Arena sobre Rojo)` (Run: 23:27:40)
- **Tipo de Incidencia**: Atasco en Rincón Físico de 3 Muros en $[93,18,94]$ (`ATRAPADO_TOTAL`)
- **Cadena Compacta del Ticket**:
  ```text
  Ticket 23:27:40 [ATRAPADO_TOTAL] Pos:[93,18,94] Dir:[-1,0] (OESTE (-X)) Y:[18-18] Cobertura3D:8330/8836
  === DIAGNÓSTICO LOCAL 3x3 (Constructor (Arena sobre Rojo) en [93,18,94], Cota Suelo Y=17, Mirando: [-1,0] OESTE (-X)) ===
    [Z\X]       X=92                      X=93                      X=94                      
   Z=93:      Y=18 (+1:NOTA_CIMA:red_concrete)Y=20 (+3:CALLEJÓN:yellow_concrete)Y=17 (+0:CALLEJÓN:red_concrete)
   Z=94:      Y=20 (+3:MURO_ALTO:arena) Y=17 (@AGENTE:red_concrete)Y=14 (-3:NOTA_FOSO:red_concrete)
   Z=95:      BORDE_MAPA                BORDE_MAPA                BORDE_MAPA                
  ```

#### Diagnóstico y Causa Raíz
1. **Rincón Físico Insuperable de 3 Muros**:
   - $+Z$ ($Z=95$): Perímetro exterior del mapa (`BORDE_MAPA`).
   - $+X$ ($X=94$): Caída de 3 bloques a $Y=14$ con `foso trampa`.
   - $-X$ ($X=92$): Muro de 3 bloques de altura ($Y=20$, `arena`).
   - $-Z$ ($Z=93$): Muro de 3 bloques de altura ($Y=20$, `yellow_concrete`).
2. **Jerarquía Físicamente Incompleta**:
   Ante la falta de salidas transitables, las habilidades de escape estaban en `OFF`. En lugar de recurrir al teletransporte, el agente debía interactuar físicamente con el mundo demoliendo los muros bloqueantes.

#### Solución Técnica Aplicada
- **Archivo**: [`base-npc-skills.json`](file:///C:/Users/Alberto/Documents/Claude/voxel/data/snippets/base-npc-skills.json) (v4.13)
- **Cambios**:
  1. **Jerarquía Estricta de Desatasco Físico (Prioridad 1)**: Ante un bloqueo total, el agente ejecuta en primer lugar `minadoEmergencia(a, dirs)`.
  2. **Creación de Túneles 3D Transitables**: La función `minadoEmergencia` inspecciona y pica los bloques que forman los muros en $-X$ y $-Z$ (los convierte en aire `0`), destruyendo la barrera física y creando 2 túneles físicos. El agente camina a través de los túneles excavados hacia el resto del mapa.
  3. **Salto Táctico como Último Recurso**: El salto táctico queda relegado exclusivamente como último recurso si el minado físico falla (p.ej., si la pared es el borde perimetral del mapa).

#### Aprendizaje
- *Regla*: En un mundo de vóxeles, el desatasco físico mediante demolición de muros (`minadoEmergencia`) siempre debe priorizarse sobre el teletransporte. Los agentes deben labrar sus propios pasajes destruyendo obstáculos antes de recurrir a saltos mágicos.

---
