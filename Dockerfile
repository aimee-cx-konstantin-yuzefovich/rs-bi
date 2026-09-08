# All stages use the same libc/architecture for Next.js, Sharp and Prisma.
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Only this public variable is embedded into the browser build.
ARG NEXT_PUBLIC_WP_LOGIN_URL=https://bi-terminal.rus-silica.com/wp-login.php
ENV NEXT_PUBLIC_WP_LOGIN_URL=$NEXT_PUBLIC_WP_LOGIN_URL
RUN npm run db:generate
# Disposable values satisfy build-time module evaluation, never runtime defaults.
RUN NEXTAUTH_SECRET=build-only-not-a-runtime-secret \
    PROXY_SECRET=build-only-not-a-runtime-secret \
    DATABASE_URL=file:/tmp/build-only.db npm run build
RUN node scripts/package-standalone.mjs

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/db/audit.db
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/deploy ./
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db
USER nextjs
EXPOSE 3000
# Failed migrations prevent startup; exec forwards stop signals to Node.
CMD ["sh", "-c", "node scripts/migrate-deploy.mjs && exec node server.js"]
