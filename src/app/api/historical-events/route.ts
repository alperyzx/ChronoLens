import { after, NextRequest, NextResponse } from 'next/server';
import { generateHistoricalEvents, generateHistoricalEventsByCategory, type HistoricalEventsByCategory } from '@/ai/flows/generate-historical-events';
import { 
  acquireCacheLock,
  releaseCacheLock,
  getCacheData, 
  hasValidCache,
  setCacheData, 
  generateCacheKey, 
  type CacheKey,
  type CachedHistoricalEvent,
  type CachedHistoricalEventSelection,
} from '@/lib/cache';
import { normalizeCacheDate } from '@/lib/cache-keys';
import { filterHiddenContent } from '@/lib/report-cache';
import { getReportStats } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from '@/lib/historical-event-categories';

const CACHE_VERSION = 'v7';
const GENERATION_LOCK_TTL_MS = 4 * 60 * 1000;
const GENERATION_LOCK_WAIT_MS = 4 * 60 * 1000;
const GENERATION_LOCK_POLL_MS = 1000;
const SOURCE_URL_TIMEOUT_MS = 5000;

export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildReportCacheRevision(stats: Awaited<ReturnType<typeof getReportStats>>): string {
  return [
    stats.lastClearYear,
    stats.lastClearWeek,
    stats.totalReported,
    stats.hiddenContent,
  ].join(':');
}

function isEmptySelection(selection?: CachedHistoricalEventSelection | null): boolean {
  return !selection || selection.count <= 0 || !Array.isArray(selection.events) || selection.events.length === 0;
}

