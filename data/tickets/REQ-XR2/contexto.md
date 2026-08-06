# REQ-XR2 · rayos-X no decía el *power*

Todas hechas por mí con Playwright sobre el circuito **de verdad** del dueño, en `/map/default`
(`data/mundo.json`), sin escribir nada: los POST van bloqueados y solo se mueve la cámara.

Encuadre: de pie en la celda de más señal del mundo (`267,15,262`, `hab:cable-on@12` a 15), a 2,5
bloques de ella, `yaw 0` (mira a −Z), `pitch -0,35`, 1280×720.

⚠️ Para reproducirlo hay que **plantarse en el sitio**: el volumen de rayos-X son 7×5×7 celdas
alrededor de los **pies** (R=3), así que desde más lejos la celda no entra en cuadro y parece que la
herramienta no hace nada. Y las etiquetas son **DOM, no canvas**, así que aquí no vale el
`mc.canvas.toDataURL()` de otros tickets: hace falta screenshot de página, y para que no se mueva
entre el `evaluate` y el disparo se congela el bucle (`requestAnimationFrame` a no-op) y se llama a
`mcRender()`/`mcUpdateXrayLabels()` a mano.

- `antes.png` / `antes_zoom.png` — el mismo encuadre con el envoltorio quitado. **0 de 28** etiquetas
  dicen nada de la señal: un cable a 15 y otro a 13 son idénticos.
- `despues.png` / `despues_zoom.png` — **14 de 28** llevan la línea.
- `captura.js` — el guion que saca las cuatro. Se ejecuta **desde `/root/voxel`** (playwright solo
  resuelve ahí).

Lo que se lee en el recorte, y es todo el ticket en cinco líneas:

```
267,15,262  cable-on@12      ⚡ 15          pieza de circuito: lo que recibe
266,16,262  cable-on@12      ⚡ 13          tres saltos después: se ve la pérdida
267,16,262  repetidor-on@12  ⚡ 13 → 15     recibe ≠ saca: por eso el tendido de después no se acorta
269,16,262  repetidor-on@6   ⚡ 0 → 15      no recibe nada y aun así entrega 15
267,14,262  asset hierba     ⚡ 15 débil    no es circuito: hace de PUENTE (r1.2), y en débil
```

La hierba de debajo del cable saliendo marcada es intencionado, no ruido: es el puente de r1.2, y es
justo lo que hizo falta para entender REQ-RS5. Si un material no debería transportar,
`game.redstone.aislante(clave)` y desaparece.
