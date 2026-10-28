# Bitácora de construcción

Registro de cada funcionalidad y de cómo se usó la IA para construirla. Alimenta la diapositiva de métricas final.

## 2026-10-27 — Spec y configuración de Claude Code
- Tests agregados: 0
- Archivos tocados: 11
- Práctica de IA usada: modo plan + spec primero
- Nota: SPEC.md, CLAUDE.md, hook de lint, comandos /tdd, /bitacora, /demo-check y subagentes security-reviewer y test-writer generados antes de escribir código.

## 2026-10-27 — Monorepo, tooling, CI y contrato de eventos en shared
- Tests agregados: 44 (37 shared, 3 server, 2 web, 2 E2E)
- Archivos tocados: 40
- Práctica de IA usada: modo plan + spec primero + hook de lint
- Nota: la regla de pureza del motor quedó en ESLint (prohíbe Date.now, Math.random, timers e I/O en engine/); hubo que corregir TS 7 → 6.0 (typescript-eslint aún no lo soporta) y separar los webServer de Playwright porque `pnpm --parallel` colgaba Vite.
