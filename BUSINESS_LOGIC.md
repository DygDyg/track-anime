# Track Anime — Business Logic

## Domain Key

```
Shikimori anime.id  ===  Kodik shikimori_id  ===  URL /anime/[shikimoriId]
```

Один Shikimori-тайтл может иметь несколько `KodikMaterial` (разные озвучки). Каждый material — отдельная запись с `translationId`, `translationTitle`, `playerLink`.

Для внешних интеграций, которым нужен MyAnimeList ID, используется отдельный mapping
`AnimeExternalIdMap`: `shikimoriId -> malId`. Этот mapping не заменяет основной доменный ключ сайта.
Заполнение запускается вручную из админки/CLI и автоматически в фоне для `shikimoriId`,
которые появились или обновились во время Kodik sync.

## Core Business Flows

### 1. Home Feed (новые серии)

**Источник:** `KodikEpisodeRelease` — создаётся при sync/import когда обнаружена новая серия.

**Flow:**
1. `getRecentReleasesPage()` читает материализованную общую ленту (`HomeFeedItem`, порядок `rank`); SQL-сборка (фаза `releases` из `KodikEpisodeRelease` + фаза `catalog`) выполняется фоном в `home-feed-cache.ts`, не на скролле пользователя. Сортировка как раньше: у онгоингов дата серии / `kodikUpdatedAt`, у `released` — `animeReleasedAt`; завершённые >90 дней уходят в каталожный хвост
2. Для авторизованных: `getHistoryUpcomingSoon()` — блок «Скоро выйдут» (если count > 0)
3. Для всех (гости и авторизованные): `getHomeNovelties()` — спойлер «Новинки» (всегда свёрнут при открытии): сезон 1, ≤5 серий (`episodes_aired` / fallback номер серии), последний `KodikEpisodeRelease.releasedAt` не старше 30 дней, старт показа `aired_on`/`aired_at` (materialData / anime_full) не старше 90 дней (без старых тайтлов с новой озвучкой; без даты старта — не показываем), без `movie`; один тайтл на `shikimoriId`; общий список, `unstable_cache` 24 ч, tag `home-novelties` (sync его не сбрасывает). Принудительный сброс: админка `/admin/import` → «Обновить кеш «Новинки»» → `POST /api/admin/home-novelties/revalidate`
4. Для авторизованных: `getHistoryNewEpisodes()` — серии из тайтлов в watch history
5. `ReleaseFeed` (client) — infinite scroll через `GET /api/releases`
6. Перед уходом на `/anime/[id]` снимок ленты и scroll сохраняются в `sessionStorage` (`ta:feed:*`, `ta:nav-return`) для восстановления при возврате; description обрезается, при нехватке квоты снимок ужимается дальше и ошибка `QuotaExceeded` не пробрасывается — в крайнем случае восстанавливается только scroll
7. Фильтр по озвучкам из site settings пользователя (только клиент; серверный кеш ленты один на всех)
8. Фильтр статуса на главной: «Всё» / «Онгоинги» (ongoing+anons) / «Вышедшие» (released); выбор сохраняется в localStorage
9. По умолчанию скрываются тайтлы без рейтинга Shikimori (`hideZeroScoreOnHome`: пустой score или ≤0, клиентский фильтр); настройка в site settings
10. Актуальность ленты: head refresh после kodik sync и при polling `live=1`; полный rebuild — фон при пустом кеше / раз в ~6 ч / кнопка «Пересобрать кеш ленты» (`POST /api/admin/home-feed/rebuild`). Пока full не готов, API отдаёт только phase=releases (без тяжёлого catalog SQL)
11. Карточки фильмов и спешлов показывают короткий бейдж `M`/`S` на постере, а hover-панель показывает тип тайтла с описанием.
12. На мобильной карточке релиза всегда видны компактный ряд метаданных (рейтинг, серия, тип, статус; для ранних серий — бейдж `NEW` перед рейтингом) и до 4 жанров; верхняя цветная полоска `NEW` только на desktop. Долгое удержание карточки на touch открывает нижнюю шторку с содержимым desktop-превью (описание, «Смотреть», списки); закрытие — свайп вниз по ручке, тап по фону, крестик или Escape.

**Пустая лента:** нет данных → подсказка запустить `npm run kodik:sync`.

**Админ-баннер устаревшей БД:** на главной для `isAdmin`, если последний успешный Kodik sync старше 2 часов (или успешных запусков не было). Превью вёрстки: `/?adminSyncBannerPreview=1`.

### 2. Anime Page + Player

**Плеер:** TA-плеер с интерфейсом сайта используется по умолчанию. В настройках (вкладка «Плеер») доступна галочка `Kodik` для переключения на оригинальный legacy-плеер; в этом режиме часть функций сайта может быть недоступна. Со страницы тайтла переключатель убран. Нижняя панель раздвигается по нажатию «Авто» для доступа к качеству Kodik и схлопывается при автоскрытии UI во время воспроизведения либо через ту же задержку на паузе. Задержка автоскрытия UI TA-плеера — `playerControlsIdleMs` (по умолчанию 2500 мс; у интерфейса Kodik ≈ 4000 мс). Локальная галочка «Крупный интерфейс» (`playerLargeUi`, только localStorage, `html[data-player-large-ui]`) увеличивает кнопки панели, полосу серий и ползунки прогресса/громкости — удобнее на телефоне и ультрашироком мониторе; прорезь click-layer до нативных кнопок пропуска OP/ED Kodik поднимается вместе с панелью (`5.75rem` вместо `4.25rem`), ширина прорези «Авто»/качества не меняется. Режим «По высоте экрана» (`betaTheaterMode=height`): max-height кадра ≈ `100dvh` без вычета шапки; шапка сайта (и app-promo внутри неё) накладывается поверх видео и скрывается синхронно с chrome плеера по idle (`data-player-theater` / `data-player-theater-chrome` на `html`).

