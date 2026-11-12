/* TechCap Intelligence — website behaviour: mobile menu and the contact form. No tracking, no storage. */
(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- mobile menu ----------
  const toggle = document.querySelector('.nav-toggle');
  const nav = $('site-nav');
  if (toggle && nav) {
    const set = (open) => { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => set(!nav.classList.contains('open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); toggle.focus(); } });
  }

  // ---------- copy helper ----------
  const copy = async (text, btn, field) => {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1600); };
    try { await navigator.clipboard.writeText(text); done(); }
    catch { if (field && field.select) { field.focus(); field.select(); } else { const r = document.createRange(); r.selectNodeContents(field); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
  };
  const emailEl = $('email'), copyEmail = $('copy-email');
  if (emailEl && copyEmail) copyEmail.addEventListener('click', () => copy(emailEl.textContent, copyEmail, emailEl));

  // ---------- contact form ----------
  const form = $('enquiry');
  if (!form) return;

  // contact.html#research preselects that enquiry type.
  const pick = () => { const r = $('type-' + location.hash.slice(1)); if (r) r.checked = true; };
  pick();
  addEventListener('hashchange', pick);

  const err = $('form-error'), box = $('composed'), note = $('composed-note'), out = $('composed-text');
  $('copy-msg').addEventListener('click', () => copy(out.value, $('copy-msg'), out));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (n) => form.elements[n].value.trim();
    const missing = [['name', 'your name'], ['email', 'your email'], ['message', 'what you need']].filter(([n]) => !v(n));
    if (missing.length) {
      err.textContent = 'Please add ' + missing.map((m) => m[1]).join(', ') + '.';
      err.hidden = false;
      form.elements[missing[0][0]].focus();
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(v('email'))) {
      err.textContent = 'That email address does not look complete. Please check it.';
      err.hidden = false;
      form.elements.email.focus();
      return;
    }
    err.hidden = true;

    const type = form.elements.type.value;
    const to = form.dataset.email;
    const subject = `${type} · ${v('org') || v('name')}`;
    const body = `${v('message')}\n\n${v('name')}${v('org') ? '\n' + v('org') : ''}\n${v('email')}`;
    out.value = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    box.hidden = false;

    if (form.dataset.placeholder === 'true') {
      note.textContent = 'The contact address on this site is still a placeholder, so your email app was not opened. Your message is below.';
      return;
    }
    note.textContent = `Your email app should now open with this message. If it does not, copy it and send it to ${to}.`;
    location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
})();
