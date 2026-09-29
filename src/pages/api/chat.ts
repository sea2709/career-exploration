import type { APIRoute } from 'astro';
import type { MCPClient } from '@ai-sdk/mcp';
import { createAgentUIStreamResponse } from 'ai';
import { createCareerAgent } from '../../lib/onet/agent';
import {
	createSanityContextMcpClient,
	fetchInitialContext,
	loadSanityContextTools,
} from '../../lib/sanity-context';
import { createInsightsIntegration } from '../../lib/sanity-insights';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	// useChat sends its chat id with every request; it doubles as the Insights thread id.
	const { messages, id: chatId } = await request.json();

	let mcpClient: MCPClient | null = null;

	try {
		const [mcpClientResult, initialContext] = await Promise.all([
			createSanityContextMcpClient(),
			fetchInitialContext(),
		]);
		mcpClient = mcpClientResult;

		const sanityContextTools = await loadSanityContextTools(mcpClient, Boolean(initialContext));
		const agent = createCareerAgent({
			sanityContextTools,
			initialContext,
			insights: createInsightsIntegration(chatId),
		});

		return createAgentUIStreamResponse({
			agent,
			uiMessages: messages,
			abortSignal: request.signal,
			onEnd: async () => {
				await mcpClient?.close();
			},
			onError: (error) => {
				console.error('[chat]', error);
				return error instanceof Error ? error.message : 'Something went wrong.';
			},
		});
	} catch (error) {
		await mcpClient?.close();
		const message = error instanceof Error ? error.message : 'Something went wrong.';
		return new Response(message, { status: 500 });
	}
};
