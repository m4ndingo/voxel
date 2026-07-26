# MOCK · Árboles voxel (tronco + ramas + copa)

Catálogo de **prueba** de 3 árboles 32³ (tipo `objeto`). Generados por procedimiento.
**Aún no son assets**: no están en `assets/index.json`, no aparecen en el editor todavía.

## Contenido
| id | árbol |
|----|-------|
| `roble`  | 🌳 Roble frondoso — tronco grueso, 5 ramas, copa verde en racimos |
| `pino`   | 🌲 Pino conífera — tronco fino y faldas cónicas apiladas |
| `cerezo` | 🌸 Cerezo en flor — tronco inclinado, ramas abiertas, copa rosa |

## Previsualizar
Con el server activo (`python3 server.py 8500`):

    http://localhost:8500/assets/trees_mock/catalog.html

Cada tarjeta rota con el botón «↻ girar».

## Regenerar / ajustar
    node assets/trees_mock/make_trees.js      # idempotente, PRNG determinista

Formas y colores se editan en el objeto `TREES` de `make_trees.js` (trunk/branch/blob/skirt).

## Promover uno a asset real
1. Mover `assets/trees_mock/<id>.vox.json` → `assets/<id>.vox.json`.
2. Añadir su entrada a `assets/index.json` cambiando `file` a `assets/<id>.vox.json`.
3. Recargar el editor: aparece en la galería de Objetos.
