import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Simulate GET handler
const user = await prisma.user.findFirst({ select: { id: true } });
if (!user) {
  console.log("NO_USER");
  process.exit(1);
}

const { getUserNotificationPreferences } = await import("../src/lib/notifications/preferences.ts");

// Run 5 parallel like Promise.all internals
const results = await Promise.allSettled(
  Array.from({ length: 5 }, () => getUserNotificationPreferences(user.id)),
);

for (const [i, r] of results.entries()) {
  if (r.status === "fulfilled") console.log(`run ${i}: OK`);
  else console.log(`run ${i}: FAIL`, r.reason);
}

await prisma.$disconnect();
