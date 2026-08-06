// Redstone — el BLOQUE DE REDSTONE, una fuente que no se apaga.
//
// El dueño: «añade el bloque de redstone, y que no se active con red_concrete los elementos de
// redstone». Son las dos mitades de lo mismo: hasta ahora el único rojo del catálogo era
// 'asset:assets/red_concrete.vox.json', que es DECORACIÓN, y al verlo alimentar un circuito (por el
// cable que tenía pegado, haciendo de puente como cualquier bloque macizo desde r1.2) parecía la
// fuente permanente de Minecraft. No lo era, y no hay que convertirlo en ella.
//
// Lo que se defiende aquí:
//   §1 FUENTE      — el bloque de redstone entrega 15 por sus SEIS caras, sin fuente que lo alimente.
//   §2 SIN ESTADO  — no tiene pareja encendida/apagada: el motor no le cambia el material nunca.
//   §3 REPETIDOR   — detrás del repetidor lo enciende; DEBAJO no. Es la regla de Minecraft (el bloque
//                    de debajo de un repetidor es solo soporte) y es la que el dueño aceptó.
//   §4 EL ROJO QUE NO ES — red_concrete pegado a una lámpara no la enciende. Sigue siendo decoración.
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE: el test tiene que fallar cuando se
// rompa redstone/*.js, no cuando alguien olvide re-publicar el snippet.
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
//
//   node test_redstone_bloque_fuente.js

const { chromium } = require('playwright');
const fs = require('fs');

