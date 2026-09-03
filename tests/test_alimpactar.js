// @area: general
// @necesita: servidor, playwright
//
// REQ-IMPACTO1 · `alImpactar` + `impactos`: que algo CHOQUE contra una pieza pueda romperla.
//
// Lo pidio el dueño asi (2026-09-03): «quiero que la flecha de la ballesta al impactar en un objeto
// pueda romper tambien objetos, pero con un evento llamado alImpactar que pueda decir que evento
// desencadena. por ejemplo al impactar podria desencadenar alRomper o alCoger, o bien JavaScript
// arbitrario, ademas para romper quiero poder indicar si sera necesario 1 impacto o mas». Y a la
// pregunta de si valia solo con la rejilla: «tambien estructuras».
//
// Va contra el MOTOR DE VERDAD, no contra dobles, por la misma razon que `test_alcoger.js`: lo que
// puede romperse aqui es justo lo que un doble no reproduce — `mcStructColl` y la caja fina real,
// `mcRemoveStruct` sacando de `mc.structures`, y cual de las dos vias acaba usando un asset.
//
// Lo que mira, y por que cada cosa:
//   1. Las DOS APIs existen. Son dos a proposito: `impactoEn` sondea (puro) y `impacto` despacha.
//   2. `impactos: 3` cuenta de verdad: al primer y segundo golpe la pieza SIGUE puesta.
//   3. ESTRUCTURAS FINAS: el requisito explicito del dueño. Antes la flecha las atravesaba.
//   4. Los tres despachos: 'romper' → alRomper, 'coger' → alCoger, funcion → JS a pelo.
//   5. `impactoEn` NO cuenta. Es LA trampa del diseño: quien vuela sondea 3-4 veces por frame, asi
//      que si sondear contase, UNA flecha se gastaria ella sola los 3 impactos de un cristal.
//   6. COMPATIBILIDAD: un bloque con `alRomper` y sin `alImpactar` se sigue rompiendo como siempre.
//
// ⛔ Planta y recoge en /map/test. Nunca en /map/default ni /map/agents.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);

