import { NextRequest, NextResponse } from 'next/server';
import { getCacheStats, clearCache, cleanupExpiredCache } from '@/lib/cache';
import { requireContentAdmin } from '@/lib/content-admin-auth';

export async function GET(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const stats = await getCacheStats();
    return NextResponse.json({
      ...stats,
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

export async function DELETE(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await clearCache();
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

export async function POST(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await cleanupExpiredCache();
    return NextResponse.json({
      message: 'Expired cache cleaned up successfully',
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
