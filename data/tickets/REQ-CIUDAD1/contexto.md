# REQ-CIUDAD1 · contexto

## Revisión del dueño sobre la ciudad `/map/plan` (rescatada de `data/worlds/plan.json`, 2026-08-20)

El dueño paseó la ciudad generada y dejó **9 notas dentro del propio mapa**. Se copian aquí porque
`herramientas/md_a_ciudad.py` **las borra al regenerar** (ver más abajo), y un ticket se resuelve
semanas después de abrirse.

Posición → texto literal:

| nota | qué dice |
|---|---|
| `100,14,48` | «No distingo entre un edificio de tipo bug a uno de tipo requerimiento, deberian de estar hechos de diferentes materiales claramente diferenteciables desde fuera» |
| `100,14,54` | «los carteles de los edificios fuera del edificio, que me obliga a entrar para leerlos y es un rollo» |
| `79,15,72` | «estos adoquines en mitad de las aceras molestan al pasar» |
| `72,14,77` | «podria haber alguna flor, que no sea solamente decorativa, que indique igual el tipo de ticket que es, si es que es un ticket.. no se que me voy a encontrar al entrar a un edificio ahora mismo» |
| `72,14,84` | «este parece un edificio importante ahora, pero de lejos no se reconoce» |
| `65,14,80` | «muchas farolas, ademas es de dia» |
| `59,14,83` | «no veo diferencias en las bolitas esas que salen verdes, lo mismo es para abierto que para implementado, por lo tanto no deberia de ser determinante en el techo del edificio, verdad?» |
| `57,14,98` | «poco identificativo desde fuera» |
| `58,14,90` | «el tipo de suelo podria ser algo que represente a la zona, o seccion del md, se agrupan todos estos edificios por algo imagino» |

### Lo que piden, agrupado

1. **Legibilidad desde fuera** (4 de las 9: `100,14,48`, `72,14,84`, `57,14,98`, `72,14,77`). Hoy hay
   que entrar en el edificio para saber qué es. Piden que **tipo** (bug vs requerimiento) y
   **importancia** se lean **de lejos**: materiales de fachada distintos, y una **flor no decorativa**
   que codifique el tipo de ticket.
2. **Carteles fuera del edificio** (`100,14,54`). Hoy los atriles están dentro.
3. **El tejado por estado está mal elegido** (`59,14,83`). Dice que «las bolitas verdes» salen igual
   para abierto que para implementado ⇒ el estado **no debería mandar en el tejado**. Choca de frente
   con la tabla estado→tejado de [`docs/ciudad-md.md`](../../docs/ciudad-md.md); hay que rehacerla.
4. **El suelo debería representar la zona/sección del `.md`** (`58,14,90`), que hoy es `hierba` plano.
5. **Sobran farolas** (`65,14,80`), y además de día no pintan nada.
6. **Los adoquines sueltos en las aceras estorban al andar** (`79,15,72`).

Todo esto es **capa DERIVADA** salvo el punto 2 (los atriles son PORTADORES: mover un atril mueve el
párrafo). O sea que 1, 3, 4, 5 y 6 se pueden rehacer enteros **sin tocar la ida y la vuelta**.

---

## ⚠️ Las notas a mano NO sobreviven a una regeneración

Comprobado en el código, no supuesto:

- `md_a_ciudad.py:113` arranca con `self.notes = {}` y lo llena **sólo** desde el `.md`.
- `md_a_ciudad.py:347` escribe `'notes': li.notes` **entero**, de una pieza.
- **En ningún punto se lee el mundo anterior.** No hay mezcla. Lo que hubiera se pierde.

Red de seguridad: `voxfmt.escribir` (`servidor/voxfmt.py:228`) hace `to_trash(wf, move=False)` de la
cabecera **siempre**, con `--forzar` o sin él, así que la versión previa queda en
`data/habitantes_trash/<ms>__plan.json`. Recuperable, pero sólo si alguien se acuerda de ir a buscarla.

**Pendiente de decisión del dueño** (2026-08-20): qué hacer para que sus notas sobrevivan. La regla
tiene que distinguir «nota mía» de «atril generado», y no es evidente — 8 de estas 9 están a `y=14`
(el suelo) frente a los atriles a `y≥15`, pero `79,15,72` está a 15, así que la altura sola no vale.
