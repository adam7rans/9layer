import { PrismaClient } from '@prisma/client';

// Augment FastifyInstance to include prisma property
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
