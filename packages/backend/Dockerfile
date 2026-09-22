FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --filter @filapilot/backend...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN pnpm --filter @filapilot/shared build
RUN pnpm --filter @filapilot/backend exec prisma generate
RUN pnpm --filter @filapilot/backend build

FROM base AS runtime
ENV NODE_ENV=production
# pg_dump wird fuer das Backup-Feature gebraucht (services/backupService.ts) - Client-Major-Version
# muss zur Server-Version aus docker-compose.yml (postgres:17-alpine) passen, deshalb ueber das
# offizielle PGDG-Repo statt der (aelteren) Debian-Bordmittel-Version.
RUN apt-get update && apt-get install -y --no-install-recommends curl gnupg ca-certificates \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y curl gnupg \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/pgdg.list
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=build /app/packages/backend/node_modules /app/packages/backend/node_modules
COPY --from=build /app/packages/backend/dist /app/packages/backend/dist
COPY --from=build /app/packages/backend/prisma /app/packages/backend/prisma
COPY --from=build /app/packages/backend/package.json /app/packages/backend/package.json
WORKDIR /app/packages/backend
EXPOSE 4000
CMD ["node", "dist/server.js"]
