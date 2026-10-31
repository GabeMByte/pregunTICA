# PregunTICA

Trivia multijugador en tiempo real con preguntas generadas por IA. La especificación completa está en `SPEC.md`: léela antes de implementar cualquier funcionalidad.

## Comandos

```bash
pnpm install            # instalar dependencias
pnpm dev                # server (3000) + web (5173) en paralelo
pnpm dev:lan            # igual, pero web escucha en la red local para probar con el celular (solo el usuario, carga la clave)
pnpm test               # unitarias (Vitest) de todos los paquetes
pnpm test:e2e           # Playwright multijugador
pnpm lint               # ESLint
pnpm typecheck          # tsc --noEmit en todos los paquetes
pnpm build              # build de producción
pnpm eval:questions     # compara modelos con la API real (solo el usuario, cuesta dinero)
pnpm smoke --topic "…" [--language en]  # sala real contra pnpm dev (solo el usuario, usa la API)
```

## Arquitectura

- `packages/shared`: tipos, nombres de eventos y esquemas Zod. **Única fuente de verdad** del contrato cliente-servidor.
- `apps/server/src/engine`: motor del juego como funciones puras.
- `apps/server/src/ai`: generación de preguntas (Claude API con tool use).
- `apps/server/src/rooms`: salas en memoria, timers, expiración.
- `apps/server/src/socket`: handlers delgados; validan con Zod y delegan al motor.
- `apps/web/src/host` y `apps/web/src/player`: las dos vistas de la app.

## Reglas no negociables

1. **El motor es puro**: nada de `Date.now()`, `Math.random()`, timers ni I/O dentro de `engine/`. El tiempo y la aleatoriedad se inyectan.
2. **El cliente nunca recibe `correctIndex` antes de la fase REVEAL.** Cualquier cambio en eventos S→C debe respetarlo.
3. **Todo lo que entra se valida con Zod**: eventos de socket y respuestas de la IA.
4. **TDD en `engine/` y `ai/`**: escribe el test, confirma que falla, luego implementa.
5. Los eventos y tipos nuevos se definen primero en `packages/shared`.
6. Nunca commitear `.env` ni claves. La clave va en `ANTHROPIC_API_KEY`.
7. **Nunca llamar a la API real de Anthropic**: los tests usan un cliente falso y `pnpm eval:questions`, `pnpm smoke` y `pnpm dev:lan` los corre solo el usuario (está bloqueado en `.claude/settings.json`). Ojo: `pnpm dev`, `start` y los scripts cargan el `.env` de la raíz con `--env-file-if-exists`, así que quitar la variable del entorno no basta.

## Convenciones

- Código, nombres y commits en inglés; textos de la UI en español e inglés, siempre por los diccionarios de `apps/web/src/i18n` (nunca literales en JSX: un test lo verifica).
- TypeScript estricto, sin `any`.
- Commits convencionales (`feat:`, `fix:`, `test:`, `chore:`), pequeños y frecuentes.
- Componentes de React pequeños; estado del juego en un solo hook por vista (`useHostGame`, `usePlayerGame`).
- La vista del jugador se diseña **mobile first**; la del host para proyector (texto grande, alto contraste).

## Definición de terminado

Una funcionalidad está terminada cuando:
- `pnpm test`, `pnpm typecheck` y `pnpm lint` pasan.
- Tiene tests (unitarios o E2E según corresponda).
- Se agregó una entrada en `docs/BITACORA.md` (ver formato abajo).

## Bitácora

Después de cada funcionalidad agrega a `docs/BITACORA.md`:

```
## <fecha> — <funcionalidad>
- Tests agregados: <n>
- Archivos tocados: <n>
- Práctica de IA usada: <TDD | subagentes | hook | modo plan | E2E autónomo | ...>
- Nota: <una línea sobre qué aceleró la IA o qué hubo que corregir>
```

Esta bitácora alimenta la diapositiva final de métricas de la presentación.
