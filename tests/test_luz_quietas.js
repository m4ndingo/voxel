// @area: render
// @necesita: servidor, playwright
// REQ-LUZ2 · una partícula de `game.voxelesUI` que lleva rato sin moverse NO es «lo que se mueve». Hasta este
// ticket entraban todas incondicionalmente en la caja del BFS dinámico, y como esa caja es la UNIÓN de todas
// las semillas, cuatro estrellas repartidas por el cielo la estiraban al mundo entero: cualquier temblor de la
// herramienta en la mano pagaba 368 640 celdas, 86 veces por segundo (BUG-GLOW11, 78 % del reloj ANDANDO).
//
// Lo que se prueba aquí es la promesa entera, y las dos mitades importan por igual:
//   (A) que andar deje de costar — es el motivo del ticket;
//   (B) que la luz SIGA PUESTA y siga viva. El fallo temido no es reventar: es que el campo del mundo se quede
//       CONGELADO pareciendo correcto (una estrella que se apaga y sigue alumbrando). Eso no grita solo, así
//       que hay que preguntárselo a propósito — Ley VII, la firma tiene que enterarse del cambio.
//
// ⚠️ El campo NO sale byte a byte idéntico al de antes (Ley VI: cada celda guarda UN emisor, y ahora unos ganan
// en el otro campo). Por eso aquí no se compara con «lo de antes» sino con la LEY: la estrella alumbra el suelo
// y el nivel no se desploma. La desviación contra la ley la arbitra `luz-campo` (Ley VIII), no este guardián.
//
// No persiste nada: bloquea el POST del mundo.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test?noauto=1';
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o);
  });

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // Utilidades que viven EN LA PÁGINA: el paseo (lo que dispara la re-siembra) y la lectura del campo.
  await p.evaluate(() => {
    // Estrellas repartidas por todo el mapa y altas, como el decorado del dueño: su alcance largo hace que la
    // unión de sus cajas sea casi el mundo entero, que es la condición que duele.
    window.__planta = (n, grupo, luz) => {
      const d = mc.dim, N = Math.round(1 / MC_VOX);
      game.voxelesUI.limpia(grupo);
      game.voxelesUI.material(grupo, { emite: true, luz: luz });
      let puestas = 0;
      for (let i = 0; i < n; i++) {
        const x = 2 + ((i * 7919) % (d.x - 4)), z = 2 + ((i * 6271) % (d.z - 4)), y = d.y - 2 - (i % 6);
        if (game.voxelesUI.pon(x * N, y * N, z * N, [255, 255, 230], grupo) !== false) puestas++;
      }
      return puestas;
    };
    // Deja madurar el reparto: MC_LUZ_QUIETA_TRAS pasadas seguidas con la capa igual.
    window.__madura = () => { for (let i = 0; i < game.luzQuietasTras + 5; i++) mcDynSync(); };
    // 200 pasos de 0,12 bloques = 24 bloques, lo mismo que anduvo el dueño en sus 8 s.
    window.__pasea = () => {
      mc.pos[0] = 8; mc.pos[1] = 20; mc.pos[2] = mc.dim.z / 2;
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      let rotas = 0, ms = 0;
      for (let i = 0; i < 200; i++) {
        mc.pos[0] += 0.12;
        const antes = mc._dynSig, t = performance.now();
        mcDynSync();
        ms += performance.now() - t;
        if (mc._dynSig !== antes) rotas++;
      }
      const D = mc.dynLight, Q = game.luzDiag().quietas;
      return { rotas, ms, caja: D ? D.vol : 0, quietas: Q.quietas, movidas: Q.movidas };
    };
    // El nivel de luz ARTIFICIAL de una celda, mezclando los dos campos como hace el shader: max(mundo, caja).
    // Preguntarle sólo a uno sería trampa — la promesa es que la estrella alumbra, no en qué buzón está.
    window.__nivel = (x, y, z) => {
      let dyn = 0; try { dyn = mcDynNivel(x, y, z) || 0; } catch (e) {}
      const BL = mc.blockLight, mundo = BL ? BL[mcIdx(x, y, z) * 4 + 3] / MC_LUZ_SUB : 0;
      return Math.max(dyn, mundo);
    };
    window.__encendidas = () => { const BL = mc.blockLight; let n = 0;
      if (BL) for (let i = 3; i < BL.length; i += 4) if (BL[i]) n++; return n; };
    // ⚠️ El mapa de pruebas TRAE LO SUYO: sus propias estrellas de decorado y sus bloques emisivos. Todo lo que
    // se mide aquí es un DELTA contra esa línea base, o el guardián estaría midiendo el mundo y no el ticket
    // (me pasó al escribirlo: 238 «quietas» y 40 426 celdas encendidas que no había puesto yo).
    window.__base = () => { __madura(); return { quietas: game.luzDiag().quietas.quietas, encendidas: __encendidas() }; };
    // Una columna de AIRE y A OSCURAS donde plantar una estrella suelta. Las dos condiciones importan:
    //   · dentro de un sólido, mcLuzSiembra la deja como muestra sin propagar ⇒ mediría cero sin estar roto;
    //   · bajo una estrella del DECORADO del mapa, el max() de los dos campos tapa la nuestra ⇒ el nivel no se
    //     movería ni al encenderla ni al apagarla. (Me pasó: 24 en los tres estados, y no era el motor.)
    //   · y `mcSolid` NO basta para saber si la luz baja: el BFS también lo cortan las piezas finas de
    //     mc.structures, que no están en la rejilla. (Me pasó: columna de aire y a oscuras, la estrella
    //     encendía su celda y la de debajo, y a los 3 bloques cero — no era el motor, era el sitio.) Así
    //     que el sitio no se supone, SE MIDE: se planta una luz de prueba, que por ser nueva va a la CAJA
    //     (aún no ha madurado ⇒ ni toca el conjunto quieto ni obliga a rehornear el mundo, cuesta un
    //     mcDynSync) y se mira si de verdad llega. Misma ley en los dos campos desde BUG-GLOW8.
    window.__llega = (x, y, z) => {
      const N = Math.round(1 / MC_VOX);
      game.voxelesUI.limpia('__sonda'); game.voxelesUI.material('__sonda', { emite: true, luz: 20 });
      game.voxelesUI.pon(x * N, y * N, z * N, [255, 255, 230], '__sonda');
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      let n = 0; try { n = mcDynNivel(x, y - 3, z) || 0; } catch (e) {}
      game.voxelesUI.limpia('__sonda'); mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      return n > 0;
    };
    window.__hueco = (desde) => {
      for (let x = desde; x < mc.dim.x - 2; x += 3) for (let z = 3; z < mc.dim.z - 3; z += 3) {
        const y = mc.dim.y - 5;
        let libre = true;
        for (let yy = y - 5; yy <= y; yy++) if (mcSolid(mc.grid[mcIdx(x, yy, z)])) { libre = false; break; }
        if (libre && __nivel(x, y, z) === 0 && __nivel(x, y - 3, z) === 0 && __llega(x, y, z)) return [x, y, z];
      }
      return null;
    };
  });

  // ── 1 · ANDAR DEJA DE COSTAR ──────────────────────────────────────────────────────────────────────
  // El mismo mundo, la misma máquina y el mismo paseo, con el mando apagado y encendido. Es una comparación
  // relativa a propósito: en SwiftShader los milisegundos absolutos no valen nada, pero el número de veces que
  // se rompe la firma sí — ése es el hecho, y no depende de lo rápida que sea la máquina.
  console.log('\n1 · andar con el cielo lleno de estrellas QUIETAS');
  const puestas = await p.evaluate(() => __planta(128, 'guardiaLuz', 37));
  const r1 = await p.evaluate(() => {
    game.luzQuietas = false; const sin = __pasea();
    game.luzQuietas = true; __madura(); const con = __pasea();
    return { sin, con, dim: [mc.dim.x, mc.dim.y, mc.dim.z] };
  });
  console.log('   ' + puestas + ' estrellas (luz 37) en un mundo ' + r1.dim.join('×'));
  console.log('   luzQuietas=false → ' + r1.sin.rotas + '/200 roturas, caja ' + r1.sin.caja + ' celdas, ' +
              r1.sin.ms.toFixed(0) + ' ms');
  console.log('   luzQuietas=true  → ' + r1.con.rotas + '/200 roturas, caja ' + r1.con.caja + ' celdas, ' +
              r1.con.ms.toFixed(0) + ' ms');
  ok('sin el ticket, andar rompe la firma casi cada paso (control)', r1.sin.rotas > 100, r1.sin.rotas + ' de 200');
  ok('con el ticket, andar casi no la rompe', r1.con.rotas <= 10, r1.sin.rotas + ' → ' + r1.con.rotas);
  ok('las estrellas se dan por QUIETAS y salen de la caja', r1.con.quietas > 0 && r1.con.movidas === 0,
     r1.con.quietas + ' quietas / ' + r1.con.movidas + ' movidas');
  ok('…y la caja se encoge a lo que de verdad se mueve', r1.con.caja < r1.sin.caja / 4,
     r1.sin.caja + ' → ' + r1.con.caja + ' celdas');

  // ── 2 · …Y LA LUZ SIGUE PUESTA ───────────────────────────────────────────────────────────────────
  // ⛔ Sin esto el test premiaría apagar las estrellas, que es exactamente el apaño que la Ley prohíbe.
  console.log('\n2 · la estrella sigue alumbrando el suelo (⛔ nada de apagarlas para ir rápido)');
  const r2 = await p.evaluate(() => {
    const d = mc.dim, cx = Math.floor(d.x / 2), cz = Math.floor(d.z / 2);
    const lee = () => ({ suelo: __nivel(cx, 16, cz), alto: __nivel(cx, d.y - 4, cz),
                         encendidas: (() => { const BL = mc.blockLight; let n = 0;
                           if (BL) for (let i = 3; i < BL.length; i += 4) if (BL[i]) n++; return n; })() });
    game.luzQuietas = false; mc._dynSig = null; mcDynSync(); const sin = lee();
    game.luzQuietas = true; __madura(); const con = lee();
    return { sin, con };
  });
  console.log('   luzQuietas=false → suelo ' + r2.sin.suelo + ' · arriba ' + r2.sin.alto);
  console.log('   luzQuietas=true  → suelo ' + r2.con.suelo + ' · arriba ' + r2.con.alto +
              ' · campo del mundo ' + r2.con.encendidas + ' celdas encendidas');
  ok('bajo las estrellas hay luz artificial en el suelo', r2.con.suelo > 0, 'nivel ' + r2.con.suelo);
  // 1 nivel de margen: Ley VI, el desempate entre emisores puede mover una celda un nivel. Más que eso ya no es
  // el desempate, es que la estrella ha perdido alcance por el camino.
  ok('…y del mismo orden que sin el ticket (Ley VI: ±1 nivel, no más)',
     Math.abs(r2.con.suelo - r2.sin.suelo) <= 1, r2.sin.suelo + ' → ' + r2.con.suelo);
  ok('pegado a la estrella sigue a pleno', Math.abs(r2.con.alto - r2.sin.alto) <= 1,
     r2.sin.alto + ' → ' + r2.con.alto);
  ok('el campo del MUNDO es quien las lleva ahora', r2.con.encendidas > r2.sin.encendidas,
     r2.sin.encendidas + ' → ' + r2.con.encendidas);

  // ── 3 · EL FALLO SILENCIOSO: QUE EL CAMPO SE QUEDE CONGELADO ──────────────────────────────────────
  // Ley VII. Si el conjunto quieto no entrara en la firma de mcComputeBlockLight, apagar una estrella la
  // dejaría alumbrando para siempre y NADA fallaría: el mundo se vería bien y estaría mal.
  console.log('\n3 · Ley VII · el campo del mundo se entera de que la estrella ha cambiado');
  const r3 = await p.evaluate(() => {
    const N = Math.round(1 / MC_VOX);
    // …y se madura ANTES de buscar sitio, o el campo del mundo aún lleva horneadas las 128 de §1 y «a oscuras»
    // sería mentira: no habría hueco donde medir, o lo habría con luz ajena dentro.
    game.voxelesUI.limpia('guardiaLuz'); __madura();
    const A = __hueco(6), B = __hueco(A ? A[0] + 24 : 40);       // dos huecos de aire, lejos uno de otro
    if (!A || !B || A[0] === B[0]) return { sinsitio: true };
    const pon = (g, c) => { game.voxelesUI.limpia(g); game.voxelesUI.material(g, { emite: true, luz: 20 });
                            game.voxelesUI.pon(c[0] * N, c[1] * N, c[2] * N, [255, 255, 230], g); __madura(); };
    pon('guardiaSola', A);
    const firmaA = mc._voxUIQuietasSig, encendida = __nivel(A[0], A[1] - 3, A[2]);
    // …se apaga
    game.voxelesUI.limpia('guardiaSola'); __madura();
    const firmaB = mc._voxUIQuietasSig, apagada = __nivel(A[0], A[1] - 3, A[2]);
    // …y vuelve, pero A OTRO SITIO: el conjunto es distinto aunque tenga el mismo tamaño
    pon('guardiaOtro', B);
    const firmaC = mc._voxUIQuietasSig, aqui = __nivel(A[0], A[1] - 3, A[2]), alla = __nivel(B[0], B[1] - 3, B[2]);
    game.voxelesUI.limpia('guardiaOtro'); __madura();
    return { A, B, firmaA, firmaB, firmaC, encendida, apagada, aqui, alla };
  });
  ok('hay dos columnas de aire donde plantar la estrella', !r3.sinsitio);
  if (!r3.sinsitio) {
    console.log('   estrella en ' + r3.A.join(',') + ', luego en ' + r3.B.join(','));
    console.log('   nivel 3 bloques bajo el primer sitio: encendida ' + r3.encendida + ' → apagada ' + r3.apagada +
                ' → movida: aquí ' + r3.aqui + ', allá ' + r3.alla);
    ok('una estrella quieta alumbra', r3.encendida > 0, 'nivel ' + r3.encendida);
    ok('apagarla la APAGA (no se queda congelada en el campo)', r3.apagada === 0, 'nivel ' + r3.apagada);
    ok('moverla la mueve: alumbra donde está, no donde estaba', r3.alla > 0 && r3.aqui === 0,
       'aquí ' + r3.aqui + ' · allá ' + r3.alla);
  }
  ok('y la firma del conjunto cambia en cada paso (Ley VII)',
     !r3.sinsitio && r3.firmaA !== r3.firmaB && r3.firmaB !== r3.firmaC && r3.firmaA !== r3.firmaC,
     [r3.firmaA, r3.firmaB, r3.firmaC].join(' → '));

  // ── 4 · LO QUE DE VERDAD SE MUEVE NUNCA SE DA POR QUIETO ──────────────────────────────────────────
  // La otra cara del mismo error: dar por quieta una chispa que vuela la dejaría clavada en el mundo. El
  // criterio es la CLAVE de la firma, así que basta con que se mueva un cuanto para que el reloj vuelva a cero.
  console.log('\n4 · una partícula que se mueve no se da por quieta NUNCA');
  const r4 = await p.evaluate(() => {
    const d = mc.dim, N = Math.round(1 / MC_VOX);
    game.voxelesUI.limpia('guardiaVuela');
    const base = __base();                                   // lo que el MAPA trae ya dado por quieto
    game.voxelesUI.material('guardiaVuela', { emite: true, luz: 12 });
    let quietasMax = 0;
    for (let i = 0; i < game.luzQuietasTras * 3; i++) {
      game.voxelesUI.limpia('guardiaVuela');
      game.voxelesUI.pon(Math.round((10 + i * 0.5) * N), 24 * N, Math.round(d.z / 2) * N, [255, 200, 120], 'guardiaVuela');
      mcDynSync();
      const q = game.luzDiag().quietas.quietas; if (q > quietasMax) quietasMax = q;
    }
    const enVuelo = game.luzDiag().quietas;
    // …y en cuanto se para, en MC_LUZ_QUIETA_TRAS pasadas pasa al mundo. El mismo reloj para las dos cosas.
    __madura();
    const parada = game.luzDiag().quietas;
    game.voxelesUI.limpia('guardiaVuela'); __madura();
    return { base, quietasMax, enVuelo, parada };
  });
  console.log('   el mapa ya traía ' + r4.base.quietas + ' quietas suyas · volando: ' + r4.enVuelo.quietas +
              ' quietas / ' + r4.enVuelo.movidas + ' movidas · parada: ' + r4.parada.quietas + ' / ' + r4.parada.movidas);
  ok('mientras vuela NUNCA entra en el campo del mundo', r4.quietasMax <= r4.base.quietas,
     'máximo ' + r4.quietasMax + ' vs ' + r4.base.quietas + ' de línea base');
  ok('…y sigue contando como movida', r4.enVuelo.movidas > 0, r4.enVuelo.movidas + ' movidas');
  ok('en cuanto se para, pasa al campo del mundo', r4.parada.quietas > r4.base.quietas && r4.parada.movidas === 0,
     r4.base.quietas + ' → ' + r4.parada.quietas + ' quietas / ' + r4.parada.movidas + ' movidas');

  // ── 5 · EL MANDO VUELVE ATRÁS DEL TODO ───────────────────────────────────────────────────────────
  // Condición del dueño para cualquier feature cara: que se pueda apagar para medir. Y apagar tiene que dejar
  // el motor EXACTAMENTE como antes del ticket, no en un tercer estado a medias.
  console.log('\n5 · game.luzQuietas=false vuelve al motor de antes');
  const r5 = await p.evaluate(() => {
    // Línea base con el mando YA APAGADO: es la luz de bloque propia del mapa (sus antorchas y emisivos), que
    // no tiene nada que ver con este ticket y no se va a ir a ninguna parte.
    game.voxelesUI.limpia('guardiaLuz');
    game.luzQuietas = false; mcDynSync();
    const base = { quietas: game.luzDiag().quietas.quietas, encendidas: __encendidas() };
    game.luzQuietas = true;
    __planta(64, 'guardiaLuz', 37); __madura();
    const con = { quietas: game.luzDiag().quietas.quietas, encendidas: __encendidas() };
    game.luzQuietas = false; mcDynSync();
    const sin = game.luzDiag().quietas, enc = __encendidas();
    const suelo = __nivel(Math.floor(mc.dim.x / 2), 16, Math.floor(mc.dim.z / 2));
    game.voxelesUI.limpia('guardiaLuz'); game.luzQuietas = true; mcDynSync();
    return { base, con, sin, enc, suelo };
  });
  console.log('   el mapa solo: ' + r5.base.quietas + ' quietas, ' + r5.base.encendidas + ' celdas · ' +
              'con 64 estrellas: ' + r5.con.quietas + ' quietas, ' + r5.con.encendidas + ' celdas');
  ok('apagado, ninguna partícula queda en el campo del mundo', r5.sin.quietas === 0,
     r5.con.quietas + ' → ' + r5.sin.quietas + ' quietas');
  ok('…y todas vuelven a la caja', r5.sin.movidas > 0, r5.sin.movidas + ' movidas');
  ok('…y el campo del mundo vuelve al que tenía el mapa (sin restos congelados)', r5.enc === r5.base.encendidas,
     r5.con.encendidas + ' → ' + r5.enc + ' celdas, y el mapa solo tenía ' + r5.base.encendidas);
  ok('…pero la luz sigue estando, ahora por la caja', r5.suelo > 0, 'nivel ' + r5.suelo);

  console.log('\n6 · sin errores de página');
  ok('ni un error en consola', errores.length === 0, errores.join(' | '));

  await b.close();
  console.log(fallos ? '\n✗ ' + fallos + ' fallo(s)' : '\n✓ todo en verde');
  process.exit(fallos ? 1 : 0);
})();
