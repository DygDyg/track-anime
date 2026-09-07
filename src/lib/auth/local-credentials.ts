import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { normalizeLocalLogin } from "@/lib/auth/local-login-name";

const scrypt = promisify(scryptCallback);
const LOGIN_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 6;

export { formatLocalLogin, normalizeLocalLogin } from "@/lib/auth/local-login-name";

export function validateLocalCredential(login: string, password: string): string | null {
  if (!LOGIN_PATTERN.test(login)) {
    return "Логин: от 3 до 32 символов, латиница, цифры, _ и - (при входе регистр не важен).";
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

async function findLocalCredentialByLogin(login: string) {
  const loginNormalized = normalizeLocalLogin(login);
  if (!loginNormalized) return null;

  const byNormalized = await prisma.localCredential.findUnique({
    where: { loginNormalized },
    include: { user: true },
  });
  if (byNormalized) return byNormalized;

  // Старые записи без loginNormalized: ищем без учёта регистра и дописываем ключ.
  const legacy = await prisma.localCredential.findFirst({
    where: {
      loginNormalized: null,
      login: { equals: loginNormalized, mode: "insensitive" },
    },
    include: { user: true },
  });
  if (!legacy) return null;

  try {
    return await prisma.localCredential.update({
      where: { userId: legacy.userId },
      data: { loginNormalized },
      include: { user: true },
    });
  } catch {
    return legacy;
  }
}

export async function findUserByLocalCredential(login: string, password: string) {
  const credential = await findLocalCredentialByLogin(login);
  if (!credential || !(await verifyPassword(password, credential.passwordHash))) return null;
  return credential.user;
}
