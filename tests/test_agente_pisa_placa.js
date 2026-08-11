// @area: agentes
// @necesita: servidor, playwright
// BUG-AG1 (mitad de las placas) · «los agentes articulados ... tampoco pueden presionar placas de
// redstone».
//
// El §18 de test_bloques_comportamiento.js ya cuenta las llamadas a `alPisar` — pero eso es el mundo
// de juguete, y ahí la placa es un `define` de mentira que incrementa un contador. Lo que el ticket
// pide es otra cosa: que un zombie andando encienda un CIRCUITO. Aquí se mide eso y solo eso, en el
// Mundo de verdad, con la `hab:placa` de `redstone/redstone-piezas.js` (manual + emite 15 + pulso) y
// un `hab:cable` de testigo pegado al lado.
//
// Tres tramos, y el tercero es el que impide el falso verde:
//
//   A · el agente cruza la placa            → la celda pasa a `hab:placa-on` y el cable a `-on`
//   B · se suelta sola pasado el `pulso`    → si no, «encendida» solo diría que alguien la tocó una vez
//   C · el mismo agente con placas:false    → NO la enciende: es él quien la pisa, no el escenario
//
// No persiste nada: bloquea los POST y devuelve cada celda tocada a su id anterior.
//
//   node test_agente_pisa_placa.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}

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
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear && game.bloques', null, { timeout: 120000 });
  // El redstone se carga solo desde mundo-autoarranque, pero no se espera: hay que darle su tiempo.
  await p.waitForFunction('window.game && game.redstone && game.redstone.info', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || '';
    const tocadas = new Map();
    const pon = (x, y, z, id) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, id | 0);
    };
    const frame = () => new Promise(res => requestAnimationFrame(res));
    const esperar = ms => new Promise(res => setTimeout(res, ms));

    // ── el escenario: pasillo macizo, la placa en medio y un cable de testigo al lado ──────────
    const AN = 12, AL = 5, PR = 6;
    let caja = null;
    const yTope = Math.min(40, mc.dim.y - AL - 2);
    for (let y = 6; y < yTope && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = 0; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          // ...y con el suelo de debajo también vacío, que lo vamos a poner nosotros
          for (let i = 0; i < AN && libre; i++) for (let k = 0; k < PR && libre; k++)
            if (idEn(x + i, y - 1, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el pasillo'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    const idSuelo = mc.name2id['asset:assets/hierba.vox.json'] || mc.name2id['dirt'] || 1;
    for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, idSuelo);

    for (const k of ['hab:placa', 'hab:cable']) {
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); } }
    }
    const idPlaca = mc.name2id['hab:placa'] || 0, idCable = mc.name2id['hab:cable'] || 0;
    if (!idPlaca || !idCable) { out.errs.push('hab:placa / hab:cable no estan en la paleta'); return out; }

    const XP = X + 6, ZP = Z + 3;          // la placa, en la columna por la que pasa el agente
    const ZC = ZP + 1;                     // el cable, PEGADO a ella pero fuera de su huella
    pon(XP, Y, ZP, idPlaca);
    pon(XP, Y, ZC, idCable);
    await esperar(900);                    // que se hornee la geometria fina y repase el circuito

    out.placaAtravesable = !!(mc.atraviesa && mc.atraviesa[idPlaca]);
    out.claveInicialPlaca = claveEn(XP, Y, ZP);
    out.claveInicialCable = claveEn(XP, Y, ZC);
    const inf0 = game.redstone.info(XP, Y, ZP);
    out.esCircuito = !!(inf0 && inf0.esCircuito);
    out.sacaInicial = inf0 ? inf0.saca : null;

    // ── cruzar el pasillo con un zombie de verdad, mirando el circuito cada frame ──────────────
    async function cruzar(etiqueta, tocar) {
      game.esqueletos.quitar();
      const rig = await game.esqueletos.crear('zombie', X + 2, Y, ZP);
      for (let t = 0; t < 200 && !rig.partes.every(P => P.s); t++) await esperar(50);
      if (!rig.partes.every(P => P.s)) return { err: 'el agente no acabo de estamparse (' + etiqueta + ')' };
      // Mismo mando que en test_agente_cuerpo_real.js: objetivo al otro lado, sin correa y sin
      // rendirse a media travesia.
      rig.G.objetivo = [X + AN - 2, Y, ZP];
      rig.G.porClave = false;
      rig.G.deteccion = 0;
      rig.G.distancia = 0.3;
      rig.G.correa = 0;
      rig.G.velocidad = 3;
      if (tocar) tocar(rig);

      const sr = rig.partes[0].s;
      const res = { placaOn: false, cableOn: false, sacaMax: 0, llegoALaPlaca: false, pisadas: 0 };
      for (let t = 0; t < 260; t++) {
        await frame();
        const g = sr._sig; if (!g) continue;
        const cx = (rig.cuerpo[0] + rig.cuerpo[3]) * 0.5 + g.x;
        if (cx >= XP && cx < XP + 1) res.llegoALaPlaca = true;
        if (claveEn(XP, Y, ZP) === 'hab:placa-on') res.placaOn = true;
        if (claveEn(XP, Y, ZC) === 'hab:cable-on') res.cableOn = true;
        const inf = game.redstone.info(XP, Y, ZP);
        if (inf && inf.saca > res.sacaMax) res.sacaMax = inf.saca;
        if (cx > X + AN - 3) break;
      }
      // Cuantas veces ha creido pisar algo (lo cuenta el propio parche, por celda+clave)
      res.pisadas = rig.pisadas ? Object.keys(rig.pisadas).length : 0;
      game.esqueletos.quitar();
      return res;
    }

    // A · el agente enciende el circuito
    out.A = await cruzar('A', null);

    // B · y se suelta sola: `hab:placa` lleva pulso, no se queda pegada
    // Se espera a los DOS por separado. El cable se apaga un paso de propagacion DESPUES que la
    // placa, asi que leerlo en el mismo instante en que la placa se suelta lo pilla todavia
    // encendido una vez de cada tres: no es que se quede pegado, es que se mira demasiado pronto.
    for (let t = 0; t < 60 && claveEn(XP, Y, ZP) === 'hab:placa-on'; t++) await esperar(100);
    out.claveTrasPulso = claveEn(XP, Y, ZP);
    for (let t = 0; t < 30 && claveEn(XP, Y, ZC) === 'hab:cable-on'; t++) await esperar(100);
    out.cableTrasPulso = claveEn(XP, Y, ZC);
    await esperar(300);

    // C · el mismo bicho con la valvula de escape cerrada: no la pisa
    out.C = await cruzar('C', rig => { if (rig.fis) rig.fis.placas = false; });
    out.claveFinal = claveEn(XP, Y, ZP);

    // limpieza: cada celda a lo que tenia
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - 1, Z - 1, X + AN + 1, Z + PR + 1);
    return out;
  });

  console.log('\ncaja de pruebas: ' + JSON.stringify(r.caja)
    + '  placa=' + r.claveInicialPlaca + ' (atravesable=' + r.placaAtravesable + ')'
    + '  cable=' + r.claveInicialCable);
  if (r.errs && r.errs.length) console.log('errores de montaje: ' + r.errs.join(' · '));
  if (!r.A || !r.C) { console.log('no hubo medida: ' + JSON.stringify(r)); await b.close(); process.exit(1); }
  if (r.A.err || r.C.err) { console.log('A: ' + r.A.err + ' · C: ' + r.C.err); await b.close(); process.exit(1); }

  console.log('\nel escenario es de verdad (si no, lo de abajo no probaria nada)');
  ok(r.claveInicialPlaca === 'hab:placa', 'la placa esta puesta y apagada', r.claveInicialPlaca);
  ok(r.claveInicialCable === 'hab:cable', 'el cable testigo esta puesto y apagado', r.claveInicialCable);
  ok(r.esCircuito === true, 'y la celda de la placa ES circuito para el motor de redstone');
  ok(r.sacaInicial === 0, 'que de partida no saca señal', 'saca=' + r.sacaInicial);
  ok(r.placaAtravesable === true, 'la placa se atraviesa: el agente no se sube encima, se mete DENTRO');

  console.log('\nA · el agente articulado presiona la placa (BUG-AG1)');
  console.log('    ' + JSON.stringify(r.A));
  ok(r.A.llegoALaPlaca === true, 'el zombie llega a cruzar la columna de la placa');
  ok(r.A.placaOn === true, '...y la placa se ENCIENDE a su paso (hab:placa-on)');
  ok(r.A.sacaMax === 15, '...soltando los 15 de una fuente de verdad', 'saca=' + r.A.sacaMax);
  ok(r.A.cableOn === true, '...y la señal llega al cable de al lado: es un CIRCUITO, no un contador');
  ok(r.A.pisadas > 0, '...y el agente registra lo que ha pisado', 'celdas=' + r.A.pisadas);

  console.log('\nB · y se suelta sola (la placa lleva `pulso`, no se queda pegada)');
  ok(r.claveTrasPulso === 'hab:placa', 'la placa vuelve a apagarse pasado el pulso', r.claveTrasPulso);
  ok(r.cableTrasPulso === 'hab:cable', 'y el cable con ella', r.cableTrasPulso);

  console.log('\nC · valvula de escape: fisica:{placas:false} y el mismo bicho NO la pisa');
  console.log('    ' + JSON.stringify(r.C));
  ok(r.C.llegoALaPlaca === true, 'el zombie vuelve a cruzar la columna de la placa');
  ok(r.C.placaOn === false, '...y esta vez la placa NO se enciende');
  ok(r.C.sacaMax === 0, '...ni saca señal', 'saca=' + r.C.sacaMax);
  ok(r.claveFinal === 'hab:placa', 'la placa se queda apagada al final', r.claveFinal);

  ok(errores.length === 0, 'sin errores de pagina', errores.join(' · '));
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();