import { supabase, validateTestEnvironment, testIngredientIds } from './setup';

describe('recipesByPantry Edge Function', () => {
  beforeAll(() => {
    validateTestEnvironment();
  });

  test('should return recipes matching pantry ingredients', async () => {
    const pantryIds = [
      testIngredientIds.chicken,
      testIngredientIds.onion,
      testIngredientIds.garlic
    ];

    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: pantryIds,
        min_coverage: 0.5,
        limit: 10
      }
    });

    expect(response.error).toBeNull();
    expect(response.data).toBeDefined();
    
    if (response.data) {
      expect(response.data).toHaveProperty('recipes');
      expect(response.data).toHaveProperty('suggestions');
      expect(response.data).toHaveProperty('metadata');
      
      expect(Array.isArray(response.data.recipes)).toBe(true);
      expect(Array.isArray(response.data.suggestions)).toBe(true);
      
      // Check metadata structure
      expect(response.data.metadata).toHaveProperty('pantry_size');
      expect(response.data.metadata).toHaveProperty('min_coverage');
      expect(response.data.metadata).toHaveProperty('total_results');
      expect(response.data.metadata.pantry_size).toBe(pantryIds.length);
    }
  });

  test('should validate recipe result structure', async () => {
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: [testIngredientIds.chicken],
        min_coverage: 1.0,
        limit: 5
      }
    });

    expect(response.error).toBeNull();
    
    if (response.data?.recipes && response.data.recipes.length > 0) {
      const recipe = response.data.recipes[0];
      
      expect(recipe).toHaveProperty('recipe_id');
      expect(recipe).toHaveProperty('title');
      expect(recipe).toHaveProperty('required_count');
      expect(recipe).toHaveProperty('matched_count');
      expect(recipe).toHaveProperty('coverage');
      expect(recipe).toHaveProperty('missing_ingredient_ids');
      
      // Validate types
      expect(typeof recipe.recipe_id).toBe('string');
      expect(typeof recipe.title).toBe('string');
      expect(typeof recipe.required_count).toBe('number');
      expect(typeof recipe.matched_count).toBe('number');
      expect(typeof recipe.coverage).toBe('number');
      expect(Array.isArray(recipe.missing_ingredient_ids)).toBe(true);
      
      // Coverage should be between 0 and 1
      expect(recipe.coverage).toBeGreaterThanOrEqual(0);
      expect(recipe.coverage).toBeLessThanOrEqual(1);
    }
  });

  test('should handle invalid pantry_ids gracefully', async () => {
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: "not-an-array",
        min_coverage: 1.0
      }
    });

    expect(response.error).toBeNull();
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('pantry_ids is required and must be an array');
  });

  test('should validate UUID format in pantry_ids', async () => {
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: ['invalid-uuid', 'another-invalid'],
        min_coverage: 1.0
      }
    });

    expect(response.error).toBeNull();
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('Invalid UUID format');
    expect(response.data).toHaveProperty('invalid_ids');
  });

  test('should respect min_coverage parameter', async () => {
    const pantryIds = [testIngredientIds.chicken];
    
    // Test with high coverage requirement
    const highCoverageResponse = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: pantryIds,
        min_coverage: 1.0,
        limit: 10
      }
    });

    // Test with low coverage requirement
    const lowCoverageResponse = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: pantryIds,
        min_coverage: 0.1,
        limit: 10
      }
    });

    expect(highCoverageResponse.error).toBeNull();
    expect(lowCoverageResponse.error).toBeNull();

    if (highCoverageResponse.data?.recipes && lowCoverageResponse.data?.recipes) {
      // Low coverage should return same or more recipes
      expect(lowCoverageResponse.data.recipes.length)
        .toBeGreaterThanOrEqual(highCoverageResponse.data.recipes.length);
    }
  });

  test('should include suggestions when coverage is less than 1.0', async () => {
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: [testIngredientIds.chicken],
        min_coverage: 0.5,
        limit: 10
      }
    });

    expect(response.error).toBeNull();
    
    if (response.data?.suggestions) {
      expect(Array.isArray(response.data.suggestions)).toBe(true);
      
      if (response.data.suggestions.length > 0) {
        const suggestion = response.data.suggestions[0];
        expect(suggestion).toHaveProperty('ingredient_id');
        expect(suggestion).toHaveProperty('name');
        expect(suggestion).toHaveProperty('unlocks');
        
        expect(typeof suggestion.ingredient_id).toBe('string');
        expect(typeof suggestion.name).toBe('string');
        expect(typeof suggestion.unlocks).toBe('number');
      }
    }
  });

  test('should respect limit parameter', async () => {
    const limit = 3;
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: [testIngredientIds.chicken, testIngredientIds.onion],
        min_coverage: 0.1,
        limit
      }
    });

    expect(response.error).toBeNull();
    
    if (response.data?.recipes) {
      expect(response.data.recipes.length).toBeLessThanOrEqual(limit);
    }
  });
});
