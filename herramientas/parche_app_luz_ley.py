#!/usr/bin/env python3
# «aplica el parche parche-luz-dia-ley a app.js» (dueño, 2026-08-25).
#
# El parche llevaba desde la foto #115 viviendo como snippet (LEY DE ORO: nace aislado, se valida en
# caliente, y solo cuando el dueño lo da por bueno baja al motor). Ya está dado por bueno: esto lo baja.
#
# Qué deja en web/app.js:
#   1. el `mcDynBake` de la Radiance Cascades LUT pasa a llamarse `mcDynBakeRC` — NO se borra: sigue
#      entera y accesible por `game.luzLey.off()` / `game.rcLUT`, que es como el dueño compara;
#   2. `mcDynBakeLey` = el `mcDynBake` de app.js ANTERIOR a la LUT, **sacado de git**, no copiado a mano
#      (copiar a mano es cómo derivan las cosas). Único cambio: el nombre, porque conviven las dos;
#   3. la capa de color de las partículas (`mcLuzColorPinta`), que pinta cada semilla con el color de SU
#      voxel antes de entregarla al bake — la que `game.luzLey.color({saturacion:n})` gobierna;
#   4. `mcDynBake` pasa a ser un DESPACHADOR: todo el motor lo sigue llamando por su nombre y él decide.
#      (El snippet reasignaba `window.mcDynBake` desde fuera, que funciona pero deja al motor corriendo
#      una función que no está escrita en el motor.)
#   5. `game.luzLey` — el mando, al lado de `game.rcLUT`.
#
# Lo que NO baja: el informe «color-particulas», que se queda en el snippet. Es una herramienta de
# depuración: su sitio son los snippets, no las 15 000 líneas del motor.
#
# Idempotente: si `mcDynBakeLey` ya está en app.js, no toca nada.
#
#   python3 herramientas/parche_app_luz_ley.py
import os, re, subprocess, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')


def verbatim_de_git():
    """El `mcDynBake` anterior a la LUT, leído del PADRE del commit que metió MC_LUT_SPHERES."""
    git = lambda *a: subprocess.check_output(('git',) + a, cwd=RAIZ).decode('utf-8')
    commits = git('log', '-S', 'MC_LUT_SPHERES', '--format=%H', '--', 'web/app.js').split()
    if not commits:
        raise SystemExit('No encuentro en git el commit que metió MC_LUT_SPHERES.')
    src = git('show', commits[-1] + '^:web/app.js').split('\n')
    ini = next(i for i, l in enumerate(src) if l.startswith('function mcDynBake(sem){'))
    fin = next(i for i in range(ini + 1, len(src)) if src[i] == '}')
    cuerpo = src[ini:fin + 1]
    cuerpo[0] = cuerpo[0].replace('function mcDynBake(', 'function mcDynBakeLey(')
    return '\n'.join(cuerpo), commits[-1][:7]


# ── 1 · renombrar la LUT ─────────────────────────────────────────────────────────────────────────────
RC_VIEJO = 'function mcDynBake(sem){\n  if(!sem || !sem.length || mc.luzDinamica===false || !mc.grid){ if(mc.dynLight||mc._dynSig) mcDynApaga(); return; }\n  const dim = mc.dim;'
RC_NUEVO = '''// ✨ Radiance Cascades LUT — el bake que entró en 5940da4. Ya NO es el que manda (ver mcDynBake, el
// despachador, más abajo), pero se queda entera: es lo que el dueño quiere poder comparar de noche, y
// se enciende con `game.luzLey.off()`. Lo que infringe está medido y escrito en docs/luz-y-sombra.md:
// escribe el byte en 0..255 crudos contra un techo legal de `alcance × MC_LUZ_SUB`, y la fusión temporal
// hace TEMBLAR el campo entre rondas idénticas.
function mcDynBakeRC(sem){
  if(!sem || !sem.length || mc.luzDinamica===false || !mc.grid){ if(mc.dynLight||mc._dynSig) mcDynApaga(); return; }
  const dim = mc.dim;'''

