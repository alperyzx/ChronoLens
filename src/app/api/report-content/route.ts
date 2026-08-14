import { NextRequest, NextResponse } from 'next/server';
import { reportContent } from '@/lib/report-cache';
import { createReportVisitorCookie, getVerifiedReportVisitorId, REPORT_VISITOR_COOKIE } from '@/lib/report-visitor';
import { validateReportContent } from '@/lib/report-content-validation';
import {
  recordUniqueVisitorReport,
  releaseVisitorReportReservation,
} from '@/lib/report-visitor-cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = validateReportContent(body);
    if ('error' in validationResult) {
      return NextResponse.json({ error: validationResult.error }, { status: 400 });
    }

    const { title, category, date, contentId } = validationResult.content;
    const existingVisitorId = getVerifiedReportVisitorId(request);
    const newVisitor = existingVisitorId ? undefined : createReportVisitorCookie();
    const visitorId = existingVisitorId || newVisitor?.visitorId;

    if (!visitorId || (!existingVisitorId && !newVisitor?.expiresAt)) {
      return NextResponse.json({ error: 'Report visitor tracking is not configured' }, { status: 503 });
    }

    const visitorExpiresAt = newVisitor?.expiresAt || Date.now() + (90 * 24 * 60 * 60 * 1000);
    if (!recordUniqueVisitorReport(visitorId, contentId, visitorExpiresAt)) {
      return NextResponse.json(
        { error: 'You have already reported this content' },
        { status: 409 }
      );
    }

    const result = await reportContent(title, category, date);

    if (!result.success) {
      releaseVisitorReportReservation(visitorId, contentId);
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

    if (newVisitor) {
      response.cookies.set(REPORT_VISITOR_COOKIE, newVisitor.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: newVisitor.maxAge,
      });
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
