/* Wiki de VoxelForge · /wiki
 *
 * Sin dependencias, sin compilación y sin servidor propio: el contenido son ficheros Markdown en
 * wiki/paginas/ y la referencia de API es wiki/api.json, servidos como estáticos. Se editan y se
 * recarga la página — misma regla que el resto del repo, donde no hay paso de build.
 *
 * Tres piezas:
 *   1. Enrutador por HASH (#/pagina, #/api, #/api/<nombre>). Va por hash a propósito: así el
 *      servidor solo tiene que servir wiki/index.html en /wiki y no hay que tocar server.py ni
 *      arriesgarse a chocar con los estáticos que cuelgan de /wiki/.
 *   2. Un renderizador de Markdown de andar por casa: lo justo que usan las páginas (encabezados,
 *      listas, tablas, citas, bloques de código, negrita, enlaces). No es CommonMark ni lo pretende.
 *   3. El ENLAZADO AUTOMÁTICO, que es lo que da valor a todo esto: cualquier nombre que esté en
 *      api.json se convierte en enlace a su ficha allá donde aparezca dentro de un `code`. Por eso
 *      documentar una API es añadirla a api.json y nada más: los ejemplos se enlazan solos.
 */
'use strict';

const PAGINAS = 'paginas/';
let API = [];                 // entradas de api.json, en su orden
let APIPOR = {};              // nombre → entrada
let APIRE  = null;            // regex de todos los nombres, para el enlazado automático
let INDICE = null;
let RUTA   = '';

const $  = s => document.querySelector(s);
const escapa = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                             .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ── enlazado automático ──────────────────────────────────────────────────────────────────────
 * Se aplica sobre HTML YA ESCAPADO. Los nombres de API solo llevan [\w.], así que no pueden caer
 * dentro de una entidad (&amp;) ni romperla. El orden importa: de más largo a más corto, para que
 * `game.osd.define` gane a `game.osd`; y las guardas de los lados impiden que `mc.pos` se enlace
 * dentro de `mc.position`. `salvo` evita que una ficha se enlace a sí misma en cada línea. */
function enlazaAPI(htmlEscapado, salvo){
  if(!APIRE) return htmlEscapado;
  return htmlEscapado.replace(APIRE, nombre => {
    if(nombre === salvo) return nombre;
    return '<a class="apiref" href="#/api/' + encodeURIComponent(nombre) + '">' + nombre + '</a>';
  });
}
function compilaAPIRE(){
  const nombres = API.map(e => e.nombre).sort((a,b) => b.length - a.length)
                     .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  APIRE = nombres.length ? new RegExp('(?<![\\w.$])(' + nombres.join('|') + ')(?![\\w.$])', 'g') : null;
}

/* ── Markdown ─────────────────────────────────────────────────────────────────────────────── */

