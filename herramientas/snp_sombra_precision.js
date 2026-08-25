// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🌑 SOMBRAS QUE DESAPARECEN Y NO EMPALMAN · el mapa del sol se lee en mediump (fotos #140/#141)
//
// SÍNTOMA (fotos #140 y #141, mapa `empty2`, misma pos, mismo minuto, MISMO SOL):
//   #140 → yaw −88°   #141 → yaw −87°.   UN GRADO. Y el murallón de tierra del fondo cambia de
//   claro a oscuro entero, con costuras donde la sombra ni empalma ni cae donde debe.
//   Nada del mundo se movió: sólo la CÁMARA. Ninguna sombra puede depender del yaw.
//
// POR QUÉ NO PUEDE SER EL HORNEADO
//   `mcRenderShadow` encuadra el mapa del sol con `mcSunFrustum`, que es el mundo entero + margen
//   fijo (MC_SUN_MARGIN=16). No hay ni una variable de cámara ahí dentro. El mapa horneado es
//   IDÉNTICO en las dos fotos ⇒ lo que cambia es cómo lo LEE el fragment shader.
//
// LA CAUSA · `MC_SUN_LIB` corre en un FS declarado `precision mediump float`
//   Terreno (MC_FS, MC_FS_OPAQUE) y estructuras (MC_STRUCT_FS) abren con `precision mediump
//   float;`. El gemelo con textura (MC_STEX_FS) abre con `highp` — y es justo el que NO falla en
//   las fotos (el marco de diamante de la selección se ve correcto). Esa es la pista.
//   mediump = 10 bits de mantisa ⇒ ~1e-3 RELATIVO. Con eso, dentro de `sunFactor`:
//
//   1) LA NORMAL. `vec3 n=normalize(cross(dFdx(w),dFdy(w)))` con `w` = `varying vec3 vWorld`, que
//      en el FS es mediump. Coordenadas de mundo ~50-100 ⇒ el cuantizado vale ~0.05-0.12 bloques.
//      De canto (una pared vista a 2-3° es exactamente el caso de #140/#141: yaw −88 y −87 son
//      2° y 3° de rasante) las dos derivadas son casi paralelas, el `cross` es una resta de dos
//      números casi iguales — cancelación catastrófica — y `normalize` AMPLIFICA ese ruido hasta
//      devolver una dirección arbitraria. La sonda `p=w+n*uSunProbe` sale disparada media celda
//      hacia cualquier lado, a menudo DENTRO del terreno ⇒ `sunSample` responde «tienes algo
//      encima» ⇒ la cara entera se va a sombra. Un grado de yaw cambia el signo del ruido y la
//      pared vuelve a la luz. Eso es exactamente lo que se ve entre las dos fotos.
//
//   2) LA ALTURA LEÍDA. `top=(e.x+e.y/255.0)*uSunDim.y+uSunOrg.y` también es mediump. El mapa
//      empaqueta la altura en 16 bits a propósito (dos canales), pero mediump sólo sostiene ~10:
//      con uSunDim.y = dim.y+2+M (58 en este mapa) el escalón real es ~58/1024 ≈ 0.057 bloques.
//      El sesgo de la comparación es `py < top-0.04`. **El sesgo (0.04) es MÁS PEQUEÑO que el
//      error de redondeo (0.057)**, así que no protege de nada: de ahí el acné y las sombras que
//      no empalman consigo mismas de un téxel al siguiente.
//
// SEGUNDO FALLO, INDEPENDIENTE · el radio del PCF asume shadowSize=2048 (fotos #144/#145)
//   Otro síntoma distinto: la sombra de la HERRAMIENTA EN MANO desaparece de golpe al girar 1°.
//   Medido sobre las fotos con recuadro de control (herramientas/foto_diff.py):
//       hierba junto a la varita  Δluma B−A = +5.9
//       hierba lejos (control)    Δluma B−A = +0.8   ⇒ el efecto es real y local a la varita
//   La sonda del mapa del sol en la máquina del dueño dio:  mapa 512²,  0.25 bloques/téxel.
//   Y el radio del PCF (app.js:9775) es `uSunSuave / vec2(uSunDim.x*16.0, uSunDim.z*16.0)`:
//   ese `16.0` son «téxeles por bloque» a mano, que sólo valen si el mapa mide (dim+2·M)·16 =
//   128·16 = 2048. Con 512 el desplazamiento sale **4× corto** ⇒ las 9 muestras caen DENTRO DEL
//   MISMO téxel ⇒ el filtro no filtra y el borde de la sombra es binario. Encima, a 4 téxeles por
//   bloque una varita fina ocupa menos de un téxel, así que su silueta entra y sale del mapa con
//   el movimiento subtéxel: la sombra PARPADEA. Eso es «desaparece de golpe».
//   `uv` ya va normalizado sobre el mapa entero ⇒ un téxel es 1/size en ambos ejes, y punto.
//
// EL PARCHE (tres cosas, cada una con su interruptor para poder aislarlas):
//   · `highp`  → sube el FS a `precision highp float`. Una sola sustitución que arregla de golpe
//                vWorld, uSunOrg, uSunDim, uv y `top`. Es LA corrección de fondo de #140/#141.
//   · `snap`   → además fija la normal al eje dominante. En un mundo de vóxeles todas las caras
//                son axiales, así que esto no es un apaño: es el valor EXACTO, y de paso deja de
//                depender de la precisión de la derivada aunque el rasante sea de 0.1°.
//   · `pcf`    → radio del PCF derivado del TAMAÑO REAL del mapa. Es lo de #144/#145.
//                ⚠️ El lado entra como literal al construir el programa: si cambias
//                `game.shadowSize`, vuelve a llamar a `game.sombraFix.on()`.
//
// DÓNDE ENGANCHA · `mcGLSL(src, esVS)` es el embudo por el que pasa TODO shader antes de
//   compilarse (y antes de que reescriba `varying`→`in` en WebGL2), así que un solo envoltorio
//   cubre WebGL1 y WebGL2 sin tocar `app.js`. Luego se vuelven a llamar los constructores del
//   propio motor (`mcBuildProgram`, `mcBuildStructProgram`, `mcBuildStructTexProgram`) para que
//   sean ELLOS quienes reconstruyan programas y tablas de `loc` — así no se duplica aquí ninguna
//   lista de uniformes que se quedaría desincronizada.
//
// CÓMO PROBARLO (consola, en `/map/empty2`, colocado como las fotos):
//   game.sombraFix.on()                    // highp + normal al eje (por defecto)
//   game.sombraFix.on({snap:false})        // SÓLO highp — para ver cuánto arregla ya de por sí
//   game.sombraFix.on({highp:false})       // SÓLO la normal — debería quedar cojo (sigue el acné)
//   game.sombraFix.off()                   // vuelve a app.js tal cual, para comparar A/B
//   game.sombraFix.on({pcf:false})         // sin el arreglo del PCF — para aislar #144/#145
//   game.sombraFix.estado()                // qué está puesto y cuántas sustituciones entraron
//   game.sombraFix.sonda()                 // ¿llega la herramienta en mano al mapa del sol?
//   Gira el yaw despacio entre −88° y −87°: con el parche la pared NO debe parpadear.
//
// ⚠️ ANTES DE NADA, MIRA `game.shadowSize`: en la máquina del dueño está en **512**, no en el
//   2048 por defecto (se guarda en localStorage `vf_mcShadowSize`, así que sobrevive a recargas).
//   Eso es 1/4 de resolución: 4 téxeles por bloque. `game.shadowSize = 2048` puede arreglar lo de
//   la varita él solo — y es la comprobación que separa «mapa demasiado basto» de «PCF roto».
// ═════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const W = window;
  // ⚠️ `mc` es un `const` de nivel superior de app.js (app.js:7433) ⇒ va al entorno LÉXICO global,
  // NO es propiedad de window: `window.mc` es undefined aunque el motor esté corriendo. Desde un
  // snippet (`new AsyncFunction`) se llega por identificador PELADO. Es la misma trampa que app.js
  // documenta en :12833 al declarar `var mcStuckExtra` a propósito.
  if (typeof mc === 'undefined' || !mc) {
    console.warn('🌑 sombra-precision: no hay motor de mundo. Abre /map/<nombre>.');
    return;
  }
  // `mcGLSL` sí es una `function` de nivel superior ⇒ sí es propiedad de window, y por eso se le
  // puede poner el envoltorio con `window.mcGLSL = …`: los que la llaman dentro de app.js
  // (`mcVS`/`mcFS`) resuelven el identificador pelado contra esa misma propiedad.
  if (typeof mcGLSL !== 'function' || W.mcGLSL !== mcGLSL) {
    console.warn('🌑 sombra-precision: `mcGLSL` no es enganchable desde window; app.js ha cambiado de forma.');
    return;
  }

  // Los tres programas que incluyen MC_SUN_LIB, con el constructor de app.js que los rehace.
  // (MC_STEX_FS ya venía en highp; se reconstruye igual porque el parche es inocuo y así el
  // `snap` de la normal también le llega.)
  const OBRA = [
    { prog: 'prog', loc: 'loc', build: 'mcBuildProgram' },        // terreno, alpha-test
    { prog: 'progOpaque', loc: 'locOpaque', build: 'mcBuildProgram' },  // terreno opaco (early-z)
    { prog: 'structProg', loc: 'structLoc', build: 'mcBuildStructProgram' },
    { prog: 'stexProg', loc: 'stexLoc', build: 'mcBuildStructTexProgram' },
  ];
  const BUILDERS = ['mcBuildProgram', 'mcBuildStructProgram', 'mcBuildStructTexProgram'];

  const M_SUN = 16;   // MC_SUN_MARGIN (app.js:10275)

  const RE_PRECISION = /precision\s+mediump\s+float\s*;/g;
  // El radio del PCF (app.js:9775) es `uSunSuave / vec2(uSunDim.x*16.0, uSunDim.z*16.0)`. Ese
  // `16.0` es «téxeles por bloque» HARDCODEADO, y sólo vale si el mapa mide (dim+2·margen)·16 —
  // o sea shadowSize=2048 en un mundo de 96. Pero `uv` va normalizado sobre el mapa ENTERO, así
  // que un téxel es 1/size en las dos direcciones, cualquiera que sea el tamaño.
  // Con shadowSize=512 el desplazamiento sale 4× corto: las 9 muestras caen DENTRO DEL MISMO
  // téxel, el filtro deja de filtrar sin avisar y el borde de la sombra se vuelve binario.
  const RE_PCF = /vec2\s*\(\s*uSunDim\.x\s*\*\s*16\.0\s*,\s*uSunDim\.z\s*\*\s*16\.0\s*\)/g;

  function ladoDelMapa() {
    const s = (mc.shadow && mc.shadow.size) || mc.shadowSize || 2048;
    return Math.max(256, Math.min(4096, s | 0));
  }
  function texelesPorBloque() { return ladoDelMapa() / (mc.dim.x + 2 * M_SUN); }

  // La MISMA línea aparece en MC_SUN_LIB (sunFactor) y en MC_BLK_LIB (luz de bloque): las dos
  // sufren igual, así que el reemplazo es global a propósito.
  const RE_NORMAL = /vec3\s+n\s*=\s*normalize\(\s*cross\(\s*dFdx\(w\)\s*,\s*dFdy\(w\)\s*\)\s*\)\s*;/g;

  // Normal fijada al eje dominante. Sin `normalize` no hay amplificación de ruido, y en un mundo
  // de cubos el resultado es el exacto, no una aproximación.
  // `q` va vacío si la GPU no da highp en el FS: un `highp` explícito ahí NO compila.
  function normalEje(q) {
    return q + 'vec3 dwx=dFdx(w), dwy=dFdy(w); ' + q + 'vec3 nc=cross(dwx,dwy); ' + q + 'vec3 na=abs(nc); ' +
      'vec3 n = (na.x>=na.y && na.x>=na.z) ? vec3(nc.x<0.0?-1.0:1.0, 0.0, 0.0) ' +
      '       : (na.y>=na.z)               ? vec3(0.0, nc.y<0.0?-1.0:1.0, 0.0) ' +
      '       :                              vec3(0.0, 0.0, nc.z<0.0?-1.0:1.0);';
  }

  const faltan = BUILDERS.filter(f => typeof W[f] !== 'function');
  if (faltan.length) {
    console.warn('🌑 sombra-precision: faltan constructores de programa (' + faltan.join(', ') + ').');
    return;
  }

  const ORIG = W.mcGLSL._orig || W.mcGLSL;   // idempotente: re-ejecutar el snippet no anida envoltorios
  let puesto = false;
  let opciones = { highp: true, snap: true, pcf: true };
  let cuenta = { precision: 0, normal: 0, pcf: 0 };

  function hayHighpEnFS() {
    const gl = mc.gl; if (!gl) return false;
    const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    return !!(f && f.precision > 0);
  }

  function parche(src, esVS) {
    if (esVS) return src;                      // el VS ya es highp por defecto en GLSL ES
    let out = src;
    if (opciones.highp) out = out.replace(RE_PRECISION, function () { cuenta.precision++; return 'precision highp float;'; });
    if (opciones.snap) {
      const q = hayHighpEnFS() ? 'highp ' : '';
      out = out.replace(RE_NORMAL, function () { cuenta.normal++; return normalEje(q); });
    }
    if (opciones.pcf) {
      // El lado del mapa se cuela como literal: se conoce en el momento de construir el programa.
      // Si cambias `game.shadowSize` hay que volver a llamar a game.sombraFix.on().
      const lado = ladoDelMapa().toFixed(1);
      out = out.replace(RE_PCF, function () { cuenta.pcf++; return 'vec2(' + lado + ', ' + lado + ')'; });
    }
    return out;
  }

  // Rehace los programas llamando a los constructores DEL MOTOR. Si alguno no enlaza, deshace:
  // más vale volver a la sombra con costuras que dejar la pantalla en negro.
  function reconstruye() {
    const gl = mc.gl;
    if (!gl) { console.warn('🌑 sombra-precision: sin contexto WebGL todavía.'); return false; }
    const previo = OBRA.map(o => ({ p: mc[o.prog], l: mc[o.loc] }));
    cuenta = { precision: 0, normal: 0, pcf: 0 };

    for (const f of BUILDERS) { if (typeof W[f] === 'function') W[f](); }

    const rotos = OBRA.filter(o => {
      const p = mc[o.prog];
      return !p || !gl.getProgramParameter(p, gl.LINK_STATUS);
    });
    if (rotos.length) {
      OBRA.forEach((o, i) => { mc[o.prog] = previo[i].p; mc[o.loc] = previo[i].l; });
      console.error('🌑 sombra-precision: no enlazan ' + rotos.map(o => o.prog).join(', ') + ' → revertido. Mira el log del shader arriba.');
      return false;
    }
    // Sólo ahora es seguro soltar los viejos.
    OBRA.forEach((o, i) => { if (previo[i].p && mc[o.prog] !== previo[i].p) { try { gl.deleteProgram(previo[i].p); } catch (e) { } } });
    return true;
  }

  // ── SONDA · lee el MAPA DEL SOL de vuelta y dice si la herramienta está DENTRO ────────────────
  // El parche de precisión de arriba sólo cambia cómo se LEE el mapa. Si una sombra desaparece de
  // golpe, la pregunta previa es otra: ¿esa sombra llegó siquiera a HORNEARSE? Esto lo mide en vez
  // de deducirlo: `gl.readPixels` sobre el FBO del sol, decodificando la altura tal y como lo hace
  // `sunSample` (R + G/255, escalado por uSunDim.y y desplazado por uSunOrg.y).
  function leeTop(wx, wz) {
    const gl = mc.gl, S = mc.shadow;
    if (!S || !S.fbo) return null;
    const dimY = mc.dim.y + 2 + M_SUN, orgY = -1;
    const dimX = mc.dim.x + 2 * M_SUN, dimZ = mc.dim.z + 2 * M_SUN;
    const u = (wx + M_SUN) / dimX, v = (wz + M_SUN) / dimZ;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const px = Math.min(S.size - 1, Math.max(0, Math.round(u * S.size)));
    const py = Math.min(S.size - 1, Math.max(0, Math.round(v * S.size)));
    const buf = new Uint8Array(4);
    const fbAntes = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbAntes);
    return { top: (buf[0] / 255 + (buf[1] / 255) / 255) * dimY + orgY, texel: [px, py], rgba: [buf[0], buf[1], buf[2], buf[3]] };
  }

  function sonda() {
    const S = mc.shadow, h = mc._heldToolStruct;
    if (!S) { console.warn('🌑 sonda: no hay mapa de sombra (game.sunShade=1 lo apaga).'); return null; }
    if (!h) { console.warn('🌑 sonda: no llevas herramienta en la mano (mc._heldToolStruct=null).'); return null; }
    const m = h.model || [];
    const wx = m[12], wz = m[14], wy = m[13];
    const enLista = mc.structures.indexOf(h);
    // Barrido de 5×5 téxeles alrededor del eje de la herramienta: el mapa tiene ~16 téxeles por
    // bloque, así que si la pieza entró, alguno de estos tiene que venir MÁS ALTO que el suelo.
    let mejor = null, peor = null;
    const paso = (mc.dim.x + 2 * M_SUN) / S.size;   // bloques por téxel
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const r = leeTop(wx + i * paso, wz + j * paso);
      if (!r) continue;
      if (!mejor || r.top > mejor.top) mejor = r;
      if (!peor || r.top < peor.top) peor = r;      // referencia de SUELO desnudo
    }
    const sueloBajoLaMano = leeTop(wx, wz);
    // Lo que decide si la varita entró en el mapa no es su altura absoluta, sino cuánto LEVANTA
    // el techo de su columna por encima del suelo de al lado. Si sobresale ~0, no está horneada.
    const sobresale = (mejor && peor) ? (mejor.top - peor.top) : 0;
    const r = {
      herramienta: mc._heldToolKey,
      enMcStructures: enLista >= 0,
      sinProyectar: !!h.sinProyectar,
      posicionMundo: (wx == null ? null : [+wx.toFixed(2), +wy.toFixed(2), +wz.toFixed(2)]),
      yaw: mc.yaw, pitch: mc.pitch,
      mapaDelSol: S.size + '²',
      bloquesPorTexel: +paso.toFixed(3),
      topBajoLaMano: sueloBajoLaMano ? +sueloBajoLaMano.top.toFixed(3) : null,
      topMaxEnVecindad: mejor ? +mejor.top.toFixed(3) : null,
      sueloDeReferencia: peor ? +peor.top.toFixed(3) : null,
      sobresaleSobreElSuelo: +sobresale.toFixed(3),
      // El sesgo del shader es 0.04: por debajo de eso `sunSample` ni lo mira.
      herramientaEnElMapa: sobresale > 0.04,
      texelesPorBloque: +(S.size / (mc.dim.x + 2 * M_SUN)).toFixed(2),
      texelesPorBloqueQueAsumeElPCF: 16,
      pcfEfectivo: (S.size / (mc.dim.x + 2 * M_SUN)) === 16,
      ultimoHorneado_ms: S.lastBake ? +(performance.now() - S.lastBake).toFixed(0) : null,
      dirty: !!S.dirty, moved: !!S.moved, geoChanged: !!S.geoChanged,
      shadowMoveMs: mc.shadowMoveMs,
      estructurasEnElMundo: mc.structures.length,
    };
    console.log([
      '🌑 SONDA · ¿llega la herramienta en mano al mapa del sol?',
      '  herramienta ......... ' + r.herramienta,
      '  en mc.structures .... ' + (r.enMcStructures ? '✅ sí' : '⛔ NO (entonces no puede proyectar)') +
      '   sinProyectar=' + r.sinProyectar,
      '  posición (x,y,z) .... ' + JSON.stringify(r.posicionMundo) + '   yaw=' + r.yaw + ' pitch=' + r.pitch,
      '  mapa del sol ........ ' + r.mapaDelSol + '  (' + r.bloquesPorTexel + ' bloques/téxel)',
      '  techo de su columna . ' + r.topBajoLaMano + '   (5×5 téxeles: suelo ' + r.sueloDeReferencia + ' … máx ' + r.topMaxEnVecindad + ')',
      '  ⇒ la herramienta ... ' + (r.herramientaEnElMapa
        ? '✅ SÍ está horneada (levanta el techo ' + r.sobresaleSobreElSuelo + ' bloques sobre el suelo)'
        : '⛔ NO está en el mapa: el techo no sube del suelo ⇒ no hay sombra que leer'),
      '  PCF ................. ' + r.texelesPorBloque + ' téxeles/bloque, pero app.js asume 16' +
      (r.pcfEfectivo ? '  ✅' : '  ⛔ radio ' + (16 / r.texelesPorBloque).toFixed(1) + '× corto: las 9 muestras caen en el MISMO téxel'),
      '  último horneado ..... hace ' + r.ultimoHorneado_ms + ' ms   (dirty=' + r.dirty + ' moved=' + r.moved + ' geo=' + r.geoChanged + ', throttle ' + r.shadowMoveMs + ' ms)',
      '',
      '  Haz esto: sonda() a yaw 20, gira 1°, sonda() a yaw 19. Si «herramientaEnElMapa» cambia de',
      '  ✅ a ⛔, el fallo está en el HORNEADO (mcRenderShadow), no en la lectura, y este parche de',
      '  precisión no puede arreglarlo.',
    ].join('\n'));
    return r;
  }

  const API = {
    sonda: sonda,
    on(opts) {
      opciones = {
        highp: !opts || opts.highp !== false,
        snap: !opts || opts.snap !== false,
        pcf: !opts || opts.pcf !== false,
      };
      if (opciones.highp && !hayHighpEnFS()) {
        opciones.highp = false;
        console.warn('🌑 sombra-precision: esta GPU no da highp en el fragment shader → sólo queda el ajuste de la normal.');
      }
      W.mcGLSL = function (src, esVS) { return ORIG(parche(src, esVS), esVS); };
      W.mcGLSL._orig = ORIG;
      puesto = reconstruye();
      if (!puesto) { W.mcGLSL = ORIG; reconstruye(); return API.estado(); }
      console.log('🌑 sombra-precision PUESTO · highp=' + opciones.highp + ' snap=' + opciones.snap +
        ' pcf=' + opciones.pcf + ' · sustituciones: precision×' + cuenta.precision + ' normal×' + cuenta.normal + ' pcf×' + cuenta.pcf);
      if (opciones.highp && cuenta.precision === 0) console.warn('  ⚠️ 0 «precision mediump float;» encontrados: ¿app.js ya lo cambió?');
      if (opciones.snap && cuenta.normal === 0) console.warn('  ⚠️ 0 normales por derivada encontradas: la regexp ya no casa con app.js.');
      if (opciones.pcf && cuenta.pcf === 0) console.warn('  ⚠️ 0 radios de PCF encontrados: la regexp ya no casa con app.js.');
      return API.estado();
    },
    off() {
      W.mcGLSL = ORIG;
      const antes = puesto;
      puesto = false;
      cuenta = { precision: 0, normal: 0, pcf: 0 };
      reconstruye();
      console.log('🌑 sombra-precision QUITADO · shaders de app.js tal cual' + (antes ? '' : ' (no estaba puesto)'));
      return API.estado();
    },
    estado() {
      const gl = mc.gl;
      const r = {
        puesto: puesto,
        highp: puesto && opciones.highp,
        normalAlEje: puesto && opciones.snap,
        highpDisponible: hayHighpEnFS(),
        sustitucionesPrecision: cuenta.precision,
        sustitucionesNormal: cuenta.normal,
        sustitucionesPcf: cuenta.pcf,
        ladoDelMapa: ladoDelMapa(),
        texelesPorBloque: +texelesPorBloque().toFixed(2),
        texelesPorBloqueQueAsumeElPCF: 16,
        sunProbe: mc.sunProbe,
        sunShade: mc.sunShade,
        shadowSuave: mc.shadowSuave,
        mapaDelSol: mc.shadow ? (mc.shadow.size + '²') : '—',
        // El sesgo del shader es 0.04; si el escalón de altura que la lectura puede resolver es
        // mayor, la comparación es ruido. Con highp deja de serlo.
        escalonAlturaMediump: mc.dim ? +(((mc.dim.y + 2 + 16) / 1024).toFixed(4)) : null,
        sesgoDelShader: 0.04,
      };
      r.sesgoInsuficienteSinHighp = r.escalonAlturaMediump != null && r.escalonAlturaMediump > r.sesgoDelShader;
      console.log([
        '🌑 Sombra proyectada · precisión de la lectura del mapa del sol',
        '  parche .............. ' + (r.puesto ? '✅ puesto' : '⛔ quitado') +
        '  (highp=' + r.highp + ', normal al eje=' + r.normalAlEje + ')',
        '  highp en el FS ...... ' + (r.highpDisponible ? '✅ disponible' : '⛔ NO lo da esta GPU'),
        '  sustituciones ....... precision×' + r.sustitucionesPrecision + '  normal×' + r.sustitucionesNormal + '  pcf×' + r.sustitucionesPcf,
        '  mapa ................ ' + r.ladoDelMapa + '²  ⇒ ' + r.texelesPorBloque + ' téxeles/bloque, pero el PCF de app.js asume 16' +
        (r.texelesPorBloque === 16 ? '  ✅' : '  ⛔ radio ' + (16 / r.texelesPorBloque).toFixed(1) + '× corto ⇒ las 9 muestras caen en el MISMO téxel (borde binario)'),
        '  mapa del sol ........ ' + r.mapaDelSol + '  ·  sunProbe=' + r.sunProbe + '  sunShade=' + r.sunShade + '  shadowSuave=' + r.shadowSuave,
        '  escalón de altura ... ' + r.escalonAlturaMediump + ' bloques en mediump  vs  sesgo ' + r.sesgoDelShader +
        (r.sesgoInsuficienteSinHighp ? '  ⛔ el sesgo NO cubre el redondeo (acné y costuras)' : '  ✅'),
        '  A/B ................. game.sombraFix.on() / .off() ; gira el yaw entre −88° y −87°',
      ].join('\n'));
      return r;
    },
  };

  W.game = W.game || {};
  W.game.sombraFix = API;
  API.on();
})();
