# Ciudad-MD — un `.md` renderizado como ciudad, y deshecho otra vez

Dos scripts de consola y un módulo compartido:

```bash
python3 herramientas/md_a_ciudad.py PLAN.md                       # sólo informa, NO escribe
python3 herramientas/md_a_ciudad.py PLAN.md --escribe              # -> /map/plan
python3 herramientas/md_a_ciudad.py PLAN.md --fidelidad=exacta --escribe

python3 herramientas/ciudad_a_md.py plan                     # el .md por stdout
python3 herramientas/ciudad_a_md.py plan --verifica PLAN.md  # byte a byte; sale 1 si difiere
```

Banderas de la ida: `--fidelidad=esqueleto|exacta` (def. `esqueleto`), `--enlaces=carreteras|no`
(def. `carreteras`), `--dim WxHxD`, `--mundo`, `--salida`, `--escribe`, `--forzar`.
De la vuelta: `--salida`, `--verifica`, `--tolerante`.

**Sin `--escribe` no se escribe nada** (estilo de `herramientas/marca_notas_procesadas.py`).
Los slugs `default`, `mundo`, `test` y `agents` se rechazan de plano; sobrescribir un mundo que ya
existe exige `--forzar` y siempre pasa por papelera.

---

## 🔒 La regla, de la que depende todo lo demás

> Cada rasgo del mundo es **PORTADOR** (única copia de un dato del `.md`; la vuelta lo lee) o
> **DERIVADO** (función pura de los portadores; la vuelta lo ignora). Nada decorativo sin relación.

**Portadores** (sólo dos): la **partición del suelo en `y=GH`** por materiales separadores
reservados —que da el orden y el anidamiento— y las **notas** —que dan el texto—.

**Derivados**: alturas, tejados por estado, canales, jardines, farolas, senderos de enlaces, el
obelisco, la puerta. Se pueden rehacer enteros sin tocar la ida y la vuelta, y por eso todo el
presupuesto estético futuro cabe aquí sin riesgo.

⛔ **Un derivado no puede vivir en `y=GH` ni ser una nota.** Son las dos consecuencias que más caro
cuestan si se olvidan:

- Una celda de grava en mitad de una calle rompe la columna de adoquín y la vuelta ya no sabe dónde
  acaba la parcela. Por eso los senderos se pintan en `y=GH+1`, no en `y=GH` (sobre el canal salen
  gratis como pasarela).
- Una nota es PORTADORA, así que **`--enlaces=carteles` no existe** aunque estuviera en el plan: un
  cartel de enlace se colaría en la concatenación de la vuelta y corrompería el `.md`.
- El muro **no** es de adoquín aunque quedara mejor: un edificio que llenase su parcela le pondría a
  la vuelta una columna de adoquín de lado a lado del estante y la partiría por la mitad. Los
  materiales reservados son EXCLUSIVOS de la partición.

## Cómo se compone

| Markdown | Ciudad | papel |
|---|---|---|
| `#` | **la isla**; su plaza lleva el obelisco y la placa | portador |
| `##` | **barrio**, recinto separado por **canales de `agua`** de 3 | portador |
| `###` | **edificio** en su parcela, separado por **calles de `adoquin`** de 3 | portador |
| `####` y más hondo | **planta** del edificio (forjado de `ladrillo_piedra` cada 4) | portador |
| párrafo / ítem / fila / bloque de código | **atril** (pedestal 1×1) con su nota | portador (sólo `exacta`) |
| estado (`🔴 🟡 🟢 ⬜ 🟨 ✅ ⛔`) | material del tejado | derivado |
| longitud de la sección | altura del edificio (1..6 plantas) | derivado |
| enlace interno `(#-bug-rs10)` | sendero de `grava` de puerta a puerta, en `y=GH+1` | derivado |

Escala humana: suelo a `y=14` (el mismo `GH` que `mcGenFlat`, `web/app.js:8550`), `roca` bajo
`y<11`, `tierra` 11–13. Muros de 1, puertas de 2, plantas de 4, calles y canales de 3. Se aparece
**en la calle** frente a la puerta de la plaza: el interior mínimo es de 4×2 y dentro se nace
empotrado en el muro del fondo.

**Los edificios se pintan en `mc.grid`, no como estructuras**: `web/app.js:19360` es explícito, cada
`mc.structures` es un draw call y una línea en el `.json`. La ciudad de `PLAN.md` lleva **0**
estructuras guardadas (los carteles se derivan de `mc.notes` y son efímeros).

## La posición ES el orden

Barrido **raster: `z` ascendente, luego `x` ascendente**, y entre plantas `y` ascendente. Idéntico en
los tres niveles. Eso es lo único que hace falta para que la vuelta recupere el orden del documento
**sin ningún índice escrito en ninguna parte**.

`empaqueta()` coloca los rectángulos EN ORDEN en estantes (se llena en `x`, se apila en `z`) y
**rellena todo hueco con el material separador**, nunca con suelo: así la vuelta segmenta buscando
«filas/columnas enteras de separador» (`tramos()`) y no tiene que adivinar dónde acaba una pieza y
empieza el relleno.

La vuelta, entera: recortar por `agua` ⇒ barrios → recortar por `adoquin` ⇒ parcelas → notas de cada
parcela ordenadas por `(y, z, x)` ⇒ concatenar. No hay visión artificial ni heurística.

## `--fidelidad`

