# Переустановка Windows / новый ПК для разработки

Гайд для случая, когда сам проект лежит не на системном диске, например
`E:\GitHub\ta_new`, но Windows переустанавливается на диске `C:`.

Цель: после переустановки быстро вернуть локальную разработку, отладку и деплой
Track Anime.

---

## 1. Что сохранить заранее с диска C:

### Обязательно

| Что | Где обычно лежит | Зачем |
|-----|------------------|-------|
| SSH-ключи | `C:\Users\<user>\.ssh\` | Доступ к GitHub и production-серверу для deploy |
| Git config | `C:\Users\<user>\.gitconfig` | Имя, email, настройки Git |
| npm config | `C:\Users\<user>\.npmrc` | Нужен, если есть токены/registry/proxy |
| Docker volume / dump БД | Docker Desktop data на `C:` | Локальная PostgreSQL БД проекта |
| Настройки редактора | VS Code/Cursor user data | Расширения, темы, настройки, keybindings |
| Windows hosts | `C:\Windows\System32\drivers\etc\hosts` | Локальные имена вроде `dygdyg` для dev |

### Желательно

| Что | Где | Комментарий |
|-----|-----|-------------|
| Windows Terminal settings | `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json` | Если настроены профили |
| PowerShell profile | `Documents\PowerShell\Microsoft.PowerShell_profile.ps1` | Алиасы/функции, если есть |
| VS Code extensions list | экспорт командой ниже | Проще восстановить редактор |
| Browser bookmarks/passwords | профиль браузера или sync | Доступы к Shikimori/Kodik/GitHub |
| Codex/Cursor локальные настройки | `%USERPROFILE%\.codex`, `%USERPROFILE%\.cursor` если есть | Только если используешь локальные кастомизации |

Файл `.env` обычно лежит в корне проекта. Если проект на другом диске и не будет
форматироваться, он сохранится. Но всё равно проверь, что `E:\GitHub\ta_new\.env`
на месте или есть резервная копия.

---

## 2. Дамп локальной PostgreSQL БД перед переустановкой

Локальная БД запускается через Docker Compose:

```powershell
npm run docker:up
```

Данные лежат в Docker volume `postgres_data`. При переустановке Windows/Docker этот
volume может пропасть. Перед переустановкой сделай SQL dump в папку проекта или на
внешний диск:

```powershell
cd E:\GitHub\ta_new
npm run db:backup
```

По умолчанию dump сохраняется в:

```text
E:\GitHub\ta_new\backups\db\
```

Проверь, что файл появился:

```powershell
Get-ChildItem E:\GitHub\ta_new\backups\db
```

Если локальная БД не важна, можно не делать dump: после восстановления достаточно
будет снова выполнить `npm run kodik:sync` или долгий `npm run kodik:import`.

---

## 3. Как убрать Docker/базу с диска C:

Сейчас Docker Desktop хранит контейнеры, images и volumes в своём Linux-диске
на системном диске. Для этого проекта база находится в volume:

```text
ta_new_postgres_data
```

Внутри Docker он смонтирован так:

```text
/var/lib/docker/volumes/ta_new_postgres_data/_data
  -> /var/lib/postgresql/data
