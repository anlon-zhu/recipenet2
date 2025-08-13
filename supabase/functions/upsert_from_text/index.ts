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

// Normalize text for consistency
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // normalize whitespace
    .replace(/[^\w\s]/g, ''); // remove special characters
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

    const { text, action, ingredient_id } = await req.json();
    
    // Validate inputs
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required and must be a string" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    if (!action || !["map", "create"].includes(action)) {
      return new Response(JSON.stringify({ error: "action must be 'map' or 'create'" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    if (action === "map" && !ingredient_id) {
      return new Response(JSON.stringify({ error: "ingredient_id is required when action is 'map'" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // 1. Normalize and embed text
    const normalizedText = normalizeText(text);
    const embedding = await generateEmbedding(normalizedText, GEMINI_API_KEY, { 
      taskType: 'RETRIEVAL_DOCUMENT' // Use DOCUMENT for storing embeddings
    });

    if (!embedding || embedding.length === 0) {
      throw new Error("Failed to generate embedding");
    }

    let result;

    if (action === "map") {
      // 2a. Map to existing ingredient (create alias)
      
      // First verify the ingredient exists
      const { data: ingredient, error: ingredientError } = await supabase
        .from('ingredients')
        .select('id, name')
        .eq('id', ingredient_id)
        .single();

      if (ingredientError || !ingredient) {
        return new Response(JSON.stringify({ error: "Ingredient not found" }), {
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      }

      // Check if alias already exists
      const { data: existingAlias } = await supabase
        .from('ingredient_aliases')
        .select('id')
        .eq('name', text.trim())
        .single();

      if (existingAlias) {
        return new Response(JSON.stringify({ 
          error: "Alias already exists",
          ingredient_id,
          alias_id: existingAlias.id
        }), {
          status: 409,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      }

      // Insert new alias
      const { data: newAlias, error: aliasError } = await supabase
        .from('ingredient_aliases')
        .insert({
          name: text.trim(),
          ingredient_id: ingredient_id,
          embedding: embedding
        })
        .select('id')
        .single();

      if (aliasError) {
        console.error("Error creating alias:", aliasError);
        throw new Error(`Failed to create alias: ${aliasError.message}`);
      }

      result = {
        action: "mapped",
        ingredient_id: ingredient_id,
        ingredient_name: ingredient.name,
        alias_id: newAlias.id,
        alias_name: text.trim()
      };

    } else {
      // 2b. Create new ingredient
      
      // Check if ingredient with this name already exists
      const { data: existingIngredient } = await supabase
        .from('ingredients')
        .select('id, name')
        .eq('name', text.trim())
        .single();

      if (existingIngredient) {
        return new Response(JSON.stringify({ 
          error: "Ingredient already exists",
          ingredient_id: existingIngredient.id,
          ingredient_name: existingIngredient.name
        }), {
          status: 409,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
      }

      // Insert new ingredient
      const { data: newIngredient, error: ingredientError } = await supabase
        .from('ingredients')
        .insert({
          name: text.trim(),
          embedding: embedding,
          hierarchy_depth: 0 // Default to top-level
        })
        .select('id, name')
        .single();

      if (ingredientError) {
        console.error("Error creating ingredient:", ingredientError);
        throw new Error(`Failed to create ingredient: ${ingredientError.message}`);
      }

      result = {
        action: "created",
        ingredient_id: newIngredient.id,
        ingredient_name: newIngredient.name,
        alias_id: null, // No separate alias created
        alias_name: null
      };
    }

    return new Response(JSON.stringify(result), {
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
  
  Map to existing ingredient:
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/upsert_from_text' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"text":"chikn breast","action":"map","ingredient_id":"uuid-here"}'
    
  Create new ingredient:
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/upsert_from_text' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"text":"dragon fruit","action":"create"}'

*/
