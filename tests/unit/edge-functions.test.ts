/**
 * Unit tests for Edge Functions in the Ingredient & Recipe API
 * Tests the write flow functions: match_ingredient_text, upsert_from_text, create_recipe_with_embeddings
 */

import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
jest.mock('@supabase/supabase-js');

// Mock global fetch for Edge Function calls
global.fetch = jest.fn();

const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('Edge Functions - Write Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('match_ingredient_text (read flow)', () => {
    it('should normalize text and return vector search results', async () => {
      const mockResponse = {
        query: "chikn breast",
        normalized_query: "chikn breast",
        results: [
          {
            ingredient_id: 'uuid-1',
            ingredient_name: 'Chicken',
            best_alias: 'chicken breast',
            alias_id: 'uuid-2',
            distance: 0.15,
            confidence: 0.85
          }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/match_ingredient_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "chikn breast", topN: 3 })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.query).toBe("chikn breast");
      expect(data.normalized_query).toBe("chikn breast");
      expect(data.results).toHaveLength(1);
      expect(data.results[0]).toHaveProperty('confidence');
      expect(data.results[0].confidence).toBe(0.85);
    });

    it('should handle empty search results', async () => {
      const mockResponse = {
        query: "nonexistent ingredient",
        normalized_query: "nonexistent ingredient",
        results: []
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/match_ingredient_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "nonexistent ingredient" })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.results).toHaveLength(0);
    });

    it('should validate input parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "text is required and must be a string" })
      });

      const response = await fetch('/functions/v1/match_ingredient_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 3 }) // Missing text
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.error).toBe("text is required and must be a string");
    });

    it('should handle CORS preflight requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['Access-Control-Allow-Origin', '*'],
          ['Access-Control-Allow-Methods', 'POST, OPTIONS'],
          ['Access-Control-Allow-Headers', 'Content-Type, Authorization']
        ])
      });

      const response = await fetch('/functions/v1/match_ingredient_text', {
        method: 'OPTIONS'
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe('upsert_from_text (write flow)', () => {
    it('should map text to existing ingredient (action: map)', async () => {
      const mockResponse = {
        action: "mapped",
        ingredient_id: "uuid-1",
        ingredient_name: "Chicken",
        alias_id: "uuid-new",
        alias_name: "chikn breast"
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/upsert_from_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "chikn breast",
          action: "map",
          ingredient_id: "uuid-1"
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.action).toBe("mapped");
      expect(data.ingredient_id).toBe("uuid-1");
      expect(data.alias_id).toBe("uuid-new");
    });

    it('should create new ingredient (action: create)', async () => {
      const mockResponse = {
        action: "created",
        ingredient_id: "uuid-new",
        ingredient_name: "Dragon Fruit",
        alias_id: null,
        alias_name: null
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/upsert_from_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Dragon Fruit",
          action: "create"
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.action).toBe("created");
      expect(data.ingredient_name).toBe("Dragon Fruit");
      expect(data.alias_id).toBeNull();
    });

    it('should validate action parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "action must be 'map' or 'create'" })
      });

      const response = await fetch('/functions/v1/upsert_from_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "some ingredient",
          action: "invalid"
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.error).toBe("action must be 'map' or 'create'");
    });

    it('should require ingredient_id for map action', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "ingredient_id is required when action is 'map'" })
      });

      const response = await fetch('/functions/v1/upsert_from_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "some ingredient",
          action: "map"
          // Missing ingredient_id
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.error).toBe("ingredient_id is required when action is 'map'");
    });

    it('should handle conflicts when alias already exists', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Alias already exists",
          ingredient_id: "uuid-1",
          alias_id: "uuid-existing"
        })
      });

      const response = await fetch('/functions/v1/upsert_from_text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "chicken breast", // Already exists
          action: "map",
          ingredient_id: "uuid-1"
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(409);
      expect(data.error).toBe("Alias already exists");
    });
  });

  describe('create_recipe_with_embeddings (write flow)', () => {
    it('should create recipe with ingredient linking and embeddings', async () => {
      const mockResponse = {
        recipe_id: "recipe-uuid",
        title: "Chicken Stir Fry",
        instructions: ["Heat oil in pan", "Add chicken and cook", "Add vegetables", "Serve hot"],
        processed_ingredients: [
          {
            text: "chicken breast",
            ingredient_id: "uuid-1",
            amount: 1,
            unit: "lb"
          },
          {
            text: "bell peppers",
            ingredient_id: "uuid-2",
            amount: 2,
            unit: "cups"
          }
        ],
        total_ingredients: 2,
        successfully_processed: 2
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/create_recipe_with_embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "Chicken Stir Fry",
          instructions: ["Heat oil in pan", "Add chicken and cook", "Add vegetables", "Serve hot"],
          ingredients: [
            { text: "chicken breast", amount: 1, unit: "lb" },
            { text: "bell peppers", amount: 2, unit: "cups" }
          ],
          is_public: true
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.recipe_id).toBe("recipe-uuid");
      expect(data.title).toBe("Chicken Stir Fry");
      expect(data.processed_ingredients).toHaveLength(2);
      expect(data.successfully_processed).toBe(2);
    });

    it('should validate required fields', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "title is required and must be a string" })
      });

      const response = await fetch('/functions/v1/create_recipe_with_embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing title
          instructions: ["Step 1"],
          ingredients: [{ text: "ingredient" }]
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.error).toBe("title is required and must be a string");
    });

    it('should handle partial ingredient processing failures gracefully', async () => {
      const mockResponse = {
        recipe_id: "recipe-uuid",
        title: "Test Recipe",
        instructions: ["Step 1"],
        processed_ingredients: [
          {
            text: "valid ingredient",
            ingredient_id: "uuid-1",
            amount: 1,
            unit: "cup"
          }
        ],
        total_ingredients: 2,
        successfully_processed: 1 // One ingredient failed
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const response = await fetch('/functions/v1/create_recipe_with_embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "Test Recipe",
          instructions: ["Step 1"],
          ingredients: [
            { text: "valid ingredient", amount: 1, unit: "cup" },
            { text: "", amount: 1, unit: "cup" } // Invalid ingredient
          ]
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.total_ingredients).toBe(2);
      expect(data.successfully_processed).toBe(1);
      expect(data.processed_ingredients).toHaveLength(1);
    });
  });
});
