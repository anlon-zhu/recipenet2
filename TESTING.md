# Testing Setup Documentation

## Overview

This project uses a multi-tier testing approach:

- **Unit Tests**: Fast, mocked tests for business logic
- **Integration Tests**: Real API calls to test edge functions and external services
- **Database Tests**: Real database operations to test schema and data integrity

## Test Commands

```bash
# Run unit tests only (fast, mocked)
npm run test:unit

# Run integration tests (real API calls)
npm run test:integration

# Run database tests (real DB operations)
npm run test:db

# Run all tests
npm run test

# Watch mode for development
npm run test:watch
```

## Directory Structure

```
tests/
├── unit/                           # Unit tests with mocks
│   ├── jest.setup.ts              # Mock configuration for unit tests
│   ├── supabase.client.test.ts    # Example mocked Supabase tests
│   └── canonicalize.test.ts       # Mocked edge function tests
├── integration/                    # Integration tests with real APIs
│   ├── jest.setup.ts              # Real API configuration
│   ├── setup.ts                   # Shared test utilities
│   ├── canonicalize.integration.test.ts  # Real edge function tests
│   ├── recipesByPantry.test.ts    # Edge function integration tests
│   └── rpcFunctions.test.ts       # Database RPC function tests
├── db.schema.test.ts              # Database schema validation
└── db.seed.test.ts                # Database seeding tests
```

## Configuration Files

### `package.json` Jest Configuration

Uses Jest projects to separate test types:

- **unit**: Mocked tests with `tests/unit/jest.setup.ts`
- **integration**: Real API tests with `tests/integration/jest.setup.ts`  
- **db**: Database tests with minimal setup

### Environment Variables

- **Unit tests**: Use mocked clients, no real env vars needed
- **Integration/DB tests**: Load from `.env.local` via `dotenv -e .env.local`

## Test Setup Files

### `jest.setup.ts` (Root)
- Loads environment variables from `.env.local`
- Shared by all test types

### `tests/unit/jest.setup.ts`
- Mocks `global.fetch` for unit tests
- Mocks `@supabase/supabase-js` client
- Provides `createMockResponse` helper

### `tests/integration/jest.setup.ts`
- Ensures real `fetch` is available (Node 18+ or cross-fetch fallback)
- Sets longer timeout (30s) for real API calls
- No mocking - tests hit real services

## Writing Tests

### Unit Tests
```typescript
// tests/unit/my-feature.test.ts
import { createClient } from '@supabase/supabase-js';

// Supabase client is automatically mocked
const supabase = createClient('mock', 'mock');

test('should handle business logic', async () => {
  // Mock the response
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue({ data: [], error: null })
  });

  // Test your business logic
  const result = await myFunction();
  expect(result).toBeDefined();
});
```

### Integration Tests
```typescript
// tests/integration/my-feature.test.ts
import { supabase } from './setup';

test('should work with real API', async () => {
  // This hits the real Supabase instance
  const { data, error } = await supabase
    .from('ingredients')
    .select('id')
    .limit(1);

  expect(error).toBeNull();
  expect(data).toBeDefined();
}, 30000); // Longer timeout for real API calls
```

### Database Tests
```typescript
// tests/db.*.test.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('should validate schema', async () => {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id')
    .limit(1);
    
  expect(error).toBeNull();
});
```

## Current Status

✅ **Unit tests**: Working with mocked Supabase client  
✅ **Database tests**: Working with real DB from `.env.local`  
⚠️ **Integration tests**: Some edge function tests may fail if functions aren't deployed

## Troubleshooting

### "Cannot read properties of undefined (reading 'status')"
- This was caused by global fetch mocking in integration tests
- Fixed by removing global fetch mock from integration setup

### Edge function tests failing
- Integration tests for edge functions require the functions to be deployed
- If functions aren't deployed, tests will fail with `FunctionsHttpError`
- This is expected behavior for integration tests

### Environment variable issues
- Ensure `.env.local` exists with valid Supabase credentials
- Unit tests don't need real credentials (they're mocked)
- Integration and DB tests require real credentials

## Best Practices

1. **Unit tests**: Test business logic, mock external dependencies
2. **Integration tests**: Test real API interactions, expect failures if services aren't available
3. **Database tests**: Test schema and data integrity, use real DB
4. **Keep tests isolated**: Each test should be independent
5. **Use appropriate timeouts**: Longer for integration tests (30s), shorter for unit tests (5s default)