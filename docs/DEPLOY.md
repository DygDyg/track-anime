# Деплой Track Anime

Руководство по выкладке на production-сервер с Windows.

**Сервер:** `root@195.26.230.35`  
**Каталог на сервере:** `/var/www/ta_new`  
**Сайт:** https://ta.dygdyg.ru/

---

## Быстрый старт

Полный деплой сайта + свежий Discord RPC exe:

```powershell
npm run deploy:release
```

Только обновить `TrackAnimeDiscordRPC.exe` на сервере (без пересборки Next.js, ~1–2 мин):

```powershell
npm run deploy:rpc
```

Обычный деплой (exe не пересобирается, если уже есть в `dist/`):

```powershell
npm run deploy
```

Или напрямую:

```powershell
.\scripts\deploy.ps1
.\scripts\deploy.ps1 -ForceTrayRebuild
.\scripts\deploy-rpc.ps1
```

Скрипт:
1. Упаковывает исходники в `tar.gz` (без `node_modules`, `.next`, `.env`)
2. Загружает на сервер через `scp`
3. На сервере: `npm ci` → Prisma → `npm run build` → restart `track-anime`
4. Проверяет HTTP 200 на https://ta.dygdyg.ru/

**Время:** ~50–60 секунд.

---

## Требования

| Что | Где |
|-----|-----|
| SSH-ключ | `%USERPROFILE%\.ssh\id_rsa` |
| `tar` | Windows 10+ (встроен) |
| `scp`, `ssh` | OpenSSH Client (Windows) |
| Доступ к серверу | `root@195.26.230.35` |

Проверка:

```powershell
Test-Path "$env:USERPROFILE\.ssh\id_rsa"
ssh -i "$env:USERPROFILE\.ssh\id_rsa" root@195.26.230.35 "echo ok"
```

---

## Параметры скрипта

```powershell
# Только упаковка (без upload и сборки на сервере)
.\scripts\deploy.ps1 -DryRun

# Другой сервер
.\scripts\deploy.ps1 -Remote "root@1.2.3.4" -ServerAppDir "/var/www/ta_new"

# Другой SSH-ключ
.\scripts\deploy.ps1 -SshKey "C:\Users\you\.ssh\custom_key"
```

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `-Remote` | `root@195.26.230.35` | SSH-хост |
| `-SshKey` | `~\.ssh\id_rsa` | Путь к приватному ключу |
| `-ServerAppDir` | `/var/www/ta_new` | Каталог приложения на сервере |
| `-DryRun` | — | Только `tar`, без upload |
| `-ForceTrayRebuild` | — | Пересобрать `TrackAnimeDiscordRPC.exe` перед деплоем |

---

## Что происходит на сервере

Файл `scripts/server-deploy.sh`:

```
extract tar
  → npm ci
  → prisma generate + db push
  → increment .build-number
  → setup-cover-cache.sh
  → npm run build
  → chown .next → www-data
  → systemctl restart track-anime
  → install-kodik-sync-cron.sh
  → curl https://ta.dygdyg.ru/ (ожидается 200)
```

`.env` на сервере **не перезаписывается** — он исключён из архива.

---

## Ручной деплой (без скрипта)

### Windows → сервер

```powershell
cd E:\GitHub\ta_new

tar -czf $env:TEMP\ta_deploy.tar.gz `
  --exclude=node_modules --exclude=.next --exclude=.git `
  --exclude=.env --exclude=.build-number --exclude=tmp `
  --exclude="*.tar.gz" --exclude="*.mp4" .

scp -i $env:USERPROFILE\.ssh\id_rsa `
  $env:TEMP\ta_deploy.tar.gz root@195.26.230.35:/tmp/ta_deploy.tar.gz

ssh -i $env:USERPROFILE\.ssh\id_rsa root@195.26.230.35 `
  "cd /var/www/ta_new && sed -i 's/\r$//' scripts/*.sh && bash scripts/server-deploy.sh"
```

### Только перезапуск (без нового кода)

```bash
ssh root@195.26.230.35 "systemctl restart track-anime && systemctl status track-anime"
```

### Только пересборка на сервере

```bash
ssh root@195.26.230.35 "cd /var/www/ta_new && npm run build && chown -R www-data:www-data .next && systemctl restart track-anime"
```

---

## Исключения из архива

Скрипт не отправляет на сервер:

- `node_modules/`, `.next/` — ставятся/собираются на сервере
- `.env` — секреты остаются только на сервере
- `.git/`, `tmp/`, `*.tar.gz`, `*.mp4`
- `.build-number` — номер билда ведётся на сервере

---

## Диагностика

### Деплой упал

```powershell
# Логи сервиса
ssh -i $env:USERPROFILE\.ssh\id_rsa root@195.26.230.35 "journalctl -u track-anime -n 50 --no-pager"

# Статус
ssh -i $env:USERPROFILE\.ssh\id_rsa root@195.26.230.35 "systemctl status track-anime"
```

### Сайт 502 после деплоя

Сборка не завершилась — смотрите вывод `npm run build` в логе деплоя или:

```bash
ssh root@195.26.230.35 "cd /var/www/ta_new && npm run build"
```

### `set: pipefail: invalid option name`

CRLF в bash-скриптах (Windows). Скрипт `deploy.ps1` исправляет это автоматически перед запуском. Локально держите `scripts/*.sh` с LF-окончаниями.

### TypeScript падает на `scripts/*.ts`

CLI-скрипты исключены из `tsconfig.json` (`exclude: ["scripts"]`). Не убирайте это — иначе `next build` будет проверять debug-скрипты.

### Проверка после деплоя

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://ta.dygdyg.ru/
# ожидается: 200

ssh root@195.26.230.35 "cat /var/www/ta_new/.build-number"
# номер текущего билда
```

---

## Первичная настройка сервера

Если сервер новый — см. [SERVER.md](./SERVER.md): Node.js, Docker/PostgreSQL, `.env`, systemd, nginx, Kodik import.

---

## Архитектура деплоя

```
Windows (deploy.ps1)
  │  tar.gz (исходники)
  ▼
Server /tmp/ta_deploy.tar.gz
  │  server-deploy.sh
  ▼
/var/www/ta_new
  ├── npm ci + prisma
  ├── npm run build → .next/
  └── systemctl restart track-anime
        └── nginx → https://ta.dygdyg.ru/
```

**Почему сборка на сервере, а не в WSL:** быстрее (~55 с vs ~70 с), проще, нет проблем с symlinks и Google Fonts. Подробнее — раздел 8 в [SERVER.md](./SERVER.md).
