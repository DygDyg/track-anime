import { prisma } from "@/lib/prisma";

/**
 * Force TA player default for everyone (anime-page Kodik toggle removed).
 * Idempotent: only touches rows where useLegacyKodikPlayer is true.
 */
export async function resetUseLegacyKodikPlayerForAllUsers(): Promise<{
  updatedUsers: number;
  updatedDefaults: number;
}> {
  const updatedUsers = await prisma.$executeRaw`
    UPDATE "User"
    SET "siteSettings" = jsonb_set(
      COALESCE("siteSettings", '{}'::jsonb),
      '{useLegacyKodikPlayer}',
      'false'::jsonb,
      true
    ),
    "updatedAt" = NOW()
    WHERE COALESCE(("siteSettings"->>'useLegacyKodikPlayer')::boolean, false) = true
  `;

  const updatedDefaults = await prisma.$executeRaw`
    UPDATE "SiteSettingsDefaults"
    SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{useLegacyKodikPlayer}',
      'false'::jsonb,
      true
    ),
    "updatedAt" = NOW()
    WHERE COALESCE((settings->>'useLegacyKodikPlayer')::boolean, false) = true
  `;

  return {
    updatedUsers: Number(updatedUsers),
    updatedDefaults: Number(updatedDefaults),
  };
}
