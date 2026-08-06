// Redstone se carga SOLO: mundo-autoarranque trae el motor y los circuitos de serie en cada mapa.
// Lo delicado no es que cargue, es que NO SE NOTE en un mundo que no usa redstone — porque esto
// pasa a correr en todos:
//
//   1. declarar un circuito no puede dar de alta materiales que ese mundo no usa (game.addMaterial
//      cuesta un mcMeshAll, ~3 873 ms en 512×40×512, POR CARGA y a cambio de nada)
//   2. el envoltorio de mcSetBlock no puede cobrar por escritura: una explosión de 1000 bloques
//      serían 7000 Map.set y un drenado de 7000 celdas para acabar sin hacer nada
//   3. y aun así, un material que aparezca DESPUÉS tiene que funcionar: se carga la primera vez que
//      hay que encender algo, no en el arranque
//
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
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
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
    // Contador de re-mallados globales: es la unidad de coste que no se puede pagar en el arranque.
    window.__meshAll = 0;
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  // El bloque del autoarranque no se espera a propósito (no puede retrasar la entrada al Mundo).
  await p.waitForFunction('window.game && game.redstone', null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    // La fuente es el BLOQUE DE REDSTONE. No vale el hormigón rojo: era fuente por error hasta
    // 2026-08-06 (estaba en DEFECTOS) y ahora es decoración — ver REQ-RS5.
    const FUENTE = 'asset:assets/bloque_redstone.vox.json';
    const APAGADA = 'hab:antorcha-apagada', ENCENDIDA = 'hab:antorcha';
    if (!(mc.glowLevel > 0)) mc.glowLevel = 12;

    // ── 1 · el motor está sin que nadie haya ejecutado un snippet a mano ──
    out.apiSola = !!(window.game && game.redstone);
    if (!out.apiSola) return out;
    out.circuitos = game.redstone.lista().map(c => c.clave);
    out.defectos = !!game.redstone.defectos;

    // Declarar NO puede arrastrar el material a la paleta. Se comprueba con uno que este mundo no
    // tenga — los del circuito de serie ya están aquí si el mapa lo usa de verdad, así que servirían
    // para cualquier cosa menos para esto.
    const CANDIDATOS = ['asset:assets/white_whool.vox.json', 'asset:assets/snow.vox.json',
                        'asset:assets/lava.vox.json', 'asset:assets/arena.vox.json'];
    const AJENO = CANDIDATOS.find(k => !mc.name2id[k]) || null;
    out.ajeno = AJENO;
    if (AJENO) {
      game.redstone.define(AJENO, { power: 15, precargar: false });
      out.ajenoSinPrecarga = !mc.name2id[AJENO];        // sigue fuera de la paleta: coste cero
      out.ajenoCola = game.redstone._cola.size;
      await game.redstone.define(AJENO, { power: 15 }); // el mismo, ahora CON precarga
      out.ajenoConPrecarga = !!mc.name2id[AJENO];
      game.redstone.quitar(AJENO);
    }

    // ── 2 · sin material del circuito en el mundo, escribir no cuesta nada ──
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 14 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 14; z += 3) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 5 && libre; y++) for (let d = -2; d <= 4; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy + 1, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado'); return out; }
    const [X, Y, Z] = sitio;
    out.sitio = sitio;
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const antes = [idEn(X, Y, Z), idEn(X + 1, Y, Z), idEn(X + 2, Y, Z)];
    const luzPrevia = mc.blockLight ? mc.blockLight[mcIdx(X, Y + 1, Z)] : -1;

    // Se miden DELTAS: este mapa puede tener circuito de verdad montado (el del dueño), y lo que se
    // afirma es que una ráfaga sobre material ajeno no añade nada, no que el mundo esté vacío.
    const colaAntes = game.redstone._cola.size, potAntes = game.redstone._potencia.size;
    game.beginBatch();
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) game.setVoxel(X + 2, Y, Z, i % 2 ? 'roca' : 0);
    const t1 = performance.now();
    game.endBatch();
    out.msMil = +(t1 - t0).toFixed(1);
    out.colaTrasRafaga = game.redstone._cola.size - colaAntes;
    out.potenciaTrasRafaga = game.redstone._potencia.size - potAntes;
    game.setVoxel(X + 2, Y, Z, 0);

    // ── 3 · el material aparece DESPUÉS (el dueño lo coge de la galería) ──
    // Con un par sintético de materiales que este mundo no tiene: la antorcha de verdad ya está en
    // la paleta de /map/test (el dueño montó ahí el circuito), así que no probaría la carga perezosa.
    const libres = CANDIDATOS.filter(k => !mc.name2id[k]);
    const OFF = libres[0], ON = libres[1];
    out.par = [OFF || null, ON || null];
    if (!OFF || !ON) { out.errs.push('este mundo ya tiene todos los materiales candidatos'); return out; }

    game.redstone.define(OFF, { encendida: ON, precargar: false });
    await game.addMaterial(OFF);                 // esto es lo que hace mcAssignSlot al elegirlo
    out.encendidaAunNo = !mc.name2id[ON];        // la encendida sigue SIN cargar: nadie la ha pedido
    game.setVoxel(X, Y, Z, OFF);
    game.redstone.tick();
    out.plantadaClave = claveEn(X, Y, Z);

    // Al pegarle la fuente hace falta la encendida, que no está: el motor la carga y reintenta.
    await game.addMaterial(FUENTE);
    game.setVoxel(X + 1, Y, Z, FUENTE);
    game.redstone.tick();
    for (let i = 0; i < 100 && claveEn(X, Y, Z) !== ON; i++) {
      await new Promise(res => setTimeout(res, 100));
      game.redstone.tick();
    }
    out.trasCargaPerezosa = claveEn(X, Y, Z);
    out.esperada = ON;

    // ── 4 · el repaso del mundo apaga lo que quedó encendido sin fuente ──
    // Se simula un mundo cargado así: la lámpara encendida en disco, la fuente ya no está, y la
    // tabla de señal vacía (que es como nace en cada carga).
    mcSetBlock(X + 1, Y, Z, 0);
    game.redstone._potencia.clear();
    game.redstone._cola.clear();
    out.antesRepaso = claveEn(X, Y, Z);
    const n = game.redstone.repasarMundo();
    game.redstone.tick();
    out.celdasRepaso = n;
    out.trasRepaso = claveEn(X, Y, Z);
    out.apagadaEsperada = OFF;

    // ── 5 · y sin NINGÚN material del circuito en la paleta, el repaso ni toca la rejilla ──
    // Se vacía la tabla entera (los de serie incluidos): con la tabla llena y el mapa del dueño
    // montado, el repaso encuentra celdas de verdad y no probaría la guarda.
    game.redstone.lista().forEach(c => game.redstone.quitar(c.clave));
    out.repasoSinCircuito = game.redstone.repasarMundo();

    // ── limpieza ──
    mcSetBlock(X, Y, Z, antes[0]);
    mcSetBlock(X + 1, Y, Z, antes[1]);
    mcSetBlock(X + 2, Y, Z, antes[2]);
    mcRemeshAround(X - 2, Z - 2, X + 3, Z + 3);
    out.restaurado = idEn(X, Y, Z) === antes[0] && idEn(X + 1, Y, Z) === antes[1] && idEn(X + 2, Y, Z) === antes[2];
    out.luzFinal = mc.blockLight ? mc.blockLight[mcIdx(X, Y + 1, Z)] : -1;
    out.luzPrevia = luzPrevia;
    return out;
  });

  console.log('El motor se carga solo (mundo-autoarranque), sin ejecutar nada a mano');
  ok('game.redstone existe al entrar al Mundo', r.apiSola === true);
  if (!r.apiSola) { console.log(JSON.stringify(r)); await b.close(); process.exit(1); }
  ok('trae los circuitos de serie', r.circuitos.length >= 2, r.circuitos.join(' · '));
  ok('deja la tabla a la vista en game.redstone.defectos', r.defectos === true);

  console.log('\nDeclarar un circuito NO arrastra materiales a la paleta');
  ok('hay un material ajeno con el que medirlo', !!r.ajeno, r.ajeno);
  ok('precargar:false lo deja fuera de la paleta', r.ajenoSinPrecarga === true);
  ok('y no encola nada', r.ajenoCola === 0, r.ajenoCola + ' en cola');
  ok('sin precargar:false sí lo carga (es la diferencia)', r.ajenoConPrecarga === true);

  console.log('\nEn un mundo sin circuito, escribir en la rejilla no cuesta nada');
  ok('1000 setVoxel no encolan ni una celda', r.colaTrasRafaga === 0, r.colaTrasRafaga + ' en cola');
  ok('ni dejan señal en el mapa disperso', r.potenciaTrasRafaga === 0, r.potenciaTrasRafaga + ' entradas');
  ok('1000 escrituras por debajo de 250 ms', r.msMil < 250, r.msMil + ' ms (SwiftShader)');

  console.log('\nUn material que aparece DESPUÉS sigue funcionando (carga perezosa)');
  ok('hay un par de materiales ajenos con el que medirlo', !!(r.par && r.par[0] && r.par[1]),
    (r.par || []).join(' → ') + (r.errs.length ? ' ' + r.errs.join(';') : ''));
  ok('plantar la apagada no carga la encendida', r.encendidaAunNo === true);
  ok('la pieza se planta apagada', r.plantadaClave === r.par[0], r.plantadaClave);
  ok('con la fuente al lado, el motor carga la encendida y reintenta', r.trasCargaPerezosa === r.esperada,
    r.trasCargaPerezosa + ' (esperaba ' + r.esperada + ')');

  console.log('\nEl repaso del arranque arregla lo que se guardó encendido sin fuente');
  ok('parte de una lampara encendida', r.antesRepaso === r.esperada, r.antesRepaso);
  ok('el repaso encuentra la celda', r.celdasRepaso >= 1, r.celdasRepaso + ' celda(s)');
  ok('y la apaga', r.trasRepaso === r.apagadaEsperada, r.trasRepaso);
  ok('sin circuito en la paleta, el repaso no barre nada', r.repasoSinCircuito === 0);

  console.log('');
  ok('limpieza: las celdas vuelven a su valor', r.restaurado === true);
  ok('el mundo queda con la luz de partida', r.luzFinal === r.luzPrevia, r.luzFinal + ' vs ' + r.luzPrevia);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
