<p align="center">
  <img src="docs/img/voxelforge.png" alt="VoxelForge" width="900">
</p>

<h1 align="center">VoxelForge</h1>

<p align="center">
  Draw voxel assets in the browser, drop them into a Minecraft-style world,
  rig them into articulated agents, and script the whole thing from the console.
  <br>
  No frameworks. No build step. Raw WebGL.
</p>

---

## Quick start

```bash
python3 server.py 8500
```

Nothing to install — `server.py` is Python stdlib only, and the front end is plain
HTML/CSS/JS served as-is.

| URL | What it is |
|---|---|
| `/` | The **editor** — draw a voxel object by layers or free in 3D |
| `/map/<name>` | A **world** — walk it, build in it, script it |
| `/map/` | Index of every world on disk |
| `/fotos` | Screenshots taken in-world (`Alt+F`) |

## Draw voxel assets

The model is a single sparse `Map` of `"x,y,z" → colour`, with per-object dimensions.
You paint on a 2D layer grid with a live isometric preview beside it, or switch to free
3D and place voxels on the face you are pointing at. Extrude, carve, mirror, a face tool
that works in both views, an undo history with one entry per gesture.

Anything you draw is saved server-side and shows up in the gallery with a generated
isometric thumbnail. Export format is a plain JSON document:

```json
{ "format": "voxelforge-1", "size": [16,16,16], "meta": {}, "voxels": { "0,0,0": "#8ab4f8" } }
```

## Drop it into a Minecraft-style world

Worlds are chunked voxel terrain rendered in raw WebGL — first-person movement,
collisions, block breaking and placing, a hotbar, baked skylight and projected sun
shadows, water and lava, ladders, ice, pressure plates, parkour ledge-grabs. Worlds go
up to **512 × 512 × 40** cells.

Whatever you drew in the editor becomes a material you can place. Small drawings melt
into the chunk mesh; larger ones get stamped as standalone structures in any of the
**24 orientations**, at any scale.

There is also a working redstone layer — wires, torches, levers, repeaters, pistons,
doors — built entirely out of drawings plus a property table. The engine has no idea
what a torch is.

## Articulated agents

Agents are rigs: a set of voxel pieces bolted to a skeleton, each piece a drawing you
made in the editor, saved as a document under `data/agentes/`.

```js
game.defineAgent({ id:'abeja', name:'Abeja', goal:'…' });  // a 1×1×1 NPC brain
game.esqueletos.crear('perro', 20, 8, 20);                 // spawn a rigged agent
```

They walk, follow, get stuck and tell you why, can be ridden, ride each other, and
respond to the blocks under their feet. Behaviour lives in agent scripts and a shared
skill library — the engine core stays agnostic about what an agent is or does.

## Scripting and automation

Everything the game can do is reachable from a `game.*` API in the console, and any
script can be saved as a **snippet** that runs on world load:

```js
game.stamp('hab:arbol', 12, 6, 30, 3);           // place a structure, rotated
game.bloques.define('hab:hielo', { velocidad:2, deslizamiento:1.2 });
game.bloques.define('hab:placa', { alPisar(c){ … } });
game.osd.define('menu', { mapa:'menu1' });        // a menu screen that is itself a map
game.foto();                                      // render + capture, server-side
```

Block behaviours, agent brains, intro sequences, HUD screens and menus are all data and
snippets, not engine code. A menu screen is another world you drew; a button is a block
with a note on it.

## Performance

The whole thing is hand-written WebGL with the slow paths measured and removed:

- **Meshing is chunked and allocation-free** — exact-size `Float32Array`, written by
  index instead of `push`. An edit gesture on a 594 k-vertex mesh went from **162 ms to
  57 ms**.
- **Lighting is incremental and exact.** Placing a block relights a bounded box, using
  the cells outside it as boundary conditions — not a whole-world recompute, and not an
  approximation either.
- **Terrain beats structures by an order of magnitude.** 200 leaves written into the
  grid: **60 ms, 0 extra draw calls**. The same 200 stamped as structures: **385 ms, 200
  draw calls**. The API makes the cheap path the obvious one.
- **Agents get a fixed frame budget** (8 ms) split **round-robin**, so one busy agent
  can't starve the rest — before that, 4 of 6 agents were getting zero time per frame.
- **Redstone ticks only what changed**, propagating from dirty sources instead of
  sweeping the world.

## Tests

117 test files under `tests/` — 104 drive a real Chromium through Playwright against a
running server (so the GLSL actually compiles), 13 are pure Node.

```bash
npm i -D playwright@1.47.2 && npx playwright install chromium

node correr_tests.js --list           # catalogue
node correr_tests.js --node           # Node-only tests
node correr_tests.js --area=redstone  # one area
```

Run them from the repo root — they resolve `data/` and `assets/` relative to the cwd.

## Layout

```
app.js            editor + world engine (no dependencies)
server.py         static server + JSON API (stdlib only)
redstone/         redstone engine, published into snippets
assets/           built-in voxel drawings
data/             worlds, drawings, agents, snippets, photos
docs/             the manual
tests/            guardians
```

## License

[MIT](LICENSE)
