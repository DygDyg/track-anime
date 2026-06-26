import { authConfig } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";

export async function saveOAuthState(state: string, redirectUri: string): Promise<void> {
  const expiresAt = new Date(Date.now() + authConfig.oauthStateMaxAgeSec * 1000);

  await prisma.oAuthState.upsert({
    where: { state },
    create: { state, redirectUri, expiresAt },
    update: { redirectUri, expiresAt },
  });

  // Best-effort cleanup of expired rows
  await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => undefined);
}

export async function consumeOAuthState(
  state: string,
): Promise<{ redirectUri: string } | null> {
  const row = await prisma.oAuthState.findUnique({ where: { state } });
  if (!row || row.expiresAt <= new Date()) {
    if (row) {
      await prisma.oAuthState.delete({ where: { state } }).catch(() => undefined);
    }
    return null;
  }

  await prisma.oAuthState.delete({ where: { state } }).catch(() => undefined);
  return { redirectUri: row.redirectUri };
}
