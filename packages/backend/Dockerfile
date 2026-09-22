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
RUN pnpm --filter @filapilot/backend exec prisma generate
RUN pnpm --filter @filapilot/backend build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/packages/backend/dist /app/packages/backend/dist
COPY --from=build /app/packages/backend/prisma /app/packages/backend/prisma
COPY --from=build /app/packages/backend/package.json /app/packages/backend/package.json
WORKDIR /app/packages/backend
EXPOSE 4000
CMD ["node", "dist/server.js"]
