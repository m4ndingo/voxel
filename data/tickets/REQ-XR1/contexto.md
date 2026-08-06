# REQ-XR1 · rayos-X tapaba lo que marca

Todas hechas por mí con Playwright, misma cámara: de pie en el circuito de redstone de
`data/mundo.json`, junto al primer repetidor que hay en la ventana (251..291, 243..283), mirando
hacia `-Z` con `pitch -0.45`, 1280×720.

⚠️ Para reproducirlo hay que **plantarse en el sitio**: el volumen de rayos-X son 7×5×7 celdas
alrededor de los **pies**, así que mirando al horizonte no entra nada en cuadro y parece que la
herramienta no hace nada.

- `antes.png` / `antes_zoom.png` — cubos macizos a alfa 0.38. Tapan el **92,2 %** de la pantalla; el
  circuito no se ve.
- `despues.png` / `despues_zoom.png` — aristas. **4,9 %** de la pantalla, y las piezas se distinguen.
- `sin_rayos_x.png` — la misma cámara con rayos-X apagado, para comparar.

El cubo blanco grande del centro en `despues` **no es el volumen**: es el marcador de impacto del
rayo (`mcXrayRay`, 0,1 de lado), que aquí sale enorme porque la cámara está a medio bloque de lo que
apunta. Aislado y medido: aporta 20 090 px de los 45 305 que cambian.
