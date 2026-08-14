# Plan · Proyección de sombras del jugador (modo Jugar)

Estado: la sombra actual **no convence** (parece un pegote/mancha desplazada, no la sombra de la
figura). Este documento diagnostica el porqué y define el plan para hacerla creíble.

## 1. Qué hace hoy (y por qué está mal)
`renderShadowSprite` (en `app.js`) recorre **todos** los voxels del personaje y proyecta **cada uno**
al plano del suelo desplazado según su altura:
```
sx = ox + x + z*SHADOW_SDX      // SHADOW_SDX=0.55, SHADOW_SDY=0.35
sy = oy + y + z*SHADOW_SDY
```
y rasteriza una loseta por voxel; la unión se dibuja translúcida.

Problemas concretos:
1. **Se proyecta el VOLUMEN entero, no la silueta.** Como contribuye cada voxel a cada altura, el
   resultado rellena toda la "estela" entre los pies y la copa de la cabeza.
2. **La estela es larguísima.** El personaje mide ~32 de alto y el sesgo es 0.55 → la cabeza cae a
   ~17 celdas de los pies. La sombra se aleja mucho del personaje y parece una mancha aparte.
3. **No hay modelo de luz coherente** con la escena. `SDX/SDY` son arbitrarios y no casan con la
   iluminación aparente (cara superior más clara ⇒ luz cenital-ish desde una esquina).
4. **Sin anclaje de contacto ni suavizado**: alfa uniforme y bordes duros ⇒ lee como charco.
5. Técnicamente la unión de proyecciones SÍ es la sombra de un sólido, pero con esa longitud y sin
   forma de silueta reconocible el ojo no la interpreta como sombra.

## 2. Modelo correcto (lo que debería ser)
Una sombra proyectada = **silueta del objeto vista desde la LUZ, aplanada al plano del suelo**.
Ingredientes:
- **Luz direccional** `L` (vector unitario) coherente con el sombreado de la escena. La escena ilumina
  la cara superior (z+) como la más clara ⇒ luz alta, ligeramente desde una esquina. Propuesta:
  `L = normalize(lx, ly, -lz)` con `lz` dominante (sol alto ⇒ sombra CORTA).
- **Proyección al suelo** de un punto `p` a lo largo del rayo de luz hasta `z = z0` (tapa del suelo):
  `ground = p + ((p.z - z0)/L.z) * (Lx, Ly)`  (desplazamiento ∝ altura sobre el suelo).
- La longitud/dirección la fija `L`; con sol alto la sombra es compacta y pegada a los pies.

## 3. Opciones (ponderadas)
| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| **A · Blob de contacto** | Elipse/rombo difuso bajo los pies, tamaño = huella (x,y) del personaje | Trivial, SIEMPRE creíble, ancla la figura al suelo | No tiene forma del personaje |
| **B · Silueta proyectada** | Proyectar la silueta a lo largo de `L` (sombra direccional real) | Realista, se mueve/gira con la figura | Más cara; hay que evitar la "estela" rellena |
| **C · Híbrido (recomendado)** | Blob de contacto **+** silueta proyectada CORTA y suave por encima | Ancla + carácter; robusto | Un pelín más de trabajo |

**Recomendada: C.** El blob garantiza que "toca el suelo"; la silueta corta le da forma sin arriesgar
el efecto pegote. Si hay que recortar, quedarse solo con **A** (blob) ya mejora mucho lo actual.

## 4. Cómo hacer la silueta bien (evitar el pegote)
- **Sol alto ⇒ sombra corta**: usar `L` con componente vertical grande, de modo que el
  desplazamiento máximo (cabeza) sea ~3-6 celdas, no 17. Parámetro `SHADOW_LEN` (longitud objetivo
  en celdas) → derivar el sesgo por altura = `SHADOW_LEN / alturaPersonaje`.
- **Proyectar solo lo necesario**: basta la silueta; en la práctica, proyectar **la columna por su
  altura máxima** (una loseta por (x,y) desplazada por el z más alto de esa columna) da la forma sin
  rellenar toda la estela con cada z intermedio. Alternativa: proyectar todos los z pero con
  `SHADOW_LEN` corto (la estela es tan corta que se ve compacta).
- **Anclaje de contacto**: la parte de la sombra bajo la huella real (z=0) va más oscura; la punta
  proyectada se **atenúa** con la distancia (gradiente de alfa) para simular penumbra.
- **Suavizado**: una pasada de desenfoque leve (o dilatar+alfa) para que el borde no sea dentado.
  Barato si se hace una vez por orientación (precalculado como los sprites).

## 5. Integración (lo que ya encaja)
- **Precálculo por orientación** (4), recortado a su bbox, como `play.sprites` — coste 0 por frame.
- **Oclusión por píxel**: ya está resuelta y la respeta sola (el suelo nunca está más cerca que el
  jugador ⇒ la sombra se mantiene sobre el suelo y solo la tapa el mobiliario por delante).
- Se dibuja **antes** del sprite del jugador (debajo).

## 6. Parámetros propuestos
- `SHADOW_LIGHT = normalize(0.5, 0.35, -1.4)` (alta, desde arriba-izquierda-fondo).
- `SHADOW_LEN ≈ 6` celdas (sombra corta) → sesgo por altura = `SHADOW_LEN/32`.
- `SHADOW_ALPHA_BASE ≈ 0.38` en el contacto, cayendo a ~0.12 en la punta.
- `SHADOW_BLUR ≈ 1–2 px` (o dilatación 1 celda).

## 7. Pasos
1. Sustituir el sesgo fijo `SHADOW_SDX/SDY` por `L` + `SHADOW_LEN` (sombra corta y coherente).
2. Proyectar por **columna** (altura máxima) en vez de por voxel ⇒ silueta, no volumen.
3. Añadir **blob de contacto** bajo la huella (opción C).
4. Gradiente de alfa con la distancia + suavizado leve (precalculado por orientación).
5. Verificar en headless (render estático) que la sombra: (a) sale de los pies, (b) es corta, (c)
   tiene forma del personaje, (d) no flota sobre muebles.
6. Ajuste fino de `SHADOW_LEN`/dirección con feedback visual.

## 8. Alcance / decisión pendiente
- ¿Sombra **estática** (una dirección de sol fija para toda la sala) o que cambie por sala? → fija
  de momento (coherencia y simplicidad).
- Si se quiere bajo mínimo esfuerzo y cero riesgo: implementar **solo A (blob de contacto)** y dejar
  B/C para después.

## Bitácora
- 2026-07-19 · Detectado pegote; escrito este plan. Sombra v1 = proyección de volumen con sesgo fijo
  largo (mala). Próximo: sombra corta por columna + blob de contacto (opción C), o blob a secas (A).
- 2026-07-20 · v2 implementada (opción C parcial): sombra CORTA (`SHADOW_LEN=6`), sesgo por altura
  `SHADOW_LEN/ext.z`, orden z-alto-primero para que el contacto se pinte encima, **gradiente de alfa**
  (0.40 contacto → ~0.13 punta) horneado en el sprite, y **depth buffer del suelo** por píxel para
  ocluir la sombra (los muebles delante la tapan). Además, **causa real del "despegue"**: el pase de
  oclusión del jugador restauraba la base en TODO el rectángulo del sprite (también fuera del
  personaje) y borraba la sombra junto a los pies → corregido para actuar **solo donde el jugador
  tiene píxeles** (`sdep!==Infinity`). Pendiente fino: blob de contacto explícito y suavizado/dilatación.