# ── 2, 3 y 4 · la Ley, el color y el despachador, justo antes de mcDynNivel ──────────────────────────
ANCLA_FIN = '\nfunction mcDynNivel(x, y, z){'

LEY_CABECERA = '''
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ☀️ LA LEY DE LA LUZ — el bake que MANDA (foto #115 del dueño → snippet `parche-luz-dia-ley` →
// aquí, 2026-08-25, con su visto bueno)
//
// Lo de abajo es el `mcDynBake` de este mismo fichero ANTES de la Radiance Cascades LUT, traído
// VERBATIM desde git (commit __COMMIT__^) por herramientas/parche_app_luz_ley.py. No está copiado a
// mano a propósito: es el texto que validaron los guardianes de luz. Si hay que tocarlo, se toca aquí
// y se entiende primero wiki/paginas/ley-de-la-luz.md — es CANDADO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
'''

COLOR_Y_DESPACHADOR = r'''
// ── El color propio de las partículas ────────────────────────────────────────────────────────────────
// `mcDynSync` siembra la capa `game.voxelesUI` con (-1,-1,-1) en las tres casillas de color = «sin color
// propio», y entonces `mcLuzSiembra` reparte el cálido de la casa (1 · 0,85 · 0,50). Resultado: una
// luciérnaga verde alumbraba naranja. Aquí se le devuelve a cada semilla el color de SU voxel, que
// `mc.voxUI` sí guarda y que `mcVoxUILuces` tira al agrupar por celda.
//
// ⚠️ Esto NO toca la Ley de la Luz: la Ley habla de NIVELES (el byte del campo) y aquí no se sube ni uno.
// Se cambia la PROPORCIÓN entre canales, que es `rgbCol` en `mcLitGlow`. Exagerar (saturacion > 1) SOLO
// BAJA canales: el más alto —el que fija el nivel, `a = max(...)`— se queda donde está.
const MC_LUZ_CALIDO = [255, 217, 128];     // (1 · 0,85 · 0,50)×255 = lo que reparte mcLuzSiembra sin color
const MC_LUZ_SAT_MAX = 3;                  // tope de la exageración · 1 = el color de la partícula tal cual
// saturacion 2 la fijó el dueño el 2026-08-25 (fotos #132-#139): con 1 no se distingue del cálido, porque
// la paleta de las luciérnagas de `efectos-demo` YA ES cálida; a 2 los canales se separan lo justo.
const MC_LUZ_COLOR = { activo: true, saturacion: 2, pintadas: 0, _luz: null, _mapa: null };

// Celda del mundo → color 0..255, agrupando EXACTAMENTE igual que mcVoxUILuces (misma celda, misma media).
// Si agrupara distinto, la clave no casaría con la de la semilla y no pintaría nada.
function mcLuzColorMapa(){
  if (MC_LUZ_COLOR._mapa && MC_LUZ_COLOR._luz === mc._voxUILuz) return MC_LUZ_COLOR._mapa;
  const mapa = new Map();
  if (mc.voxUI && mc.voxUILuces !== false) {
    const paso = MC_VOX * Math.max(1, mc.voxUITam | 0), celdas = new Map();
    for (const [nombre, m] of mc.voxUI) {
      if (!(mcVoxUINivel(nombre) > 0)) continue;          // grupo con la luz apagada: ni se recorre
      const mat = mcVoxUIMat(nombre), medio = paso * mcVoxUIGrosor(nombre) * 0.5;
      for (const [k, c] of m) {
        if (!mcVoxUIEmite(c, mat)) continue;              // no emite: es adorno brillante y ya
        const q = k.split(','),
              wx = +q[0] * paso + medio, wy = +q[1] * paso + medio, wz = +q[2] * paso + medio;
        const ck = Math.floor(wx) + ',' + Math.floor(wy) + ',' + Math.floor(wz);
        let a = celdas.get(ck); if (!a) { a = [0, 0, 0, 0]; celdas.set(ck, a); }
        a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3]++;
      }
    }
    for (const [ck, a] of celdas)
      mapa.set(ck, [a[0] / a[3] * 255, a[1] / a[3] * 255, a[2] / a[3] * 255]);
  }
  MC_LUZ_COLOR._mapa = mapa; MC_LUZ_COLOR._luz = mc._voxUILuz;
  return mapa;
}

// De 0 a 1 `saturacion` MEZCLA entre el cálido de la casa (0 = como si esto no existiera) y el color de
// verdad de la partícula (1). Pasado 1, EXAGERA separando los canales del más alto (continuo en s=1).
function mcLuzColorPinta(sem){
  if (!MC_LUZ_COLOR.activo) return 0;
  const mapa = mcLuzColorMapa(); if (!mapa.size) return 0;
  const s = Math.max(0, Math.min(MC_LUZ_SAT_MAX, MC_LUZ_COLOR.saturacion));
  let n = 0;
  for (const sd of sem) {
    if (sd.col) continue;                                 // ya trae color propio: estructura o pieza en la mano
    const c = mapa.get(sd.x + ',' + sd.y + ',' + sd.z);
    if (!c) continue;                                     // no sale de la capa voxelesUI: no es asunto nuestro
    const m = Math.min(1, s);
    let col = [MC_LUZ_CALIDO[0] + (c[0] - MC_LUZ_CALIDO[0]) * m,
               MC_LUZ_CALIDO[1] + (c[1] - MC_LUZ_CALIDO[1]) * m,
               MC_LUZ_CALIDO[2] + (c[2] - MC_LUZ_CALIDO[2]) * m];
    if (s > 1) {
      const mx = Math.max(col[0], col[1], col[2]);
      col = col.map(v => Math.max(0, mx - (mx - v) * s));
    }
    sd.col = col.map(Math.round);
    n++;
  }
  return n;
}

// EL DESPACHADOR. Las dos versiones conviven y esto decide cuál corre. El cambio va por aquí y NO
// reasignando `window.mcDynBake`, que es lo que hacía el snippet desde fuera: aquello funciona (en un
// script clásico la declaración ES una propiedad del window, por eso el parche en caliente podía
// cambiar el bake sin tocar el motor), pero deja al motor corriendo una función que no está escrita en
// el motor. Ahora que está escrita, el interruptor también.
function mcDynBake(sem){
  if (mc.luzLey === false) return mcDynBakeRC(sem);
  MC_LUZ_COLOR.pintadas = mcLuzColorPinta(sem);   // pintar ANTES: el color entra en la firma del bake
  return mcDynBakeLey(sem);
}
'''

