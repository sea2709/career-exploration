import { createClient, type SanityClient } from '@sanity/client';
import { sanityInsightsIntegration, type SanityInsightsIntegration } from '@sanity/context/ai-sdk';
import { SANITY_CONTEXT_ENDPOINT_NAME, SANITY_INSIGHTS_TOKEN, SANITY_ORGANIZATION_ID } from 'astro:env/server';

let insightsClient: SanityClient | null = null;

function getInsightsClient(): SanityClient | null {
	if (!SANITY_INSIGHTS_TOKEN || !SANITY_ORGANIZATION_ID) return null;

	insightsClient ??= createClient({
		apiVersion: 'v2025-11-27',
		token: SANITY_INSIGHTS_TOKEN,
		context: { organizationId: SANITY_ORGANIZATION_ID },
		useCdn: false,
		useProjectHostname: false,
	});
	return insightsClient;
}

/** Saves the transcript to the org's Context store. Returns null when Insights isn't configured. */
export function createInsightsIntegration(threadId: string | undefined): SanityInsightsIntegration | null {
	const client = getInsightsClient();
	if (!client || !threadId) return null;

	return sanityInsightsIntegration({
		client,
		threadId,
		metadata: { mcpEndpoints: SANITY_CONTEXT_ENDPOINT_NAME },
	});
}
