// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿qué se come el frame cuando la herramienta de la mano ALUMBRA y andas?
//
// Por qué existe: `game.luzDiag()` sólo se puede leer PARADO, y parado no cae nada — el volcado del dueño
// (2026-08-21) sale sano: caja 4913 celdas (17³, sin recortar), 6 semillas, glowFocus 1. Con esa caja el BFS
// dinámico son ~0,2 ms cada 2-4 pasos, así que **el coste no está en sembrar la luz de la mano**: está en lo
// que esa luz DISPARA al moverse. Los sospechosos, por orden de lo caro que sale cada uno:
//
//   · mcComputeBlockLight  → el BFS del MUNDO ENTERO (~8 ms). `mcDynSync` lo llama en su rama `if(cambio)`
//                            (app.js:12079) cada vez que un emisor cambia de bando montado↔quieto. Si la
//                            herramienta entra y sale de `mcEmisorSeguido` al andar, esto salta sin parar.
//   · mcMeshChunk          → detrás de esa misma rama se re-mallan TODOS los chunks del halo (±16 bloques).
//                            En el volcado de BUG-PERF3 salían a 41 ms LA LLAMADA.
//   · mcUploadBlkTex       → y el campo del mundo re-subido entero por texImage3D: dim.x·dim.y·dim.z·4 bytes
//                            (en un mapa 160×48×160 son 4,9 MB POR SUBIDA).
//   · mcDynBake / mcUploadDynTex → lo que de verdad cuesta la luz de la mano. Es lo que esperamos ver PEQUEÑO.
//
// No mide opiniones: envuelve por nombre, cuenta llamadas y ms, y además apunta DE DÓNDE sale cada llamada,
// que es lo que separa «se rehornea el mundo porque has puesto un bloque» de «se rehornea porque has andado».
//
// CÓMO SE USA (pegar el fichero entero en la consola del navegador, luego:)
//   await sondaLuzMano(8)  · mide 8 segundos. ANDA mientras dure, con la herramienta que alumbra en la mano.
//   await sondaLuzMano.ab(8) · A/B: 8 s con la luz de lo que se mueve PUESTA y 8 s QUITADA. Anda igual las dos
//                            veces (misma ruta, mismo sitio). Avisa por pantalla con toast() cuándo empieza
//                            cada fase, para no tener que mirar la consola mientras andas.
//   sondaLuzMano.texto     · la última tabla como CADENA (por si la consola no enseña los console.log).
//
// ⚠️ EL RESULTADO NO SE QUEDA EN LA CONSOLA. Tres salidas, porque la consola del dueño se tragó la primera
// versión (2026-08-21: salía el toast y ni una línea; los filtros de nivel de DevTools ocultan `Info`):
//   1) se DEVUELVE como cadena  ⇒ con `await sondaLuzMano(8)` sale sí o sí, los valores de retorno no se filtran;
//   2) queda en `sondaLuzMano.texto`;
//   3) y al terminar SE SACA UNA FOTO SOLA, que se lleva la tabla a DISCO por el informe `luz-mano`
//      (data/fotos/informes/<id>/luz-mano.json). Ésa es la vía buena: en este repo las medidas van a disco,
//      no al chat. Se apaga con sondaLuzMano.foto = false.
//
// ⛔ No toca `app.js` ni deja nada instalado: restaura todas las envolturas al terminar, también si peta.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  'use strict';
  // Los que se envuelven. `hondo:true` = además se apunta quién lo llamó (cuesta un stack por llamada, así que
  // sólo en los que la respuesta ES el llamante).
  const SOSPECHOSOS = [
    { n: 'mcComputeBlockLight', hondo: true },   // el BFS del mundo entero
    { n: 'mcMeshChunk',         hondo: true },   // re-mallado de chunk
    { n: 'mcUploadBlkTex' },                     // subida de la textura 3D del mundo
    { n: 'mcDynSync' },                          // la pasada de lo que se mueve (incluye a mcDynBake)
    { n: 'mcDynBake' },                          // …y sólo el horneado de la caja
    { n: 'mcUploadDynTex' },                     // subida de la textura 3D de la caja
    { n: 'mcBuildStructMesh' },                  // re-mallado de estructuras finas (la herramienta es una)
    { n: 'mcRestampAll' },
  ];

  const num = (v, d) => (+v || 0).toFixed(d == null ? 2 : d);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

  // Quién llamó: 2 marcos por encima de la envoltura, quedándose sólo con el nombre de la función. Es una
  // heurística de navegador (el formato del stack no es estándar); si no se puede leer, se dice '?'.
  function llamante() {
    const st = (new Error().stack || '').split('\n');
    for (let i = 3; i < Math.min(st.length, 8); i++) {
      const m = /at\s+([A-Za-z_$][\w$.]*)/.exec(st[i]);
      if (m && !/^Object\.|^sonda/.test(m[1])) return m[1];
    }
    return '?';
  }

  function instalar(acc) {
    const guardado = [];
    for (const s of SOSPECHOSOS) {
      const orig = window[s.n];
      if (typeof orig !== 'function') continue;           // versión que no lo trae: se salta, no se miente
      guardado.push([s.n, orig]);
      acc[s.n] = { llamadas: 0, ms: 0, max: 0, de: Object.create(null) };
      window[s.n] = function () {
        const a = acc[s.n], t = performance.now();
        if (s.hondo) { const q = llamante(); a.de[q] = (a.de[q] | 0) + 1; }
        try { return orig.apply(this, arguments); }
        finally { const dt = performance.now() - t; a.llamadas++; a.ms += dt; if (dt > a.max) a.max = dt; }
      };
    }
    return () => { for (const [n, f] of guardado) window[n] = f; };
  }

  // Una fase = N segundos de reloj mientras el dueño anda. Se mira el frame por rAF (para los fps) y se
  // vigila `mc._dynSig` dentro del propio bucle: cuántas veces se rompe el candado de la caja.
  function fase(seg, etiqueta) {
    return new Promise(res => {
      const acc = Object.create(null), quitar = instalar(acc);
      const r = { etiqueta, frames: 0, peor: 0, roturas: 0, cajaMin: 1e12, cajaMax: 0, recortes: 0, acc };
      let sig = (typeof mc !== 'undefined') ? mc._dynSig : null, t0 = performance.now(), prev = t0;
      try { toast('SONDA · ' + etiqueta + ' — ANDA ahora (' + seg + ' s)'); } catch (e) {}
      console.log('%c▶ ' + etiqueta + ' — anda durante ' + seg + ' s', 'font-weight:bold');
      const paso = () => {
        const t = performance.now(), dt = t - prev; prev = t;
        r.frames++; if (dt > r.peor) r.peor = dt;
        if (mc._dynSig !== sig) { r.roturas++; sig = mc._dynSig; }
        const D = mc.dynLight;
        if (D) { if (D.vol < r.cajaMin) r.cajaMin = D.vol; if (D.vol > r.cajaMax) r.cajaMax = D.vol; }
        if (mc._dynRecorte && mc._dynRecorte.hubo) r.recortes++;
        if (t - t0 < seg * 1000) requestAnimationFrame(paso);
        else { quitar(); r.ms = t - t0; try { toast('SONDA · fin de ' + etiqueta); } catch (e) {} res(r); }
      };
      requestAnimationFrame(paso);
    });
  }

  // Devuelve la tabla como CADENA (no la imprime): así la misma sirve para la consola, para el valor de
  // retorno y para el informe que va a disco. Una sola definición ⇒ las tres no pueden discrepar.
  function tabla(r) {
    const seg = r.ms / 1000, L = [];
    L.push('── ' + r.etiqueta + ' · ' + num(seg, 1) + ' s · ' + r.frames + ' frames · ' +
      num(r.frames / seg, 1) + ' fps medios · peor frame ' + num(r.peor) + ' ms');
    L.push('   caja: ' + (r.cajaMax ? r.cajaMin + '–' + r.cajaMax + ' celdas' : 'apagada') +
      ' · roturas de firma ' + r.roturas + ' (' + num(r.roturas / seg, 1) + '/s)' +
      (r.recortes ? ' · ⚠️ ' + r.recortes + ' frames con la caja RECORTADA' : ''));
    const filas = Object.keys(r.acc).map(n => [n, r.acc[n]])
      .filter(([, a]) => a.llamadas).sort((a, b) => b[1].ms - a[1].ms);
    if (!filas.length) { L.push('   (ninguno de los sospechosos se ha llamado)'); return L.join('\n'); }
    L.push('   ' + pad('función', 22) + pad('llamadas', 10) + pad('/s', 8) + pad('ms total', 10) +
      pad('ms/s', 8) + pad('% reloj', 9) + pad('peor', 8) + 'quién lo llama');
    for (const [n, a] of filas) {
      L.push('   ' + pad(n, 22) + pad(a.llamadas, 10) + pad(num(a.llamadas / seg, 1), 8) +
        pad(num(a.ms), 10) + pad(num(a.ms / seg), 8) + pad(num(100 * a.ms / r.ms, 1) + ' %', 9) +
        pad(num(a.max), 8) +
        Object.keys(a.de).sort((x, y) => a.de[y] - a.de[x]).slice(0, 3).map(k => k + '×' + a.de[k]).join(', '));
    }
    return L.join('\n');
  }

  // Lo mismo en crudo, que es lo que se lleva el informe `luz-mano` a disco: números, no cadenas alineadas.
  function crudo(r) {
    const seg = r.ms / 1000;
    return { etiqueta: r.etiqueta, seg: +num(seg), frames: r.frames, fps: +num(r.frames / seg, 1),
      peorFrameMs: +num(r.peor), roturasFirma: r.roturas, roturasPorSeg: +num(r.roturas / seg, 1),
      cajaMin: r.cajaMax ? r.cajaMin : 0, cajaMax: r.cajaMax, framesRecortada: r.recortes,
      funciones: Object.keys(r.acc).filter(n => r.acc[n].llamadas).sort((a, b) => r.acc[b].ms - r.acc[a].ms)
        .map(n => { const a = r.acc[n];
          return { fn: n, llamadas: a.llamadas, porSeg: +num(a.llamadas / seg, 1), ms: +num(a.ms),
                   msPorSeg: +num(a.ms / seg), pctReloj: +num(100 * a.ms / r.ms, 1), peorMs: +num(a.max),
                   de: a.de }; }) };
  }

  // Publica el resultado por las tres vías (consola, cadena de retorno, y disco vía el informe + foto).
  async function publica(texto, fases) {
    console.log('\n' + texto);
    sonda.texto = texto;
    window.__sondaLuzMano = { cuando: new Date().toISOString(), texto, fases: fases.map(crudo) };
    if (sonda.foto === false) return texto;
    try {
      // El registro de informes se lee UNA vez al arrancar (mcInformesCarga), así que una pestaña abierta desde
      // antes de que existiera data/informes/luz-mano.js saca la foto sin él y la medida se pierde sin que nada
      // falle. Le pasó al dueño en la primera vuelta (2026-08-21). Se comprueba y se recarga el registro.
      if (!game.informes.lista().some(i => i.nombre === 'luz-mano')) {
        console.log('· el informe luz-mano no estaba cargado (pestaña vieja): recargando el registro…');
        await game.informes.recarga();
        if (!game.informes.lista().some(i => i.nombre === 'luz-mano'))
          return texto + '\n\n⚠️ no hay informe `luz-mano` ni tras recargar: ¿existe data/informes/luz-mano.js' +
                 ' y está en data/informes/index.json? La tabla está en sondaLuzMano.texto';
      }
      const res = await mcFoto();          // el informe `luz-mano` viaja con ella (data/informes/index.json)
      if (res && res.id) {
        const d = '📷 medida guardada en disco: data/fotos/informes/' + res.id + '/luz-mano.json';
        console.log(d); try { toast(d, 5); } catch (e) {}
        return texto + '\n\n' + d;
      }
      return texto + '\n\n⚠️ no se pudo guardar la foto (¿mundo cerrado?). La tabla está en sondaLuzMano.texto';
    } catch (e) {
      return texto + '\n\n⚠️ fallo al guardar la foto: ' + e;
    }
  }

  const COMO_SE_LEE =
    '   Cómo se lee: si la fila de arriba es mcDynBake/mcUploadDynTex, el coste ES la luz de la mano y toca\n' +
    '   encoger la caja. Si es mcComputeBlockLight/mcMeshChunk/mcUploadBlkTex, la luz de la mano no cuesta:\n' +
    '   lo que cuesta es que al andar esté disparando el rehorneado del MUNDO — y entonces la columna\n' +
    '   «quién lo llama» dice por dónde (mcDynSync = la rama `if(cambio)`, app.js:12079).';

  const sonda = async (seg) => {
    seg = +seg || 8;
    const r = await fase(seg, 'medida');
    return publica(tabla(r) + '\n\n' + COMO_SE_LEE, [r]);
  };

  sonda.ab = async (seg) => {
    seg = +seg || 8;
    console.log('%cA/B · dos vueltas ANDANDO. Haz la MISMA ruta las dos veces.', 'font-weight:bold');
    const antes = game.luzDinamica;
    let A, B;
    try {
      game.luzDinamica = true;  await new Promise(r => setTimeout(r, 1200));
      A = await fase(seg, 'A · con luz de lo que se mueve');
      try { toast('SONDA · vuelve al punto de partida (3 s)'); } catch (e) {}
      await new Promise(r => setTimeout(r, 3000));
      game.luzDinamica = false; await new Promise(r => setTimeout(r, 1200));
      B = await fase(seg, 'B · SIN luz de lo que se mueve');
    } finally { game.luzDinamica = antes; }
    const f = r => r.frames / (r.ms / 1000);
    return publica(tabla(A) + '\n\n' + tabla(B) +
      '\n\n═══ LO QUE CUESTA LA LUZ DE LO QUE SE MUEVE: ' + num(f(A), 1) + ' → ' + num(f(B), 1) +
      ' fps  (' + num(f(B) - f(A), 1) + ' fps de diferencia)' +
      '\n    peor frame ' + num(A.peor) + ' → ' + num(B.peor) + ' ms\n\n' + COMO_SE_LEE, [A, B]);
  };

  sonda.foto = true;                 // sondaLuzMano.foto = false para no guardar la foto
  sonda.texto = '(aún no has medido nada: await sondaLuzMano(8))';
  window.sondaLuzMano = sonda;
  console.log('%csondaLuzMano listo.%c  await sondaLuzMano(8) para medir andando · await sondaLuzMano.ab(8) para el A/B',
    'font-weight:bold', '');
})();