**Балансер VideoHUB (CVH):** на странице тайтла под заголовком «Смотреть» (над плеером) есть переключатель `TA` / `VideoHUB` (по умолчанию всегда **TA**, выбор не запоминается). Рядом — кнопка-цепочка: копирует ссылку на текущий плеер, сезон, серию, озвучку (`translation` = Kodik `translationId`), таймкод (`t` в секундах; `0` не пишется) и `nosave=1` (не писать `UserWatchProgress` при открытии этой ссылки; ручная «В историю» не блокируется). GET-параметры: `player=kodik|cvh` (алиасы `ta` / `videohub`), `season`, `episode`, `translation`, `t` (также `mm:ss` / `h:mm:ss`), `nosave=1|true|yes`; при открытии с целью серии/таймкода поверх плеера показывается оверлей «Переход по ссылке» (озвучка, сезон, серия, таймкод) с кнопкой «Воспроизвести» — тот же continue-flow, что у «Продолжить», но с данными из URL (без мягкого boot-seek); hash `#player` для скролла. OG/Twitter meta для Discord/Telegram при наличии deep-link query включает строку «плеер · сезон · серия · озвучка · таймкод» в title/description и `og:url` с теми же GET-параметрами. VideoHUB: виджет inline (`player.cdnvideohub.com`, `pub` из `NEXT_PUBLIC_CVH_PUB` / `10326`). Плейлист plapi грузится **в браузере** (`resolveCvhPlaylistForAnime`: `aggr=shikimori` → fallback `mal|mali` + MAL ID; CORS с `track-anime.win`; серверный `/api/anime/.../cvh` не обязателен — с VPS plapi часто недоступен). Над плеером — полоска серий как у TA/Kodik; снизу — сетка озвучек как у TA. Озвучки TA↔CVH сопоставляются (`matchCvhVoiceStudio` / `matchKodikTranslationForCvhVoice`) при переключении балансера и выборе озвучки; в историю пишется `kodikId` сопоставленной TA-озвучки + сезон/серия/`positionSeconds` из CVH (как у TA). Кнопка «Продолжить» всегда открывает **TA** (у CVH Partners API нет seek). Прогресс (серия + `positionSeconds`) пишется в `UserWatchProgress` с текущим `kodikId` выбранной TA-озвучки по `currentTime` / `changeState` с актуальной серией из state плеера (во время рекламы не пишется). Seek в Partners API нет — кнопка «Продолжить» над плеером всегда переключает балансер на **TA** и продолжает seek там; параметр `t` для VideoHUB выставляет серию/озвучку, но seek по секундам доступен только в TA. AniSkip и watch party в режиме VideoHUB не работают: панель комнаты совместного просмотра скрыта. Роут `/cdn-iframe` остаётся запасным shell.

**Админская диагностика:** на странице тайтла и в hover-панели карточки админ может открыть «Данные в БД». Окно рендерится поверх всех hover-слоёв, показывает подсвеченный JSON как текст или сворачиваемое дерево, поддерживает поиск с переходом между совпадениями и выводит путь выбранного значения. `/api/admin/anime-debug` показывает только админам локальные Kodik-материалы с `materialData`, сериями и релизами, а также MAL mapping и кэш AniSkip; внешние API для окна не вызываются.

**Связанные / похожие:** блоки на странице тайтла читают `AnimeRelationSnapshot` (kinds `related` | `franchise` | `similar`) со stale-while-revalidate: для рендера допускается протухший снимок; live Shikimori вызывается только при miss/stale (non-critical timeout). TTL: ~30 дней для всех kinds. При смене статуса тайтла (`ongoing`→`released` и т.п.) снимки помечаются stale (из Shikimori anime-cache и Kodik `saveKodikMaterial`), чтобы следующий визит страницы обновил связи. Источник правды — Shikimori; своя БД — durable-кэш, чтобы секции не пропадали при rate limit / fail-fast.

**Flow:**
1. `getAnimePageData(shikimoriId)` загружает:
   - Shikimori metadata (title, description, score, relations)
   - Kodik translations из БД (все озвучки для shikimoriId), отсортированные по числу вышедших серий (`lastSeason`/`lastEpisode` убыв.), затем популярные студии с цветом (`translation-colors`), затем по названию
   - Poster через цепочку fallback
