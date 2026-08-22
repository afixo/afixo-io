// @ts-check
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// `astro dev` runs the api Worker in the same local runtime (so the `API` service
// binding resolves and a GitHub login can complete) when ../afixo-api is checked
// out beside this repo. Without it, /api/* answers 503 locally.
// Dev only: `astro build` must never depend on — or compile — the sibling repo.
const apiWorkerConfig = fileURLToPath(new URL('../afixo-api/wrangler.jsonc', import.meta.url));
const isDev = process.argv.includes('dev');
const auxiliaryWorkers = isDev && existsSync(apiWorkerConfig) ? [{ configPath: apiWorkerConfig }] : undefined;

// https://astro.build/config
export default defineConfig({
	site: 'https://afixo.io',

	// Static by default; /app/* and /api/* opt out with `export const prerender = false`.
	output: 'static',
	trailingSlash: 'never',

	// The documentation lives in its own repo/Worker (documents → docs.afixo.io).
	redirects: {
		'/docs': 'https://docs.afixo.io/',
	},
	build: {
		// `login.astro` → `login.html`; matches `assets.html_handling: "drop-trailing-slash"` in wrangler.jsonc.
		format: 'file',
		// Keep CSS external so the CSP can stay `style-src 'self'` (no inline <style>).
		inlineStylesheets: 'never',
	},

	// No Astro sessions → the adapter provisions no KV namespace. This Worker holds no state.
	session: false,

	adapter: cloudflare({
		// 'compile' transforms images at build time only; the default ('cloudflare-binding')
		// would auto-provision an Images binding on deploy.
		imageService: 'compile',
		...(auxiliaryWorkers ? { auxiliaryWorkers } : {}),
	}),

	env: {
		schema: {
			// Base URL of the machine listener used by /app/explorer (build-time, public).
			// Unset → https://api.afixo.io in builds, http://localhost:8081 in `astro dev`.
			PUBLIC_MACHINE_API_URL: envField.string({ context: 'client', access: 'public', optional: true }),
		},
	},

	vite: {
		plugins: [tailwindcss()],
		build: {
			// Never inline small scripts/assets: inline <script> would need CSP hashes.
			assetsInlineLimit: 0,
		},
	},
});
