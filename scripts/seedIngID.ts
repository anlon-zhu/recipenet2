#!/usr/bin/env ts-node
/**
 * Script to seed USDA IngID Thesaurus data into Supabase
 * Reads CSV files and populates ingredients and ingredient_aliases tables
 * with embeddings for semantic search
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { parse } from 'csv-parse';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface PreferredDescriptor {
  pd_name: string;
  food_group: string;
}

interface Synonym {
  pd_name: string;
  alias_name: string;
}

interface IngredientRecord {
  id?: string;
  canonical: string;
  food_group: string;
  embedding: number[];
}

interface AliasRecord {
  name: string;
  ingredient_id: string;
}

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Read CSV file and return parsed data
 */
async function readCSV<T>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    
    fs.createReadStream(filePath)
      .pipe(parse({ 
        columns: true, 
        skip_empty_lines: true,
        trim: true 
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

/**
 * Generate embedding for a text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
    
    return response.data[0]?.embedding || [];
  } catch (error) {
    console.error(`Error generating embedding for "${text}":`, error);
    throw error;
  }
}

/**
 * Batch process embeddings with rate limiting
 */
async function generateEmbeddingsBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
    
    const batchPromises = batch.map(text => generateEmbedding(text));
    const batchEmbeddings = await Promise.all(batchPromises);
    embeddings.push(...batchEmbeddings);
    
    // Rate limiting - wait 1 second between batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return embeddings;
}

/**
 * Clear existing data from tables
 */
async function clearExistingData(): Promise<void> {
  console.log('Clearing existing ingredient data...');
  
  // Delete aliases first due to foreign key constraint
  const { error: aliasError } = await supabase
    .from('ingredient_aliases')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
  if (aliasError) {
    console.error('Error clearing aliases:', aliasError);
    throw aliasError;
  }
  
  // Then delete ingredients
  const { error: ingredientError } = await supabase
    .from('ingredients')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
  if (ingredientError) {
    console.error('Error clearing ingredients:', ingredientError);
    throw ingredientError;
  }
  
  console.log('Existing data cleared successfully');
}

/**
 * Insert ingredients with embeddings
 */
async function insertIngredients(pds: PreferredDescriptor[]): Promise<Map<string, string>> {
  console.log(`Generating embeddings for ${pds.length} preferred descriptors...`);
  
  // Generate embeddings for all preferred descriptors
  const texts = pds.map(pd => pd.pd_name);
  const embeddings = await generateEmbeddingsBatch(texts);
  
  console.log('Inserting ingredients into database...');
  
  // Prepare ingredient records
  const ingredientRecords: IngredientRecord[] = pds.map((pd, index) => ({
    canonical: pd.pd_name,
    food_group: pd.food_group,
    embedding: embeddings[index] || [],
  }));
  
  // Insert in batches to avoid payload size limits
  const batchSize = 100;
  const idMap = new Map<string, string>(); // canonical -> id
  
  for (let i = 0; i < ingredientRecords.length; i += batchSize) {
    const batch = ingredientRecords.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('ingredients')
      .insert(batch)
      .select('id, canonical');
      
    if (error) {
      console.error('Error inserting ingredients batch:', error);
      throw error;
    }
    
    // Build ID mapping
    if (data) {
      data.forEach(record => {
        idMap.set(record.canonical, record.id);
      });
    }
    
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ingredientRecords.length / batchSize)}`);
  }
  
  console.log(`Successfully inserted ${ingredientRecords.length} ingredients`);
  return idMap;
}

/**
 * Insert ingredient aliases
 */
async function insertAliases(synonyms: Synonym[], idMap: Map<string, string>): Promise<void> {
  console.log(`Inserting ${synonyms.length} ingredient aliases...`);
  
  // Prepare alias records
  const aliasRecords: AliasRecord[] = synonyms
    .map(synonym => {
      const ingredientId = idMap.get(synonym.pd_name);
      if (!ingredientId) {
        console.warn(`No ingredient found for PD: ${synonym.pd_name}`);
        return null;
      }
      return {
        name: synonym.alias_name,
        ingredient_id: ingredientId,
      };
    })
    .filter((record): record is AliasRecord => record !== null);
  
  console.log(`Prepared ${aliasRecords.length} valid alias records`);
  
  // Insert in batches
  const batchSize = 1000;
  
  for (let i = 0; i < aliasRecords.length; i += batchSize) {
    const batch = aliasRecords.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('ingredient_aliases')
      .insert(batch);
      
    if (error) {
      console.error('Error inserting aliases batch:', error);
      throw error;
    }
    
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(aliasRecords.length / batchSize)}`);
  }
  
  console.log(`Successfully inserted ${aliasRecords.length} aliases`);
}

/**
 * Main seeding function
 */
export async function main(): Promise<void> {
  try {
    console.log('Starting USDA IngID Thesaurus seeding...');
    
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OpenAI API key');
    }
    
    // Read CSV files
    const pdPath = path.join(__dirname, '../seed/ingid_pd.csv');
    const synonymsPath = path.join(__dirname, '../seed/ingid_synonyms.csv');
    
    console.log('Reading CSV files...');
    const [pds, synonyms] = await Promise.all([
      readCSV<PreferredDescriptor>(pdPath),
      readCSV<Synonym>(synonymsPath),
    ]);
    
    console.log(`Loaded ${pds.length} preferred descriptors and ${synonyms.length} synonyms`);
    
    // Clear existing data
    await clearExistingData();
    
    // Insert ingredients with embeddings
    const idMap = await insertIngredients(pds);
    
    // Insert aliases
    await insertAliases(synonyms, idMap);
    
    console.log('✅ USDA IngID Thesaurus seeding completed successfully!');
    
    // Print summary statistics
    const { count: ingredientCount } = await supabase
      .from('ingredients')
      .select('*', { count: 'exact', head: true });
      
    const { count: aliasCount } = await supabase
      .from('ingredient_aliases')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\nSummary:`);
    console.log(`- Ingredients in database: ${ingredientCount}`);
    console.log(`- Aliases in database: ${aliasCount}`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}
