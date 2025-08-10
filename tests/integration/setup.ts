import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const testConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  geminiApiKey: process.env.GEMINI_API_KEY!,
};

// Mock embedding for deterministic tests
export const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01));

// Test ingredient IDs (these would be real UUIDs in your database)
export const testIngredientIds = {
  chicken: '550e8400-e29b-41d4-a716-446655440001',
  beef: '550e8400-e29b-41d4-a716-446655440002',
  onion: '550e8400-e29b-41d4-a716-446655440003',
  garlic: '550e8400-e29b-41d4-a716-446655440004',
};

// Helper function to wait for async operations
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock Gemini API response for tests
export const mockGeminiResponse = {
  embedding: {
    values: mockEmbedding
  }
};

// Validate environment variables
export function validateTestEnvironment() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'GEMINI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
