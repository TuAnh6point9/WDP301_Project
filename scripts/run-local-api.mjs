import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = parse(readFileSync(resolve(root, 'server/.env')));
const uri = process.env.MONGODB_URI || config.MONGODB_URI || '';
if (!/^mongodb:\/\/(?:127\.0\.0\.1|localhost):27017\/akh_wqi_local(?:\?|$)/.test(uri)) {
  console.error('dev:wqi requires the isolated akh_wqi_local database. See README.md setup instructions.');
  process.exit(1);
}
const child = spawn(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'server/src/server.ts'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, MONGODB_URI: uri, AI_MODE: 'http', AI_SERVICE_URL: 'http://127.0.0.1:8000/predict' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
