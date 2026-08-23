/*
 * Theme bootstrap. Loaded synchronously from <head> (a plain external script:
 * the CSP forbids inline scripts) so the right colour scheme is on <html>
 * before the first paint — no flash.
 *
 *   mode      = "system" | "light" | "dark"   (localStorage "afixo.theme"; absent = system)
 *   effective = "light" | "dark"              (what is actually applied)
 *
 * <html data-theme="light|dark" data-theme-mode="system|light|dark">
 */
(function () {
	var KEY = 'afixo.theme';
	var root = document.documentElement;
	var media = window.matchMedia('(prefers-color-scheme: dark)');

	function stored() {
		try {
			var v = localStorage.getItem(KEY);
			return v === 'light' || v === 'dark' ? v : 'system';
		} catch (e) {
			return 'system';
		}
	}
	function effective(mode) {
		return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
	}
	function apply(mode) {
		root.dataset.theme = effective(mode);
		root.dataset.themeMode = mode;
	}
	function set(mode) {
		if (mode !== 'light' && mode !== 'dark') mode = 'system';
		try {
			if (mode === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, mode);
		} catch (e) {
			/* private mode: the choice lives for this page only */
		}
		apply(mode);
		window.dispatchEvent(new CustomEvent('afixo:theme', { detail: { mode: mode, effective: effective(mode) } }));
	}

	apply(stored());
	media.addEventListener('change', function () {
		if (stored() === 'system') apply('system');
	});

	window.afixoTheme = {
		get: stored,
		effective: function () {
			return effective(stored());
		},
		set: set,
	};
})();
