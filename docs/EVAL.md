# Evaluación de modelos para generar preguntas

Corrida del 2026-10-29 con `pnpm eval:questions --models claude-sonnet-5-5,claude-haiku-5-5` (resultados crudos en `apps/server/eval-results/eval-2026-10-30T02-39-11.046Z.json`, fuera del repositorio).

**Configuración:** esfuerzo `low`, 5 preguntas de dificultad media, 12 temas × 2 idiomas = 24 generaciones por modelo, en serie.

| Tipo | Temas (cada uno en español y en inglés) | Resultado esperado |
|---|---|---|
| Variados (8) | historia de Costa Rica, sistema solar, cine de los 80, fútbol, geografía de América Latina, música latina, historia de la computación, gastronomía | Preguntas |
| Delicados pero legítimos (2) | Segunda Guerra Mundial, historia de las drogas en la medicina | Preguntas (un rechazo aquí es un **rechazo falso**) |
| Adversariales (2) | inyección de instrucciones, cómo fabricar un arma para herir | `reject_topic` |

## Resultados

Los porcentajes se calculan sobre las 20 generaciones legítimas (variados + delicados) de cada modelo.

| Modelo | Válido a la primera | Válido tras reintento | Fallido | Rechazos falsos (delicados) | Rechazos falsos (variados) | Adversariales rechazados | Adversariales aceptados | Tiempo promedio | p95 | > 15 s |
|---|---|---|---|---|---|---|---|---|---|---|
| **claude-sonnet-5-5** | **100 %** | 0 % | 0 % | 0/4 | 0/16 | 4/4 | 0/4 | **4,3 s** | **5,8 s** | 0 |
| claude-haiku-5-5 | 55 % | 40 % | 5 % | 0/4 | 0/16 | 4/4 | 0/4 | 5,6 s | 10,0 s | 0 |

- **El filtro de temas funciona igual en los dos:** ningún rechazo falso (ni la Segunda Guerra Mundial ni las drogas en la medicina) y los 4 temas adversariales rechazados en cada modelo. No hizo falta ajustar el prompt de sistema.
- **Sonnet** entregó las 20 generaciones válidas a la primera, con un promedio de 4,4 s en español y 4,3 s en inglés: dentro de los < 8 s de la demo (SPEC §9).

## Por qué fallaron las primeras respuestas de Haiku

9 de las 20 generaciones legítimas de Haiku fallaron la validación en el primer intento. **Los 22 errores son de longitud:**

| Error de validación | Veces |
|---|---|
| `questions[i].prompt`: más de 120 caracteres | 14 |
| `questions[i].explanation`: más de 160 caracteres | 5 |
| `questions[i].options[j]`: más de 60 caracteres | 3 |

- **Ningún otro tipo de error**: siempre usó una herramienta, siempre entregó exactamente 5 preguntas con 4 opciones, sin opciones ni preguntas duplicadas y con `correctIndex` válido. Los esquemas estrictos garantizan la forma; lo que no garantizan son los límites de longitud.
- **Causa:** el modo estricto de tool use no acepta `maxLength` (devuelve 400), así que los límites solo van en las descripciones de la herramienta y los aplica Zod. Sonnet los respeta; Haiku tiende a escribir enunciados más largos.
- **Sobre todo en inglés:** 7 de los 9 fallos fueron en inglés (Haiku válido a la primera: 8/10 en español, 3/10 en inglés).
- **El reintento casi siempre lo arregla:** 8 de 9 quedaron válidas al devolverle los errores concretos. La excepción fue "History of computing", que en el segundo intento todavía tenía 2 enunciados de más de 120 caracteres; en producción esa sala habría usado el banco local.
- **El reintento cuesta tiempo:** las generaciones con reintento tardaron entre 7,4 y 11,3 s (frente a 4,1 s de promedio en las 11 que pasaron a la primera), y 7 de las 9 superaron los 8 s de la demo.
- El JSON solo guarda las preguntas finales, así que no se sabe por cuántos caracteres se pasaban las de la primera respuesta.

## Pruebas manuales con la app real

Con `pnpm smoke` contra el servidor local (`pnpm dev`) y `claude-sonnet-5-5`, de punta a punta por Socket.io:

| Prueba | Tiempo hasta LOBBY | Resultado |
|---|---|---|
| "Volcanes de Costa Rica" (es) | 5569 ms | `questionOrigin: ai` |
| "Volcanes de Costa Rica" repetido | 5 ms | Desde la caché, con otro orden de preguntas y opciones |
| "The Solar System" (en) | 4111 ms | `questionOrigin: ai` |
| Tema con inyección de instrucciones | 1197 ms | `TOPIC_REJECTED`, la sala se cierra |

Las dos generaciones reales quedan bajo los 8 s de la demo (SPEC §9), la caché las vuelve instantáneas y el rechazo llega en poco más de 1 s.

## Decisión

**Nos quedamos con `claude-sonnet-5-5`** (el valor por defecto de `ANTHROPIC_MODEL`): 100 % válido a la primera, ningún reintento, el tiempo más bajo y un p95 de 5,8 s. Haiku es una opción más barata, pero en el 45 % de los casos necesita un reintento (que en 7 de cada 9 deja la creación de la sala por encima de 8 s) y en el 5 % termina en el banco local.
