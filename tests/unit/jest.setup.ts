// Jest setup file for unit tests
// This file configures mocks for isolated unit testing

import { jest } from '@jest/globals';

// Type-safe fetch mock interface
interface MockResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

// Mock fetch globally for unit tests only
// Using type assertion to properly type the global fetch mock
(global as typeof globalThis & { fetch: jest.MockedFunction<typeof globalThis.fetch> }).fetch = jest.fn();

// Helper to create mock responses
export const createMockResponse = (data: unknown, ok = true, status = 200): MockResponse => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: async () => data,
  text: async () => JSON.stringify(data)
});

// Mock Supabase client for unit tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
        insert: jest.fn(() => Promise.resolve({ data: [], error: null })),
        update: jest.fn(() => Promise.resolve({ data: [], error: null })),
        delete: jest.fn(() => Promise.resolve({ data: [], error: null })),
        ilike: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      insert: jest.fn(() => Promise.resolve({ data: [], error: null })),
      update: jest.fn(() => Promise.resolve({ data: [], error: null })),
      delete: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
    functions: {
      invoke: jest.fn(() => Promise.resolve({ data: { error: 'Mocked error response' }, error: null }))
    }
  }))
}));

// Export for use in tests
export {};