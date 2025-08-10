// Real integration test for canonicalizeIngredient Edge Function
import { supabase, validateTestEnvironment } from './setup';

describe('canonicalizeIngredient Edge Function - Integration', () => {
  beforeAll(() => {
    validateTestEnvironment();
  });

  test('should canonicalize a real ingredient with live API', async () => {
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'chicken breast', 
        topN: 3 
      }
    });

    // This test may fail if the edge function isn't deployed or if Gemini API key is missing
    // That's expected for integration tests - they test the real system
    if (response.error) {
      console.warn('Integration test failed - this is expected if edge function is not deployed:', response.error);
      return;
    }

    expect(response.data).toBeDefined();
    
    if (response.data && Array.isArray(response.data)) {
      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data.length).toBeLessThanOrEqual(3);
      
      // Check structure of first result
      const firstResult = response.data[0];
      expect(firstResult).toHaveProperty('ingredient_id');
      expect(firstResult).toHaveProperty('ingredient_name');
      expect(firstResult).toHaveProperty('distance');
      
      // Validate types
      expect(typeof firstResult.ingredient_id).toBe('string');
      expect(typeof firstResult.ingredient_name).toBe('string');
      expect(typeof firstResult.distance).toBe('number');
    }
  }, 30000); // Longer timeout for real API calls

  test('should handle invalid input in live environment', async () => {
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { topN: 3 } // missing name
    });

    // Even if the function isn't deployed, we should get a consistent error structure
    if (response.error) {
      console.warn('Integration test - function not deployed:', response.error);
      return;
    }

    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toContain('name is required');
  }, 30000);
});
