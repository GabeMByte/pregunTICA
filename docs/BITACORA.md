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

## 2026-10-30 — Base de la interfaz (rutas, componentes, socket tipado, hooks) y `host:kick`
- Tests agregados: 162 (100 web, 55 server, 7 shared). En web: rutas, contraste WCAG de los tokens, `OptionButton`, `Timer`, `RankingCard`, `StatusScreen`, socket con Zod, sesión en localStorage, reductores y hooks con socket falso. En el servidor: 50 del motor para `kick` (subagente test-writer) y 5 de integración del handler.
- Archivos tocados: 62 (+ 8 screenshots en `docs/screenshots/`)
- Práctica de IA usada: modo plan + TDD con subagente test-writer + hook de lint + revisión visual autónoma con Playwright (375×812 y 1920×1080) + E2E
- Nota: la revisión visual con screenshots encontró cosas que los tests no ven: en el proyector, figuras amontonadas, botones pequeños y una cinta casi invisible; el rótulo "Incorrecta" ilegible por la opacidad; las opciones en 3 + 1 en vez de 2×2; y capturas vacías del catálogo por carga diferida. Se corrigieron antes de cada commit. La skill frontend-design no estaba disponible y se usó un sistema de tokens propio; react-router ya va en la v8 (no la 7 del plan, misma API declarativa).
- Correcciones a mano: el E2E reutilizaba el `pnpm dev` del usuario (puertos 3000/5173, con la clave real); ahora usa sus propios puertos 3100/5174 con `ANTHROPIC_API_KEY` vacía (verificado que una variable vacía le gana a `--env-file`). El test de contraste no podía leer el CSS en jsdom (se movió a entorno node). Dos tests pasaban sin probar nada y se corrigieron: el de `clientPayloadSchemas` en shared (undefined === undefined mientras estaba en rojo) y el de desuscripción del socket, cuyo fixture era inválido. Otro solo probaba la mitad de lo que decía (responder mientras se espera la siguiente pregunta). El hook de lint atrapó un `setState` síncrono en el efecto del `Timer` y faltaba `zod` como dependencia directa de web.

## 2026-10-30 — Vista del host (proyector)
- Tests agregados: 94 (82 web, 11 server, 1 shared)
- Archivos tocados: 74 (28 son capturas)
- Práctica de IA usada: TDD en engine, E2E autónomo, modo plan, revisión visual con Playwright, dos sesiones en paralelo con git worktrees
- Nota: la revisión del plan halló dos huecos del contrato (contador de respuestas y REVEAL tras recargar); las capturas revelaron que reduced-motion no anulaba los retrasos. La revisión con el subagente security-reviewer no encontró hallazgos altos ni medios (fuzz de 400 partidas sin fugas); los 3 bajos quedaron en SPEC §10.

## 2026-10-30 — Vista del jugador (celular)
- Tests agregados: 73 unitarios, más 9 pruebas Playwright
- Archivos tocados: 24, sin contar las capturas
- Práctica de IA usada: modo plan, tests primero en la lógica, revisión visual con Playwright, dos sesiones en paralelo con git worktrees
- Nota: leer el orden real de eventos del servidor reveló 7 huecos antes de escribir la UI (entre ellos, que un QR nuevo reconectaba a la sala vieja). Las capturas detectaron el logo invisible sobre el fondo coral. El merge con el host entró sin conflictos y una partida completa contra el servidor integrado confirmó el nuevo contrato de question:reveal.

## 2026-10-30 — Pruebas en el celular por Wi-Fi (`pnpm dev:lan`) y contextos no seguros
- Tests agregados: 21 unitarios (9 de detección de IP y QR, 5 de UUID sin `randomUUID`, 7 de errores visibles al unirse o crear sala) y 1 E2E sin APIs de contexto seguro
- Archivos tocados: 19
- Práctica de IA usada: test primero (E2E con init script de Playwright y `crypto` falso en jsdom, ambos confirmados en rojo con el mismo error del celular)
- Nota: el usuario lo encontró al probar en su celular: `crypto.randomUUID()` no existe en `http://192.168.x.x` (no es contexto seguro) y "Entrar" no hacía nada. Ningún test lo vio porque todos corren en localhost, que sí es seguro. Se agregó un respaldo con `crypto.getRandomValues`; era el único uso de APIs de contexto seguro en host y jugador. Además, unirse o crear sala ya no pueden fallar en silencio: un error al enviar o 10 s sin respuesta muestran un mensaje y reactivan el botón.

## 2026-10-30 — Una desconexión ya no cierra la pregunta (ventana de gracia de 5 s)
- Tests agregados: 13 (11 del motor, 1 del registro de salas, 1 de integración con sockets reales) y 5 existentes ajustados
- Archivos tocados: 12
- Práctica de IA usada: TDD en engine (11 tests del motor y el de integración confirmados en rojo antes de implementar)
- Nota: el usuario lo encontró probando con el celular: con 1 jugador, recargar a mitad de pregunta la cerraba de inmediato y la marcaba incorrecta, porque la desconexión hacía verdadero "todos los conectados respondieron". Ahora el motor guarda `disconnectedAt` con el tiempo inyectado, `disconnect` nunca revela y un jugador desconectado hace menos de `DISCONNECT_GRACE_MS` sigue contando como pendiente. Cinco tests existentes (motor y registro) afirmaban el comportamiento del bug y hubo que reescribirlos. Hubo que corregir a mano un `sed` mío que insertó el import en todo el archivo del registro (se detectó por el error de lint antes del commit). El contador del host no ve la ventana de gracia; quedó como riesgo visual en SPEC §10.

## 2026-10-31 — Interfaz en español e inglés con detección automática
- Tests agregados: 49 unitarios en web (detección, persistencia, selector, paridad de claves, errores por código, idioma de preguntas, visibilidad del selector por fase y la guardia de literales; la suite web quedó en 334) y 4 pruebas Playwright (3 de idioma y una partida completa en inglés)
- Archivos tocados: 69, sin contar las capturas (34 nuevas en `docs/screenshots/en/`)
- Práctica de IA usada: modo plan, tests primero en el núcleo, guardia de literales con la API del compilador de TypeScript, revisión visual con Playwright en ambos idiomas
- Nota: el inventario inicial de la guardia encontró 61 literales. Al reforzarla salió que la primera versión no detectaba ternarios (`{ok ? 'Listo' : '…'}`) y además daba un falso positivo con comparaciones dentro de `&&`. Las capturas en inglés mostraron el selector encima del wordmark del host a 375 px, y se corrigió antes del commit. No hizo falta tocar `packages/shared` ni el servidor: los fallos del cliente pasaron a tener códigos propios solo en web.

## 2026-11-01 — Prueba de carga con 50 jugadores bot
- Tests agregados: 10 (6 del reporte y 4 de integración que juegan una partida completa con 50 bots contra el servidor en memoria con el banco local)
- Archivos tocados: 11
- Práctica de IA usada: tests primero (reporte y runner confirmados en rojo), runner separado del CLI para probarlo sin red ni API, hook de lint
- Nota: el script lo corre solo el usuario y quedó en el deny; Claude verificó el runner con el test en memoria, nunca contra una URL. Para no gastar API, la sala se crea con los mismos parámetros del precalentamiento (español, 5 preguntas, media), porque otra cantidad o dificultad no acierta en la caché aunque el tema esté en `WARM_TOPICS`. El hook de lint atrapó un helper de test que ignoraba sus parámetros.
