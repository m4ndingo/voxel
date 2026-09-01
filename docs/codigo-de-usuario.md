# ¿Puede el código de usuario ser parte del juego?

**Estudio, no implementación** (fase F-E del plan del multiverso, 2026-09-01). El dueño pidió
estudiarlo con un invariante innegociable:

> «la cuenta de administrador/dueño no tendría que poder ser nunca robada por un jugador que lance
> un snippet»

Este documento **no cierra nada**: compara los cuatro caminos con su coste y con lo que rompe cada
uno, y deja escrita una recomendación. **La decisión es del dueño.** Hasta que la tome, lo que tapa
el agujero es que **`snippet.crear_propio` no lo tiene nadie** salvo el perfil `dueno`
(`servidor/sesion.py:55`, `data/perfiles/dueno.json`).

---

## El problema, en una frase

Un snippet corre con `new AsyncFunction(code)` (`web/app.js:4766`) en **ámbito global y mismo
origen**. Puede hacer `fetch('/api/…', {method:'POST'})` y **el navegador adjunta las credenciales
él solo**.

Las tres defensas que uno esperaría **no sirven**, y conviene saber por qué antes de proponerlas otra vez:

| defensa | por qué no sirve aquí |
|---|---|
| `HttpOnly` | Impide **leer** la cookie. No impide **usarla**: el snippet no necesita verla para que viaje. Ya está dicho en `server.py:1605`. |
| `SameSite=Lax` | Frena el POST que viene de **otro** sitio. Un snippet es **el mismo sitio**. No lo mira siquiera. |
| CSP | Tendría que llevar `unsafe-eval` y `unsafe-inline`, porque los snippets **son** la arquitectura del juego. Protegería de nada y daría falsa sensación de que sí. Por eso `server.py:1000` deja escrito que **no se pone**. |

Y no se puede sandboxear lo que hay: los snippets existen precisamente **porque ven los internos del
motor** (`mc`, `mcAgentMesh`, `mcSurfaceY`). Es su razón de ser
([`desarrollo-desacoplado.md`](desarrollo-desacoplado.md)), no un descuido.

## ⚠️ Lo que cambió con F5.8, y hay que mirar antes de decidir

El plan decía que la opción **B** estaba «ya medio implementada» porque el poder de dueño vivía en
la cabecera `X-VoxelForge-Token`, que **una página no puede fabricar**. Eso era cierto. **Ya no lo
es del todo.**

F5.8 añadió una segunda puerta para que el dueño pueda entrar en modo diseño **desde el navegador**
(sin ella, con `VOXELFORGE_TOKEN` puesto se quedaba fuera de su propio editor, `server.py:1117-1120`).
Esa puerta deja una galleta `vf_disena` de 7 días, y `_es_dueno()` la acepta (`server.py:1125`).
Una galleta es **autoridad ambiente**: viaja sola.

**Medido**, no supuesto — servidor propio en modo público en el 8596:

```
1. anonimo, sin nada             → 401
2. con la CABECERA del token     → 200
3. POST /api/disena              → 200 · galleta: sí
4. SOLO la galleta, SIN cabecera → 200   ⚠️ un snippet puede hacer esto mismo
```

O sea: **mientras el dueño tenga `vf_disena` en el tarro, cualquier JS de su origen actúa como él.**
No es un fallo de F5.8 —hace justo lo que se le pidió— pero **mueve la línea de salida de la opción B**:
ya no es «media implementada», es «implementada y luego abierta por otro sitio».

⚠️ **Hoy esto NO es explotable**: nadie más que el dueño puede publicar un snippet. Es un agujero
**latente**, y se vuelve real **el día que se conceda `snippet.crear_propio`**. Que es exactamente la
decisión que este documento tiene que informar.

---

## Los cuatro caminos

### A · Origen distinto para el código ajeno
Subdominio o puerto por mapa/usuario, de forma que el código de otro **no comparta origen** con la
sesión del dueño.

- **A favor**: es la **única defensa sólida de verdad**. La cookie no viaja, y el navegador lo
  garantiza — no depende de que nadie se acuerde de nada.
- **En contra**: choca de frente con la decisión de hosting. Hoy se sirve en **LAN sin dominio y sin
  TLS**, y un origen por usuario pide comodín DNS + certificado comodín, o sea **F7.5 y F7.6
  primero**. Rompe además las URLs actuales (`/map/<slug>`), escritas en medio repo y en la wiki.
