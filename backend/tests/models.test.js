import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';

// Connects directly to a separate `chatflow_test` database - deliberately
// bypassing the app's own env config so these tests never touch dev data.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatflow_test';

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('User model', () => {
  it('rejects a duplicate email', async () => {
    await User.create({ name: 'Ada', email: 'ada@example.com', password: 'password123' });

    await expect(
      User.create({ name: 'Ada 2', email: 'ada@example.com', password: 'password123' })
    ).rejects.toThrow(/duplicate key|E11000/);
  });

  it('never serializes the password field', async () => {
    const user = await User.create({ name: 'Grace', email: 'grace@example.com', password: 'password123' });
    expect(JSON.parse(JSON.stringify(user)).password).toBeUndefined();
  });
});

describe('Conversation model', () => {
  it('prevents two private conversations for the same pair of users, regardless of participant order', async () => {
    const userA = await User.create({ name: 'User A', email: 'a@example.com', password: 'password123' });
    const userB = await User.create({ name: 'User B', email: 'b@example.com', password: 'password123' });

    await Conversation.create({ type: 'private', participants: [userA._id, userB._id] });

    // Simulates the two-clicks-at-once race condition: the second request
    // builds the participants array in reversed order.
    await expect(
      Conversation.create({ type: 'private', participants: [userB._id, userA._id] })
    ).rejects.toThrow(/duplicate key|E11000/);
  });

  it('allows multiple group conversations for the same pair of users', async () => {
    const userA = await User.create({ name: 'User A', email: 'a2@example.com', password: 'password123' });
    const userB = await User.create({ name: 'User B', email: 'b2@example.com', password: 'password123' });

    const convo1 = await Conversation.create({ type: 'group', participants: [userA._id, userB._id] });
    const convo2 = await Conversation.create({ type: 'group', participants: [userA._id, userB._id] });

    expect(convo1._id).not.toEqual(convo2._id);
  });
});
