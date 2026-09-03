# REQ-MUNDOS1 · autoría y borrado en el selector de mundos

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-mundos1).

## Palabras del dueño (verbatim)

> desde diseñador/dueño/operador cuando se va a "mis mundos" o sea a /map, se ven todos los mapas
> incluso los de otros usuarios; no es un problema que se vean todos, sí que no se sabe la autoría o
> permisos de cada uno en esa pagina. falta tambien una opcion para que el operador pueda borrar
> cualquier mapa y que un propietario de un mapa pueda borrar los suyos

## Lo que se comprobó en el código antes de abrirlo

No es «hacer el borrado de mundos»: eso ya está. Lo que falta es enseñarlo.

- `GET /api/mundos` (`server.py`) ya añade a cada fila `dueno`, `visibilidad` y `escritura`, leídos
  de `data/mundos_meta/<slug>.json`, y ya filtra por `sale_en_listados`. **La API no se toca.**
- `DELETE /api/mundos/<slug>` ya existe en `do_DELETE` (`server.py`): comprueba el permiso
  `mundo.borrar_propio` vía `PERMISO_POR_RUTA` (`server.py:176`) y mueve el par `.json` + `.vox` a
  `data/papelera/mundos/` usando `voxfmt` (que tiene el cerrojo y sabe que son dos ficheros).
- `web/mapas.html` es donde está el hueco: el menú de botón derecho sólo tiene
  `data-a="duplicar"` y `data-a="renombrar"` (`web/mapas.html:225-226`), y la tarjeta no pinta el
  dueño por ninguna parte.

## Lo que NO hay que hacer

⚠️ Decidir en el navegador si esta cuenta puede borrar este mapa. El cliente esconde, el servidor
prohíbe: se pinta según lo que ya viene en la fila y el 403 es la última palabra. Que el operador
pueda con cualquiera se configura en su perfil (panel, F9), no con un `if` en el HTML.

## Punto de partida

- `web/mapas.html` — tarjetas y menú contextual.
- `server.py` — `/api/mundos`, `do_DELETE`, `PERMISO_POR_RUTA:176`.
- `docs/cuentas-y-permisos.md` — dónde se decide cada permiso.
