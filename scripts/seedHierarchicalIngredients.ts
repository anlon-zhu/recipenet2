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
 * - GEMINI_API_KEY
 */

// ========== Imports ==========
import fs from 'fs';
import { EmbeddingGenerator } from './utils/embeddings';
import { DatabaseSeeder } from './utils/dbSeeder';

// ========== Environment Variables ==========
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Validate environment variables
const REQUIRED_ENV_VARS = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', value: supabaseUrl },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: supabaseServiceKey },
  { name: 'GEMINI_API_KEY', value: geminiApiKey },
];

const missingVars = REQUIRED_ENV_VARS.filter(v => !v.value);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`- ${v.name}`));
  process.exit(1);
}

/**
 * Prompts the user for confirmation before proceeding with database operations
 */
async function promptForConfirmation(): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    readline.question(`\nWARNING: This will delete all existing data in the database.\nType 'YES' to confirm: `, (answer: string) => {
      readline.close();
      resolve(answer === 'YES');
    });
  });
}

/**
 * Main function to run the seeding process
 */
async function main() {
  console.log('Starting hierarchical ingredient seeding...');
  
  // Ask for confirmation before proceeding
  const confirmed = await promptForConfirmation();
  if (!confirmed) {
    console.log('Seeding cancelled by user');
    process.exit(0);
  }
  
  try {
    console.log('=====================================');
    
    // Initialize embedding generator
    const embeddingGenerator = new EmbeddingGenerator(geminiApiKey!, {
      batchSize: 100,
      model: 'gemini-embedding-001',
      dimension: 1536,
      taskType: 'RETRIEVAL_DOCUMENT',
    });
    
    // Initialize database seeder
    const dbSeeder = new DatabaseSeeder(
      supabaseUrl!,
      supabaseServiceKey!,
      embeddingGenerator
    );
    
    // Check if all required files exist
    if (!dbSeeder.checkRequiredFiles()) {
      console.error('Run finalizeConsolidation.py first to generate hierarchy files.');
      process.exit(1);
    }
    
    // Run the seeding process
    const stats = await dbSeeder.seedAll();
    
    // Final statistics
    console.log('\n=====================================');
    console.log('Seeding completed successfully!');
    console.log('=====================================');
    console.log(`Food groups:    ${stats.foodGroupCount}`);
    console.log(`Ingredients:    ${stats.ingredientCount}`);
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
