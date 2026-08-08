// @area: editor
// @necesita: servidor, playwright
// El clic derecho construye. Hasta ahora, poner una pieza de una ranura de estructura SIEMPRE estampaba una
// instancia suelta (mcStampStruct): fiel, pero 1 draw call por flor. Desde que el mallador emite la geometria
// de verdad de lo que no llena su celda, poner la pieza y pintarla con setVoxel dan la MISMA imagen, asi que
// una sola funcion sirve para las dos cosas y la pieza deja de costar un draw call.
//
// Lo que se comprueba aqui es donde esta la frontera, porque no todo cabe: una sala ocupa varias celdas. El
// giro (R / Shift+R) si cabe, porque va en la clave ('<clave>@<ori>'), y por eso tambien pasa por setVoxel —
// menos en lo que se proyecta sobre las 6 caras del cubo, donde el giro no se veria. Y la valvula
// game.useOldStructBuildCall tiene que devolver el comportamiento de antes tal cual.
//
// No persiste nada: bloquea el POST del mundo y devuelve la rejilla a como estaba.
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
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/habitantes', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = {};
    const idFlor = mc.blockKey.findIndex(k => /flor/.test(k || ''));
    const claveFlor = mc.blockKey[idFlor];
    out.claveFlor = claveFlor;
    await mcStructCells(claveFlor);           // la huella que mira mcCabeEnRejilla (el visor la calienta sola)

    // Sitio donde apuntar: una columna con suelo y aire encima, lejos de lo que ya hay puesto.
    let sitio = null;
    for (let x = 8; x < mc.dim.x - 8 && !sitio; x += 3) for (let z = 8; z < mc.dim.z - 8; z += 3) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 9 && libre; y++) if (mc.grid[mcIdx(x, y, z)]) libre = false;
      if (libre) { sitio = [x, gy, z]; break; }
    }
    out.sitio = sitio;
    if (!sitio) return out;
    const [X, GY, Z] = sitio, DIANA = [X, GY + 1, Z];
    const enDiana = () => mc.grid[mcIdx(DIANA[0], DIANA[1], DIANA[2])];

    // Mirar la diana desde 8 bloques por encima: el clic cae en la celda de aire sobre el suelo y el jugador
    // se queda lejos, que si no salta la guarda de «no encajonar».
    const guarda = { pos: mc.pos.slice(), yaw: mc.yaw, pitch: mc.pitch, sel: mc.sel,
                     slot: mc.slotStruct.slice(), reach: mc.reach, viejo: mc.useOldStructBuild,
                     giro: mc.previewGiro, cara: mc.previewCara, hist: mc.hist.length };
    const apunta = () => { mc.pos = [X + 0.5, GY + 9, Z + 0.5]; mc.vel = [0, 0, 0]; game.pitch = -89; mc.reach = 16; };
    const nEstr = () => mc.structures.length;

    let n = 0;
    const docSala = () => {                    // dos celdas de ancho: no cabe en una celda de rejilla
      const key = 'zz-clic-sala-' + (++n), vox = {};
      for (let i = 0; i < 20; i += 2) vox[i + ',0,0'] = '#8899aa';
      roomDataCache.set(key, Promise.resolve({ size: { x: 32, y: 16, z: 16 }, meta: { name: key, type: 'objeto' }, voxels: vox }));
      delete mc.structs[key];
      return key;
    };

    try {
      mc.previewGiro = 0; mc.previewCara = 0; mc.useOldStructBuild = false;
      mc.slotStruct[mc.sel] = claveFlor;

      // ── §1 la flor cabe en una celda: va por setVoxel ──────────────────────
      apunta();
      const e0 = nEstr(); out.antesVacio = enDiana();
      // Un clic no es un script: no debe salir el resumen «setVoxel: N bloques colocados» 80 ms despues,
      // ni quedarse armado el volcado que re-malla el mundo entero.
      const avisos = [], toastOrig = window.toast;
      window.toast = m => { avisos.push(String(m)); };
      mcPlace();
      out.enRejilla = enDiana() === idFlor;
      out.sinInstancia = nEstr() === e0;
      out.cabeEnRejilla = mcCabeEnRejilla(claveFlor);
      await new Promise(r => setTimeout(r, 400));
      window.toast = toastOrig;
      out.sinResumenDeScript = avisos.filter(m => /bloques colocados/.test(m)).length === 0;
      out.avisos = avisos;

      // ── §5 y se deshace como cualquier bloque ─────────────────────────────
      out.hizoHistorial = mc.hist.length === guarda.hist + 1;
      await mcUndo();
      out.deshecho = enDiana() === out.antesVacio;

      // ── §2 con giro a mano TAMBIEN va por setVoxel (el giro cabe en la clave) ──
      // La variante no esta en la paleta la primera vez, asi que la escritura de verdad llega luego (se
      // descarga el material y se re-hornea la paleta): hay que esperarla, como con cualquier material nuevo.
      const esperaLlena = async () => { for (let i = 0; i < 200 && enDiana() === out.antesVacio; i++) await new Promise(r => setTimeout(r, 100)); };
      mc.previewGiro = 1; apunta();
      mcPlace();
      out.giroSinInstancia = nEstr() === e0;
      await esperaLlena();
      out.claveGirada = mc.blockKey[enDiana()] || null;
      out.giroEnRejilla = out.claveGirada === claveFlor + '@1';
      const idG = enDiana();
      out.giroTieneGeom = !!(mc.finoGeom[claveFlor + '@1'] && mc.finoGeom[claveFlor + '@1'].colCount > 0);
      out.giroCuentaComoFina = !!(mc.finoRejilla && mc.finoRejilla[idG] === 1);
      out.giroEnTablaFina = !!(mc._geoFina && mc._geoFina[idG]);
      // …y la geometria de la variante es OTRA que la del original (si fuese la misma, el giro seria mentira)
      const g0 = mc.finoGeom[claveFlor], g1 = mc.finoGeom[claveFlor + '@1'];
      out.geomDistinta = !!(g0 && g1 && (g0.colLocal.length !== g1.colLocal.length ||
        Array.from(g0.colLocal.slice(0, 300)).join() !== Array.from(g1.colLocal.slice(0, 300)).join()));
      await mcUndo();
      out.giroDeshecho = enDiana() === out.antesVacio;

      // Shift+R (giro dentro de la cara) y R (cara arriba) van en el mismo sitio de la clave: ori = cara*4 + giro
      mc.previewGiro = 0; mc.previewCara = 1; apunta();
      mcPlace();
      await esperaLlena();
      out.claveDeCara = mc.blockKey[enDiana()] || null;
      out.caraEnRejilla = out.claveDeCara === claveFlor + '@4';
      await mcUndo();
      mc.previewCara = 0; mc.previewGiro = 0;
      out.sinInstanciasDeGiro = nEstr() === e0;

      // ── §2b lo que se proyecta sobre las 6 caras del cubo NO puede girar en la rejilla ──
      // Un 16³ macizo cabe en una celda, pero se dibuja como bloque: ahi el giro no se veria, asi que
      // con R se sigue estampando la pieza suelta en vez de perder el giro en silencio.
      const kMacizo = 'zz-clic-macizo', voxM = {};
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) voxM[x + ',' + y + ',' + z] = '#997755';
      roomDataCache.set(kMacizo, Promise.resolve({ size: { x: 16, y: 16, z: 16 }, meta: { name: kMacizo, type: 'objeto' }, voxels: voxM }));
      delete mc.structs[kMacizo];
      await mcStructCells(kMacizo);
      out.macizoCabe = mcCabeEnRejilla(kMacizo) === true;
      out.macizoNoEsFino = mcEsFinaEnRejilla(kMacizo) === false;
      mc.slotStruct[mc.sel] = kMacizo; mc.previewGiro = 1;
      apunta(); const eM = nEstr();
      mcPlace();
      out.macizoConGiroEstampa = nEstr() === eM + 1;
      out.macizoConGiroNoEnRejilla = enDiana() === out.antesVacio;
      for (const s of mc.structures.filter(o => o.key === kMacizo)) mcRemoveStruct(s, true);
      delete mc.structs[kMacizo]; roomDataCache.delete(kMacizo);
      mc.previewGiro = 0; mc.slotStruct[mc.sel] = claveFlor;

      // ── §3 la valvula devuelve el comportamiento de antes ─────────────────
      game.useOldStructBuildCall = true;
      apunta(); const e1 = nEstr();
      mcPlace();
      out.valvulaEstampa = nEstr() === e1 + 1;
      out.valvulaNoEnRejilla = enDiana() === out.antesVacio;
      for (const s of mc.structures.filter(o => o.key === claveFlor)) mcRemoveStruct(s, true);
      game.useOldStructBuildCall = false;
      apunta();
      mcPlace();
      out.valvulaVuelve = enDiana() === idFlor;
      mcSetBlock(DIANA[0], DIANA[1], DIANA[2], out.antesVacio);

      // ── §4 lo que NO cabe en una celda se sigue estampando ────────────────
      const kSala = docSala();
      await mcStructCells(kSala);
      out.salaNoCabe = mcCabeEnRejilla(kSala) === false;
      mc.slotStruct[mc.sel] = kSala;
      apunta(); const e2 = nEstr();
      mcPlace();
      out.salaEstampa = nEstr() === e2 + 1;
      out.salaNoEnRejilla = enDiana() === out.antesVacio;
      for (const s of mc.structures.filter(o => o.key === kSala)) mcRemoveStruct(s, true);
      delete mc.structs[kSala]; roomDataCache.delete(kSala);
    } finally {
      mc.pos = guarda.pos; mc.yaw = guarda.yaw; mc.pitch = guarda.pitch; mc.vel = [0, 0, 0];
      mc.slotStruct = guarda.slot; mc.sel = guarda.sel; mc.reach = guarda.reach;
      mc.previewGiro = guarda.giro; mc.previewCara = guarda.cara;
      game.useOldStructBuildCall = guarda.viejo;
      mcSetBlock(DIANA[0], DIANA[1], DIANA[2], out.antesVacio | 0);
      mcMeshAll();
      out.rejillaLimpia = enDiana() === (out.antesVacio | 0);
      out.sinEstructurasDeSobra = mc.structures.filter(o => /^zz-clic-/.test(o.key)).length === 0;
    }
    return out;
  });

  console.log('\n§1 una pieza que cabe en una celda se pone con setVoxel');
  ok('hay sitio donde apuntar', !!r.sitio, r.sitio && r.sitio.join(','));
  ok('la flor cabe en la rejilla', r.cabeEnRejilla === true, r.claveFlor);
  ok('el clic derecho la deja en la rejilla', r.enRejilla === true);
  ok('y NO crea una instancia suelta (0 draw calls)', r.sinInstancia === true);
  ok('sin el resumen de script «N bloques colocados»', r.sinResumenDeScript === true, (r.avisos || []).join(' | '));

  console.log('\n§5 se deshace como cualquier bloque');
  ok('el clic entra en el historial', r.hizoHistorial === true);
  ok('y deshacer la quita', r.deshecho === true);

  console.log('\n§2 con orientacion a mano TAMBIEN va por setVoxel (el giro cabe en la clave)');
  ok('R (giro) NO estampa una instancia', r.giroSinInstancia === true);
  ok('la celda queda con la variante «clave@1»', r.giroEnRejilla === true, r.claveGirada);
  ok('la variante trae geometria horneada', r.giroTieneGeom === true);
  ok('y cuenta como fina (se dibuja con su forma)', r.giroCuentaComoFina === true);
  ok('y entra en la tabla que leen colision y mcTapaCara', r.giroEnTablaFina === true);
  ok('su geometria es distinta de la del original', r.geomDistinta === true);
  ok('deshacer la quita', r.giroDeshecho === true);
  ok('R (otra cara arriba) da «clave@4»', r.caraEnRejilla === true, r.claveDeCara);
  ok('ningun giro dejo instancias sueltas', r.sinInstanciasDeGiro === true);

  console.log('\n§2b lo que se proyecta como cubo se sigue estampando al girarlo');
  ok('un 16³ macizo cabe en una celda', r.macizoCabe === true);
  ok('pero no se dibuja con su forma', r.macizoNoEsFino === true);
  ok('asi que con R estampa una instancia', r.macizoConGiroEstampa === true);
  ok('y no toca la rejilla', r.macizoConGiroNoEnRejilla === true);

  console.log('\n§3 game.useOldStructBuildCall devuelve la llamada de antes');
  ok('con true vuelve a estampar', r.valvulaEstampa === true);
  ok('y no toca la rejilla', r.valvulaNoEnRejilla === true);
  ok('con false vuelve a setVoxel', r.valvulaVuelve === true);

  console.log('\n§4 lo que no cabe en una celda no cambia');
  ok('una sala de dos celdas no cabe', r.salaNoCabe === true);
  ok('y se estampa como siempre', r.salaEstampa === true);
  ok('sin tocar la rejilla', r.salaNoEnRejilla === true);

  console.log('\n§0 el mundo del dueno queda como estaba');
  ok('la celda de la diana vuelve a su sitio', r.rejillaLimpia === true);
  ok('y no queda ninguna estructura de prueba', r.sinEstructurasDeSobra === true);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();