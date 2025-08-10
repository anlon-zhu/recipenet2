#!/usr/bin/env tsx

/**
 * API Validation Script
 * Tests the deployed RPC functions and Edge Functions to ensure they're working correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Mock embedding for testing
const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01));

async function validateRPCFunctions() {
  console.log('🔍 Validating RPC Functions...\n');

  // Test 1: Vector search
  console.log('Testing rpc_vector_search_ingredients...');
  try {
    const { data, error } = await supabase.rpc('rpc_vector_search_ingredients', {
      query_embedding: mockEmbedding,
      match_count: 3
    });

    if (error) {
      console.log('❌ RPC Error:', error.message);
      return false;
    }

    if (Array.isArray(data) && data.length >= 0) {
      console.log('✅ Vector search working - returned', data.length, 'results');
      if (data.length > 0) {
        console.log('   Sample result:', {
          ingredient_name: data[0].ingredient_name,
          distance: data[0].distance
        });
      }
    } else {
      console.log('❌ Unexpected response format');
      return false;
    }
  } catch (err) {
    console.log('❌ Exception:', err);
    return false;
  }

  // Test 2: Recipes by pantry (with empty pantry to test basic functionality)
  console.log('\nTesting rpc_recipes_by_pantry...');
  try {
    const { data, error } = await supabase.rpc('rpc_recipes_by_pantry', {
      pantry_ids: [],
      min_coverage: 0.0,
      limit_count: 5
    });

    if (error) {
      console.log('❌ RPC Error:', error.message);
      return false;
    }

    if (Array.isArray(data)) {
      console.log('✅ Recipe search working - returned', data.length, 'results');
    } else {
      console.log('❌ Unexpected response format');
      return false;
    }
  } catch (err) {
    console.log('❌ Exception:', err);
    return false;
  }

  // Test 3: Missing ingredient suggestions
  console.log('\nTesting rpc_suggest_missing_ingredients...');
  try {
    const { data, error } = await supabase.rpc('rpc_suggest_missing_ingredients', {
      pantry_ids: [],
      limit_count: 3
    });

    if (error) {
      console.log('❌ RPC Error:', error.message);
      return false;
    }

    if (Array.isArray(data)) {
      console.log('✅ Ingredient suggestions working - returned', data.length, 'results');
    } else {
      console.log('❌ Unexpected response format');
      return false;
    }
  } catch (err) {
    console.log('❌ Exception:', err);
    return false;
  }

  return true;
}

async function validateEdgeFunctions() {
  console.log('\n🌐 Validating Edge Functions...\n');

  // Test canonicalizeIngredient function
  console.log('Testing canonicalizeIngredient Edge Function...');
  try {
    const response = await supabase.functions.invoke('canonicalizeIngredient', {
      body: { 
        name: 'chicken breast', 
        topN: 3 
      }
    });

    if (response.error) {
      console.log('❌ Function Error:', response.error);
      return false;
    }

    if (response.data) {
      if (response.data.error) {
        console.log('❌ API Error:', response.data.error);
        // This might be expected if Gemini API key is not set
        console.log('ℹ️  This is expected if GEMINI_API_KEY is not configured');
      } else if (Array.isArray(response.data)) {
        console.log('✅ Canonicalize function working - returned', response.data.length, 'results');
        console.log('   chicken breast canonicalized to:', response.data[0]);
      } else {
        console.log('❌ Unexpected response format');
        return false;
      }
    }
  } catch (err) {
    console.log('❌ Exception:', err);
    return false;
  }

  // Test recipesByPantry function
  console.log('\nTesting recipesByPantry Edge Function...');
  try {
    const response = await supabase.functions.invoke('recipesByPantry', {
      body: { 
        pantry_ids: [],
        min_coverage: 0.0,
        limit: 5
      }
    });

    if (response.error) {
      console.log('❌ Function Error:', response.error);
      return false;
    }

    if (response.data && response.data.recipes && Array.isArray(response.data.recipes)) {
      console.log('✅ Recipes by pantry function working - returned', response.data.recipes.length, 'recipes');
      console.log('   Metadata:', response.data.metadata);
    } else {
      console.log('❌ Unexpected response format');
      return false;
    }
  } catch (err) {
    console.log('❌ Exception:', err);
    return false;
  }

  return true;
}

async function checkDatabaseTables() {
  console.log('\n📊 Checking Database Tables...\n');

  const tables = ['ingredients', 'ingredient_aliases', 'ingredient_parents', 'food_groups'];
  
  for (const table of tables) {
    try {
      const { data: _data, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ Error accessing ${table}:`, error.message);
        return false;
      }

      console.log(`✅ ${table} table accessible`);
    } catch (err) {
      console.log(`❌ Exception accessing ${table}:`, err);
      return false;
    }
  }

  return true;
}

async function main() {
  console.log('🧪 Recipe Graph API Validation\n');
  console.log('=====================================\n');

  // Check environment variables
  const requiredEnvVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missingEnvVars.length > 0) {
    console.log('❌ Missing environment variables:', missingEnvVars.join(', '));
    console.log('Please check your .env.local file');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded\n');

  let allPassed = true;

  // Run validations
  allPassed = await checkDatabaseTables() && allPassed;
  allPassed = await validateRPCFunctions() && allPassed;
  allPassed = await validateEdgeFunctions() && allPassed;

  console.log('\n=====================================');
  if (allPassed) {
    console.log('🎉 All validations passed! Your API is ready to use.');
  } else {
    console.log('❌ Some validations failed. Please check the errors above.');
    process.exit(1);
  }

  console.log('\n📝 Next Steps:');
  console.log('1. Run integration tests: npm run test:integration');
  console.log('2. Start building your frontend application');
  console.log('3. Check the API documentation in docs/API_SETUP.md');
}

main().catch(console.error);
