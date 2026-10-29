# PregunTICA — Especificación

Trivia multijugador en tiempo real (estilo Kahoot) donde la IA genera las preguntas sobre cualquier tema al instante. Los jugadores entran desde el celular escaneando un QR.

## 1. Objetivo de la competencia

Demostrar dos cosas:
1. **IA dentro del producto**: preguntas generadas en segundos sobre cualquier tema.
2. **IA para construirlo**: un producto completo, probado y desplegado en 7 días, construido con Claude Code (spec primero, TDD, subagentes, hooks, pruebas E2E autónomas, CI).

## 2. Alcance (MVP)

### Incluido
- Host crea sala: tema, cantidad de preguntas (5–15), dificultad (fácil/media/difícil).
- Código de sala de 6 caracteres + QR para unirse.
- Jugadores se unen con apodo desde el celular (sin registro).
- Preguntas de 4 opciones, temporizador de 20 s.
- Revelación de respuesta con distribución de votos y explicación breve.
- Ranking (top 5) entre preguntas y podio final animado.
- Reconexión si un jugador recarga la página; el host recupera el control de su sala con un token secreto.
- Jugadores que llegan tarde pueden unirse con la partida en curso.
- Desplegado en una URL pública.

### Fuera de alcance
- Cuentas de usuario, base de datos persistente, historial de partidas.
- Edición manual de preguntas (stretch goal si sobra tiempo).
- Imágenes en preguntas.

## 3. Reglas del juego

### Máquina de estados de la sala

```
GENERATING → LOBBY → QUESTION → REVEAL → LEADERBOARD ─┬→ QUESTION
                                                      └→ PODIUM
```

- **GENERATING**: la IA genera todas las preguntas al crear la sala. Los jugadores ya pueden unirse (la latencia queda oculta).
- **LOBBY**: el host ve los jugadores conectados y pulsa "Iniciar" (solo si las preguntas están listas y hay ≥1 jugador).
- **QUESTION**: 20 s o hasta que todos respondan.
- **REVEAL**: respuesta correcta, distribución de votos, explicación.
- **LEADERBOARD**: top 5. El host avanza manualmente.
- **PODIUM**: top 3 final.

### Jugadores tardíos y desconexiones
- Un jugador puede unirse en QUESTION, REVEAL o LEADERBOARD (no en PODIUM). Entra con 0 puntos y participa desde la **siguiente** pregunta: si entra durante QUESTION no recibe esa pregunta, se le indica que espere, no puede responderla y no se le espera para pasar a REVEAL.
- Antes de empezar (GENERATING o LOBBY) un jugador que se desconecta se elimina de la sala: libera su lugar y su apodo. Si vuelve, entra como jugador nuevo. Con la partida en curso se conserva con su puntaje y puede reconectarse.
- Si el host se desconecta, la partida no se rompe: los timers siguen y la sala llega a REVEAL, donde espera (sin avanzar sola) hasta que el host vuelva con `host:rejoin` y pulse `host:next`.

### Puntaje
- Incorrecta o sin respuesta: 0 y la racha se reinicia.
- Correcta: `round(1000 * (1 - (t / T) / 2))` donde `t` = tiempo en responder y `T` = límite. Rango: 500–1000.
- Bono por racha: `+100 * min(racha - 1, 5)`.
- Solo cuenta la primera respuesta de cada jugador.

### Límites
- Máx. 50 jugadores por sala; apodo de 1–16 caracteres, único en la sala (sin distinguir mayúsculas). El apodo se normaliza con NFKC, se quitan los caracteres invisibles y de control y se colapsan los espacios; no se detectan homoglifos entre alfabetos.
- Máx. 10 intentos de `player:join` por socket por minuto, contando los fallidos. Es por socket y no por IP porque un aula entera puede compartir la IP del router.
- Salas inactivas por más de 1 h se eliminan.
- Máx. 5 salas creadas por IP cada 10 min. La IP es la del socket; solo si `TRUST_PROXY=true` (despliegue detrás del proxy de Render o Railway) se toma el último valor de `X-Forwarded-For` (el que agrega el proxy; los anteriores los controla el cliente).

## 4. Arquitectura

Monorepo con pnpm workspaces, todo en TypeScript.

```
pregunTICA/
├── apps/
│   ├── server/          Node + Socket.io; sirve también el build del frontend
│   │   └── src/
│   │       ├── engine/  Lógica del juego: funciones puras, sin I/O (TDD)
│   │       ├── ai/      Generación de preguntas con Claude API
│   │       ├── rooms/   Registro de salas en memoria, timers, expiración
│   │       └── socket/  Handlers de eventos (capa delgada)
│   └── web/             React + Vite
│       └── src/
│           ├── host/    Pantalla del presentador (proyector)
│           └── player/  Pantalla del jugador (celular)
├── packages/
│   └── shared/          Tipos, eventos y esquemas Zod compartidos
└── e2e/                 Pruebas Playwright multijugador
```

