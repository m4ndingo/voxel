# El motor de partículas

Chispas, sangre, polvo al romper, hojas cayendo, humo, nieve, lluvia. Todos son **el mismo motor**,
y ese motor **no está en el motor del juego**: vive en un snippet, así que puedes abrirlo, leerlo y
cambiarlo sin tocar nada del programa.

Una partícula es un **cubito de color de 1/16 de bloque** que cae, rebota, se posa y acaba
desapareciendo. Se pintan en `game.voxelesUI`, la capa de adorno: **no colisionan, no se guardan,
no salen en la foto del mapa y se pierden al recargar**. Eso es exactamente lo que quieres para un
efecto — no vas a ensuciar el mundo con la sangre de un zombi.

Son tres snippets, cada uno con un trabajo:

| snippet | para qué |
|---|---|
| `particulas-voxel` | **el motor**. Lo llamas y te da sistemas de partículas |
| `sondas-mundo` | preguntarle al mundo «¿hay algo sólido aquí?» **con la forma de verdad** |
| `efectos-demo` | siete efectos ya hechos, para copiar y para probar |

---

## Lo más rápido: probar los siete

Corre el snippet `efectos-demo` y ya tienes las teclas:

| tecla | efecto |
|---|---|
| **Y** | chispas (un golpe de metal) |
| **M** | polvo (romper un bloque) |
| **T** | hojas (sacudir un árbol) |
| **H** | humo (una hoguera) |
| **C** | cielo de estrellas |
| **V** | nieve (cuaja en el suelo) |
| **L** | lluvia (no cuaja) |

`game.efectos.info()` dice qué hay vivo; `game.efectos.para()` lo apaga todo.

Los cuatro primeros salen donde estés mirando. Los tres últimos son de ambiente: se encienden y se
quedan, y la misma tecla los apaga.

---

## Hacer uno tuyo

```js
const P = await game.snippet('particulas-voxel');

const chispas = P.crea({
  grupo: 'chispas',
  chorro: 16,          // cuántas salen de golpe
  fuerza: 7,           // a qué velocidad
  grav: 30,            // cuánto tiran hacia abajo
  dura: 0.8,           // segundos que vive cada una
  posarse: false,      // no se queda en el suelo: se apaga al tocar
  hacia: 'radial',     // en todas direcciones
  colores: [[1,0.95,0.55],[1,0.75,0.2],[1,1,0.85]]
});

chispas.salpica([x, y, z]);     // ¡fuego!
```

Y ya está: **eso es un efecto entero**. No hay física que escribir — la trae el motor.

Los tres mandos que más cambian el carácter de un efecto:

- **`grav`** — 30 es una chispa, 1,6 es una hoja planeando, y **en negativo sube**: `grav: -1.8` es humo.
- **`posarse`** — `true` se queda tirado en el suelo (sangre, nieve, polvo); `false` desaparece al
  tocar (chispas, lluvia, humo).
- **`deriva` / `derivaHz`** — vaivén lateral mientras cae. Es lo que separa un copo de nieve de una
  piedra: sin esto, la nieve parece granizo.

Y el resto: `desvanece` (segundos apagándose antes de irse), `fuerza`, `hacia`
(`'mirada'`, `'radial'`, `'arriba'`), `rebote`, `roza`, `disperso`, `tope` (máximo de partículas
vivas), `vuelo` (segundos máximos en el aire, por si una se queda atascada).

Todo se puede cambiar **en caliente**, sin recrear nada:

```js
chispas.grav = 45;
chispas.colores = [[0.2,0.8,1]];   // ahora son azules
```

---

## Lluvia y nieve: ambiente que te sigue

Además del chorro de golpe, un sistema puede **sembrar continuamente** alrededor del jugador:

```js
const nieve = P.crea({
  grupo: 'nieve',
  porSegundo: 55, radio: 13, alto: 11,   // 55 copos/s en una caja de 13 bloques sobre tu cabeza
  grav: 0.9, deriva: 0.7, derivaHz: 0.28,
  dura: 25,                              // cuaja: 25 segundos posada
  colores: [[1,1,1],[0.93,0.96,1]]
});

nieve.enciende(55);   // a nevar
nieve.para();         // deja de caer (lo ya caído sigue)
nieve.limpia();       // y esto lo borra
```

> **Por qué esto no hunde los fps.** No se siembra el mapa: se siembra una caja de `radio` bloques
> **alrededor de ti**, y lo que se sale por detrás se recoge. Andar bajo la nieve no va dejando un
> rastro de copos vivos a tu espalda, así que da igual lo grande que sea el mundo.

La lluvia es la misma idea con `posarse: false`, `dura: 0.1` y más `grav`: cae rápido y revienta al
tocar el suelo.

---

## Estrellas: ni siquiera son partículas

