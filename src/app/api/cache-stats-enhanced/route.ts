import { NextResponse } from 'next/server';
import { getCacheStats, clearCache, getCacheExpirationInfo } from '@/lib/cache';

export async function GET() {
  try {
    const stats = getCacheStats();
    const todayExpiration = getCacheExpirationInfo('today');
    const weekExpiration = getCacheExpirationInfo('week');
    
    return NextResponse.json({
      ...stats,
      expirationInfo: {
        today: {
          expiresAt: todayExpiration.expiresAt.toISOString(),
          description: todayExpiration.description,
          ttlSeconds: todayExpiration.ttlSeconds
        },
        week: {
          expiresAt: weekExpiration.expiresAt.toISOString(),
          description: weekExpiration.description,
          ttlSeconds: weekExpiration.ttlSeconds
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearCache();
    return NextResponse.json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
