#!/usr/bin/env python3
"""Parte PLAN.md: el detalle de los tickets CERRADOS se va a PLAN_ARCHIVO.md.

    python3 herramientas/parte_plan_archivo.py            # simulacro, no escribe
    python3 herramientas/parte_plan_archivo.py --escribe  # aplica

Qué hace, y por qué así:

1. **Pone anclas explícitas** (`<a id="-req-osd13"></a>`) delante de cada sección de ticket.
   Hoy el índice enlaza `(#-req-osd13)` pero el encabezado real es
   `### ✅ REQ-OSD13 · Cuánto ocupa… — ✅ resuelto 2026-08-13`, cuyo slug de GitHub lleva
   el título entero detrás: el ancla corta es un PREFIJO y **no resuelve**. Con un ancla
   explícita el enlace corto funciona y, además, sobrevive a que se reescriba el título.

2. **Mueve a PLAN_ARCHIVO.md** las secciones cuyo ancla tiene fila en el índice de
   CERRADOS. Criterio mecánico: si su fila dice que está cerrado, se archiva. Las que no
   tienen fila en ningún índice **se quedan**: entre ellas hay estructura del plan
   (`### F8+ · Futuro`, `### 🧩 Ola C`) y eso no es archivo.

3. **Reescribe los enlaces en los dos sentidos**: en PLAN.md, lo que se fue pasa a
   `(PLAN_ARCHIVO.md#ancla)`; en el archivo, lo que se quedó pasa a `(PLAN.md#ancla)`.

Es idempotente: si el ancla explícita ya está, no la duplica.
"""
import io
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(RAIZ, 'PLAN.md')
ARCHIVO = os.path.join(RAIZ, 'PLAN_ARCHIVO.md')

CABECERA = """# PLAN — archivo de tickets cerrados

El **detalle** de los tickets ya cerrados. Salió de `PLAN.md` el 2026-08-13, cuando ocupaba el
69 % del fichero y hacía caro abrirlo para lo único que se abre a diario: los abiertos.

- El **índice** histórico (la tabla con las filas tachadas) sigue en
  [`PLAN.md`](PLAN.md#-tickets-cerrados--archivo), y cada fila enlaza aquí.
- **Reabrir un ticket** = devolver su fila a la tabla de ABIERTOS de `PLAN.md` y traerse su
  sección de vuelta a mano.
- Cada sección lleva su **ancla explícita** (`<a id="-req-osd13">`), así que los enlaces cortos
  siguen valiendo aunque se reescriba el título.

Guardián: `node tests/test_plan_enlaces.js` comprueba que todo `(#ancla)` de los dos ficheros
resuelve a una sección que existe.

---
"""


def slug(t):
    """El slug que genera GitHub para un encabezado."""
    t = re.sub(r'^#+\s', '', t).lower()
    return ''.join(c for c in t if c.isalnum() or c in ' -_').replace(' ', '-')


