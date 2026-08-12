# Contexto — REQ-FLY1 / REQ-OSD2 / REQ-OSD3 / REQ-OSD4 / REQ-INTRO1

- **Fecha:** 2026-08-12
- **UUID del mensaje:** `a7c2cf5f-04e6-464c-b8c4-8422f4e0bd9f`
- **Sesión:** `~/.claude/projects/-root-voxel/813a0c1f-8825-494c-8a23-a22a8d3ab94e.jsonl`
- **Adjuntos:** ninguno (petición solo de texto)

De este único mensaje salen **cinco tickets**: REQ-FLY1 (volar), REQ-OSD2 (la capa OSD y su API),
REQ-OSD3 (una pantalla que es otro mapa), REQ-OSD4 (los botones-bloque) y REQ-INTRO1 (la intro de
`/map/fps`).

## Enunciado literal del dueño

> quiero hacer algo nuevo que modifique la experiencia a entrar al mundo y es que parezca ya el producto
> terminado. en el producto terminado espero que al arrancar aparezca una camara volando por un terreno ya
> renderizado, por ejemplo el de http://135.181.61.243:8500/map/fps que tiene un bioma bastante completo
> con montañas, arboles, etc. para esto hace falta 1) que el jugador pueda volar, vamos a cambiar la tecla
> "f" por "alt+f" para sacar fotos, ahora el modo volar seria con la tecla "f". El movimiento sería como
> estar dentro de un fluido pero sin caida hacia abajo (sin gravedad). Asi podemos hacer un script que
> ponga al jugador en modo vuelo y que con un algoritmo le hagamos volcar por el mapa "fps" para que el
> usuario que entre en el juego/producto vea esa animacion que se genera en tiempo real. Al mismo tiempo
> haria falta poder crear un OSD que se ponga encima del juego para las opciones de "JUGAR" y "CONSTRUIR".
> Jugar mandaria al usuario al mapa/bioma que se esta sobrevolando, aprovechamos que ya esta cargado,
> construir lo mandaria al modo de edicion 2d/3d actual. Habrir tantos tickets como sea necesario para las
> implementaciones aqui propuestas, pero antes revisarlo. Quiero que sea algo simple, quiero poder diseñar
> pantallas para OSD y activarlas con f12 inspector, asi por ejemplo en mitad del juego puedo querer
> estando en un mapa arbitrario como "test" activar la pantalla "menu1" que seria otro mapa (map/menu1)
> par que se ponga como OSD, y luego ya le pongo yo mecanicas al menu que podrian ser 2 bloques con textos
> para que al hacer clic en uno y otro pase una accion, por ejemplo: se cargue un mapa concreto, se
> cambien las coordenadas (teleport) del usuario, etc. Revisar todo lo que he dicho para crear un plan que
> sean las specs del "producto final", el goal que se pueda pasar la url a un usuario donde poder empezar
> a ver el producto con el menu/osd modo vuelo (seria el usuario en modo volar al que se le cambian las
> coordenadas) por lo que hay que montar toda la infra necesaria

## Decisiones tomadas con el dueño antes de implementar (2026-08-12)

| # | Pregunta | Respuesta |
|---|---|---|
| D1 | ¿Qué hace **CONSTRUIR**? | Abre el **editor `/`** (el 2D/3D de siempre), que es lo que dice el enunciado. |
| D2 | Una pantalla OSD que es otro mapa, con `mc` singleton | **`<iframe>` + `postMessage`**. Dos escenas vivas en el motor serían un refactor de `app.js` entero. |
| D3 | ¿Cuándo se dispara la intro? | **Solo si lo pide la URL** (`?intro=1`). `/map/fps` a secas no cambia. |
| D4 | ¿Cómo declara un bloque-botón su acción? | **Por el texto de su nota** (`mc.notes`), que ya planta carteles 3D legibles. Cero infra nueva. |

Se descartaron: modo creativo dentro del mapa para CONSTRUIR; sacar `mc` a instancias; intro siempre
activa en `/map/fps`; y declarar la acción por coordenada (se rompe al mover el bloque) o por material
dedicado (obliga a dibujar un asset por botón).
