// @area: materiales
// @necesita: servidor, playwright
// setVoxel con un material que el índice CONOCE pero que aún no está cargado debe cargar la textura
// solo, en vez de poner roca. Antes había que llamar a game.addMaterial() a mano y, si se te olvidaba,
// aparecían bloques de piedra gris donde querías flores.
//   node test_setvoxel_autocarga.js          (necesita el servidor en :8500)
const { chromium } = require(__dirname + '/../node_modules/playwright');

let fallos = 0, oks = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (cond) oks++; else fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  // Nada de escribir en el mundo de verdad: los POST de guardado se contestan en falso.
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForFunction('typeof game !== "undefined" && typeof setVoxel === "function"', { timeout: 60000 });
  await p.waitForTimeout(3000);

  // Celdas de trabajo: un hueco de aire alto, lejos de lo que haya construido el dueño.
  const base = await p.evaluate(() => {
    const D = mc.dim;
    for (let y = D.y - 2; y > 2; y--) {
      for (let x = 4; x < D.x - 12; x++) for (let z = 4; z < D.z - 12; z++) {
        let libre = true;
        for (let i = 0; i < 14 && libre; i++) if (getVoxel(x + i, y, z) !== 0) libre = false;
        if (libre) return { x, y, z, dim: [D.x, D.y, D.z] };
      }
    }
    return null;
  });
  ok('hay un hueco de aire donde probar', !!base, base ? base.x + ',' + base.y + ',' + base.z : 'no encontrado');
  if (!base) { await b.close(); process.exit(1); }
  const C = (i) => [base.x + i, base.y, base.z];

  console.log('\n§1 el índice conoce el mote antes de cargarlo');
  const idx = await p.evaluate(() => ({
    key: mcMatKey('flor_amarilla', 'flor_amarilla'),
    enPaleta: mc.blockKey.indexOf(mcMatKey('flor_amarilla', 'flor_amarilla')),
    pend: mcMatPendiente('flor_amarilla'),
  }));
  ok('mcMatKey traduce el mote a un fichero de verdad', /^asset:assets\/flor-(amarilla|roja)\.vox\.json$/.test(idx.key), idx.key);
  const yaCargada = idx.enPaleta > 0;
  if (yaCargada) {
    ok('flor_amarilla YA estaba en la paleta de este mundo → §1-§2 no aplican', true, 'se prueban con flor_roja');
    ok('y por eso mcMatPendiente la descarta (camino normal)', idx.pend === null);
  } else {
    ok('no está en la paleta todavía', idx.enPaleta < 1);
    ok('mcMatPendiente la da por cargable', idx.pend === idx.key, String(idx.pend));
  }

  // Material de prueba: cualquier mote del índice de assets que NO esté ya en la paleta de este mundo
  // (las flores ya se plantaron aquí, así que hay que buscarlo, no darlo por hecho).
  const sinCargar = await p.evaluate(() => {
    const libres = [];
    for (const alias of Object.keys(mcAssetsRegistry)) {
      const k = mcMatPendiente(alias);
      if (k) libres.push({ nombre: alias, clave: k });
    }
    return libres;
  });
  console.log('  motes del índice todavía sin cargar: ' + sinCargar.length);
  const mat = sinCargar[0] || null;
  if (!mat) {
    console.log('\n  (todos los materiales de prueba ya estaban cargados: no se puede medir la autocarga)');
    console.log('\n' + oks + ' ok, ' + fallos + ' fallos');
    await b.close(); process.exit(fallos ? 1 : 0);
  }
  console.log('  material sin cargar para la prueba: ' + mat.nombre + ' → ' + mat.clave);

  console.log('\n§2 setVoxel sin addMaterial previo: sale la flor, no roca');
  const antes = await p.evaluate(([c, m]) => {
    setVoxel(c[0], c[1], c[2], m);
    return { celda: getVoxel(c[0], c[1], c[2]), apuntadas: mcPendCel.size };
  }, [C(0), mat.nombre]);
  ok('la celda sigue como estaba mientras carga (aire), NO roca', antes.celda === 0, 'id=' + antes.celda);
  ok('la celda queda apuntada', antes.apuntadas > 0, 'pendientes=' + antes.apuntadas);
  await p.waitForFunction(c => getVoxel(c[0], c[1], c[2]) > 0, C(0), { timeout: 30000 }).catch(() => {});
  const puesto = await p.evaluate(c => {
    const s = mc.structures.find(s => s.ox === c[0] && s.oy === c[1] && s.oz === c[2]);
    return s ? s.key : mc.blockKey[getVoxel(c[0], c[1], c[2])];   // rejilla o pieza fina: vale cualquiera
  }, C(0));
  ok('al cargar queda el material pedido', puesto === mat.clave, String(puesto));

  console.log('\n§3 muchas celdas del mismo material = UNA sola carga');
  const otro = await p.evaluate(() => {
    for (const alias of Object.keys(mcAssetsRegistry)) {
      const k = mcMatPendiente(alias);
      if (k) return { nombre: alias, clave: k };
    }
    return null;
  });
  if (otro) {
    const lote = await p.evaluate(async ([c, m]) => {
      const n0 = mc.blocks.length;
      for (let i = 0; i < 5; i++) setVoxel(c[0] + i, c[1], c[2], m);
      const cargas = mcPendCarga.size;
      for (let t = 0; t < 60 && mcPendCel.size; t++) await new Promise(r => setTimeout(r, 500));
      const claves = [];
      for (let i = 0; i < 5; i++) {
        const st = mc.structures.find(s => s.ox === c[0] + i && s.oy === c[1] && s.oz === c[2]);
        claves.push(st ? st.key : mc.blockKey[getVoxel(c[0] + i, c[1], c[2])]);
      }
      return { crecio: mc.blocks.length - n0, cargas, claves };
    }, [C(4), otro.nombre]);
    ok('5 celdas → 1 sola carga en vuelo', lote.cargas === 1, 'cargas=' + lote.cargas);
    ok('5 celdas → 1 material nuevo en la paleta', lote.crecio === 1, 'creció ' + lote.crecio);
    ok('las 5 celdas quedan con el material pedido', lote.claves.every(k => k === otro.clave), lote.claves.join(' '));
  } else {
    console.log('  (no queda un segundo material sin cargar: §3 se salta)');
  }

  console.log('\n§4 un nombre inventado sigue cayendo a roca al momento');
  const inventado = await p.evaluate(async c => {
    setVoxel(c[0], c[1], c[2], 'chocolate_con_churros');
    const pend = mcMatPendiente('chocolate_con_churros');
    for (let t = 0; t < 20 && getVoxel(c[0], c[1], c[2]) === 0; t++) await new Promise(r => setTimeout(r, 250));
    return { pend, clave: mc.blockKey[getVoxel(c[0], c[1], c[2])] };
  }, C(10));
  ok('mcMatPendiente lo descarta (no hay fichero que cargar)', inventado.pend === null, String(inventado.pend));
  ok('acaba en roca (la rejilla, no una pieza)', /roca/.test(String(inventado.clave)), String(inventado.clave));

  console.log('\n§5 manda la última escritura, aunque la primera estuviera esperando textura');
  const pisa = await p.evaluate(async c => {
    setVoxel(c[0], c[1], c[2], 'hab:este_habitante_no_existe');   // cargable en teoría: se apunta
    const apuntadas = mcPendCel.size;
    setVoxel(c[0], c[1], c[2], 'roca');                            // …y se pisa antes de que llegue
    for (let t = 0; t < 60 && mcPendCel.size; t++) await new Promise(r => setTimeout(r, 500));
    return { apuntadas, tras: mcPendCel.size, clave: mc.blockKey[getVoxel(c[0], c[1], c[2])] };
  }, C(11));
  ok('la celda se apuntó al pedir un material sin cargar', pisa.apuntadas > 0, 'pendientes=' + pisa.apuntadas);
  ok('no queda nada esperando al final', pisa.tras === 0, 'pendientes=' + pisa.tras);
  ok('queda lo que se escribió el último', /roca/.test(String(pisa.clave)), String(pisa.clave));

  console.log('\n§5b la carga que falla no deja la celda muerta ni tumba el script');
  const falla = await p.evaluate(async c => {
    setVoxel(c[0], c[1], c[2], 'hab:este_tampoco_existe');
    for (let t = 0; t < 40 && mcPendCel.size; t++) await new Promise(r => setTimeout(r, 500));
    return { pendientes: mcPendCel.size, cargas: mcPendCarga.size, celda: getVoxel(c[0], c[1], c[2]) };
  }, C(12));
  ok('la celda apuntada se olvida al fallar la carga', falla.pendientes === 0, 'pendientes=' + falla.pendientes);
  ok('y no queda la carga colgada', falla.cargas === 0, 'cargas=' + falla.cargas);
  ok('la celda se queda como estaba (aire), sin bloque raro', falla.celda === 0, 'id=' + falla.celda);

  console.log('\n§6 lo ya cargado no vuelve a pasar por la cola');
  const yaEsta = await p.evaluate(m => mcMatPendiente(m), mat.nombre);
  ok('el material recién cargado sigue el camino normal', yaEsta === null, String(yaEsta));

  console.log('\n§7 game.stamp con un mote sin cargar tampoco da roca');
  const src = await p.evaluate(() => {
    const sin = Object.keys(mcAssetsRegistry).find(n => mcMatPendiente(n));
    return sin ? { nombre: sin, src: mcStampSrc(sin), esperado: mcMatPendiente(sin) } : null;
  });
  if (src) ok('mcStampSrc devuelve la clave real, no roca', src.src === src.esperado, src.nombre + ' → ' + src.src);
  else console.log('  (no queda material sin cargar para probarlo: §7 se salta)');

  // Dejar el hueco como estaba.
  await p.evaluate(c => { for (let i = 0; i < 14; i++) setVoxel(c[0] + i, c[1], c[2], 0); }, C(0));

  ok('sin errores de página', errores.length === 0, errores.join(' | ').slice(0, 300));
  console.log('\n' + oks + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();