```

На Windows это часть большого Docker Desktop VHDX, а не обычная папка проекта.
На текущей машине он был найден здесь:

```text
C:\Users\dygdy\AppData\Local\Docker\wsl\disk\docker_data.vhdx
```

Чтобы база не занимала `C:` и не пропала вместе с системой, лучший вариант —
перенести **весь Docker Desktop disk image** на другой диск, например:

```text
E:\DockerDesktopData\
```

Делается через интерфейс Docker Desktop:

1. Останови dev-сервер проекта.
2. Сделай свежий dump:

```powershell
cd E:\GitHub\ta_new
npm run db:backup
```

3. Открой Docker Desktop.
4. Перейди в `Settings` -> `Resources` -> `Advanced`.
5. Найди `Disk image location`.
6. Укажи путь на другом диске, например `E:\DockerDesktopData`.
7. Нажми `Apply & Restart`.
8. После перезапуска проверь:

```powershell
cd E:\GitHub\ta_new
npm run docker:up
docker ps
npm run db:studio
```

Не рекомендуется переносить сырые файлы PostgreSQL в папку проекта через bind
mount (`E:\GitHub\ta_new\data\postgres`). На Windows это может быть медленнее и
капризнее по правам. Для аварийного восстановления надёжнее держать dump в
`backups\db`, а Docker data disk хранить на `E:`.

---

## 4. Быстрый список, что скопировать вручную

Создай папку бэкапа, например `E:\WindowsBackupBeforeReinstall\`, и положи туда:

```text
C:\Users\<user>\.ssh\
C:\Users\<user>\.gitconfig
C:\Users\<user>\.npmrc                (если существует)
C:\Windows\System32\drivers\etc\hosts
E:\GitHub\ta_new\.env                 (контрольная копия)
E:\GitHub\ta_new\backups\db\          (если нужен локальный дамп БД)
```

Для VS Code/Cursor проще экспортировать список расширений:

```powershell
code --list-extensions > E:\WindowsBackupBeforeReinstall\vscode-extensions.txt
```

Если используешь Cursor вместо VS Code, сохрани его настройки через интерфейс или
скопируй пользовательские настройки из `%APPDATA%`, если они нужны.

---

## 5. Что установить после переустановки Windows

### Минимальный набор

1. **Git for Windows**
   - Нужен для Git, Git Bash и нормальной работы с репозиторием.

2. **Node.js 22 LTS**
   - Проект использует Next.js 16 и TypeScript.
   - Проверка:

```powershell
node -v
npm -v
```

3. **Docker Desktop**
   - Нужен для локального PostgreSQL.
   - Включи WSL2 backend, если Docker предложит.

4. **OpenSSH Client**
   - Обычно уже установлен в Windows.
   - Проверка:

```powershell
ssh -V
scp
```

5. **PowerShell 7** (желательно)
   - Deploy-скрипты работают и в Windows PowerShell, но PowerShell 7 удобнее.

6. **VS Code / Cursor / Codex Desktop**
   - Любой редактор, которым пользуешься.

7. **Браузер для отладки**
   - Chrome или Edge.

### Не обязательно

- WSL для этого проекта не обязателен. Деплой и сборка работают с Windows через
  `scripts/deploy.ps1`; сборка production выполняется на сервере.
- Локальный PostgreSQL как отдельная Windows-служба не нужен, если используешь Docker.

---

## 6. Восстановление после установки софта

### 6.1. Вернуть ключи и настройки

Скопируй обратно:

```text
E:\WindowsBackupBeforeReinstall\.ssh\      -> C:\Users\<user>\.ssh\
E:\WindowsBackupBeforeReinstall\.gitconfig -> C:\Users\<user>\.gitconfig
E:\WindowsBackupBeforeReinstall\.npmrc     -> C:\Users\<user>\.npmrc
```

Проверь SSH-доступ к серверу:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_rsa" root@195.26.230.35 "echo ok"
```

Если ключи не переносились, создай новый SSH-ключ и добавь его туда, где нужен
доступ: GitHub и production-сервер.

### 6.2. Проверить проект

Если проект уже лежит на другом диске:

```powershell
cd E:\GitHub\ta_new
git status
npm ci
```

Если проекта нет, клонируй заново:

```powershell
git clone <repo-url> E:\GitHub\ta_new
cd E:\GitHub\ta_new
npm ci
```

Проверь `.env`:

```powershell
Test-Path .env
```

Если `.env` потерян:

```powershell
copy .env.example .env
```

И заполни реальные значения: `DATABASE_URL`, `KODIK_API_TOKEN`,
`SHIKIMORI_CLIENT_ID`, `SHIKIMORI_CLIENT_SECRET`, `AUTH_URL`,
`ADMIN_SHIKIMORI_IDS` при необходимости.

