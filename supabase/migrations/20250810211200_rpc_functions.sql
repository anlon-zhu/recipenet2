-- Migration: RPC Functions for Recipe Graph API
-- Creates production-ready Postgres functions for ingredient search, recipe matching, and suggestions

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 1) Vector search for ingredients with deduplication by canonical ingredient
CREATE OR REPLACE FUNCTION rpc_vector_search_ingredients(
  query_embedding vector(1536),
  match_count int
) RETURNS TABLE(
  ingredient_id uuid,
  ingredient_name text,
  best_alias text,
  alias_id uuid,
  distance float
) AS $$
  WITH alias_vectors AS (
    SELECT ia.id AS alias_id, ia.name AS alias_name, ia.embedding, ia.ingredient_id
    FROM ingredient_aliases ia
    WHERE ia.embedding IS NOT NULL
    UNION ALL
    SELECT i.id AS alias_id, i.name AS alias_name, i.embedding, i.id AS ingredient_id
    FROM ingredients i
    WHERE i.embedding IS NOT NULL
  ),
  scored AS (
    SELECT
      av.ingredient_id,
      av.alias_id,
      av.alias_name,
      av.embedding <-> query_embedding AS dist
    FROM alias_vectors av
    ORDER BY dist
    LIMIT (match_count * 10) -- narrow candidates first, then group
  ),
  best_per_ingredient AS (
    SELECT DISTINCT ON (ingredient_id)
      ingredient_id,
      alias_id,
      alias_name,
      dist
    FROM scored
    ORDER BY ingredient_id, dist
  )
  SELECT
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    bpi.alias_name AS best_alias,
    bpi.alias_id AS alias_id,
    bpi.dist AS distance
  FROM best_per_ingredient bpi
  JOIN ingredients i ON i.id = bpi.ingredient_id
  ORDER BY bpi.dist
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- 2) Find recipes by pantry ingredients with coverage metadata
CREATE OR REPLACE FUNCTION rpc_recipes_by_pantry(
  pantry_ids uuid[],
  min_coverage float DEFAULT 1.0,
  limit_count int DEFAULT 100
) RETURNS TABLE(
  recipe_id uuid,
  title text,
  required_count int,
  matched_count int,
  coverage float,
  missing_ingredient_ids uuid[]
) AS $$
  SELECT
    r.id as recipe_id,
    r.title,
    req.total_required as required_count,
    COALESCE(matched.matched_count, 0) as matched_count,
    COALESCE(matched.matched_count::float / req.total_required::float, 0) as coverage,
    COALESCE(missing.missing_ids, ARRAY[]::uuid[]) as missing_ingredient_ids
  FROM recipes r
  JOIN (
    SELECT recipe_id, COUNT(*) as total_required
    FROM recipe_ingredients
    GROUP BY recipe_id
  ) req ON req.recipe_id = r.id
  LEFT JOIN (
    SELECT ri.recipe_id, COUNT(*) as matched_count
    FROM recipe_ingredients ri
    WHERE ri.ingredient_id = ANY (pantry_ids)
    GROUP BY ri.recipe_id
  ) matched ON matched.recipe_id = r.id
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(ri.ingredient_id) FILTER (WHERE ri.ingredient_id <> ALL (pantry_ids)) as missing_ids
    FROM recipe_ingredients ri
    WHERE ri.recipe_id = r.id
  ) missing ON TRUE
  WHERE COALESCE(matched.matched_count::float / req.total_required::float, 0) >= min_coverage
  ORDER BY coverage DESC, matched_count DESC
  LIMIT limit_count;
$$ LANGUAGE sql STABLE;

-- 3) Suggest missing ingredients that would unlock the most recipes
CREATE OR REPLACE FUNCTION rpc_suggest_missing_ingredients(
  pantry_ids uuid[],
  limit_count int DEFAULT 10
) RETURNS TABLE(
  ingredient_id uuid,
  name text,
  unlocks int
) AS $$
  WITH pantry_recipes AS (
    -- Find recipes where we have all but one ingredient
    SELECT 
      r.id as recipe_id,
      array_agg(ri.ingredient_id) as required_ingredients
    FROM recipes r
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    GROUP BY r.id
    HAVING COUNT(*) FILTER (WHERE ri.ingredient_id = ANY(pantry_ids)) = COUNT(*) - 1
  ),
  expanded_missing AS (
    SELECT 
      pr.recipe_id,
      unnest(pr.required_ingredients) as ingredient_id
    FROM pantry_recipes pr
  ),
  missing_ingredient_counts AS (
    SELECT 
      em.ingredient_id as missing_ingredient_id,
      COUNT(*) as unlock_count
    FROM expanded_missing em
    WHERE NOT (em.ingredient_id = ANY(pantry_ids))
    GROUP BY em.ingredient_id
  )
  SELECT 
    i.id as ingredient_id,
    i.name,
    COALESCE(mic.unlock_count, 0) as unlocks
  FROM missing_ingredient_counts mic
  JOIN ingredients i ON i.id = mic.missing_ingredient_id
  ORDER BY mic.unlock_count DESC, i.name
  LIMIT limit_count;
$$ LANGUAGE sql STABLE;

-- 4) Get ingredient parent hierarchy
CREATE OR REPLACE FUNCTION rpc_get_ingredient_parents(child_id uuid)
RETURNS TABLE(parent_id uuid, parent_name text) AS $$
  SELECT p.parent_id, i.name as parent_name
  FROM ingredient_parents p
  JOIN ingredients i ON i.id = p.parent_id
  WHERE p.child_id = child_id
  ORDER BY i.name;
$$ LANGUAGE sql STABLE;

-- 5) Get ingredient children (useful for expanding searches)
CREATE OR REPLACE FUNCTION rpc_get_ingredient_children(parent_id uuid)
RETURNS TABLE(child_id uuid, child_name text) AS $$
  SELECT p.child_id, i.name as child_name
  FROM ingredient_parents p
  JOIN ingredients i ON i.id = p.child_id
  WHERE p.parent_id = parent_id
  ORDER BY i.name;
$$ LANGUAGE sql STABLE;

-- Create optimized indexes for vector operations
CREATE INDEX IF NOT EXISTS idx_ingredients_embedding 
ON ingredients USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_embedding 
ON ingredient_aliases USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id 
ON recipe_ingredients (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id 
ON recipe_ingredients (recipe_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_parents_child_id 
ON ingredient_parents (child_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_parents_parent_id 
ON ingredient_parents (parent_id);

-- Enable RLS (Row Level Security) for production
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_groups ENABLE ROW LEVEL SECURITY;

-- Create policies for read access (adjust as needed for your auth requirements)
CREATE POLICY "Enable read access for all users" ON ingredients FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON ingredient_aliases FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON ingredient_parents FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON food_groups FOR SELECT USING (true);
