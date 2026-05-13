# Cache Implementation for ChronoLens

## Overview
Implemented a **persistent file-based cache system** to minimize Gemini API requests and improve performance for all users. This solution **fixes the Google Cloud server restart issue** where the in-memory cache was reset.

## Problem Solved
- **Google Cloud Server Restarts**: Low traffic causes servers to spin down/restart, resetting in-memory cache
- **Cache Persistence**: File-based cache survives server restarts
- **Performance**: Maintains fast response times even after server restarts

## Architecture

### Before (In-memory caching)
- Used node-cache for in-memory storage
- Cache reset on every server restart
- Lost all cached data when Google Cloud spun down servers
- Required fresh API calls after restarts

### After (File-based caching)
- **Persistent file-based cache** using filesystem
- **Survives server restarts** and deployments
- Automatic cleanup of expired cache files
- Graceful degradation if cache operations fail

## Implementation Details

### 1. Cache Service (`src/lib/cache.ts` & `src/lib/cache-file.ts`)
- **Persistent Storage**: Files stored in system temp directory or custom `CACHE_DIR`
- **Adaptive TTL Strategy**: 
  - **Today view**: Cache expires at midnight (daily refresh)
  - **Week view**: Cache expires at end of week/Sunday (weekly refresh)
- **Key Format**: `chronolens_events_[viewType]_[category]_[date]`
- **File Format**: JSON files with data, expiration timestamp, and metadata
- **Statistics**: Tracks cache size, expired files, and storage usage
- **Expiration Info**: Provides detailed cache expiration times for monitoring
- **Auto-cleanup**: Expired files are automatically removed

### 2. Cache Strategies Available

#### Instance Memory Cache
- **Location**: `src/lib/cache.ts`
- **Persistence**: Per-process only
- **Storage**: In-memory map
- **Benefits**: Fastest lookup path, avoids repeated remote reads within the same server process

#### Firestore-Backed Cache
- **Location**: `src/lib/cache-mongo.ts`
- **Persistence**: Shared remote cache
- **Storage**: Firestore-compatible Mongo endpoint
- **Benefits**: Survives restarts and is shared across instances

#### Legacy File Cache Fallback
- **Location**: `src/lib/cache-file.ts`
- **Persistence**: Survives server restarts on the same machine
- **Storage**: Filesystem-based JSON files
- **Benefits**: Safe fallback if Firestore is unavailable

### 3. API Routes (Updated for Async)
- **`/api/historical-events`**: Main endpoint with async cache operations
- **`/api/cache-stats`**: Basic admin endpoint + cleanup function (POST)
- **`/api/cache-stats-enhanced`**: Enhanced admin endpoint with cleanup (POST)

### 4. Client Updates
- No changes required on client side
- API interface remains the same
- Cache operations are transparent to frontend

### 5. Admin Interface (`/content-admin`)
- **Enhanced Statistics**: File count, storage size, expired files
- **Cleanup Function**: Remove only expired cache files
- **Clear All**: Complete cache reset
- **Real-time Monitoring**: Updated cache information display

### Cache Behavior

### Cache Hit
1. User requests historical events
2. Server checks instance memory first
3. If memory is empty, the server checks Firestore
4. If Firestore misses, the request falls through to Gemini
5. Response includes `cached: true` when served from cache

### Cache Miss (Fresh Data)
1. User requests historical events
2. Server finds no valid cache entry in memory or Firestore
3. Makes fresh Gemini AI API call
4. Stores the response in memory and Firestore
5. Returns fresh data with `cached: false` flag

## Configuration

### Environment Variables
```bash
# Firestore-compatible cache backend
MONGO_CREDENTIALS=mongodb://.../dbchronolens?retryWrites=false
```

### Cache Directory
- **Default**: System temp directory (`os.tmpdir()`)
- **Custom**: Set `CACHE_DIR` environment variable if you want the legacy file fallback to survive restarts

## Benefits

