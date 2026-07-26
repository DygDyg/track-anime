import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { normalizeLocalLogin } from "@/lib/auth/local-login-name";

const scrypt = promisify(scryptCallback);
const LOGIN_PATTERN = /^[a-z0-9_-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 10;

export { normalizeLocalLogin } from "@/lib/auth/local-login-name";

export function validateLocalCredential(login: string, password: string): string | null {
  if (!LOGIN_PATTERN.test(login)) {
    return "Логин: от 3 до 32 символов, только латиница, цифры, _ и -.";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль должен содержать не менее ${PASSWORD_MIN_LENGTH} символов.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
  try {
    const expected = Buffer.from(keyHex, "hex");
    const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function findUserByLocalCredential(login: string, password: string) {
  const credential = await prisma.localCredential.findUnique({
    where: { login },
    include: { user: true },
  });
  if (!credential || !(await verifyPassword(password, credential.passwordHash))) return null;
  return credential.user;
}
