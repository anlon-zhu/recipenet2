-- Fix the rpc_get_ingredient_parents function
-- The current function is returning all parents instead of filtering by child_id

-- Drop and recreate the function with proper parameter binding
DROP FUNCTION IF EXISTS rpc_get_ingredient_parents(uuid);

CREATE OR REPLACE FUNCTION rpc_get_ingredient_parents(child_id uuid)
RETURNS TABLE(parent_id uuid, parent_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT p.parent_id, i.name as parent_name
  FROM ingredient_parents p
  JOIN ingredients i ON i.id = p.parent_id
  WHERE p.child_id = rpc_get_ingredient_parents.child_id
  ORDER BY i.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Test the function to ensure it works correctly
-- This should return only the parents for the specific child_id
-- SELECT * FROM rpc_get_ingredient_parents('789de0af-da98-4a4f-930c-3e72f29eb3e7');
