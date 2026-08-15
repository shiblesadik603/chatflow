import http from 'http';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

let httpServer;
let port;

beforeAll(async () => {
  await connectTestDB();

  httpServer = http.createServer(app);
  initializeSocket(httpServer);

  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterEach(clearTestDB);

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  // initializeSocket() now pulls in presenceHandlers -> the Redis client,
  // so every socket test file needs to close it too, or Jest hangs
  // afterward waiting for that open TCP handle to go away.
  await disconnectTestRedis();
  await disconnectTestDB();
});

const connect = (token) =>
  ioClient(`http://localhost:${port}`, {
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });

// Waits for either a successful connection or a connect_error, whichever
// fires first, and resolves with which one it was.
const waitForOutcome = (socket) =>
  new Promise((resolve) => {
    socket.once('connect', () => resolve({ ok: true }));
    socket.once('connect_error', (err) => resolve({ ok: false, err }));
  });

describe('Socket.IO authentication', () => {
  it('rejects a connection with no token', async () => {
    const socket = connect(undefined);
    const outcome = await waitForOutcome(socket);

    expect(outcome.ok).toBe(false);
    expect(outcome.err.data.code).toBe('NOT_AUTHENTICATED');
    socket.close();
  });

  it('rejects a garbage token', async () => {
    const socket = connect('not-a-real-jwt');
    const outcome = await waitForOutcome(socket);

    expect(outcome.ok).toBe(false);
    expect(outcome.err.data.code).toBe('INVALID_TOKEN');
    socket.close();
  });

  it('rejects an expired token', async () => {
    const { user } = await createTestUser();
    const expiredToken = jwt.sign({ sub: user._id }, env.JWT_SECRET, { expiresIn: '-10s' });

    const socket = connect(expiredToken);
    const outcome = await waitForOutcome(socket);

    expect(outcome.ok).toBe(false);
    expect(outcome.err.data.code).toBe('TOKEN_EXPIRED');
    socket.close();
  });

  it('rejects a token for a user that no longer exists', async () => {
    const { user, accessToken } = await createTestUser();
    await User.deleteOne({ _id: user._id });

    const socket = connect(accessToken);
    const outcome = await waitForOutcome(socket);

    expect(outcome.ok).toBe(false);
    expect(outcome.err.data.code).toBe('NOT_AUTHENTICATED');
    socket.close();
  });

  it('never trusts a client-supplied userId - only the token decides identity', async () => {
    const { user, accessToken } = await createTestUser();
    const { user: otherUser } = await createTestUser();

    // A malicious or buggy client claims to be someone else in the same
    // handshake payload that carries the real token.
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: accessToken, userId: otherUser._id },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });

    const authenticated = await new Promise((resolve, reject) => {
      socket.once('authenticated', resolve);
      socket.once('connect_error', reject);
    });

    expect(authenticated.userId).toBe(user._id.toString());
    expect(authenticated.userId).not.toBe(otherUser._id.toString());
    socket.close();
  });

  it('accepts a valid token and reports the correct authenticated userId', async () => {
    const { user, accessToken } = await createTestUser();

    const socket = connect(accessToken);
    const authenticated = await new Promise((resolve, reject) => {
      socket.once('authenticated', resolve);
      socket.once('connect_error', reject);
    });

    expect(authenticated.userId).toBe(user._id.toString());
    socket.close();
  });

  it('allows the same user to hold multiple simultaneous connections (multi-device)', async () => {
    const { user, accessToken } = await createTestUser();

    const socketA = connect(accessToken);
    const socketB = connect(accessToken);

    const [authA, authB] = await Promise.all([
      new Promise((resolve) => socketA.once('authenticated', resolve)),
      new Promise((resolve) => socketB.once('authenticated', resolve)),
    ]);

    expect(authA.userId).toBe(user._id.toString());
    expect(authB.userId).toBe(user._id.toString());
    expect(socketA.id).not.toBe(socketB.id); // two distinct socket connections

    socketA.close();
    socketB.close();
  });
});
