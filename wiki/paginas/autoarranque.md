# Autoarranque: los cuatro puntos de entrada

Un snippet se puede lanzar a mano con ▶, pero lo normal es que corra **solo**. VoxelForge busca
snippets por nombre en cuatro momentos distintos. El nombre **es** el disparador: no hay que
registrar nada en ningún sitio, basta con que el documento se llame así.

| Snippet | Cuándo corre | Para qué |
|---|---|---|
| `editor-autoarranque` | Al abrir el editor (`/`), una vez | Preparar el editor, o mandar al visitante a otro sitio |
| `mundo-autoarranque` | Al abrir **cualquier** mundo | El comportamiento común a todos los mapas |
| `mundo-<mapa>` | Al abrir **ese** mundo, justo después del global | Lo que solo vale en ese mapa |
| `arranque-<mapa>`, o si no `arranque-intro` | Solo con **`?intro=1`** en la URL | La intro: sobrevuelo y menú |

El orden importa: **el global va primero y el del mapa después**, así que el del mapa hereda todo lo
que aquél dejó puesto y puede corregirlo. La intro va aparte y solo si la URL la pide.

---

## 1 · Global: `mundo-autoarranque`

Corre en todos los mapas. Es donde vive lo que define «cómo se juega» en VoxelForge: que el hielo
resbale, que las escaleras se trepen, que una placa reaccione al pisarla.

```js
game.bloques.define('hab:escalera', { trepable:true, subida:4, bajada:5 });
game.bloques.define('hab:placa',    { alPisar(c){ /* c.quien = 'jugador' | 'agente' */ } });
game.bloques.define('hab:hielo',    { velocidad:2, deslizamiento:1.2 });
```

> ⚠️ Es el único snippet **protegido**: el servidor no lo deja borrar. También es, con diferencia, el
> más grande del proyecto. Se **parchea**, no se reescribe.

## 2 · Por mapa: `mundo-<mapa>`

Mismo punto de extensión, con nombre de mapa. `/map/default` busca `mundo-default`, `/map/fps` busca
`mundo-fps`. Si no existe, no pasa nada y **no se avisa de nada**: lo normal es que un mapa no tenga
snippet propio.

Existe por un motivo muy concreto. Hay comportamientos que **solo tienen sentido donde está la
pieza**: `mirar` funciona sobre estructuras estampadas, así que definirlo en el snippet global
llenaba la consola de avisos legítimos en todos los mapas donde esa cabeza no está plantada.

```js
game.bloques.define('asset:assets/cabeza.vox.json', {
  mirar: { ejes:'xy', limites:{ y:[-70, 70], x:[-25, 25] }, alcance:12 }
});

game.bloques.define('asset:assets/brazo.vox.json', {
  mirar: { ejes:'xy', alcance:12, pivote:1,
           frente:{ x:-90 }, limites:{ y:[-180, 180], x:[30, 90] }, sinVolteo:true }
});
```

*(Éste es `mundo-default` entero: la cabeza y el brazo que siguen al jugador están plantados en
`/map/default` y en ningún otro sitio.)*

Y como corre después del global, aquí también es donde se le lleva la contraria a lo común:

```js
if (mcMapName() === 'hielo_total') game.bloques.define('hab:piedra', { deslizamiento:1.2 });
```

## 3 · La intro: `?intro=1`

La intro **no corre nunca sola**. Hace falta pedirla en la URL —`/map/fps?intro=1`— y entonces se
busca `arranque-fps`; si no existe, se usa el genérico `arranque-intro`. Ese respaldo es un respaldo
de verdad y no una copia: hoy solo existe el genérico, así que arreglarlo los arregla todos.

Lo que ve quien abre esa URL es la cámara sobrevolando el mapa **ya renderizado**, en tiempo real,
con un menú encima. Son tres piezas.

### a) Desmontar la anterior y montar el bucle

```js
if (mc._intro && mc._intro.parar) mc._intro.parar();

const CFG = { radio: Math.min(mc.dim.x, mc.dim.z) * 0.30, alturaOjo: 16,
              vueltaSeg: 120, pitch: -16 * Math.PI / 180, suavizado: 0.03 };

const cx = mc.dim.x / 2, cz = mc.dim.z / 2;

const intro = mc._intro = {
  raf: 0, t0: performance.now(), y: null, viva: true,
  parar(){ if(!this.viva) return; this.viva = false;
           if(this.raf) cancelAnimationFrame(this.raf);
           if(mc._intro === this) mc._intro = null; }
};

game.volar(true);
game.fantasma(true);        // un pino a media altura no puede parar la órbita

function paso(){
  if(!intro.viva) return;
  const a = (performance.now() - intro.t0) / 1000 * 2 * Math.PI / CFG.vueltaSeg;
  mc.pos[0] = cx + Math.cos(a) * CFG.radio;
  mc.pos[2] = cz + Math.sin(a) * CFG.radio;
  mc.vel = [0, 0, 0];
  mc.yaw   = Math.atan2(-(cx - mc.pos[0]), -(cz - mc.pos[2]));   // siempre mirando al centro
  mc.pitch = CFG.pitch;
  intro.raf = requestAnimationFrame(paso);
}
intro.raf = requestAnimationFrame(paso);
```

