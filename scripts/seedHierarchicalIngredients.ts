#!/usr/bin/env tsx
/**
 * Hierarchical Ingredient Seeding Script
 * 
 * This script seeds the hierarchical ingredient database with:
 * 1. Food groups
 * 2. Ingredients with hierarchy
 * 3. Ingredient parent-child relationships
 * 4. Ingredient aliases
 * 
 * Prerequisites:
 * - Run analyzeConsolidation.py
 * - Review/edit seed/consolidation_proposal.txt
 * - Run finalizeConsolidation.py
 * 
 * Environment variables required:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - OPENAI_API_KEY
 */

// ========== Constants ==========
const CONFIG = {
  // File paths
  FILES: {
    FOOD_GROUPS: 'seed/food_groups.csv',
    INGREDIENTS: 'seed/ingredients.csv',
    INGREDIENT_PARENTS: 'seed/ingredient_parents.csv',
    ALIASES: 'seed/final_aliases.csv',
  },
  
  // Batch sizes for database operations
  BATCH_SIZES: {
    DATABASE_INSERTS: 100,  // Number of records to insert in a single database batch
    EMBEDDING_GENERATION: 50, // Number of embeddings to generate in parallel
  },
  
  // OpenAI configuration
  OPENAI: {
    MODEL: 'text-embedding-3-small',
    EMBEDDING_DIMENSIONS: 1536,
  },
  
  // Database constants
  DB: {
    NULL_UUID: '00000000-0000-0000-0000-000000000000', // Used for delete operations
    MAX_HIERARCHY_DEPTH: 3, // Maximum allowed depth in the ingredient hierarchy
  },
};

// ========== Imports ==========
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

// Types for our data structures
interface FoodGroup {
  id?: string;
  name: string;
}

interface Ingredient {
  id?: string;
  name: string;
  food_group_id: string;
  hierarchy_depth: number;
  embedding?: number[];
}

interface Alias {
  id?: string;
  name: string;
  ingredient_id: string;
  embedding?: number[];
}

// ========== Client Initialization ==========
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Validate environment variables
const REQUIRED_ENV_VARS = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', value: supabaseUrl },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: supabaseServiceKey },
  { name: 'OPENAI_API_KEY', value: openaiApiKey },
];

const missingVars = REQUIRED_ENV_VARS.filter(v => !v.value);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`- ${v.name}`));
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
const openai = new OpenAI({ 
  apiKey: openaiApiKey!,
  timeout: 30000, // 30 second timeout
});

/**
 * Generate embedding for a text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  try {
    const response = await openai.embeddings.create({
      model: CONFIG.OPENAI.MODEL,
      input: text,
      encoding_format: 'float',
    });
    
    // Safely access the embedding with proper type checking
    const embedding = response?.data?.[0]?.embedding;
    
    if (!embedding || !Array.isArray(embedding) || embedding.length !== CONFIG.OPENAI.EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding received for text: "${text}"`);
    }
    
    return embedding;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error generating embedding for "${text}":`, errorMessage);
    throw new Error(`Failed to generate embedding: ${errorMessage}`);
  }
}

/**
 * Read and parse CSV file
 */
