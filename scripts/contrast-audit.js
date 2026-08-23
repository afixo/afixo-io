/*
 * WCAG 2.2 AA contrast audit for every page, in both themes.
 *
 * Walks each rendered page, resolves every text colour and its composited
 * background through a 1x1 canvas (computed styles come back as `oklch()`,
 * which cannot be parsed as RGB), and reports any pair under 4.5:1 — 3:1 for
 * large text. Run it after touching a colour token in src/styles/global.css.
 *
 * Needs `astro dev` on :4321. Run through the Playwright MCP server:
 *   browser_run_code_unsafe({ filename: 'afixo-web/scripts/contrast-audit.js' })
 */
async (page) => {
  const PAGES = ['/', '/login', '/app', '/app/personas', '/app/clients', '/app/policies', '/app/explorer', '/app/audit'];
  const check = async (theme) => {
    const all = [];
    for (const path of PAGES) {
      await page.goto('http://localhost:4321' + path, { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => { try { localStorage.setItem('afixo.theme', t); } catch {} }, theme);
      await page.goto('http://localhost:4321' + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const bad = await page.evaluate((p) => {
        const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        const rgba = (css) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = css; ctx.fillRect(0,0,1,1); const d = ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
        const over = (fg, bg) => fg[3] >= 1 ? fg.slice(0,3) : [0,1,2].map(i => fg[i]*fg[3] + bg[i]*(1-fg[3]));
        const srgb = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
        const lum = ([r,g,b]) => 0.2126*srgb(r) + 0.7152*srgb(g) + 0.0722*srgb(b);
        const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
        const bgOf = (el) => {
          const stack = [];
          for (let n = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3] > 0) stack.push(c);
            if (c[3] >= 1) break;
          }
          let base = [255,255,255];
          for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
          return base;
        };
        const out = [];
        for (const el of document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,td,th,code,button,label,summary,dt,dd,strong,em')) {
          const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
          if (!txt) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
          if (el.closest('.sr-only, [hidden], .tip-bubble')) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const bg = bgOf(el);
          const fg = over(rgba(cs.color), bg);
          const size = parseFloat(cs.fontSize);
          const weight = Number(cs.fontWeight) || 400;
          const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
          const cr = ratio(fg, bg);
          if (cr < need) out.push({ page: p, text: txt.slice(0,30), cr: Math.round(cr*100)/100, need, size: Math.round(size), cls: (el.className||'').toString().split(' ').slice(0,3).join('.').slice(0,38) });
        }
        return out;
      }, path);
      all.push(...bad);
    }
    const seen = new Set(); const uniq = [];
    for (const r of all) { const k = r.cls + '|' + r.cr; if (!seen.has(k)) { seen.add(k); uniq.push(r); } }
    return uniq.sort((a,b) => a.cr - b.cr);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const light = await check('light'), dark = await check('dark');
  return { lightFailures: light.length, darkFailures: dark.length, light: light.slice(0, 12), dark: dark.slice(0, 12) };
}
