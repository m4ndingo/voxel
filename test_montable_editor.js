// REQ-MNT2 · «quiero que game.esqueletos.montable(1,'cabeza') sea algo configurable desde el editor
// de agentes, decir si una parte del agente articulado es montable».
//
// REQ-MNT1 dejó el acarreo funcionando pero solo por scripting y por INSTANCIA: había que repetir la
// llamada cada vez que se plantaba el bicho y no quedaba escrito en ninguna parte. Esto comprueba las
// dos mitades del reparto, que viven en ficheros distintos:
//
//   A · EL EDITOR (app.js, en /) — la casilla escribe `montable` en la PIEZA del documento, apagarla
//       borra la clave (un agente de siempre no engorda), vale también en la RAÍZ, y lo que el panel
//       manda al servidor lleva la marca.
//   B · EL MUNDO (el snippet, en /map/test) — un documento con la marca se planta y la pieza YA nace
//       montable SIN LLAMAR A NADA, y te lleva de verdad.
//
// ⚠️ El invariante de que «te lleva» es el de test_montar_agente.js y no un número a mano: mientras
// vas montado TU SITIO DENTRO DE LA PIEZA (L = Rᵀ·(p − t)) no cambia. Aquí solo cambia QUIÉN encendió
// la marca, así que aquel test tiene que seguir en verde tal cual y éste no lo repite entero.
//
// No persiste nada: bloquea los POST/PUT/DELETE y retira los agentes que crea.
//
//   node test_montable_editor.js [url]       por defecto http://localhost:8500

