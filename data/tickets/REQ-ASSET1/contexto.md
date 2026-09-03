# REQ-ASSET1 · las ranuras enseñan los habitantes del dueño a cualquiera

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-asset1).

## Palabras del dueño (verbatim)

> un usuario que se acaba de crear cuando accede a los bloques de las ranuras ve los assets de tipo
> "hab:" que son del dueño, deberia de ver los suyos y los del mundo, pero no los de otros usuarios.
> Podria ser que un usuario le envie un asset a otro o que solicite subirlo al mundo, con
> multiverse/colaborativo

## Lo que se comprobó en el código antes de abrirlo

**No hay filtro que arreglar: no hay autoría con la que filtrar.**

- `POST /api/habitantes` (`server.py`) guarda el documento **tal como llega**, sin uid ni autor.
- `GET /api/habitantes` devuelve `list_all()` (`server.py:1690`) — todos los habitantes, a todo el
  mundo, sin mirar quién pide.

Por eso el orden importa: la autoría es requisito de lo demás.

1. **Autoría** en el documento, y adopción de los que ya hay (son del dueño).
   ⛔ **Nada se borra de `data/habitantes/`** al migrar — regla del repo. Se añade campo.
2. **Filtro** en `GET /api/habitantes`: los míos + los del mundo. «Del mundo» es un estado explícito
   (compartido), no «no tiene dueño».

## Fuera de este ticket, a propósito

«que un usuario le envie un asset a otro o que solicite subirlo al mundo» es **mensajería entre
cuentas**: enviar, pedir, aprobar, y quién ve la petición. Eso no cabe detrás de un campo `dueño` y
se abre por separado cuando 1 y 2 estén cerrados.

## Punto de partida

- `server.py` — `POST /api/habitantes`, `GET /api/habitantes:1690`.
- `data/habitantes/` — ⛔ sólo lectura y añadir; borrar está prohibido (`data/habitantes_trash/`).
- `docs/cuentas-y-permisos.md`.
