import { spawn } from 'child_process';

// server.js's shutdown() (Phase 25) closes Socket.IO, drains the HTTP
// server, then disconnects Redis and Mongo before exiting - can't exercise
// that from inside this Jest process without killing the worker, so this
// spawns a real, separate server process, waits for it to actually finish
// booting, sends it a real SIGTERM, and checks both how fast and how
// cleanly it dies. Manually verified live (including with an active
// WebSocket connection open across the signal) while building this; this
// persists that same proof as something CI runs on every change instead of
// something that only happened once, by hand, in a terminal.
describe('graceful shutdown', () => {
  it('exits cleanly and quickly on SIGTERM, after logging the full shutdown sequence', async () => {
    const child = spawn(process.execPath, ['--experimental-vm-modules', 'src/server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: '5998', // distinct from both the real dev server (5001) and mongoStartupFailure's port
        MONGO_URI: 'mongodb://127.0.0.1:27017/chatflow_shutdown_test',
        // A distinct logical database from the rest of the suite's db 1 -
        // this spawns a real server that runs its own Socket.IO Redis
        // adapter (pub/sub) concurrently with every other test file still
        // running against db 1, and sharing it caused real cross-talk: a
        // "Connection is closed" error thrown from inside ioredis's own
        // event handler, after all assertions had already passed, in a
        // completely unrelated test file. Isolating this test's Redis
        // activity the same way the whole suite is already isolated from
        // dev's db 0 fixed it - same reasoning, one level deeper.
        REDIS_URL: 'redis://127.0.0.1:6379/2',
      },
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    // Wait for the actual "listening" log line rather than a fixed delay -
    // sending SIGTERM before the server finishes booting would test an
    // entirely different (and irrelevant) code path.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server did not start within 10s')), 10000);
      const check = () => {
        if (stdout.includes('ChatFlow API listening')) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on('data', check);
    });

    const shutdownStarted = Date.now();
    child.kill('SIGTERM');

    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Process did not exit within 10s of SIGTERM')), 10000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    const shutdownDuration = Date.now() - shutdownStarted;

    expect(exitCode).toBe(0);
    // Comfortably under the 10s force-exit timeout in server.js - proves
    // this took the graceful path, not the force-kill fallback.
    expect(shutdownDuration).toBeLessThan(5000);
    expect(stdout).toContain('SIGTERM received, shutting down gracefully');
    expect(stdout).toContain('Shutdown complete');
  }, 25000);
});