### Principios
- **Servidor autoritativo**: el cliente nunca recibe la respuesta correcta antes de REVEAL.
- **Motor puro**: `engine/` expone un reducer `(state, action, now) => state`. El tiempo se inyecta, nunca se usa `Date.now()` dentro del motor.
- **Validación en las fronteras**: todo evento entrante y toda respuesta de la IA se valida con Zod.
- **Estado en memoria**: sin base de datos.

## 5. Eventos Socket.io

| Dirección | Evento | Payload |
|---|---|---|
| C→S | `host:create` | `{ topic, count, difficulty }` |
| C→S | `host:start` | `{ roomCode }` |
| C→S | `host:next` | `{ roomCode }` |
| C→S | `host:rejoin` | `{ roomCode, hostToken }` |
| C→S | `player:join` | `{ roomCode, nickname, playerId? }` |
| C→S | `player:answer` | `{ roomCode, questionIndex, optionIndex }` |
| S→C | `host:created` | `{ roomCode, hostToken }` (solo al host) |
| S→C | `player:joined` | `{ playerId, nickname, waitingForNextQuestion }` (solo a ese jugador) |
| S→C | `room:state` | Estado público de la sala (fase, jugadores, índice) |
| S→C | `question:start` | `{ index, total, prompt, options, endsAt }` (sin respuesta correcta) |
| S→C | `question:reveal` | `{ correctIndex, distribution, explanation, yourResult? }` |
| S→C | `leaderboard` | `{ top: [{ nickname, score, delta }] }` |
| S→C | `game:end` | `{ podium }` |
| S→C | `error` | `{ code, message }` |

`playerId` se genera en el cliente y se guarda en `localStorage` para reconexión (si no se envía, el servidor genera uno y lo devuelve en `player:joined`). `hostToken` lo genera el servidor, solo viaja en `host:created` y el host lo guarda para `host:rejoin`. Ninguno de los dos se envía nunca a otros clientes.

## 6. Generación de preguntas con IA

- SDK oficial de Anthropic. Modelo configurable con `ANTHROPIC_MODEL`.
- Usar **tool use** con un esquema JSON para forzar salida estructurada (herramienta `submit_questions`).
- Esquema por pregunta: `prompt` (≤120 car.), `options` (4 textos únicos, ≤60 car.), `correctIndex` (0–3), `explanation` (≤160 car.).
- Validar con Zod. Si falla, **un reintento** devolviendo los errores de validación al modelo.
- **Barajar las opciones en el servidor** (los modelos tienden a sesgar la posición correcta).
- Idioma de las preguntas: español.
- **Respaldo para la demo**: si la API falla, usar un banco local de preguntas (`apps/server/src/ai/fallback.json`).
- **Caché** por `topic + count + difficulty` para que los temas de la demo salgan instantáneos.

## 7. Calidad

- **Unitarias (Vitest)**: motor del juego con cobertura ≥ 90 %, validación de IA con respuestas simuladas.
- **E2E (Playwright)**: 1 host + 3 jugadores en contextos separados juegan una partida completa con la IA simulada.
- **CI (GitHub Actions)**: lint, typecheck, tests unitarios y E2E en cada PR.
- **Revisión por IA** de cada PR.

## 8. Plan de 7 días

| Día | Entregable | Práctica de IA a mostrar |
|---|---|---|
| 1 | Monorepo, tooling, CI en verde, tipos y eventos en `shared` | Modo plan + spec + `CLAUDE.md` |
| 2 | Motor del juego completo con tests | TDD: tests primero |
| 3 | Servidor Socket.io + registro de salas + timers | Subagente revisor de seguridad |
| 4 | Generación con IA, validación, reintento, caché, respaldo | Tool use + Zod |
| 5 | UI host y jugador, QR, ranking y podio animados | Subagentes en paralelo (worktrees) |
| 6 | E2E multijugador, despliegue, pulido | Claude probando la UI en el navegador |
| 7 | Presentación, video de respaldo, métricas | Bitácora → diapositiva de métricas |

## 9. Criterios de demo

- Crear sala → preguntas listas en < 8 s (o instantáneo con caché).
- 10+ celulares conectados sin lag perceptible.
- Partida de 5 preguntas en ~3 minutos.

## 10. Riesgos aceptados

Hallazgos de la revisión de seguridad del Día 3 que no se corrigen en el MVP:

- **El `playerId` funciona como contraseña de reconexión**: quien lo conozca puede tomar esa identidad. Nunca se envía a otros clientes; solo se filtraría desde el propio dispositivo.
- **Un socket host anterior conserva el control tras `host:rejoin`**: requiere haber tenido el `hostToken`, que solo recibe el host.
- **Los jugadores pueden ver cuántos han respondido y cuándo** (`room:state` en QUESTION): no revela qué opción eligieron ni la respuesta correcta, y el host lo muestra de todos modos.
- **No se valida el `Origin` de las conexiones**: no hay cookies ni sesiones que robar. Se resuelve en el despliegue limitando CORS al dominio propio.

### Pendiente
- `host:kick` (Día 5): el host puede expulsar a un jugador desde la pantalla del proyector. Se define primero en `packages/shared`.
