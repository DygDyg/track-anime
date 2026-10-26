import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function hasSiteSettingsDefaults(client: PrismaClient): boolean {
  return typeof (client as PrismaClient & { siteSettingsDefaults?: unknown }).siteSettingsDefaults !== "undefined";
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && hasSiteSettingsDefaults(cached)) {
    return cached;
  }

  const client = createPrismaClient();
  // Always pin on globalThis: Next server chunks can otherwise create multiple clients
  // and exhaust Postgres with several tiny pools (default ~num_cpus*2+1).
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();
