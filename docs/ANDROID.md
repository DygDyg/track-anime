# Android и Android TV

Папка `android/` содержит нативную Android-оболочку сайта Track Anime. Один проект собирает APK с двумя launcher-точками: обычной для телефона/планшета и Leanback для Android TV. Контент, сессия, прогресс, списки и плеер остаются на сервере сайта; приложение не содержит токенов Kodik или Shikimori.

## Требования

- Android Studio (с Android SDK Platform 35);
- JDK 17, используемая Android Studio;
- подключение к `https://track-anime.dygdyg.ru/` или одному из зеркал: `https://track-anime.duckdns.org/`, `https://ta.dygdyg.ru/`.

## Сборка

Откройте каталог `android/` в Android Studio и выполните `Build → Generate Signed Bundle / APK`. Для тестовой сборки можно использовать Gradle из Android Studio:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

APK будет создан в `android/app/build/outputs/apk/debug/`. Android-иконка и ТВ-баннер создаются из текущих `public/icon.png` и `public/logo.webp`; после обновления этих ассетов выполните `npm run android:brand:sync` перед новой сборкой. Перед публикацией настройте подпись релизного пакета и повысьте `versionCode`.

Для текущего тестового распространения release-вариант подписывается тем же локальным debug-ключом, что и debug APK, поэтому он обновляет уже установленную тестовую версию. Для Google Play или долгосрочной публичной подписи замените это на отдельный защищённый release-ключ до первой такой публикации: смена ключа потребует от пользователей переустановки приложения.

## Публикация APK

После сборки подписанного APK опубликуйте его вместе с сайтом:

```powershell
.\scripts\deploy.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
```

Деплой положит APK по `/downloads/TrackAnime.apk` и манифест `/downloads/TrackAnime.json` с версией и SHA-256. Вкладка «Приложение» в настройках сайта содержит кнопку загрузки, QR-код и версию из манифеста.

## Поведение

- Все адреса `track-anime.dygdyg.ru`, `track-anime.duckdns.org` и `ta.dygdyg.ru` открываются в приложении, включая deeplink на страницу аниме. Если текущий домен не начал загрузку за 12 секунд либо вернул сетевую/HTTP-ошибку, приложение автоматически переключается по цепочке: основной домен → DuckDNS → `ta.dygdyg.ru`.
- Внутри Android-оболочки синхронизируется только `ta.session` между этими тремя точными HTTPS-доменами. Это даёт единый вход при переключении на зеркало; OAuth state и другие cookie не копируются. Все хосты должны работать с одной БД сессий.
- OAuth Shikimori также остаётся во встроенном WebView: callback устанавливает cookie сессии именно в приложении.
- Остальные внешние ссылки и загрузки открываются системным приложением.
- При старте с Android TV включается существующая навигация сайта стрелками и Enter, экран фиксирован в альбомной ориентации.
- Кнопка полноэкранного режима плеера использует нативный fullscreen WebView: видео разворачивается на весь экран, телефон временно переводится в альбомную ориентацию, а Back возвращает к странице плеера.
- Встроенный `AdBlocker` перехватывает сетевые запросы WebView (`shouldInterceptRequest`) и блокирует рекламные хосты / VAST-манифесты Kodik до загрузки. Сайт, Shikimori и сам плеер не блокируются целиком — только ad-ресурсы.
- Правила RuAdList для Kodik (third-party `.php?id=`, `subid`, `*.in.net`), пустой VAST XML; HTML плеера не переписывается.
- При `ERR_TIMED_OUT` / сетевой ошибке главного кадра показывается экран «Нет соединения» с кнопкой «Повторить».
- После первой загруженной страницы приложение проверяет `/downloads/TrackAnime.json` на том же зеркале. Если `versionCode` выше установленного, пользователь может скачать APK; перед открытием системного установщика проверяется SHA-256. Тихая установка невозможна на обычном Android: пользователь подтверждает установку и при первом обновлении разрешает установку из Track Anime.

OAuth redirect URI основного домена: `https://track-anime.dygdyg.ru/api/auth/callback/shikimori`.

## AdBlocker

| Файл | Роль |
|------|------|
| `app/src/main/java/.../AdBlocker.java` | Список блокируемых хостов и правил для VAST/preroll |
| `BaseWebActivity.java` | Подключение через `WebViewClient.shouldInterceptRequest` |

Блокировка работает только в Android/Android TV оболочке: iframe Kodik cross-origin, поэтому браузерный JS сайта не может резать эти запросы. Список доменов можно расширять в `AdBlocker` без изменений UI.

`AdBlocker` только отдаёт пустые ответы на matched URL. HTML плеера не переписывается — синхронная загрузка внутри `shouldInterceptRequest` может вызвать `ERR_TIMED_OUT` у WebView.
