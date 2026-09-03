# Bloques con comportamiento (`game.bloques`)

<!-- Detalle de VoxelForge. NO se carga en cada turno: lo carga el agente a demanda
     desde el índice de ../CLAUDE.md. Contenido movido VERBATIM, sin reescribir. -->

## Bloques con comportamiento (`game.bloques`) — el material manda, no el voxel

Una escalera que se trepa, un muelle que impulsa, una placa que dispara algo al pisarla. El
comportamiento cuelga del **MATERIAL** (`hab:escalera`), **nunca del voxel**: es el modelo de
Minecraft (índice de paleta por voxel + comportamiento compartido por tipo). Un script por voxel
serían **442 368** closures en un mundo 96×48×96.

⚡ **`pideRemallado` malla el mundo UNA vez, y el orden es al revés de lo que parece** (2026-08-31):
**restampa primero** y solo malla si `mc.blockLightMeshed` sigue siendo la misma referencia. Antes
hacía `mcMeshAll(); mcRestampAll();` y `mcRestampAll` acaba con su **propio** `mcMeshAll()` — al
arrancar siempre, así que el primer mallado (~2 s) se tiraba entero. ⛔ Si vuelves a poner el
`mcMeshAll()` delante, vuelve el cuelgue de 9 s al entrar. Parche
`herramientas/parche_snp_perf_remallado.py`; detalle →
[`rendimiento-de-entrada.md`](rendimiento-de-entrada.md). Guardián `tests/test_perf_mallado.js`.
**`mcBake` tenía el mismo defecto y se arregló igual** (`app.js`, `opts.difiereMalla`, 2026-09-02):
otros 2,2 s. Es el único sitio de `app.js` que se tocó en todo esto.

⚠️ **Un material vive en UNO DE DOS SITIOS y hay que mirar los dos.** Solo un asset **16³ macizo**
(`blockLike`, `app.js:4006`: `nvox >= 4096`, o sea hierba/roca) entra en `mc.grid`; cualquier cosa
**con forma o huecos** — `escalera.json` son 160 voxels — se estampa como **estructura fina**
(`mc.structures`), con malla propia a **1/16 de bloque** y **fuera de la rejilla**. Rayos-X lo canta:
`bloque · asset` vs `estructura · guardada`. `materialEn(x,y,z)` resuelve las dos vías —
`mc.grid[idx]` → id → `mc.blockKey[id]`, y si ahí hay aire, `claveFinaEn` (calco de `mcFineBoxHit`,
`app.js:4935`, devolviendo `s.key`). **Mirar solo `mc.grid` es ver medio mundo.**

```js
game.bloques.define('hab:escalera', { trepable:true, subida:4, bajada:5 });  // u/s
game.bloques.define('hab:placa',    { alPisar(c){ game.tp(51,20,50); } });   // c = {x,y,z,clave,cfg,veces,pos}
game.bloques.define('hab:muelle',   { impulso:12 });        // trampolín: u/s verticales al pisarlo
game.bloques.define('hab:muelle',   { altura:4 });          // lo mismo, dicho en bloques de altura
game.bloques.define('arena',        { impulso:12 });        // vale el nombre CORTO si no es ambiguo
game.bloques.define('hab:hielo',    { velocidad:2 });       // ×2 la marcha MIENTRAS se pisa (0.5 = barro)
game.bloques.define('hab:hielo',    { deslizamiento:1.2 }); // hielo de Minecraft: al soltar ASWD sigues rodando
game.bloques.info();      // clave EXACTA de lo que piso / tengo delante / detrás  ← el descubridor
game.bloques.lista(); game.bloques.quitar('hab:muelle'); game.bloques.avisos();
game.bloques.pasoSuave(0.06);   // segundos que tarda el ojo en subir un escalón; 0 = como antes
game.bloques.inercia(0.7);      // segundos que tarda la marcha en bajar al salir de un bloque rápido
game.bloques.define('asset:assets/cabeza.vox.json', { mirar:{ ejes:'xy', limites:{y:[-70,70]}, alcance:12 } });
game.bloques.define('asset:assets/guardian.vox.json', { seguir:{ objetivo:'jugador',   // 'jugador' · [x,y,z] · otra clave
  deteccion:16, distancia:2.5, velocidad:3, correa:24, volver:true, ejes:'xz', suavidad:0.12 } });   // la pieza te PERSIGUE
game.bloques.define('hab:cria', { seguir:{ objetivo:'hab:abeja' } });   // ...o persigue a OTRA pieza (la más cercana)
game.bloques.seguidores();   // quién persigue a quién, cuánto se ha ido del ancla y por qué está parada
game.bloques.recoger();      // todas a su ancla (botón de pánico); no les quita el cfg, siguen persiguiendo
game.bloques.mirones();      // qué piezas están girando ahora y cuánto
// tecla X (rayos-X): cada etiqueta lleva una cuarta línea con su comportamiento y sus giros X/Y/Z
//   …incluido `alImpactar→cambiar antorcha-apagada (1/3)` — el modo, a qué cambia y por qué golpe
//   va ESA celda (REQ-XR2). El hueco lo abre `app.js` (`mcXrayExtra`, app.js:16241) y lo rellena
//   este snippet: el motor no sabe qué comportamientos existen. ⛔ NO se toca `app.js` para esto.
game.bloques.roce(0.08);        // lo que se sigue patinando UNA VEZ FUERA del bloque deslizante
```

### `alRomper` y quien borra SIN pico — `game.bloques.avisoDeRotura(x,y,z)`

`alRomper` (REQ-ROMPE1) lo dispara el envoltorio de **`mcBreak`**, y **el orden importa**: se mira
**antes** de romper (mientras existen la clave y el giro) y se dispara **después** (con el bloque ya
fuera de en medio). Pero **quien borra en masa no pasa por `mcBreak`**: la explosión de
`explosion-tnt` escribe `setVoxel(x,y,z,0)` a pelo dentro de un `beginBatch/endBatch`, así que hasta
`mundo-autoarranque` **v1.40** ningún `alRomper` se enteraba de esos borrados (REQ-TNT1, el dueño el
2026-08-30).

`dispararAlRomper`, `cfgDeClave` y la `tabla` son **privados** de este snippet, así que la puerta la
abre **una sola primitiva**, y devuelve **una función**:

```js
const avisa = game.bloques.avisoDeRotura(x, y, z);   // ANTES de borrar; null si ahí no hay `alRomper`
// … borrar como te dé la gana …
if (avisa) avisa();                                   // DESPUÉS de borrar
```

