import type { APIRoute } from 'astro';
import { TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { startHumanSession, verifyTurnstileToken } from '../../lib/human-verification';

export const prerender = false;

/** Exchanges a Turnstile token for a short-lived human session cookie used by /api/chat. */
export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
	if (!TURNSTILE_SECRET_KEY) {
		return new Response('TURNSTILE_SECRET_KEY is not set. Add it to web/.env (see .env.example).', { status: 500 });
	}

	let token: unknown;
	try {
		({ token } = await request.json());
	} catch {
		return new Response('Invalid JSON body.', { status: 400 });
	}
	if (typeof token !== 'string' || !token || token.length > 2048) {
		return new Response('Expected a JSON body of { token }.', { status: 400 });
	}

	if (!(await verifyTurnstileToken(TURNSTILE_SECRET_KEY, token, clientAddress))) {
		return new Response('Human verification failed.', { status: 403 });
	}

	const expiresAt = startHumanSession(cookies, TURNSTILE_SECRET_KEY);
	return Response.json({ expiresAt });
};
