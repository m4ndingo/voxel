// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián) de REQ-EXTRU3, la caja de Seleccionar que se mueve aunque esté vacía.
//
// Dueño (2026-08-28): «*cuando hago shift+wheel o control+wheel me dice a veces "la seleccion no tiene
// bloques, nada que cavar", no importa si no tiene bloques, la seleccion ha de moverse igualmente*».
//
// Nació validando el snippet `sel-mueve-vacia`; desde que el dueño lo dio por bueno («*aplicar a
// app.js*») mide EL MOTOR (`mcSelMueveVacia`), que es quien lo hace ahora. Por eso llama a
// `mcSelExtruir`/`mcSelExtruirFrente` a pelo y no carga el snippet: éste se aparta solo al ver la
// función en app.js, y §8 comprueba justamente eso.
//
// Se comprueban las DOS mitades del trato, porque el snippet vale si arregla una SIN romper la otra:
//   · caja VACÍA  → viaja una celda entera en el sentido del gesto, sin editar ni un bloque.
//   · caja CON bloques → manda el motor, intacto (incluida su guarda «un wup y un wdown dejan los
//     bloques como estaban», regla del dueño de 2026-08-20).
//
// Corre en `/map/empty` y con el AUTOGUARDADO APAGADO: la sonda cava de verdad para probar el paso al
// motor, y eso no puede acabar en disco. Se comprueba al final que `empty.vox` no se ha tocado.
//
//   node tests/probe_sel_vacia.js [url]
const { execFileSync } = require('child_process');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';

