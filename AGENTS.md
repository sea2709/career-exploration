# careers-exploration workspace

Career exploration app over the O\*NET 31.0 dataset in Sanity. This workspace holds three independent apps and the shared Sanity Function that serves them. See `README.md` for setup.

Each app has its own `AGENTS.md` with layout, conventions, and commands. Read it before changing code in that app:

- `web/AGENTS.md`: Astro 7 + React 19 frontend that proxies to the agent.
- `agent/AGENTS.md`: Node service running the Gemini agents over O\*NET data.
- `studio/`: Sanity Studio (schemas in `schemaTypes/`, O\*NET importer and coaching Knowledge Base scripts in `scripts/`). It has no `AGENTS.md` yet.

## Git layout

- **Four repos, not one.** `web/`, `agent/`, and `studio/` are separate git repos with their own remotes. The root repo ignores those folders and only tracks `functions/`, `sanity.blueprint.ts`, root config, `.cursor/`, and these docs.
- **Run git commands in the repo that owns the file.** A change to `web/src/...` is committed from `web/`, not from the root. A feature that spans apps needs one commit (and one PR) per repo.
- **Default branches differ:** `web` uses `master`; `agent` and `studio` use `main`; the root uses `main`.
- **New branches go in worktrees.** Follow `.cursor/rules/git-worktrees.mdc`: create them under `<app>/.worktrees/`, never with `git checkout -b` in the main checkout.
- **Never commit `.env` files.** Every repo ignores them; only `.env.example` is tracked.

## Cross-repo contracts

These are the places where a change in one app breaks another. Check the other side whenever you touch one.

- **Agent auth token.** `AGENT_API_TOKEN` must match in `agent/.env` and `web/.env`.
- **Agent tools and UI labels.** Adding or renaming a tool in `agent/src` also requires updating the agent's system prompt and the label map in `web/src/components/` (`TOOL_LABELS` in `CareerChat.tsx`, `PREP_LABELS` in `InterviewCoach.tsx`, `STATUS_LABELS` in `InterestQuiz.tsx`).
- **Structured tool outputs are mirrored in the UI.** The `scoreAnswer` and `finishInterview` schemas in `agent/src/interview-agent.ts` match the types in `web/src/components/InterviewCoach.tsx`. The quiz tool shapes in `agent/src/quiz-agent.ts` and `agent/src/onet/interests.ts` match the types at the top of `web/src/components/InterestQuiz.tsx`.
- **Schemas and generated types.** Document types are defined in `studio/schemaTypes`. After changing them, run `npm run typegen` in `studio/`, which writes `web/sanity.types.ts`. Never edit that file by hand. The agent's GROQ queries in `agent/src/onet/` depend on the same schemas.
- **Insights endpoint name.** `SANITY_CONTEXT_ENDPOINT_NAME` must be the same in `agent/.env` and the root `.env`, or the weekly classifier won't find the agent's transcripts.
- **O\*NET re-imports.** The agent caches interest data in memory, so restart it after running the Studio importer.

## Root: Sanity Function

- `functions/classify-conversations/index.ts` is a scheduled handler that classifies Conversation Insights transcripts with Gemini (up to 500 per run, concurrency 5, within the 600-second timeout).
- `sanity.blueprint.ts` declares the function, its schedule, and its env vars. It reads secrets from the root `.env` at deploy time through `requireEnv`. When you add an env var, add it to the blueprint's `env` block, `.env.example`, and the handler's check.
- Commands: `npm run test:functions` to run it locally, `npm run plan` to preview, `npm run deploy` to deploy. Deploying needs `pnpm` installed, because of `--fn-installer pnpm`.
- `npx tsc` type-checks the root (`sanity.blueprint.ts` and `functions/**`). There is no test suite or linter.
- `.sanity/` links the folder to the deployed Blueprint stack. It's machine-local; don't commit or edit it.
- Code style at the root and in `studio/`: 2-space indent, single quotes, no semicolons, no bracket spacing, 100-column width (see `prettier` in `package.json`). `web/` and `agent/` use tabs and semicolons instead.

## Sanity project

- Project `rhq335ze`, dataset `production`, organization `opj96zyhx`.
- The O\*NET dataset is publicly readable through the CDN. Tokens are only needed for writes, the Context MCP endpoint, and Insights.

## Documentation

- Sanity Functions: https://www.sanity.io/docs/functions
- Sanity Blueprints: https://www.sanity.io/docs/blueprints
- Sanity Context: https://www.sanity.io/docs/context
- AI SDK: https://ai-sdk.dev/docs
