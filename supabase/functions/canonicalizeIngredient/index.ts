// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { generateEmbedding } from "../_shared/embeddings.ts";

// Type definitions for database results
interface VectorSearchResult {
  ingredient_id: string;
  ingredient_name: string;
  best_alias: string;
  alias_id: string;
  distance: number;
}

interface IngredientParent {
  parent_id: string;
  parent_name: string;
}

interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

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

    const { name, topN = 6 } = await req.json();
    
    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "name is required and must be a string" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // Get embedding for the query
    const embedding = await generateEmbedding(name, GEMINI_API_KEY, { taskType: 'RETRIEVAL_QUERY' });

    if (!embedding || embedding.length === 0) {
      throw new Error("Failed to generate embedding");
    }

    // Call the RPC function for vector search
    const { data: searchResults, error: searchError } = await supabase.rpc(
      "rpc_vector_search_ingredients",
      {
        query_embedding: embedding,
        match_count: topN,
      }
    );

    if (searchError) {
      console.error("RPC error:", searchError);
      throw new Error(`Database search failed: ${searchError.message}`);
    }

    // Augment results with parent data
    const results = await Promise.all(
      (searchResults || []).map(async (row: VectorSearchResult) => {
        const { data: parents, error: parentsError } = await supabase.rpc(
          "rpc_get_ingredient_parents",
          { child_id: row.ingredient_id }
        ) as { data: IngredientParent[] | null; error: SupabaseError | null };

        if (parentsError) {
          console.warn("Failed to fetch parents for ingredient:", row.ingredient_id, parentsError);
        }

        return {
          ...row,
          parents: parents || [],
        };
      })
    );

    return new Response(JSON.stringify(results), {
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
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/canonicalizeIngredient' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
