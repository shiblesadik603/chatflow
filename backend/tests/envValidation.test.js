import { spawnSync } from 'child_process';

// env.js calls process.exit(1) on invalid config - can't test that in this
// process (it would kill the Jest worker), so this spawns a real, separate
// node process with deliberately broken env vars and checks how it dies.
describe('environment validation fails fast on bad config', () => {
  it('exits with a non-zero code and a clear message when a required var is missing', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-vm-modules', '-e', "import('./src/config/env.js')"],
      {
        cwd: new URL('..', import.meta.url).pathname,
        env: {
          ...process.env,
          // Deliberately omit MONGO_URI/JWT_SECRET/REFRESH_TOKEN_SECRET -
          // all required with no default.
          MONGO_URI: '',
          JWT_SECRET: '',
          REFRESH_TOKEN_SECRET: '',
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid environment variables');
  });

  it('starts cleanly when required vars are present', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-vm-modules', '-e', "import('./src/config/env.js').then(() => console.log('OK'))"],
      {
        cwd: new URL('..', import.meta.url).pathname,
        env: {
          ...process.env,
          MONGO_URI: 'mongodb://127.0.0.1:27017/chatflow_env_check',
          JWT_SECRET: 'a'.repeat(32),
          REFRESH_TOKEN_SECRET: 'b'.repeat(32),
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK');
  });
});
