/**
 * API Retry Utility
 * 
 * Provides utilities for handling API rate limits with exponential backoff
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
};

/**
 * Sleep for a specified number of milliseconds
 */
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoffDelay(
  retryAttempt: number, 
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const { initialDelayMs, maxDelayMs } = config;
  
  // Calculate exponential backoff: initialDelay * 2^retryAttempt
  let delay = initialDelayMs * Math.pow(2, retryAttempt);
  
  // Add jitter: random value between 0 and 1 * delay * 0.1 (10% jitter)
  const jitter = Math.random() * delay * 0.1;
  delay += jitter;
  
  // Cap at max delay
  return Math.min(delay, maxDelayMs);
}

/**
 * Check if an error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  return error?.message && (
    error.message.includes('429') || 
    error.message.includes('Too Many Requests') ||
    error.message.includes('rate limit') ||
    error.message.includes('quota')
  );
}

/**
 * Execute a function with retry logic for handling rate limits
 * 
 * @param fn The async function to execute with retries
 * @param config Retry configuration
 * @param onRetry Optional callback called when a retry occurs
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, delay: number, error: any) => void
): Promise<T> {
  let retryAttempt = 0;
  const { maxRetries } = config;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (isRateLimitError(error) && retryAttempt < maxRetries) {
        retryAttempt++;
        const delay = calculateBackoffDelay(retryAttempt, config);
        
        if (onRetry) {
          onRetry(retryAttempt, delay, error);
        }
        
        await sleep(delay);
        continue;
      }
      
      // If we've exhausted retries or it's not a rate limit error, rethrow
      throw error;
    }
  }
}
