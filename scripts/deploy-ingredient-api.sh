#!/bin/bash

# Deploy Ingredient & Recipe API
# This script deploys the new read/write flow API structure

set -e

echo "🚀 Deploying Ingredient & Recipe API..."

# Check if we're in the right directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "Install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

if [ -z "$SUPABASE_PROJECT_REF" ]; then
    echo "❌ SUPABASE_PROJECT_REF not set. Please set it in your environment."
    echo "Run: export SUPABASE_PROJECT_REF=your-project-ref"
    exit 1
fi

echo "📊 Applying database migrations..."
supabase db push

echo "🔧 Deploying Edge Functions..."

# Deploy all the new Edge Functions
echo "  📦 Deploying match_ingredient_text..."
supabase functions deploy match_ingredient_text --project-ref $SUPABASE_PROJECT_REF --use-api

echo "  📦 Deploying upsert_from_text..."
supabase functions deploy upsert_from_text --project-ref $SUPABASE_PROJECT_REF --use-api

echo "  📦 Deploying create_recipe_with_embeddings..."
supabase functions deploy create_recipe_with_embeddings --project-ref $SUPABASE_PROJECT_REF --use-api

echo "  📦 Deploying get_recipes_by_ingredients..."
supabase functions deploy get_recipes_by_ingredients --project-ref $SUPABASE_PROJECT_REF --use-api


echo "🔑 Setting environment variables..."
# Note: You need to set GEMINI_API_KEY manually
echo "  ⚠️  Don't forget to set your Gemini API key:"
echo "     supabase secrets set GEMINI_API_KEY=your-api-key-here"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 API Endpoints:"
echo "  🔍 Read flows:"
echo "    - RPC: rpc_get_all_ingredients_for_matching (client-side caching)"
echo "    - RPC: rpc_vector_search_ingredients (vector search fallback)"
echo "    - Edge: match_ingredient_text (AI matching with no DB changes)"
echo ""
echo "  ✏️  Write flows:"
echo "    - Edge: upsert_from_text (map to existing or create new ingredient)"
echo "    - Edge: create_recipe_with_embeddings (bulk recipe creation)"
echo ""
echo "  🛠️  Helpers:"
echo "    - Shared: _shared/embeddings.ts (embedding generation utility)"
echo ""
echo "🧪 Test the API:"
echo "  curl -X POST 'https://your-project.supabase.co/functions/v1/match_ingredient_text' \\"
echo "    -H 'Authorization: Bearer your-anon-key' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"text\":\"chicken breast\",\"topN\":3}'"
echo ""
