import nextEnv from '@next/env';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertRuntimeSecrets } from './runtime-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Match Next.js production .env loading; existing process variables win.
nextEnv.loadEnvConfig(root, false);
assertRuntimeSecrets(process.env);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('file:/')) {
  throw new Error('Deployment requires an absolute DATABASE_URL (file:/...). Keep the existing database location; see DEPLOYMENT.md.');
}
mkdirSync(dirname(fileURLToPath(databaseUrl)), { recursive: true });
execFileSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(root, 'prisma/schema.prisma')], {
  // Prisma 6 parses engine startup logs when detecting a missing SQLite file;
  // an inherited RUST_LOG=warn hides that line and breaks fresh DB creation.
  // Disable its update/telemetry check as well: startup uses only bundled tools.
  cwd: root, env: { ...process.env, RUST_LOG: 'info', CHECKPOINT_DISABLE: '1' }, stdio: 'inherit',
});
