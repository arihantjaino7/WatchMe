# WatchMe AI

**AI Work Reflection Engine.** Start a work session, work normally, end the session — and get an honest, evidence-backed reflection on how you actually worked: focus, distractions, patterns, and whether you did what you set out to do.

Not a surveillance tool. Not another time tracker. A mirror you point at yourself, on purpose, one session at a time.

> **Status: pre-MVP scaffold.** The repository structure, tooling, and contracts-first architecture are in place. Features land milestone by milestone — see [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

1. **Declare intent** — click the Chrome extension, say what you plan to do ("finish the auth PR").
2. **Work** — the extension records tab-level activity (URL, title, focus time) _only while a session is running_. A local privacy filter redacts blocklisted domains before anything leaves your machine; incognito is never captured.
3. **Reflect** — on session end, a pipeline compiles a deterministic timeline, then AI stages interpret what you were doing and write a reflection report: narrative, focus analysis, distractions, **intent vs. reality**, and concrete suggestions.
4. **Remember** _(V2)_ — sessions become a queryable memory: "when do I actually do deep work?"

## Stack

| Layer           | Choice                               | Why                                                                           |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces + Turborepo          | One TypeScript codebase; shared contracts in one place                        |
| Dashboard + API | Next.js (App Router) on Vercel       | Dashboard and `/api/v1` in one deployable, zero ops                           |
| Database + Auth | Supabase (Postgres, RLS, pgvector)   | Auth + multi-tenant safety + future vector search, one free tier              |
| Background jobs | Inngest                              | Durable multi-step AI pipeline with retries, no infra to run                  |
| Extension       | Chrome MV3, Vite + CRXJS             | Minimal permissions: `tabs`, `storage`, `idle`, `alarms` — no content scripts |
| LLMs            | Gemini Flash / Groq behind `lib/llm` | Free-tier first; swapping models is a config change, never a refactor         |

## Repository layout

```
apps/
  web/          Next.js dashboard + /api/v1 (extension API) + Inngest handlers
  extension/    Chrome MV3 extension (service worker + popup)
packages/
  shared/       THE contract: Zod schemas for events, sessions, reports — imported by both sides
supabase/
  migrations/   Database schema as code (Supabase CLI)
docs/
  ARCHITECTURE.md   Full product & system architecture
  ROADMAP.md        Milestones → epics → tasks, in build order
```

**The one rule that matters:** anything that crosses a boundary (extension → API, pipeline → dashboard) is defined once in `packages/shared` as a Zod schema. Shipped extensions can't be force-updated, so the event contract is versioned (`/api/v1`) and changes are additive-only.

## Getting started

Prerequisites: Node ≥ 22 (see `.node-version`), pnpm ≥ 11 (`npm i -g pnpm`).

```bash
pnpm install

pnpm dev          # all apps in dev mode (turbo)
pnpm build        # production builds
pnpm typecheck    # tsc across all workspaces
pnpm lint         # eslint
pnpm format       # prettier --write
```

- **Dashboard:** `pnpm --filter @watchme/web dev` → http://localhost:3000
- **Extension:** `pnpm --filter @watchme/extension build`, then load `apps/extension/dist` via `chrome://extensions` → "Load unpacked" (Developer mode on).
- **Environment:** copy `.env.example` to `apps/web/.env.local`. Nothing is required until M0-E2 (Supabase).

## Privacy principles (product-defining, non-negotiable)

- Capture happens **only during an explicitly started session** — never passive, never background.
- We store _where_ you were (URL path + title), never page content. Query strings are stripped on both client and server.
- Blocklisted domains are redacted **locally, before upload** — the server only ever sees "private time: 14 min".
- Incognito is never captured. Full JSON export and one-click total deletion are core features, not compliance chores.

## Development workflow

`main` is protected; work happens on branches merged by PR (yes, even solo — CI + preview deploys + self-review). CI runs format check, lint, typecheck, and build on every PR. Database changes only via migrations in `supabase/migrations/`.
