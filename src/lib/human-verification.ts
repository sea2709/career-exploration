import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const COOKIE_NAME = 'human_session';
const SESSION_TTL_SECONDS = 2 * 60 * 60;

/** Asks Cloudflare whether a Turnstile token is valid. Tokens are single-use and expire after 5 minutes. */
export async function verifyTurnstileToken(secret: string, token: string, remoteIp?: string): Promise<boolean> {
	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const res = await fetch(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
		const result = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
		if (!result.success) console.warn('[human-verification] rejected', result['error-codes']);
		return result.success === true;
	} catch (error) {
		console.error('[human-verification] siteverify failed', error);
		return false;
	}
}

function sign(secret: string, expiresAt: string): Buffer {
	return createHmac('sha256', secret).update(`human-session:${expiresAt}`).digest();
}

/** Issues an HttpOnly cookie proving this browser passed Turnstile. Returns the expiry (ms since epoch). */
export function startHumanSession(cookies: AstroCookies, secret: string): number {
	const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
	const value = `${expiresAt}.${sign(secret, String(expiresAt)).toString('base64url')}`;
	cookies.set(COOKIE_NAME, value, {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: 'strict',
		path: '/api',
		maxAge: SESSION_TTL_SECONDS,
	});
	return expiresAt;
}

export function hasHumanSession(cookies: AstroCookies, secret: string): boolean {
	const [expiresAt, signature] = cookies.get(COOKIE_NAME)?.value.split('.') ?? [];
	if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;

	const expected = sign(secret, expiresAt);
	const actual = Buffer.from(signature, 'base64url');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
