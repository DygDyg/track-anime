# Деплой Track Anime

Руководство по выкладке на production-сервер с Windows.

**Сервер:** `root@195.26.230.35`  
**Каталог на сервере:** `/var/www/ta_new`  
**Сайт:** https://track-anime.dygdyg.ru/
**Зеркала:** https://ta.dygdyg.ru/, https://track-anime.dygdyg.ru/ и https://track-anime.duckdns.org/

---

## Быстрый старт

Авто-выбор по `git diff` (site / rpc / apk / windows — только то, что изменилось):

```powershell
npm run deploy
.\deploy.bat
```

Принудительно отдельные части:

```powershell
npm run deploy:site    # сайт (Next.js на сервере)
npm run deploy:rpc     # только TrackAnimeDiscordRPC.exe (~1–2 мин)
npm run deploy:apk     # только TrackAnime.apk + TrackAnime.json
npm run deploy:windows # только TrackAnimeWindows.exe + TrackAnimeWindows.json
npm run deploy:release # сайт + пересборка Discord RPC exe в архиве
npm run deploy:all     # site + rpc (и apk/windows, если есть изменения/путь)
```

Или напрямую:

```powershell
.\scripts\deploy-auto.ps1
.\scripts\deploy-auto.ps1 -DryRun
.\scripts\deploy-auto.ps1 -ForceSite
.\scripts\deploy.ps1
.\scripts\deploy.ps1 -ForceTrayRebuild
.\scripts\deploy-rpc.ps1
.\scripts\deploy-apk.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
.\scripts\deploy-windows-app.ps1
```

### Android APK

Отдельная заливка (без пересборки сайта):

```powershell
npm run deploy:apk -- -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
# или
.\scripts\deploy-apk.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
```

Вместе с полным деплоем сайта (APK попадёт в tar):

```powershell
.\scripts\deploy.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
```

Скрипт публикации положит APK в `public/downloads/TrackAnime.apk`, посчитает версию и SHA-256 через Android Build-Tools и создаст `public/downloads/TrackAnime.json`.

### Windows exe

Отдельная заливка (без пересборки сайта):

```powershell
npm run deploy:windows
# или только залить уже собранное:
npm run deploy:windows -- -SkipPublish
.\scripts\deploy-windows-app.ps1
```

Вместе с полным деплоем сайта (exe попадёт в tar):

```powershell
.\scripts\deploy.ps1 -PublishWindowsApp
```

`publish-windows-app.ps1` / `deploy:windows` собирают single-file exe в `public/downloads/TrackAnimeWindows.exe` и манифест `TrackAnimeWindows.json` (versionCode, SHA-256).

### Авто-деплой (`deploy-auto.ps1`)

1. По умолчанию смотрит только dirty working tree (staged/unstaged/untracked). Для diff с `origin/main` — `-SinceMain` или `-BaseRef`
2. Классифицирует изменения:
   - `scripts/discord-rpc-tray/**`, exe → **rpc**
   - `android/**`, `public/downloads/TrackAnime.{apk,json}` → **apk**
   - `windows/**`, `public/downloads/TrackAnimeWindows.{exe,json}` → **windows**
   - остальной код сайта → **site**
   - docs / `.cursor` / сами deploy-скрипты → игнор
3. Запускает только нужные пайплайны (rpc → apk → windows → site)
4. Для **site** не тащит в tar уже залитые `TrackAnimeDiscordRPC.exe`, APK и Windows exe (остаются на сервере)

### Деплой сайта (`deploy.ps1`)

1. Опционально публикует APK (`-ApkPath`), Windows exe (`-PublishWindowsApp`) и Discord RPC exe в `public/downloads/`
2. Упаковывает исходники в `tar.gz` (без `node_modules`, `.next`, `.env`, `android/`, `windows/`, `scripts/discord-rpc-tray`, `data/cover-cache`, локальных handoff/`aqua-coder-web`/embeddings и т.п.)
3. Режет архив на чанки и загружает их на сервер через `scp` с retry и проверкой размера каждой части
4. На сервере в **screen** (`ta_deploy`): `npm ci` → Prisma → `npm run build` → restart `track-anime`
5. Проверяет HTTP 200 на https://track-anime.dygdyg.ru/

Локальный архив и временные чанки создаются в `temp/deploy/`; папка исключена из git и чистится через `clean-turbopack-cache.bat`.

Деплой идёт в screen-сессии — если SSH оборвётся, сборка **не остановится**. Можно подключиться:

```bash
ssh -t root@195.26.230.35 screen -r ta_deploy
# или
ssh root@195.26.230.35 tail -f /tmp/ta_deploy.log
```

