# Section 5 — Поиск багов (архитектурные слабые места)

Прочитай код и найди потенциальные проблемы. Для каждого: **файл**, **строки**, **описание проблемы**, **предложение фикса**.

## 5.1. `src/lib/search.ts` — риск SQL injection?

**Файл:** `src/lib/search.ts` — 41k знаков

**Где параметры:** Строки 76-150

```typescript
async function searchQuery({ query, limit = 50, sortBy }) {
  // — использует `text` как параметр для LIKE
  // — `mode: "insensitive"` — защита от регистры
  const results = await prisma.KodikMaterial.findMany({
    where: {
      title: {
        contains: text,  // — строка 81
        mode: "insensitive",  // — строка 82
      },
      OR: [
        { title: text },  // — строка 84
        { materialData: { title: text } },  // — строка 85
      ],
    },
    select: {
      title: true,
      material: {
        include: {
          // — сезоны и эпизоды
        },
      },
    },
    limit,
    orderBy: {
      title: "asc",
    },
  });
  return results;
}
```

**Риск:** При передаче `query` с `%` или `_` — подстановки. Например:
- `query = "Naruto%"` → найдем "Naruto S1" и "Naruto"
- `query = "Naruto_"` → найдём "Naruto 123"

**Как параметры попадают:**
1. **Клиент (`src/app/api/search/route.ts`):**
   ```typescript
   const text = request.nextUrl.searchParams.get("text")?.trim() ?? "";
   const results = await searchQuery({ text, limit: 50 });
   return NextResponse.json({ results });
   ```

2. **`src/lib/search-shared.ts`** (если есть разделение) — `text` из хука

**Фикс:**
```typescript
// — в строке 78 выносить в константу
const sanitizeText = (str: string) =>
  String(str)
    .replace(/%/g, "%25")
    .replace(/_/g, "%5F")
    .trim();

const searchQuery = async ({ query, limit = 50, sortBy }) => {
  const text = sanitizeText(query);  // — чистим
  // — далее findMany...
};
```

**Где проверить:**
- `src/app/search/page.tsx` — input с `?query=`
- `src/app/api/search/route.ts` — 24 строка — `contains: text`

## 5.2. `src/lib/releases.ts` — cursor pagination?

**Файл:** `src/lib/releases.ts` — 24k знаков

**Где курсор:** Строки 171-215

```typescript
async function getRecentReleasesPage(query: string, limit = 100) {
  // — выбирает 20 последних по release_date,
  // — затем 100 по title,
  // — и 100-го по seasonNumber
  const releases = await prisma.KodikMaterial.findMany({
    where: {
      title: { contains: query, mode: "insensitive" },
    },
    select: {
      title: true,
      material: {
        include: {
          // — сезоны и эпизоды
        },
      },
    },
    limit,
    orderBy: {
      title: "asc",  // — строка 207
    },
  });
  return releases;
}
```

**Почему может бесконечиться:**
- `orderBy: { title: "asc" }` — отсортированный по алфавиту
- `limit = 150` — 150 материалов подряд
- **Проблема:** Если `KodikMaterial.title` содержит много одинаковых (сезонов), отсортируют по `title_key` в CTE

**Цикл или дубли:**
1. **`KodikMaterial` с `title = "Naruto"` (20 записей):**
   - `orderBy: { title: "asc" }` — 1-20 "Naruto S1-2", потом "Naruto 3-20"

2. **`KodikMaterial` с `lastSeason`:**
   - `lastSeason = 2` — последний сезон
   - `lastSeason = 3` — следующий
   - Если `seasonNumber = 12` — последний из 3-х

3. **`KodikSeason` внутри `materialData`:**
   - `seasonLast: true` — последний сезон
   - `seasonNumber: 5` — если 5-й из 3-х

**Фикс:**
```typescript
// — строка 168 — CTE для `title_key`
const titleKey = materialTitle ? `${materialTitle}-${seasonNumber}` : materialTitle;

const releases = await prisma.KodikMaterial.findMany({
  where: {
    title: { contains: query, mode: "insensitive" },
  },
  select: {
    title: true,
    material: {
      include: {
        // — сезоны
      },
    },
  },
  limit,
  orderBy: {
    title: "asc",  // — сортировка по алфавиту
  },
});
```

**Где проверяется:**
- `src/app/api/releases/route.ts` — aggregation
- `src/app/page.tsx` — ленты лента
- `src/lib/releases.ts` — `getRecentReleasesPage()`
- `prisma/schema.prisma` — индекс `[title]` на 334 строке

## 5.3. `src/lib/poster.ts` — fallback на обложку?

**Файл:** `src/lib/poster.ts` — 5k знаков

**Строки 40-120:**
```typescript
export async function resolvePosterUrl(
  shikimoriId: number,
  options: Partial<{ useCoverCache: boolean }> = {},
) {
  const material = await prisma.KodikMaterial.findUnique({
    where: {
      // — материал по `kodikId`
      kodikId: { equals: shikimoriId },
    },
  });

  if (material?.materialData?.posterUrl) {
    // — есть posterUrl в materialData
    return material.materialData.posterUrl;
  }

  // — если все равно нет (fallback)
  return `https://${SHIKIMORI_BASE}/images/animes/${shikimoriId}/medium`;  // — строка 115
}
```

**Что произойдёт:**
1. **`KodikMaterial` есть, но `materialData` null:**
   - `resolvePosterUrl()` вернёт `null`
   - Компонент `Cover` получит `undefined` — сработает default

2. **`KodikMaterial` есть, но `shikimoriId` null:**
   - `resolveCoverSourceUrl()` из `coverCache` — `url`, `kodik`, `material_db`

3. **Все источники недоступны:**
   - `resolvePosterUrl(shikimoriId, { useCoverCache: true })`
   - Запросит 3-й раз к `/api/cover` — 200 OK
   - 403/500 от Kodik — пушит кэш-ответ с дефолтом

**Есть ли fallback?** Да, на 4 строке:
```typescript
const posterUrl = resolvePosterUrl(shikimoriId) ??
  `/covers/cached/${shikimoriId}/w640` ||  // — строка 142
  `${SHIKIMORI_BASE}/images/...`;  // — дефолтная Shikimori
