import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getWatchHistory } from "../src/lib/watch-history";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { shikimoriId: 1393072 } });
  if (!user) throw new Error("no user");

  const before = await prisma.userWatchProgress.findFirst({
    where: { userId: user.id, shikimoriId: 61831 },
  });
  console.log("before:", before?.episodeNumber, before?.positionSeconds);

  const items = await getWatchHistory(user.id);
  const after = await prisma.userWatchProgress.findFirst({
    where: { userId: user.id, shikimoriId: 61831 },
  });

  console.log("in list:", items.some((i) => i.shikimoriId === 61831));
  console.log("still in db:", !!after);
}

main().finally(() => prisma.$disconnect());
