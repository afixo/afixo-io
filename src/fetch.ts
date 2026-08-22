/**
 * Advanced-routing entrypoint (Astro 7): runs before the Astro pipeline.
 *
 * One job: requests on a *machine host* (`api.afixo.io`, staging
 * `api-staging.afixo.io` — the `MACHINE_HOSTS` var) are the public machine API.
 * They never touch Astro's router; they go to the `afixo-api` Worker over the
 * `API` service binding with the original URL, and afixo-api (machine mode)
 * forwards the allowed paths to the gateway through the tunnel.
 *
 * Everything else — the site, the dashboard and `/api/*` (handled by
 * src/pages/api/[...path].ts) — runs through the normal Astro pipeline.
 *
 * This Worker holds no secrets and must stay that way: no auth, no cookies,
 * no header edits happen here.
 */
import { FetchState, astro } from 'astro/fetch';
import type { Fetchable } from 'astro';
import { env } from 'cloudflare:workers';

function machineHosts(): Set<string> {
	const raw = (env as Partial<typeof env>).MACHINE_HOSTS ?? '';
	return new Set(
		raw
			.split(',')
			.map((h) => h.trim().toLowerCase())
			.filter(Boolean),
	);
}

export default {
	async fetch(request: Request): Promise<Response> {
		const host = new URL(request.url).hostname.toLowerCase();
		if (machineHosts().has(host)) {
			const api = (env as Partial<typeof env>).API;
			if (!api) {
				return Response.json(
					{ error: 'api_unavailable', message: 'The API service binding is not configured in this environment.' },
					{ status: 503 },
				);
			}
			// The incoming Request carries `redirect: "manual"`; passing it through unchanged
			// is what lets afixo-api's own redirects and status codes reach the client.
			return api.fetch(request);
		}
		return astro(new FetchState(request));
	},
} satisfies Fetchable;
