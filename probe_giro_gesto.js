// Comprueba las tres cosas que se rompieron a la vez en las piezas de redstone:
//   A · la ORIENTACIÓN de fábrica: cables/placas/repetidores/inversores planos en el suelo, puertas
//       de pie y el botón de cara (el 16³ se lee con asset-Z hacia ARRIBA, no asset-Y).
//   B · que el giro NO se pierda al encender: una pieza puesta con vuelco (Shift+R) se enderezaba
//       sola al pisarla porque el sufijo '@n' se truncaba a los dos bits del yaw.
//   C · que se pueda APUNTAR a una palanca con un cable delante (rayo fino, no el de celdas).
//
// Planta en /map/test (el mapa de pruebas) y NO guarda: los POST se bloquean.
const { chromium } = require('playwright');

const BASE = process.env.VOXEL_URL || 'http://localhost:8500';
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra !== undefined ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  // Nada de escribir en disco: esto es una sonda, no un montaje.
  await p.route('**/api/**', r => (r.request().method() === 'POST' ? r.abort() : r.continue()));

  await p.goto(BASE + '/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.redstone && game.redstone.apuntada', null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    const clave = (x, y, z) => mc.blockKey[mc.grid[mcIdx(x, y, z)]] || null;
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };

    // /map/test lleva encima todo lo que se ha ido probando, así que el sitio NO se puede dar por
    // supuesto: hay que buscar un claro. Uno con suelo llano debajo y aire de sobra encima, o el
    // barrido de puntería acaba midiendo lo que hubiera plantado allí otra prueba.
    const ANCHO = 13, FONDO = 13, LIBRE = 4;
    const aire = (x, y, z) => mcInside(x, y, z) && !mc.grid[mcIdx(x, y, z)];
    let X0 = -1, Z0 = -1, Y = -1;
    for (let x = 2; x < mc.dim.x - ANCHO - 2 && X0 < 0; x += 2) {
      for (let z = 2; z < mc.dim.z - FONDO - 2 && X0 < 0; z += 2) {
        let suelo = -1;
        for (let y = mc.dim.y - 1; y > 0; y--) if (mc.grid[mcIdx(x, y, z)]) { suelo = y; break; }
        if (suelo < 0) continue;
        // Lo que hace falta de verdad es el AIRE: las piezas se plantan a mano y la cámara se
        // coloca a mano, así que el suelo solo tiene que existir, no ser una losa perfecta.
        let claro = true;
        for (let dx = 0; dx <= ANCHO && claro; dx++)
          for (let dz = 0; dz <= FONDO && claro; dz++)
            for (let dy = 1; dy <= LIBRE && claro; dy++)
              if (!aire(x + dx, suelo + dy, z + dz)) claro = false;
        if (claro) { X0 = x; Z0 = z; Y = suelo + 1; }
      }
    }
    if (X0 < 0) { out.errs.push('no hay ningún claro libre en el mapa'); return out; }
    out.claro = [X0, Y, Z0];

    // ── A · orientación de fábrica ────────────────────────────────────────────────────────────
    // Se mide sobre la geometría FINA de verdad (la misma con la que el jugador choca): de los 16
    // niveles de altura de la celda, ¿cuáles tienen materia?
    const alturas = async (k, x, z) => {
      await game.setVoxel(x, Y, z, k);
      const g = mc._geoFina[mc.grid[mcIdx(x, Y, z)]];
      if (!g || !g.bits) return { clave: clave(x, Y, z), fina: false };
      const d = g.fdim, ys = [];
      for (let fy = 0; fy < d[1]; fy++)
        for (let fz = 0; fz < d[2]; fz++)
          for (let fx = 0; fx < d[0]; fx++)
            if (g.bits[(fy * d[2] + fz) * d[0] + fx]) { ys.push(fy); fz = d[2]; fx = d[0]; }
      return { fina: true, fdim: d.slice(), min: Math.min(...ys), max: Math.max(...ys) };
    };
    out.cable     = await alturas('hab:cable',     X0,     Z0);
    out.placa     = await alturas('hab:placa',     X0 + 2, Z0);
    out.repetidor = await alturas('hab:repetidor', X0 + 4, Z0);
    out.inversor  = await alturas('hab:inversor',  X0 + 6, Z0);
    out.puerta    = await alturas('hab:puerta',    X0 + 8, Z0);
    out.boton     = await alturas('hab:boton',     X0 + 10, Z0);

    // ── B · el vuelco sobrevive al encendido ──────────────────────────────────────────────────
    // '@6' = giro 2 (yaw) + vuelco 1 (tilt): el caso que se perdía, porque el vuelco vive en los
    // bits altos y el código viejo hacía «&3».
    // Se prueba con la PALANCA, no con la placa: la placa lleva `pulso` y se suelta sola a los
    // 1200 ms, así que para cuando termina la carga del material ya se ha apagado y no se sabría si
    // el vuelco sobrevivió al encendido o no. La palanca se queda como la dejas.
    const bx = X0, bz = Z0 + 4;
    // La variante girada es OTRO material (mcClaveConOri) y hay que darla de alta, igual que hace
    // Shift+R en el juego. La ENCENDIDA a propósito NO se precarga: que se la busque el motor sola es
    // parte de lo que se está probando.
    await game.addMaterial('hab:palanca@6');
    await game.setVoxel(bx, Y, bz, 'hab:palanca@6');
    const espera = ms => new Promise(f => setTimeout(f, ms));
    out.bPuesta = clave(bx, Y, bz);
    // La ENCENDIDA girada puede no estar todavía en la paleta: el motor la pide y reintenta, así que
    // el cambio llega un instante después. Se espera como esperaría el jugador.
    R.encender(bx, Y, bz, true); ticks(10); await espera(2500); ticks(10);
    out.bEncendida = clave(bx, Y, bz);
    R.encender(bx, Y, bz, false); ticks(10); await espera(2500); ticks(10);
    out.bApagada = clave(bx, Y, bz);

    // ── C · apuntar a una palanca con un cable delante ────────────────────────────────────────
    // El montaje que se midió cuando el dueño dijo «no sé cómo darle»: palanca al fondo y cable
    // plano en la celda de en medio, que con el rayo de celdas tapa la palanca por completo.
    const px = X0, pz = Z0 + 8;
    await game.addMaterial('hab:palanca');
    await game.setVoxel(px, Y, pz, 'hab:palanca');
    await game.setVoxel(px, Y, pz + 1, 'hab:cable');
    mc.pos = [px + 0.5, Y, pz + 3.5];            // dos bloques por detrás del cable, mirando −Z
    mc.yaw = 0; mc.vel = [0, 0, 0];

    const barrido = { fino: {}, gordo: {} };
    for (let g = -60; g <= 20; g += 2) {
      mc.pitch = g * Math.PI / 180;
      const f = R.apuntada(6);
      const kf = f ? clave(f[0], f[1], f[2]) : 'nada';
      // El rayo GORDO es el del motor (mcRaycast): trabaja en celdas y da por maciza la celda entera
      // en cuanto tiene bloque. Es contra éste contra el que hay que comparar.
      const a = mcRaycast(6);
      const ka = (a && a.cell) ? clave(a.cell[0], a.cell[1], a.cell[2]) : 'nada';
      (barrido.fino[kf] = barrido.fino[kf] || []).push(g);
      (barrido.gordo[ka] = barrido.gordo[ka] || []).push(g);
    }
    const ventana = o => Object.keys(o).map(k => k + ': ' + o[k].length * 2 + '°');
    out.finoVentanas = ventana(barrido.fino);
    out.gordoVentanas = ventana(barrido.gordo);
    out.gradosPalancaFino = (barrido.fino['hab:palanca'] || []).length * 2;
    out.gradosPalancaGordo = (barrido.gordo['hab:palanca'] || []).length * 2;

    // Y que apuntando de verdad se conmute (lo que hace el botón central).
    const gs = (barrido.fino['hab:palanca'] || []);
    if (gs.length) {
      mc.pitch = gs[(gs.length / 2) | 0] * Math.PI / 180;
      const c = R.apuntada(6);
      out.apuntaPalanca = clave(c[0], c[1], c[2]);
      // La primera conmutación de un material sin precargar contesta `false` y llega un momento
      // después (se estaba cargando la pareja encendida): lo que se comprueba es que ACABE encendida.
      R.conmutar(c[0], c[1], c[2]); ticks(10); await espera(2500); ticks(10);
      out.trasConmutar = clave(px, Y, pz);
    }
    out.hayManejadorMedio = !!(document.getElementById('mc-canvas') || {})._redstoneMedio;

    // ── D · el repetidor repite en las CUATRO orientaciones ───────────────────────────────────
    // `mira` saca el frente del giro de la clave (tabla FRENTE), y si esa tabla no coincide con lo
    // que mcRotXZ le hace de verdad a la geometría, el repetidor funciona de fábrica y deja de
    // hacerlo en cuanto lo giras con R. Se le da de comer por la ESPALDA y se mira si sale por
    // delante.
    const FRENTE = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
    out.repetidor4 = [];
    for (let rot = 0; rot < 4; rot++) {
      const cx = X0 + 1 + rot * 3, cz = Z0 + 12, f = FRENTE[rot];
      const kr = rot ? 'hab:repetidor@' + rot : 'hab:repetidor';
      // Las dos caras del repetidor girado, y las de la lámpara: sin precargarlas el motor las pide
      // al vuelo y la prueba mediría la latencia de la descarga, no el circuito.
      for (const k of [kr, 'hab:repetidor-on' + (rot ? '@' + rot : ''),
                       'hab:antorcha', 'hab:antorcha-apagada', 'hab:cable-on', 'hab:palanca-on'])
        await game.addMaterial(k);
      await game.setVoxel(cx - 2 * f[0], Y, cz - 2 * f[2], 'hab:palanca');
      await game.setVoxel(cx - f[0], Y, cz - f[2], 'hab:cable');
      await game.setVoxel(cx, Y, cz, kr);
      await game.setVoxel(cx + f[0], Y, cz + f[2], 'hab:antorcha-apagada');
      R.encender(cx - 2 * f[0], Y, cz - 2 * f[2], true); ticks(30); await espera(1200); ticks(30);
      out.repetidor4.push(clave(cx + f[0], Y, cz + f[2]));
    }
    return out;
  });

  if (r.errs && r.errs.length) { console.error('✗ ' + r.errs.join(' · ')); await b.close(); process.exit(1); }
  console.log('claro de pruebas en ' + JSON.stringify(r.claro));
  console.log('\nA · orientación de fábrica (altura ocupada dentro de la celda, 0 = suelo)');
  const alt = o => o.fina ? ('fdim ' + o.fdim.join('×') + ', altura ' + o.min + '..' + o.max) : JSON.stringify(o);
  ok('el cable es una lámina en el suelo', r.cable.fina && r.cable.max === 0, alt(r.cable));
  ok('la placa también', r.placa.fina && r.placa.max <= 1, alt(r.placa));
  ok('el repetidor se apoya en el suelo', r.repetidor.fina && r.repetidor.min === 0 && r.repetidor.max < 8, alt(r.repetidor));
  ok('el inversor se apoya en el suelo y sube', r.inversor.fina && r.inversor.min === 0 && r.inversor.max > 8, alt(r.inversor));
  ok('la puerta va de pie (ocupa toda la altura)', r.puerta.fina && r.puerta.min === 0 && r.puerta.max >= 15, alt(r.puerta));
  ok('el botón va de cara (ni en el suelo ni en el techo)', r.boton.fina && r.boton.min > 0 && r.boton.max < 15, alt(r.boton));

  console.log('\nB · el giro no se pierde al encender');
  ok('se pone con vuelco', r.bPuesta === 'hab:palanca@6', r.bPuesta);
  ok('encendida CONSERVA el vuelco', r.bEncendida === 'hab:palanca-on@6', r.bEncendida);
  ok('y al apagarse vuelve como estaba', r.bApagada === 'hab:palanca@6', r.bApagada);

  console.log('\nC · apuntar a la palanca con un cable delante');
  console.log('    rayo fino:  ' + r.finoVentanas.join(' · '));
  console.log('    rayo gordo: ' + r.gordoVentanas.join(' · '));
  ok('el rayo fino llega a la palanca', r.gradosPalancaFino > 0, r.gradosPalancaFino + '° de cabeceo');
  // El rayo de celdas no deja la palanca del todo inalcanzable, pero sí reducida a una rendija: lo
  // que se exige es que apuntarle deje de ser cuestión de suerte.
  ok('y su ventana es mucho mayor que con el rayo de celdas',
    r.gradosPalancaFino >= 2 * r.gradosPalancaGordo,
    'fino ' + r.gradosPalancaFino + '° vs celdas ' + r.gradosPalancaGordo + '°');
  ok('el rayo fino apunta a la palanca', r.apuntaPalanca === 'hab:palanca', r.apuntaPalanca);
  ok('y la palanca queda encendida', r.trasConmutar === 'hab:palanca-on', r.trasConmutar);
  ok('el botón central está enganchado al lienzo', r.hayManejadorMedio === true);

  console.log('\nD · el repetidor girado sigue repitiendo');
  ['sin girar', 'girado 90°', 'girado 180°', 'girado 270°'].forEach((n, i) =>
    ok(n + ' → la lámpara de delante luce', r.repetidor4[i] === 'hab:antorcha', r.repetidor4[i]));

  ok('sin errores de página', errores.length === 0, errores[0]);
  await p.screenshot({ path: '/tmp/probe_giro.png' });
  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallos' : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();
