# Развёртывание Track Anime на сервере (Debian)

Инструкция для **нового сервера**: установка зависимостей, запуск сайта, настройка парсинга Kodik и автоматического обновления.

См. также: [импорт Kodik](./kodik-api/import.md), [документация Kodik API](./kodik-api/README.md).

---

## Что понадобится

| Компонент | Версия | Зачем |
|-----------|--------|-------|
| **Debian** | 12+ | ОС сервера |
| **Node.js** | 22 LTS | Next.js и скрипты Kodik |
| **Docker** + Compose | актуальные | PostgreSQL в контейнере |
| **Git** | — | Клонирование репозитория |
| **Nginx** | — | Reverse proxy + HTTPS (опционально, но рекомендуется) |
| **Токен Kodik** | — | Парсинг каталога и новых серий |

Минимальные ресурсы: **2 CPU, 2 GB RAM, 20 GB SSD** (для полного импорта Kodik лучше **4 GB RAM и SSD**).

---

## 1. Подготовка сервера

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg nginx certbot python3-certbot-nginx
```

### Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
npm -v
```

### Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# перелогиньтесь или: newgrp docker
docker compose version
```

---

## 2. Клонирование проекта

```bash
sudo mkdir -p /opt/track-anime
sudo chown $USER:$USER /opt/track-anime
git clone https://github.com/YOUR_USER/ta_new.git /opt/track-anime
cd /opt/track-anime
```

Замените URL на свой репозиторий. Дальше все команды — из `/opt/track-anime`.

---

## 3. Переменные окружения

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Пример для **production**:

```env
DATABASE_URL="postgresql://track_anime:СЛОЖНЫЙ_ПАРОЛЬ@127.0.0.1:5432/track_anime"
KODIK_API_TOKEN="ваш_токен_с_kodik"
KODIK_API_URL="https://kodik-api.com"
KODIK_SYNC_PAGES="3"
KODIK_USER_AGENT="TrackAnime/0.1"
SHIKIMORI_REQUEST_TIMEOUT_MS="8000"
SHIKIMORI_TOTAL_TIMEOUT_MS="15000"
NODE_ENV="production"
```

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `DATABASE_URL` | да | Строка подключения PostgreSQL |
| `KODIK_API_TOKEN` | да для парсинга | Токен из личного кабинета Kodik |
| `KODIK_API_URL` | нет | По умолчанию `https://kodik-api.com` |
| `KODIK_SYNC_PAGES` | нет | Сколько страниц `/list` обрабатывать за один sync (по умолчанию 3) |
| `KODIK_USER_AGENT` | нет | User-Agent для запросов к Kodik |
| `SHIKIMORI_REQUEST_TIMEOUT_MS` | нет | Таймаут одной публичной попытки Shikimori API (по умолчанию 8000 мс) |
| `SHIKIMORI_TOTAL_TIMEOUT_MS` | нет | Общий бюджет публичного Shikimori API-запроса с retry (по умолчанию 15000 мс) |
| `NODE_ENV` | для prod | `production` при `npm run start` |

