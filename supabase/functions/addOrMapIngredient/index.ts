// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { generateEmbedding } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const { 
      name, 
      ingredient_id, 
      parent_ids = [], 
      food_group_id,
      hierarchy_depth = 0,
      action = "create_ingredient" // "create_ingredient", "create_alias", "create_parent_link"
    } = await req.json();
    
    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "name is required and must be a string" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Generate embedding for the new ingredient/alias
    const embedding = await generateEmbedding(name, GEMINI_API_KEY, { taskType: "RETRIEVAL_DOCUMENT" });

    if (!embedding || embedding.length === 0) {
      throw new Error("Failed to generate embedding");
    }

    let result;

    switch (action) {
      case "create_ingredient": {
        // Create a new ingredient
        const { data: newIngredient, error: ingredientError } = await supabase
          .from("ingredients")
          .insert({
            name,
            food_group_id: food_group_id || null,
            hierarchy_depth: parseInt(hierarchy_depth.toString(), 10),
            embedding,
          })
          .select()
          .single();

        if (ingredientError) {
          throw new Error(`Failed to create ingredient: ${ingredientError.message}`);
        }

        // Create parent relationships if specified
        if (parent_ids.length > 0) {
          const parentLinks = parent_ids.map((parent_id: string) => ({
            parent_id,
            child_id: newIngredient.id,
          }));

          const { error: parentError } = await supabase
            .from("ingredient_parents")
            .insert(parentLinks);

          if (parentError) {
            console.warn("Failed to create some parent links:", parentError);
          }
        }

        result = {
          action: "ingredient_created",
          ingredient: newIngredient,
          parent_links_created: parent_ids.length,
        };
        break;
      }

      case "create_alias": {
        if (!ingredient_id) {
          return new Response(JSON.stringify({ error: "ingredient_id is required for creating aliases" }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
          });
        }

        // Create a new alias for an existing ingredient
        const { data: newAlias, error: aliasError } = await supabase
          .from("ingredient_aliases")
          .insert({
            name,
            ingredient_id,
            embedding,
          })
          .select()
          .single();

        if (aliasError) {
          throw new Error(`Failed to create alias: ${aliasError.message}`);
        }

        result = {
          action: "alias_created",
          alias: newAlias,
        };
        break;
      }

      case "create_parent_link": {
        if (!ingredient_id || parent_ids.length === 0) {
          return new Response(JSON.stringify({ 
            error: "ingredient_id and parent_ids are required for creating parent links" 
          }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            },
          });
        }

        // Create parent relationships
        const parentLinks = parent_ids.map((parent_id: string) => ({
          parent_id,
          child_id: ingredient_id,
        }));

        const { data: createdLinks, error: parentError } = await supabase
          .from("ingredient_parents")
          .insert(parentLinks)
          .select();

        if (parentError) {
          throw new Error(`Failed to create parent links: ${parentError.message}`);
        }

        result = {
          action: "parent_links_created",
          links: createdLinks,
        };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action specified" }), {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
        });
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
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/addOrMapIngredient' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
