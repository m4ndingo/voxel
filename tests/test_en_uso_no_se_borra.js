// @area: general
// @necesita: servidor
//
// Guardián de F2: «lo que está EN USO no se borra, y lo que es del motor tampoco».
//
// El origen es una pérdida de verdad: `particulas-voxel` se borró, cayó en `habitantes_trash/`,
// llegaron 30 borrados más y `clean_trash` lo podó. La protección de entonces era un `set` de UN
// elemento escrito a mano (`SNIPS_PROTEGIDOS = {'mundo-autoarranque'}`), o sea que protegía lo que
// alguien recordó el día que lo escribió. Ahora son cuatro reglas y basta con que una diga que no:
//
//   1. la lista de piezas del motor          → `SNIPS_PROTEGIDOS`
//   2. la convención de nombre               → `SNIPS_PREFIJOS_PROTEGIDOS` (`mundo-`, `arranque-`, `redstone`)
//   3. la marca dentro del propio fichero    → `"protegido": true`   (viaja con él, sobrevive a un `git pull`)
//   4. quién lo llama, calculado al borrar   → `buscar_snips(usa=…)` / `mundos_que_usan(clave)`
//
// La 4 es la que no se puede escribir en ninguna lista, y por eso es la que más importa aquí.
//
// ⚠️ Este test ESCRIBE. Todo lo que crea se llama `zz-test-*` y se recoge al final (incluso si algo
// revienta a mitad: la recogida va en un `finally`). El mundo de usar y tirar se borra con
// `DELETE /api/mundos/<slug>`, que es F3.3 — antes de F3.3 este test no podía existir sin dejar
// basura, y esa es media razón de que F3.3 se hiciera ahora.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8500);
const HOST = 'http://localhost:' + PUERTO;

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO  ' + m));

