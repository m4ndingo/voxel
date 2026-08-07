// BUG-RS6 · la PUERTA de dos celdas — que vuelva a ser redstone y que las dos hojas se muevan juntas.
//
// El ticket sale de que el dueño subió su puerta de 16³ a 16×16×24 porque la de antes era demasiado
// baja: con eso dejó de caber en una celda, el clic derecho pasó a estamparla como estructura suelta
// y una estructura no tiene señal. La respuesta acordada fue apilar DOS celdas de rejilla, con una
// condición suya: «tendrían que moverse al unísono si es una puerta que se abre».
//
// Por eso el test central no es «¿se abrió?» sino «¿en qué PASADA se abrió cada hoja?». Se conmuta
// la palanca y se va tickeando de uno en uno anotando las dos celdas: la pasada en la que cambia la
// de abajo tiene que ser LA MISMA en la que cambia la de arriba. Con el apaño anterior (`conduce`)
// esto habría fallado por un tick, que es justo lo que el dueño no quiere ver.
//
//   A · las piezas caben en una celda de rejilla — el fallo original, medido de frente
//   B · dos hojas: se abren y se cierran en la misma pasada, en los cuatro giros
//   C · la orientación se arrastra a la hoja de arriba
//   D · media puerta sola (sin hoja arriba) sigue funcionando y no escribe encima
//   E · lo que haya encima que no sea media puerta NO se pisa
//   F · la puerta ya no conduce señal (una de Minecraft tampoco)
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE, como el resto de la suite.
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
const { chromium } = require('playwright');
const fs = require('fs');