⚠️ **Que devuelva una función y no una ficha es a propósito** («que sea lo más agnóstico que se pueda
… no tiene por qué conocer los otros snippets, solamente enviarles el evento `alRomper`»). Quien borra
no toca **ni una clave, ni un giro, ni el nombre de otro snippet**: pide el aviso y lo da. Todo el
diff de `explosion-tnt` son 21 líneas y no nombra un solo material.

⚠️ **Cadena.** `tnt` define `alRomper: () => game.snippet('explosion-tnt', …)`, o sea que esto
**enciende la reacción en cadena** (que es lo que se espera). Termina sola porque cada dinamita se
borra *antes* de que su aviso salga, así que ninguna se re-dispara a sí misma; lo que no tiene es tope
de anchura. Si alguna vez se desboca, el tope va **en `mc`**, ⛔ nunca en un closure: cada explosión
encadenada es una ejecución NUEVA del snippet y dos closures no se ven entre sí.

Los dos parches: `herramientas/parche_snp_romper_en_masa.py` (la puerta) y
`herramientas/parche_snp_tnt_alromper.py` (la explosión).

### `alImpactar` — qué pasa cuando algo CHOCA (REQ-IMPACTO1..4)

No es un evento más: es un **despachador**, dice **qué** evento desencadena. Cuatro modos, y los tres
primeros reutilizan eventos que ya existen, así que un snippet colgado de `alCoger` vale igual lo
recojas andando o de un flechazo:

```js
game.bloques.define('asset:assets/farolillo-zen.vox.json', {
  impactos: 3,                    // aguanta 3 flechazos; al 3º desencadena. Por defecto 1
  alImpactar: 'romper',           // 'romper' · 'coger' · 'cambiar' · una función (JS a pelo)
  alRomper(c){ toast('💥 roto de un ' + c.por); } });                      // c.por: 'impacto'

game.bloques.define('asset:assets/antorcha.vox.json', {
  impactos: 2, alImpactar: 'cambiar', cambiaPor: 'antorcha-apagada',       // REQ-IMPACTO4
  alCambiar(c){ toast('🔥 apagada · ' + c.nuevo); } });                     // opcional
game.bloques.cambiar(c, 'antorcha-apagada');        // …y a mano, desde tu propio alImpactar
game.bloques.cambiar(x, y, z, 'antorcha-apagada');  // o por coordenadas: se averigua sola qué hay
```

**`c.por` dice QUIÉN lo disparó** (REQ-IMPACTO3), porque `alCoger`/`alRomper` los llaman varios y
antes llegaban indistinguibles: `'cuerpo'` (te acercaste andando) · `'pico'` · `'impacto'` (con
`info.fuente`, `golpe`, `de`, `punto`) · `'masa'` (un barrido, la TNT) · `'mano'` (`cambiar()`).

**`persistente`** (REQ-IMPACTO2, por defecto `true`) decide si lo que se lleva por delante se va **del
fichero** o **solo de la vista**: con `false` la celda va a la **capa volátil** (`mcPonVolatil`,
`app.js:8152`), que apunta el id original y hace que quien guarde escriba **ése** — al recargar,
vuelve. Dianas de práctica, cristales de un parkour, la fruta de un puzzle que se rejuega.

⛔ **Las tres cosas que cuesta caro romper aquí**, y las tres tienen guardián:

1. **`mcSetBlock` NO REMALLA** (`app.js:8105`). Escribe la celda y marca el guardado, y el chunk
   sigue dibujando el bloque que ya no está: *«sale el toast y no desaparece»*. El pico no lo tenía
   porque `mcBreak` remalla solo. Quien escriba celdas fuera del pico, **`mcRemeshAround`**.
2. **`cambiar` pone ANTES de quitar**, o hay un frame con el agujero a la vista (el dueño lo cazó:
   *«se ve un flash»*). Y ⛔ **`game.stamp` RECREA los objetos de `mc.structures`**: la referencia
   de antes del estampado queda huérfana (`indexOf` → -1) y quitarla no quita nada — quedan las **dos
   piezas apiladas**. La vieja se rebusca por `ox/oy/oz + clave` **después** de estampar.
3. ⛔ **`mcResolveMat` no devuelve 0 para lo que no conoce: devuelve ROCA** (`app.js:21966`), así que
   el `if (!id)` de rigor no salta nunca y la antorcha sale convertida en un cubo de piedra sin un
   aviso. Se pregunta a **`game.addMaterial`**, que resuelve el nombre corto, da de alta si hace
   falta y devuelve el id de verdad. (Y `setVoxel` con un material que aún no está en la paleta no lo
   pone: lo **apunta** para cuando cargue, `mcMatPendiente` en `app.js:22164`.)

⚠️ **`persistente:false` no vale para `cambiar` una ESTRUCTURA**: `game.stamp` acaba siempre en
`mcFlushStamp` (`app.js:22238`) → `mcDirtyHeader()` + `mcScheduleSave()`, o sea que la pieza nueva se
escribe en la cabecera quiera uno o no. En la **rejilla** sí vale. `info()` lo dice con esas palabras.

⚠️ **`define()` tiene lista blanca**: un `alImpactar` que no sea `'romper'`/`'coger'`/`'cambiar'`/una
función no es que no haga nada — **tumba el `define` entero** y el material se queda con lo que
tuviera antes. Por eso avisa por consola, y por eso `'cambiar'` sin `cambiaPor` también avisa.

El contador de golpes vive en **`mc._impactos`** indexado por clave+celda, ⛔ nunca en un closure
(este snippet se reejecuta y curaría solo cualquier cristal a medio romper). Como la clave entra en
el índice, al **cambiar** de material el contador de la pieza nueva empieza en 0 solo.

Parches: `parche_snp_alimpactar.py`, `parche_snp_flecha_impacto.py`, `parche_snp_persistente.py`,
`parche_snp_quien_lo_disparo.py`, `parche_snp_cambiar.py`. Guardianes: `tests/test_alimpactar.js`,
`test_impacto_persistente.js`, `test_quien_lo_disparo.js`, `test_cambiar.js`.

### BUG-SNP4 · la misma casita tenía **dos claves**, y el comportamiento caía en una sola

El síntoma del dueño (2026-08-31): «*no funciona bien el `alRomper`, por eso estuve cambiando entre
"casita" y "asset:assets/casita.vox.json"*» · «*en `test` me funciona, en `empty` no*» · «*he creado
una casa y funcionó, no entiendo por qué ahora funciona*».

