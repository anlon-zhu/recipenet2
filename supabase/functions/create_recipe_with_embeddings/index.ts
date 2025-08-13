// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { generateEmbedding } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface RecipeIngredient {
  text: string;
  amount?: number;
  unit?: string;
}

interface CreateRecipeRequest {
  title: string;
  instructions: string[];
  ingredients: RecipeIngredient[];
  is_public?: boolean;
  owner_id?: string;
}

// Normalize text for consistency
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

serve(async (req) => {
  try {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    const requestData: CreateRecipeRequest = await req.json();
    const { title, instructions, ingredients, is_public = false, owner_id } = requestData;
    
    // Validate inputs
    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "title is required and must be a string" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
      return new Response(JSON.stringify({ error: "instructions is required and must be a non-empty array" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return new Response(JSON.stringify({ error: "ingredients is required and must be a non-empty array" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Start transaction
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        title: title.trim(),
        instructions: instructions.join('\n'), // Store as text for now (can be updated to TEXT[] later)
        is_public,
        owner_id
      })
      .select('id')
      .single();

    if (recipeError) {
      console.error("Error creating recipe:", recipeError);
      throw new Error(`Failed to create recipe: ${recipeError.message}`);
    }

    const recipeId = recipe.id;
    const processedIngredients = [];

    // Process each ingredient
    for (const ingredient of ingredients) {
      if (!ingredient.text || typeof ingredient.text !== "string") {
        continue; // Skip invalid ingredients
      }

      const normalizedText = normalizeText(ingredient.text);
      let ingredientId = null;

      try {
        // 1. Try to find existing ingredient/alias by exact match first
        const { data: exactMatch } = await supabase
          .from('ingredients')
          .select('id')
          .eq('name', ingredient.text.trim())
          .single();

        if (exactMatch) {
          ingredientId = exactMatch.id;
        } else {
          // Check aliases
          const { data: aliasMatch } = await supabase
            .from('ingredient_aliases')
            .select('ingredient_id')
            .eq('name', ingredient.text.trim())
            .single();

          if (aliasMatch) {
            ingredientId = aliasMatch.ingredient_id;
          }
        }

        // 2. If no exact match, try vector search
        if (!ingredientId) {
          const embedding = await generateEmbedding(normalizedText, GEMINI_API_KEY, { 
            taskType: 'RETRIEVAL_QUERY'
          });

          if (embedding && embedding.length > 0) {
            const { data: vectorResults } = await supabase.rpc(
              "rpc_vector_search_ingredients",
              {
                query_embedding: embedding,
                match_count: 1,
              }
            );

            // Use the best match if it's close enough (distance < 0.3)
            if (vectorResults && vectorResults.length > 0 && vectorResults[0].distance < 0.3) {
              ingredientId = vectorResults[0].ingredient_id;
            }
          }
        }

        // 3. If still no match, create new ingredient
        if (!ingredientId) {
          const embedding = await generateEmbedding(normalizedText, GEMINI_API_KEY, { 
            taskType: 'RETRIEVAL_DOCUMENT'
          });

          const { data: newIngredient, error: ingredientError } = await supabase
            .from('ingredients')
            .insert({
              name: ingredient.text.trim(),
              embedding: embedding,
              hierarchy_depth: 0
            })
            .select('id')
            .single();

          if (ingredientError) {
            console.error("Error creating ingredient:", ingredientError);
            // Continue with other ingredients rather than failing the whole recipe
            continue;
          }

          ingredientId = newIngredient.id;
        }

        // 4. Link ingredient to recipe
        const { error: linkError } = await supabase
          .from('recipe_ingredients')
          .insert({
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            amount: ingredient.amount,
            unit: ingredient.unit
          });

        if (linkError) {
          console.error("Error linking ingredient to recipe:", linkError);
          // Continue with other ingredients
          continue;
        }

        processedIngredients.push({
          text: ingredient.text,
          ingredient_id: ingredientId,
          amount: ingredient.amount,
          unit: ingredient.unit
        });

      } catch (error) {
        console.error(`Error processing ingredient "${ingredient.text}":`, error);
        // Continue with other ingredients
        continue;
      }
    }

    return new Response(JSON.stringify({
      recipe_id: recipeId,
      title,
      instructions,
      processed_ingredients: processedIngredients,
      total_ingredients: ingredients.length,
      successfully_processed: processedIngredients.length
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: error.stack
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create_recipe_with_embeddings' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{
      "title": "Chicken Stir Fry",
      "instructions": ["Heat oil in pan", "Add chicken and cook", "Add vegetables", "Serve hot"],
      "ingredients": [
        {"text": "chicken breast", "amount": 1, "unit": "lb"},
        {"text": "bell peppers", "amount": 2, "unit": "cups"},
        {"text": "soy sauce", "amount": 2, "unit": "tbsp"}
      ],
      "is_public": true
    }'

*/
