import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), 'functions-byo-weather/scripts/refuseHostedProject.mjs');

function run(env: NodeJS.ProcessEnv): { status: number; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [script], {
        env: {
          ...process.env,
          GCP_PROJECT: '',
          FIREBASE_PROJECT: '',
          GCLOUD_PROJECT: '',
          ...env,
        },
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('refuseHostedProject', () => {
  it('exits when no project is selected', () => {
    const result = run({
      GCLOUD_PROJECT: '',
      GCP_PROJECT: '',
      FIREBASE_PROJECT: '',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No Firebase project selected');
  });

  it('refuses the PUFworks hosted project', () => {
    const result = run({ GCLOUD_PROJECT: 'gen-lang-client-0444791425' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to deploy');
  });

  it('allows an owner project', () => {
    const result = run({ GCLOUD_PROJECT: 'my-walnut-farm' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('my-walnut-farm');
  });
});