// Se repiten dentro y fuera del navegador porque el evaluate no comparte ámbito con Node.
const FUENTE = 'asset:assets/bloque_redstone.vox.json';
const ROJO   = 'asset:assets/red_concrete.vox.json';
const LAMPARA = 'hab:diana', LAMPARA_ON = 'hab:rejilla';

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor  = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

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
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // ⚠️ ANTES de inyectar nada: lo que el mundo carga POR SÍ SOLO (mundo-autoarranque →
  // redstone-arranque → motor + piezas). Esto no es un adorno, es la comprobación que faltaba: la
  // primera versión de este test inyectaba redstone.js + redstone-piezas.js y daba por bueno que
  // `red_concrete` no era una fuente… mientras la tabla DEFECTOS de redstone-arranque.js lo declaraba
  // con `{power:15}` en TODOS los mapas. El test pasaba en verde y el mundo daba corriente.
  // O sea: inyectar los fuentes prueba los fuentes, no la configuración con la que se juega.
  const vivo = await p.evaluate(() =>
    (window.game && game.redstone && game.redstone.lista) ? game.redstone.lista().map(c => c.clave) : null);

  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    out.version = R.version;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;

    // Un hueco de AIRE: aquí lo que se mide es quién toca a quién, y montarlo sobre el suelo de
    // verdad dejaría vecinos que no he puesto yo.
    let caja = null;
    const AN = 14, AL = 8, PR = 6;
    for (let y = mc.dim.y - AL - 2; y > 4 && !caja; y--)
      for (let x = 4; x < mc.dim.x - AN - 4 && !caja; x += 2)
        for (let z = 4; z < mc.dim.z - PR - 4; z++) {
          let libre = true;
          for (let dx = -1; dx <= AN && libre; dx++) for (let dy = -1; dy <= AL; dy++)
            for (let dz = -1; dz <= PR; dz++) if (idEn(x + dx, y + dy, z + dz)) { libre = false; break; }
          if (libre) { caja = [x, y, z]; break; }
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el circuito'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const FUENTE = 'asset:assets/bloque_redstone.vox.json';
    const ROJO   = 'asset:assets/red_concrete.vox.json';
    const LAMPARA = 'hab:diana', LAMPARA_ON = 'hab:rejilla';
    const CLAVES = [FUENTE, ROJO, 'hab:cable', 'hab:cable-on', 'hab:repetidor', 'hab:repetidor-on',
                    LAMPARA, LAMPARA_ON];
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !mc.name2id[k]);
    if (out.faltan.length) return out;
    R.define(LAMPARA, { encendida: LAMPARA_ON, precargar: false });

    // Lo que el motor cree del bloque de redstone, dicho por él mismo. Si alguien le pone una pareja
    // encendida/apagada o un `mira`, deja de ser lo que dice el ticket y este test tiene que verlo.
    out.ficha = R.lista().filter(c => c.clave === FUENTE)[0] || null;

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const señal = (x, y, z) => R._potencia.get(x + ',' + y + ',' + z) || 0;
    const base = k => k ? String(k).split('@')[0] : k;
    const limpia = () => {
      tocadas.forEach(t => mcSetBlock(t[0], t[1], t[2], t[3]));
      R._cola.clear(); R._esperando.clear(); R._potencia.clear();
    };

    // ══ §1 · reparte 15 por las SEIS caras, y sin nadie que lo alimente ════════════════════════
    // Es lo contrario del repetidor: no tiene espalda ni frente. Un cable pegado a cualquier cara
    // arranca a 15, que es lo que lo hace útil como cimiento de un circuito.
    pon(X + 1, Y + 1, Z + 1, FUENTE);
    const CARAS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    CARAS.forEach(d => pon(X + 1 + d[0], Y + 1 + d[1], Z + 1 + d[2], 'hab:cable'));
    R.revisarCaja(X, Y, Z, X + 2, Y + 2, Z + 2);
    ticks(6);
    out.seisCaras = CARAS.map(d => señal(X + 1 + d[0], Y + 1 + d[1], Z + 1 + d[2]));

    // ══ §2 · no tiene dos estados: el motor no le toca el material ═════════════════════════════
    // Es la única pieza sin pareja encendida/apagada. Si `aplicar()` intentara conmutarla, el bloque
    // se convertiría en otra cosa a los pocos ticks y el circuito se caería solo.
    ticks(10);
    out.sigueSiendoFuente = claveEn(X + 1, Y + 1, Z + 1);
    limpia();

    // ══ §3 · el repetidor: DETRÁS sí, DEBAJO no ═══════════════════════════════════════════════
    // Sin giro (@0) el frente del repetidor da a +X, o sea su espalda da a −X.
    pon(X, Y, Z, FUENTE);
    pon(X + 1, Y, Z, 'hab:repetidor');            // espalda (−X) contra el bloque
    R.revisar(X + 1, Y, Z); ticks(8);
    out.repetidorDetras = base(claveEn(X + 1, Y, Z));
    limpia();

    // Y el caso de la foto del dueño: el bloque DEBAJO es solo soporte, igual que en Minecraft.
    // Esto no es un fallo que se nos haya colado: es la regla `mira`, que es horizontal, y es la
    // misma que impide que un repetidor se realimente por su propia salida.
    pon(X, Y, Z, FUENTE);
    pon(X, Y + 1, Z, 'hab:repetidor');            // encima del bloque
    R.revisar(X, Y + 1, Z); ticks(8);
    out.repetidorEncima = base(claveEn(X, Y + 1, Z));
    out.repetidorEncimaVe = R.info(X, Y + 1, Z);
    limpia();

    // Una lámpara encima sí, para que se vea que lo de arriba no está muerto: lo que no escucha
    // hacia abajo es el REPETIDOR, no el bloque de redstone.
    pon(X, Y, Z, FUENTE);
    pon(X, Y + 1, Z, LAMPARA);
    R.revisar(X, Y + 1, Z); ticks(4);
    out.lamparaEncima = claveEn(X, Y + 1, Z);
    limpia();

    // ══ §4 · el rojo que NO es fuente ══════════════════════════════════════════════════════════
    // red_concrete sigue siendo decoración: no emite. Que en el mundo del dueño encendiera cosas era
    // el puente de r1.2 (un cable pegado lo energizaba), no el bloque.
    pon(X, Y, Z, ROJO);
    pon(X + 1, Y, Z, LAMPARA);
    pon(X, Y + 1, Z, 'hab:cable');
    R.revisarCaja(X, Y, Z, X + 1, Y + 1, Z);
    ticks(6);
    out.rojoNoEmite = claveEn(X + 1, Y, Z);
    out.rojoCable = señal(X, Y + 1, Z);
    out.rojoDeclarado = R.lista().some(c => c.clave === ROJO);
    limpia();

    // Pero SIGUE haciendo de puente, como cualquier bloque macizo (r1.2): el dueño tiene circuitos
    // montados así en data/mundo.json y no se pueden romper.
    pon(X, Y, Z, 'hab:palanca-on');
    pon(X + 1, Y, Z, ROJO);
    pon(X + 2, Y, Z, LAMPARA);
    if (!mc.name2id['hab:palanca-on']) { try { await game.addMaterial('hab:palanca-on'); } catch (e) {} }
    pon(X, Y, Z, 'hab:palanca-on');
    R.revisarCaja(X, Y, Z, X + 2, Y, Z);
    ticks(6);
    out.rojoSiguePuente = claveEn(X + 2, Y, Z);
    limpia();

    // ── limpieza final ────────────────────────────────────────────────────────────────────────
    let sucias = 0;
    tocadas.forEach(t => { mcSetBlock(t[0], t[1], t[2], t[3]); if (idEn(t[0], t[1], t[2]) !== t[3]) sucias++; });
    mcRemeshAround(X - 2, Z - 2, X + 16, Z + 10);
    out.limpio = sucias === 0;
    return out;
  });

  if (r.errs && r.errs.length) console.log('  · ' + r.errs.join('\n  · '));
  console.log('\n--- Redstone · el bloque de redstone es una fuente permanente ---\n');
  ok('la version es la nueva', r.version === 'r1.2', r.version);
  ok('el bloque de redstone existe en el catalogo', (r.faltan || []).length === 0,
    'faltan: ' + (r.faltan || []).join(' '));
  if ((r.faltan || []).length) { await b.close(); process.exit(1); }

  console.log('\n§1 · fuente permanente por las seis caras');
  ok('esta declarado como fuente de 15', !!r.ficha && r.ficha.emite === 15, JSON.stringify(r.ficha));
  ok('los seis cables pegados arrancan a 15',
    JSON.stringify(r.seisCaras) === '[15,15,15,15,15,15]', JSON.stringify(r.seisCaras));

  console.log('\n§2 · no tiene dos estados');
  ok('no tiene pareja encendida/apagada', !!r.ficha && !r.ficha.encendida, JSON.stringify(r.ficha && r.ficha.encendida));
  ok('ni escucha por un solo lado', !!r.ficha && !r.ficha.mira && !r.ficha.soloAlFrente, JSON.stringify(r.ficha));
  ok('y el motor no le cambia el material', r.sigueSiendoFuente === FUENTE, r.sigueSiendoFuente);

  console.log('\n§3 · el repetidor: detras si, debajo no (la regla de Minecraft)');
  ok('con el bloque DETRAS el repetidor se enciende', r.repetidorDetras === 'hab:repetidor-on', r.repetidorDetras);
  ok('con el bloque DEBAJO sigue apagado (es solo soporte)', r.repetidorEncima === 'hab:repetidor',
    r.repetidorEncima);
  // Que no encienda no basta: tiene que poder EXPLICARSE, o el dueño vuelve a abrir el mismo ticket.
  // info() ya sabe decir «te llega señal por −Y pero tú solo escuchas por −X»; eso es lo que separa
  // «regla de diseño» de «pieza rota».
  ok('info() dice que escucha por su espalda (−X)',
    !!r.repetidorEncimaVe && r.repetidorEncimaVe.escuchaPor === '−X',
    JSON.stringify(r.repetidorEncimaVe && r.repetidorEncimaVe.escuchaPor));
  ok('e info() da la pista de que la senal le llega por −Y y la desperdicia',
    !!r.repetidorEncimaVe && /−Y/.test(r.repetidorEncimaVe.pista || ''),
    JSON.stringify(r.repetidorEncimaVe && r.repetidorEncimaVe.pista));
  ok('una lampara encima del bloque SI se enciende', r.lamparaEncima === LAMPARA_ON, r.lamparaEncima);

  console.log('\n§4 · red_concrete sigue siendo decoracion');
  // Las tres fuentes de verdad, porque una sola miente: el fuente de las piezas, el fuente del
  // arranque (la tabla DEFECTOS, que es la que se coló) y lo que el mundo tiene cargado AHORA.
  const arranque = fs.readFileSync(__dirname + '/redstone/redstone-arranque.js', 'utf8');
  const declaraRojo = /^\s*'asset:assets\/red_concrete\.vox\.json'\s*:/m.test(arranque);
  ok('la tabla DEFECTOS del arranque NO lo declara', declaraRojo === false, 'redstone-arranque.js');
  ok('y el mundo cargado tampoco lo tiene como pieza',
    Array.isArray(vivo) && !vivo.includes(ROJO), JSON.stringify(vivo));
  ok('el bloque de redstone SI esta en el mundo cargado',
    Array.isArray(vivo) && vivo.includes(FUENTE), JSON.stringify(vivo));
  ok('no esta declarado como pieza de redstone', r.rojoDeclarado === false, String(r.rojoDeclarado));
  ok('no enciende una lampara pegada', r.rojoNoEmite === LAMPARA, r.rojoNoEmite);
  ok('ni le da senal a un cable encima', r.rojoCable === 0, String(r.rojoCable));
  ok('pero sigue haciendo de puente si alguien lo energiza (r1.2)',
    r.rojoSiguePuente === LAMPARA_ON, r.rojoSiguePuente);

  console.log('');
  ok('el mundo queda como estaba', r.limpio === true, String(r.limpio));
  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