2. Пользователь выбирает озвучку → `AnimeWatchPanel` загружает watch history
3. `KodikPlayer` встраивает iframe, слушает postMessage events
4. Прогресс сохраняется: season, episode, positionSeconds → `UserWatchProgress`
5. `AnimeWatchPanel` запрашивает OP/ED тайминги через `/api/anime/[shikimoriId]/skip-times`, подсвечивает эти интервалы на таймлайне TA-плеера (и на тонкой полосе прогресса при скрытом UI) и показывает кнопки пропуска только когда текущая позиция находится внутри найденного интервала; пользователь может включить автопропуск OP/ED отдельно для каждой Kodik-озвучки чекбоксом «Автопропуск OP/ED» рядом со списком озвучек, включённые озвучки помечаются AP в списке, а за 5 секунд до начала интервала появляется таймер автопропуска с отменой. Если озвучек больше 5, между автопропуском и кнопкой обновления плеера появляется поле «Поиск озвучки…» (`matchesFuzzyText`: подстрока, раскладка QWERTY↔ЙЦУКЕН, опечатки по токенам ≥3 символов; тот же матчер — в настройках плеера и в админке intro-offset).
6. Страница тайтла показывает тип в метаданных; тип ведёт в поиск и показывает описание при наведении.
7. Тайминги AniSkip смещаются на intro-offset выбранной озвучки, чтобы учитывать локальные заставки студий до начала серии.
8. Админ видит рядом с плеером диагностический AniSkip-индикатор с источником, MAL ID, списком найденных интервалов для текущей серии и фоновым прогревом доступных серий тайтла.
9. TA-плеер используется по умолчанию. Галочка «Kodik» в настройках (вкладка «Плеер») включает оригинальный легаси-плеер Kodik с предупреждением, что отдельные функции сайта в нём могут не работать; на странице тайтла переключателя нет.
10. Кнопка «Продолжить» показывается только когда видео не воспроизводится; в TA-плеере она всегда видна поверх кадра (не зависит от скрытия панели управления) и совпадает по стилю с кнопкой над плеером.
11. TA-плеер использует собственный overlay UI; fullscreen-панель озвучек открывается колёсиком, стрелкой под таймлайном или мобильным свайпом снизу вверх и стыкуется с нижними контролами, перед списком серий появляется выбор реально доступных Kodik-сезонов текущей озвучки (включая названия вроде «Рекап» и «Спешлы»), если у неё доступно несколько сезонов; спешлы и отдельные сезоны с Kodik `season.link` открываются через соответствующий embed URL, а не только `change_episode` на serial-плеере; в TA-плеере обычные серии по возможности открываются remount’ом iframe на per-episode `/seria/` (полоска и прогресс держатся через `activeEpisode` / `playerEpisode`, т.к. Kodik шлёт `episode: null`); если `/seria/` нет — fallback на serial/season + `change_episode`, а озвучки с несколькими Kodik-сезонами помечаются в списке озвучек. В legacy-режиме Kodik iframe всегда остаётся на `/serial/` или `/season/` (не `/seria/`), иначе у Kodik пропадает родной список серий; смена серии идёт через полоску TA + `change_episode`. Кнопка пропуска остаётся поверх видео даже при скрытой нижней панели, переходы на предыдущую/следующую серию находятся в нижней панели и системных Media Session кнопках; в одиночном просмотре TA-плеер переключает следующую серию примерно за секунду до конца, не ожидая события окончания от Kodik (если следующая серия ещё не вышла в Kodik для текущей озвучки — `lastEpisode`/`lastSeason` — переход не запускается, чтобы не зависать на загрузке). При автопереходе на следующую серию оверлей загрузки показывает номер целевой серии, а не серии из сохранённого «Продолжить». Автоматическое восстановление после загрузки страницы или перезагрузки iframe берёт позицию на 1 секунду раньше для компенсации пробуждения Kodik-плеера; полоса серий сразу показывает сохранённую серию. Надёжный переход на позицию — кнопкой «Продолжить» (полный continue-flow). При открытии страницы полный continue-flow не запускается, чтобы не зависать на холодном iframe. Continue-flow ждёт подтверждения целевой серии от Kodik и не делает blind seek на неподтверждённую серию (иначе таймкод целевой серии попадала на N−1). Смена серии (полоса, ←/→, автопереход, «Продолжить», boot сохранённого прогресса, перезапуск плеера, watch party, смена озвучки с resume) в TA по возможности ремаунтит iframe на `/seria/` (кэш/prefetch сезона из `/api/anime/.../episodes`); в legacy Kodik — нет. На `/seria/` — слепой play→seek без ожидания `current_episode` (иначе «подождите…»); `activeEpisode` не даёт сбросить полоску в 1-ю. Нет `/seria/` — serial/season + `change_episode` (blind только как escape). Remount на material при уходе с locked `/seria/` без новой seria-ссылки. Boot soft-seek дожимает `change_episode` до 3 раз, пока Kodik не подтвердит сохранённую серию, затем `bootSettled` — чтобы автопереход N→N+1 не откатывался обратно на boot-серию. Автопереход/выбор серии с `positionSeconds: 0` принимает `play` или `video_started` и после ~7.5 с без `current_episode` форсирует play; `seekTo` не пишет новую серию в liveProgress до подтверждения Kodik. Hard-timeout (~20 с) хранится отдельно от stage-таймеров и не сбрасывается ретраями play/episode — иначе оверлей «Серия N · загрузка плеера…» зависал. Аварийный remount по `CONTINUE_LOADING_TIMEOUT` снимает оверлей и делает мягкий `bootResume` без повторного авто-continue (чтобы не крутить заглушку по кругу; на Android может понадобиться повторный «Продолжить»). Кнопка аварийного перезапуска плеера с текущей позиции делает remount iframe и добавляет одноразовый query `ta_reload` к embed URL на клиенте (без изменения `playerLink` в БД), чтобы обойти HTTP-кеш документа плеера; seek выполняется только после подтверждения целевой серии от Kodik. Перемотка кнопками/стрелками показывает поверх видео суммируемый индикатор секунд, во время воспроизведения TA-плеер запрашивает Screen Wake Lock, при входе в fullscreen пытается включить landscape-ориентацию, громкость и mute-состояние TA синхронизируются из событий Kodik-плеера; до первого события используется последнее локальное зеркало только для UI, без применения к Kodik, а управление громкостью заблокировано до загрузки длительности серии. При потере фокуса окна во время воспроизведения overlay TA скрывается, а при смене фокуса внутри страницы продолжает работать обычный таймер автоскрытия. Видимость и толщина скрытой полосы прогресса настраиваются пользователем (во вкладке «Плеер» превью рисуется поверх окна настроек у нижнего края экрана); при 0% прозрачности полоса выключается, `Shift` переключает между TA UI и родным интерфейсом Kodik с постоянной кнопкой возврата к TA UI, а `T` переключает обычный режим и режим по высоте страницы с учётом шапки и 16:9.
  12. TA-плеер может создать WebSocket-комнату совместного просмотра, если глобальная настройка `WatchPartySettings.enabled` включена. В комнате есть invite-ссылка, копируемый пятизначный цифровой ключ комнаты для ручного подключения, список участников и мастер; после подключения или создания комнаты подтверждённый ключ записывается в URL как `watchRoom`, в том числе у хоста. Если пользователь вводит ключ комнаты другого тайтла, клиент переходит на страницу этого тайтла и повторно подключается по тому же ключу. Неавторизованные пользователи входят со случайным локальным именем вида «Гость 1234», если `WatchPartySettings.allowGuests` включена. Мастер управляет play/pause, seek, сериями и озвучкой; play/pause, перемотка, выбор серий и смена озвучек для остальных включаются отдельными разрешениями мастера. Сервер комнаты каждые 2 секунды рассылает всем `state-sync` с серией, статусом play/pause и позицией в секундах; клиенты корректируют позицию только при расхождении больше 1 секунды. Presence от мастера обновляет основное состояние комнаты, а во время воспроизведения мастер отправляет presence чаще, чтобы новые участники входили на актуальное время даже после запуска через «Продолжить». Автопропуск OP/ED в комнате выполняет только мастер: клиенты игнорируют свой локальный автоскип и получают перемотку от мастера через синхронизацию. Синхронизация выбора озвучек включается мастером отдельно, а каждый участник может локально отключить её и оставить комнатную синхронизацию времени. При первом удалённом запуске браузер участника требует явный клик по кнопке запуска, кнопка показывается поверх плеера; после клика клиент запрашивает у сервера свежий `state-sync`, чтобы не ждать следующего общего интервала. Примерно за секунду до конца серии совместный просмотр перехватывает автопереход Kodik: клиенты ставятся на паузу у конца серии и ждут команду мастера, а мастер переключается на следующую серию и рассылает пакет `episode` с новой серией, `isPlaying: true` и `positionSeconds: 0`. Разрешение выбора серий действует только на ручной выбор через кнопки серий. Сервер принимает в комнату только клиента поддерживаемой версии протокола; устаревшему клиенту предлагается обновить страницу, поэтому он не может посылать команды участникам на новом плеере. Кнопка выхода из комнаты очищает `watchRoom` из URL, чтобы клиент не подключался обратно автоматически. Админка показывает активные комнаты из памяти WebSocket-процесса: тайтл, озвучку, серию, время, статус и участников. Также в БД пишется история запусков (`WatchPartySession` / `WatchPartySessionParticipant`): кто создал, состав, права комнаты и снимок глобальных настроек; сессия закрывается, когда комната пустеет или при рестарте WS-сервера. Если мастер выходит, сервер передаёт роль следующему участнику. Живые комнаты хранятся только в памяти WebSocket-процесса.
