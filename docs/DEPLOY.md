# Despliegue

PregunTICA se despliega como **una imagen Docker** (`Dockerfile` en la raíz). Un solo proceso Node sirve la API (`/health`), Socket.io y el build de la web en el mismo puerto, el que da la plataforma en `PORT`. Las rutas de React (`/host`, `/play/CODIGO`) responden `index.html`.

> [!WARNING]
> **Una sola instancia, siempre.** Las salas viven en la memoria del proceso (SPEC §4 Principios): con dos instancias, el host y sus jugadores podrían caer en procesos distintos y no verse, y cada reinicio o redespliegue borra las partidas en curso. No actives autoescalado ni más de una réplica, y despliega fuera de la hora de la partida.

## Variables de entorno

| Variable | Valor | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Ya viene en la imagen. En producción el servidor no arranca sin `PUBLIC_ORIGIN`. |
| `PUBLIC_ORIGIN` | `https://NOMBRE.onrender.com` | El único origen que puede abrir un socket (cierra el riesgo de `Origin` de SPEC §10). Solo el origen: esquema y dominio, sin ruta ni barra final. |
| `TRUST_PROXY` | `true` | La plataforma pone un proxy delante: la IP del cliente para el límite de salas sale de `X-Forwarded-For`. Con `true` también se registra una línea por conexión para verificarlo (ver abajo). |
| `ANTHROPIC_API_KEY` | tu clave | Sin ella (o vacía) las preguntas salen del banco local. Guárdala como secreto de la plataforma; nunca en el repositorio ni en la imagen. |
| `ANTHROPIC_MODEL` | opcional | Por defecto `claude-sonnet-5-5` (ver `docs/EVAL.md`). |
| `ANTHROPIC_EFFORT` | opcional: `low`, `medium` o `high` | Por defecto `low`. |
| `WARM_TOPICS` | opcional, separados por comas | Temas que se precalientan en la caché al arrancar, por ejemplo los de la demo. |
| `PORT` | lo pone la plataforma | La imagen escucha en `3000` si no viene. |

### `PUBLIC_ORIGIN` en Render

Es la URL que Render asigna al servicio: **`https://NOMBRE.onrender.com`**, donde `NOMBRE` es el nombre que eliges al crearlo. Por eso se conoce antes del primer despliegue: escribe el nombre, y pon esa URL en `PUBLIC_ORIGIN`.

Si el nombre ya está ocupado, Render agrega un sufijo (`NOMBRE-abcd.onrender.com`). En ese caso, copia la URL exacta que muestra el panel del servicio, actualiza la variable y redespliega. Si después agregas un dominio propio, `PUBLIC_ORIGIN` pasa a ser ese dominio.

## Render (opción principal)

1. **New → Web Service**, conecta el repositorio de GitHub y elige la rama `master`.
2. **Name**: el `NOMBRE` de la URL. **Language/Runtime**: Docker (detecta el `Dockerfile` de la raíz). **Region**: la más cercana a los jugadores.
3. **Instance type**: cualquiera; el plan gratuito sirve para probar, pero se duerme tras 15 min sin tráfico y tarda en despertar, así que para la demo conviene uno pagado o abrir la URL unos minutos antes.
4. **Environment**: agrega las variables de la tabla. `ANTHROPIC_API_KEY` como secreto.
5. **Advanced → Health Check Path**: `/health`.
6. **Scaling**: 1 instancia, sin autoescalado (ver la advertencia).
7. **Create Web Service**. Al terminar, abre `https://NOMBRE.onrender.com/health` (debe responder `{"status":"ok"}`) y luego la app.

## Alternativas

### Koyeb
1. **Create Web Service → GitHub**, elige el repositorio y la rama. **Builder**: Dockerfile.
2. **Exposed ports**: `3000`, HTTP, ruta `/`. **Health checks**: HTTP en `/health`.
3. **Environment variables**: las de la tabla; `PUBLIC_ORIGIN` es la URL pública que asigna Koyeb (`https://NOMBRE-ORG.koyeb.app`, se ve al crear el servicio).
4. **Scaling**: fijo en 1 instancia (mínimo y máximo 1).

### Azure App Service (Web App for Containers)
1. Construye y sube la imagen a un registro (por ejemplo Azure Container Registry): `docker build -t REGISTRO.azurecr.io/preguntica .` y `docker push …`.
2. Crea una **Web App** de tipo contenedor Linux con esa imagen.
3. **Configuración → Variables de entorno**: las de la tabla, más `WEBSITES_PORT=3000`. `PUBLIC_ORIGIN` es `https://NOMBRE.azurewebsites.net` (o la URL que muestra la información general de la app).
4. **Configuración → General**: **Web sockets: activado** (viene apagado) y afinidad de sesión (ARR) desactivada.
5. **Supervisión → Comprobación de estado**: ruta `/health`.
6. **Escalar horizontalmente**: 1 instancia, sin reglas de autoescalado.

## Verificar la IP que usa el límite de salas

Con `TRUST_PROXY=true`, cada conexión deja una línea así en los logs de la plataforma:

```
Client address: rate-limit key 203.0.113.7 (ip 203.0.113.7), X-Forwarded-For: 203.0.113.7
```

1. Abre la app desde tu celular con datos móviles (no la Wi-Fi de la oficina) y busca tu IP pública en el celular.
2. En los logs, la `ip` de tu conexión debe ser esa IP.
3. Si en su lugar aparece una IP interna o del proxy (por ejemplo `10.x.x.x`) y la tuya está antes en `X-Forwarded-For`, hay más de un proxy delante: el servidor toma el último valor del header. Anótalo en SPEC §10 (riesgo aceptado del Día 6) y ajusta qué salto se toma antes de la demo.

La línea solo lleva direcciones: nada de apodos, tokens ni otros headers.

## Probar la imagen en local (sin clave)

Requiere Docker. No usa tu `.env`: `.dockerignore` lo excluye y el contenedor ejecuta `node` directo.

```bash
docker build -t preguntica .
docker run --rm -p 8080:3000 -e PUBLIC_ORIGIN=http://localhost:8080 -e TRUST_PROXY=true preguntica
# El log dice "ANTHROPIC_API_KEY is not set: questions come from the local bank".

curl http://localhost:8080/health                       # {"status":"ok"}
curl -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
  "http://localhost:8080/socket.io/?EIO=4&transport=polling"   # 403

# E2E contra el contenedor (otra terminal):
E2E_BASE_URL=http://localhost:8080 pnpm --filter @preguntica/e2e exec playwright test --config container.config.ts
```
