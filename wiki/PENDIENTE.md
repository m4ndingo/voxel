# Wiki — pendiente de sincronizar

La wiki (`wiki/api.json`, `wiki/paginas/*.md`) **no se toca salvo que el dueño lo pida**.
Cuando un ticket cambie algo que la wiki documenta, se apunta **una línea aquí** y se sigue.
El dueño dirá cuándo hay que ponerse a actualizarla; entonces se vacía esta lista.

Formato: `- [ ] <ticket> · <qué cambió> → <dónde tocaría>`

- [ ] limpieza de la raíz (2026-08-13) · el motor se mudó a `web/app.js` → los 36 campos `fuente`
      de `wiki/api.json` dicen `app.js · <símbolo>`; el símbolo sigue siendo correcto (que es lo que
      comprueba `tests/test_wiki.js`), solo envejeció el nombre del fichero.
- [ ] BUG-GLOW2 (2026-08-14) · nuevo mando público `game.agentsLightTracking(bool)` — la luz de un
      emisor montado en un agente le sigue al moverse; conmutable para medir fps o desactivarlo
      (defecto on) → nueva entrada en `wiki/api.json` (fuente: `app.js · game.agentsLightTracking`).
- [ ] BUG-GLOW3/BUG-GLOW1 (2026-08-14) · nuevo mando `game.glowGain` (INTENSIDAD de la luz artificial, >1
      sobreexpone) → nueva entrada en `wiki/api.json`. Aclarar en la doc de `game.glowLevel` que es ALCANCE
      (no intensidad) y que `MC_MAXLIGHT` no se toca para brillar.

*(la última sincronización se hizo el 2026-08-13: REQ-ICON1 se cerró con la página
`wiki/paginas/iconos.md`, y de paso se escribió `wiki/paginas/atajos.md`.)*
