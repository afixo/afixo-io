/**
 * Typed client for the console API (DESIGN.md §5 "Console listener", §6).
 *
 * Every call is same-origin (`/api/v1/...`). afixo-web forwards it untouched to
 * afixo-api over the service binding; afixo-api swaps the sealed session cookie
 * for a bearer token before the request reaches the gateway.
 *
 *  - non-GET requests carry `X-CSRF-Token` = the readable `__Host-afixo_csrf` cookie
 *  - a 401 triggers one single-flight `POST /auth/refresh`, then one retry
 *  - a second 401 sends the browser to /login
 *
 * Wire shapes are the gateway's (canonical: afixo-services/docs/api.md — bare
 * arrays for lists, `{label}` for personas, `{decisions, next_before}` for the
 * audit page). Decoding stays tolerant of the older envelopes so a mismatch
 * degrades to an empty list rather than a crash.
 */
import { CSRF_COOKIE, readCookie } from './session';

export const API_BASE = '/api/v1';

/* ------------------------------------------------------------------ */
/* Vocabulary (DESIGN.md §0)                                           */
/* ------------------------------------------------------------------ */

export const PURPOSES = [
	'social_display',
	'professional',
	'shipping',
	'billing',
	'age_verification',
	'legal_kyc',
	'support',
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const SENSITIVITIES = [0, 1, 2, 3] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
	0: 'public',
	1: 'low',
	2: 'medium',
	3: 'high',
};

export function isPurpose(value: unknown): value is Purpose {
	return typeof value === 'string' && (PURPOSES as readonly string[]).includes(value);
}

/** Coerce an unknown value to a tier; anything unparseable is treated as `3` (fail closed). */
export function toSensitivity(value: unknown): Sensitivity {
	const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
	return n === 0 || n === 1 || n === 2 ? n : 3;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Subject {
	id: string;
	handle: string;
	display_name?: string | null;
	roles?: string[];
}

export interface Field {
	key: string;
	value: string;
	sensitivity: Sensitivity;
}

export interface Persona {
	id: string;
	name: string;
	fields: Field[];
	created_at?: string;
}

export interface Requester {
	id: string;
	name: string;
	client_id: string;
	created_at?: string;
}

/** `POST /requesters` — the only time the plaintext secret is ever returned. */
export interface RequesterRegistration extends Requester {
	client_secret: string;
}

export interface Rule {
	id: string;
	/** null = any requester */
	requester_id: string | null;
	/** null = any purpose */
	purpose: Purpose | null;
	persona_id: string;
	max_sensitivity: Sensitivity;
	/** null/empty = every key under the ceiling */
	allow_keys: string[] | null;
	priority: number;
	created_at?: string;
}

export type NewRule = Omit<Rule, 'id' | 'created_at'>;

export type Decision = 'allow' | 'deny';

/** One row of the hash-chained log, normalised from the gateway's `DecisionRecord` JSON. */
export interface AuditEvent {
	/** event_id — also the `decision_id` the requester received */
	id: string;
	/** chain position; the pagination cursor is `before=<seq>` */
	seq?: number;
	/** ISO timestamp (decided_at) */
	at: string;
	decision: Decision;
	requester_id: string | null;
	requester_name?: string | null;
	purpose: string;
	persona?: string | null;
	disclosed_keys: string[];
	withheld_keys?: string[];
	reason?: string | null;
	hash?: string;
	prev_hash?: string | null;
}

export interface AuditPage {
	events: AuditEvent[];
	next_cursor: string | null;
}

export interface AuditVerification {
	ok: boolean;
	length?: number;
	/** seq of the first row whose hash does not verify */
	broken_at?: string | null;
	head_hash?: string;
	message?: string;
}

export interface PurposeInfo {
	id: string;
	description?: string;
}

/** Error shape everywhere (DESIGN.md §5). */
export interface ApiErrorBody {
	error: string;
	message?: string;
}

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight `POST /auth/refresh`; resolves to whether the session was renewed. */
function refreshSession(): Promise<boolean> {
	refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'X-CSRF-Token': readCookie(CSRF_COOKIE) ?? '' },
	})
		.then((r) => r.ok)
		.catch(() => false)
		.finally(() => {
			refreshInFlight = null;
		});
	return refreshInFlight;
}

export interface RequestOptions {
	/** default true: refresh once and retry on 401, then redirect to /login */
	retryOn401?: boolean;
	signal?: AbortSignal;
}

export async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	options: RequestOptions = {},
): Promise<T> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = readCookie(CSRF_COOKIE) ?? '';
	const init: RequestInit = { method, credentials: 'same-origin', headers };
	if (options.signal) init.signal = options.signal;
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify(body);
	}

	let res = await fetch(API_BASE + path, init);
	if (res.status === 401 && options.retryOn401 !== false) {
		const refreshed = await refreshSession();
		if (refreshed) res = await fetch(API_BASE + path, init);
		if (!refreshed || res.status === 401) {
			window.location.assign('/login');
			throw new ApiError(401, 'session_expired', 'Your session has expired; redirecting to sign-in.');
		}
	}

	if (res.status === 204) return undefined as T;
	const text = await res.text();
	const data = text ? parseJson(text) : null;
	if (!res.ok) {
		const err = (data && typeof data === 'object' ? data : {}) as Partial<ApiErrorBody>;
		throw new ApiError(res.status, err.error ?? `http_${res.status}`, err.message ?? `${res.status} ${res.statusText}`);
	}
	return data as T;
}

