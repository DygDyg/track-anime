import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({ include: { account: true } });
  if (!user) {
    console.log("no user");
    process.exit(0);
  }

  console.log("user", { shikimoriId: user.shikimoriId, nickname: user.nickname });

  const headers = { "User-Agent": "TrackAnime", Accept: "application/json" };

  const pub = await fetch(`https://shikimori.one/api/users/${user.shikimoriId}/favourites`, {
    headers,
  });
  console.log("public status", pub.status);
  console.log("public body", (await pub.text()).slice(0, 500));

  if (user.account) {
    const auth = await fetch(`https://shikimori.one/api/users/${user.shikimoriId}/favourites`, {
      headers: { ...headers, Authorization: `Bearer ${user.account.accessToken}` },
    });
    console.log("auth status", auth.status);
    console.log("auth body", (await auth.text()).slice(0, 500));
  }
} finally {
  await prisma.$disconnect();
}
