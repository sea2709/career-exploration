import type { APIRoute } from 'astro';
import { proxyToAgent } from '../../lib/agent-proxy';

export const prerender = false;

export const POST: APIRoute = ({ request, cookies }) => proxyToAgent('/quiz', request, cookies);