function normalizeSourceUrl(source: string): string | undefined {
  try {
    const url = new URL(source.trim());

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return undefined;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

// ponytail: checks URL reachability, not fact-to-page semantics; use grounded search when proof is required.
async function validateSourceUrl(source: string): Promise<string> {
  const normalizedSource = normalizeSourceUrl(source);
  if (!normalizedSource) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_URL_TIMEOUT_MS);

  try {
    let response = await fetch(normalizedSource, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok || response.status === 405) {
      response = await fetch(normalizedSource, {
        headers: { Range: 'bytes=0-4095' },
        redirect: 'follow',
        signal: controller.signal,
      });
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    const isSupportedDocument = !contentType || contentType.includes('text/html') || contentType.includes('application/pdf');

    if (!response.ok || !isSupportedDocument) {
      return '';
    }

    return normalizeSourceUrl(response.url) || normalizedSource;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function validateSelectionSources(selection: CachedHistoricalEventSelection): Promise<CachedHistoricalEventSelection> {
  const events = await Promise.all(
    selection.events.map(async event => ({
      ...event,
      source: await validateSourceUrl(event.source),
    }))
  );

  return { ...selection, events };
}

async function validateCategorySources(selections: HistoricalEventsByCategory): Promise<HistoricalEventsByCategory> {
  const entries = await Promise.all(
    HISTORICAL_EVENT_CATEGORIES.map(async category => [
      category,
      await validateSelectionSources(selections[category] || emptySelection()),
    ] as const)
  );

  return Object.fromEntries(entries) as HistoricalEventsByCategory;
}

function getGenerationLockKey(date: string, viewType: 'today' | 'week', scope: 'batch' | HistoricalEventCategory): string {
  const normalizedDate = normalizeCacheDate(date, viewType);
  return `chronolens_generation_${scope}_${viewType}_${normalizedDate}_${CACHE_VERSION}`;
}

async function getCachedSingleCategoryResponse(cacheKey: string): Promise<CachedHistoricalEventSelection | undefined> {
  if (!(await hasValidCache(cacheKey))) {
    return undefined;
  }

  const cachedSelection = await getCacheData(cacheKey);
  return isEmptySelection(cachedSelection) ? undefined : cachedSelection;
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
      await getCacheData(entry.key),
    ] as const)
  );

  const selectionsByCategory = Object.fromEntries(dataByCategory) as HistoricalEventsByCategory;
  const hasAnySelection = HISTORICAL_EVENT_CATEGORIES.some(category => !isEmptySelection(selectionsByCategory[category]));

  return hasAnySelection ? selectionsByCategory : undefined;
}

async function getVisibleSelection(selection: CachedHistoricalEventSelection): Promise<CachedHistoricalEvent[]> {
  const visibleEvents = await filterHiddenContent(selection.events);
  return visibleEvents.slice(0, selection.count);
}

async function getVisibleSelectionsByCategory(selections: HistoricalEventsByCategory): Promise<Record<HistoricalEventCategory, CachedHistoricalEvent[]>> {
  const visibleSelections = await Promise.all(
    HISTORICAL_EVENT_CATEGORIES.map(async category => {
      const selection = selections[category] || { count: 0, events: [] };
      return [category, await getVisibleSelection(selection)] as const;
    })
  );

  return Object.fromEntries(visibleSelections) as Record<HistoricalEventCategory, CachedHistoricalEvent[]>;
}

function emptySelection(): CachedHistoricalEventSelection {
  return { count: 0, events: [] };
}

function emptySelectionsByCategory(): HistoricalEventsByCategory {
  return Object.fromEntries(
    HISTORICAL_EVENT_CATEGORIES.map(category => [category, emptySelection()] as const)
  ) as HistoricalEventsByCategory;
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

function keepGenerationAlive<T>(promise: Promise<T>): Promise<T> {
  after(
    promise.catch(error => {
      console.error('Historical events background generation failed:', error);
      throw error;
    })
  );

  return promise;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const category = searchParams.get('category');
    const viewType = searchParams.get('viewType');
    const metadataOnly = searchParams.get('metadataOnly') === '1';

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

    if (metadataOnly) {
      const reportStats = await getReportStats();
      const reportCacheRevision = buildReportCacheRevision(reportStats);

      if (isBatchRequest) {
        const cachedBatchData = await getCachedBatchResponse(date, viewType as 'today' | 'week');
        return NextResponse.json({
          cached: Boolean(cachedBatchData),
          generationRequired: !cachedBatchData,
          reportCacheRevision,
          scope: 'batch',
        });
      }

      const cacheKey: CacheKey = {
        date,
        category: category as HistoricalEventCategory,
        viewType: viewType as 'today' | 'week',
        version: CACHE_VERSION,
      };
      const key = generateCacheKey(cacheKey);
      const cachedData = await getCachedSingleCategoryResponse(key);

      return NextResponse.json({
        cached: Boolean(cachedData),
        generationRequired: !cachedData,
        reportCacheRevision,
        scope: 'single',
      });
    }

    if (isBatchRequest) {
      const cachedBatchData = await getCachedBatchResponse(date, viewType as 'today' | 'week');

      if (cachedBatchData) {
        const visibleEventsByCategory = await getVisibleSelectionsByCategory(cachedBatchData);

        return NextResponse.json({
          dataByCategory: cachedBatchData,
          visibleEventsByCategory,
          cached: true,
          reportCacheRevision: buildReportCacheRevision(await getReportStats()),
          timestamp: new Date().toISOString()
        });
      }

      console.log('Fetching fresh data from Gemini API for all categories');

      if (!process.env.GOOGLE_GENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
        console.error('Google Gemini API key not configured');
        return NextResponse.json({
          error: 'API key not configured. Please set GOOGLE_GENAI_API_KEY in your environment variables.',
          dataByCategory: emptySelectionsByCategory(),
          visibleEventsByCategory: Object.fromEntries(HISTORICAL_EVENT_CATEGORIES.map(currentCategory => [currentCategory, []] as const)),
          cached: false,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }

      const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', 'batch');
      const generationPromise = keepGenerationAlive(
        runLockedGeneration<HistoricalEventsByCategory>({
          lockKey,
          readCachedData: async () => getCachedBatchResponse(date, viewType as 'today' | 'week'),
          generateFreshData: async () => {
            const generatedEvents = await generateHistoricalEventsByCategory({
              date,
              viewType: viewType as 'today' | 'week',
              category: 'Sociology'
            });

            return validateCategorySources(generatedEvents);
          },
          storeFreshData: async generatedEventsByCategory => {
            await Promise.all(
              HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
                const cachedEvents = generatedEventsByCategory[currentCategory] || { count: 0, events: [] };

                if (isEmptySelection(cachedEvents)) {
                  return;
                }

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
          },
        })
      );

      const { data: eventsByCategory, cached } = await generationPromise;

      const visibleEventsByCategory = await getVisibleSelectionsByCategory(eventsByCategory);

      return NextResponse.json({
        dataByCategory: eventsByCategory,
        visibleEventsByCategory,
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
      const visibleEvents = await getVisibleSelection(cachedData);
      
      return NextResponse.json({
        data: cachedData,
        visibleEvents,
        cached: true,
        reportCacheRevision: buildReportCacheRevision(await getReportStats()),
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
        data: emptySelection(),
        visibleEvents: [],
        cached: false,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    const lockKey = getGenerationLockKey(date, viewType as 'today' | 'week', category as HistoricalEventCategory);
    const generationPromise = keepGenerationAlive(
      runLockedGeneration({
      lockKey,
      readCachedData: async () => getCachedSingleCategoryResponse(key),
      generateFreshData: async () => validateSelectionSources(await generateHistoricalEvents({
        date,
        viewType: viewType as 'today' | 'week',
        category: category as HistoricalEventCategory
      })),
      storeFreshData: async generatedEvents => {
        if (isEmptySelection(generatedEvents)) {
          return;
        }

        await setCacheData(key, generatedEvents, viewType as 'today' | 'week');
      }
    })
    );

    const { data: events, cached } = await generationPromise;

    const visibleEvents = await getVisibleSelection(events);

    return NextResponse.json({
      data: events,
      visibleEvents,
      cached,
      reportCacheRevision: buildReportCacheRevision(await getReportStats()),
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
      data: emptySelection(),
      visibleEvents: [],
      cached: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
