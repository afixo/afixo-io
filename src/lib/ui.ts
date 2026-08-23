/**
 * Tiny DOM helpers for the vanilla `<script>` panels under /app.
 *
 * TODO: if the panels grow, replace these with Preact islands
 * (`@astrojs/preact`, `client:load`) — the API client in ./api.ts is UI-agnostic.
 */
import { SENSITIVITY_LABEL, type Sensitivity } from './api';

type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined | EventListener;

/** `h('button', { class: 'btn', onclick: fn }, 'Save')` — attributes, `on*` listeners, children. */
export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Record<string, AttrValue> = {},
	...children: Child[]
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	for (const [name, value] of Object.entries(attrs)) {
		if (value == null || value === false) continue;
		if (typeof value === 'function') el.addEventListener(name.replace(/^on/, '').toLowerCase(), value);
		else if (value === true) el.setAttribute(name, '');
		else el.setAttribute(name, String(value));
	}
	for (const child of children) {
		if (child == null || child === false) continue;
		el.append(child instanceof Node ? child : String(child));
	}
	return el;
}

export const SENSITIVITY_CLASS: Record<Sensitivity, string> = {
	0: 'tier-0',
	1: 'tier-1',
	2: 'tier-2',
	3: 'tier-3',
};

export const SENSITIVITY_HELP: Record<Sensitivity, string> = {
	0: 'Public — fine to show anyone.',
	1: 'Low — ordinary profile data.',
	2: 'Medium — contact and address details.',
	3: 'High — dates of birth, identifiers, anything regulated.',
};

/** Client-rendered twin of `components/SensitivityBadge.astro`. */
export function badge(level: Sensitivity): HTMLSpanElement {
	return h(
		'span',
		{ class: `badge ${SENSITIVITY_CLASS[level]}`, title: SENSITIVITY_HELP[level] },
		`${level} · ${SENSITIVITY_LABEL[level]}`,
	);
}

/** A "?" tooltip, client-rendered twin of `components/Info.astro`. */
export function tip(label: string, text: string, right = false): HTMLSpanElement {
	const id = `tip-${Math.random().toString(36).slice(2, 9)}`;
	return h(
		'span',
		{ class: `tip${right ? ' tip-right' : ''}`, 'data-tip': true },
		h('button', { type: 'button', class: 'tip-trigger', 'aria-label': `About ${label}`, 'aria-describedby': id, 'aria-expanded': 'false' }, '?'),
		h('span', { role: 'tooltip', id, class: 'tip-bubble' }, text),
	);
}

export function td(...children: Child[]): HTMLTableCellElement {
	return h('td', {}, ...children);
}

/** A friendly empty state with an optional call to action. */
export function emptyState(message: string, action?: { label: string; href: string }): HTMLElement {
	return h(
		'div',
		{ class: 'flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-2 bg-surface-2/50 px-4 py-5 text-sm text-ink-2' },
		message,
		action ? h('a', { href: action.href, class: 'btn btn-sm' }, action.label) : null,
	);
}

export function fmtTime(iso?: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Short relative time ("3 h ago") for lists; falls back to the full date beyond a week. */
export function fmtAgo(iso?: string | null): string {
	if (!iso) return '—';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return iso;
	// Clock skew between the origin and the browser can make a fresh event look
	// like the future; render those as "now" rather than "in 3,364 seconds".
	const s = Math.max(0, Math.round((Date.now() - t) / 1000));
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	if (s < 45) return 'just now';
	if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
	if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
	if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
	return fmtTime(iso);
}

/** Write a one-line status message into `target` and announce it. */
export function status(target: HTMLElement, message: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
	target.textContent = message;
	target.setAttribute('role', 'status');
	target.setAttribute('aria-live', 'polite');
	target.className = `text-sm ${kind === 'error' ? 'text-danger' : kind === 'ok' ? 'text-ok' : 'text-ink-2'}`;
}

export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** querySelector that throws when the page template is out of sync with its script. */
export function must<T extends Element>(selector: string): T {
	const el = document.querySelector<T>(selector);
	if (!el) throw new Error(`missing element ${selector}`);
	return el;
}

export function formValues(form: HTMLFormElement): Record<string, string> {
	const out: Record<string, string> = {};
	new FormData(form).forEach((v, k) => {
		out[k] = String(v);
	});
	return out;
}

/** A "Copy" button that confirms itself for a moment. */
export function copyButton(text: string, label = 'Copy'): HTMLButtonElement {
	const b = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `${label} to clipboard` }, label);
	b.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(text);
			b.textContent = 'Copied';
			setTimeout(() => {
				b.textContent = label;
			}, 1500);
		} catch {
			b.textContent = 'Select and copy';
		}
	});
	return b;
}

/** Skeleton rows while a list loads (never a spinner). */
export function skeleton(rows = 3): HTMLElement {
	return h(
		'div',
		{ class: 'flex flex-col gap-2', 'aria-busy': 'true', 'aria-label': 'Loading' },
		...Array.from({ length: rows }, (_, i) => h('div', { class: `skeleton h-4 ${i % 2 ? 'w-2/3' : 'w-5/6'}` })),
	);
}
