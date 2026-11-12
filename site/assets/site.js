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
