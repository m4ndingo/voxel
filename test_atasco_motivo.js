// REQ-DBG2 · «cuando aparece el toast "Atascado - ..." deberia de aparecer el motivo […] ocurre que un
// agente al avanzar con sus brazos extendidos te atasca (es como un abrazo)», y luego: «si es una parte
// de un agente quiero saber el agente y su parte».
//
// Lo que se comprueba, en el Mundo de verdad y con el snippet de autoarranque corriendo:
//
//   A · el diagnostico NO se inventa nada: dice lo mismo que la fisica (mcCollides) en los dos sentidos.
//   B · terreno: nombra el material y la celda concreta.
//   C · una pieza de agente dice LA PIEZA Y EL AGENTE — que es el requisito literal del dueño.
//   D · el abrazo: dos piezas del mismo bicho salen las dos, no una.
//   E · el nombre bonito lo pone el snippet: sin el gancho, el motor cae a la clave cruda (y no revienta).
//   F · el toast lo dice, y game.atasco('ultimo') lo sigue sabiendo cuando el toast ya se fue.
//
// No persiste nada: bloquea los POST, restaura los bloques que toca y retira el agente que crea.
//
//   node test_atasco_motivo.js [url]        por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.agentes', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  console.log('\n--- ' + URL + ' ---');

  // El gancho tiene que estar puesto por el SNIPPET, no por app.js: si esto falla, todo lo demas de
  // agentes es un falso verde disfrazado (el motor caeria a la clave cruda y seguiria «funcionando»).
  const enganchado = await p.evaluate(() => typeof mcStuckExtra === 'function');
  ok(enganchado, 'el snippet engancha mcStuckExtra (el nombre bonito no lo pone app.js)');

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;

    // Un claro con sitio de sobra para plantar un bicho entero.
    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 10) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 16 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 16 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 8 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 8 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde hacer las pruebas'); return out; }
    const [X, Y, Z] = sitio;

    const ponerPos = (x, y, z) => { mc.pos[0] = x; mc.pos[1] = y; mc.pos[2] = z; };
    const mira = () => mcStuckWhy(mc.pos[0], mc.pos[1], mc.pos[2]);
    const choca = () => mcCollides(mc.pos[0], mc.pos[1], mc.pos[2]);

    // ── al aire, en el claro ──────────────────────────────────────────────────────────────────────
    ponerPos(X + 0.5, Y + 2, Z + 0.5);
    const libre = mira();
    out.libre = { atascado: libre.atascado, motivo: libre.motivo, choca: choca(),
                  n: libre.terreno.length + libre.piezas.length + libre.npcs.length };

    // ── terreno ───────────────────────────────────────────────────────────────────────────────────
    // El material NO se elige por nombre: 'stone' es un alias de scripting, no una clave de
    // mc.blockKey, y la paleta se reconstruye en cada arranque (los ids no son estables). Se planta
    // el id que haya y se exige que el motivo diga LA CLAVE DE ESE ID — que es lo que se comprueba.
    const idPiedra = mc.blockKey.findIndex((k, i) => i > 0 && k && k.indexOf('roca') >= 0);
    const cx = X, cy = Y + 2, cz = Z;
    const antes = mc.grid[mcIdx(cx, cy, cz)];
    const puesto = idPiedra > 0 ? idPiedra : 1;
    mc.grid[mcIdx(cx, cy, cz)] = puesto;
    ponerPos(cx + 0.5, cy, cz + 0.5);
    const t = mira();
    out.terreno = { atascado: t.atascado, motivo: t.motivo, choca: choca(), clave: mc.blockKey[puesto],
                    celdas: t.terreno.map(c => c.clave + '@' + c.x + ',' + c.y + ',' + c.z),
                    piezas: t.piezas.length, npcs: t.npcs.length };
    mc.grid[mcIdx(cx, cy, cz)] = antes;          // se devuelve el mundo como estaba
    out.terrenoDeshecho = mira().atascado === false;

    // ── una pieza de agente ───────────────────────────────────────────────────────────────────────
    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie" guardado'); return out; }
    const rig = await game.esqueletos.crear(def, X + 2, Y, Z + 2);
    if (!rig) { out.errs.push('no se pudo crear el agente'); return out; }
    out.agente = rig.nombre;
    out.agenteId = rig.id;
    out.nPartes = rig.partes.length;

    // Dentro del bicho. ⚠️ NO vale sondear en el aabb de la pieza: esa caja es la del ANCLA donde se
    // la estampo, y el rig la DIBUJA en otro sitio con s.model (CLAUDE.md, «la solidez son tres
    // envoltorios»). Hay que pasar el centro del ancla por la matriz para saber donde esta de verdad
    // — justo lo que el envoltorio de mcFineBoxHit hace al reves, con la traspuesta.
    const enElMundo = (s) => {
      const a = s.aabb, m = s.model;
      const c = [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2];
      if (!m || m.length !== 16) return c;                       // aun sin posar: esta en su ancla
      return [m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12],
              m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13],
              m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14]];
    };
    // Las matrices las compone el paso del rig, no crear(): sin esperar, las piezas siguen en el ancla
    // y el test mediria el mundo equivocado.
    for (let i = 0; i < 40 && !rig.partes.some(P => P.s && P.s.model); i++)
      await new Promise(r => setTimeout(r, 50));
    out.conMatriz = rig.partes.filter(P => P.s && P.s.model).length;

    let dentro = null;
    for (const P of rig.partes) {
      if (!P.s || !P.s.aabb) continue;
      const c = enElMundo(P.s);
      // mc.pos es la base de la caja del jugador (los pies), asi que hay que bajar para que el centro
      // de la pieza le caiga dentro del cuerpo, no por encima de la cabeza.
      for (const dy of [0, -0.2, -0.6, -1.0, -1.4]) {
        ponerPos(c[0], c[1] + dy, c[2]);
        const m = mira();
        if (m.piezas.length) { dentro = m; break; }
      }
      if (dentro) break;
    }
    if (!dentro) { out.errs.push('no consigo meter al jugador dentro de ninguna pieza del agente'); }
    else {
      out.pieza = { motivo: dentro.motivo, choca: choca(), n: dentro.piezas.length,
                    etiquetas: dentro.piezas.map(q => q.etiqueta || '(sin etiqueta) ' + q.key),
                    claves: dentro.piezas.map(q => q.key),
                    // La identidad como CAMPO, no dentro de la frase: `agenteId` tiene que valer tal
                    // cual para game.esqueletos.empujar(id), sin sacarlo del texto con una regex.
                    duenos: dentro.piezas.map(q => q.agente),
                    ids: dentro.piezas.map(q => q.agenteId) };
      // El abrazo: con el jugador dentro del bicho suele haber MAS de una pieza encima. Se guarda el
      // recuento tal cual, sin exigir dos: lo que se exige es que salgan TODAS las que hay.
      out.pieza.terreno = dentro.terreno.length;

      // ── EL ROCE, que es el caso del ticket ────────────────────────────────────────────────────
      // El bicho no te empotra: te ABRAZA, y el solape acaba siendo de un par de voxels finos. Ahi es
      // donde el aviso salia mudo (una rejilla de muestreo se salta la esquirla). Se sale de la pieza
      // de 1/32 en 1/32 y se mira la ULTIMA posicion en la que la fisica todavia dice que chocas: el
      // diagnostico tiene que nombrar a alguien exactamente hasta el mismo sitio donde ella lo dice.
      const guardarPos = [mc.pos[0], mc.pos[1], mc.pos[2]];
      let ultimo = null, mudos = 0, roces = 0;
      for (let d = 0; d < 4; d += 1 / 32) {
        ponerPos(guardarPos[0] + d, guardarPos[1], guardarPos[2]);
        if (!choca()) break;
        roces++;
        const m = mira();
        ultimo = { d: +d.toFixed(3), motivo: m.motivo, piezas: m.piezas.length,
                   terreno: m.terreno.length, npcs: m.npcs.length, atascado: m.atascado };
        // Mudo = la fisica dice que chocas y el diagnostico no sabe decir con que.
        if (!m.piezas.length && !m.terreno.length && !m.npcs.length) mudos++;
      }
      out.roce = { pasos: roces, mudos: mudos, ultimo: ultimo };
      ponerPos(guardarPos[0], guardarPos[1], guardarPos[2]);

      // Sin gancho, el motor tiene que seguir contestando: la clave cruda en vez del nombre bonito.
      const guardado = window.mcStuckExtra;
      window.mcStuckExtra = null;
      const crudo = mira();
      window.mcStuckExtra = guardado;
      out.sinGancho = { motivo: crudo.motivo, etiquetas: crudo.piezas.map(q => q.etiqueta),
                        // app.js no se inventa duenos: sin snippet no hay ni agente ni id.
                        duenos: crudo.piezas.map(q => q.agente === undefined && q.agenteId === undefined) };

      // Un gancho que revienta no puede tumbar el aviso: se desengancha y sigue.
      window.mcStuckExtra = () => { throw new Error('gancho roto a proposito'); };
      const roto = mira();
      out.ganchoRoto = { motivo: roto.motivo, sigueEnganchado: typeof mcStuckExtra === 'function' };
      window.mcStuckExtra = guardado;

      // ── el toast y la consulta posterior ───────────────────────────────────────────────────────
      mc._atascado = false;                      // rearmar el flanco: mcStuckShow solo habla al cambiar
      mcStuckShow(true);
      out.toast = document.querySelector('#toast').textContent;
      mcStuckShow(false);
      out.ultimo = game.atasco('ultimo');
      out.ultimoMotivo = out.ultimo && out.ultimo.motivo;
      out.ultimoCuando = !!(out.ultimo && out.ultimo.cuando);
    }

    game.esqueletos.quitar(rig);
    ponerPos(X + 0.5, Y + 2, Z + 0.5);
    out.limpio = mira().atascado === false;
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok(false, 'preparacion: ' + e));

  console.log('\n── A · el diagnostico dice lo mismo que la fisica ──');
  ok(r.libre && r.libre.atascado === false && r.libre.choca === false,
    'al aire libre: ni atascado ni colision', JSON.stringify(r.libre));
  ok(r.terreno && r.terreno.atascado === true && r.terreno.choca === true,
    'metido en un bloque: atascado Y colision', r.terreno && r.terreno.motivo);
  ok(r.pieza && r.pieza.choca === true, 'dentro de una pieza: la fisica tambien dice que choca');
  ok(r.terrenoDeshecho === true, 'quitando el bloque se deja de estar atascado (no se queda pegado)');

  console.log('\n── B · terreno: que material y donde ──');
  ok(r.terreno && r.terreno.celdas.length > 0, 'nombra la celda que estorba', r.terreno && r.terreno.celdas.join(' · '));
  ok(!!(r.terreno && r.terreno.clave && r.terreno.motivo.indexOf(r.terreno.clave) >= 0
        && /\d+,\d+,\d+/.test(r.terreno.motivo)),
    'el motivo lleva el material Y sus coordenadas', r.terreno && r.terreno.motivo);
  ok(r.terreno && r.terreno.piezas === 0 && r.terreno.npcs === 0,
    'y no culpa a nadie mas (ni piezas ni NPCs)');

  console.log('\n── C · una pieza de agente: LA PIEZA Y EL AGENTE ──');
  ok(!!(r.pieza && r.pieza.etiquetas.length), 'sale al menos una pieza', r.pieza && r.pieza.etiquetas.join(' | '));
  ok(!!(r.pieza && r.pieza.etiquetas.every(e => e.indexOf(' de ') > 0 && e.indexOf('(sin etiqueta)') < 0)),
    'cada una dice «pieza» de agente', r.pieza && r.pieza.etiquetas.join(' | '));
  ok(!!(r.pieza && r.agente && r.pieza.etiquetas.every(e => e.indexOf(r.agente) > 0)),
    'el agente que nombra es el que lo esta atascando', r.agente);
  ok(!!(r.pieza && r.pieza.motivo.indexOf(' de ') > 0),
    'y eso es lo que va al motivo del toast', r.pieza && r.pieza.motivo);
  // El dueño pregunto por el campo `agentes` de game.atasco() (que era otra cosa: los NPC-cubo) y
  // ahi salio esto: la identidad estaba SOLO dentro de la frase. Ahora va tambien como campo.
  ok(!!(r.pieza && r.agente && r.pieza.duenos.length && r.pieza.duenos.every(d => d === r.agente)),
    'cada pieza trae `agente` como campo, no solo dentro del texto', r.pieza && r.pieza.duenos.join(' | '));
  ok(!!(r.pieza && r.agenteId && r.pieza.ids.length && r.pieza.ids.every(i => i === r.agenteId)),
    'y `agenteId` es el id de la INSTANCIA, listo para game.esqueletos.empujar(id)',
    r.pieza && r.pieza.ids.join(' | '));

  // «personaje 1» no identifica a nadie si hay tres personaje 1 en el mapa: hace falta la INSTANCIA.
  // Y el id no es decorativo — game.esqueletos.empujar(id) / .quitar(id) / .aturdir(id) lo aceptan,
  // asi que del aviso se puede pasar a quitarselo de encima sin buscar nada.
  ok(!!(r.agenteId && r.pieza && r.pieza.etiquetas.every(e => e.indexOf('(#' + r.agenteId + ')') > 0)),
    'nombra la INSTANCIA del agente (#id), no solo su tipo',
    r.pieza && r.pieza.etiquetas.join(' | '));

  console.log('\n── D · el abrazo: salen todas las que agarran ──');
  ok(!!(r.pieza && r.pieza.n >= 1), 'se recogen todas las piezas que solapan, no solo la primera',
    r.pieza && (r.pieza.n + ' pieza(s)' + (r.pieza.n > 1 ? ' → el motivo lleva «+N mas»' : '')));
  ok(!!(r.pieza && (r.pieza.n === 1 || /\+\d+ más/.test(r.pieza.motivo))),
    'con mas de una, el motivo lo dice sin escupir la lista entera', r.pieza && r.pieza.motivo);

  // Lo que fallaba de verdad: el bicho no te empotra, te roza. Si el diagnostico solo sabe hablar
  // cuando estas en el centro de la pieza, en el mundo real sale mudo — que es lo que reporto el dueño.
  ok(!!(r.roce && r.roce.pasos > 0), 'hay roce que medir (se sale de la pieza sin dejar de chocar)',
    r.roce && (r.roce.pasos + ' posiciones chocando'));
  ok(!!(r.roce && r.roce.mudos === 0),
    'NUNCA se choca sin saber con que (ni en el ultimo voxel de solape)',
    r.roce && (r.roce.mudos + ' posicion(es) muda(s) de ' + r.roce.pasos));
  ok(!!(r.roce && r.roce.ultimo && r.roce.ultimo.atascado === true && r.roce.ultimo.motivo),
    'en el ULTIMO contacto el motivo sigue diciendo algo',
    r.roce && r.roce.ultimo && (r.roce.ultimo.motivo + '  (a ' + r.roce.ultimo.d + ' de distancia)'));

  console.log('\n── E · el nombre bonito lo pone el snippet ──');
  ok(!!(r.sinGancho && r.sinGancho.etiquetas.every(e => !e)),
    'sin gancho no hay etiqueta (o sea: no la inventa app.js)');
  ok(!!(r.sinGancho && r.sinGancho.duenos.length && r.sinGancho.duenos.every(Boolean)),
    'ni `agente` ni `agenteId`: sin snippet el motor no sabe de quien es una pieza');
  ok(!!(r.sinGancho && r.sinGancho.motivo && /asset:|hab:/.test(r.sinGancho.motivo)),
    'pero el motivo sigue existiendo, con la clave cruda', r.sinGancho && r.sinGancho.motivo);
  ok(!!(r.ganchoRoto && r.ganchoRoto.motivo && r.ganchoRoto.sigueEnganchado === false),
    'un gancho que revienta se desengancha y el aviso sigue saliendo', r.ganchoRoto && r.ganchoRoto.motivo);

  console.log('\n── F · el toast y la consulta de despues ──');
  ok(!!(r.toast && r.toast.indexOf('Atascado por ') === 0), 'el toast empieza por «Atascado por …»', r.toast);
  ok(!!(r.toast && r.toast.indexOf(' de ') > 0 && /pulsa U/.test(r.toast)),
    'lleva el culpable Y sigue diciendo como salir', r.toast);
  ok(!!(r.ultimoMotivo && r.ultimoCuando),
    'game.atasco("ultimo") lo recuerda con su hora cuando el toast ya se fue', r.ultimoMotivo);

  console.log('\n── limpieza ──');
  ok(r.limpio === true, 'retirado el agente, ya no hay atasco');
  ok(errores.length === 0, 'sin excepciones en la pagina', errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
