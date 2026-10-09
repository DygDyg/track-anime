import { NextResponse } from "next/server";
import {
  getGitDeployBranch,
  getGitDeployWebhookSecret,
  isGitDeployEnabled,
  parseGitHubPushPayload,
  shouldDeployFromGitHubPush,
  startGitDeploy,
  verifyGitHubWebhookSignature,
} from "@/lib/admin/git-deploy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GitHub webhook (push). Auth: X-Hub-Signature-256 + GIT_DEPLOY_WEBHOOK_SECRET.
 * Payload: application/json (не form-urlencoded).
 */
export async function POST(request: Request) {
  if (!isGitDeployEnabled()) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
  }
  if (!getGitDeployWebhookSecret()) {
    return NextResponse.json({ ok: false, error: "webhook secret not configured" }, { status: 503 });
  }

  const event = request.headers.get("x-github-event") ?? "";
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  if (!verifyGitHubWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: true, reason: `event ${event}` });
  }

  let payload: unknown;
  try {
    payload = parseGitHubPushPayload(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const branch = getGitDeployBranch();
  const decision = shouldDeployFromGitHubPush(payload, branch);
  if (!decision.deploy) {
    return NextResponse.json({ ok: true, skipped: true, reason: decision.reason });
  }

  const result = await startGitDeploy({ trigger: "webhook", force: false });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, reason: decision.reason }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    alreadyRunning: result.alreadyRunning ?? false,
    reason: decision.reason,
  });
}