**Токен Kodik:** получите в [bd.kodikres.com](https://bd.kodikres.com) → API. Без токена скрипты `kodik:*` завершатся с ошибкой `KODIK_API_TOKEN не задан в .env`.

---

## 4. PostgreSQL

### Запуск через Docker (рекомендуется)

Перед первым запуском **смените пароль** в `docker-compose.yml` (поля `POSTGRES_PASSWORD` и в `DATABASE_URL`).

```bash
npm run docker:up
docker ps   # контейнер track-anime-db должен быть healthy
```

Остановка / перезапуск:

```bash
npm run docker:down
npm run docker:up
```

Порт `5432` в `docker-compose.yml` проброшен на localhost. **Не открывайте его наружу** в firewall.

### Создание таблиц

```bash
npm install
npm run db:push
```

Проверка:

```bash
npm run db:studio   # временно, для отладки — http://localhost:5555
```

---

## 5. Сборка и запуск сайта

```bash
npm ci
npm run build
npm run start
```

Сайт слушает **http://127.0.0.1:3000**. Для production не используйте `npm run dev`.

### systemd-сервис

```bash
sudo nano /etc/systemd/system/track-anime.service
```

```ini
[Unit]
Description=Track Anime (Next.js)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/track-anime
EnvironmentFile=/opt/track-anime/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/track-anime
sudo systemctl daemon-reload
sudo systemctl enable track-anime
sudo systemctl start track-anime
sudo systemctl status track-anime
```

Логи:

```bash
journalctl -u track-anime -f
```

---

## 6. Nginx + HTTPS

Пример для домена `track-anime.example.com`:

```bash
sudo nano /etc/nginx/sites-available/track-anime
```

```nginx
server {
    listen 80;
    server_name track-anime.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/track-anime /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d track-anime.example.com
```

---

## 7. Парсинг Kodik

Данные Kodik **не подтягиваются автоматически** при старте сайта. Нужно один раз загрузить каталог и настроить периодический sync.

### Первый запуск (полный импорт)

Два этапа (скрипт выполняет последовательно):

| Фаза | Команда внутри | Что делает |
|------|----------------|------------|
| **catalog** | `/list` постранично | Все материалы (аниме × озвучки) |
| **episodes** | `/search?id=...` | Все серии и лента новых релизов |

```bash
cd /opt/track-anime
npm run kodik:import
```

Импорт **долгий** (часы–дни): десятки тысяч материалов, лимит API ~5 req/s. Прогресс сохраняется — можно прервать (`Ctrl+C`) и продолжить:

```bash
npm run kodik:import:resume
```

### Полезные варианты импорта

```bash
# Только каталог (быстро, без серий — главная будет пустой)
npm run kodik:import -- --catalog-only

# Продолжить после прерывания
npm run kodik:import:resume

# Догрузить серии для материалов, где episodesLoaded = false
npm run kodik:import:episodes

# Сбросить прогресс catalog и начать заново
npm run kodik:import -- --reset
```

### Быстрый старт (без полного архива)

Если полный импорт не нужен сразу — достаточно периодического sync: он подтягивает **последние обновлённые** материалы (3 страницы × 100 записей по умолчанию):

```bash
npm run kodik:sync
```

После первых запусков sync на главной появятся свежие серии. Для полной базы всё равно нужен `kodik:import`.

### Автообновление (cron)

Cron запускает планировщик каждую минуту, а реальный интервал берётся из `KodikSyncSettings`
(`intervalMinutes`, `syncPages`) и меняется через админку. По умолчанию sync включён, интервал
10 минут, объём проверки — `KODIK_SYNC_PAGES` или значение из БД.

```bash
cd /opt/track-anime
bash scripts/install-kodik-sync-cron.sh
```

Фактическая строка cron:

```cron
* * * * * cd /opt/track-anime && /usr/bin/npm run kodik:sync:scheduled >> /opt/track-anime/logs/kodik-sync.log 2>&1
```

Проверка:

```bash
crontab -l | grep kodik:sync:scheduled
tail -f /opt/track-anime/logs/kodik-sync.log
npm run kodik:sync:scheduled
```

`npm run kodik:sync` остаётся ручным инкрементальным запуском без проверки расписания.
Для проверки именно cron-пути используйте `npm run kodik:sync:scheduled`.

---

## 8. Деплой на production (Windows → сервер)

**Полная документация:** [DEPLOY.md](./DEPLOY.md)

Из корня проекта:

```powershell
cd E:\GitHub\ta_new
.\scripts\deploy.ps1
# или
npm run deploy
```

Скрипт упаковывает исходники (`tar`), заливает на сервер (`scp`) и запускает `scripts/server-deploy.sh`: `npm ci` → Prisma → `npm run build` → restart. **Сборка выполняется на сервере** — отдельный WSL не нужен.

Параметры и ручные команды — в [DEPLOY.md](./DEPLOY.md).

### Сравнение с вариантом «сборка в WSL» (не используем)

Пробовали fast-deploy: Linux-сборка в WSL, на сервер — только upload и restart.

| Этап | Классический (`deploy.ps1`) | WSL fast-deploy (отклонён) |
|------|------------------------------|----------------------------|
| Upload | ~5–10 с | ~10–15 с (больше из‑за `.next` + `bg/`) |
| `npm ci` | на сервере ~14 с | в WSL ~21 с |
| `npm run build` | на сервере ~14 с | в WSL ~25–30 с |
| Prisma + restart | ~5 с | ~5 с |
| **Итого** | **~55 с** | **~70 с** |
| Нагрузка на сервер | ~50 с | ~7–10 с |

**Вывод:** WSL-вариант **не выгоден** для этого проекта: суммарно медленнее (~70 с против ~55 с), требует nvm/Node в WSL, ломается на symlink `public/bg`, в WSL нет доступа к Google Fonts (нужен обход через webpack). Выигрыш только в разгрузке CPU сервера на ~40 с — для одного инстанса это не окупает сложность. **Используем классический деплой.**

---

## 9. Обновление после git pull

```bash
cd /opt/track-anime
git pull
npm ci
npm run db:push      # если менялась схема Prisma
npm run build
sudo systemctl restart track-anime
```

Скрипты Kodik обновлять отдельно не нужно — cron подхватит новый код при следующем запуске.

---

## 10. Шпаргалка команд

### Разработка (Windows / локально)

```powershell
cd D:\GitHub\ta_new
copy .env.example .env
npm install
npm run docker:up
npm run db:push
npm run dev                 # http://localhost:3000
npm run kodik:sync          # быстрая проверка парсинга
npm run kodik:import        # полный импорт
.\scripts\deploy.ps1        # деплой на production
```

### Production (Debian)

```bash
npm run docker:up           # PostgreSQL
npm run db:push             # схема БД
npm run build && npm run start
npm run kodik:import        # первичная загрузка
npm run kodik:sync          # инкремент (или cron)
sudo systemctl restart track-anime
```

### npm-скрипты проекта

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Dev-сервер с hot reload |
| `npm run build` | Production-сборка Next.js |
| `npm run start` | Запуск production-сервера (:3000) |
| `npm run docker:up` | PostgreSQL в Docker |
| `npm run docker:down` | Остановить PostgreSQL |
| `npm run db:push` | Применить схему Prisma к БД |
| `npm run db:generate` | Перегенерировать Prisma Client |
| `npm run db:studio` | Веб-UI для просмотра БД |
| `npm run kodik:import` | Полный импорт Kodik |
| `npm run kodik:import:resume` | Продолжить импорт после прерывания |
| `npm run kodik:import:episodes` | Только фаза серий |
| `npm run kodik:sync` | Ручное инкрементальное обновление |
| `npm run kodik:sync:scheduled` | Cron-планировщик: проверяет настройки, запускает auto sync, Shikimori anons sync и worker уведомлений |

---

## 11. Диагностика

| Симптом | Что проверить |
|---------|---------------|
| Пустая главная | Запускали ли `kodik:import` или `kodik:sync`? Есть ли записи в `KodikEpisodeRelease`? |
| `KODIK_API_TOKEN не задан` | Файл `.env` в корне проекта, права на чтение у пользователя сервиса |
| Ошибка подключения к БД | `docker ps`, совпадает ли пароль в `docker-compose.yml` и `DATABASE_URL` |
| Сайт не открывается снаружи | `systemctl status track-anime`, nginx, firewall (`ufw allow 80,443`) |
| Sync не идёт по cron | `crontab -l`, абсолютный путь к `npm`, лог `logs/kodik-sync.log`, `which npm`, ручной запуск `npm run kodik:sync:scheduled` |
| `Cannot find package 'server-only'` в cron | Выполнить `npm ci`; пакет должен быть в `package.json`. Не добавляйте `import "server-only"` в модули, которые импортируются из CLI/cron (`tsx`) |
| `server-only` бросает ошибку при `npm run kodik:sync:scheduled` | В CLI-достижимом графе импортов остался sentinel `import "server-only"`. Для Kodik sync критичный путь: `scripts/kodik-sync-scheduled.ts` → `save-material` → notification dispatcher/channel |

Проверка API ленты:

```bash
curl -s "http://127.0.0.1:3000/api/releases?page=1&pageSize=5" | head -c 500
```

Статистика в БД (через Prisma Studio или psql):

```sql
SELECT COUNT(*) FROM "KodikMaterial";
SELECT COUNT(*) FROM "KodikEpisodeRelease";
```

---

## 12. Безопасность (кратко)

- Смените дефолтный пароль PostgreSQL в `docker-compose.yml`.
- Файл `.env` — только для владельца (`chmod 600`).
- PostgreSQL слушает только localhost.
- Не коммитьте `.env` в git.
- Токен Kodik храните только на сервере.
