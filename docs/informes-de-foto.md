# Informes de foto (REQ-INF1)

> Orden del dueño (2026-08-20): «*que sacar una foto sea generar informes también, para que luego los consultes,
> que se apoye en scripts que reutilices, para que no tengas que estar constantemente editando snippets*».

**Una foto no es una foto: es un estudio.** Cuando el dueño dice «la luz salta, mira estas dos fotos», la imagen
enseña el síntoma pero no trae ni un número, y cada pregunta obligaba a escribir y lanzar otra sonda de Playwright
a mano. Ahora la propia captura mide.

## Cómo está repartido

| Pieza | Dónde | Qué sabe |
|---|---|---|
| Registro y orden | `web/app.js` (`mcInformeDefine`, `mcCorreInformes`) | **Nada** de lo que mide cada informe |
| Catálogo | `data/informes/index.json` | La lista y el orden |
| Cada informe | `data/informes/<nombre>.js` | Toda la medición |
| Índice del estudio | la ficha `data/fotos/<id>.json`, clave `informes` | Título, resumen de 1 línea, ms y **en qué fichero** está el detalle |
| Detalle | `data/fotos/informes/<id>/<nombre>.json` | El cuerpo entero, tan largo como haga falta |

La ficha se queda **solo con el índice** a propósito: un barrido de luz ocupa más que todo lo demás junto y la
ficha tiene que seguir leyéndose de un vistazo. El `fichero` lo rellena `server.py`, que es quien sabe el id.

## Añadir o afinar un informe

Es **editar un fichero del repo**: ni tocar el motor, ni republicar snippets, ni reiniciar nada.

1. Crea `data/informes/<nombre>.js` con una única llamada a `definir(...)`.
2. Añade `<nombre>` a la lista de `data/informes/index.json`.
3. En el navegador, `game.informes.recarga()` (o recarga la página).

```js
definir('mi-informe', {
  titulo: 'Lo que mide, en una línea',
  pesado: false,                    // true = barrido caro; solo corre con game.informes.foto()
  calcula(){ return { … }; },       // cualquier cosa serializable a JSON
  resumen(d){ return '…'; }         // la línea que va a la ficha de la foto
});
```

Se cargan con `AsyncFunction` en ámbito global, **igual que los snippets**, así que alcanzan los internos del
motor (`mc`, `mcDynNivel`, `mcLuzFactorHaz`, `mcCampoLuz`…) sin modificar `app.js`. Se sirven por `GET` porque
`data/` sale del repo (ver `Handler.translate_path`); no hacen falta POST.

Un informe que peta **no tumba la foto**: se anota el error en su hueco del índice y se sigue con el siguiente.

## Desde la consola

```js
game.informes.lista()             // qué hay cargado y cuáles son pesados
game.informes.corre('luz-campo')  // uno suelto, sin sacar foto
game.informes.foto()              // foto CON los pesados incluidos
game.informes.recarga()           // releer data/informes/ tras editarlos
```

## Catálogo actual

- **`luz-semillas`** — censo de emisores: quién alumbra, de dónde sale y **quién se cae por el tope**
  (`MC_DYN_SEMILLAS`). El número a comparar entre dos fotos es `corte`: si se mueve, hay luces que se encienden y
  se apagan **enteras**, y eso no lo suaviza ninguna ley.
- **`luz-campo`** — el campo medido (BFS) contra la **ley continua** alrededor de la mira. `desvio.max` es *cuánto
  se aparta el motor de su propia ley*. Dos avisos que el informe ya aplica solo, porque sin ellos el número no
  mide nada: solo cuenta celdas que **ven a su emisor** en línea recta (si no, la diferencia es la sombra haciendo
  su trabajo) y solo emisores **dentro de la caja** (los de fuera no siembran).
- **`luz-tope`** — **por qué** se pierde la luz que `luz-campo` echa en falta. Desde BUG-GLOW8f cada celda guarda
  quién la encendió (`OR`), cuánto camino anduvo la luz (`DI`) y el pleno de ese emisor (`MX`), así que la ley que
  le toca se recalcula aquí y se compara con lo que el BFS guardó de verdad. Trae `escalones` (parejas de celdas
  pegadas, mismo emisor y las dos al aire, que se separan más de lo que la ley pide — el parchazo tal y como se ve)
  y `condiciones` (dónde, hacia dónde y **qué herramienta**), porque el salto depende de todo eso.
  **Ya descartó a su propio sospechoso**: el tope `Math.min(curLvl−1, ley)` de `mcLuzDifunde` recorta 0 ó 1 celda de
  ~40 000 con `focus` 0,2 / 0,5 / 1, y esa una por 0,25 niveles. El número vivo es **`caminoVsRecta`** (ver abajo).
