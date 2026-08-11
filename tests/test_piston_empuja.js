// @area: redstone
// @necesita: servidor, playwright
// BUG-RS9 · «si me pongo como jugador delante de él y lo activo, en lugar de empujarme que es lo que
// ocurriria en la realidad, me subo encima del piston extendido».
//
// El pistón escribía la cabeza DENTRO del jugador y se lavaba las manos: el solape lo resolvía la
// auto-curación de mcUpdate, que tira de mcUnstick, y mcUnstick solo sabe buscar salida HACIA ARRIBA.
// El primer hueco de aire sobre la cabeza recién extendida es justo la cota de montarse encima, así
// que el pistón te aupaba. Aquí se mide que YA NO, y en el Mundo de verdad.
//
// Lo que hace que esto no sea un falso verde son los tramos B y C, no el A:
//
//   A · pistón horizontal con el jugador delante → sale DESPLAZADO hacia delante y a la MISMA cota
//   B · el mismo pistón con el jugador lejos     → no le mueve ni un float (no es un empujón ciego)
//   C · pistón mirando hacia ARRIBA bajo sus pies → ahí sí sube, una celda: eso es lo correcto
//   D · lo mismo con un AGENTE ARTICULADO delante (BUG-AG1) → se le aparta, no se monta encima
//
// Contra el código viejo, A falla de las dos maneras (la cota subía y la x no se movía) y D falla de
// otra: al agente no le pasaba NADA — la cabeza se escribía dentro de él y ahí se quedaba.
//
// No persiste nada: bloquea los POST, devuelve cada celda tocada a su id anterior y al jugador a
// donde estaba.
//
//   node test_piston_empuja.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}
const r3 = n => Math.round(n * 1000) / 1000;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  // El redstone entra por el autoarranque, que a propósito no se espera al abrir el mundo.
  await p.waitForFunction('window.game && game.redstone && game.redstone.tick', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const claveEn = (x, y, z) => base(mc.blockKey[idEn(x, y, z)] || '');
    const frame = () => new Promise(res => requestAnimationFrame(res));
    const esperar = ms => new Promise(res => setTimeout(res, ms));
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };

    const tocadas = new Map();
    const pon = (x, y, z, k) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      setVoxel(x, y, z, k || 0);
    };

    const FUENTE = 'asset:assets/bloque_redstone.vox.json';
    const LOSA = 'asset:assets/adoquin.vox.json';
    const CLAVES = [LOSA, FUENTE, 'hab:piston', 'hab:piston-on', 'hab:piston-cabeza'];
    const cargado = k => mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0;
    for (const k of CLAVES) if (!cargado(k)) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !cargado(k));
    if (out.faltan.length) return out;

    // ── el giro, preguntado al motor y no escrito a mano ────────────────────────────────────────
    // `hab:piston` sin '@' es rot 0 y mira a +X (redstone/plantar_piston.js); para el tramo vertical
    // hace falta el rot que mira a +Y, y ése se busca con la misma permutación que usa la pieza en
    // vez de con un número copiado: si mcOriPerm cambia, esto se entera.
    const CARA_DIR = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const frenteDe = rot => CARA_DIR[mcOriPerm(rot)[2]];
    out.frenteRot0 = frenteDe(0);
    let rotArriba = -1;
    for (let rr = 0; rr < 24 && rotArriba < 0; rr++) {
      const f = frenteDe(rr);
      if (f[0] === 0 && f[1] === 1 && f[2] === 0) rotArriba = rr;
    }
    out.rotArriba = rotArriba;
    if (rotArriba < 0) { out.errs.push('ningún rot de 0..23 mira a +Y'); return out; }

    // ── un solar de aire con el suelo también libre, que lo ponemos nosotros ─────────────────────
    const AN = 14, AL = 6, PR = 5;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = -1; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el banco de pruebas'); return out; }
    const [X, Y, Z] = caja;
    const ZP = Z + 2;
    out.caja = caja;

    beginBatch();
    for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, LOSA);
    endBatch();

    // El jugador se guarda para devolverlo, y de paso se apunta su escala: la caja depende de ella.
    const posPrevia = mc.pos.slice(), velPrevia = mc.vel ? mc.vel.slice() : null;
    out.escala = mc.scale;

    const plantar = () => {
      beginBatch();
      pon(X + 1, Y, ZP, FUENTE);            // detrás: un pistón se alimenta por cualquier lado
      pon(X + 2, Y, ZP, 'hab:piston');      // rot 0 = mira a +X
      endBatch();
      R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
      ticks(30);
    };
    const recoger = () => {                 // deja el solar como estaba, sin cabeza y sin fuente
      beginBatch();
      pon(X + 1, Y, ZP, 0); pon(X + 2, Y, ZP, 0); pon(X + 3, Y, ZP, 0); pon(X + 4, Y, ZP, 0);
      endBatch();
      R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
      ticks(30);
    };

    // ── A · el jugador plantado en la celda por la que va a salir la cabeza ──────────────────────
    recoger();
    mc.pos[0] = X + 3.5; mc.pos[1] = Y; mc.pos[2] = ZP + 0.5;
    if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frame(); await frame();
    const antesA = mc.pos.slice();
    out.A = { antes: antesA.slice(), atrapadoAntes: mcCollides(antesA[0], antesA[1], antesA[2]) };
    plantar();
    out.A.cabeza = claveEn(X + 3, Y, ZP);
    out.A.trasAccionar = mc.pos.slice();
    // Y unos cuantos frames: si algo le sigue subiendo (mcUnstick), aquí es donde se vería.
    for (let t = 0; t < 20; t++) await frame();
    await esperar(200);
    out.A.reposo = mc.pos.slice();
    out.A.atrapadoDespues = mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]);

    // ── B · el mismo pistón, con el jugador fuera del barrido ────────────────────────────────────
    recoger();
    mc.pos[0] = X + 9.5; mc.pos[1] = Y; mc.pos[2] = ZP + 0.5;
    if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frame(); await frame();
    const antesB = mc.pos.slice();
    plantar();
    out.B = { antes: antesB, trasAccionar: mc.pos.slice(), cabeza: claveEn(X + 3, Y, ZP) };
    recoger();

    // ── C · pistón mirando ARRIBA, bajo los pies: ahí subir sí es lo correcto ────────────────────
    // El orden importa y ya se pagó una vez: si la fuente entra antes que el jugador, el circuito
    // drena en el primer tick, el pistón se abre solo y luego el jugador aparece DENTRO de la cabeza
    // ya extendida — que es otro caso (el de `chocabaAntes`) y no el que se quiere medir. Primero el
    // pistón apagado, encima el jugador, y la fuente al final.
    const XV = X + 8;
    beginBatch();
    pon(XV, Y - 1, ZP, 'hab:piston@' + rotArriba);   // sustituye la losa del suelo
    endBatch();
    R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    ticks(30);
    mc.pos[0] = XV + 0.5; mc.pos[1] = Y; mc.pos[2] = ZP + 0.5;
    if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frame(); await frame();
    const antesC = mc.pos.slice();
    out.C0 = { cabeza: claveEn(XV, Y, ZP), atrapado: mcCollides(antesC[0], antesC[1], antesC[2]) };
    beginBatch();
    pon(XV, Y - 1, ZP + 1, FUENTE);
    endBatch();
    R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    ticks(30);
    out.C = { antes: antesC, trasAccionar: mc.pos.slice(), cabeza: claveEn(XV, Y, ZP) };
    for (let t = 0; t < 20; t++) await frame();
    out.C.reposo = mc.pos.slice();

    // ── D · el mismo pistón horizontal, pero con un AGENTE ARTICULADO delante (BUG-AG1) ──────────
    // El pistón vertical de C se queda plantado y con corriente; se apaga quitándole la fuente, que
    // si no la cabeza sigue fuera y el suelo del tramo D no es el que era.
    beginBatch();
    pon(XV, Y - 1, ZP + 1, 0); pon(XV, Y - 1, ZP, LOSA); pon(XV, Y, ZP, 0);
    endBatch();
    R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    ticks(30);
    recoger();
    // El jugador, a la otra punta: asentar() no deja a un agente meterse dentro de él (solapaJugador),
    // así que dejarlo ahí sería atarle un pie al bicho que se quiere ver empujado.
    // …y en la punta CONTRARIA a la que va a andar. Puesto al final de su paseo, el agente acababa
    // dándose con él, y un encontronazo con el jugador levanta al bicho por su cuenta: la cota se
    // disparaba a 17.765 con el mismo float aunque el pistón no le hubiera tocado, que fue la pista
    // de que ese pico no era del pistón.
    mc.pos[0] = X + 0.5; mc.pos[1] = Y; mc.pos[2] = Z + 4.5;
    if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frame();

    game.esqueletos.quitar();
    const rig = await game.esqueletos.crear('zombie', X + 4, Y, ZP);
    for (let t = 0; t < 200 && !rig.partes.every(P => P.s); t++) await esperar(50);
    if (!rig.partes.every(P => P.s)) { out.errs.push('el agente no acabó de estamparse'); return out; }
    // ── el bicho, VIVO ─────────────────────────────────────────────────────────────────────────
    // Este tramo llegó a ponerle `velocidad = 0`, «para que su propio desplazamiento no contaminara
    // la medida». Eso apaga el paso por frame del rig, y con él `asentar()` — que es exactamente la
    // función que trepa. Así el tramo salía verde mientras el dueño seguía viendo al agente subirse
    // encima del pistón en el Mundo de verdad: un verde falso de manual. Por eso ahora anda.
    //
    // Anda CRUZANDO por delante del pistón, no contra él: mandarle andar CONTRA el pistón le haría
    // trepar su cuerpo como quien sube un escalón, que es lo correcto y no el fallo que se busca.
    // Cruzando, lo único que puede levantarle es la cabeza al salir. Por eso el pistón de este tramo
    // mira a +Z, perpendicular al paseo, y no a +X como el de A y B.
    let rotZ = -1;
    for (let rr = 0; rr < 24 && rotZ < 0; rr++) {
      const f = frenteDe(rr);
      if (f[0] === 0 && f[1] === 0 && f[2] === 1) rotZ = rr;
    }
    if (rotZ < 0) { out.errs.push('ningún rot de 0..23 mira a +Z'); return out; }
    for (let t = 0; t < 25; t++) await frame();

    const sr = rig.partes[0].s;
    const donde = () => {
      const g = sr._sig, a = rig.cuerpo;
      return [(a[0] + a[3]) * 0.5 + g.x, a[1] + g.y + (rig.mov ? rig.mov.alto : 0), (a[2] + a[5]) * 0.5 + g.z];
    };
    // La celda del bicho se MIDE, no se supone: `crear(doc,x,y,z)` planta la raíz, y el cuerpo de un
    // agente articulado no está centrado en ella. Suponiéndolo, el pistón se montaba a dos celdas de
    // él y el tramo salía verde por no tocar a nadie.
    const p0 = donde();
    const CY = Math.floor(p0[1] + 1e-4), CZ = Math.floor(p0[2]);
    const CX = Math.floor(p0[0]) + 3;      // tres celdas más allá: le pilla ya andando, no arrancando
    out.D = { hayApi: typeof game.esqueletos.enCaja === 'function' && typeof game.esqueletos.desplazar === 'function' };
    out.D.celda = [CX, CY, CZ];
    out.D.rotZ = rotZ;
    const enCelda = () => game.esqueletos.enCaja(CX, CY, CZ, CX + 1, CY + 1, CZ + 1).length;

    // El driver de andar es el de test_agente_pisa_placa.js: a un punto, sin buscar por clave y sin
    // correa. El objetivo queda MÁS ALLÁ del pistón para que no frene justo al llegar a su celda.
    rig.G.objetivo = [CX + 4.5, CY, CZ + 0.5];
    rig.G.porClave = false;
    rig.G.deteccion = 0;
    rig.G.distancia = 0.3;
    rig.G.correa = 0;
    rig.G.velocidad = 3;

    let llego = false;
    for (let t = 0; t < 600 && !llego; t++) {
      await frame();
      const p = donde();
      llego = Math.floor(p[0]) === CX && Math.floor(p[2]) === CZ;
    }
    if (!llego) { out.errs.push('el agente no llegó andando a la celda del pistón: ' + JSON.stringify(donde())); return out; }

    out.D.antes = donde();
    out.D.enCeldaAntes = out.D.hayApi ? enCelda() : -1;
    beginBatch();
    pon(CX, CY, CZ - 2, FUENTE);
    pon(CX, CY, CZ - 1, 'hab:piston@' + rotZ);   // la cabeza sale a (CX, CY, CZ), donde está él
    endBatch();
    R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    ticks(30);
    out.D.cabeza = claveEn(CX, CY, CZ);
    out.D.trasAccionar = donde();
    out.D.enCeldaDespues = out.D.hayApi ? enCelda() : -1;

    // Ya empujado, se le manda seguir por la línea NUEVA, la del lado al que le echó el pistón. Sin
    // esto seguía apuntando a su línea de antes — que pasa por la celda de la cabeza, porque es la
    // celda en la que estaba —, así que volvía sobre sus pasos y se subía al bloque como quien sube
    // un escalón: pico y=17.765 con `alto=0.88`, o sea un BRINCO suyo, no una aupada del pistón. Ese
    // pico salía idéntico hasta con el pistón sin tocarle, que es lo que lo delató.
    rig.G.objetivo = [CX + 4.5, CY, CZ + 1.5];

    // El PICO, no solo el final: trepar y volver a bajar sigue siendo trepar, y con el bicho andando
    // el reposo puede devolverle a la cota buena por su propio pie.
    out.D.pico = out.D.trasAccionar[1];
    out.D.picoEn = { frame: -1, p: out.D.trasAccionar, gy: sr._sig.y, cuerpoY: rig.cuerpo[1], alto: rig.mov ? rig.mov.alto : 0 };
    for (let t = 0; t < 40; t++) {
      await frame();
      const p = donde();
      if (p[1] > out.D.pico) {
        out.D.pico = p[1];
        // De dónde sale la subida, que la cota es una suma de tres cosas: la raíz, la caja del cuerpo
        // y lo que esté levantado del suelo. Sin desglosarla, un pico es un número sin culpable.
        out.D.picoEn = { frame: t, p: p, gy: sr._sig.y, cuerpoY: rig.cuerpo[1], alto: rig.mov ? rig.mov.alto : 0 };
      }
    }
    out.D.reposo = donde();
    game.esqueletos.quitar();
    beginBatch();
    pon(CX, CY, CZ - 2, 0); pon(CX, CY, CZ - 1, 0); pon(CX, CY, CZ, 0);
    endBatch();

    // ── limpieza: cada celda a su id y el jugador a su sitio ─────────────────────────────────────
    beginBatch();
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    endBatch();
    R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    ticks(30);
    mc.pos[0] = posPrevia[0]; mc.pos[1] = posPrevia[1]; mc.pos[2] = posPrevia[2];
    if (velPrevia && mc.vel) { mc.vel[0] = velPrevia[0]; mc.vel[1] = velPrevia[1]; mc.vel[2] = velPrevia[2]; }
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  if (r.faltan && r.faltan.length) console.log('FALTAN materiales: ' + r.faltan.join(', '));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.A || !r.B || !r.C) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }

  const X = r.caja[0], Y = r.caja[1];
  console.log('\nbanco de pruebas: ' + JSON.stringify(r.caja)
    + '  jugador a escala ' + r.escala
    + '  ·  rot 0 mira a ' + JSON.stringify(r.frenteRot0) + ', rot ' + r.rotArriba + ' mira a +Y');

  console.log('\nel escenario es de verdad (si no, lo de abajo no probaría nada)');
  ok(String(r.frenteRot0) === '1,0,0', 'rot 0 sigue mirando a +X, como dice plantar_piston.js');
  ok(r.A.atrapadoAntes === false, 'el jugador arranca LIBRE en la celda de delante del pistón');
  ok(r.A.cabeza === 'hab:piston-cabeza', 'el pistón se abre de verdad y la cabeza le cae encima', r.A.cabeza);

  console.log('\nA · el pistón EMPUJA, no aúpa (BUG-RS9)');
  console.log('    antes=' + JSON.stringify(r.A.antes.map(r3))
    + '  al accionar=' + JSON.stringify(r.A.trasAccionar.map(r3))
    + '  en reposo=' + JSON.stringify(r.A.reposo.map(r3)));
  ok(Math.abs(r.A.reposo[1] - r.A.antes[1]) < 1e-6,
    'NO se ha subido encima: sigue a la misma cota', 'y=' + r3(r.A.reposo[1]) + ' (antes ' + r3(r.A.antes[1]) + ')');
  ok(r.A.trasAccionar[0] - r.A.antes[0] > 0.25,
    'se ha movido hacia donde empuja el pistón, y en el mismo acto de abrirse',
    'Δx=' + r3(r.A.trasAccionar[0] - r.A.antes[0]));
  ok(r.A.reposo[0] >= X + 4, 'ha salido de la celda que ocupa la cabeza', 'x=' + r3(r.A.reposo[0]) + ' (cabeza en x=' + (X + 3) + ')');
  ok(Math.abs(r.A.reposo[2] - r.A.antes[2]) < 1e-6, 'sin desviarse de lado', 'z=' + r3(r.A.reposo[2]));
  ok(r.A.atrapadoDespues === false, 'y acaba libre, no embutido en nada');

  console.log('\nB · y solo empuja a quien estorba');
  console.log('    antes=' + JSON.stringify(r.B.antes.map(r3)) + '  después=' + JSON.stringify(r.B.trasAccionar.map(r3)));
  ok(r.B.cabeza === 'hab:piston-cabeza', 'el pistón se vuelve a abrir', r.B.cabeza);
  ok(r.B.antes.every((v, i) => Math.abs(v - r.B.trasAccionar[i]) < 1e-9),
    'al jugador que está lejos no se le mueve ni un float');

  console.log('\nC · hacia ARRIBA sí sube: eso no es el bug, es un pistón');
  console.log('    antes=' + JSON.stringify(r.C.antes.map(r3)) + '  en reposo=' + JSON.stringify(r.C.reposo.map(r3)));
  ok(!r.C0.cabeza && r.C0.atrapado === false, 'el jugador se sube al pistón CERRADO y libre (si no, mide otra cosa)',
    'cabeza=' + (r.C0.cabeza || 'ninguna') + ' atrapado=' + r.C0.atrapado);
  ok(r.C.cabeza === 'hab:piston-cabeza', 'la cabeza sale hacia arriba, a la celda de sus pies', r.C.cabeza);
  ok(r.C.reposo[1] - r.C.antes[1] >= 0.9, 'y le levanta una celda', 'Δy=' + r3(r.C.reposo[1] - r.C.antes[1]));
  ok(Math.abs(r.C.reposo[0] - r.C.antes[0]) < 1e-6 && Math.abs(r.C.reposo[2] - r.C.antes[2]) < 1e-6,
    'sin moverle en horizontal');

  console.log('\nD · y a un agente articulado igual: se le aparta, no se le aúpa (BUG-AG1)');
  console.log('    antes=' + JSON.stringify(r.D.antes.map(r3))
    + '  al accionar=' + JSON.stringify(r.D.trasAccionar.map(r3))
    + '  en reposo=' + JSON.stringify(r.D.reposo.map(r3)));
  ok(r.D.hayApi === true, 'la librería de esqueletos ofrece enCaja() y desplazar()');
  ok(r.D.enCeldaAntes === 1, 'el agente arranca DENTRO de la celda por la que va a salir la cabeza',
    'agentes en la celda=' + r.D.enCeldaAntes);
  ok(r.D.cabeza === 'hab:piston-cabeza', 'el pistón se abre sobre él', r.D.cabeza);
  ok(r.D.pico - r.D.antes[1] < 0.25,
    'NO se ha subido encima: sus pies no suben ni un instante',
    'pico=' + r3(r.D.pico) + '  reposo=' + r3(r.D.reposo[1]) + '  (antes ' + r3(r.D.antes[1]) + ')'
    + '  ' + JSON.stringify(r.D.picoEn));
  ok(r.D.trasAccionar[2] - r.D.antes[2] > 0.25,
    'se ha movido hacia donde empuja el pistón, y en el mismo acto de abrirse',
    'Δz=' + r3(r.D.trasAccionar[2] - r.D.antes[2]));
  ok(r.D.enCeldaDespues === 0, 'y ha salido del todo de la celda de la cabeza',
    'agentes en la celda=' + r.D.enCeldaDespues);

  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();