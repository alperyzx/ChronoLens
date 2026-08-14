import { NextRequest, NextResponse } from 'next/server';
import { reportContent } from '@/lib/report-cache';
import { HISTORICAL_EVENT_CATEGORIES } from '@/lib/historical-event-categories';
import { createReportVisitorCookie, getVerifiedReportVisitorId, REPORT_VISITOR_COOKIE } from '@/lib/report-visitor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, category, date } = body;

    // Validate required parameters
    if (!title || !category || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: title, category, date' },
        { status: 400 }
      );
    }

    // Validate category against the shared historical event categories list.
    if (!HISTORICAL_EVENT_CATEGORIES.includes(category as (typeof HISTORICAL_EVENT_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Report the content
    const result = await reportContent(title, category, date);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to report content' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      reportCount: result.reportCount,
      isHidden: result.isHidden,
      message: result.isHidden 
        ? 'Content has been hidden due to multiple reports'
        : 'Content reported successfully'
    });

    if (!getVerifiedReportVisitorId(request)) {
      const visitorCookie = createReportVisitorCookie();
      if (visitorCookie) {
        response.cookies.set(REPORT_VISITOR_COOKIE, visitorCookie.value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: visitorCookie.maxAge,
        });
      }
    }

    return response;

  } catch (error) {
    console.error('Error in report content API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
