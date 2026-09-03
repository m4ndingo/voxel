// @area: general
// @necesita: servidor, playwright
//
// REQ-IMPACTO4 · «cambiar»: reemplazar una pieza por otra.
//
// De donde sale, del dueño (2026-09-03): primero «me gustaria que una vez impactada la antorcha
// reemplazarla por otra, por ejemplo por su version encendida/apagada», y despues, ya con el
// reemplazo escrito a mano y funcionando, «me gustaria alguna funcion que haga el swap sin tanto
// codigo para que quede todo mas limpio».
//
// ⛔ LO QUE ESTE GUARDIAN CONGELA no es «que cambie» —eso se ve a simple vista— sino las DOS trampas
//    que costaron una tarde cada una y que un refactor bienintencionado deshace sin enterarse:
//
//    1. PONER ANTES DE QUITAR. Al reves hay un frame con el agujero a la vista y el dueño lo caza:
//       «se ve un flash entre que se rompe una antorcha y sale la siguiente». No se mide contando
//       frames (en render por software el muestreo va a ~9 fps y no ve un parpadeo de uno), se mide
//       por el ORDEN: cuando se quita la vieja, la nueva TIENE que estar ya puesta. §2.
//    2. `game.stamp` RECREA los objetos de `mc.structures`. La referencia que uno tenia antes de
//       estampar queda huerfana (`indexOf` → -1) y quitarla no quita nada: quedan las DOS piezas
//       apiladas. Por eso §1 cuenta cuantas hay, no solo cual es la primera.
//
// Y REQ-XR2 de paso (§6): la cuarta linea de rayos-X no decia una palabra de `alImpactar`, asi que
// un mundo lleno de piezas rompibles se veia igual que uno vacio.
//
// ⛔ Planta y recoge en /map/test. Nunca en /map/default ni /map/agents.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);

