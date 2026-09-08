import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

// Run after npm ci, prisma generate and npm run build on the target platform.
const root = process.cwd();
const output = join(root, '.next/deploy');
const staging = mkdtempSync(join(root, '.next/deploy-'));
const safeFile = (source) => {
  const name = basename(source);
  return !name.startsWith('.env') && name !== 'db' &&
    !/\.(?:db(?:-.*)?|sqlite.*|pem|key)$/.test(name);
};

try {
  cpSync(join(root, '.next/standalone'), staging, { recursive: true, filter: safeFile });
  // Next's server trace alone does not guarantee an offline migration command.
  // Install the complete locked production graph, including the Prisma CLI.
  cpSync(join(root, 'package.json'), join(staging, 'package.json'));
  cpSync(join(root, 'package-lock.json'), join(staging, 'package-lock.json'));
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: staging, stdio: 'inherit',
  });
  // Reuse engines/client already installed and generated for this platform.
  for (const name of ['.prisma/client', '@prisma/engines']) {
    cpSync(join(root, 'node_modules', name), join(staging, 'node_modules', name), { recursive: true });
  }
  mkdirSync(join(staging, 'prisma'), { recursive: true });
  cpSync(join(root, 'prisma/schema.prisma'), join(staging, 'prisma/schema.prisma'));
  cpSync(join(root, 'prisma/migrations'), join(staging, 'prisma/migrations'), { recursive: true, filter: safeFile });
  mkdirSync(join(staging, 'scripts'), { recursive: true });
  for (const name of ['migrate-deploy.mjs', 'runtime-env.mjs', 'healthcheck.cjs', 'verify-deploy-artifact.sh']) {
    cpSync(join(root, 'scripts', name), join(staging, 'scripts', name));
  }
  for (const name of ['server.js', '.next/BUILD_ID', '.next/static', 'public', 'node_modules/prisma/build/index.js', 'node_modules/.prisma/client/schema.prisma']) {
    if (!existsSync(resolve(staging, name))) throw new Error(`Incomplete artifact: ${name}`);
  }
  // Reusable post-packaging contract check; the deploy job repeats it after artifact transfer.
  execFileSync('sh', [join(staging, 'scripts/verify-deploy-artifact.sh'), staging], {
    stdio: 'inherit',
  });
  rmSync(output, { recursive: true, force: true });
  renameSync(staging, output);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
