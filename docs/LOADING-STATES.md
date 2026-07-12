# Состояния загрузки — план и чеклист

Цель: после клика по кнопке пользователь сразу видит обратную связь (disabled, спиннер или текст «Сохранение…», `aria-busy`, `cursor-wait`).

Эталон: `AdminActionButton`, кнопка «Продолжить» в `AnimeWatchPanel`, `AsyncButton` + `LoadingSpinner`.

**Статус:** завершено  
**Последнее обновление:** 2026-06-30

---

## Definition of Done (для каждой кнопки)

- [x] `disabled` на время запроса
- [x] Спиннер или смена текста
- [x] `aria-busy={loading}` — где применён `AsyncButton` или вручную
- [x] `cursor-wait` при loading
- [x] Повторный клик заблокирован
- [x] `finally` снимает loading

---

## Фаза 0 — общий примитив

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 0.1 | `LoadingSpinner` + `AsyncButton` | `src/components/ui/LoadingSpinner.tsx`, `src/components/ui/AsyncButton.tsx` | ✅ |

---

## Фаза 1 — авторизация

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 1.1 | Вход — loading на кнопках | `login/page.tsx`, `HeaderAuth.tsx`, `ReleaseCardQuickActions.tsx`, `ProfileFriendButton.tsx`, `BottomNavProfileFab.tsx`, `AuthProvider.tsx` | ✅ |
| 1.2 | Выход — «Выйти…» | `HeaderAuth.tsx`, `BottomNavProfileFab.tsx`, `AuthProvider.tsx` | ✅ |
| 1.3 | Reconnect Shikimori | UI с `reconnectShikimori` | ⏭ нет UI (только API в `AuthProvider`) |

---

## Фаза 2 — списки и карточки

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 2.1 | Quick actions на карточке | `ReleaseCardQuickActions.tsx` | ✅ |
| 2.2 | Hover-панель — загрузка трейлера | `ReleaseCardHoverPanel.tsx` | ✅ спиннер при `trailerFetching` |
| 2.3 | Pending в провайдере | `UserListStatusProvider.tsx` | ✅ `isUpdating(shikimoriId)` |
| 2.4 | Счётчик пересмотров | `FavoriteRewatchBadge.tsx` | ✅ |

**Уже было:** `AnimeListActions`, `AnimeRewatchAction`.

---

## Фаза 3 — навигация и поиск

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 3.1 | Формы поиска | `QuickSearchForm.tsx`, `AdvancedSearchForm.tsx`, `HeaderSearch.tsx` | ✅ |
| 3.2 | Кнопка «Назад» | `AnimePageBackButton.tsx` | ✅ |
| 3.3 | Табы календаря | `CalendarView.tsx` | ✅ (`useTransition` + `favorites-tab-panel-pending`) |
| 3.4 | NavLink + NavigationProgress | `NavLink.tsx`, `HeaderAuth.tsx`, `BottomNavProfileFab.tsx`, `user/page.tsx`, `AnimeStudioLogos.tsx` | ✅ ключевые меню и ссылки |
| 3.5 | `loading.tsx` для тяжёлых страниц | `search/`, `favorites/`, `history/`, `profile/` (+ `calendar/`, `anime/[id]/`) | ✅ |

---

## Фаза 4 — страница аниме и плеер

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 4.1 | Смена озвучки / серии | `AnimeWatchPanel.tsx` | ✅ `continueLoading`, disabled кнопки озвучки, «загрузка плеера…» |
| 4.2 | Share-кнопки | `AnimeShareButtons.tsx` | ✅ спиннер при копировании |
| 4.3 | Галерея / логотипы | `AnimeScreenshotGallery.tsx`, `AnimeStudioLogos.tsx` | ✅ спиннер до `onLoad` |

**Уже было:** «Продолжить» со спиннером.

---

## Фаза 5 — история, избранное, профиль

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 5.1 | Удаление из истории | `HistoryView.tsx` | ✅ |
| 5.2 | Sync избранного — спиннер | `FavoritesView.tsx` | ✅ |
| 5.3 | Друзья | `ProfileFriendsSection.tsx`, `ProfileFriendButton.tsx` | ✅ |
| 5.4 | Поиск пользователей | `UsersSearchForm.tsx`, `app/user/page.tsx` | ✅ `AsyncButton` + `NavLink` в результатах |

