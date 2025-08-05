// tests/db.schema.test.ts
import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables!');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('DB Schema', () => {
  it('should be able to SELECT from ingredients', async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should be able to SELECT from ingredient_aliases', async () => {
    const { data, error } = await supabase
      .from('ingredient_aliases')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should be able to SELECT from recipes', async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should be able to SELECT from recipe_ingredients', async () => {
    const { data, error } = await supabase
      .from('recipe_ingredients')
      .select('id')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should be able to SELECT from saved_recipes', async () => {
    const { data, error } = await supabase
      .from('saved_recipes')
      .select('user_id')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
