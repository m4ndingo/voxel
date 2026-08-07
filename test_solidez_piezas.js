// BUG-AG4 · «puedo subirme al torso de un agente pero no a su cabeza, que parecería sólida pero no,
// la traspaso al subirme encima y caigo en el torso».
//
// De las 6 piezas de un zombie solo el TORSO era sólido: la solidez de una pieza movida la ponía el
// envoltorio de `mcFineBoxHit` restando `s._sig` a la caja de consulta, y `_sig` solo lo lleva la
// raíz. Ahora cada pieza se sondea pasando la caja por la INVERSA de su matriz de mundo, así que es
// sólida donde se la dibuja — cabeza y extremidades incluidas.
//
// Lo que se mide, y por qué cada cosa:
//
//   · cada pieza frena EN SU SITIO (el sitio sale de su matriz, no de dónde se estampó),
//   · su ANCLA no frena: si la caja se quedara en la celda de estampado habría un muro invisible,
//     que es peor que el fallo original,
//   · `solidez:'raiz'` devuelve el comportamiento viejo (la válvula de escape),
//   · y sin agentes no cambia nada: la colisión del terreno tiene que dar exactamente lo de antes.
//
// No persiste nada: bloquea los POST y retira los agentes que crea.
//
//   node test_solidez_piezas.js [url]        por defecto http://localhost:8500/map/test
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
    if (out.piezas < 3) { out.errs.push('el zombie tiene ' + out.piezas + ' piezas: muy pocas para este test'); return out; }

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
    if (!sitio) { out.errs.push('no encuentro un claro donde plantar el agente'); return out; }
    const [X, Y, Z] = sitio;

    const f = v => Math.floor(v * MC_TILE);
    // El punto medio de una caja, en voxel fino. Se sondea un voxel suelto y no una loncha: entre
    // las piernas de un zombie hay aire, y una loncha del ancho del bicho mide ese aire.
    const solidoEn = (x, y, z) => mcFineBoxHit(f(x), f(y), f(z), f(x), f(y), f(z));

    // Dónde está una pieza DE VERDAD: su caja local pasada por su matriz de mundo, que es lo mismo
    // que hace el dibujo. Sin matriz (pieza aún sin posar) es su caja tal cual.
    const cajaVista = (s) => {
      const a = s.aabb, m = s.model;
      if (!m) return a.slice();
      let c = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 8; i++) {
        const px = (i & 1) ? a[3] : a[0], py = (i & 2) ? a[4] : a[1], pz = (i & 4) ? a[5] : a[2];
        const qx = m[0] * px + m[4] * py + m[8] * pz + m[12];
        const qy = m[1] * px + m[5] * py + m[9] * pz + m[13];
        const qz = m[2] * px + m[6] * py + m[10] * pz + m[14];
        if (qx < c[0]) c[0] = qx; if (qx > c[3]) c[3] = qx;
        if (qy < c[1]) c[1] = qy; if (qy > c[4]) c[4] = qy;
        if (qz < c[2]) c[2] = qz; if (qz > c[5]) c[5] = qz;
      }
      return c;
    };
    const centro = (c) => [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, (c[2] + c[5]) / 2];

    // ⚠️ Hay que dejar correr el bucle: la solidez de un rig la pone `golpe`, que solo entra si el
    // contador de piezas posadas es > 0 — y ese lo recalcula el tick, no `crear()`. Midiendo sin
    // esperar, un agente recién creado parece un fantasma y el test saldría verde por lo contrario.
    const conAgente = async (extra, fn) => {
      const d = JSON.parse(JSON.stringify(def));
      if (extra) for (const k in extra) d[k] = extra[k];
      const rig = await game.esqueletos.crear(d, X + 4, Y, Z + 4);
      if (!rig) return null;
      await new Promise(res => setTimeout(res, 800));
      let res = null;
      try { res = fn(rig); } finally { game.esqueletos.quitar(rig); }
      return res;
    };

    // 1. Sin agentes: la colisión del terreno, tal cual. Es la línea base de «no he roto nada».
    const sondasSueltas = [];
    for (let i = 0; i < 40; i++) {
      const x = X + (i % 8), y = Y + (i % 5), z = Z + ((i * 3) % 8);
      sondasSueltas.push([x + 0.5, y + 0.5, z + 0.5]);
    }
    out.antes = sondasSueltas.map(q => solidoEn(q[0], q[1], q[2]));

    // 2. Cada pieza, en su sitio y en su ancla.
    out.piezasMed = await conAgente(null, (rig) => {
      return rig.partes.map((P) => {
        const s = P.s;
        if (!s || !s.aabb) return { nombre: P.nombre, sinPieza: true };
        const c = cajaVista(s), q = centro(c);
        return {
          nombre: P.nombre, raiz: !!s._rigRaiz, conMatriz: !!s.model,
          solidaDondeSeVe: solidoEn(q[0], q[1], q[2])
        };
      });
    });

    // 2.b Y al revés: nada frena DONDE NO SE VE NADA. Es la mitad que de verdad importa — restar mal
    // la matriz no deja al agente sin colisión, deja un muro invisible en la celda donde se estampó,
    // que es peor que el fallo original. No vale sondear el ancla de cada pieza: la de un brazo cae
    // dentro del TORSO dibujado y ahí frenar es correcto. Así que se barre el volumen entero y se
    // exige que todo lo que se volvió sólido al plantar al bicho esté dentro de alguna pieza.
    out.barrido = await conAgente(null, (rig) => {
      const cajas = rig.partes.map(P => P.s && P.s.aabb ? cajaVista(P.s) : null).filter(Boolean);
      const M = 0.02;   // el borde de la caja se toca sin estar dentro: un pelo de holgura
      const dentroDeAlguna = (x, y, z) => cajas.some(c =>
        x >= c[0] - M && x <= c[3] + M && y >= c[1] - M && y <= c[4] + M && z >= c[2] - M && z <= c[5] + M);
      let n = 0, solidos = 0, huerfanos = 0, muestra = null;
      for (let i = 0; i <= 36; i++) for (let j = 0; j <= 36; j++) for (let k = 0; k <= 36; k++) {
        const x = X + 1 + i * (6 / 36), y = Y + j * (5 / 36), z = Z + 1 + k * (6 / 36);
        n++;
        if (!solidoEn(x, y, z)) continue;
        solidos++;
        if (!dentroDeAlguna(x, y, z)) {
          huerfanos++;
          if (!muestra) muestra = [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100];
        }
      }
      return { n, solidos, huerfanos, muestra };
    });

    // 3. La válvula de escape: solidez:'raiz' vuelve al comportamiento viejo.
    out.soloRaiz = await conAgente({ solidez: 'raiz' }, (rig) => {
      return rig.partes.map((P) => {
        const s = P.s;
        if (!s || !s.aabb) return { nombre: P.nombre, sinPieza: true };
        const q = centro(cajaVista(s));
        return { nombre: P.nombre, raiz: !!s._rigRaiz, solidaDondeSeVe: solidoEn(q[0], q[1], q[2]) };
      });
    });

    // 4. Y al retirarlo, el mundo vuelve a estar como estaba: ni rastro de las piezas.
    await new Promise(res => setTimeout(res, 400));
    out.despues = sondasSueltas.map(q => solidoEn(q[0], q[1], q[2]));
    out.vivos = game.esqueletos.lista ? game.esqueletos.lista().length : 0;
    return out;
  });

  console.log('\nBUG-AG4 · la solidez de un agente sigue a su matriz\n');
  r.errs.forEach(e => ok(false, 'preparación', e));

  if (r.piezasMed) {
    console.log('Cada pieza frena DONDE SE LA VE (antes solo el torso)');
    const conM = r.piezasMed.filter(P => P.conMatriz);
    ok(conM.length === r.piezasMed.length, 'todas las piezas tienen matriz de mundo',
      conM.length + '/' + r.piezasMed.length);
    r.piezasMed.forEach(P => {
      if (P.sinPieza) { ok(false, 'la pieza "' + P.nombre + '" no se estampó'); return; }
      ok(P.solidaDondeSeVe === true, 'frena en "' + P.nombre + '"' + (P.raiz ? ' (raíz)' : ''));
    });
    const noRaiz = r.piezasMed.filter(P => !P.raiz && !P.sinPieza);
    ok(noRaiz.length >= 2, 'y hay piezas que no son la raíz que comprobar', noRaiz.length);

  }

  if (r.barrido) {
    console.log('\nY nada frena donde no se ve nada (el muro invisible en el ancla)');
    const B = r.barrido;
    ok(B.solidos > 50, 'el barrido encuentra el bicho', B.solidos + ' puntos sólidos de ' + B.n);
    ok(B.huerfanos === 0, 'ni un punto sólido fuera del dibujo',
      B.huerfanos ? B.huerfanos + ' huérfanos, p.ej. ' + (B.muestra || []).join(',') : '0');
  }

  if (r.soloRaiz) {
    console.log('\nLa válvula de escape: solidez:"raiz" deja solo el torso');
    const raiz = r.soloRaiz.find(P => P.raiz), resto = r.soloRaiz.filter(P => !P.raiz && !P.sinPieza);
    ok(raiz && raiz.solidaDondeSeVe === true, 'la raíz sigue frenando');
    ok(resto.length >= 2 && resto.every(P => P.solidaDondeSeVe === false),
      'y ninguna otra pieza frena', resto.map(P => P.nombre).join(', '));
  }

  console.log('\nSin agentes, el mundo es el de siempre');
  if (r.antes && r.despues) {
    ok(r.antes.join() === r.despues.join(), 'las mismas 40 sondas dan lo mismo antes y después',
      r.antes.filter(Boolean).length + ' sólidas');
  }
  ok(r.vivos === 0, 'los agentes de prueba se retiran del mundo', r.vivos);
  ok(errores.length === 0, 'sin errores de página', errores.slice(0, 2).join(' | '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
