// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "../_shared/embeddings.ts";

// Type definitions for database results
interface VectorSearchResult {
  ingredient_id: string;
  ingredient_name: string;
  best_alias: string;
  alias_id: string;
  distance: number;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Normalize text for better matching
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

    const { text, topN = 6 } = await req.json();
    
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required and must be a string" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      });
    }

    // 1. Normalize text
    const normalizedText = normalizeText(text);

    // 2. Generate embedding for vector search
    const embedding = await generateEmbedding(normalizedText, GEMINI_API_KEY, { 
      taskType: 'RETRIEVAL_QUERY' // Use QUERY for search queries
    });

    if (!embedding || embedding.length === 0) {
      throw new Error("Failed to generate embedding");
    }

    // 3. Run vector search via RPC
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

    // 4. Return ranked candidates (no DB changes)
    const results = (searchResults || []).map((row: VectorSearchResult) => ({
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient_name,
      best_alias: row.best_alias,
      alias_id: row.alias_id,
      distance: row.distance,
      confidence: Math.max(0, 1 - row.distance) // Convert distance to confidence score
    }));

    return new Response(JSON.stringify({
      query: text,
      normalized_query: normalizedText,
      results
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
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/match_ingredient_text' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"text":"chikn breast","topN":3}'

*/
