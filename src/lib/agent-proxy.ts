import type { AstroCookies } from 'astro';
import { AGENT_API_TOKEN, AGENT_URL, TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { hasHumanSession } from './human-verification';

const PASSTHROUGH_HEADERS = ['content-type', 'cache-control', 'x-vercel-ai-ui-message-stream', 'x-accel-buffering'];

/**
 * Forwards a chat request to an agent service route, attaching the API token server-side.
 * Requires a human session; the client treats 403 as "re-verify".
 */
export async function proxyToAgent(agentPath: string, request: Request, cookies: AstroCookies): Promise<Response> {
	if (!AGENT_API_TOKEN) {
		return new Response('AGENT_API_TOKEN is not set. Add it to web/.env (see .env.example).', { status: 500 });
	}
	if (!TURNSTILE_SECRET_KEY) {
		return new Response('TURNSTILE_SECRET_KEY is not set. Add it to web/.env (see .env.example).', { status: 500 });
	}
	if (!hasHumanSession(cookies, TURNSTILE_SECRET_KEY)) {
		return new Response('Please confirm you are human to continue.', { status: 403 });
	}

	let upstream: Response;
	try {
		upstream = await fetch(new URL(agentPath, AGENT_URL), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${AGENT_API_TOKEN}`,
			},
			body: await request.text(),
			signal: request.signal,
		});
	} catch (error) {
		console.error(`[agent-proxy ${agentPath}] agent unreachable`, error);
		return new Response('The career agent is unavailable.', { status: 502 });
	}

	const headers = new Headers();
	for (const name of PASSTHROUGH_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(upstream.body, { status: upstream.status, headers });
}