**No era intermitente: dependía del mapa.** La misma casita se llama **`hab:casita`** cuando sale de
la paleta (la que se coloca y se rompe) y **`asset:assets/casita.vox.json`** cuando sale del disco (la
que se estampa). `define()` pasa por `resolver()`, que elige **una** de las dos según lo que el mundo
tuviera **puesto al arrancar**:

| mapa | qué encontraba `resolver()` | dónde quedaba el `alRomper` | romper el bloque de la paleta |
|---|---|---|---|
| `/map/test` | `hab:casita` en la paleta → **alias** | `tabla['hab:casita']` | ✅ |
| `/map/empty` | la clave larga ya en el catálogo → exacta | `tabla['asset:…casita.vox.json']` | ❌ |

Y `cfgDeClave()` solo miraba la clave **exacta** (y su base sin `@ori`), así que la otra mitad de la
moneda no encontraba nada. Cambiar el nombre a mano arreglaba un mapa y rompía el otro.

**El arreglo** (`herramientas/parche_snp_alromper_clave_corta.py`): el mismo criterio que `resolver()`
ya usa al **dar de alta** se aplica también al **buscar** — si la clave exacta no está, se mira por
**nombre corto** (`hab:casita` y `asset:assets/casita.vox.json` son los dos «casita»). Solo cuando ese
nombre corto lleva a **un único** comportamiento; si dos materiales distintos lo comparten con
configuraciones distintas, el atajo se apaga y se busca como siempre. Índice `porCorto`, que
`reconstruirCache()` invalida. **Ahora las dos formas de escribirlo funcionan en todos los mapas.**

De paso: `'castillo'` y `'tnt'` **a secas** valían para dos materiales (`hab:…` y `asset:…`) y ante la
duda `define()` abortaba ⇒ en `/map/empty` **ninguno de los dos tenía comportamiento**, callado. Van
con la clave entera; el nombre corto cubre la otra forma.

### BUG-SNP8 · el nombre corto que promete la ficha (`espada`) no activaba nada

Síntoma del dueño (2026-09-03): la ficha de `assets/espada-de-diamante.vox.json` anuncia tres nombres
—`espada` (corto), `espada-de-diamante` (id) y «espada de diamante» (rótulo)— y el comportamiento
solo se activaba con la clave entera.

**Hay DOS resolvedores de nombres y solo uno sabía de alias.** El del motor, `mcClaveDeNombre`
(`web/app.js:9308`), mira la paleta → `mcAssetsRegistry` (el índice cargado de `assets/index.json`,
que es **donde vive el alias**) → y de último cae en `'hab:'+nombre`. El de este snippet,
`resolver()`, se fabricaba el suyo partiendo la clave por `:` y `/`: de
`asset:assets/espada-de-diamante.vox.json` sale `espada-de-diamante`, **jamás `espada`**. Así que la
ficha decía la verdad para `setVoxel` y mentira para `game.bloques.define`.

**El arreglo** (`herramientas/parche_snp_alias_bloques.py`): `resolver()` le pregunta al motor. Las
dos condiciones son el arreglo entero:

- Va **después** de los dos caminos de `cand` y **antes** de las pistas, así que clave exacta, nombre
  corto único y nombre corto ambiguo se comportan exactamente como antes.
- ⛔ **Solo se acepta si la clave está en la paleta del mundo.** `mcClaveDeNombre` contesta
  `'hab:<lo que sea>'` a cualquier nombre que no conozca; darlo por bueno convertiría **cada errata
  en una clave válida** y mataría en silencio los avisos de BUG-SNP1 y BUG-SNP2.

⚠️ **Al tocar `resolver()`, ni un `}` en la columna 4** (ni en la 2): `tests/test_material_familia.js`
extrae esa función **verbatim por texto** y la corta por el primer `\n  }\n`. Un `if (…) { … }` de
varias líneas la parte en dos y el `vm` casca con «Unexpected end of input» — la misma trampa que
`mcFineBoxHit` con `test_rayo_apuntado.js`. Por eso el `try` y el `if` van en una sola línea.
Guardián propio: `tests/test_alias_bloques.js`.

Todo vive en el snippet **`data/snippets/mundo-autoarranque.json`** (el JSON *es* la fuente; se edita
con Alt+C o reempaquetando el `code`, como `base-npc-skills.json`). Claves del diseño:

- **Lo que es de UN mapa va en `mundo-<mapa>`, no aquí** (REQ-ARR1). `mundo-autoarranque` es **uno
  solo para todos los mapas**, así que un `define` que solo tiene sentido donde esa pieza está puesta
  —`mirar`, que necesita una **estructura** viva con esa clave— se ejecutaba también en un mapa vacío
  y llenaba la consola de avisos correctos pero inútiles. `mcAutoarranqueMapa` (`app.js`) corre
  **`mundo-<mapa>`** (`mundo-default`, `mundo-lab`…) **justo después** del global y con las mismas
  reglas: hereda todo lo que aquél dejó puesto y solo añade o pisa lo suyo. Que no exista es el caso
  normal y **no se avisa**; que falle se avisa y es inocuo. ⚠️ **No confundir con `arranque-<mapa>`**,
  que es la **intro** y solo la dispara `?intro=1` ([`osd-e-intro.md`](osd-e-intro.md)).

- ⚠️ **El autoarranque corre UNA VEZ, en la primera entrada al mapa** (REQ-SNP7, 2026-08-20). Antes,
  `openWorld()` lo relanzaba también al volver del editor 2D/3D (Alt+C y vuelta), y eso no es arrancar:
  es plantar otra vez lo plantado y montar otro bucle encima del que ya corre. Lo que un snippet
  necesite hacer **al volver** —repintar su HUD, releer un ajuste— lo registra al arrancar:

  ```js
  game.alVolverAlMundo('mi-menu', () => { pintaHUD(); });   // clave propia, como game.bloques.define
  game.alVolverAlMundo('mi-menu', null);                     // darse de baja
  ```

  La **clave** es lo que hace que reejecutar el snippet a mano REEMPLACE su callback en vez de
  encadenar otro. Fallar es inocuo (se avisa por consola): un menú roto no puede impedirte volver al
  Mundo. Guardián: `tests/test_snp7_vuelta_sin_recargar.js`. Lo que ya estaba montado **sigue vivo**:
  `closeWorld()` solo pausa (`mc.active=false`), no tira la rejilla ni el contexto GL.
