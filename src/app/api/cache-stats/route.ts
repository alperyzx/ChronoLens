import { NextResponse } from 'next/server';
import { getCacheStats, clearCache, cleanupExpiredCache } from '@/lib/cache';

export async function GET() {
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

export async function DELETE() {
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

export async function POST() {
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
