// @area: render
// @necesita: servidor, playwright
// BUG-STR1 · un macizo TRANSLUCIDO (hab:cubo-trans) es un bloque de terreno, no una pieza suelta.
//
// El dueno pregunto por que «cubo-trans» se pintaba como estructura y no como bloque. Ninguna de las dos
// lecturas del ticket era la buena: no era la valvula game.useOldStructBuildCall (la decision se toma
// ANTES, en mcCabeEnRejilla) ni era «un cubo de cristal hueco tiene forma» (cubo-trans son 4096 voxels,
// el 16³ COMPLETO). Lo que le echaba del terreno era el ALPHA: su color es #4ab8d924.
//
// El motivo de aquella exclusion sigue siendo cierto a medias y por eso este test lo fija en las dos
// mitades. La PROYECCION a las 6 caras del cubo no vale (el atlas se hornea sin alpha, buildTexFaces fija
// d[o+3]=255, y el shader del terreno solo recorta), asi que blockLike sigue en false. Pero entrar en
// mc.grid no obliga a proyectarse: desde que existe mc.finoRejilla el mallador emite la geometria de
// verdad dentro de la malla del chunk, y ese flujo tiene su propia pasada con BLEND (finoAVbo). O sea que
// la exclusion se escribio cuando proyectarse era el UNICO camino al terreno, y se quedo vieja.
//
// Lo que se comprueba: el diagnostico (§1), que ahora cabe y por que camino (§2), que su geometria va al
// flujo translucido y no al opaco (§3), que la luz del cielo lo atraviesa —estampado suelto ya la dejaba
// pasar, asi que oscurecer seria una regresion— con la valvula del snippet mandando encima (§4), que
// SIGUE chocando como un cubo entero (§5) y que un 16³ opaco no se entera de nada (§6).
//
// No persiste nada: bloquea los POST del mundo y devuelve cada celda que toca.
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

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const CLAVE = 'hab:cubo-trans';

    // ── §1 el diagnostico, leido del propio documento ──────────────────────────
    const doc = await getRoomData(CLAVE);
    const vox = doc.voxels || {};
    out.nvox = Object.keys(vox).length;
    out.size = [doc.size.x, doc.size.y, doc.size.z];
    out.conAlpha = Object.values(vox).filter(v => typeof v === 'string' && v.length >= 9).length;
    const rec = await mcStructCells(CLAVE);
    out.pielCubre = !!rec.pielCubre;
    out.translucido = !!rec.translucido;
    out.conCaras = !!rec.conCaras;
    out.blockLike = !!rec.blockLike;

    // ── §2 por que camino entra en la rejilla ──────────────────────────────────
    out.cabe = mcCabeEnRejilla(CLAVE);
    out.esFina = mcEsFinaEnRejilla(CLAVE);
    out.recFina = mcRecFina(rec);

    // El material tiene que estar en la paleta para tener id, tabla fina y geometria horneada.
    await game.addMaterial(CLAVE);
    const ID = mcResolveMat(CLAVE);
    out.id = ID;
    let g = null;
    for (let i = 0; i < 30 && !(g = mc.finoGeom[CLAVE]); i++) await new Promise(s => setTimeout(s, 100));
    out.hayGeom = !!(g && (g.colCount || g.alphaCount));
    out.marcadoFino = !!(mc.finoRejilla && mc.finoRejilla[ID]);
    out.marcadoRecorte = !!(mc.recorte && mc.recorte[ID]);

    // ── sitio de pruebas: una columna de aire con suelo, en el chunk central ───
    // El techo tiene que ser ANCHO: la luz que entra de lado por el borde es la que manda en un techo
    // pequeno, y con 3x3 el opaco y el translucido daban lo mismo (13 y 13) sin que ninguno tuviera merito.
    const R = 6;                                        // techo de 13x13 centrado en (x0,z0)
    const CH = MC_CHUNK, cx = Math.floor(mc.dim.x / 2 / CH), cz = Math.floor(mc.dim.z / 2 / CH);
    const x0 = cx * CH + 8, z0 = cz * CH + 8, y0 = Math.floor(mc.dim.y / 2);
    const celdas = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = x0 + dx, z = z0 + dz;
      for (let dy = -2; dy <= 2; dy++) if (mcInside(x, y0 + dy, z)) celdas.push([x, y0 + dy, z]);
    }
    const restaurar = celdas.map(([x, y, z]) => [x, y, z, mc.grid[mcIdx(x, y, z)]]);
    const rehacer = () => { mcMeshChunk(cx, cz); return mc.chunks.get(cx + ',' + cz); };
    const guardaLuz = mc.traspasaLuz;
    const bx0 = x0 - R - 1, bz0 = z0 - R - 1, bx1 = x0 + R + 1, bz1 = z0 + R + 1;

    try {
      for (const [x, y, z] of celdas) mcSetBlock(x, y, z, 0);      // hueco limpio
      const vacio = rehacer();
      out.terrenoVacio = vacio.count | 0;
      out.finoOpVacio = vacio.finoCount | 0;
      out.finoAlVacio = vacio.finoACount | 0;

      // ── §3 la geometria va al flujo TRANSLUCIDO del chunk ────────────────────
      // Las instancias se cuentan ANTES y DESPUES: /map/test ya trae cubo-trans estampado del dueno.
      const instAntes = mc.structures.filter(s => s.key === CLAVE).length;
      mcSetBlock(x0, y0, z0, ID);
      const conCubo = rehacer();
      out.terrenoConCubo = conCubo.count | 0;
      out.finoOpConCubo = conCubo.finoCount | 0;
      out.finoAlConCubo = conCubo.finoACount | 0;
      out.geomAlpha = g ? (g.alphaCount | 0) : 0;
      out.geomOpaca = g ? (g.colCount | 0) : 0;
      out.instAntes = instAntes;
      out.instDespues = mc.structures.filter(s => s.key === CLAVE).length;

      // ── §5 se ve a traves pero se choca: es un cubo entero ───────────────────
      mcTablaFina();
      out.chocaDentro = mcCollides(x0 + 0.5, y0, z0 + 0.5);
      out.chocaCasiArriba = mcCollides(x0 + 0.5, y0 + 15 / 16, z0 + 0.5);
      out.libreEncima = !mcCollides(x0 + 0.5, y0 + 1, z0 + 0.5);
      mcSetBlock(x0, y0, z0, 0); rehacer();

      // ── §4 la luz del cielo lo atraviesa ─────────────────────────────────────
      const T = mcTablaLuz();
      out.pasaEnTabla = T[ID] === 1;
      // …y la valvula del snippet (game.bloques.define(clave,{luz:'tapa'})) sigue mandando encima.
      mc.traspasaLuz = new Uint8Array(mc.blockKey.length + 1);
      mc.traspasaLuz[ID] = 2;
      out.valvulaTapa = mcTablaLuz()[ID] === 0;
      mc.traspasaLuz = guardaLuz;

      // Fin a fin: un techo de 13x13 y se mide EN EL CENTRO, lo mas lejos posible del borde por donde
      // entra la luz de lado. La comparacion es entre los dos techos, no contra un numero a mano.
      const idOpaco = mc.blockKey.findIndex((k, i) => i > 0 && k &&
        !(mc.finoRejilla && mc.finoRejilla[i]) && !(mc.recorte && mc.recorte[i]));
      out.claveOpaco = mc.blockKey[idOpaco] || null;
      const techo = (id) => {
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) mcSetBlock(x0 + dx, y0 + 1, z0 + dz, id);
        rehacer(); mcRelightBox(bx0, bz0, bx1, bz1);
        return mc.light[mcIdx(x0, y0, z0)];
      };
      out.luzSinTecho = techo(0);
      out.luzTechoTrans = techo(ID);
      out.luzTechoOpaco = techo(idOpaco);
      techo(0);

      // ── §6 un 16³ OPACO no se entera de nada ─────────────────────────────────
      const opacos = [];
      for (const k of ['hab:agua', 'hab:likelava']) {
        try {
          const rc = await mcStructCells(k);
          opacos.push({ k, blockLike: !!rc.blockLike, fina: mcRecFina(rc), cabe: mcCabeEnRejilla(k) });
        } catch (e) { out.errs.push(k + ': ' + e.message); }
      }
      out.opacos = opacos;
    } finally {
      for (const [x, y, z, id] of restaurar) mcSetBlock(x, y, z, id);
      mc.traspasaLuz = guardaLuz;
      mcMeshChunk(cx, cz); mcRelightBox(bx0, bz0, bx1, bz1);
      out.celdasRestauradas = restaurar.every(([x, y, z, id]) => mc.grid[mcIdx(x, y, z)] === id);
      const fin = mc.chunks.get(cx + ',' + cz);
      out.finoTrasRestaurar = (fin.finoCount | 0) + (fin.finoACount | 0);
    }
    return out;
  });

  console.log('\n§1 el diagnostico: no es la forma, es el alpha');
  ok('hab:cubo-trans es un 16³', r.size && r.size.join('x') === '16x16x16', (r.size || []).join('x'));
  ok('…y esta COMPLETO: 4096 voxels, no una cascara hueca', r.nvox === 4096, r.nvox + ' voxels');
  ok('lo que tiene es alpha (#rrggbbaa)', r.conAlpha > 0, r.conAlpha + ' voxels con alpha');
  ok('la ficha dice piel que cubre + translucido', r.pielCubre === true && r.translucido === true);
  ok('y sin mascara de caras, que es otro caso distinto', r.conCaras === false);
  ok('sigue sin ser blockLike: proyectarlo a 6 caras lo sacaria macizo', r.blockLike === false);

  console.log('\n§2 pero CABE en la rejilla, con geometria de verdad');
  ok('mcCabeEnRejilla dice que si', r.cabe === true);
  ok('y va por el camino fino, no por la proyeccion', r.esFina === true && r.recFina === true);
  ok('tiene id en la paleta', r.id > 0, 'id=' + r.id);
  ok('su geometria esta horneada', r.hayGeom === true);
  ok('marcado en mc.finoRejilla', r.marcadoFino === true);
  ok('y en mc.recorte: una celda fina no tapa nada', r.marcadoRecorte === true);

  console.log('\n§3 su geometria sale por la pasada con BLEND, no por la opaca');
  ok('el terreno del chunk no emite ni una cara', r.terrenoConCubo === r.terrenoVacio,
    r.terrenoVacio + ' → ' + r.terrenoConCubo);
  ok('el documento es casi todo translucido', r.geomAlpha > r.geomOpaca,
    r.geomAlpha + ' vertices alpha vs ' + r.geomOpaca + ' opacos');
  ok('y eso es lo que crece en el chunk', r.finoAlConCubo - r.finoAlVacio === r.geomAlpha,
    '+' + (r.finoAlConCubo - r.finoAlVacio) + ' de ' + r.geomAlpha);
  ok('el lote opaco crece solo lo suyo', r.finoOpConCubo - r.finoOpVacio === r.geomOpaca,
    '+' + (r.finoOpConCubo - r.finoOpVacio) + ' de ' + r.geomOpaca);
  ok('sin crear ni una instancia suelta (0 draw calls propios)', r.instDespues === r.instAntes,
    r.instAntes + ' → ' + r.instDespues + ' instancias de cubo-trans en /map/test');

  console.log('\n§5 se ve a traves, pero se choca como un cubo entero');
  ok('de pie en su celda, choca', r.chocaDentro === true);
  ok('a 15/16 de alto tambien: es macizo hasta arriba', r.chocaCasiArriba === true);
  ok('y justo encima ya no', r.libreEncima === true);

  console.log('\n§4 la luz del cielo lo atraviesa (estampado suelto ya lo hacia)');
  ok('mcTablaLuz dice que pasa', r.pasaEnTabla === true);
  ok('y luz:"tapa" del snippet sigue mandando encima', r.valvulaTapa === true);
  ok('hay un bloque opaco con el que comparar', !!r.claveOpaco, r.claveOpaco);
  ok('bajo un techo de 13x13 de cubo-trans queda luz', r.luzTechoTrans > 0,
    'sin techo ' + r.luzSinTecho + ' · trans ' + r.luzTechoTrans + ' · opaco ' + r.luzTechoOpaco);
  ok('y bajo el mismo techo opaco, menos', r.luzTechoOpaco < r.luzTechoTrans);
  // Pierde algo, no nada: la siembra de cielo corta en el primer bloque que no es aire (mcComputeLight),
  // diga lo que diga la tabla, asi que un dosel sigue dando sombra. La tabla gobierna la DIFUSION, y por
  // ahi son dos pasos —la celda del techo y la de debajo— a un nivel por paso. Es lo mismo que le pasa a
  // `leaves`, y esta escrito en el gancho `traspasaLuz`: «NO abre la columna de cielo».
  ok('…un nivel por paso (el techo y la de debajo), no la columna entera',
    r.luzSinTecho - r.luzTechoTrans === 2, r.luzSinTecho + ' → ' + r.luzTechoTrans);

  console.log('\n§6 un 16³ OPACO sigue siendo un bloque proyectado');
  ok('hay macizos opacos con los que comparar', (r.opacos || []).length === 2, (r.opacos || []).map(o => o.k).join(' '));
  ok('siguen siendo blockLike', (r.opacos || []).every(o => o.blockLike === true));
  ok('y NO van por el camino fino', (r.opacos || []).every(o => o.fina === false));
  ok('y siguen cabiendo en la rejilla', (r.opacos || []).every(o => o.cabe === true));

  console.log('\n§0 el mundo del dueno queda como estaba');
  ok('todas las celdas restauradas', r.celdasRestauradas === true);
  ok('sin errores dentro de la pagina', (r.errs || []).length === 0, (r.errs || []).join(' | '));
  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();