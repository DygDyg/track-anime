// Оптимизированный импорт серий
export async function runKodikEpisodesImport() {
  // Оптимизированная версия импорта серий с уменьшением нагрузки на сервер и увеличением скорости обработки
  
  const batchCount = 50;
  let processed = 0;
  let skipped = 0;
  let newEpisodes = 0;
  let pending = await countPendingEpisodes();
  
  while (pending > 0) {
    // Получаем список материалов без серий
    const materials = await prisma.kodikMaterial.findMany({
      where: { episodesLoaded: false },
      select: { id: true, kodikId: true },
      take: batchCount,
    });
    
    if (materials.length === 0) break;
    
    // Импортируем серии для каждого материала
    for (const material of materials) {
      try {
        const result = await saveKodikMaterial(prisma, { id: material.kodikId }, {
          loadEpisodes: true,
          trackReleases: false,
        });
        
        if (result.episodesAdded > 0) {
          newEpisodes += result.episodesAdded;
        }
        
        processed++;
      } catch (error) {
        skipped++;
        console.error(`Ошибка импорта для ${material.id}:`, error);
      }
    }
    
    pending = await countPendingEpisodes();
    if (pending > 0) {
      // Пауза между батчами для уменьшения нагрузки
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return {
    processed,
    skipped,
    newEpisodes,
    pending: await countPendingEpisodes(),
    status: "done",
    lastError: null,
  };
}

// Дополнительная функция для подсчёта материалов без серий
async function countPendingEpisodes() {
  return prisma.kodikMaterial.count({ where: { episodesLoaded: false } });
}