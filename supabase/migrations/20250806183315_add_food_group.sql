-- Add food_group column to ingredients table for Sprint 3
-- This migration adds support for USDA IngID Thesaurus food group classification

ALTER TABLE ingredients 
ADD COLUMN food_group TEXT;

-- Add index on food_group for better query performance
CREATE INDEX idx_ingredients_food_group ON ingredients(food_group);

-- Add index on canonical name for better lookup performance
CREATE INDEX idx_ingredients_canonical ON ingredients(canonical);

-- Add index on ingredient_aliases name for better alias lookup performance
CREATE INDEX idx_ingredient_aliases_name ON ingredient_aliases(name);