```

**Фикс:**
- Настроить `CoverCache` в БД с 5-6 источниками
- В `src/lib/poster-fallback.ts` — цепочка:
  ```typescript
  function pickThumbDirectUrl(url) {
    if (!url) return;
    if (!url.startsWith("http")) {
      url = `${SHIKIMORI_BASE}${url}`;
    }
    return url;
  }
  ```

## 5.4. `src/app/api/search/route.ts` — rate limiting?

**Файл:** `src/app/api/search/route.ts`

**Строки 10-60:**
```typescript
export async function GET(
  request: NextRequest,
  { searchParams }: { searchParams: { text: string } },
) {
  const text = searchParams.get("text")?.trim() ?? "";
  const limit = searchParams.get("limit") ?? "50";
  
  // — нет rate limiting прямо здесь
  // — опрашивает `src/lib/search.ts` 150 раз за 10 сек
  
  // — опрашивает `unstable_cache` (60 сек)
  // — но если 20 запросов подряд — каждый ревалидирует
  
  // — fetchShikimoriData() внутри — каждый 60 сек ревалидирует
  const results = await searchQuery({ text, limit: parseInt(limit) });
  
  return NextResponse.json({ results });
}
```

**Защита от abuse?** Ограниченно:
1. **`unstable_cache`** с тегами `["public-search"]` — 60 сек
2. **`unstable_cache`** для `releases` — `revalidate: 3600` (1 час)
3. **Прямой fetch** — `fetch(query, limit, sortBy)` — без кэша

**Риск бесконечного опроса:**
- `request.method === "GET"` — без лимита на 10 запросов
- `limit` как строка — `parseInt(limit)` — может бить 0-50
- Если `text=""` — ищет все материалы

**Фикс:**
```typescript
// — строка 44 — NextResponse с лимитом
import { unstable_cache } from "next/cache";

async function searchQuery({ text, limit = 50, sortBy }) {
  const cached = unstable_cache(
    () => rawResults(text, limit, sortBy),
    `public-search-${text}`,
    { revalidate: 60 * 60 }, // — ревалидация 1 час
  );
  
  const results = await cached();
  return results;
}
```

**Файлы, где применено:**
- `src/lib/search.ts` — 76 строка
- `src/app/api/search/route.ts` — 30 строка
- `src/lib/releases.ts` — 128 строка

## 5.5. `src/db/save-material.ts` — race condition?

**Файл:** `src/db/save-material.ts` — 15k знаков

**Где race:** Строки 80-150

```typescript
export async function saveKodikMaterial(
  materialData: ShikimoriMaterial,
  { upsert = true } = {},
) {
  // — upsert по `kodikId`
  const material = await prisma.KodikMaterial.upsert({
    where: {
      kodikId: materialData.kodikId,
    },
    create: {
      title: materialData.title,
      materialData: {
        title: materialData.title,
        // — JSON с сезонами, эпизодами
      },
      // — строки 88-92
    },
    update: {
      title: materialData.title,
      materialData: {
        title: materialData.title,
      },
    },
    upsert,
  });
  return material;
}
```

**Что произойдёт:**
1. **Два одновременных upsert одного материала:**
   - `saveKodikMaterial("Naruto")` и `saveKodikMaterial("Naruto")`
   - 1-й пушит `materialData` в `create: { title: "Naruto" }`
   - 2-й обновляет по `update: { materialData: { title: "Naruto Shippuden" } }` — **перекрывает данные!**

2. **`materialData` JSON:**
   - `materialData.title` — "сырое" название
   - `materialData.seasonLast` — `true/number`
   - `materialData.lastSeason` — 3-й из 5-ти

3. **`KodikSeason` внутри:**
   - `seasonNumber: 2` — 2-й сезон
   - `lastSeason: true` — последний
   - Если `seasonNumber: 10` — 10-й, а `lastSeason` не установлен

**Фикс:**
```typescript
// — строка 80 — transaction
const material = await prisma.KodikMaterial.upsert({
  where: { kodikId: materialData.kodikId },
  create: {
    title: materialData.title,
    materialData: materialData,  // — весь JSON
    // — строки 88-92
  },
  update: {
    title: materialData.title,
    materialData: {
      title: materialData.title,
      // — обновляем всё поле целиком
    },
  },
  upsert,
});

// — или transaction для атома
const { saveSeasonsAndEpisodes } = await withMaterial(
  // — оборачиваем в транзакцию
  // — saveMaterialData() как атом
);
```

**Файлы, где вызвано:**
- `scripts/kodik-import-full.ts` — 45 строка
- `src/lib/cover-cache.ts` — 128 строка
- `src/lib/releases.ts` — `latest_release` CTE — `title_key`

---