/* ------------------------------------------------------------------ */
/* Tolerant decoding                                                   */
/* ------------------------------------------------------------------ */

function unwrapList<T>(data: unknown, key: string): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === 'object') {
		const inner = (data as Json)[key];
		if (Array.isArray(inner)) return inner as T[];
	}
	return [];
}

function normalizeFields(raw: unknown): Field[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((f): f is Json => !!f && typeof f === 'object')
			.map((f) => ({ key: String(f.key ?? ''), value: String(f.value ?? ''), sensitivity: toSensitivity(f.sensitivity) }))
			.filter((f) => f.key);
	}
	if (raw && typeof raw === 'object') {
		return Object.entries(raw as Json).map(([key, v]) => {
			const f = (v && typeof v === 'object' ? v : { value: v }) as Json;
			return { key, value: String(f.value ?? ''), sensitivity: toSensitivity(f.sensitivity) };
		});
	}
	return [];
}

function normalizePersona(raw: Json): Persona {
	return {
		id: String(raw.id ?? ''),
		name: String(raw.name ?? raw.label ?? ''),
		fields: normalizeFields(raw.fields),
		created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
	};
}

function normalizeRequester(raw: Json): Requester {
	return {
		id: String(raw.id ?? ''),
		name: String(raw.name ?? ''),
		client_id: String(raw.client_id ?? raw.id ?? ''),
		created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
	};
}

function normalizeRule(raw: Json): Rule {
	const allow = raw.allow_keys;
	return {
		id: String(raw.id ?? ''),
		requester_id: typeof raw.requester_id === 'string' && raw.requester_id ? raw.requester_id : null,
		purpose: isPurpose(raw.purpose) ? raw.purpose : null,
		persona_id: String(raw.persona_id ?? ''),
		max_sensitivity: toSensitivity(raw.max_sensitivity),
		allow_keys: Array.isArray(allow) ? allow.map(String) : null,
		priority: Number(raw.priority ?? 0) || 0,
		created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
	};
}

/** Gateway `DecisionRecord` (`docs/api.md`) → `AuditEvent`; also accepts the pre-normalised shape. */
function normalizeAuditEvent(raw: Json): AuditEvent {
	const decision: Decision =
		raw.decision === 'allow' || raw.decision === 'deny' ? raw.decision : raw.allowed === true ? 'allow' : 'deny';
	const keys = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
	const persona = typeof raw.persona_label === 'string' ? raw.persona_label : typeof raw.persona === 'string' ? raw.persona : null;
	return {
		id: String(raw.event_id ?? raw.id ?? raw.seq ?? ''),
		seq: typeof raw.seq === 'number' ? raw.seq : undefined,
		at: String(raw.decided_at ?? raw.at ?? raw.recorded_at ?? ''),
		decision,
		requester_id: typeof raw.requester_id === 'string' && raw.requester_id ? raw.requester_id : null,
		purpose: String(raw.purpose ?? ''),
		persona: persona || null,
		disclosed_keys: keys(raw.disclosed_keys),
		withheld_keys: keys(raw.withheld_keys),
		reason: typeof raw.reason === 'string' && raw.reason ? raw.reason : null,
		hash: typeof raw.hash === 'string' ? raw.hash : undefined,
		prev_hash: typeof raw.prev_hash === 'string' ? raw.prev_hash : null,
	};
}

function normalizePurpose(raw: unknown): PurposeInfo | null {
	if (typeof raw === 'string') return { id: raw };
	if (raw && typeof raw === 'object') {
		const p = raw as Json;
		const id = p.id ?? p.name ?? p.purpose;
		if (typeof id === 'string') {
			return { id, description: typeof p.description === 'string' ? p.description : undefined };
		}
	}
	return null;
}

const enc = encodeURIComponent;

/* ------------------------------------------------------------------ */
/* Endpoints (DESIGN.md §5, console listener, as seen via /api/v1)     */
/* ------------------------------------------------------------------ */

