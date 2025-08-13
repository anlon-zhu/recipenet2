-- Migration: Rename rpc_recipes_by_pantry to get_recipes_by_ingredients
-- This provides better naming consistency for the recipe matching API

-- Drop the old function
DROP FUNCTION IF EXISTS rpc_recipes_by_pantry(uuid[], float, int);

-- Create the renamed function with the same logic
CREATE OR REPLACE FUNCTION get_recipes_by_ingredients(
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

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_recipes_by_ingredients(uuid[], float, int) TO anon, authenticated;
