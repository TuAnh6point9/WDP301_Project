import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  MONGODB_DNS_FALLBACK: z.enum(['https', 'none']).default('https'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000,http://127.0.0.1:5000'),
  SESSION_SECRET: z.string().min(32),
  AI_MODE: z.enum(['disabled', 'http']).default('disabled'),
  AI_SERVICE_URL: z.string().default(''), AI_API_KEY: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});
export function getEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  if (result.data.AI_MODE === 'http' && !/^https?:\/\//.test(result.data.AI_SERVICE_URL)) throw new Error('AI_SERVICE_URL must be an HTTP URL');
  return result.data;
}