La capa `game.voxelesUI` se dibuja **sin luz** — un voxel blanco se ve blanco a medianoche. O sea que
para tener un cielo estrellado **no hay que pedirle nada al motor de luz**: se plantan voxeles claros
arriba y ya brillan solos.

```js
const U = game.voxelesUI, p = 1/16;              // la capa va en voxeles finos: 16 por bloque
U.grosor('estrellas', 6);                        // ⬅️ el TAMAÑO de cada estrella (6/16 de bloque)
for(let i = 0; i < 240; i++){
  const t = Math.random()*Math.PI*2, u = Math.random(), r = 78*Math.sqrt(u);
  const alt = 46 + Math.sqrt(1-u)*26;            // media esfera, no disco
  const b = 0.55 + Math.random()*0.45;
  U.pon(Math.round((64 + Math.cos(t)*r)/p), Math.round(alt/p),
        Math.round((64 + Math.sin(t)*r)/p), [b,b,b], 'estrellas');
}
```

Se plantan **una vez** y ahí se quedan: coste cero por frame. Ojo con el detalle de la **media
esfera**: repartir en un disco plano te las amontona todas justo encima de tu cabeza.

> **Para que se vean grandes, `grosor`, y nunca apilar voxeles.** `game.voxelesUI.grosor(grupo, n)`
> agranda **el cubo** y deja el voxel donde estaba, así que **una estrella es un voxel, mida lo que
> mida**: de `grosor 1` a `grosor 16` (un bloque entero) cuesta exactamente lo mismo. Hacerlas gordas
> apilando un cubo de `n³` voxeles multiplica la geometría por `n³` y **eso sí hunde los fps**: 240
> estrellas a grosor 16 son 983 040 voxeles apiladas y ~1 640 ms por frame, contra **240 voxeles y
> 2,1 ms** con `grosor`.

Por eso mismo **no titilan** por defecto. Titilar es repintar, y repintar cuesta (abajo).

Y aunque la capa no sea mundo, **sí respeta la profundidad**: lo que tengas delante tapa la partícula o la
estrella, igual que taparía a un bloque. Si lo que quieres es justo lo contrario —una marca que se vea a
través de las paredes— pon `game.voxelesUI.encima = true` y la capa se dibujará encima de todo.

---

## Qué cuesta esto

Lo único que se paga es **rehacer la geometría de la capa entera**, y se paga **una vez por frame**
mientras algo se mueva — no una vez por partícula. Medido:

| voxeles en la capa | ms por frame |
|---|---|
| 100 | 0,48 |
| 250 | 1,16 |
| 500 | 2,88 |
| 1000 | 6,29 |

Unos **6 µs por voxel**. Para hacerse una idea: la nieve a tope son 420 copos ≈ 2,4 ms; la lluvia a
150 gotas por segundo se queda en unas 58 vivas a la vez (duran 0,1 s) y no llega a 0,5 ms. Mil
voxeles a la vez ya se nota, y por eso los sistemas traen `tope`.

Como es **la capa entera** la que se rehace, no ahorra nada pintar de una en una — ni tampoco
repartir el mismo efecto en varios grupos.

---

## Que las cosas caigan donde deben

Este es el detalle que da realismo y **el que más cuesta descubrir solo**.

Preguntar «¿hay un bloque en esta celda?» da `true` en el **cubo entero** de una antorcha, de una flor
o de un repetidor. Si tu efecto usa eso, lo que caiga se queda **posado en el aire**, sobre una caja
invisible que rodea la antorcha. Queda fatal y se ve enseguida.

Para eso está `sondas-mundo`: pregunta por la **forma real** (la misma que usa el juego para
decidir si tú te cuelas por un hueco), así que lo que tires se cuela por donde te colarías tú.

```js
const S = await game.snippet('sondas-mundo');

S.solido(x, y, z);           // ¿hay materia en este punto exacto? (con la forma de verdad)
S.suelo(x, y, z, 40);        // la primera superficie por debajo, o null
```

Sobre una antorcha, la diferencia medida es de **4096 subceldas «sólidas» a 48** — que son el palo, y
nada más. El motor de partículas ya usa estas sondas; si escribes cualquier otra cosa que caiga,
camine o dispare, úsalas también.

---

## Los efectos de `efectos-demo`, resumidos

| efecto | el mando que lo define |
|---|---|
| chispas | `grav: 30`, `posarse: false` — se apagan al tocar |
| polvo | `hacia: 'radial'`, poco `roza` — se esparce y se queda |
| hojas | `grav: 1.6` + `deriva: 0.9` — planean en zigzag |
| humo | `grav: -1.8` — sube |
| nieve | `posarse: true`, `dura: 25` — cuaja |
| lluvia | `posarse: false`, `dura: 0.1` — revienta al tocar |
| estrellas | no son partículas: voxeles quietos en una capa sin luz |

Abre `efectos-demo` en el panel Código: son ocho líneas de configuración por efecto y ni una de
física. Copiar uno y retocarle tres números es la forma rápida de tener el tuyo.
