import { prisma } from "@/lib/prisma";
import { normalizeSiteSettings, type SiteSettings } from "@/lib/site-settings";

export async function getUserSiteSettings(userId: string): Promise<SiteSettings | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { siteSettings: true },
  });

  if (!user?.siteSettings) return null;
  return normalizeSiteSettings(user.siteSettings);
}

export async function saveUserSiteSettings(
  userId: string,
  raw: unknown,
): Promise<SiteSettings> {
  const settings = normalizeSiteSettings(raw);

  await prisma.user.update({
    where: { id: userId },
    data: { siteSettings: settings },
  });

  return settings;
}
