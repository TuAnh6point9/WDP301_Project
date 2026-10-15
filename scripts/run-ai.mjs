import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = resolve(root, 'ai', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const [action, ...args] = process.argv.slice(2);
const env = {
  ...process.env, UV_CACHE_DIR: resolve(root, '.local/uv-cache'), PYTHONUTF8: '1',
  OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '1',
  OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS || '1',
};

function run(command, parameters, extraEnv = {}) {
  const result = spawnSync(command, parameters, {
    cwd: root, env: { ...env, ...extraEnv }, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) {
    console.error(`Cannot start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === 'setup') {
  if (!existsSync(python)) run('uv', ['venv', '--python', '3.12', resolve(root, 'ai/.venv')]);
  run('uv', ['pip', 'install', '--python', python, '-r', resolve(root, 'ai/requirements.txt')]);
} else if (!existsSync(python)) {
  console.error('AI environment is missing. Run npm run ai:setup first (requires uv).');
  process.exit(1);
} else if (action === 'train') {
  run(python, ['-m', 'ai.train', '--source', resolve(root, '.local/datasets/AKH-5_2026.raw.json'), '--output', resolve(root, '.local/ai'), ...args]);
} else if (action === 'import') {
  run(python, ['-m', 'ai.install_catboost', ...args]);
} else if (action === 'test') {
  run(python, ['-m', 'pytest', 'ai/tests', ...args]);
} else if (action === 'dev') {
  run(python, ['-m', 'uvicorn', 'ai.service:configured_app', '--factory', '--host', '127.0.0.1', '--port', '8000', ...args], {
    WQI_MODEL_PATH: process.env.WQI_MODEL_PATH || resolve(root, '.local/ai/catboost/model.cbm'),
  });
} else {
  console.error('Usage: node scripts/run-ai.mjs setup|import|train|test|dev [arguments]');
  process.exit(1);
}
