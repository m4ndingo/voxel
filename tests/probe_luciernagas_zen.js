// @area: render
// @necesita: servidor, playwright
// SONDA (no guardián): mide en el mapa `santuario-zen` CUÁNTA luz de las luciérnagas llega a las
// PAREDES con cada bake (fotos #116 con la Ley / #117 con la LUT).
//
// ⛔ NADA DE MEDIR PÍXELES AQUÍ: el santuario mueve la cámara por su cuenta y el encuadre no se deja
// fijar (re-afirmarlo antes de cada toma tampoco basta; en una prueba acabó dentro de la geometría).
// Todo lo que se mide es el CAMPO, que no depende del ojo — y se comprueba con `cajaRecortada`, que
// debe salir false: si saliera true la caja la estaría recortando el ojo y la comparación no valdría.
//
// El dueño ve que con `game.luzLey.on()` las luciérnagas no derraman sobre la madera. Las dos fotos
// traen el volcado `mcLuzDiag`: 160 semillas, todas voxelUI, **`nivel: 4`**, `sub: 8` en ambas. Con
// alcance 4 la luz muere a 4 bloques — la Ley lo respeta y la LUT no. Así que la pregunta que mide
// esta sonda NO es «cuál brilla más» (eso ya se sabe) sino: **¿con qué alcance LEGAL la Ley iguala o
// supera el derrame de la LUT, y cuánto cuesta?**
//
//   node tests/probe_luciernagas_zen.js [url]
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/santuario-zen';
const FOTO = { pos: [45.06, 16, 47.07], yaw: 167, pitch: -10 };   // ficha de la foto #116
const RONDAS = 2;
const TOMAS = 3;

// Escenarios: la LUT tal cual está en HEAD, y la Ley al alcance de la foto y subiéndolo.
const ESCENARIOS = [
  { id: 'LUT_a4', ley: false, alcance: 4 },
  { id: 'LEY_a4', ley: true, alcance: 4 },
  { id: 'LEY_a8', ley: true, alcance: 8 },
  { id: 'LEY_a12', ley: true, alcance: 12 }
];

