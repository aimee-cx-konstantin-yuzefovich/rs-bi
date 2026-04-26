# 🚀 ПОЛНОЕ РУКОВОДСТВО: Подключение WordPress к BI-терминалу

> **Для кого:** Сотрудник RusSilica. Вы умеете пользоваться браузером — этого достаточно.
> Всё подробно расписано: куда нажать, что ввести, где найти.

---

## 📋 СХЕМА: ЧТО И ГДЕ НАХОДИТСЯ

```
┌─────────────────────────────────────────────────────┐
│  bi-terminal.rus-silica.com — ОДИН домен для обоих  │
│                                                     │
│  /wp-login.php    → WordPress (страница входа)      │
│  /wp-admin/       → WordPress (админка)             │
│  /                → BI-терминал (дашборд)            │
│  /login           → BI-терминал (вход)               │
│  /api/            → BI-терминал (данные)             │
└─────────────────────────────────────────────────────┘
```

**Оба сервиса работают на одном домене `bi-terminal.rus-silica.com`.**
WordPress отвечает за вход и управление пользователями.
BI-терминал показывает аналитику.

---

## 📖 СЛОВАРЬ ТЕРМИНОВ

| Термин | Что это простыми словами |
|--------|--------------------------|
| **Сервер (VPS)** | Компьютер в дата-центре Selectel, который работает 24/7. Ваш сайт и WordPress работают на нём |
| **Терминал / SSH** | Программа для «входа внутрь» сервера текстовыми командами. Как пульт ДУ для сервера |
| **Bash** | Язык команд сервера. Когда написано `команда` — вводите в терминале и нажимайте Enter |
| **ISPManager** | Веб-панель для управления сервером. Заходите через браузер, нажимаете кнопки — управляете сайтами |
| **wp-config.php** | Главный файл настроек WordPress. Лежит на сервере, в нём задаются пароли и ключи |
| **mu-plugin** | Плагин WordPress, который включается автоматически. Не нужно активировать в админке |
| **PROXY_SECRET** | Общий секретный ключ. Как ключ от замка — одинаковый должен быть в WordPress и BI-терминале |
| **Nginx** | Веб-сервер. Стоит на вашем сервере, раздаёт страницы. Уже установлен с ISPManager |
| **.env** | Файл настроек BI-терминала. Лежит на сервере, в нём задаются пароли и URL |
| **.env.example** | Шаблон файла настроек. В корне проекта — скопируйте его как `.env` и заполните значения |
| **pm2** | Программа, которая запускает BI-терминал и следит, чтобы он не упал |
| **Standalone build** | Оптимизированная сборка Next.js для VPS — запускается быстрее и потребляет меньше памяти |
| **CI/CD** | Автоматизация: код обновляется на сервере автоматически при пуше в GitHub |

---

## 🔑 ШАГ 0: Узнайте IP-адрес сервера

IP-адрес выглядит как `37.140.192.100` (4 группы цифр через точку).

**Как узнать:**
1. Откройте браузер
2. Зайдите на **selectel.ru** → войдите в личный кабинет
3. Раздел **Облачная платформа** → **Серверы**
4. Найдите ваш сервер → скопируйте **IPv4-адрес**
5. Запишите его — он понадобится много раз

**Также узнаете пароль root** — вы его задавали при создании сервера.

---

## 💻 ШАГ 1: Откройте терминал сервера

Терминал — это окно с чёрным фоном, где вы вводите текстовые команды.
Вы будете вводить команды на сервере (не на своём компьютере!).

### Если у вас Windows:

**Способ 1 — Через ISPManager (проще, без установки программ):**

1. Откройте браузер
2. Зайдите в ISPManager: `https://ВАШ_IP_АДРЕС:1500`
   (замените ВАШ_IP_АДРЕС на IP из Шага 0)
3. Введите логин и пароль от ISPManager
4. В левом меню: **Инструменты** → **Терминал** (или «Консоль»)
5. Откроется чёрное окно с мигающим курсором — это терминал сервера ✅

