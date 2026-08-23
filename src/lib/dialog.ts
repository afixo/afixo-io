/**
 * A `<dialog>`-based confirm(): focus is trapped by the platform, Escape
 * cancels, focus returns to the opener. Replaces window.confirm, which cannot
 * be styled and is blocked in some embedded browsers.
 */
export interface ConfirmOptions {
	title: string;
	body?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** red confirm button for destructive actions */
	danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const dlg = document.createElement('dialog');
		dlg.className = 'dlg';
		dlg.setAttribute('aria-labelledby', 'dlg-title');

		const title = document.createElement('h2');
		title.id = 'dlg-title';
		title.className = 'text-base font-semibold';
		title.textContent = opts.title;

		const body = document.createElement('p');
		body.className = 'mt-2 text-sm text-ink-2';
		body.textContent = opts.body ?? '';
		body.hidden = !opts.body;

		const actions = document.createElement('div');
		actions.className = 'mt-5 flex justify-end gap-2';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'btn';
		cancel.textContent = opts.cancelLabel ?? 'Cancel';
		const ok = document.createElement('button');
		ok.type = 'button';
		ok.className = opts.danger ? 'btn border-transparent bg-danger text-white hover:bg-danger/90' : 'btn btn-primary';
		ok.textContent = opts.confirmLabel ?? 'Confirm';
		actions.append(cancel, ok);
		dlg.append(title, body, actions);

		const finish = (value: boolean) => {
			dlg.close();
			dlg.remove();
			resolve(value);
		};
		cancel.addEventListener('click', () => finish(false));
		ok.addEventListener('click', () => finish(true));
		dlg.addEventListener('cancel', (ev) => {
			ev.preventDefault();
			finish(false);
		});
		dlg.addEventListener('click', (ev) => {
			if (ev.target === dlg) finish(false); // backdrop click
		});

		document.body.append(dlg);
		dlg.showModal();
		(opts.danger ? cancel : ok).focus();
	});
}
