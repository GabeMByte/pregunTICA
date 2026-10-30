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

## 2026-10-28 — Motor del juego (estados, jugadores, respuestas y puntaje)
- Tests agregados: 147
- Archivos tocados: 17
- Práctica de IA usada: TDD + subagente test-writer + hook de lint
- Nota: el subagente escribió los tests de los 5 ciclos de una vez a partir de un contrato explícito, y todos fallaron por "Not implemented" gracias a stubs previos; cada ciclo verde fue un commit (cobertura del motor 98 %). Hubo que ajustar a mano: implementar `questionsReady` antes de tiempo porque las fixtures de LOBBY lo usaban, y cambiar `in` por `Object.hasOwn` en el refactor.
- Consolidación de tests: 169 → 143 tests del motor; cobertura sin cambios antes y después (98.38 % sentencias, 94.68 % ramas, 100 % funciones y líneas).
- Cobertura de ramas: se validó `optionIndex` dentro del motor (hueco real que solo cubría Zod en el socket, con TDD; +4 tests → 147), el conteo de votos dejó de indexar y los tests de vistas usan `questionIndex: null` antes de iniciar. Ramas 94.68 % → 96.9 %, sentencias 98.38 % → 99.2 %; solo quedan las 2 ramas defensivas inalcanzables con `reduce`.

## 2026-10-28 — Servidor Socket.io, registro de salas, timers y revisión de seguridad
- Tests agregados: 178 (161 server, 17 shared): motor con jugadores tardíos, códigos de sala, rate limiter, registro con timers y expiración, banco local de preguntas, transiciones S→C, 24 de integración con servidor y clientes Socket.io reales, y normalización de apodos.
- Archivos tocados: 35
- Práctica de IA usada: modo plan + subagente test-writer (motor y rooms) + subagente security-reviewer + TDD + hook de lint
- Nota: el security-reviewer encontró con una prueba de concepto lo que los tests no veían: un solo socket podía llenar una sala con 50 jugadores fantasma "conectados" (A1). Se corrigieron 6 hallazgos con test primero (fantasmas, join repetido que hacía broadcast, excepciones que tumbaban el proceso, códigos reutilizados tras el barrido, límite de joins por socket, apodos invisibles) y 4 quedaron como riesgos aceptados en SPEC §10. Los tests atraparon además un bug real de `crypto.randomInt` (máx. < 2^48) antes de desplegar.
- Correcciones a mano: el subagente test-writer murió a mitad por "Login expired" y hubo que reanudarlo; la spec decía tomar el *primer* valor de `X-Forwarded-For`, que el cliente puede falsificar (se cambió al último); el hook de lint atrapó `TimerHandle | null` redundante. Dos errores míos al aplicar los fixes: corrí `npx prettier` sin que el proyecto lo use y reformateó dos archivos enteros, y un script de Python escribió finales de línea CRLF; ambos se revirtieron antes del commit. Además, insertar tests con `\u200B` convertía el escape en el carácter invisible real, justo lo que el test debía detectar: se reescribieron como escapes y se verificó el archivo por bytes.
- Cobertura del servidor: 99.28 % sentencias, 97.29 % ramas, 100 % funciones y líneas.

## 2026-10-29 — Generación de preguntas con Claude, respaldo, caché y evaluación de modelos
- Tests agregados: 261 (249 server, 12 shared): barajado, validación, prompt y herramientas, fuente de Claude con reintento, respaldo con timeout, caché, bancos locales es/en, logs sin clave, configuración, resumen del eval y los fixes de seguridad (barajado por entrega, tope global de gasto, IPv6 /64, `max_tokens`, normalización, temas fijos).
- Archivos tocados: 62
- Práctica de IA usada: modo plan + documentación actual del SDK (skill claude-api) + TDD con subagente test-writer + subagente security-reviewer + hook de lint + eval de modelos
- Nota: leer la documentación antes de implementar cambió dos decisiones del plan: el `tool_choice` forzado devuelve 400 en los modelos actuales (se usó `auto` + herramientas `strict` + reintento) y el modo estricto no acepta `maxLength`, así que los límites van en las descripciones y en Zod. El eval mostró justo ese costo: Haiku falló el 45 % de las primeras respuestas, todas por longitud (14 enunciados, 5 explicaciones y 3 opciones demasiado largas), y el reintento llevó 7 de esos 9 casos a más de 8 s. **Decisión: `claude-sonnet-5-5`** (100 % válido a la primera, 4,3 s de promedio, p95 5,8 s, sin rechazos falsos en temas delicados y 4/4 adversariales rechazados en ambos modelos). Detalle en `docs/EVAL.md`.
- Pruebas manuales (`pnpm smoke`, con la API real, corridas por el usuario): "Volcanes de Costa Rica" en 5569 ms con origen `ai`; el mismo tema repetido en 5 ms desde la caché y con otro orden; "The Solar System" en inglés en 4111 ms con origen `ai`; un tema con inyección de instrucciones dio `TOPIC_REJECTED` en 1197 ms.
- Revisión de seguridad: sin fugas de la clave ni de `correctIndex`; se corrigieron con test 3 hallazgos medios (la caché daba el mismo orden de respuestas a todas las salas, `questionOrigin` les decía a los jugadores que el banco público estaba en uso, no había tope global de gasto) y 4 bajos; 5 quedaron como riesgos aceptados en SPEC §10.
- Correcciones a mano: un test de Park–Miller con semillas pequeñas dejaba siempre la respuesta en la misma posición (se espaciaron las semillas); la validación cortaba antes de reportar la cantidad de preguntas; los pasos 2 y 3 se unieron en un commit porque shared solo rompía el typecheck del servidor; un test de "no registrar la clave" pasaba sin probar nada (`JSON.stringify` de un `Error` da `{}`, se cambió a `inspect`); un `| tail` ocultó un error de lint y se commiteó (se corrigió en el commit siguiente).
- Errores de la IA que hubo que señalar: al probar el script de eval llamé sin querer a la API real (49 llamadas a modelos inexistentes, todas 404, sin costo) porque `--env-file-if-exists` carga el `.env` aunque se quite la variable; eso llevó a bloquear `eval:questions` y `smoke` en `.claude/settings.json` y a agregar la regla 7 en CLAUDE.md, cosas que no hice hasta que el usuario me las pidió (igual que la nota del banco público en SPEC §10).
