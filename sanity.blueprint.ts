import {defineBlueprint, defineScheduledFunction} from '@sanity/blueprints'
import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set in .env (see .env.example)`)
  return value
}

export default defineBlueprint({
  resources: [
    defineScheduledFunction({
      name: 'classify-conversations',
      timeout: 600,
      env: {
        GOOGLE_GENERATIVE_AI_API_KEY: requireEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        SANITY_ORGANIZATION_ID: requireEnv('SANITY_ORGANIZATION_ID'),
        SANITY_CONTEXT_ENDPOINT_NAME: requireEnv('SANITY_CONTEXT_ENDPOINT_NAME'),
        SANITY_INSIGHTS_TOKEN: requireEnv('SANITY_INSIGHTS_TOKEN'),
      },
      // Mondays at 06:00 Central
      event: {
        expression: '0 6 * * 1',
      },
      timezone: 'America/Chicago',
    }),
  ],
})
