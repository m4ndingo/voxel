# Grabación de vídeo de gameplay (Alt+V)

VoxelForge permite capturar clips de vídeo directamente mientras juegas en el Mundo (**🌍**), recortar el inicio y fin con un reproductor integrado y guardar o descargar el resultado en formato **MP4** o **WebM**.

---

## Cómo grabar un vídeo

1. Abre cualquier mapa en el **Mundo**.
2. Pulsa **`Alt`+`V`** (o toca el botón **🎬** en dispositivos táctiles) para comenzar a grabar.
3. Mientras se graba, un indicador **REC** se muestra arriba a la derecha indicando el tiempo transcurrido.
4. Vuelve a pulsar **`Alt`+`V`** para detener la grabación.
5. Se abrirá el **editor de vídeo**:
   - Ajusta los deslizadores de recorte (**Inicio** y **Fin**).
   - Elige formato de exportación (**MP4** o **WebM**).
   - Haz clic en **Guardar en galería** (se almacena en `/videos`) o **Descargar**.

---

## Elementos de HUD incluidos en la captura (Tunables)

La grabación de vídeo compone automáticamente los elementos de la interfaz en tiempo real para que el resultado final sea fiel al gameplay. Puedes activar o desactivar qué capas se capturan mediante la API de consola `game.video`:

```js
// Configurar elementos individualmente (persisten en localStorage):
game.video.hotbar = true;     // true / false: barra de herramientas inferior (hotbar)
game.video.fps = true;        // true / false: medidor de FPS (arriba a la izquierda)
game.video.crosshair = true;  // true / false: punto de mira central (mira)
game.video.badge = false;     // true / false: rótulo "REC MM:SS" en el clip final

// Configurar todo el conjunto en lote:
game.video.hud = {
  hotbar: true,
  fps: true,
  crosshair: true,
  badge: false
};

// Consultar el estado y configuración actual:
game.video.info();
```

---

## Desde scripts / consola

```js
// Iniciar o detener la grabación:
game.video();

// Iniciar una grabación con duración máxima (se detiene sola a los 10 segundos):
game.video(10);
```

También están disponibles los alias `game.grabar()` y `game.grabarVideo()`.

---

## Dónde ver los vídeos guardados

Todos los clips guardados se archivan en el servidor y pueden consultarse, reproducirse, descargarse o borrarse desde la galería en **`/videos`**, accesible también desde el menú **`...`** del editor de objetos.
