// iconos.js — pone en la aplicación los iconos horneados en /images.
//
// La fuente de verdad NO está aquí: está en `data/ui/ranuras.json` (qué dibujo va en cada ranura)
// y en los `data/ui/<ranura>-<px>.png` que /images hornea a partir de él. Este fichero solo hace
// el cambiazo en el DOM.
//
// Tres reglas que cuesta caro romper:
//
// 1. **Si no hay nada publicado, esto no hace NADA.** Cada consumidor se queda con el icono de
//    siempre (el emoji del botón, el carácter `◧` de la marca). Un clon recién hecho, o una ranura
//    sin asignar, tienen que verse exactamente como antes: los iconos son un extra, no un
//    requisito de arranque.
// 2. **No se toca el texto de dentro del botón ni su `<i class="tool-swatch">`.** El emoji es un
//    nodo de texto suelto entre esos dos elementos; se sustituye ESE nodo y nada más, porque el
//    `<span>` es la etiqueta que lee el usuario y el `<i>` es la muestra de color que pinta app.js.
// 3. **El icono es decorativo**: `alt=""` y `aria-hidden`. El botón ya se anuncia por su `<span>`
//    y su `title`; un `alt` con el nombre de la herramienta lo diría dos veces.
//
// Se carga con `defer` y no exporta nada. Que falle (servidor caído, JSON roto) no puede impedir
// que arranque el editor: por eso todo va dentro de un `catch` que se traga el error.
(async () => {
  let ranuras;
  try{
    const r = await fetch('/api/ui');
    if(!r.ok) return;
    ranuras = await r.json();
  }catch(e){ return; }                       // sin servidor de iconos, los de siempre
  if(!ranuras || typeof ranuras !== 'object') return;

  const hay = id => Object.prototype.hasOwnProperty.call(ranuras, id);
  const img = (src, px) => {
    const i = document.createElement('img');
    i.src = src; i.width = px; i.height = px; i.alt = ''; i.setAttribute('aria-hidden', 'true');
    i.className = 'icono-horneado';
    return i;
  };

  // ── la marca de la cabecera ────────────────────────────────────────────────
  if(hay('marca')){
    const m = document.querySelector('.brand-mark');
    // Se vacía y se rellena en vez de `innerHTML=`: `.brand-mark` puede llevar estilos que dependan
    // de ser el mismo nodo (y así el carácter vuelve solo si algún día se quita la ranura).
    // 24 px en pantalla a partir del PNG de 64: el carácter `◧` que sustituye va a 22 px
    // (`.brand-mark`), y de sobra le viene resolución para una pantalla densa.
    if(m){ m.textContent = ''; m.appendChild(img('/data/ui/marca-64.png', 24)); }
  }

  // ── las once herramientas, en las DOS barras ───────────────────────────────
  // `#tools` y `#tool-float` llevan las mismas once en distinto orden, así que se busca por
  // `data-tool` y no por posición: da igual el orden y da igual que mañana haya una tercera barra.
  for(const b of document.querySelectorAll('.tool[data-tool]')){
    const id = 't-' + b.dataset.tool;
    if(!hay(id)) continue;
    // El emoji es el nodo de TEXTO no vacío que cuelga directo del botón. Los hijos elemento
    // (`<i class="tool-swatch">`, `<span>` con la etiqueta) se quedan donde están.
    const texto = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if(!texto.length) continue;
    b.replaceChild(img('/data/ui/' + id.replace(/^t-/, 'tool-') + '-32.png', 22), texto[0]);
    for(const sobra of texto.slice(1)) sobra.remove();
  }
})();
