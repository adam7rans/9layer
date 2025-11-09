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
  ANALYSIS_PYTHON_BIN: z.string().default('python3'),
  ANALYSIS_CLI_PATH: z.string().default('analysis/cli.py'),
  ANALYSIS_BATCH_SIZE: z.coerce.number().int().positive().default(16),
  ANALYSIS_MAX_WORKERS: z.coerce.number().int().positive().default(4),
  ANALYSIS_FORCE_REANALYZE: z.coerce.boolean().default(false),
  ANALYSIS_ENABLE_EMBEDDINGS: z.coerce.boolean().default(true),
  ANALYSIS_MODEL_DIR: z.string().optional(),
  ANALYSIS_CACHE_DIR: z.string().default('analysis-cache'),
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