Если screen уже завершился, результат деплоя хранится в `/tmp/ta_deploy.exit`:

```bash
ssh root@195.26.230.35 "cat /tmp/ta_deploy.exit; tail -80 /tmp/ta_deploy.log; screen -list"
```

**Время:** ~50–60 секунд.

---

## Требования

| Что | Где |
|-----|-----|
| SSH-ключ | `%USERPROFILE%\.ssh\id_rsa` |
| `tar` | Windows 10+ (встроен) |
| `scp`, `ssh` | OpenSSH Client (Windows) |
| Доступ к серверу | `root@195.26.230.35` |
| (опц.) HTTP-прокси | `deploy.local.json` + `ncat` / Git `connect.exe` |

Проверка:

```powershell
Test-Path "$env:USERPROFILE\.ssh\id_rsa"
ssh -i "$env:USERPROFILE\.ssh\id_rsa" root@195.26.230.35 "echo ok"
```

---

## Локальный прокси и устойчивость SSH (`deploy.local.json`)

Файл **`deploy.local.json`** в корне репозитория (в git **не** коммитится). Шаблон: `deploy.local.example.json`.

Скопируйте/отредактируйте и укажите HTTP-прокси, через который пойдут `ssh`/`scp`:

```json
{
  "httpProxy": "http://127.0.0.1:7890",
  "proxyUser": "",
  "proxyPassword": "",
  "uploadChunkSizeMB": 16,
  "connectTimeout": 40,
  "serverAliveInterval": 10,
  "serverAliveCountMax": 12,
  "sshMaxAttempts": 8,
  "scpMaxAttempts": 8
}
```

Что делает:

- SSH/SCP идут через HTTP CONNECT (`ProxyCommand`) — меньше обрывов на нестабильном канале
- Автоматически уменьшает чанки upload (по умолчанию 16 MB при прокси)
- Чаще keepalive и больше retry для scp/ssh
- `curl`-проверки download URL тоже через тот же прокси

**Fallback без прокси:** если `deploy.local.json` пуст / `httpProxy` пустой, helper не собран, прокси недоступен по TCP или `ssh` через прокси не отвечает — деплой **сам переключается на прямой SSH/SCP** (warning в логе, без падения).

Для HTTP Basic auth на Windows используется локальный helper `temp/deploy/ta-http-connect.exe` (собирается из `scripts/ta-http-connect.cs` при первом деплое).

Нужен helper на машине (достаточно одного):

| Helper | Откуда |
|--------|--------|
| `connect.exe` | Git for Windows (`...\Git\mingw64\bin\connect.exe`) |
| `ncat.exe` | Nmap |
| `corkscrew` | отдельно |

Либо задайте команду вручную:

```json
{
  "proxyCommand": "ncat --proxy-type http --proxy 127.0.0.1:7890 %h %p"
}
```

Переменные окружения (если файла нет): `TA_DEPLOY_HTTP_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`.

После правки проверьте, что конфиг подхватился:

```powershell
.\scripts\deploy-auto.ps1 -DryRun
```

В логе должны быть строки `httpProxy:` / `ProxyCommand:`.

---

## Параметры скрипта

```powershell
# Только упаковка (без upload и сборки на сервере)
.\scripts\deploy.ps1 -DryRun

# Другой сервер
.\scripts\deploy.ps1 -Remote "root@1.2.3.4" -ServerAppDir "/var/www/ta_new"

# Другой SSH-ключ
.\scripts\deploy.ps1 -SshKey "C:\Users\you\.ssh\custom_key"

# Меньше чанки для нестабильного интернета
.\scripts\deploy.ps1 -UploadChunkSizeMB 24
```

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `-Remote` | `root@195.26.230.35` | SSH-хост |
| `-SshKey` | `~\.ssh\id_rsa` | Путь к приватному ключу |
| `-ServerAppDir` | `/var/www/ta_new` | Каталог приложения на сервере |
| `-UploadChunkSizeMB` | `48` | Размер частей архива для `scp`; меньше = устойчивее на плохом интернете |
| `-ApkPath` | — | Путь к готовому подписанному APK; будет опубликован по `/downloads/TrackAnime.apk` вместе с `/downloads/TrackAnime.json`; требуется Android SDK Build-Tools (`aapt.exe`) |
| `-PublishWindowsApp` | — | Локально собрать и положить `TrackAnimeWindows.exe` + json в `public/downloads/` перед упаковкой tar |
| `-DryRun` | — | Только `tar`, без upload |
| `-SkipBuild` | — | Пропустить локальную precheck-сборку; серверная сборка всё равно выполняется |
| `-ForceTrayRebuild` | — | Пересобрать `TrackAnimeDiscordRPC.exe` перед деплоем |
| `-SkipTrayPublish` | — | Не публиковать/копировать Discord RPC exe локально |
| `-ExcludeRpcExe` | — | Не класть exe в tar (оставить файл на сервере) |
| `-ExcludeApk` | — | Не класть APK/json в tar (оставить файлы на сервере) |
| `-ExcludeWindowsApp` | — | Не класть Windows exe/json в tar (оставить файлы на сервере) |

