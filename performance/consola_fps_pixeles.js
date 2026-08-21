// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿SE VA EL FRAME EN PÍXELES O EN OTRA COSA?
//
// La pregunta del dueño (2026-08-21): «hago el navegador muy pequeño, me muevo por un mapa grande, y los fps
// caen igual que maximizado. ¿No deberían caer menos a menos resolución?»
//
// La intuición es correcta pero sólo cubre MEDIO frame. Encoger la ventana quita píxeles de la PANTALLA, y en
// este motor hay tres cosas caras que no miden en píxeles de pantalla:
//
//   · EL MAPA DE SOMBRA. `game.shadowSize` = 2048 por defecto, o sea 2048×2048 = 4,2 MILLONES de téxeles, y
//     ese número NO SABE que has encogido la ventana: es el mismo maximizado que en un sello. Y andando se
//     rehornea cada `shadowMoveMs` (45 ms ⇒ ~22 veces por segundo), metiendo la geometría del mundo entera.
//   · LA GEOMETRÍA. Triángulos y llamadas de dibujo dependen de `renderDist` y del frustum, no del tamaño de
//     la ventana. Un mapa grande manda lo mismo en una ventana de sello.
//   · LA CPU. Física, agentes, snippets, el BFS de la luz, el mallado. Ni se enteran de la ventana.
//
// ⚠️ POR QUÉ LA PRIMERA VERSIÓN DE ESTA SONDA DABA UNA TABLA IMPOSIBLE (2026-08-21, tirada del dueño):
// pedía «anda mientras la corres» y medía las cuatro fases UNA DETRÁS DE OTRA. O sea que cada fase se medía
// en un SITIO DISTINTO del mapa. Salió referencia 145 fps y las otras tres a ~57, con quitar el mapa de
// sombra apareciendo como un −56 %: no es que quitar sombras cueste, es que para entonces él ya estaba
// dentro de Tilted Towers. Tres arreglos, y los tres son de método, no de código:
//
//   1 · EL PASEO LO CONDUCE EL SCRIPT, por índice de frame, igual que consola_luz_paseo.js. Las cuatro fases
//       recorren EXACTAMENTE el mismo camino. Cada fase publica su `firmaRuta`: si las cuatro no coinciden,
//       no anduvieron lo mismo y la tabla lo dice en vez de comparar peras con manzanas.
//   2 · RONDAS ALTERNAS: A B C D, A B C D, A B C D… y se toma la MEDIANA de las rondas. Si el motor se va
//       calentando o enfriando, la deriva le cae por igual a las cuatro en vez de sólo a las últimas.
//   3 · MEDIANA DEL TIEMPO DE FRAME, no media. Cambiar `renderScale` reasigna el framebuffer y ese frame
//       cuesta 30 ms; con media, ese pico solo ya movía el resultado. La mediana lo ignora, que es lo que
//       hay que hacer con un pico que no forma parte de lo que se mide.
//
// ⚠️ Y POR QUÉ LA SEGUNDA VERSIÓN TAMPOCO VALÍA (misma tarde). Ya con el paseo conducido, la tirada salió
// limpísima —cuatro rondas, dispersión de una décima— y aun así el veredicto era falso: «sin mapa de sombra
// +92,3 %» y «media distancia de dibujado +92,3 %», los dos EXACTAMENTE 140,8 fps. Dos cosas distintas no dan
// el mismo número por casualidad: era un panel de 144 Hz. Con vsync, pasarse del plazo (6,94 ms) por una
// décima te manda a la mitad de golpe, así que los fps no miden coste, miden EN QUÉ ESCALÓN caes. De ahí las
// dos cosas que trae la v3:
//   · el candado del vsync ya no pregunta si las fases están juntas (lo estaban por parejas), sino si cada
//     una cae en refresco/N. Si sí, se niega a dar porcentajes y lo dice.
//   · se miden además los MS DE JS de `mcRender` y de `mcRenderShadow`. Eso es trabajo, no espera, y el
//     vsync no lo topa: es la única columna que sigue significando algo con el reloj de pantalla de por medio.
//
// CÓMO QUITARSE EL VSYNC DE ENCIMA (lo preguntó el dueño; la respuesta honesta tiene dos mitades)
//
//   · DESACTIVARLO NO SE PUEDE DESDE LA PÁGINA. El reloj lo lleva el compositor del navegador y JavaScript no
//     lo alcanza; `requestAnimationFrame` no tiene mando. Se hace arrancando Chrome/Chromium así:
//
//         google-chrome --disable-gpu-vsync --disable-frame-rate-limit \
//                       --user-data-dir=/tmp/perfil-perf http://localhost:8500/map/<mapa>
//
//     El `--user-data-dir` aparte NO es un adorno: sin él, si ya tienes Chrome abierto, la orden se la come
//     la instancia que corre y las banderas se pierden sin decir nada. Con vsync fuera, los fps vuelven a ser
//     una medida continua y los porcentajes de esta sonda significan lo que dicen.
//
//   · FIJARLO A UN VALOR SÍ, con `game.fpsMax` (REQ-FPS1). Pero ojo con para qué sirve: pone un techo POR
//     DEBAJO del de la pantalla, nunca por encima. En una prueba se usa para PONERSE LEJOS DEL ESCALÓN —
//     `game.fpsMax=30` en un panel de 144 deja a todas las variantes cabiendo holgadas, y entonces lo que se
//     compara vuelve a ser el trabajo por frame en vez de a qué escalón del vsync cae cada una.
//
// CÓMO SE USA
//   await sondaPixeles()        · 3 rondas × 4 fases × 60 frames ≈ 15 s. No toques nada mientras corre.
//   await sondaPixeles(90, 4)   · 90 frames por fase, 4 rondas (más lento, más estable).
//   sondaPixeles.texto          · la última tabla como cadena.  sondaPixeles.crudo · los números.
//
// ⛔ NO andes tú: te lleva el script. Restaura posición, mirada, renderScale, sunShade, sunShadeNoche y
//    renderDist al terminar, también si peta. No toca `app.js`.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  'use strict';

  const CALIENTA = 15;   // frames de paseo que se tiran al entrar en una fase: el cambio de mando reasigna
                         // framebuffers y mete chunks nuevos en el frustum. Eso es el cambio, no la fase.

  const num = (v, d) => (+v || 0).toFixed(d == null ? 1 : d);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
  const mediana = a => { const b = a.slice().sort((x, y) => x - y); const n = b.length;
                         return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };

  // ── LA RUTA ────────────────────────────────────────────────────────────────────────────────────────────────
  // Copiada de consola_luz_paseo.js a propósito: las dos sondas tienen que andar IGUAL para que sus medidas se
  // puedan poner una al lado de la otra. Todo es función de `f`, el índice de frame — ni un performance.now()
  // aquí dentro, o el paseo dependería del fps, que es justo la variable que estamos midiendo.
  const RUTA = { largo: 24, paso: 0.04, giro: 30, periodo: 180 };

  function puntoDeRuta(f, org) {
    const s = f * RUTA.paso, ciclo = 2 * RUTA.largo;
    const u = s % ciclo, d = (u <= RUTA.largo) ? u : (ciclo - u);   // onda triangular: ida y vuelta
    const x = org.pos[0] + d, z = org.pos[2];
    const sx = Math.floor(x), sz = Math.floor(z);
    let y = org.pos[1];
    if (typeof mcSurfaceY === 'function' && typeof mcInside === 'function' && mcInside(sx, 0, sz)) {
      const surf = mcSurfaceY(sx, sz);
      if (surf >= 0) y = surf + 1;
    }
    const yaw = org.yaw + (RUTA.giro * Math.PI / 180) * Math.sin(2 * Math.PI * f / RUTA.periodo);
    return [x, y, z, yaw];
  }

  function firmaPunto(h, p) {
    for (let k = 0; k < 4; k++) h = (Math.imul(h ^ Math.round(p[k] * 256), 16777619)) >>> 0;
    return h;
  }

  // ── UNA TIRADA (una fase, una ronda) ───────────────────────────────────────────────────────────────────────
  // Devuelve la MEDIANA del tiempo de frame y la firma de lo andado. El paseo arranca siempre en el frame 0,
  // así que las cuatro fases de una ronda pisan exactamente los mismos puntos.
  // Los fps NO bastan cuando hay vsync: el reloj de pantalla los redondea a refresco/N y dos fases con costes
  // distintos salen con el MISMO número. Por eso cada tirada mide además los ms de JS que tarda `mcRender` y,
  // dentro de él, `mcRenderShadow`. Eso no lo topa el vsync: es tiempo de trabajo, no de espera. Se envuelven
  // por el nombre global, que es como los llama el motor (`mcRender()` en app.js:19598, `mcRenderShadow()` en
  // app.js:12509) — envolverlos de otra forma no interceptaría nada.
  function envuelve(nombre, dest) {
    const orig = window[nombre];
    if (typeof orig !== 'function') return () => {};
    window[nombre] = function () {
      const t = performance.now();
      try { return orig.apply(this, arguments); }
      finally { dest.push(performance.now() - t); }
    };
    return () => { window[nombre] = orig; };
  }

  function tirada(frames, org) {
    return new Promise(res => {
      const dts = [], msR = [], msS = [];
      const quitaR = envuelve('mcRender', msR), quitaS = envuelve('mcRenderShadow', msS);
      let n = 0, prev = 0, firma = 2166136261, peor = 0;
      const tick = t => {
        const p = puntoDeRuta(n, org);
        mc.pos[0] = p[0]; mc.pos[1] = p[1]; mc.pos[2] = p[2]; mc.yaw = p[3];
        if (n >= CALIENTA) {
          firma = firmaPunto(firma, p);
          if (prev) { const dt = t - prev; dts.push(dt); if (dt > peor) peor = dt; }
        }
        prev = t; n++;
        if (n < CALIENTA + frames + 1) { requestAnimationFrame(tick); return; }
        // El lienzo se lee AQUÍ, con el mando de la fase todavía puesto. En la primera versión se leía dentro
        // del objeto que se devolvía, o sea DESPUÉS de restaurar: la tabla enseñaba el tamaño de la fase
        // siguiente junto a los píxeles de ésta, y por eso decía «1920×913 … 0,11 M», que no cuadra ni de lejos.
        const cv = mc.canvas;
        quitaR(); quitaS();
        // `msS.length / msR.length` = qué fracción de los frames rehorneó el mapa de sombra. Con shadowMoveMs=45
        // a 144 Hz debería salir ~1 de cada 6,5. Si sale 1,00, es que se rehornea TODOS los frames y ahí hay otro
        // problema (algo marca el mapa como sucio sin parar).
        res({ dt: mediana(dts), peor, firma, w: cv ? cv.width : 0, h: cv ? cv.height : 0,
              msRender: mediana(msR), msSombra: mediana(msS), horneos: msR.length ? msS.length / msR.length : 0 });
      };
      requestAnimationFrame(tick);
    });
  }

  const FASES = [
    { id: 'ref', nombre: 'referencia (como está)', prep: null },
    { id: 'px',  nombre: '16× menos píxeles',      prep: () => { const v = game.renderScale; game.renderScale = 0.25;
                                                                 return () => { game.renderScale = v; }; } },
    // sunShade = 1 es «sin sombra» (mcRenderShadow sale por mcSunShadeEf()>=1). Hay que tocar TAMBIÉN el de
    // noche: con sunShadeNoche puesto, sunShade=1 deja sombra nocturna y la fase no mediría lo que dice medir.
    { id: 'som', nombre: 'sin mapa de sombra',     prep: () => { const a = game.sunShade, b = game.sunShadeNoche;
                                                                 game.sunShade = 1; try { game.sunShadeNoche = 1; } catch (e) {}
                                                                 return () => { game.sunShade = a;
                                                                   try { game.sunShadeNoche = b; } catch (e) {} }; } },
    { id: 'geo', nombre: 'media distancia de dibujado', prep: () => { const v = game.renderDist;
                                                                 game.renderDist = Math.max(2, Math.round(v / 2));
                                                                 return () => { game.renderDist = v; }; } },
  ];

  function tabla(R, rondas, frames) {
    const L = [];
    L.push('▶ ¿PÍXELES O NO? · ' + (game.mapName || '?') + ' · ' + rondas + ' rondas × ' + frames + ' frames, paseo conducido');
    L.push('');
    L.push('  ' + pad('fase', 32) + pad('fps', 8) + pad('rondas', 14) + pad('ms mcRender', 13) +
           pad('ms sombra', 11) + 'lienzo');
    L.push('  ' + '─'.repeat(92));
    for (const f of FASES) {
      const r = R[f.id], fps = r.fps;
      L.push('  ' + pad(f.nombre, 32) + pad(num(mediana(fps)), 8) +
             pad(num(Math.min(...fps)) + '–' + num(Math.max(...fps)), 14) +
             pad(num(mediana(r.msRender), 2), 13) +
             pad(mediana(r.horneos) > 0 ? num(mediana(r.msSombra), 2) : '—', 11) +
             r.w + '×' + r.h + '  (' + (r.w * r.h / 1e6).toFixed(2) + ' M)');
    }
    L.push('  (ms mcRender = trabajo de JS por frame, que el vsync NO topa. Es la columna que manda si los fps');
    L.push('   salen enganchados a un refresco. ms sombra = lo que cuesta rehornear el mapa, cuando toca.)');
    L.push('');

    // ── Los tres candados. Antes de dar un veredicto hay que poder defenderlo. ──
    const firmas = FASES.map(f => R[f.id].firma);
    if (new Set(firmas).size !== 1) {
      L.push('  ⛔ LAS FASES NO ANDUVIERON LO MISMO (firmas ' + firmas.join(', ') + '). Algo movió al jugador');
      L.push('     mientras medía —¿tocaste el teclado?, ¿un snippet lo empuja?—. La comparación NO vale.');
      return L.join('\n');
    }
    const ref = R.ref.fps, disp = (Math.max(...ref) - Math.min(...ref)) / mediana(ref);
    if (disp > 0.15) {
      L.push('  ⛔ MEDIDA INESTABLE: la referencia varió un ' + num(disp * 100) + ' % entre rondas (' +
             num(Math.min(...ref)) + '–' + num(Math.max(...ref)) + ' fps).');
      L.push('     Con ese ruido, cualquier diferencia de abajo puede ser casualidad. Cierra pestañas, deja de');
      L.push('     tocar el ratón y repite con más frames: await sondaPixeles(150, 4)');
      return L.join('\n');
    }
    // ── EL CANDADO DEL VSYNC (v2). El de la v1 pedía que las CUATRO fases estuvieran juntas, y por eso dejó
    // pasar la tirada del dueño de 2026-08-21: allí había DOS mesetas, 73,3 y 140,8 fps, cada una clavada a
    // una décima entre rondas. Eso no es que unas fases costaran el doble que otras — es un panel de 144 Hz
    // repartiendo las fases entre 144 y 144/2, que es lo que hace el vsync cuando te pasas del plazo por poco.
    // La prueba de que era un artefacto estaba en la propia tabla: dos fases distintas dieron 140,8 EXACTO.
    // Así que el candado ya no mira si las fases están juntas, sino si cada una cae en refresco/N.
    const dts = FASES.map(f => 1000 / mediana(R[f.id].fps));
    const rapido = Math.min(...dts);
    const REFRESCOS = [60, 75, 90, 100, 120, 144, 165, 240];
    const hz = REFRESCOS.find(r => Math.abs(rapido - 1000 / r) / (1000 / r) < 0.04);
    const enMeseta = hz && dts.every(d => { const k = d / (1000 / hz); return Math.abs(k - Math.round(k)) < 0.06; });
    if (enMeseta) {
      L.push('  ⚠️ VSYNC: tienes un panel de ~' + hz + ' Hz y las fases están cayendo en ' + hz + ', ' + (hz / 2) +
             ', ' + Math.round(hz / 3) + ' fps…, no donde de verdad');
      L.push('     les toca. Cuando te pasas del plazo por una décima de milisegundo, el vsync te manda a la');
      L.push('     mitad de golpe: por eso los saltos salen enormes (+92 %) y dos fases con costes distintos');
      L.push('     salen con el MISMO número. ⛔ LOS PORCENTAJES DE ABAJO NO SON EL COSTE DE NADA.');
      L.push('     Mira la columna «ms mcRender», que el vsync no topa, y compárala entre fases:');
      const base = mediana(R.ref.msRender);
      for (const f of FASES) {
        if (f.id === 'ref') continue;
        const m = mediana(R[f.id].msRender);
        L.push('       · ' + pad(f.nombre, 30) + num(m, 2) + ' ms  (' + (m < base ? '' : '+') +
               num(m - base, 2) + ' ms respecto a la referencia)');
      }
      L.push('     La buena noticia: estás JUSTO en el filo del plazo (' + num(1000 / hz, 2) + ' ms). Ahorrar unas');
      L.push('     décimas te dobla los fps de golpe; pasarte de unas décimas te los parte por la mitad.');
      return L.join('\n');
    }

    // ── El veredicto ──
    const base = mediana(R.ref.fps);
    const gan = id => (mediana(R[id].fps) / base - 1) * 100;
    const pct = g => (g >= 0 ? '+' : '') + num(g) + ' %';
    const gPx = gan('px'), gSom = gan('som'), gGeo = gan('geo');
    L.push('  Lo que gana cada cosa respecto a la referencia:');
    L.push('    · 16× menos píxeles de pantalla ....... ' + pct(gPx));
    L.push('    · sin mapa de sombra .................. ' + pct(gSom));
    L.push('    · la mitad de distancia de dibujado ... ' + pct(gGeo));
    L.push('');
    if (gPx < 15) {
      L.push('  ✅ EL FRAME NO SE VA EN PÍXELES. Dibujar 16 veces menos apenas mueve la aguja, así que encoger');
      L.push('     la ventana no te va a salvar nunca. Ojo: app.js:20055 afirma que el cuello de botella del');
      L.push('     Mundo es el fill-rate; para ESTE caso (mapa grande, andando) esa frase es falsa.');
    } else {
      L.push('  El fill-rate SÍ cuenta (' + pct(gPx) + ' con 16× menos píxeles). Si aun así la ventana pequeña no');
      L.push('     te ayudó, comprueba arriba que el lienzo baje de verdad al encogerla.');
    }
    L.push('');
    if (gSom > 20) {
      const tex = game.shadowSize * game.shadowSize, px = R.ref.w * R.ref.h;
      L.push('  🎯 EL MAPA DE SOMBRA: ' + pct(gSom) + ', y ' + num(mediana(R.ref.msSombra), 2) + ' ms de JS cada vez que');
      L.push('     se rehornea (' + num(mediana(R.ref.horneos) * 100) + ' % de los frames, con shadowMoveMs=' + game.shadowMoveMs + ').');
      L.push('     Mandos: game.shadowSize=' + (game.shadowSize / 2) + ' · game.shadowMoveMs=120 · game.sunShade=1 (apagarla).');
      // Coherencia: si el mapa de sombra tiene MENOS téxeles que la ventana píxeles, y quitar 16× de píxeles no
      // dio nada, entonces su coste no puede ser de relleno — será la geometría que re-dibuja, o la medida miente.
      if (tex < px && gPx < 15) {
        L.push('     ⚠️ Ojo: el mapa son ' + (tex / 1e6).toFixed(2) + ' M téxeles y tu ventana ' + (px / 1e6).toFixed(2) +
               ' M píxeles, o sea MENOS. Con');
        L.push('        16× menos píxeles dando ' + pct(gPx) + ', su coste no puede ser de relleno: es la GEOMETRÍA que');
        L.push('        vuelve a dibujar en la pasada de sombra. Bajar shadowSize no te va a ayudar; subir');
        L.push('        shadowMoveMs (menos pasadas) sí.');
      }
    }
    if (gGeo > 20) {
      L.push('  🎯 LA GEOMETRÍA: ' + pct(gGeo) + ' con media distancia ⇒ te comen los triángulos y las llamadas');
      L.push('     de dibujo. Mando: game.renderDist.');
    }
    if (gPx < 15 && gSom <= 20 && gGeo <= 20) {
      L.push('  🎯 NI PÍXELES, NI SOMBRA, NI GEOMETRÍA ⇒ el frame se va en CPU (física, agentes, snippets, luz,');
      L.push('     mallado). Eso lo reparte por función la otra sonda, que anda el MISMO paseo:');
      L.push('     performance/consola_luz_paseo.js → await sondaLuzPaseo(600).');
    }
    return L.join('\n');
  }

  async function sondaPixeles(frames, rondas) {
    frames = Math.max(30, frames | 0 || 60);
    rondas = Math.max(2, rondas | 0 || 3);
    if (typeof mc === 'undefined' || !mc.active || !mc.dim) { console.warn('sondaPixeles: no hay Mundo abierto'); return; }

    const org = { pos: [mc.pos[0], mc.pos[1], mc.pos[2]], yaw: mc.yaw, pitch: mc.pitch };
    const fin = puntoDeRuta(Math.round(RUTA.largo / RUTA.paso), org);
    if (fin[0] < 1 || fin[0] >= mc.dim.x - 1) {
      console.warn('sondaPixeles: la ruta se sale del mundo por el eje X (origen ' + num(org.pos[0]) +
                   ', largo ' + RUTA.largo + ', mundo ' + mc.dim.x + '). Ponte más al oeste.');
      return;
    }

    const R = {}; for (const f of FASES) R[f.id] = { fps: [], peor: [], msRender: [], msSombra: [], horneos: [],
                                                     firma: null, w: 0, h: 0 };
    console.log('%csondaPixeles: ' + rondas + ' rondas × ' + FASES.length + ' fases × ' + frames +
                ' frames. No toques nada.', 'color:#6cf');
    const restaurarTodo = [];
    try {
      for (let r = 0; r < rondas; r++) {
        for (const f of FASES) {
          let volver = () => {};
          if (f.prep) { volver = f.prep() || (() => {}); restaurarTodo.push(volver); }
          const t = await tirada(frames, org);
          try { volver(); } catch (e) {}
          restaurarTodo.pop();
          const a = R[f.id];
          a.fps.push(1000 / t.dt); a.peor.push(t.peor); a.msRender.push(t.msRender);
          a.msSombra.push(t.msSombra); a.horneos.push(t.horneos);
          a.firma = t.firma; a.w = t.w; a.h = t.h;
        }
      }
    } finally {
      for (const v of restaurarTodo) { try { v(); } catch (e) {} }
      mc.pos[0] = org.pos[0]; mc.pos[1] = org.pos[1]; mc.pos[2] = org.pos[2];
      mc.yaw = org.yaw; mc.pitch = org.pitch;
    }

    const txt = tabla(R, rondas, frames);
    sondaPixeles.texto = txt; sondaPixeles.crudo = R;
    console.log(txt);
    return txt;
  }

  window.sondaPixeles = sondaPixeles;
  console.log('%csondaPixeles listo. NO andes tú, te lleva el script: await sondaPixeles()', 'color:#6cf');
})();
