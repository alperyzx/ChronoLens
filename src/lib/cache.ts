// Use file-based cache by default for persistence across server restarts
// This solves the issue with Google Cloud stopping/restarting servers
import * as fileCache from './cache-file';

// Re-export types from file cache
export type { CachedHistoricalEvent, CacheKey } from './cache-file';

// Cache strategy selection based on environment
const USE_FILE_CACHE = process.env.USE_FILE_CACHE !== 'false'; // Default to true

// Re-export functions from file cache with the same interface
export const generateCacheKey = fileCache.generateCacheKey;
export const getTTLUntilMidnight = fileCache.getTTLUntilMidnight;
export const getTTLUntilEndOfWeek = fileCache.getTTLUntilEndOfWeek;
export const getTTLForViewType = fileCache.getTTLForViewType;
export const getCacheExpirationInfo = fileCache.getCacheExpirationInfo;

// Async wrapper functions to maintain backward compatibility with the API
export async function setCacheData(key: string, data: fileCache.CachedHistoricalEvent[], viewType: 'today' | 'week'): Promise<void> {
  if (USE_FILE_CACHE) {
    return fileCache.setCacheData(key, data, viewType);
  }
  // Graceful degradation - do nothing if cache is disabled
}

export async function getCacheData(key: string): Promise<fileCache.CachedHistoricalEvent[] | undefined> {
  if (USE_FILE_CACHE) {
    return fileCache.getCacheData(key);
  }
  return undefined;
}

export async function hasValidCache(key: string): Promise<boolean> {
  if (USE_FILE_CACHE) {
    return fileCache.hasValidCache(key);
  }
  return false;
}

export async function clearCache(): Promise<void> {
  if (USE_FILE_CACHE) {
    return fileCache.clearCache();
  }
}

export async function getCacheStats() {
  if (USE_FILE_CACHE) {
    return fileCache.getCacheStats();
  }
  return { keys: 0, hits: 0, misses: 0, hitRate: 0 };
}

// Utility function to clean up expired cache files
export async function cleanupExpiredCache(): Promise<void> {
  if (USE_FILE_CACHE) {
    return fileCache.cleanupExpiredCache();
  }
}
