// @area: redstone
// @necesita: servidor, playwright
// REQ-RS3 · el PISTÓN — que empuje de verdad, en cada postura, y que sepa cuándo NO puede.
// BUG-RS7 · …incluido APUNTANDO HACIA ARRIBA (y hacia abajo), que era lo que no se podía.
//
// El criterio de aceptación del ticket es «un bloque se ha movido», así que aquí no se mira el
// dibujo ni la señal: se mira la REJILLA antes y después. Cada caso deja el mundo como estaba.
//
// Lo que se comprueba, y por qué cada cosa:
//   A · cada postura empuja hacia SU frente — es lo que se rompió en BUG-RS2 con el repetidor y
//       otra vez en BUG-RS7, donde el pistón puesto mirando al techo empujaba de lado. Se prueban
//       los 4 giros horizontales de siempre MÁS las 8 posturas verticales, que son las nuevas.
//   B · con hueco detrás: el bloque avanza una celda y la cabeza ocupa la que deja libre.
//   C · sin hueco (dos bloques delante, o el borde del mundo): NO se extiende y el cuerpo se queda
//       en 'hab:piston' — un cuerpo abierto sin cabeza se ve roto, y es lo que pasaría si el motor
//       cambiara el material por su cuenta con `encendida`.
//   D · al apagar recoge SU cabeza y NO tira de lo que empujó (es un pistón normal, no pegajoso).
//   E · idempotencia: volver a alimentar un pistón ya extendido no empuja una segunda celda.
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE (redstone/*.js), como el resto de la
// suite: así el test falla si se rompe el motor, no si alguien olvidó republicar el snippet.
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
const { chromium } = require('playwright');
const fs = require('fs');

const motor = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

const NOMBRE = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
// Las posturas que se prueban: los 4 giros horizontales de siempre y las 8 que miran arriba/abajo.
// Las 12 restantes son vuelcos que dejan el frente donde ya estaba: no aportan otra dirección.
const POSTURAS = [0, 1, 2, 3, 16, 17, 18, 19, 20, 21, 22, 23];
let fallos = 0;

const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok   ' : '  FALLA ') + txt + (extra ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
    window.__avisos = [];
    const warn = console.warn.bind(console);
    console.warn = (...a) => { window.__avisos.push(a.join(' ')); warn(...a); };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const NOMBRE = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
    const POSTURAS = [0, 1, 2, 3, 16, 17, 18, 19, 20, 21, 22, 23];
    // Hacia dónde mira cada postura se le pregunta al MOTOR (mcOriPerm), que es de donde lo saca el
    // snippet: calcar aquí la composición solo demostraría que dos copias del mismo error coinciden.
    // Lo que sí se contrasta abajo es que la dirección medida en la REJILLA sea ésta.
    const CARA2DIR = [2, 3, 0, 1, 4, 5];            // índice en MC_FACES → índice en DIRS
    const frenteDe = ori => CARA2DIR[mcOriPerm(ori)[2]];

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };

    // ── hueco de aire donde montar, con el mismo barrido que el resto de la suite ─────────────
    let caja = null;
    const AN = 20, AL = 8, PR = 20;
    const yTop = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 4; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el pistón'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    // ── materiales ────────────────────────────────────────────────────────────────────────────
    // Se precargan A PROPÓSITO: el snippet los carga solo (y reintenta la extensión al llegar), pero
    // eso es asíncrono y aquí se quiere medir el empuje, no la carga. El caso «llega tarde» tiene su
    // propia comprobación al final, mirando que no haya quedado ningún material sin dar de alta.
    const CLAVES = ['hab:cable', 'hab:palanca', 'hab:palanca-on'];
    for (const rot of POSTURAS)
      for (const k of ['hab:piston', 'hab:piston-on', 'hab:piston-cabeza'])
        CLAVES.push(rot ? k + '@' + rot : k);
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !mc.name2id[k]);
    // Un bloque de rejilla cualquiera, para verlo moverse. Se pone por NOMBRE CORTO pero se compara
    // por la clave con la que queda en blockKey ('roca' → 'asset:assets/roca.vox.json'): son dos
    // vocabularios distintos y darlos por iguales hace fallar un test que en realidad va bien.
    const EMPUJADO = 'roca';
    if (!mc.name2id[EMPUJADO]) out.errs.push('no hay «' + EMPUJADO + '» en la paleta');
    out.claveEmpujado = base(mc.blockKey[mc.name2id[EMPUJADO]]);

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const revisa = C => R.revisarCaja(C[0] - 4, C[1] - 3, C[2] - 4, C[0] + 4, C[1] + 3, C[2] + 4);

    // Monta palanca(atrás) → PISTÓN → [lo que diga `delante`], todo alrededor de C, y devuelve las
    // celdas para poder mirarlas. `delante` es la lista de claves a partir de la celda de delante.
    const monta = (C, rot, delante) => {
      const d = DIRS[frenteDe(rot)];
      const cel = k => [C[0] + d[0] * k, C[1] + d[1] * k, C[2] + d[2] * k];
      for (let k = -1; k <= 3; k++) { const c = cel(k); pon(c[0], c[1], c[2], null); }
      pon(C[0], C[1], C[2], rot ? 'hab:piston@' + rot : 'hab:piston');
      delante.forEach((clave, i) => { const c = cel(i + 1); if (clave) pon(c[0], c[1], c[2], clave); });
      const at = cel(-1);
      pon(at[0], at[1], at[2], 'hab:palanca');
      revisa(C); ticks(6);
      return { cel, atras: at };
    };
    const conmuta = (m, C, on) => {
      mcSetBlock(m.atras[0], m.atras[1], m.atras[2], mc.name2id[on ? 'hab:palanca-on' : 'hab:palanca']);
      revisa(C); ticks(12);
    };
    const foto = (m, hasta) => {
      const f = [];
      for (let k = 0; k <= hasta; k++) { const c = m.cel(k); f.push(base(claveEn(c[0], c[1], c[2]))); }
      return f;
    };
    const desmonta = m => { for (let k = -1; k <= 3; k++) { const c = m.cel(k); pon(c[0], c[1], c[2], null); } };

    // ── A y B · los cuatro giros, con un bloque delante y hueco detrás ─────────────────────────
    out.giros = {};
    out.posturas = POSTURAS;
    for (const rot of POSTURAS) {
      const C = [X + 10, Y + 3, Z + 10];
      const m = monta(C, rot, [EMPUJADO, null]);
      const d = DIRS[frenteDe(rot)];
      const antes = foto(m, 2);
      conmuta(m, C, true);
      const abierto = foto(m, 2);
      // …y otra vez, sin soltar: no debe empujar una segunda celda (idempotencia)
      R.revisarCaja(C[0] - 4, C[1] - 3, C[2] - 4, C[0] + 4, C[1] + 3, C[2] + 4);
      ticks(12);
      const otraVez = foto(m, 2);
      conmuta(m, C, false);
      const cerrado = foto(m, 2);
      out.giros[rot] = { frente: NOMBRE[frenteDe(rot)], dir: d, antes, abierto, otraVez, cerrado };
      desmonta(m);
      ticks(4);
    }

    // ── C · sin hueco: dos bloques delante ────────────────────────────────────────────────────
    {
      const C = [X + 10, Y + 3, Z + 10];
      const m = monta(C, 0, [EMPUJADO, EMPUJADO]);
      conmuta(m, C, true);
      out.bloqueado = foto(m, 3);
      conmuta(m, C, false);
      desmonta(m); ticks(4);
    }

    // ── D · sin nada delante: solo sale la cabeza ─────────────────────────────────────────────
    {
      const C = [X + 10, Y + 3, Z + 10];
      const m = monta(C, 0, [null, null]);
      conmuta(m, C, true);
      out.vacio = foto(m, 2);
      conmuta(m, C, false);
      out.vacioCerrado = foto(m, 2);
      desmonta(m); ticks(4);
    }

    // ── E · contra el borde del mundo ─────────────────────────────────────────────────────────
    // El pistón mirando a +X pegado a la última columna: la cabeza no cabe. Tiene que quedarse
    // cerrado en vez de tragarse la escritura fuera de la rejilla.
    {
      const C = [mc.dim.x - 1, Y + 3, Z + 10];
      if (!idEn(C[0], C[1], C[2]) && !idEn(C[0] - 1, C[1], C[2])) {
        pon(C[0], C[1], C[2], 'hab:piston');
        pon(C[0] - 1, C[1], C[2], 'hab:palanca-on');
        revisa(C); ticks(12);
        out.borde = base(claveEn(C[0], C[1], C[2]));
        pon(C[0], C[1], C[2], null); pon(C[0] - 1, C[1], C[2], null);
        ticks(4);
      } else out.borde = null;   // el borde no estaba libre en este mundo; no es un fallo del pistón
    }

    // ── deshacer ──────────────────────────────────────────────────────────────────────────────
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    R.revisarCaja(X - 2, Y - 2, Z - 2, X + AN + 2, Y + AL + 2, Z + PR + 2);
    ticks(8);
    out.avisos = (window.__avisos || []).slice(0, 12);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja)
    + (r.faltan && r.faltan.length ? '  · FALTAN: ' + r.faltan.join(', ') : ''));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  ok(!r.faltan || !r.faltan.length, 'las tres piezas del pistón existen en las ' + POSTURAS.length + ' posturas',
    (r.faltan || []).join(', '));
  const ROCA = r.claveEmpujado;   // la clave real del bloque de prueba, no su nombre corto

  console.log('\nA · cada postura empuja hacia su frente, y la cabeza ocupa el hueco');
  for (const rot of POSTURAS) {
    const g = r.giros[rot];
    ok(g.antes[0] === 'hab:piston' && g.antes[1] === ROCA && !g.antes[2],
      '@' + rot + ' de partida: pistón cerrado, bloque delante, hueco detrás', g.antes.join(' → '));
    ok(g.abierto[0] === 'hab:piston-on', '@' + rot + ' (frente ' + g.frente + ') el cuerpo se abre',
      g.abierto.join(' → '));
    ok(g.abierto[1] === 'hab:piston-cabeza', '@' + rot + ' la cabeza ocupa la celda de delante',
      g.abierto.join(' → '));
    ok(g.abierto[2] === ROCA, '@' + rot + ' EL BLOQUE SE HA MOVIDO una celda hacia ' + g.frente,
      'antes ' + g.antes.join(' → ') + '  ·  después ' + g.abierto.join(' → '));
  }

  // BUG-RS7, dicho sin rodeos. Las comprobaciones de arriba miran la cadena RELATIVA al frente, así
  // que solo demuestran que el pistón y el test están de acuerdo; esto fija cuál es ese frente. Con el
  // cálculo horizontal de antes, las ocho posturas de abajo daban '+X' y el bloque se iba de lado.
  const arriba = POSTURAS.filter(o => r.giros[o].dir[1] === 1);
  const abajo = POSTURAS.filter(o => r.giros[o].dir[1] === -1);
  ok(arriba.length === 4, 'las posturas que miran al techo empujan HACIA ARRIBA',
    arriba.map(o => '@' + o).join(' ') || 'ninguna');
  ok(abajo.length === 4, '…y las que miran al suelo, hacia abajo',
    abajo.map(o => '@' + o).join(' ') || 'ninguna');

  console.log('\nB · volver a alimentarlo estando abierto no empuja otra vez');
  for (const rot of POSTURAS) {
    const g = r.giros[rot];
    ok(g.otraVez.join(' ') === g.abierto.join(' '), '@' + rot + ' segunda pasada: nada se mueve',
      g.otraVez.join(' → '));
  }

  console.log('\nC · al apagar recoge SU cabeza y no tira de lo que empujó (pistón normal)');
  for (const rot of POSTURAS) {
    const g = r.giros[rot];
    ok(g.cerrado[0] === 'hab:piston', '@' + rot + ' el cuerpo vuelve a cerrarse', g.cerrado.join(' → '));
    ok(!g.cerrado[1], '@' + rot + ' la cabeza desaparece', g.cerrado.join(' → '));
    ok(g.cerrado[2] === ROCA, '@' + rot + ' el bloque empujado SE QUEDA donde estaba', g.cerrado.join(' → '));
  }

  console.log('\nD · casos en los que NO se puede extender');
  ok(r.bloqueado[0] === 'hab:piston', 'con dos bloques delante no se abre',
    r.bloqueado.join(' → '));
  ok(r.bloqueado[1] === ROCA && r.bloqueado[2] === ROCA && !r.bloqueado[3],
    '…y no mueve nada de lo que tiene delante', r.bloqueado.join(' → '));
  if (r.borde === null) console.log('  --   el borde del mundo no estaba libre; caso no medido');
  else ok(r.borde === 'hab:piston', 'contra el borde del mundo tampoco se abre', String(r.borde));

  console.log('\nE · sin nada delante sale solo la cabeza');
  ok(r.vacio[0] === 'hab:piston-on' && r.vacio[1] === 'hab:piston-cabeza',
    'se abre y planta la cabeza', r.vacio.join(' → '));
  ok(r.vacioCerrado[0] === 'hab:piston' && !r.vacioCerrado[1],
    'y al apagar la recoge', r.vacioCerrado.join(' → '));

  if (r.avisos && r.avisos.length) console.log('\navisos:\n  ' + r.avisos.join('\n  '));
  ok(errores.length === 0, 'sin errores de página', errores.join(' · '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();