module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  roots: ['<rootDir>', '<rootDir>/tests'],
  collectCoverageFrom: ['server/**/*.js', '!server/**/tests/**'],
  coverageDirectory: '<rootDir>/coverage',
  setupFiles: ['dotenv/config'],
  resetMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^redis$': '<rootDir>/__mocks__/redis.js'
  }
};