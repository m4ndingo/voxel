// REQ-PLANT1 · sonda de extremo a extremo del asistente de mundo nuevo.
//
// Comprueba LO QUE NINGUNA PRUEBA DE `curl` PUEDE: que el mapa se construye de verdad. El servidor
// sólo apunta la plantilla y deja `generado:false`; quien levanta el bioma es JS del navegador
// (`generador-mundo`, llamado por `mundo-autoarranque`), así que sin abrir una pestaña no se sabe si
// esto funciona — se sabe si el registro dice que debería.
//
// Las tres cosas que mira, y por qué cada una:
//   1. El asistente pinta el carrusel con las 7 fichas y ≥4 se ven a la vez (lo pidió el dueño).
//   2. Entrar al mapa recién creado LO CONSTRUYE: aparecen voxels donde no había ninguno.
//   3. El registro pasa a `generado:true`, y una segunda entrada ya NO reconstruye.
//
// ⛔ Usa un mapa `zz-sonda-plant-<ms>` de usar y tirar y lo borra al final. NO toca /map/default ni
// /map/agents. El bioma elegido es el más barato de generar para que la sonda no tarde un minuto.
//
//   node tests/probe_plantillas_mundo.js
//   VOXEL_URL=http://localhost:8500 node tests/probe_plantillas_mundo.js

const { chromium } = require('playwright');

const BASE = process.env.VOXEL_URL || 'http://localhost:8500';
const SLUG = 'zz-sonda-plant-' + Date.now();
let fallos = 0;

const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ⛔ ') + m); if (!c) fallos++; };

