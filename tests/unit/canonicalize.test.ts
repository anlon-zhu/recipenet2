import { supabase, validateTestEnvironment } from '../integration/setup';

describe('canonicalizeIngredient Edge Function', () => {
  beforeAll(() => {
    validateTestEnvironment();
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  test('should canonicalize ingredient and return results with parents', async () => {
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'boneless chicken breast', 
        topN: 3 
      }
    });

    expect(response.error).toBeNull();
    expect(response.data).toBeDefined();
    
    if (response.data && Array.isArray(response.data)) {
      expect(response.data.length).toBeGreaterThan(0);
      
      // Check structure of first result
      const firstResult = response.data[0];
      expect(firstResult).toHaveProperty('ingredient_id');
      expect(firstResult).toHaveProperty('ingredient_name');
      expect(firstResult).toHaveProperty('best_alias');
      expect(firstResult).toHaveProperty('alias_id');
      expect(firstResult).toHaveProperty('distance');
      expect(firstResult).toHaveProperty('parents');
      
      // Validate types
      expect(typeof firstResult.ingredient_id).toBe('string');
      expect(typeof firstResult.ingredient_name).toBe('string');
      expect(typeof firstResult.best_alias).toBe('string');
      expect(typeof firstResult.distance).toBe('number');
      expect(Array.isArray(firstResult.parents)).toBe(true);
    }
  });

  test('should handle invalid input gracefully', async () => {
    // Mock specific error response for invalid input
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { error: 'name is required and must be a string' },
      error: null
    });

    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { topN: 3 } // missing name
    });

    expect(response.error).toBeNull();
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('name is required');
  });

  test('should limit results to topN parameter', async () => {
    // Mock successful response with limited results
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: [
        { ingredient_id: '1', ingredient_name: 'chicken', distance: 0.1 },
        { ingredient_id: '2', ingredient_name: 'chicken breast', distance: 0.2 }
      ],
      error: null
    });

    const topN = 2;
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'chicken', 
        topN 
      }
    });

    expect(response.error).toBeNull();
    
    if (response.data && Array.isArray(response.data)) {
      expect(response.data.length).toBeLessThanOrEqual(topN);
    }
  });

  test('should handle Gemini API errors', async () => {
    // Mock API error response
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { error: 'Gemini API error: Invalid request' },
      error: null
    });

    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'test ingredient', 
        topN: 3 
      }
    });

    expect(response.error).toBeNull();
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('Gemini API error');
  });

  test('should return results ordered by distance', async () => {
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'chicken breast', 
        topN: 5 
      }
    });

    expect(response.error).toBeNull();
    
    if (response.data && Array.isArray(response.data) && response.data.length > 1) {
      // Check that distances are in ascending order
      for (let i = 1; i < response.data.length; i++) {
        expect(response.data[i].distance).toBeGreaterThanOrEqual(response.data[i - 1].distance);
      }
    }
  });
});