const motor = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
    window.__avisos = [];
    const warn = console.warn.bind(console);
    console.warn = (...a) => { window.__avisos.push(a.join(' ')); warn(...a); };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const ori = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? +k.slice(i + 1) : 0; };

    // ── hueco de aire donde montar, con el mismo barrido que el resto de la suite ─────────────
    let caja = null;
    const AN = 20, AL = 8, PR = 20;
    const yTop = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 4; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar la puerta'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    // ── materiales ────────────────────────────────────────────────────────────────────────────
    // Se precargan a propósito (el snippet los carga solo, pero eso es asíncrono y aquí se mide el
    // movimiento, no la carga). Que no falte ninguno es en sí una comprobación: son 4 piezas × 4
    // giros y basta con que se olvide una para que media puerta se quede quieta.
    const HOJAS = ['hab:puerta', 'hab:puerta-abierta', 'hab:puerta-alta', 'hab:puerta-alta-abierta'];
    const CLAVES = ['hab:cable', 'hab:palanca', 'hab:palanca-on'];
    for (const rot of [0, 1, 2, 3]) for (const k of HOJAS) CLAVES.push(rot ? k + '@' + rot : k);
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !mc.name2id[k]);

    // ── A · ¿caben en una celda de rejilla? ───────────────────────────────────────────────────
    // Ésta es la medida del fallo original: con 16×16×24, mcCabeEnRejilla decía que no y el clic
    // derecho estampaba una estructura. Se calienta la huella primero (si nunca se ha mirado el
    // dibujo, la respuesta es «no» por falta de datos, no por tamaño).
    out.rejilla = {};
    for (const k of HOJAS) {
      try { await mcStructCells(k); } catch (e) { out.errs.push('huella de «' + k + '»: ' + e.message); }
      const rec = mc.structs[k] || {};
      out.rejilla[k] = { cabe: !!mcCabeEnRejilla(k), fina: !!mcEsFinaEnRejilla(k),
                         w: rec.w, h: rec.h, d: rec.d, nvox: rec.nvox };
    }

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const revisa = C => R.revisarCaja(C[0] - 4, C[1] - 4, C[2] - 4, C[0] + 4, C[1] + 4, C[2] + 4);
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };

    // Monta palanca(al lado) → PUERTA(abajo) [+ hoja de arriba]. `arriba` es la clave que se pone en
    // la celda de encima, o null para dejarla vacía.
    const monta = (C, rot, arriba) => {
      const suf = rot ? '@' + rot : '';
      for (let dy = 0; dy <= 2; dy++) pon(C[0], C[1] + dy, C[2], null);
      pon(C[0] - 1, C[1], C[2], null);
      pon(C[0], C[1], C[2], 'hab:puerta' + suf);
      if (arriba) pon(C[0], C[1] + 1, C[2], arriba + suf);
      pon(C[0] - 1, C[1], C[2], 'hab:palanca');
      revisa(C); ticks(8);
      return C;
    };
    const desmonta = C => {
      for (let dy = 0; dy <= 2; dy++) pon(C[0], C[1] + dy, C[2], null);
      pon(C[0] - 1, C[1], C[2], null);
      ticks(4);
    };
    // Conmuta la palanca y tickea DE UNO EN UNO anotando las dos celdas. Devuelve la traza, que es
    // lo que permite preguntar «¿en qué pasada cambió cada hoja?» en vez de solo «¿cambió?».
    const traza = (C, on) => {
      mcSetBlock(C[0] - 1, C[1], C[2], mc.name2id[on ? 'hab:palanca-on' : 'hab:palanca']);
      revisa(C);
      const pasos = [[claveEn(C[0], C[1], C[2]), claveEn(C[0], C[1] + 1, C[2])]];
      for (let i = 0; i < 14; i++) {
        R.tick();
        pasos.push([claveEn(C[0], C[1], C[2]), claveEn(C[0], C[1] + 1, C[2])]);
      }
      return pasos;
    };

    // ── B y C · dos hojas, los cuatro giros ───────────────────────────────────────────────────
    out.giros = {};
    for (const rot of [0, 1, 2, 3]) {
      const C = [X + 10, Y + 2, Z + 10];
      monta(C, rot, 'hab:puerta-alta');
      out.giros[rot] = { abrir: traza(C, true), cerrar: traza(C, false) };
      desmonta(C);
    }

    // ── D · media puerta sola: sin hoja arriba ────────────────────────────────────────────────
    {
      const C = [X + 10, Y + 2, Z + 10];
      monta(C, 0, null);
      out.sola = { abrir: traza(C, true), cerrar: traza(C, false) };
      desmonta(C);
    }

    // ── E · encima hay otra cosa: no se toca ──────────────────────────────────────────────────
    // La puerta MUEVE una puerta, no la construye. Lo que el dueño haya puesto ahí arriba se queda.
    {
      const C = [X + 10, Y + 2, Z + 10];
      const AJENO = mc.blockKey[mc.name2id['roca']] ? 'roca' : null;
      if (!AJENO) { out.ajeno = null; }
      else {
        monta(C, 0, null);
        pon(C[0], C[1] + 1, C[2], AJENO);
        revisa(C); ticks(6);
        const t = traza(C, true);
        out.ajeno = { esperado: base(mc.blockKey[mc.name2id[AJENO]]), fin: t[t.length - 1] };
        traza(C, false);
        desmonta(C);
      }
    }

    // ── F · la puerta NO conduce ──────────────────────────────────────────────────────────────
    // palanca → puerta → cable: el cable del otro lado tiene que quedarse apagado. Antes la puerta
    // conducía (con `perdida: 1`) solo para que la hoja de arriba se enterase; ya no hace falta.
    {
      const C = [X + 10, Y + 2, Z + 10];
      monta(C, 0, 'hab:puerta-alta');
      pon(C[0] + 1, C[1], C[2], 'hab:cable');
      revisa(C); ticks(6);
      traza(C, true);
      out.conduce = { cable: base(claveEn(C[0] + 1, C[1], C[2])),
                      puerta: base(claveEn(C[0], C[1], C[2])) };
      traza(C, false);
      pon(C[0] + 1, C[1], C[2], null);
      desmonta(C);
    }

    // ── deshacer ──────────────────────────────────────────────────────────────────────────────
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    R.revisarCaja(X - 2, Y - 2, Z - 2, X + AN + 2, Y + AL + 2, Z + PR + 2);
    ticks(8);
    out.avisos = (window.__avisos || []).slice(0, 12);
    return out;
  });

  // ── lectura ─────────────────────────────────────────────────────────────────────────────────
  const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
  const ori = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? +k.slice(i + 1) : 0; };
  // Primera pasada en la que la celda deja de ser lo que era; -1 si no cambió nunca.
  const cambio = (pasos, i) => {
    const de = pasos[0][i];
    for (let n = 1; n < pasos.length; n++) if (pasos[n][i] !== de) return n;
    return -1;
  };
  const fin = pasos => pasos[pasos.length - 1];

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja)
    + (r.faltan && r.faltan.length ? '  · FALTAN: ' + r.faltan.join(', ') : ''));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  ok(!r.faltan || !r.faltan.length, 'las cuatro hojas existen en los cuatro giros',
    (r.faltan || []).join(', '));

  console.log('\nA · las piezas caben en UNA celda de rejilla (el fallo del ticket)');
  for (const k of Object.keys(r.rejilla || {})) {
    const g = r.rejilla[k];
    ok(g.cabe, k + ' entra en mc.grid en vez de estamparse como estructura',
      'w=' + g.w + ' h=' + g.h + ' d=' + g.d + ' nvox=' + g.nvox);
    ok(g.fina, k + ' se dibuja con su geometría de verdad dentro de la malla del chunk');
  }

  console.log('\nB · las DOS hojas se mueven en la MISMA pasada (la condición del dueño)');
  for (const rot of [0, 1, 2, 3]) {
    const g = r.giros[rot];
    const aAb = cambio(g.abrir, 0), aAr = cambio(g.abrir, 1);
    const cAb = cambio(g.cerrar, 0), cAr = cambio(g.cerrar, 1);
    ok(base(fin(g.abrir)[0]) === 'hab:puerta-abierta' && base(fin(g.abrir)[1]) === 'hab:puerta-alta-abierta',
      '@' + rot + ' se abren las dos hojas', fin(g.abrir).join(' + '));
    ok(aAb > 0 && aAb === aAr, '@' + rot + ' AL UNÍSONO al abrir (pasada ' + aAb + ' y ' + aAr + ')');
    ok(base(fin(g.cerrar)[0]) === 'hab:puerta' && base(fin(g.cerrar)[1]) === 'hab:puerta-alta',
      '@' + rot + ' se cierran las dos hojas', fin(g.cerrar).join(' + '));
    ok(cAb > 0 && cAb === cAr, '@' + rot + ' AL UNÍSONO al cerrar (pasada ' + cAb + ' y ' + cAr + ')');
  }

  console.log('\nC · la orientación se arrastra a la hoja de arriba');
  for (const rot of [0, 1, 2, 3]) {
    const f = fin(r.giros[rot].abrir);
    ok(ori(f[0]) === rot && ori(f[1]) === rot,
      '@' + rot + ' las dos hojas abiertas conservan su giro', f.join(' + '));
  }

  console.log('\nD · media puerta sola sigue siendo una puerta');
  ok(base(fin(r.sola.abrir)[0]) === 'hab:puerta-abierta', 'se abre sin hoja de arriba',
    String(fin(r.sola.abrir)[0]));
  ok(fin(r.sola.abrir)[1] === null, '…y no escribe nada en la celda de encima',
    String(fin(r.sola.abrir)[1]));
  ok(base(fin(r.sola.cerrar)[0]) === 'hab:puerta', 'y vuelve a cerrarse');

  console.log('\nE · lo que haya encima que no sea media puerta no se pisa');
  if (r.ajeno === null) console.log('  --   no hay «roca» en la paleta; caso no medido');
  else {
    ok(base(r.ajeno.fin[0]) === 'hab:puerta-abierta', 'la puerta se abre igual', String(r.ajeno.fin[0]));
    ok(base(r.ajeno.fin[1]) === r.ajeno.esperado, 'el bloque de encima sigue ahí intacto',
      String(r.ajeno.fin[1]) + ' (esperado ' + r.ajeno.esperado + ')');
  }

  console.log('\nF · la puerta ya no conduce señal');
  ok(r.conduce.puerta === 'hab:puerta-abierta', 'la puerta sí se abre', r.conduce.puerta);
  ok(r.conduce.cable === 'hab:cable', 'el cable del otro lado se queda apagado', String(r.conduce.cable));

  if (r.avisos && r.avisos.length) console.log('\navisos:\n  ' + r.avisos.join('\n  '));
  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
