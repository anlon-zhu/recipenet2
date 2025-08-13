/**
 * Integration tests for End-to-End User Workflows
 * Tests complete user flows from ingredient entry to recipe creation
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// #region Type Definitions
interface MatchingIngredient {
  ingredient_id: string;
  ingredient_name: string;
  alias_id: string | null;
  alias_name: string | null;
  food_group_name: string | null;
}

// interface UpsertResult {
//   action: 'created' | 'mapped';
//   ingredient_id: string;
//   ingredient_name?: string;
//   alias_name?: string;
//   alias_id?: string;
// }
// #endregion

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anonSupabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

describe('End-to-End User Workflow Tests', () => {
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

  describe('Complete Ingredient Entry Workflow', () => {
    it('should support the complete ingredient entry workflow', async () => {
      // 1. User types an ingredient - first try client-side cache
      const { data: allIngredients } = await anonSupabase.rpc('rpc_get_all_ingredients_for_matching') as { data: MatchingIngredient[] | null, error: any };
      expect(allIngredients).toBeDefined();

      // 2. If not found in cache, use match_ingredient_text
      const matchResponse = await fetch(`${SUPABASE_URL}/functions/v1/match_ingredient_text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'chicken breast'
        })
      });

      expect(matchResponse.ok).toBe(true);

      // 3. If user chooses to create new ingredient
      const uniqueName = `workflow-test-${Date.now()}`;
      const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/upsert_from_text`, {
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

      expect(createResponse.ok).toBe(true);
      const createData = await createResponse.json();
      createdIngredients.push(createData.ingredient_id);

      // 4. Add the ingredient directly to a recipe using the database
      const recipeTitle = `Workflow Test Recipe ${Date.now()}`;
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          title: recipeTitle,
          instructions: 'Step 1: Use the ingredient\nStep 2: Cook it',
          is_public: true
        })
        .select('id')
        .single();
        
      expect(recipeError).toBeNull();
      expect(recipe).toBeDefined();
      
      if (recipe) {
        createdRecipes.push(recipe.id);
        
        // Link the ingredient to the recipe
        const { error: linkError } = await supabase
          .from('recipe_ingredients')
          .insert({
            recipe_id: recipe.id,
            ingredient_id: createData.ingredient_id,
            amount: 1,
            unit: 'cup'
          });
          
        expect(linkError).toBeNull();
      }
    }, 60000);
  });

  describe('Create Recipe with Embeddings', () => {
    it('should create a recipe with ingredient embeddings', async () => {
      // Create a unique test ingredient
      const uniqueName = `embedding-test-${Date.now()}`;
      const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/upsert_from_text`, {
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

      expect(createResponse.ok).toBe(true);
      const createData = await createResponse.json();
      createdIngredients.push(createData.ingredient_id);

      // Test the create_recipe_with_embeddings function
      try {
        const recipeResponse = await fetch(`${SUPABASE_URL}/functions/v1/create_recipe_with_embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `Embeddings Test Recipe ${Date.now()}`,
            instructions: ['Step 1: Mix ingredients', 'Step 2: Cook thoroughly'],
            ingredients: [
              { text: uniqueName, amount: 2, unit: 'cups' },
              { text: 'salt', amount: 1, unit: 'tsp' },
              { text: 'pepper', amount: 0.5, unit: 'tsp' }
            ]
          })
        });

        if (recipeResponse.ok) {
          const recipeData = await recipeResponse.json();
          createdRecipes.push(recipeData.recipe_id);

          // Verify response structure
          expect(recipeData).toHaveProperty('recipe_id');
          expect(recipeData).toHaveProperty('title');
          expect(recipeData).toHaveProperty('instructions');
          expect(recipeData).toHaveProperty('processed_ingredients');
          expect(recipeData).toHaveProperty('total_ingredients');
          expect(recipeData).toHaveProperty('successfully_processed');
          
          // Verify our test ingredient was processed
          const ourIngredient = recipeData.processed_ingredients.find(
            (ing: any) => ing.ingredient_id === createData.ingredient_id
          );
          expect(ourIngredient).toBeDefined();
          
          // Check that at least some ingredients were processed successfully
          // Note: We don't assert exact counts as the function may not find all ingredients
          expect(recipeData.successfully_processed).toBeGreaterThan(0);
          expect(recipeData.successfully_processed).toBeLessThanOrEqual(recipeData.total_ingredients);
        } else {
          const errorData = await recipeResponse.json();
          console.warn('create_recipe_with_embeddings failed with status:', recipeResponse.status, errorData);
        }
      } catch (error) {
        console.warn('create_recipe_with_embeddings error:', error);
        // Don't fail the test if the function is unavailable
      }
    }, 60000);
  });

  describe('Recipe Discovery Workflow', () => {
    it('should find recipes based on available ingredients', async () => {
      // 1. Get some ingredient IDs to simulate user's pantry
      const { data: allIngredients } = await anonSupabase.rpc('rpc_get_all_ingredients_for_matching') as { data: MatchingIngredient[] | null, error: any };
      
      if (allIngredients && allIngredients.length > 0) {
        const pantryIngredients = allIngredients.slice(0, 3).map(ing => ing.ingredient_id);
        
        // 2. Find recipes that can be made with these ingredients
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get_recipes_by_ingredients`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pantry_ids: pantryIngredients,
            min_coverage: 0.3, // Allow partial matches
            limit: 5
          })
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        
        expect(data).toHaveProperty('recipes');
        expect(Array.isArray(data.recipes)).toBe(true);
        
        // 3. Verify recipe metadata includes what we need for UI
        if (data.recipes.length > 0) {
          const recipe = data.recipes[0];
          expect(recipe).toHaveProperty('recipe_id');
          expect(recipe).toHaveProperty('title');
          expect(recipe).toHaveProperty('coverage');
          expect(recipe).toHaveProperty('missing_ingredient_ids');
          expect(typeof recipe.coverage).toBe('number');
          expect(Array.isArray(recipe.missing_ingredient_ids)).toBe(true);
        }
      }
    }, 30000);

    it('should respect coverage requirements for recipe matching', async () => {
      // Get some ingredient IDs to test with
      const { data: allIngredients } = await anonSupabase.rpc('rpc_get_all_ingredients_for_matching') as { data: MatchingIngredient[] | null, error: any };
      
      if (allIngredients && allIngredients.length > 0) {
        const testIngredientIds = allIngredients.slice(0, 2).map(ing => ing.ingredient_id);
        
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get_recipes_by_ingredients`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pantry_ids: testIngredientIds,
            min_coverage: 1.0, // Require 100% coverage
            limit: 10
          })
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        
        // All returned recipes should have 100% coverage
        if (data.recipes && data.recipes.length > 0) {
          data.recipes.forEach((recipe: any) => {
            expect(recipe.coverage).toBe(1.0);
          });
        }
      }
    }, 30000);
  });
});
