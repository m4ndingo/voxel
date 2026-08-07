// REQ-RS3 · planta un PISTÓN que funciona en /map/test y comprueba que empuja.
//   node redstone/plantar_piston.js            (con el servidor levantado en :8500)
//   node redstone/plantar_piston.js --mapa otro
//
// Va aparte de montar_ejemplos.js porque aquél llena una rejilla de 3×3 parcelas en /map/redstone y
// aquí solo hace falta una banqueta de pruebas donde el dueño pueda darle a la palanca. Se cuelga al
// final de la fila de carteles que ya hay en /map/test (z=45, x=36..60), continuándola.
//
// No basta con construirlo: un pistón mal orientado se ve igual y no mueve nada. Así que después de
// montarlo esto acciona la palanca, mira que el bloque HAYA CAMBIADO DE CELDA, la vuelve a apagar y
// deja el circuito en su posición de partida. Lo que se guarda es lo que ha pasado la prueba.
//
// Ojo: aquí NO se bloquean los POST — el objetivo es justamente dejar el mapa guardado.
const { chromium } = require('playwright');

const BASE = process.env.VOXEL_URL || 'http://localhost:8500';
const iM = process.argv.indexOf('--mapa');
const MAPA = iM > 0 ? process.argv[iM + 1] : 'test';

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  p.on('console', m => { if (/\[redstone\]|\[pistón\]/.test(m.text())) console.log('    · ' + m.text()); });

  console.log('Abriendo ' + BASE + '/map/' + MAPA);
  await p.goto(BASE + '/map/' + MAPA, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  // El motor entra por el autoarranque, que a propósito no se espera al abrir el mundo.
  await p.waitForFunction('window.game && game.redstone', null, { timeout: 60000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [], pasos: [] };
    const R = game.redstone;
    const SUELO = 14, Y = SUELO + 1;                 // el mundo plano de serie termina en hierba a y=14
    // A la derecha de todo lo que ya hay en /map/test. Se mira antes de limpiar: la fila de carteles
    // llega hasta x=60 y hay algo del dueño en x=65-66 (z=47..51), así que la banqueta empieza en 70.
    const X = 70, Z = 45;
    const ANCHO = 12, FONDO = 5;
    const LOSA = 'asset:assets/adoquin.vox.json';
    const EMPUJADO = 'asset:assets/ladrillo_piedra.vox.json';   // se distingue de la losa de un vistazo

    const CLAVES = [LOSA, EMPUJADO, 'hab:cable', 'hab:cable-on', 'hab:palanca', 'hab:palanca-on',
                    'hab:piston', 'hab:piston-on', 'hab:piston-cabeza'];
    const cargado = k => mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0;
    for (const k of CLAVES) if (!cargado(k)) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !cargado(k));
    if (out.faltan.length) return out;

    const clave = (x, y, z) => mc.blockKey[mc.grid[mcIdx(x, y, z)]] || null;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const pon = (px, pz, k, dy) => setVoxel(X + px, Y + (dy || 0), Z + pz, k || 0);
    const leo = (px, pz, dy) => base(clave(X + px, Y + (dy || 0), Z + pz));

    // Limpiar ANTES de construir es lo que lo hace re-ejecutable: si el circuito cambia de forma, los
    // restos del anterior no se quedan ahí cortocircuitando el nuevo. Pero se mira QUÉ se está
    // borrando: esto corre sobre el mapa de verdad del dueño y una parcela mal colocada se lleva por
    // delante lo que hubiera ahí sin que nadie se entere. Si aparece algo que no es mío, se aborta.
    const MIO = { 'hab:cable': 1, 'hab:cable-on': 1, 'hab:palanca': 1, 'hab:palanca-on': 1,
                  'hab:piston': 1, 'hab:piston-on': 1, 'hab:piston-cabeza': 1 };
    MIO[LOSA] = 1; MIO[EMPUJADO] = 1;
    const ajeno = [];
    for (let dy = 0; dy < 5; dy++)
      for (let px = 0; px < ANCHO; px++)
        for (let pz = 0; pz < FONDO; pz++) {
          const k = base(clave(X + px, Y + dy, Z + pz));
          if (k && !MIO[k]) ajeno.push([X + px, Y + dy, Z + pz, k]);
        }
    if (ajeno.length) {
      out.errs.push('la parcela no está libre: ' + ajeno.length + ' celda(s) que no son mías, p.ej. '
        + ajeno.slice(0, 3).map(a => a.slice(0, 3).join(',') + '=' + a[3]).join(' · '));
      return out;
    }

    beginBatch();
    for (let dy = 0; dy < 5; dy++)
      for (let px = 0; px < ANCHO; px++)
        for (let pz = 0; pz < FONDO; pz++) setVoxel(X + px, Y + dy, Z + pz, 0);
    for (let px = 0; px < ANCHO; px++)
      for (let pz = 0; pz < FONDO; pz++) setVoxel(X + px, SUELO, Z + pz, LOSA);

    // palanca → cable → cable → PISTÓN(@0, mira a +X) → bloque → hueco → hueco
    // El cable de por medio no es adorno: enseña que el pistón se alimenta como cualquier otra pieza,
    // sin necesidad de tener la fuente pegada.
    const CARRIL = 2;
    pon(1, CARRIL, 'hab:palanca');
    pon(2, CARRIL, 'hab:cable');
    pon(3, CARRIL, 'hab:cable');
    pon(4, CARRIL, 'hab:piston');          // sin '@': rot 0 = mira a +X
    pon(5, CARRIL, EMPUJADO);
    endBatch();

    R.revisarCaja(X - 2, Y - 2, Z - 2, X + ANCHO + 2, Y + 4, Z + FONDO + 2);
    ticks(20);
    out.pasos.push({ paso: 'montado', fila: [1, 2, 3, 4, 5, 6, 7].map(i => leo(i, CARRIL)) });

    // ── la prueba: encender y mirar la REJILLA, no el dibujo ────────────────────────────────────
    R.conmutar(X + 1, Y, Z + CARRIL); ticks(20);
    out.abierto = { cuerpo: leo(4, CARRIL), cabeza: leo(5, CARRIL), empujado: leo(6, CARRIL) };
    R.conmutar(X + 1, Y, Z + CARRIL); ticks(20);
    out.cerrado = { cuerpo: leo(4, CARRIL), cabeza: leo(5, CARRIL), empujado: leo(6, CARRIL) };

    // ── dejarlo en la posición de partida ───────────────────────────────────────────────────────
    // Un pistón normal no recoge lo que empujó, así que después de probarlo el bloque se ha quedado
    // una celda más allá. Se devuelve a su sitio para que el dueño encuentre el circuito como el
    // cartel lo describe, y no ya «usado».
    beginBatch();
    pon(6, CARRIL, null);
    pon(5, CARRIL, EMPUJADO);
    endBatch();
    R.revisarCaja(X - 2, Y - 2, Z - 2, X + ANCHO + 2, Y + 4, Z + FONDO + 2);
    ticks(20);
    out.final = [1, 2, 3, 4, 5, 6].map(i => leo(i, CARRIL));

    // ── el cartel ───────────────────────────────────────────────────────────────────────────────
    // Una nota planta SOLA el cartel del dueño encima de su bloque. Solo se escribe la MÍA: las notas
    // del mundo son la bandeja del dueño y aquí no se toca ninguna que no sea de este poste.
    mc.notes[X + 1 + ',' + SUELO + ',' + Z] =
      'PISTÓN · dale a la palanca (clic derecho, o el botón CENTRAL). El pistón empuja el ladrillo '
      + 'UNA celda hacia donde mira su placa de madera, y al soltar recoge solo su cabeza: no tira de '
      + 'lo que empujó. Si no tiene hueco delante, no se abre. Gíralo con R para cambiar hacia dónde empuja.';
    if (typeof mcDirtyHeader === 'function') mcDirtyHeader();

    if (typeof mcMeshAll === 'function') mcMeshAll();
    out.guardado = game.saveWorld ? await game.saveWorld() : false;
    out.donde = { x: X, y: Y, z: Z + CARRIL };
    return out;
  });

  if (r.faltan && r.faltan.length) console.log('FALTAN materiales: ' + r.faltan.join(', '));
  if (r.errs && r.errs.length) {
    // Se aborta sin tocar nada: es más barato mover la parcela que recuperar lo que hubiera ahí.
    console.log('\nNO SE HA PLANTADO NADA:\n  ' + r.errs.join('\n  '));
    await b.close(); process.exit(1);
  }
  console.log('\nmontado en ' + JSON.stringify(r.donde));
  r.pasos.forEach(s => console.log('  ' + s.paso + ': ' + s.fila.join(' → ')));

  console.log('\nla prueba');
  ok('con la palanca dada, el cuerpo se abre', r.abierto.cuerpo === 'hab:piston-on', r.abierto.cuerpo);
  ok('la cabeza sale a la celda de delante', r.abierto.cabeza === 'hab:piston-cabeza', r.abierto.cabeza);
  ok('EL BLOQUE SE HA MOVIDO una celda', /ladrillo_piedra/.test(String(r.abierto.empujado)), r.abierto.empujado);
  ok('al soltar, el cuerpo se cierra', r.cerrado.cuerpo === 'hab:piston', r.cerrado.cuerpo);
  ok('…y la cabeza se recoge', !r.cerrado.cabeza, String(r.cerrado.cabeza));
  ok('…y NO tira de lo que empujó', /ladrillo_piedra/.test(String(r.cerrado.empujado)), r.cerrado.empujado);

  console.log('\nqueda: ' + r.final.join(' → '));
  ok('guardado', !!r.guardado);
  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK · /map/' + MAPA + ' guardado');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
