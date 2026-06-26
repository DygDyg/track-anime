import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({ include: { account: true } });
  if (!user?.account) process.exit(0);

  const r = await fetch(
    `https://shikimori.one/api/v2/user_rates?user_id=${user.shikimoriId}&target_type=Anime&limit=10`,
    {
      headers: {
        "User-Agent": "TrackAnime",
        Accept: "application/json",
        Authorization: `Bearer ${user.account.accessToken}`,
      },
    },
  );
  console.log("rates status", r.status);
  const data = await r.json();
  console.log("count", Array.isArray(data) ? data.length : data);
  console.log(JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data, null, 2));
} finally {
  await prisma.$disconnect();
}
