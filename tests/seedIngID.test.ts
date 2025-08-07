/**
 * Tests for USDA IngID Thesaurus seeding functionality
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

describe('IngID Seeding', () => {
  let supabase: any;

  beforeEach(() => {
    // Setup Supabase client
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  });

  test('should have CSV files available for seeding', () => {
    const pdPath = path.join(__dirname, '../seed/ingid_pd.csv');
    const synonymsPath = path.join(__dirname, '../seed/ingid_synonyms.csv');
    
    expect(fs.existsSync(pdPath)).toBe(true);
    expect(fs.existsSync(synonymsPath)).toBe(true);
    
    // Check that files have content
    const pdContent = fs.readFileSync(pdPath, 'utf8');
    const synonymsContent = fs.readFileSync(synonymsPath, 'utf8');
    
    expect(pdContent.length).toBeGreaterThan(0);
    expect(synonymsContent.length).toBeGreaterThan(0);
    
    // Check CSV headers
    expect(pdContent).toContain('pd_name,food_group');
    expect(synonymsContent).toContain('pd_name,alias_name');
  });

  test('should have database tables with correct schema', async () => {
    // Check ingredients table structure
    const { data: ingredientsSchema, error: ingredientsError } = await supabase
      .rpc('get_table_schema', { table_name: 'ingredients' });
    
    if (ingredientsError) {
      // Fallback: try to query the table to see if it exists
      const { error: queryError } = await supabase
        .from('ingredients')
        .select('id, canonical, food_group, embedding')
        .limit(1);
      
      expect(queryError).toBeNull();
    }
    
    // Check ingredient_aliases table structure
    const { error: aliasesError } = await supabase
      .from('ingredient_aliases')
      .select('id, name, ingredient_id')
      .limit(1);
    
    expect(aliasesError).toBeNull();
  });

  test('should validate environment variables are set', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    // OpenAI key is optional for this test
  });

  test('should be able to insert and query ingredients', async () => {
    // Insert a test ingredient
    const testIngredient = {
      canonical: 'TEST_INGREDIENT_' + Date.now(),
      food_group: 'Test Group',
      embedding: Array(1536).fill(0.1)
    };
    
    const { data: insertedIngredient, error: insertError } = await supabase
      .from('ingredients')
      .insert(testIngredient)
      .select()
      .single();
    
    expect(insertError).toBeNull();
    expect(insertedIngredient).toBeDefined();
    expect(insertedIngredient.canonical).toBe(testIngredient.canonical);
    expect(insertedIngredient.food_group).toBe(testIngredient.food_group);
    
    // Insert a test alias
    const testAlias = {
      name: 'test alias ' + Date.now(),
      ingredient_id: insertedIngredient.id
    };
    
    const { data: insertedAlias, error: aliasError } = await supabase
      .from('ingredient_aliases')
      .insert(testAlias)
      .select()
      .single();
    
    expect(aliasError).toBeNull();
    expect(insertedAlias).toBeDefined();
    expect(insertedAlias.name).toBe(testAlias.name);
    expect(insertedAlias.ingredient_id).toBe(insertedIngredient.id);
    
    // Clean up
    await supabase.from('ingredient_aliases').delete().eq('id', insertedAlias.id);
    await supabase.from('ingredients').delete().eq('id', insertedIngredient.id);
  });
});
