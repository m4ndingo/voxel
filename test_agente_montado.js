// @area: agentes
// @necesita: servidor, playwright
// BUG-AG11 · si le vas MONTADO encima, el agente ni te ve ni gira sobre si mismo.
//
// El dueño, despues de BUG-AG9/BUG-AG10: «que parametros tendria que poner para que una vez dentro
// no me vea? he hecho varias pruebas y no lo consigo» y «puse "tope arriba y abajo (±°) = 0" y lo
// que hace es dar vueltas en circulo si me subo a su cabeza». No habia parametros: `vision` solo
// decide EMPEZAR (montado estas DENTRO del radio, o sea siempre en faena) y `limites.x` solo calla
// el cuello. Y las vueltas eran un caso DEGENERADO: a distancia horizontal ~0 la meta sale de dx/d
// con d ~ 0 y el giro de atan2(0, 0), o sea de puro ruido.
//
//   A · de pie DELANTE te ve (si no, todo lo demas es un falso verde).
//   B · montado en la cabeza NO te ve: se rinde y —como el tonto que es— se vuelve a su ancla
//       contigo puesto, sin ponerse a girar en el sitio. «Montado» no es «cabalgable» (dueño).
//   C · y el CUELLO tampoco te encara, con el tope vertical abierto de par en par — o sea que no
//       es BUG-AG9 quien lo esta tapando.
//   D · te bajas al lado y vuelve a verte: el estado es reversible, no un apagado permanente.
//   E · la guardia del giro degenerado vale TAMBIEN sin montable: justo encima del eje, una pieza
//       que no te lleva tampoco se pone a dar vueltas.
//   F · game.esqueletos() lo dice: «te lleva encima» en vez de «fuera de alcance» a 0 bloques.
//
// ⚠️ Medir con el jugador colgado en el aire exige poner mc.vel a CERO ademas de mc.pos: la
// gravedad acumula y cae >1 bloque DENTRO de un solo mcUpdate (leccion de BUG-AG9).
//
// No persiste nada: bloquea los POST y retira el agente que crea.
//
//   node test_agente_montado.js [url]       por defecto http://localhost:8500/map/test

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

  const hayApi = await p.evaluate(() => !!(window.game && game.esqueletos && typeof game.esqueletos.montable === 'function'));
  ok(hayApi, 'el snippet expone game.esqueletos.montable() (app.js no sabe de esto)');
  if (!hayApi) { await b.close(); process.exit(1); }

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const wrap180 = (a) => { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; };

    let sitio = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - 12) && !sitio; y++)
      for (let x = 14; x < mc.dim.x - 20 && !sitio; x += 4)
        for (let z = 14; z < mc.dim.z - 20 && !sitio; z += 4) {
          let libre = true;
          for (let i = 0; i < 10 && libre; i++) for (let j = 0; j < 8 && libre; j++)
            for (let k = 0; k < 10 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) sitio = [x, y, z];
        }
    if (!sitio) { out.errs.push('no encuentro un claro donde hacer las pruebas'); return out; }
    const [X, Y, Z] = sitio;

    const def = await game.agentes.cargar('zombie');
    if (!def) { out.errs.push('no hay agente "zombie" guardado'); return out; }
    const rig = await game.esqueletos.crear(def, X + 2, Y, Z + 2);
    if (!rig) { out.errs.push('no se pudo crear el agente'); return out; }
    out.agente = rig.nombre;
    for (let i = 0; i < 60 && !rig.partes.some(P => P.s && P.s.model); i++) await frame();

    const cuerpo = rig.partes[0].s;
    const sig = () => cuerpo._sig || {};
    const cab = rig.partes.find(P => P.nombre === 'cabeza') || rig.partes[1];
    if (!cab || !cab.mirar) { out.errs.push('el zombie no tiene una cabeza con «mirar»'); return out; }
    // El tope vertical ABIERTO de par en par: asi, si el cuello se queda quieto yendo montado, es
    // por BUG-AG11 y no porque BUG-AG9 ya lo hubiera callado.
    cab.mirar.limX = [-90, 90];
    out.vision = rig.G.vision;
    out.volver = rig.G.volver;
    out.deteccion = rig.G.deteccion;

    // Cuanto se le mueve el giro del cuerpo de un frame al siguiente. Es LA medida de «da vueltas»:
    // un pico de un frame ya delata el atan2(0,0), y una media lo escondería.
    // ⚠️ «Da vueltas» NO es «gira mucho»: volviendo al ancla contigo encima el bicho SE TIENE que
    // dar la vuelta entera, y eso es un giro grande y legitimo. Lo que delata al atan2(0,0) es
    // girar SIN IR A NINGUNA PARTE, o sea recorrido acumulado >> giro neto.
    const observa = async (pasos, colocar) => {
      let prev = rig.giro || 0, salto = 0, porMax = -1, porMin = 9, mont = true, mira = 0;
      const giro0 = rig.giro || 0;
      let recorrido = 0;
      // ...y a que distancia HORIZONTAL del eje esta el objetivo. Sin esto, el caso E es un falso
      // verde: si resulta que no estabas encima del eje, la guardia no llega a dispararse y el
      // giro sale estable por la razon de siempre, no por la nueva.
      let hMax = 0;
      const eje0 = [rig.eje[0] + sig().x, rig.eje[2] + sig().z];
      for (let i = 0; i < pasos; i++) {
        if (colocar) colocar();
        await frame();
        hMax = Math.max(hMax, Math.hypot(mc.pos[0] - (rig.eje[0] + sig().x),
                                         mc.pos[2] - (rig.eje[2] + sig().z)));
        const d = Math.abs(wrap180((rig.giro || 0) - prev));
        if (d > salto) salto = d;
        recorrido += d;
        prev = rig.giro || 0;
        const g = sig();
        if (g.por > porMax) porMax = g.por;
        if (g.por < porMin) porMin = g.por;
        if (!g.montado) mont = false;
        mira = Math.max(mira, Math.abs(cab.giroMira || 0));
      }
      const g = sig();
      return { saltoMax: +salto.toFixed(2), porMax, porMin, montadoSiempre: mont, hMax: +hMax.toFixed(4),
               giroRecorrido: +recorrido.toFixed(1), giroNeto: +Math.abs(wrap180((rig.giro || 0) - giro0)).toFixed(1),
               miraMax: +mira.toFixed(2), activo: +(rig.activo || 0).toFixed(3),
               deriva: +Math.hypot(rig.eje[0] + g.x - eje0[0], rig.eje[2] + g.z - eje0[1]).toFixed(3),
               alAncla: +Math.hypot(g.x, g.z).toFixed(3) };
    };

    // De pie delante de su NARIZ, a 3 bloques y a la altura de sus pies: tiene que verte.
    // ⚠️ No vale un «-z y ya»: desde BUG-AG10 el cono de `vision` acota EMPEZAR, así que si el
    // bicho ha acabado mirando a otro lado (y acaba, en cuanto anda) un sitio fijo lo deja ciego
    // y el control mide lo contrario de lo que cree. El morro está en giro + horneado.
    const delante = () => {
      const g = sig(), ang = ((rig.giro || 0) + rig.horneado) * Math.PI / 180;
      mc.pos[0] = rig.eje[0] + g.x + Math.sin(ang) * 3;
      mc.pos[1] = rig.eje[1] + g.y;
      mc.pos[2] = rig.eje[2] + g.z - Math.cos(ang) * 3;
      mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    };
    // ── A · te ve (control) ────────────────────────────────────────────────────────────────────
    delante(); await frame();
    out.delante = await observa(12, delante);

    // ── B/C · montado en la cabeza ─────────────────────────────────────────────────────────────
    out.encendido = game.esqueletos.montable(rig.id, cab.nombre);
    // Sobre la tapa de la cabeza, en su sitio del mundo: mundo = R·L + t.
    const a = cab.s.aabb, m = cab.s.model;
    const L = [(a[0] + a[3]) / 2, a[4] + 0.05, (a[2] + a[5]) / 2];
    mc.pos[0] = m[0] * L[0] + m[4] * L[1] + m[8] * L[2] + m[12];
    mc.pos[1] = m[1] * L[0] + m[5] * L[1] + m[9] * L[2] + m[13];
    mc.pos[2] = m[2] * L[0] + m[6] * L[1] + m[10] * L[2] + m[14];
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    await frame(); await frame();     // 1º: llevarPasajero guarda pose · 2º: ya te lleva
    // Sin tocar mc.pos: si de verdad te lleva, te lleva. Solo se frena la caida.
    out.montado = await observa(24, () => { mc.vel[1] = 0; });

    // ── D · te bajas al lado y vuelve a verte ──────────────────────────────────────────────────
    delante(); await frame(); await frame();
    out.bajado = await observa(12, delante);

    // ── F · la tabla, con el jugador otra vez encima ───────────────────────────────────────────
    const a2 = cab.s.aabb, m2 = cab.s.model;
    const L2 = [(a2[0] + a2[3]) / 2, a2[4] + 0.05, (a2[2] + a2[5]) / 2];
    mc.pos[0] = m2[0] * L2[0] + m2[4] * L2[1] + m2[8] * L2[2] + m2[12];
    mc.pos[1] = m2[1] * L2[0] + m2[5] * L2[1] + m2[9] * L2[2] + m2[13];
    mc.pos[2] = m2[2] * L2[0] + m2[6] * L2[1] + m2[10] * L2[2] + m2[14];
    mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    await frame(); await frame();
    const filas = game.esqueletos.lista();
    const fila = filas.filter(f => f.id === rig.id)[0] || {};
    out.estado = fila.estado;
    out.teVe = fila.teVe;

    // ── E · el caso degenerado SIN montable: justo encima del eje, sin que te lleve ────────────
    out.apagado = game.esqueletos.montable(rig.id, cab.nombre, false);
    const encimaDelEje = () => {
      const g = sig();
      mc.pos[0] = rig.eje[0] + g.x;
      mc.pos[1] = rig.eje[1] + g.y + 4;
      mc.pos[2] = rig.eje[2] + g.z;
      mc.vel[0] = 0; mc.vel[1] = 0; mc.vel[2] = 0;
    };
    encimaDelEje(); await frame();
    out.sobreElEje = await observa(24, encimaDelEje);

    game.esqueletos.quitar(rig);
    await frame();
    out.retirado = !mc.structures.some(s => s && s._rig);
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok(false, 'preparacion: ' + e));
  if (r.errs && r.errs.length) { await b.close(); process.exit(1); }

  console.log('\n── A · control: de pie delante SI te ve ──');
  ok(r.delante.porMax === 0, 'persiguiendo (por = 0) con el jugador a 3 bloques de frente',
    'por ' + r.delante.porMin + '..' + r.delante.porMax + ', vision ' + r.vision + '°, deteccion ' + r.deteccion);
  ok(r.delante.miraMax > 1, 'y el cuello SI se gira hacia el (si no, el caso B no prueba nada)',
    r.delante.miraMax + '°');

  console.log('\n── B · montado encima: no te ve y NO da vueltas ──');
  ok(r.encendido === true, 'la cabeza es montable');
  ok(r.montado.montadoSiempre === true, 'el motor sabe que te lleva encima los 24 frames');
  ok(r.montado.porMin === 1 && r.montado.porMax === 1,
    'se rinde: por = 1 todo el rato (no te persigue estando encima)',
    'por ' + r.montado.porMin + '..' + r.montado.porMax);
  // «No da vueltas» = no gira SIN IR A NINGUNA PARTE. Volviendo al ancla se da la vuelta entera y
  // eso es un giro grande legitimo, asi que lo que se mide es el recorrido acumulado contra el neto.
  ok(r.montado.giroRecorrido < r.montado.giroNeto + 30,
    'y NO da vueltas: lo que gira es lo que necesita para encarar su camino, no de mas',
    'recorre ' + r.montado.giroRecorrido + '° para un giro neto de ' + r.montado.giroNeto + '°');
  ok(r.montado.activo < 0.2, 'la pose se relaja (teVe → 0)', r.montado.activo);
  // Decision del dueño: «"montado" no es lo mismo que "cabalgable"; si estás montado y no te ve,
  // pues que sea como tonto y vuelva a su ancla». O sea que SI anda, y contigo puesto.
  ok(r.montado.deriva > 1 && r.volver === true,
    'y como tonto que es, con volver=' + r.volver + ' se va a su ancla contigo encima',
    'anda ' + r.montado.deriva);
  ok(r.montado.alAncla < 0.5, 'hasta llegar a casa', 'a ' + r.montado.alAncla + ' del ancla');

  console.log('\n── C · el cuello tampoco, con el tope vertical ABIERTO ──');
  ok(r.montado.miraMax < 2.5, 'la cabeza se queda en reposo con limites.x = [-90,90]',
    r.montado.miraMax + '° (no es BUG-AG9 quien lo tapa)');

  console.log('\n── D · te bajas y vuelve a verte (reversible) ──');
  ok(r.bajado.montadoSiempre === false, 'ya no te lleva');
  ok(r.bajado.porMax === 0, 'y vuelve a perseguirte', 'por ' + r.bajado.porMin + '..' + r.bajado.porMax);
  ok(r.bajado.miraMax > 1, 'y el cuello vuelve a encararte', r.bajado.miraMax + '°');

  console.log('\n── E · la guardia del giro vale tambien SIN montable ──');
  ok(r.apagado === false, 'montable apagado');
  ok(r.sobreElEje.hMax < 0.01,
    'el jugador esta DE VERDAD sobre el eje (si no, la guardia no se dispara y esto no prueba nada)',
    'a ' + r.sobreElEje.hMax + ' en planta');
  ok(r.sobreElEje.giroRecorrido < r.sobreElEje.giroNeto + 30,
    'justo encima del eje y sin que te lleve, el cuerpo tampoco se pone a girar',
    'recorre ' + r.sobreElEje.giroRecorrido + '° para un neto de ' + r.sobreElEje.giroNeto + '°');

  console.log('\n── F · la tabla lo dice ──');
  ok(r.estado === 'te lleva encima', 'game.esqueletos.lista() pone «te lleva encima»', r.estado);

  console.log('\n── limpieza ──');
  ok(r.retirado === true, 'el agente se retira sin dejar piezas sueltas');
  ok(errores.length === 0, 'sin excepciones en la pagina', errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();