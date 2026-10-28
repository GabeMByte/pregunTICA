---
description: Implementa una funcionalidad con TDD estricto (rojo → verde → refactor)
argument-hint: <funcionalidad a implementar>
---

Implementa con TDD estricto: $ARGUMENTS

1. Lee las secciones relevantes de `SPEC.md` y las reglas de `CLAUDE.md`.
2. Lista los casos a cubrir (felices, bordes y errores) y muéstramelos antes de escribir código.
3. **Rojo**: escribe los tests y ejecuta `pnpm test` para confirmar que fallan por la razón correcta.
4. **Verde**: implementa lo mínimo para que pasen.
5. **Refactor**: limpia sin romper tests. Corre `pnpm typecheck` y `pnpm lint`.
6. Haz un commit convencional por cada ciclo rojo→verde.
7. Ejecuta `/bitacora` al terminar.
