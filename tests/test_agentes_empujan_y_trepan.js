// @area: agentes
// @necesita: servidor, playwright
// REQ-AG17 · «un agente no debería meterse en el espacio de otro, debería empujarlo como mucho
//             procurando detenerse cuando el otro agente no le deje pasar.»
// REQ-AG18 · «cuántos bloques sube un agente DE UNA VEZ, configurable; ahora mismo se teletransporta
//             hasta arriba sin importar cuánto de hondo cayó.»
//
// Los dos son de `game.esqueletos` (los rigs articulados), que es como los acotó el dueño, y los dos
// viven en el snippet `mundo-autoarranque` — en `app.js` no se toca nada.
//
// Lo que se mide, sobre el zombie de disco y con el motor de verdad:
//
//   A · dos agentes hacia el mismo sitio NO acaban en la misma coordenada (la queja: la sonda del
//       ticket los midió a 3 MILÉSIMAS de bloque, o sea uno dentro del otro).
//   B · el de atrás EMPUJA al de delante: el empujado se mueve, no se le atraviesa.
//   C · con el empujado contra un muro, el de atrás SE PARA y lo dice («bloqueada», por = 3).
//   F · REQ-AG17b, el caso DIFÍCIL que destapó el dueño: dos agentes persiguiendo AL JUGADOR quieto
//       con la misma `distancia`, o sea los dos yendo al mismo punto del anillo que le rodea. Aquí
//       no basta con prohibir el paso: hay que separarlos (`separarDeAgentes`), y el perdón al par
//       ya solapado tiene que ser CONDICIONAL o se vuelven invisibles el uno para el otro.
//   G · REQ-AG17b, el puñetazo: `empujar()` va por `moverRaiz`, que no preguntaba por los demás
//       agentes. Un bicho al que pegas sale despedido y NO puede atravesar al de al lado.
//   D · `andar.escalar` manda: 0 no trepa ni el escalón, 1 sube un escalón y no sale de un hoyo de 3,
//       y 3 sí sale. Y el escalón de andar sigue siendo UNO por mucho que suba al atascarse.
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node tests/test_agentes_empujan_y_trepan.js [url]     por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (cond, txt, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  FALLA ') + txt + (extra !== undefined && extra !== '' ? '   · ' + extra : ''));
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
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };
    const esperar = (ms) => new Promise(res => setTimeout(res, ms));
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(res => requestAnimationFrame(res)); };

    // ── un descampado de aire con suelo macizo: 24 × 8 × 10 ──────────────────────────────────────
    const AN = 24, AL = 8, PR = 10;
    let caja = null;
    const yTop = Math.min(38, mc.dim.y - AL - 2);
    for (let y = 8; y < yTop && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el descampado'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;
    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    const idRoca = mc.name2id['asset:assets/roca.vox.json'] || idSuelo;
    for (let i = -1; i <= AN; i++) for (let k = -1; k <= PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);
    await esperar(400);

    const ZC = Z + 5;                                   // el pasillo por el que andan todos
    // El zombie de disco no trae `vision` (o sea 180) y nace mirando a -z; aqui el objetivo es un
    // PUNTO fijo, que no pasa por el cono (BUG-AG10 solo ciega contra el jugador), asi que da igual.
    const plantar = async (x, z, cfg) => {
      const rig = await game.esqueletos.crear('zombie', x, Y, z);
      if (!rig) return null;
      for (let i = 0; i < 200 && !rig.partes.every(P => P.s); i++) await esperar(50);
      if (!rig.partes.every(P => P.s)) return null;
      rig.G.porClave = false;
      rig.G.deteccion = 0;                              // 0 = «siempre le ve»: no se rinde a mitad
      rig.G.correa = 0;
      rig.G.distancia = 0.3;
      rig.G.velocidad = 3;
      Object.assign(rig.G, cfg || {});
      return rig;
    };
    const g_ = (rig) => rig.partes[0].s._sig || { x: 0, y: 0, z: 0 };
    const cajaDe = (rig) => {                           // la caja del CUERPO, ya desplazada
      const c = rig.cuerpo, g = g_(rig);
      return [c[0] + g.x, c[1] + g.y, c[2] + g.z, c[3] + g.x, c[4] + g.y, c[5] + g.z];
    };
    const cen = (rig) => { const a = cajaDe(rig); return [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2]; };
    const solapan = (A, B) => A[0] < B[3] - 1e-4 && A[3] > B[0] + 1e-4
                           && A[1] < B[4] - 1e-4 && A[4] > B[1] + 1e-4
                           && A[2] < B[5] - 1e-4 && A[5] > B[2] + 1e-4;

    // ── A · dos hacia el mismo sitio: se tocan, no se funden ─────────────────────────────────────
    {
      game.esqueletos.quitar();
      const meta = [X + 12, Y, ZC];
      const a1 = await plantar(X + 6, ZC, { objetivo: meta });
      const a2 = await plantar(X + 18, ZC, { objetivo: meta });
      if (!a1 || !a2) { out.errs.push('A: no se pudieron plantar los dos'); }
      else {
        await frames(300);
        const cA = cajaDe(a1), cB = cajaDe(a2);
        out.A = { cajaA: cA.map(v => +v.toFixed(3)), cajaB: cB.map(v => +v.toFixed(3)),
                  solapan: solapan(cA, cB),
                  distCentros: +Math.hypot(cen(a1)[0] - cen(a2)[0], cen(a1)[2] - cen(a2)[2]).toFixed(3),
                  ancho: +(a1.cuerpo[3] - a1.cuerpo[0]).toFixed(3) };
      }
      game.esqueletos.quitar();
    }

    // ── B · el de atras empuja al de delante ─────────────────────────────────────────────────────
    {
      game.esqueletos.quitar();
      // El de delante esta QUIETO en medio del pasillo; el de atras quiere llegar al otro extremo,
      // asi que la unica forma de pasar es apartarlo.
      const parado = await plantar(X + 12, ZC, { quieto: true });
      const empuja = await plantar(X + 8, ZC, { objetivo: [X + 20, Y, ZC], velocidad: 3 });
      if (!parado || !empuja) { out.errs.push('B: no se pudieron plantar los dos'); }
      else {
        const x0 = cen(parado)[0], xe0 = cen(empuja)[0];
        await frames(300);
        const cP = cajaDe(parado), cE = cajaDe(empuja);
        out.B = { movidoElParado: +(cen(parado)[0] - x0).toFixed(3),
                  avanzoElQueEmpuja: +(cen(empuja)[0] - xe0).toFixed(3),
                  solapan: solapan(cP, cE),
                  seLoAtraveso: cen(empuja)[0] > cen(parado)[0] + 1e-3 };
      }
      game.esqueletos.quitar();
    }

    // ── C · con el empujado contra un muro, el de atras SE PARA y lo dice ────────────────────────
    {
      game.esqueletos.quitar();
      const XM = X + 16;                                 // muro de 3 de alto, de pared a pared
      for (let j = 0; j < 3; j++) for (let k = -1; k <= PR; k++) pon(XM, Y + j, Z + k, idRoca);
      await esperar(500);
      const parado = await plantar(XM - 2, ZC, { quieto: true });
      const empuja = await plantar(XM - 4, ZC, { objetivo: [X + 22, Y, ZC], velocidad: 3 });
      if (!parado || !empuja) { out.errs.push('C: no se pudieron plantar los dos'); }
      else {
        await frames(400);
        const cP = cajaDe(parado), cE = cajaDe(empuja);
        out.C = { por: g_(empuja).por, solapan: solapan(cP, cE),
                  bordeDelanteroEmpujador: +cE[3].toFixed(3),
                  bordeTraseroParado: +cP[0].toFixed(3),
                  muroEn: XM,
                  cruzoElMuro: cE[3] > XM + 1e-3 };
      }
      game.esqueletos.quitar();
      for (let j = 0; j < 3; j++) for (let k = -1; k <= PR; k++) pon(XM, Y + j, Z + k, 0);
      await esperar(400);
    }

    // ── D · REQ-AG18: `escalar` manda cuanto sube DE UNA VEZ al atascarse ────────────────────────
    {
      // Un hoyo de 3 de hondo, y el agente dentro con la meta fuera. Sin trepar no sale jamas.
      const XH = X + 4, ZH = Z + 2;
      const hoyo = (abrir) => {
        for (let j = 1; j <= 3; j++) for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++)
          pon(XH + i, Y - j, ZH + k, abrir ? 0 : idSuelo);
        for (let j = 1; j <= 3; j++) {                   // las paredes del hoyo
          for (let i = -1; i <= 3; i++) { pon(XH + i, Y - j, ZH - 1, idSuelo); pon(XH + i, Y - j, ZH + 3, idSuelo); }
          for (let k = -1; k <= 3; k++) { pon(XH - 1, Y - j, ZH + k, idSuelo); pon(XH + 3, Y - j, ZH + k, idSuelo); }
        }
        for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) pon(XH + i, Y - 4, ZH + k, idSuelo);
      };
      const sale = async (escalar) => {
        game.esqueletos.quitar();
        hoyo(true);
        await esperar(500);
        const rig = await plantar(XH + 1, ZH + 1, { objetivo: [X + 20, Y, ZC], velocidad: 3 });
        if (!rig) return null;
        rig.escalar = escalar;
        const g = g_(rig);
        g.y -= 3;                                        // se le deja en el FONDO del hoyo
        const y0 = cajaDe(rig)[1];
        await frames(420);
        const y1 = cajaDe(rig)[1];
        game.esqueletos.quitar();
        return { escalar, subio: +(y1 - y0).toFixed(3), pieFinal: +y1.toFixed(3), fondo: +y0.toFixed(3) };
      };
      out.D = { hoyo3_escalar0: await sale(0), hoyo3_escalar1: await sale(1), hoyo3_escalar3: await sale(3) };
      hoyo(false);
      await esperar(400);

      // Y el escalon de ANDAR sigue siendo uno, no `escalar`: un peldaño de 1 se sube siempre.
      const XE = X + 8;
      for (let k = -1; k <= PR; k++) pon(XE, Y, Z + k, idRoca);
      await esperar(500);
      game.esqueletos.quitar();
      const sube = await plantar(XE - 3, ZC, { objetivo: [X + 20, Y + 1, ZC], velocidad: 3 });
      if (sube) {
        // El peldaño tiene UN bloque de ancho: se sube y se baja al otro lado, asi que el final no
        // dice nada. Lo que se mide es el TECHO del recorrido y que en ningun frame se cuele por
        // dentro (el pie por debajo del suelo del peldaño mientras esta sobre su columna).
        const y0 = cajaDe(sube)[1];
        let tope = y0, atraveso = false;
        for (let t = 0; t < 300; t++) {
          await frames(1);
          const c = cajaDe(sube);
          if (c[1] > tope) tope = c[1];
          if (c[0] < XE + 1 - 1e-3 && c[3] > XE + 1e-3 && c[1] < Y + 1 - 1e-3) atraveso = true;
        }
        out.E = { subioElPeldaño: +(tope - y0).toFixed(3), cruzo: cen(sube)[0] > XE + 1, atraveso };
      }
      game.esqueletos.quitar();
      for (let k = -1; k <= PR; k++) pon(XE, Y, Z + k, 0);
    }

    // ── F · REQ-AG17b · dos persiguiendo AL JUGADOR quieto: el caso que reprodujo el dueño ───────
    {
      game.esqueletos.quitar();
      // El jugador, plantado en medio: los dos quieren el MISMO punto del anillo a `distancia` de
      // el. Antes esto acababa con las dos cajas en la misma coordenada (3 milesimas de bloque).
      mc.pos[0] = X + 12.5; mc.pos[1] = Y; mc.pos[2] = ZC + 0.5;
      mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
      const uno = await plantar(X + 4, ZC, { objetivo: 'jugador', distancia: 2, deteccion: 0, vision: 360 });
      const dos = await plantar(X + 6, ZC, { objetivo: 'jugador', distancia: 2, deteccion: 0, vision: 360 });
      if (!uno || !dos) { out.errs.push('F: no se pudieron plantar los dos'); }
      else {
        let nSolape = 0, peor = 0;
        for (let t = 0; t < 600; t++) {
          await frames(1);
          const a = cajaDe(uno), b = cajaDe(dos);
          if (solapan(a, b)) {
            nSolape++;
            const ov = Math.min(a[3] - b[0], b[3] - a[0], a[5] - b[2], b[5] - a[2]);
            if (ov > peor) peor = ov;
          }
        }
        const a = cajaDe(uno), b = cajaDe(dos);
        out.F = { framesConSolape: nSolape, de: 600, penetracionMax: +peor.toFixed(3),
                  solapanAlFinal: solapan(a, b),
                  distCentros: +Math.hypot(cen(uno)[0] - cen(dos)[0], cen(uno)[2] - cen(dos)[2]).toFixed(3),
                  ancho: +(uno.cuerpo[3] - uno.cuerpo[0]).toFixed(3) };
      }
      game.esqueletos.quitar();
    }

    // ── G · REQ-AG17b · el puñetazo: sale despedido, pero no atraviesa a nadie ───────────────────
    {
      game.esqueletos.quitar();
      // Un pasillo de roca para que no haya rodeo posible: el que sale despedido tiene que empujar
      // al de delante o pararse, pero no puede escurrirse por el lado.
      // OJO con donde van las paredes: el cuerpo del zombie mide 0.8 y nace CENTRADO en z = ZC, o
      // sea que ocupa [ZC-0.4, ZC+0.4] y pisa las DOS celdas ZC-1 y ZC. Emparedarlo en ZC±1 lo deja
      // tocando la pared y no se mueve ni un milimetro. Las paredes van en ZC-2 y ZC+1, que dejan
      // libre z ∈ [ZC-1, ZC+1]: 0.6 de holgura a cada lado, menos que los 0.8 que necesitaria para
      // adelantar al de delante por fuera.
      for (let i = 4; i <= 20; i++) for (let j = 0; j < 3; j++) {
        pon(X + i, Y + j, ZC - 2, idRoca); pon(X + i, Y + j, ZC + 1, idRoca);
      }
      mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
      await esperar(400);
      // Dos QUIETOS en fila, pegados el uno al otro por delante; el jugador detras del primero, que
      // es de donde sale el empujon (empujar() lanza en la direccion jugador → agente).
      const golpeado = await plantar(X + 8, ZC, { quieto: true });
      const escudo = await plantar(X + 10, ZC, { quieto: true });
      if (!golpeado || !escudo) { out.errs.push('G: no se pudieron plantar los dos'); }
      else {
        mc.pos[0] = X + 6; mc.pos[1] = Y; mc.pos[2] = ZC + 0.5;
        mc.vel[0] = mc.vel[1] = mc.vel[2] = 0;
        await frames(30);
        const xEsc0 = cen(escudo)[0], xGol0 = cen(golpeado)[0];
        game.esqueletos.empujar(golpeado, 40);      // fuerza 40: al aire libre son METROS
        let nSolape = 0, brinco = 0, dzAlCruzar = null;
        for (let t = 0; t < 240; t++) {
          await frames(1);
          if (golpeado.mov && golpeado.mov.alto > brinco) brinco = golpeado.mov.alto;
          if (solapan(cajaDe(golpeado), cajaDe(escudo))) nSolape++;
          // El instante en que le pasa por delante: si lo adelanta, tiene que ser RODEANDOLO, o sea
          // apartado en z lo suyo. Si lo adelantase con los centros alineados seria un atravesar.
          if (dzAlCruzar === null && cen(golpeado)[0] > cen(escudo)[0])
            dzAlCruzar = +Math.abs(cen(golpeado)[2] - cen(escudo)[2]).toFixed(3);
        }
        out.G = { framesConSolape: nSolape, brincoMax: +brinco.toFixed(3),
                  volo: +(cen(golpeado)[0] - xGol0).toFixed(3),
                  movioAlEscudo: +(cen(escudo)[0] - xEsc0).toFixed(3),
                  loAdelanto: cen(golpeado)[0] > cen(escudo)[0] + 1e-3,
                  dzAlCruzar, ancho: +(golpeado.cuerpo[5] - golpeado.cuerpo[2]).toFixed(3),
                  solapanAlFinal: solapan(cajaDe(golpeado), cajaDe(escudo)) };
      }
      game.esqueletos.quitar();
      await esperar(400);   // el pasillo lo deshace el restaurado de `tocadas`, al final
    }

    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 2, Z - 2, X + AN + 2, Z + PR + 2);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja));
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));

  console.log('\nREQ-AG17 · A · dos agentes al mismo sitio no acaban en la misma coordenada');
  console.log('    ' + JSON.stringify(r.A));
  ok(!!r.A, 'hubo medida');
  if (r.A) {
    ok(r.A.solapan === false, 'las dos cajas de cuerpo NO se solapan');
    ok(r.A.distCentros > r.A.ancho - 1e-2,
      'y estan separados al menos su propio ancho', r.A.distCentros + ' vs ancho ' + r.A.ancho);
  }

  console.log('\nREQ-AG17 · B · el de atras EMPUJA al de delante, no lo atraviesa');
  console.log('    ' + JSON.stringify(r.B));
  ok(!!r.B, 'hubo medida');
  if (r.B) {
    ok(r.B.movidoElParado > 0.3, 'al parado lo han movido de su sitio', r.B.movidoElParado + ' bloques');
    ok(r.B.avanzoElQueEmpuja > 0.3, 'y el que empuja ha avanzado', r.B.avanzoElQueEmpuja + ' bloques');
    ok(r.B.solapan === false, 'sin meterse uno dentro del otro');
    ok(r.B.seLoAtraveso === false, 'ni adelantarlo por dentro');
  }

  console.log('\nREQ-AG17 · C · si el otro no le deja pasar, se PARA (y lo dice)');
  console.log('    ' + JSON.stringify(r.C));
  ok(!!r.C, 'hubo medida');
  if (r.C) {
    ok(r.C.cruzoElMuro === false, 'no ha cruzado el muro', 'borde=' + r.C.bordeDelanteroEmpujador + ' muro en ' + r.C.muroEn);
    ok(r.C.solapan === false, 'ni se ha metido dentro del que tiene delante');
    ok(r.C.por === 3, '...y su estado es "bloqueada" (por = 3)', 'por=' + r.C.por);
  }

  console.log('\nREQ-AG17b · F · dos persiguiendo AL JUGADOR quieto (el caso que reprodujo el dueño)');
  console.log('    ' + JSON.stringify(r.F));
  ok(!!r.F, 'hubo medida');
  if (r.F) {
    ok(r.F.framesConSolape === 0, 'ni un solo frame metidos el uno dentro del otro',
      r.F.framesConSolape + ' de ' + r.F.de + ' · penetracion max ' + r.F.penetracionMax);
    ok(r.F.solapanAlFinal === false, 'y acaban separados, no clavados en el mismo sitio',
      'centros a ' + r.F.distCentros + ' (ancho ' + r.F.ancho + ')');
  }

  console.log('\nREQ-AG17b · G · el puñetazo sale despedido pero no atraviesa a nadie');
  console.log('    ' + JSON.stringify(r.G));
  ok(!!r.G, 'hubo medida');
  if (r.G) {
    ok(r.G.brincoMax > 0.05, 'el golpe le hace pegar un brinco (si no, no se prueba nada)',
      'alto max ' + r.G.brincoMax);
    ok(r.G.volo > 0.3, 'y sale despedido de verdad', r.G.volo + ' bloques');
    ok(r.G.framesConSolape === 0, 'sin meterse ni un frame dentro del que tiene delante',
      r.G.framesConSolape + ' frame(s)');
    ok(r.G.movioAlEscudo > 0.3, 'lo que hace es EMPUJARLO por delante', r.G.movioAlEscudo + ' bloques');
    // ⚠️ Esta es LA medida del caso, y el «framesConSolape === 0» de arriba solo no vale: el
    // puñetazo gasta la fuerza en `mov.vx * dt`, o sea pasos de 0,67 a 60 fps (y de 3 o 4 en un
    // frame lento) con un cuerpo de 0,8 — se plantaba al otro lado sin que NINGUN frame los viera
    // solapados. Se mide en el instante del cruce: si lo adelanta, tiene que estar apartado a un
    // lado por lo menos su propio ancho, que es rodearlo. Menos que eso es habersele atravesado.
    ok(r.G.loAdelanto === false || r.G.dzAlCruzar >= r.G.ancho - 1e-3,
      'y si lo adelanta es rodeandolo por el lado, nunca por dentro',
      r.G.loAdelanto ? ('apartado ' + r.G.dzAlCruzar + ' al cruzar, ancho ' + r.G.ancho)
                     : 'no llego a adelantarlo');
  }

  console.log('\nREQ-AG18 · D · `escalar` manda cuanto sube DE UNA VEZ al atascarse');
  console.log('    ' + JSON.stringify(r.D));
  ok(!!(r.D && r.D.hoyo3_escalar0 && r.D.hoyo3_escalar1 && r.D.hoyo3_escalar3), 'hubo medida');
  if (r.D && r.D.hoyo3_escalar3) {
    ok(r.D.hoyo3_escalar0.subio < 0.1, 'escalar:0 no sale del hoyo de 3 (ni trepa ni escalon)',
      'subio ' + r.D.hoyo3_escalar0.subio);
    ok(r.D.hoyo3_escalar1.subio < 1.5, 'escalar:1 tampoco: un escalon no saca de un hoyo de 3',
      'subio ' + r.D.hoyo3_escalar1.subio);
    ok(r.D.hoyo3_escalar3.subio > 2.5, 'escalar:3 SI sale, que es lo que pidio el dueño',
      'subio ' + r.D.hoyo3_escalar3.subio);
  }

  console.log('\nREQ-AG18 · E · andando el escalon sigue siendo UNO, pase lo que pase');
  console.log('    ' + JSON.stringify(r.E));
  if (r.E) {
    ok(Math.abs(r.E.subioElPeldaño - 1) < 0.2, 'sube el peldaño de 1 sin despeinarse', 'subio ' + r.E.subioElPeldaño);
    ok(r.E.cruzo === true, 'y sigue su camino al otro lado');
    ok(r.E.atraveso === false, '...POR ENCIMA, no atravesandolo');
  } else ok(false, 'hubo medida del peldaño');

  ok(errores.length === 0, 'sin errores de pagina', errores.slice(0, 3).join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
