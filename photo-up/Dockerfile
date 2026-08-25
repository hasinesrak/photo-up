# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React/Vite frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@11

# Install dependencies first so this layer is cached.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build the production bundle (tsc -b && vite build).
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json components.json ./
COPY src ./src
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2 — runtime: Node API + built frontend + upload volume
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DIR=/app/public \
    UPLOAD_DIR=/app/uploads

WORKDIR /app

# Install API dependencies only (no build tools needed at runtime).
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY --from=build /app/dist ./public

VOLUME ["/app/uploads"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
