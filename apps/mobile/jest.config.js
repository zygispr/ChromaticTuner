/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // pnpm stores real files under node_modules/.pnpm/<name>@<version>/..., so the
  // conventional "node_modules/(?!react-native|expo|...)" pattern never matches
  // and React Native's own ESM Jest preset goes untransformed. Matching the
  // package name anywhere in the path works under both pnpm and npm layouts.
  // pitchy and fft.js are ESM-only, so they need transforming for Jest too.
  transformIgnorePatterns: [
    'node_modules/(?!.*(react-native|@react-native|expo|@expo|@chromatic-tuner|@testing-library|pitchy|fft\\.js))',
  ],
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  passWithNoTests: true,
};
