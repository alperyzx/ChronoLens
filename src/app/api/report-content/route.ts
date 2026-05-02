import { NextRequest, NextResponse } from 'next/server';
import { reportContent } from '@/lib/report-cache';

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

    // Validate category
    const validCategories = ['Sociology', 'Technology', 'Philosophy', 'Science', 'Politics', 'Art'];
    if (!validCategories.includes(category)) {
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

    return NextResponse.json({
      success: true,
      reportCount: result.reportCount,
      isHidden: result.isHidden,
      message: result.isHidden 
        ? 'Content has been hidden due to multiple reports'
        : 'Content reported successfully'
    });

  } catch (error) {
    console.error('Error in report content API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
