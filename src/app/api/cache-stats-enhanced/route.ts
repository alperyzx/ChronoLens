import { NextRequest, NextResponse } from 'next/server';
import {
  cleanupExpiredServerCache,
  clearServerCache,
  getCacheExpirationInfo,
  getCacheStats,
} from '@/lib/cache';
import { requireContentAdmin } from '../../../lib/content-admin-auth';

export async function GET(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const stats = await getCacheStats();
    const todayExpiration = getCacheExpirationInfo('today');
    const weekExpiration = getCacheExpirationInfo('week');
    const response = NextResponse.json({
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
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    clearServerCache();
    return NextResponse.json({
      message: 'Server cache cleared successfully',
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

export async function POST(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    cleanupExpiredServerCache();
    const stats = await getCacheStats();
    return NextResponse.json({
      message: 'Expired server cache entries cleaned up successfully',
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error cleaning up expired cache:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
