/**
 * Database Seeder Utility
 * 
 * Handles database seeding operations for hierarchical ingredients
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { EmbeddingGenerator } from './embeddings';

// Types for our data structures
export interface FoodGroup {
  id?: string;
  name: string;
}

export interface Ingredient {
  id?: string;
  name: string;
  food_group_id: string;
  hierarchy_depth: number;
  embedding?: number[] | undefined;
}

export interface Alias {
  id?: string;
  name: string;
  ingredient_id: string;
  embedding?: number[] | undefined;
}

export interface IngredientParent {
  parent_id: string;
  child_id: string;
}

export interface SeederConfig {
  files: {
    foodGroups: string;
    ingredients: string;
    ingredientParents: string;
    aliases: string;
  };
  batchSize: {
    default: number;
    embedding: number;
  };
  db: {
    tables: {
      foodGroups: string;
      ingredients: string;
      ingredientParents: string;
      aliases: string;
    };
  };
}

/**
 * Default seeder configuration
 */
export const DEFAULT_SEEDER_CONFIG: SeederConfig = {
  files: {
    foodGroups: 'seed/food_groups.csv',
    ingredients: 'seed/ingredients.csv',
    ingredientParents: 'seed/ingredient_parents.csv',
    aliases: 'seed/final_aliases.csv',
  },
  batchSize: {
    default: 100,
    embedding: 100,
  },
  db: {
    tables: {
      foodGroups: 'food_groups',
      ingredients: 'ingredients',
      ingredientParents: 'ingredient_parents',
      aliases: 'ingredient_aliases',
    },
  },
};

/**
 * Database Seeder class
 */
export class DatabaseSeeder {
  private supabase: SupabaseClient;
  private embeddingGenerator: EmbeddingGenerator;
  private config: SeederConfig;

