import http from 'http';
import fs from 'fs/promises';
import request from 'supertest';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { UPLOAD_DIR } from '../src/services/storageService.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

let httpServer;

beforeAll(async () => {
  await connectTestDB();
  // Message creation broadcasts over Socket.IO now (see messageController.js),
  // so getIO() needs a real Server instance even though this file's tests
  // only exercise the REST layer.
  httpServer = http.createServer(app);
  initializeSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
});
afterEach(clearTestDB);
afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestRedis();
  await disconnectTestDB();
  await fs.rm(UPLOAD_DIR, { recursive: true, force: true }); // uploads-test/, never the real uploads/
});

const auth = (token) => `Bearer ${token}`;

// Real file signatures ("magic numbers") - enough for file-type to detect
// the format without needing a fully valid, decodable file. PNG needs more
// than its 8-byte signature, though: file-type also parses the chunk
// structure that follows - it keeps reading past IHDR, so trailing bytes
// aren't ignored padding, they're interpreted as the next chunk's declared
// length. Zeroed padding parses as a harmless trivial chunk; non-zero
// padding (0xAA, say) reads as an enormous invalid chunk length and fails
// detection entirely - discovered by hitting exactly that while writing
// this test, which is itself a good demonstration of how much more this
// detector does than a naive "check the first N bytes" implementation.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
  Buffer.from([0x00, 0x00, 0x00, 0x0d]), // IHDR chunk length (13 bytes)
  Buffer.from('IHDR'),
  Buffer.alloc(13, 0), // IHDR payload (width/height/bit depth/etc - zeroed, unused by the detector)
  Buffer.alloc(4, 0), // CRC (unused by the detector)
  Buffer.alloc(50, 0), // trailing padding - must stay zero, see note above
]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 0x00)]);
const PLAIN_TEXT_BYTES = Buffer.from('just some plain text, not a real image at all');

describe('POST /api/uploads/avatar', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/uploads/avatar').attach('avatar', PNG_BYTES, 'pic.png');
    expect(res.status).toBe(401);
  });

  it('rejects a request with no file', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app).post('/api/uploads/avatar').set('Authorization', auth(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('NO_FILE');
  });

  it('uploads a valid PNG and updates the user avatar', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/avatar')
      .set('Authorization', auth(accessToken))
      .attach('avatar', PNG_BYTES, 'profile.png');

    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toMatch(/^http:\/\/localhost:5001\/uploads\/.+\.png$/);

    const filename = res.body.data.user.avatar.split('/uploads/')[1];
    const stat = await fs.stat(`${UPLOAD_DIR}/${filename}`);
    expect(stat.isFile()).toBe(true);
  });

  it('rejects a file whose real content does not match its claimed type - never trusts client MIME type', async () => {
    const { accessToken } = await createTestUser();

    // Uploaded with an image filename/field, but the actual bytes are
    // plain text - a lying Content-Type header must not be enough.
    const res = await request(app)
      .post('/api/uploads/avatar')
      .set('Authorization', auth(accessToken))
      .attach('avatar', PLAIN_TEXT_BYTES, { filename: 'totally-a-photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file over the size limit', async () => {
    const { accessToken } = await createTestUser();
    const oversized = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(6 * 1024 * 1024, 0xaa), // 6MB, over the 5MB avatar limit
    ]);

    const res = await request(app)
      .post('/api/uploads/avatar')
      .set('Authorization', auth(accessToken))
      .attach('avatar', oversized, 'huge.png');

    expect(res.status).toBe(413);
    expect(res.body.errorCode).toBe('FILE_TOO_LARGE');
  });

  it('deletes the previous avatar file when a new one is uploaded', async () => {
    const { accessToken } = await createTestUser();

    const first = await request(app)
      .post('/api/uploads/avatar')
      .set('Authorization', auth(accessToken))
      .attach('avatar', PNG_BYTES, 'first.png');
    const firstFilename = first.body.data.user.avatar.split('/uploads/')[1];

    await request(app)
      .post('/api/uploads/avatar')
      .set('Authorization', auth(accessToken))
      .attach('avatar', PNG_BYTES, 'second.png');

    await expect(fs.stat(`${UPLOAD_DIR}/${firstFilename}`)).rejects.toThrow();
  });
});

