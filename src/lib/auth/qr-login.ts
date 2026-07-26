import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth/config";

const QR_LOGIN_TTL_MS = 3 * 60 * 1000;
export type QrLoginStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

async function findByCode(code: string) {
  if (!code || code.length > 128) return null;
  const request = await prisma.qrLoginRequest.findUnique({ where: { codeHash: hash(code) } });
  if (!request) return null;
  if (request.status === "pending" && request.expiresAt <= new Date()) {
    return prisma.qrLoginRequest.update({ where: { id: request.id }, data: { status: "expired" } });
  }
  return request;
}

export async function createQrLoginRequest() {
  const code = token();
  const requesterSecret = token();
  const expiresAt = new Date(Date.now() + QR_LOGIN_TTL_MS);
  await prisma.qrLoginRequest.create({
    data: { codeHash: hash(code), requesterSecretHash: hash(requesterSecret), expiresAt },
  });
  return { code, requesterSecret, expiresAt };
}

export async function getQrLoginStatus(code: string, requesterSecret: string): Promise<QrLoginStatus | null> {
  const request = await findByCode(code);
  if (!request || request.requesterSecretHash !== hash(requesterSecret)) return null;
  return request.status as QrLoginStatus;
}

export async function approveQrLogin(code: string, userId: string): Promise<QrLoginStatus | null> {
  const request = await findByCode(code);
  if (!request) return null;
  if (request.status !== "pending") return request.status as QrLoginStatus;

  const expiresAt = new Date(Date.now() + authConfig.sessionMaxAgeSec * 1000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  const updated = await prisma.qrLoginRequest.updateMany({
    where: { id: request.id, status: "pending" },
    data: { status: "approved", approvedByUserId: userId, approvedSessionId: session.id, approvedAt: new Date() },
  });
  if (updated.count === 1) return "approved";
  await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
  return (await findByCode(code))?.status as QrLoginStatus | null;
}

export async function rejectQrLogin(code: string, userId: string): Promise<QrLoginStatus | null> {
  const request = await findByCode(code);
  if (!request) return null;
  if (request.status !== "pending") return request.status as QrLoginStatus;
  await prisma.qrLoginRequest.updateMany({
    where: { id: request.id, status: "pending" },
    data: { status: "rejected", approvedByUserId: userId },
  });
  return "rejected";
}

export async function claimQrLogin(code: string, requesterSecret: string): Promise<string | null> {
  const request = await findByCode(code);
  if (!request || request.requesterSecretHash !== hash(requesterSecret) || request.status !== "approved" || !request.approvedSessionId) {
    return null;
  }
  const consumed = await prisma.qrLoginRequest.updateMany({
    where: { id: request.id, status: "approved" },
    data: { status: "consumed", consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  const session = await prisma.session.findUnique({ where: { id: request.approvedSessionId } });
  return session?.token ?? null;
}