function readCSV(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${path.resolve(filePath)}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
    });
  } catch (error) {
    console.error(`Error reading CSV file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Seed food groups
 */
async function seedFoodGroups(): Promise<Map<string, string>> {
  console.log('Seeding food groups...');
  
  const foodGroupsData = readCSV('seed/food_groups.csv');
  const foodGroupMap = new Map<string, string>();
  
  // Clear existing food groups
  const { error: deleteError } = await supabase
    .from('food_groups')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (deleteError) {
    console.error('Error clearing food groups:', deleteError);
    throw deleteError;
  }
  
  // Insert food groups in batches
  const batchSize = 100;
  for (let i = 0; i < foodGroupsData.length; i += batchSize) {
    const batch = foodGroupsData.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('food_groups')
      .insert(batch)
      .select('id, name');
    
    if (error) {
      console.error('Error inserting food groups batch:', error);
      throw error;
    }
    
    // Build mapping
    data?.forEach(group => {
      foodGroupMap.set(group.name, group.id);
    });
  }
  
  console.log(`✓ Seeded ${foodGroupsData.length} food groups`);
  return foodGroupMap;
}

/**
 * Seed ingredients from the consolidated ingredients.csv file
 */
async function seedIngredients(foodGroupMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('Seeding ingredients...');
  
  const ingredientsData = readCSV('seed/ingredients.csv');
  const ingredientMap = new Map<string, string>();
  
  // Generate embeddings and prepare data
  const ingredientsToInsert: Ingredient[] = [];
  
  for (const row of ingredientsData) {
    console.log(`  Generating embedding for ingredient: ${row.name}`);
    const embedding = await generateEmbedding(row.name);
    
    const foodGroupId = foodGroupMap.get(row.food_group);
    if (!foodGroupId) {
      console.warn(`Warning: No food group found for ingredient "${row.name}" (${row.food_group})`);
      continue;
    }
    
    ingredientsToInsert.push({
      name: row.name,
      food_group_id: foodGroupId,
      hierarchy_depth: parseInt(row.hierarchy_depth, 10),
      embedding,
    });
  }
  
  // Insert ingredients in batches
  const batchSize = 100;
  for (let i = 0; i < ingredientsToInsert.length; i += batchSize) {
    const batch = ingredientsToInsert.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('ingredients')
      .insert(batch)
      .select('id, name');
    
    if (error) {
      console.error('Error inserting ingredients batch:', error);
      throw error;
    }
    
    // Build mapping
    data?.forEach(ingredient => {
      ingredientMap.set(ingredient.name, ingredient.id);
    });
  }
  
  console.log(`✓ Seeded ${ingredientsToInsert.length} ingredients`);
  return ingredientMap;
}

/**
 * Seed ingredient parent-child relationships
 */
async function seedIngredientParents(ingredientMap: Map<string, string>): Promise<void> {
  console.log('Seeding ingredient parent-child relationships...');
  
  const parentRelationships = readCSV('seed/ingredient_parents.csv');
  
  // Prepare parent-child relationships
  const relationshipsToInsert = [];
  
  for (const row of parentRelationships) {
    const parentId = ingredientMap.get(row.parent_name);
    const childId = ingredientMap.get(row.child_name);
    
    if (!parentId) {
      console.warn(`Warning: No parent ingredient found for "${row.parent_name}"`);
      continue;
    }
    
    if (!childId) {
      console.warn(`Warning: No child ingredient found for "${row.child_name}"`);
      continue;
    }
    
    relationshipsToInsert.push({
      parent_id: parentId,
      child_id: childId,
    });
  }
  
  // Insert parent-child relationships in batches
  const batchSize = 100;
  let insertedCount = 0;
  
  for (let i = 0; i < relationshipsToInsert.length; i += batchSize) {
    const batch = relationshipsToInsert.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('ingredient_parents')
      .insert(batch);
    
    if (error) {
      console.error('Error inserting ingredient parent relationships batch:', error);
      throw error;
    }
    
    insertedCount += batch.length;
  }
  
  console.log(`✓ Seeded ${insertedCount} ingredient parent-child relationships`);
}

// Obsolete functions removed - replaced by seedIngredients and seedIngredientParents

/**
 * Seed aliases
 */
async function seedAliases(ingredientMap: Map<string, string>): Promise<void> {
  console.log('Seeding aliases...');
  
  const aliasData = readCSV('seed/final_aliases.csv');
  
  // Clear existing aliases
  const { error: deleteError } = await supabase
    .from('ingredient_aliases')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (deleteError) {
    console.error('Error clearing aliases:', deleteError);
    throw deleteError;
  }
  
  // Generate embeddings and prepare data in batches
  const batchSize = 50;
  let totalAliases = 0;
  
  for (let i = 0; i < aliasData.length; i += batchSize) {
    const batch = aliasData.slice(i, i + batchSize);
    const aliasesToInsert: Alias[] = [];
    
    for (const row of batch) {
      const ingredientId = ingredientMap.get(row.ingredient_name);
      if (!ingredientId) {
        console.warn(`Warning: No ingredient found for alias "${row.alias_name}" -> "${row.ingredient_name}"`);
        continue;
      }
      
      console.log(`  Generating embedding for alias: ${row.alias_name}`);
      const embedding = await generateEmbedding(row.alias_name);
      
      aliasesToInsert.push({
        name: row.alias_name,
        ingredient_id: ingredientId,
        embedding,
      });
    }
    
    if (aliasesToInsert.length > 0) {
      const { error } = await supabase
        .from('ingredient_aliases')
        .insert(aliasesToInsert);
      
      if (error) {
        console.error('Error inserting aliases batch:', error);
        throw error;
      }
      
      totalAliases += aliasesToInsert.length;
    }
  }
  
  console.log(`✓ Seeded ${totalAliases} aliases`);
}

/**
 * Main seeding function
 */
async function main() {
  try {
    console.log('Starting hierarchical ingredient seeding...');
    console.log('=====================================');
    
    // Check if all required files exist
    const requiredFiles = [
      'seed/food_groups.csv',
      'seed/ingredients.csv',
      'seed/ingredient_parents.csv',
      'seed/final_aliases.csv',
    ];
    
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        console.error(`Error: Required file not found: ${file}`);
        console.error('Run finalizeConsolidation.py first to generate hierarchy files.');
        process.exit(1);
      }
    }
    
    // Clear existing data (cascades to ingredient_parents and aliases)
    console.log('Clearing existing data...');
    
    // First clear ingredient_parents to avoid foreign key constraints
    const { error: clearParentsError } = await supabase
      .from('ingredient_parents')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (clearParentsError) {
      console.error('Error clearing ingredient_parents:', clearParentsError);
      throw clearParentsError;
    }
    
    // Then clear ingredients
    const { error: clearError } = await supabase
      .from('ingredients')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (clearError) {
      console.error('Error clearing ingredients:', clearError);
      throw clearError;
    }
    
    // Seed in order of dependencies
    const foodGroupMap = await seedFoodGroups();
    const ingredientMap = await seedIngredients(foodGroupMap);
    await seedIngredientParents(ingredientMap);
    await seedAliases(ingredientMap);
    
    // Final statistics
    console.log('\n=====================================');
    console.log('Seeding completed successfully!');
    console.log('=====================================');
    console.log(`Food groups:    ${foodGroupMap.size}`);
    console.log(`Ingredients:    ${ingredientMap.size}`);
    console.log('Aliases:        (see output above)');
    
  } catch (error) {
    console.error('Seeding failed:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as seedHierarchicalIngredients };