- **Caché densa `id → cfg`** invalidada por `mc.blockKey.length` (mismo truco que `mcXnameCache`,
  `app.js:5429`) ⇒ la consulta por frame es un índice de array.
- **Una sola costura**: envoltorio sobre `mcUpdate` (`app.js:5053`, única llamada en `app.js:6323`).
  Reejecutar el snippet **desenvuelve el anterior por `mcUpdate._orig` y reinstala el nuevo**; ni se
  apilan envoltorios (duplicaría la velocidad de trepado) ni se deja el viejo. Dejarlo puesto era peor
  de lo que parece: el envoltorio viejo sigue leyendo **su** tabla por closure, así que todo lo que se
  definiera después salía en `lista()`/`info()` y **no hacía nada en el mundo**. Al reinstalar, las
  definiciones anteriores se heredan pasándolas otra vez por `define()` (se renormalizan con el código
  actual). Si cambias el snippet, **sube `VERSION`**.
- **`mcSolid` NO se parchea** (lo usan mallado, raycast y romper/poner): la escalera es **sólida** y
  se sube *pegado* a ella ⇒ una escalera embutida en un hueco de 1×1 no se puede trepar.
- **Barrido acotado, no punto suelto**: desde el borde del cuerpo hacia delante, en pasos de **un
  voxel fino** hasta `ALCANCE` (0,45) — un panel fino de 1/16 casi nunca cae bajo un sondeo de un
  solo punto. El coste es **lineal** con `playerScale` y está topado (≤64 muestras); NO barrer el
  AABB del jugador, que crece con `playerScale³` (lección de la colisión fina).
- **Se sondea la COLUMNA ENTERA del cuerpo, no una altura fija.** `escalera.json` es una escalera de
  verdad: largueros en los bordes y peldaños solo en 2 de cada 4 filas, o sea **aire a la altura del
  pecho** en la mayoría de las alturas. Sondeando una sola altura solo se agarran los largueros — el
  dueño lo reportó como «sube por los laterales pero no por los escalones». `trepableEnColumna`
  recorre de los pies a la cabeza y se agarra al primer material trepable que encuentre, así que la
  **forma del dibujo deja de importar**. Es también lo que permite coronar: sondeando solo al pecho,
  el agarre se pierde con los pies 0,9 por debajo del remate, más de lo que sube el auto-escalón.
- **Soltar la tecla NO suelta la escalera**: sin `W`/`S` uno se queda **colgado** donde estaba, como
  en Minecraft. Caerse al dejar de pulsar (reportado por el dueño) obliga a subirlo todo de una
  tirada y convierte cualquier pausa en una caída desde lo alto. Solo sostiene a quien **ya venía
  agarrado**, para no enganchar a quien está de pie al lado; y si la física original encontró suelo
  (`mc.onGround`) se suelta, para no dejarlo flotando a un pelo del piso sin poder saltar.
- **Soltarse siempre tiene que ser posible**, o el jugador se queda pegado (reportado por el dueño).
  Bajando con S se anula la componente que despega de la escalera **solo mientras se está colgado**;
  en cuanto hay suelo debajo se suelta el agarre entero y se anda normal. Y el **espacio** es la
  salida de emergencia: estando agarrado `mc.onGround` es `false`, así que el salto de `app.js` no
  puede dispararse nunca y hay que reproducirlo en el snippet (por flanco, para no reimpulsar).
- El sondeo va **partido en dos** alrededor del `mcUpdate` original (`sondearAgarre` antes,
  `aplicarTrepado` después). Anular la gravedad *después* de aplicada pierde `22·dt²` por frame ⇒ la
  velocidad de trepado dependería de los fps (a 30 fps, el doble de pérdida que a 60).
- **Agarrado, el mando horizontal tiene que ser el de TIERRA** (BUG-ESC1). `mc.onGround=false` mientras
  cuelgas no es solo «no piso nada»: `app.js:7433` reparte el mando horizontal por ese mismo booleano
  —con suelo la velocidad se **reescribe** desde las teclas cada frame (y es 0 exacto sin teclas), sin
  él se va al **air-strafe**, que no la reescribe y no tiene rozamiento—, así que colgado la velocidad
  lateral con la que llegaste a la escalera se conservaba **entera** y te sacaba de ella sin tocar una
  tecla. El envoltorio fuerza `mc.onGround=true` **solo durante `orig(dt)`**; el `onGround` de verdad lo
  siguen decidiendo la física y `aplicarTrepado`. Saltar de lado desde la escalera **no se pierde**:
  con espacio pulsado `sondearAgarre()` devuelve `null`, o sea que no hay agarre y esto no corre.
  ⚠️ **Un `onGround` que sea solo un dato para ti puede ser un `if` para `app.js`** — antes de dejarlo
  puesto, mirar quién más lo lee.
- Se sondea **hacia donde MIRA el jugador**, también al bajar (con S se mira igualmente la escalera);
  sondear hacia atrás mira aire y «bajar» pasa a ser caída libre disfrazada.
- **`alPisar` es por flanco**, como `onEntityCollision` de Minecraft, en `try/catch` con aviso acotado
  — nunca una línea por frame (§22). La identidad del flanco es **celda + clave de lo pisado**, no
  solo la celda: una placa fina de 1/16 no cambia la celda de debajo al caer sobre ella.
- **`impulso` = trampolín estilo Quake**, y es *exactamente* el salto de `app.js:5090` (fijar
  `mc.vel[1]` + `mc.onGround=false`) pero sin pulsar espacio y con la fuerza que diga el material. Va
  por el mismo flanco que `alPisar`, así que se dispara al **entrar** en la celda, no cada frame, y
  rebota solo al volver a caer encima. Unidades: **u/s verticales** (el salto normal son `8.0`);
  `altura:N` es azúcar y se convierte con `v = √(2·g·h)`, `g = 22` ⇒ la altura sube con el **cuadrado**
  del impulso (`h = v²/2g`), doblar la fuerza cuadruplica el salto. Escala `∝√escala` como la marcha y
  el salto. La **inercia horizontal es gratis**: `app.js` conserva `vel[0]/vel[2]` intactos mientras no
  haya suelo, así que sales despedido con la velocidad que llevabas — pero eso depende de
  `game.airControl`; apagado, `define` avisa de que el tiro parabólico se convierte en salto vertical.
