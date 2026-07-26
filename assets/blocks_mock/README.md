# MOCK · Bloques de construcción tipo Minecraft

Catálogo de bloques 16³ (tipo `textura`) para construir estilo Minecraft.

> ✅ **Ya promovidos** (2026-07-21): los 10 están en `assets/` y registrados en
> `assets/index.json` con `group:"Bloques de construcción"`, así que aparecen en la
> tira de **Texturas** del editor bajo esa categoría del desplegable.
> Esta carpeta queda como **generador + previsualización** para regenerar/ajustar.

## Contenido
| id | bloque |
|----|--------|
| `adoquin` | Adoquín (cobblestone) |
| `ladrillo_piedra` | Ladrillo de piedra (stone bricks) |
| `ladrillo` | Ladrillo rojo (bricks) |
| `tablones` | Tablones de roble (oak planks) |
| `tronco` | Tronco de roble — corteza + anillos en las tapas |
| `arena` | Arena (sand) |
| `arenisca` | Arenisca en capas (sandstone) |
| `grava` | Grava (gravel) |
| `musgo_adoquin` | Adoquín musgoso (mossy cobblestone) |
| `obsidiana` | Obsidiana (obsidian) |

## Previsualizar
Con el server activo (`python3 server.py 8500`), abrir:

    http://localhost:8500/assets/blocks_mock/catalog.html

Cada tarjeta muestra el bloque en iso (top/2 laterales) con el mismo sombreado que el editor.

## Regenerar
    node assets/make_blocks.js      # idempotente; PRNG determinista

## Promover uno a asset real
1. Mover `assets/blocks_mock/<id>.vox.json` → `assets/<id>.vox.json`.
2. Añadir su entrada a `assets/index.json` cambiando `file` a `assets/<id>.vox.json`
   (la entrada ya generada está en `assets/blocks_mock/index.json`).
3. Recargar el editor: aparecerá en la tira/galería de **Texturas** y se puede pintar.
