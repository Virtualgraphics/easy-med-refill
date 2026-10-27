// expo-crypto needs a native module; use Node's UUIDs in tests.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));
