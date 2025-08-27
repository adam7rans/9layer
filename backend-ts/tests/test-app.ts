import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/environment';
import { downloadRoutes } from '../src/routes/download.routes';
import { playbackRoutes } from '../src/routes/playback.routes';
import { websocketRoutes } from '../src/routes/websocket.routes';
import * as path from 'path';

/**
 * Create a Fastify app instance for testing
 */
export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Disable logging in tests
  });

  // Initialize Prisma client
  const prisma = new PrismaClient();

  // Add Prisma to the app instance
  app.decorate('prisma', prisma);

  // Register plugins
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(websocket);

  await app.register(staticPlugin, {
    root: path.resolve(env.DOWNLOAD_DIR),
    prefix: '/downloads/',
  });

  // Register routes
  await app.register(downloadRoutes);
  await app.register(playbackRoutes);
  await app.register(websocketRoutes);

  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: 'test',
    };
  });

  // Clean shutdown
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
