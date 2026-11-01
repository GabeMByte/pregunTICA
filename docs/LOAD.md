# Prueba de carga

Resultados de `pnpm load` (`apps/server/scripts/load.ts`, ver SPEC §7). Lo corre solo el usuario, fuera del CI.

## 2026-11-01 — Render (plan free), 50 jugadores

- **URL**: https://preguntica.onrender.com
- **Plan**: Render free (una instancia).
- **Comando**: `pnpm load --url https://preguntica.onrender.com --topic "Volcanes de Costa Rica"`, con los valores por defecto: 50 jugadores, respuestas entre 500 y 8000 ms.
- **Tema**: "Volcanes de Costa Rica", de `WARM_TOPICS`. La sala estuvo lista en 535 ms con `questionOrigin: ai`, así que salió de la caché precalentada y no llamó a la API.

| Métrica | Resultado |
|---|---|
| Duración total | 43 s, 5 preguntas |
| Jugadores unidos | 50/50 |
| Tiempo de unión | p50 111 ms · p95 321 ms · máx 331 ms (n=50) |
| Latencia de `question:start` (jugador − host) | p50 1 ms · p95 4 ms · máx 203 ms (n=250) |
| `question:start` perdidos | 0 |
| Respuestas | 250 enviadas, 250 contadas, 0 perdidas |
| Fin de partida | host sí, jugadores 50/50 |
| Errores | ninguno |

> [!NOTE]
> **Todos los bots corrieron desde una sola máquina** (la laptop del usuario), con la misma conexión que el host. Por eso la latencia de `question:start` mide **cuánto tarda el servidor en repartir el evento a 50 sockets**, no la red de un celular: en el aula, cada teléfono suma su propia latencia de Wi-Fi o datos móviles, que esta prueba no ve. El tiempo de unión sí incluye el viaje de ida y vuelta desde esa máquina hasta Render.

### Lectura

- El reparto es prácticamente simultáneo: el 95 % de los jugadores recibió la pregunta a 4 ms o menos del host. El máximo de 203 ms fue un caso aislado, muy por debajo de los 20 s de cada pregunta.
- No se perdió ninguna respuesta con 50 jugadores, el máximo por sala (`MAX_PLAYERS`).
- El plan free de Render aguantó una sala llena. Recuerda que se duerme tras 15 min sin tráfico (`docs/DEPLOY.md`): abre la URL unos minutos antes de la demo.
