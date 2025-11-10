import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient => {
  return new PrismaClient();
};

export const prisma =
  global.prisma ??
  (() => {
    const client = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      global.prisma = client;
    }
    return client;
  })();

export type Prisma = typeof prisma;

