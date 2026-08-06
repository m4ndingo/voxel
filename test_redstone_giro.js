// BUG-RS2 · DIAGNÓSTICO — «los repetidores girados no funcionan».
//
// El ticket pide cuatro circuitos palanca→cable→repetidor→cable→lámpara con el repetidor en @0..@3.
// Aquí se monta ESO y además la tabla de verdad completa, que cuesta lo mismo y dice más: para cada
// giro, POR DÓNDE ESCUCHA (se le pone una palanca encendida en cada uno de los 6 lados, de uno en
// uno, y se mira si se enciende) y HACIA DÓNDE EMITE (con la pieza encendida, un cable en cada lado).
//
// Eso separa las tres hipótesis del ticket en una pasada:
//   · «giro mal mapeado»  → escucha por un lado que no es el de atrás del dibujo;
//   · «vuelco»            → la orientación real no está en los bits 0-1;
//   · «dirección de emisión» → escucha bien pero reparte por los cinco lados en vez de solo al frente.
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE (redstone/*.js), como el resto de la
// suite. No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
const { chromium } = require('playwright');
const fs = require('fs');

const motor = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

const NOMBRE = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const FRENTE = [0, 4, 1, 5];   // la tabla del snippet, replicada aquí para poder contrastarla
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
    const FRENTE = [0, 4, 1, 5];                       // lo que dice el snippet: rot → cara delantera
    const NOM = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };

    // ── hueco de aire donde montar, con el mismo barrido que el resto de la suite ─────────────
    let caja = null;
    const AN = 20, AL = 6, PR = 20;
    for (let y = Math.min(40, mc.dim.y - AL - 2); y > 4 && !caja; y--)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = -1; i <= AN && libre; i++) for (let j = -1; j <= AL && libre; j++)
            for (let k = -1; k <= PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el circuito'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    // ── materiales: los cuatro giros del repetidor, apagado y encendido ──────────────────────
    const CLAVES = ['hab:cable', 'hab:cable-on', 'hab:palanca', 'hab:palanca-on'];
    for (const rot of [0, 1, 2, 3]) for (const k of ['hab:repetidor', 'hab:repetidor-on'])
      CLAVES.push(rot ? k + '@' + rot : k);
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !mc.name2id[k]);

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const limpia = (cx, cy, cz) => {                      // el repetidor y sus seis vecinas
      pon(cx, cy, cz, null);
      for (const d of DIRS) pon(cx + d[0], cy + d[1], cz + d[2], null);
      R.revisarCaja(cx - 2, cy - 2, cz - 2, cx + 2, cy + 2, cz + 2);
      ticks(4);
    };

    // ── A · tabla de verdad: por dónde ESCUCHA cada giro ─────────────────────────────────────
    // Una palanca encendida en un solo lado; si el repetidor pasa a '-on', escucha por ahí.
    const C = [X + 10, Y + 2, Z + 10];
    out.escucha = {};
    for (const rot of [0, 1, 2, 3]) {
      const clave = rot ? 'hab:repetidor@' + rot : 'hab:repetidor';
      const lados = [];
      for (let d = 0; d < 6; d++) {
        limpia(C[0], C[1], C[2]);
        pon(C[0], C[1], C[2], clave);
        const n = [C[0] + DIRS[d][0], C[1] + DIRS[d][1], C[2] + DIRS[d][2]];
        pon(n[0], n[1], n[2], 'hab:palanca-on');
        R.revisarCaja(C[0] - 2, C[1] - 2, C[2] - 2, C[0] + 2, C[1] + 2, C[2] + 2);
        ticks(10);
        if (base(claveEn(C[0], C[1], C[2])) === 'hab:repetidor-on') lados.push(d);
      }
      out.escucha[rot] = lados;
    }

    // ── B · hacia dónde EMITE cada giro ──────────────────────────────────────────────────────
    // Se alimenta por el lado que de verdad escucha (A) y se pone cable en los otros cinco.
    out.emite = {};
    for (const rot of [0, 1, 2, 3]) {
      const clave = rot ? 'hab:repetidor@' + rot : 'hab:repetidor';
      const entra = out.escucha[rot][0];
      if (entra === undefined) { out.emite[rot] = null; continue; }   // no se enciende por ningún lado
      limpia(C[0], C[1], C[2]);
      pon(C[0], C[1], C[2], clave);
      const src = [C[0] + DIRS[entra][0], C[1] + DIRS[entra][1], C[2] + DIRS[entra][2]];
      pon(src[0], src[1], src[2], 'hab:palanca-on');
      for (let d = 0; d < 6; d++) if (d !== entra)
        pon(C[0] + DIRS[d][0], C[1] + DIRS[d][1], C[2] + DIRS[d][2], 'hab:cable');
      R.revisarCaja(C[0] - 2, C[1] - 2, C[2] - 2, C[0] + 2, C[1] + 2, C[2] + 2);
      ticks(12);
      const salidas = [];
      for (let d = 0; d < 6; d++) if (d !== entra) {
        const n = [C[0] + DIRS[d][0], C[1] + DIRS[d][1], C[2] + DIRS[d][2]];
        if ((R._potencia.get(n.join(',')) || 0) > 0) salidas.push(d);
      }
      out.emite[rot] = { entra: entra, salidas: salidas };
    }

    // ── C · el circuito del ticket: palanca → cable → repetidor → cable → lámpara ────────────
    // Se tiende a lo largo del eje al que el DIBUJO apunta según FRENTE, que es lo que el dueño ve.
    limpia(C[0], C[1], C[2]);
    out.circuito = {};
    for (const rot of [0, 1, 2, 3]) {
      const fr = DIRS[FRENTE[rot]];                       // hacia donde mira el dibujo
      const O = [X + 10, Y + 4, Z + 10];                  // el mismo sitio; se desmonta entre giros
      const cel = k => [O[0] + fr[0] * k, O[1] + fr[1] * k, O[2] + fr[2] * k];
      // palanca(0) → cable(1) → REPETIDOR(2) → cable(3) → cable(4)
      const [p0, c1, rp, c3, c4] = [0, 1, 2, 3, 4].map(cel);
      pon(p0[0], p0[1], p0[2], 'hab:palanca');
      pon(c1[0], c1[1], c1[2], 'hab:cable');
      pon(rp[0], rp[1], rp[2], rot ? 'hab:repetidor@' + rot : 'hab:repetidor');
      pon(c3[0], c3[1], c3[2], 'hab:cable');
      pon(c4[0], c4[1], c4[2], 'hab:cable');
      R.revisarCaja(O[0] - 6, O[1] - 2, O[2] - 6, O[0] + 6, O[1] + 2, O[2] + 6);
      ticks(6);
      const apagado = (R._potencia.get(c4.join(',')) || 0);
      // se enciende la palanca
      mcSetBlock(p0[0], p0[1], p0[2], mc.name2id['hab:palanca-on']);
      R.revisarCaja(O[0] - 6, O[1] - 2, O[2] - 6, O[0] + 6, O[1] + 2, O[2] + 6);
      ticks(14);
      out.circuito[rot] = {
        frente: NOM[FRENTE[rot]],
        entrada: (R._potencia.get(c1.join(',')) || 0),    // lo que le llega al repetidor
        repe: base(mc.blockKey[mc.grid[mcIdx(rp[0], rp[1], rp[2])]] || ''),
        salida: (R._potencia.get(c3.join(',')) || 0),     // el cable de después
        lejos: (R._potencia.get(c4.join(',')) || 0),
        antes: apagado,
        info: (() => { try { const i = R.info(rp[0], rp[1], rp[2]); return { mira: i.mira, llega: i.llega, salida: i.salida }; } catch (e) { return String(e); } })(),
      };
      // se desmonta antes del siguiente giro: los cuatro comparten sitio a propósito, para que
      // ninguno herede el cable del anterior.
      for (const c of [p0, c1, rp, c3, c4]) pon(c[0], c[1], c[2], null);
      R.revisarCaja(O[0] - 6, O[1] - 2, O[2] - 6, O[0] + 6, O[1] + 2, O[2] + 6);
      ticks(6);
    }

    // ── D · la fila del dueño, tal cual está en /map/test (64..68, 15, 63) ───────────────────
    // Cinco repetidores hombro con hombro, alimentados TODOS por un cable en −Z, con los giros
    // @1 @2 @3 @0 @1. Solo el @1 da la espalda a −Z: los otros tres tienen que quedarse apagados,
    // y `info().pista` tiene que decir por qué en vez de dejarlo a adivinar.
    out.fila = [];
    {
      const O = [X + 4, Y + 2, Z + 4];
      const ROT = [1, 2, 3, 0, 1];
      for (let i = 0; i < 5; i++) {
        pon(O[0] + i, O[1], O[2], ROT[i] ? 'hab:repetidor@' + ROT[i] : 'hab:repetidor');
        pon(O[0] + i, O[1], O[2] - 1, 'hab:palanca-on');       // la fuente, siempre por −Z
      }
      R.revisarCaja(O[0] - 2, O[1] - 2, O[2] - 3, O[0] + 7, O[1] + 2, O[2] + 3);
      ticks(14);
      for (let i = 0; i < 5; i++) {
        const inf = R.info(O[0] + i, O[1], O[2]);
        out.fila.push({ rot: ROT[i], on: base(claveEn(O[0] + i, O[1], O[2])) === 'hab:repetidor-on',
                        escuchaPor: inf.escuchaPor, emitePor: inf.emitePor, pista: inf.pista });
      }
      for (let i = 0; i < 5; i++) { pon(O[0] + i, O[1], O[2], null); pon(O[0] + i, O[1], O[2] - 1, null); }
    }

    // ── deshacer ─────────────────────────────────────────────────────────────────────────────
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    out.avisos = (window.__avisos || []).slice(0, 12);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja) + (r.faltan && r.faltan.length ? '   FALTAN: ' + r.faltan.join(', ') : ''));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' | '));

  console.log('\nA · por dónde ESCUCHA cada giro (esperado: solo su espalda)');
  for (const rot of [0, 1, 2, 3]) {
    const esp = FRENTE[rot] ^ 1;
    const l = r.escucha[rot] || [];
    ok('@' + rot + ' escucha solo por ' + NOMBRE[esp],
      l.length === 1 && l[0] === esp, 'escucha por ' + (l.map(d => NOMBRE[d]).join(',') || 'NINGÚN lado'));
  }

  console.log('\nB · hacia dónde EMITE cada giro (esperado: solo su frente)');
  for (const rot of [0, 1, 2, 3]) {
    const e = r.emite[rot];
    if (!e) { ok('@' + rot + ' emite', false, 'no se enciende por ningún lado, no hay nada que medir'); continue; }
    ok('@' + rot + ' emite solo por ' + NOMBRE[FRENTE[rot]],
      e.salidas.length === 1 && e.salidas[0] === FRENTE[rot],
      'entra por ' + NOMBRE[e.entra] + ', sale por ' + (e.salidas.map(d => NOMBRE[d]).join(',') || 'NINGUNO'));
  }

  console.log('\nC · el circuito del ticket: palanca → cable → repetidor → cable → cable');
  for (const rot of [0, 1, 2, 3]) {
    const c = r.circuito[rot];
    ok('@' + rot + ' (mira a ' + c.frente + ') propaga al otro lado',
      c.lejos > 0, 'llega=' + c.entrada + ' repe=' + c.repe + ' sale=' + c.salida + ' lejos=' + c.lejos
      + ' · info ' + JSON.stringify(c.info));
  }

  console.log('\nD · la fila del dueño: 5 repetidores alimentados todos por −Z, giros @1 @2 @3 @0 @1');
  const ESPERADO = [true, false, false, false, true];   // solo el @1 da la espalda a −Z
  r.fila.forEach((f, i) => {
    ok('@' + f.rot + ' ' + (ESPERADO[i] ? 'enciende' : 'se queda apagado (y es lo correcto)'),
      f.on === ESPERADO[i], 'escucha por ' + f.escuchaPor + ', emite por ' + f.emitePor);
  });
  r.fila.forEach((f, i) => {
    if (ESPERADO[i]) return;
    ok('…y @' + f.rot + ' explica por qué en info().pista', !!f.pista, f.pista || 'sin pista: el dueño se queda igual que estaba');
  });

  if (r.avisos && r.avisos.length) console.log('\navisos:\n  ' + r.avisos.join('\n  '));
  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\ntodo ok');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
