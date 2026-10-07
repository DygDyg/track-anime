import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { getAudienceStats } from "@/lib/admin/audience-stats";
import {
  audienceStatsMarkdownFilename,
  formatAudienceStatsMarkdown,
} from "@/lib/admin/audience-stats-markdown";
import { getNotificationSubscriptionStats } from "@/lib/admin/notification-subscription-stats";
import { getWatchPartyHistoryDto } from "@/lib/admin/watch-party-history";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const generatedAt = new Date();
  const [stats, notifications, watchParty] = await Promise.all([
    getAudienceStats(),
    getNotificationSubscriptionStats(),
    getWatchPartyHistoryDto(50),
  ]);

  const markdown = formatAudienceStatsMarkdown({
    stats,
    notifications,
    watchParty,
    generatedAt,
  });
  const filename = audienceStatsMarkdownFilename(generatedAt);

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