**Способ 2 — Через программу PuTTY:**

1. Скачайте PuTTY: зайдите на **putty.org**, нажмите **Download PuTTY**
2. Запустите скачанный файл putty.exe
3. В поле **Host Name** введите IP-адрес сервера
4. Порт: **22**
5. Нажмите **Open** (кнопка внизу справа)
6. Появится предупреждение — нажмите **Да**
7. `login as:` — введите `root` и Enter
8. `Password:` — введите пароль (символы НЕ отображаются!) и Enter
9. Вы внутри сервера! ✅

### Если у вас Mac:

1. Откройте программу **Terminal**:
   - Нажмите **Cmd+Space** (или F4)
   - Введите **Terminal**
   - Нажмите Enter
2. В открывшемся окне введите (замените IP на ваш):
   ```
   ssh root@37.140.192.100
   ```
3. Вопрос "Are you sure?" — введите `yes` и Enter
4. Введите пароль (НЕ отображается!) и Enter
5. Вы внутри сервера! ✅

---

## 🔐 ШАГ 2: Сгенерируйте секретный ключ (PROXY_SECRET)

**ГДЕ:** В терминале сервера (вы открыли его на Шаге 1)

**ЧТО ДЕЛАТЬ:** Введите команду и нажмите Enter:

```
openssl rand -hex 32
```

**РЕЗУЛЬТАТ:** Появится длинная строка из букв и цифр, например:
```
a3f7b2c9d4e5f1a8b6c3d2e9f4a7b5c1d8e6f3a9b7c4d2e5f8a6b3c9d1e7f4
```

**⚠️ ВАЖНО:**
- Выделите эту строку мышкой и скопируйте (Ctrl+Shift+C или правой кнопкой → Копировать)
- Вставьте в Блокнот или другой текстовый редактор и СОХРАНИТЕ
- Этот ключ понадобится на Шаге 3 и Шаге 7
- Никому не показывайте этот ключ — это пароль между WordPress и BI-терминалом

---

## 📝 ШАГ 3: Добавьте секрет в WordPress (wp-config.php)

**ГДЕ:** Через ISPManager (в браузере, не в терминале)

**ЧТО ДЕЛАТЬ:**

1. Откройте браузер
2. Зайдите в ISPManager: `https://ВАШ_IP:1500`
3. В левом меню нажмите **Инструменты** → **Файловый менеджер**
4. Слева видите папки. Идите по пути:
   - `var` → `www` → папка с именем пользователя → `data` → `www` → `bi-terminal.rus-silica.com`
5. Найдите файл **wp-config.php** в этой папке
6. Нажмите на него **правой кнопкой мыши** → **Изменить** (или дважды кликните)
7. Откроется текстовый редактор с содержимым файла
8. Прокрутите вниз и найдите строку:
   ```
   /* That's all, stop editing! Happy publishing. */
   ```
9. **ВСТАВЬТЕ ПЕРЕД этой строкой** следующий текст (замените СЕКРЕТ на ключ из Шага 2):

```php
// RusSilica BI Terminal SSO
define('RUSILICA_BI_PROXY_SECRET', 'СЕКРЕТ_ИЗ_ШАГА_2');
```

   Должно получиться так:
```php
// RusSilica BI Terminal SSO
define('RUSILICA_BI_PROXY_SECRET', 'a3f7b2c9d4e5f1a8...');

/* That's all, stop editing! Happy publishing. */
```

10. Нажмите **Сохранить** (кнопка сверху или Ctrl+S)
11. Закройте вкладку редактора

**Если НЕ нашли wp-config.php через ISPManager:**

В терминале сервера (Шаг 1) введите по очереди:

```
find / -name "wp-config.php" -type f 2>/dev/null
```

Команда покажет путь, например: `/var/www/admin/data/www/bi-terminal.rus-silica.com/wp-config.php`

Затем откройте файл:
```
nano /var/www/admin/data/www/bi-terminal.rus-silica.com/wp-config.php
```
(замените путь на тот, что показала команда)

