import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient for the whole process.
 *
 * Next.js's dev server hot-reloads modules on every edit; without this cache
 * each reload would construct another client and open another pool, and Neon
 * would start refusing connections. In production the module is evaluated
 * once, so the global is only populated outside production.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
