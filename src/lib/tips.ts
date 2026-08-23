/**
 * Click/keyboard behaviour for tooltips (`components/Info.astro` and
 * `ui.tip()`): hover and focus are pure CSS; this adds a sticky click toggle
 * for touch, and Escape / outside-click to dismiss (WCAG 1.4.13).
 */

/**
 * Marks a tip the user has dismissed with Escape.
 *
 * Clearing `aria-expanded` is not enough: the CSS also shows the bubble on
 * `:hover` and `:focus-within`, and Escape must not have to move focus to work.
 * The attribute overrides both (see `.tip[data-tip-dismissed]` in global.css)
 * and is cleared as soon as the pointer or focus leaves that tip.
 */
const DISMISSED = 'data-tip-dismissed';

export function initTips(root: ParentNode = document): void {
	root.addEventListener('click', (ev) => {
		const target = ev.target as HTMLElement | null;
		const trigger = target?.closest<HTMLButtonElement>('[data-tip] > .tip-trigger');
		if (trigger) {
			const open = trigger.getAttribute('aria-expanded') === 'true';
			closeAll();
			trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
			// An explicit re-open undoes an earlier Escape.
			trigger.parentElement?.removeAttribute(DISMISSED);
			ev.preventDefault();
			return;
		}
		if (!target?.closest('[data-tip]')) closeAll();
	});

	root.addEventListener('keydown', (ev) => {
		if ((ev as KeyboardEvent).key !== 'Escape') return;
		for (const tip of document.querySelectorAll<HTMLElement>('[data-tip]')) {
			if (tip.matches(':hover') || tip.contains(document.activeElement)) tip.setAttribute(DISMISSED, '');
		}
		closeAll();
	});

	// A dismissal lasts only until the pointer or focus leaves that tip.
	const revive = (ev: Event) => {
		const tip = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
		if (!tip) return;
		const to = (ev as MouseEvent | FocusEvent).relatedTarget as Node | null;
		if (to && tip.contains(to)) return;
		tip.removeAttribute(DISMISSED);
	};
	root.addEventListener('mouseout', revive);
	root.addEventListener('focusout', revive);
}

function closeAll(): void {
	for (const t of document.querySelectorAll<HTMLElement>('[data-tip] > .tip-trigger[aria-expanded="true"]')) {
		t.setAttribute('aria-expanded', 'false');
	}
}
