import nextEnv from '@next/env';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertRuntimeSecrets } from './runtime-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Match Next.js production .env loading; existing process variables win.
nextEnv.loadEnvConfig(root, false);
assertRuntimeSecrets(process.env);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('file:/')) {
  throw new Error('Deployment requires an absolute DATABASE_URL (file:/...). Keep the existing database location; see DEPLOYMENT.md.');
}
const dbFilePath = fileURLToPath(databaseUrl);
mkdirSync(dirname(dbFilePath), { recursive: true });

const prismaBin = resolve(root, 'node_modules/prisma/build/index.js');
const schemaPath = resolve(root, 'prisma/schema.prisma');
const INITIAL_MIGRATION = '20260909000000_initial';

const LEGACY_SCHEMA_DATAMODEL = `datasource db {
  provider = "sqlite"
  url      = "file:dummy.db"
}

model AuditLog {
  id        String   @id @default(cuid())
  event     String
  email     String?
  role      String?
  targetId  String?
  ip        String?
  details   String?
  createdAt DateTime @default(now())

  @@index([event])
  @@index([email])
  @@index([createdAt])
  @@map("audit_logs")
}
`;

function runPrisma(args, options = {}) {
  return spawnSync(process.execPath, [prismaBin, ...args], {
    cwd: root,
    stdio: [options.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      RUST_LOG: 'info',
      CHECKPOINT_DISABLE: '1',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function createBackup(url, filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupPath = `${filePath}.pre-prisma-baseline-${timestamp}.backup`;
  let counter = 1;
  while (existsSync(backupPath)) {
    backupPath = `${filePath}.pre-prisma-baseline-${timestamp}-${counter++}.backup`;
  }
  const escaped = backupPath.replace(/'/g, "''");
  const res = runPrisma(['db', 'execute', '--url', url, '--stdin'], {
    input: `VACUUM INTO '${escaped}';`,
  });
  if (res.status !== 0 || !existsSync(backupPath)) {
    console.error('[migrate-deploy] FAIL CLOSED: Failed to create SQLite-consistent backup via VACUUM INTO.');
    if (res.stderr) console.error(res.stderr);
    if (res.stdout) console.error(res.stdout);
    process.exit(1);
  }
  console.log(`[migrate-deploy] Created consistent SQLite backup at ${backupPath}`);
  return backupPath;
}

// ─── 1. Normal Path (Always tried first) ───
const deployRes = runPrisma(['migrate', 'deploy', '--schema', schemaPath]);
if (deployRes.status === 0) {
  if (deployRes.stdout) process.stdout.write(deployRes.stdout);
  process.exit(0);
}

// ─── 2. Auto-bootstrap allowed ONLY upon Prisma P3005 ───
const combinedOutput = `${deployRes.stdout || ''}\n${deployRes.stderr || ''}`;
const isP3005 = combinedOutput.includes('P3005') || combinedOutput.includes('database schema is not empty');

if (!isP3005) {
  console.error('[migrate-deploy] FAIL CLOSED: Migration deploy failed with non-recoverable error.');
  if (deployRes.stdout) process.stdout.write(deployRes.stdout);
  if (deployRes.stderr) process.stderr.write(deployRes.stderr);
  process.exit(deployRes.status || 1);
}

console.warn('[migrate-deploy] Non-empty database without migration history detected (P3005). Checking for verified safe legacy schemas...');

// ─── 3. Legacy State A: Database already matches schema.prisma (audit_logs + used_nonces) ───
const diffStateA = runPrisma([
  'migrate', 'diff',
  '--from-url', databaseUrl,
  '--to-schema-datamodel', schemaPath,
  '--exit-code',
]);

if (diffStateA.status === 0) {
  console.log('[migrate-deploy] Matched verified legacy State A (audit_logs + used_nonces present, zero schema diff).');
  createBackup(databaseUrl, dbFilePath);

  console.log(`[migrate-deploy] Baselining initial migration ${INITIAL_MIGRATION}...`);
  const resolveRes = runPrisma([
    'migrate', 'resolve',
    '--applied', INITIAL_MIGRATION,
    '--schema', schemaPath,
  ]);
  if (resolveRes.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Failed to baseline initial migration:');
    if (resolveRes.stderr) console.error(resolveRes.stderr);
    process.exit(resolveRes.status || 1);
  }

  console.log('[migrate-deploy] Deploying migrations to verify baseline...');
  const verifyDeploy = runPrisma(['migrate', 'deploy', '--schema', schemaPath]);
  if (verifyDeploy.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Migration deploy failed after baseline:');
    if (verifyDeploy.stderr) console.error(verifyDeploy.stderr);
    process.exit(verifyDeploy.status || 1);
  }
  if (verifyDeploy.stdout) process.stdout.write(verifyDeploy.stdout);
  console.log('[migrate-deploy] Legacy State A successfully baselined.');
  process.exit(0);
}

// ─── 4. Legacy State B: Database matches legacy schema (audit_logs only, missing used_nonces) ───
const tempDir = mkdtempSync(join(tmpdir(), 'prisma-legacy-schema-'));
const tempLegacySchemaPath = join(tempDir, 'schema.prisma');
let diffStateB;
try {
  writeFileSync(tempLegacySchemaPath, LEGACY_SCHEMA_DATAMODEL, 'utf8');
  diffStateB = runPrisma([
    'migrate', 'diff',
    '--from-url', databaseUrl,
    '--to-schema-datamodel', tempLegacySchemaPath,
    '--exit-code',
  ]);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (diffStateB.status === 0) {
  console.log('[migrate-deploy] Matched verified legacy State B (audit_logs only, missing used_nonces).');
  createBackup(databaseUrl, dbFilePath);

  console.log('[migrate-deploy] Creating authoritative used_nonces table...');
  const createNoncesSql = `CREATE TABLE "used_nonces" (\n    "nonce" TEXT NOT NULL PRIMARY KEY,\n    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n);`;
  const createTableRes = runPrisma([
    'db', 'execute',
    '--url', databaseUrl,
    '--stdin',
  ], { input: createNoncesSql });

  if (createTableRes.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Failed to create used_nonces table:');
    if (createTableRes.stderr) console.error(createTableRes.stderr);
    process.exit(createTableRes.status || 1);
  }

  console.log('[migrate-deploy] Verifying database schema against prisma/schema.prisma...');
  const postDiff = runPrisma([
    'migrate', 'diff',
    '--from-url', databaseUrl,
    '--to-schema-datamodel', schemaPath,
    '--exit-code',
  ]);

  if (postDiff.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Schema verification failed after adding used_nonces (non-zero diff detected):');
    if (postDiff.stdout) console.error(postDiff.stdout);
    if (postDiff.stderr) console.error(postDiff.stderr);
    process.exit(1);
  }

  console.log(`[migrate-deploy] Baselining initial migration ${INITIAL_MIGRATION}...`);
  const resolveRes = runPrisma([
    'migrate', 'resolve',
    '--applied', INITIAL_MIGRATION,
    '--schema', schemaPath,
  ]);
  if (resolveRes.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Failed to baseline initial migration:');
    if (resolveRes.stderr) console.error(resolveRes.stderr);
    process.exit(resolveRes.status || 1);
  }

  console.log('[migrate-deploy] Deploying migrations to verify baseline...');
  const verifyDeploy = runPrisma(['migrate', 'deploy', '--schema', schemaPath]);
  if (verifyDeploy.status !== 0) {
    console.error('[migrate-deploy] FAIL CLOSED: Migration deploy failed after baseline:');
    if (verifyDeploy.stderr) console.error(verifyDeploy.stderr);
    process.exit(verifyDeploy.status || 1);
  }
  if (verifyDeploy.stdout) process.stdout.write(verifyDeploy.stdout);
  console.log('[migrate-deploy] Legacy State B successfully upgraded and baselined.');
  process.exit(0);
}

// ─── 5. Unknown Schema Drift: Fail Closed ───
console.error('[migrate-deploy] FAIL CLOSED: Database schema is not empty (P3005) but does not match any known safe legacy schema.');
console.error('[migrate-deploy] Diff vs current schema (State A):');
if (diffStateA.stdout) console.error(diffStateA.stdout);
if (diffStateA.stderr) console.error(diffStateA.stderr);
console.error('[migrate-deploy] Diff vs legacy schema (State B):');
if (diffStateB.stdout) console.error(diffStateB.stdout);
if (diffStateB.stderr) console.error(diffStateB.stderr);
process.exit(1);
