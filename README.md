# Career Explorer (web)

Astro frontend for the careers-exploration project. The homepage (`/`) is a static introduction to the three tools and the O\*NET data behind them. Each tool is backed by a Gemini-powered agent that uses O\*NET 31.0 data stored in Sanity:

- `/explore`: **Career Explorer**, a chat where visitors ask about careers.
- `/interview`: **Mock Interview Coach**, which interviews the visitor for a chosen occupation and scores each answer against O\*NET skill levels. `?job=<title>` prefills the target job.
- `/quiz`: **Interest Quiz**, where visitors rate work activities and get a RIASEC interest profile with matching occupations.

The browser never talks to the agent directly. Requests go through this app's server routes, which enforce a Cloudflare Turnstile human check and attach the agent's bearer token server-side.

```
Browser (CareerChat / InterviewCoach / InterestQuiz)
  ├─ POST /api/verify-human  { token }  → Cloudflare siteverify → sets human_session cookie
  ├─ POST /api/chat          → AGENT_URL/chat
  ├─ POST /api/interview     → AGENT_URL/interview
  └─ POST /api/quiz          → AGENT_URL/quiz
        (all require a valid human_session cookie, add Authorization: Bearer AGENT_API_TOKEN,
         and stream the agent's AI SDK UI message stream back)
```

## Stack

