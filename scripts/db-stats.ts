import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const [materials, loaded, pending, episodes, releases, job] = await Promise.all([
  prisma.kodikMaterial.count(),
  prisma.kodikMaterial.count({ where: { episodesLoaded: true } }),
  prisma.kodikMaterial.count({ where: { episodesLoaded: false } }),
  prisma.kodikEpisode.count(),
  prisma.kodikEpisodeRelease.count(),
  prisma.kodikImportJob.findUnique({ where: { id: "full" } }),
]);

console.log({
  materials,
  episodesLoadedTrue: loaded,
  episodesLoadedFalse: pending,
  episodes,
  releases,
  job,
});

await prisma.$disconnect();
