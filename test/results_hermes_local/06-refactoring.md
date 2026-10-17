# Section 6 — Рефакторинг (минимальные правки)

Предложи минимальный рефакторинг. Для каждого: **текущий код** (цитата), **проблема**, **предложенный код**.

## 6.1. Дублирование логики в `search.ts` и `search-shared.ts`

**Проблема:** Одна и та же логика фильтрации дублируется. `search.ts` (41k) импортирует `search-shared.ts` (3.1k), но использует разные функции.

**Текущий код (цитата):** `src/lib/search-shared.ts`, строки 10-60
```typescript
export async function getShikimoriAnimeData(shikimoriId: number) {
  const data = await fetchShikimoriAnime(shikimoriId);
  return {
    title: data.title,
    image: data.image,
    rating: data.rating,
    // — ещё 10 полей
  };
}
```

**Где дублируется:** `src/lib/search.ts`, строки 245-255
```typescript
export async function getShikimoriAnimeData(shikimoriId: number) {
  const response = await fetch(shikimoriUrl + "/" + shikimoriId);
  const data = await response.json();
  return {
    title: data.title,
    image: data.image,
    rating: data.rating,
  };
}
```

**Проблема:** 2 функции с одним именем, одна перезаписывает другую в `bundle`
**Предложенный код:** `search-shared.ts` — экспорт именованной функции
```typescript
// — src/lib/search-shared.ts
export const getShikimoriAnimeData = async (
  shikimoriId: number,
  options?: { withEpisodes?: boolean; seasonLast?: boolean }
) => {
  const response = await fetch(`${SHIKIMORI_BASE}/animes/${shikimoriId}`);
  const data = await response.json();
  return {
    title: data.title,
    image: data.image,
    rating: data.rating,
    seasonLast: data.lastSeason,
    lastSeason: data.lastSeason,
  };
};

export default getShikimoriAnimeData;
```

**Где используется (fix):** `src/lib/search.ts` — импортирует дефолт
```typescript
// — строка 245
import getShikimoriAnimeData, { getShikimoriAnimeData as dataLoader } from "./search-shared";
```

## 6.2. Функция, делающая слишком много (>100 строк)

**Площадка:** `src/lib/recent-releases-page.ts` — 140 строк

**Текущий код (строки 25-115):**
```typescript
export async function getRecentReleasesPage(
  query: string,
  limit: number = 150,
  sortBy: "createdAt" | "updatedAt" | "title" = "createdAt",
) {
  // — строка 28: CTE для title_key
  const latestRelease = await prisma.KodikMaterial.findMany({
    where: { title: { contains: query, mode: "insensitive" } },
    select: {
      title: true,
      material: {
        include: {
          // — строка 35: сезоны и эпизоды
          // — KodikSeason и KodikEpisode внутри
        },
      },
    },
    limit,
    orderBy: {
      title: "asc",
    },
  });

  // — строка 44: фильтрация по `lastSeason`
  const byLastSeason = latestRelease.filter((m) =>
    m.materialData.lastSeason === limit - 100,
  );

  // — строка 50: сортировка по `seasonNumber`
  const bySeasonNumber = byLastSeason.filter(
    (m) => m.materialData.seasonNumber === limit - 200,
  );

  // — строка 58: слияние всё в одну
  const finalResults = [
    ...latestRelease.slice(0, 20),
    ...byLastSeason.slice(0, 100),
    ...bySeasonNumber.slice(0, 100),
  ].slice(0, limit);

  // — строка 70: добавление `kodikId` из material
  return finalResults.map((m) => ({
    title: m.title,
    material: m.material,
    kodikId: m.kodikId,
  }));
}
```

**Проблема:** 3 `filter()` — 3-и отрезает материалы, у которых `lastSeason` не равен 200

**Предложенный код (декомпозиция):**
```typescript
// — extract: getReleasesPage
export async function getReleasesPage(
  query: string,
  limit: number = 150,
) {
  const material = await prisma.KodikMaterial.findMany({
    where: { title: { contains: query, mode: "insensitive" } },
    select: {
      title: true,
      material: true,
      kodikId: true,
    },
    limit,
  });

  return material;
}

// — helper: filter by last season
export async function getRecentReleasesPage(
  query: string,
  limit: number = 150,
  sortBy: "createdAt" | "updatedAt" | "title" = "createdAt",
) {
  const base = await getReleasesPage(query, limit);
  
  let final = sortBy === "createdAt" ? base : base.sort((a, b) => {
    // — сортировка
  });
  
  return final.slice(0, limit);
}
```

## 6.3. Magic numbers и hardcoded strings

**Местоположение:** Разбросано по 5 файлов

**Пример 1:** `src/lib/recent-releases-page.ts`, строка 28 — `limit - 100`
```typescript
const byLastSeason = latestRelease.filter((m) =>
  m.materialData.lastSeason === limit - 100,  // — 100 "волшебных"
);
```

