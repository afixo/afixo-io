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
	0: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
	1: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
	2: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
	3: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
};

/** Client-rendered twin of `components/SensitivityBadge.astro`. */
export function badge(level: Sensitivity): HTMLSpanElement {
	return h('span', { class: `badge ${SENSITIVITY_CLASS[level]}`, title: `sensitivity ${level}` }, `${level} · ${SENSITIVITY_LABEL[level]}`);
}

export function td(...children: Child[]): HTMLTableCellElement {
	return h('td', {}, ...children);
}

export function emptyState(message: string): HTMLParagraphElement {
	return h('p', { class: 'text-sm text-zinc-500' }, message);
}

export function fmtTime(iso?: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Write a one-line status message into `target`. */
export function status(target: HTMLElement, message: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
	target.textContent = message;
	target.className = `text-sm ${kind === 'error' ? 'text-rose-600 dark:text-rose-400' : kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`;
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