// Nivel de línea. Los `code` se apartan a un marcador ANTES de nada: dentro no se toca ni se escapa
// dos veces, y a cambio el resto (negrita, enlaces) puede cruzarlos —«**`?intro=1`**» es negrita de
// una sola palabra que resulta ser código, y partiendo por el acento grave nunca casaba—.
// [[nombre]] es el atajo para citar una API; se usa mucho en api.json.
const MARCA = '\u0000';   // no puede salir en un .md, así que no choca con el texto de nadie
function enLinea(txt, salvo){
  const codigos = [];
  let t = String(txt).replace(/`([^`]*)`/g, (m, c) =>
        MARCA + (codigos.push('<code>' + enlazaAPI(escapa(c), salvo) + '</code>') - 1) + MARCA);
  t = escapa(t);
  t = t.replace(/\[\[([^\]]+)\]\]/g, (m, n) =>
        '<a href="#/api/' + encodeURIComponent(n.trim()) + '"><code>' + escapa(n.trim()) + '</code></a>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt2, url) => '<a href="' + url + '">' + txt2 + '</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return t.replace(new RegExp(MARCA + '(\\d+)' + MARCA, 'g'), (m, i) => codigos[+i]);
}

function bloqueCodigo(code, salvo){
  return '<pre><code>' + enlazaAPI(escapa(code), salvo) + '</code></pre>';
}

function md(texto, salvo){
  const lineas = String(texto).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0, lista = null, listaAbre = -1;      // lista = 'ul' | 'ol' | null; listaAbre = dónde quedó su <ul>/<ol>

  const cierraLista = () => { if(lista){ out.push('</' + lista + '>'); lista = null; listaAbre = -1; } };
  const abreLista = t => { if(lista !== t){ cierraLista(); listaAbre = out.push('<' + t + '>') - 1; lista = t; } };
  // Lista «suelta» (puntos separados por un blanco): se le pone la clase para que respire. Hay que reescribir
  // la etiqueta que ya se emitió, porque la looseness no se sabe hasta que aparece el blanco.
  const listaSuelta = () => { if(listaAbre >= 0) out[listaAbre] = '<' + lista + ' class="suelta">'; };

  while(i < lineas.length){
    const l = lineas[i];

    if(/^```/.test(l)){                          // bloque de código
      cierraLista();
      const buf = [];
      for(i++; i < lineas.length && !/^```/.test(lineas[i]); i++) buf.push(lineas[i]);
      i++;
      out.push(bloqueCodigo(buf.join('\n'), salvo));
      continue;
    }
    // Línea en blanco. OJO: no cierra la lista si lo siguiente es otro punto DEL MISMO tipo — eso es una
    // lista «suelta» de Markdown (items separados por un blanco), y cerrarla abría un <ol> nuevo por punto,
    // así que los diez mandamientos de #/ley-de-la-luz salían numerados «1. 1. 1.» en vez de «1. 2. 3.».
    if(!l.trim()){
      let j=i; while(j<lineas.length && !lineas[j].trim()) j++;
      const sig = j<lineas.length ? /^\s*([-*]|\d+\.)\s+/.exec(lineas[j]) : null;
      const mismo = sig && lista === (/^\d/.test(sig[1]) ? 'ol' : 'ul');
      if(mismo) listaSuelta(); else cierraLista();
      i++; continue;
    }
    if(/^-{3,}$/.test(l.trim())){ cierraLista(); out.push('<hr>'); i++; continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if(h){
      cierraLista();
      const n = Math.min(3, h[1].length);
      out.push('<h' + n + '>' + enLinea(h[2], salvo) + '</h' + n + '>');
      i++; continue;
    }

    if(/^>\s?/.test(l)){                          // cita (varias líneas seguidas = un solo bloque)
      cierraLista();
      const buf = [];
      for(; i < lineas.length && /^>\s?/.test(lineas[i]); i++) buf.push(lineas[i].replace(/^>\s?/, ''));
      out.push('<blockquote><p>' + enLinea(buf.join(' '), salvo) + '</p></blockquote>');
      continue;
    }

    // Tabla: una fila con | y debajo el separador |---|---|
    if(l.indexOf('|') >= 0 && i + 1 < lineas.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(lineas[i+1])){
      cierraLista();
      const celdas = fila => fila.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      const cab = celdas(l);
      i += 2;
      const filas = [];
      for(; i < lineas.length && lineas[i].indexOf('|') >= 0 && lineas[i].trim(); i++) filas.push(celdas(lineas[i]));
      out.push('<table><thead><tr>' + cab.map(c => '<th>' + enLinea(c, salvo) + '</th>').join('') + '</tr></thead><tbody>'
             + filas.map(f => '<tr>' + f.map(c => '<td>' + enLinea(c, salvo) + '</td>').join('') + '</tr>').join('')
             + '</tbody></table>');
      continue;
    }

    const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(l);
    if(li){
      abreLista(/^\d/.test(li[1]) ? 'ol' : 'ul');
      // Una entrada de lista puede seguir en la línea de abajo si va sangrada.
      let txt = li[2];
      while(i + 1 < lineas.length && /^\s{2,}\S/.test(lineas[i+1]) && !/^\s*([-*]|\d+\.)\s/.test(lineas[i+1])){
        i++; txt += ' ' + lineas[i].trim();
      }
      out.push('<li>' + enLinea(txt, salvo) + '</li>');
      i++; continue;
    }

    cierraLista();                                 // párrafo: hasta la línea en blanco
    const buf = [];
    for(; i < lineas.length && lineas[i].trim() && !/^(```|>|#{1,4}\s)/.test(lineas[i])
          && !/^\s*([-*]|\d+\.)\s/.test(lineas[i]); i++) buf.push(lineas[i]);
    out.push('<p>' + enLinea(buf.join(' '), salvo) + '</p>');
  }
  cierraLista();
  return out.join('\n');
}

