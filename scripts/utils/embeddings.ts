/**
 * Embedding Generation Utility
 * 
 * Handles generation of embeddings using Google Generative AI
 */

import { GoogleGenAI } from '@google/genai';
import { withRetry, RetryConfig, sleep } from './apiRetry';

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  model: string;
  dimension: number;
  taskType: string;
  batchSize: number;
  retry: RetryConfig;
  // Rate limiting parameters
  requestsPerMinuteLimit?: number; // Default: 100 for Gemini Embedding
  tokensPerMinuteLimit?: number;   // Default: 30,000 for Gemini Embedding
  estimatedTokensPerChar?: number; // Estimated tokens per character for calculating token usage
}

/**
 * Default embedding configuration
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'gemini-embedding-001',
  dimension: 1536,
  taskType: 'RETRIEVAL_DOCUMENT',
  batchSize: 100,
  retry: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
  },
};

/**
 * Embedding Generator class
 */
export class EmbeddingGenerator {
  private genAI: GoogleGenAI;
  private config: EmbeddingConfig;

  /**
   * Create a new EmbeddingGenerator
   * 
   * @param apiKey Google API key (optional if GEMINI_API_KEY env var is set)
   * @param config Embedding configuration
   */
  constructor(apiKey?: string, config: Partial<EmbeddingConfig> = {}) {
    // If apiKey is provided, use it; otherwise, the SDK will use GEMINI_API_KEY env var
    this.genAI = apiKey ? new GoogleGenAI({ apiKey }) : new GoogleGenAI({});
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Generate embeddings for multiple texts in batches
   * 
   * @param texts Array of texts to generate embeddings for
   * @returns Array of embeddings (or undefined for failed embeddings)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<(number[] | undefined)[]> {
    // Filter out empty texts
    const validTexts = texts.filter(text => text && text.trim() !== '');
    
    if (validTexts.length === 0) {
      return [];
    }
    
    try {
      // Process in batches according to config
      const results: (number[] | undefined)[] = [];
      const batchSize = this.config.batchSize;
      
      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize).map(text => text.trim());
        console.log(`  Processing embedding batch ${i/batchSize + 1}/${Math.ceil(validTexts.length/batchSize)} (${batch.length} items)...`);
        
        try {
          // Use withRetry to handle rate limits
          const batchResults = await withRetry(
            async () => {
              // Use true batch embedding capability of the Gemini API
              const response = await this.genAI.models.embedContent({
                model: this.config.model,
                contents: batch,
                config: {
                  taskType: this.config.taskType,
                  outputDimensionality: this.config.dimension
                }
              });
              
              // Extract embeddings from response
              if (response && response.embeddings) {
                return response.embeddings.map((embedding: any) => 
                  embedding && embedding.values ? embedding.values : undefined
                );
              } else {
                console.error('Unexpected response structure from Gemini:', response);
                return batch.map(() => undefined);
              }
            },
            this.config.retry,
            (attempt, delay, _error) => {
              console.warn(`Rate limit hit. Retry attempt ${attempt}/${this.config.retry.maxRetries} after ${delay}ms delay...`);
            }
          );
          
          results.push(...batchResults);
        } catch (error) {
          console.error(`Error processing batch: ${error}`);
          // Add undefined for each item in the failed batch
          results.push(...batch.map(() => undefined));
        }
        
        // Add a longer delay between batches to avoid rate limiting
        // Gemini has a 100 RPM limit, so we need to pace our requests
        if (i + batchSize < validTexts.length) {
          // Use a longer delay (2000ms = 2 seconds) to stay well under the rate limits
          await sleep(2000);
        }
      }
      
      return results;
    } catch (error) {
      console.error(`Error in batch embedding: ${error}`);
      return validTexts.map(() => undefined);
    }
  }

  /**
   * Generate embedding for a single text
   * 
   * @param text Text to generate embedding for
   * @returns Embedding array or undefined if failed
   */
  async generateEmbedding(text: string): Promise<number[] | undefined> {
    if (!text || text.trim() === '') {
      console.warn('Warning: Empty text provided for embedding generation');
      return undefined;
    }
    
    // Use the batch function which already has retry logic
    const embeddings = await this.generateBatchEmbeddings([text]);
    return embeddings[0];
  }
}