(async () => {
  const mtimeAntes = fs.statSync(VOX).mtimeMs;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  const prep = await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco
    mc.tool = 'select';
    // Un sitio con suelo: se busca la columna por el centro del mapa y se anota su cima.
    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    window.__sitio = { cx, cz, suelo };
    // Huella de la rejilla: cualquier bloque que se ponga o se quite mueve esta cuenta.
    window.__huella = () => { let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++; return n; };
    window.__caja = (a, b) => { mc.selCajas = [{ a: a.slice(), b: b.slice() }]; mc.selA = null; };
    window.__leo = () => mc.selCajas.map(s => ({ a: s.a.slice(), b: s.b.slice() }));
    return { dim: [mc.dim.x, mc.dim.y, mc.dim.z], suelo, bloques: window.__huella(), autosave: game.autosave() };
  });
  console.log('escena ·', JSON.stringify(prep));
  if (prep.suelo < 0) { console.log('SIN SUELO en el centro del mapa: la sonda no vale'); await browser.close(); return; }

  const enElMotor = await page.evaluate(() => typeof mcSelMueveVacia === 'function');
  console.log('mcSelMueveVacia en app.js ·', enElMotor);
  if (!enElMotor) { console.log('ESTE app.js NO LLEVA REQ-EXTRU3: falta parche_app_sel_vacia.py'); await browser.close(); return; }

  const res = await page.evaluate(() => {
    const S = window.__sitio, out = {};
    const alto = S.suelo + 8;                                  // 8 celdas por encima del suelo = aire seguro

    // ── §1 · Ctrl+rueda con la caja VACÍA ────────────────────────────────────────────────────────
    // Es EL fallo del dueño: aquí el motor soltaba «La selección no tiene bloques: nada que cavar» y
    // dejaba el marco colgado en el aire, sin manera de bajarlo salvo volviendo a marcar esquinas.
    __caja([S.cx, alto, S.cz], [S.cx + 2, alto + 2, S.cz + 2]);
    const b0 = __leo(), h0 = __huella();
    const rBaja = mcSelExtruir(-1), b1 = __leo();
    const rSube = mcSelExtruir(+1), b2 = __leo();
    out.vaciaY = {
      bajaDevuelve: rBaja, subeDevuelve: rSube,
      bajo: b1[0].a[1] - b0[0].a[1],                           // −1 esperado
      volvio: JSON.stringify(b2) === JSON.stringify(b0),       // baja + sube = donde estaba
      formaIgual: (b1[0].b[1] - b1[0].a[1]) === (b0[0].b[1] - b0[0].a[1]),
      seTrasladaEntera: (b1[0].b[1] - b0[0].b[1]) === -1,      // ⚠️ traslada, NO encoge por el borde
      sinEditar: __huella() === h0
    };

    // ── §2 · Shift+rueda con la caja VACÍA ───────────────────────────────────────────────────────
    // El eje sale de la mirada y se recalcula en cada muesca. Se mira a +X a propósito (yaw = −90°),
    // para que el eje y el signo sean comprobables a mano: arriba ALEJA (+X), abajo ACERCA (−X).
    mc.yaw = -Math.PI / 2; mc.pitch = 0;
    const eje = mcEjeMirada();
    __caja([S.cx, alto, S.cz], [S.cx + 2, alto + 2, S.cz + 2]);
    const c0 = __leo();
    const rDentro = mcSelExtruirFrente(+1), c1 = __leo();
    const rTrae = mcSelExtruirFrente(-1), c2 = __leo();
    out.vaciaFrente = {
      eje: eje.nombre, dentroDevuelve: rDentro, traeDevuelve: rTrae,
      seAlejo: c1[0].a[eje.eje] - c0[0].a[eje.eje],            // +sN esperado
      sN: eje.sN,
      volvio: JSON.stringify(c2) === JSON.stringify(c0),
      sinEditar: __huella() === h0
    };

    // ── §3 · Varias cajas (REQ-SEL1): viajan JUNTAS y sin deformarse ─────────────────────────────
    mc.selCajas = [{ a: [S.cx, alto, S.cz], b: [S.cx + 1, alto + 1, S.cz + 1] },
                   { a: [S.cx + 5, alto + 3, S.cz], b: [S.cx + 6, alto + 4, S.cz + 1] }];
    mc.selPivote = [S.cx, alto, S.cz];                          // el agarre del giro tiene que ir con ellas
    const d0 = __leo(), p0 = mc.selPivote.slice();
    mcSelExtruir(-1);
    const d1 = __leo();
    out.variasCajas = {
      ambasBajan: (d1[0].a[1] - d0[0].a[1]) === -1 && (d1[1].a[1] - d0[1].a[1]) === -1,
      distanciaIntacta: (d1[1].a[1] - d1[0].a[1]) === (d0[1].a[1] - d0[0].a[1]),
      pivoteViaja: mc.selPivote[1] - p0[1] === -1,
      sinEditar: __huella() === h0
    };

    // ── §4 · El borde del mundo dice que no ──────────────────────────────────────────────────────
    // Recortar caja a caja las deformaría: o se mueven todas o no se mueve ninguna.
    // El borde tiene que ser el TECHO (y = dim.y−1) y no el suelo: abajo del todo hay roca, y una caja
    // con bloques dentro ni siquiera es asunto de este parche — se la lleva el motor y cava (así falló
    // esta misma sonda al escribirse, midiendo el motor y creyendo que medía el tope).
    const techo = mc.dim.y - 1;
    __caja([S.cx, techo - 1, S.cz], [S.cx + 1, techo, S.cz + 1]);
    const e0 = __leo(), vacio = mcSelCount() === 0;
    const rBorde = mcSelExtruir(+1), e1 = __leo();
    out.borde = { esCajaVacia: vacio, devuelve: rBorde, quieta: JSON.stringify(e1) === JSON.stringify(e0) };

    // ── §5 · Con bloques dentro NO nos metemos: manda el motor ───────────────────────────────────
    // Caja de 1×1×1 sobre la cima del suelo. Cavar (Ctrl abajo) tiene que QUITAR ese bloque, que es lo
    // que demuestra que la llamada pasó de largo hasta el original y no la atendió el parche.
    __caja([S.cx, S.suelo, S.cz], [S.cx, S.suelo, S.cz]);
    const f0 = __leo(), hf = __huella();
    const rCava = mcSelExtruir(-1);
    out.conBloques = {
      devuelve: rCava,
      cavo: hf - __huella(),                                    // 1 bloque menos = fue el motor
      cajaBajo: f0[0].a[1] - __leo()[0].a[1]                    // el motor la baja por su borde de arriba
    };
    // Y se devuelve el bloque a su sitio, que esto es una sonda y no una excavación.
    const antes = mc.grid[mcIdx(S.cx, S.suelo, S.cz)];
    if (!antes) {
      mcSetBlock(S.cx, S.suelo, S.cz, f0.id || mc.grid[mcIdx(S.cx, S.suelo - 1, S.cz)] || 1);
      mcRemeshAround(S.cx - 2, S.cz - 2, S.cx + 2, S.cz + 2);
    }
    out.restaurado = __huella() === hf;
    return out;
  });

  // ── §8 · El snippet viejo se APARTA al ver la función en el motor ───────────────────────────────
  // `sel-mueve-vacia` sigue publicado (es el original de la Ley de Oro y sirve para probar cambios en
  // caliente). Si alguien lo carga con alt+c sobre este app.js tiene que decirlo y no envolver nada:
  // un envoltorio congelado encima taparía al motor, y los arreglos posteriores dejarían de notarse.
  const snippet = await page.evaluate(async () => {
    const dicho = await game.snippet('sel-mueve-vacia');
    const S = window.__sitio, alto = S.suelo + 8;
    __caja([S.cx, alto, S.cz], [S.cx + 1, alto + 1, S.cz + 1]);
    const a = __leo(); mcSelExtruir(-1); const b = __leo();
    return {
      dicho,
      sinEnvolver: !mcSelExtruir._selVacia && !mcSelExtruirFrente._selVacia,
      sinMando: typeof game.selVacia === 'undefined',
      celdasPorMuesca: a[0].a[1] - b[0].a[1]        // 1, no 2: nadie se ha puesto encima
    };
  });

  console.log('\n' + JSON.stringify(res, null, 2));
  console.log('el snippet se aparta ·', JSON.stringify(snippet));

  await page.waitForTimeout(1500);
  await browser.close();
  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  console.log('empty.vox intacto ·', mtimeAntes === mtimeDespues);
})();
