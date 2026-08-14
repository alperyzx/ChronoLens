import { NextRequest, NextResponse } from 'next/server';
import { getReportStats, getAllReportedContent, clearAllReports, recoverReportedContent, isContentHidden } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES } from '@/lib/historical-event-categories';
import { requireContentAdmin } from '@/lib/content-admin-auth';

export async function GET(request: NextRequest) {
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

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
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

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
  const unauthorized = requireContentAdmin(request);
  if (unauthorized) return unauthorized;

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
      const stillHidden = await isContentHidden(title, category, date);
      if (!stillHidden) {
        return NextResponse.json({
          success: true,
          message: 'Reported content is already visible',
        });
      }

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