13. Тексты для копирования и внешнего шаринга используют обложку через `/api/cover`, чтобы превью совпадало с обложкой на сайте.

**Fullscreen TA-плеер:** прозрачная полоса под нижними контролами принимает клик для фокуса, но не переключает play/pause и не отменяет прокрутку. На touch/coarse pointer одиночный тап по видео только показывает/скрывает TA UI, play/pause в центре — через прорезь к родному UI Kodik (центральной кнопки TA нет); play/pause также в нижней панели; двойной тап по левой половине перематывает назад на 10 сек, по правой — вперёд на 10 сек (с суммируемым индикатором). **Только в fullscreen** вертикальный свайп по правой половине регулирует яркость (как в Vanced): в Android/Windows native shell — реальная яркость (`TrackAnimeAndroid` / `TrackAnimeWindows`), без CSS-затемнения плеера; в браузере/PWA — только fallback-оверлей поверх кадра; уровень запоминается локально и при входе в fullscreen восстанавливается, при выходе native override сбрасывается. Симметрично слева в fullscreen — громкость: в Android shell системная `STREAM_MUSIC` (`TrackAnimeAndroid.setStreamVolume`), без оболочки — громкость Kodik. Вне fullscreen жесты яркости/громкости отключены, чтобы не мешать скроллу. Во время воспроизведения в native-оболочке сайт держит экран включённым через `setKeepScreenOn` (на Android плюс `FLAG_KEEP_SCREEN_ON` в HTML5 fullscreen; на Windows — PowerRequest DisplayRequired). На desktop одиночный клик по-прежнему play/pause, двойной клик — fullscreen. В оконном мобильном портретном режиме панель таймлайна и управления стоит под кадром видео (не перекрывает картинку); в fullscreen и на более широких/ландшафтных экранах контролы остаются overlay поверх видео. До первого `mediaUnlocked` click-layer TA не рендерится; после unlock появляется с задержкой ~2 с — жест до этого уходит в iframe Kodik. Затем заглушка перехватывает мышь/тапы для показа/скрытия TA UI. Passthrough к качеству Kodik — только по нажатию «Авто» (раздвижка схлопывается при автоскрытии UI во время воспроизведения или через `playerControlsIdleMs` на паузе). Пока идёт просмотр (не Shift/Kodik UI и не passthrough качества), раз в ~2.5 с фокус забирается с iframe Kodik обратно на viewport TA — иначе клавиши Space/стрелки не доходят до обработчиков страницы. В режиме «интерфейс Kodik» (`Shift`) на всех платформах TA-хром не рендерится и не принимает клики; кликабельна только кнопка возврата к TA. Во время continue/смены серии в Android WebView TA-оверлеи дополнительно временно без hit-test, пока снова не придёт воспроизведение. «Продолжить» на той же серии сразу шлёт `play` в том же жесте клика (без `change_episode`); seek только после `kodik_player_video_started` (на телефоне с увеличенной задержкой), затем подтверждение по `time_update` рядом с целевой позицией и повторный seek, если поток снова откатывается к началу. Фокус с iframe Kodik возвращается в TA viewport по mousedown/keydown (без polling), чтобы Space/стрелки работали; при доступе к UI Kodik/панели качества фокус не отбирается. Позиция воспроизведения для React-панели не обновляется на каждый time_update (таймлайн — в beta viewport; OP/ED skip-clock читает liveProgressRef ~400 мс); watch party берёт позицию из liveProgressRef и isPlaying из ref, drift > 1 с без изменений.

**Обновление жестом:** на touch-устройствах, когда основная страница находится в самом верху, вертикальное потягивание вниз с порогом срабатывания обновляет текущую страницу. Жест не перехватывается внутри вложенных вертикально прокручиваемых блоков, при горизонтальном свайпе и в fullscreen.

**Правило:** один прогресс на `(userId, shikimoriId)` — не на material/translation.

### 3. Authentication

