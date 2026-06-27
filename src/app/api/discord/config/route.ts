import { NextResponse } from "next/server";
import { getDiscordPublicConfig } from "@/lib/discord-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getDiscordPublicConfig();
  return NextResponse.json(config);
}
