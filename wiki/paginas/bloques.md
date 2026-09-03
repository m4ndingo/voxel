# Bloques con comportamiento

Una escalera por la que se trepa, un hielo que patina, una seta que te lanza por los aires, una flor
que se recoge al pasar por encima, una antorcha que se apaga de un flechazo. Todo eso son **bloques
con comportamiento**, y se declaran en una línea.

Dos ideas antes de nada, porque son las que evitan casi todos los disgustos:

**1 · El comportamiento cuelga del MATERIAL, nunca de un voxel concreto.** Si le dices a la antorcha
que se apague de un flechazo, se apagan **todas** las antorchas del mapa, las puestas y las que
pongas mañana. No hay forma de decir «esta sí y ésa no»; si quieres una excepción, necesitas otro
material.

**2 · Esto no está en el programa, está en un snippet.** Vive en `mundo-autoarranque`, que se ejecuta
solo al entrar en cualquier mapa. Puedes abrirlo, leerlo y cambiarlo sin tocar el motor —
[cómo corren los snippets](#/scripting), [los cuatro autoarranques](#/autoarranque).

---

## Lo primero: ¿qué estoy pisando?

La clave de un material **se pregunta, no se adivina**. Ponte encima de lo que te interese y:

```js
game.bloques.info()
```

Saca una tabla con lo que hay **bajo los pies**, **delante** y **detrás**, con la clave exacta de
cada uno y el comportamiento que ya tenga. Esa clave — `asset:assets/antorcha.vox.json`,
`hab:escalera` — es la que se le pasa a `game.bloques.define`.

> ⚠️ El nombre corto no siempre basta: `hab:cable` y `asset:assets/cable.vox.json` son el mismo
> dibujo entrando por dos puertas distintas. Si el corto es ambiguo, `define` te lo dice y no hace
> nada. Si no es ambiguo, lo acepta.

Y para ver todo lo que hay definido ahora mismo en este mapa:

```js
game.bloques.lista()
```

---

## El catálogo

Todo se declara en el mismo sitio: `game.bloques.define(clave, { … })`.

### Andar por encima

| opción | qué hace |
|---|---|
| `trepable: true` | se sube avanzando contra ella. `subida` (4 u/s) y `bajada` (5 u/s) afinan el ritmo |
| `impulso: 22` | trampolín: velocidad vertical al pisarlo, en u/s |
| `altura: 3` | lo mismo dicho en bloques — se convierte solo a `impulso` |
| `velocidad: 2` | **factor** sobre tu marcha mientras lo pisas. 2 = el doble, 0.5 = barro |
| `deslizamiento: 1.2` | segundos de patinaje al soltar las teclas. `true` = 1,2 s. Es el hielo |
| `atravesable: true` | lo cruzas sin frenarte, pero se sigue viendo, apuntando y rompiendo |

### Cómo se ve

| opción | qué hace |
|---|---|
| `luz: 'pasa'` | la luz del cielo lo atraviesa: hojas, celosías, rejillas |
| `luz: 'tapa'` | y lo contrario, aunque sea una pieza de recorte |
| `recibeSombra: false` | nada lo oscurece, ni el cielo ni el sol |
| `proyectaSombra: false` | no deja sombra debajo. Arrastra `luz:'pasa'` salvo que digas otra cosa |
| `viento: true` | se mece. Es lo que llevan las flores y las hojas |
| `mirar: {…}` | la pieza **gira hacia el jugador**. Solo estructuras, no terreno |
| `seguir: {…}` | la pieza **se desplaza** persiguiendo. Solo estructuras |

⚠️ `recibeSombra` y `proyectaSombra` son **dos sombras distintas** y tocarlas a ciegas se nota.
Antes de cambiar nada de luz, [la Ley de la Luz](#/ley-de-la-luz).

### Eventos

| opción | cuándo se dispara |
|---|---|
| `alPisar(c)` | **una vez**, al entrar en la celda. `c.quien` = `'jugador'` \| `'agente'` |
| `alSeguirPisando(c)` | **cada tick** mientras sigas dentro. Es la placa de presión |
| `alRomper(c)` | al romperlo, con la celda y el giro que tenía |
| `alCoger(c)` | al acercarte lo bastante, sin romper nada. `alcance` (0,6) y `consume` lo gobiernan |
| `alImpactar` | cuando algo **choca** contra él — la sección de abajo, entera |

```js
game.bloques.define('hab:escalera', {
  trepable: true, subida: 4, bajada: 5,
  nota: 'Avanza contra ella para subir, retrocede para bajar.'
});

game.bloques.define('asset:assets/hielo.vox.json', { velocidad: 2, deslizamiento: 1.2 });
game.bloques.define('asset:assets/diana.vox.json', { impulso: 22 });
```

`nota` no hace nada: es el texto que sale en `game.bloques.lista()` para que dentro de seis meses
sepas por qué pusiste eso.

---

## ⭐ Lo nuevo: qué pasa cuando algo CHOCA

Ésta es la parte recién estrenada, y es la que convierte un mapa en un juego: **piezas que
reaccionan a un flechazo**. Dianas que se rompen, farolillos que aguantan tres tiros, antorchas que
se encienden y se apagan a base de puntería.

Todo entra por **una sola opción**, `alImpactar`, que no es un evento más: es un **despachador**, es
decir, dice *qué* pasa. Tiene cuatro modos.

| `alImpactar` | qué hace |
|---|---|
| `'romper'` | retira la pieza y dispara su `alRomper` |
| `'cambiar'` | **la reemplaza por otro material**, heredando el giro, y dispara su `alCambiar` |
| `'coger'` | dispara su `alCoger`, respetando su `consume` |
| una función | JS a pelo: ni rompe ni coge, hace lo que tú digas |

Y dos opciones que lo acompañan:

- **`impactos: 3`** — golpes que aguanta antes de desencadenar. Por defecto **1**. El contador es
  **por celda**: cada farolillo lleva su propia cuenta, no la del material.
- **`persistente: false`** — el destrozo es **solo de la vista** y la pieza vuelve al recargar el
  mapa. Es lo que quieres en una diana de prácticas, en los cristales de un parkour o en la fruta de
  un puzzle que se rejuega. Por defecto el destrozo **se guarda**, que es lo que espera cualquiera
  que rompa algo.

### El cambio de material, en una línea

Éste era el encargo: *«una vez impactada la antorcha, reemplazarla por otra — por ejemplo por su
versión encendida/apagada»*. Se hace así, y no hay más:

```js
game.bloques.define('asset:assets/antorcha.vox.json',
                    { alImpactar: 'cambiar', cambiaPor: 'antorcha-apagada' });
game.bloques.define('asset:assets/antorcha-apagada.vox.json',
                    { alImpactar: 'cambiar', cambiaPor: 'antorcha' });
```

Con las dos definidas, el par se alterna a flechazos indefinidamente. Lo que hace `'cambiar'` por
dentro, y que es justo lo que nadie quiere volver a escribir a mano:

- **Pone la nueva ANTES de quitar la vieja**, para que no haya ni un fotograma con el hueco vacío.
- **Hereda el giro** (`ori`). No hay que declararlo.
- Sirve igual si la pieza es una **estructura** estampada o un bloque de la **rejilla**: se entera
  sola de cuál es.
- Acepta el **nombre corto** (`'antorcha-apagada'`) o la clave entera.

Si además quieres enterarte del cambio, `alCambiar(c)` recibe la ficha de siempre más `c.nuevo`.

> ⚠️ `alImpactar: 'cambiar'` **sin `cambiaPor`** se define bien, despacha bien y no cambia nada. El
> snippet te lo avisa por consola en cuanto lo defines.

> ⚠️ `persistente: false` **no vale en estructuras** cuando se cambian: el estampado guarda la
> cabecera del mundo de todas formas. En la rejilla sí funciona.

### Y también a mano

Si te has escrito tu propio `alImpactar` en JS y solo quieres el reemplazo limpio, tienes el mismo
motor suelto:

```js
game.bloques.cambiar(c, 'antorcha-apagada');        // con la ficha que ya te llega
game.bloques.cambiar(12, 34, 56, 'antorcha');       // o a pelo, por coordenadas
```

Devuelve una promesa a `true`/`false`. Sin ficha averigua sola qué hay ahí y con qué giro.

### Quién lo disparó

`alImpactar: 'coger'` reutiliza **el mismo** `alCoger` que la recogida al pasar por encima — que es
lo que se quería, porque así un snippet vale para las dos cosas sin tocar una línea. Pero entonces
hace falta poder distinguirlas, y para eso la ficha trae **`c.por`**:

| `c.por` | qué pasó |
|---|---|
| `'cuerpo'` | te acercaste andando |
| `'pico'` | lo rompiste con el pico |
| `'impacto'` | algo chocó (la flecha) |
| `'masa'` | lo borró un barrido, típicamente una explosión de TNT |
| `'mano'` | lo cambiaste tú llamando a `game.bloques.cambiar` |

Con `'impacto'` viajan además `c.info.fuente` (quién chocó: `'flecha'`), `c.golpe` y `c.de` (vas por
el 2 de 3) y `c.punto`, el sitio exacto del choque.

```js
game.bloques.define('asset:assets/flor-roja.vox.json', {
  viento: true, alImpactar: 'coger', persistente: false,
  alCoger(c) {
    toast(c.por === 'impacto'
      ? '🌹 flor cogida de un ' + ((c.info && c.info.fuente) || 'impacto')
      : '🌹 flor cogida al pasar');
  }
});
```

### Un ejemplo de los tres modos

```js
// aguanta 3 flechazos y al tercero se rompe… pero vuelve al recargar
game.bloques.define('asset:assets/farolillo-zen.vox.json', {
  impactos: 3, alImpactar: 'romper', persistente: false,
  alRomper(c) { toast('💥 farolillo roto en ' + c.x + ',' + c.y + ',' + c.z); }
});

// JS a pelo: ni rompe ni coge
game.bloques.define('asset:assets/antorcha.vox.json', {
  impactos: 2, persistente: false,
  alImpactar(c) {
    toast('🔥 golpe ' + c.golpe + ' de ' + c.de + ' · fuente: ' + (c.info && c.info.fuente));
  }
});
```

### Verlo funcionar: los rayos-X

Con la tecla **X** cada bloque enseña su etiqueta, y la **cuarta línea** cuenta lo que le has puesto:

```
antorcha
alImpactar→cambiar antorcha-apagada

farolillo-zen
alImpactar→romper (2/3) · vuelve al recargar
```

El `(2/3)` es **de esa celda concreta**: con `impactos: 3` puedes ver cuál va por dos y cuál está
entera. Es la forma rápida de comprobar que una definición ha entrado — y de descubrir que le
pusiste el comportamiento a un material que no era.

### Si lo que escribes es el proyectil

Nada de lo anterior lo sabe la flecha, y ésa es la gracia: solo dice «he chocado aquí» y el bloque
decide. Si te haces un proyectil propio, son dos llamadas:

```js
if (game.bloques.impactoEn(px, py, pz)) {           // ¿hay algo que reaccione? sondeo sin efectos
  const r = game.bloques.impacto(px, py, pz, { fuente: 'flecha' });
  if (r) toast('golpe ' + r.golpe + ' de ' + r.de);
}
```

Y si lo tuyo es borrar bloques **en masa** — una explosión —, `game.bloques.avisoDeRotura` es la
puerta para que el `alRomper` de lo que borras se dispare igual: se pide el aviso **antes** de
borrar y se llama **después**.

---

## Trampas que cuestan caro

- **Se define por material, no por pieza.** Vale la pena repetirlo: el bloque-sorpresa de oro que
  levanta una casa al romperlo levanta una casa **cada vez que se rompe cualquier bloque de oro**.
  Por eso se eligió el oro: no había ni uno puesto en el mapa.
- **Un `define` que no hace nada se rechaza entero.** Si escribes `rromper` o `Coger`, `alImpactar`
  se queda en nada y, si no había otra cosa en la definición, se descarta con un aviso por consola.
  Mira la consola: el aviso dice exactamente qué palabra no entendió.
- **`mirar` solo funciona sobre estructuras**, no sobre terreno. Definirlo en un mapa donde esa pieza
  no está plantada suelta un aviso legítimo — y ése es justo el motivo de que exista el autoarranque
  **por mapa**.
- **Un material que todavía no está en la paleta no se rechaza**: se queda en lista de espera y se
  activa en cuanto aparezca. Sale en `game.bloques.lista()` como «en espera».
- **Redefinir manda sobre lo anterior.** Volver a llamar a `define` con la misma clave sustituye la
  definición entera; no se mezclan.
- Para quitar un comportamiento, `game.bloques.quitar(clave)`.

---

## Dónde vive todo esto

En el snippet **`mundo-autoarranque`**, que corre en **todos** los mapas. Los comportamientos de
serie (la escalera, el hielo, las flores, las antorchas, el farolillo) están en su tabla `DEFECTOS`,
al principio del fichero, y son el mejor sitio para copiar de un ejemplo que ya funciona.

Si un comportamiento es solo de **un** mapa, no lo pongas ahí: va en `mundo-<nombre del mapa>`, que
se ejecuta después. [Los cuatro puntos de entrada](#/autoarranque) lo cuentan entero.

El detalle técnico largo — cómo se cuenta un impacto, por qué el contador vive donde vive, qué se
guarda y qué no — está en `docs/bloques-comportamiento.md` del repositorio.
