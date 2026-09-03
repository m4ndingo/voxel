# REQ-EXTRU6 · Ctrl/Shift+rueda machaca en vez de empujar

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-extru6).

El dueño lo marcó explícitamente como **«req parches en caliente»**.

## Palabras del dueño (verbatim)

> cuando se selecciona un conjunto de bloques y se hace control+rueda arriba x ejemplo para subirlos,
> se deberia de subir tambien el terreno/bloques que tienen por encima, no machacarlo que es lo que
> ocurre ahora; esto para cualquier direccion o combinacion control+rueda o shift+rueda

## Lo que se comprobó en el código antes de abrirlo

⚠️ **La guarda de «no pisar» está comentada.** En `mcSelExtruir` (`web/app.js:17388`, la línea del
`if` en `web/app.js:17408`) el `if (before …)` que evitaría escribir donde ya hay algo está dentro de
un comentario; debajo, `mcSetBlock(c.x, y, c.z, c.id)` escribe siempre.

Lo pisado sí se apunta en `edits.push({x, y, z, before, after})`, así que **deshacer lo recupera** —
pero mover la selección otra vez y soltarla ya lo ha perdido.

## El criterio de «está bien», que lo pone el dueño

> un wup seguido de un wdown debería dejar los bloques iguales

La operación y su contraria devuelven el mundo **byte a byte**. Vale para las cuatro direcciones y
para las dos combinaciones (Ctrl+rueda y Shift+rueda), que es lo que pidió.

Ojo: eso es más que «no machacar». Empujar y desempujar tiene que reconstruir también la columna que
se apartó, no sólo dejarla intacta.

## 🥇 Cómo se hace (ley de oro, y orden expresa del dueño)

⛔ **`app.js` no se toca.** Nace aislado en `data/snippets/<id>.json` (el JS **dentro** de `code`,
jamás un `.js` suelto), envolviendo `mcSelExtruir` con `fn._orig` guardado y expuesto como
`game.<modulo>.on()/off()`, donde `off()` devuelve el motor byte a byte. Sólo tras demostrar
estabilidad se gradúa, y lo mínimo.

Pruebas en **`/map/test`**, ⛔ nunca en `/map/default` ni `/map/agents`.

## Punto de partida

- `web/app.js:17388` (`mcSelExtruir`), `:17408` (la guarda comentada), `:17460`, `:17542`, `:17582`.
- `docs/desarrollo-desacoplado.md` — la ley de oro.
- Familia REQ-EXTRU1..5 en `PLAN_ARCHIVO.md` (⛔ no abrirlo entero: 900 KB, ir por ancla).
