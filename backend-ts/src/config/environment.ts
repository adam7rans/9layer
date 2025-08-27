import { z } from 'zod';

// Environment variables schema
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DOWNLOAD_DIR: z.string().default('/app/music'),
  MAX_CONCURRENT_DOWNLOADS: z.coerce.number().int().positive().default(3),
  WEBSOCKET_HEARTBEAT_INTERVAL: z.coerce.number().int().positive().default(30000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

// Helper function to get environment-specific values
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
