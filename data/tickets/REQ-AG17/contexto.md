# REQ-AG17 · contexto y medidas

**Enunciado del dueño:** «un agente no debería meterse en el espacio de otro, debería empujarlo como
mucho procurando detenerse cuando el otro agente no le deje pasar.»
**Acotación posterior:** «REQ-AG17 solo para `game.esqueletos`; implementar.»

## Dónde vive esto

`data/snippets/mundo-autoarranque.json` (el snippet de las DOS copias vivas — se parchea con un
`herramientas/parche_snp_*.py` idempotente, nunca se reescribe entero).

- `esqueletosPaso(dt)` — línea ~2799. El bucle por rig.
- `pasoSeguir(s, a, g, G, dt, hay, tx, ty, tz, F, ciego)` — línea ~1769. **Aquí** se decide el paso.
  La resuelve **eje a eje** para que un muro que para la X deje pasar la Z.
- `solapaJugador(a, dx, dy, dz)` — línea ~1696. Es **el patrón exacto** a copiar: «si el paso metiese
  la pieza dentro de tu caja, no se da».
- `asentar(s, a, g, xPrev, zPrev, drop)` — línea ~1918. Pega la pieza al suelo.

Los esqueletos andan en modo **`ejes:'xz'`** (por defecto, línea 758), que es la rama de
`pasoSeguir` que **no llama a `chocaMundo`**: delega toda la validación en `asentar`.

El diseño actual dice explícitamente lo contrario de lo que pide el ticket, en el comentario de
`chocaEstructura` (línea ~1673):

> «Lo que el envoltorio añade son las estructuras DESPLAZADAS, y esas son justo los DEMÁS
> seguidores: **dos agentes siguen sin estorbarse (como hasta ahora)** y no se paga un barrido fino
> por eje y frame sobre piezas que se están moviendo.»

O sea: que dos agentes se atraviesen **es una decisión tomada**, y el motivo fue **coste**. Ese
motivo no aplica a la solución de este ticket: comparar AABB de cuerpo entre rigs es O(nº de rigs²)
con n minúsculo, no un barrido fino por celda.

## ⛔ Bloqueo encontrado al medir: BUG-SNP3 · **cerrado el 2026-08-13, y el agujero sigue**

