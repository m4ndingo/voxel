# REQ-MULTI2 · invitar debería encender solo el modo colaborativo

Abierto el 2026-09-02. Ticket → [`PLAN.md`](../../../PLAN.md#-req-multi2).

## De dónde sale

De la misma frase del dueño que [REQ-ASSET1](../REQ-ASSET1/contexto.md), verbatim:

> Podria ser que un usuario le envie un asset a otro o que solicite subirlo al mundo, con
> **multiverse/colaborativo**

Da por supuesto que un mapa compartido ya es colaborativo. Hoy no lo es, y por eso es ticket aparte.

## Lo que se comprobó en el código antes de abrirlo

Multi **sólo arranca si alguien carga el snippet `multi-verse` a mano**. Crear un mundo e invitar no
enciende nada. Las llaves que usa el cliente (`multi/cliente.js`):

- `LLAVE = 'vf_multi_cfg'` — configuración, en `localStorage`.
- `LLAVE_NOMBRE = 'vf_multi_nombre'` — en `sessionStorage`.
- `LLAVE_VALE = 'vf_multi_vale:' + slug` — el vale de invitación, en `sessionStorage`.
- `SUBPROTO = 'voxel-multi'`.

Ninguna de ellas se pone sola por el hecho de que el mapa esté compartido.

## Lo que falta

- **Invitar marca el mapa** en `data/mundos_meta/<slug>.json`, que es el fichero que ya leen los dos
  lados (`server.py` y `multi/servidor_multi.py`, F6.1). El vale firmado ya existe (F5.6).
- **El autoarranque lo lee** y carga `multi-verse` solo, para el que invita y para el invitado.
  ⛔ En `mundo-autoarranque`, **no en `app.js`**: el motor es agnóstico a multi.

## ⛔ Al probarlo

Nunca contra el **8510** — es la partida en vivo del dueño; reiniciarlo echa a quien esté jugando.

```bash
python3 multi/servidor_multi.py --secreto probando --puerto 8512 --datos /tmp/multi-datos-8512 &
VOXEL_WS=ws://localhost:8512 node multi/probe_dos_navegadores.js
```

De uno en uno: dos sondas a la vez se pisan.

## Punto de partida

- `multi/cliente.js`, `multi/servidor_multi.py`, `multi/LEEME.md` (§Producción).
- `data/snippets/mundo-autoarranque.json` — ⛔ se **parchea** con `parche_snp_*.py`, no se reescribe.
