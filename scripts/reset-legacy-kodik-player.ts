/**
 * One-shot: reset useLegacyKodikPlayer to false for all users + site defaults.
 *
 *   npx tsx scripts/reset-legacy-kodik-player.ts
 */

import { resetUseLegacyKodikPlayerForAllUsers } from "../src/lib/admin/reset-legacy-kodik-player";

async function main() {
  const result = await resetUseLegacyKodikPlayerForAllUsers();
  console.log(
    `[reset-legacy-kodik-player] users=${result.updatedUsers} defaults=${result.updatedDefaults}`,
  );
}

main().catch((error) => {
  console.error("[reset-legacy-kodik-player] failed", error);
  process.exitCode = 1;
});