**Flow:**
1. Первый вход → `/api/auth/shikimori` → Shikimori OAuth → upsert `User` (по `shikimoriId`), save tokens в `ShikimoriAccount`
2. Пользователь может дополнительно создать уникальный локальный логин и пароль (пароль ≥ 6 символов); логин хранится с сохранённым регистром, при входе регистр не важен (`loginNormalized`); пароль — только как `scrypt`-хеш в `LocalCredential`.
3. Вход по локальному логину, Shikimori OAuth и QR создаёт одну и ту же серверную сессию для того же `User`; привязка Shikimori при локальном/QR-входе не меняется.
4. QR содержит только одноразовый код запроса на 3 минуты. Подтверждающее устройство должно быть авторизовано (или сначала выполнить вход); секрет получения сессии QR остаётся на устройстве, показавшем код. Сканер (`QrCodeScanner`) открывает вебкамеру через `getUserMedia` на ПК и телефоне: при наличии `BarcodeDetector` использует его, иначе декодирует кадры через `jsQR`.
5. Admin: `ADMIN_SHIKIMORI_IDS` env или `User.isAdmin = true`
6. Session cookie `ta.session` → `Session` row, TTL **1 год** со **sliding renewal**: при обращении к `/api/auth/session`, если до `expiresAt` осталось меньше 90 дней, срок и cookie продлеваются ещё на год. При регулярных визитах сессия фактически бессрочная; без активности истекает через год от последнего продления.
7. Cookie `ta.session` на `*.track-anime.win` (apex / `www` / `mirror`) ставится с `Domain=.track-anime.win` — общая авторизация в браузере между этими тремя хостами. На `duckdns` / legacy `.dygdyg.ru` cookie по-прежнему host-only (общий Domain невозможен). Android/Windows оболочки копируют только `ta.session` между зеркалами; пустой источник больше не затирает cookie на других хостах (чтобы failover не разлогинивал). Local-only настройки UI (`tvNavigationEnabled`, `playerLargeUi`, `reduceMotion`, `reduceAvatarDecorationMotion`, `companionEnabled` / `companionScale` / `companionStaticAnimations`) дополнительно пишутся в cookie `ta.localSettings` с тем же `Domain=.track-anime.win` (localStorage остаётся кэшем на хосте); остальные site settings синхронизируются через аккаунт.
8. Если клиент помнит прошлый успешный вход (`localStorage ta.auth.last-user`), а `/api/auth/session` вернул `user: null` не после явного logout — показывается баннер с предложением войти снова. Ошибки сети/5xx не сбрасывают текущего user в UI.
9. Если refresh/access токен Shikimori мёртв, TA-сессия **остаётся**. API списков/sync отвечают `401` + `error: "shikimori_auth"`; UI показывает баннер/блок «Связь с Shikimori истекла — переподключите» и кнопку переподключения через `/api/auth/shikimori/reconnect` (не модалку обычного входа).

**OAuth state:** cookie + fallback `OAuthState` table (если cookies потерялись между редиректами).

### 3.1 Audience analytics (admin)

**Сбор:** клиентский `SiteAnalyticsBeacon` шлёт `POST /api/analytics/beacon` при смене пути (без `/admin`). Cookie `ta.vid` (httpOnly, ~1 год) идентифицирует браузер/устройство. IP **не** хранится и **не** используется для склейки — люди за одним VPN остаются разными.

**Личность:** `identityKey = u:{userId}` после логина (visitor привязывается к `User`), иначе `v:{visitorKey}`. Один аккаунт с разных браузеров → один человек; один человек в двух браузерах без логина → два посетителя (намеренно).

**Агрегаты:** `SiteVisitDay` (DAU/WAU/MAU, платформы), `SiteContentDay` + `SiteContentIdentityDay` (разделы и тайтлы). Открытие `/anime/[id]` → section `anime`; реальный play серии → section `anime_play` (Kodik/TA из `AnimeWatchPanel`, VideoHUB из `CvhWatchSection` через `/api/analytics/play` с полем `player`). Дополнительно `anime_play_kodik` / `anime_play_cvh` — карточки «люди / запуски» за 30 дней на `/admin` и `/admin/audience`. Throttle play ~1 час по паре `(player, shikimoriId)` (`lastPlayPath` вида `play:kodik:/anime/…`). Повторные хиты с одного visitor: обычные пути ~5 мин, открытие страницы аниме ~30 мин. Модели телефонов — из `SiteVisitor.deviceLabel` как «бренд + модель» (APK: `Build.MANUFACTURER` + `Build.MODEL` в UA; браузер: Client Hints / UA + эвристика бренда по коду модели). Гостевые запросы с bot/crawler UA (`isAnalyticsBotUserAgent`) не пишутся; авторизованные не фильтруются по UA. Retention агрегатов ~90 дней. Админка: вкладка «Аналитика» (`/admin/audience`, сортировка по клику на заголовок столбца); там же статистика подписок на уведомления (тип «новое в истории» + каналы Telegram/VK/Discord/browser/FCM), лог копирования deep-link на серию (`AnimeWatchShareEvent` / `WatchShareLogPanel`: кто, тайтл, плеер, сезон/серия, озвучка, таймкод, nosave) и продублированы активные комнаты / история совместного просмотра (`WatchPartyStatsPanel`). В `/admin/users` у ников показываются иконки активных каналов уведомлений.

### 4. Anime Lists (Shikimori sync)

**Local-first pattern:**
1. При входе / ручном sync: pull `user_rates` + `favourites` с Shikimori
2. Сохранение в `UserAnimeListEntry`, `UserAnimeBookmark`
3. Мутации на сайте: PUT `/api/user/anime-lists/[shikimoriId]` → обновление Shikimori API + локальный кэш
4. Метаданные sync в `UserListSync` (lastSyncedAt, errors)

**Страницы:** канон UI списков — `/user/[shikimoriId]/favorites` (`FavoritesView`). Свой профиль: editable + background sync (`getAllFavoritesData`); чужой — read-only (`getResolvedUserFavorites`) и фильтр «У вас есть/нет». `/favorites` — legacy redirect на свой канон (сохраняет `?tab=` / `?sort=`).

**List statuses:** planned, watching, completed, on_hold, dropped, rewatching (Shikimori user_rates).

**User score (оценка):** на странице аниме под рейтингом Shikimori можно поставить оценку 1–10 через `PUT /api/user/anime-lists/[shikimoriId]` с `{ score }` (scope OAuth `user_rates`). `0` сбрасывает оценку. Если записи в списке ещё нет, создаётся `user_rate` со статусом `planned` и выбранной оценкой. Локально хранится в `UserAnimeListEntry.userScore`.

### 5. Watch History

**Модель:** `UserWatchProgress` — unique `(userId, shikimoriId)`.

**Поля:** `kodikId`, `seasonNumber`, `episodeNumber`, `positionSeconds`.

