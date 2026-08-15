import mongoose from 'mongoose';

// Deliberately a separate database from the app's own env config, so
// running the test suite never touches real dev data.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatflow_test';

export const connectTestDB = () => mongoose.connect(TEST_DB_URI);

export const clearTestDB = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

export const disconnectTestDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
