/**
 * Jest Setup File
 * Global test configuration and setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'DEBUG';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-32';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Increase Jest timeout for async tests
jest.setTimeout(10000);

// Global beforeAll hook
beforeAll(() => {
  // Any global setup
});

// Global afterAll hook
afterAll(() => {
  // Any global cleanup
});

// Suppress console output during tests (optional)
// Uncomment to suppress logs during test runs
// global.console = {
//   ...console,
//   log: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
