# Built on GitHub Actions and pushed to GHCR; the VPS only pulls (see .github/workflows/deploy.yml).
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# API and worker share this image. shortcut: keeps devDependencies because `prisma migrate deploy`
# needs the Prisma CLI; prune it if the image size starts to hurt the VPS.
FROM base AS api
COPY . .
RUN pnpm install --frozen-lockfile --filter . --filter 'api...'
RUN pnpm --filter 'api...' build
ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
CMD ["node", "dist/main.js"]

FROM base AS web-build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_API_MOCK=false BUILD_STANDALONE=true
COPY . .
RUN pnpm install --frozen-lockfile --filter . --filter 'web...'
RUN pnpm --filter 'web...' build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
USER node
CMD ["node", "apps/web/server.js"]
