import { prisma } from "@/lib/prisma";
import { sendDiscordWelcomeMessage } from "@/lib/notifications/discord-oauth";

export async function verifyDiscordNotificationDm(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = await prisma.userNotificationLink.findUnique({
    where: { userId },
    select: { discordUserId: true },
  });

  if (!link?.discordUserId) {
    return { ok: false, error: "Discord не привязан" };
  }

  const result = await sendDiscordWelcomeMessage(link.discordUserId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await prisma.userNotificationLink.update({
    where: { userId },
    data: { discordDmVerified: true },
  });

  await prisma.userNotificationPreferences.upsert({
    where: { userId },
    create: { userId, discordEnabled: true },
    update: { discordEnabled: true },
  });

  return { ok: true };
}

export async function markDiscordDmVerified(userId: string, verified: boolean): Promise<void> {
  await prisma.userNotificationLink.updateMany({
    where: { userId },
    data: { discordDmVerified: verified },
  });
}