export const api = {
	auth: {
		/** GET /auth/me */
		me: () => request<Subject>('GET', '/auth/me'),
		/** POST /auth/logout — afixo-api clears the three cookies. */
		logout: () => request<void>('POST', '/auth/logout', undefined, { retryOn401: false }),
	},

	/** GET /purposes — the published vocabulary. */
	purposes: async (): Promise<PurposeInfo[]> =>
		unwrapList<unknown>(await request('GET', '/purposes'), 'purposes')
			.map(normalizePurpose)
			.filter((p): p is PurposeInfo => p !== null),

	personas: {
		list: async (): Promise<Persona[]> =>
			unwrapList<Json>(await request('GET', '/personas'), 'personas').map(normalizePersona),
		get: async (id: string): Promise<Persona> => normalizePersona(await request<Json>('GET', `/personas/${enc(id)}`)),
		/** POST /personas `{label}` — the gateway calls the persona's name its `label`. */
		create: async (input: { name: string }): Promise<Persona> =>
			normalizePersona(await request<Json>('POST', '/personas', { label: input.name })),
		remove: (id: string) => request<void>('DELETE', `/personas/${enc(id)}`),
		/** PUT /personas/:id/fields/:key — upsert. */
		putField: (personaId: string, key: string, input: { value: string; sensitivity: Sensitivity }) =>
			request<unknown>('PUT', `/personas/${enc(personaId)}/fields/${enc(key)}`, input),
		deleteField: (personaId: string, key: string) =>
			request<void>('DELETE', `/personas/${enc(personaId)}/fields/${enc(key)}`),
	},

	requesters: {
		list: async (): Promise<Requester[]> =>
			unwrapList<Json>(await request('GET', '/requesters'), 'requesters').map(normalizeRequester),
		/** POST /requesters — returns the one-time `client_secret`. */
		create: async (input: { name: string }): Promise<RequesterRegistration> => {
			const raw = await request<Json>('POST', '/requesters', input);
			return { ...normalizeRequester(raw), client_secret: String(raw.client_secret ?? '') };
		},
		/** POST /requesters/:id/secret — rotate; returns the new one-time secret. */
		rotateSecret: async (id: string): Promise<{ client_id?: string; client_secret: string }> => {
			const raw = await request<Json>('POST', `/requesters/${enc(id)}/secret`);
			return {
				client_id: typeof raw.client_id === 'string' ? raw.client_id : undefined,
				client_secret: String(raw.client_secret ?? ''),
			};
		},
	},

	rules: {
		list: async (): Promise<Rule[]> => unwrapList<Json>(await request('GET', '/rules'), 'rules').map(normalizeRule),
		create: async (input: NewRule): Promise<Rule> => normalizeRule(await request<Json>('POST', '/rules', input)),
		remove: (id: string) => request<void>('DELETE', `/rules/${enc(id)}`),
	},

	audit: {
		/**
		 * GET /audit?limit&before — keyset pagination, newest first. The gateway answers
		 * `{decisions: DecisionRecord[], next_before: seq|null}`; `cursor` here is that seq as a string.
		 */
		list: async (opts: { limit?: number; cursor?: string | null } = {}): Promise<AuditPage> => {
			const q = new URLSearchParams();
			if (opts.limit) q.set('limit', String(opts.limit));
			if (opts.cursor) q.set('before', opts.cursor);
			const qs = q.toString();
			const raw = await request<unknown>('GET', `/audit${qs ? `?${qs}` : ''}`);
			const obj = raw && typeof raw === 'object' ? (raw as Json) : {};
			const rows = Array.isArray(obj.decisions) ? (obj.decisions as Json[]) : unwrapList<Json>(raw, 'events');
			const next = obj.next_before ?? obj.next_cursor;
			return {
				events: rows.map(normalizeAuditEvent),
				next_cursor: next === null || next === undefined || next === '' ? null : String(next),
			};
		},
		/** GET /audit/verify — the server walks the hash chain: `{ok, length, broken_at_seq, head_hash}`. */
		verify: async (): Promise<AuditVerification> => {
			const raw = await request<Json>('GET', '/audit/verify');
			const broken = raw.broken_at_seq ?? raw.broken_at;
			return {
				ok: raw.ok === true,
				length: typeof raw.length === 'number' ? raw.length : undefined,
				broken_at: broken === null || broken === undefined ? null : String(broken),
				head_hash: typeof raw.head_hash === 'string' ? raw.head_hash : undefined,
				message: typeof raw.message === 'string' ? raw.message : undefined,
			};
		},
	},
};

/* ------------------------------------------------------------------ */
/* Policy helpers — client-side mirror of the engine (DESIGN.md §0)    */
/* ------------------------------------------------------------------ */

/** `2·[requester set] + 1·[purpose set]`; highest wins, tie → priority, then newest. */
export function specificity(rule: Pick<Rule, 'requester_id' | 'purpose'>): number {
	return (rule.requester_id ? 2 : 0) + (rule.purpose ? 1 : 0);
}

/** Ceiling first, then the allow-list; both filters are independent. */
export function previewDisclosure(
	fields: Field[],
	maxSensitivity: Sensitivity,
	allowKeys: string[] | null,
): { disclosed: Field[]; withheld: Field[] } {
	const allow = allowKeys && allowKeys.length ? new Set(allowKeys) : null;
	const disclosed: Field[] = [];
	const withheld: Field[] = [];
	for (const f of fields) {
		(f.sensitivity <= maxSensitivity && (!allow || allow.has(f.key)) ? disclosed : withheld).push(f);
	}
	return { disclosed, withheld };
}

/** "email, name" → ["email","name"]; blank → null (= all keys). */
export function parseAllowKeys(input: string): string[] | null {
	const keys = [...new Set(input.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean))];
	return keys.length ? keys : null;
}