let ok = 0, fail = 0;
const T0 = Date.now();
// Traza: cada linea lleva el segundo en que ocurrio. Si esto se cuelga, la ultima linea dice
// exactamente en que paso, sin tener que adivinar ni relanzarlo entero.
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

  // ?noauto=1: el autoarranque se lanza a mano, para que el motor este limpio y el fallo (si lo hay)
  // sea de esto y no del bioma que le toque construir al mapa.
  paso('§0 · abriendo /map/test?noauto=1');
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  paso('§0 · lanzando mundo-autoarranque a mano');
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  paso('§1 · las dos APIs');
  const api = await p.evaluate(() => ({
    sondeo: typeof game.bloques.impactoEn,
    despacho: typeof game.bloques.impacto,
    activo: typeof mc !== 'undefined' && !!mc.active
  }));
  t('game.bloques.impactoEn existe', api.sondeo === 'function', api.sondeo);
  t('game.bloques.impacto existe', api.despacho === 'function', api.despacho);
  t('el Mundo esta activo', api.activo === true);

  paso('§2 · rejilla · impactos:3 cuenta de verdad');
  const cuenta = await p.evaluate(async () => {
    const out = {};
    // La celda bajo los pies: es rejilla segura, sin depender de que bioma haya tocado.
    const bx = Math.floor(mc.pos[0]), by = Math.floor(mc.pos[1]) - 1, bz = Math.floor(mc.pos[2]);
    const clave = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
    out.clave = clave;
    if (!clave) { out.error = 'no hay bloque bajo los pies'; return out; }
    let roto = 0;
    game.bloques.define(clave, { nota: 'zz-test', impactos: 3, alImpactar: 'romper',
                                 alRomper: () => { roto++; } });
    const cx = bx + 0.5, cy = by + 0.5, cz = bz + 0.5;
    out.g1 = game.bloques.impacto(cx, cy, cz);
    out.vive1 = (mc.grid[mcIdx(bx, by, bz)] || 0) !== 0;
    out.g2 = game.bloques.impacto(cx, cy, cz);
    out.vive2 = (mc.grid[mcIdx(bx, by, bz)] || 0) !== 0;
    out.g3 = game.bloques.impacto(cx, cy, cz);
    out.vive3 = (mc.grid[mcIdx(bx, by, bz)] || 0) !== 0;
    out.roto = roto;
    game.bloques.quitar(clave);
    return out;
  });
  t('el 1er golpe NO rompe', cuenta.g1 && cuenta.g1.golpe === 1 && cuenta.g1.listo === false && cuenta.vive1 === true,
    JSON.stringify(cuenta.g1) + ' vive=' + cuenta.vive1);
  t('el 2o golpe tampoco', cuenta.g2 && cuenta.g2.golpe === 2 && cuenta.g2.listo === false && cuenta.vive2 === true,
    JSON.stringify(cuenta.g2) + ' vive=' + cuenta.vive2);
  t('el 3er golpe rompe y dispara alRomper', cuenta.g3 && cuenta.g3.listo === true
    && cuenta.g3.accion === 'romper' && cuenta.vive3 === false && cuenta.roto === 1,
    JSON.stringify(cuenta.g3) + ' vive=' + cuenta.vive3 + ' alRomper×' + cuenta.roto);
  t('la ficha dice de cuantos golpes va', cuenta.g1 && cuenta.g1.de === 3, 'de=' + (cuenta.g1 || {}).de);

  paso('§3 · estructuras finas · «tambien estructuras» (el requisito del dueño)');
  const fina = await p.evaluate(async () => {
    const out = {};
    let visto = null;
    game.bloques.define('ballesta', { nota: 'zz-test', alImpactar: (c) => { visto = c; } });
    const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    await game.stamp('ballesta', x, y, z);
    const s = mc.structures.filter((e) => String(e.key).indexOf('ballesta') >= 0).pop();
    if (!s) { out.error = 'no se planto la ballesta'; return out; }
    // Un punto DENTRO de su caja fina — el mismo criterio que usa localizarImpacto.
    // ⛔ `MC_T` NO se ve desde page.evaluate (es del ambito del script, no de window; dentro del
    // snippet si). No hace falta: la caja arranca en (ox,oy,oz), asi que un pelin hacia dentro de
    // esa esquina esta dentro seguro, que es todo lo que necesita el sondeo.
    const g = mcStructColl(s);
    if (!g || !g.fdim) { out.error = 'sin caja de colision'; return out; }
    const px = s.ox + 0.05, py = s.oy + 0.05, pz = s.oz + 0.05;
    out.sondeo = game.bloques.impactoEn(px, py, pz);
    out.res = game.bloques.impacto(px, py, pz, { fuente: 'zz-test' });
    out.visto = visto ? { tipo: visto.tipo, clave: visto.clave, golpe: visto.golpe, de: visto.de,
                          tienePunto: Array.isArray(visto.punto),
                          fuente: visto.info && visto.info.fuente } : null;
    // Con JS a pelo la pieza NO se retira: manda el snippet, que puede quitarla el mismo si quiere.
    out.sigueAhi = mc.structures.indexOf(s) >= 0;
    // Se recoge lo plantado: /map/test se deja como estaba, y ademas el §4 mira su PROPIA pieza.
    if (out.sigueAhi && typeof mcRemoveStruct === 'function') mcRemoveStruct(s, true);
    game.bloques.quitar('ballesta');
    return out;
  });
  t('el sondeo ve la pieza fina', fina.sondeo && fina.sondeo.tipo === 'estructura',
    JSON.stringify(fina.sondeo) + (fina.error ? ' · ' + fina.error : ''));
  t('el despacho la reconoce como estructura', fina.res && fina.res.tipo === 'estructura' && fina.res.listo === true,
    JSON.stringify(fina.res));
  t('el JS recibe el contrato completo', fina.visto && fina.visto.tipo === 'estructura'
    && fina.visto.golpe === 1 && fina.visto.de === 1 && fina.visto.tienePunto === true
    && fina.visto.fuente === 'zz-test', JSON.stringify(fina.visto));
  t('con JS a pelo la pieza NO se retira sola', fina.sigueAhi === true);

  paso('§4 · despacho "coger" · reutiliza alCoger y su consume');
  const coger = await p.evaluate(async () => {
    const out = {};
    let cogido = null;
    game.bloques.define('ballesta', { nota: 'zz-test', alImpactar: 'coger',
                                      alCoger: (c) => { cogido = c; } });
    const x = Math.floor(mc.pos[0]) + 4, z = Math.floor(mc.pos[2]) + 2;
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    await game.stamp('ballesta', x, y, z);
    const s = mc.structures.filter((e) => String(e.key).indexOf('ballesta') >= 0).pop();
    if (!s) { out.error = 'no se planto'; return out; }
    out.res = game.bloques.impacto(s.ox + 0.05, s.oy + 0.05, s.oz + 0.05);
    out.cogido = cogido ? { tipo: cogido.tipo, clave: cogido.clave } : null;
    out.sigueAhi = mc.structures.indexOf(s) >= 0;      // ESTA pieza, no «alguna ballesta»
    if (out.sigueAhi && typeof mcRemoveStruct === 'function') mcRemoveStruct(s, true);
    game.bloques.quitar('ballesta');
    return out;
  });
  t('dispara alCoger', !!coger.cogido, JSON.stringify(coger.cogido) + (coger.error ? ' · ' + coger.error : ''));
  t('la accion se llama "coger"', coger.res && coger.res.accion === 'coger', JSON.stringify(coger.res));
  t('coger ES llevarselo (consume por defecto)', coger.sigueAhi === false);

  paso('§5 · impactoEn NO cuenta (la trampa del diseño)');
  const puro = await p.evaluate(async () => {
    const out = {};
    const bx = Math.floor(mc.pos[0]) + 1, bz = Math.floor(mc.pos[2]) + 1;
    const by = (typeof mcSurfaceY === 'function') ? mcSurfaceY(bx, bz) - 1 : Math.floor(mc.pos[1]) - 1;
    const clave = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
    if (!clave) { out.error = 'no hay bloque'; return out; }
    game.bloques.define(clave, { nota: 'zz-test', impactos: 2, alImpactar: 'romper' });
    const cx = bx + 0.5, cy = by + 0.5, cz = bz + 0.5;
    // 10 sondeos: si contaran, el bloque estaria roto cinco veces.
    for (let i = 0; i < 10; i++) game.bloques.impactoEn(cx, cy, cz);
    out.viveTrasSondear = (mc.grid[mcIdx(bx, by, bz)] || 0) !== 0;
    out.primerGolpe = game.bloques.impacto(cx, cy, cz);
    game.bloques.quitar(clave);
    return out;
  });
  t('10 sondeos no rompen nada', puro.viveTrasSondear === true, puro.error || '');
  t('y el golpe siguiente sigue siendo el 1o', puro.primerGolpe && puro.primerGolpe.golpe === 1,
    JSON.stringify(puro.primerGolpe));

  paso('§6 · compatibilidad · alRomper sin alImpactar no cambia');
  const compat = await p.evaluate(async () => {
    const out = {};
    const bx = Math.floor(mc.pos[0]) - 2, bz = Math.floor(mc.pos[2]) - 2;
    const by = (typeof mcSurfaceY === 'function') ? mcSurfaceY(bx, bz) - 1 : Math.floor(mc.pos[1]) - 1;
    const clave = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
    if (!clave) { out.error = 'no hay bloque'; return out; }
    game.bloques.define(clave, { nota: 'zz-test', alRomper: () => {} });
    // Sin alImpactar, `impacto()` no lo reconoce: la flecha caera al respaldo `avisoDeRotura`.
    out.impacto = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.aviso = typeof game.bloques.avisoDeRotura(bx, by, bz);
    game.bloques.quitar(clave);
    return out;
  });
  t('impacto() lo ignora si no declara alImpactar', compat.impacto === null,
    JSON.stringify(compat.impacto) + (compat.error ? ' · ' + compat.error : ''));
  t('avisoDeRotura sigue dandolo (el respaldo de la flecha)', compat.aviso === 'function', compat.aviso);

  paso('§7 · sin errores en consola');
  t('cero errores JS', errores.length === 0, errores.slice(0, 3).join(' | '));

  await nav.close();
  console.log('\n' + ok + ' ok / ' + fail + ' fallos');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('⛔ ' + e.message); process.exit(1); });