**Использование:**
- Страница `/history` — сверху блок «Скоро выйдут» (ETA: `releasedAt` последней серии в озвучке из `UserWatchProgress.kodikId` + 7 дней, окно 12 часов), ниже список истории с постерами; по умолчанию вкладка «Актуальные» скрывает записи со статусом списка `completed` / `on_hold` / `dropped`; вкладки «Просмотрено», «Отложено» и «Брошено» показывают только их
- Главная (`/`) — для авторизованных: блок «Скоро выйдут» (тот же расчёт, только если count > 0) над «Новое в вашей истории», затем общая лента релизов
- Anime page — восстановление позиции при открытии; кнопка «В историю» сохраняет закладку (`seasonNumber: 1`, `episodeNumber: 0`, `positionSeconds: 0`, выбранная озвучка) — в списке показывается «Ещё не смотрели» без полосы прогресса; автопродолжение не запускается (порог сохранения прогресса ≥ 60 сек); после реального просмотра закладка перезаписывается обычным прогрессом
- После автоочистки `UserWatchProgress` (`cleared: true` при досмотре финала сверх порога % длительности) авторизованному пользователю предлагается плашка над плеером «Перенести в Просмотрено» (`MoveToCompletedBanner`, цвета «Смотрю» / кнопка «Просмотрено»): показ откладывается до паузы или выхода из TA-fullscreen (если уже на паузе — сразу). Не авто-статус: только по CTA через `PUT /api/user/anime-lists`. Не показывается при уже `completed`, гостям, dismiss в `sessionStorage` на сессию вкладки. CVH вне scope (нет того же path очистки через Kodik progress).
- Если авторизованный пользователь просмотрел большую часть 1-й серии сериала (S1E1, >50% длительности из плеера) и тайтла ещё нет в `watching` / `rewatching` / `completed`, над плеером предлагается плашка «Добавить в Смотрю» (`AddToWatchingBanner`, цвета «Запланировано» / кнопка «Смотрю»): тот же UX — только после паузы или выхода из TA-fullscreen, CTA через `PUT /api/user/anime-lists`, dismiss в `sessionStorage` на сессию вкладки. Не показывается гостям, односерийным (фильм/OVA), при уже активном баннере «Просмотрено». CVH вне scope.

### 6. Kodik Import

**Двухфазный импорт (`KodikImportJob`, id=`"full"`):**

| Phase | Action |
|-------|--------|
| `catalog` | Paginate Kodik `/list` (`types=anime,anime-serial`, has shikimori_id) → save materials |
| `episodes` | For `episodesLoaded=false`: fetch with episodes → save seasons/episodes |

Фильмы Kodik (`type=anime` / `movie-*`) не имеют дерева seasons — `episodesLoaded` сразу `true` (достаточно `playerLink`).

**Resume:** job state в БД, `--resume` flag в CLI.

**On-demand:** если на `/anime/[shikimoriId]` нет реальных `KodikMaterial`, `ensureKodikMaterialsForShikimoriId` тянет их через Kodik `/search?shikimori_id=` (закрывает дыры до полного реимпорта фильмов).

### 7. Kodik Sync (incremental)

**Flow:**
1. Fetch N pages of recently updated materials (`types=anime,anime-serial`, `KodikSyncSettings.syncPages`)
2. Update existing, add new materials
3. Detect new episodes → create `KodikEpisodeRelease`
4. Log run in `KodikSyncRun`
5. Auto-sync: `kodik-sync-scheduler.ts` по интервалу (`intervalMinutes`)

### 8. Calendar

**Источник онгоингов:** по умолчанию локальная Kodik БД (`KodikMaterial.materialData.next_episode_at`), альтернативно Shikimori `/api/calendar` через кнопку «Календарь шики» на странице `/calendar`.

**Flow:**
1. `/calendar` читает `source=shikimori` из query string для альтернативного источника онгоингов.
2. `getCalendarPageData(source)` кэширует сгруппированные данные через `unstable_cache` на 5 минут с tag `calendar`.
3. Локальный Kodik-source отдаёт карточки с доступной озвучкой/плеером, если они есть в БД.
4. Shikimori-source нормализуется в тот же `CalendarItem`, но карточки могут быть без `playerLink`; переход остаётся на страницу `/anime/[shikimoriId]`.
5. Вкладка «Анонсы» продолжает использовать `ShikimoriAnonsEntry`.
6. Дни/месяцы и блоки анонсов сворачиваются по клику на заголовок; в шапке календаря — «Свернуть все» / «Развернуть все». Блоки «Прошедшие даты анонса» и «Дата уточняется» по умолчанию свёрнуты.

### 9. Search

**Источник:** локальная БД `KodikMaterial` (raw SQL в `search.ts`).

**Не ищет** напрямую в Shikimori/Kodik API — только по импортированным данным.

Быстрый поиск по названию сначала ранжирует точные и префиксные совпадения, затем добавляет неточные совпадения по локальным названиям тайтла (Levenshtein по токенам). Если по запросу ничего не найдено — пробует альтернативную раскладку клавиатуры, затем **частичный** fuzzy: достаточно большинства сильных токенов (≥2), чтобы поймать описку вроде «ателье ведьминских колпаков» → «Ателье колдовских колпаков». В шапке при малом числе title-совпадений дополнительно подмешивается поиск по описанию. На странице `/search` доступна сортировка `sort=relevance` (по умолчанию) или `sort=date` (сначала новые по `animeReleasedAt` / году). Подсказки в шапке отправляют запрос с задержкой после набора; задержка хранится в `SearchSettings` и настраивается в админке.

### 10. Cover/Poster Resolution

**Источники обложки** (`poster-fallback.ts` + `cover-cache.ts`), порядок и вкл/выкл — в админке (`CoverCacheSettings.sourceOrder`, `/admin/covers`). Дефолт:

1. Прямой `?url=`
2. Kodik API poster
3. Локальная БД (materials / episode releases)
4. CDN VideoHub Content API `poster_url` по закэшированному MAL id (без GraphQL ради обложки)
5. Shikimori `/animes/{id}` (image + video preview; **без** related)
6. World-Art (HTML через Kodik `worldart_link`)

При fill источники вызываются сверху вниз; после **успешного скачивания** следующих нет. Пустой/падающий источник → следующий.

