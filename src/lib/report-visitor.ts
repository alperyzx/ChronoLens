import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export const REPORT_VISITOR_COOKIE = 'chronolens_report_visitor';
const VISITOR_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function getSigningSecret(): string | undefined {
  return process.env.REPORT_VISITOR_SIGNING_SECRET || process.env.CACHE_ADMIN_PASSWORD;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getVerifiedReportVisitorId(request: NextRequest): string | undefined {
  const secret = getSigningSecret();
  const cookie = request.cookies.get(REPORT_VISITOR_COOKIE)?.value;
  if (!secret || !cookie) {
    return undefined;
  }

  const [visitorId, expiresAtRaw, signature] = cookie.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!visitorId || !signature || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return undefined;
  }

  const payload = `${visitorId}.${expiresAtRaw}`;
  return signaturesMatch(signature, sign(payload, secret)) ? visitorId : undefined;
}

export function createReportVisitorCookie(): { value: string; maxAge: number } | undefined {
  const secret = getSigningSecret();
  if (!secret) {
    return undefined;
  }

  const visitorId = randomBytes(24).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + VISITOR_COOKIE_MAX_AGE_SECONDS;
  const payload = `${visitorId}.${expiresAt}`;

  return {
    value: `${payload}.${sign(payload, secret)}`,
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  };
}