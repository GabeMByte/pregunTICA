---
description: Verifica que la app esté lista para la demo
---

Revisa que PregunTICA esté lista para demostrarse en vivo:

1. Corre `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm test:e2e`. Reporta cualquier fallo.
2. Verifica contra la sección 9 de `SPEC.md` (criterios de demo).
3. Confirma que existe el banco de respaldo `apps/server/src/ai/fallback.json` y que la caché tiene los temas de la demo.
4. Revisa que la vista del jugador funcione a 375 px de ancho y la del host sea legible en proyector.
5. Entrega una lista de pendientes ordenada por riesgo para la demo.
