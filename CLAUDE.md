# afixo-web

Astro 7 site + dashboard for Afixo, deployed as the Cloudflare Worker `afixo-web` — **every
public hostname of Afixo**: `afixo.io`, `www.afixo.io` and the machine API host `api.afixo.io`
(staging: `staging.afixo.io`, `api-staging.afixo.io`). Nothing public resolves to the cluster.
Product spec: FINAL_REPORT.md in the workspace root (`../FINAL_REPORT.md` when checked out
beside the other repos).

```
browser → afixo.io     → this Worker ─┬─ /api/* ───────► [API binding] → afixo-api → origin.afixo.io     → gateway :8080
client  → api.afixo.io → this Worker ─┴─ middleware ────► [API binding] → afixo-api → origin-api.afixo.io → gateway :8081
```

`src/middleware.ts` runs first on every on-demand request: a request whose hostname is in
the `MACHINE_HOSTS` var goes straight to the `API` binding with its original URL — afixo-api's
machine mode forwards the allowed paths to the gateway. Everything else runs through Astro.
(Astro's `src/fetch.ts` advanced-routing entry is not used: it breaks `astro dev` with the
Cloudflare adapter, withastro/astro#17181.) Public pages (`/`, `/login`, `/404`) are prerendered; `/app/*` and
`/api/*` are rendered on demand. `/docs` redirects to **docs.afixo.io** (separate repo
`documents`, Worker `afixo-docs`) — do not add documentation pages here. The dashboard's scripts call same-origin `/api/v1/*`; the
Explorer alone calls `api.afixo.io` cross-origin, like any integrator (the gateway answers CORS).

Static assets are matched before the Worker on every hostname, so `api.afixo.io/` serves the
landing page — harmless; API paths (`/v1/*`, `/oauth/*`) never collide with assets.

## Hard rules

- **This Worker holds no secrets.** No credential `vars`, no `.dev.vars`, no KV/D1/Images
  (`session: false`, `imageService: 'compile'` — nothing auto-provisions on deploy).
- **`/api/*` and machine-host requests are forwarded untouched** (`src/pages/api/[...path].ts`
  and the machine-host branch of `src/middleware.ts` → `env.API.fetch(request)`); the rest of
  the middleware skips `/api/*`. Never
  parse, rewrite or decorate them: afixo-api owns cookies, CSRF, bearer pass-through and the
  tunnel hop. Never add a route, a tunnel hostname or a direct origin call here.
- **The machine-host branch in `src/middleware.ts` must stay above `if (context.isPrerendered)`.**
  `/oauth/*` and `/v1/*` match no Astro route, so Astro resolves them to the *prerendered* 404: an
  early return there answers the machine API with an HTML page and no CORS headers, and every
  cross-origin call from the dashboard fails its preflight. `src/fetch.ts` ran before Astro's router
  and never had this problem — the ordering only became load-bearing when the branch moved here.
- **The `__Host-afixo_state` cookie is cosmetic.** It only decides "render the dashboard or
  redirect to /login". Never trust it for anything; the origin is the authority.
- **Never call the origin** (`origin.afixo.io`) or the gateway from this repo.
- **`env.staging.routes` is load-bearing.** `routes` is inheritable — omitting it would make a
  staging deploy claim `afixo.io`; staging lists its own custom domains (`staging.afixo.io`,
  `api-staging.afixo.io`). `assets`, `services` and `vars` are *not* inheritable: restate them.
- **`html_handling: "drop-trailing-slash"`** matches `trailingSlash: 'never'` + `build.format: 'file'`.
  Links are slash-less (`/app/personas`, never `/app/personas/`). Change all three or none.
- **`assets.run_worker_first: ["/app", "/app/*", "/api/*", "/v1/*", "/oauth/*"]` is load-bearing.**
  Static assets answer *navigation* requests that match no file with the 404 page without running the
  Worker; without this list the dashboard, the GitHub login link and the OAuth callback all land on the
  404 page. **Every on-demand route (`prerender = false`) and every path the Worker must see on a
  browser navigation goes in that list.**
  Note: `wrangler dev --local` does *not* reproduce this faithfully — it answers `run_worker_first`
  paths from the asset layer, so the Worker looks dead locally for `/v1/*` and `/oauth/*`. Trust
  deployed behaviour over local when testing machine-host routing.
- **CSP is `script-src 'self'; style-src 'self'`.** No inline `<script>`, `<style>` or `style=""`.
  `assetsInlineLimit: 0` and `inlineStylesheets: 'never'` keep the build that way. Headers live in
  `public/_headers` (assets) and `src/middleware.ts` (on-demand) — keep them identical.

## Design system (`src/styles/global.css`)

Tailwind v4, CSS-first — no config file, no Bootstrap, no second styling system.

- **Colour only ever comes from a semantic token** (`--color-canvas/surface/ink/ink-2/ink-3/line/accent`,
  status `ok|warn|danger|info` + their `-bg`). Each is declared once with `light-dark()`; which side
  applies is decided by `color-scheme`, which `public/theme.js` sets from the user's choice
  (system / light / dark) before first paint. **Never write a raw palette class** (`text-zinc-500`,
  `bg-emerald-50`) in a template — it cannot follow the theme.
- **Every token pair meets WCAG 2.2 AA** (4.5:1 body, 3:1 large) in *both* themes. Re-check after
  touching a token: `scripts/contrast-audit.js` audits every page in both themes (see its header).
- A utility on an element beats an `@layer components` rule whatever the specificity, because
  `utilities` is the later layer. Rules that must override a utility (e.g. hiding the inactive
  theme-toggle icons, which carry `inline-block`) go in `@layer utilities`.
- Reusable primitives are `@layer components` classes (`.btn`, `.input`, `.card`, `.pill`, `.tip`,
  `.callout`, `.table`, `.skeleton`); anything one-off stays a utility class in the template.
- A `<label>` may not contain interactive content, so a field with a "?" tooltip uses
  `components/Field.astro` (`<label for>` + `<Info>` as a sibling), never `<label><Info/></label>`.
- Astro trims whitespace between a text line and an element on the next line: write `{' '}` at the
  end of the text line when a space must survive (`… written to your{' '}` + `<a>audit log</a>`).

## Commands

| Command | What |
|---|---|
| `pnpm dev` | `wrangler types && astro dev` — local front door on :4321 (see Local dev) |
| `pnpm build` | `wrangler types && astro check && astro build` — zero type errors required |
| `pnpm preview` | production build served by `wrangler dev` (workerd, CSP on) |
| `pnpm check` | types only |
| `pnpm deploy` | build + `wrangler deploy` (production) — CI does this on `workflow_dispatch` |
| `pnpm deploy:staging` | `CLOUDFLARE_ENV=staging astro build && wrangler deploy --env staging` — CI does this on every push to `master` |
| `pnpm types` | regenerate `worker-configuration.d.ts` (bindings only, see Config; commit it) |

The build writes `dist/client/` (assets, incl. `login.html` etc.) and `dist/server/` (the Worker
plus a flattened `wrangler.json`), and `.wrangler/deploy/config.json` redirects `wrangler deploy|dev`
to that built config. The Cloudflare *environment is chosen at build time* (`CLOUDFLARE_ENV`);
`wrangler deploy --env staging` must follow a staging build (wrangler refuses a mismatch).
For agents: `astro dev --background` (+ `astro dev stop|status|logs`) keeps the terminal free.

## Layout

```
astro.config.mjs       adapter cloudflare (imageService compile; ../afixo-api as auxiliary Worker in `astro dev` only)
wrangler.jsonc         Worker config; custom domains incl. api.afixo.io; env.staging restates assets/services/vars + its own routes
worker-configuration.d.ts  generated by `wrangler types --include-runtime=false` — committed
src/env.d.ts           declares `Fetcher`, the `cloudflare:workers` module and App.Locals
public/_headers        security headers + CSP for static assets
public/theme.js        theme bootstrap: sets <html data-theme|data-theme-mode> before first paint (external — CSP has no inline scripts)
src/middleware.ts      machine hosts → env.API.fetch(request); /app/* cookie gate → /login; security headers
src/pages/api/[...path].ts   ALL → env.API.fetch(request)
src/pages/{index,login,404}.astro   prerendered; /docs → redirect to docs.afixo.io (astro.config.mjs)
src/pages/app/*.astro  prerender = false: overview, personas, clients, policies, explorer, audit
src/layouts/           Base.astro (html shell), App.astro (sidebar, handle, sign-out)
src/components/        Nav, SiteHeader, ThemeToggle, Card, Callout, Field, Info, Icon, SensitivityBadge, Empty
src/styles/global.css  the design system: @theme tokens (light-dark()), @layer components primitives
src/lib/api.ts         typed /api/v1 client (CSRF header, single-flight refresh, retry once)
src/lib/session.ts     parse the state cookie (server: Astro.cookies, client: document.cookie)
src/lib/machine.ts     Explorer: token + disclose against PUBLIC_MACHINE_API_URL; localStorage clients
src/lib/ui.ts          DOM helpers for the vanilla <script> panels (TODO: Preact islands if they grow)
src/lib/dialog.ts      <dialog>-based confirm() (window.confirm cannot be styled)
src/lib/tips.ts        tooltip click/Escape behaviour (hover and focus are pure CSS)
.github/workflows/     ci.yml (build + deploy dry-run), deploy.yml (master → staging; dispatch → staging|production)
```

## Local dev

`astro dev` is the only local front door that can complete a login, because only the api Worker
holds the sealing key. It needs:

1. `../afixo-api` checked out beside this repo with its `.dev.vars`
   (`ORIGIN_URL=http://localhost:8080`, `ALLOWED_ORIGINS=http://localhost:4321`). When
   `../afixo-api/wrangler.jsonc` exists, `astro.config.mjs` registers it as an auxiliary Worker,
   so the `API` binding resolves in-process. Without it `/api/*` answers `503 api_unavailable`.
2. The local gateway from `afixo-services`: console listener on `:8080`, machine listener on `:8081`.
   The Explorer uses `http://localhost:8081` in dev unless `PUBLIC_MACHINE_API_URL` is set.

Strict CSP is off in `astro dev` (the Vite dev server injects styles); verify CSP with `pnpm preview`.

## Config

- wrangler `vars`: `MACHINE_HOSTS` (`api.afixo.io`; staging `api-staging.afixo.io`). Bindings:
  `ASSETS` (static assets), `API` (service binding → `afixo-api`, `afixo-api-staging` in staging).
- `PUBLIC_MACHINE_API_URL` — build-time public variable (`astro:env`, inlined into the client bundle;
  not a wrangler var). The deploy workflow sets it per environment (`https://api.afixo.io` /
  `https://api-staging.afixo.io`); locally it defaults to `http://localhost:8081`.
- `pnpm-workspace.yaml` approves the install scripts of `esbuild` and `workerd` (pnpm ≥ 10 blocks
  them otherwise and pnpm 11 fails the install).
- **Types:** `worker-configuration.d.ts` holds bindings only. The Workers *runtime* globals are
  deliberately not loaded: their global `Element` (HTMLRewriter) shadows lib.dom's `append`/`remove`
  and breaks the DOM code in the panels (`astro check` fails). Server code only needs `env.API.fetch`,
  declared in `src/env.d.ts`. If a runtime API is ever needed server-side, import it as a type from
  `@cloudflare/workers-types/experimental` rather than enabling the globals.

## Cross-repo

- `afixo-api` — session boundary; owns the three cookies, CSRF, the machine-mode bearer
  pass-through and the Access service token. Deploy it **before** this Worker on a fresh account
  (the service binding needs a target). Its `MACHINE_HOSTS` must equal ours per environment.
- `afixo-services` — gateway + services; the REST contract is `afixo-services/docs/api.md`
  (bare arrays for lists, personas use `label`, audit is `{decisions, next_before}`,
  verify is `{ok, length, broken_at_seq, head_hash}`). `src/lib/api.ts` normalises those
  into the dashboard's types and tolerates older envelopes; change both when the contract moves.
- GitHub secrets for deploy: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Git

- Default branch: `master`. Remote: `git@github.com:afixo/afixo-web.git`.
- **Never `git push`. Always ask before `git commit`.**
