# Build context: the repo root (see docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @inventory/api
COPY apps/api apps/api
RUN pnpm --filter @inventory/api build \
 && pnpm --filter @inventory/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/db /out/

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
