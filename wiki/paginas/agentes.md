# Agentes articulados: crear y manejar

Un agente articulado (un **esqueleto**) no es un voxel: es un torso más piezas colgadas de él
(brazos, cabeza…) que se mueven **como un solo cuerpo**. Es el sistema detrás de zombis, perros,
guardianes… cualquier bicho con partes. Si lo que quieres es un NPC-cubo simple (1×1×1), ese es
otro sistema (`game.defineAgent`) y no el de esta página.

Dos almacenes que **no son sinónimos**, y confundirlos es la fuente de casi toda la confusión:

| | Qué es | Dónde vive |
|---|---|---|
| `game.agentes` | Los **documentos** guardados: qué bichos sabemos hacer | `data/agentes/*.json`, en disco |
| `game.esqueletos` | Lo **vivo**: qué bichos hay ahora mismo en el mundo y dónde | En memoria, se pierde al recargar |

Guardar un agente no planta nada; plantar uno no guarda nada. Son dos pasos independientes.

---

## 1 · Diseñar el documento

Lo normal es dibujarlo en el panel **Agentes** del editor (elegir la pieza raíz, colgarle piezas,
marcar «Te persigue», «Te lleva montado»…) y guardarlo con el botón del panel. Eso escribe
`data/agentes/<id>.json`.

También se puede escribir a mano y guardarlo por script — útil para generar variantes desde
código en vez de clic a clic:

```js
game.agentes.guardar({
  nombre: 'Luciérnaga',
  raiz: { nombre:'torso', pieza:'asset:assets/cubo-blanco-brillante.vox.json', rot:0 },
  piezas: [],
  seguir: { objetivo:'jugador', ejes:'xyz', distancia:3, deteccion:0, velocidad:6 },
  escala: 0.1
});
```

El documento es `{ nombre, raiz:{pieza,rot,...}, piezas:[...], seguir:{...}, andar:{cadencia,...}, escala }`.
`game.agentes.lista()` dice qué hay guardado; `game.agentes.cargar(id)` trae uno concreto.

---

## 2 · Añadirlo manualmente: `game.esqueletos.crear`

```js
game.esqueletos.crear(id | documento, x, y, z)
```

Planta el agente de pie en `(x,y,z)` y devuelve una **promesa** con su handle (`rig`) — lo que
hace falta para las operaciones de más abajo. Acepta dos formas:

```js
// A) por id de uno ya guardado (game.agentes.lista() dice cuáles hay)
game.esqueletos.crear('luciernaga', mc.pos[0] + 3, mc.pos[1], mc.pos[2])
  .then(rig => console.log('plantada', rig && rig.id));

// B) con el documento entero, sin pasar por el almacén
game.esqueletos.crear({
  nombre: 'Guardián', raiz:{ pieza:'asset:assets/guardian.vox.json' }, piezas:[]
}, 40, 20, 40);
```

> ⚠️ **Sus piezas son efímeras**: no entran en `mundo.json` y desaparecen al recargar la pestaña.
> Para que un agente exista siempre que se abra el mapa, la llamada a `game.esqueletos.crear` va
> en el snippet de autoarranque de ese mapa (`mundo-<mapa>`), no suelta en la consola.

---

## 3 · Verlos: `game.esqueletos.lista()`

```js
game.esqueletos.lista();
```

Imprime una tabla con uno por fila: `id`, `nombre`, `piezas`, `donde` (x,z), `giro`, `andando`,
`teVe` (cuánto de «en faena» está, 0-100%), `estado` (persiguiendo / fuera de alcance / con la
correa tensa / bloqueada / cabalgando / te lleva encima…), `frente` (grados hasta su nariz: 0° te
tiene de cara, ±180° de espaldas), `alto` (si está en el aire) y `shock` (si le acaban de empujar).
El campo `id` es justo lo que aceptan todas las operaciones de abajo, sin tener que guardar el
`rig` de cuando se creó.

---

## 4 · Operar sobre uno ya vivo

Todas aceptan el `rig` que devolvió `crear()` **o** su `id` numérico (el de `lista()`) — lo que se
tenga a mano:

```js
game.esqueletos.quitar(3);              // se lo lleva del mundo (con id o con rig)
game.esqueletos.empujar(3);              // el golpe: sale despedido y bota (fuerza 0 = la del documento)
game.esqueletos.empujar(3, 8, 1, 0);     // fuerza 8, en una dirección concreta (dx,dz)
game.esqueletos.montable(3, 'cabeza');   // sube y TE LLEVA si te subes a esa pieza; (…, false) lo apaga
game.esqueletos.cabalgable(3, true);     // REQ-AG12: además puedes GUIARLO con WASD yendo montado
game.esqueletos.aturdir(3, 1.5);         // «me han empujado»: 1,5 s sin andar; aturdir(3, 0) lo despierta ya
game.esqueletos.desplazar(3, 2, 0, 0);   // muévelo 2 bloques en X con la colisión de siempre; false si no cabe
game.esqueletos.enCaja(10,0,10, 20,10,20); // qué agentes tienen el CUERPO dentro de esa caja del mundo
```

`quitar()` es lo único que también acepta el propio **material** en vez de un id, para retirar de
golpe todos los agentes de un mismo documento — pero lo normal es un id concreto de `lista()`.

---

## En resumen

1. Diseña y guarda el documento (panel Agentes, o `game.agentes.guardar`).
2. Plántalo con `game.esqueletos.crear(id, x, y, z)` — a mano en consola para probar, o en el
   snippet del mapa para que aparezca siempre.
3. `game.esqueletos.lista()` para ver qué hay vivo y coger su `id`.
4. Opera sobre ese `id`: `empujar`, `montable`, `aturdir`, `desplazar`…

Cómo se comporta un agente ya plantado (a quién persigue, con qué correa, qué tan lejos ve) es
`seguir:{...}` en su documento — ver `game.bloques.define` y su bloque `seguir`, que es el mismo
mecanismo que usa la raíz de un esqueleto.
