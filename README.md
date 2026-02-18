# posthog-tunnel (phtun)

A reverse proxy for [PostHog](https://posthog.com) that bypasses ad blockers.

Ad blockers maintain lists of known analytics domains and block requests to them. A reverse proxy routes events through your own domain (e.g. `e.yourdomain.com`), which ad blockers haven't cataloged. This typically **increases event capture by 10–30%** depending on your user base.

See [PostHog docs on reverse proxies](https://posthog.com/docs/advanced/proxy) for more context.

## How it works

All traffic is **allowed by default**. You can optionally blocklist specific API keys or domains.

```
Client → your-domain.com/ingest/* → posthog-tunnel → eu.i.posthog.com/*
```

| Route | Target |
|-------|--------|
| `GET\|POST /ingest/*` | `https://eu.i.posthog.com/*` (strips `/ingest` prefix) |
| `GET /static/*` | `https://eu-assets.i.posthog.com/static/*` |

## Setup

```bash
bun install
cp .env.template .env       # set ADMIN_API_KEY
bun run start               # http://localhost:3010
```

Point your PostHog JS snippet at the proxy:

```js
posthog.init('phc_...', {
  api_host: 'https://e.yourdomain.com/ingest',
  ui_host: 'https://us.posthog.com',  // or eu.posthog.com
})
```

## CLI

```bash
bun link                     # install phtun globally
phtun config init            # set server URL + admin key

phtun list                   # show blocked API keys + domains
phtun block <api-key> --label "My Project"
phtun unblock <api-key>

phtun domain block <domain>              # global
phtun domain block <api-key> <domain>    # per-key
phtun domain unblock <domain>
phtun domain list [api-key]
```

## Admin API

All endpoints require `Authorization: Bearer <ADMIN_API_KEY>`.

| Method | Path | Action |
|--------|------|--------|
| GET | `/admin/api-keys` | List blocked API keys |
| POST | `/admin/api-keys` | Block API key `{ apiKey, label }` |
| DELETE | `/admin/api-keys/:apiKey` | Unblock API key |
| GET | `/admin/domains` | List global blocked domains |
| POST | `/admin/domains` | Block domain globally `{ domain }` |
| DELETE | `/admin/domains/:domain` | Unblock global domain |
| POST | `/admin/api-keys/:apiKey/blocked-domains` | Block domain for API key |
| DELETE | `/admin/api-keys/:apiKey/blocked-domains/:domain` | Unblock domain for API key |

## Deploy

```bash
docker build -t posthog-tunnel .
docker run -e ADMIN_API_KEY=secret -p 3010:3010 posthog-tunnel
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_API_KEY` | *(required)* | Bearer token for admin API |
| `PORT` | `3010` | Server port |
| `ENV` | `development` | `development` / `production` / `test` |
| `POSTHOG_HOST` | `eu.i.posthog.com` | PostHog ingest host |
| `POSTHOG_ASSETS_HOST` | `eu-assets.i.posthog.com` | PostHog assets host |
| `SSL_CERT_PATH` / `SSL_KEY_PATH` | *(optional)* | TLS for dev HTTPS |
