-- Migration: Ingredient Matching API
-- Creates RPC functions for the new read/write flow API structure

-- 1) Get all ingredients and aliases for client-side caching (read flow)
CREATE OR REPLACE FUNCTION rpc_get_all_ingredients_for_matching()
RETURNS TABLE(
  ingredient_id uuid,
  ingredient_name text,
  alias_id uuid,
  alias_name text,
  food_group_name text
) AS $$
  -- Get all ingredients with their primary names
  SELECT 
    i.id as ingredient_id,
    i.name as ingredient_name,
    i.id as alias_id,  -- ingredient itself acts as an alias
    i.name as alias_name,
    fg.name as food_group_name
  FROM ingredients i
  LEFT JOIN food_groups fg ON fg.id = i.food_group_id
  
  UNION ALL
  
  -- Get all aliases
  SELECT 
    ia.ingredient_id,
    i.name as ingredient_name,
    ia.id as alias_id,
    ia.name as alias_name,
    fg.name as food_group_name
  FROM ingredient_aliases ia
  JOIN ingredients i ON i.id = ia.ingredient_id
  LEFT JOIN food_groups fg ON fg.id = i.food_group_id
  
  ORDER BY ingredient_name, alias_name;
$$ LANGUAGE sql STABLE;

-- 2) Enhanced vector search function (read flow fallback)
-- This replaces the existing rpc_vector_search_ingredients with better deduplication
CREATE OR REPLACE FUNCTION rpc_vector_search_ingredients(
  query_embedding vector(1536),
  match_count int DEFAULT 6
) RETURNS TABLE(
  ingredient_id uuid,
  ingredient_name text,
  best_alias text,
  alias_id uuid,
  distance float
) AS $$
  WITH alias_vectors AS (
    -- Get all ingredient aliases with embeddings
    SELECT 
      ia.id AS alias_id, 
      ia.name AS alias_name, 
      ia.embedding, 
      ia.ingredient_id
    FROM ingredient_aliases ia
    WHERE ia.embedding IS NOT NULL
    
    UNION ALL
    
    -- Get all ingredients with embeddings (they act as their own aliases)
    SELECT 
      i.id AS alias_id, 
      i.name AS alias_name, 
      i.embedding, 
      i.id AS ingredient_id
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
    LIMIT (match_count * 10) -- Get more candidates for better deduplication
  ),
  best_per_ingredient AS (
    SELECT DISTINCT ON (ingredient_id)
      ingredient_id,
      alias_id,
      alias_name,
      dist
    FROM scored
    ORDER BY ingredient_id, dist -- Best match per ingredient
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

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION rpc_get_all_ingredients_for_matching() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_vector_search_ingredients(vector(1536), int) TO anon, authenticated;