Найдите `/* That's all, stop editing!` и вставьте ПЕРЕД ней:
```php
define('RUSILICA_BI_PROXY_SECRET', 'СЕКРЕТ_ИЗ_ШАГА_2');
```

Сохранение в nano: нажмите `Ctrl+O` → Enter → `Ctrl+X`

---

## 🧩 ШАГ 4: Установите плагин SSO в WordPress

**ГДЕ:** Через ISPManager → Файловый менеджер

### 4a. Создайте папку mu-plugins

1. В ISPManager: **Инструменты** → **Файловый менеджер**
2. Идите в папку WordPress: `var` → `www` → имя_пользователя → `data` → `www` → `bi-terminal.rus-silica.com` → `wp-content`
3. Посмотрите, есть ли папка **mu-plugins** внутри wp-content
4. Если **НЕТ** — нажмите кнопку **Создать папку** (обычно сверху) и введите имя: `mu-plugins`
5. Зайдите внутрь папки **mu-plugins**

### 4b. Создайте файл плагина

1. Находясь в папке `mu-plugins`, нажмите **Создать файл** (кнопка сверху)
2. Имя файла: `russilica-bi-sso.php`
3. Нажмите на созданный файл правой кнопкой → **Изменить**
4. Вставьте ВЕСЬ текст ниже:

```php
<?php
/**
 * Plugin Name: RusSilica BI Terminal SSO
 * Description: Single Sign-On between WordPress and RusSilica BI Terminal.
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) exit;

$bi_url       = 'https://' . $_SERVER['HTTP_HOST'];
$proxy_secret = defined('RUSILICA_BI_PROXY_SECRET') ? RUSILICA_BI_PROXY_SECRET : '';

if (empty($proxy_secret)) {
    error_log('[RusSilica BI SSO] WARNING: RUSILICA_BI_PROXY_SECRET not defined');
    return;
}

add_filter('login_redirect', function ($redirect_to, $requested_redirect_to, $user) use ($bi_url, $proxy_secret) {
    if (is_wp_error($user) || !$user->exists()) return $redirect_to;

    $bi_callback_url = $bi_url . '/api/auth/wp-callback';

    if (strpos($redirect_to, $bi_callback_url) === false &&
        strpos(urldecode($redirect_to), $bi_callback_url) === false) {
        return $redirect_to;
    }

    $email     = $user->user_email;
    $wp_role   = array_shift($user->roles);
    $timestamp = time();
    $message   = $email . '|' . $wp_role . '|' . $timestamp;
    $signature = hash_hmac('sha256', $message, $proxy_secret);

    return add_query_arg(array(
        'email' => urlencode($email),
        'role'  => urlencode($wp_role),
        'ts'    => $timestamp,
        'sig'   => $signature,
    ), $bi_callback_url);
}, 10, 3);

add_action('template_redirect', function () use ($bi_url, $proxy_secret) {
    if (!isset($_GET['russilica_bi_sso']) || $_GET['russilica_bi_sso'] !== '1') return;
    if (!is_user_logged_in()) { wp_redirect(wp_login_url($_SERVER['REQUEST_URI'])); exit; }

    $user      = wp_get_current_user();
    $email     = $user->user_email;
    $wp_role   = array_shift($user->roles);
    $timestamp = time();
    $message   = $email . '|' . $wp_role . '|' . $timestamp;
    $signature = hash_hmac('sha256', $message, $proxy_secret);

    wp_redirect(add_query_arg(array(
        'email' => urlencode($email),
        'role'  => urlencode($wp_role),
        'ts'    => $timestamp,
        'sig'   => $signature,
    ), $bi_url . '/api/auth/wp-callback'));
    exit;
});

add_action('admin_bar_menu', function ($wp_admin_bar) use ($bi_url) {
    if (!is_user_logged_in()) return;
    $wp_admin_bar->add_node(array(
        'id'    => 'russilica-bi-terminal',
        'title' => '📊 BI Терминал',
        'href'  => $bi_url . '/?russilica_bi_sso=1',
        'meta'  => array('title' => 'Открыть BI-терминал'),
    ));
}, 100);
```