async function api(ruta, cuerpo, metodo) {
  const r = await fetch(BASE + ruta, {
    method: metodo || (cuerpo !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
  });
  const t = await r.text();
  return { code: r.status, d: t ? JSON.parse(t) : {} };
}

(async () => {
  // Chromium por software: esta máquina no tiene GPU y sin esto no hay contexto WebGL.
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const pag = await nav.newPage();
  pag.on('console', m => { if (/generador-mundo|plantilla/i.test(m.text())) console.log('    [nav] ' + m.text()); });

  try {
    // ── 1 · El asistente ────────────────────────────────────────────────────────────────────────
    console.log('\n1) El asistente de /map');
    await pag.goto(BASE + '/map', { waitUntil: 'load', timeout: 60000 });
    await pag.click('#btn-nuevo');
    await pag.waitForSelector('.asis .ficha', { timeout: 15000 });

    const fichas = await pag.$$eval('.asis .ficha', n => n.length);
    ok(fichas === 7, `el carrusel pinta ${fichas} fichas (5 biomas + terreno base + vacío = 7)`);

    // «Que se vean por lo menos 4 a la vez» — se cuenta cuántas caen dentro del ancho de la tira.
    const visibles = await pag.evaluate(() => {
      const t = document.querySelector('.asis-tira').getBoundingClientRect();
      return [...document.querySelectorAll('.asis .ficha')].filter(f => {
        const r = f.getBoundingClientRect();
        return r.left >= t.left - 1 && r.right <= t.right + 1;
      }).length;
    });
    ok(visibles >= 4, `se ven ${visibles} fichas a la vez sin desplazar (el dueño pidió ≥4)`);

    const prop = await pag.$eval('.asis .ficha', f => {
      const r = f.getBoundingClientRect(); return +(r.height / r.width).toFixed(2);
    });
    ok(prop > 1.5, `proporción de teléfono: alto/ancho = ${prop}`);

    const opciones = await pag.evaluate(() => ({
      lados: document.querySelectorAll('#a-lados button').length,
      amb: document.querySelectorAll('#a-amb button').length,
      efe: document.querySelectorAll('#a-efe button').length
    }));
    ok(opciones.lados >= 4 && opciones.amb === 4 && opciones.efe === 3,
       `personalización: ${opciones.lados} tamaños, ${opciones.amb} ambientes, ${opciones.efe} efectos`);

    // Que las dos últimas sean las especiales, y en ese orden: el dueño lo pidió «al final».
    const ultimas = await pag.$$eval('.asis .ficha .tit', n => n.slice(-2).map(x => x.textContent.trim()));
    ok(ultimas[0] === 'Solo terreno base' && ultimas[1] === 'Mapa vacío',
       `las dos últimas son «${ultimas.join('» y «')}»`);

    // ── 2 · Crear y que se construya ────────────────────────────────────────────────────────────
    console.log('\n2) Crear un mundo con plantilla y entrar');
    const cr = await api('/api/mundos/crear', {
      nombre: SLUG, lado: 96, plantilla: 'construye-monta-as',
      ambiente: 'atardecer', efectos: ['niebla']
    });
    ok(cr.code === 200 && cr.d.meta.generado === false,
       `creado «${cr.d.meta && cr.d.meta.slug}» con generado:false (está a medias, a propósito)`);

    await pag.goto(BASE + '/map/' + SLUG, { waitUntil: 'load', timeout: 60000 });
    // Generar un bioma son decenas de segundos: se espera al AVISO del servidor, que es la marca de
    // «terminado de verdad», y no a un plazo inventado.
    let generado = false;
    for (let i = 0; i < 100 && !generado; i++) {
      await pag.waitForTimeout(2000);
      generado = (await api(`/api/mundos/${SLUG}/plantilla`)).d.generado;
    }
    ok(generado, 'el navegador construyó el mundo y avisó al servidor (generado:true)');

    const vox = await pag.evaluate(() => {
      if (typeof mc === 'undefined' || !mc.grid) return -1;
      let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++;
      return n;
    });
    ok(vox > 10000, `la rejilla tiene ${vox.toLocaleString('es')} voxels (el bioma se construyó de verdad)`);

    // El tamaño elegido manda sobre el `resizeWorld(128,…)` que el generador lleva a fuego.
    const dim = await pag.evaluate(() => (typeof mc === 'undefined') ? null : mc.dim);
    ok(dim && dim.x === 96 && dim.z === 96,
       `el lado elegido sobrevive al generador: ${dim.x}×${dim.y}×${dim.z} (se pidió 96, el snippet dice 128)`);

    // Y las dos envolturas se deshicieron: la ley de oro exige devolverlo byte a byte.
    const limpio = await pag.evaluate(() => ({
      wipe: !game.wipeMap._orig || game.wipeMap === game.wipeMap._orig,
      resize: !game.resizeWorld._orig || game.resizeWorld === game.resizeWorld._orig
    }));
    ok(limpio.wipe && limpio.resize, 'game.wipeMap y game.resizeWorld quedaron devueltos a su original');

    // ── 3 · No reconstruir ──────────────────────────────────────────────────────────────────────
    //
    // Lo que se mira es que el corredor NO vuelva a construir: si lo hiciera, empezaría por
    // `game.wipeMap()` y el mundo se perdería entero. La prueba es que no anuncie una segunda
    // construcción y que la rejilla siga ahí.
    console.log('\n3) Volver a entrar NO reconstruye');
    let reconstruyo = false;
    pag.on('console', m => { if (/generador-mundo.*construido/.test(m.text())) reconstruyo = true; });
    await pag.goto(BASE + '/map/' + SLUG, { waitUntil: 'load', timeout: 60000 });
    await pag.waitForTimeout(8000);
    const vox2 = await pag.evaluate(() => {
      if (typeof mc === 'undefined' || !mc.grid) return -1;
      let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++;
      return n;
    });
    ok(!reconstruyo, 'el corredor no anuncia una segunda construcción (habría empezado por wipeMap)');
    // ⚠️ NO se compara con `===`. El mundo está VIVO: los fluidos de los lagos siguen corriendo y
    // las nubes se mueven, así que entre el guardado y esta lectura bailan unas decenas de celdas
    // (~0,02 %). Exigir el número exacto es exigir que el juego esté parado; lo que delataría una
    // regeneración es un mundo vacío o un orden de magnitud distinto, no 37 voxels.
    const desvio = Math.abs(vox2 - vox) / vox;
    ok(vox2 > 0 && desvio < 0.02,
       `la rejilla sigue puesta: ${vox2.toLocaleString('es')} voxels (${(desvio * 100).toFixed(2)} % de desvío por el mundo vivo)`);

  } catch (e) {
    console.log('  ⛔ excepción: ' + (e && e.stack || e));
    fallos++;
  } finally {
    await nav.close();
    // Recoger la basura pase lo que pase: el mapa, su registro y su snippet de ambiente.
    try {
      const b = await api('/api/mundos/' + SLUG, undefined, 'DELETE');
      console.log(`\nlimpieza: DELETE /api/mundos/${SLUG} → ${b.code}`);
    } catch (e) { console.log('\n⚠️ no se pudo borrar ' + SLUG + ': ' + e); }
  }

  console.log(fallos ? `\n⛔ ${fallos} fallo(s)` : '\n✅ todo bien');
  process.exit(fallos ? 1 : 0);
})();
