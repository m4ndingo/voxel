// «atravesable»: una pieza que se ve, da sombra, se apunta y se rompe igual que cualquier otra, pero
// que el jugador CRUZA sin frenarse. Es lo que hace que una mata de hierba se pise en vez de ser un
// muro de 16 cm.
//
// La pieza delicada es que hay UN bitset haciendo DOS trabajos: `bits` responde «¿me frena?» y
// `bitsAim` responde «¿hay materia aqui para mirarla/romperla?». Mientras nada sea atravesable son la
// MISMA REFERENCIA; `atravesable` es lo unico que los separa. Y el bitset de colision tiene que ser un
// array de CEROS, jamas null: mundo-autoarranque envuelve mcStructColl y re-implementa el bucle con un
// `if(!g || !g.bits) continue`, asi que un null no haria la mata atravesable — la borraria tambien del
// apuntado y ya no se podria ni romper. Eso es lo que comprueba §1.
//
// No persiste nada: bloquea el POST del mundo, inyecta los documentos en roomDataCache y retira del
// mundo todo lo que estampa.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  // Cinturon: aunque el test deshaga todo lo que pone, que no salga del navegador ni un guardado.
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/habitantes', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  // ── §1 los dos bitsets ──────────────────────────────────────────────────────
  console.log('\n§1 `bits` (colision) y `bitsAim` (apuntado) solo se separan si es atravesable');
  const r1 = await p.evaluate(async () => {
    let n = 0;
    const doc = (vox, extra) => {
      const key = 'zz-atrav-' + (++n);
      const d = { size: { x: 16, y: 16, z: 16 }, meta: { name: key, type: 'objeto' }, voxels: vox };
      Object.assign(d, extra || {});
      roomDataCache.set(key, Promise.resolve(d));
      delete mc.structs[key];
      return key;
    };
    const mata = {};
    for (let z = 0; z < 6; z++) for (let i = 0; i < 6; i++) mata[(4 + i) + ',7,' + z] = '#4a8b2c';

    const normal = await mcStructGeom(doc(mata), 0);
    const cruza = await mcStructGeom(doc(mata, { atravesable: true }), 0);

    const macizo = {};
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) macizo[x + ',' + y + ',' + z] = '#777777';

    const rec = mc.structs[Object.keys(mc.structs).find(k => /^zz-atrav-2$/.test(k))];
    return {
      normalMismaRef: normal.bits === normal.bitsAim,
      normalNoVacio: normal.bits.some(x => x === 1),
      cruzaDistintos: cruza.bits !== cruza.bitsAim,
      cruzaBitsEsArray: cruza.bits instanceof Uint8Array,          // NUNCA null: ver la cabecera
      cruzaBitsVacio: cruza.bits.every(x => x === 0),
      cruzaMismoTam: cruza.bits.length === cruza.bitsAim.length,
      cruzaAimReal: cruza.bitsAim.some(x => x === 1),
      // Las mismas caras dibujadas: atravesable no toca la geometria, solo la colision.
      mismaMalla: normal.colCount === cruza.colCount,
      // Y la copia de solo-colision (colRot) tiene que llevar los DOS, o al perder la malla el
      // apuntado se quedaria con el bitset vacio y la pieza dejaria de poder romperse.
      colRotLlevaAim: !!(rec && rec.colRot && rec.colRot[0] && rec.colRot[0].bitsAim &&
                         rec.colRot[0].bits !== rec.colRot[0].bitsAim),
      macizoEsBloque: (await mcStructCells(doc(macizo))).blockLike,
      macizoAtravesableNoEsBloque: (await mcStructCells(doc(macizo, { atravesable: true }))).blockLike,
    };
  });
  ok('sin atravesable son la MISMA referencia (cero memoria, no pueden diverger)', r1.normalMismaRef);
  ok('y no estan vacios', r1.normalNoVacio);
  ok('con atravesable son dos arrays distintos', r1.cruzaDistintos);
  ok('el de colision es un Uint8Array, no null (mundo-autoarranque lo recorre)', r1.cruzaBitsEsArray);
  ok('...del mismo tamano', r1.cruzaMismoTam);
  ok('...y todo a ceros: nada frena', r1.cruzaBitsVacio);
  ok('pero el de apuntado tiene la ocupacion REAL', r1.cruzaAimReal);
  ok('la malla no cambia: se sigue viendo igual', r1.mismaMalla);
  ok('colRot se lleva los dos (si no, romperla fallaria al re-mallar)', r1.colRotLlevaAim);
  ok('un 16³ macizo normal si entra en la rejilla', r1.macizoEsBloque === true);
  ok('pero atravesable NO: mc.grid no sabe guardar «esto no choca»', r1.macizoAtravesableNoEsBloque === false);

  // ── §2 el jugador la cruza ──────────────────────────────────────────────────
  console.log('\n§2 andando: la misma pieza frena o no segun la casilla');
  const r2 = await p.evaluate(async () => {
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    let base = null;
    for (let y = mc.dim.y - 9; y > 4 && !base; y -= 2)
      for (let x = 1; x + 8 < mc.dim.x && !base; x += 5)
        for (let z = 1; z + 8 < mc.dim.z && !base; z += 5)
          if (vacio(x, y, z, 8, 9, 8)) base = [x, y, z];
    if (!base) return { error: 'no encontre un hueco de 8x9x8 en el mundo' };
    const [BX, BY, BZ] = base;

    const previos = [];
    for (let dx = 0; dx < 8; dx++) for (let dz = 0; dz < 8; dz++) {
      previos.push([BX + dx, BY, BZ + dz, mc.grid[mcIdx(BX + dx, BY, BZ + dz)]]);
      mcSetBlock(BX + dx, BY, BZ + dz, 1);
    }
    const SUELO = BY + 1;

    // Un muro fino de 16 voxels de ancho por 16 de alto que cruza el pasillo. Como estructura fina
    // ocupa media celda de grosor: sin `atravesable` es una pared de verdad y frena.
    const muro = {};
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) muro[x + ',7,' + z] = '#4a8b2c';
    const poner = (key, atrav) => {
      const d = { size: { x: 16, y: 16, z: 16 }, meta: { name: key, type: 'objeto' }, voxels: muro };
      if (atrav) d.atravesable = true;
      roomDataCache.set(key, Promise.resolve(d));
      delete mc.structs[key];
      return key;
    };

    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), yaw: mc.yaw, pitch: mc.pitch, scale: mc.scale, keys: Object.assign({}, mc.keys) };

    // yaw 0 ⇒ fwd = -z: se arranca en el borde +z y se anda hacia el muro, que esta en BZ+3.
    const pasada = () => {
      mc.scale = 1; mc.yaw = 0; mc.pitch = 0;
      mc.pos = [BX + 3.5, SUELO, BZ + 6.5]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.keys['w'] = true; mc.onGround = true;
      mc._pasoDesfase = 0; mc._pasoSubido = 0; mc._velInercia = 0; mc._deslizVel = 0;
      const z0 = mc.pos[2];
      for (let i = 0; i < 70; i++) mcUpdate(1 / 60);
      return +(z0 - mc.pos[2]).toFixed(3);      // cuanto avanzo hacia el muro
    };

    // El punto donde de verdad hay materia: el muro son los voxels de PROFUNDIDAD 7 del asset (asset
    // Y → z de mundo), asi que en coordenadas de bloque cae en BZ+3 + 7,5/16. Apuntar al centro de la
    // celda (BZ+3,5) daria el voxel 8, que ya esta vacio.
    const enElMuro = [BX + 3.5, SUELO + 0.5, BZ + 3 + 7.5 / 16];

    const kSolido = poner('zz-atrav-muro-solido', false);
    await mcStampStruct(kSolido, BX + 3, SUELO, BZ + 3, 0, true);
    const avanceSolido = pasada();
    const apuntaSolido = !!mcStructAt(...enElMuro);
    mcRemoveStruct(mc.structures.find(o => o.key === kSolido), true);

    const kCruza = poner('zz-atrav-muro-cruza', true);
    await mcStampStruct(kCruza, BX + 3, SUELO, BZ + 3, 0, true);
    const avanceCruza = pasada();
    // Y sigue estando ahi para todo lo demas: apuntarla, romperla, verla en rayos-X.
    const apuntaCruza = !!mcStructAt(...enElMuro);
    const celdaSolida = mcStructCellSolid(BX + 3, SUELO, BZ + 3);
    mcRemoveStruct(mc.structures.find(o => o.key === kCruza), true);

    mc.pos = est0.pos; mc.vel = est0.vel; mc.yaw = est0.yaw; mc.pitch = est0.pitch;
    mc.scale = est0.scale; mc.keys = est0.keys;
    for (const [x, y, z, v] of previos) mcSetBlock(x, y, z, v || 0);
    for (const k of [kSolido, kCruza]) { roomDataCache.delete(k); delete mc.structs[k]; }
    await new Promise(r => setTimeout(r, 300));

    return { avanceSolido, avanceCruza, apuntaSolido, apuntaCruza, celdaSolida,
             limpio: !mc.structures.some(o => /^zz-atrav-/.test(o.key)) };
  });
  if (r2.error) { ok('el escenario cabe en el mundo', false, r2.error); }
  else {
    // El solido frena a ~3 bloques (donde esta el muro); el atravesable sigue de largo. Se compara uno
    // contra otro y no contra un numero fijo: la marcha depende del material del suelo del mundo vivo.
    ok('sin atravesable, el muro frena al jugador', r2.avanceSolido < 3.4, 'avanzo ' + r2.avanceSolido);
    ok('con atravesable, lo cruza sin frenarse', r2.avanceCruza > r2.avanceSolido + 0.5,
      'solido ' + r2.avanceSolido + ' vs atravesable ' + r2.avanceCruza);
    ok('la solida se apunta, claro', r2.apuntaSolido === true);
    ok('y la atravesable TAMBIEN: se cruza, pero se mira y se rompe', r2.apuntaCruza === true);
    ok('y su celda cuenta como solida para pegarle bloques', r2.celdaSolida === true);
    ok('limpieza: no queda ninguna estructura de prueba', r2.limpio);
  }

  // ── §3 el editor: la casilla y el documento ─────────────────────────────────
  console.log('\n§3 el editor lo guarda, lo relee y la casilla lo refleja');
  const p2 = await b.newPage();
  p2.on('pageerror', e => errores.push('EXCEPCION (editor) ' + e.message));
  await p2.goto('http://localhost:8500/', { waitUntil: 'load', timeout: 60000 });
  await p2.waitForFunction('typeof load === "function"', { timeout: 60000 });
  const r3 = await p2.evaluate(() => {
    load(new Map(), { name: 'zz-atravesable', type: 'objeto' });
    setVoxel(1, 1, 1, '#4a8b2c');
    const sinClave = !('atravesable' in currentVox());
    const casillaApagada = $('#meta-atravesable').checked;

    $('#meta-atravesable').checked = true;
    $('#meta-atravesable').dispatchEvent(new Event('change', { bubbles: true }));
    const enEstado = state.atravesable;
    const doc = currentVox();

    // Releerlo tiene que devolver lo mismo, y la casilla tiene que enterarse (load la sincroniza).
    $('#meta-atravesable').checked = false; state.atravesable = false;
    load(new Map(Object.entries(doc.voxels)), doc.meta, doc.size, doc.pivotes, doc.caras, doc.atravesable);
    const trasReleer = state.atravesable;
    const casillaTrasReleer = $('#meta-atravesable').checked;

    // Y un documento normal no arrastra la clave ni deja la casilla puesta del anterior.
    load(new Map(), { name: 'zz-normal', type: 'objeto' });
    const seLimpia = state.atravesable === false && $('#meta-atravesable').checked === false;
    return { sinClave, casillaApagada, enEstado, guardado: doc.atravesable, trasReleer, casillaTrasReleer, seLimpia };
  });
  ok('un objeto normal no lleva la clave en el JSON', r3.sinClave && r3.casillaApagada === false);
  ok('marcar la casilla lo enciende', r3.enEstado === true);
  ok('y sale en el documento guardado', r3.guardado === true);
  ok('releerlo lo recupera', r3.trasReleer === true);
  ok('y la casilla se entera sola', r3.casillaTrasReleer === true);
  ok('abrir otro objeto la deja limpia', r3.seLimpia);

  // ── §4 lo mismo, pero SIN tocar el documento: game.bloques.define ────────────────────────────
  // Un material vive en uno de dos sitios y por eso hay dos mitades que probar: los 16³ macizos estan
  // en mc.grid (van por mc.atraviesa, el unico gancho nuevo de app.js) y todo lo que tiene forma es
  // estructura fina (va por el envoltorio de mcStructColl, cero lineas de app.js). Las dos tienen que
  // dar la MISMA forma que la casilla del documento, y quitar() tiene que devolver el choque.
  console.log('\n§4 atravesable desde scripting (game.bloques.define)');
  const r4 = await p.evaluate(async () => {
    if (!window.game || !game.bloques) return { error: 'el Mundo no trae game.bloques (¿corrió mundo-autoarranque?)' };
    const vacio = (x0, y0, z0, sx, sy, sz) => {
      for (let x = x0; x < x0 + sx; x++) for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++)
        if (!mcInside(x, y, z) || mc.grid[mcIdx(x, y, z)]) return false;
      return true;
    };
    let base = null;
    for (let y = mc.dim.y - 9; y > 4 && !base; y -= 2)
      for (let x = 1; x + 8 < mc.dim.x && !base; x += 5)
        for (let z = 1; z + 8 < mc.dim.z && !base; z += 5)
          if (vacio(x, y, z, 8, 9, 8)) base = [x, y, z];
    if (!base) return { error: 'no encuentro un hueco 8x9x8 libre' };
    const [BX, BY, BZ] = base;

    // El material del muro tiene que ser DISTINTO del suelo: define() actua sobre el material entero y
    // sobre TODO el mundo, asi que si coincidieran el jugador se hundiria por el suelo de la prueba.
    const ID_SUELO = 1;
    let idMuro = 0;
    for (let i = 1; i < mc.blockKey.length; i++) if (i !== ID_SUELO && mc.blockKey[i]) { idMuro = i; break; }
    if (!idMuro) return { error: 'la paleta no tiene dos materiales distintos' };
    const claveMuro = mc.blockKey[idMuro];

    const previos = [];
    const poner = (x, y, z, id) => { previos.push([x, y, z, mc.grid[mcIdx(x, y, z)]]); mcSetBlock(x, y, z, id); };
    for (let dx = 0; dx < 8; dx++) for (let dz = 0; dz < 8; dz++) poner(BX + dx, BY, BZ + dz, ID_SUELO);
    const SUELO = BY + 1;

    const est0 = { pos: mc.pos.slice(), vel: mc.vel.slice(), yaw: mc.yaw, pitch: mc.pitch, scale: mc.scale, keys: Object.assign({}, mc.keys) };
    // Mismo andar que §2: yaw 0 ⇒ fwd -z, se arranca en el borde +z y se camina hacia la pared de BZ+3.
    const pasada = () => {
      mc.scale = 1; mc.yaw = 0; mc.pitch = 0;
      mc.pos = [BX + 3.5, SUELO, BZ + 6.5]; mc.vel = [0, 0, 0];
      mc.keys = {}; mc.keys['w'] = true; mc.onGround = true;
      mc._pasoDesfase = 0; mc._pasoSubido = 0; mc._velInercia = 0; mc._deslizVel = 0;
      const z0 = mc.pos[2];
      for (let i = 0; i < 70; i++) mcUpdate(1 / 60);
      return +(z0 - mc.pos[2]).toFixed(3);
    };

    // ── mitad A · bloque de TERRENO (mc.grid → mc.atraviesa → mcSolidWalk) ──
    for (let dx = 0; dx < 8; dx++) for (let dy = 0; dy < 3; dy++) poner(BX + dx, SUELO + dy, BZ + 3, idMuro);
    const ganchoAlPrincipio = mc.atraviesa;
    const bloqueSolido = pasada();
    game.bloques.define(claveMuro, { atravesable: true });
    const ganchoPuesto = (mc.atraviesa instanceof Uint8Array) && mc.atraviesa[idMuro] === 1 && !mc.atraviesa[ID_SUELO];
    const bloqueCruza = pasada();
    // El suelo NO es atravesable, asi que el jugador tiene que seguir andando por encima y no caerse.
    const bloqueNoSeCae = Math.abs(mc.pos[1] - SUELO) < 0.2;
    // Y se sigue apuntando y rompiendo: mcSolid ni se entera de todo esto.
    const bloqueApunta = mcSolid(BX + 3, SUELO, BZ + 3);
    game.bloques.quitar(claveMuro);
    const ganchoLimpio = !mc.atraviesa || !mc.atraviesa[idMuro];
    const bloqueVuelveSolido = pasada();
    for (let dx = 0; dx < 8; dx++) for (let dy = 0; dy < 3; dy++) mcSetBlock(BX + dx, SUELO + dy, BZ + 3, 0);

    // ── mitad B · ESTRUCTURA FINA (envoltorio de mcStructColl → sinChoque) ──
    // El documento NO lleva "atravesable": todo el efecto viene del define, que es justo lo que se pide.
    const muro = {};
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) muro[x + ',7,' + z] = '#4a8b2c';
    const kFina = 'zz-atrav-script';
    roomDataCache.set(kFina, Promise.resolve({ size: { x: 16, y: 16, z: 16 }, meta: { name: kFina, type: 'objeto' }, voxels: muro }));
    delete mc.structs[kFina];
    await mcStampStruct(kFina, BX + 3, SUELO, BZ + 3, 0, true);
    const finaSolida = pasada();
    game.bloques.define(kFina, { atravesable: true });
    const inst = mc.structures.find(o => o.key === kFina);
    const g = mcStructColl(inst);
    const clonBien = !!g && (g.bits instanceof Uint8Array) && g.bits.every(v => v === 0)
      && !!g.bitsAim && g.bitsAim.some(v => v === 1) && g.bits.length === g.bitsAim.length;
    // Segunda llamada: tiene que salir el MISMO objeto (la cache por clave|rot, no un clon por sondeo).
    const clonCacheado = mcStructColl(inst) === g;
    const finaCruza = pasada();
    const enElMuro = [BX + 3.5, SUELO + 0.5, BZ + 3 + 7.5 / 16];
    const finaApunta = !!mcStructAt(...enElMuro);
    const finaCelda = mcStructCellSolid(BX + 3, SUELO, BZ + 3);
    game.bloques.quitar(kFina);
    const vuelveElOriginal = mcStructColl(inst) !== g && mcStructColl(inst).bits.some(v => v === 1);
    const finaVuelveSolida = pasada();
    mcRemoveStruct(inst, true);

    mc.pos = est0.pos; mc.vel = est0.vel; mc.yaw = est0.yaw; mc.pitch = est0.pitch;
    mc.scale = est0.scale; mc.keys = est0.keys;
    for (const [x, y, z, v] of previos) mcSetBlock(x, y, z, v || 0);
    roomDataCache.delete(kFina); delete mc.structs[kFina];
    await new Promise(r => setTimeout(r, 300));

    return {
      claveMuro, ganchoAlPrincipio, ganchoPuesto, ganchoLimpio,
      bloqueSolido, bloqueCruza, bloqueVuelveSolido, bloqueNoSeCae, bloqueApunta,
      finaSolida, finaCruza, finaVuelveSolida, clonBien, clonCacheado, vuelveElOriginal,
      finaApunta, finaCelda,
      limpio: !mc.structures.some(o => /^zz-atrav-/.test(o.key)) && !mc.atraviesa
    };
  });
  if (r4.error) { ok('el escenario de scripting cabe en el mundo', false, r4.error); }
  else {
    ok('sin ningun define, mc.atraviesa es null (coste cero)', !r4.ganchoAlPrincipio);
    ok('define sobre un bloque de terreno enciende su id en mc.atraviesa', r4.ganchoPuesto);
    ok('el muro de terreno frena antes del define', r4.bloqueSolido < 3.4, 'avanzo ' + r4.bloqueSolido);
    ok('y despues se cruza', r4.bloqueCruza - r4.bloqueSolido > 0.5, r4.bloqueSolido + ' → ' + r4.bloqueCruza);
    ok('el suelo, que no se definio, sigue sosteniendo al jugador', r4.bloqueNoSeCae);
    ok('mcSolid ni se entera: se sigue apuntando y rompiendo', r4.bloqueApunta === true);
    ok('quitar() vacia el gancho...', r4.ganchoLimpio);
    ok('...y el muro vuelve a frenar', Math.abs(r4.bloqueVuelveSolido - r4.bloqueSolido) < 0.2,
      r4.bloqueSolido + ' → ' + r4.bloqueVuelveSolido);
    ok('en una estructura fina el envoltorio da la misma forma (bits ceros / bitsAim real)', r4.clonBien);
    ok('...cacheada por clave|rot, no un clon por sondeo', r4.clonCacheado);
    ok('la estructura fina frena antes del define', r4.finaSolida < 3.4, 'avanzo ' + r4.finaSolida);
    ok('y despues se cruza, con el documento intacto', r4.finaCruza - r4.finaSolida > 0.5,
      r4.finaSolida + ' → ' + r4.finaCruza);
    ok('sigue apuntandose (mcStructAt)', r4.finaApunta === true);
    ok('y el rayo sigue entrando en su celda (mcStructCellSolid)', r4.finaCelda === true);
    ok('quitar() devuelve el bitset ORIGINAL, no otro clon', r4.vuelveElOriginal);
    ok('...y la estructura vuelve a frenar', Math.abs(r4.finaVuelveSolida - r4.finaSolida) < 0.2,
      r4.finaSolida + ' → ' + r4.finaVuelveSolida);
    ok('el mundo queda como estaba', r4.limpio);
  }

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();
