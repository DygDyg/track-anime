import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({ include: { account: true } });
  const headers = {
    "User-Agent": "TrackAnime",
    Accept: "application/json",
    Authorization: `Bearer ${user.account.accessToken}`,
  };

  for (const page of [1, 2, 3]) {
    const r = await fetch(
      `https://shikimori.one/api/v2/user_rates?user_id=${user.shikimoriId}&target_type=Anime&limit=1000&page=${page}`,
      { headers },
    );
    const data = await r.json();
    console.log("page", page, "status", r.status, "len", Array.isArray(data) ? data.length : data);
    await new Promise((x) => setTimeout(x, 500));
  }
} finally {
  await prisma.$disconnect();
}
