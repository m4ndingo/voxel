# La wiki del usuario (`/wiki`) — cómo funciona por dentro

**Movido verbatim desde `CLAUDE.md` el 2026-08-13** (tope de 15 KB). La regla que se queda en el
índice es la única que cuesta caro romper: **la wiki no se edita salvo que el dueño lo pida**, y lo
pendiente se apunta en [`wiki/PENDIENTE.md`](../wiki/PENDIENTE.md).

---

## La wiki del usuario (`/wiki`) → `wiki/`

Manual de **producto** para quien escribe snippets, no documentación del repo (eso es `docs/`). Sin
compilar y sin dependencias: `wiki/paginas/*.md` (contenido), `wiki/api.json` (referencia),
`wiki/indice.json` (el panel lateral) y `wiki/wiki.js` (enrutador por hash + Markdown de andar por
casa). Se edita y se recarga.

- ⛔ **La wiki NO se edita salvo que el dueño lo pida explícitamente.** Es su manual: la mantiene él y
  decide cuándo se pone al día. Si un ticket cambia algo que la wiki documenta, **apunta una línea en
  [`wiki/PENDIENTE.md`](wiki/PENDIENTE.md)** (`- [ ] <ticket> · <qué cambió> → <dónde tocaría>`) y sigue
  con lo tuyo — 10 segundos, sin abrir `api.json`. Él dirá cuándo toca sincronizar; entonces se vacía.
- **No hay ruta en `server.py` y no hace falta**: el estático ya redirige `/wiki` → `/wiki/` y sirve
  `wiki/index.html`. Por eso el enrutado va por **hash** (`#/api/toast`) y no por ruta: así nada de
  lo que cuelga de `/wiki/` choca con la SPA. Si algún día se añade una ruta, quítale el hash antes.
- **Documentar una API es añadirla a `wiki/api.json` y nada más.** `wiki.js` busca esos nombres
  dentro de cada `<code>` del wiki y los convierte en enlaces a su ficha, así que los ejemplos que ya
  están escritos se enlazan solos. El enlazado va **de más largo a más corto** (`game.osd.define`
  gana a `game.osd`) y con guardas a los lados; romper ese orden deja enlaces a la ficha equivocada.
- **`fuente` lleva el SÍMBOLO, nunca el número de línea** (`app.js · mcOsdDefine`): la línea se queda
  vieja al día siguiente y la wiki pasa a mentir. La línea exacta se busca en `SYMBOLS.md`.
  `tests/test_wiki.js` comprueba símbolo a símbolo que cada uno sigue existiendo en `app.js`.
- El cuerpo del texto **no** va con `--font-game`: Pixeloid solo es nítida en múltiplos de 9 px y un
  párrafo largo con ella se paga en tiempo de lectura. La fuente del juego se queda en los rótulos.
