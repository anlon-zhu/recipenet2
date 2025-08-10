/**
 * Deno-compatible embedding utility for Edge Functions
 * Based on scripts/utils/embeddings.ts but adapted for Deno runtime
 */

export interface EmbeddingConfig {
  model: string;
  dimension: number;
  taskType: string;
  maxRetries: number;
  initialDelayMs: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'gemini-embedding-001',
  dimension: 1536,
  taskType: 'RETRIEVAL_QUERY',
  maxRetries: 3,
  initialDelayMs: 1000,
};

/**
 * Generate embedding using Gemini API (Deno-compatible)
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<number[]> {
  const finalConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  
  if (!text || text.trim() === '') {
    throw new Error('Text is required for embedding generation');
  }

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${finalConfig.model}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: finalConfig.model,
            content: {
              parts: [{ text: text.trim() }]
            },
            taskType: finalConfig.taskType,
            outputDimensionality: finalConfig.dimension
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const embedding = data.embedding?.values;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from Gemini API');
      }
      
      // Verify dimensions match expected
      if (embedding.length !== finalConfig.dimension) {
        throw new Error(`Expected ${finalConfig.dimension} dimensions, got ${embedding.length}`);
      }
      
      return embedding;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < finalConfig.maxRetries) {
        const delay = finalConfig.initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`Embedding attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to generate embedding after all retries');
}
