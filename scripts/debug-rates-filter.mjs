import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({ include: { account: true } });
  if (!user?.account) {
    console.log("no user");
    process.exit(0);
  }

  const headers = {
    "User-Agent": "TrackAnime",
    Accept: "application/json",
    Authorization: `Bearer ${user.account.accessToken}`,
  };

  const tests = [
    `/v2/user_rates?target_type=Anime&status=watching&limit=1000&page=1`,
    `/v2/user_rates?user_id=${user.shikimoriId}&target_type=Anime&status=watching&limit=1000&page=1`,
    `/v2/user_rates?user_id=${user.shikimoriId}&target_type=Anime&limit=1000&page=1`,
    `/v2/user_rates?user_id=${user.shikimoriId}&target_type=Anime&limit=100&page=1`,
    `/users/${user.shikimoriId}`,
  ];

  for (const path of tests) {
    const r = await fetch(`https://shikimori.one/api${path}`, { headers });
    const text = await r.text();
    let summary;
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const statuses = [...new Set(data.map((item) => item.status))];
        summary = `array len=${data.length} statuses=${statuses.join(",")}`;
      } else if (data.stats?.statuses?.anime) {
        summary = `anime stats=${JSON.stringify(data.stats.statuses.anime)}`;
      } else {
        summary = text.slice(0, 120);
      }
    } catch {
      summary = text.slice(0, 120);
    }
    console.log(r.status, path.split("?")[0], summary);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
} finally {
  await prisma.$disconnect();
}