5. Нажмите **Сохранить**

### 4c. Проверьте, что плагин установлен

1. Откройте новую вкладку браузера
2. Зайдите в админку WordPress: **https://bi-terminal.rus-silica.com/wp-admin/**
3. Введите логин/пароль WordPress
4. В левом меню: **Плагины** → **Установленные**
5. Вверху нажмите вкладку **Must-Use** (или «Обязательные»)
6. Должен быть **RusSilica BI Terminal SSO** ✅
7. Если видите — плагин работает!

---

## 👤 ШАГ 5: Создайте пользователей в WordPress

BI-терминал пускает ТОЛЬКО тех, кто вошёл через WordPress с корпоративным email.

**ГДЕ:** В админке WordPress (через браузер)

**ЧТО ДЕЛАТЬ:**

1. Зайдите в **https://bi-terminal.rus-silica.com/wp-admin/**
2. Левое меню: **Пользователи** → **Добавить нового**
3. Заполните поля:
   - **Имя пользователя** — например, `ivanov`
   - **Электронная почта** — **ОБЯЗАТЕЛЬНО** на домене `@russilica.ru` (например, ivanov@russilica.ru)
   - **Пароль** — задайте надёжный или используйте сгенерированный
   - **Роль** — выберите:
     - **Администратор** → полный доступ в BI-терминале
     - **Редактор** → обычный доступ в BI-терминале
4. Нажмите **Добавить нового пользователя**
5. Повторите для каждого сотрудника

**⚠️ ЕСЛИ email НЕ на @russilica.ru — вход в BI-терминал НЕ сработает!**

---

## ⚙️ ШАГ 6: Установите Node.js на сервере

BI-терминал работает на Node.js. Нужно установить его на сервер.

**ГДЕ:** В терминале сервера (Шаг 1)

**ЧТО ДЕЛАТЬ:** Вводите команды по одной, после каждой нажимайте Enter:

```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
```

Подождите, пока выполнится (1-2 минуты). Затем:

```
sudo apt-get install -y nodejs
```

Подождите ещё минуту. Проверьте:

```
node --version
```

Должно показать: `v20.x.x` (цифры могут отличаться — это нормально)

```
npm --version
```

Должно показать: `10.x.x`

---

## 📦 ШАГ 7: Загрузите BI-терминал на сервер

**ГДЕ:** В терминале сервера

### 7a. Создайте папку и скачайте проект

```
mkdir -p /var/www/bi-terminal
```

Теперь нужно загрузить файлы проекта в эту папку. Есть несколько способов:

**Способ 1 — Если проект в Git (рекомендуется):**

```
cd /var/www/bi-terminal
git clone https://github.com/ВАШ-РЕПОЗИТОРИЙ.git .
```

**Способ 2 — Через SFTP в ISPManager:**

1. ISPManager → **Инструменты** → **Файловый менеджер**
2. Идите в `/var/www/bi-terminal/`
3. Нажмите **Закачать** (кнопка сверху) → выберите архив с проектом
4. Распакуйте архив

**Способ 3 — Через SCP с вашего компьютера (Mac/Linux):**

На ВАШЕМ компьютере (не сервере!) откройте Terminal:
```
scp -r /путь/к/папке/проекта root@IP_АДРЕС:/var/www/bi-terminal
```

### 7b. Установите зависимости

В терминале сервера:
```
cd /var/www/bi-terminal
npm install
```

Это может занять 2-5 минут — подождите.

### 7c. Настройте файл .env

**ГДЕ:** На сервере, в папке проекта

**ЧТО ДЕЛАТЬ:**

В проекте есть файл-шаблон `.env.example` со всеми переменными и комментариями.
Вы можете скопировать его и заполнить значения:

В терминале сервера:
```
cd /var/www/bi-terminal
cp .env.example .env
nano .env
```

Откроется текстовый редактор с уже заполненными заголовками и комментариями.
Заполните пустые значения (замените `СЕКРЕТ` на ключ из Шага 2):

