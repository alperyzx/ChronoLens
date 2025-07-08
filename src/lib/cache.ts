import NodeCache from 'node-cache';

// Create a cache instance with TTL (time to live) in seconds
// We'll set TTL to expire at midnight to ensure daily refresh
const cache = new NodeCache();

export interface CachedHistoricalEvent {
  title: string;
  date: string;
  description: string;
  category: string;
  source: string;
}

export type CacheKey = {
  date: string; // YYYY-MM-DD or "This Week"
  category: 'Sociology' | 'Technology' | 'Philosophy' | 'Science' | 'Politics' | 'Art';
  viewType: 'today' | 'week';
};

// Generate a unique cache key for each request
export function generateCacheKey(key: CacheKey): string {
  return `events_${key.viewType}_${key.category}_${key.date}`;
}

// Get TTL until next midnight (in seconds)
export function getTTLUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const ttlMs = tomorrow.getTime() - now.getTime();
  return Math.floor(ttlMs / 1000); // Convert to seconds
}

// Get TTL until end of current week (Sunday at midnight)
export function getTTLUntilEndOfWeek(): number {
  const now = new Date();
  const endOfWeek = new Date(now);
  
  // Calculate days until Sunday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const currentDay = now.getDay();
  const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay; // If today is Sunday, cache for next Sunday
  
  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  endOfWeek.setHours(0, 0, 0, 0); // Set to midnight of the end day
  
  const ttlMs = endOfWeek.getTime() - now.getTime();
  return Math.floor(ttlMs / 1000); // Convert to seconds
}

// Get appropriate TTL based on view type
export function getTTLForViewType(viewType: 'today' | 'week'): number {
  return viewType === 'today' ? getTTLUntilMidnight() : getTTLUntilEndOfWeek();
}

// Set cache with automatic TTL based on view type
export function setCacheData(key: string, data: CachedHistoricalEvent[], viewType: 'today' | 'week'): void {
  const ttl = getTTLForViewType(viewType);
  cache.set(key, data, ttl);
  
  const expiryDescription = viewType === 'today' ? 'midnight' : 'end of week (Sunday)';
  console.log(`Cache set for key: ${key}, TTL: ${ttl} seconds (expires at ${expiryDescription})`);
}

// Get cache data
export function getCacheData(key: string): CachedHistoricalEvent[] | undefined {
  const data = cache.get<CachedHistoricalEvent[]>(key);
  if (data) {
    console.log(`Cache hit for key: ${key}`);
  } else {
    console.log(`Cache miss for key: ${key}`);
  }
  return data;
}

// Check if cache has valid data
export function hasValidCache(key: string): boolean {
  return cache.has(key);
}

// Clear all cache (useful for development/testing)
export function clearCache(): void {
  cache.flushAll();
  console.log('Cache cleared');
}

// Get cache statistics
export function getCacheStats() {
  const stats = cache.getStats();
  return {
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0
  };
}

// Get cache expiration info for display purposes
export function getCacheExpirationInfo(viewType: 'today' | 'week') {
  const now = new Date();
  
  if (viewType === 'today') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return {
      expiresAt: tomorrow,
      description: 'midnight',
      ttlSeconds: getTTLUntilMidnight()
    };
  } else {
    const endOfWeek = new Date(now);
    const currentDay = now.getDay();
    const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
    
    endOfWeek.setDate(now.getDate() + daysUntilSunday);
    endOfWeek.setHours(0, 0, 0, 0);
    
    return {
      expiresAt: endOfWeek,
      description: 'end of week (Sunday)',
      ttlSeconds: getTTLUntilEndOfWeek()
    };
  }
}
