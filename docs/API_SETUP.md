# Ingredient & Recipe API

## Overview

Users interact with **ingredients** and **recipes** in two main ways:

1. **Read flows** (search & match):
   * Adding ingredients to their pantry
   * Searching for recipes by ingredients
   * Filling in recipe ingredients during creation/edit
   * These use cached client-side matching + RPC fallback for vector search

2. **Write flows** (map or create):
   * Mapping messy user-entered text to an existing ingredient (via alias)
   * Creating new ingredients when no match exists
   * These use the shared matching helper + one unified API endpoint with an `action` flag

---

## Database Schema

**Tables**:
* `ingredients`
* `ingredient_aliases`
* `food_groups`
* `recipes`
* `recipe_ingredients`

---

## API Layers

### 1. **Standard Supabase REST (CRUD)**

Supabase auto-generates REST endpoints for all tables. These cover basic CRUD when no AI/matching logic is required.

| Method | Endpoint                  | Description                   |
| ------ | ------------------------- | ----------------------------- |
| GET    | /ingredients              | List all ingredients          |
| POST   | /ingredients              | Create a new ingredient       |
| PATCH  | /ingredients/:id          | Update an existing ingredient |
| DELETE | /ingredients/:id          | Delete an ingredient          |
| GET    | /ingredient_aliases       | List all ingredient aliases   |
| POST   | /ingredient_aliases       | Create a new ingredient alias |
| PATCH  | /ingredient_aliases/:id   | Update alias                  |
| DELETE | /ingredient_aliases/:id   | Delete alias                  |
| GET    | /recipes                  | List recipes                  |
| POST   | /recipes                  | Create recipe                 |
| PATCH  | /recipes/:id              | Update recipe                 |
| DELETE | /recipes/:id              | Delete recipe                 |
| GET    | /recipe_ingredients       | List recipe-ingredient links  |
| POST   | /recipe_ingredients       | Add ingredient to recipe      |

---

### 2. **RPC Functions (Database Layer)**

RPCs run inside Postgres for efficiency & complex queries.

#### a. `rpc_get_all_ingredients_for_matching` *(read)*

Returns all ingredients + aliases in one payload for client-side filtering.

* **Purpose**: Initial cache load at app startup
* **Output**: `(ingredient_id, ingredient_name, alias_id, alias_name, food_group_name)`

#### b. `rpc_vector_search_ingredients` *(read)*

Fallback search using embeddings when client cache fails to find a match.

* **Purpose**: Fuzzy AI matching in <500ms
* **Input**: `query_embedding vector(1536)`, `match_count int`

---

### 3. **Edge Functions (HTTP Layer)**

Edge Functions handle AI calls, multi-step transactions, and logic that can't live in the DB.

#### a. `match_ingredient_text` *(read)*

* **Purpose**: Use AI + DB to return best ingredient/alias matches for messy input
* **Flow**:
  1. Normalize text (case, whitespace, spelling)
  2. Vector embed via shared embedding function
  3. Run `rpc_vector_search_ingredients`
  4. Return ranked candidates (no DB changes)

#### b. `upsert_from_text` *(write)*

* **Purpose**: From messy text, either map to existing ingredient or create new one
* **Input**:

```json
{
  "text": "chikn breast",
  "action": "map",                  // "map" or "create"
  "ingredient_id": "uuid-optional"  // required for "map"
}
```

* **Flow**:
  1. Normalize + embed text
  2. If `action="map"` → insert alias row linked to `ingredient_id`
  3. If `action="create"` → insert into `ingredients`, insert alias if needed, store embedding
  4. Return final `(ingredient_id, alias_id)`

#### c. `create_recipe_with_embeddings` *(write)* — optional

* **Purpose**: One-shot recipe + ingredient linking with embeddings
* **Useful**: Bulk import or guided recipe creation wizard

#### d. `get_recipes_by_ingredients` *(read)*

* **Purpose**: Get recipes by ingredient IDs
* **Input**: `ingredient_ids` array
* **Output**: Array of recipes with coverage metadata

---

## End-to-End User Flow Mapping

**When user types an ingredient**:

1. Client filters from cached `rpc_get_all_ingredients_for_matching` data
2. If empty → `match_ingredient_text` Edge Function → RPC vector search fallback
3. User sees swipe UI:
   * ✅ Match → call `upsert_from_text` with `action="map"`
   * ❌ No match → call `upsert_from_text` with `action="create"`

**When user creates or edits recipe**:

* Use the same flow for each ingredient line
* If multiple ingredients are new → call `create_recipe_with_embeddings` for efficiency

**When user searches for recipes**:

1. Client searches for recipes from list of ingredients
2. Use the same flow for each ingredient line
3. After getting ingredient IDs, call `get_recipes_by_ingredients`
4. Return recipes with coverage metadata

---

## Implementation Overview

* **DB Schema**: Tables + indexes from v1.0
* **REST**: Supabase auto-generated CRUD
* **RPCs**:
  * `rpc_get_all_ingredients_for_matching`
  * `rpc_vector_search_ingredients`
* **Edge Functions**:
  * `match_ingredient_text`
  * `upsert_from_text`
  * `create_recipe_with_embeddings`
  * `get_recipes_by_ingredients`