---

## Фаза 6 — настройки

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 6.1 | Сохранение site settings | `SiteSettingsProvider.tsx`, `SiteSettingsModal.tsx` | ✅ «Сохраняем…» в футере |
| 6.2 | OptionButton в модалке | `SiteSettingsModal.tsx` | ✅ `disabled={settingsBusy}` на всех опциях |
| 6.3 | Уведомления — кнопки привязки | `NotificationsSettingsTab.tsx` | ✅ Telegram/VK/Discord link/unlink |
| 6.4 | Discord RPC | `DiscordRpcSettingsTab.tsx`, `HeaderDiscordRpcButton.tsx` | ✅ «Проверка…» / спиннер в шапке |
| 6.5 | Плеер в настройках | `PlayerSettingsTab.tsx` | ✅ «Сохраняем настройки…» при `remoteSaving` |

---

## Фаза 7 — PWA и прочее

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 7.1 | Установка PWA | `HeaderPwaInstallButton.tsx`, `usePwaInstall.ts` | ✅ |
| 7.2 | Discord RPC в шапке | `HeaderDiscordRpcButton.tsx` | ✅ |

---

## Фаза 8 — админка

| # | Задача | Файлы | Статус |
|---|--------|-------|--------|
| 8.1 | Todo — patch/delete | `AdminTodoPanel.tsx` | ✅ `busyId` |
| 8.2 | Shikimori host | `ShikimoriSettingsPanel.tsx` | ✅ «Сохранение…» |
| 8.3 | Sync / Cover cache | `SyncSettingsPanel.tsx`, `CoverCacheSettingsPanel.tsx` | ✅ «Сохранение…» в заголовке |
| 8.4 | Intro offsets | `TranslationIntroOffsetsPanel.tsx` | ✅ save/apply + «Обновление…» |
| 8.5 | Import progress | `ImportProgressPanel.tsx` | ✅ было |
| 8.6 | Унификация админ-кнопок | `admin/*Panel.tsx` | ✅ единый паттерн `saving` / `busyId` / `AdminActionButton` |

**Уже было:** `AdminActionButton`, `AdminDbExplorer`, `AdminUsersTable`, `NotificationSettingsPanel`.

---

## Уже было до задачи

- `NavigationProgress` + `AnimeLink`, часть `Header`, `PwaBottomNav`
- `AnimeListActions`, `AnimeRewatchAction`
- `AnimeWatchPanel` — «Продолжить»
- `ReleaseFeed`, `SearchResultsInfiniteGrid`, `HeaderSearch` (скелетоны)
- `FavoritesView` — `useTransition`, фоновый sync
- `AdminActionButton`, `AdminDbExplorer`, `AdminUsersTable`, `NotificationSettingsPanel`

---

## Журнал

| Дата | Что сделано |
|------|-------------|
| 2026-06-30 | Создан файл плана |
| 2026-06-30 | Фаза 0: `LoadingSpinner`, `AsyncButton` |
| 2026-06-30 | Фаза 1: `authNavigating` / `loggingOut` в `AuthProvider`, кнопки входа/выхода |
| 2026-06-30 | Фаза 2: `ReleaseCardQuickActions`, `FavoriteRewatchBadge`, `isUpdating` в провайдере |
| 2026-06-30 | Фаза 3: поиск, `AnimePageBackButton`, `CalendarView`, `NavLink`, `loading.tsx` |
| 2026-06-30 | Фаза 4–5: share/gallery/studio, history/favorites/profile/users |
| 2026-06-30 | Фаза 6–8: настройки, PWA, Discord RPC, админ-панели |
| 2026-06-30 | Финал: `NavLink` типы (`ComponentProps<typeof Link>`), accent `settingsBusy`, `BottomNavProfileFab` → `NavLink`, чеклист закрыт |

---

## Вне scope (намеренно)

- Полная замена всех `Link` на `NavLink` по всему приложению — `AnimeLink` и `Header` уже имеют свой прогресс
- UI для `reconnectShikimori` — нет экрана/кнопки в продукте