const SNIPPET = execFileSync('python3', [__dirname + '/../herramientas/crea_snp_luz_ley.py', '--ver'],
  { encoding: 'utf8', cwd: __dirname + '/..' });

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(12000);   // el santuario arranca su snippet y enciende las luciérnagas

  await page.evaluate(f => {
    // El santuario mueve la cámara al arrancar (y la sigue moviendo), así que el encuadre NO se puede
    // poner una vez: hay que re-afirmarlo justo antes de cada toma o se mide una vista aérea de la isla.
    window.__encuadra = () => {
      mc.pos[0] = f.pos[0]; mc.pos[1] = f.pos[1]; mc.pos[2] = f.pos[2];
      mc.yaw = f.yaw * Math.PI / 180; mc.pitch = f.pitch * Math.PI / 180;
      if (mc.vel) { mc.vel[0] = mc.vel[1] = mc.vel[2] = 0; }
    };
    window.__encuadra();
    // CARAS DE PARED · métrica que NO depende de la cámara: celdas de AIRE pegadas a un bloque sólido
    // (es decir, la cara de pared que el ojo ve iluminada) que reciben al menos un subnivel de luz
    // dinámica. Es exactamente «¿las luciérnagas alumbran las paredes?» en números.
    window.__caras = () => {
      const D = mc.dynLight; if (!D) return { caras: 0, nivelMedio: 0 };
      let caras = 0, suma = 0;
      const solido = (x, y, z) => mcSolid(x, y, z);   // el mismo que usan mallado y rayo (⛔ no se parchea)
      for (let y = D.y0; y <= D.y0 + D.H - 1; y += 2)
        for (let z = D.z0; z <= D.z0 + D.P - 1; z += 2)
          for (let x = D.x0; x <= D.x0 + D.W - 1; x += 2) {
            if (solido(x, y, z)) continue;                       // el aire es quien lleva la luz
            if (!(solido(x + 1, y, z) || solido(x - 1, y, z) || solido(x, y + 1, z) ||
                  solido(x, y - 1, z) || solido(x, y, z + 1) || solido(x, y, z - 1))) continue;
            const n = mcDynNivel(x, y, z);
            if (n >= 1) { caras++; suma += n; }
          }
      return { caras, nivelMedio: caras ? +(suma / caras).toFixed(3) : 0 };
    };
    window.__mide = () => {
      const D = mc.dynLight;
      let maxA = 0, nz = 0;
      if (D) for (let i = 0; i < D.vol; i++) { const a = D.BL[i * 4 + 3]; if (a) { nz++; if (a > maxA) maxA = a; } }
      const d = game.luzDiag(), c = window.__caras();
      return {
        carasDePared: c.caras, nivelMedioEnPared: c.nivelMedio,
        sub: d.sub, usadas: d.semillas.usadas, saturado: d.semillas.saturado,
        nivelSemilla: d.cerca && d.cerca[0] ? d.cerca[0].nivel : null,
        cajaCeldas: d.caja.celdas, recortada: d.caja.recortada,
        maxByte: maxA, celdasConLuz: nz
      };
    };
  }, FOTO);

  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    await new AsyncFunction('opts', 'args', code)({}, {});
    return !!(window.game && game.luzLey);
  }, SNIPPET);
  console.log('snippet cargado ·', arranque);

  const tomas = {};
  for (const e of ESCENARIOS) tomas[e.id] = [];
  for (let ronda = 0; ronda <= RONDAS; ronda++) {
    for (const e of ESCENARIOS) {
      await page.evaluate(({ ley, alcance }) => {
        ley ? game.luzLey.on() : game.luzLey.off();
        game.voxelesUI.luz('luciernagas', alcance);
        mc._dynSig = null; if (typeof mcDynSync === 'function') mcDynSync();
      }, e);
      await page.waitForTimeout(2500);
      for (let k = 0; k < TOMAS; k++) {
        const m = await page.evaluate(() => window.__mide());
        if (ronda === 0) continue;                       // calentamiento, se tira
        tomas[e.id].push(m);
      }
    }
  }

  // COSTE · lo que tarda UNA siembra forzada (peor caso, no es el gasto por frame).
  const coste = await page.evaluate(async escenarios => {
    const out = {};
    for (const e of escenarios) {
      e.ley ? game.luzLey.on() : game.luzLey.off();
      game.voxelesUI.luz('luciernagas', e.alcance);
      mc._dynSig = null; mcDynSync();
      const sem = mc._dynSem || [], t = [];
      for (let i = 0; i < 16; i++) { mc._dynSig = null; const a = performance.now(); mcDynBake(sem); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      out[e.id] = +t[t.length >> 1].toFixed(3);
    }
    return out;
  }, ESCENARIOS);

  const resumen = {};
  for (const e of ESCENARIOS) {
    const t = tomas[e.id];
    resumen[e.id] = {
      // LO QUE SE PREGUNTA: caras de pared (aire pegado a sólido) que reciben luz dinámica
      carasDePared: mediana(t.map(x => x.carasDePared)),
      nivelMedioEnPared: mediana(t.map(x => x.nivelMedioEnPared)),
      nivelSemilla: t[0].nivelSemilla, sub: t[0].sub,
      usadas: t[0].usadas, saturado: t[0].saturado,
      maxByte: mediana(t.map(x => x.maxByte)), techoLegal: t[0].nivelSemilla * t[0].sub,
      celdasConLuz: mediana(t.map(x => x.celdasConLuz)),
      cajaCeldas: t[0].cajaCeldas, cajaRecortada: t[0].recortada,
      ms_siembra_forzada: coste[e.id]
    };
  }
  console.log(JSON.stringify(resumen, null, 2));
  await browser.close();
})();