  /**
   * Create a new DatabaseSeeder
   * 
   * @param supabaseUrl Supabase URL
   * @param supabaseKey Supabase service role key
   * @param embeddingGenerator EmbeddingGenerator instance
   * @param config Seeder configuration
   */
  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    embeddingGenerator: EmbeddingGenerator,
    config: Partial<SeederConfig> = {}
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddingGenerator = embeddingGenerator;
    this.config = { ...DEFAULT_SEEDER_CONFIG, ...config };
  }

  /**
   * Read and parse CSV file
   */
  private readCSV(filePath: string): any[] {
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
   * @returns Map of food group names to IDs
   */
  async seedFoodGroups(): Promise<Map<string, string>> {
    console.log('Seeding food groups...');
    
    const foodGroupsData = this.readCSV(this.config.files.foodGroups);
    const foodGroupMap = new Map<string, string>();
    
    // Clear existing food groups
    const { error: deleteError } = await this.supabase
      .from(this.config.db.tables.foodGroups)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Error clearing food groups:', deleteError);
      throw deleteError;
    }
    
    // Insert food groups in batches
    const batchSize = this.config.batchSize.default;
    for (let i = 0; i < foodGroupsData.length; i += batchSize) {
      const batch = foodGroupsData.slice(i, i + batchSize);
      
      const { data, error } = await this.supabase
        .from(this.config.db.tables.foodGroups)
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
   * @param foodGroupMap Map of food group names to IDs
   * @returns Map of ingredient names to IDs
   */
  async seedIngredients(foodGroupMap: Map<string, string>): Promise<Map<string, string>> {
    console.log('Seeding ingredients...');
    
    const ingredientsData = this.readCSV(this.config.files.ingredients);
    const ingredientMap = new Map<string, string>();
    
    // Generate embeddings for ingredients in batches
    console.log('\nGenerating embeddings for ingredients...');
    
    // Process ingredients in batches for embedding generation
    const embeddingBatchSize = this.config.batchSize.embedding;
    
    const ingredientsToInsert: Ingredient[] = [];
    
    for (let i = 0; i < ingredientsData.length; i += embeddingBatchSize) {
      const batch = ingredientsData.slice(i, i + embeddingBatchSize);
      const names = batch.map(row => row.name);
      
      console.log(`  Generating embeddings for batch of ${names.length} ingredients...`);
      const embeddings = await this.embeddingGenerator.generateBatchEmbeddings(names);
      
      // Process each ingredient with its embedding
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const embedding = embeddings[j];
        
        const foodGroupId = foodGroupMap.get(row.food_group);
        if (!foodGroupId) {
          console.warn(`Warning: No food group found for ingredient "${row.name}" (${row.food_group})`);
          continue;
        }
        
        // Only add embedding if it's available
        const ingredient: Ingredient = {
          name: row.name,
          food_group_id: foodGroupId,
          hierarchy_depth: parseInt(row.hierarchy_depth, 10),
        };
        
        if (embedding) {
          ingredient.embedding = embedding;
        }
        
        ingredientsToInsert.push(ingredient);
      }
    }
    
    // Insert ingredients in batches
    const batchSize = this.config.batchSize.default;
    for (let i = 0; i < ingredientsToInsert.length; i += batchSize) {
      const batch = ingredientsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await this.supabase
        .from(this.config.db.tables.ingredients)
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
   * @param ingredientMap Map of ingredient names to IDs
   */
  async seedIngredientParents(ingredientMap: Map<string, string>): Promise<void> {
    console.log('Seeding ingredient parent-child relationships...');
    
    const parentRelationships = this.readCSV(this.config.files.ingredientParents);
    
    // Prepare parent-child relationships
    const relationshipsToInsert: IngredientParent[] = [];
    
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
    const batchSize = this.config.batchSize.default;
    let insertedCount = 0;
    
    for (let i = 0; i < relationshipsToInsert.length; i += batchSize) {
      const batch = relationshipsToInsert.slice(i, i + batchSize);
      
      const { error } = await this.supabase
        .from(this.config.db.tables.ingredientParents)
        .insert(batch);
      
      if (error) {
        console.error('Error inserting ingredient parent relationships batch:', error);
        throw error;
      }
      
      insertedCount += batch.length;
    }
    
    console.log(`✓ Seeded ${insertedCount} ingredient parent-child relationships`);
  }

  /**
   * Seed aliases
   * @param ingredientMap Map of ingredient names to IDs
   */
  async seedAliases(ingredientMap: Map<string, string>): Promise<void> {
    console.log('Seeding aliases...');
    
    const aliasData = this.readCSV(this.config.files.aliases);
    
    // Clear existing aliases
    const { error: deleteError } = await this.supabase
      .from(this.config.db.tables.aliases)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Error clearing aliases:', deleteError);
      throw deleteError;
    }
    
    // Generate embeddings and prepare data in batches
    const batchSize = this.config.batchSize.default;
    const embeddingBatchSize = this.config.batchSize.embedding;
    let totalAliases = 0;
    
    for (let i = 0; i < aliasData.length; i += batchSize) {
      const batch = aliasData.slice(i, i + batchSize);
      const aliasesToInsert: Alias[] = [];
      
      // Process embeddings in sub-batches for better performance
      for (let j = 0; j < batch.length; j += embeddingBatchSize) {
        const embeddingBatch = batch.slice(j, j + embeddingBatchSize);
        const aliasNames = embeddingBatch.map(row => row.alias_name);
        
        console.log(`  Generating embeddings for batch of ${aliasNames.length} aliases...`);
        const embeddings = await this.embeddingGenerator.generateBatchEmbeddings(aliasNames);
        
        // Process each alias with its embedding
        for (let k = 0; k < embeddingBatch.length; k++) {
          const row = embeddingBatch[k];
          const embedding = embeddings[k];
          
          const ingredientId = ingredientMap.get(row.ingredient_name);
          if (!ingredientId) {
            console.warn(`Warning: No ingredient found for alias "${row.alias_name}" -> "${row.ingredient_name}"`);
            continue;
          }
          
          // Only add embedding if it's available
          const alias: Alias = {
            name: row.alias_name,
            ingredient_id: ingredientId,
          };
          
          if (embedding) {
            alias.embedding = embedding;
          }
          
          aliasesToInsert.push(alias);
        }
      }
      
      if (aliasesToInsert.length > 0) {
        const { error } = await this.supabase
          .from(this.config.db.tables.aliases)
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
   * Clear existing data from the database
   */
  async clearExistingData(): Promise<void> {
    console.log('Clearing existing data...');
    
    // First clear ingredient_parents to avoid foreign key constraints
    const { error: clearParentsError } = await this.supabase
      .from(this.config.db.tables.ingredientParents)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (clearParentsError) {
      console.error('Error clearing ingredient_parents:', clearParentsError);
      throw clearParentsError;
    }
    
    // Then clear ingredients
    const { error: clearError } = await this.supabase
      .from(this.config.db.tables.ingredients)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (clearError) {
      console.error('Error clearing ingredients:', clearError);
      throw clearError;
    }
  }

  /**
   * Check if all required files exist
   */
  checkRequiredFiles(): boolean {
    const requiredFiles = [
      this.config.files.foodGroups,
      this.config.files.ingredients,
      this.config.files.ingredientParents,
      this.config.files.aliases,
    ];
    
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        console.error(`Error: Required file not found: ${file}`);
        console.error('Run finalizeConsolidation.py first to generate hierarchy files.');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Run the full seeding process
   */
  async seedAll(): Promise<{
    foodGroupCount: number;
    ingredientCount: number;
  }> {
    try {
      // Check if all required files exist
      if (!this.checkRequiredFiles()) {
        throw new Error('Missing required files');
      }
      
      // Clear existing data
      await this.clearExistingData();
      
      // Seed in order of dependencies
      const foodGroupMap = await this.seedFoodGroups();
      const ingredientMap = await this.seedIngredients(foodGroupMap);
      await this.seedIngredientParents(ingredientMap);
      await this.seedAliases(ingredientMap);
      
      return {
        foodGroupCount: foodGroupMap.size,
        ingredientCount: ingredientMap.size,
      };
    } catch (error) {
      console.error('Seeding failed:', error);
      throw error;
    }
  }
}
