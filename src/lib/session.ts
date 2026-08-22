/**
 * The `__Host-afixo_state` cookie (DESIGN.md §3) is a readable, *unsigned*
 * base64url JSON blob written by afixo-api so the UI can show who is signed in
 * and skip rendering the dashboard for anonymous visitors.
 *
 * It is a cosmetic gate only. The origin is the authority — never trust it.
 */

export const STATE_COOKIE = '__Host-afixo_state';
export const CSRF_COOKIE = '__Host-afixo_csrf';

export interface SessionState {
	/** subject id */
	sub: string;
	/** GitHub-derived handle */
	handle: string;
	roles: string[];
	/** refresh-token expiry, unix seconds */
	exp: number;
}

function base64urlToString(input: string): string {
	const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
	const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

/** Parse a raw cookie value. Returns null when missing, malformed or expired. */
export function parseState(raw: string | null | undefined, nowMs = Date.now()): SessionState | null {
	if (!raw) return null;
	try {
		const data: unknown = JSON.parse(base64urlToString(raw));
		if (typeof data !== 'object' || data === null) return null;
		const { sub, handle, roles, exp } = data as Record<string, unknown>;
		if (typeof sub !== 'string' || typeof handle !== 'string' || typeof exp !== 'number') return null;
		if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return null;
		return {
			sub,
			handle,
			roles: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [],
			exp,
		};
	} catch {
		return null;
	}
}

/** Server side (middleware / on-demand pages): `stateFromCookies(Astro.cookies)`. */
export function stateFromCookies(cookies: {
	get(name: string): { value: string } | undefined;
}): SessionState | null {
	return parseState(cookies.get(STATE_COOKIE)?.value);
}

/** Browser side: read one cookie from `document.cookie`. */
export function readCookie(name: string): string | undefined {
	if (typeof document === 'undefined') return undefined;
	for (const part of document.cookie.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
	}
	return undefined;
}

/** Browser side: the current (cosmetic) session, or null. */
export function stateFromDocument(): SessionState | null {
	return parseState(readCookie(STATE_COOKIE));
}