- **`define` acepta el nombre corto**: sin namespace, sin carpeta y sin extensión (`arena` →
  `asset:assets/arena.vox.json`, `escalera` → `hab:escalera`), y dice por consola cuál ha elegido. Lo
  que **registra** es siempre la clave larga, que es la que traen los voxels. Si el nombre corto vale
  para dos materiales **no elige**: enseña los candidatos y no registra nada. `quitar` entiende lo
  mismo.
- **Lo que todavía no está en el mundo ESPERA; lo que está mal escrito avisa.** La paleta
  (`mc.blockKey`) solo lleva lo **colocado** + la hotbar + los 6 de serie, así que en `/map/empty` casi
  todo lo que define el arranque «no existe» — y rechazarlo era doblemente malo: once `console.warn`
  con traza ahogando el informe de carga, y la config **tirada** (colocar el material después ya no le
  devolvía su comportamiento). La regla ahora es una: si la clave **se parece** a una de la paleta
  (subcadena, o distancia de edición ≤1 en nombres cortos y ≤2 desde 8 letras) es un typo ⇒ warn con la
  sugerencia; si **no se parece a nada** ⇒ se guarda **cruda** en la lista de espera, sin normalizar, y
  se vuelve a pasar por `define()` sola cuando el material aparece. La promoción cuelga de
  `reconstruirCache()` y solo corre **si la paleta cambió de tamaño**. Se anuncia con un `console.log`
  por **tanda**, no por material. Lo que espera sale en `lista()` y en `game.bloques._pendientes()`, y
  `quitar()` también lo cancela. ⚠️ Un `define` que **sí** entra borra la espera del mismo material,
  comparando por clave **resuelta** (`ladrillo` vs `hab:ladrillo`): sin eso, promover una espera vieja
  pisa la definición nueva, y `quitar()` cree que el material *solo* espera y deja puesto lo de la
  tabla. Se aplica con `parche_snp1.py` (idempotente) porque este snippet **no tiene fuente en el
  repo**. Tests: `test_materiales_en_espera.js` (navegador, `/map/empty`) y
  `test_bloques_comportamiento.js`.
- **`velocidad` es CONTINUO, no un disparo por flanco** como `alPisar`/`impulso`: manda mientras el pie
  esté encima. Al salir, la marcha **no se corta en seco**: decae con `exp(-dt/τ)`, `τ` = `game.bloques
  .inercia(0.7)` s (`0` = como antes). Sin eso, **un solo bloque** de suelo normal entre el hielo y un
  trampolín te hacía llegar a marcha base (medido: 10 → 5 en un frame; con inercia, 9,4), que es como
  lo reportó el dueño: «llega al bloque impulso y pierde la velocidad». Es inercia de **rapidez, no de
  patinaje**: soltar las teclas sigue parando en seco, porque en el suelo `app.js:5089` pone `vel=0`
  cuando no hay dirección. El estado (`mc._velInercia`) vive en `mc`, así que **se arrastra entre
  pasadas de un test**: hay que reponerlo a 0 igual que `_pasoDesfase`. Se implementa poniendo **`mc.speed`**
  a pelo justo antes del `mcUpdate` original y restaurándolo en un `finally`, porque `app.js:5060` lo
  lee **una vez por frame** y de ahí salen tanto la marcha en el suelo como la aceleración en el aire.
  **NO se toca `game.playerSpeed`**: ese setter **persiste en `localStorage`**, así que un bloque le
  cambiaría la marcha al jugador para siempre. El producto se topa a **40 u/s** (el mismo techo que el
  setter): más rápido que eso y un frame de 1/60 avanza ~0,7 bloques, más que la media anchura del
  cuerpo ⇒ se atraviesan paredes. `define` avisa si el factor pide más de ese techo. Como el factor
  vive en el material, `velocidad:0` **no existe** — se dice `quitar(clave)`; tratar el 0 como «sin
  valor» es lo que mantiene `define` idempotente cuando el snippet se reejecuta y hereda la tabla ya
  normalizada. La inercia es marcha **llevada**, así que **pararse del todo la gasta**: si estás en el suelo
  sin tecla de rumbo y sin derrape, se pone a 0 en el acto. Antes decaía por **reloj** aunque estuvieras
  quieto, y con `×10` (recortado a 40 u/s) tardaba ~3 s: parabas, volvías a pulsar W y arrancabas a **×4,96**
  la marcha normal habiendo parado antes.
- **`deslizamiento` es lo otro: patinar al SOLTAR las teclas** (el hielo de Minecraft), y es *ortogonal* a
  `velocidad`/`inercia` — aquéllas cambian cuánto corres, ésta qué pasa cuando dejas de pilotar. **No se
  puede hacer dejando puesta `mc.vel`**, y ahí está el motivo de que sea la única parte de la librería que
  mueve al jugador a mano: en el suelo `app.js:5094` **reescribe `vel[0]/vel[2]` cada frame** desde las
  teclas y sin teclas los pone a **0 antes de mover**, así que cualquier velocidad que dejemos puesta se
  borra al frame siguiente sin haber avanzado nada. Por eso `deslizar(dt)` corre **después** del `mcUpdate`
  original: guarda la marcha llevada en `mc._deslizVel`, la decae con `exp(-dt/τ)` (igual a 30 que a 120 fps)
  y avanza con el **mismo `mcMoveAxis`** que usa `app.js`, para que muros y auto-escalón se comporten
  idéntico; si un eje no se movió, se anula esa componente. `τ` = los segundos del propio bloque mientras lo
  pisas, y `game.bloques.roce(0.08)` **una vez fuera** (sales patinando, no flotando). **Con una tecla de
  rumbo pulsada no se conduce nada**: `app.js` ya movió al jugador ese frame, así que empujar además lo
  movería **dos veces** — se notaba como un acelerón (×1,56 medido) al salir de una pista rápida con W
  puesta. Patinar es lo que pasa **cuando sueltas**, no un extra que se suma a andar. En el aire **no toca
  nada**: `app.js` ya conserva la inercia horizontal él solo, solo sigue el vector para retomar el derrape al
  aterrizar. La marcha llevada solo se **crea** encima del bloque y se apaga por debajo de 0,05 u/s, así que
  andar normal queda exactamente igual (medido: tras soltar ASWD, 0,773 de los 0,833 de un tramo a marcha
  entera con `deslizamiento:1.2`; **0,000** sin él). Colgado de una escalera no se patina. `mc._deslizVel`
  vive en `mc` — mismo cuidado que `_velInercia`: **reponerlo a `null` entre pasadas de un test**.