### Persistence & Reliability
- **Server Restart Resilience**: Cache survives Google Cloud server restarts
- **Deployment Stability**: Cache persists through application deployments
- **Data Consistency**: Shared cache across all application instances

### Performance
- **Faster Response Times**: Cached responses from disk are still very fast
- **Reduced Latency**: No AI API calls for cached data
- **Better User Experience**: Consistent performance after restarts

### Cost Optimization
- **Minimized API Calls**: 
  - **Today view**: Maximum 6 API calls per day (one per category)
  - **Week view**: Maximum 6 API calls per week (one per category)
- **Persistent Savings**: API call reduction maintained across restarts
- **Efficient Resource Usage**: Disk-based storage with automatic cleanup

### Scalability
- **Multi-instance Support**: Shared file cache across server instances
- **Storage Efficient**: Automatic cleanup of expired files
- **Configurable**: Flexible storage location and management

## Monitoring & Management

### Enhanced Cache Statistics
- **Valid Keys**: Number of active cache entries
- **Expired Files**: Number of expired cache files awaiting cleanup
- **Storage Size**: Total cache storage usage in MB
- **Hit Rate**: Cache performance metrics

### Admin Dashboard Features
- **Real-time Statistics**: Updated cache information with file metrics
- **Selective Cleanup**: Remove only expired files while keeping valid cache
- **Complete Reset**: Clear all cache files for fresh start
- **Storage Monitoring**: Track cache size and file count
- **Expiration Tracking**: Monitor cache expiration schedules

### Maintenance Operations
- **Automatic Cleanup**: Expired files removed during normal operations
- **Manual Cleanup**: Admin interface provides cleanup button
- **Cache Reset**: Complete cache clearing for troubleshooting
- **Storage Management**: Monitor and manage cache storage usage

## Troubleshooting

### Cache Issues
- **File Permissions**: Ensure write access to cache directory
- **Storage Space**: Monitor available disk space for cache files
- **Directory Access**: Verify `CACHE_DIR` is accessible if custom path used

### Performance
- **Disk I/O**: File cache has minimal disk I/O overhead
- **Storage Location**: Use fast storage for cache directory if possible
- **Cleanup Frequency**: Regular cleanup prevents storage bloat

This implementation solves the **Google Cloud server restart cache reset problem** while maintaining excellent performance and API cost optimization.
- TTL tracking for today vs week views

## Configuration

### TTL Calculation
```typescript
// Today view - Cache expires at midnight
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
const ttlMs = tomorrow.getTime() - now.getTime();

// Week view - Cache expires at end of week (Sunday)
const endOfWeek = new Date(now);
const currentDay = now.getDay();
const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;
endOfWeek.setDate(now.getDate() + daysUntilSunday);
endOfWeek.setHours(0, 0, 0, 0);
const ttlMs = endOfWeek.getTime() - now.getTime();
```

### Cache Key Generation
```typescript
// Format: events_[today|week]_[category]_[YYYY-MM-DD]
const key = `events_${viewType}_${category}_${date}`;
```

## Usage

### For Developers
1. **Development**: Content admin available at `/content-admin`
2. **Monitoring**: Check cache performance via API or admin panel
3. **Debugging**: Console logs show cache hit/miss status

### For Users
- **Transparent**: No user action required
- **Visual Feedback**: "Cached" badge shows when data is from cache
- **Performance**: Faster loading after first daily request

## Future Enhancements

### Possible Improvements
1. **Persistent Storage**: Redis or database-backed cache
2. **Cache Warming**: Pre-populate cache for popular categories
3. **Smart Invalidation**: Refresh specific categories on demand
4. **Distributed Cache**: Multi-server cache coordination
5. **Cache Analytics**: Detailed usage patterns and optimization

### Monitoring Enhancements
1. **Alerting**: Low hit rate notifications
2. **Metrics Export**: Prometheus/Grafana integration
3. **Cache Health**: Memory usage and performance tracking
4. **Historical Data**: Cache performance over time