- **`luz-agujeros`** — celdas de aire que **ven a su emisor en línea recta**, que la ley enciende y que el campo
  deja apagadas: no es que la luz se recorte, es que **el frente del BFS no llega**. Para las peores anda el camino
  Manhattan más ceñido a la recta y marca en `seMuereEn` dónde la ley cae por debajo del suelo del campo, que es
  donde `relax` hace `if(nl<1) return` y mata el frente. Si `muertosPorElCamino` es 0, el cono no tiene agujeros.
- **`luz-continuidad`** — **el bandazo del que se queja el dueño, medido en el sitio.** Rehace el campo con las
  semillas de esta misma foto movidas un pelín y lo resta celda a celda: `girarHaz` (1° con el emisor clavado),
  `moverEmisor` (1/32 de bloque, el escalón de `OR`) y `cruzarCelda` (el emisor salta a la celda de al lado).
  **`cruzarCelda` no puede saltar nunca**: la luz no sabe dónde están las paredes de las celdas. Para la peor celda
  de cada caso trae el desglose entero (`antes`/`despues`: emisor, `MX`, `camino`, `recta`, `sobra`, `cos`, `k`) y
  sus **6 vecinos** — el vecino con `sobra` 0 que no ganó la carrera es la prueba de que el frente eligió mal.
  Trae además `motor` (las constantes de la ley), que es lo único que dice si el navegador tenía el `app.js` de
  ahora o uno viejo en caché. Sustituye a las sondas de Playwright: **no hace falta abrir el navegador.**
- **`luz-barrido`** *(pesado)* — dos barridos sintéticos en aire libre que separan los dos sospechosos que a ojo se
  confunden: **girar** el haz con el emisor clavado, y **cruzar** de celda con el haz clavado. `luz-continuidad`
  hace lo mismo pero con las semillas REALES; éste queda como referencia limpia, sin terreno de por medio.

## Comparar dos fotos

Los saltos casi nunca se ven en una foto suelta: aparecen **al andar, al girar la cámara, según dónde estés y según
qué lleves en la mano** (dueño, 2026-08-20: «*infinitas condiciones*»). Por eso el flujo normal son **dos fotos** y
un comparador que dice cuál de los tres sospechosos se movió:

```bash
python3 herramientas/comparar_fotos.py 87 88          # solo lee data/fotos/, no escribe nada
python3 herramientas/comparar_fotos.py 87 88 --celdas 20
```

Separa **cámara** (¿se movió?), **reparto de emisores** (¿entró o salió alguno, cambió alguno de celda?), **el tope
del BFS** y **el campo** (suma, celdas encendidas, desvío, y el corte horizontal celda a celda). Cada informe lleva
sus `condiciones` dentro, así que dos fotos cualesquiera se pueden comparar sabiendo qué cambió entre ellas.

⚠️ **Alt+F no corre los `pesado`.** La tecla llama a `mcFoto()` a secas; para incluirlos, `game.informes.foto()`.

## Cómo se leen los números de luz

El suelo irreducible es **`1/MC_LUZ_SUB` = 0,25 niveles**: es lo más fino que el campo sabe representar, y por
debajo de eso no hay nada que arreglar. Un salto por celda de 0,25–0,50 es el ruido de cuantización; varios
niveles de golpe es un artefacto.

⚠️ **El pleno de un emisor no es su alcance.** `mcLuzSiembra` escala el color al alcance y se queda con el canal
más fuerte (`maxC`, que es lo que guarda en `MX`); pedirle a la ley `s.nivel` la infla, y el «desvío» que sale es
del informe, no del motor. Así se apuntaron **4,17 niveles de artefacto inexistente** en la foto #87: con el pleno
bien puesto, ese mismo desvío se queda en 0,7–1,6. Cualquier informe nuevo que evalúe la ley tiene que copiar esa
cuenta de `mcLuzSiembra` (la tienen ya `luz-campo` y `luz-agujeros`, en su función `pico`).

**`caminoVsRecta`** (en `luz-tope`) es el residuo a vigilar: `DI` se siembra con la distancia Manhattan real
—fraccionaria— y la difusión le suma lo que el paso **aleja del emisor**. En aire libre el camino tiene que salir
**igual que la recta** (`sobra` ≈ 0); si sobra, la luz llegó por un camino que no era el recto, y eso se cobra
en niveles **multiplicado por el factor del haz** (con `focus=1`, ×6). Hasta BUG-GLOW8h la difusión sumaba **un
bloque entero por paso** aunque el paso fuera de lado, y de ahí salían ~0,7 bloques de sobra y los saltos al
cruzar el emisor de celda.

`anisotropia` en `luz-barrido` = cuánto más lejos llega el haz según hacia dónde apunte. **1,00 es un cono
perfecto**; muy por encima significa que el coste se está cobrando por los 6 ejes y el «cono» es en realidad una
estrella de seis puntas (fue el bug BUG-GLOW8f).

Relacionado: [`luz-y-sombra.md`](luz-y-sombra.md) (las dos sombras y la ley), [`osd-e-intro.md`](osd-e-intro.md).
