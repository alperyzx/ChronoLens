import { NextRequest, NextResponse } from 'next/server';
import { generateHistoricalEvents, generateHistoricalEventsByCategory } from '@/ai/flows/generate-historical-events';
import { 
  getCacheData, 
  setCacheData, 
  generateCacheKey, 
  hasValidCache,
  type CacheKey,
  type CachedHistoricalEvent 
} from '@/lib/cache';
import { filterHiddenContent } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES, type HistoricalEventCategory } from '@/lib/historical-event-categories';

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
      const cacheResults = await Promise.all(
        HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
          const cacheKey: CacheKey = {
            date,
            category: currentCategory,
            viewType: viewType as 'today' | 'week',
            version: 'v2',
          };

          const key = generateCacheKey(cacheKey);
          const cachedData = await getCacheData(key);

          return {
            category: currentCategory,
            cachedData,
          };
        })
      );

      const allCategoriesCached = cacheResults.every(result => Array.isArray(result.cachedData));

      if (allCategoriesCached) {
        const dataByCategory = await Promise.all(
          cacheResults.map(async result => [
            result.category,
            await filterHiddenContent(result.cachedData || []),
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

      const eventsByCategory = await generateHistoricalEventsByCategory({
        date: viewType === 'week' ? 'This Week' : date,
        category: 'Sociology'
      });

      const dataByCategoryEntries = await Promise.all(
        HISTORICAL_EVENT_CATEGORIES.map(async currentCategory => {
          const events = eventsByCategory[currentCategory] || [];
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
            version: 'v2',
          };

          const key = generateCacheKey(cacheKey);

          if (cachedEvents.length > 0) {
            await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
          }

          const filteredEvents = await filterHiddenContent(cachedEvents);
          return [currentCategory, filteredEvents] as const;
        })
      );

      return NextResponse.json({
        dataByCategory: Object.fromEntries(dataByCategoryEntries),
        cached: false,
        timestamp: new Date().toISOString()
      });
    }

    // Create cache key
    const cacheKey: CacheKey = {
      date,
      category: category as HistoricalEventCategory,
      viewType: viewType as 'today' | 'week',
      version: 'v2',
    };
    
    const key = generateCacheKey(cacheKey);

    // Check cache first
    if (await hasValidCache(key)) {
      const cachedData = await getCacheData(key);
      if (cachedData) {
        // Filter out reported content before returning
        const filteredData = await filterHiddenContent(cachedData);
        
        return NextResponse.json({
          data: filteredData,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
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
    
    const events = await generateHistoricalEvents({
      date: viewType === 'week' ? 'This Week' : date,
      category: category as HistoricalEventCategory
    });

    // Convert to cached format
    const cachedEvents: CachedHistoricalEvent[] = events.map(event => ({
      title: event.title,
      date: event.date,
      description: event.description,
      category: event.category,
      source: event.source
    }));

    // Only cache successful responses with data
    if (cachedEvents.length > 0) {
      await setCacheData(key, cachedEvents, viewType as 'today' | 'week');
    }

    // Filter out reported content before returning to client
    const filteredEvents = await filterHiddenContent(cachedEvents);

    return NextResponse.json({
      data: filteredEvents,
      cached: false,
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
