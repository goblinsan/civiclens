import { z } from 'zod';

const envSchema = z.object({
  CONGRESS_API_KEY: z.string().min(1, 'CONGRESS_API_KEY is required'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

async function main() {
  console.log(`[ingest-congress] Starting with log level: ${env.LOG_LEVEL}`);
  // TODO: implement Congress API ingestion
}

main().catch((err) => {
  console.error('[ingest-congress] Fatal error:', err);
  process.exit(1);
});