async function pide(metodo, ruta, cuerpo) {
  const r = await fetch(HOST + ruta, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  let d = null;
  try { d = await r.json(); } catch { /* 404 de HTML, da igual */ }
  return { code: r.status, d };
}

const snipEnDisco = (id) => fs.existsSync(path.join(RAIZ, 'data', 'snippets', id + '.json'));
const publica = (id, code, extra = {}) =>
  pide('POST', '/api/snippets', { id, name: id, code, ...extra });

// Un mundo diminuto pero válido: `POST /api/mundo` pide `dim` y `voxels`, y de ahí `voxfmt.desde_v1`
// saca la cabecera v2 y el `.vox`. 4³ celdas con un solo bloque es todo lo que hace falta.
const MUNDO_MINIMO = { dim: { x: 4, y: 4, z: 4 }, voxels: { '1,0,1': 'asset:assets/roca.vox.json' } };

const MAPA = 'zz-test-en-uso';
const CREADOS = [];                      // snippets que hay que recoger pase lo que pase

(async () => {
  try {
    console.log('\n§1 las piezas del motor no se borran, y siguen en disco después de intentarlo');
    // Read-only a propósito: son ficheros del dueño. Si el guardia fallase, la comprobación de
    // «sigue en disco» lo cazaría en el acto en vez de dentro de 30 borrados.
    for (const [id, porque] of [
      ['mundo-autoarranque', 'la bomba: lo ejecuta cada visitante de cada mapa'],
      ['particulas-voxel',   'el que se perdió de verdad'],
      ['sondas-mundo',       'la FORMA de las partículas'],
      ['base-npc-skills',    'la librería de los NPC'],
    ]) {
      if (!snipEnDisco(id)) { console.log(`  --    ${id} no está instalado, me lo salto`); continue; }
      const r = await pide('DELETE', '/api/snippets/' + id);
      check(r.code === 409, `DELETE ${id} → ${r.code} (esperado 409) · ${porque}`);
      check(snipEnDisco(id), `…y ${id} sigue en disco`);
    }

    console.log('\n§2 la convención de nombre protege lo que ninguna lista recuerda');
    // `mundo-<mapa>` y `arranque-<mapa>` los arranca el motor SOLO, por nombre calculado: nadie los
    // menciona, así que la regla de «quién lo llama» no puede verlos. Son justo los que más duelen.
    for (const id of ['mundo-autoarranque', 'redstone']) {
      if (!snipEnDisco(id)) { console.log(`  --    ${id} no está instalado, me lo salto`); continue; }
      const r = await pide('DELETE', '/api/snippets/' + id);
      check(r.code === 409 && /convención|pieza del motor/.test(r.d?.error || ''),
            `DELETE ${id} → 409 y el motivo lo explica · ${(r.d?.error || '').slice(0, 60)}…`);
    }

    console.log('\n§3 la marca `"protegido": true` viaja DENTRO del fichero');
    CREADOS.push('zz-test-marcado');
    await publica('zz-test-marcado', '// nada', { protegido: true });
    let r = await pide('DELETE', '/api/snippets/zz-test-marcado');
    check(r.code === 409, `con la marca → ${r.code} (esperado 409)`);
    // Y es PEGAJOSA: republicar sin mencionarla NO la quita, o el botón «guardar» del editor
    // desprotegería la pieza sin que nadie se enterase. Quitarla hay que pedirlo en voz alta.
    await publica('zz-test-marcado', '// nada, republicado');
    r = await pide('DELETE', '/api/snippets/zz-test-marcado');
    check(r.code === 409, `republicado sin mencionarla → ${r.code} (esperado 409: la marca se pega)`);
    await publica('zz-test-marcado', '// nada', { protegido: false });
    r = await pide('DELETE', '/api/snippets/zz-test-marcado');
    check(r.code === 200, `con "protegido: false" → ${r.code} (esperado 200: quitarla se pide)`);

    console.log('\n§4 quién lo llama — la regla que no se puede escribir en una lista');
    CREADOS.push('zz-test-pieza', 'zz-test-llama', 'zz-test-menciona');
    await publica('zz-test-pieza', '// una pieza cualquiera');
    await publica('zz-test-llama', "await game.snippet('zz-test-pieza');");
    r = await pide('DELETE', '/api/snippets/zz-test-pieza');
    check(r.code === 409, `con un llamador vivo → ${r.code} (esperado 409)`);
    check((r.d?.llamadoPor || []).some((s) => s.id === 'zz-test-llama'),
          `…y el 409 dice QUIÉN lo llama (${(r.d?.llamadoPor || []).map((s) => s.id).join(', ') || 'nadie'})`);
    check(typeof (r.d?.llamadoPor || [])[0]?.linea === 'number',
          '…con la línea, para poder ir a quitarlo');

    // Mencionar no es llamar. Si una palabra suelta en un comentario bloquease el borrado, el aviso
    // sería ruido y se acabaría ignorando, que es como mueren estas protecciones.
    await pide('DELETE', '/api/snippets/zz-test-llama');
    await publica('zz-test-menciona', "// aquí hablo de 'zz-test-pieza' pero no la ejecuto");
    r = await pide('DELETE', '/api/snippets/zz-test-pieza');
    check(r.code === 200, `solo mencionado → ${r.code} (esperado 200: una mención no rompe nada)`);

    console.log('\n§5 un habitante usado por un mapa tampoco se borra (se leen SOLO las cabeceras)');
    const hab = await pide('POST', '/api/habitantes', { meta: { name: 'zz-test-hab' }, voxels: {} });
    const hid = hab.d?.id;
    check(!!hid, `habitante de prueba creado (id ${hid})`);

    await pide('POST', `/api/mundo?map=${MAPA}`, MUNDO_MINIMO);
    const puesto = await pide('POST', `/api/mundo/cabecera?map=${MAPA}`,
                              { structures: [{ key: `hab:${hid}`, x: 1, y: 1, z: 1, rot: 0 }] });
    check(puesto.code === 200, `el mapa de usar y tirar lo referencia (${puesto.code})`);

    r = await pide('DELETE', '/api/habitantes/' + hid);
    check(r.code === 409, `DELETE del habitante en uso → ${r.code} (esperado 409)`);
    check((r.d?.usadoPor || []).some((m) => m.mapa === MAPA),
          `…y dice EN QUÉ MAPA (${(r.d?.usadoPor || []).map((m) => m.mapa).join(', ') || 'ninguno'})`);
    check(fs.existsSync(path.join(RAIZ, 'data', 'habitantes', hid + '.json')),
          '…y el habitante sigue en disco');

    await pide('POST', `/api/mundo/cabecera?map=${MAPA}`, { structures: [] });   // se quita del mapa
    r = await pide('DELETE', '/api/habitantes/' + hid);
    check(r.code === 200, `una vez fuera del mapa → ${r.code} (esperado 200)`);

    console.log('\n§6 …y el borrado de autoría va a `data/papelera/`, que NO se poda');
    // La otra mitad del fallo original: no basta con avisar, hay que dejar de podar lo irrepetible.
    const cajon = path.join(RAIZ, 'data', 'papelera', 'habitantes');
    check(fs.existsSync(cajon) && fs.readdirSync(cajon).some((f) => f.endsWith(`__${hid}.json`)),
          `el habitante borrado está en data/papelera/habitantes/ (no en habitantes_trash/)`);

    console.log('\n§7 F3.3 · el mundo de usar y tirar se puede borrar (antes no había forma)');
    r = await pide('DELETE', '/api/mundos/' + MAPA);
    check(r.code === 200, `DELETE /api/mundos/${MAPA} → ${r.code} (esperado 200)`);
    check(!fs.existsSync(path.join(RAIZ, 'data', 'worlds', MAPA + '.json')) &&
          !fs.existsSync(path.join(RAIZ, 'data', 'worlds', MAPA + '.vox')),
          '…y se lleva el PAR entero (.json + .vox), sin dejar el .vox huérfano');
    r = await pide('DELETE', '/api/mundos/' + MAPA);
    check(r.code === 404, `y borrarlo dos veces → ${r.code} (esperado 404)`);

    const sagrado = await pide('DELETE', '/api/mundos/default');
    check(sagrado.code === 409, `⛔ «default» (el mundo sagrado) → ${sagrado.code} (esperado 409)`);
  } finally {
    // Recogida de basura. Va en `finally` porque un fallo a mitad no puede dejar snippets `zz-test-*`
    // sueltos en `data/snippets/`, que SÍ se versiona: aparecerían en el `git status` del dueño.
    for (const id of CREADOS) {
      if (snipEnDisco(id)) await pide('DELETE', '/api/snippets/' + id).catch(() => {});
    }
  }

  console.log(`\n${ok} ok / ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
