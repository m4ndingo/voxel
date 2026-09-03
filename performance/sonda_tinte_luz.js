// ────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿DE DÓNDE SALE EL TINTE? · bisección de la iluminación en 4 fases
//
// Síntoma (2026-09-03): «los azules tienden a verdosos y los blancos a amarillentos» — un tinte
// CÁLIDO global = el canal azul pierde. Por la Ley de la Luz eso solo puede venir de:
//   · un mando de exposición/sombra pegado (game.luz, glowGain, sunShade… — ⚠️ PERSISTEN en
//     localStorage: un valor de una prueba vieja sobrevive al reload y nadie lo recuerda)
//   · la luz dinámica (un emisor cálido EN LA MANO tiñe todo lo que miras — Mandamiento 4)
//   · la luz de bloque quieta (emisores nuevos en el mapa: caras `*#…` de assets recién tocados)
//   · o NADA de eso: textura/CSS (y entonces `fast` no lo quita).
//
// CUATRO FASES de 4 s — MIRA LA PANTALLA y apunta EN CUÁL desaparece el tinte:
//   A · normal                     (referencia)
//   B · renderMode='fast'          sin luces ni sombras → si el tinte SIGUE, no es iluminación
//   C · mc.luzDinamica=false       → si desaparece aquí, es un emisor móvil o el de la mano
//   D · mc._skipBlockLight=true    → si desaparece aquí, son los emisores QUIETOS del mapa
// Al final: volcado de TODOS los mandos de luz + claves de localStorage + filtros CSS del canvas
// + inventario de emisores. Restaura todo al terminar. Reimprimir: sondaTinte.tabla()
//
// ⚠️ B y D re-mallan chunks al entrar y salir (el sombreado va horneado en las VBO): el tirón
// de un segundo al cambiar de fase es normal y no es el tinte.
// ────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  const cartel = document.createElement('div');
  cartel.style.cssText = 'position:fixed;top:12%;left:0;right:0;text-align:center;z-index:99999;' +
    'font:bold 26px monospace;color:#fff;text-shadow:0 0 8px #000;pointer-events:none';
  document.body.appendChild(cartel);
  const di = (t) => { cartel.textContent = t; console.log('[tinte] ' + t); };

  const mandos = {};
  const NOMBRES = ['luz', 'glowGain', 'glowLevel', 'glowFocus', 'interiorDark', 'sunShade',
                   'sunShadeNoche', 'shadowSuave', 'renderMode', 'cacheStrict'];
  NOMBRES.forEach((n) => { try { mandos['game.' + n] = game[n]; } catch (e) {} });
  ['luzDinamica', 'sunShade', 'interiorDark', '_skipBlockLight', 'hasGlow'].forEach((n) => {
    try { mandos['mc.' + n] = mc[n]; } catch (e) {}
  });

  const guardado = { renderMode: game.renderMode, luzDin: mc.luzDinamica, skipBL: mc._skipBlockLight };
  let vivo = true;
  const restaurar = () => {
    if (!vivo) return;
    vivo = false;
    try { game.renderMode = guardado.renderMode || 'normal'; } catch (e) {}
    mc.luzDinamica = guardado.luzDin;
    mc._skipBlockLight = guardado.skipBL;
    cartel.remove();
  };

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    try {
      di('A · NORMAL — mira el tinte (4 s)'); await espera(4000);
      di('B · FAST (sin luces ni sombras) — ¿sigue el tinte? (4 s)');
      game.renderMode = 'fast'; await espera(4000);
      game.renderMode = guardado.renderMode || 'normal';
      di('C · LUZ DINÁMICA OFF — ¿se fue el tinte? (4 s)');
      mc.luzDinamica = false; await espera(4000);
      mc.luzDinamica = guardado.luzDin;
      di('D · LUZ DE BLOQUE OFF — ¿se fue el tinte? (4 s)');
      mc._skipBlockLight = true; await espera(4000);
      restaurar();

      const emisores = [];
      try {
        mc.structures.forEach((s, i) => {
          if (s.emitFinos && s.emitFinos.length) emisores.push(
            (s.nombre || s.id || s.asset || s.name || ('#' + i)) + ' (' + (s.emitFinos.length / 3) + ' celdas)');
        });
      } catch (e) {}
      const ls = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/luz|light|glow|shade|shadow|dark|render|gain|expos/i.test(k)) ls[k] = localStorage.getItem(k);
        }
      } catch (e) {}
      const css = {};
      try {
        const cv = document.querySelector('canvas');
        css.canvasFilter = cv ? getComputedStyle(cv).filter : '(sin canvas)';
        css.bodyFilter = getComputedStyle(document.body).filter;
        css.htmlFilter = getComputedStyle(document.documentElement).filter;
      } catch (e) {}
      let diag = null;
      try { diag = game.luz && game.luz.diag ? game.luz.diag() : '(no hay game.luz.diag)'; } catch (e) { diag = String(e); }

      window.sondaTinte = {
        mandos, emisores, ls, css, diag,
        tabla() {
          console.log('[tinte] mandos: ' + JSON.stringify(mandos));
          console.log('[tinte] localStorage (luz/render): ' + JSON.stringify(ls));
          console.log('[tinte] filtros CSS: ' + JSON.stringify(css));
          console.log('[tinte] emisores quietos con celdas finas: ' + (emisores.length ? emisores.join(' · ') : 'ninguno'));
          console.log('[tinte] game.luz.diag(): ' + (typeof diag === 'object' ? JSON.stringify(diag) : diag));
          console.log('[tinte] LÉELO ASÍ: el tinte desapareció en…');
          console.log('[tinte]   B (fast)        → es ILUMINACIÓN: sigue con C y D para partirla en dos');
          console.log('[tinte]   C (dinámica)    → emisor MÓVIL o la pieza en la MANO (¿espada?): suéltala y mira');
          console.log('[tinte]   D (bloque)      → emisores QUIETOS del mapa (¿cables `*` nuevos? ¿antorchas?)');
          console.log('[tinte]   en NINGUNA      → no es luz: textura del terreno o filtro CSS (mira arriba)');
          console.log('[tinte] JSON: ' + JSON.stringify({ mandos, ls, css, emisores }));
        }
      };
      sondaTinte.tabla();
    } catch (e) { restaurar(); console.error('[tinte]', e); }
  })();
})();
