import { NextRequest, NextResponse } from 'next/server';
import { getReportStats, getAllReportedContent, clearAllReports, recoverReportedContent } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES } from '@/lib/historical-event-categories';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'all') {
      // Get all reported content (for admin)
      const reportedContent = await getAllReportedContent();
      return NextResponse.json({
        reportedContent,
        timestamp: new Date().toISOString()
      });
    } else {
      // Get stats
      const stats = await getReportStats();
      return NextResponse.json({
        stats,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error in report stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Clear all reports (admin function)
    await clearAllReports();
    
    return NextResponse.json({
      success: true,
      message: 'All reports cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing reports:', error);
    return NextResponse.json(
      { error: 'Failed to clear reports' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, category, date } = body;

    if (!title || !category || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: title, category, date' },
        { status: 400 }
      );
    }

    if (!HISTORICAL_EVENT_CATEGORIES.includes(category as (typeof HISTORICAL_EVENT_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    const recovered = await recoverReportedContent(title, category, date);
    if (!recovered) {
      return NextResponse.json(
        { error: 'Reported content not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Reported content recovered successfully',
    });
  } catch (error) {
    console.error('Error recovering reported content:', error);
    return NextResponse.json(
      { error: 'Failed to recover reported content' },
      { status: 500 }
    );
  }
}
