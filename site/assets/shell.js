/* TechCap Intelligence — shared header behaviour (mobile menu) and the optional cookieless analytics snippet. No storage. */
(() => {
  const toggle = document.querySelector('.sh-toggle');
  const nav = document.getElementById('sh-nav');
  if (toggle && nav) {
    const set = (open) => { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => set(!nav.classList.contains('open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); toggle.focus(); } });
    document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) set(false); });
  }
  // Cookieless page counts (GoatCounter). Off until a code is set in content/site.mjs (config.analytics.goatcounter).
  const gc = document.documentElement.dataset.goatcounter;
  if (gc && /^[a-z0-9-]+$/.test(gc) && location.protocol === 'https:') {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${gc}.goatcounter.com/count`;
    document.head.append(s);
  }
})();