const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:8500').replace(/\/+$/, '');
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const errores = [];

  // ── A · EL EDITOR ──────────────────────────────────────────────────────────────────────────────
  const pe = await b.newPage();
  pe.on('pageerror', e => errores.push('editor: ' + e.message));
  await pe.route('**/api/mundo', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  await pe.route('**/api/habitantes*', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  // Se anota lo que el panel HABRÍA guardado sin dejarlo escribir: es la única forma de comprobar que
  // la marca viaja en el documento sin crear un agente de verdad en data/agentes/.
  const enviados = [];
  await pe.route('**/api/agentes*', r => {
    if (r.request().method() === 'GET') return r.continue();
    let d = null; try { d = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
    enviados.push({ metodo: r.request().method(), doc: d });
    return r.abort();
  });

  await pe.goto(BASE + '/', { timeout: 60000 });
  await pe.click('#btn-mas');                       // «🦴 Agentes» vive dentro del menú «⋯» (REQ-NAV1)
  await pe.click('[data-tab="agentes"]');
  await pe.waitForFunction('window.game && game.esqueletos && typeof agDoc !== "undefined" && agDoc && !document.querySelector("#ag-modal").hidden',
    null, { timeout: 60000 });

  console.log('\n--- A · el editor de agentes (' + BASE + '/) ---');

  const A = await pe.evaluate(async () => {
    const out = { avisos: [] };
    const pausa = () => new Promise(r => setTimeout(r, 0));
    const flds = () => [...document.querySelectorAll('#ag-form .ag-fld')];
    // El rótulo de una casilla va DESPUÉS del input, y detrás cuelgan el «?» y su nota: por eso se
    // busca por prefijo del texto y no por igualdad exacta.
    const casilla = t => flds().find(l => l.textContent.trim().startsWith(t));
    const chips = () => [...document.querySelectorAll('#ag-chips .ag-chip')]
      .map(e => ({ txt: e.textContent, on: e.classList.contains('on') }));
    const tags = () => [...document.querySelectorAll('#ag-piezas li')]
      .map(li => [...li.querySelectorAll('.ap-tag')].map(t => t.textContent).join(' + '));
    async function conmutar(t, on) {
      const l = casilla(t); if (!l) { out.avisos.push('no encuentro la casilla «' + t + '»'); return false; }
      const c = l.querySelector('input[type=checkbox]');
      if (!!c.checked !== !!on) { c.checked = !!on; c.dispatchEvent(new Event('change', { bubbles: true })); await pausa(); }
      return true;
    }
    const elegir = async i => { document.querySelectorAll('#ag-piezas li')[i].click(); await pausa(); };

    // Se trabaja sobre el zombie guardado: tiene raíz + varias piezas, que es lo que hace falta para
    // probar las dos (la cabeza y el torso).
    await agCargar('zombie');
    for (let i = 0; i < 200 && !(agDoc && agDoc.piezas && agDoc.piezas.length); i++) await new Promise(r => setTimeout(r, 25));
    out.agente = agDoc && agDoc.nombre;
    out.nPiezas = agDoc ? agDoc.piezas.length : 0;

    // El documento de partida NO trae la clave: si la trajera, todo lo de abajo sería un falso verde.
    out.limpioAlEmpezar = !('montable' in agDoc.raiz) && !agDoc.piezas.some(q => 'montable' in q);

    // 1) La casilla existe en una pieza que no es la raíz, y la enciende.
    await elegir(1);                                  // la 0 es la raíz; la 1 es la cabeza del zombie
    out.piezaElegida = agPiezas()[1].nombre;
    out.hayCasilla = !!casilla('te lleva montado');
    out.marcadaAlEmpezar = out.hayCasilla ? casilla('te lleva montado').querySelector('input').checked : null;
    await conmutar('te lleva montado', true);
    out.trasEncender = agDoc.piezas[0].montable;
    out.tagTrasEncender = tags()[1];
    out.chipsTrasEncender = chips().filter(c => c.txt.indexOf('🧍') === 0);

    // 2) Apagarla BORRA la clave. Dejarla en `false` engordaría el documento de todo el que abra el
    //    panel, que es la regla que ya cumplen las capacidades del bicho entero.
    await conmutar('te lleva montado', false);
    out.claveTrasApagar = ('montable' in agDoc.piezas[0]);
    out.tagTrasApagar = tags()[1];

    // 3) La RAÍZ también: un agente-plataforma (una barca, un ascensor) no tiene más pieza que su torso.
    await elegir(0);
    out.hayCasillaRaiz = !!casilla('te lleva montado');
    await conmutar('te lleva montado', true);
    out.raizMontable = agDoc.raiz.montable;
    out.tagRaiz = tags()[0];

    // 4) Y sobrevive a ir y volver por el formulario (que se reconstruye entero en cada cambio).
    await elegir(1); await elegir(0);
    out.raizTrasVolver = casilla('te lleva montado').querySelector('input').checked;

    // 5) Lo que el panel MANDA al servidor lleva la marca: es lo que hace que persista.
    await elegir(1);
    await conmutar('te lleva montado', true);
    document.querySelector('#ag-save').click();
    await new Promise(r => setTimeout(r, 400));
    return out;
  });

  if (A.avisos.length) A.avisos.forEach(a => ok(false, 'preparación: ' + a));
  ok(A.limpioAlEmpezar === true, 'el zombie guardado NO trae `montable` (si no, esto sería un falso verde)');
  ok(A.hayCasilla === true, 'la pieza tiene la casilla «te lleva montado»', A.agente + ' → «' + A.piezaElegida + '»');
  ok(A.marcadaAlEmpezar === false, 'sale apagada en un agente que no la lleva');
  ok(A.trasEncender === true, 'encenderla escribe `montable:true` en la PIEZA del documento');
  ok(/🧍/.test(A.tagTrasEncender || ''), 'la lista de piezas lo marca', A.tagTrasEncender);
  ok(!!(A.chipsTrasEncender[0] && A.chipsTrasEncender[0].on), 'el resumen del bicho lo dice',
     A.chipsTrasEncender.map(c => c.txt).join(' / '));
  ok(A.claveTrasApagar === false, 'apagarla BORRA la clave (el documento no engorda por abrir el panel)');
  ok(!/🧍/.test(A.tagTrasApagar || ''), 'y la lista deja de marcarlo', A.tagTrasApagar);
  ok(A.hayCasillaRaiz === true, 'la RAÍZ también la tiene (agente-plataforma)');
  ok(A.raizMontable === true, 'y se escribe en `raiz.montable`');
  ok(/🧍/.test(A.tagRaiz || ''), 'la raíz se marca en la lista', A.tagRaiz);
  ok(A.raizTrasVolver === true, 'la casilla LEE el documento: sigue marcada al volver a la raíz');

  const post = enviados.filter(e => e.metodo === 'POST').pop();
  ok(!!post, 'el panel manda el documento al guardar', post ? post.metodo : 'no mandó nada');
  ok(!!(post && post.doc && post.doc.piezas && post.doc.piezas[0].montable === true),
     'y lo que manda lleva `montable` en la pieza (por eso persiste)');
  ok(!!(post && post.doc && post.doc.raiz && post.doc.raiz.montable === true),
     '...y en la raíz');
  await pe.close();

  // ── B · EL MUNDO ───────────────────────────────────────────────────────────────────────────────
  const pm = await b.newPage();
  pm.on('pageerror', e => errores.push('mundo: ' + e.message));
  await pm.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await pm.goto(BASE + '/map/test', { waitUntil: 'load', timeout: 120000 });
  await pm.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await pm.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.agentes', null, { timeout: 120000 });
  await pm.waitForTimeout(4000);

  console.log('\n--- B · el Mundo (' + BASE + '/map/test) ---');

  const B = await pm.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 12) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 20 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 20 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde hacer las pruebas'); return out; }
    const [X, Y, Z] = sitio;

    const base = await game.agentes.cargar('zombie');
    if (!base) { out.errs.push('no hay agente "zombie" guardado'); return out; }
    const copia = () => JSON.parse(JSON.stringify(base));
    const creados = [];
    const plantar = async (doc, dx) => {
      const rig = await game.esqueletos.crear(doc, X + dx, Y, Z + 2);
      if (!rig) return null;
      // ⚠️ El paseo de abajo es a mano (game.esqueletos.desplazar). Desde BUG-AG11 ir montado es
      // «no te veo», y sin ver a nadie un rig con `volver` (el defecto) regresa a su ancla y
      // deshace el paseo frame a frame. Aquí se prueba la CASILLA y el acarreo, no el seguimiento.
      rig.G.volver = false;
      creados.push(rig);
      for (let i = 0; i < 60 && !rig.partes.some(P => P.s && P.s.model); i++) await frame();
      return rig;
    };

    try {
      // 1) El caso de siempre: SIN la clave, nadie te lleva. Es la compatibilidad hacia atrás.
      const rSin = await plantar(copia(), 2);
      if (!rSin) { out.errs.push('no se pudo plantar el agente de control'); return out; }
      out.sinClave = rSin.partes.map(P => !!P.montable);

      // 2) Con la clave en el DOCUMENTO y SIN LLAMAR A NADA: la parte nace montable.
      const doc = copia();
      const iCab = doc.piezas.findIndex(q => q.nombre === 'cabeza');
      if (iCab < 0) { out.errs.push('el zombie ya no tiene una pieza «cabeza»'); return out; }
      doc.piezas[iCab].montable = true;
      const rCon = await plantar(doc, 6);
      if (!rCon) { out.errs.push('no se pudo plantar el agente marcado'); return out; }
      out.piezas = rCon.partes.map(P => P.nombre);
      out.marcadas = rCon.partes.filter(P => P.montable).map(P => P.nombre);

      // 3) La RAÍZ, por su cuenta: crearEsqueleto se fabrica la pieza 0 a mano y se le podría olvidar.
      const docR = copia();
      docR.raiz.montable = true;
      const rRaiz = await plantar(docR, 10);
      if (!rRaiz) { out.errs.push('no se pudo plantar el agente-plataforma'); return out; }
      out.raizMarcada = !!rRaiz.partes[0].montable;
      out.raizNombre = rRaiz.partes[0].nombre;
      out.raizSolaElla = rRaiz.partes.filter(P => P.montable).length;

      // 4) ...y te lleva DE VERDAD, sin haber llamado a montable(). Mismo invariante que
      //    test_montar_agente.js: tu sitio dentro de la pieza no cambia mientras vas montado.
      const obj = rCon.partes.find(P => P.nombre === 'cabeza');
      if (!obj || !obj.s || !obj.s.model) { out.errs.push('la cabeza no tiene matriz'); return out; }
      const local = s => {
        const m = s.model, p = mc.pos;
        const py = mc._pasoDesfase ? mc._pasoReal : p[1];      // la Y física, no la pintada
        const dx = p[0] - m[12], dy = py - m[13], dz = p[2] - m[14];
        return [m[0] * dx + m[1] * dy + m[2] * dz,
                m[4] * dx + m[5] * dy + m[6] * dz,
                m[8] * dx + m[9] * dy + m[10] * dz];
      };
      const mundo = (s, L) => {
        const m = s.model;
        return [m[0] * L[0] + m[4] * L[1] + m[8] * L[2] + m[12],
                m[1] * L[0] + m[5] * L[1] + m[9] * L[2] + m[13],
                m[2] * L[0] + m[6] * L[1] + m[10] * L[2] + m[14]];
      };
      const dist = (A2, B2) => Math.hypot(A2[0] - B2[0], A2[1] - B2[1], A2[2] - B2[2]);
      const subir = async s => {
        const a = s.aabb;
        const w = mundo(s, [(a[0] + a[3]) / 2, a[4] + 0.05, (a[2] + a[5]) / 2]);
        mc.pos[0] = w[0]; mc.pos[1] = w[1]; mc.pos[2] = w[2];
        if (mc.vel) { mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0; }
        await frame();
      };
      const pasear = async (rig, s) => {
        const L0 = local(s), p0 = [mc.pos[0], mc.pos[1], mc.pos[2]], q0 = mundo(s, L0);
        let peor = 0;
        for (let i = 0; i < 8; i++) {
          game.esqueletos.desplazar(rig, 0.25, 0, 0);
          await frame();
          const d = dist(L0, local(s)); if (d > peor) peor = d;
        }
        const pf = [mc.pos[0], mc.pos[1], mc.pos[2]];
        return { derivaLocal: +peor.toFixed(3),
                 viajePunto: +dist(q0, mundo(s, L0)).toFixed(3),
                 viajeJugador: +dist(p0, pf).toFixed(3),
                 // El viaje HORIZONTAL aparte: al que no va montado se le cae encima la gravedad, y
                 // en 3D esa caída cuenta como «se ha movido» aunque no le haya llevado nadie.
                 viajeJugadorH: +Math.hypot(pf[0] - p0[0], pf[2] - p0[2]).toFixed(3) };
      };
      await subir(obj.s);
      out.subido = +local(obj.s)[1].toFixed(3) >= obj.s.aabb[4] - 0.2;
      out.lleva = await pasear(rCon, obj.s);

      // 5) Y el de control, con la MISMA pieza y el mismo paseo, se va sin ti.
      const obj0 = rSin.partes.find(P => P.nombre === 'cabeza');
      await subir(obj0.s);
      out.noLleva = await pasear(rSin, obj0.s);

      // 6) La válvula por instancia sigue mandando sobre el documento, en los DOS sentidos.
      out.apagadaAMano = game.esqueletos.montable(rCon.id, 'cabeza', false);
      out.encendidaAMano = game.esqueletos.montable(rSin.id, 'cabeza');
      out.trasApagar = !!rCon.partes.find(P => P.nombre === 'cabeza').montable;
      out.trasEncender = !!rSin.partes.find(P => P.nombre === 'cabeza').montable;
    } finally {
      creados.forEach(r => { try { game.esqueletos.quitar(r); } catch (e) {} });
      await frame();
      out.retirado = !mc.structures.some(s => s && s._rig);
    }
    return out;
  });

  if (B.errs && B.errs.length) B.errs.forEach(e => ok(false, 'preparación: ' + e));
  ok(!!(B.sinClave && B.sinClave.every(v => v === false)),
     'un documento SIN la clave no marca ninguna pieza (compatibilidad)', (B.sinClave || []).join(','));
  ok(!!(B.marcadas && B.marcadas.length === 1 && B.marcadas[0] === 'cabeza'),
     'con `montable:true` en el documento la pieza nace marcada SIN llamar a nada',
     'marcadas: ' + (B.marcadas || []).join(', ') + ' de ' + (B.piezas || []).join(', '));
  ok(B.raizMarcada === true, 'la RAÍZ también llega marcada (crearEsqueleto se la fabrica a mano)', B.raizNombre);
  ok(B.raizSolaElla === 1, 'y solo ella: no se contagia al resto del bicho');
  ok(B.subido === true, 'el jugador queda encima de la pieza');
  const L = B.lleva || {}, S = B.noLleva || {};
  ok(L.derivaLocal !== undefined && L.derivaLocal < 0.25,
     'montado, tu sitio DENTRO de la pieza no cambia (L = Rᵀ·(p − t))', 'deriva ' + L.derivaLocal);
  ok(L.viajeJugador > 1 && Math.abs(L.viajeJugador - L.viajePunto) < 0.35,
     'y viajas lo que viaja el punto que pisas', 'jugador ' + L.viajeJugador + ' vs punto ' + L.viajePunto);
  // El control se mide por la DERIVA, igual que el caso D de test_montar_agente.js: al soltarte te
  // quedas atrás DENTRO de la pieza. Exigir que el jugador no se mueva sería mentira — sin nadie que
  // te lleve te caes, y la caída es movimiento.
  ok(S.viajePunto > 1 && S.derivaLocal > 1,
     'el de control se va sin ti: te quedas atrás dentro de la pieza',
     'deriva ' + S.derivaLocal + ' con el punto viajando ' + S.viajePunto);
  ok(S.viajeJugadorH < 0.35, '...y en horizontal no te arrastra ni un poco',
     S.viajeJugadorH + ' vs ' + L.viajeJugadorH + ' montado');
  ok(B.apagadaAMano === false && B.trasApagar === false,
     'montable(rig,pieza,false) apaga en ESE bicho lo que el documento enciende');
  ok(B.encendidaAMano === true && B.trasEncender === true,
     '...y lo enciende en uno cuyo documento no lo trae (válvula en los dos sentidos)');
  ok(B.retirado === true, 'los agentes de prueba se retiran del mundo');

  console.log('');
  ok(errores.length === 0, 'sin excepciones en la página', errores.join(' | ') || 'ninguna');
  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