Todo está escrito contra `mc.dim`, así que **se orienta solo en un mapa que no ha visto nunca**: dar
intro a un mundo nuevo no cuesta tocar nada.

### b) El menú

```js
game.osd.define('intro', {
  html: '<div class="mc-osd-panel">'
      +   '<div class="mc-osd-title">VoxelForge v1.0</div>'
      +   '<button class="mc-osd-btn">JUGAR</button>'
      +   '<button class="mc-osd-btn">CONSTRUIR</button>'
      + '</div>'
});
```

### c) Las acciones

```js
function cima(x, z){                       // la superficie de la columna: dónde aterrizar
  x = Math.floor(x); z = Math.floor(z);
  if(!mcInside(x, 0, z)) return -1;
  for(let y = mc.dim.y - 1; y >= 0; y--) if(mc.grid[mcIdx(x, y, z)]) return y;
  return -1;
}

function jugar(){
  intro.parar();
  game.fantasma(false);
  game.volar(false);
  const x = Math.floor(mc.pos[0]), z = Math.floor(mc.pos[2]);
  mc.pos = [x + 0.5, cima(x, z) + 1, z + 0.5];
  mc.vel = [0, 0, 0];
  mcUnstick();
  game.osd.cerrar();
}

game.osd.alPulsar('JUGAR', jugar, { intro, cima });
game.osd.abrir('intro');
```

Tres cosas que cuesta caro romper aquí:

- **Ninguno de los dos botones recarga la página.** El mapa ya está cargado y ésa era toda la gracia:
  JUGAR aterriza en el sitio, CONSTRUIR cierra el Mundo y descubre el editor, que está debajo en la
  misma página.
- **La captura del ratón va DENTRO del manejador del clic.** Es un gesto de usuario; pedirla tras un
  `await` o un `requestAnimationFrame` la rechaza el navegador y el jugador aterriza sin poder mirar.
- Se aterriza escribiendo `mc.pos` y llamando a `mcUnstick()` en vez de con `game.tp`, solo para no
  soltarle un toast «Saltaste a 64,20,64» en la cara a quien acaba de entrar.

## 4 · Un menú propio, con estado

Los botones se identifican **por su texto**, lo que deja un cabo suelto útil: si el texto cambia
(«VOLAR: ON» ⇄ «VOLAR: OFF»), el botón dejaría de encontrar su acción. Para eso está `data-osd`, que
fija la acción aunque la etiqueta diga otra cosa.

```js
const htmlVolar = () =>
  '<div class="mc-osd-panel">'
  + '<div class="mc-osd-title">Mi menú</div>'
  + '<button class="mc-osd-btn" data-osd="VOLAR">VOLAR: ' + (game.volar.valueOf() ? 'ON' : 'OFF') + '</button>'
  + '<button class="mc-osd-btn">REGRESAR</button>'
  + '</div>';

game.osd.define('mi_menu_volar', { sitio:'abajo-derecha', html: htmlVolar() });

game.osd.alPulsar('VOLAR',    () => { game.volar(); game.osd.html(htmlVolar()); });
game.osd.alPulsar('REGRESAR', () => game.osd.conmutar('mi_menu'));
game.osd.alPulsar('AJUSTES',  () => game.osd.conmutar('mi_menu_volar'));

game.onKey('o', () => game.osd.abrir('mi_menu'));
```

`game.osd.html()` repinta **solo el panel**: si la pantalla lleva un mapa de fondo, volver a abrirla
remontaría el `<iframe>` y se vería el pestañeo.

## 5 · Encuadrar una pantalla que es otro mundo

Una pantalla puede tener detrás un mapa de verdad corriendo. El encuadre no se calcula: se vuela
hasta que se ve bien y se copia.

```js
// vuela (F) hasta la vista que quieras y, en la consola F12:
game.osd.encuadre();
// → game.osd.define('menu', {mapa:'voxelforge', pos:[55.66, 3.96, 63.37], yaw:0, pitch:-26});
```

```js
const encuadre = { pos:[55.66, 3.96, 63.37], yaw:0, pitch:-26 };

game.osd.define('mi_menu', {
  mapa: 'voxelforge',
  pos: encuadre.pos, yaw: encuadre.yaw, pitch: encuadre.pitch,
  sitio: 'abajo-derecha',
  html: '<div class="mc-osd-panel">'
      +   '<div class="mc-osd-title">Mi menú</div>'
      +   '<button class="mc-osd-btn">CONSTRUIR</button>'
      +   '<button class="mc-osd-btn">JUGAR</button>'
      + '</div>'
});
```

Pasar de `{html:…}` a `{mapa:…}` **no toca ni una de las acciones**: lo que cambia es el dibujo, no
quién responde. Ésa es toda la razón de identificar los botones por texto.

## 6 · Mandar a alguien a la intro desde el editor

`editor-autoarranque` corre al abrir `/`. Entero, es esto:

```js
location.href = '/map/empty?intro=1';
```

> ⚠️ Por eso **un test que entre por `/` tiene que pedir `?noauto=1`**: sin esa escotilla acaba en
> otro mapa y falla con un error que no se parece en nada a la causa.
