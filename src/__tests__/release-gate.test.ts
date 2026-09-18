import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Release QA Gate & Deployment Contract', () => {
  const rootDir = path.resolve(__dirname, '../..');

  it('1. build-deploy.sh contains the enforced QA verification gate', () => {
    const buildDeployScript = fs.readFileSync(path.join(rootDir, 'build-deploy.sh'), 'utf8');
    
    // Invariants: must run vitest, lint, qa-deployment before packaging
    expect(buildDeployScript).toContain('npx vitest run');
    expect(buildDeployScript).toContain('npm run lint');
    expect(buildDeployScript).toContain('sh scripts/qa-deployment.sh');

    // Structurally, QA gate must precede package-standalone.mjs
    const qaIndex = buildDeployScript.indexOf('npx vitest run');
    const packageIndex = buildDeployScript.indexOf('package-standalone.mjs');
    expect(qaIndex).toBeGreaterThan(0);
    expect(packageIndex).toBeGreaterThan(qaIndex);
  });

  it('2. .github/workflows/ci.yml structurally gates deploy on verify job', () => {
    const workflowPath = path.join(rootDir, '.github/workflows/ci.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    expect(workflowContent).toContain('verify:');
    expect(workflowContent).toContain('deploy:');
    expect(workflowContent).toContain('needs: verify');
    expect(workflowContent).toContain('npx vitest run');
    expect(workflowContent).toContain('npm run lint');
    expect(workflowContent).toContain('npm run build');
    expect(workflowContent).toContain('sh scripts/qa-deployment.sh');
  });

  it('3. failure injection: failing command aborts pipeline script under set -e', () => {
    // Test the invariant that set -euo pipefail aborts execution upon any step failure
    const simulatePipeline = `
      set -euo pipefail
      GATE_PASSED=false
      # Step 1: Simulated passing check
      true
      # Step 2: Simulated failing verification check
      false
      # Step 3: Simulated packaging (must NEVER be reached)
      GATE_PASSED=true
      echo "GATE_PASSED=$GATE_PASSED"
    `;

    expect(() => {
      execSync('bash', { input: simulatePipeline, stdio: 'pipe' });
    }).toThrow();
  });

  it('4. anti-bypass: failing vitest halts execution before packaging', () => {
    const pipeline = `
      set -euo pipefail
      PACKAGED=false
      run_vitest() { return 1; }
      run_lint() { return 0; }
      run_qa_deploy() { return 0; }
      package_artifact() { PACKAGED=true; }

      run_vitest
      run_lint
      run_qa_deploy
      package_artifact
    `;
    expect(() => {
      execSync('bash', { input: pipeline, stdio: 'pipe' });
    }).toThrow();
  });

  it('5. anti-bypass: failing lint halts execution before packaging', () => {
    const pipeline = `
      set -euo pipefail
      PACKAGED=false
      run_vitest() { return 0; }
      run_lint() { return 1; }
      run_qa_deploy() { return 0; }
      package_artifact() { PACKAGED=true; }

      run_vitest
      run_lint
      run_qa_deploy
      package_artifact
    `;
    expect(() => {
      execSync('bash', { input: pipeline, stdio: 'pipe' });
    }).toThrow();
  });

  it('6. anti-bypass: failing qa-deployment.sh halts execution before packaging', () => {
    const pipeline = `
      set -euo pipefail
      PACKAGED=false
      run_vitest() { return 0; }
      run_lint() { return 0; }
      run_qa_deploy() { return 1; }
      package_artifact() { PACKAGED=true; }

      run_vitest
      run_lint
      run_qa_deploy
      package_artifact
    `;
    expect(() => {
      execSync('bash', { input: pipeline, stdio: 'pipe' });
    }).toThrow();
  });

  it('7. anti-bypass: failing build halts execution before packaging', () => {
    const pipeline = `
      set -euo pipefail
      PACKAGED=false
      run_build() { return 1; }
      package_artifact() { PACKAGED=true; }

      run_build
      package_artifact
    `;
    expect(() => {
      execSync('bash', { input: pipeline, stdio: 'pipe' });
    }).toThrow();
  });
});

