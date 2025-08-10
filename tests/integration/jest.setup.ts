// Jest setup file for integration tests
// This file configures the test environment for real API calls

import { jest } from '@jest/globals';

// Ensure fetch is available in Node.js environment
// Node 18+ has global fetch, but provide fallback if needed
if (!(global as typeof globalThis & { fetch?: typeof fetch }).fetch) {
  // Use cross-fetch as fallback for older Node versions
  import('cross-fetch').then((crossFetch) => {
    (global as typeof globalThis & { fetch: typeof fetch }).fetch = crossFetch.default;
  });
}

// Set longer timeout for integration tests that make real API calls
jest.setTimeout(30000);

// Export for use in tests
export {};