**Админ force-перекачка:** `/admin/covers` → список id (`GET /api/admin/cover-cache/refresh-recent`), затем в браузере по одному: `/api/cover?id=` (как на сайте) → `/api/cover?id=&force=true`; пара «было / стало» в UI, затем следующий id (`cover-cache-refresh-client.ts`).

**Кэш:** `/api/cover` — resize через sharp, disk cache, настройки в `CoverCacheSettings`.
Срок жизни файла: базовый `maxAgeDays` + стабильный jitter 0…7 дней по `shikimoriId` (при базе 7 → фактически 7–14), чтобы не обновлять весь кэш разом.
Просроченная обложка отдаётся пользователю сразу как stale-версия, а перекачивание запускается в фоне;
старый файл заменяется только после успешной загрузки новой версии.

### 11. Notifications

**Flow:**
1. Пользователь настраивает каналы и шаблоны через `/api/user/notification-preferences` и link routes для browser push, Discord, Telegram, VK; Android APK — FCM через `/api/notifications/fcm-subscribe`.
2. Глобальные настройки и тестовая отправка доступны админам через `/api/admin/notifications/*`. Домен ссылок (`NotificationSettings.linkBaseUrl`): ручной URL или галка `track-anime.github.io` (роутер зеркал с переносом `/anime/:id`); пусто = `AUTH_URL`, env `NOTIFICATION_LINK_BASE_URL`.
3. Фоновая доставка выполняется `scripts/notification-worker.ts` (внешние каналы) и сразу из dispatcher для browser/FCM.
4. In-app уведомления читаются через `/api/notifications/in-app`.
5. Курсор catch-up (`inAppNotifySince`) хранится в `UserNotificationPreferences` и общий для аккаунта; клиентский `localStorage` — кэш. При опросе `since = max(local, server)`.
6. Уже просмотренные серии (прогресс ≥ серии из уведомления) не показываются повторно и не уходят во внешние каналы при отложенной доставке.
7. Android WebView APK получает системные баннеры через FCM (даже при закрытом приложении), если на сервере заданы `FCM_*` / `FCM_SERVICE_ACCOUNT_FILE` и устройство зарегистрировало токен.
8. В Android-оболочке при первом заходе залогиненного пользователя (пока FCM не включён и промпт не отклоняли) `NotificationUiLayer` предлагает включить системные уведомления; «Включить» включает `historyNew` + FCM, «Позже» пишет `ta:android-fcm-prompt-dismissed` в localStorage.

**Модели:** `UserNotificationPreferences`, `UserNotificationLink`, `NotificationDelivery`, `HistoryNewNotification`, `PushSubscription`, `FcmDeviceToken`.

### 12. Brand Rotation

**Источник:** `.webp` файлы в `public/brand-logos`.

**Flow:**
1. Админ задаёт включение и интервал смены в `BrandRotationSettings`.
2. `getActiveBrandAsset()` выбирает один логотип детерминированно для текущего временного слота.
3. Кнопка «Сменить сейчас» в админке меняет `rotationSeed`, поэтому активный логотип обновляется без ожидания следующего интервала.
4. Шапка, metadata, PWA manifest, favicon/icon routes и push-уведомления используют активный логотип.
5. Если ротация выключена или папка пуста, используется `public/logo.webp`.

## Critical Logic Rules

| Rule | Detail |
|------|--------|
| Frontend isolation | Клиент не вызывает Shikimori/Kodik API напрямую |
| Material uniqueness | `KodikMaterial.kodikId` — primary key, one per translation |
| Episode uniqueness | `@@unique([materialId, seasonNumber, episodeNumber])` |
| Release uniqueness | `@@unique([materialId, seasonNumber, episodeNumber])` в releases |
| Session validation | Каждый protected route вызывает `getSession()` independently |
| Admin guard | `requireAdmin()` для pages, `requireAdminApi()` для API |
| Shikimori rate limit | Все Shikimori запросы через shared rate limiter |
| Token refresh | `auth-client.ts` auto-refresh при 401 |
| External anime IDs | `malId` хранится отдельно в `AnimeExternalIdMap`; основной ключ остается `shikimoriId` |
| Skip times | OP/ED интервалы берутся сервером из AniSkip и кэшируются в `AnimeEpisodeSkipTime` |
| Notifications | Доставка идёт сервером/worker, состояние каналов и ошибок хранится в Prisma |

## Edge Cases

