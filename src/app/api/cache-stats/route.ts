import { NextRequest, NextResponse } from 'next/server';
import {
  cleanupExpiredServerCache,
  clearServerCache,
  getCacheStats,
} from '@/lib/cache';
import { requireContentAdmin } from '../../../lib/content-admin-auth';

export async function GET(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const stats = await getCacheStats();
    const response = NextResponse.json({
      ...stats,
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
    return NextResponse.json({
      message: 'Expired server cache entries cleaned up successfully',
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