**`esqueleto` (por defecto).** Sólo notas de encabezado: para `PLAN.md`, **43 notas** (42
encabezados + la placa), por debajo de las `MC_NOTE_SIGN_MAX = 64` que se convierten en cartel 3D
⇒ la ciudad se lee entera de un vistazo sin tocar `app.js`. La prosa **no vuelve**, y el `.md`
regenerado lo dice en una línea de cabecera.

**`exacta`.** Cada bloque hoja se trocea en notas con el **markdown crudo literal**. La vuelta es una
concatenación, no un renderizador, y por eso sale byte a byte: sobreviven CRLF, espacios en cola,
`*` vs `-`, líneas en blanco de más y la ausencia de `\n` final. Para `PLAN.md`: 340 bloques → **512
notas**.

`particiona()` es un **particionador**: parte el fichero en rangos contiguos que lo cubren entero, así
que ninguna construcción de Markdown puede romper la exactitud. Lo que degrada es la estética (un
bloque no reconocido cae a «prosa» y sale como un atril más).

### Las tres invariantes del troceador (`trocea()`)

Se comprueban con `assert` **antes** de escribir nada, y cada una tiene un motivo concreto del motor:

1. `''.join(trozos) == texto` ⇒ la vuelta puede ser un `join`.
2. **Ningún trozo vacío.** `mcSyncNoteSignsRun` mira `mc.notes[k]` por *truthiness*: una nota `""` es
   una nota **borrada**, y con ella desaparece un pedazo del documento. Las rachas de líneas en
   blanco se pegan a la cola del bloque anterior en vez de ser bloque propio.
3. **Ningún trozo > 280 unidades UTF-16.** `MC_NOTE_MAX=280` (`web/app.js:16039`) y el truncado es
   `txt.slice(0,MC_NOTE_MAX)` (`web/app.js:16642`), que cuenta **UTF-16**, no code points — y
   `PLAN.md` está lleno de emoji fuera del BMP (`🔴` = 2 unidades). Se mide en UTF-16 pero se corta
   **por code points**, para no partir un par suplente. Con todo trozo ya ≤280, si el dueño abre una
   nota y la guarda el `slice` es un no-op: no hay riesgo de truncarle la edición por la espalda.

## Los metadatos van en la placa del obelisco, que es una nota

⛔ **Nada de claves nuevas en la cabecera del mundo.** `POST /api/mundo` la reconstruye con
`voxfmt.desde_v1` y sólo conserva `spawn/structures/notes/noteRots/noteTints`
(`servidor/voxfmt.py:129-139`), así que una clave inventada se evaporaría en el primer autoguardado
del navegador. En una nota, en cambio, sobrevive.

La placa es la **primera nota del barrido raster** (atril 0 de la plaza, reservado antes de medir la
huella) y empieza por `⛩ CIUDAD-MD v1`. Lleva fichero origen, bytes, `sha256`, fidelidad, enlaces y
dimensión: con eso la vuelta sabe sola con qué reglas se generó, y la reconoce para saltársela.

## Si el dueño edita la ciudad a mano

Que es la gracia. Editar el texto de un cartel sale en el `.md`; mover una nota a otro edificio mueve
el párrafo de sección; añadir una nota en una parcela válida añade texto al final de esa sección.
Tirar un muro o un canal cambia la segmentación: una **nota que no cae en ninguna parcela** es error
duro y la vuelta sale con 1 (`--tolerante` lo baja a aviso por stderr).

⚠️ **Abrir `/map/plan` sin `?noauto=1` reescribe el mundo solo** (autoguardado): quien inspeccione a
mano se puede cargar la ida y vuelta sin enterarse.

## Riesgos, dichos claramente

1. En `exacta` las 512 notas de `PLAN.md` son ~120 KB de cabecera JSON y cientos de post-it dibujados
   por frame; el marcador hace `k.split(',')` por post-it y frame (`web/app.js:14345`). El modo por
   defecto es `esqueleto` precisamente por esto.
2. **`PLAN_ARCHIVO.md` (900 KB) son miles de notas.** Por orden del dueño no hay tope ni aviso: lo
   hará. El mundo resultante será pesado y el navegador lo notará.
3. **Sólo 64 notas son cartel 3D** y no se reservan plazas (decisión del dueño): en `exacta` los
   carteles caen en las primeras 64 por orden de inserción, o sea el principio del documento; el
   resto se lee con `N`. En `esqueleto` no hay problema: 43 < 64.
4. La ciudad puede salir un cementerio de cajas. Lo que la salva es el presupuesto estético, que es
   **todo derivado** y se puede rehacer entero sin tocar la ida y la vuelta.

## Guardián

`tests/test_ciudad_md.js` (`--node --area=general`). Lo que protege es un fallo **silencioso por
naturaleza**: la ciudad sigue viéndose preciosa aunque la vuelta haya perdido un párrafo. Por eso
comprueba igualdad byte a byte sobre `PLAN.md` y sobre un fixture adversario (listas anidadas, tabla,
valla de código con `#`, CRLF, sin `\n` final, línea de 5000, par suplente justo en el corte, línea en
blanco inicial), más el esquema de encabezados en `esqueleto`, la cabecera, que toda clave de paleta
exista en `assets/index.json` y las tres invariantes de las notas.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

Cada rasgo es **PORTADOR** (suelo `y=GH` + notas; la vuelta los lee) o **DERIVADO** (el resto; los
ignora). ⛔ Derivado **jamás** en `y=GH` ni en nota: el `.md` regenerado sale corrupto **sin que nada
falle a gritos**. Guardián `test_ciudad_md.js`.
