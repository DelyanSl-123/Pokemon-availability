# One image for the whole app: the backend serves the built frontend.
# Build:  docker build -t collectiblemarket .
# Run:    docker compose up --build   (see docker-compose.yml)

FROM node:22-bookworm-slim AS build
# Build tools are only needed if better-sqlite3 has no prebuilt binary for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY backend/package.json backend/
RUN cd backend && npm install --no-audit --no-fund
COPY frontend/package.json frontend/
RUN cd frontend && npm install --no-audit --no-fund

COPY backend backend
COPY frontend frontend
RUN cd backend && npm run build && npm prune --omit=dev
RUN cd frontend && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DB_PATH=/data/tracker.db
WORKDIR /app/backend
# Same layout as in the repo: the backend looks for ../../frontend/dist next to dist/.
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/config ./config
COPY --from=build /app/frontend/dist /app/frontend/dist

# The database lives in a volume so accounts survive restarts and new images.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