- **`pasoSuave` sube el ojo, no el cuerpo.** `app.js` sube los escalones **de golpe** dentro de un
  frame (`mcMoveAxis`: `p[1] += h`, hasta `MC_STEP=0.6`), y en una escalera de peldaños de 8 voxels
  eso se ve como saltos de y+0,5. Se tapa como en Minecraft: **la física no se toca** (misma colisión,
  mismo alcance de escalón, mismo tacto) y solo se **pinta** al jugador un poco más abajo, desfase que
  se consume en ~0,1 s. Mecánica: el ojo se calcula en **seis** sitios de `app.js` a partir de
  `mc.pos[1]`, así que el desfase se **resta al salir** del frame y se **repone al entrar** en el
  siguiente — entre medias solo hay dibujado. Se repone la y **guardada**, no `pos[1]+desfase`: sumar
  y restar no devuelve el mismo float y ese pelo acabaría en la colisión (el test compara los 90
  frames con `===`). Decae con `exp(-dt/τ)`, o sea igual a 30 que a 120 fps, y se recorta a un escalón.
  **El escalón se mide dentro de `mcMoveAxis`** (segundo envoltorio del snippet), porque ahí el único
  efecto sobre la `y` es el `p[1]+=h` del auto-escalón y sus dos únicos llamantes son las dos líneas
  horizontales de `mcUpdate`; así saltar y trepar no se cuelan sin necesidad de ninguna heurística.
  **No se puede deducir al final del frame preguntando `mc.onGround`**: en `app.js:5089-5098` la
  gravedad va **antes** del horizontal, así que el frame del escalón acaba con `vel[1]=0`,
  `ny === p[1]`, sin colisión y con **`onGround` false** — una guarda de «estar en el suelo» se apaga
  justo en el único frame que hay que suavizar. El estado vive en `mc`
  (`_pasoDesfase`/`_pasoReal`/`_pasoY`/`_pasoSubido`), no en un closure, para
  que reejecutar el snippet herede el desfase en vez de dejar al jugador medio bloque hundido; si la
  `y` no es la que se pintó, alguien movió al jugador (`game.tp`, respawn, un `alPisar`) y el desfase
  se tira.
