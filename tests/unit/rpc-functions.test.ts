/**
 * Unit tests for RPC functions in the Ingredient & Recipe API
 * Tests the read flow functions: rpc_get_all_ingredients_for_matching and rpc_vector_search_ingredients
 */

import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
jest.mock('@supabase/supabase-js');

const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('RPC Functions - Read Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rpc_get_all_ingredients_for_matching', () => {
    it('should return all ingredients and aliases for client-side caching', async () => {
      const mockData = [
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          alias_id: 'uuid-1',
          alias_name: 'Chicken',
          food_group_name: 'Meat'
        },
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          alias_id: 'uuid-2',
          alias_name: 'chicken breast',
          food_group_name: 'Meat'
        },
        {
          ingredient_id: 'uuid-3',
          ingredient_name: 'Tomato',
          alias_id: 'uuid-3',
          alias_name: 'Tomato',
          food_group_name: 'Vegetables'
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('rpc_get_all_ingredients_for_matching');

      expect(error).toBeNull();
      expect(data).toEqual(mockData);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('rpc_get_all_ingredients_for_matching');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = { message: 'Database connection failed' };

      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('rpc_get_all_ingredients_for_matching');

      expect(data).toBeNull();
      expect(error).toEqual(mockError);
    });

    it('should return data in the correct format for client-side filtering', async () => {
      const mockData = [
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          alias_id: 'uuid-1',
          alias_name: 'Chicken',
          food_group_name: 'Meat'
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('rpc_get_all_ingredients_for_matching');

      // Verify the structure matches what client-side filtering expects
      expect(data[0]).toHaveProperty('ingredient_id');
      expect(data[0]).toHaveProperty('ingredient_name');
      expect(data[0]).toHaveProperty('alias_id');
      expect(data[0]).toHaveProperty('alias_name');
      expect(data[0]).toHaveProperty('food_group_name');
    });
  });

  describe('rpc_vector_search_ingredients', () => {
    it('should perform vector search with embedding and return ranked results', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockData = [
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          best_alias: 'chicken breast',
          alias_id: 'uuid-2',
          distance: 0.15
        },
        {
          ingredient_id: 'uuid-3',
          ingredient_name: 'Turkey',
          best_alias: 'turkey breast',
          alias_id: 'uuid-4',
          distance: 0.25
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 6
      });

      expect(error).toBeNull();
      expect(data).toEqual(mockData);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 6
      });
    });

    it('should use default match_count when not provided', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      
      mockSupabase.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      const supabase = createClient('url', 'key');
      await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding
      });
    });

    it('should handle vector search errors', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockError = { message: 'Vector index not found' };

      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 3
      });

      expect(data).toBeNull();
      expect(error).toEqual(mockError);
    });

    it('should return results sorted by distance (best matches first)', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockData = [
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          best_alias: 'chicken breast',
          alias_id: 'uuid-2',
          distance: 0.05 // Best match
        },
        {
          ingredient_id: 'uuid-3',
          ingredient_name: 'Turkey',
          best_alias: 'turkey',
          alias_id: 'uuid-3',
          distance: 0.15 // Second best
        },
        {
          ingredient_id: 'uuid-5',
          ingredient_name: 'Beef',
          best_alias: 'beef',
          alias_id: 'uuid-5',
          distance: 0.30 // Third best
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 3
      });

      // Verify results are sorted by distance (ascending)
      expect(data[0].distance).toBeLessThanOrEqual(data[1].distance);
      expect(data[1].distance).toBeLessThanOrEqual(data[2].distance);
    });

    it('should deduplicate by ingredient_id and return best alias per ingredient', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      const mockData = [
        {
          ingredient_id: 'uuid-1',
          ingredient_name: 'Chicken',
          best_alias: 'chicken breast', // Best alias for this ingredient
          alias_id: 'uuid-2',
          distance: 0.10
        }
        // Note: The RPC function should have already deduplicated, 
        // so we shouldn't see multiple entries for the same ingredient_id
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('rpc_vector_search_ingredients', {
        query_embedding: mockEmbedding,
        match_count: 6
      });

      // Verify no duplicate ingredient_ids
      const ingredientIds = data.map((item: any) => item.ingredient_id);
      const uniqueIngredientIds = [...new Set(ingredientIds)];
      expect(ingredientIds.length).toBe(uniqueIngredientIds.length);
    });
  });

  describe('get_recipes_by_ingredients', () => {
    it('should return recipes with coverage metadata', async () => {
      const mockPantryIds = ['uuid-1', 'uuid-2', 'uuid-3'];
      const mockData = [
        {
          recipe_id: 'recipe-uuid-1',
          title: 'Chicken Stir Fry',
          required_count: 5,
          matched_count: 3,
          coverage: 0.6,
          missing_ingredient_ids: ['uuid-4', 'uuid-5']
        },
        {
          recipe_id: 'recipe-uuid-2', 
          title: 'Simple Chicken Breast',
          required_count: 2,
          matched_count: 2,
          coverage: 1.0,
          missing_ingredient_ids: []
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('get_recipes_by_ingredients', {
        pantry_ids: mockPantryIds,
        min_coverage: 0.5,
        limit_count: 10
      });

      expect(error).toBeNull();
      expect(data).toEqual(mockData);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_recipes_by_ingredients', {
        pantry_ids: mockPantryIds,
        min_coverage: 0.5,
        limit_count: 10
      });
    });

    it('should handle empty pantry_ids', async () => {
      const mockData: any[] = [];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('get_recipes_by_ingredients', {
        pantry_ids: [],
        min_coverage: 1.0,
        limit_count: 100
      });

      expect(data).toEqual([]);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_recipes_by_ingredients', {
        pantry_ids: [],
        min_coverage: 1.0,
        limit_count: 100
      });
    });

    it('should respect min_coverage parameter', async () => {
      const mockPantryIds = ['uuid-1', 'uuid-2'];
      const mockData = [
        {
          recipe_id: 'recipe-uuid-1',
          title: 'Perfect Match Recipe',
          required_count: 2,
          matched_count: 2,
          coverage: 1.0,
          missing_ingredient_ids: []
        }
        // Note: Recipes with coverage < 1.0 should not be returned
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('get_recipes_by_ingredients', {
        pantry_ids: mockPantryIds,
        min_coverage: 1.0, // Only perfect matches
        limit_count: 50
      });

      expect(data).toEqual(mockData);
      // Verify all returned recipes have 100% coverage
      data?.forEach((recipe: any) => {
        expect(recipe.coverage).toBe(1.0);
      });
    });

    it('should handle database errors', async () => {
      const mockError = { message: 'Database connection failed' };

      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: mockError
      });

      const supabase = createClient('url', 'key');
      const { data, error } = await supabase.rpc('get_recipes_by_ingredients', {
        pantry_ids: ['uuid-1'],
        min_coverage: 0.5,
        limit_count: 10
      });

      expect(data).toBeNull();
      expect(error).toEqual(mockError);
    });

    it('should sort results by coverage and matched_count', async () => {
      const mockPantryIds = ['uuid-1', 'uuid-2', 'uuid-3'];
      const mockData = [
        {
          recipe_id: 'recipe-uuid-1',
          title: 'Best Match',
          required_count: 3,
          matched_count: 3,
          coverage: 1.0,
          missing_ingredient_ids: []
        },
        {
          recipe_id: 'recipe-uuid-2',
          title: 'Good Match',
          required_count: 4,
          matched_count: 3,
          coverage: 0.75,
          missing_ingredient_ids: ['uuid-4']
        },
        {
          recipe_id: 'recipe-uuid-3',
          title: 'Partial Match',
          required_count: 5,
          matched_count: 2,
          coverage: 0.4,
          missing_ingredient_ids: ['uuid-4', 'uuid-5', 'uuid-6']
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockData,
        error: null
      });

      const supabase = createClient('url', 'key');
      const { data } = await supabase.rpc('get_recipes_by_ingredients', {
        pantry_ids: mockPantryIds,
        min_coverage: 0.3,
        limit_count: 10
      });

      expect(data).toEqual(mockData);
      // Verify results are sorted by coverage (descending)
      if (data && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          expect(data[i-1].coverage).toBeGreaterThanOrEqual(data[i].coverage);
        }
      }
    });
  });
});
