/**
 * Two jobs, both for on-demand routes only (prerendered pages get their headers
 * from public/_headers at the asset layer):
 *
 *  1. /app/*  — cosmetic gate: no valid `__Host-afixo_state` cookie → 302 /login.
 *               The origin is the authority; this only avoids rendering an empty dashboard.
 *  2. security headers on every on-demand response. `frame-ancestors` is only
 *     honoured as a *header*, which is why this cannot live in a <meta> tag.
 *
 * /api/* is forwarded untouched (src/pages/api/[...path].ts) and is skipped here:
 * afixo-api owns those responses, including their Set-Cookie headers.
 */
import { defineMiddleware } from 'astro:middleware';
import { MACHINE_API_URL } from './lib/machine';
import { stateFromCookies } from './lib/session';

const APP_PREFIX = '/app';
const API_PREFIX = '/api/';

/** Keep in sync with public/_headers. */
export function contentSecurityPolicy(): string {
	return [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self'",
		`connect-src 'self' ${MACHINE_API_URL}`,
		"img-src 'self' data: https://avatars.githubusercontent.com",
		"font-src 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join('; ');
}

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
	'X-Frame-Options': 'DENY',
};
// The Vite dev server injects styles through <style> elements; a strict CSP would
// blank the dashboard in `astro dev`. Production builds (and `astro build && wrangler dev`) get it.
if (import.meta.env.PROD) SECURITY_HEADERS['Content-Security-Policy'] = contentSecurityPolicy();

function withSecurityHeaders(response: Response): Response {
	try {
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
		return response;
	} catch {
		// Immutable headers (e.g. a fetched asset response): copy, then decorate.
		const copy = new Response(response.body, response);
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) copy.headers.set(name, value);
		return copy;
	}
}

export const onRequest = defineMiddleware(async (context, next) => {
	if (context.isPrerendered) return next();

	const { pathname } = context.url;
	if (pathname.startsWith(API_PREFIX)) return next();

	context.locals.session = stateFromCookies(context.cookies);

	if ((pathname === APP_PREFIX || pathname.startsWith(`${APP_PREFIX}/`)) && !context.locals.session) {
		return withSecurityHeaders(context.redirect('/login', 302));
	}

	return withSecurityHeaders(await next());
});