```
DATABASE_URL=file:./db/custom.db

NEXTAUTH_SECRET=СГЕНЕРИРУЙТЕ_ОТДЕЛЬНЫЙ_КЛЮЧ
NEXTAUTH_URL=https://bi-terminal.rus-silica.com

WP_LOGIN_URL=https://bi-terminal.rus-silica.com/wp-login.php
NEXT_PUBLIC_WP_LOGIN_URL=https://bi-terminal.rus-silica.com/wp-login.php

PROXY_SECRET=СЕКРЕТ_ИЗ_ШАГА_2

BITRIX_WEBHOOK_URL=

DEV_PASSWORD=dev1234
```

**⚠️ Чтобы сгенерировать NEXTAUTH_SECRET**, откройте ДРУГОЕ окно терминала
(или временно сверните nano через Ctrl+Z) и выполните:
```
openssl rand -base64 32
```
Скопируйте результат и вставьте вместо `СГЕНЕРИРУЙТЕ_ОТДЕЛЬНЫЙ_КЛЮЧ`.

**⚠️ ВАЖНО:** `PROXY_SECRET` должен быть **ТОЧНО ТАКОЙ ЖЕ**, как в wp-config.php!

**💡 Совет:** Полный список переменных с комментариями см. в файле `.env.example` в корне проекта.

Сохранение: нажмите `Ctrl+O` → Enter → `Ctrl+X`

### 7d. Создайте базу данных и соберите проект

В терминале сервера, по одной команде:

```
cd /var/www/bi-terminal
npx prisma generate
```
Подождите. Затем:

```
npx prisma db push
```
Подождите. Затем:

```
npx next build
```

Это может занять 3-5 минут — подождите. Когда увидите список маршрутов — готово.

---

## 🌐 ШАГ 8: Настройте Nginx (маршрутизация)

**ЧТО ЭТО:** Nginx — это программа, которая уже стоит на вашем сервере (вместе с ISPManager).
Она решает, куда направить посетителя: в WordPress или в BI-терминал.

**ВАМ НЕ НУЖНО НИЧЕГО СКАЧИВАТЬ** — Nginx уже работает на сервере!

### Через ISPManager (рекомендуется):

1. Откройте ISPManager: `https://ВАШ_IP:1500`
2. Левое меню: **Домены** → **WWW-домены**
3. Найдите **bi-terminal.rus-silica.com** в списке
4. Дважды кликните на него (или выделите → кнопка **Изменить**)
5. Найдите секцию **Конфигурация Nginx** или вкладку **Nginx**
   (если нет — нажмите «Расширенные настройки» или значок шестерёнки)
6. Вам нужно добавить **location-блоки** для маршрутизации.
   Найдите существующий блок `location / { ... }` и **ЗАМЕНИТЕ** всё содержимое
   конфигурации Nginx для этого домена на:

