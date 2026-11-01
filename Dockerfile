# syntax=docker/dockerfile:1
# One Node process serves the API, Socket.io and the web build on $PORT (SPEC §4 Despliegue).

# --- build: install everything, build web and server (shared is bundled into both) ---
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm comes from the "packageManager" field of package.json.
RUN corepack enable
WORKDIR /repo

# Manifests first, so the install layer is reused while only the sources change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
# Only the server's production dependencies, without workspace links.
RUN pnpm --filter @preguntica/server deploy --prod /out

# --- runtime: no sources, no dev dependencies, no .env (see .dockerignore) ---
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/web
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node directly, not `pnpm start`: that script loads a .env, and the image must never read one.
CMD ["node", "dist/index.js"]
