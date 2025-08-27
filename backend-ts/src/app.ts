import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { env } from './config/environment';
import { downloadRoutes } from './routes/download.routes';
import { playbackRoutes } from './routes/playback.routes';
import { websocketRoutes } from './routes/websocket.routes';
import path from 'path';

// Extend Fastify types to include Prisma
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// Create Fastify instance with logging
const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
});

// Initialize Prisma client
const prisma = new PrismaClient();

// Add Prisma to the app instance for use in routes
app.decorate('prisma', prisma);

// Register plugins
async function registerPlugins() {
  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // WebSocket support
  await app.register(websocket);

  // Static file serving for downloads
  await app.register(staticPlugin, {
    root: path.resolve(env.DOWNLOAD_DIR),
    prefix: '/downloads/',
  });
}

// Register routes
async function registerRoutes() {
  // Register download routes
  await app.register(downloadRoutes);

  // Register playback routes
  await app.register(playbackRoutes);

  // Register WebSocket routes
  await app.register(websocketRoutes);
}

// Basic health check endpoint
app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  };
});

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach(signal => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  });
});

// Start server
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();

    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 Server listening on port ${env.PORT}`);
    console.log(`📝 Environment: ${env.NODE_ENV}`);
    console.log(`🎵 Download directory: ${env.DOWNLOAD_DIR}`);
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
}

start();
