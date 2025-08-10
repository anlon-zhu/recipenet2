// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const { pantry_ids, min_coverage = 1.0, limit = 100 } = await req.json();
    
    if (!pantry_ids || !Array.isArray(pantry_ids)) {
      return new Response(JSON.stringify({ error: "pantry_ids is required and must be an array" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Validate UUIDs format (basic validation)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = pantry_ids.filter(id => typeof id !== 'string' || !uuidRegex.test(id));
    
    if (invalidIds.length > 0) {
      return new Response(JSON.stringify({ 
        error: "Invalid UUID format in pantry_ids",
        invalid_ids: invalidIds
      }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Call the RPC function for recipe matching
    const { data: recipes, error: recipesError } = await supabase.rpc(
      "rpc_recipes_by_pantry",
      {
        pantry_ids,
        min_coverage: parseFloat(min_coverage.toString()),
        limit_count: parseInt(limit.toString(), 10),
      }
    );

    if (recipesError) {
      console.error("RPC error:", recipesError);
      throw new Error(`Database query failed: ${recipesError.message}`);
    }

    // Optionally get suggestions for missing ingredients if coverage is less than 1.0
    let suggestions = [];
    if (min_coverage < 1.0) {
      const { data: suggestionsData, error: suggestionsError } = await supabase.rpc(
        "rpc_suggest_missing_ingredients",
        {
          pantry_ids,
          limit_count: 10,
        }
      );

      if (suggestionsError) {
        console.warn("Failed to fetch ingredient suggestions:", suggestionsError);
      } else {
        suggestions = suggestionsData || [];
      }
    }

    const response = {
      recipes: recipes || [],
      suggestions,
      metadata: {
        pantry_size: pantry_ids.length,
        min_coverage,
        total_results: (recipes || []).length,
      }
    };

    return new Response(JSON.stringify(response), {
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
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/recipesByPantry' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
