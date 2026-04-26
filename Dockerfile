# ─── RusSilica BI Terminal — Production Dockerfile ───
# Многоэтапная сборка для минимального образа

# Этап 1: Установка зависимостей
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Этап 2: Сборка
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Переменные сборки (не секретные)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# BITRIX_WEBHOOK_URL НЕ передаётся при сборке — 
# он будет передан только при запуске контейнера
RUN npm run build

# Этап 3: Продакшн-запуск
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Создаём непривилегированного пользователя
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Копируем standalone-сборку
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Создаём директорию для SQLite
RUN mkdir -p ./db && chown nextjs:nodejs ./db

USER nextjs

EXPOSE 3000

# Запуск standalone-сервера
CMD ["node", "server.js"]