- [Astro 7](https://docs.astro.build) with on-demand rendering for the API routes
- React 19 islands (`client:only="react"`)
- [AI SDK](https://ai-sdk.dev) (`ai`, `@ai-sdk/react`) for the chat stream and tool-call parts
- Tailwind CSS 4 via `@tailwindcss/vite`
- `react-markdown` for rendering assistant replies
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) for bot protection
- `@sanity/astro` integration, with generated schema types in `sanity.types.ts`
- Adapters: `@astrojs/node` (standalone) locally, `@astrojs/vercel` when `VERCEL` is set

## Getting started

Requires Node `>=22.12.0`.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create `.env` from the example and fill it in:

   ```sh
   cp .env.example .env
   ```

3. Start the agent service in `../agent` (it listens on `http://localhost:8787` by default):

   ```sh
   cd ../agent && npm run dev
   ```

4. Start the web dev server (defaults to `http://localhost:4321`):

   ```sh
   npm run dev
   ```

## Environment variables

Env vars are declared with `envField` in `astro.config.mjs` and read through `astro:env/server` and `astro:env/client`.

| Variable                    | Context         | Required | Default                 |
| --------------------------- | --------------- | -------- | ----------------------- |
| `AGENT_URL`                 | server          | no       | `http://localhost:8787` |
| `AGENT_API_TOKEN`           | server (secret) | yes      | none                    |
| `TURNSTILE_SECRET_KEY`      | server (secret) | yes      | none                    |
| `PUBLIC_TURNSTILE_SITE_KEY` | client          | yes      | none                    |
| `PUBLIC_SANITY_PROJECT_ID`  | client          | no       | `rhq335ze`              |
| `PUBLIC_SANITY_DATASET`     | client          | no       | `production`            |

Notes:

- `AGENT_API_TOKEN` must match `AGENT_API_TOKEN` in `agent/.env`.
- `TURNSTILE_SECRET_KEY` also signs the `human_session` cookie, so rotating it invalidates every active session.
- For local development you can use Cloudflare's [always-pass test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (listed in `.env.example`). Never deploy them, because they accept every request.
- The agent only allows CORS from its `ALLOWED_ORIGINS` (default `http://localhost:4321`). That doesn't matter for the server-side proxy, but keep it in mind if you change ports.

## Project structure

```
src/
├── components/
│   ├── CareerChat.tsx       # Explorer UI: suggestions, tool-call chips, markdown replies
│   ├── InterviewCoach.tsx   # Interview UI: setup form, progress, feedback and report cards
│   ├── InterestQuiz.tsx     # Quiz UI: setup form, activity rating cards, profile card, match list
│   ├── HumanCheck.tsx       # Loads Turnstile, exchanges the token at /api/verify-human
│   ├── chat/
│   │   ├── useVerifiedChat.ts  # useChat + human-session state, shared by all pages
│   │   └── MarkdownText.tsx    # Markdown renderer for assistant replies
│   └── Button.astro         # Starter-template leftover (unused)
├── layouts/
│   ├── AppLayout.astro      # Page shell with navigation between the tools
│   └── main.astro           # Layout for markdown pages
├── lib/
│   ├── agent-proxy.ts       # proxyToAgent: human-session check + authenticated forward to the agent
│   └── human-verification.ts  # Turnstile siteverify + HMAC-signed session cookie
├── pages/
│   ├── index.astro          # Static introduction page (homepage)
│   ├── explore.astro        # Mounts <CareerChat client:only="react" />
│   ├── interview.astro      # Mounts <InterviewCoach client:only="react" />
│   ├── quiz.astro           # Mounts <InterestQuiz client:only="react" />
│   ├── markdown-page.md     # Starter-template leftover
│   └── api/
│       ├── chat.ts          # Proxy to the agent's /chat
│       ├── interview.ts     # Proxy to the agent's /interview
│       ├── quiz.ts          # Proxy to the agent's /quiz
│       └── verify-human.ts  # Turnstile token → human_session cookie
└── styles/global.css        # Tailwind entry point
sanity.types.ts              # Generated by Sanity TypeGen from ../studio (do not edit)
```

## How the human check works

1. `HumanCheck` renders an invisible-unless-needed Turnstile widget (`appearance: 'interaction-only'`, `action: 'chat'`).
2. On success it posts the token to `/api/verify-human`, which validates it with Cloudflare's siteverify endpoint.
3. The server sets an `HttpOnly`, `SameSite=Strict` cookie named `human_session`, scoped to `/api` and valid for 2 hours. The value is `<expiresAt>.<HMAC-SHA256 signature>`.
4. `/api/chat`, `/api/interview`, and `/api/quiz` reject requests without a valid session with `403`.
5. `useVerifiedChat` keeps input disabled until verified, re-runs the check 60 seconds before the session expires, and re-runs it on any `403`.

## How the interview coach works

1. The setup form collects the target job, number of questions (3, 5, or 7), and style (mixed, behavioral, or skills). It's sent as the first user message, with the setup attached as message metadata so the UI shows it in the header instead of as a chat bubble.
2. The agent finds the occupation, loads its O\*NET interview brief, and asks one question per turn.
3. After each answer it calls `scoreAnswer`. `InterviewCoach` renders that tool part as a feedback card: a 1–5 rating, the demonstrated level compared with the job's required level on O\*NET's 0–7 scale, the closest O\*NET example, and tips.
4. After the last question (or **End early**) it calls `finishInterview`, rendered as a report card.
5. Progress in the header is derived from the number of `scoreAnswer` results in the conversation.

## How the interest quiz works

1. The setup form asks how much preparation the visitor is open to (a maximum Job Zone, or any). It's sent as the first user message with the setup as metadata.
2. The agent calls `getQuizActivities`, then `presentActivities`. `presentActivities` is a client-side tool: `InterestQuiz` renders it as a rating card using the activities from the matching `getQuizActivities` output, and **Submit ratings** calls `addToolOutput` with `{ ratings }`.
3. `useVerifiedChat` is given `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`, so adding the output sends the next request automatically. The agent runs a second, focused round the same way.
4. The agent then calls `buildInterestProfile` (rendered as a profile card with the Holland code and a 1–7 bar per RIASEC type) and `matchOccupations` (rendered as a match list). Each match links to O\*NET and to `/interview?job=<title>`.
5. After the results, a text input opens for follow-up questions, for example to show jobs that need less training.

## Commands

| Command             | Action                                          |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the dev server at `localhost:4321`        |
| `npm run build`     | Build for production to `./dist/`               |
| `npm run preview`   | Preview the production build locally            |
| `npx astro check`   | Type-check `.astro`, `.ts`, and `.tsx` files    |

## Regenerating Sanity types

`sanity.types.ts` is written by the studio's TypeGen config (`studio/sanity.cli.ts`). After changing schemas, run this from `../studio`:

```sh
npm run typegen
```

## Deployment

The adapter is chosen at build time: when the `VERCEL` env var is present (as it is on Vercel builds), `@astrojs/vercel` is used; otherwise the app builds as a standalone Node server with `@astrojs/node`. Set `AGENT_URL`, `AGENT_API_TOKEN`, `TURNSTILE_SECRET_KEY`, and `PUBLIC_TURNSTILE_SITE_KEY` in the hosting environment, and register the production domain on the Turnstile widget.
