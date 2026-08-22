/**
 * /api/* → afixo-api, untouched, over the `API` service binding (DESIGN.md §2).
 *
 * No parsing, no header edits, no cookie handling here: afixo-api is the session
 * boundary (sealed cookie ↔ bearer, CSRF, Cloudflare Access headers). This Worker
 * holds no secrets and must stay that way.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => {
	const api = (env as Partial<typeof env>).API;
	if (!api) {
		// Local `astro dev` without ../afixo-api checked out beside this repo (see CLAUDE.md → Local dev).
		return Response.json(
			{ error: 'api_unavailable', message: 'The API service binding is not configured in this environment.' },
			{ status: 503 },
		);
	}
	return api.fetch(request);
};