def main():
    escribe = '--escribe' in sys.argv
    L = io.open(PLAN, encoding='utf-8').read().split('\n')

    # --- 1. Anclas citadas, y en qué índice está cada una -------------------------------
    def anclas_entre(a, b):
        s = set()
        for l in L[a:b]:
            s |= set(re.findall(r'\]\(#([^)]+)\)', l))
        return s

    i_abiertos = next(i for i, l in enumerate(L) if l.startswith('## 🎫 Tickets ABIERTOS'))
    i_cerrados = next(i for i, l in enumerate(L) if l.startswith('## 🗄️ Tickets CERRADOS'))
    i_fin_cerrados = next(i for i, l in enumerate(L) if i > i_cerrados and l.startswith('## '))
    abiertos = anclas_entre(i_abiertos, i_cerrados)
    cerrados = anclas_entre(i_cerrados, i_fin_cerrados) - abiertos

    # --- 2. Secciones ### y su extensión ------------------------------------------------
    idx = [i for i, l in enumerate(L) if re.match(r'^###\s', l)]
    cortes = sorted(idx + [i for i, l in enumerate(L) if re.match(r'^##\s', l)] + [len(L)])
    secciones = []
    for i in idx:
        fin = next(c for c in cortes if c > i)
        s = slug(L[i])
        # el ancla es el prefijo más largo citado que case con este slug
        cand = [a for a in (abiertos | cerrados) if s.startswith(a)]
        ancla = max(cand, key=len) if cand else None
        secciones.append({'ini': i, 'fin': fin, 'titulo': L[i], 'ancla': ancla,
                          'estado': 'CERRADO' if ancla in cerrados else
                                    'ABIERTO' if ancla in abiertos else 'SIN FILA'})

    mover = [s for s in secciones if s['estado'] == 'CERRADO']
    quedan = [s for s in secciones if s['estado'] != 'CERRADO']
    anclas_mov = {s['ancla'] for s in mover}
    anclas_q = {s['ancla'] for s in quedan if s['ancla']}

    print('secciones ###            : %d' % len(secciones))
    for e in ('CERRADO', 'ABIERTO', 'SIN FILA'):
        g = [s for s in secciones if s['estado'] == e]
        print('  %-9s %3d secciones · %5d líneas' % (e, len(g), sum(x['fin'] - x['ini'] for x in g)))
    print('PLAN.md: %d líneas -> %d ; PLAN_ARCHIVO.md: %d líneas'
          % (len(L), len(L) - sum(s['fin'] - s['ini'] for s in mover),
             sum(s['fin'] - s['ini'] for s in mover)))

    if not escribe:
        print('\n(simulacro: no se ha escrito nada. Repite con --escribe)')
        return

    # --- 3. Construir los dos ficheros ---------------------------------------------------
    padres = {}          # línea de sección -> su ## padre
    padre = None
    for i, l in enumerate(L):
        if re.match(r'^##\s', l):
            padre = l
        if re.match(r'^###\s', l):
            padres[i] = padre

    def con_ancla(s):
        """Las líneas de la sección, con su <a id> delante si no lo tiene ya."""
        cuerpo = L[s['ini']:s['fin']]
        if s['ancla'] and '<a id=' not in L[s['ini'] - 1]:
            cuerpo = ['<a id="%s"></a>' % s['ancla'], ''] + cuerpo
        return cuerpo

    # PLAN_ARCHIVO.md: en el orden original, repitiendo el ## padre cuando cambia
    out, ult = CABECERA.split('\n'), None
    for s in mover:
        if padres[s['ini']] != ult:
            ult = padres[s['ini']]
            out += ['', ult, '']
        out += con_ancla(s) + ['']

    # PLAN.md: se quitan las secciones movidas, se anclan las que quedan
    fuera = set()
    for s in mover:
        fuera |= set(range(s['ini'], s['fin']))
    anclado = {s['ini']: s for s in quedan if s['ancla']}
    nuevo = []
    for i, l in enumerate(L):
        if i in fuera:
            continue
        if i in anclado and '<a id=' not in L[i - 1]:
            nuevo += ['<a id="%s"></a>' % anclado[i]['ancla'], '']
        nuevo.append(l)

    # --- 4. Reescribir los enlaces en los dos sentidos ------------------------------------
    def repunta(lineas, cruzan, fichero):
        n = 0
        for k, l in enumerate(lineas):
            def sub(m):
                nonlocal n
                if m.group(1) in cruzan:
                    n += 1
                    return '](%s#%s)' % (fichero, m.group(1))
                return m.group(0)
            lineas[k] = re.sub(r'\]\(#([^)]+)\)', sub, l)
        return n

    a = repunta(nuevo, anclas_mov, 'PLAN_ARCHIVO.md')
    b = repunta(out, anclas_q, 'PLAN.md')
    print('enlaces repuntados: %d en PLAN.md -> archivo, %d en el archivo -> PLAN.md' % (a, b))

    for ruta, lineas in ((PLAN, nuevo), (ARCHIVO, out)):
        tmp = ruta + '.tmp'
        io.open(tmp, 'w', encoding='utf-8').write('\n'.join(lineas))
        os.replace(tmp, ruta)
        print('escrito %s (%d líneas)' % (os.path.basename(ruta), len(lineas)))


if __name__ == '__main__':
    main()
