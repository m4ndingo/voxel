# -*- coding: utf-8 -*-
"""REQ-ASSET1 · De quién es cada habitante, y quién puede verlo.

EL FALLO QUE ARREGLA, en palabras del dueño: «un usuario que se acaba de crear, cuando accede a los
bloques de las ranuras ve los assets de tipo "hab:" que son del dueño; debería ver los suyos y los
del mundo, pero no los de otros usuarios».

La causa no era un filtro mal escrito: es que **no había con qué filtrar**. `POST /api/habitantes`
escribía el documento tal cual llegaba, sin una sola palabra sobre quién lo había hecho, y
`GET /api/habitantes` devolvía la carpeta entera a todo el que preguntara. Primero autoría, después
filtro — en ese orden, porque la segunda no existe sin la primera.

⛔ EL CAMPO VIAJA DENTRO DEL DOCUMENTO, no en un registro lateral. Es lo contrario de lo que se hizo
con los mundos (`mundos_meta.py`), y a propósito: un mundo son DOS ficheros (`.json` + `.vox`) que ya
se tocan con cerrojo, mientras que un habitante es un fichero y ya se reescribe entero en cada
guardado. Meterlo dentro sale gratis, sobrevive a un `git pull` y no puede desincronizarse.

LOS TRES ESTADOS. El ticket avisa de que «del mundo» es un TERCER estado y no la ausencia de dueño:

  · `autor: "<uid>"`      — de esa persona. Solo ella lo ve, lo reguarda y lo borra.
  · `compartido: true`    — DEL MUNDO. Lo ve todo el mundo. Sigue teniendo autor (o no, si es
                            heredado), y solo el autor —o el dueño del servidor— lo cambia.
  · sin `autor`           — HEREDADO: de antes de este ticket. No es de nadie que tenga cuenta, así
                            que solo el dueño del servidor lo toca. Que se VEA o no lo dice
                            `compartido`, igual que en los otros dos casos.

⚠️ EL PELIGRO DE LOS HEREDADOS, y por qué la adopción no es opcional. De los 26 habitantes que había
al abrir el ticket, unos cuantos (`seta`, `escalera`, `mesa-x2`, `rejilla`…) están ESTAMPADOS dentro
de mundos y snippets: si se quedan invisibles para quien no es el dueño, esos mapas se abren con
agujeros. `herramientas/adopta_habitantes.py` es quien marca `compartido` justo en ésos —los que
alguien referencia— y deja privados los dibujos sueltos del dueño, que es lo que él pidió.

FASE 2 (fuera de este módulo y del ticket, a propósito): «que un usuario le envíe un asset a otro o
que solicite subirlo al mundo». Eso es mensajería entre cuentas —enviar, pedir, aprobar— y no cabe
detrás de un campo. Aquí solo está la pieza que la desbloquea: saber de quién es cada cosa.
"""


def uid_de(u):
    """El uid de quien pide, o `None` si es anónimo. `u` es lo que devuelve `Handler.quien()`."""
    return (u or {}).get('uid') or None


def es_del_mundo(doc):
    """¿Está marcado como «del mundo»? Es una marca EXPLÍCITA, nunca una deducción."""
    return (doc or {}).get('compartido') is True


def autor_de(doc):
    """El uid de quien lo hizo, o `None` si es heredado (de antes del ticket)."""
    return (doc or {}).get('autor') or None


def es_suyo(doc, u):
    """¿Es de quien pide? Un heredado no es de nadie con cuenta: aquí siempre da `False`.

    ⚠️ Las dos mitades tienen que ser verdad. Sin el `bool(autor)`, un anónimo (uid `None`) sería
    dueño de todos los heredados — que es exactamente el agujero que este módulo viene a tapar.
    """
    autor = autor_de(doc)
    return bool(autor) and autor == uid_de(u)


def puede_ver(doc, u):
    """Lo mío y lo del mundo. Lo de los demás, no. Es la regla entera del ticket, en una línea.

    ⛔ El dueño del servidor NO se comprueba aquí: quien llama ya lo ha hecho (`_es_dueno()`), y
    mezclarlo dentro haría que esta función dependiese de la petición y dejase de ser comprobable
    sola. Aquí solo se decide con lo que hay escrito en el documento.
    """
    return es_del_mundo(doc) or es_suyo(doc, u)


def puede_escribir(doc, u):
    """Reguardar, compartir o borrar. Que algo sea DEL MUNDO no lo hace de todos: se mira el autor.

    Un heredado no lo escribe nadie por esta puerta; queda para el dueño del servidor, que entra por
    `_es_dueno()` antes de llegar aquí.
    """
    return es_suyo(doc, u)


def sella(doc, u, previo=None, manda=False):
    """Pone la autoría en un documento que se va a guardar, respetando la que ya hubiera.

    ⚠️ EL AUTOR NO SE COPIA NUNCA DE LO QUE LLEGA, ni el propio ni el ajeno. El editor manda el
    documento ENTERO en cada guardado, así que si se hiciera caso a `doc['autor']` tal como viene,
    cualquiera podría regalarse la autoría de un dibujo con un `curl` — o borrarla sin querer al
    reguardar uno viejo. Es el mismo cuidado que ya se tiene con `createdAt` (REQ-GAL4): manda el
    fichero que hay en disco, no lo que diga quien escribe.

    `previo` es el documento que ya estaba (o `{}`); `manda` es «quien guarda decide sobre este
    documento» (el autor, o el dueño del servidor con su token). Si había autor se conserva; si no,
    el autor es quien está guardando — y si guarda el dueño con el token, no hay uid que poner y el
    dibujo nace HEREDADO, que es como estaban todos.
    """
    previo = previo or {}
    anterior = autor_de(previo)
    nuevo = anterior or uid_de(u)
    if nuevo:
        doc['autor'] = nuevo
    else:
        doc.pop('autor', None)          # heredado: mejor sin el campo que con un `null` que confunde

    # `compartido` es la casilla «del mundo» y ésa SÍ la mueve el cliente — pero solo si quien guarda
    # manda aquí. Si no, vale lo que hubiera en disco: un dibujo no deja de ser del mundo (ni pasa a
    # serlo) porque otro lo reguarde.
    decide = manda or not previo or es_suyo(previo, u)
    if (doc.get('compartido') is True) if decide else es_del_mundo(previo):
        doc['compartido'] = True
    else:
        doc.pop('compartido', None)     # solo un `true` explícito cuenta; `false`/`0`/`""` no se guardan
    return doc


def choca(previo, u):
    """¿Este id ya es de OTRA persona? El id de un habitante es el nombre convertido en slug, así que
    dos usuarios que llamen «casa» a su dibujo aterrizan en el mismo fichero.

    Devuelve el uid del otro (o `'heredado'`) si hay choque, y `None` si el camino está libre. Quien
    llama contesta un 409 con un nombre distinto, que es lo mismo que hace `mundos_meta.nombre_libre`
    con `castillo-2`. ⛔ Lo que NO se puede hacer es dejarlo pasar: sobrescribir sin avisar es perder
    el dibujo de otro.
    """
    if not previo:
        return None
    autor = autor_de(previo)
    if autor is None:
        return 'heredado'
    return None if autor == uid_de(u) else autor


def resumen(doc):
    """Los dos campos, tal como los quiere el listado. Para que `list_all()` no los deduzca a mano."""
    return {'autor': autor_de(doc) or '', 'compartido': es_del_mundo(doc)}
