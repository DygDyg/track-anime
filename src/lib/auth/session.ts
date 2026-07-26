import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authConfig, isBootstrapAdmin } from "@/lib/auth/config";
import { shikimoriAvatarUrl } from "@/lib/auth/shikimori-avatar";

export type AuthUser = {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  hasLocalCredential: boolean;
};

export type AuthSession = {
  user: AuthUser;
};

function mapUser(user: {
  id: string;
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  localCredential?: { userId: string } | null;
}): AuthUser {
  return {
    id: user.id,
    shikimoriId: user.shikimoriId,
    nickname: user.nickname,
    avatar: shikimoriAvatarUrl(user.avatar),
    isAdmin: user.isAdmin || isBootstrapAdmin(user.shikimoriId),
    hasLocalCredential: Boolean(user.localCredential),
  };
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(authConfig.sessionCookie)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  const localCredential = await prisma.localCredential.findUnique({
    where: { userId: session.user.id },
    select: { userId: true },
  });
  return { user: mapUser({ ...session.user, localCredential }) };
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + authConfig.sessionMaxAgeSec * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
    },
  });
  return session.token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) return forwardedProto === "https";
  return new URL(request.url).protocol === "https:";
}

export function sessionCookieOptions(token: string, secure = process.env.NODE_ENV === "production") {
  return {
    name: authConfig.sessionCookie,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authConfig.sessionMaxAgeSec,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: authConfig.sessionCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function oauthStateCookieOptions(state: string) {
  return {
    name: authConfig.oauthStateCookie,
    value: state,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authConfig.oauthStateMaxAgeSec,
  };
}

export function clearOAuthStateCookieOptions() {
  return {
    name: authConfig.oauthStateCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function oauthRedirectCookieOptions(redirectUri: string) {
  return {
    name: authConfig.oauthRedirectCookie,
    value: redirectUri,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authConfig.oauthStateMaxAgeSec,
  };
}

export function clearOAuthRedirectCookieOptions() {
  return {
    name: authConfig.oauthRedirectCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function oauthReturnCookieOptions(returnPath: string) {
  return {
    name: authConfig.oauthReturnCookie,
    value: returnPath,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authConfig.oauthStateMaxAgeSec,
  };
}

export function clearOAuthReturnCookieOptions() {
  return {
    name: authConfig.oauthReturnCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export async function upsertShikimoriUser(input: {
  shikimoriId: number;
  nickname: string;
  avatar?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}): Promise<AuthUser> {
  const bootstrapAdmin = isBootstrapAdmin(input.shikimoriId);

  const user = await prisma.user.upsert({
    where: { shikimoriId: input.shikimoriId },
    create: {
      shikimoriId: input.shikimoriId,
      nickname: input.nickname,
      avatar: input.avatar ?? null,
      isAdmin: bootstrapAdmin,
      account: {
        create: {
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt: input.expiresAt,
          scope: input.scope,
        },
      },
    },
    update: {
      nickname: input.nickname,
      avatar: input.avatar ?? null,
      ...(bootstrapAdmin ? { isAdmin: true } : {}),
      account: {
        upsert: {
          create: {
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            expiresAt: input.expiresAt,
            scope: input.scope,
          },
          update: {
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
            expiresAt: input.expiresAt,
            scope: input.scope,
          },
        },
      },
    },
  });

  return mapUser(user);
}
