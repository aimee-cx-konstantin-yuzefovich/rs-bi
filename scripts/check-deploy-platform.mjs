import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const target = process.env.DEPLOY_ARCH;
if (!['x64', 'arm64'].includes(target)) {
  throw new Error('Set DEPLOY_ARCH=x64 or arm64 to match the PM2 production host. See DEPLOYMENT.md.');
}
if (process.platform !== 'linux' || process.arch !== target || !process.report.getReport().header.glibcVersionRuntime) {
  throw new Error('Build the production ZIP on matching Linux/glibc, not macOS, Alpine, or another architecture.');
}
const release = readFileSync('/etc/os-release', 'utf8');
if (!/^(?:ID|ID_LIKE)=.*(?:debian|ubuntu)/m.test(release) ||
    !execFileSync('openssl', ['version'], { encoding: 'utf8' }).startsWith('OpenSSL 3.')) {
  throw new Error('Production ZIP requires Debian-compatible Linux with OpenSSL 3.');
}
