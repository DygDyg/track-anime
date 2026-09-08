const VISITOR_COOKIE = "ta.vid";
const VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year
const PATH_THROTTLE_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const AGGREGATE_RETENTION_DAYS = 90;

export const analyticsConfig = {
  visitorCookie: VISITOR_COOKIE,
  visitorMaxAgeSec: VISITOR_MAX_AGE_SEC,
  pathThrottleMs: PATH_THROTTLE_MS,
  activeWindowMs: ACTIVE_WINDOW_MS,
  aggregateRetentionDays: AGGREGATE_RETENTION_DAYS,
} as const;

export function visitorCookieOptions(
  visitorKey: string,
  secure = process.env.NODE_ENV === "production",
) {
  return {
    name: analyticsConfig.visitorCookie,
    value: visitorKey,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: analyticsConfig.visitorMaxAgeSec,
  };
}
