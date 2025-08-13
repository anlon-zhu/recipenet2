/**
 * Integration tests for Edge Functions
 * Tests the HTTP endpoints with real API calls
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// #region Type Definitions
interface MatchTextResult {
  query: string;
  normalized_query: string;
  results: {
    ingredient_id: string;
    ingredient_name: string;
    confidence: number;
  }[];
}

interface UpsertResult {
  action: 'created' | 'mapped';
  ingredient_id: string;
  ingredient_name?: string;
  alias_name?: string;
  alias_id?: string;
}
// #endregion

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

describe('Edge Functions Integration Tests', () => {
  // Test data cleanup
  const createdIngredients: string[] = [];
  const createdAliases: string[] = [];
  const createdRecipes: string[] = [];

  afterAll(async () => {
    // Clean up test data
    if (createdAliases.length > 0) {
      await supabase.from('ingredient_aliases').delete().in('id', createdAliases);
    }
    if (createdRecipes.length > 0) {
      await supabase.from('recipe_ingredients').delete().in('recipe_id', createdRecipes);
      await supabase.from('recipes').delete().in('id', createdRecipes);
    }
    if (createdIngredients.length > 0) {
      await supabase.from('ingredients').delete().in('id', createdIngredients);
    }
  });

  describe('match_ingredient_text Edge Function', () => {
    it('should match ingredient text and return confidence scores', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/match_ingredient_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'chicken breast'
        })
      });

      expect(response.ok).toBe(true);
      const data: MatchTextResult = await response.json();

      expect(data).toHaveProperty('query');
      expect(data).toHaveProperty('normalized_query');
      expect(data).toHaveProperty('results');
      expect(Array.isArray(data.results)).toBe(true);

      if (data.results.length > 0) {
        const firstResult = data.results[0];
        expect(firstResult).toHaveProperty('ingredient_id');
        expect(firstResult).toHaveProperty('ingredient_name');
        expect(firstResult).toHaveProperty('confidence');
        expect(typeof firstResult?.confidence).toBe('number');
        expect(firstResult?.confidence).toBeGreaterThanOrEqual(0);
        expect(firstResult?.confidence).toBeLessThanOrEqual(1);
      }
    }, 30000);

    it('should handle empty text input', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/match_ingredient_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: ''
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('text is required');
    }, 15000);
  });

  describe('get_recipes_by_ingredients Edge Function', () => {
    it('should validate pantry_ids parameter', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get_recipes_by_ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          min_coverage: 0.5,
          limit: 10
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('pantry_ids is required');
    }, 15000);

    it('should validate UUID format in pantry_ids', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get_recipes_by_ingredients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pantry_ids: ['invalid-uuid', 'another-invalid'],
          min_coverage: 0.5,
          limit: 10
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid UUID format');
      expect(data.invalid_ids).toEqual(['invalid-uuid', 'another-invalid']);
    }, 15000);
  });

  describe('upsert_from_text Edge Function', () => {
    it('should create new ingredient when action is "create"', async () => {
      const uniqueName = `test-ingredient-${Date.now()}`;
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert_from_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: uniqueName,
          action: 'create'
        })
      });

      expect(response.ok).toBe(true);
      const data: UpsertResult = await response.json();

      expect(data.action).toBe('created');
      expect(data.ingredient_id).toBeDefined();
      expect(data.ingredient_name).toBe(uniqueName);

      if (data.ingredient_id) {
        createdIngredients.push(data.ingredient_id);
      }
    }, 30000);

    it('should map text to existing ingredient when action is "map"', async () => {
      const { data: ingredient, error } = await supabase
        .from('ingredients')
        .insert({ name: `test-base-ingredient-${Date.now()}`, hierarchy_depth: 0 })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(ingredient).toBeDefined();
      if (ingredient && ingredient.id) {
        createdIngredients.push(ingredient.id);
      }

      const aliasText = `test-alias-${Date.now()}`;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert_from_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: aliasText,
          action: 'map',
          ingredient_id: ingredient?.id
        })
      });

      expect(response.ok).toBe(true);
      const data: UpsertResult = await response.json();

      expect(data.action).toBe('mapped');
      expect(data.ingredient_id).toBe(ingredient?.id);
      expect(data.alias_name).toBe(aliasText);
      expect(data.alias_id).toBeDefined();

      if (data.alias_id) createdAliases.push(data.alias_id);
    }, 30000);

    it('should handle missing required parameters', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert_from_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'create'
          // Missing 'text' parameter
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('text is required');
    }, 15000);
  });
});
