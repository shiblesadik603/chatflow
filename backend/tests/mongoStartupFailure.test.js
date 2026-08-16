import { spawnSync } from 'child_process';

// server.js's start() awaits connectDB() and calls process.exit(1) if it
// rejects (server.js:17-19) - can't exercise that in this process without
// killing the Jest worker, so this spawns a real, separate server process
// against a MongoDB it can never reach and checks how it dies. Different
// from envValidation.test.js's coverage: that proves a *missing* MONGO_URI
// fails config parsing before any connection attempt; this proves a
// *present but unreachable* MONGO_URI fails at the actual mongoose.connect()
// call in db.js, which is the code path server.js's catch block exists for.
describe('server fails fast when MongoDB is unreachable at startup', () => {
  it('logs the failure and exits with a non-zero code instead of listening', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-vm-modules', 'src/server.js'],
      {
        cwd: new URL('..', import.meta.url).pathname,
        env: {
          ...process.env,
          // Port 1 on localhost refuses the connection almost immediately
          // (nothing listens there) rather than timing out on an
          // unreachable network address - keeps the test fast.
          // serverSelectionTimeoutMS as a URI param overrides mongoose's
          // 30s default so spawnSync doesn't have to wait that long either.
          MONGO_URI: 'mongodb://127.0.0.1:1/chatflow_unreachable?serverSelectionTimeoutMS=1500',
          PORT: '5999', // never actually bound - connectDB() fails before listen() is reached
        },
        encoding: 'utf8',
        timeout: 10000,
      }
    );

    expect(result.status).toBe(1);
    // Winston's Console transport writes every level to stdout by default
    // (its stderrLevels option defaults to empty) - the failure log lands
    // there, not on stderr.
    expect(result.stdout).toContain('Failed to start server');
  });
});
