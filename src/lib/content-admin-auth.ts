import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const CONTENT_ADMIN_SESSION_COOKIE = 'chronolens_admin_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function getAdminPassword(): string | undefined {
  return process.env.CACHE_ADMIN_PASSWORD;
}

function signSession(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPassword(inputPassword: string): boolean {
  const password = getAdminPassword();
  return Boolean(password && safeEqual(inputPassword, password));
}

export function createAdminSession(): { token: string; expiresAt: Date } | undefined {
  const password = getAdminPassword();
  if (!password) {
    return undefined;
  }

  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const payload = `${randomBytes(32).toString('base64url')}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return {
    token: `${payload}.${signSession(payload, password)}`,
    expiresAt,
  };
}

export function hasValidAdminSession(request: NextRequest): boolean {
  const password = getAdminPassword();
  const token = request.cookies.get(CONTENT_ADMIN_SESSION_COOKIE)?.value;
  if (!password || !token) {
    return false;
  }

  const [nonce, expiresAtRaw, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!nonce || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !signature) {
    return false;
  }

  const payload = `${nonce}.${expiresAtRaw}`;
  return safeEqual(signature, signSession(payload, password));
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export function requireContentAdmin(request: NextRequest): NextResponse | undefined {
  if (!hasValidAdminSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
}
