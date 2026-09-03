# REQ-ICON2 · girar las miniaturas en el plano horizontal

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-icon2).

## Palabras del dueño (verbatim)

> los iconos de las ranuras y tambien de la galería muestran la rotacion por defecto la cual no
> parece ser la mas idonea para visualizar por ejemplo la cara de una cabeza, ya que mira hacia
> atras. deberia de haber un boton que permita rotar en el plano horizontal los iconos para poder
> ver sus otras caras en las galerias y como aparecen en las ranuras mostrados

El ejemplo de la cabeza que enseña la nuca es el requisito: no es un fallo de dibujo, es que no hay
manera de elegir por dónde se mira la pieza.

## Lo que se comprobó en el código antes de abrirlo

**El giro ya está hecho en el motor; la miniatura lo descarta.**

- `renderIso(ctx, W, H, rot, maxS, seams, …)` — `web/app.js:736`.
- `rotXY(x, y, rot)` — `web/app.js:692`, `rot&3`: cuartos de vuelta en el plano horizontal, que es
  literalmente lo que pide el dueño.
- `drawThumb(cv, d)` — `web/app.js:1952`: llama `renderIso(…, 0, 40, false)`, con el **0 escrito a
  pelo** y el comentario «rot 0 (no depende de SX/SY)».

**Un solo punto de dibujo**, y eso abarata el ticket: por `drawThumb` pasan 13 llamadas (galerías de
habitantes y de assets, picker, ficha, tarjetas del mundo: `web/app.js:1742, 2300, 2322, 2385, 4207,
4214, 4272, 5879, 5976, 6583, 21355, 21421`) y además `drawThumbRanura` (`web/app.js:1968`), que es
el sello de 42 px de la hotbar (`web/app.js:20893`, `20959`).

## ⚠️ La trampa: la postura no puede viajar en la clave

`getRoomData` **quita el `@rot` a propósito** (`web/app.js:4056`): `flor@5` comparte documento *y
promesa* con `flor`, porque el giro se aplica al hornear la geometría en el mundo, no al documento.
Un `hab:x@1` llegaría a `drawThumb` como el mismo `d` de siempre.

Así que la decisión real del ticket es **dónde vive la postura elegida**:

- pasársela a `drawThumb` como argumento y guardarla aparte, o
- guardarla junto al objeto — y ahí ⛔ el nombre corto de asset sale de `assets/index.json`, y ⛔
  **nunca** se toca un `*.vox.json` (283 k tokens, vetados al `Read` en `.claude/settings.json`).

## La parte de UI

Un botón de girar donde se mira el icono (galería y ficha). Y **una sola postura por objeto**: al
girarlo en la galería tiene que cambiar también cómo sale en la ranura — eso es «y como aparecen en
las ranuras mostrados».

## Vecino, que no es lo mismo

[REQ-ICON1](../../../PLAN_ARCHIVO.md#-req-icon1) (✅ 2026-08-13) montó los **iconos de aplicación**:
`data/ui/ranuras.json` guarda `{dibujo, modo, aa}` por ranura y su `dibujo` **ya lleva `@7`**; quien
rasteriza allí es `pinta()` de `images/index.html`, que reimplementa las fórmulas de `drawIsoFaces`.
Si la postura acaba siendo un dato del objeto, esa página debería leer el mismo dato en vez de
inventarse otro. → `docs/iconos.md`.

## 🥇 Cómo se hace

Ley de oro: envolver `drawThumb` con `fn._orig` guardado desde un snippet
(`data/snippets/<id>.json`, JS **dentro** de `code`) y `game.<modulo>.on()/off()`. `app.js` sólo
después de rodarlo, y lo mínimo.
