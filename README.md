# afixo-web

The public front door of the Afixo platform — a selective-disclosure identity API. This repo is
the marketing site, the API docs and the subject dashboard (personas, API clients, disclosure
policies, an API explorer and the audit log), built with Astro 7 and deployed as the Cloudflare
Worker `afixo-web` on `afixo.io`.

```
browser → afixo.io     → afixo-web ─┬─ /api/* ──────► [API binding] → afixo-api → origin.afixo.io     → gateway :8080
client  → api.afixo.io → afixo-web ─┴─ middleware ──► [API binding] → afixo-api → origin-api.afixo.io → gateway :8081
```

`afixo-web` renders pages and forwards two kinds of traffic untouched to the `afixo-api` Worker,
which owns the session and the tunnel hop: `/api/*` on the site host, and *everything* on the
machine host `api.afixo.io`. Every public hostname of Afixo is this Worker; nothing public
resolves to the cluster. This Worker holds no secrets.

## Quick start

```sh
pnpm install
pnpm dev          # http://localhost:4321 (needs ../afixo-api + the local gateway for sign-in)
pnpm build        # wrangler types + astro check + astro build
pnpm preview      # production build under wrangler dev
```

Deploys run from GitHub Actions: pushes to `master` deploy **staging** (`staging.afixo.io`,
`api-staging.afixo.io`); the *Deploy* workflow is dispatched for **production** (`afixo.io`,
`www.afixo.io`, `api.afixo.io`). Deploy `afixo-api` first on a fresh account.

See `CLAUDE.md` for the operational rules, layout and local-dev requirements.
