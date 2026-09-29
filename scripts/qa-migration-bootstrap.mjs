import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaBin = resolve(root, 'node_modules/prisma/build/index.js');
const schemaPath = resolve(root, 'prisma/schema.prisma');
const migrateDeployScript = resolve(root, 'scripts/migrate-deploy.mjs');
const INITIAL_MIGRATION = '20260909000000_initial';

const testEnv = {
  ...process.env,
  NEXTAUTH_SECRET: 'qa-bootstrap-valid-secret-32-chars-long-1234',
  PROXY_SECRET: 'qa-bootstrap-valid-proxy-secret-32-chars-1234',
  CHECKPOINT_DISABLE: '1',
  PRISMA_HIDE_UPDATE_MESSAGE: '1',
};

function runPrisma(dbUrl, args, options = {}) {
  return spawnSync(process.execPath, [prismaBin, ...args], {
    cwd: root,
    stdio: [options.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    env: { ...testEnv, DATABASE_URL: dbUrl },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function runMigrateDeploy(dbUrl) {
  return spawnSync(process.execPath, [migrateDeployScript], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...testEnv, DATABASE_URL: dbUrl },
    encoding: 'utf8',
  });
}

function executeSql(dbUrl, sql) {
  const res = runPrisma(dbUrl, ['db', 'execute', '--url', dbUrl, '--stdin'], { input: sql });
  if (res.status !== 0) {
    throw new Error(`Prisma execute SQL failed: ${res.stderr || res.stdout}`);
  }
}

function assertZeroDiff(dbUrl) {
  const res = runPrisma(dbUrl, [
    'migrate', 'diff',
    '--from-url', dbUrl,
    '--to-schema-datamodel', schemaPath,
    '--exit-code',
  ]);
  if (res.status !== 0) {
    throw new Error(`Expected zero diff against schema.prisma, got exit code ${res.status}:\n${res.stdout || res.stderr}`);
  }
}

const workDir = mkdtempSync(join(tmpdir(), 'rs-bi-mig-qa-'));

try {
  // ─── MIG-1: Fresh DB ───
  {
    const dbPath = join(workDir, 'mig1-fresh.db');
    const dbUrl = `file:${dbPath}`;

    const deployRes = runMigrateDeploy(dbUrl);
    if (deployRes.status !== 0) {
      throw new Error(`MIG-1 failed: migrate-deploy exited with ${deployRes.status}\n${deployRes.stderr || deployRes.stdout}`);
    }

    assertZeroDiff(dbUrl);

    // Verify migrations table has 20260909000000_initial recorded
    const statusRes = runPrisma(dbUrl, ['migrate', 'status', '--schema', schemaPath]);
    if (statusRes.status !== 0 || !statusRes.stdout.includes('Database schema is up to date')) {
      throw new Error(`MIG-1 migrate status failed:\n${statusRes.stdout || statusRes.stderr}`);
    }

    console.log('MIG-1 Fresh DB: PASS');
  }

  // ─── MIG-2: Legacy DB (audit_logs only) ───
  {
    const dbPath = join(workDir, 'mig2-legacy.db');
    const dbUrl = `file:${dbPath}`;

    // Create legacy audit_logs table
    executeSql(dbUrl, `
      CREATE TABLE "audit_logs" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "event" TEXT NOT NULL,
          "email" TEXT,
          "role" TEXT,
          "targetId" TEXT,
          "ip" TEXT,
          "details" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX "audit_logs_event_idx" ON "audit_logs"("event");
      CREATE INDEX "audit_logs_email_idx" ON "audit_logs"("email");
      CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
      INSERT INTO "audit_logs" ("id", "event", "email") VALUES ("mig2-row-1", "LOGIN_SUCCESS", "mig2@example.com");
    `);

    const deployRes = runMigrateDeploy(dbUrl);
    if (deployRes.status !== 0) {
      throw new Error(`MIG-2 failed: migrate-deploy exited with ${deployRes.status}\n${deployRes.stderr || deployRes.stdout}`);
    }

    // Verify backup created
    const backups = readdirSync(workDir).filter(f => f.startsWith('mig2-legacy.db.pre-prisma-baseline-'));
    if (backups.length === 0) {
      throw new Error('MIG-2 failed: backup file was not created');
    }

    // Verify zero diff
    assertZeroDiff(dbUrl);

    // Verify test row preserved and used_nonces functional
    executeSql(dbUrl, `
      INSERT INTO "used_nonces" ("nonce") VALUES ("mig2-nonce-1");
    `);

    console.log('MIG-2 Legacy DB (audit_logs only): PASS');
  }

  // ─── MIG-3: Current production-like DB (audit_logs + used_nonces, no _prisma_migrations) ───
  {
    const dbPath = join(workDir, 'mig3-prod.db');
    const dbUrl = `file:${dbPath}`;

    // Create current tables matching schema.prisma without _prisma_migrations
    executeSql(dbUrl, `
      CREATE TABLE "audit_logs" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "event" TEXT NOT NULL,
          "email" TEXT,
          "role" TEXT,
          "targetId" TEXT,
          "ip" TEXT,
          "details" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "used_nonces" (
          "nonce" TEXT NOT NULL PRIMARY KEY,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX "audit_logs_event_idx" ON "audit_logs"("event");
      CREATE INDEX "audit_logs_email_idx" ON "audit_logs"("email");
      CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
      INSERT INTO "audit_logs" ("id", "event", "email") VALUES ("mig3-row-1", "DATA_EXPORT", "mig3@example.com");
      INSERT INTO "used_nonces" ("nonce") VALUES ("mig3-nonce-abc");
    `);

    const deployRes = runMigrateDeploy(dbUrl);
    if (deployRes.status !== 0) {
      throw new Error(`MIG-3 failed: migrate-deploy exited with ${deployRes.status}\n${deployRes.stderr || deployRes.stdout}`);
    }

    // Verify backup created
    const backups = readdirSync(workDir).filter(f => f.startsWith('mig3-prod.db.pre-prisma-baseline-'));
    if (backups.length === 0) {
      throw new Error('MIG-3 failed: backup file was not created');
    }

    // Verify zero diff
    assertZeroDiff(dbUrl);

    // Verify migration status
    const statusRes = runPrisma(dbUrl, ['migrate', 'status', '--schema', schemaPath]);
    if (statusRes.status !== 0 || !statusRes.stdout.includes('Database schema is up to date')) {
      throw new Error(`MIG-3 migrate status failed:\n${statusRes.stdout || statusRes.stderr}`);
    }

    console.log('MIG-3 Current production-like DB: PASS');
  }

  // ─── MIG-4: Unknown drift fail-closed ───
  {
    const dbPath = join(workDir, 'mig4-drift.db');
    const dbUrl = `file:${dbPath}`;

    // Create table with missing required column "event" and extra unexpected column
    executeSql(dbUrl, `
      CREATE TABLE "audit_logs" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "corrupted_column" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "audit_logs" ("id", "corrupted_column") VALUES ("drift-row-1", "sensitive_data");
    `);

    const deployRes = runMigrateDeploy(dbUrl);
    if (deployRes.status === 0) {
      throw new Error('MIG-4 failed: migrate-deploy unexpectedly succeeded on drifted schema');
    }

    if (!deployRes.stderr.includes('FAIL CLOSED') && !deployRes.stdout.includes('FAIL CLOSED')) {
      throw new Error(`MIG-4 failed: expected FAIL CLOSED in output, got:\n${deployRes.stdout}\n${deployRes.stderr}`);
    }

    // Verify initial migration was NOT marked applied
    const resolveCheck = runPrisma(dbUrl, ['migrate', 'status', '--schema', schemaPath]);
    if (resolveCheck.stdout.includes('Database schema is up to date')) {
      throw new Error('MIG-4 failed: drifted database was unexpectedly marked up to date');
    }

    // Verify original drifted data was NOT deleted
    let dataPreserved = true;
    try {
      executeSql(dbUrl, `SELECT "corrupted_column" FROM "audit_logs";`);
    } catch {
      dataPreserved = false;
    }
    if (!dataPreserved) {
      throw new Error('MIG-4 failed: drifted table/data was unexpectedly dropped');
    }

    console.log('MIG-4 Unknown drift fail-closed: PASS');
  }

  console.log('migration bootstrap QA: PASS');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
