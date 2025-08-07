-- Migration: Hierarchical Ingredients Schema
-- This replaces the previous ingredient schema with a hierarchical structure
-- that supports multiple parent-child relationships and proper food group normalization

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS ingredient_aliases CASCADE;
DROP TABLE IF EXISTS ingredient_parents CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;

-- 1) Food groups table
CREATE TABLE food_groups (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) Hierarchical ingredients table
CREATE TABLE ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT UNIQUE NOT NULL,        -- e.g. "Chicken" or "Chicken Breast Meat"
  food_group_id  UUID REFERENCES food_groups(id),
  hierarchy_depth INTEGER DEFAULT 0 CHECK (hierarchy_depth <= 3),  -- 0 for top-level, max depth of 3
  embedding      VECTOR(1536),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3) Ingredient parent-child relationships (many-to-many)
CREATE TABLE ingredient_parents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  child_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ingredient_parent_child_unique UNIQUE (parent_id, child_id),
  CONSTRAINT ingredient_no_self_parent CHECK (parent_id != child_id)
);

-- 4) Ingredient aliases table
CREATE TABLE ingredient_aliases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,    -- e.g. "boneless chicken breast"
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  embedding     VECTOR(1536),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ingredients_food_group ON ingredients(food_group_id);
CREATE INDEX idx_ingredients_hierarchy_depth ON ingredients(hierarchy_depth);
CREATE INDEX idx_ingredient_parents_parent ON ingredient_parents(parent_id);
CREATE INDEX idx_ingredient_parents_child ON ingredient_parents(child_id);
CREATE INDEX idx_ingredient_aliases_ingredient ON ingredient_aliases(ingredient_id);
CREATE INDEX idx_ingredients_embedding ON ingredients USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_ingredient_aliases_embedding ON ingredient_aliases USING ivfflat (embedding vector_cosine_ops);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_food_groups_updated_at BEFORE UPDATE ON food_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ingredient_parents_updated_at BEFORE UPDATE ON ingredient_parents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ingredient_aliases_updated_at BEFORE UPDATE ON ingredient_aliases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to detect circular hierarchies
CREATE OR REPLACE FUNCTION check_ingredient_hierarchy_cycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if new parent is already a descendant of the child
    WITH RECURSIVE descendents AS (
        SELECT child_id FROM ingredient_parents WHERE parent_id = NEW.child_id
        UNION
        SELECT ip.child_id
        FROM ingredient_parents ip
        JOIN descendents d ON d.child_id = ip.parent_id
    )
    IF EXISTS (SELECT 1 FROM descendents WHERE child_id = NEW.parent_id) THEN
        RAISE EXCEPTION 'Circular hierarchy detected: % would create a cycle', NEW.parent_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update hierarchy depth when parents change
CREATE OR REPLACE FUNCTION update_ingredient_hierarchy_depth()
RETURNS TRIGGER AS $$
DECLARE
    max_parent_depth INTEGER;
    new_depth INTEGER;
BEGIN
    -- For inserts/updates: Calculate max depth of all parents + 1
    SELECT COALESCE(MAX(i.hierarchy_depth), -1) INTO max_parent_depth
    FROM ingredients i
    JOIN ingredient_parents ip ON ip.parent_id = i.id
    WHERE ip.child_id = NEW.child_id;
    
    -- Set new depth (parent's max depth + 1, or 0 if no parents)
    new_depth := max_parent_depth + 1;
    
    -- Update the child's hierarchy_depth
    UPDATE ingredients
    SET hierarchy_depth = new_depth
    WHERE id = NEW.child_id;
    
    -- Recursively update all descendants' depths
    WITH RECURSIVE descendants AS (
        SELECT id, 0 AS level FROM ingredients WHERE id = NEW.child_id
        UNION
        SELECT i.id, d.level + 1
        FROM ingredients i
        JOIN ingredient_parents ip ON ip.child_id = i.id
        JOIN descendants d ON d.id = ip.parent_id
    )
    UPDATE ingredients i
    SET hierarchy_depth = d.level + new_depth
    FROM descendants d
    WHERE i.id = d.id AND d.level > 0;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle orphaned ingredients when parents are deleted
CREATE OR REPLACE FUNCTION handle_orphaned_ingredients()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the child still has any parents
    IF NOT EXISTS (SELECT 1 FROM ingredient_parents WHERE child_id = OLD.child_id) THEN
        -- No parents left, reset depth to 0
        UPDATE ingredients SET hierarchy_depth = 0 WHERE id = OLD.child_id;
    ELSE
        -- Still has parents, recalculate depth based on remaining parents
        DECLARE
            max_parent_depth INTEGER;
        BEGIN
            SELECT COALESCE(MAX(i.hierarchy_depth), -1) INTO max_parent_depth
            FROM ingredients i
            JOIN ingredient_parents ip ON ip.parent_id = i.id
            WHERE ip.child_id = OLD.child_id;
            
            UPDATE ingredients
            SET hierarchy_depth = max_parent_depth + 1
            WHERE id = OLD.child_id;
        END;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent circular hierarchies
CREATE TRIGGER prevent_ingredient_hierarchy_cycles
BEFORE INSERT OR UPDATE ON ingredient_parents
FOR EACH ROW EXECUTE FUNCTION check_ingredient_hierarchy_cycle();

-- Trigger to update hierarchy depth on parent addition
CREATE TRIGGER update_hierarchy_depth_on_parent_change
AFTER INSERT OR UPDATE ON ingredient_parents
FOR EACH ROW EXECUTE FUNCTION update_ingredient_hierarchy_depth();

-- Trigger to handle orphaned ingredients when parents are deleted
CREATE TRIGGER handle_orphaned_ingredients_on_parent_delete
AFTER DELETE ON ingredient_parents
FOR EACH ROW EXECUTE FUNCTION handle_orphaned_ingredients();
