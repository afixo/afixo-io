/**
 * Ambient types for this Worker.
 *
 * `worker-configuration.d.ts` is generated with `wrangler types --include-runtime=false`
 * (bindings only). The full Workers *runtime* types are deliberately not loaded: they
 * declare a global `Element` (HTMLRewriter) whose `append`/`remove` signatures shadow
 * lib.dom's, which breaks the vanilla DOM code in the dashboard. This Worker only ever
 * touches `env.API.fetch`, so the two declarations below are the whole surface it needs.
 * If runtime APIs are ever required server-side, import them from
 * `@cloudflare/workers-types/experimental` (importable, not global).
 */

/** Structural stand-in for a Workers service binding (`Fetcher`), referenced by the generated `Env`. */
interface Fetcher {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module 'cloudflare:workers' {
	/** Bindings and vars of the running Worker (`Env` comes from worker-configuration.d.ts). */
	export const env: Cloudflare.Env;
}

declare namespace App {
	interface Locals {
		/** Parsed `__Host-afixo_state` cookie (set by src/middleware.ts on on-demand routes). Cosmetic — never trusted. */
		session?: import('./lib/session').SessionState | null;
	}
}