`asentar()` **no tiene ninguna comprobación de terreno y no devuelve `false` nunca** (48 líneas, un
solo `return true`). Las ~12 líneas que parecían hacer ese trabajo estaban **pegadas por error dentro
de `game.bloques.quitar()`** (líneas 1144-1155), que era
[BUG-SNP3](../../PLAN_ARCHIVO.md#-bug-snp3):

```js
// Colision horizontal: usar la Y de ENTRADA (antes de gravedad/escalon)
if (g.x !== xPrev && chocaTerreno(s, a, g.x, _yEntry, zPrev)) { g.x = xPrev; }
if (g.z !== zPrev && chocaTerreno(s, a, g.x, _yEntry, g.z)) { g.z = zPrev; }
```

Consecuencia en cadena, y es la que importa para este ticket:

1. En modo `xz`, `if (avX) { g.x += avX; if (!asentar(...)) bloq = true; }` → **`bloq` no se pone
   nunca**.
2. Si `bloq` no se pone, `if (bloq && g.por === 0) g.por = 3` no corre → el estado **«bloqueada»**
   (`POR_SIG[3]`) es **inalcanzable** para un esqueleto.
3. O sea: el mecanismo de «**detenerse** cuando algo no te deja pasar», que es literalmente la
   segunda mitad de REQ-AG17, **está desconectado**.

## Medido en navegador (no deducido)

`sonda_ag17.js` en esta misma carpeta, contra `/map/test` con Chromium real. Se lanza **desde la
raíz** (`node data/tickets/REQ-AG17/sonda_ag17.js`) y deja el mapa como estaba.

⚠️ El zombie de disco tiene el cono de visión limitado y **nace mirando a donde le toca**: parado
detrás de él no te ve jamás y se queda en `por:1` («fuera de alcance»). La primera pasada de la sonda
midió eso y no el andar. Se le pone `vision:360` para poder medir.

**1. Atraviesa las paredes.** Zombie en x=70,4 · pared de roca de 3 de alto en **x=74** · cebo en
x=78:

```
xInicial: 70.38   xFinal: 77.30   atravesoLaPared: true   por: 0 ("persiguiendo")
```

Cruzó los 3 bloques de roca sin frenar y sin pasar por «bloqueada» ni una vez.

**2. Se meten uno dentro de otro, del todo.** Dos zombies plantados a 1 bloque, mismo cebo:

```
cajaA: [78.90, 90.07, 79.70, 90.87]
cajaB: [78.90, 90.07, 79.70, 90.87]
seSolapan: true   distanciaCentros: 0.003   anchoCuerpo: 0.8
```

No es que se rocen: acaban en **la misma coordenada** (3 milésimas de bloque). Es exactamente la
queja del dueño.

### Lo que se supo al cerrar BUG-SNP3 (2026-08-13)

**Esas 12 líneas no se pueden «devolver» a `asentar()`, porque nunca estuvieron ahí.** Rastreando el
fichero commit a commit, la cadena «usar la Y de ENTRADA» **no existe antes de `4fcab25`** y en
`4fcab25` nace ya dentro de `quitar()`. Son un **borrador** para la `asentar()` nueva (la de
`4fcab25`, con la gravedad de REQ-FLUID6) que jamás llegó a enchufarse. Por eso BUG-SNP3 se cerró
borrándolas, sin tocar `asentar()`: el agujero de colisión es **preexistente y es de este ticket**.

Sirven de guía de intención, no de parche a pegar: dicen que la colisión horizontal debe compararse
con la **Y de entrada** (antes de gravedad y de escalón), y deshacer eje por eje. La versión ANTERIOR
a `4fcab25` (`git show 9feb126`) sí traía un final con `chocaMundo` + `solapaJugador` que deshacía
**los tres ejes** y `return false`; se perdió en la reescritura.

## Orden de trabajo que sale de esto

El «me detengo» de REQ-AG17 **está montado sobre maquinaria muerta**: si `asentar()` no devuelve
`false`, `bloq` no se pone, `g.por = 3` («bloqueada») no llega nunca. Implementar solo el «no te
solapes» daría algo incoherente de ver — agentes que se paran ante otro agente mientras siguen
cruzando la roca. Así que la colisión con el terreno va **dentro de este ticket**.

⚠️ Es un cambio **grande y muy visible**: hoy todos los esqueletos atraviesan el terreno, y al
arreglarlo dejan de hacerlo de golpe. Puede cambiar el comportamiento de mapas y scripts que (sin
saberlo) dependen de que pasen. Se consulta con el dueño antes de aplicarlo.

## ✅ El criterio de aceptación ya está escrito: no hay que inventarlo

Mientras `quitar()` petaba, `tests/test_bloques_comportamiento.js` moría en su línea 667 y **nunca
llegaba a la parte de esqueletos**. Cerrado BUG-SNP3 corre entero: **363 ok / 25 fallos**, y los 25
son exactamente esto. Los que mandan:

```
FALLA  sube el escalón de roca en vez de estrellarse contra él   (0.00)
FALLA  no se tira por un abismo: se asoma al borde y ahí se queda   (17.50)
FALLA  ...y lo dice: "bloqueada"   (0)
FALLA  un muro más alto de lo que sube la para   (13.50)
FALLA  no atraviesa un muro de estructuras   (x=17.500)
FALLA  el empujón se para contra un muro, no lo atraviesa
FALLA  cruza el borde y baja los 4 bloques del foso   (bajó 0.00)
```

**REQ-AG17 está terminado cuando esos 25 se ponen verdes** (y los 363 siguen verdes). Se comprobó que
no los causó el arreglo de BUG-SNP3: con el snippet de HEAD + solo el borrado de las 12 líneas salen
los mismos 25.

`tests/test_agente_cuerpo_real.js` se destapó igual (antes petaba con el mismo `ReferenceError`) y
deja **2 fallos de la misma familia**: sobre una lámina fina NO atravesable el pie se apoya en el
**techo de la celda** (16) en vez de en el cuerpo real de la lámina (15,125). Es el bloque
`celdaFina()` que la `asentar()` de `9feb126` sí tenía y se perdió en `4fcab25`. Cuentan también.

Lo que **no** es de aquí, comprobado con el mismo método (idéntico antes y después):
`test_agente_aturdido.js` (3 fallos) y `test_navegador.js` (2 fallos de WebGL1 bajo SwiftShader).

## Segunda pasada: el dueño lo reprodujo con dos «Agente Matrix»

Cerrada la primera versión, el dueño plantó dos y uno se metió en el otro. Tenía razón, y el fallo
era **de diseño mío**: `libreDeAgentes` perdonaba **incondicionalmente** al que ya estorbaba antes
del paso (para no dejar clavado de por vida a un par nacido embutido). «Te perdono» a secas significa
que un par que se mete dentro se vuelve **invisible el uno para el otro para siempre** — y ese par se
consigue solo, con dos agentes persiguiéndote a la misma `distancia`: los dos van al mismo punto del
anillo que te rodea.

`parche_snp_ag17b.py` (v1.33 → v1.34), tres cosas:

1. **Perdón condicional** — el paso vale solo si **aleja los centros** (`seAparta`). «Te perdono si
   te estás yendo»: el que se hunde más se bloquea, el que se separa pasa.
2. **El puñetazo pasa por la misma validación** — `moverRaiz` llamaba a `asentar` a pelo. Es el
   embudo del brinco del golpe (`movPaso`) **y** del patinaje sobre hielo (`fisicaPaso`), así que
   cambiarlo a `avanzar` tapa los dos de una vez.
3. **Desatasco suave** — `separarDeAgentes`, 1,5 bloques/s por cabeza, pasando por `asentar` y por
   `solapaJugador`, así que nunca mete a nadie en la roca ni dentro de ti.

## Tercera pasada: el puñetazo seguía atravesando, y no era «rodear»

Con AG17b el guardián decía que el golpeado acababa **al otro lado** del que tenía delante. Lo di por
un rodeo legítimo (el motor resuelve eje a eje, por eso los agentes bordean paredes). **Era falso.**
`sonda_punetazo.js` —los dos metidos en un pasillo de roca del que no se puede salir— lo enseña
fotograma a fotograma:

```
t=0   golpeado x=34.364   escudo x=36.364     (separados 2, cuerpos de 0.8)
t=1   golpeado x=37.214   escudo x=36.364     ← paso de 2.85, y ya está al otro lado
```

Ni un fotograma solapados, el escudo sin moverse un milímetro, y la z del golpeado apartada solo
0,3 de los 0,8 que necesitaría para esquivarlo. **No lo rodeó: se lo atravesó.**

**Por qué.** `avanzar` valida **dónde se aterriza, no el camino**. Mientras el paso sea más corto que
el cuerpo da igual. Pero el puñetazo no anda: `empujarEsqueleto` mete la fuerza entera en `mov.vx` y
`movPaso` la gasta en `e.vx * dt`. Con fuerza 40 eso son **0,67 bloques por fotograma a 60 fps** —ya
rozando los 0,8 del cuerpo— y **3 o 4 en un fotograma lento**. No es un artefacto del banco de
pruebas: asoma en cuanto la máquina va justa, y justo cuando hay jaleo en pantalla.

`parche_snp_ag17c.py` (v1.34 → v1.35): `moverRaiz` parte el desplazamiento en **trozos de medio
cuerpo** y valida cada uno con la comprobación de siempre. Ni colisión nueva ni barrido de volúmenes:
la que ya hay, llamada las veces que hagan falta. Tope de 32 trozos para que un empujón absurdo (o un
`dt` de pestaña dormida) no cuelgue el fotograma. Cubre de paso el patinaje sobre hielo, que entra
por el mismo sitio.

Medido después, misma sonda: el escudo va **pegado por delante** del golpeado todo el vuelo
(`xe = xg + 0,863` fotograma a fotograma) y `frameDelCruce: null` — no lo adelanta nunca. En el
guardián, lo que el golpe le transmite al de delante pasa de **1,99 a 6,45 bloques**.

⚠️ **La lección, para no repetirla:** un «no solapan en ningún fotograma» **no demuestra** que no se
atraviesen si el paso puede ser más largo que el cuerpo. Hay que mirar el **tamaño del paso**, y por
eso el guardián apunta `dzAlCruzar`: si adelanta, tiene que ser apartado al menos su propio ancho.