describe('POST /api/uploads/chat', () => {
  it('uploads a valid PDF as a document and returns attachment metadata', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'document')
      .attach('file', PDF_BYTES, 'report.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('application/pdf');
    expect(res.body.data.fileName).toBe('report.pdf');
    expect(res.body.data.url).toMatch(/\.pdf$/);
  });

  it('uploads a valid PNG as an image', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'image')
      .attach('file', PNG_BYTES, 'photo.png');

    expect(res.status).toBe(201);
    expect(res.body.data.mimeType).toBe('image/png');
  });

  it('rejects content/category mismatch - a PDF uploaded as type=image', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'image')
      .attach('file', PDF_BYTES, 'sneaky.png');

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('sanitizes a path-traversal attempt in the display filename', async () => {
    const { accessToken } = await createTestUser();

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'image')
      .attach('file', PNG_BYTES, '../../etc/passwd.png');

    expect(res.status).toBe(201);
    expect(res.body.data.fileName).not.toContain('..');
    expect(res.body.data.fileName).not.toContain('/');
  });

  it('the returned URL can immediately be attached to a real message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Upload' });
    const { user: bob } = await createTestUser({ name: 'Bob Upload' });

    const convoRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });
    const conversationId = convoRes.body.data.conversation._id;

    const uploadRes = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(aliceToken))
      .field('type', 'image')
      .attach('file', PNG_BYTES, 'shared.png');

    const messageRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({
        messageType: 'image',
        attachments: [
          {
            url: uploadRes.body.data.url,
            fileName: uploadRes.body.data.fileName,
            mimeType: uploadRes.body.data.mimeType,
            size: uploadRes.body.data.size,
          },
        ],
      });

    expect(messageRes.status).toBe(201);
    expect(messageRes.body.data.message.attachments[0].url).toBe(uploadRes.body.data.url);
  });

  it('rejects unrecognizable binary data claiming to be a document (not plausibly text either)', async () => {
    const { accessToken } = await createTestUser();
    // Random bytes including null bytes - not a recognized document
    // format, and not plausibly plain text either (the fallback in
    // fileValidation.js requires no null bytes to accept it as text).
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10, 0x20, 0x00]);

    const res = await request(app)
      .post('/api/uploads/chat')
      .set('Authorization', auth(accessToken))
      .field('type', 'document')
      .attach('file', garbage, 'mystery.bin');

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
  });
});

describe('storageService.deleteFileByUrl edge cases', () => {
  it('is a no-op for a URL that is not one of our own local files', async () => {
    const { deleteFileByUrl } = await import('../src/services/storageService.js');
    // Should resolve without throwing, even though this was never saved.
    await expect(deleteFileByUrl('https://cdn.example.com/some-other-file.png')).resolves.toBeUndefined();
  });

  it('is a no-op for an empty/missing URL', async () => {
    const { deleteFileByUrl } = await import('../src/services/storageService.js');
    await expect(deleteFileByUrl('')).resolves.toBeUndefined();
    await expect(deleteFileByUrl(undefined)).resolves.toBeUndefined();
  });

  it('silently succeeds when the file is already gone (ENOENT is swallowed)', async () => {
    const { deleteFileByUrl } = await import('../src/services/storageService.js');
    const { env } = await import('../src/config/env.js');
    // A well-formed URL under our own uploads path, but nothing was ever
    // written at this filename.
    const neverExisted = `${env.PUBLIC_URL}/uploads/00000000-0000-0000-0000-000000000000.png`;
    await expect(deleteFileByUrl(neverExisted)).resolves.toBeUndefined();
  });
});
