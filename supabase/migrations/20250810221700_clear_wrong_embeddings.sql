-- Clear existing 768-dimensional embeddings so they can be regenerated with Gemini (1536-dim)
-- The schema is already correct (VECTOR(1536)), but existing data has wrong dimensions

-- Clear existing embeddings that have wrong dimensions
UPDATE ingredients SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE ingredient_aliases SET embedding = NULL WHERE embedding IS NOT NULL;

-- Add comment explaining why embeddings were cleared
COMMENT ON COLUMN ingredients.embedding IS 'Gemini text-embedding-004 vectors (1536 dimensions) - cleared for regeneration';
COMMENT ON COLUMN ingredient_aliases.embedding IS 'Gemini text-embedding-004 vectors (1536 dimensions) - cleared for regeneration';
