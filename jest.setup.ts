// expo-crypto needs a native module; use Node's implementations in tests.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytes: (length: number) => new Uint8Array(nodeCrypto.randomBytes(length)),
  };
});

// expo-localization is native; tests run in English.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-GB' }],
}));
