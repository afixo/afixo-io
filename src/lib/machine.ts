/**
 * Explorer helper: act as a *requester* against the machine listener
 * (`api.afixo.io`, DESIGN.md §2 "Machine", §5 "Machine listener").
 *
 * This is the only code in the dashboard that talks to anything other than
 * same-origin `/api/v1`. The machine listener allows `https://afixo.io` via
 * CORS precisely so the Explorer can do what an integrator's app does.
 *
 * `PUBLIC_MACHINE_API_URL` is a build-time public variable (astro:env).
 * Defaults: production → https://api.afixo.io, `astro dev` → http://localhost:8081.
 */
import { PUBLIC_MACHINE_API_URL } from 'astro:env/client';
import { PURPOSES, isPurpose, type Purpose } from './api';

export const MACHINE_API_URL: string = (
	PUBLIC_MACHINE_API_URL || (import.meta.env.DEV ? 'http://localhost:8081' : 'https://api.afixo.io')
).replace(/\/+$/, '');

/* ------------------------------------------------------------------ */
/* Client secrets cached in the browser                                */
/* ------------------------------------------------------------------ */

/** localStorage key; the server stores only a hash, so the browser keeps the plaintext. */
export const CLIENTS_STORAGE_KEY = 'afixo.clients';

export interface StoredClient {
	/** requester id */
	id: string;
	name: string;
	client_id: string;
	client_secret: string;
	/** ISO timestamp */
	saved_at: string;
}

function isStoredClient(v: unknown): v is StoredClient {
	if (!v || typeof v !== 'object') return false;
	const c = v as Record<string, unknown>;
	return typeof c.id === 'string' && typeof c.client_id === 'string' && typeof c.client_secret === 'string';
}

export function loadStoredClients(): StoredClient[] {
	try {
		const raw = localStorage.getItem(CLIENTS_STORAGE_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter(isStoredClient) : [];
	} catch {
		return [];
	}
}

/** Upsert by requester id; newest first. */
export function saveStoredClient(client: StoredClient): StoredClient[] {
	const list = loadStoredClients().filter((c) => c.id !== client.id && c.client_id !== client.client_id);
	list.unshift(client);
	localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(list));
	return list;
}

export function forgetStoredClient(id: string): StoredClient[] {
	const list = loadStoredClients().filter((c) => c.id !== id);
	localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(list));
	return list;
}

/* ------------------------------------------------------------------ */
/* OAuth2 client-credentials + disclose                                */
/* ------------------------------------------------------------------ */

export class MachineError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'MachineError';
	}
}

export interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

/** `POST /oauth/token` (form-encoded client credentials). */
export async function getClientToken(client_id: string, client_secret: string): Promise<TokenResponse> {
	const res = await fetch(`${MACHINE_API_URL}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: new URLSearchParams({ grant_type: 'client_credentials', client_id, client_secret }),
	});
	const data = (await res.json().catch(() => null)) as
		| (Partial<TokenResponse> & { error?: string; error_description?: string; message?: string })
		| null;
	if (!res.ok || !data?.access_token) {
		throw new MachineError(
			res.status,
			data?.error ?? 'token_error',
			data?.message ?? data?.error_description ?? `Token request failed (${res.status})`,
		);
	}
	return { access_token: data.access_token, token_type: data.token_type ?? 'Bearer', expires_in: data.expires_in ?? 3600 };
}

export interface DiscloseAllow {
	decision: 'allow';
	persona: string;
	fields: Record<string, unknown>;
	withheld: string[];
	decision_id: string;
}

export interface DiscloseDeny {
	decision: 'deny';
	/** always `no_matching_rule` on the wire — the gateway never says why (no handle enumeration) */
	reason: string;
	decision_id?: string;
}

export type DiscloseBody = DiscloseAllow | DiscloseDeny | { error: string; message?: string };

export interface DiscloseResult {
	purpose: Purpose;
	status: number;
	ok: boolean;
	body: DiscloseBody | null;
	/** round-trip in milliseconds */
	ms: number;
	/** network-level failure, if any */
	error?: string;
}

/** `GET /v1/disclose/:handle?purpose=` with a requester bearer. Never throws. */
export async function disclose(token: string, handle: string, purpose: Purpose): Promise<DiscloseResult> {
	const started = performance.now();
	try {
		const url = `${MACHINE_API_URL}/v1/disclose/${encodeURIComponent(handle)}?purpose=${encodeURIComponent(purpose)}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
		const body = (await res.json().catch(() => null)) as DiscloseBody | null;
		return { purpose, status: res.status, ok: res.ok, body, ms: Math.round(performance.now() - started) };
	} catch (e) {
		return {
			purpose,
			status: 0,
			ok: false,
			body: null,
			ms: Math.round(performance.now() - started),
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/** One call per purpose, in parallel — the side-by-side view of the Explorer. */
export function discloseAll(
	token: string,
	handle: string,
	purposes: readonly Purpose[] = PURPOSES,
): Promise<DiscloseResult[]> {
	return Promise.all(purposes.map((p) => disclose(token, handle, p)));
}

/** The published vocabulary from the machine listener; falls back to the seeded list. */
export async function machinePurposes(): Promise<Purpose[]> {
	try {
		const res = await fetch(`${MACHINE_API_URL}/v1/purposes`, { headers: { Accept: 'application/json' } });
		if (!res.ok) return [...PURPOSES];
		const data: unknown = await res.json();
		const list: unknown[] = Array.isArray(data)
			? data
			: data && typeof data === 'object' && Array.isArray((data as { purposes?: unknown }).purposes)
				? ((data as { purposes: unknown[] }).purposes)
				: [];
		const ids = list
			.map((p) => (typeof p === 'string' ? p : (p as { id?: unknown; name?: unknown } | null)?.id ?? (p as { name?: unknown } | null)?.name))
			.filter(isPurpose);
		return ids.length ? ids : [...PURPOSES];
	} catch {
		return [...PURPOSES];
	}
}
