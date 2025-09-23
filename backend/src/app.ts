import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import { env } from './config/environment';
import { downloadRoutes } from './routes/download.routes';
import { playbackRoutes } from './routes/playback.routes';
import { websocketRoutes } from './routes/websocket.routes';
import { analyticsRoutes } from './routes/analytics.routes';
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
  // Reduce log noise by disabling automatic per-request logging
  // (still allows explicit logs and error logs at configured level)
  disableRequestLogging: true,
});

// Initialize Prisma client
const prisma = new PrismaClient();

// Add Prisma to the app instance for use in routes
app.decorate('prisma', prisma);

// Register plugins
async function registerPlugins() {
  // CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests
      if (!origin) return cb(null, true);

      // Explicit allowlist from env (comma-separated)
      const envList = (env.CORS_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (envList.length && envList.includes(origin)) return cb(null, true);

      // Localhost ports for Next dev
      const localhostAllow = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
        'http://localhost:3005',
      ];
      if (localhostAllow.includes(origin)) return cb(null, true);

      // In non-production, allow common LAN origins (192.168.x.x, 10.x.x.x, 172.16-31.x.x) on typical dev ports
      if (env.NODE_ENV !== 'production') {
        const lanRegex = /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)[\d.]+:(300\d|5173|8080)$/;
        if (lanRegex.test(origin)) return cb(null, true);
      }

      cb(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
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

  // Register analytics routes
  await app.register(analyticsRoutes);

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