- **Coste**: alto, y **no empieza hasta la puerta a internet**.

### B · Sesión de dueño que no se puede replicar
Las escrituras peligrosas exigen la **cabecera** que la página no tiene; la cookie de dueño sirve
para **leer y para el panel**, y nada más.

- **A favor**: barato y encaja con lo que ya hay (`herramientas/*.py` ya trabajan por cabecera).
- **En contra**: **hay que deshacer parte de F5.8**, o el agujero sigue abierto por la galleta. Y
  quita lo que F5.8 vino a dar: escribir desde el navegador. Salida intermedia: que `vf_disena`
  valga para **abrir el editor** (cosmética + lectura) pero **no** para `POST /api/snippets` ni para
  `/api/panel/*` — o sea, separar «ver las herramientas» de «usar las peligrosas», que hoy son la
  misma comprobación.
- **Coste**: bajo-medio. **Es el único que se puede hacer sin tocar el hosting.**

### C · Modo visita sin sesión
Entrar a un mapa ajeno **suelta la cookie** (`?visita=1` responde `Set-Cookie` vacío para esa navegación).

- **A favor**: barato. ⛔ **No existe hoy**: no hay ni rastro de `?visita=` en `server.py`.
- **En contra**: degrada la experiencia (entras a un mapa de un amigo y dejas de ser tú: sin chat con
  tu nombre, sin tus habitantes) y **depende de acordarse**: cualquier ruta futura que no lo aplique
  reabre el agujero entero. Es una defensa que se olvida.
- **Coste**: bajo, con deuda permanente.

### D · Lista cerrada en vez de JS
El mapa guarda `{gravedad, día/noche, PvP, ambiente}` en su cabecera y `app.js` lo interpreta.

- **A favor**: **seguro por construcción** — no hay código ajeno, luego no hay nada que robar. No
  depende de orígenes, ni de cabeceras, ni de acordarse.
- **En contra**: no es lo mismo que pidió la pregunta. Un jugador **no programa**: elige.
- **Coste**: medio y creciente (cada ajuste nuevo es trabajo), pero **es el único que escala a
  desconocidos** y probablemente el camino a largo plazo.

---

## Recomendación

**No conceder `snippet.crear_propio` a nadie.** Publicar sin resolver esto es seguro; darlo antes de
resolverlo, no. Eso ya está en vigor y no cuesta nada mantenerlo.

Y, por orden de lo que rinde por lo que cuesta:

1. **Ahora, y es barato: cerrar lo de F5.8** (opción B recortada). Separar «la galleta abre el
   editor» de «la galleta escribe»: que `vf_disena` no valga para `POST /api/snippets` ni para
   `/api/panel/*`, que sigan pidiendo la cabecera. Se recupera el invariante del dueño **sin tocar el
   hosting y sin quitarle el editor**. ⚠️ Aun así **no es defensa completa**: deja fuera las demás
   escrituras de dueño, y por eso no sustituye a A ni a D.
2. **Cuando se abra a internet: A.** Es la única sólida, y para entonces F7.5/F7.6 ya habrán puesto
   el dominio y el certificado que hoy la bloquean. Antes de eso no es realizable.
3. **A largo plazo: D**, para lo que la mayoría de la gente querría de verdad (gravedad, día/noche,
   PvP). El JS de usuario se queda para quien tenga el permiso a mano, que serán conocidos.
4. **C se descarta**: cuesta poco pero deja una obligación de acordarse para siempre, y esas se
   incumplen.

⛔ **Nada de esto está implementado.** El punto 1 es una propuesta con coste medido; necesita el sí
del dueño porque **recorta algo que él pidió** (entrar en modo diseño desde el navegador).

## Cómo comprobarlo cuando se decida

El servidor de pruebas se levanta como en `tests/test_permisos_api.js` (modo público, puerto propio,
`--datos` a un temporal). La comprobación que importa es **la 4 de la tabla de arriba**: con la
galleta y **sin** la cabecera, `POST /api/snippets` tiene que dar **403**. Hoy da 200.

⛔ Siempre en un puerto de usar y tirar. **Nunca contra el 8500**, y **nunca contra el 8510**, que es
la partida en vivo del dueño.