/* ── páginas de API ───────────────────────────────────────────────────────────────────────── */

function fichaAPI(e){
  const p = [];
  p.push('<h1>' + escapa(e.nombre) + '</h1>');
  if(e.grupo) p.push('<div class="grupo">' + escapa(e.grupo) + '</div>');
  p.push('<div class="firma">' + enlazaAPI(escapa(e.firma), e.nombre) + '</div>');
  p.push('<p class="resumen">' + enLinea(e.resumen, e.nombre) + '</p>');

  if(e.params && e.params.length){
    p.push('<h2>Parámetros</h2><table class="params"><thead><tr><th>Nombre</th><th>Tipo</th><th>Qué es</th></tr></thead><tbody>');
    for(const a of e.params)
      p.push('<tr><td>' + escapa(a.nombre) + '</td><td class="tipo">' + escapa(a.tipo || '')
           + '</td><td>' + enLinea(a.desc || '', e.nombre) + '</td></tr>');
    p.push('</tbody></table>');
  }
  if(e.devuelve) p.push('<h2>Devuelve</h2><p>' + enLinea(e.devuelve, e.nombre) + '</p>');
  if(e.ejemplo)  p.push('<h2>Ejemplo</h2>' + bloqueCodigo(e.ejemplo, e.nombre));
  if(e.notas && e.notas.length)
    p.push('<h2>Detalles que cuestan caro</h2><ul>'
         + e.notas.map(n => '<li>' + enLinea(n, e.nombre) + '</li>').join('') + '</ul>');
  if(e.ver && e.ver.length)
    p.push('<h2>Ver también</h2><p>' + e.ver.map(n =>
      '<a href="#/api/' + encodeURIComponent(n) + '"><code>' + escapa(n) + '</code></a>').join(' · ') + '</p>');
  if(e.fuente) p.push('<p class="meta">Implementación: <code>' + escapa(e.fuente) + '</code> '
                    + '— la línea exacta, en <code>SYMBOLS.md</code>.</p>');
  return p.join('\n');
}

function indiceAPI(filtro){
  const f = (filtro || '').trim().toLowerCase();
  const casa = e => !f || e.nombre.toLowerCase().indexOf(f) >= 0 || (e.resumen || '').toLowerCase().indexOf(f) >= 0;
  const grupos = [];
  for(const e of API){
    if(!casa(e)) continue;
    let g = grupos.find(x => x.titulo === (e.grupo || 'Otras'));
    if(!g) grupos.push(g = { titulo: e.grupo || 'Otras', items: [] });
    g.items.push(e);
  }
  const p = ['<h1>Referencia de API</h1>',
    '<p>Todo lo que aparece en los ejemplos del wiki está aquí. Los nombres dentro de un bloque de '
    + 'código <strong>son enlaces</strong>: se pulsa el que interese y se llega a esta misma ficha.</p>'];
  if(!grupos.length) p.push('<p class="cargando">Nada casa con «' + escapa(filtro) + '».</p>');
  for(const g of grupos){
    p.push('<h2>' + escapa(g.titulo) + '</h2><div class="tarjetas">');
    for(const e of g.items)
      p.push('<a class="tarjeta" href="#/api/' + encodeURIComponent(e.nombre) + '"><b>' + escapa(e.firma)
           + '</b><span>' + escapa(e.resumen) + '</span></a>');
    p.push('</div>');
  }
  return p.join('\n');
}

/* ── panel lateral ────────────────────────────────────────────────────────────────────────── */

