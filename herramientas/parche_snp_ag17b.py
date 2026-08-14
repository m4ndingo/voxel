#!/usr/bin/env python3
# REQ-AG17 · segunda pasada. El dueño reprodujo el fallo con DOS «Agente Matrix» y tenia razon: lo
# que se cerro (andar contra andar, con un muro detras) funciona y esta medido, pero faltaban tres
# cosas y una de ellas era un fallo de DISEÑO del parche anterior:
#
#   1 · EL PESTILLO DEL SOLAPE PREVIO ERA INCONDICIONAL. `libreDeAgentes` ignoraba al que ya
#       estorbaba antes del paso para no dejar clavado de por vida a un par nacido embutido. Pero
#       «te perdono» a secas significa que un par que se mete dentro se vuelve invisible el uno para
#       el otro PARA SIEMPRE. Y ese par es facil de conseguir: con `distancia: 2` y los dos
#       persiguiendo AL JUGADOR, los dos van al mismo punto del anillo que te rodea. Ahora el
#       perdon es CONDICIONAL: el paso vale solo si ALEJA los centros. «Te perdono si te estas
#       yendo» — el que se hunde mas se bloquea, el que se separa pasa.
#
#   2 · EL PUÑETAZO NO PASABA POR NINGUNA VALIDACION DE AGENTE. El brinco del clic va por
#       `movPaso` → `moverRaiz`, que llamaba a `asentar` a pelo: un agente al que pegas sale
#       despedido y atraviesa a los demas. `moverRaiz` es ademas el unico sitio por el que pasa el
#       patinaje sobre hielo, asi que cambiarlo ahi tapa los dos de una vez.
#       La caja del que vuela lleva su `mov.alto` sumado, o sea que un brinco corto choca (que es lo
#       que pidio el dueño) y solo un lanzamiento que le pase por ENCIMA de la cabeza no choca.
#
#   3 · NO HABIA DESATASCO. Con dos peleandose por el mismo metro cuadrado no basta con prohibir el
#       paso: hay que separarlos. `separarDeAgentes` los aparta 1,5 bloques/s por cabeza (3 entre
#       los dos) mientras esten dentro, validando cada nudge con `asentar` + `solapaJugador` — o
#       sea que un desatasco nunca mete a nadie en la roca ni dentro de ti. Con los centros
#       exactamente encima manda el `id` para que se vayan a lados OPUESTOS y no elijan el mismo.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE por MARCA. Solo cambia `code`.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-AG17b'

# ── 1 · `otroAgente`: la Y del otro es la que tiene, brinco incluido ─────────────────────────────
# (se deja tal cual: `go.y` ya trae el `mov.alto` de los rigs que volaron este frame o el anterior;
#  lo que cambia es la caja del que se mueve, que se le suma en libreDeAgentes)

# ── 2 · el nucleo: perdon condicional + desatasco ────────────────────────────────────────────────
VIEJO = """  function libreDeAgentes(s, a, gx, gy, gz, nx, ny, nz) {
    var rig = s && s._rig;
    if (!rig || esqueletos.length < 2) return true;
    var ya = otroAgente(rig, a, gx, gy, gz, null);
    var o = otroAgente(rig, a, nx, ny, nz, ya);
    if (!o) return true;
    // Ojo: NO se vuelve a mirar despues del empujon. Los dos se han movido lo mismo, asi que el
    // solape es identico — comprobarlo otra vez bloquearia siempre y no empujaria nunca.
    return empujarA(o, nx - gx, nz - gz, rig);
  }"""

