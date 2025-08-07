// tests/db.seed.test.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { exec } from 'child_process';
import { promisify } from 'util';

// Define types for our test data
interface ExpectedCounts {
  foodGroups: number;
  ingredients: number;
  ingredientParents: number;
  aliases: number;
}

interface ParentChildRelationship {
  parent_id: string;
  child_id: string;
  parent: {
    id: string;
    name: string;
    hierarchy_depth: number;
  };
  child: {
    id: string;
    name: string;
    hierarchy_depth: number;
  };
}

interface Alias {
  id: string;
  name: string;
  ingredient_id: string;
  ingredient: {
    name: string;
  };
}

const execAsync = promisify(exec);

// Check for required environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables!');
}

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to read CSV files
function readCSV(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test file not found: ${path.resolve(filePath)}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
  });
}

describe('Hierarchical Ingredient Seeding', () => {
  // Test data counts - update these based on your actual seed data
  const expectedCounts: ExpectedCounts = {
    foodGroups: 0,
    ingredients: 0,
    ingredientParents: 0,
    aliases: 0
  };

  // Run this before tests to get expected counts from CSV files
  beforeAll(() => {
    try {
      // Count records in each CSV file
      if (fs.existsSync('seed/food_groups.csv')) {
        expectedCounts.foodGroups = readCSV('seed/food_groups.csv').length;
      }
      
      if (fs.existsSync('seed/ingredients.csv')) {
        expectedCounts.ingredients = readCSV('seed/ingredients.csv').length;
      }
      
      if (fs.existsSync('seed/ingredient_parents.csv')) {
        expectedCounts.ingredientParents = readCSV('seed/ingredient_parents.csv').length;
      }
      
      if (fs.existsSync('seed/final_aliases.csv')) {
        expectedCounts.aliases = readCSV('seed/final_aliases.csv').length;
      }
      
      console.log('Expected counts from CSV files:', expectedCounts);
    } catch (error) {
      console.error('Error reading CSV files:', error);
    }
  });

  // Skip these tests if running in CI environment without proper setup
  const testConfig = {
    skip: process.env.CI === 'true' || !process.env.OPENAI_API_KEY
  };

  // Test database schema existence
  describe('Database Schema', () => {
    it('should have the required tables for hierarchical ingredients', async () => {
      // Check food_groups table
      const { data: foodGroups, error: foodGroupsError } = await supabase
        .from('food_groups')
        .select('id')
        .limit(1);
      
      expect(foodGroupsError).toBeNull();
      expect(Array.isArray(foodGroups)).toBe(true);
      
      // Check ingredients table with hierarchy_depth
      const { data: ingredients, error: ingredientsError } = await supabase
        .from('ingredients')
        .select('id, hierarchy_depth')
        .limit(1);
      
      expect(ingredientsError).toBeNull();
      expect(Array.isArray(ingredients)).toBe(true);
      
      // Check ingredient_parents table
      const { data: ingredientParents, error: ingredientParentsError } = await supabase
        .from('ingredient_parents')
        .select('id, parent_id, child_id')
        .limit(1);
      
      expect(ingredientParentsError).toBeNull();
      expect(Array.isArray(ingredientParents)).toBe(true);
      
      // Check ingredient_aliases table
      const { data: aliases, error: aliasesError } = await supabase
        .from('ingredient_aliases')
        .select('id, ingredient_id')
        .limit(1);
      
      expect(aliasesError).toBeNull();
      expect(Array.isArray(aliases)).toBe(true);
    });
  });

  // Test the seeding script (conditionally run)
  describe('Seeding Process', () => {
    // Skip this test if in CI or missing OpenAI API key
    it('should seed the database with hierarchical ingredients', async () => {
      if (testConfig.skip) {
        console.log('Skipping seeding test in CI environment or missing OpenAI API key');
        return;
      }
      
      try {
        // Run the seeding script
        const scriptPath = path.resolve('scripts/seedHierarchicalIngredients.ts');
        const { stdout, stderr } = await execAsync(`tsx ${scriptPath}`);
        
        console.log('Seeding script output:', stdout);
        if (stderr) {
          console.error('Seeding script errors:', stderr);
        }
        
        // Verify food groups were seeded
        const { data: foodGroups, error: foodGroupsError } = await supabase
          .from('food_groups')
          .select('id, name')
          .order('name');
        
        expect(foodGroupsError).toBeNull();
        expect(Array.isArray(foodGroups)).toBe(true);
        expect(foodGroups?.length ?? 0).toBeGreaterThan(0);
        
        if (expectedCounts.foodGroups > 0 && foodGroups) {
          expect(foodGroups.length).toBe(expectedCounts.foodGroups);
        }
        
        // Verify ingredients were seeded
        const { data: ingredients, error: ingredientsError } = await supabase
          .from('ingredients')
          .select('id, name, food_group_id, hierarchy_depth')
          .order('name');
        
        expect(ingredientsError).toBeNull();
        expect(Array.isArray(ingredients)).toBe(true);
        expect(ingredients?.length ?? 0).toBeGreaterThan(0);
        
        if (expectedCounts.ingredients > 0 && ingredients) {
          expect(ingredients.length).toBe(expectedCounts.ingredients);
        }
        
        // Verify ingredient parent relationships were seeded
        const { data: ingredientParents, error: ingredientParentsError } = await supabase
          .from('ingredient_parents')
          .select('id, parent_id, child_id');
        
        expect(ingredientParentsError).toBeNull();
        expect(Array.isArray(ingredientParents)).toBe(true);
        
        if (expectedCounts.ingredientParents > 0 && ingredientParents) {
          expect(ingredientParents.length).toBe(expectedCounts.ingredientParents);
        }
        
        // Verify aliases were seeded
        const { data: aliases, error: aliasesError } = await supabase
          .from('ingredient_aliases')
          .select('id, name, ingredient_id')
          .order('name');
        
        expect(aliasesError).toBeNull();
        expect(Array.isArray(aliases)).toBe(true);
        
        if (expectedCounts.aliases > 0 && aliases) {
          expect(aliases.length).toBe(expectedCounts.aliases);
        }
        
      } catch (error) {
        console.error('Error running seeding test:', error);
        throw error;
      }
    }, 300000); // 5 minute timeout for this test
  });

  // Test data integrity
  describe('Data Integrity', () => {
    it('should have valid parent-child relationships', async () => {
      // Skip if no data expected
      if (expectedCounts.ingredientParents === 0) {
        console.log('Skipping parent-child relationship test - no data expected');
        return;
      }
      
      // Get all parent-child relationships
      const { data: relationships, error } = await supabase
        .from('ingredient_parents')
        .select(`
          parent_id,
          child_id,
          parent:parent_id(name),
          child:child_id(name)
        `);
      
      expect(error).toBeNull();
      expect(Array.isArray(relationships)).toBe(true);
      
      // Check that each relationship has valid parent and child
      for (const rel of relationships || []) {
        expect(rel.parent_id).toBeTruthy();
        expect(rel.child_id).toBeTruthy();
        expect(rel.parent).toBeTruthy();
        expect(rel.child).toBeTruthy();
        
        // Ensure parent and child are different
        expect(rel.parent_id).not.toBe(rel.child_id);
      }
    });
    
    it('should have valid hierarchy depths', async () => {
      // Get all ingredients
      const { data: ingredients, error } = await supabase
        .from('ingredients')
        .select('id, name, hierarchy_depth');
      
      expect(error).toBeNull();
      expect(Array.isArray(ingredients)).toBe(true);
      
      // Check that hierarchy depths are valid
      for (const ingredient of ingredients || []) {
        expect(typeof ingredient.hierarchy_depth).toBe('number');
        expect(ingredient.hierarchy_depth).toBeGreaterThanOrEqual(0);
        expect(ingredient.hierarchy_depth).toBeLessThanOrEqual(3); // Max depth from schema
      }
      
      // Get all parent-child relationships
      const { data: relationships, error: relError } = await supabase
        .from('ingredient_parents')
        .select(`
          parent:parent_id(id, name, hierarchy_depth),
          child:child_id(id, name, hierarchy_depth)
        `);
      
      expect(relError).toBeNull();
      
      // Check that children have higher depth than parents
      if (relationships && relationships.length > 0) {
        // Cast to any first to avoid TypeScript errors with the structure
        const typedRelationships = relationships as unknown as ParentChildRelationship[];
        
        for (const rel of typedRelationships) {
          if (rel.parent && rel.child) {
            const parentDepth = rel.parent.hierarchy_depth;
            const childDepth = rel.child.hierarchy_depth;
            
            expect(childDepth).toBeGreaterThan(parentDepth);
          }
        }
      }
    });
    
    it('should have valid aliases linked to ingredients', async () => {
      // Skip if no aliases expected
      if (expectedCounts.aliases === 0) {
        console.log('Skipping alias test - no data expected');
        return;
      }
      
      // Get all aliases with their linked ingredients
      const { data: aliases, error } = await supabase
        .from('ingredient_aliases')
        .select(`
          id, 
          name,
          ingredient_id,
          ingredient:ingredient_id(name)
        `);
      
      expect(error).toBeNull();
      expect(Array.isArray(aliases)).toBe(true);
      
      // Check that each alias has a valid ingredient
      for (const alias of aliases || []) {
        expect(alias.ingredient_id).toBeTruthy();
        expect(alias.ingredient).toBeTruthy();
      }
    });
  });
});
