// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · el mismo paseo, siempre. Para poder comparar dos medidas de luz sin discutir.
//
// Por qué existe: `consola_luz_mano.js` mide bien, pero el que anda es el dueño, y dos tiradas suyas no son el
// mismo experimento — 0103 y 0104 salieron con la misma caja (4913–5832) y una tuvo 77 roturas de firma por
// segundo y la otra 96, o sea el 100 % de los frames. Con la ruta cambiando entre tirada y tirada, un A/B no
// dice si mejoró el motor o si esta vez se anduvo distinto. Aquí el paseo lo conduce el script.
//
// LAS TRES DECISIONES QUE LO HACEN REPETIBLE (y que no se pueden tocar sin cargárselo):
//
//  1 · EL PASEO VA POR ÍNDICE DE FRAME, NO POR RELOJ. En el frame `f` el jugador está en el punto `f`, vaya el
//      motor a 130 fps o a 40. Es al revés de lo que pide el cuerpo (medir "8 segundos"), y es a propósito: si
//      el paseo fuera por reloj, una tirada lenta recorrería MENOS mundo, tocaría menos luces y saldría
//      artificialmente barata — el experimento se defendería solo. Con la ruta fija, lo que varía es el tiempo
//      que se tarda en recorrerla, que es exactamente lo que queremos medir. Por eso la medida se pide en
//      FRAMES y dura lo que dure.
//
//  2 · NO SE SIMULAN TECLAS: se escribe `mc.pos` / `mc.yaw` directo. Hay precedente en el motor (el encuadre de
//      la URL hace lo mismo, app.js:17838). Simular teclas metería `mcUpdate` dentro del experimento, y la
//      física integra por `dt` ⇒ la ruta dependería del fps, que es la variable que estamos midiendo. Circular.
//      Efecto lateral honesto: se atraviesan paredes. Para una medida de coste da igual y es determinista; para
//      mirar cómo ALUMBRA, no sirve — para eso está `game.luzDiag()` parado.
//
//  3 · LA ALTURA LA DA EL TERRENO (`mcSurfaceY`), no una constante. Así la ruta es función del mapa y del
//      origen, y nada más: se puede repetir mañana. Y no acabas enterrado, que enterrado la luz es otra cosa.
//
// CÓMO SE USA
//   sondaLuzPaseo.aqui()        · clava AQUÍ el origen del paseo (posición y mirada). Se hace UNA vez.
//   await sondaLuzPaseo(600)    · 600 frames de paseo conducido, y la tabla.
//   await sondaLuzPaseo.ab(600) · la MISMA ruta dos veces: con foco de haz (glowFocus tal cual) y sin él (0).
//   sondaLuzPaseo.texto         · la última tabla como cadena.
//
//   await sondaLuzPaseo.salto(600)   · LO OTRO que se mide aquí: no los fps, sino EL SALTO. Mismo paseo, pero
//                                      apuntando el NIVEL de luz en celdas fijas del suelo y midiendo el
//                                      ESCALÓN entre un frame y el siguiente. Es la queja del dueño, en cifras.
//   await sondaLuzPaseo.saltoAb(600) · el mismo paseo con `game.luzSuave` puesto y quitado, para ver cuánto se
//                                      come el muestreo fino y cuánto queda.
//
// Cada fase publica `firmaRuta`: la suma de los puntos pisados, cuantizada. Dos fases con la misma `firmaRuta`
// anduvieron LO MISMO — es la prueba de que el A/B es un A/B, no dos paseos distintos. Si difieren, la
// comparación no vale y la tabla lo dice en vez de callárselo.
//
// Se descartan los primeros `calienta` frames (30 por defecto) porque la foto de la medida ANTERIOR se cobra
// ahí: en la tirada 0106 del dueño el peor frame fue de 6827 ms y no cayó en ninguna función instrumentada.
// Por eso además se apunta EN QUÉ FRAME cayó cada uno de los tres peores.
//
// ⛔ No toca `app.js`. Restaura posición, mirada y envolturas al terminar, también si peta. Publica por el
//    informe `luz-mano` que ya existe (data/informes/luz-mano.js), así que la medida acaba en disco sola.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  'use strict';

  const SOSPECHOSOS = [
    { n: 'mcComputeBlockLight', hondo: true },   // el BFS del MUNDO entero
    { n: 'mcMeshChunk',         hondo: true },   // re-mallado de chunk
    { n: 'mcUploadBlkTex',      hondo: true },   // el campo del mundo, entero, por texImage3D
    { n: 'mcDynSync',           hondo: false },  // la recogida de semillas: corre TODOS los frames
    { n: 'mcDynBake',           hondo: false },  // el BFS de la caja
    { n: 'mcUploadDynTex',      hondo: false },
    { n: 'mcBuildStructMesh',   hondo: true },
  ];

  const num = (v, d) => (+v || 0).toFixed(d == null ? 2 : d);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

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
      if (typeof orig !== 'function') continue;   // versión que no lo trae: se salta, no se miente
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

  // ── LA RUTA ────────────────────────────────────────────────────────────────────────────────────────────────
  // Ida y vuelta en línea recta sobre el eje X del MUNDO (no el de la vista: así el paseo no depende de hacia
  // dónde mirabas al lanzarlo), con la mirada barriendo ±`giro` grados. Todo es función de `f`, el número de
  // frame — ni una llamada a performance.now() aquí dentro, o dejaría de ser repetible.
  const RUTA = { largo: 24, paso: 0.04, giro: 30, periodo: 180 };   // paso 0,04 b/frame ≈ andar a ~110 fps

  function puntoDeRuta(f, org, cfg) {
    const s = f * cfg.paso, ciclo = 2 * cfg.largo;
    const u = s % ciclo, d = (u <= cfg.largo) ? u : (ciclo - u);   // onda triangular: ida y vuelta
    const x = org.pos[0] + d, z = org.pos[2];
    // El suelo manda. Si la columna no tiene suelo (agujero, borde), se mantiene la altura del origen: es
    // determinista igual y evita caerse del mundo a media medida.
    const sx = Math.floor(x), sz = Math.floor(z);
    let y = org.pos[1];
    if (typeof mcSurfaceY === 'function' && typeof mcInside === 'function' && mcInside(sx, 0, sz)) {
      const surf = mcSurfaceY(sx, sz);
      if (surf >= 0) y = surf + 1;
    }
    const yaw = org.yaw + (cfg.giro * Math.PI / 180) * Math.sin(2 * Math.PI * f / cfg.periodo);
    return [x, y, z, yaw];
  }

  // Firma de lo andado: si dos fases no la comparten, no anduvieron lo mismo y no se pueden comparar.
  function firmaPunto(h, p) {
    for (let k = 0; k < 4; k++) h = (Math.imul(h ^ Math.round(p[k] * 256), 16777619)) >>> 0;
    return h;
  }

  function comprobarRuta(org, cfg) {
    if (!mc || !mc.dim) return 'no hay mundo abierto';
    const fin = puntoDeRuta(Math.round(cfg.largo / cfg.paso), org, cfg);
    if (fin[0] < 1 || fin[0] >= mc.dim.x - 1) {
      return 'la ruta se sale del mundo por el eje X (origen ' + num(org.pos[0], 1) + ', largo ' + cfg.largo +
             ', mundo ' + mc.dim.x + '). Ponte más al oeste con sondaLuzPaseo.aqui(), o baja el largo.';
    }
    return null;
  }

  // ── UNA FASE ───────────────────────────────────────────────────────────────────────────────────────────────
  function fase(frames, etiqueta, org, cfg) {
    return new Promise(res => {
      const r = { etiqueta, acc: Object.create(null), frames: 0, roturas: 0, recortes: 0,
                  cajaMin: Infinity, cajaMax: 0, lucesMin: Infinity, lucesMax: 0,
                  peores: [], firmaRuta: 2166136261, ms: 0, saltados: 0 };
      const quitar = instalar(r.acc);
      // La ESCENA al empezar y al acabar. `firmaRuta` prueba que anduviste lo mismo, pero no que el mundo
      // fuera el mismo: en el A/B de foco del dueño (2026-08-21) los triángulos crecieron un 3,4 % entre la
      // fase A y la B, que es casi exactamente la diferencia de fps que apareció — y no la causaba el foco.
      // Sin este par de muestras, ese 3 % se le habría colgado al motor. Dos muestras y no una por frame:
      // `mcMedidores` toca `game.voxels`, y medir no puede costar lo que se mide.
      r.escena0 = (typeof mcMedidores === 'function') ? mcMedidores() : null;
      // t0/prev se inicializan YA y se vuelven a poner al acabar el calentamiento: con `calienta:0` no hay
      // segundo ajuste, y sin esto `r.ms` saldría medido desde el origen del reloj (un fps de 0,0001).
      let sig = mc._dynSig, f = 0, t0 = performance.now(), prev = t0;
      try { toast('SONDA · ' + etiqueta + ' · ' + frames + ' frames — NO toques el teclado'); } catch (e) {}
      console.log('%c▶ ' + etiqueta + ' · ' + frames + ' frames conducidos', 'font-weight:bold');

      const paso = () => {
        const t = performance.now();
        // Calentamiento: se conduce igual (para que la ruta no dependa de si se midió o no) pero no se cuenta.
        if (f < cfg.calienta) {
          const p = puntoDeRuta(f, org, cfg);
          mc.pos = [p[0], p[1], p[2]]; mc.vel = [0, 0, 0]; mc.yaw = p[3];
          f++; r.saltados++;
          if (f === cfg.calienta) { for (const n in r.acc) { r.acc[n].llamadas = 0; r.acc[n].ms = 0; r.acc[n].max = 0; r.acc[n].de = Object.create(null); }
                                    t0 = prev = performance.now(); sig = mc._dynSig; }
          return requestAnimationFrame(paso);
        }
        const dt = t - prev; prev = t;
        r.frames++;
        r.peores.push([dt, f]);
        if (r.peores.length > 24) { r.peores.sort((a, b) => b[0] - a[0]); r.peores.length = 3; }
        if (mc._dynSig !== sig) r.roturas++;
        sig = mc._dynSig;
        const D = mc.dynLight;
        // Las celdas de la caja NO explican solas lo que cuesta un horneado: lo que se siembra son las LUCES
        // (D.luces = las que cogieron plaza). Dos medidas con la misma caja y distinto número de emisores no
        // son comparables, así que el número viaja con la tabla.
        if (D) { if (D.vol < r.cajaMin) r.cajaMin = D.vol; if (D.vol > r.cajaMax) r.cajaMax = D.vol;
                 const L = D.luces | 0;
                 if (L < r.lucesMin) r.lucesMin = L; if (L > r.lucesMax) r.lucesMax = L; }
        if (mc._dynRecorte && mc._dynRecorte.hubo) r.recortes++;

        const p = puntoDeRuta(f, org, cfg);
        r.firmaRuta = firmaPunto(r.firmaRuta, p);
        mc.pos = [p[0], p[1], p[2]]; mc.vel = [0, 0, 0]; mc.yaw = p[3];
        f++;

        if (r.frames < frames) requestAnimationFrame(paso);
        else {
          quitar(); r.ms = performance.now() - t0;
          r.escena1 = (typeof mcMedidores === 'function') ? mcMedidores() : null;
          r.peores.sort((a, b) => b[0] - a[0]); r.peores.length = Math.min(3, r.peores.length);
          try { toast('SONDA · fin de ' + etiqueta); } catch (e) {}
          res(r);
        }
      };
      requestAnimationFrame(paso);
    });
  }

  // ── SALIDA ─────────────────────────────────────────────────────────────────────────────────────────────────
  // Cuánto se movió el MUNDO durante la fase. `deriva` es lo que hay que batir para que un resultado cuente.
  function deriva(r) {
    const a = r.escena0, b = r.escena1;
    if (!a || !b || !a.triangulos || !b.triangulos) return null;
    return 100 * (b.triangulos - a.triangulos) / a.triangulos;
  }
  function escenaTexto(r) {
    const d = deriva(r);
    if (d == null) return '';
    return '\n   escena: ' + (r.escena0.triangulos / 1e6).toFixed(1) + ' → ' + (r.escena1.triangulos / 1e6).toFixed(1) +
           ' M tri (' + (d >= 0 ? '+' : '') + num(d, 1) + ' %) · ' + r.escena0.draws + ' → ' + r.escena1.draws + ' dib';
  }

  // ¿De dónde sale la diferencia? Sin esto, un A/B convierte cualquier diferencia de fps en «lo arreglé»: en la
  // medida del dueño, B ganó 200 ms de reloj y las funciones medidas sólo explicaban 6 ms — el resto era que el
  // mundo había crecido entre fase y fase. Un A/B que no reparte su propia diferencia miente por omisión.
  function reparto(A, B) {
    const dReloj = A.ms - B.ms;                                   // > 0 = B tardó menos en la MISMA ruta
    // ⛔ NO se suman los deltas: las envolturas ANIDAN (mcDynSync llama a mcDynBake y las dos están medidas),
    // así que una suma contaría dos veces lo mismo. Se listan uno a uno y se compara el MAYOR con el reloj.
    const ds = [];
    for (const n of new Set(Object.keys(A.acc).concat(Object.keys(B.acc)))) {
      const d = ((A.acc[n] && A.acc[n].ms) || 0) - ((B.acc[n] && B.acc[n].ms) || 0);
      if (Math.abs(d) >= 0.05) ds.push([n, d]);
    }
    ds.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const mayor = ds.length ? ds[0][1] : 0;
    const pct = dReloj ? 100 * mayor / dReloj : 0;
    const dA = deriva(A), dB = deriva(B);
    return '\n    reparto: B ahorra ' + num(dReloj) + ' ms de reloj sobre la misma ruta.' +
           '\n      ' + (ds.map(([n, d]) => n + ' ' + (d >= 0 ? '−' : '+') + num(Math.abs(d)) + ' ms').join(' · ') ||
                         '(ninguna función medida cambió)') +
           (Math.abs(pct) < 50 ? '\n    ⚠️ NI LA MAYOR DE ELLAS EXPLICA LA MITAD DEL RELOJ (' + num(mayor) +
              ' de ' + num(dReloj) + ' ms): la diferencia de fps NO está en lo que se ha medido, así que no ' +
              'se la cuelgues al cambio.' : '') +
           ((dA != null && dB != null && Math.abs(dA) + Math.abs(dB) > 1)
              ? '\n    ⚠️ la escena derivó ' + num(dA, 1) + ' % / ' + num(dB, 1) + ' % de triángulos durante las ' +
                'fases: compara eso con la diferencia de fps antes de creértela.' : '');
  }

  function tabla(r) {
    const seg = r.ms / 1000, L = [];
    L.push('── ' + r.etiqueta + ' · ' + r.frames + ' frames en ' + num(seg, 2) + ' s · ' +
           num(r.frames / seg, 1) + ' fps medios');
    L.push('   peores frames: ' + (r.peores.map(p => num(p[0]) + ' ms (frame ' + p[1] + ')').join(' · ') || '—'));
    L.push('   caja: ' + (r.cajaMax ? r.cajaMin + '–' + r.cajaMax + ' celdas' : 'apagada') +
           (r.lucesMax ? ' · luces sembradas ' + r.lucesMin + '–' + r.lucesMax : '') +
           ' · roturas de firma ' + r.roturas + ' (' + num(100 * r.roturas / r.frames, 1) + ' % de los frames)' +
           (r.recortes ? ' · ' + r.recortes + ' frames con CAJA RECORTADA' : ''));
    L.push('   firmaRuta: ' + r.firmaRuta + escenaTexto(r));
    const filas = Object.keys(r.acc).map(n => [n, r.acc[n]])
      .filter(([, a]) => a.llamadas).sort((a, b) => b[1].ms - a[1].ms);
    if (!filas.length) { L.push('   (ninguno de los sospechosos se llamó)'); return L.join('\n'); }
    L.push('   ' + pad('función', 22) + pad('llamadas', 10) + pad('/frame', 8) + pad('ms total', 10) +
           pad('ms/frame', 10) + pad('% reloj', 9) + pad('peor', 8) + 'quién lo llama');
    for (const [n, a] of filas) {
      L.push('   ' + pad(n, 22) + pad(a.llamadas, 10) + pad(num(a.llamadas / r.frames, 2), 8) +
             pad(num(a.ms), 10) + pad(num(a.ms / r.frames, 3), 10) + pad(num(100 * a.ms / r.ms, 1) + ' %', 9) +
             pad(num(a.max), 8) +
             Object.keys(a.de).sort((x, y) => a.de[y] - a.de[x]).slice(0, 3).map(k => k + '×' + a.de[k]).join(', '));
    }
    return L.join('\n');
  }

  function crudo(r) {
    const seg = r.ms / 1000;
    return { etiqueta: r.etiqueta, seg: +num(seg, 2), frames: r.frames, fps: +num(r.frames / seg, 1),
             conducido: true, firmaRuta: r.firmaRuta, framesDescartados: r.saltados,
             peores: r.peores.map(p => ({ ms: +num(p[0]), frame: p[1] })),
             roturasFirma: r.roturas, pctFramesRotos: +num(100 * r.roturas / r.frames, 1),
             cajaMin: r.cajaMax ? r.cajaMin : 0, cajaMax: r.cajaMax, framesRecortada: r.recortes,
             lucesMin: r.lucesMax ? r.lucesMin : 0, lucesMax: r.lucesMax,
             escena: { inicio: r.escena0, fin: r.escena1, derivaTriPct: deriva(r) },
             funciones: Object.keys(r.acc).filter(n => r.acc[n].llamadas)
               .sort((a, b) => r.acc[b].ms - r.acc[a].ms)
               .map(n => { const a = r.acc[n];
                 return { fn: n, llamadas: a.llamadas, porFrame: +num(a.llamadas / r.frames, 3), ms: +num(a.ms),
                          msPorFrame: +num(a.ms / r.frames, 3), pctReloj: +num(100 * a.ms / r.ms, 1),
                          peorMs: +num(a.max), llamadaPor: a.de }; }) };
  }

  async function publica(texto, fases, cr) {
    console.log('\n' + texto);
    sonda.texto = texto;
    // Se publica por el MISMO buzón que `consola_luz_mano.js`, así el informe `luz-mano` que ya existe la
    // recoge sin tocar data/informes/index.json. `conducido:true` distingue las dos en disco.
    window.__sondaLuzMano = { cuando: new Date().toISOString(), texto, fases: fases.map(cr || crudo) };
    if (sonda.foto === false) return texto;
    try {
      if (!game.informes.lista().some(i => i.nombre === 'luz-mano')) {
        console.log('· el informe luz-mano no estaba cargado (pestaña vieja): recargando el registro…');
        await game.informes.recarga();
      }
      const res = await mcFoto();
      if (res && res.id) {
        const d = '📷 medida guardada en disco: data/fotos/informes/' + res.id + '/luz-mano.json';
        console.log(d); try { toast(d, 5); } catch (e) {}
        return texto + '\n\n' + d;
      }
      return texto + '\n\n⚠️ no se pudo guardar la foto. La tabla está en sondaLuzPaseo.texto';
    } catch (e) {
      return texto + '\n\n⚠️ fallo al guardar la foto: ' + e;
    }
  }

  // ── EL SALTO ───────────────────────────────────────────────────────────────────────────────────────────────
  // El otro experimento del mismo paseo. Aquí no se cuentan ms: se apunta el NIVEL de luz que hay en celdas
  // FIJAS del suelo y se mide el ESCALÓN de un frame al siguiente. Celdas fijas del MUNDO, no relativas al
  // jugador, porque lo que salta a la vista es una baldosa concreta cambiando de brillo mientras pasas por
  // delante — si las celdas se movieran contigo, el movimiento legítimo y el artefacto saldrían sumados.
  //
  // Cuánto es «mucho»: el campo se guarda en SUBNIVELES, así que su escalón mínimo es 1/MC_LUZ_SUB = 0,25
  // niveles, y un nivel es 1/15 del brillo lleno ⇒ un escalón de 0,25 es un 1,7 % de brillo DE GOLPE. Andando
  // a 0,04 bloques por frame, el cambio legítimo de una celda es ~0,04·(1+5·focus) niveles por frame, o sea
  // bastante MENOS que el escalón mínimo: por eso la luz no sube en rampa, sube a peldaños. Lo que cuenta la
  // tabla es cuántos peldaños por segundo pisa la vista y de qué altura.
  function celdasDeRuta(org, cfg) {
    const C = [];
    if (typeof mcSurfaceY !== 'function') return C;
    const z0 = Math.floor(org.pos[2]);
    for (let d = 0; d <= cfg.largo; d++) {
      const x = Math.floor(org.pos[0]) + d;
      for (const dz of [-2, 0, 2]) {
        const z = z0 + dz;
        if (!mcInside(x, 0, z)) continue;
        const s = mcSurfaceY(x, z);
        if (s < 0 || !mcInside(x, s + 1, z)) continue;
        C.push([x, s + 1, z]);                                   // la baldosa: el aire justo encima del suelo
        if (mcInside(x, s + 3, z) && dz === 0) C.push([x, s + 3, z]);   // …y a la altura de la cabeza
      }
    }
    return C;
  }

  const CORTES = [0.001, 0.13, 0.26, 0.51, 1.01, 2.01];   // 0,13 = medio subnivel; 0,26 = un subnivel; …

  function faseSalto(frames, etiqueta, org, cfg) {
    return new Promise(res => {
      const celdas = celdasDeRuta(org, cfg);
      const r = { etiqueta, celdas: celdas.length, frames: 0, ms: 0, saltados: 0, firmaRuta: 2166136261,
                  hist: [0, 0, 0, 0, 0, 0, 0], peores: [], roturas: 0, cajasMovidas: 0, cruces: 0,
                  suma: 0, escalonMax: 0, nivelMax: 0, celdasVivas: 0,
                  conReh: { n: 0, suma: 0, max: 0 }, sinReh: { n: 0, suma: 0, max: 0 } };
      const vivas = new Uint8Array(celdas.length);
      let prev = null, sig = mc._dynSig, caja = '', celdaEmi = '', f = 0, t0 = performance.now();
      try { toast('SONDA · ' + etiqueta + ' · ' + frames + ' frames — NO toques el teclado'); } catch (e) {}
      console.log('%c▶ ' + etiqueta + ' · ' + frames + ' frames conducidos (midiendo EL SALTO)', 'font-weight:bold');

      const paso = () => {
        if (f < cfg.calienta) {
          const p0 = puntoDeRuta(f, org, cfg);
          mc.pos = [p0[0], p0[1], p0[2]]; mc.vel = [0, 0, 0]; mc.yaw = p0[3];
          f++; r.saltados++;
          if (f === cfg.calienta) { t0 = performance.now(); prev = null; sig = mc._dynSig; }
          return requestAnimationFrame(paso);
        }
        // El campo que se lee AHORA es el que horneó el frame anterior con la posición que se escribió abajo:
        // leer arriba y conducir abajo mantiene el par (posición, campo) alineado en todos los frames.
        const cur = new Float32Array(celdas.length);
        for (let i = 0; i < celdas.length; i++) {
          const v = mcDynNivel(celdas[i][0], celdas[i][1], celdas[i][2]);
          cur[i] = v; if (v > r.nivelMax) r.nivelMax = v;
          if (v >= 0.5) vivas[i] = 1;
        }
        const D = mc.dynLight;
        const cajaAhora = D ? [D.x0, D.y0, D.z0, D.W, D.H, D.P].join(',') : '';
        const s0 = (mc._dynSem && mc._dynSem[0]) || null;
        const emiAhora = s0 ? (s0.x + ',' + s0.y + ',' + s0.z) : '';
        const reh = mc._dynSig !== sig, movida = cajaAhora !== caja, cruza = emiAhora !== celdaEmi;

        if (prev) {
          let m = 0, dónde = -1;
          for (let i = 0; i < celdas.length; i++) {
            // Sólo celdas ALUMBRADAS: el escalón de una baldosa a oscuras no lo ve nadie, y contarlo diluiría
            // la media hasta dejarla en nada.
            if (cur[i] < 0.5 && prev[i] < 0.5) continue;
            const a = Math.abs(cur[i] - prev[i]); if (a > m) { m = a; dónde = i; }
          }
          r.frames++; r.suma += m;
          let k = 0; while (k < CORTES.length && m >= CORTES[k]) k++;
          r.hist[k]++;
          if (m > r.escalonMax) r.escalonMax = m;
          (reh ? r.conReh : r.sinReh).n++; (reh ? r.conReh : r.sinReh).suma += m;
          if (m > (reh ? r.conReh : r.sinReh).max) (reh ? r.conReh : r.sinReh).max = m;
          if (reh) r.roturas++; if (movida) r.cajasMovidas++; if (cruza) r.cruces++;
          r.peores.push({ salto: +num(m, 3), frame: f, celda: dónde >= 0 ? celdas[dónde].join(',') : null,
                          nivel: dónde >= 0 ? +num(cur[dónde], 3) : null,
                          rehorneo: reh, cajaMovida: movida, cruzaCelda: cruza });
          if (r.peores.length > 40) { r.peores.sort((a, b) => b.salto - a.salto); r.peores.length = 5; }
        }
        prev = cur; sig = mc._dynSig; caja = cajaAhora; celdaEmi = emiAhora;

        const p = puntoDeRuta(f, org, cfg);
        r.firmaRuta = firmaPunto(r.firmaRuta, p);
        mc.pos = [p[0], p[1], p[2]]; mc.vel = [0, 0, 0]; mc.yaw = p[3];
        f++;

        if (r.frames < frames) requestAnimationFrame(paso);
        else {
          r.ms = performance.now() - t0;
          for (let i = 0; i < vivas.length; i++) r.celdasVivas += vivas[i];
          r.peores.sort((a, b) => b.salto - a.salto); r.peores.length = Math.min(5, r.peores.length);
          r.sub = (typeof MC_LUZ_SUB !== 'undefined') ? MC_LUZ_SUB : null;
          r.focus = mc.glowFocus; r.suave = mc.luzSuave !== false;
          try { toast('SONDA · fin de ' + etiqueta); } catch (e) {}
          res(r);
        }
      };
      requestAnimationFrame(paso);
    });
  }

  function tablaSalto(r) {
    const seg = r.ms / 1000, L = [], fps = r.frames / seg;
    const pct = n => num(100 * n / Math.max(1, r.frames), 1) + ' %';
    L.push('── ' + r.etiqueta + ' · ' + r.frames + ' frames en ' + num(seg, 2) + ' s · ' + num(fps, 1) + ' fps · ' +
           r.celdas + ' celdas fijas (' + r.celdasVivas + ' alumbradas) · MC_LUZ_SUB=' + r.sub +
           ' · glowFocus=' + num(r.focus, 2) + ' · luzSuave=' + r.suave);
    if (r.nivelMax < 0.5) {
      L.push('   ⚠️ NINGUNA celda medida llegó a 0,5 niveles: no había luz móvil sobre la ruta, así que este 0 no');
      L.push('      vale de nada. Coge la herramienta que alumbra y vuelve a lanzarlo.');
      return L.join('\n');
    }
    L.push('   escalón por frame · máximo ' + num(r.escalonMax, 3) + ' niveles (' + num(100 * r.escalonMax / 15, 1) +
           ' % de brillo) · medio ' + num(r.suma / Math.max(1, r.frames), 3));
    L.push('   reparto: quieto ' + pct(r.hist[0]) + ' · <½ subnivel ' + pct(r.hist[1]) + ' · ~1 subnivel ' +
           pct(r.hist[2]) + ' · ≤0,5 niv ' + pct(r.hist[3]) + ' · ≤1 niv ' + pct(r.hist[4]) +
           ' · ≤2 niv ' + pct(r.hist[5]) + ' · >2 niv ' + pct(r.hist[6]));
    const gordos = r.hist[3] + r.hist[4] + r.hist[5] + r.hist[6];
    L.push('   PELDAÑOS VISIBLES (≥0,26 niveles = ≥1,7 % de brillo de golpe): ' + gordos + ' frames, ' +
           num(gordos / seg, 1) + ' por segundo');
    L.push('   con rehorneo ' + r.conReh.n + ' frames (medio ' + num(r.conReh.suma / Math.max(1, r.conReh.n), 3) +
           ', peor ' + num(r.conReh.max, 3) + ')  ·  campo CONGELADO ' + r.sinReh.n + ' frames (medio ' +
           num(r.sinReh.suma / Math.max(1, r.sinReh.n), 3) + ', peor ' + num(r.sinReh.max, 3) + ')');
    if (r.sinReh.max > 0)
      L.push('   ⛔ un frame SIN rehorneo cambió de nivel: el campo es el mismo y el valor no debería moverse.');
    L.push('   cajas movidas ' + r.cajasMovidas + ' · cruces de celda del emisor ' + r.cruces +
           ' · firmaRuta ' + r.firmaRuta);
    L.push('   los 5 peores: ' + r.peores.map(p => num(p.salto, 2) + '@f' + p.frame + ' en ' + p.celda +
           (p.cajaMovida ? ' [CAJA]' : '') + (p.cruzaCelda ? ' [CRUCE]' : '')).join(' · '));
    return L.join('\n');
  }

  // REQ-LUZ4 · el paso del campo YA NO ES FIJO (game.luzSub), así que esta explicación se calcula en el momento:
  // si dijera «cuartos de nivel» a pelo, mentiría en cuanto el dueño mueva el mando, que es justo cuando se lee.
  // Es una FUNCIÓN, no una cadena: se pega una vez en la consola y se corre muchas, con el mando cambiado en medio.
  const COMO_SE_LEE_SALTO = () => { const SUBV = (typeof MC_LUZ_SUB !== 'undefined') ? MC_LUZ_SUB : 4; return (
    '   Cómo se lee: el campo se guarda en 1/' + SUBV + ' de nivel (MC_LUZ_SUB=' + SUBV + '), o sea que su escalón\n' +
    '   MÍNIMO es ' + (1 / SUBV).toFixed(4) + ' niveles = ' + (100 / (15 * SUBV)).toFixed(2) + ' % de brillo. Si el grueso del reparto cae en «~1 subnivel» y hay peldaños visibles\n' +
    '   varias veces por segundo, el salto que se ve ES la cuantización del campo, y se arregla guardando el\n' +
    '   campo más fino — no tocando la ley de la luz. Si en cambio los peores traen [CAJA], lo que salta es el\n' +
    '   borde de la caja del campo dinámico barriendo celdas, que es otro arreglo. Y si sale algo en la línea\n' +
    '   ⛔ (cambio con el campo congelado), lo que falla es el candado de la firma.'); };

  // ── EL MANDO ───────────────────────────────────────────────────────────────────────────────────────────────
  function preparar(cfg) {
    if (!mc || !mc.active || !mc.grid) throw new Error('abre el Mundo (🌍) primero');
    if (!sonda.origen) {
      sonda.aqui();
      console.log('%c· no había origen fijado: se ha clavado el de ahora mismo. Para repetir la MISMA ruta ' +
                  'en otra sesión, vuelve aquí y haz sondaLuzPaseo.aqui().', 'color:#c80');
    }
    const mal = comprobarRuta(sonda.origen, cfg);
    if (mal) throw new Error('sondaLuzPaseo: ' + mal);
    return { pos: mc.pos.slice(), yaw: mc.yaw, pitch: mc.pitch, vel: mc.vel.slice() };
  }

  function restaurar(g) { mc.pos = g.pos; mc.yaw = g.yaw; mc.pitch = g.pitch; mc.vel = g.vel; }

  const sonda = async (frames, opts) => {
    const cfg = Object.assign({ calienta: 30 }, RUTA, opts || {});
    frames = +frames || 600;
    const guardado = preparar(cfg);
    mc.pitch = sonda.origen.pitch;
    try {
      const r = await fase(frames, 'paseo', sonda.origen, cfg);
      return await publica(tabla(r) + '\n\n' + COMO_SE_LEE, [r]);
    } finally { restaurar(guardado); }
  };

  // A/B sobre la MISMA ruta: el haz puesto contra el haz quitado. Es la comparación que quedó pendiente —
  // con el dueño andando a mano, la ruta cambiaba entre A y B y el A/B no probaba nada.
  sonda.ab = async (frames, opts) => {
    const cfg = Object.assign({ calienta: 30 }, RUTA, opts || {});
    frames = +frames || 600;
    const guardado = preparar(cfg);
    const focus0 = game.glowFocus;
    // El A/B PONE los dos valores, no da por hecho el que hubiera. La primera versión medía `game.glowFocus`
    // tal cual contra 0, y al dueño le había quedado a 0 de la sesión anterior: comparó 0 contra 0 y salió el
    // resultado perfecto de un experimento vacío (107,1 vs 107,6 fps). Un A/B que no puede detectar que no hay
    // A/B no sirve, así que ahora se declara y se comprueba.
    const fa = (opts && opts.a != null) ? +opts.a : (focus0 > 0 ? focus0 : 1);
    const fb = (opts && opts.b != null) ? +opts.b : 0;
    if (fa === fb) throw new Error('sondaLuzPaseo.ab: A y B con el MISMO glowFocus (' + fa + '), eso no compara ' +
                                   'nada. Pasa los dos a mano: sondaLuzPaseo.ab(600, {a:1, b:0})');
    console.log('%cA/B sobre la MISMA ruta conducida: glowFocus ' + fa + ' contra ' + fb + '. No toques nada.',
                'font-weight:bold');
    try {
      game.glowFocus = fa;
      await new Promise(r => setTimeout(r, 800));      // que asiente el cambio de foco antes de medir
      mc.pitch = sonda.origen.pitch;
      const A = await fase(frames, 'A · glowFocus ' + fa, sonda.origen, cfg);
      game.glowFocus = fb;
      await new Promise(r => setTimeout(r, 800));
      mc.pitch = sonda.origen.pitch;
      const B = await fase(frames, 'B · glowFocus ' + fb, sonda.origen, cfg);
      game.glowFocus = focus0;
      const f = r => r.frames / (r.ms / 1000);
      const misma = A.firmaRuta === B.firmaRuta;
      return await publica(tabla(A) + '\n\n' + tabla(B) +
        '\n\n═══ ' + (misma ? 'MISMA RUTA (firmaRuta ' + A.firmaRuta + '): la comparación vale.'
                           : '⚠️ RUTAS DISTINTAS (' + A.firmaRuta + ' vs ' + B.firmaRuta + '): algo movió al ' +
                             'jugador por su cuenta y esta comparación NO vale.') +
        '\n    glowFocus ' + fa + ' → ' + fb +
        '\n    fps: ' + num(f(A), 1) + ' → ' + num(f(B), 1) + ' (' + num(f(B) - f(A), 1) + ')' +
        reparto(A, B) +
        '\n    roturas de firma: ' + A.roturas + ' → ' + B.roturas +
        (A.roturas === B.roturas ? '  (iguales, como debe ser: el foco no cambia CUÁNDO se re-siembra)' : '') +
        '\n\n' + COMO_SE_LEE, [A, B]);
    } finally { restaurar(guardado); game.glowFocus = focus0; }
  };

  // El MISMO paseo, midiendo el escalón de luz en vez de los ms. No se instalan envolturas: medir el coste
  // aquí sólo añadiría ruido, y el escalón no depende de lo que tarde el frame (la ruta va por índice).
  const crudoSalto = (r) => ({
    etiqueta: r.etiqueta, mide: 'salto', conducido: true, firmaRuta: r.firmaRuta,
    seg: +num(r.ms / 1000, 2), frames: r.frames, fps: +num(r.frames / (r.ms / 1000), 1),
    celdas: r.celdas, celdasAlumbradas: r.celdasVivas, nivelMax: +num(r.nivelMax, 3),
    MC_LUZ_SUB: r.sub, glowFocus: r.focus, luzSuave: r.suave,
    escalonMax: +num(r.escalonMax, 3), escalonMedio: +num(r.suma / Math.max(1, r.frames), 4),
    pctBrilloMax: +num(100 * r.escalonMax / 15, 2),
    reparto: { quieto: r.hist[0], medioSubnivel: r.hist[1], unSubnivel: r.hist[2], hasta05: r.hist[3],
               hasta1: r.hist[4], hasta2: r.hist[5], mas2: r.hist[6] },
    peldanosVisibles: r.hist[3] + r.hist[4] + r.hist[5] + r.hist[6],
    conRehorneo: { frames: r.conReh.n, medio: +num(r.conReh.suma / Math.max(1, r.conReh.n), 4), peor: +num(r.conReh.max, 3) },
    congelado: { frames: r.sinReh.n, medio: +num(r.sinReh.suma / Math.max(1, r.sinReh.n), 4), peor: +num(r.sinReh.max, 3) },
    cajasMovidas: r.cajasMovidas, crucesDeCelda: r.cruces, peores: r.peores,
  });

  sonda.salto = async (frames, opts) => {
    const cfg = Object.assign({ calienta: 30 }, RUTA, opts || {});
    frames = +frames || 600;
    const guardado = preparar(cfg);
    mc.pitch = sonda.origen.pitch;
    try {
      const r = await faseSalto(frames, 'salto', sonda.origen, cfg);
      return await publica(tablaSalto(r) + '\n\n' + COMO_SE_LEE_SALTO(), [r], crudoSalto);
    } finally { restaurar(guardado); }
  };

  // A/B del muestreo fino sobre la MISMA ruta: es el mando que el dueño ya tiene («con luzSuave va mejor pero
  // no lo suficiente»), y esto pone cifras a las dos mitades de esa frase. `luzSuave` no cambia el número de
  // rehorneos, sólo dónde se siembra cada emisor, así que las dos fases son comparables celda a celda.
  sonda.saltoAb = async (frames, opts) => {
    const cfg = Object.assign({ calienta: 30 }, RUTA, opts || {});
    frames = +frames || 600;
    const guardado = preparar(cfg);
    const suave0 = game.luzSuave;
    console.log('%cA/B del SALTO sobre la misma ruta: game.luzSuave puesto contra quitado. No toques nada.',
                'font-weight:bold');
    try {
      game.luzSuave = true;  await new Promise(r => setTimeout(r, 800)); mc.pitch = sonda.origen.pitch;
      const A = await faseSalto(frames, 'A · luzSuave = true', sonda.origen, cfg);
      game.luzSuave = false; await new Promise(r => setTimeout(r, 800)); mc.pitch = sonda.origen.pitch;
      const B = await faseSalto(frames, 'B · luzSuave = false', sonda.origen, cfg);
      const misma = A.firmaRuta === B.firmaRuta;
      return await publica(tablaSalto(A) + '\n\n' + tablaSalto(B) +
        '\n\n═══ ' + (misma ? 'MISMA RUTA (firmaRuta ' + A.firmaRuta + '): la comparación vale.'
                           : '⚠️ RUTAS DISTINTAS (' + A.firmaRuta + ' vs ' + B.firmaRuta + '): no vale.') +
        '\n    escalón máximo: ' + num(A.escalonMax, 3) + ' → ' + num(B.escalonMax, 3) + ' niveles' +
        '\n    peldaños visibles: ' + (A.hist[3] + A.hist[4] + A.hist[5] + A.hist[6]) + ' → ' +
                                      (B.hist[3] + B.hist[4] + B.hist[5] + B.hist[6]) + ' frames' +
        '\n    LO QUE QUEDA con el muestreo fino puesto es el suelo del campo (0,25 niveles): eso no lo arregla' +
        '\n    `luzSuave`, porque no es dónde se siembra sino con cuánta resolución se GUARDA.' +
        '\n\n' + COMO_SE_LEE_SALTO(), [A, B], crudoSalto);
    } finally { restaurar(guardado); game.luzSuave = suave0; }
  };

  // Clava el origen del paseo. Se guarda en localStorage para que la MISMA ruta siga valiendo mañana.
  sonda.aqui = () => {
    if (!mc || !mc.active) { console.warn('abre el Mundo primero'); return null; }
    sonda.origen = { pos: mc.pos.slice(), yaw: mc.yaw, pitch: mc.pitch,
                     mapa: (typeof mcMapaActual === 'function' ? mcMapaActual() : null) };
    try { localStorage.setItem('vf_luzPaseoOrigen', JSON.stringify(sonda.origen)); } catch (e) {}
    const o = sonda.origen;
    console.log('· origen del paseo: [' + o.pos.map(v => num(v, 2)).join(', ') + '] mirando ' +
                Math.round(o.yaw * 180 / Math.PI) + '° · mapa ' + o.mapa);
    return sonda.origen;
  };

  const COMO_SE_LEE =
    '   Cómo se lee: la ruta es la misma en todas las tiradas, así que las columnas «ms/frame» y «% reloj» SON\n' +
    '   comparables entre medidas. `roturas de firma` debería salir igual en dos tiradas de la misma ruta: si\n' +
    '   no sale igual, el candado `mc._dynSig` depende de algo más que de la posición, y eso es un hallazgo.\n' +
    '   Si el peor frame cae en un frame BAJO (los primeros), sospecha de la foto de la medida anterior, no\n' +
    '   del motor: por eso se descartan los de calentamiento.';

  sonda.foto = true;
  sonda.texto = '(aún no se ha medido nada: await sondaLuzPaseo(600))';
  sonda.ruta = RUTA;
  try { const o = JSON.parse(localStorage.getItem('vf_luzPaseoOrigen') || 'null'); if (o && o.pos) sonda.origen = o; } catch (e) {}
  window.sondaLuzPaseo = sonda;
  console.log('%csondaLuzPaseo listo.%c  sondaLuzPaseo.aqui() para clavar el origen · await sondaLuzPaseo(600) ' +
              '· await sondaLuzPaseo.ab(600) · await sondaLuzPaseo.salto(600) · await sondaLuzPaseo.saltoAb(600)' +
              (sonda.origen ? '\n· origen recordado: [' +
              sonda.origen.pos.map(v => num(v, 1)).join(', ') + '] mapa ' + sonda.origen.mapa : ''),
              'font-weight:bold', '');
})();
