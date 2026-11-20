/* TechCap Intelligence — website behaviour: the contact form and the home page search. No tracking, no storage. */
(() => {
  const $ = (id) => document.getElementById(id);

  // The mobile menu lives in shell.js (shared with the dashboard and Policy & Capital).

  // ---------- copy helper ----------
  const copy = async (text, btn, field) => {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1600); };
    try { await navigator.clipboard.writeText(text); done(); }
    catch { if (field && field.select) { field.focus(); field.select(); } else { const r = document.createRange(); r.selectNodeContents(field); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
  };
  const emailEl = $('email'), copyEmail = $('copy-email');
  if (emailEl && copyEmail) copyEmail.addEventListener('click', () => copy(emailEl.textContent, copyEmail, emailEl));

  // ---------- contact form (Beehiiv) ----------
  // Same loader as the dashboard's "Join early access" dialog.
  const box = $('signup');
  if (box && box.dataset.form) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://subscribe-forms.beehiiv.com/v3/loader.js';
    s.setAttribute('data-beehiiv-form', box.dataset.form);
    box.append(s);
  }
})();

/* Home page search: finds a startup or investor in the data snapshot and opens its profile on the dashboard.
   The data (about 2 MB) loads only when someone focuses the box. */
(() => {
  const input = document.getElementById('heroSearch'), list = document.getElementById('heroHits');
  if (!input || !list) return;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b(gmbh|ltd|limited|sas|sa|ag|ab|bv|nv|srl|spa|inc|oy|as|aps|sl)\b/g, '').replace(/[^a-z0-9]/g, '');
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  let data = null, loading = null, hits = [], sel = -1;
  const load = () => loading || (loading = Promise.all([
    fetch('data/companies.json').then((r) => r.json()).then((j) => j.rows.map((r) => ({ id: r[0], name: r[1], country: r[2], total: r[4], key: norm(r[1]) }))).catch(() => []),
    fetch('data/investors.json').then((r) => r.json()).then((j) => (j.rows || []).map((r) => ({ name: String(r[0]), type: r[1], key: norm(r[0]) }))).catch(() => []),
  ]).then(([c, i]) => { data = { c, i }; }));
  const go = (h) => { location.href = h.kind === 'c' ? `dashboard.html#company=${encodeURIComponent(h.id)}` : `dashboard.html#investor=${encodeURIComponent(h.name)}`; };
  const li = (h, i) => {
    const e = document.createElement('li'); e.setAttribute('role', 'option'); e.id = 'hh-' + i;
    const b = document.createElement('b'); b.textContent = h.name; const s = document.createElement('span');
    s.textContent = h.kind === 'c' ? ` ${h.country}${h.total ? ' · €' + compact.format(h.total) + ' raised' : ''}` : ` Investor${h.type ? ' · ' + h.type : ''}`;
    e.append(b, s); e.addEventListener('mousedown', (ev) => { ev.preventDefault(); go(h); }); return e;
  };
  const show = () => {
    list.replaceChildren(); sel = -1;
    const q = norm(input.value);
    if (!data || q.length < 2) { list.hidden = true; return; }
    const c = [], ci = [], inv = [];
    for (const x of data.c) { if (x.key.startsWith(q)) c.push(x); else if (x.key.includes(q)) ci.push(x); if (c.length >= 6) break; }
    for (const x of data.i) { if (x.key.startsWith(q) || (q.length >= 4 && x.key.includes(q))) inv.push(x); if (inv.length >= 3) break; }
    hits = [...[...c, ...ci].slice(0, inv.length ? 6 : 8).map((x) => ({ ...x, kind: 'c' })), ...inv.map((x) => ({ ...x, kind: 'i' }))];
    if (!hits.length) { const e = document.createElement('li'); e.className = 'none'; e.textContent = 'Nothing by that name yet. Try the dashboard search.'; list.append(e); }
    hits.forEach((h, i) => list.append(li(h, i)));
    list.hidden = false;
  };
  input.addEventListener('focus', () => load().then(show));
  input.addEventListener('input', () => load().then(show));
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('li[role=option]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('on', i === sel)); input.setAttribute('aria-activedescendant', items[sel].id); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[sel >= 0 ? sel : 0]; if (h) go(h); }
    else if (e.key === 'Escape') list.hidden = true;
  });
})();
