#!/bin/bash
# ─── RusSilica BI Terminal — Deploy Script ───
# Размещение на Selectel VPS: bi-terminal.rus-silica.com
#
# Архитектура: WordPress + BI Terminal на ОДНОМ домене
# LiteSpeed/Nginx маршрутизирует: /wp-* → WordPress, всё остальное → BI Terminal
#
# Предварительные требования:
#   1. VPS на Selectel с Ubuntu + ISPManager (LiteSpeed)
#   2. WordPress установлен на bi-terminal.rus-silica.com
#   3. SSH-доступ к серверу
#   4. PROXY_SECRET сгенерирован и добавлен в wp-config.php
#
# Использование:
#   chmod +x deploy/deploy.sh
#   ./deploy/deploy.sh

set -e

# ─── Конфигурация ───
SERVER_IP=""          # IP вашего VPS на Selectel (заполните!)
SERVER_USER="root"    # Пользователь SSH
DOMAIN="bi-terminal.rus-silica.com"
# Путь к корневой папке сайта в ISPmanager (обычно /var/www/имя_пользователя/data/www/домен)
# ЗАМЕНИТЕ "admin" на вашего пользователя ISPmanager, если он другой!
WP_ROOT_DIR="/var/www/admin/data/www/$DOMAIN"
REMOTE_DIR="$WP_ROOT_DIR/bi-terminal-app"

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

if [ -z "$SERVER_IP" ]; then
    err "Заполните SERVER_IP в этом скрипте перед запуском!"
fi

# ─── Шаг 1: Установка Node.js ───
log "Шаг 1/5: Установка Node.js на сервере..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "Node.js $(node --version) установлен"
else
    echo "Node.js уже установлен: $(node --version)"
fi

# Установка pm2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo "pm2 установлен"
fi
ENDSSH

# ─── Шаг 2: Копирование файлов на сервер ───
log "Шаг 2/5: Копирование файлов на сервер..."
ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_DIR"

# Копируем исходный код BI-терминала
rsync -avz --exclude='node_modules' --exclude='.next' --exclude='db' \
    --exclude='.git' --exclude='deploy' \
    ./ $SERVER_USER@$SERVER_IP:$REMOTE_DIR/

# Копируем плагин SSO в папку mu-plugins WordPress
log "Копирование плагина SSO в WordPress..."
ssh $SERVER_USER@$SERVER_IP << ENDSSH
mkdir -p $WP_ROOT_DIR/wp-content/mu-plugins
ENDSSH
scp deploy/wordpress/russilica-bi-sso.php $SERVER_USER@$SERVER_IP:$WP_ROOT_DIR/wp-content/mu-plugins/

# ─── Шаг 3: Сборка и запуск (Standalone) ───
log "Шаг 3/5: Сборка и запуск на сервере (Standalone)..."
ssh $SERVER_USER@$SERVER_IP << ENDSSH
cd $REMOTE_DIR

# Установка зависимостей
npm install

# Генерация Prisma клиента и применение миграций
npx prisma generate
npx prisma migrate deploy

# Сборка Next.js (создаст .next/standalone)
npx next build

# Запуск оптимизированной сборки через pm2
pm2 delete bi-terminal 2>/dev/null || true
NODE_ENV=production pm2 start .next/standalone/server.js --name bi-terminal -- --port 3000
pm2 save
pm2 startup | grep "sudo" | bash || true

echo "BI-терминал запущен на порту 3000 (Standalone mode)"
ENDSSH

# ─── Шаг 4: Настройка LiteSpeed (.htaccess) ───
log "Шаг 4/5: Настройка проксирования для LiteSpeed..."
ssh $SERVER_USER@$SERVER_IP << ENDSSH
HTACCESS_FILE="$WP_ROOT_DIR/.htaccess"

# Проверяем, есть ли уже правила проксирования
if ! grep -q "http://127.0.0.1:3000" "\$HTACCESS_FILE" 2>/dev/null; then
    echo "" >> "\$HTACCESS_FILE"
    echo "# --- RusSilica BI Terminal Proxy Rules ---" >> "\$HTACCESS_FILE"
    echo "<IfModule Litespeed>" >> "\$HTACCESS_FILE"
    echo "RewriteEngine On" >> "\$HTACCESS_FILE"
    echo "RewriteCond %{REQUEST_URI} ^/api/ [OR]" >> "\$HTACCESS_FILE"
    echo "RewriteCond %{REQUEST_URI} ^/login [OR]" >> "\$HTACCESS_FILE"
    echo "RewriteCond %{REQUEST_URI} ^/_next/ [OR]" >> "\$HTACCESS_FILE"
    echo "RewriteCond %{REQUEST_URI} ^/$" >> "\$HTACCESS_FILE"
    echo "RewriteRule ^(.*)$ http://127.0.0.1:3000/\$1 [P,L]" >> "\$HTACCESS_FILE"
    echo "</IfModule>" >> "\$HTACCESS_FILE"
    echo "# -----------------------------------------" >> "\$HTACCESS_FILE"
    echo "Правила LiteSpeed добавлены в .htaccess"
else
    echo "Правила LiteSpeed уже существуют в .htaccess"
fi
ENDSSH

# ─── Шаг 5: Проверка ───
log "Шаг 5/5: Проверка доступности..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    log "✅ BI-терминал доступен на https://$DOMAIN"
else
    warn "HTTP $HTTP_CODE. Проверьте: ssh $SERVER_USER@$SERVER_IP 'pm2 logs bi-terminal'"
fi

echo ""
log "══════════════════════════════════════════════════"
log "  RusSilica BI Terminal развёрнут!"
log "  URL: https://$DOMAIN"
log "══════════════════════════════════════════════════"
echo ""
echo "Полезные команды на сервере:"
echo "  Статус:      ssh $SERVER_USER@$SERVER_IP 'pm2 status'"
echo "  Логи:        ssh $SERVER_USER@$SERVER_IP 'pm2 logs bi-terminal'"
echo "  Перезапуск:  ssh $SERVER_USER@$SERVER_IP 'pm2 restart bi-terminal'"
