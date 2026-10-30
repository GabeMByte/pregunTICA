# PregunTICA — Especificación

Trivia multijugador en tiempo real (estilo Kahoot) donde la IA genera las preguntas sobre cualquier tema al instante. Los jugadores entran desde el celular escaneando un QR.

## 1. Objetivo de la competencia

Demostrar dos cosas:
1. **IA dentro del producto**: preguntas generadas en segundos sobre cualquier tema.
2. **IA para construirlo**: un producto completo, probado y desplegado en 7 días, construido con Claude Code (spec primero, TDD, subagentes, hooks, pruebas E2E autónomas, CI).

## 2. Alcance (MVP)

### Incluido
- Host crea sala: tema, cantidad de preguntas (5–15), dificultad (fácil/media/difícil) e idioma de las preguntas (español o inglés). La interfaz siempre está en español.
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
| C→S | `host:create` | `{ topic, count, difficulty, language? }` (`language`: `es` \| `en`, por defecto `es`) |
| C→S | `host:start` | `{ roomCode }` |
| C→S | `host:next` | `{ roomCode }` |
| C→S | `host:rejoin` | `{ roomCode, hostToken }` |
| C→S | `player:join` | `{ roomCode, nickname, playerId? }` |
| C→S | `player:answer` | `{ roomCode, questionIndex, optionIndex }` |
| S→C | `host:created` | `{ roomCode, hostToken }` (solo al host) |
| S→C | `player:joined` | `{ playerId, nickname, waitingForNextQuestion }` (solo a ese jugador) |
| S→C | `room:state` | Estado público de la sala (fase, jugadores, índice; solo la copia del host lleva `questionOrigin`: `ai` \| `fallback` \| `null`) |
| S→C | `question:start` | `{ index, total, prompt, options, endsAt }` (sin respuesta correcta) |
| S→C | `question:reveal` | `{ correctIndex, distribution, explanation, yourResult? }` |
| S→C | `leaderboard` | `{ top: [{ nickname, score, delta }] }` |
| S→C | `game:end` | `{ podium }` |
| S→C | `error` | `{ code, message }` |

`questionOrigin` es `null` mientras se generan las preguntas y `fallback` si salieron del banco local: el host lo muestra para que se sepa que la IA no respondió. Solo lo recibe el host: el banco local es público, así que avisar a los jugadores les diría dónde buscar las respuestas.

`playerId` se genera en el cliente y se guarda en `localStorage` para reconexión (si no se envía, el servidor genera uno y lo devuelve en `player:joined`). `hostToken` lo genera el servidor, solo viaja en `host:created` y el host lo guarda para `host:rejoin`. Ninguno de los dos se envía nunca a otros clientes.

## 6. Generación de preguntas con IA

- SDK oficial de Anthropic. Modelo configurable con `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`) y esfuerzo con `ANTHROPIC_EFFORT` (por defecto `low`, para generar rápido).
- **Tool use** con dos herramientas estrictas (`strict: true`): `submit_questions` para entregar las preguntas y `reject_topic` para rechazar temas inapropiados o que intenten cambiar las instrucciones. Los modelos actuales no aceptan `tool_choice` forzado, así que se usa `auto` y el prompt pide usar una de las dos; una respuesta sin herramienta cuenta como inválida.
- Los temas históricos, científicos o educativos sensibles (guerras, drogas en la medicina, etc.) son válidos.
- El tema va delimitado como dato (`<topic>…</topic>`), nunca como instrucción.
- Esquema por pregunta: `prompt` (≤120 car.), `options` (4 textos únicos, ≤60 car.), `correctIndex` (0–3), `explanation` (≤160 car.).
- Los textos del modelo se normalizan igual que los de los jugadores (NFKC, sin caracteres invisibles, bidi ni de control). Validar con Zod más chequeos extra: cantidad exacta, opciones únicas sin importar mayúsculas y preguntas sin duplicar. Si falla, **un reintento** devolviendo los errores de validación concretos al modelo.
- **Barajar en el servidor** con aleatoriedad inyectada (los modelos tienden a sesgar la posición correcta). Se baraja el orden de las preguntas y de las opciones **en cada entrega**, también si vienen de la caché, para que dos salas con el mismo tema no tengan las respuestas en la misma posición.
- `max_tokens` según la cantidad: 2000 + 400 por pregunta, con un máximo de 8000.
- Idioma de las preguntas: español o inglés, según `language`.
- **Timeout de 15 s** (incluye el reintento); luego, respaldo.
- **Respaldo para la demo**: si la API falla, se agota el tiempo o no hay `ANTHROPIC_API_KEY`, se usan los bancos locales `apps/server/src/ai/fallback.es.json` y `fallback.en.json`, y el host lo ve con `questionOrigin: 'fallback'`.
- **Tema rechazado**: el host recibe `error TOPIC_REJECTED`, los jugadores que hubieran entrado reciben `ROOM_NOT_FOUND` y la sala se cierra. No se usa el respaldo (sería saltarse el filtro) y el intento cuenta para el límite de salas por IP.
- **Caché** en memoria por tema normalizado (NFKC, minúsculas, espacios colapsados) + `count` + `difficulty` + `language`. Solo guarda preguntas generadas por la IA; máximo 100 entradas (se desaloja la menos usada). Los temas de `WARM_TOPICS` quedan fijos y no cuentan para ese máximo.
- **`WARM_TOPICS`** (lista separada por comas): al arrancar se precalienta la caché con esos temas en español, 5 preguntas, dificultad media.
- **Tope global de gasto**: máximo 3 generaciones con IA en paralelo y 60 por hora, sin importar la IP; al superarlo se usa el banco local. El límite de salas por IP agrupa las direcciones IPv6 por su prefijo /64.
- Composición: `Shuffled(Cached(Limited(Fallback(Claude, Local))))`.
- **Nunca registrar la API key**: los errores del SDK se registran solo con nombre, status y mensaje.
- **Evaluación** (`pnpm eval:questions`, fuera del CI, usa la API real): compara modelos en 12 temas × 2 idiomas, con rechazos falsos de temas delicados reportados aparte.

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

Hallazgos de la revisión de seguridad del Día 4 que no se corrigen en el MVP:

- **El banco de respaldo es público** (`fallback.es.json` y `fallback.en.json` en el repositorio, 15 preguntas por idioma, y una partida puede usar hasta 15): si la IA no responde, un jugador que conozca el repo puede reconocer las preguntas y buscar las respuestas. Se mitiga enviando `questionOrigin` solo al host y barajando preguntas y opciones en cada partida; el texto de la respuesta correcta sigue siendo el mismo.
- **La caché reutiliza las mismas preguntas entre salas**: aunque el orden se baraja en cada entrega, quien juegue antes el mismo tema reconoce el texto de la respuesta correcta. Requiere crear otra sala con el mismo tema, cantidad, dificultad e idioma.
- **El filtro de temas no aplica cuando la IA no responde** (timeout, error o sin clave): las preguntas del banco son inofensivas y solo el host elige el tema que se muestra.
- **Los temas rechazados no se cachean**: repetirlos vuelve a llamar a la API, pero cada intento cuenta para el límite de salas por IP y para el tope global.
- **Una sala cuyo respaldo también falla queda en GENERATING** hasta el barrido: requiere que falle el banco local, que se valida al arrancar.

### Pendiente
- `host:kick` (Día 5): el host puede expulsar a un jugador desde la pantalla del proyector. Se define primero en `packages/shared`.