NUEVO = """  // REQ-AG17b · el centro en planta de un rig, y si el paso ALEJA los centros. Es la vara con la
  // que se mide «te estas yendo»: monotona, sin casos raros, y no depende de por que eje entraron.
  function cenXZ(caja, gx, gz) { return [(caja[0] + caja[3]) * 0.5 + gx, (caja[2] + caja[5]) * 0.5 + gz]; }
  function seAparta(a, gx, gz, nx, nz, o, go) {
    var b = cenXZ(o.cuerpo, go.x, go.z);
    var p0 = cenXZ(a, gx, gz), p1 = cenXZ(a, nx, nz);
    var d0 = (p0[0] - b[0]) * (p0[0] - b[0]) + (p0[1] - b[1]) * (p0[1] - b[1]);
    var d1 = (p1[0] - b[0]) * (p1[0] - b[0]) + (p1[1] - b[1]) * (p1[1] - b[1]);
    return d1 > d0 + 1e-12;
  }
  function libreDeAgentes(s, a, gx, gy, gz, nx, ny, nz) {
    var rig = s && s._rig;
    if (!rig || esqueletos.length < 2) return true;
    // El brinco del puñetazo cuenta como altura: `g.y` es el SUELO y lo que vuela va en mov.alto.
    // Sumandolo, un brinco corto sigue chocando (que es lo que pidio el dueño: «si disparo a un
    // agente y salta no puede simplemente atravesar a otro») y solo pasa por encima quien de verdad
    // le pasa por encima de la cabeza.
    var lift = (rig.mov && rig.mov.alto) || 0;
    gy += lift; ny += lift;
    // REQ-AG17b · el que ya estorbaba ANTES del paso no da via libre: da via libre SI TE ESTAS
    // YENDO. Perdonarle a secas (como hacia la primera version) dejaba al par invisible el uno para
    // el otro de por vida, y ese par se consigue solo con dos agentes persiguiendote a la misma
    // `distancia`: los dos van al mismo punto del anillo que te rodea.
    var ya = otroAgente(rig, a, gx, gy, gz, null);
    if (ya) {
      var Py = ya.partes && ya.partes[0], gya = Py && Py.s && Py.s._sig;
      if (!gya || !seAparta(a, gx, gz, nx, nz, ya, gya)) return false;
    }
    var o = otroAgente(rig, a, nx, ny, nz, ya);
    if (!o) return true;
    // Ojo: NO se vuelve a mirar despues del empujon. Los dos se han movido lo mismo, asi que el
    // solape es identico — comprobarlo otra vez bloquearia siempre y no empujaria nunca.
    return empujarA(o, nx - gx, nz - gz, rig);
  }
  // REQ-AG17b · desatasco. Prohibir el paso no separa a nadie: dos que se pelean por el mismo metro
  // cuadrado (los dos persiguiendote, o uno que ha aterrizado dentro del otro de un puñetazo) se
  // quedarian embutidos hasta que se muevan las estrellas. Esto los aparta 1,5 bloques/s CADA UNO
  // (3 entre los dos), y cada nudge pasa por asentar() y por el jugador: nunca mete a nadie en la
  // roca, ni en un abismo, ni dentro de ti.
  var DESATASCO_VEL = 1.5;
  function separarDeAgentes(rig, s, g, dt) {
    if (!(dt > 0) || esqueletos.length < 2) return;
    var a = rig.cuerpo, lift = (rig.mov && rig.mov.alto) || 0;
    var o = otroAgente(rig, a, g.x, g.y + lift, g.z, null);
    if (!o) return;
    var Po = o.partes && o.partes[0], go = Po && Po.s && Po.s._sig;
    if (!go) return;
    var p = cenXZ(a, g.x, g.z), b = cenXZ(o.cuerpo, go.x, go.z);
    var dx = p[0] - b[0], dz = p[1] - b[1], n = Math.sqrt(dx * dx + dz * dz);
    // Centros clavados uno encima de otro: sin direccion no hay a donde apartarse. El `id` decide,
    // asi que los dos se van a lados OPUESTOS en vez de elegir el mismo y seguir pegados.
    if (n < 1e-4) { dx = (rig.id < o.id) ? 1 : -1; dz = 0; n = 1; }
    var k = DESATASCO_VEL * dt / n;
    var x0 = g.x, z0 = g.z, y0 = g.y;
    g.x += dx * k; g.z += dz * k;
    if (!asentar(s, a, g, x0, z0, rig.fis ? rig.fis.caida : 0)
        || (!g.montado && solapaJugador(a, g.x, g.y, g.z))) {
      g.x = x0; g.z = z0; g.y = y0;
    }
  }"""

# ── 3 · el puñetazo y el patinaje: moverRaiz valida como un paso ─────────────────────────────────
VIEJO2 = """  function moverRaiz(s, a, g, dx, dz, drop) {
    var x0 = g.x, z0 = g.z, ok = true;
    if (dx) { g.x += dx; if (!asentar(s, a, g, x0, z0, drop)) ok = false; }
    if (dz) { g.z += dz; if (!asentar(s, a, g, g.x, z0, drop)) ok = false; }
    return ok;
  }"""
NUEVO2 = """  function moverRaiz(s, a, g, dx, dz, drop) {
    // REQ-AG17b · `avanzar`, no `asentar`: por aqui pasan el brinco del puñetazo (movPaso) y el
    // patinaje sobre hielo (fisicaPaso), y los dos atravesaban a los demas agentes sin preguntar.
    var x0 = g.x, z0 = g.z, ok = true;
    if (dx) { g.x += dx; if (!avanzar(s, a, g, x0, z0, drop)) ok = false; }
    if (dz) { g.z += dz; if (!avanzar(s, a, g, g.x, z0, drop)) ok = false; }
    return ok;
  }"""

# ── 4 · el desatasco, un tiro por frame y por rig ────────────────────────────────────────────────
VIEJO3 = """      if (g.por !== 1 && avance < 1e-4) rig._atasco = (rig._atasco || 0) + dt;
      else rig._atasco = 0;
"""
NUEVO3 = """      if (g.por !== 1 && avance < 1e-4) rig._atasco = (rig._atasco || 0) + dt;
      else rig._atasco = 0;
      separarDeAgentes(rig, sr, g, dt);          // REQ-AG17b · si ya esta dentro de otro, apartarse
"""

# ── 5 · sube la version del snippet: el mundo vivo compara VERSION para recargar ─────────────────
VIEJO4 = "var VERSION = 'v1.33';"
NUEVO4 = "var VERSION = 'v1.34';"


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0
    if 'REQ-AG17' not in code:
        print('ABORTA: falta el parche REQ-AG17 (parche_snp_ag17.py). Este va DESPUES.', file=sys.stderr)
        return 1

    pares = [('libreDeAgentes', VIEJO, NUEVO),
             ('moverRaiz', VIEJO2, NUEVO2),
             ('el contador de atasco de esqueletosPaso', VIEJO3, NUEVO3),
             ("VERSION 'v1.33'", VIEJO4, NUEVO4)]

    # Todo o nada: se valida cada ancla ANTES de tocar una sola letra.
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?). '
                  'No se toca el snippet.' % (nombre, n), file=sys.stderr)
            return 1

    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: perdon condicional + puñetazo validado + desatasco; VERSION v1.34')
    return 0


if __name__ == '__main__':
    sys.exit(main())
