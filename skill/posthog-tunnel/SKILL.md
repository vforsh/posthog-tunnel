---
name: posthog-tunnel
description: Manage a PostHog reverse-proxy tunnel via the `phtun` CLI — block/unblock API keys, manage domain blocklists (global and per-key), configure CLI settings, and check tunnel status. Use when the agent needs to administer PostHog tracking proxies, control which projects or domains are allowed through the tunnel, or troubleshoot blocked requests. Triggers on mentions of phtun, PostHog tunnel, PostHog proxy, blocklist management, or PostHog admin.
---

# PostHog Tunnel (`phtun`)

CLI for administering a PostHog reverse-proxy that forwards tracking requests through your own domain, bypassing ad-blockers. Allow-all by default with optional blocklist.

Production instance: `phtun.robowhale.com`

## Setup

```bash
# Configure CLI (interactive)
phtun config init

# Or set values directly
phtun config set url https://phtun.robowhale.com
phtun config set key <admin-api-key>
```

Config stored at `~/.config/phtun/config.toml`. Env vars `TUNNEL_URL` and `ADMIN_API_KEY` take precedence.

## Commands

### Inspect

```bash
phtun list                          # Show all blocked API keys + global domains
phtun config get                    # Show current CLI config
```

### API Key Blocklist

```bash
phtun block <api-key> --label "My Project"   # Block a project
phtun unblock <api-key>                       # Unblock
```

### Domain Blocklist

```bash
# Global (applies to all traffic)
phtun domain block <domain>
phtun domain unblock <domain>
phtun domain list

# Per-API-key (key must be blocked first)
phtun domain block <api-key> <domain>
phtun domain unblock <api-key> <domain>
phtun domain list <api-key>
```

Domain matching includes subdomains — blocking `example.com` also blocks `sub.example.com`.

## Admin REST API

All endpoints require `Authorization: Bearer <ADMIN_API_KEY>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/api-keys` | List blocked API keys |
| POST | `/admin/api-keys` | Block key (`{apiKey, label}`) |
| DELETE | `/admin/api-keys/:apiKey` | Unblock key |
| GET | `/admin/domains` | List global blocked domains |
| POST | `/admin/domains` | Block domain globally (`{domain}`) |
| DELETE | `/admin/domains/:domain` | Unblock domain globally |
| POST | `/admin/api-keys/:apiKey/blocked-domains` | Block domain per-key (`{domain}`) |
| DELETE | `/admin/api-keys/:apiKey/blocked-domains/:domain` | Unblock domain per-key |

## Client Integration

Point PostHog JS SDK at the tunnel:

```js
posthog.init('<API_KEY>', {
  api_host: 'https://phtun.robowhale.com/ingest',
  ui_host: 'https://eu.posthog.com',
})
```

The tunnel proxies `/ingest/*` → PostHog API, `/static/*` → PostHog assets.