- **`mirar` gira la pieza hacia algo, y es lo ÚNICO de la librería que necesitó tocar `app.js`.** Los
  `rot` del mundo son de **90° en 90°** y cada paso se **hornea en su propia malla**
  (`mcStructGeom`, cacheada en `mc.structs[srcKey].meshRot[rot]`): girar así es un tirón y encima
  recompila geometría. Por eso el giro continuo va **encima**, como matriz por instancia. El reparto
  es el mismo que con `mc.sunExtra`: **`app.js` expone la capacidad, el snippet decide el
  comportamiento** — `app.js` no sabe qué es `mirar`, solo aplica `s.model` si está.
  - Lo que se añadió a `app.js`: `uniform mat4 uModel` en los **dos** programas de estructura
    (`MC_STRUCT_VS` y `MC_STEX_VS`) y en la pasada del sol; `mcModelOf(s)` (identidad si no hay
    matriz) puesto **siempre** antes de cada `drawArrays` de estructura, porque el uniform es estado
    y si no se pone se hereda el de la instancia anterior. `vWorld` pasa a ser la posición **ya
    transformada**, o sea que la búsqueda de sol/sombra sigue al giro.
  - **Culling:** `s.aabb` se calculó de los vértices, que van en **coordenadas de mundo y sin girar**,
    así que una pieza rotada se sale de esa caja y el frustum la borraría al asomar por el borde.
    `mcStructVisible` infla: centro pasado por la matriz **± la semidiagonal** (vale para cualquier
    giro). Sin `s.model` llama a `mcChunkVisible` tal cual: mismo coste de siempre.
  - **Sombra:** una pieza que gira **no cambia ni un vértice**, así que sin más su sombra se quedaba
    clavada en la pose horneada. La matriz entra en la firma de **movimiento** (no la de geometría):
    se re-hornea a ~22 Hz, igual que los agentes que andan.
  - **Lo que NO gira, a propósito:** la **colisión** (el bitset se horneó con la orientación de `rot`:
    sigues chocando con la pose original — da igual para una cabeza en un pedestal, no para un puente
    giratorio) y el **sombreado por cara**, que también viene horneado, así que la cara iluminada gira
    con la pieza.
  - **Solo estructuras, y eso no se ve en el prefijo**: el mundo del dueño está lleno de estructuras
    `hab:` (`hab:cubo-trans`…). Se valida mirando si hay alguna instancia viva con esa clave, no por
    `asset:`. Un material de terreno está fundido en la malla de su chunk junto a miles de celdas.
  - `limites` se mide **desde la orientación de origen**: el motor descuenta el cuarto de vuelta ya
    horneado en `rot` (`yaw = rot&3`), y el sentido del giro es el de `mcRotXZ` para que la capa
    continua y los pasos horneados vayan en la misma dirección. `frente` corrige en grados si el
    dibujo no mira hacia `-Z`.
  - **Dejar de mirar tiene dos motivos y los dos acaban igual: volviendo despacio a la pose de
    origen** y **soltando la matriz** (`model = null`), para que `app.js` recupere su camino de
    siempre. Uno es salirse de `alcance`; el otro es **no poder girar tanto** — si el ángulo pedido
    se sale de `limites`, la pieza se **rinde** en vez de quedarse clavada en el tope, que es la
    postura de un maniquí mirando a la pared (el dueño lo reportó así: se le ponía detrás y la cabeza
    se quedaba en `-70,00°` para siempre). O sea que `limites` es un **cono de atención**, no un
    recorte: dentro se sigue al objetivo con el ángulo exacto, fuera se vuelve a casa.
  - El **cabeceo** al tope **no** cuenta como rendirse: llegar al límite del cuello mirando hacia
    arriba es seguir mirándote, y si contara, pegar un salto apagaría la cabeza entera de golpe.
  - **El pivote elige por dónde se engancha.** Sin él se gira sobre el centro de la caja, que en una
    pieza de dos bloques cae en el **codo** y no en el **hombro** — así lo reportó el dueño con
    `brazo.vox.json`. Se dice de tres maneras, y **el literal gana** por ser lo más concreto:
    - **`pivote: 2`** = el nº2 de los **DIBUJADOS con la herramienta 📍** del editor (ver abajo). Sin
      poner nada se usa **el primero que haya dibujado**, así que lo normal es no escribir la línea.
    - **`pivote: 'auto'`** = el de la cara por la que **esa instancia** está pegada a algo (abajo).
    - **`pivote: [x,y,z]`** a mano, en **coordenadas del objeto** (bloques desde su esquina; 1 bloque
      = 16 voxels del dibujo).
    - Va en coordenadas del objeto y **no** del mundo porque la tabla es por MATERIAL: hay que
      deshacer el `rot` (con `rot` impar los lados X y Z de `s.aabb` salen intercambiados) para que
      una sola línea sirva estampes la pieza donde la estampes. Salirse de la caja vale: un hombro
      puede caer en el cuerpo. El culling no necesita nada: `mcStructVisible` pasa el centro **por la
      matriz**, que ya lleva la traslación del pivote.
    - El dibujado **no se puede resolver en `define()`**: es síncrono y el JSON del objeto viaja por
      red. Se pide con `getRoomData(clave)` y se le pone el `piv` a la config que **ya está viva**, o
      sea que la pieza arranca girando sobre el centro de su caja y se recoloca sola en el primer
      frame que haya datos. Si el objeto no trae ese pivote, avisa **solo si se pidió por número**
      (no ponerlo significa «si lo hay»).
    - ⚠️ **Con `ejes:'y'` la altura del pivote no se nota.** El giro es sobre la vertical **del
      pivote**, y todo punto de esa vertical queda fijo: subir el enganche de un brazo que cuelga no
      mueve ni un voxel. El pivote alto solo se ve cuando hay **cabeceo** (`ejes:'xy'`).
  - **`pivote: 'auto'` — manda la cara por la que la pieza está PEGADA.** La tabla es por MATERIAL,
    pero contra qué está pegada cada pieza es cosa de la **instancia**: el `brazo.vox.json` del dueño
    lleva sus dos pivotes en **caras opuestas** (x=15 y x=0) justo porque el mismo brazo se estampa a
    un lado o al otro del cuerpo y tiene que colgar del hombro **que toca**. Con `'auto'` se mira
    contra qué está pegada cada una y se coge el pivote de esa cara; **si no toca nada por una cara
    con pivote, cae al nº1** (o sea, lo mismo que no poner nada). Reglas y por qué:
    - Un pivote **pertenece a la cara más cercana** del bbox del dibujo (sin umbral: siempre hay
      respuesta, y para uno dibujado en el borde la distancia es 0). Varios en la misma cara: manda
      el de **menor número**.
    - Con **varios contactos gana el de más superficie pegada**; a igual superficie, **abajo → lados
      → arriba** (`PRIO_CARA`). Una cara pegada **sin pivote dibujado no cuenta**.
    - **La normal con la que se estampó NO se guarda**, así que el contacto se deduce del mundo:
      se sondea **medio voxel fino más allá del plano** de cada cara, no el centro de la celda
      vecina — un panel de 1/16 pegado a ras ocupa 1/16 de su celda y desde el centro no se ve. Va
      por `materialEn`, o sea que también detecta **estructuras finas** (pegarse al cuerpo de un NPC).
    - ⚠️ **`rot` no son solo cuartos de vuelta**: lleva además un **vuelco** y (desde BUG-ROT1) un
      **roll**, y con ellos el «abajo» del dibujo puede acabar tocando **de lado**. La cara
      objeto→mundo se convierte por el mismo camino que `mcStructGeom` (roll, vuelco y luego giro), y
      las tres se sacan de `mcOriParts(rot)` — **nunca abriendo los bits a mano** (`(rot>>2)&3` era el
      vuelco cuando solo había 16 posturas y hoy elige el pivote equivocado a partir de `@16`).
    - **Se resuelve UNA vez por instancia** y se cachea **en la instancia** (nunca en una lista
      aparte: `mcRestampAll`, ver abajo). Si cambia el **mundo** (rompes el suelo bajo una pieza),
      `game.bloques.repivotar()` lo vuelve a abrir; si cambia la **config**, `define()` ya lo olvida
      solo — sin eso, redefinir el brazo con `'auto'` en la consola no movía ni una pieza y parecía
      que la opción no existía (salió en el Mundo de verdad, no en el de juguete).
    - Rayos-X lo dice por instancia: `· pivote nº2 (pegada por -X)` o `(por defecto: no toca nada)`.
      Sin eso, dos piezas del mismo material girando distinto se leen como un fallo.
  - **`pivotes: { 1:{…}, 2:{…} }` — giros y límites propios de CADA pivote.** Lo de fuera es la base
    y cada bloque la pisa, así que lo común (`objetivo`, `alcance`…) se escribe **una sola vez**.
    Cada variante se normaliza con la misma función, o sea que valen todas las claves y todos los
    avisos. Es lo que permite que el hombro nº1 tenga un cono cerrado y el nº2 uno abierto **sin
    duplicar el material**. Pedir un bloque para un pivote que el dibujo no trae avisa y dice con qué
    herramienta ponerlo.
    - ⚠️ Reejecutar el snippet **re-define cada material desde la tabla YA NORMALIZADA** (el bloque
      `heredado` del final), así que `normalizarMirar` tiene que **saber leerse a sí misma**: además
      de `pivote`/`limites` ya lo hacen `vars` (los bloques por pivote), `frenteX` y `senX/senY`. Sin
      eso lo escrito en la consola **se degrada solo** al recargar y la pieza cambia de postura sin
      que nadie haya tocado nada.
  - **`mirar` apunta la CARA de la pieza (su `-Z`), no su eje largo**, y eso invierte el cabeceo de
    todo lo que apunta con el eje largo. Un brazo que cuelga apunta hacia **`-Y`**: el mismo cabeceo
    que le sube la cara a una cabeza le **aparta la punta** al brazo, así que con el jugador por
    debajo del hombro (el caso normal, andando por el suelo) el brazo se iba hacia atrás — el dueño
    lo reportó así. Se arregla con **`sentido: { x:-1 }`** (y `{ y:-1 }` espeja el giro). Es un
    signo, no un parche a un caso: invierte los dos lados.
    - ⚠️ Pero `sentido` **inclina, no apunta**: la pieza se ladea tantos grados como la elevación del
      objetivo, o sea **casi nada de lejos y un barrido de golpe al acercarse** (medido en el mundo
      del dueño andando hacia el brazo: cabeceo de −5° a 11 bloques → +64° a 1 bloque). Así lo
      reportó: «al acercarme el brazo gira y entonces ya apunta».
  - **`frente: { x:-90 }` es lo que separa APUNTAR de INCLINARSE.** `frente` (que ya existía como
    número para el giro) pasa a admitir `{ x, y }`: son los grados hacia los que **ya apunta el
    dibujo**, para descontarlos. Una pieza que apunta con su **eje largo** — brazo, cañón, aguja —
    apunta hacia abajo, o sea `{ x:-90 }`, y entonces el cabeceo que sale es `elevación + 90°`, que
    es el que la deja apuntando **a cualquier distancia** (medido: desvío 0° de 11 a 1 bloque). Con
    esto `sentido` sobra para el brazo; el número suelto sigue significando el giro de siempre.
    - Los `limites` se miden desde la pose de origen, así que con `frente:{x:-90}` el `x:[-90,90]` de
      serie deja la pieza sin poder pasar de la horizontal: para que se levante hay que abrirlo
      (`limites:{ x:[-90,180] }`). Con ese `frente` el cabeceo se lee así: **0 = colgando, 90 =
      horizontal, 180 = tieso hacia arriba**.
    - ⚠️ **`frente.x` tiene que ser el HONESTO, no el que "queda bien".** El dueño lo tuvo en `-180`
      y el brazo parecía apuntar: en realidad el cabeceo pedido era `elevación+180` (90..270), o sea
      **siempre pinzado en el tope de arriba**, clavado en la horizontal a cualquier distancia y con
      `limites.x[0]` que no llegaba a tocarse nunca (su «xmax sube el brazo, xmin no parece ir»).
      Medido: con `{x:-180}` el cabeceo vale 90° a cualquier altura del jugador; con `{x:-90}`, 59°→90°.
  - **`sinVolteo: true` para piezas ESPEJO (dos brazos con `rot` opuesto).** Una misma dirección se
    apunta con **dos** posturas — `(giro, cab)` y `(giro+180, 180−cab−2·frenteX)` — y dejan la punta
    exactamente igual. Por defecto se coge la primera, que es la natural para una cabeza; pero dos
    piezas iguales puestas con `rot` opuesto acaban las dos en la **misma orientación absoluta**, así
    que una tiene que **darse media vuelta sobre sí misma** para llegar: el dueño lo reportó como «el
    brazo izquierdo gira por la espalda y acaba con los dedos del revés». Con `sinVolteo` se elige la
    postura que **menos gira** sobre su eje vertical y lo que sobra sale por el cabeceo, que es lo que
    hace un hombro: el brazo espejo se queda con el giro casi a cero y **sube por delante**, el mismo
    movimiento que el otro. Detalles que no son opcionales:
    - Exige `ejes:'xy'` (sin cabeceo no hay con qué compensar la media vuelta) y **el `frente.x`
      honesto**, porque la postura alternativa se calcula con él.
    - El cabeceo se **pinza con `limites.x` ANTES** de convertirlo, para que `x:[30,90]` signifique
      «cuánto levanta el brazo» en los dos y no una cosa y su negativa.
    - **Banda muerta 80/100°** en vez de 90 pelado: en la frontera las dos posturas son igual de
      válidas y sin histéresis plantarse ahí hace **aletear** la pieza. Rayos-X marca con **`↺`** la
      instancia que está en la otra postura (si no, un cabeceo negativo parece un error).
  - **El cabeceo va sobre el eje izquierda-derecha DE LA PIEZA, no sobre el X del mundo.** La matriz
    es `Ry(giro)·Rx(cabeceo)·Ry(-horneado)`: hay que **deshacer** el cuarto de vuelta ya horneado en
    `rot`, cabecear, y volver a ponerlo. Con el `Rx` a secas solo acierta la pieza estampada sin
    girar — a media vuelta cabecea **al revés** (el dueño lo reportó como «salto y la cabeza mira
    hacia abajo») y de perfil no cabecea nada, **rueda de lado**. El **yaw** no lo delata porque gira
    sobre el mismo eje que lo horneado y los dos conmutan, así que el bug se esconde hasta que se usa
    `ejes:'xy'`. Al probarlo hay que aplicar la matriz a la **cara ya horneada**, no a `(0,0,-1)`:
    contra `-Z` el error se cuela entero.
  - **NO se puede cachear qué piezas miran.** Al terminar de cargar, `mcRestampAll` desestampa y
    vuelve a estampar **cada** instancia (`splice` en `app.js:5772` + `push` en `app.js:6096`): el
    array de `mc.structures` es **el mismo**, tiene **el mismo número** de elementos, y **ni uno**
    es el objeto de antes. Ninguna firma barata lo ve (ni el recuento, ni la identidad del array —
    las dos se probaron y las dos fallan), así que una lista cacheada acaba poniéndole la matriz a
    instancias **muertas**, que ya no se dibujan: el dueño lo reportó como «la cabeza no me mira al
    cargar, solo si reejecuto el snippet». Se recorre `mc.structures` entera cada frame, que al lado
    de lo que ya hay sale gratis: `mcRender` la recorre **cuatro veces por frame** solo para cullear.
