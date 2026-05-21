import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalEvents, generateHistoricalEventsByCategory, type HistoricalEventsByCategory } from '@/ai/flows/generate-historical-events';
import { 
  acquireCacheLock,
  releaseCacheLock,
  getCacheData, 
  hasValidCache,
  setCacheData, 
  generateCacheKey, 
  type CacheKey,
  type CachedHistoricalEvent 
} from '@/lib/cache';
import { normalizeCacheDate } from '@/lib/cache-keys';
import { filterHiddenContent } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from '@/lib/historical-event-categories';

const CACHE_VERSION = 'v3';
const GENERATION_LOCK_TTL_MS = 4 * 60 * 1000;
const GENERATION_LOCK_WAIT_MS = 4 * 60 * 1000;
const GENERATION_LOCK_POLL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getGenerationLockKey(date: string, viewType: 'today' | 'week', scope: 'batch' | HistoricalEventCategory): string {
  const normalizedDate = normalizeCacheDate(date, viewType);
  return `chronolens_generation_${scope}_${viewType}_${normalizedDate}_${CACHE_VERSION}`;
}

async function getCachedSingleCategoryResponse(cacheKey: string): Promise<CachedHistoricalEvent[] | undefined> {
  if (!(await hasValidCache(cacheKey))) {
    return undefined;
  }

  return await getCacheData(cacheKey);
}

async function getCachedBatchResponse(date: string, viewType: 'today' | 'week'): Promise<HistoricalEventsByCategory | undefined> {
  const cacheKeys = HISTORICAL_EVENT_CATEGORIES.map(currentCategory => {
    const cacheKey: CacheKey = {
      date,
      category: currentCategory,
      viewType,
      version: CACHE_VERSION,
    };

    return {
      category: currentCategory,
      key: generateCacheKey(cacheKey),
    };
  });

  const cacheValidity = await Promise.all(
    cacheKeys.map(async entry => ({
      category: entry.category,
      hasCache: await hasValidCache(entry.key),
    }))
  );

  if (!cacheValidity.every(result => result.hasCache)) {
    return undefined;
  }

  const dataByCategory = await Promise.all(
    cacheKeys.map(async entry => [
      entry.category,
      await filterHiddenContent(await getCacheData(entry.key) || []),
    ] as const)
  );

  return Object.fromEntries(dataByCategory) as HistoricalEventsByCategory;
}

