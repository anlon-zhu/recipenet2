# Recipe Graph API Setup

This document describes the production-ready API implementation for the Recipe Graph system, featuring RPC functions and Edge Functions that expose your hierarchical ingredient database to frontend applications.

## Overview

The API consists of:
- **4 RPC Functions** (Postgres stored procedures) for core database operations
- **3 Edge Functions** (Deno/TypeScript) for HTTP endpoints with Gemini AI integration
- **Comprehensive Jest integration tests** for quality assurance

## Architecture

```
Frontend Application
        ↓
Edge Functions (HTTP APIs)
        ↓
RPC Functions (Postgres)
        ↓
Hierarchical Ingredient Database
```

## RPC Functions (Database Layer)

### 1. `rpc_vector_search_ingredients`

**Purpose**: Vector search across ingredients and aliases with deduplication by canonical ingredient.

```sql
SELECT * FROM rpc_vector_search_ingredients(
  query_embedding := '[1536-dimensional vector]',
  match_count := 6
);
```

**Returns**: `ingredient_id`, `ingredient_name`, `best_alias`, `alias_id`, `distance`

### 2. `rpc_recipes_by_pantry`

**Purpose**: Find recipes based on pantry ingredients with coverage metadata.

```sql
SELECT * FROM rpc_recipes_by_pantry(
  pantry_ids := ARRAY['uuid1', 'uuid2']::uuid[],
  min_coverage := 0.8,
  limit_count := 100
);
```

**Returns**: `recipe_id`, `title`, `required_count`, `matched_count`, `coverage`, `missing_ingredient_ids`

### 3. `rpc_suggest_missing_ingredients`

**Purpose**: Suggest ingredients that would unlock the most recipes.

```sql
SELECT * FROM rpc_suggest_missing_ingredients(
  pantry_ids := ARRAY['uuid1', 'uuid2']::uuid[],
  limit_count := 10
);
```

**Returns**: `ingredient_id`, `name`, `unlocks`

## Edge Functions (HTTP Layer)

### 1. `canonicalizeIngredient`

**Endpoint**: `POST /functions/v1/canonicalizeIngredient`

**Purpose**: Canonicalize ingredient names using Gemini embeddings.

**Request**:
```json
{
  "name": "boneless chicken breast",
  "topN": 6
}
```

**Response**:
```json
[
  {
    "ingredient_id": "uuid-1",
    "ingredient_name": "Chicken",
    "best_alias": "boneless chicken breast",
    "alias_id": "alias-uuid",
    "distance": 0.06,
    "parents": []
  }
]
```

### 2. `recipesByPantry`

**Endpoint**: `POST /functions/v1/recipesByPantry`

**Purpose**: Find recipes matching pantry ingredients.

**Request**:
```json
{
  "pantry_ids": ["uuid1", "uuid2"],
  "min_coverage": 0.8,
  "limit": 50
}
```

## Environment Variables

Required environment variables for Edge Functions:

```bash
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
```

## Deployment Instructions

### Prerequisites

1. **Supabase CLI** installed and authenticated
2. **Gemini API Key** from Google AI Studio
3. **Environment variables** configured

### Step 1: Deploy RPC Functions

```bash
# Apply the migration with RPC functions
supabase db reset

# Or apply specific migration
supabase db push
```

### Step 2: Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy canonicalizeIngredient
supabase functions deploy recipesByPantry
supabase functions deploy addOrMapIngredient

# Set environment variables
supabase secrets set GEMINI_API_KEY=your-key-here
```

### Step 3: Test Deployment

```bash
# Run integration tests
npm run test:integration

# Test individual endpoints
curl -X POST "https://your-project.supabase.co/functions/v1/canonicalizeIngredient" \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"chicken breast","topN":3}'
```

## Testing

The project includes comprehensive integration tests:

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run tests in watch mode
npm run test:watch
```

## Performance Considerations

- Vector indexes are optimized with `ivfflat` for fast similarity search
- Results are paginated and limited to prevent overwhelming responses
- Edge Functions include proper CORS headers and error handling
- Gemini API calls use appropriate task types (RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT)

## Security

- Row Level Security (RLS) is enabled on all tables
- Service role key is used only in Edge Functions (server-side)
- Input validation prevents SQL injection and malformed requests
- UUID validation ensures data integrity