# ── 5 · el mando, al lado de game.rcLUT ──────────────────────────────────────────────────────────────
MANDO_ANCLA = 'game.rcLUT = {'
MANDO = r'''// game.luzLey — qué bake reparte la luz que se MUEVE (la herramienta en la mano, un agente, una
// partícula). Dos, y solo dos:
//   game.luzLey.on()    · LA LEY (por defecto): BFS por el aire, haz anisótropo, posición fina en la
//                         siembra. El byte no pasa del techo legal `alcance × MC_LUZ_SUB` y NO tiembla.
//   game.luzLey.off()   · la Radiance Cascades LUT (mcDynBakeRC), que es lo que el dueño quiere poder
//                         volver a ver de noche. Se ajusta con game.rcLUT.
//   game.luzLey.color(v) · el color propio de las partículas. false / 0..3 / {saturacion:n}.
//                          0 = el cálido de la casa de siempre; 1 = su color exacto; >1 exagera.
// Cambiar cualquiera de las dos cosas TIRA el campo y lo reparte de cero: la LUT mezcla el frame anterior
// en espacio de mundo, así que sin esto el campo nuevo sale contaminado con el viejo varios segundos.
game.luzLey = {
  get instalado() { return mc.luzLey !== false; },
  on() { mc.luzLey = true; mcLuzLeyDeCero(); return this.diag(); },
  off() { mc.luzLey = false; mcLuzLeyDeCero(); return this.diag(); },
  conmutar() { return (mc.luzLey === false) ? this.on() : this.off(); },
  color(v) {
    if (v === false || v === true) MC_LUZ_COLOR.activo = v;
    else if (v && typeof v === 'object') {
      if ('saturacion' in v) MC_LUZ_COLOR.saturacion = Math.max(0, Math.min(MC_LUZ_SAT_MAX, +v.saturacion || 0));
      MC_LUZ_COLOR.activo = ('activo' in v) ? !!v.activo : MC_LUZ_COLOR.saturacion > 0;
    } else if (isFinite(+v)) {
      MC_LUZ_COLOR.saturacion = Math.max(0, Math.min(MC_LUZ_SAT_MAX, +v));
      MC_LUZ_COLOR.activo = +v > 0;
    } else {
      // Callarse aquí es el peor fallo posible en un mando de depuración: el dueño probó
      // `color({saturacion:1000})` cuando esto solo aceptaba números, `isFinite(+{})` dio NaN y la
      // llamada se fue por el desagüe SIN AVISAR. Dos fotos perdidas por eso.
      console.warn('game.luzLey.color: no entiendo «' + v + '» (true/false, 0..' + MC_LUZ_SAT_MAX + ' o {saturacion:n})');
      return this.diag();
    }
    mcLuzLeyDeCero();
    return this.diag();
  },
  // El objeto crudo, para que el informe «color-particulas» del snippet lea EL estado y no una copia.
  get _color() { return MC_LUZ_COLOR; },
  diag() {
    return { bake: (mc.luzLey === false) ? 'Radiance Cascades LUT' : 'Ley de la Luz',
             colorPropio: MC_LUZ_COLOR.activo, saturacion: MC_LUZ_COLOR.saturacion,
             topeDeSaturacion: MC_LUZ_SAT_MAX, semillasPintadas: MC_LUZ_COLOR.pintadas,
             semillas: (mc._dynSem || []).length };
  }
};
// Tirar el rastro: la firma del campo, la caché de color y —sobre todo— la fusión temporal de la LUT.
function mcLuzLeyDeCero(){
  MC_LUZ_COLOR._mapa = null; MC_LUZ_COLOR._luz = null;
  if (typeof MC_RC_LUT !== 'undefined' && MC_RC_LUT) { MC_RC_LUT.prevBL32 = null; MC_RC_LUT.prevBox = null; }
  mc._dynSig = null;
  if (typeof mcDynSync === 'function' && mc.grid) mcDynSync();
}
'''


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()

    if 'function mcDynBakeLey(' in src:
        print('ya estaba aplicado: app.js tiene mcDynBakeLey. No se toca nada.')
        return 0

    for nombre, ancla in [('la cabecera del bake LUT', RC_VIEJO),
                          ('mcDynNivel', ANCLA_FIN),
                          ('game.rcLUT', MANDO_ANCLA)]:
        n = src.count(ancla)
        if n != 1:
            print('ABORTA: el ancla «%s» aparece %d veces, esperaba 1.' % (nombre, n), file=sys.stderr)
            return 1

    ley, commit = verbatim_de_git()

    src = src.replace(RC_VIEJO, RC_NUEVO, 1)
    bloque = LEY_CABECERA.replace('__COMMIT__', commit) + ley + '\n' + COLOR_Y_DESPACHADOR
    src = src.replace(ANCLA_FIN, '\n' + bloque + ANCLA_FIN, 1)
    src = src.replace(MANDO_ANCLA, MANDO + MANDO_ANCLA, 1)

    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('aplicado: mcDynBakeLey (verbatim de %s^), color de partículas, despachador y game.luzLey' % commit)
    print('Repasa: node --check web/app.js  ·  y regenera SYMBOLS.md cuando quieras')
    return 0


if __name__ == '__main__':
    sys.exit(main())
