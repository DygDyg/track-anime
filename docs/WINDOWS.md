# Windows-оболочка

Папка `windows/` содержит настольное приложение Track Anime на WPF + WebView2. Поведение совпадает с Android-оболочкой: сайт открывается во встроенном браузере, сессия/списки/плеер остаются на сервере, токены Kodik и Shikimori в клиент не кладутся.

## Требования

- Windows 10 1809+ / Windows 11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) для сборки
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) на машине пользователя (обычно уже есть с Edge)

## Сборка

Иконка приложения: `windows/TrackAnime/Assets/app.ico` (из `public/!referens.png`).

```powershell
cd windows
dotnet build TrackAnime\TrackAnime.csproj -c Release
dotnet publish TrackAnime\TrackAnime.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ..\public\downloads
```

Либо:

```powershell
npm run windows:publish
.\scripts\publish-windows-app.ps1
```

Артефакты:

| Файл | Назначение |
|------|------------|
| `public/downloads/TrackAnimeWindows.exe` | Портативный клиент |
| `public/downloads/TrackAnimeWindows.json` | Манифест обновлений (`versionCode`, `versionName`, `exeUrl`, `sha256`) |

## Публикация на сервер

Только exe + манифест (без пересборки сайта), как `deploy:apk`:

```powershell
npm run deploy:windows
.\scripts\deploy-windows-app.ps1
# уже собранное:
npm run deploy:windows -- -SkipPublish
```

Вместе с сайтом (exe попадёт в tar):

```powershell
.\scripts\deploy.ps1 -PublishWindowsApp
```

`npm run deploy` (auto) подхватит изменения в `windows/**` или в `public/downloads/TrackAnimeWindows.{exe,json}` и вызовет `deploy-windows`.

Деплой положит файлы по `/downloads/TrackAnimeWindows.exe` и `/downloads/TrackAnimeWindows.json`. Страница `/app` читает манифест для версии.

## Поведение

- Зеркала: `track-anime.dygdyg.ru` → `track-anime.duckdns.org` → `ta.dygdyg.ru` (таймаут 12 с / сетевая ошибка).
- Если прямые зеркала недоступны — HTTP-прокси из настроек / `windows/TrackAnime/local.properties` (те же ключи, что у Android: `trackAnimeProxy*`).
- Deep link `trackanime://settings` — нативные настройки оболочки; `taproxy://…` — как на Android.
- Между тремя HTTPS-доменами синхронизируется только cookie `ta.session`.
- AdBlocker на уровне `WebResourceRequested` (тот же набор правил, что в Android `AdBlocker.java`).
- UA содержит `TrackAnimeWindows/1`; сайт показывает пункт «Настройки приложения» и блок загрузки на `/app`.
- Bridge `window.TrackAnimeWindows` / `window.TrackAnimeAndroid`: keep-screen-on и яркость монитора.
- Цвет заголовка окна (DWM caption) синхронизируется с темой сайта (`dark`/`light`) и акцентом; рамка — цвет акцента.
- Диалог «Настройки приложения»: тёмный UI как у Android, скроллбар в стиле сайта (тонкий muted thumb).
- При активации окна проверяется `/downloads/TrackAnimeWindows.json`; при большем `versionCode` предлагается скачать exe с проверкой SHA-256.

## Прокси

Файл `windows/TrackAnime/local.properties` (см. `local.properties.example`):

```
trackAnimeProxyHost=…
trackAnimeProxyPort=…
trackAnimeProxyUsername=…
trackAnimeProxyPassword=…
```

Ручные настройки хранятся в `%LOCALAPPDATA%\TrackAnime\preferences.json`.

## Отличия от Android

- Нет Leanback / D-pad TV launcher и режима системных панелей Android.
- Обновление открывает скачанный exe (не PackageInstaller).
- Протоколы `trackanime://` / `taproxy://` с рабочего стола работают, если зарегистрировать их на exe (опционально) или передать URL аргументом командной строки.
