import { supabase, validateTestEnvironment, mockEmbedding, testIngredientIds } from './setup';

describe('RPC Functions', () => {
  beforeAll(() => {
    validateTestEnvironment();
  });

  describe('rpc_vector_search_ingredients', () => {
    test('should search ingredients by vector embedding', async () => {
      const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 5
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      if (data && data.length > 0) {
        const result = data[0];
        expect(result).toHaveProperty('ingredient_id');
        expect(result).toHaveProperty('ingredient_name');
        expect(result).toHaveProperty('best_alias');
        expect(result).toHaveProperty('alias_id');
        expect(result).toHaveProperty('distance');
        
        expect(typeof result.ingredient_id).toBe('string');
        expect(typeof result.ingredient_name).toBe('string');
        expect(typeof result.best_alias).toBe('string');
        expect(typeof result.distance).toBe('number');
      }
    });

    test('should limit results to match_count', async () => {
      const matchCount = 3;
      const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: matchCount
      });

      expect(error).toBeNull();
      if (data) {
        expect(data.length).toBeLessThanOrEqual(matchCount);
      }
    });

    test('should return results ordered by distance', async () => {
      const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 5
      });

      expect(error).toBeNull();
      
      if (data && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          expect(data[i].distance).toBeGreaterThanOrEqual(data[i - 1].distance);
        }
      }
    });
  });

  describe('rpc_recipes_by_pantry', () => {
    test('should find recipes matching pantry ingredients', async () => {
      const pantryIds = [testIngredientIds.chicken, testIngredientIds.onion];
      
      const { data, error } = await supabase.rpc('rpc_recipes_by_pantry', {
        pantry_ids: pantryIds,
        min_coverage: 0.5,
        limit_count: 10
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      if (data && data.length > 0) {
        const recipe = data[0];
        expect(recipe).toHaveProperty('recipe_id');
        expect(recipe).toHaveProperty('title');
        expect(recipe).toHaveProperty('required_count');
        expect(recipe).toHaveProperty('matched_count');
        expect(recipe).toHaveProperty('coverage');
        expect(recipe).toHaveProperty('missing_ingredient_ids');
        
        expect(typeof recipe.coverage).toBe('number');
        expect(recipe.coverage).toBeGreaterThanOrEqual(0.5); // Should respect min_coverage
        expect(Array.isArray(recipe.missing_ingredient_ids)).toBe(true);
      }
    });

    test('should return empty array for impossible coverage', async () => {
      const { data, error } = await supabase.rpc('rpc_recipes_by_pantry', {
        pantry_ids: [], // Empty pantry
        min_coverage: 1.0,
        limit_count: 10
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });
  });

  describe('rpc_suggest_missing_ingredients', () => {
    test('should suggest ingredients that unlock recipes', async () => {
      const pantryIds = [testIngredientIds.chicken];
      
      const { data, error } = await supabase.rpc('rpc_suggest_missing_ingredients', {
        pantry_ids: pantryIds,
        limit_count: 5
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      if (data && data.length > 0) {
        const suggestion = data[0];
        expect(suggestion).toHaveProperty('ingredient_id');
        expect(suggestion).toHaveProperty('name');
        expect(suggestion).toHaveProperty('unlocks');
        
        expect(typeof suggestion.ingredient_id).toBe('string');
        expect(typeof suggestion.name).toBe('string');
        expect(typeof suggestion.unlocks).toBe('number');
        expect(suggestion.unlocks).toBeGreaterThan(0);
      }
    });

    test('should order suggestions by unlock count', async () => {
      const pantryIds = [testIngredientIds.chicken, testIngredientIds.onion];
      
      const { data, error } = await supabase.rpc('rpc_suggest_missing_ingredients', {
        pantry_ids: pantryIds,
        limit_count: 5
      });

      expect(error).toBeNull();
      
      if (data && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          expect(data[i].unlocks).toBeLessThanOrEqual(data[i - 1].unlocks);
        }
      }
    });
  });

  describe('rpc_get_ingredient_parents', () => {
    test('should return parent ingredients', async () => {
      // This test assumes there are parent-child relationships in the database
      const { data, error } = await supabase.rpc('rpc_get_ingredient_parents', {
        child_id: testIngredientIds.chicken
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      if (data && data.length > 0) {
        const parent = data[0];
        expect(parent).toHaveProperty('parent_id');
        expect(parent).toHaveProperty('parent_name');
        
        expect(typeof parent.parent_id).toBe('string');
        expect(typeof parent.parent_name).toBe('string');
      }
    });

    test('should return empty array for ingredients with no parents', async () => {
      // Use a UUID that likely has no parents
      const { data, error } = await supabase.rpc('rpc_get_ingredient_parents', {
        child_id: '00000000-0000-0000-0000-000000000000'
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });
  });

  describe('rpc_get_ingredient_children', () => {
    test('should return child ingredients', async () => {
      const { data, error } = await supabase.rpc('rpc_get_ingredient_children', {
        parent_id: testIngredientIds.chicken
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      
      if (data && data.length > 0) {
        const child = data[0];
        expect(child).toHaveProperty('child_id');
        expect(child).toHaveProperty('child_name');
        
        expect(typeof child.child_id).toBe('string');
        expect(typeof child.child_name).toBe('string');
      }
    });
  });
});
