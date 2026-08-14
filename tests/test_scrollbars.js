// @area: general
// @necesita: node
//
// El tema de las barras de scroll vive en UN solo fichero, `scrollbars.css`, y cada página del
// sitio lo enlaza. El fallo que este guardián busca no es de color —eso se mide con
// `performance/sonda_scrollbars.js` en un navegador de verdad— sino el de calendario: que dentro de
// seis meses alguien añada una página y se olvide del <link>, y ese rincón del sitio se quede con
// las barras claras del sistema sobre fondo #0e1016.
//
// Se lee de disco, sin servidor: es un test de Node puro y tarda milisegundos.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

// Las páginas que SIRVE el sitio. Los mockups (`*_propuesta.html`) y los catálogos generados de
// `assets/*_mock/` quedan fuera a propósito: no son producto y nadie navega por ellos.
const PAGINAS = ['web/index.html', 'web/fotos.html', 'web/mapas.html', 'images/index.html', 'wiki/index.html'];

const css = path.join(RAIZ, 'web', 'scrollbars.css');
ok(fs.existsSync(css), 'existe scrollbars.css');
const t = fs.readFileSync(css, 'utf8');

// Un tema sirve para algo solo si define las dos piezas: dónde está el pulgar y sobre qué carril.
ok(/--scroll-thumb\s*:/.test(t), 'define --scroll-thumb (el pulgar, que es lo que hay que ver)');
ok(/--scroll-track\s*:/.test(t), 'define --scroll-track (la canaleta)');
ok(/scrollbar-color\s*:/.test(t), 'usa la propiedad estándar scrollbar-color (la que manda hoy)');
ok(/::-webkit-scrollbar\b/.test(t), 'y deja el respaldo ::-webkit-scrollbar para los motores viejos');
ok(/color-scheme\s*:\s*dark/.test(t), 'declara color-scheme:dark, para lo que se escape del tema');

// El pulgar tiene que DESTACAR sobre la canaleta: si alguien los acerca, deja de verse dónde está
// el scroll, que es justo lo que pidió el dueño. Se compara el brillo de los dos grises.
const hex = (v) => { const m = t.match(new RegExp('--scroll-' + v + '\\s*:\\s*#([0-9a-f]{6})', 'i'));
                     return m ? parseInt(m[1], 16) : null; };
const luma = (n) => 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
const [th, tr] = [hex('thumb'), hex('track')];
ok(th !== null && tr !== null, 'los dos colores son hex literales, legibles desde aquí');
ok(luma(th) - luma(tr) >= 20,
   'el pulgar destaca sobre la canaleta (Δbrillo ' + (luma(th) - luma(tr)).toFixed(1) + ' ≥ 20)');
ok(luma(th) < 140, 'pero sigue siendo gris oscuro, no un pulgar claro (brillo ' + luma(th).toFixed(1) + ')');

for(const p of PAGINAS){
  const html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
  const enlace = /<link[^>]+href=["']\/scrollbars\.css["']/.test(html);
  ok(enlace, p + ' enlaza /scrollbars.css (por ruta absoluta)');
}

console.log(fallos ? '\nFALLOS: ' + fallos : '\nOK');
process.exit(fallos ? 1 : 0);