### 6.3. Запустить PostgreSQL

```powershell
npm run docker:up
docker ps
```

Применить схему:

```powershell
npm run db:push
```

### 6.4. Восстановить dump БД, если он был сделан

Если есть dump в `backups\db`, выбери самый свежий файл:

```powershell
cd E:\GitHub\ta_new
npm run docker:up
Get-ChildItem E:\GitHub\ta_new\backups\db
```

Восстановление:

```powershell
docker cp E:\GitHub\ta_new\backups\db\track-anime-db-YYYYMMDD-HHMMSS.dump track-anime-db:/tmp/track_anime.dump
docker exec track-anime-db pg_restore -U track_anime -d track_anime --clean --if-exists /tmp/track_anime.dump
npm run db:push
```

Если dump не нужен или его нет:

```powershell
npm run kodik:sync
```

Для полной локальной базы:

```powershell
npm run kodik:import
```

Если локальная БД тестовая и нужен быстрый актуальный dev-снимок с production:

```powershell
npm run db:restore-prod
```

Команда сначала скачает production dump в `backups\db`, сделает backup текущей
локальной dev-БД, а потом перезапишет локальную БД данными production.

---

## 7. Запуск разработки

```powershell
cd E:\GitHub\ta_new
npm run dev
```

Сайт:

```text
http://localhost:3000
```

Для входа через Shikimori OAuth в dev-приложении должен быть redirect URI:

```text
http://localhost:3000/api/auth/callback/shikimori
```

Для открытия с телефона в LAN используй IP компьютера:

```text
http://192.168.x.x:3000
```

Если используешь локальное имя `dygdyg`, верни запись в hosts:

```text
192.168.x.x  dygdyg
```

---

## 8. Проверки после восстановления

```powershell
npm run build
npm run db:backup
npm run db:studio
npm run kodik:sync
```

Проверить deploy:

```powershell
npm run deploy
```

Если нужно только проверить упаковку без отправки на сервер:

```powershell
.\scripts\deploy.ps1 -DryRun
```

---

## 9. Частые проблемы после переустановки

| Симптом | Что проверить |
|---------|---------------|
| `npm ci` падает | Node.js 22 LTS, наличие `package-lock.json`, доступ к npm registry |
| Prisma не подключается к БД | Запущен ли Docker, совпадает ли `DATABASE_URL` с `docker-compose.yml` |
| Главная пустая | Запусти `npm run kodik:sync` или восстанови dump БД |
| На `C:` снова мало места | Проверь Docker Desktop `Disk image location`; Docker data disk должен быть на `E:` |
| Login через Shikimori не работает | `AUTH_URL`, redirect URI в Shikimori OAuth app, `SHIKIMORI_CLIENT_ID/SECRET` |
| `ssh root@195.26.230.35` не работает | Вернул ли `.ssh`, права ключа, есть ли ключ на сервере |
| Deploy не видит `tar`/`scp` | Установлен ли Git/OpenSSH, доступны ли команды из PowerShell |
| С телефона не открывается dev | `npm run dev` слушает `0.0.0.0`, firewall Windows, правильный LAN IP |

---

## 10. Самое важное коротко

Перед сносом Windows сохрани:

```text
C:\Users\<user>\.ssh\
C:\Users\<user>\.gitconfig
C:\Users\<user>\.npmrc
C:\Windows\System32\drivers\etc\hosts
E:\GitHub\ta_new\.env
E:\GitHub\ta_new\backups\db\
```

После переустановки поставь:

```text
Git for Windows
Node.js 22 LTS
Docker Desktop
PowerShell 7
VS Code / Cursor / Codex Desktop
Chrome / Edge
```

И восстанови проект:

```powershell
cd E:\GitHub\ta_new
npm ci
npm run docker:up
npm run db:push
npm run dev
```

Чтобы база не жила на `C:`, после установки Docker Desktop сразу перенеси
`Disk image location` на `E:\DockerDesktopData`.
