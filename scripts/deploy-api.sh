#!/bin/bash

# Recipe Graph API Deployment Script
# This script deploys RPC functions and Edge Functions to Supabase

set -e

echo "🚀 Starting Recipe Graph API deployment..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if logged in to Supabase
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase. Please run:"
    echo "supabase login"
    exit 1
fi

echo "✅ Supabase CLI ready"

# Step 1: Deploy database migrations (RPC functions)
echo "📊 Deploying RPC functions..."
if supabase db push; then
    echo "✅ RPC functions deployed successfully"
else
    echo "❌ Failed to deploy RPC functions"
    exit 1
fi

# Step 2: Deploy Edge Functions
echo "🔧 Deploying Edge Functions..."

functions=("canonicalizeIngredient" "recipesByPantry" "addOrMapIngredient")

if [ -z "$SUPABASE_PROJECT_REF" ]; then
    echo "❌ SUPABASE_PROJECT_REF not set. Please set it in your environment."
    exit 1
fi

for func in "${functions[@]}"; do
    echo "Deploying $func..."
    if supabase functions deploy "$func" --project-ref $SUPABASE_PROJECT_REF --use-api; then
        echo "✅ $func deployed successfully"
    else
        echo "❌ Failed to deploy $func"
        exit 1
    fi
done

# Step 3: Set environment variables (if GEMINI_API_KEY is provided)
if [ -n "$GEMINI_API_KEY" ]; then
    echo "🔐 Setting Gemini API key..."
    if supabase secrets set GEMINI_API_KEY="$GEMINI_API_KEY"; then
        echo "✅ Environment variables set"
    else
        echo "❌ Failed to set environment variables"
        exit 1
    fi
else
    echo "⚠️  GEMINI_API_KEY not provided. You'll need to set it manually:"
    echo "supabase secrets set GEMINI_API_KEY=your-key-here"
fi

echo "🎉 Deployment completed successfully!"
echo ""
echo "Next steps:"
echo "1. Test the API endpoints using the integration tests:"
echo "   npm run test:integration"
echo ""
echo "2. Or test manually with curl:"
echo "   curl -X POST 'https://your-project.supabase.co/functions/v1/canonicalizeIngredient' \\"
echo "     -H 'Authorization: Bearer your-anon-key' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\":\"chicken breast\",\"topN\":3}'"