async function runLockedGeneration<T>(options: {
  lockKey: string;
  readCachedData: () => Promise<T | undefined>;
  generateFreshData: () => Promise<T>;
  storeFreshData: (data: T) => Promise<void>;
}): Promise<{ data: T; cached: boolean }> {
  const deadline = Date.now() + GENERATION_LOCK_WAIT_MS;

  while (true) {
    const cachedData = await options.readCachedData();
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    const acquired = await acquireCacheLock(options.lockKey, GENERATION_LOCK_TTL_MS);
    if (acquired) {
      try {
        const cachedAfterLock = await options.readCachedData();
        if (cachedAfterLock) {
          return { data: cachedAfterLock, cached: true };
        }

        const freshData = await options.generateFreshData();
        await options.storeFreshData(freshData);
        return { data: freshData, cached: false };
      } finally {
        await releaseCacheLock(options.lockKey);
      }
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(GENERATION_LOCK_POLL_MS);
  }

  const cachedData = await options.readCachedData();
  if (cachedData) {
    return { data: cachedData, cached: true };
  }

  throw new Error('Timed out waiting for historical events generation lock');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const category = searchParams.get('category');
    const viewType = searchParams.get('viewType');

    const isBatchRequest = !category || category === 'all';

    // Validate required parameters
    if (!date || !viewType || (!isBatchRequest && !category)) {
      return NextResponse.json(
        { error: 'Missing required parameters: date, viewType, and category for single-category requests' },
        { status: 400 }
      );
    }

    // Validate category
    if (!isBatchRequest && !HISTORICAL_EVENT_CATEGORIES.includes(category as HistoricalEventCategory)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Validate viewType
    if (!['today', 'week'].includes(viewType)) {
      return NextResponse.json(
        { error: 'Invalid viewType. Must be "today" or "week"' },
        { status: 400 }
      );
    }

    if (isBatchRequest) {
      const cachedBatchData = await getCachedBatchResponse(date, viewType as 'today' | 'week');

      if (cachedBatchData) {
        const dataByCategory = await Promise.all(
          HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => [
            currentCategory,
            cachedBatchData[currentCategory] || [],
          ] as const)
        );

        return NextResponse.json({
          dataByCategory: Object.fromEntries(dataByCategory),
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      console.log('Fetching fresh data from Gemini API for all categories');

      if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
        console.error('Google Gemini API key not configured');
        return NextResponse.json({
          error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
          dataByCategory: Object.fromEntries(HISTORICAL_EVENT_CATEGORIES.map(currentCategory => [currentCategory, []])),
          cached: false,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }

      const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', 'batch');
      const { data: eventsByCategory, cached } = await runLockedGeneration<HistoricalEventsByCategory>({
        lockKey,
        readCachedData: async () => getCachedBatchResponse(date, viewType as 'today' | 'week'),
        generateFreshData: async () => {
          const generatedEvents = await generateHistoricalEventsByCategory({
            date: viewType === 'week' ? 'This Week' : date,
            category: 'Sociology'
          });

          return generatedEvents;
        },
        storeFreshData: async generatedEventsByCategory => {
          await Promise.all(
            HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
              const events = generatedEventsByCategory[currentCategory] || [];
              const cachedEvents: CachedHistoricalEvent[] = events.map(event => ({
                title: event.title,
                date: event.date,
                description: event.description,
                category: event.category,
                source: event.source
              }));

              const cacheKey: CacheKey = {
                date,
                category: currentCategory,
                viewType: viewType as 'today' | 'week',
                version: CACHE_VERSION,
              };

              const key = generateCacheKey(cacheKey);
              await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
            })
          );
        }
      });

      const dataByCategoryEntries = await Promise.all(
        HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
          const filteredEvents = await filterHiddenContent(eventsByCategory[currentCategory] || []);
          return [currentCategory, filteredEvents] as const;
        })
      );

      return NextResponse.json({
        dataByCategory: Object.fromEntries(dataByCategoryEntries),
        cached,
        timestamp: new Date().toISOString()
      });
    }

    // Create cache key
    const cacheKey: CacheKey = {
      date,
      category: category as HistoricalEventCategory,
      viewType: viewType as 'today' | 'week',
      version: CACHE_VERSION,
    };
    
    const key = generateCacheKey(cacheKey);

    const cachedData = await getCachedSingleCategoryResponse(key);
    if (cachedData) {
      // Filter out reported content before returning
      const filteredData = await filterHiddenContent(cachedData);
      
      return NextResponse.json({
        data: filteredData,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Cache miss - fetch from AI
    console.log(`Fetching fresh data from Gemini API for: ${key}`);
    
    // Check if API key is configured
    if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error('Google Gemini API key not configured');
      return NextResponse.json({
        error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
        data: [],
        cached: false,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', category as HistoricalEventCategory);
    const { data: events, cached } = await runLockedGeneration({
      lockKey,
      readCachedData: async () => getCachedSingleCategoryResponse(key),
      generateFreshData: async () => generateHistoricalEvents({
        date: viewType === 'week' ? 'This Week' : date,
        category: category as HistoricalEventCategory
      }),
      storeFreshData: async generatedEvents => {
        const cachedEvents: CachedHistoricalEvent[] = generatedEvents.map(event => ({
          title: event.title,
          date: event.date,
          description: event.description,
          category: event.category,
          source: event.source
        }));

        await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
      }
    });

    // Filter out reported content before returning to client
    const filteredEvents = await filterHiddenContent(events);

    return NextResponse.json({
      data: filteredEvents,
      cached,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in historical events API:', error);
    
    // Check if it's an API key related error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAPIKeyError = errorMessage.includes('API key') || errorMessage.includes('GOOGLE_GENAI_API_KEY');
    
    return NextResponse.json({
      error: isAPIKeyError 
        ? 'Google Gemini API key not configured properly. Please check your environment variables.'
        : 'Failed to fetch historical events. Please try again later.',
      data: [],
      cached: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
