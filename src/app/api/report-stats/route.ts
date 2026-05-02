import { NextRequest, NextResponse } from 'next/server';
import { getReportStats, getAllReportedContent, clearAllReports } from '@/lib/report-cache';

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
