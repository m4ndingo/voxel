// @area: mundo
// @necesita: servidor, playwright
// REQ-SNP-LIB3 · La FASE GRUESA de `sondas-mundo` / `particulas-voxel`: lo que cae por el aire
// pregunta UNA vez por el tramo del frame, no una vez por trozo.
//
// Lo que guarda este test, que es donde está el riesgo:
//
//   · el COSTE. Trocear el paso cuesta una sonda al mundo por trozo, y cada sonda recorre
//     `mc.structures` ENTERO (no hay índice espacial). Lo caro es la VELOCIDAD, no la cantidad:
//     la lluvia va a ~40 bloques/s y topaba en los 24 trozos siempre — 61 gotas, 1 371 sondas por
//     frame, 11 ms de CPU antes de dibujar nada, y ahí se iban los fps. La nieve, con 420 copos
//     pero 7 veces más lenta, iba a 1 trozo y no se notaba. Por eso se mide POR PARTÍCULA VOLANDO
//     y no en total: el número que se disparaba era ese.
//   · y que la fase gruesa NO se come un choque. Es una optimización con una asimetría: decir
//     «aquí puede haber algo» de más solo cuesta volver al camino lento, pero un «aquí no hay
//     nada» de más es atravesar la pared. Así que se comprueba que ninguna partícula acaba DENTRO
//     de la materia, que la nieve sigue cuajando y que la lluvia sigue sin cuajar.
//
// ⚠️ Se mide con `dt` FIJO llamando a `_siembra`/`_paso` a mano, NUNCA con el reloj ni con fps:
// este navegador va a ~1,4 fps por software y `dt` va acotado, así que un segundo de reloj es una
// fracción de segundo simulado (docs/particulas-y-efectos.md, «Cómo se mide esto y cómo NO»).
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
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = { errs: [], estructuras: mc.structures.length };

    // ── la sonda gruesa existe y contesta lo mismo que la fina ────────────────────────────────
    const S = await game.snippet('sondas-mundo');
    out.hayCajaVacia = typeof S.cajaVacia === 'function';
    if (!out.hayCajaVacia) return out;

    // Suelo bajo los pies del jugador: el sitio donde comparar las dos respuestas.
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    out.suelo = sy;
    // Nunca puede decir «vacío» donde `solido` dice que hay materia: eso sería atravesar la pared.
    let mentiras = 0, cajas = 0;
    for (let i = 0; i < 400; i++) {
      const x = bx + (Math.random() * 8 - 4), z = bz + (Math.random() * 8 - 4),
            y = sy + (Math.random() * 6 - 2), m = 0.2;
      if (S.cajaVacia(x - m, y - m, z - m, x + m, y + m, z + m)) {
        cajas++;
        for (let k = 0; k < 6; k++) {
          const px = x + (Math.random() * 2 - 1) * m, py = y + (Math.random() * 2 - 1) * m,
                pz = z + (Math.random() * 2 - 1) * m;
          if (S.solido(px, py, pz)) mentiras++;
        }
      }
    }
    out.cajasVacias = cajas; out.mentiras = mentiras;

    // ── el ÍNDICE GRUESO de estructuras no puede tapar materia ────────────────────────────────
    // Es la misma asimetría que `cajaVacia`, un piso más abajo: el índice solo dice «ni preguntes».
    // Si alguna vez dijera que no hay estructura donde sí la hay, lo estampado dejaría de existir
    // para todo lo que caiga. Se compara la MISMA sonda con índice y sin él, punto por punto.
    //
    // ⚠️ Hace falta estampar una pieza MACIZA a propósito: las 80 estructuras que trae `/map/test`
    // son hojas, y las hojas se atraviesan ⇒ su bitset de colisión está VACÍO. Comparando solo
    // contra ellas, las dos sondas contestan «no» siempre y el test pasa sin comprobar nada.
    const T = S.MC_T, caja = mcFineBoxHit._orig || mcFineBoxHit;
    const px = Math.floor(mc.pos[0]) + 6, pz = Math.floor(mc.pos[2]) + 6;
    let py = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(px, y, pz)]) { py = y + 1; break; }
    await game.stamp('asset:assets/observador.vox.json', px, py, pz, 0);
    await new Promise(s => setTimeout(s, 500));
    const pieza = mc.structures.find(s => s.ox === px && s.oy === py && s.oz === pz);
    const geo = pieza ? mcStructColl(pieza) : null;
    out.piezaMaciza = !!(geo && geo.bits && Array.prototype.some.call(geo.bits, v => v));

    out.cajasIndice = S.refrescaEstructuras();
    let discrepa = 0, tocados = 0;
    for (const s of mc.structures) {
      const g = mcStructColl(s); if (!g) continue;
      const d = g.fdim, E = (s.esc === undefined) ? 1 : s.esc;
      for (let i = 0; i < 40; i++) {
        // dentro de su caja de verdad (y un poco fuera, para pillar también los bordes)
        const x = s.ox + (Math.random() * 1.4 - 0.2) * d[0] * E / T,
              y = s.oy + (Math.random() * 1.4 - 0.2) * d[1] * E / T,
              z = s.oz + (Math.random() * 1.4 - 0.2) * d[2] * E / T;
        const fx = Math.floor(x * T), fy = Math.floor(y * T), fz = Math.floor(z * T);
        const conIndice = S.solidoEstructura(x, y, z), sinIndice = !!caja(fx, fy, fz, fx, fy, fz);
        if (sinIndice) tocados++;
        if (conIndice !== sinIndice) discrepa++;
      }
    }
    out.indiceDiscrepa = discrepa; out.indiceTocados = tocados;
    if (pieza) { mc.structures.splice(mc.structures.indexOf(pieza), 1); S.refrescaEstructuras(); }

    // ── la geometría nueva de la capa es LA MISMA, vértice a vértice ──────────────────────────
    // `mcPushVoxCuboBuf` escribe en un Float32Array por índice en vez de hacer `push`; si se
    // desviara un solo flotante, la capa se dibujaría distinto y aquí no se vería a simple vista.
    let difGeom = 0;
    for (let t = 0; t < 60; t++) {
      const x = Math.random() * 20 - 10, y = Math.random() * 20 - 10, z = Math.random() * 20 - 10,
            s = 0.1 + Math.random(), r = Math.random(), g = Math.random(), bl = Math.random(),
            caras = (t % 2) ? ((Math.random() * 64) | 0) : null;
      const viejo = []; mcPushVoxCubo(viejo, x, y, z, s, r, g, bl, caras);
      const buf = new Float32Array(6 * 6 * 7);
      const n = mcPushVoxCuboBuf(buf, 0, x, y, z, s, r, g, bl, caras);
      if (n !== viejo.length) { difGeom++; continue; }
      // el búfer es Float32 y el array viejo es double: se compara con la misma precisión
      for (let i = 0; i < n; i++) if (buf[i] !== Math.fround(viejo[i])) { difGeom++; break; }
    }
    out.difGeom = difGeom;

    // ── coste y comportamiento de los dos efectos de ambiente ─────────────────────────────────
    const C = { caja: 0 };
    const origCaja = mcFineBoxHit._orig || mcFineBoxHit;
    mcFineBoxHit._orig = function (...a) { C.caja++; return origCaja.apply(this, a); };
    try {
      await game.snippet('efectos-demo');
      const sis = {};
      for (const s of (await game.snippet('particulas-voxel')).sistemas) sis[s.grupo] = s;

      const mide = (nombre, ps, segundos) => {
        const s = sis[nombre];
        s.limpia(); s.enciende(ps);
        const dt = 1 / 30; let t = performance.now() / 1000;
        for (let i = 0; i < Math.round(segundos * 30); i++) { t += dt; s._siembra(dt, t); s._paso(dt, t); }
        C.caja = 0;
        const N = 60;
        for (let i = 0; i < N; i++) { t += dt; s._siembra(dt, t); s._paso(dt, t); }
        const inf = s.info();
        // ¿alguna se ha colado DENTRO de la materia? Es la pregunta buena, y no «¿está por debajo
        // del suelo?»: con un techo, un puente o un árbol encima, media escena está bajo el voxel
        // más alto de su columna sin que nada haya atravesado nada.
        // ⚠️ Se separan VOLANDO de POSADA, y no es para maquillar el número. Atravesar la materia es
        // un fallo de VUELO: una que se cuela sigue cayendo, así que aparece volando. Una POSADA no
        // pudo entrar volando —solo se posa en sitio libre—, es que su celda se volvió sólida DESPUÉS
        // (el agua sube, o la celda es sólida pero la FORMA no, que es justo la diferencia que existe
        // `sondas-mundo`). Medido: 3 coladas en 3 360 copos, las 3 posadas, las 3 en rejilla, las 3 a
        // y≈22,9, y CERO volando. Exigir 0 posadas haría el guardián intermitente por algo que no es.
        let coladas = 0, coladasVolando = 0;
        for (const g of s._V) if (S.solido(g.x, g.y, g.z)){ coladas++; if(!g.posada) coladasVolando++; }
        const res = { vivas: inf.vivas, volando: inf.volando, posadas: inf.posadas, coladas, coladasVolando,
          sondasPorParticula: +(C.caja / N / Math.max(1, inf.volando)).toFixed(2) };
        s.para(); s.limpia();
        return res;
      };
      out.lluvia = mide('lluvia', 150, 3);
      out.nieve = mide('nieve', 55, 6);

      // ¿Deja de nevar? Antes sí: al llenarse el cupo la siembra se ponía a 0 y, como lo posado dura
      // `dura` segundos y ocupa sitio, el efecto nevaba 8 s y se quedaba 21 SEGUNDOS sin un copo en
      // el aire, en ciclo. Se mira lo PEOR de cada segundo, no el promedio: un promedio bonito tapa
      // exactamente el agujero que se busca. Contar por `V.length` mentiría (entra una, sale otra:
      // delta 0), así que se cuentan las partículas que no se habían visto antes.
      {
        const s = sis['nieve'];
        s.limpia(); s.enciende(55);
        const dt = 1 / 30; let t = performance.now() / 1000;
        const vistas = new WeakSet();
        let peorVolando = Infinity, peorSiembra = Infinity;
        for (let seg = 0; seg < 40; seg++) {
          let sembradas = 0;
          for (let i = 0; i < 30; i++) {
            t += dt; s._siembra(dt, t);
            for (const g of s._V) if (!vistas.has(g)) { vistas.add(g); sembradas++; }
            s._paso(dt, t);
          }
          if (seg < 2) continue;                       // los 2 primeros segundos son el llenado
          peorSiembra = Math.min(peorSiembra, sembradas);
          peorVolando = Math.min(peorVolando, s.info().volando);
        }
        out.ciclo = { peorVolando, peorSiembra, vivas: s.info().vivas };
        s.para(); s.limpia();
      }

      // ¿SE VE lo cuajado? Reciclar dejó al suelo ~225 plazas de las 420, y 225 motas de 1/16 de
      // bloque sobre 26×26 no se ven: el dueño lo leyó como «la nieve atraviesa el suelo». Lo posado
      // va a su propio grupo con el cubo engordado, que tapa grosor² veces más SIN un voxel de más
      // —y eso es lo que se comprueba: que la capa no ha engordado en VOXELES, que es lo que cuesta
      // (1,28 µs cada uno, lineal). Pagar la alfombra con voxeles serían 1,76 ms/frame.
      {
        const s = sis['nieve'];
        s.limpia(); s.enciende(55);
        const dt = 1 / 30; let t = performance.now() / 1000;
        for (let i = 0; i < 30 * 15; i++) { t += dt; s._siembra(dt, t); s._paso(dt, t); }
        s._pinta();
        const inf = s.info(), U = game.voxelesUI;
        const fino = mc.voxUI.get('nieve'), gordo = mc.voxUI.get('nieve:posada');
        let voxCapa = 0; for (const m of mc.voxUI.values()) voxCapa += m.size;
        out.alfombra = {
          posadas: inf.posadas, vivas: inf.vivas, voxCapa,
          grosor: U.grosor('nieve:posada'), grosorFino: U.grosor('nieve'),
          enGordo: gordo ? gordo.size : 0, enFino: fino ? fino.size : 0,
          tapa: (gordo ? gordo.size : 0) * Math.pow(U.grosor('nieve:posada'), 2)
        };
        s.para(); s.limpia();
        out.alfombraLimpia = (mc.voxUI.get('nieve:posada') || { size: 0 }).size;
      }
    } finally {
      mcFineBoxHit._orig = origCaja;
    }
    return out;
  });

  console.log('mundo: ' + r.estructuras + ' estructuras · suelo en y=' + r.suelo);
  ok('`sondas-mundo` publica cajaVacia()', r.hayCajaVacia);
  ok('la caja vacía NUNCA tapa materia que `solido()` sí ve', r.mentiras === 0,
     r.cajasVacias + ' cajas dadas por vacías, ' + r.mentiras + ' con materia dentro');
  ok('el índice grueso de estructuras se construye', r.cajasIndice > 0, r.cajasIndice + ' cajas');
  ok('hay una pieza MACIZA con la que comparar', r.piezaMaciza === true,
     'sin ella las hojas de /map/test no colisionan y el test no comprobaría nada');
  ok('el índice contesta LO MISMO que preguntar a mcFineBoxHit', r.indiceDiscrepa === 0,
     r.indiceTocados + ' puntos dentro de estructura, ' + r.indiceDiscrepa + ' discrepancias');
  ok('mcPushVoxCuboBuf da la MISMA geometría que mcPushVoxCubo', r.difGeom === 0,
     r.difGeom + ' cubos distintos de 60');

  if (r.lluvia) {
    console.log('lluvia: ' + JSON.stringify(r.lluvia));
    console.log('nieve:  ' + JSON.stringify(r.nieve));
    // Sin fase gruesa la lluvia medía 22,5 sondas por gota (el tope de troceo); con ella, ~3,5.
    ok('la lluvia no trocea el vuelo por el aire', r.lluvia.sondasPorParticula < 8,
       r.lluvia.sondasPorParticula + ' sondas por gota volando (antes 22,5)');
    ok('la nieve sigue barata', r.nieve.sondasPorParticula < 8, r.nieve.sondasPorParticula + ' por copo');
    ok("ninguna gota ATRAVIESA la materia", r.lluvia.coladasVolando === 0,
      r.lluvia.coladasVolando + " volando dentro (" + r.lluvia.coladas + " en total)");
    ok("ningún copo ATRAVIESA la materia", r.nieve.coladasVolando === 0,
      r.nieve.coladasVolando + " volando dentro (" + r.nieve.coladas + " en total)");
    ok("y lo posado dentro es anecdótico", r.nieve.coladas <= Math.ceil(r.nieve.vivas * 0.01),
      r.nieve.coladas + " de " + r.nieve.vivas + " (tope: 1 %)");
    ok('la nieve CUAJA', r.nieve.posadas > 50, r.nieve.posadas + ' posadas');
    ok('la lluvia NO cuaja', r.lluvia.posadas === 0, r.lluvia.posadas + ' posadas');
    ok('la lluvia no se desborda', r.lluvia.vivas > 5 && r.lluvia.vivas <= 500, r.lluvia.vivas + ' vivas');
    ok('la nieve NO PARA de sembrar ni un segundo (40 s seguidos)', r.ciclo.peorSiembra > 40,
      'el peor segundo sembró ' + r.ciclo.peorSiembra + ' copos (antes: 0 durante 21 s)');
    ok('la nieve NO SE QUEDA sin copos en el aire', r.ciclo.peorVolando > 50,
      'el peor segundo tuvo ' + r.ciclo.peorVolando + ' volando');
    ok('lo CUAJADO se pinta en su propio grupo, engordado', r.alfombra.grosor === 3 && r.alfombra.grosorFino === 1,
      'posada grosor ' + r.alfombra.grosor + ' · cayendo grosor ' + r.alfombra.grosorFino);
    ok("en ese grupo está TODO lo posado y solo eso", r.alfombra.enGordo <= r.alfombra.posadas
      && r.alfombra.enFino === r.alfombra.vivas - r.alfombra.posadas,
      r.alfombra.enGordo + ' gordos / ' + r.alfombra.posadas + ' posadas · ' + r.alfombra.enFino + ' finos');
    ok('la alfombra NO cuesta un voxel de más', r.alfombra.voxCapa <= r.alfombra.vivas,
      r.alfombra.voxCapa + ' voxeles en la capa para ' + r.alfombra.vivas + ' partículas');
    ok('…y aun así tapa mucho más que antes', r.alfombra.tapa > 420,
      'tapa ' + r.alfombra.tapa + ' celdas finas (antes: 420 como mucho, y solo con la nieve parada)');
    ok('limpia() se lleva también lo cuajado', r.alfombraLimpia === 0, r.alfombraLimpia + ' voxeles huérfanos');
  } else {
    ok('los efectos de ambiente arrancan', false);
  }
  ok('sin errores de página', errores.length === 0, errores.join(' | '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
