// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';

import node from '@astrojs/node';
import react from '@astrojs/react';
import sanity from '@sanity/astro';

const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
	process.env.NODE_ENV ?? 'development',
	process.cwd(),
	'',
);

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss()],
	},

	adapter: node({
		mode: 'standalone',
	}),

	integrations: [
		react(),
		sanity({
			projectId: PUBLIC_SANITY_PROJECT_ID || 'rhq335ze',
			dataset: PUBLIC_SANITY_DATASET || 'production',
			useCdn: true,
		}),
	],

	env: {
		schema: {
			GOOGLE_GENERATIVE_AI_API_KEY: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			GEMINI_MODEL: envField.string({
				context: 'server',
				access: 'public',
				default: 'gemini-3.5-flash',
			}),
			PUBLIC_SANITY_PROJECT_ID: envField.string({
				context: 'client',
				access: 'public',
				default: 'rhq335ze',
			}),
			PUBLIC_SANITY_DATASET: envField.string({
				context: 'client',
				access: 'public',
				default: 'production',
			}),
			SANITY_API_TOKEN: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			SANITY_CONTEXT_MCP_URL: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			SANITY_ORGANIZATION_ID: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			SANITY_CONTEXT_ENDPOINT_NAME: envField.string({
				context: 'server',
				access: 'public',
				default: 'career-explorer',
			}),
			SANITY_INSIGHTS_TOKEN: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
		},
	},
});