let ok = 0, fail = 0;
const T0 = Date.now();
const seg = () => ('    ' + ((Date.now() - T0) / 1000).toFixed(1)).slice(-6) + 's ';
const paso = (n) => console.log('\n' + seg() + n);
const t = (n, c, extra) => {
  if (c) { ok++; console.log(seg() + '  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log(seg() + '  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  paso('§0 · abriendo /map/test?noauto=1');
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  paso('§0 · lanzando mundo-autoarranque a mano');
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  // ── §1 · EL CASO DEL DUEÑO, tal cual lo escribio ───────────────────────────────────────────────
  paso('§1 · estructura · la antorcha se cambia por su version apagada');
  const r1 = await p.evaluate(async () => {
    const out = { vistas: [] };
    const clave = 'asset:assets/antorcha.vox.json';
    const bx = Math.floor(mc.pos[0]) + 4, by = Math.floor(mc.pos[1]), bz = Math.floor(mc.pos[2]);
    await game.stamp('antorcha', bx, by, bz, 1);            // ori 1: se tiene que heredar
    game.bloques.define(clave, { nota: 'zz-test', impactos: 2,
      alImpactar: 'cambiar', cambiaPor: 'antorcha-apagada',
      alCambiar: (c) => { out.vistas.push({ por: c.por, nuevo: c.nuevo, tipo: c.tipo,
                                            x: c.x, y: c.y, z: c.z, ori: c.ori }); } });

    // primer golpe: aguanta (impactos: 2)
    const g1 = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5, { fuente: 'flecha' });
    out.g1 = g1 ? { golpe: g1.golpe, de: g1.de, listo: g1.listo, accion: g1.accion } : null;
    out.trasG1 = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz)
      .map((s) => s.key);

    // segundo: cambia
    const g2 = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5, { fuente: 'flecha' });
    out.g2 = g2 ? { golpe: g2.golpe, listo: g2.listo, accion: g2.accion, nuevo: g2.nuevo } : null;
    out.hecho = g2 && g2.valor ? await g2.valor : null;     // el cambio es asincrono: game.stamp lo es
    const quedan = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz);
    out.quedan = quedan.map((s) => ({ key: s.key, rot: s.rot | 0 }));

    // recoger
    quedan.forEach((s) => mcRemoveStruct(s, true));
    game.bloques.quitar(clave);
    return out;
  });
  t('§1 el primer golpe aguanta (1 de 2)',
    !!(r1.g1 && r1.g1.golpe === 1 && r1.g1.de === 2 && r1.g1.listo === false));
  t('§1 …y la antorcha sigue siendo la encendida', r1.trasG1 && r1.trasG1.length === 1
    && /antorcha\.vox/.test(r1.trasG1[0]), (r1.trasG1 || []).join(' + '));
  t('§1 el segundo despacha «cambiar»', !!(r1.g2 && r1.g2.listo && r1.g2.accion === 'cambiar'),
    r1.g2 && r1.g2.accion);
  t('§1 …y el cambio se da por hecho', r1.hecho === true, String(r1.hecho));
  t('§1 ⛔ queda UNA pieza, no dos apiladas (game.stamp recrea mc.structures)',
    r1.quedan && r1.quedan.length === 1, (r1.quedan || []).map((s) => s.key).join(' + '));
  t('§1 …y es la apagada', !!(r1.quedan && r1.quedan[0] && /antorcha-apagada/.test(r1.quedan[0].key)),
    r1.quedan && r1.quedan[0] && r1.quedan[0].key);
  t('§1 …con el MISMO giro que tenia la encendida (ori 1)',
    !!(r1.quedan && r1.quedan[0] && r1.quedan[0].rot === 1),
    'rot=' + (r1.quedan && r1.quedan[0] && r1.quedan[0].rot));
  t('§1 alCambiar avisa, y dice a que cambio',
    r1.vistas.length === 1 && r1.vistas[0].nuevo === 'antorcha-apagada'
    && r1.vistas[0].por === 'impacto', JSON.stringify(r1.vistas[0] || null));

  // ── §2 · ⛔ EL ORDEN: poner ANTES de quitar ────────────────────────────────────────────────────
  // Es lo que evita el flash que reporto el dueño, y no se puede comprobar mirando el resultado:
  // el resultado es identico haciendolo bien y haciendolo mal. Se comprueba en el instante del
  // `mcRemoveStruct`: si en ese momento la nueva ya esta en `mc.structures`, no hubo hueco.
  paso('§2 · ⛔ el orden: cuando se quita la vieja, la nueva YA esta puesta');
  const r2 = await p.evaluate(async () => {
    const out = {};
    const clave = 'asset:assets/antorcha.vox.json';
    const bx = Math.floor(mc.pos[0]) + 5, by = Math.floor(mc.pos[1]), bz = Math.floor(mc.pos[2]);
    await game.stamp('antorcha', bx, by, bz, 0);
    game.bloques.define(clave, { nota: 'zz-test', impactos: 1,
      alImpactar: 'cambiar', cambiaPor: 'antorcha-apagada' });

    const orig = window.mcRemoveStruct;
    out.momentos = [];
    window.mcRemoveStruct = function (s, q) {
      if (s && s.ox === bx && s.oy === by && s.oz === bz) {
        out.momentos.push(mc.structures.filter((e) => e.ox === bx && e.oy === by && e.oz === bz
          && /antorcha-apagada/.test(e.key)).length);
      }
      return orig.apply(this, arguments);
    };
    const g = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.hecho = g && g.valor ? await g.valor : null;
    window.mcRemoveStruct = orig;

    mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz)
      .forEach((s) => orig(s, true));
    game.bloques.quitar(clave);
    return out;
  });
  t('§2 se quito la vieja exactamente una vez', r2.momentos && r2.momentos.length === 1,
    'mcRemoveStruct ×' + (r2.momentos || []).length);
  t('§2 ⛔ y en ese instante la NUEVA ya estaba puesta: no hay hueco → no hay flash',
    !!(r2.momentos && r2.momentos[0] >= 1), 'apagadas presentes = ' + (r2.momentos || [])[0]);

  // ── §3 · la rejilla, que es la otra mitad del mundo ────────────────────────────────────────────
  paso('§3 · rejilla · el bloque se cambia y NO se queda en aire');
  const r3 = await p.evaluate(async () => {
    const out = {};
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    const idx = mcIdx(bx, by, bz), idAntes = mc.grid[idx];
    const clave = mc.blockKey[idAntes] || '';
    out.clave = clave; out.idAntes = idAntes;
    if (!clave) { out.error = 'no hay bloque bajo los pies'; return out; }
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'cambiar',
      cambiaPor: 'antorcha-apagada' });
    const g = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.hecho = g && g.valor ? await g.valor : null;
    out.idDespues = mc.grid[idx];
    out.claveDespues = mc.blockKey[mc.grid[idx]] || '';
    out.enVolatil = !!(mc.volatil && mc.volatil.has(idx));
    setVoxel(bx, by, bz, idAntes);                          // recoger
    game.bloques.quitar(clave);
    return out;
  });
  t('§3 el cambio se da por hecho', r3.hecho === true, 'clave=' + r3.clave);
  t('§3 ⛔ la celda NO queda en aire: eso seria romper, no cambiar', r3.idDespues !== 0,
    'id ' + r3.idAntes + ' → ' + r3.idDespues);
  t('§3 …y lleva el material nuevo', /antorcha-apagada/.test(r3.claveDespues || ''),
    r3.claveDespues);
  t('§3 …y sin capa volatil: persistente es el defecto', r3.enVolatil === false);

  // ── §4 · rejilla + persistente:false · se ve la nueva, se guarda la vieja ──────────────────────
  paso('§4 · rejilla · persistente:false: enseña la nueva, el fichero conserva la vieja');
  const r4 = await p.evaluate(async () => {
    const out = {};
    const bx = Math.floor(mc.pos[0]) + 1, by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    const idx = mcIdx(bx, by, bz), idAntes = mc.grid[idx];
    const clave = mc.blockKey[idAntes] || '';
    out.clave = clave; out.idAntes = idAntes;
    if (!clave) { out.error = 'no hay bloque al lado'; return out; }
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'cambiar',
      cambiaPor: 'antorcha-apagada', persistente: false });
    const g = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.hecho = g && g.valor ? await g.valor : null;
    out.claveDespues = mc.blockKey[mc.grid[idx]] || '';
    out.apuntado = (mc.volatil && mc.volatil.has(idx)) ? mc.volatil.get(idx) : null;
    mcQuitaVolatil(bx, by, bz);                             // recoger
    game.bloques.quitar(clave);
    return out;
  });
  t('§4 se ve el material nuevo', /antorcha-apagada/.test(r4.claveDespues || ''), r4.claveDespues);
  t('§4 …pero el fichero conserva el original: queda apuntado en mc.volatil',
    r4.apuntado === r4.idAntes, 'apuntado=' + r4.apuntado + ' original=' + r4.idAntes);

  // ── §5 · a mano, sin declarar nada ─────────────────────────────────────────────────────────────
  paso('§5 · game.bloques.cambiar() · para quien ya esta dentro de su propio JS');
  const r5 = await p.evaluate(async () => {
    const out = {};
    const bx = Math.floor(mc.pos[0]) + 6, by = Math.floor(mc.pos[1]), bz = Math.floor(mc.pos[2]);
    await game.stamp('antorcha', bx, by, bz, 2);
    // por coordenadas, sin `define` ninguno: se averigua sola que hay ahi y con que giro
    out.porCoords = await game.bloques.cambiar(bx, by, bz, 'antorcha-apagada');
    const q = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz);
    out.quedan = q.map((s) => ({ key: s.key, rot: s.rot | 0 }));
    out.enAire = await game.bloques.cambiar(bx, by + 5, bz, 'antorcha-apagada');
    out.sinNuevo = await game.bloques.cambiar(bx, by, bz);
    q.forEach((s) => mcRemoveStruct(s, true));
    return out;
  });
  t('§5 cambia por coordenadas, sin define', r5.porCoords === true, String(r5.porCoords));
  t('§5 …queda UNA y es la apagada, con su giro',
    !!(r5.quedan && r5.quedan.length === 1 && /antorcha-apagada/.test(r5.quedan[0].key)
       && r5.quedan[0].rot === 2), JSON.stringify(r5.quedan));
  t('§5 en una celda vacia devuelve false, no revienta', r5.enAire === false, String(r5.enAire));
  t('§5 sin material devuelve false, no revienta', r5.sinNuevo === false, String(r5.sinNuevo));

  // ── §6 · REQ-XR2 · rayos-X lo cuenta ───────────────────────────────────────────────────────────
  paso('§6 · rayos-X · la cuarta linea dice el modo, a que cambia y por que golpe va');
  const r6 = await p.evaluate(async () => {
    const out = {};
    const clave = 'asset:assets/antorcha.vox.json';
    const bx = Math.floor(mc.pos[0]) + 7, by = Math.floor(mc.pos[1]), bz = Math.floor(mc.pos[2]);
    await game.stamp('antorcha', bx, by, bz, 0);
    game.bloques.define(clave, { nota: 'zz-test', impactos: 3,
      alImpactar: 'cambiar', cambiaPor: 'antorcha-apagada' });
    const s = mc.structures.find((e) => e.ox === bx && e.oy === by && e.oz === bz);
    out.hayHueco = typeof window.mcXrayExtra === 'function';
    out.antes = window.mcXrayExtra(s.key, s, bx, by, bz);
    game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5, { fuente: 'flecha' });   // golpe 1 de 3
    out.tras1 = window.mcXrayExtra(s.key, s, bx, by, bz);
    // y sin celda (enganches viejos de dos parametros): tiene que seguir valiendo
    out.dosParams = window.mcXrayExtra(s.key, s);
    mc.structures.filter((e) => e.ox === bx && e.oy === by && e.oz === bz)
      .forEach((e) => mcRemoveStruct(e, true));
    delete mc._impactos['e|' + s.key + '|' + bx + ',' + by + ',' + bz];
    game.bloques.quitar(clave);
    return out;
  });
  t('§6 el hueco mcXrayExtra sigue enganchado', r6.hayHueco === true);
  t('§6 dice el modo y a que cambia', /alImpactar→cambiar antorcha-apagada/.test(r6.antes || ''),
    r6.antes);
  t('§6 …y por que golpe va ESA celda: 0 de 3', /\(0\/3\)/.test(r6.antes || ''), r6.antes);
  t('§6 …y despues del flechazo, 1 de 3', /\(1\/3\)/.test(r6.tras1 || ''), r6.tras1);
  t('§6 ⛔ con dos parametros sigue valiendo (enganches viejos)',
    /alImpactar→cambiar/.test(r6.dosParams || ''), r6.dosParams);

  paso('§7 · info() lo cuenta tambien');
  const r7 = await p.evaluate(() => {
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    const clave = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
    game.bloques.define(clave, { nota: 'zz-test', impactos: 2, alImpactar: 'cambiar',
      cambiaPor: 'antorcha-apagada' });
    // ⚠️ `info()` DEVUELVE la tabla (la pinta console.table, no console.log)
    const filas = game.bloques.info() || [];
    const txt = filas.map((f) => f.donde + ': ' + f.comportamiento).join('\n');
    game.bloques.quitar(clave);
    return txt;
  });
  t('§7 info() dice «alImpactar → cambiar … por antorcha-apagada»',
    /alImpactar → cambiar[^\n]*por antorcha-apagada/.test(r7),
    (r7.match(/alImpactar → cambiar[^\n]*/) || [''])[0]);

  paso('§8 · sin errores de consola');
  t('§8 cero errores JS', errores.length === 0, errores.slice(0, 2).join(' | '));

  console.log('\n' + seg() + ok + ' ok, ' + fail + ' fallos');
  await nav.close();
  process.exit(fail ? 1 : 0);
})();
