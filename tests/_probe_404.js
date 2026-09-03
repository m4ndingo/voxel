// REQ-RED1 · VALIDACION EN CALIENTE del arreglo de los 404 de `getRoomData`, antes de tocar app.js.
//
// Lo que se prueba, sobre el motor de verdad y sin publicar nada:
//   1. Con el envoltorio puesto, resolver TODA la paleta no produce ni un 404.
//   2. Las tres claves TRAMPA siguen dando el habitante, no el asset: `calamar`, `escalera` y
//      `tejado` existen con el MISMO id en los dos sitios, y para `hab:` manda el habitante. Si esto
//      se rompe, el arreglo cambia lo que se ve en pantalla y no vale.
//   3. Los documentos que devuelve son los mismos, byte a byte, que sin el envoltorio.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[3] || 8577);
const MAPA = process.argv[2] || 'zz-red';

let ok = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { ok++; console.log('  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log('  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const cod = [];
  p.on('response', (r) => cod.push({ url: r.url().replace(BASE, ''), s: r.status() }));

  await p.goto(BASE + '/map/' + MAPA, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => typeof mc !== 'undefined' && mc.active, null, { timeout: 90000 });
  await p.waitForTimeout(3000);

  // --- REFERENCIA: qué devuelve el motor TAL CUAL está hoy, para las tres trampas ---
  const antes = await p.evaluate(async () => {
    const out = {};
    for (const k of ['hab:calamar', 'hab:escalera', 'hab:tejado']) {
      const d = await getRoomData(k);
      out[k] = { vox: Object.keys(d.voxels || {}).length, nombre: (d.meta && d.meta.name) || null };
    }
    return out;
  });

  // --- EL ENVOLTORIO (el mismo codigo que se propone graduar a app.js) ---
  await p.evaluate(() => {
    const G = window;
    // El indice de habitantes son 6 KB de metadatos (sin voxels) y ya se baja durante la carga: dice
    // si `<id>` existe ANTES de pedirlo. ⛔ No se puede dar la vuelta al orden y probar el asset
    // primero: `calamar`, `escalera` y `tejado` existen como asset Y como habitante.
    let _habIdsP = null;
    G.mcHabIds = function () {
      if (!_habIdsP) _habIdsP = apiHabitantes()
        .then((l) => new Set((l || []).map((h) => String(h.id))))
        .catch(() => null);          // si falla, se prueba a pelo: nunca peor que antes
      return _habIdsP;
    };
    const orig = G.getRoomData;
    G.getRoomData = async function (key) {
      if (typeof key === 'string' && key.startsWith('hab:') && !roomDataCache.has(key)) {
        const habId = key.slice(4);
        const ids = await G.mcHabIds();
        // Solo se salta la peticion cuando hay PRUEBA POSITIVA de que ese habitante no existe.
        if (ids && !ids.has(habId) && typeof mcAssetsRegistry !== 'undefined' && mcAssetsRegistry[habId]) {
          const p = fetch(mcAssetsRegistry[habId], { cache: 'no-store' })
            .then((r) => r.ok ? r.json() : { voxels: {} })
            .catch(() => ({ voxels: {} }));
          roomDataCache.set(key, p);
          return p;
        }
      }
      return orig.apply(this, arguments);
    };
    G.getRoomData._orig = orig;
  });

  // --- 1 · resolver toda la paleta otra vez, con la cache vacía ---
  const marca = cod.length;
  const res = await p.evaluate(async () => {
    const claves = [];
    for (let i = 0; i < mc.blockKey.length; i++) {
      const k = mc.blockKey[i];
      if (k && /^(asset:|hab:)/.test(k)) claves.push(mcClaveBase(k));
    }
    const unicas = Array.from(new Set(claves));
    unicas.forEach((k) => roomDataCache.delete(k));
    const vacias = [];
    for (const k of unicas) {
      const d = await getRoomData(k);
      if (!d || !Object.keys(d.voxels || {}).length) vacias.push(k);
    }
    return { n: unicas.length, vacias: vacias };
  });
  const nuevos404 = cod.slice(marca).filter((r) => r.s === 404);
  console.log('\n§1 · resolver la paleta entera con la cache vacia');
  t('sin un solo 404', nuevos404.length === 0,
    nuevos404.length + ' → ' + nuevos404.slice(0, 6).map((r) => r.url).join(', '));
  t('ninguna clave se queda sin documento', res.vacias.length === 0,
    res.n + ' claves, vacias: ' + JSON.stringify(res.vacias));

  console.log('\n§2 · las tres trampas (mismo id como asset Y como habitante)');
  const despues = await p.evaluate(async () => {
    const out = {};
    for (const k of ['hab:calamar', 'hab:escalera', 'hab:tejado']) {
      roomDataCache.delete(k);
      const d = await getRoomData(k);
      out[k] = { vox: Object.keys(d.voxels || {}).length, nombre: (d.meta && d.meta.name) || null };
    }
    return out;
  });
  for (const k of Object.keys(antes)) {
    t(k + ' sigue dando el mismo documento',
      antes[k].vox === despues[k].vox && antes[k].nombre === despues[k].nombre,
      JSON.stringify(antes[k]) + ' → ' + JSON.stringify(despues[k]));
  }

  await nav.close();
  console.log('\n' + ok + ' ok / ' + fail + ' fallos');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('⛔ ' + e.message); process.exit(1); });
