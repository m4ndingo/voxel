// BUG-AG5 · «cuando un agente es empujado por el pistón redstone, si el agente sigue avanzando en
// dirección al pistón acaba ganando el movimiento del agente sobre el empuje del pistón, por lo que
// si por ejemplo tenía que desplazarlo 16 al final del movimiento puede que no llegue a ese valor o
// se suba encima del pistón abierto».
//
// Son DOS dueños del mismo cuerpo en el mismo frame: `apartar()` del pistón, que da su empujón de un
// tiro, y `pasoSeguir` de la librería, que hace andar al bicho cada frame. El empujón se lo comía él
// solo andando. El arreglo es un «shock»: al ser desplazado deja de andar ~1 s
// (game.esqueletos.aturdir), y quien decide aturdir es la PIEZA, no el motor de agentes.
//
// El banco es un pistón mirando a +X con un bloque encima (dos de alto: así el agente que camina
// contra él NO puede subirlo como quien sube un escalón, que es conducta normal y no este fallo) y
// un agente andando hacia −X, o sea de frente contra la cabeza que va a salir.
//
//   A · agente PARADO delante              → la referencia: cuánto empuja el pistón, sin nadie que
//                                            le lleve la contraria
//   B · agente ANDANDO contra el pistón    → tiene que salir DESPLAZADO LO MISMO que en A, y a la
//                                            misma cota (no encima de la cabeza)
//   C · lo mismo con el shock APAGADO      → game.redstone.shockPiston = 0. Aquí es donde se ve el
//                                            fallo, y es lo que hace que B no sea un verde de adorno:
//                                            si C saliera igual que B, este test no mediría nada
//   D · el shock se AGOTA                  → pasado el rato vuelve a andar (no se queda tonto), y
//                                            aturdir(rig, 0) lo despierta a mano
//
// ⚠️ La medida se toma DENTRO de la ventana de shock, no «al final de todo». Pasado el segundo, el
// agente vuelve a caminar contra la cabeza ya extendida y se sube a ella — pero eso es un escalón de
// un bloque subido andando, que es conducta correcta del agente y NO es este ticket (lo dice el
// tramo D de test_piston_empuja.js). Lo que este ticket pide es que el EMPUJÓN se complete.
//
// No persiste nada: bloquea los POST, devuelve cada celda tocada a su id anterior, quita los agentes
// y deja al jugador donde estaba.
//
//   node test_agente_aturdido.js [url]      por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}
const r3 = n => Math.round(n * 1000) / 1000;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.redstone && game.redstone.tick', null, { timeout: 120000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone, E = game.esqueletos;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const claveEn = (x, y, z) => base(mc.blockKey[idEn(x, y, z)] || '');
    const frame = () => new Promise(res => requestAnimationFrame(res));
    const esperar = ms => new Promise(res => setTimeout(res, ms));
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };

    out.hayAturdir = typeof E.aturdir === 'function';

    const tocadas = new Map();
    const pon = (x, y, z, k) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      setVoxel(x, y, z, k || 0);
    };

    const FUENTE = 'asset:assets/bloque_redstone.vox.json';
    const LOSA = 'asset:assets/adoquin.vox.json';
    const CLAVES = [LOSA, FUENTE, 'hab:piston', 'hab:piston-on', 'hab:piston-cabeza'];
    const cargado = k => mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0;
    for (const k of CLAVES) if (!cargado(k)) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga «' + k + '»: ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !cargado(k));
    if (out.faltan.length) return out;

    // El solar: un pasillo largo en X, que aquí el bicho tiene que tener sitio para coger carrerilla.
    const AN = 20, AL = 6, PR = 5;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = -1; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el banco de pruebas'); return out; }
    const [X, Y, Z] = caja;
    const ZP = Z + 2;
    out.caja = caja;

    beginBatch();
    for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, LOSA);
    endBatch();

    const posPrevia = mc.pos.slice(), velPrevia = mc.vel ? mc.vel.slice() : null;
    // El jugador, a la otra punta y detrás: asentar() no deja a un agente meterse dentro de él
    // (solapaJugador), así que dejarlo en el pasillo sería atarle un pie al bicho que se mide.
    mc.pos[0] = X + 1.5; mc.pos[1] = Y; mc.pos[2] = Z + 4.5;
    if (mc.vel) mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
    await frame();

    // ── el banco: pistón mirando a +X, con un bloque encima ──────────────────────────────────────
    // Dos de alto A PROPÓSITO. Con el pistón solo, el agente que camina contra él se le sube como
    // quien sube un escalón —conducta correcta— y la medida se iría por el desagüe antes de empezar.
    const PX = X + 8;
    const revisar = () => R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
    const montar = () => {                  // pistón APAGADO (sin fuente) y su tapa
      beginBatch();
      pon(PX, Y, ZP, 'hab:piston');         // rot 0 = mira a +X
      pon(PX, Y + 1, ZP, LOSA);
      endBatch();
      revisar(); ticks(30);
    };
    const disparar = () => {                // la fuente detrás: es lo que le da la señal
      beginBatch();
      pon(PX - 1, Y, ZP, FUENTE);
      endBatch();
      revisar(); ticks(30);
    };
    const desmontar = () => {
      beginBatch();
      for (let i = -1; i <= 3; i++) pon(PX + i, Y, ZP, 0);
      pon(PX, Y + 1, ZP, 0);
      endBatch();
      revisar(); ticks(30);
    };

    // ── el bicho ────────────────────────────────────────────────────────────────────────────────
    // Se planta a la derecha del pistón y camina hacia −X. `donde()` es el centro de su CUERPO, que
    // no es la celda donde lo plantas: crear() planta la RAÍZ y el cuerpo no está centrado en ella.
    const nacer = async () => {
      E.quitar();
      const rig = await E.crear('zombie', PX + 5, Y, ZP);
      for (let t = 0; t < 200 && !rig.partes.every(P => P.s); t++) await esperar(50);
      if (!rig.partes.every(P => P.s)) { out.errs.push('el agente no acabó de estamparse'); return null; }
      for (let t = 0; t < 25; t++) await frame();
      return rig;
    };
    const donde = rig => {
      const s = rig.partes[0].s, g = s._sig, a = rig.cuerpo;
      return [(a[0] + a[3]) * 0.5 + g.x, a[1] + g.y + (rig.mov ? rig.mov.alto : 0), (a[2] + a[5]) * 0.5 + g.z];
    };
    // El driver de andar es el de test_piston_empuja.js: a un punto, sin buscar por clave y sin
    // correa. La meta queda MÁS ALLÁ del pistón para que no frene justo al llegar.
    const andarHacia = (rig, tx) => {
      rig.G.objetivo = [tx, Y, ZP + 0.5];
      rig.G.porClave = false;
      rig.G.deteccion = 0;
      rig.G.distancia = 0.3;
      rig.G.correa = 0;
      rig.G.velocidad = 3;
    };

    // Un pase entero: el bicho CAMINA hasta apoyarse en el pistón, se acciona, y se mide DENTRO de
    // la ventana de shock. Devuelve el desplazamiento en +X y la cota.
    //
    // ⚠️ Los tres pases entran andando, también el «parado»: lo único que cambia es si al llegar se
    // le quita la meta. Es lo que hace comparables los desplazamientos. La primera versión ponía al
    // parado con desplazar() en el centro de la celda y disparaba en cuanto el que andaba pisaba esa
    // celda —o sea, con el pie aún en el borde—, así que salían de sitios distintos y el «mismo
    // desplazamiento» comparaba peras con manzanas (0,5 contra 0,94, y ninguno de los dos era el fallo).
    const VENTANA = 600;                    // ms de medida: menos que el segundo de shock
    const pase = async (nombre, anda) => {
      desmontar();
      const rig = await nacer();
      if (!rig) return null;
      montar();
      andarHacia(rig, PX - 4);              // de frente contra el pistón, siempre
      // Apoyado = ya no avanza. Con el pistón de dos de alto no puede treparlo, así que se planta.
      let quieto = 0, xAnt = donde(rig)[0];
      for (let t = 0; t < 900 && quieto < 12; t++) {
        await frame();
        const x = donde(rig)[0];
        quieto = Math.abs(x - xAnt) < 1e-4 ? quieto + 1 : 0;
        xAnt = x;
      }
      if (quieto < 12) { out.errs.push(nombre + ': el agente no llegó a apoyarse en el pistón: ' + JSON.stringify(donde(rig))); return null; }
      // Y solo ahora se decide si sigue empujando o se le quita la meta. Ojo con `velocidad = 0`:
      // eso apaga el paso del rig y con él asentar(), que es justo la función que trepa — un verde
      // falso de manual. Aquí sigue andando hacia donde ya está, o sea sin avanzar pero con el
      // motor entero corriendo.
      if (!anda) andarHacia(rig, donde(rig)[0]);

      const antes = donde(rig);
      disparar();
      const res = { antes: antes, cabeza: claveEn(PX + 1, Y, ZP), tras: donde(rig), picoY: donde(rig)[1] };
      const t0 = performance.now();
      while (performance.now() - t0 < VENTANA) {
        await frame();
        const q = donde(rig);
        if (q[1] > res.picoY) res.picoY = q[1];
      }
      const fin = donde(rig);
      res.fin = fin;
      res.dx = fin[0] - antes[0];
      res.dy = res.picoY - antes[1];
      res.shockAlFinal = rig.aturdido || 0;
      return { res: res, rig: rig };
    };

    // ── A · parado: la referencia ───────────────────────────────────────────────────────────────
    let q = await pase('A', false);
    if (!q) return out;
    out.A = q.res;

    // ── B · andando contra el pistón, con el shock puesto ───────────────────────────────────────
    q = await pase('B', true);
    if (!q) return out;
    out.B = q.res;

    // ── C · el mismo pase con el shock APAGADO: aquí sale el fallo ──────────────────────────────
    const shockPrevio = R.shockPiston;
    R.shockPiston = 0;
    q = await pase('C', true);
    R.shockPiston = shockPrevio;
    if (!q) return out;
    out.C = q.res;

    // ── D · el shock se agota solo, y aturdir(rig,0) lo despierta a mano ────────────────────────
    {
      desmontar();
      const rig = await nacer();
      if (!rig) return out;
      const x0 = donde(rig)[0];
      andarHacia(rig, PX - 4);
      E.aturdir(rig, 0.4);
      out.D = { puesto: rig.aturdido };
      const t0 = performance.now();
      let quieto = 0;
      while (performance.now() - t0 < 300) { await frame(); quieto = Math.abs(donde(rig)[0] - x0); }
      out.D.durante = { avance: quieto, queda: rig.aturdido };
      while (performance.now() - t0 < 1400) await frame();
      out.D.despues = { avance: Math.abs(donde(rig)[0] - x0), queda: rig.aturdido };
      // Y a mano: se le aturde largo y se le despierta en el acto.
      E.aturdir(rig, 5);
      out.D.largo = rig.aturdido;
      E.aturdir(rig, 0);
      out.D.despertado = rig.aturdido;
      // La lista lo enseña: «no anda» y «no puede llegar» se leen igual sin esta columna.
      const fila = E.lista().filter(f => f.id === rig.id)[0];
      out.D.enLista = fila && ('shock' in fila);
    }

    // ── limpieza ────────────────────────────────────────────────────────────────────────────────
    E.quitar();
    desmontar();
    beginBatch();
    tocadas.forEach(v => setVoxel(v[0], v[1], v[2], v[3]));
    endBatch();
    revisar(); ticks(30);
    mc.pos[0] = posPrevia[0]; mc.pos[1] = posPrevia[1]; mc.pos[2] = posPrevia[2];
    if (velPrevia && mc.vel) { mc.vel[0] = velPrevia[0]; mc.vel[1] = velPrevia[1]; mc.vel[2] = velPrevia[2]; }
    out.limpio = true;
    return out;
  });

  console.log('\nBUG-AG5 · el agente empujado se queda en «shock» y el pistón le gana\n');
  if (r.errs.length) r.errs.forEach(e => ok(false, e));
  if (r.faltan && r.faltan.length) ok(false, 'faltan materiales: ' + r.faltan.join(', '));

  ok(r.hayAturdir === true, 'la librería ofrece game.esqueletos.aturdir()');

  if (r.A && r.B && r.C) {
    console.log('\nA · la referencia: cuánto empuja el pistón a un agente que no le lleva la contraria');
    ok(r.A.cabeza === 'hab:piston-cabeza', 'el pistón se extiende y la cabeza sale en su celda', r.A.cabeza);
    // Los tres arrancan apoyados en el pistón, pero no en el mismo float: la marcha es un suavizado
    // exponencial y el último paso que CABE depende del dt de ese frame, así que el bicho se planta
    // asintóticamente y para donde para (~0,1 de dispersión). Por eso lo que se compara abajo son
    // las posiciones FINALES —el pistón empuja hasta el primer hueco, que es un sitio absoluto— y no
    // los deltas, que arrastrarían esa dispersión. La primera versión comparaba deltas y salían
    // 0,5 contra 0,94 sin que hubiera ningún fallo detrás.
    ok(Math.abs(r.A.antes[0] - r.B.antes[0]) < 0.15, 'los tres pases arrancan apoyados en el pistón',
       [r.A.antes[0], r.B.antes[0], r.C.antes[0]].map(r3).join(' / '));
    ok(r.A.dx > 0.5, 'el agente parado sale desplazado hacia +X', 'dx=' + r3(r.A.dx));
    ok(Math.abs(r.A.dy) < 0.1, '…y a la misma cota: no se le aúpa', 'dy=' + r3(r.A.dy));

    console.log('\nB · andando CONTRA el pistón: el shock hace que el empujón se complete igual');
    ok(r.B.cabeza === 'hab:piston-cabeza', 'el pistón se extiende con el agente andando encima', r.B.cabeza);
    ok(Math.abs(r.B.fin[0] - r.A.fin[0]) < 0.1, 'acaba EN EL MISMO SITIO que el agente parado: el empujón se completa',
       'andando=' + r3(r.B.fin[0]) + ' parado=' + r3(r.A.fin[0]) + ' · dx=' + r3(r.B.dx) + '/' + r3(r.A.dx));
    ok(r.B.dx > 0.5, '…y es un empujón de verdad, no un roce', 'dx=' + r3(r.B.dx));
    ok(Math.abs(r.B.dy) < 0.1, '…y no acaba con los pies encima de la cabeza', 'pico dy=' + r3(r.B.dy));
    ok(r.B.shockAlFinal >= 0, 'el shock se descuenta con el reloj', 'quedan ' + r3(r.B.shockAlFinal) + 's');

    console.log('\nC · el mismo pase con game.redstone.shockPiston = 0 — el fallo, tal cual');
    ok(r.C.cabeza === 'hab:piston-cabeza', 'el pistón también se extiende aquí', r.C.cabeza);
    // Esto es lo que convierte a B en un test y no en un adorno: sin shock, o se come el empujón o
    // se sube. Con que pase UNA de las dos ya se ve la diferencia; suele pasar la primera.
    const seLoCome = r.C.fin[0] < r.B.fin[0] - 0.2, seSube = r.C.dy > r.B.dy + 0.2;
    ok(seLoCome || seSube, 'sin shock el agente GANA: o se come el desplazamiento o se sube encima',
       'acaba en ' + r3(r.C.fin[0]) + ' vs ' + r3(r.B.fin[0]) + ' · dy=' + r3(r.C.dy) + ' vs ' + r3(r.B.dy));
    ok(r.C.shockAlFinal === 0, 'y con shockPiston = 0 no se le aturde nada', String(r.C.shockAlFinal));
  } else {
    ok(false, 'los tres pases no llegaron a medirse');
  }

  if (r.D) {
    console.log('\nD · el shock es un plazo, no un estado del que no se sale');
    ok(Math.abs(r.D.puesto - 0.4) < 1e-6, 'aturdir(rig, 0.4) apunta el plazo', String(r.D.puesto));
    ok(r.D.durante.avance < 0.05, 'mientras dura no avanza ni un voxel', 'avance=' + r3(r.D.durante.avance));
    ok(r.D.despues.queda === 0, 'el plazo se agota solo', String(r.D.despues.queda));
    ok(r.D.despues.avance > 0.5, '…y entonces vuelve a andar', 'avance=' + r3(r.D.despues.avance));
    ok(r.D.largo === 5, 'aturdir(rig, 5) se queda con el plazo largo', String(r.D.largo));
    ok(r.D.despertado === 0, 'aturdir(rig, 0) lo despierta en el acto', String(r.D.despertado));
    ok(r.D.enLista === true, 'game.esqueletos.lista() enseña la columna «shock»');
  } else {
    ok(false, 'el tramo D no llegó a medirse');
  }

  ok(r.limpio === true, 'el banco de pruebas se recoge entero');
  ok(errores.length === 0, 'sin errores de página', errores.join(' | ').slice(0, 200));

  console.log(fallos ? '\n' + fallos + ' fallo(s)\n' : '\nTODO OK\n');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
