import { NextRequest, NextResponse } from 'next/server';
import {
  CONTENT_ADMIN_SESSION_COOKIE,
  createAdminSession,
  hasValidAdminSession,
  verifyPassword,
} from '../../../lib/content-admin-auth';

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

    if (!verifyPassword(password)) {
      return NextResponse.json({ authenticated: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const session = createAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Admin authentication is not configured' }, { status: 500 });
    }

    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(CONTENT_ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: hasValidAdminSession(request) });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(CONTENT_ADMIN_SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
