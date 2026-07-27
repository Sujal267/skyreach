import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

/**
 * Single client for the process. Cached on globalThis so `tsx watch` reloads
 * do not open a new connection pool on every file save — Neon counts those.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;