- Solo afecta al **jugador**; los agentes siguen con su `climb`/`drop`.

---

## Movido verbatim desde CLAUDE.md el 2026-08-30

(Minimización de `CLAUDE.md` pedida por el dueño; arriba queda la regla y el enlace.)

`game.bloques.define(clave, cfg)` cuelga del **MATERIAL**, nunca del voxel (1 script/voxel = 442 368
closures en 96×48×96). Vive entero en `data/snippets/mundo-autoarranque.json`; `app.js` solo expone la
capacidad. `game.bloques.info()` = descubridor de la clave EXACTA de lo que piso / tengo delante.

- **2 autoarranques y el global corre en TODOS los mapas**: `mundo-autoarranque` + justo después
  `mundo-<mapa>`. ! `arranque-<mapa>` es otra cosa: la **intro**, solo con `?intro=1`.
- **1 sola costura** = envoltorio sobre `mcUpdate`; reejecutar **desenvuelve el anterior por
  `mcUpdate._orig`** (apilar duplica la velocidad de trepado). **Si lo cambias → sube `VERSION`**. Estado
  en `mc` (`mc._parkour`, `mc._deslizVel`…), ⛔ nunca en closure.
- **El snippet se PARCHEA, no se reescribe** (dueño lo edita en vivo, **2 copias vivas**):
  `parche_snp_*.py` idempotente, ancla única, **aborta si el ancla no aparece exactamente 1 vez**.