```nginx
# BI Terminal: статики Next.js
location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    expires 365d;
    add_header Cache-Control "public, immutable";
}

location /_next/image {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# BI Terminal: API
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# BI Terminal: страница входа
location = /login {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WordPress: wp-login.php
location = /wp-login.php {
    fastcgi_pass unix:/run/php/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}

# WordPress: wp-cron, xmlrpc
location = /wp-cron.php {
    fastcgi_pass unix:/run/php/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}

location = /xmlrpc.php {
    fastcgi_pass unix:/run/php/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}

# WordPress: папки
location ~* ^/(wp-admin|wp-includes|wp-content)/ {
    try_files $uri =404;
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}

# WordPress: REST API
location ~ ^/wp-json/ {
    try_files $uri $uri/ /index.php?q=$uri&$args;
    fastcgi_pass unix:/run/php/php-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include fastcgi_params;
}

# По умолчанию: BI Terminal
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

7. Нажмите **Сохранить** или **ОК**

### Если нет секции конфигурации Nginx в ISPManager:

В терминале сервера:

```
find /etc/nginx -name "*bi-terminal*" -type f 2>/dev/null
```

Это покажет файл конфигурации. Откройте его:
```
nano /путь/к/найденному/файлу.conf
```

Замените содержимое блока `server { ... }` на конфигурацию выше.
Сохраните: `Ctrl+O` → Enter → `Ctrl+X`

Проверьте и перезапустите:
```
nginx -t
systemctl reload nginx
```

---

## 🚀 ШАГ 9: Запустите BI-терминал

**ГДЕ:** В терминале сервера

### 9a. Установите pm2 (менеджер процессов)

```
npm install -g pm2
```

pm2 — это программа, которая запускает BI-терминал и автоматически
перезапускает его, если он упал. Также он запускает BI-терминал
автоматически при перезагрузке сервера.

### 9b. Запустите BI-терминал

Есть два способа запуска. **Рекомендуемый — standalone** (быстрее, меньше памяти):

**Способ 1 — Standalone (рекомендуется для VPS):**

Проект уже настроен с `output: "standalone"` в `next.config.ts`.
Команда `npm run build` автоматически копирует статику и public в `.next/standalone/`.

```
cd /var/www/bi-terminal
NODE_ENV=production pm2 start .next/standalone/server.js --name bi-terminal -- --port 3000
```

**Способ 2 — Через next start (проще, но требует больше памяти):**

```
cd /var/www/bi-terminal
NODE_ENV=production pm2 start "npx next start --port 3000" --name bi-terminal
```

> **В чём разница?** Standalone-запуск использует минимальный набор файлов
> из `.next/standalone/` — не нужны `node_modules` целиком, запуск быстрее,
> потребляет меньше оперативной памяти. Подробнее см. раздел
> «Использование standalone build» ниже.

### 9c. Настройте автозапуск при перезагрузке сервера

```
pm2 save
pm2 startup
```

Команда `pm2 startup` выдаст команду, которую нужно скопировать и выполнить.
Выглядит примерно так: `sudo env PATH=$PATH:/usr/bin ...`
Скопируйте её и выполните.

### 9d. Проверьте, что работает

```
pm2 status
```

Должно показать таблицу, где `bi-terminal` со статусом **online** ✅

---

## ✅ ШАГ 10: ПРОВЕРЬТЕ!

1. Откройте браузер
2. Зайдите на **https://bi-terminal.rus-silica.com**
3. Должен появиться редирект на страницу входа WordPress
4. Введите email **@russilica.ru** и пароль WordPress
5. После входа вас автоматически вернёт в BI-терминал
6. Вы видите Dashboard с аналитикой! 🎉

---

## 🔧 ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ

### Сайт bi-terminal.rus-silica.com не открывается совсем

1. В терминале сервера: `pm2 status` — должно быть **online**
2. Если **stopped** или **errored**: `pm2 restart bi-terminal`
3. Посмотрите логи: `pm2 logs bi-terminal`

### Открывается, но показывает страницу WordPress вместо BI-терминала

Проблема в конфигурации Nginx (Шаг 8):
1. Проверьте, что вы правильно добавили `location /` блок с `proxy_pass`
2. Перезапустите Nginx: `systemctl reload nginx`
3. Проверьте конфиг: `nginx -t`

### Редирект на WP-логин есть, но после входа не возвращается в BI

1. Проверьте, что mu-plugin установлен (Шаг 4) — зайдите в WP → Плагины → Must-Use
2. Проверьте, что PROXY_SECRET **одинаковый** в wp-config.php и .env:
   - Откройте wp-config.php через ISPManager → найдите RUSILICA_BI_PROXY_SECRET
   - Откройте .env: `cat /var/www/bi-terminal/.env | grep PROXY_SECRET`
   - Они должны быть **ИДЕНТИЧНЫ** (без пробелов в начале/конце!)

### "Доступ запрещён — некорпоративный email"

- Пользователь WordPress должен иметь email, заканчивающийся на **@russilica.ru**
- Проверьте: WP-админка → Пользователи → профиль → Email

### "Недействительная подпись"

- PROXY_SECRET не совпадает между WordPress и BI-терминалом
- Проверьте: нет ли лишних пробелов, кавычек, переносов строк

---

## 🏗️ Использование standalone build

Next.js умеет создавать **оптимизированную сборку** для развёртывания на VPS.
Проект уже настроен — в `next.config.ts` указано:

```ts
output: "standalone"
```

### Что делает standalone build?

После `npm run build` в папке `.next/standalone/` появляется **полностью автономный сервер**:
- Свой `server.js` — не нужен `next` CLI для запуска
- Только необходимые `node_modules` — не весь пакет, а минимальный набор
- Запускается командой `node .next/standalone/server.js`

### Что нужно скопировать вручную?

Команда `npm run build` (из `package.json`) автоматически делает:
```json
"build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
```

То есть после сборки в `.next/standalone/` будет:
- `.next/static/` — статика (JS, CSS, изображения)
- `public/` — публичные файлы
- `server.js` — сервер
- Минимальные `node_modules/`

### Запуск на VPS через pm2

**Рекомендуемый способ:**
```bash
NODE_ENV=production pm2 start .next/standalone/server.js --name bi-terminal -- --port 3000
```

**Преимущества standalone перед `next start`:**

| Параметр | `npx next start` | standalone `server.js` |
|----------|-------------------|----------------------|
| Размер node_modules | ~полный (200+ МБ) | Только нужные (~40 МБ) |
| Время запуска | 5-10 сек | 1-3 сек |
| Потребление RAM | ~150-200 МБ | ~80-120 МБ |
| Нужен CLI next? | Да | Нет |
| Надёжность | Зависит от next CLI | Автономный |

### Важно: файл .env

Standalone-сервер ищет `.env` **в текущей рабочей директории**, а не в `.next/standalone/`.
Поэтому запускайте из корня проекта:
```bash
cd /var/www/bi-terminal
NODE_ENV=production node .next/standalone/server.js
```

Или через pm2 (как в Шаге 9b):
```bash
cd /var/www/bi-terminal
NODE_ENV=production pm2 start .next/standalone/server.js --name bi-terminal -- --port 3000
```

---

## 🤖 Автоматизация деплоя (CI/CD)

Если вы вносите изменения в код и хотите, чтобы они автоматически
попадали на сервер — можно настроить **CI/CD**.

### Простой вариант: GitHub Actions + SSH

Это самый популярный и простой способ. Схема работы:

```
Вы пушите код в GitHub → GitHub Actions запускается →
Подключается по SSH к серверу → Скачивает обновления → Перезапускает BI-терминал
```

#### Настройка (один раз)

**1. Создайте SSH-ключ для GitHub Actions:**

На ВАШЕМ компьютере (не сервере):
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions
```
(Нажмите Enter на все вопросы — без пароля)

