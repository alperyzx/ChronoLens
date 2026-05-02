import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/cache-admin-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    const result = await verifyPassword(password);

    if (result.valid) {
      return NextResponse.json({ valid: true, message: result.message });
    } else {
      return NextResponse.json(
        { valid: false, message: result.message, attemptsLeft: result.attemptsLeft },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}

// GET to check if already authenticated (for session validation)
export async function GET() {
  return NextResponse.json({ message: 'Use POST to verify password' });
}
