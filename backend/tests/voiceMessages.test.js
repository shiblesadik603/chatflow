import http from 'http';
import request from 'supertest';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { UPLOAD_DIR } from '../src/services/storageService.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';
import fs from 'fs/promises';

let httpServer;

beforeAll(async () => {
  await connectTestDB();
  // Message creation broadcasts over Socket.IO now (see messageController.js).
  httpServer = http.createServer(app);
  initializeSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
});
afterEach(clearTestDB);
afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestRedis();
  await disconnectTestDB();
  await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
});

const auth = (token) => `Bearer ${token}`;

// A hand-built, valid, minimal WAV file - RIFF/WAVE/fmt/data chunk
// structure with silent audio data. file-type detects this reliably as
// audio/wav from the header alone, without needing to chase further
// chunks the way PNG's IHDR-and-beyond parsing does (see uploads.test.js).
const buildWavBuffer = () => {
  const dataBytes = Buffer.alloc(44, 0);
  return Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([36 + dataBytes.length, 0, 0, 0]),
    Buffer.from('WAVE'),
    Buffer.from('fmt '),
    Buffer.from([16, 0, 0, 0]),
    Buffer.from([1, 0]), // PCM
    Buffer.from([1, 0]), // mono
    Buffer.from([0x44, 0xac, 0, 0]), // 44100 Hz
    Buffer.from([0x88, 0x58, 0x01, 0]), // byte rate
    Buffer.from([2, 0]), // block align
    Buffer.from([16, 0]), // bits per sample
    Buffer.from('data'),
    Buffer.from([dataBytes.length, 0, 0, 0]),
    dataBytes,
  ]);
};

const WAV_BYTES = buildWavBuffer();

describe('POST /api/uploads/chat (voice)', () => {
  it('uploads a valid audio file with a duration', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'voice')
      .field('duration', '12.5')
      .attach('file', WAV_BYTES, 'recording.wav');

    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('audio/wav');
    expect(res.body.data.duration).toBe(12.5);
    expect(res.body.data.url).toMatch(/\.wav$/);
  });

  it('rejects a voice upload with no duration', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'voice')
      .attach('file', WAV_BYTES, 'recording.wav');

    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects a duration over the 10-minute cap', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'voice')
      .field('duration', '700')
      .attach('file', WAV_BYTES, 'recording.wav');

    expect(res.status).toBe(422);
  });

  it('rejects a non-audio file uploaded as type=voice', async () => {
    const { accessToken } = await createTestUser();
    const notAudio = Buffer.from('definitely not an audio file');

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'voice')
      .field('duration', '5')
      .attach('file', notAudio, 'fake.wav');

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('a voice upload can be attached to a real voice message end to end', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Voice' });
    const { user: bob } = await createTestUser({ name: 'Bob Voice' });

    const convoRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });
    const conversationId = convoRes.body.data.conversation._id;

    const uploadRes = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(aliceToken))
      .field('type', 'voice')
      .field('duration', '8.2')
      .attach('file', WAV_BYTES, 'voice-note.wav');

    const messageRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({
        messageType: 'voice',
        attachments: [
          {
            url: uploadRes.body.data.url,
            fileName: uploadRes.body.data.fileName,
            mimeType: uploadRes.body.data.mimeType,
            size: uploadRes.body.data.size,
            duration: uploadRes.body.data.duration,
          },
        ],
      });

    expect(messageRes.status).toBe(201);
    expect(messageRes.body.data.message.messageType).toBe('voice');
    expect(messageRes.body.data.message.attachments[0].duration).toBe(8.2);
  });
});
