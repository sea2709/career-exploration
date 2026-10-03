# Careers Exploration

A career exploration app built on the O\*NET 31.0 dataset stored in Sanity. Visitors can chat about careers, practice mock interviews scored against O\*NET skill levels, and take a RIASEC interest quiz that matches them to occupations. Each experience is backed by a Gemini agent.

This folder is a workspace that holds three independent apps plus a small amount of shared Sanity infrastructure.

```
Browser ──▶ web (Astro, :4321) ──/api/*──▶ agent (Node, :8787) ──▶ Gemini
                                                │
                                                ├─ GROQ ─────────▶ Sanity dataset (O*NET)
                                                ├─ Context MCP ──▶ Sanity Context
                                                └─ Insights ─────▶ org Context store
                                                                        ▲
studio (Sanity Studio, :3333) ── schemas, O*NET import, coaching guides  │
root functions/ ── weekly classify-conversations job ────────────────────┘
```

## Repositories

`web/`, `agent/`, and `studio/` are separate git repos with their own remotes, included in the root repo as git submodules (see `.gitmodules`). The root repo records which commit of each app it points to and otherwise only tracks the shared files listed below.

| Folder    | What it is                                                         | Remote                                                                        | Default branch |
| --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------- |
| `web/`    | Astro 7 + React 19 frontend: Career Explorer, Interview Coach, Quiz | [career-exploration-web](https://github.com/sea2709/career-exploration-web)    | `master`       |
| `agent/`  | Node HTTP service running the Gemini `ToolLoopAgent`s              | [career-exploration-agent](https://github.com/sea2709/career-exploration-agent) | `main`         |
| `studio/` | Sanity Studio: schemas, O\*NET importer, coaching Knowledge Base   | [career-exploration-studio](https://github.com/sea2709/career-exploration-studio) | `main`         |

The root repo contains:

- `functions/classify-conversations/`: a scheduled Sanity Function that classifies Conversation Insights transcripts written by the agent.
- `sanity.blueprint.ts`: the Blueprint that deploys that function (Mondays at 06:00 Central).
- `.cursor/rules/`: editor agent rules for the whole workspace.
- `AGENTS.md`: cross-repo guidance for coding agents.

## Getting started

Requires Node `>=22.18.0` and [pnpm](https://pnpm.io/installation) 11. Every repo uses pnpm, so its global store shares packages across the apps and their worktrees.

1. Clone this repo with its submodules, then check out each app's default branch (submodules start on a detached `HEAD`):

   ```sh
   git clone --recurse-submodules https://github.com/sea2709/career-exploration.git careers-exploration
   cd careers-exploration
   git submodule foreach 'git checkout $(git config -f $toplevel/.gitmodules submodule.$name.branch)'
   ```

   In an existing clone, run `git submodule update --init` instead.

2. In each app, install dependencies and create `.env` from its example:

   ```sh
   cd agent && pnpm install && cp .env.example .env
   ```

   `AGENT_API_TOKEN` must be the same in `agent/.env` and `web/.env`. Generate it with `openssl rand -base64 32`.

3. Start the agent and the web app in separate terminals:

   ```sh
   cd agent && pnpm dev   # http://localhost:8787
   cd web && pnpm dev     # http://localhost:4321
   ```

4. Optionally, run the Studio to edit content:

   ```sh
   cd studio && pnpm dev  # http://localhost:3333
   ```

See each app's `README.md` for its environment variables, architecture, and commands.

## Shared Sanity function

The root `package.json` manages the `classify-conversations` function.

1. Install dependencies and create `.env`:

   ```sh
   pnpm install
   cp .env.example .env
   ```

   Fill in `GOOGLE_GENERATIVE_AI_API_KEY` and `SANITY_INSIGHTS_TOKEN`. `SANITY_CONTEXT_ENDPOINT_NAME` must match the value the agent uses.

2. Use these commands:

   | Command               | Action                                                 |
   | --------------------- | ------------------------------------------------------ |
   | `pnpm test:functions` | Run the function locally against real data             |
   | `pnpm plan`           | Preview the Blueprint changes that a deploy would make |
   | `pnpm run deploy`     | Deploy the Blueprint (`pnpm deploy` is a built-in pnpm command, so keep `run`) |

`.sanity/` links this folder to its deployed Blueprint stack. It's machine-local and ignored by git.

## Sanity project

| Setting      | Value        |
| ------------ | ------------ |
| Project ID   | `rhq335ze`   |
| Dataset      | `production` |
| Organization | `opj96zyhx`  |