`deploy-auto.ps1` дополнительно:

| Параметр | Описание |
|----------|----------|
| `-BaseRef` | База для committed diff (если задана — вместе с dirty) |
| `-SinceMain` | То же, что `-BaseRef origin/main` (или `main`/`master`) |
| `-ForceSite` | Всегда включить деплой сайта |
| `-ForceTrayRebuild` | Всегда включить `deploy:rpc` |
| `-SkipPrecheck` | Не вызывать `deploy-precheck.ps1` перед site |

---

## Что происходит на сервере

Файл `scripts/server-deploy.sh`:

```
extract tar
  → npm ci (quiet: deprecated warnings suppressed, errors visible, heartbeat каждые 15 секунд, timeout 10 минут + SIGKILL через 15с если npm игнорирует SIGTERM)
  → prisma generate + db push
  → increment .build-number
  → cleanup stale source files from older deploys
  → setup-cover-cache.sh
  → npm run build
  → chown .next → www-data
  → systemctl restart track-anime
  → systemctl restart track-anime-watch-party (если service установлен)
  → install-kodik-sync-cron.sh
  → curl https://track-anime.dygdyg.ru/ (ожидается 200)
```

`.env` на сервере **не перезаписывается** — он исключён из архива.

---

## Ручной деплой (без скрипта)

### Windows → сервер

```powershell
cd E:\GitHub\ta_new
New-Item -ItemType Directory -Force temp\deploy | Out-Null

tar -czf temp\deploy\ta_deploy.tar.gz `
  --exclude=node_modules --exclude=.next --exclude=.git `
  --exclude=.env --exclude=.build-number --exclude=tmp --exclude=temp `
  --exclude=scripts/discord-rpc-tray `
  --exclude=android `
  --exclude=data/cover-cache --exclude=data/image-cache `
  --exclude=Aqua_Coder_Chibi_Codex_Handoff_v2 `
  --exclude=Aqua_Coder_Chibi_Codex_Handoff_v2.zip `
  --exclude=aqua-coder-web `
  --exclude=.embeddings --exclude=.chats --exclude=.memory `
  --exclude="*.tar.gz" --exclude="*.mp4" .

scp -i $env:USERPROFILE\.ssh\id_rsa `
  temp\deploy\ta_deploy.tar.gz root@195.26.230.35:/tmp/ta_deploy.tar.gz

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
- `.workspace.json`, `.idea/` — локальные настройки Codex/Cursor и Android Studio
- `.git/`, `tmp/`, `temp/`, `*.tar.gz`, `*.mp4`
- `.build-number` — номер билда ведётся на сервере
- `android/` — нативная оболочка собирается локально; на сервер уходит только `public/downloads/TrackAnime.apk` (+ json) через `deploy:apk` или `-ApkPath`
- `windows/` — Windows-оболочка собирается локально; на сервер уходит только `public/downloads/TrackAnimeWindows.exe` (+ json) через `deploy:windows` или `-PublishWindowsApp`
- `scripts/discord-rpc-tray/` — Electron-проект нужен только локально для сборки exe; на сервер отправляется `public/downloads/TrackAnimeDiscordRPC.exe` через `deploy:rpc` или полный site-деплой
- `data/cover-cache/`, `data/image-cache/` — runtime-кеш на сервере (в git уже ignore)
- `Aqua_Coder_Chibi_Codex_Handoff_v2/` (+ `.zip`), `aqua-coder-web/`, `.embeddings/`, `.chats/`, `.memory/` — локальные handoff/scratch
- корневой `avatar-decorations/` (scratch PNG) — временно уводится при pack, чтобы не задеть `public/avatar-decorations/`
- при `-ExcludeRpcExe` / `-ExcludeApk` (в т.ч. из `deploy-auto`) соответствующие бинарники в tar не кладутся — на сервере остаются прежние файлы

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
curl -s -o /dev/null -w '%{http_code}\n' https://track-anime.dygdyg.ru/
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
  └── systemctl restart track-anime + track-anime-watch-party
        └── nginx → https://track-anime.dygdyg.ru/
```

**Почему сборка на сервере, а не в WSL:** быстрее (~55 с vs ~70 с), проще, нет проблем с symlinks и Google Fonts. Подробнее — раздел 8 в [SERVER.md](./SERVER.md).
