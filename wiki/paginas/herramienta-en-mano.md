# Herramienta en mano (primera persona)

`game.showTool` muestra el asset activo al estilo Minecraft/Quake: la herramienta aparece en la esquina inferior derecha de la pantalla mientras caminas.

## Activar / desactivar

```js
game.showTool(true)   // activa
game.showTool(false)  // desactiva
game.showTool()       // devuelve true/false
```

También desde la UI: **Mundo → Mostrar herramienta en mano** (icono 🪓).

---

## Qué asset se muestra y cómo se rota

La herramienta en mano sigue al **modo de edición activo**. Solo entran en la rotación y se muestran en mano aquellos dibujos que tengan la categoría **«Herramienta»** y su tipo asignado en el editor 2D/3D:

| Tecla / Grupo | Modos posibles | Asset por defecto |
|---------------|----------------|-------------------|
| **`e`** (principales) | Construir (`build`), Volumen (`box`) | `hab:pico-de-piedra`, `hab:caja-de-volumen` |
| **`E`** (secundarias) | Pintar (`paint`), Seleccionar (`select`), Cuentagotas (`pick`) | `hab:pincel-de-texturizado`, `hab:varita-de-seleccion`, `hab:cuentagotas` |

---

## El pivote de agarre

El punto donde la herramienta "se sujeta" (el vóxel que queda en la mano del jugador) lo define la herramienta **📍 Pivote** del editor 2D/3D de assets.

- Abre el asset en el editor, activa la herramienta 📍, pinta el vóxel de agarre con **"1"** y guarda.
- El motor lo lee del array `pivotes[0]` del JSON del asset y traslada la geometría para rotar y balancear exactamente sobre ese punto.

---

## Tunables del balanceo y postura

Todos se guardan en `localStorage` y persisten entre sesiones.

```js
game.showTool.pos      = [0.9, -0.6, 0]      // [x, y, z] en espacio de cámara (por defecto [0.9, -0.6, 0])
game.showTool.rot      = [-10, -80, -30]     // [rx, ry, rz] rotación base (por defecto [-10, -80, -30])
game.showTool.scale    = 0.8                 // escala de la herramienta (por defecto 0.8)
game.showTool.bob      = 10                  // amplitud del balanceo al andar (por defecto 10)
game.showTool.bobDecay = 0.25                // tiempo de parada/salto suave (por defecto 0.25 s)
game.showTool.bobRise  = 0.05                // tiempo de arranque suave (por defecto 0.05 s)
```

---

## Tunables de la animación de picar (Swing)

Al hacer **clic izquierdo** con el pico (`build`), se ejecuta una cinemática física en 3 fases:

1. **Fase 1 (Impulso / Anticipación)**: el pico se alza, retrocede y se inclina hacia atrás cargando fuerza.
2. **Fase 2 (Golpe seco)**: acelera hacia delante y abajo, clavando la punta directamente contra el bloque.
3. **Fase 3 (Recuperación)**: retorno amortiguado y elástico a la postura de reposo.

### Valores por defecto del golpe

```js
game.showTool.swing = {
  dur: 0.32,        // Duración total del ciclo (s)
  windupP: 0.25,    // Fracción del ciclo en Fase 1 Impulso (0..1)
  strikeP: 0.58,    // Fracción del ciclo donde culmina la Fase 2 Golpe (0..1)
  windupRot: -35,   // Grados de inclinación hacia atrás (impulso)
  chopRot: 15,      // Grados de inclinación frontal en el impacto
  lift: 0.12,       // Elevación vertical en la carga (+Y)
  pull: 0.06,       // Retroceso hacia el jugador en la carga (+Z relativo)
  drop: 0.20,       // Descenso vertical en el impacto
  reach: 0.28       // Avance hacia adelante en el impacto
};
```

---

## Diagnóstico y depuración (Gizmo)

```js
game.showTool.debug = true   // muestra el gizmo (cruz amarilla en pivote "1", ejes RGB y caja)
game.showTool.info()         // muestra todos los parámetros activos de postura, bob y swing
```