**2. Добавьте публичный ключ на сервер:**

Скопируйте содержимое `~/.ssh/github-actions.pub` и добавьте на сервер:
```bash
# На сервере:
echo "СОДЕРЖИМОЕ_ПУБЛИЧНОГО_КЛЮЧА" >> ~/.ssh/authorized_keys
```

**3. Добавьте секреты в GitHub:**

В репозитории на GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Имя секрета | Значение |
|-------------|----------|
| `SERVER_IP` | IP-адрес вашего VPS (из Шага 0) |
| `SERVER_USER` | `root` |
| `SSH_PRIVATE_KEY` | Содержимое файла `~/.ssh/github-actions` (приватный ключ) |

**4. Создайте файл `.github/workflows/deploy.yml` в проекте:**

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/bi-terminal
            git pull origin main
            npm install
            npx prisma generate
            npx prisma db push
            npm run build
            pm2 restart bi-terminal
            pm2 save
```

**Всё!** Теперь каждый раз, когда вы пушите в ветку `main`,
GitHub автоматически обновит BI-терминал на сервере.

#### Как это выглядит для вас:
1. Вносите изменения в код
2. Делаете `git push`
3. Через 2-3 минуты изменения на сайте ✅

### Альтернатива: deploy.sh скрипт

В проекте уже есть скрипт `deploy/deploy.sh`. Запускается вручную:

```bash
# На вашем компьютере:
# 1. Заполните SERVER_IP в deploy/deploy.sh
# 2. Запустите:
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

