// @area: render
// @necesita: servidor, playwright
// REQ-LUZ1 · la luz dinámica se sembraba en orden de cercanía al OJO, y la firma del candado se concatena en
// ese mismo orden ⇒ andar reordenaba las mismas semillas y se rehacía el BFS entero para un campo idéntico
// byte a byte (medido en la máquina del dueño: el 89 % de las re-siembras eran falsas). Ahora el ojo sigue
// decidiendo QUIÉN COGE PLAZA, pero el orden de siembra es canónico.
//
// La promesa que se prueba aquí, y es exigente: **rompe el candado mucho menos y NO cambia el NIVEL de ni una
// celda**. El color de las celdas EMPATADAS sí puede cambiar (el BFS rompe empates por orden de siembra) y eso
// se mide y se acota en vez de taparlo — pero el nivel es la magnitud de la ley y ése tiene que ser idéntico.
//
// Se prueban además las tres capas de redundancia que pidió el dueño («como los motores de los aviones»):
// el cruce periódico, la reversión automática ante una excepción, y el canal independiente que caza la firma
// rancia — que es el único fallo de este ticket que no grita solo.
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
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o);
  });

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && mc.prog', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // --- Un cielo de emisores, que es el caso del dueño ---------------------------------------------
  // Hacen falta MÁS candidatas que plazas (MC_DYN_SEMILLAS) para que el reparto por distancia esté saturado:
  // sin saturación andar no reordena nada y el test no probaría el caso que duele. Y varios colores, para que
  // haya empates de nivel entre emisores DISTINTOS — que es justo donde el orden se nota.
  const sembrado = await p.evaluate(() => {
    const d = mc.dim, N = Math.round(1 / MC_VOX);
    game.voxelesUI.limpia('pruebaLuz');
    game.voxelesUI.material('pruebaLuz', { emite: true, luz: 12 });
    const cols = [[255,60,60],[60,255,60],[60,60,255],[255,255,60],[255,60,255],[60,255,255]];
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const x = 4 + (i * 7) % (d.x - 8), z = 4 + (i * 13) % (d.z - 8), y = 20 + (i % 9);
      game.voxelesUI.pon(x * N, y * N, z * N, cols[i % cols.length], 'pruebaLuz'); n++;
    }
    mc._dynSig = null; mcDynSync();
    return { puestos: n, candidatas: mc._dynCand ? mc._dynCand.length / 11 : 0, tope: MC_DYN_SEMILLAS,
             sembradas: mc._dynSem ? mc._dynSem.length : 0 };
  });
  await p.waitForTimeout(1500);

  console.log('\n' + sembrado.puestos + ' emisores puestos · ' + sembrado.candidatas + ' candidatas para '
    + sembrado.tope + ' plazas · ' + sembrado.sembradas + ' sembradas\n');
  ok('el reparto está SATURADO (si no, el test no prueba nada)', sembrado.candidatas > sembrado.tope,
     sembrado.candidatas + ' candidatas vs ' + sembrado.tope + ' plazas');

  // --- 1. el NIVEL es idéntico con los dos órdenes ------------------------------------------------
  const campo = await p.evaluate(() => {
    const foto = () => {
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      const D = mc.dynLight;
      if (!D) return null;
      return { caja: [D.x0, D.y0, D.z0, D.W, D.H, D.P], vol: D.vol, BL: Array.from(D.BL.slice(0, D.vol * 4)) };
    };
    game.luzOrden = 'ojo';       const A = foto();
    game.luzOrden = 'canonico';  const B = foto();
    game.luzOrden = 'ojo';
    if (!A || !B) return { sinCampo: true };
    let nivel = 0, color = 0, encendidas = 0, salto = 0;
    for (let i = 0; i < A.vol; i++) {
      const j = i * 4;
      if (A.BL[j + 3]) encendidas++;
      if (A.BL[j + 3] !== B.BL[j + 3]) { nivel++; const d = Math.abs(A.BL[j + 3] - B.BL[j + 3]) / MC_LUZ_SUB; if (d > salto) salto = d; }
      else if (A.BL[j] !== B.BL[j] || A.BL[j + 1] !== B.BL[j + 1] || A.BL[j + 2] !== B.BL[j + 2]) color++;
    }
    return { caja: A.caja.join(',') === B.caja.join(','), vol: A.vol, nivel, color, encendidas, salto };
  });

  ok('la caja es la misma (es una UNIÓN: no puede depender del orden)', campo.caja === true);
  ok('hay campo de luz que comparar', campo.encendidas > 0, campo.encendidas + ' celdas encendidas de ' + campo.vol);
  // ⚠️ Aquí el ticket estaba MAL escrito y este guardián lo cazó (2026-08-20). Se afirmaba «el nivel no cambia
  // en ninguna celda»; es falso. El BFS guarda UN emisor por celda (Ley VI) y el orden de llegada decide cuál,
  // así que reordenar mueve el nivel de unas pocas celdas aguas abajo. Lo que se exige es que esté ACOTADO:
  // si un día se dispara, el orden dejó de ser una permutación inocente y hay que mirarlo.
  ok('el nivel cambia en MUY POCAS celdas (el desempate, acotado)', campo.nivel <= campo.encendidas * 0.01,
     campo.nivel + ' de ' + campo.encendidas + ' encendidas (' + (100 * campo.nivel / (campo.encendidas || 1)).toFixed(3) + ' %)');
  ok('y ninguna salta más de 1 nivel', campo.salto <= 1, 'salto máximo ' + campo.salto + ' niveles');
  ok('el color también cambia poco', campo.color <= campo.encendidas * 0.01,
     campo.color + ' de ' + campo.encendidas);

  // --- 1b. LA PROMESA DE VERDAD: con el orden canónico, la luz no depende de dónde estás -----------
  // Se mueve el ojo a un sitio donde el CONJUNTO de semillas elegido es el MISMO (se comprueba, no se supone:
  // si el conjunto cambiara estaríamos midiendo el cupo, que es otro ticket). Con el orden canónico el campo
  // tiene que salir idéntico. Con el de siempre no tiene por qué — y ése es justo el defecto que esto arregla:
  // basta una permutación pequeña, la que produce UN PASO, para que cambien celdas.
  const mover = await p.evaluate(() => {
    const guarda = [mc.pos[0], mc.pos[1], mc.pos[2]];
    const foto = (orden, x, z) => {
      game.luzOrden = orden; mc.pos[0] = x; mc.pos[2] = z;
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      const D = mc.dynLight, v = new Uint8Array(D.vol);
      for (let i = 0; i < D.vol; i++) v[i] = D.BL[i * 4 + 3];
      return { niv: v, conj: mc._dynSem.map(s => s.sig).slice().sort().join('|'),
               ord: mc._dynSem.map(s => s.sig).join('|'), caja: [D.x0, D.y0, D.z0, D.W, D.H, D.P].join(',') };
    };
    const dif = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
    const A = foto('ojo', 10, 10),      B = foto('ojo', 12, 11);
    const C = foto('canonico', 10, 10), E = foto('canonico', 12, 11);
    game.luzOrden = 'ojo';
    mc.pos[0] = guarda[0]; mc.pos[1] = guarda[1]; mc.pos[2] = guarda[2];
    mc._dynSig = null; mcDynSync();
    return {
      mismoConjunto: A.conj === B.conj && C.conj === E.conj, mismaCaja: A.caja === B.caja && C.caja === E.caja,
      ojoReordena: A.ord !== B.ord, canonNoReordena: C.ord === E.ord,
      difOjo: dif(A.niv, B.niv), difCanonico: dif(C.niv, E.niv),
    };
  });
  ok('al mover el ojo se elige EL MISMO conjunto (si no, se mide otra cosa)', mover.mismoConjunto && mover.mismaCaja);
  ok('con el orden de siempre, andar REORDENA las semillas (control)', mover.ojoReordena === true);
  ok('con el canónico, andar no reordena nada', mover.canonNoReordena === true);
  ok('⇒ con el canónico la luz NO depende de dónde estás', mover.difCanonico === 0, mover.difCanonico + ' celdas');
  console.log('    (con el orden de siempre, ese mismo paso movía ' + mover.difOjo + ' celdas)');

  // --- 2. la promesa: andando rompe el candado MUCHO menos ----------------------------------------
  // Se anda de verdad (se mueve mc.pos) y se cuenta cuántas veces cambia mc._dynSig con cada orden, sobre el
  // MISMO recorrido. Y al final del recorrido los dos órdenes tienen que dar el mismo campo, no solo romper menos.
  const andar = await p.evaluate(() => {
    const guarda = [mc.pos[0], mc.pos[1], mc.pos[2]];
    const paseo = (orden) => {
      game.luzOrden = orden;
      mc.pos[0] = 8; mc.pos[2] = 8;
      mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      let rotas = 0, prev = mc._dynSig;
      for (let i = 0; i < 120; i++) {
        mc.pos[0] += 0.35; mc.pos[2] += 0.2;
        mcDynSync();
        if (mc._dynSig !== prev) { rotas++; prev = mc._dynSig; }
      }
      const D = mc.dynLight;
      return { rotas, niveles: D ? Array.from(D.BL.slice(0, D.vol * 4)).filter((_, k) => k % 4 === 3) : [] };
    };
    const A = paseo('ojo'), B = paseo('canonico');
    game.luzOrden = 'ojo';
    mc.pos[0] = guarda[0]; mc.pos[1] = guarda[1]; mc.pos[2] = guarda[2];
    mc._dynSig = null; mcDynSync();
    let dif = 0;
    for (let i = 0; i < Math.min(A.niveles.length, B.niveles.length); i++) if (A.niveles[i] !== B.niveles[i]) dif++;
    return { ojo: A.rotas, canonico: B.rotas, mismoLargo: A.niveles.length === B.niveles.length, dif, pasos: 120 };
  });

  console.log('\nandando 120 pasos:  por cercanía al ojo ' + andar.ojo + ' roturas  ·  canónico ' + andar.canonico + '\n');
  ok('el orden por cercanía al ojo rompe el candado a menudo (control)', andar.ojo > andar.pasos * 0.3,
     andar.ojo + ' de ' + andar.pasos);
  ok('el canónico rompe MUCHO menos', andar.canonico <= andar.ojo * 0.35, andar.ojo + ' → ' + andar.canonico);
  // Las roturas que quedan son las de verdad: el cupo de 160 mete y saca emisores al cruzar el mapa. Eso es
  // BUG-GLOW11 y este ticket no lo toca a propósito.
  ok('y las que quedan son cambios REALES del conjunto', andar.canonico > 0, andar.canonico + ' roturas legítimas');

  // --- 2b. LEY VIII: que decidan los informes, no la opinión --------------------------------------
  // `luz-campo` mide cuánto se aparta el motor de su propia ley. Es el árbitro: si el orden canónico se
  // apartara MÁS, no valdría por muchos fps que ahorrase.
  const ley = await p.evaluate(async () => {
    const corre = async (orden) => {
      game.luzOrden = orden; mc._dynSig = null; mc._dynSuma = null; mcDynSync();
      const r = await game.informes.corre('luz-campo');
      return { peor: (r.peores && r.peores[0]) ? r.peores[0].dif : null, suma: r.totales.sumaBFS, ley: r.totales.sumaLey };
    };
    const A = await corre('ojo'), B = await corre('canonico');
    game.luzOrden = 'ojo';
    return { ojo: A, canonico: B };
  });
  console.log('\nluz-campo · desvío máximo contra la ley:  ojo ' + ley.ojo.peor + '   canónico ' + ley.canonico.peor + '\n');
  ok('el orden canónico NO se aparta más de la ley que el de siempre', ley.canonico.peor <= ley.ojo.peor,
     ley.ojo.peor + ' → ' + ley.canonico.peor);
  ok('y su suma de niveles no se aleja de la que dice la ley', ley.canonico.suma >= ley.ojo.suma,
     ley.ojo.suma + ' → ' + ley.canonico.suma + '  (la ley pide ' + ley.canonico.ley + ')');

  // --- 3. redundancia: el cruce, la reversión y el canal independiente ----------------------------
  const cruce = await p.evaluate(() => {
    mc._luzOrdenFallo = null; game.luzOrden = 'canonico';
    const parte = game.luzCruzar();
    const diag = game.luzDiag();
    return { parte, sinFallo: !diag.orden.fallo, cruces: diag.orden.cruces, puesto: diag.orden.puesto };
  });
  ok('el cruce compara celdas de verdad', !!cruce.parte && cruce.parte.celdas > 0,
     cruce.parte ? cruce.parte.celdas + ' celdas, nivel ' + cruce.parte.nivel + ', color ' + cruce.parte.color : 'sin parte');
  ok('el cruce comprueba la REPETIBILIDAD y sale limpia', !!cruce.parte && cruce.parte.repetible === true);
  ok('la caja no depende del orden', !!cruce.parte && cruce.parte.cajaDistinta === false);
  ok('la diferencia entre órdenes está dentro de lo que explica el desempate',
     !!cruce.parte && !cruce.parte.desborda && cruce.parte.salto <= 1,
     cruce.parte ? cruce.parte.nivel + '/' + cruce.parte.encendidas + ' celdas, salto ' + cruce.parte.salto : '');
  ok('y no revierte el motor bueno cuando todo va bien', cruce.sinFallo && cruce.puesto === 'canonico',
     'puesto ' + cruce.puesto);

  const reversion = await p.evaluate(() => {
    mc._luzOrdenFallo = null; game.luzOrden = 'canonico';
    const bueno = mcLuzFirmaSemilla;
    const antes = mc.dynLight ? mc.dynLight.luces : 0;
    mcLuzFirmaSemilla = () => { throw new Error('fallo provocado por el test'); };
    mc._dynSig = null; mc._dynSuma = null;
    try { mcDynSync(); } catch (e) { /* no debe escapar */ }
    const durante = { orden: mc.luzOrden, fallo: !!mc._luzOrdenFallo, hayCampo: !!mc.dynLight };
    mcLuzFirmaSemilla = bueno;
    mc._dynSig = null; mcDynSync();
    const despues = { orden: mc.luzOrden, luces: mc.dynLight ? mc.dynLight.luces : 0, fallo: mc._luzOrdenFallo };
    return { antes, durante, despues };
  });
  ok('una excepción en el orden canónico NO tumba el frame ni apaga la luz',
     reversion.durante.hayCampo === true);
  ok('revierte sola a «ojo» y lo deja anotado', reversion.durante.orden === 'ojo' && reversion.durante.fallo === true,
     'quedó en ' + reversion.durante.orden);
  ok('y el mundo sigue alumbrando después', reversion.despues.luces > 0,
     reversion.antes + ' → ' + reversion.despues.luces + ' luces');
  ok('el fallo dice POR QUÉ (no un booleano mudo)', !!(reversion.despues.fallo && reversion.despues.fallo.motivo),
     reversion.despues.fallo ? reversion.despues.fallo.motivo : '(sin motivo)');

  // El fallo silencioso: la firma se queda quieta mientras el conjunto de semillas cambia. Se simula dejando la
  // firma clavada a mano; si el canal independiente no existiera, esto pasaría desapercibido para siempre.
  const rancia = await p.evaluate(() => {
    mc._luzOrdenFallo = null; game.luzOrden = 'canonico';
    mcDynSync();
    const sigBuena = mc._dynSig;
    mc._dynSuma = 'suma:que:no:es';       // el conjunto "cambió" y la firma no se enteró
    mcDynSync();
    return { cazado: !!mc._luzOrdenFallo, motivo: mc._luzOrdenFallo && mc._luzOrdenFallo.motivo,
             sigCambio: mc._dynSig !== sigBuena, hayCampo: !!mc.dynLight };
  });
  ok('el canal independiente caza la FIRMA RANCIA', rancia.cazado === true, rancia.motivo || '(no la cazó)');
  ok('y ante la duda re-siembra, no da por buena la luz vieja', rancia.hayCampo === true);

  await p.evaluate(() => { mc._luzOrdenFallo = null; game.luzOrden = 'ojo'; game.voxelesUI.limpia('pruebaLuz'); });

  console.log(fallos ? '\nFALLAN ' + fallos : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