- **Нет Kodik данных для shikimoriId:** anime page показывает Shikimori metadata, плеер недоступен
- **Несколько озвучек:** пользователь выбирает в `AnimeWatchPanel`, фильтр в site settings
- **Фон сайта:** если `backgroundImageUrl` не выбран (`html[data-site-bg]` ≠ `true`), у шапки/панелей с `site-header-bg` / `site-header-text` отключается `backdrop-filter` — стеклянный blur нужен только поверх обоев. Доступны только паттерн-фоны (`pattern:*`) — CSS-слои без image-blur; палитра слоёв и vignette подстраивается под `data-theme` (dark/light); параллакс мышь/наклон через `transform`, скролл через `background-position` (тайлы не обрываются). Старые фото-URL в настройках сбрасываются. Отключается при `reduceMotion`. Во время воспроизведения Kodik (`html[data-player-playing="true"]`) параллакс и CSS-blur фона скриншотов отключаются, companion замирает на кадре — иначе Chromium часто «замораживает» картинку iframe при живом звуке.
- **ТВ-навигация:** локальная настройка устройства включает/выключает управление фокусом стрелками по сайту; при выключенной настройке `data-tv-nav` не выставляется (в том числе при открытии окна настроек). При открытом модальном окне фокус и навигация стрелками остаются внутри него. При `html[data-tv-nav="true"]` (Android TV shell выставляет сразу) UI без CSS blur/backdrop-blur, companion скрыт, список focusable кэшируется. После недавнего движения мыши/аирмауса (`pointerType=mouse`) стрелки ~2.8 с листают страницу (`scrollTvPage`), а не фокус; в модалке и в режиме ввода поиска — обычный фокус. Поиск в шапке: в idle фокус на обёртке без IME, OK/Enter открывает поле; стрелки/Back/Escape выходят из режима ввода. Вверх с карточек ленты не прыгает в шапку, пока страница не у верха; Back из контента сначала фокусирует шапку. Открытие настроек сайта переносит TV-фокус в диалог; Back сначала закрывает модалку (нативный Back в Android-оболочке спрашивает `window.__taAndroidBack` до `finish`). В плеере гибрид для пульта: ←/→ при фокусе на viewport = ±10 с, ↑ = полоса серий, ↓ = «Продолжить» или нижний Play, OK/Space = play/pause; на кнопках серий/панели D-pad ходит по фокусу. Автофокус на «Продолжить»/нижний Play — один раз при входе в fullscreen (не удерживает фокус). Back в fullscreen выходит из него. Кнопка «Смотреть» под постером открывает плеер в fullscreen.
- **Android APK:** страница `/app` и вкладка «Приложение» используют общий блок, который показывает версию из `/downloads/TrackAnime.json` и ведёт на `/downloads/TrackAnime.apk`; старый `/application` перенаправляется на `/app`. В описании Android явно: без рекламы + системные уведомления. Блоки Android и Windows идут в два столбца только когда ширина контейнера позволяет (≥ ~22rem на карточку, `auto-fit`/`minmax`); в узкой панели настроек — столбиком. Оба файла появляются при деплое с параметром `-ApkPath`. Приложение предлагает обновление только при большем `versionCode`: при старте (до поиска зеркала) — манифест с `track-anime.github.io/downloads/TrackAnime.json`; после загрузки страницы / resume — снова Pages, иначе манифест текущего зеркала; сверяет SHA-256 и передаёт установку системному Android. В Android WebView в меню профиля (шапка и нижняя навигация) показывается пункт «Настройки приложения» → `trackanime://settings`; вне оболочки в меню профиля — пункт «Приложение» → `/app`. Нативный диалог управляется D-pad (focus drawables + requestFocus). Старт оболочки: нативный оверлей «Проверка обновлений…» → поиск зеркала → proxy; при воспроизведении — keep-screen-on через JS-мост. Ссылка `taproxy://host:port` (или с логином/паролем) сохраняет ручной HTTP-proxy в приложении.
- **Промо приложений на сайте:** `AppPromoSettings` (админка `/admin/app-promo`, публично `/api/settings/app-promo`). Два независимых флага: `enabled` — мобильный канал (непрозрачный баннер под шапкой в Android-браузере после 2 визитов / ~4 с, dismiss 60 дней `ta:app-promo-dismiss-until` + намёк в уведомлениях); `desktopEnabled` — ПК (непрозрачный баннер под шапкой `DesktopAppPromoPrompt`, dismiss `ta:app-promo-desktop-dismiss-until` + кнопка «Скачать приложение» перед поиском в шапке `md+` → `/app`). Высота баннера в `--site-app-promo-banner-height`. PWA-установка — карточка «Ярлык в браузере» на `/app` и во вкладке «Приложение», не в шапке. Не показывается в native shell / PWA / на `/app` и `/admin`. Страница `/app` и пункт профиля не зависят от флагов.
- **Windows exe:** тот же `/app` блок показывает загрузку `/downloads/TrackAnimeWindows.exe` и манифест `/downloads/TrackAnimeWindows.json` (сборка `npm run windows:publish`). Оболочка WPF+WebView2: зеркала, HTTP-прокси, adblock, sync `ta.session`, `trackanime://settings` / `taproxy://`, UA `TrackAnimeWindows/1`, bridge keep-screen-on/яркость. Подробности: `docs/WINDOWS.md`.
- **Companion Aqua Coder:** включён по умолчанию (`companionEnabled`); масштаб `companionScale` (0.5–2×, база отображения ½ кадра 192×208); опция `companionStaticAnimations` — только первый кадр позы без покадровой анимации; на desktop (`md+`) в правом нижнем углу; на мобильных скрыт; `companionEnabled`, `companionScale`, `companionStaticAnimations`, а также `reduceMotion`, `reduceAvatarDecorationMotion` и `playerLargeUi` — не синхронизируются с аккаунтом (как `tvNavigationEnabled`); на `*.track-anime.win` дублируются в cookie `ta.localSettings`; старт — `appear`, затем ситуация вкладки; переход страницы — `jumpRopeLoading` (минимум ~1 с и коротко после смены pathname, пока RSC/контент оседает), затем ситуация (`sitting` на `/anime`, `calendar`/`history`/`favorites`/`searching`/`idle`); смена позы ждёт окончания текущего цикла анимации (последний запрос в очереди); in-app тосты о новых сериях — облачко над аватаром с обложкой (если companion включён и виден на desktop), иначе обычный тост справа сверху; при входе (раз в московский день) — дайджест «день время / сегодня выйдет N аниме» по пересечению истории с календарём онгоингов на сегодня (если N=0 — только день недели и время); у админов в меню отладки companion — «Тест облачка» / «Тест сегодня» / «Тест сегодня (0)»; play/pause плеера — `sittingPlay`/`sittingPause`; открытие всплывающей карточки — `work`, закрытие — ситуация вкладки; меню отладки только у админов
- **Украшения аватарок:** настраиваются только авторизованными пользователями; гостям блок выбора в site settings скрыт
- **OAuth redirect mismatch:** `AUTH_URL` и `SHIKIMORI_REDIRECT_URI` должны совпадать с Shikimori app settings
- **Import interrupted:** resume через `npm run kodik:import:resume`
- **Empty feed after deploy:** нужен initial import (`kodik:import`) + sync (`kodik:sync`)
- **WebDAV-бекап БД:** админка `/admin/db` — настройки `DbBackupSettings` (URL/логин/пароль WebDAV, папка, лимит размера файла, вкл/выкл таблиц с размерами). Каждый запуск создаёт подпапку `YYYY-MM-DD_HH-mm-ss` и заливает чанки `Таблица.partNNN.jsonl.gz` + `manifest.json`. Автобекап и очередь — через cron `kodik:sync:scheduled`; CLI: `npm run db:backup:webdav`. Это не `pg_dump` и не полный restore-скрипт — снимок выбранных таблиц в JSONL.