function pintaNav(){
  const f = ($('#buscar').value || '').trim().toLowerCase();
  const html = [];
  let algo = false;
  for(const sec of INDICE.secciones){
    const filas = [];
    for(const pag of sec.paginas){
      const esAPI = pag.tipo === 'api';
      if(!f || pag.titulo.toLowerCase().indexOf(f) >= 0 || (esAPI && API.some(e => e.nombre.toLowerCase().indexOf(f) >= 0))){
        filas.push('<a href="#/' + pag.id + '" data-ruta="' + pag.id + '">' + escapa(pag.titulo) + '</a>');
      }
      // Las fichas de API se despliegan bajo su entrada cuando estás en ellas o cuando buscas algo:
      // 36 nombres siempre a la vista serían ruido, y escondidos del todo, invisibles.
      if(esAPI && (f || RUTA.indexOf('api') === 0)){
        for(const e of API){
          if(f && e.nombre.toLowerCase().indexOf(f) < 0 && (e.resumen || '').toLowerCase().indexOf(f) < 0) continue;
          filas.push('<a class="api" href="#/api/' + encodeURIComponent(e.nombre) + '" data-ruta="api/'
                   + e.nombre + '">' + escapa(e.nombre) + '</a>');
        }
      }
    }
    if(!filas.length) continue;
    algo = true;
    html.push('<div class="sec">' + escapa(sec.titulo) + '</div>', filas.join(''));
  }
  if(!algo) html.push('<div class="vacio">Nada casa con «' + escapa(f) + '».</div>');
  $('#nav').innerHTML = html.join('');
  for(const a of $('#nav').querySelectorAll('a'))
    if(a.dataset.ruta === RUTA) a.classList.add('activo');
}

/* ── enrutador ────────────────────────────────────────────────────────────────────────────── */

async function pinta(){
  const cuerpo = $('#cuerpo');
  RUTA = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')) || INDICE.secciones[0].paginas[0].id;

  if(RUTA === 'api' || RUTA.indexOf('api/') === 0){
    const nombre = RUTA.indexOf('api/') === 0 ? RUTA.slice(4) : '';
    if(!nombre){
      cuerpo.innerHTML = indiceAPI($('#buscar').value);
      document.title = 'API · Wiki · VoxelForge';
    }else if(APIPOR[nombre]){
      cuerpo.innerHTML = fichaAPI(APIPOR[nombre]);
      document.title = nombre + ' · Wiki · VoxelForge';
    }else{
      cuerpo.innerHTML = '<h1>No existe</h1><p>No hay ficha de <code>' + escapa(nombre)
                       + '</code>. <a href="#/api">Ver toda la API</a>.</p>';
    }
  }else{
    let pag = null;
    for(const s of INDICE.secciones) for(const p of s.paginas) if(p.id === RUTA) pag = p;
    if(!pag){
      cuerpo.innerHTML = '<h1>No existe</h1><p>No hay página <code>' + escapa(RUTA) + '</code>.</p>';
    }else{
      cuerpo.innerHTML = '<p class="cargando">Cargando…</p>';
      try{
        const r = await fetch(PAGINAS + pag.id + '.md', { cache:'no-store' });
        if(!r.ok) throw new Error(r.status + ' ' + r.statusText);
        cuerpo.innerHTML = md(await r.text(), null);
        document.title = pag.titulo + ' · Wiki · VoxelForge';
      }catch(e){
        cuerpo.innerHTML = '<h1>' + escapa(pag.titulo) + '</h1><p>No se pudo cargar <code>'
                         + escapa(PAGINAS + pag.id + '.md') + '</code>: ' + escapa(e.message) + '</p>';
      }
    }
  }
  pintaNav();
  $('#doc').scrollTop = 0;
  window.scrollTo(0, 0);
}

(async () => {
  try{
    const [ind, api] = await Promise.all([
      fetch('indice.json', { cache:'no-store' }).then(r => r.json()),
      fetch('api.json',    { cache:'no-store' }).then(r => r.json())
    ]);
    INDICE = ind;
    API = api.entradas || [];
    for(const e of API) APIPOR[e.nombre] = e;
    compilaAPIRE();
  }catch(e){
    $('#cuerpo').innerHTML = '<h1>Wiki</h1><p>No se pudieron cargar los datos: ' + escapa(e.message)
      + '</p><p>¿Está corriendo <code>python3 server.py 8500</code>?</p>';
    return;
  }
  $('#buscar').addEventListener('input', () => {
    pintaNav();
    if(RUTA === 'api') $('#cuerpo').innerHTML = indiceAPI($('#buscar').value);
  });
  window.addEventListener('hashchange', pinta);
  await pinta();
})();
