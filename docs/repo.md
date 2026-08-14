# Cómo está montado el repo — PLAN, tests, runner y convenciones

**Movido verbatim desde `CLAUDE.md` el 2026-08-13** (tope de 15 KB). Aquí está el detalle de lo que
el índice deja en una línea: cómo se parte `PLAN.md`, cómo se lanzan los tests, y de dónde salen las
capturas de un ticket.

---

## El runner de la batería de pruebas

## 🧪 Batería de Pruebas y Runner (`correr_tests.js`)

El repositorio contiene **127 ficheros `test_*.js`** en `tests/`. Cada fichero incluye una cabecera declarativa:
```javascript
// @area: redstone | agentes | caras | fisica | render | editor | materiales | general
// @necesita: node | servidor, playwright
```

Para ejecutar las pruebas se utiliza el runner CLI `correr_tests.js`:
```bash
node correr_tests.js --node               # ejecuta solo los tests de Node puro (~8.9s)
node correr_tests.js --playwright         # ejecuta solo los tests con Chromium / servidor
node correr_tests.js --area=redstone       # ejecuta tests de una o varias áreas
node correr_tests.js --list                # muestra el catálogo e inventario completo
```

El runner incluye comprobación *pre-flight* automática del servidor `:8500` y de `playwright` antes de arrancar los tests de navegador.

---

## Convenciones

- Cualquier cambio de `state` termina llamando a `render()` (= `drawEdit` + `drawIso` +
  `updateInfo` + `drawEdit3d` si `mode==='3d'`). Las sincronizaciones de UI puntuales usan
  `syncLayer` / `syncColor`.
  ⚠️ **`render()` no pinta: encola un rAF** (y coalesce con `_renderPending`). `setMode()`, en cambio,
  pinta **síncrono**. Llamar a los dos seguidos rasteriza el modelo **dos veces enteras**, y la segunda
  cae un frame más tarde: en un escritorio rápido ni se nota, pero con la CPU lenta y un modelo grande
  es un congelado de segundos que aparece *después* de que la página ya pareciera lista. Si hace falta
  pintar y además fijar el modo, llama solo a `setMode()`.
- El formato de export es `{format:"voxelforge-1", size, meta, voxels:{...}}`; import acepta ese
  objeto (`voxels` como mapa `"x,y,z" -> hex`).
- Idioma de UI y comentarios: **español**.
- **Las capturas de un ticket se guardan en disco, no se dejan en el chat.** Cuando el dueño abre un
  ticket adjuntando imágenes, van a `data/tickets/<ID>/` con un `contexto.md` al lado (fecha, uuid del
  mensaje y el enunciado literal), y el ticket de `PLAN.md` las enlaza por nombre de fichero. El
  motivo es de calendario: un ticket se abre hoy y se resuelve semanas después, cuando la conversación
  donde venían ya no está en contexto — y una captura descrita de memoria no es la captura. Se
  rescatan con `python3 herramientas/guardar_imagenes_ticket.py <ID> [--uuid <prefijo>]`, que las saca del
  transcript de la sesión (`~/.claude/projects/-root/*.jsonl`, donde Claude Code las deja en base64)
  sin tener que pedírselas otra vez al dueño; `--listar` enseña los últimos mensajes con imagen. Si un
  mensaje abre **varios** tickets, las imágenes se guardan **una sola vez** y los demás apuntan a esa
  carpeta. `data/tickets/` está exceptuado en `.gitignore` a propósito: es autoría, como
  `data/agentes/`, no estado de runtime.
- **La documentación se escribe en `docs/`, no aquí.** `CLAUDE.md` se inyecta en cada turno: lo que se
  añada se paga en todos. Si una sección crece más de ~15 líneas, muévela a su `docs/*.md` y deja aquí
  el puntero con la regla que cuesta caro romper. Nada se borra al mover: se mueve verbatim.
- Al ampliar el MVP (p. ej. hacer reales las pestañas Habitaciones/Mapa), mantener el mismo
  `state.voxels`/serialización como fuente de verdad y añadir vistas nuevas sin duplicar el modelo.