Этот скрипт делает то же самое, но вручную — без автоматического срабатывания.

---

## ☁️ Selectel: возможности автоматизации

### Вопрос: «Есть ли у Selectel функционал по типу GitHub или Vercel?»

**Краткий ответ: Нет, у Selectel нет встроенного CI/CD как у Vercel или GitHub.**

Selectel — это **инфраструктурный провайдер** (IaaS). Они дают вам сервер (VPS),
а ЧТО на нём работает — вы решаете сами. Это как арендовать квартиру:
вам дают стены и электричество, а мебель и технику вы выбираете сами.

### Что есть у Selectel:

| Сервис Selectel | Что это | Нужно ли вам?
|----------------|---------|-------------|
| **VPS (облачные серверы)** | Аренда виртуального сервера | ✅ Да, это ваш сервер |
| **Managed Kubernetes** | Управляемый кластер контейнеров | ❌ Избыточно для BI-терминала |
| **Container Registry** | Хранилище Docker-образов | ❌ Избыточно для BI-терминала |
| **Объектное хранилище (S3)** | Хранение файлов | ⚪ Опционально для бэкапов |
| **ISPManager** | Панель управления сервером | ✅ Да, уже установлена |

### Что НЕТ у Selectel (и чем заменить):

| Функция | У Vercel | У Selectel | Замена
|---------|----------|-----------|--------
| Автодеплой при пуше | ✅ Из коробки | ❌ Нет | GitHub Actions + SSH (см. выше) |
| Превью для каждой ветки | ✅ Из коробки | ❌ Нет | Не нужно для BI-терминала |
| Автомасштабирование | ✅ Из коробки | ❌ Нет | Увеличить VPS вручную в панели |
| SSL-сертификаты | ✅ Автоматически | ⚪ Через ISPManager/Let's Encrypt | ISPManager → WWW-домены → SSL |
| Мониторинг | ✅ Из коробки | ⚗️ Базовый в панели | pm2 monitoring или внешний сервис |

### Рекомендуемый подход для BI-терминала:

```
GitHub (код) → GitHub Actions (автоматизация) → SSH → VPS Selectel (запуск)
```

Это **простая и надёжная** схема. Вам не нужны Kubernetes, Docker или Container Registry.
VPS + ISPManager + GitHub Actions = полностью покрывает потребности.

**Если в будущем понадобится масштабирование:**
- Можно докупить ресурсов VPS в панели Selectel (CPU, RAM, диск)
- Можно перейти на Managed Kubernetes — но это имеет смысл только
  при высоких нагрузках (тысячи одновременных пользователей)

---

## 📋 КРАТКАЯ СХЕМА: ВСЕ ШАГИ

```
Шаг 0: Узнать IP сервера → Selectel личный кабинет
Шаг 1: Открыть терминал → ISPManager или PuTTY/Terminal
Шаг 2: Сгенерировать секрет → openssl rand -hex 32
Шаг 3: Вставить секрет в wp-config.php → ISPManager → Файловый менеджер
Шаг 4: Установить mu-plugin → ISPManager → Файловый менеджер
Шаг 5: Создать пользователей WP → WP-админка → Пользователи
Шаг 6: Установить Node.js → Терминал сервера
Шаг 7: Загрузить и настроить BI-терминал → Терминал сервера
       (.env настраивается по шаблону .env.example)
Шаг 8: Настроить Nginx → ISPManager → WWW-домены
Шаг 9: Запустить BI-терминал → Терминал сервера (pm2)
       (рекомендуется standalone build)
Шаг 10: Проверить → Браузер → bi-terminal.rus-silica.com

Дополнительно:
  🏗 Standalone build → Оптимизированный запуск на VPS
  🤖 CI/CD → GitHub Actions + SSH для автодеплоя
  ☁️ Selectel → Возможности автоматизации (сравнение с Vercel)
```
