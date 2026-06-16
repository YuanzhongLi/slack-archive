import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createDb } from '../db/client';
import { users } from '../db/schema';

export type { User } from '../db/schema';
import type { User } from '../db/schema';

type AuthVariables = {
  user: User;
};

type JwkKey = {
  kty: string;
  use?: string;
  n?: string;
  e?: string;
  kid?: string;
  alg?: string;
};

type JwksResponse = {
  keys: JwkKey[];
};

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  sub?: string;
};

// JWKS in-memory cache (module-level; resets on cold start)
// TTL: 5 minutes — covers key rotation while minimising fetch overhead
// NOTE: fetchJwks / verifyJwt / importRsaPublicKey rely on crypto.subtle (Web Crypto API)
// which is unavailable in the Node.js test environment. These functions are exercised
// end-to-end by CF Access in production. The middleware control flow (DEV bypass,
// user lookup, JWT missing/invalid branches) is covered in auth.test.ts.
const JWKS_TTL_MS = 5 * 60 * 1000;
type JwksCache = { keys: JwkKey[]; fetchedAt: number };
const jwksCache = new Map<string, JwksCache>();

async function fetchJwks(teamDomain: string, forceRefresh = false): Promise<JwkKey[]> {
  const cached = jwksCache.get(teamDomain);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  if (fresh && !forceRefresh) return cached.keys;

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch JWKS from ${url}: ${res.status}`);

  const body = await res.json<unknown>();
  if (!isJwksResponse(body)) throw new Error('Invalid JWKS response format');

  jwksCache.set(teamDomain, { keys: body.keys, fetchedAt: Date.now() });
  return body.keys;
}

function isJwksResponse(value: unknown): value is JwksResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keys' in value &&
    Array.isArray((value as Record<string, unknown>).keys)
  );
}

function isJwtPayload(value: unknown): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}

function base64UrlDecode(input: string): ArrayBuffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = 4 - (padded.length % 4);
  const padded2 = pad < 4 ? padded + '='.repeat(pad) : padded;
  const binary = atob(padded2);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

async function importRsaPublicKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function verifyJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<{ email: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }

  if (!isJwtPayload(payload)) return null;
  if (payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.iss !== `https://${teamDomain}`) return null;

  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(aud)) return null;
  if (typeof payload.email !== 'string' || payload.email.length === 0) return null;

  let header: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
  } catch {
    return null;
  }

  const kid =
    typeof header === 'object' && header !== null && 'kid' in header
      ? String((header as Record<string, unknown>).kid)
      : undefined;

  let keys: JwkKey[];
  try {
    keys = await fetchJwks(teamDomain);
  } catch {
    return null;
  }

  let candidates = keys.filter((k) => k.kty === 'RSA' && (kid === undefined || k.kid === kid));

  // kid not found in cache — force refresh once in case of key rotation
  if (candidates.length === 0 && kid !== undefined) {
    try {
      keys = await fetchJwks(teamDomain, true);
      candidates = keys.filter((k) => k.kty === 'RSA' && k.kid === kid);
    } catch {
      return null;
    }
  }

  if (candidates.length === 0) return null;

  const signedInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecode(signatureB64);

  for (const jwk of candidates) {
    if (!jwk.n || !jwk.e) continue;
    try {
      const cryptoKey = await importRsaPublicKey(jwk);
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes,
        signedInput,
      );
      if (valid) return { email: payload.email };
    } catch {
      // try next key
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<string, number> = { viewer: 0, admin: 1, root: 2 };

export function hasRole(user: User, minRole: 'viewer' | 'admin' | 'root'): boolean {
  return (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[minRole] ?? 99);
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> = async (c, next) => {
  const db = createDb(c.env.DB);

  // Local dev bypass: DEV_USER_EMAIL set and CF_ACCESS_TEAM_DOMAIN not set
  const teamDomainSet =
    typeof c.env.CF_ACCESS_TEAM_DOMAIN === 'string' && c.env.CF_ACCESS_TEAM_DOMAIN.length > 0;
  const devEmail = teamDomainSet ? '' : (c.env.DEV_USER_EMAIL ?? '');

  if (devEmail.length > 0) {
    const user = await db.select().from(users).where(eq(users.email, devEmail)).get();
    if (!user) {
      return c.json({ status: 'error', message: `Dev user not found: ${devEmail}` }, 403);
    }
    c.set('user', user);
    return next();
  }

  // Production: verify CF Access JWT
  const cookieHeader = c.req.header('cookie') ?? '';
  const cookieToken = cookieHeader.match(/CF_Authorization=([^;]+)/)?.[1];
  const token = c.req.header('cf-access-jwt-assertion') ?? cookieToken;

  if (!token) {
    return c.json({ status: 'error', message: 'Missing CF Access JWT' }, 401);
  }

  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = c.env.CF_ACCESS_AUD;

  if (!teamDomain || !aud) {
    return c.json({ status: 'error', message: 'CF Access configuration missing' }, 500);
  }

  let verified: { email: string } | null = null;
  try {
    verified = await verifyJwt(token, teamDomain, aud);
  } catch {
    return c.json({ status: 'error', message: 'JWT verification error' }, 401);
  }

  if (!verified) {
    return c.json({ status: 'error', message: 'Invalid or expired JWT' }, 401);
  }

  const user = await db.select().from(users).where(eq(users.email, verified.email)).get();
  if (!user) {
    return c.json({ status: 'error', message: 'User not registered' }, 403);
  }

  c.set('user', user);
  return next();
};
