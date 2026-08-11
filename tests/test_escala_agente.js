// @area: agentes
// @necesita: servidor, playwright
// REQ-AGESC1 · «me gustaria para el editor de agentes una propiedad que sea "escala del agente" de forma
// que pueda hacer un agente pequeño o grande en funcion de ese valor, para crear enanos y gigantes».
//
// Un agente articulado NO es una malla: son piezas estampadas por separado y colocadas unas respecto a
// otras. Por eso aqui no basta con mirar que el bicho «se ve mas grande»: la trampa de este cambio es
// escalar la geometria y NO las distancias entre piezas, y entonces el gigante sale DESMONTADO — la
// cabeza flotando y las piernas metidas en el torso — que es justo lo que no se ve en una captura de
// pantalla si no sabes que buscar. Asi que se mide:
//
//   · que la caja del cuerpo crece con la escala (el bulto),
//   · que las piezas siguen PEGADAS entre si (la union de sus cajas es la del cuerpo, sin huecos nuevos),
//   · que el enano encoge,
//   · y que escala 1 deja EXACTAMENTE las mismas medidas que antes del cambio.
//
// No persiste nada: bloquea los POST y retira los agentes que crea.
//
//   node test_escala_agente.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
};
const casi = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
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

  const r = await p.evaluate(async () => {
    const out = { errs: [] };

    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie" guardado'); return out; }
    out.piezas = 1 + (def.piezas ? def.piezas.length : 0);
    if (out.piezas < 3) { out.errs.push('el zombie tiene ' + out.piezas + ' piezas: muy pocas para medir separaciones'); return out; }

    // Un claro con sitio de sobra: un gigante ×2 necesita el doble de hueco.
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 10) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 16 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 16 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde plantar el gigante'); return out; }
    const [X, Y, Z] = sitio;

    const creados = [];
    // Separación de cada pieza al resto: 0 = tocándose o solapando. Se queda la peor. Es la medida
    // del «se desmonta»: si la escala mueve las piezas pero no las agranda, este hueco crece.
    // La comparten el Mundo y el preview a propósito, que es lo único que hace comparables sus números.
    const peorHueco = (cajas) => {
      let hueco = 0;
      for (let i = 0; i < cajas.length; i++) {
        let mejor = Infinity;
        for (let j = 0; j < cajas.length; j++) {
          if (i === j) continue;
          const A = cajas[i], B = cajas[j];
          let dd = 0;
          for (let k = 0; k < 3; k++) {
            const s = Math.max(B[k] - A[k + 3], A[k] - B[k + 3], 0);
            dd += s * s;
          }
          mejor = Math.min(mejor, Math.sqrt(dd));
        }
        if (mejor !== Infinity && mejor > hueco) hueco = mejor;
      }
      return Math.round(hueco * 1000) / 1000;
    };

    // Mide un agente creado con `escala`: la caja del cuerpo y cuánto se separan las piezas.
    const mide = async (esc, dx) => {
      const d = JSON.parse(JSON.stringify(def));
      if (esc !== null) d.escala = esc;
      const rig = await game.esqueletos.crear(d, X + dx, Y, Z);
      if (!rig) return { err: 'no se creó con escala ' + esc };
      creados.push(rig);
      const c = rig.cuerpo;
      // Union de las cajas de las piezas y el hueco MAYOR entre una pieza y el resto del bicho: si el
      // escalado desmonta al agente, ese hueco crece; si lo escala entero, se queda como estaba.
      const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      const cajas = [];
      for (const P of rig.partes) {
        const aa = P.s && P.s.aabb; if (!aa) continue;
        const q = [aa[0] + P.o[0], aa[1] + P.o[1], aa[2] + P.o[2], aa[3] + P.o[0], aa[4] + P.o[1], aa[5] + P.o[2]];
        cajas.push(q);
        for (let k = 0; k < 3; k++) { if (q[k] < u[k]) u[k] = q[k]; if (q[k + 3] > u[k + 3]) u[k + 3] = q[k + 3]; }
      }
      return {
        esc: rig.esc,
        ancho: c[3] - c[0], alto: c[4] - c[1], fondo: c[5] - c[2],
        uAncho: u[3] - u[0], uAlto: u[4] - u[1],
        hueco: peorHueco(cajas),
        nPiezas: cajas.length,
        piv: (rig.partes.find(P => P.piv) || {}).piv || null
      };
    };

    out.base = await mide(null, 0);      // sin `escala` en el documento: el camino de siempre
    out.uno = await mide(1, 0);          // escala 1 explícita
    out.gigante = await mide(2, 4);
    out.enano = await mide(0.5, 8);
    out.raro = await mide(1.5, 0);       // no entera, que es lo que pidió el dueño

    // Guardias: una escala imposible no puede hacer desaparecer al bicho en silencio.
    out.cero = await mide(0, 0);
    out.negativa = await mide(-3, 0);

    // ¿El gigante FRENA donde se le ve? Las piezas de un rig van desplazadas (_sig), así que no las
    // cubre mcFineBoxHit sino el `golpe` del snippet, que re-implementa el bucle por su cuenta. Si esa
    // copia no conoce la escala, el bicho se ve enorme y estorba con el bulto de un zombie normal.
    // Se sondea la MISMA columna del mundo a dos alturas: una que los dos ocupan y otra a la que solo
    // llega la cabeza del gigante.
    // ⚠️ `rig.cuerpo` NO está en coordenadas del mundo: hay que sumarle el `_sig` de la raíz (ahí es
    // donde vive «dónde está el agente»). Sin esto se sondea un sitio vacío y sale todo falso.
    const cajaMundo = (rig) => {
      const a = rig.cuerpo, g = rig.partes[0].s._sig, h = rig.mov ? rig.mov.alto : 0;
      return [a[0] + g.x, a[1] + g.y + h, a[2] + g.z, a[3] + g.x, a[4] + g.y + h, a[5] + g.z];
    };
    // Se pregunta por una LONCHA entera del cuerpo, no por un punto: entre las piernas de un zombie hay
    // aire, y sondear su columna central mediría eso y no la escala.
    const lonchaEnY = (rig, wy) => {
      const c = cajaMundo(rig), f = v => Math.floor(v * MC_TILE);
      return mcFineBoxHit(f(c[0]), f(wy), f(c[2]), f(c[3]), f(wy), f(c[5]));
    };
    // El TRAMO de alturas en el que el agente es sólido de verdad. Ojo: solo la pieza RAÍZ lleva `_sig`,
    // así que lo sólido es el torso, no el bicho entero — y por eso esto se mide barriendo en vez de
    // suponer que la caja del cuerpo está llena. Lo que importa es que ese tramo crezca con la escala.
    // La caja de la pieza RAÍZ donde se la dibuja. Es la única que lleva `_sig`, o sea la única que
    // `golpe` hace sólida, y es la medida más ajustada que hay: `rig.cuerpo` incluye aire (brazos,
    // hueco entre las piernas) y barrerlo entero acaba tocando el decorado del mundo.
    const cajaRaiz = (rig) => {
      const s = rig.partes[0].s, g = s._sig, a = s.aabb;
      return [a[0] + g.x, a[1] + g.y, a[2] + g.z, a[3] + g.x, a[4] + g.y, a[5] + g.z];
    };
    const solidoEnRaiz = (rig, wy) => {
      const c = cajaRaiz(rig), f = v => Math.floor(v * MC_TILE);
      return mcFineBoxHit(f(c[0]), f(wy), f(c[2]), f(c[3]), f(wy), f(c[5]));
    };
    // De UNO EN UNO. Los agentes persiguen al jugador, así que dos a la vez acaban solapándose y cada
    // uno mide al otro dentro de su columna: el clásico artefacto del banco de pruebas.
    // ⚠️ Y hay que dejar correr el bucle. Las piezas de un rig llevan `bits` en CEROS en su ancla (para
    // que no estorben donde no están) y su solidez de verdad la pone `golpe`, que solo entra si
    // `nDesplazados > 0` — contador que recalcula el tick, no `crear()`. Midiendo sin esperar, un
    // agente recién creado parece un fantasma y el test saldría verde por la razón equivocada.
    const soloSolido = async (esc) => {
      const d = JSON.parse(JSON.stringify(def));
      if (esc !== null) d.escala = esc;
      const rig = await game.esqueletos.crear(d, X, Y, Z);
      if (!rig) return null;
      await new Promise(r => setTimeout(r, 800));
      const c = cajaRaiz(rig), alto = c[4] - c[1];
      const t = {
        alto: alto,
        // Sin el divisor de escala, lo sólido del gigante llegaría solo hasta la altura que tenía a
        // tamaño 1: a un 90% de su caja YA no habría nada. Ahí es donde se ve el fallo.
        dentroArriba: solidoEnRaiz(rig, c[1] + alto * 0.9),
        dentroAbajo: solidoEnRaiz(rig, c[1] + alto * 0.1),
        // No se comprueba «y por encima no frena»: por encima del torso está la CABEZA, y hoy las piezas
        // que no son la raíz no son sólidas en absoluto (BUG-AG4). Medir ahí mediría ese otro fallo.
        alto1: c[4] - c[1]
      };
      game.esqueletos.quitar(rig);
      return t;
    };
    out.solN = await soloSolido(null);
    out.solG = await soloSolido(2);

    // El preview del editor va por OTRO camino (preparar/pose, sin estampar nada) y NO lee la escala:
    // el panel es un maniquí y la escala es del juego (BUG-AG6, pedido por el dueño). A ×2 el maniquí
    // salía desmontado. Ya divergen a propósito en otra cosa: aquí la fase de andar la lleva el reloj.
    const previo = async (esc) => {
      const d = JSON.parse(JSON.stringify(def));
      if (esc !== null) d.escala = esc;
      const pl = await game.esqueletos.preparar(d);
      if (!pl) return null;
      // `aa` del preview ya viene en coordenadas de la plantilla (lleva el `en` dentro), así que aquí
      // no hay que sumarle el offset que sí se suma en el Mundo: la caja se mide tal cual.
      const cajas = pl.partes.map(P => P.aa).filter(Boolean);
      return {
        alto: pl.caja[4] - pl.caja[1], ancho: pl.caja[3] - pl.caja[0],
        n: pl.partes.length, hueco: peorHueco(cajas)
      };
    };
    out.pv1 = await previo(null);
    out.pv2 = await previo(2);
    out.pv05 = await previo(0.5);

    for (const rig of creados) game.esqueletos.quitar(rig);
    out.limpio = !mc.structures.some(s => s._rig);
    return out;
  });

  if (r.errs && r.errs.length) { r.errs.forEach(e => ok(false, 'preparación: ' + e)); }
  else {
    const { base, uno, gigante, enano, raro, cero, negativa } = r;
    console.log('\nSin `escala` el agente es EXACTAMENTE el de siempre (' + r.piezas + ' piezas)');
    ok(base.esc === 1, 'rig.esc = 1 por defecto', String(base.esc));
    ok(base.alto > 0.5, 'el zombie mide algo', 'alto ' + base.alto);
    ok(casi(uno.alto, base.alto, 1e-9) && casi(uno.ancho, base.ancho, 1e-9),
      'escala 1 explícita da las mismas medidas', base.alto + ' vs ' + uno.alto);

    console.log('\nEl gigante (×2)');
    ok(gigante.esc === 2, 'rig.esc = 2', String(gigante.esc));
    ok(casi(gigante.alto, base.alto * 2, 0.13), 'el cuerpo mide el doble de alto', base.alto + ' → ' + gigante.alto);
    ok(casi(gigante.ancho, base.ancho * 2, 0.13), 'y el doble de ancho', base.ancho + ' → ' + gigante.ancho);
    ok(gigante.nPiezas === base.nPiezas, 'no se ha perdido ninguna pieza', gigante.nPiezas + '/' + base.nPiezas);
    // LA prueba de que no se ha desmontado: las piezas no se separan más que a tamaño 1.
    ok(gigante.hueco <= base.hueco + 0.02, 'las piezas siguen pegadas (no se desmonta)',
      'hueco ' + base.hueco + ' → ' + gigante.hueco);
    ok(casi(gigante.uAlto, gigante.alto, 1e-6), 'la caja del cuerpo sigue envolviendo a las piezas',
      gigante.uAlto + ' vs ' + gigante.alto);

    console.log('\nEl enano (×0.5)');
    ok(enano.esc === 0.5, 'rig.esc = 0.5', String(enano.esc));
    ok(casi(enano.alto, base.alto * 0.5, 0.13), 'mide la mitad', base.alto + ' → ' + enano.alto);
    ok(enano.hueco <= base.hueco + 0.02, 'y tampoco se desmonta', 'hueco ' + enano.hueco);

    console.log('\nEscala LIBRE, no entera (×1.5) — que es lo que se pidió');
    ok(raro.esc === 1.5, 'rig.esc = 1.5', String(raro.esc));
    ok(casi(raro.alto, base.alto * 1.5, 0.13), 'mide vez y media', base.alto + ' → ' + raro.alto);
    ok(raro.hueco <= base.hueco + 0.02, 'sin desmontarse', 'hueco ' + raro.hueco);

    console.log('\nEl pivote acompaña a la pieza (si no, el brazo gira sobre un hombro que ya no está ahí)');
    ok(base.piv !== null, 'el zombie trae algún pivote', JSON.stringify(base.piv));
    if (base.piv) ok(casi(gigante.piv[1], base.piv[1] * 2, 1e-6), 'el pivote del gigante está ×2',
      base.piv[1] + ' → ' + gigante.piv[1]);

    console.log('\nUna escala imposible no borra al agente en silencio');
    ok(cero.esc === 1, 'escala 0 → se queda en 1', String(cero.esc));
    ok(negativa.esc === 1, 'escala negativa → se queda en 1', String(negativa.esc));

    console.log('\nEl gigante FRENA a su tamaño (las piezas de un rig van desplazadas → `golpe` del snippet)');
    ok(r.solN && r.solG, 'se midieron los dos');
    if (r.solN && r.solG) {
      ok(casi(r.solG.alto, r.solN.alto * 2, 1e-6), 'la pieza raíz del gigante se DIBUJA al doble',
        r.solN.alto.toFixed(4) + ' → ' + r.solG.alto.toFixed(4));
      ok(r.solN.dentroAbajo === true && r.solN.dentroArriba === true, 'el normal frena en toda su pieza raíz');
      // ESTA es la prueba de que `golpe` conoce la escala: sin el divisor, lo sólido del gigante
      // llegaría solo hasta la altura que tenía a tamaño 1 y este 90% saldría vacío.
      ok(r.solG.dentroArriba === true, 'y el gigante frena también ARRIBA del todo de la suya',
        'a 90% de ' + r.solG.alto.toFixed(4));
      ok(r.solG.dentroAbajo === true, 'y abajo');
    }

    console.log('\nEl preview del editor IGNORA la escala (BUG-AG6): el maniquí se ve siempre igual');
    const { pv1, pv2, pv05 } = r;
    ok(pv1 && pv2 && pv05, 'preparar() monta la plantilla en las tres escalas');
    if (pv1 && pv2 && pv05) {
      ok(casi(pv2.alto, pv1.alto, 1e-6), 'el preview del gigante mide lo mismo que el normal', pv1.alto + ' → ' + pv2.alto);
      ok(casi(pv05.alto, pv1.alto, 1e-6), 'y el del enano también', pv1.alto + ' → ' + pv05.alto);
      ok(pv2.n === pv1.n, 'sin perder piezas en el preview', pv2.n + '/' + pv1.n);
      // Ojo: este hueco NO es lo que caza el fallo. Se comprobó volviendo a meter la escala en
      // `prepararEsqueleto`: el alto se va a 5.125 y el hueco se queda en 0, porque la escala movía
      // las piezas Y las agrandaba a la vez, así que en la plantilla siguen tocándose. Lo que el
      // dueño veía desmontado se rompe más tarde, al posar/dibujar. Queda como invariante barato.
      ok(casi(pv2.hueco, pv1.hueco, 1e-6), 'y sin desmontarse: el hueco entre piezas no cambia',
        pv1.hueco + ' → ' + pv2.hueco);
      // Y el Mundo SÍ escala: es lo que separa este ticket de «la escala no hace nada».
      ok(!casi(pv2.alto, r.gigante.uAlto, 0.02), 'el Mundo sí planta el gigante (preview ≠ Mundo a ×2)',
        'preview ' + pv2.alto + ' vs mundo ' + r.gigante.uAlto);
    }

    console.log('\nHigiene');
    ok(r.limpio === true, 'los agentes de prueba se retiran del mundo');
  }
  ok(errores.length === 0, 'sin errores de página', errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'TODO OK'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();