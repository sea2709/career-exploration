import {createGoogle} from '@ai-sdk/google'
import {createClient} from '@sanity/client'
import {classifyConversations} from '@sanity/context/insights'
import {scheduledEventHandler} from '@sanity/functions'

export const handler = scheduledEventHandler(async () => {
  const {
    GOOGLE_GENERATIVE_AI_API_KEY,
    GEMINI_MODEL,
    SANITY_ORGANIZATION_ID,
    SANITY_CONTEXT_ENDPOINT_NAME,
    SANITY_INSIGHTS_TOKEN,
  } = process.env

  if (
    !GOOGLE_GENERATIVE_AI_API_KEY ||
    !SANITY_ORGANIZATION_ID ||
    !SANITY_CONTEXT_ENDPOINT_NAME ||
    !SANITY_INSIGHTS_TOKEN
  ) {
    console.error(
      '[classify-conversations] Missing GOOGLE_GENERATIVE_AI_API_KEY, SANITY_ORGANIZATION_ID, SANITY_CONTEXT_ENDPOINT_NAME, or SANITY_INSIGHTS_TOKEN',
    )
    return
  }

  const client = createClient({
    apiVersion: 'v2025-11-27',
    token: SANITY_INSIGHTS_TOKEN,
    context: {organizationId: SANITY_ORGANIZATION_ID},
    useCdn: false,
    useProjectHostname: false,
  })

  const google = createGoogle({apiKey: GOOGLE_GENERATIVE_AI_API_KEY})

  const result = await classifyConversations({
    client,
    mcpEndpoint: SANITY_CONTEXT_ENDPOINT_NAME,
    model: google(GEMINI_MODEL || 'gemini-3.5-flash-lite'),
    // Runs weekly, so take a week's backlog in one run (the default limit is 100) within the 600s timeout.
    limit: 500,
    concurrency: 5,
  })

  console.log(
    `Classified ${result.successCount}/${result.totalFound} conversations${result.errorCount > 0 ? ` (${result.errorCount} failed)` : ''}`,
  )
})
