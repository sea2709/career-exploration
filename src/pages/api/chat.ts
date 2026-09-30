import type { APIRoute } from 'astro';
import { AGENT_API_TOKEN, AGENT_URL } from 'astro:env/server';

export const prerender = false;

const PASSTHROUGH_HEADERS = ['content-type', 'cache-control', 'x-vercel-ai-ui-message-stream', 'x-accel-buffering'];

/** Forwards chat requests to the agent service, attaching the API token server-side. */
export const POST: APIRoute = async ({ request }) => {
	if (!AGENT_API_TOKEN) {
		return new Response('AGENT_API_TOKEN is not set. Add it to web/.env (see .env.example).', { status: 500 });
	}

	let upstream: Response;
	try {
		upstream = await fetch(new URL('/chat', AGENT_URL), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${AGENT_API_TOKEN}`,
			},
			body: await request.text(),
			signal: request.signal,
		});
	} catch (error) {
		console.error('[api/chat] agent unreachable', error);
		return new Response('The career agent is unavailable.', { status: 502 });
	}

	const headers = new Headers();
	for (const name of PASSTHROUGH_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(upstream.body, { status: upstream.status, headers });
};