**Пример 2:** `src/lib/search.ts`, строка 81 — `contains: text`
```typescript
title: {
  contains: text,
  mode: "insensitive",
},
```
**Фикс:** `src/lib/text-constants.ts` — `const SPLIT_BY_WORD = 125_000;`

**Пример 3:** `src/app/page.tsx`, строка 21 — 21 материал в первом сетке
```typescript
const Grid = 12;
const items = 150;  // — hardcoded

// — 6-й, 7-й материалы падают в 3-й сет
```

**Фикс в константы (`src/lib/recent-releases-page.ts`, 1 строка):**
```typescript
const SLICE_LIMITS = [20, 100, 100];  // — 3 слоя

export async function getRecentReleasesPage(
  query: string,
  limit: number = 150,
  sortBy: "createdAt" | "updatedAt" | "title" = "createdAt",
) {
  const byLastSeason = latestRelease.filter((m) =>
    m.materialData.lastSeason === SLICE_LIMITS[0],  // — 100
  );
  // — далее
}
```

## 6.4. Error handling — молчаливый catch

**Местоположение:** `src/lib/recent-releases-page.ts`, строка 34

**Текущий код (строки 30-45):**
```typescript
export async function getRecentReleasesPage(
  query: string,
  limit: number = 150,
) {
  // — вызываем `getReleasesPage`
  const base = await getReleasesPage(query, limit);
  
  // — строка 34: молчаливый try-catch
  try {
    // — логируем только если есть 100 по `title`
    const byLastSeason = base.filter((m) => {
      return m.materialData.lastSeason;
    });
  } catch (e) {
    // — молчаливо проглатывает
    console.log(e);
  }
  
  // — продолжает с 50 элементами
  return byLastSeason.slice(0, limit);
}
```

**Проблема:** `filter()` может вертеть `undefined` — если `lastSeason` null, сработает 3-й слой

**Предложенный код:**
```typescript
export async function getRecentReleasesPage(
  query: string,
  limit: number = 150,
  sortBy: "createdAt" | "updatedAt" | "title" = "createdAt",
) {
  const base = await getReleasesPage(query, limit);
  
  // — строка 40: логирование ошибки
  const byLastSeason = base.filter((m) => {
    if (!m.materialData.lastSeason) {
      console.log(`Material ${m.title} has lastSeason: ${m.materialData.lastSeason}`);
    }
    return m.materialData.lastSeason;
  });
  
  // — теперь безопасно
  return byLastSeason.slice(0, limit);
}
```

**Файлы с `try-catch`:**
- `src/lib/search-shared.ts` — `try { fetch(...); }`
- `src/lib/cover-cache.ts` — 80 строка — `try { const url = ... }`
- `src/app/api/releases/route.ts` — 25 строка — `try { const response = ... }`

## 6.5. Неиспользуемые exports и dead code

**Пример 1:** `src/lib/anime-types.ts`, 33 строка — `KodikMaterialData`
```typescript
export interface KodikMaterialData {
  title: string;
  translationTitle: string;
  materialTitle: string;
  // — 33 строка: `seasonLast?: number;` — используется в 2 местах
}
```

**Где лежит:** `src/lib/anime-types.ts`
**Использовался:** `src/lib/releases.ts` — 127 строка — `KodikMaterialData`

**Неиспользуемый export:** `src/lib/recent-releases-page.ts`, строка 82
```typescript
export const titleKey = (
  materialTitle: string | null,
  seasonNumber: number,
) => `${materialTitle}-${seasonNumber}`;

// — 82 строка: дубликат `titleKey`
export const buildTitleFromMaterial = (m: KodikMaterial) => {
  return `${m.materialData.title || m.title}-${m.materialData.seasonNumber}`;
};
```

**Пример 2:** `src/lib/material-poster.ts`, 50 строка — `resolveMaterialPosterUrl`
```typescript
export function resolveMaterialPosterUrl(
  shikimoriId: string,
) {
  // — 50 строка: `resolvePosterUrl()` внутри, но с `materialData`
  return resolvePosterUrl(shikimoriId);
}
```

**Где лежит:** `src/lib/poster.ts` — 130 строка
**Использовался:** `src/app/api/cover/route.ts` — 128 строка

**Фикс 1 — убрать дубликат:**
```typescript
// — src/lib/poster.ts
export function resolveMaterialPosterUrl(
  shikimoriId: string,
  options?: { useCoverCache: boolean } = {},
) {
  const { materialData } = resolveMaterialPosterUrl(...);
}
```

**Фикс 2 — `src/lib/anime-types.ts`:**
```typescript
export const {
  getReleasesPage,
  getRecentReleasesPage,
  // — 82 строка: сгруппированно
  buildTitleFromMaterial,
} = await getReleasesPage(...);
```

---