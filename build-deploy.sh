#!/bin/bash

# 1. Генерируем клиент Prisma (включая движок для Linux)
npx prisma generate

# 2. Собираем оптимизированную standalone-версию Next.js
npm run build

# 3. Очищаем временную папку, если она осталась от прошлого раза
rm -rf deploy-staging

# 4. Создаем временную папку для сборки архива
mkdir -p deploy-staging

# 5. Копируем ядро сервера и node_modules
cp -R .next/standalone/* deploy-staging/

# 6. Копируем скомпилированную статику (JS/CSS)
cp -R .next/standalone/.next deploy-staging/

# 7. Копируем схему базы данных (нужна для npx prisma db push на сервере)
cp -R prisma deploy-staging/

# 8. Переходим во временную папку
cd deploy-staging

# 9. КРИТИЧЕСКИ ВАЖНО: Удаляем .env файл, чтобы не затереть боевой конфиг на сервере!
rm -f .env

# 10. Запаковываем всё в архив deploy-prod.zip
zip -r ../deploy-prod.zip .

# 11. Возвращаемся назад и удаляем временную папку
cd ..
rm -rf deploy-staging
