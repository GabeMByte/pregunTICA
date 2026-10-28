# Prompts por día

Copia y pega cada uno en Claude Code al inicio del día. Todos asumen que Claude ya leyó `CLAUDE.md` (lo carga solo).

## Día 1 — Monorepo y contrato
Entra en modo plan (Shift+Tab dos veces) y pega:

> Lee SPEC.md. Crea el monorepo con pnpm workspaces según la sección 4: apps/server (Node + Socket.io + Vitest), apps/web (React + Vite), packages/shared (tipos y esquemas Zod) y e2e (Playwright). Configura TypeScript estricto, ESLint y los scripts de CLAUDE.md. En packages/shared define todos los eventos de la sección 5 con sus esquemas Zod. Agrega un workflow de GitHub Actions que corra lint, typecheck y test. Muéstrame el plan antes de ejecutar.

Al terminar: `/bitacora`.

## Día 2 — Motor del juego
> /tdd motor del juego en apps/server/src/engine: máquina de estados (sección 3), unión de jugadores con sus límites, respuestas y puntaje con racha. Usa el subagente test-writer para escribir los tests primero.

## Día 3 — Servidor en tiempo real
> /tdd registro de salas en memoria y handlers de Socket.io: crear sala, unirse, reconexión con playerId, timers de pregunta y expiración de salas inactivas. Los handlers solo validan con Zod y delegan al motor.

Luego:
> Usa el subagente security-reviewer sobre todo apps/server y corrige los hallazgos de severidad alta y media.

## Día 4 — Generación con IA
> /tdd generación de preguntas en apps/server/src/ai según la sección 6: tool use con la herramienta submit_questions, validación Zod, un reintento con los errores, barajado de opciones, caché y banco de respaldo fallback.json con 15 preguntas de cultura general. Simula el cliente de Anthropic en los tests.

## Día 5 — Interfaz (en paralelo)
Abre dos sesiones de Claude Code en worktrees distintos:

> Sesión A: construye la vista del host en apps/web/src/host: crear sala, QR con el enlace de unión, lobby con jugadores, pregunta con temporizador, revelación con gráfico de distribución, ranking animado y podio. Diseño para proyector.

> Sesión B: construye la vista del jugador en apps/web/src/player: unirse con código y apodo, 4 botones grandes de colores, feedback de acierto/error con puntos y posición. Mobile first, prueba a 375 px.

## Día 6 — E2E y despliegue
> Escribe en e2e/ una prueba Playwright con 1 host y 3 jugadores en contextos separados que juegue una partida completa con la IA simulada. Luego abre la app en el navegador, juega una partida tú mismo y corrige lo que se vea mal. Prepara el despliegue con un Dockerfile que sirva server y web juntos.

Luego: `/demo-check`.

## Día 7 — Presentación
> Lee docs/BITACORA.md y git log. Genera las métricas de la semana (commits, tests, cobertura, líneas, horas aproximadas) y un guion de demo de 5 minutos: problema, demo en vivo con el jurado, cómo se construyó con IA, métricas, cierre.
