# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start                    # Dev server with hot reload
bun run start:prod           # Run production build
bun run build                # Build to dist/
bun run test                 # Run tests (vitest)
bun run test:watch           # Tests in watch mode
bun run typecheck-dev        # TypeScript watch (no emit)
bun run cli <command>        # Run CLI (list, block, unblock, domain)
bun run deploy               # git push dokku main
bun run deploy-env           # Push env vars to Dokku via SSH
```

## Architecture

PostHog reverse proxy built with **Bun** and **Elysia**. Forwards PostHog tracking requests through your own domain, bypassing ad-blockers. **Allow-all by default** with optional blocklist.

**Request flow:** Client → `/ingest/*` → extract API key (query param / path / JSON body) → check blocklist → forward to `https://eu.i.posthog.com/*` → return response.

### Key modules

- **`src/index.ts`** — Elysia server with proxy routes (`/ingest/*`, `/static/*`), health check, and admin API (8 endpoints under `/admin/`). Bearer token auth via `isAuthorized()`.
- **`src/blocklist.ts`** — `BlocklistData` persisted to `blocklist.json`. Tokens and global blocked domains. Missing/empty file = allow everything.
- **`src/proxy.ts`** — `extractToken()` (query → path → body priority) and `forwardRequest()` to PostHog.
- **`src/domain-check.ts`** — `isDomainBlocked()` with subdomain matching, `getRequestHost()` from Referer/Origin.
- **`src/env.ts`** — Type-safe env vars using `@t3-oss/env-core` + Zod. `ADMIN_API_KEY` is required; everything else has defaults.
- **`src/cli.ts`** — Commander-based CLI (`phtun`) that calls the admin API. Loads `.env` then TOML config for defaults.
- **`src/config.ts`** — TOML config at `~/.config/phtun/config.toml` for CLI settings (url, key).

### Deployment

Deployed to Dokku on `robowhale.ru` via `git push dokku main`. Docker build uses `oven/bun:1.2.2`. Caddy handles TLS and reverse proxy. Domain: `phtun.robowhale.ru`.

## Code style

- Prettier: tabs (width 4), no semicolons, single quotes, 120 char width
- Imports sorted by `prettier-plugin-organize-imports`
