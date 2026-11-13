// TechCap Intelligence — builds the website pages into site/.
//   node scripts/build-site.mjs                 writes site/*.html, sitemap.xml and robots.txt
//   node scripts/build-site.mjs --artifact DIR  also writes a preview copy whose index.html has no document wrapper
// Copy: content/site.mjs. Components: scripts/site/components.mjs. Styles: site/assets/site.css.
// Figures on the pages come from the data snapshot in site/data (written by scripts/build-data.mjs).

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as content from '../content/site.mjs';
import * as c from './site/components.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const { config, nav, pillars, audiences } = content;
const { esc } = c;

// ---------- data ----------

const SCOPE = ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'UK'];
// Where the hero map prints each label, relative to its circle: [dx, dy, anchor].
const LABEL_POS = { UK: [-1, 0, 'end'], France: [-1, 0.5, 'end'], Germany: [1, -0.4, 'start'], Sweden: [1, 0, 'start'], Switzerland: [0.2, 1.9, 'start'], Netherlands: [0.3, -2.8, 'start'], Spain: [-1, 0, 'end'] };

function loadData() {
  const meta = JSON.parse(readFileSync(join(site, 'data/meta.json'), 'utf8'));
  const cube = JSON.parse(readFileSync(join(site, 'data/cube.json'), 'utf8')).rows; // [year, country, sector, kind, euros, rounds]
  const win = {};
  new Function('window', readFileSync(join(site, 'assets/europe-map.js'), 'utf8'))(win);
  const geo = win.EF_MAP;

  const yearList = Object.keys(meta.years).map(Number).sort();
  const cur = yearList.at(-1);
  const years = yearList.map((y) => {
    const o = { year: y, ytd: y === cur, equity: 0, debt: 0, grant: 0, rounds: meta.years[y] };
    for (const r of cube) if (r[0] === y && r[1] === '*' && r[2] === '*') o[r[3]] += r[4];
    o.total = o.equity + o.debt + o.grant;
    return o;
  });
  const by = (idx, keep) => {
    const m = new Map();
    for (const r of cube) if (r[0] === cur && keep(r)) m.set(r[idx], (m.get(r[idx]) || 0) + r[4]);
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const countries = by(1, (r) => r[2] === '*' && SCOPE.includes(r[1]));
  const sectors = by(2, (r) => r[1] === '*' && r[2] !== '*' && r[2] !== 'Unclassified');

  // Hero map: centre of each country's largest polygon, circle area proportional to funding.
  const centre = (d) => {
    let best = null;
    for (const sub of d.split('M').filter(Boolean)) {
      const n = sub.match(/-?\d+(\.\d+)?/g).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
      const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      b.area = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (!best || b.area > best.area) best = b;
    }
    return { x: (best.x0 + best.x1) / 2, y: (best.y0 + best.y1) / 2 };
  };
  const centres = new Map(geo.c.map((g) => [g.n, centre(g.d)]));
  const maxV = countries[0].value;
  const bubbles = countries
    .filter((k) => centres.has(k.name))
    .map((k) => ({ ...k, ...centres.get(k.name), r: +Math.max(3, 44 * Math.sqrt(k.value / maxV)).toFixed(1) }))
    .map((b) => ({ ...b, x: +b.x.toFixed(1), y: +b.y.toFixed(1) }));
  const labels = bubbles.slice(0, 5).map((b) => {
    const [dx, dy, anchor] = LABEL_POS[b.name] || [1, 0, 'start'];
    return { ...b, anchor, lx: +(b.x + dx * (b.r + 8)).toFixed(1), ly: +(b.y + dy * 14).toFixed(1) };
  });
  const hub = bubbles[0];
  const arcs = bubbles.slice(1, 7).map((b) => {
    const mx = (hub.x + b.x) / 2, my = (hub.y + b.y) / 2, dx = b.x - hub.x, dy = b.y - hub.y;
    return `M${hub.x} ${hub.y} Q${(mx - dy * 0.22).toFixed(1)} ${(my + dx * 0.22).toFixed(1)} ${b.x} ${b.y}`;
  });

  const updated = new Date(meta.updated);
  return {
    year: updated.getUTCFullYear(),
    updatedLabel: updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    years,
    current: years.at(-1),
    totalRounds: years.reduce((s, y) => s + y.rounds, 0),
    countryCount: SCOPE.length,
    topCountries: countries.slice(0, 6),
    topSectors: sectors.slice(0, 6),
    hero: {
      year: cur,
      map: { viewBox: '130 60 560 640', countries: geo.c.map((g) => ({ d: g.d, in: SCOPE.includes(g.n) })) },
      bubbles, labels, arcs,
    },
  };
}

// ---------- pages ----------

const li = (items) => items.map((i) => `<li>${esc(i)}</li>`).join('');

function homePage(ctx) {
  const h = content.home, d = ctx.data;
  return `<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <p class="eyebrow">${esc(h.hero.eyebrow)}</p>
      <h1>${esc(h.hero.headline)}</h1>
      <p class="lead">${esc(h.hero.text)}</p>
      <div class="cta-row">${c.button(h.hero.primary, 'solid')}${c.button(h.hero.secondary, 'outline')}</div>
    </div>
    ${c.heroMap(d)}
  </div>
  <div class="wrap">
    <ul class="verbs">${pillars.map((p) => `<li><a href="${p.href}">${c.pillarIcon(p.key, 28)}<span class="v-txt"><b>${esc(p.label)}</b><small>${esc(p.motto)}</small></span></a></li>`).join('')}</ul>
  </div>
</section>
${c.split(h.proposition, `<dl class="points">${h.proposition.points.map((p) => `<div><dt>${esc(p.title)}</dt><dd>${esc(p.text)}</dd></div>`).join('')}</dl>`)}
<section class="section tinted" id="pillars">
  <div class="wrap">
    ${c.sectionHead(h.pillars)}
    ${c.pillarCards(pillars)}
  </div>
</section>
<section class="section" id="coverage">
  <div class="wrap">
    ${c.sectionHead(h.tracking)}
    <dl class="facts">
      <div><dt>${c.int(d.totalRounds)}</dt><dd>funding rounds tracked since 2021</dd></div>
      <div><dt>${d.countryCount}</dt><dd>countries: the EU27, the UK, Switzerland, Norway and Iceland</dd></div>
      <div><dt>2&times; a day</dt><dd>the dataset is refreshed, most recently on ${esc(d.updatedLabel)}</dd></div>
    </dl>
    <ul class="track">${h.tracking.items.map((i) => `<li><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></li>`).join('')}</ul>
    <p class="after"><a class="btn btn-outline" href="dashboard.html">Open the live funding dashboard</a></p>
  </div>
</section>
<section class="section tinted" id="audiences">
  <div class="wrap">
    ${c.sectionHead(h.audiences)}
    <ul class="audiences">${audiences.map((a) => `<li><h3>${esc(a.name)}</h3><p class="who">${esc(a.who)}</p><p>${esc(a.need)}</p></li>`).join('')}</ul>
  </div>
</section>
${c.closing(h.closing)}`;
}

function platformPage(ctx) {
  const p = content.platform;
  return `${c.pageHero(p.hero)}
<section class="section tight" id="preview">
  <div class="wrap">
    ${c.sectionHead(p.preview)}
    ${c.terminal(ctx.data, p.policySample)}
    <p class="after"><a class="btn btn-solid" href="dashboard.html">Open the live dashboard</a></p>
  </div>
</section>
${c.split(p.why, `<ul class="questions">${li(p.why.questions)}</ul>`)}
<section class="section tinted" id="modules">
  <div class="wrap">
    ${c.sectionHead(p.modulesIntro)}
    <div class="modules">
${p.modules
  .map(
    (m) => `      <article class="module">
        <div class="module-head"><span class="letter" aria-hidden="true">${m.letter}</span><span class="status status-${m.status}">${esc(m.statusLabel)}</span></div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.text)}</p>
        <ul class="ticks">${li(m.features)}</ul>
        <p class="more">${c.button(m.link, 'text')}</p>
      </article>`,
  )
  .join('\n')}
    </div>
  </div>
</section>
<section class="section" id="policy">
  <div class="wrap">
    ${c.sectionHead(p.complement)}
    <div class="pairs" role="table" aria-label="How policy signals and market signals connect">
      <div class="pairs-head" role="row"><span role="columnheader">Policy signal</span><span role="columnheader">Market signal</span></div>
${p.complement.rows.map((r) => `      <div class="pair" role="row"><span role="cell">${esc(r.policy)}</span><span class="to" aria-hidden="true"></span><span role="cell">${esc(r.market)}</span></div>`).join('\n')}
    </div>
  </div>
</section>
<section class="section tinted">
  <div class="wrap">
    ${c.sectionHead(p.benefits)}
    ${c.nameList(p.benefits.items, 'cols-4')}
  </div>
</section>
${c.closing(p.closing)}`;
}

function researchPage() {
  const r = content.research;
  return `${c.pageHero(r.hero)}
${c.split(r.intro, `<div class="tailored"><h3>Projects can be tailored to</h3><ul class="tags">${li(r.intro.tailoredTo)}</ul></div>`)}
<section class="section tinted" id="services">
  <div class="wrap">
    ${c.sectionHead({ eyebrow: 'Services', headline: 'Four areas of work' })}
    ${c.serviceBlocks(r.services)}
  </div>
</section>
<section class="section">
  <div class="wrap">
    ${c.sectionHead(r.clients)}
    ${c.nameList(r.clients.items, 'cols-4')}
  </div>
</section>
${c.closing(r.closing)}`;
}

function engagementPage() {
  const e = content.engagement;
  return `<section class="page-hero with-figure">
  <div class="wrap hero-in">
    <div class="hero-text">
      <p class="eyebrow">${esc(e.hero.eyebrow)}</p>
      <h1>${esc(e.hero.headline)}</h1>
      <p class="lead">${esc(e.hero.text)}</p>
      <div class="cta-row">${c.button(e.hero.primary, 'solid')}</div>
    </div>
    ${c.roundtable()}
  </div>
</section>
${c.split(e.difference, `<dl class="points">${e.difference.outcomes.map((o) => `<div><dt>${esc(o.title)}</dt><dd>${esc(o.text)}</dd></div>`).join('')}</dl>`)}
<section class="section tinted" id="services">
  <div class="wrap">
    ${c.sectionHead({ eyebrow: 'Services', headline: 'From the first idea to the last question' })}
    ${c.serviceBlocks(e.services)}
  </div>
</section>
<section class="section">
  <div class="wrap callout"><h2>${esc(e.note.headline)}</h2><p>${esc(e.note.text)}</p></div>
</section>
${c.closing(e.closing)}`;
}

function aboutPage() {
  const a = content.about;
  const f = a.founder;
  return `${c.pageHero(a.hero)}
${c.split(a.why)}
<section class="section tinted">
  <div class="wrap">
    ${c.sectionHead(a.foundations)}
    <ul class="tags big">${li(a.foundations.items)}</ul>
  </div>
</section>
${c.split(f, `<div class="orgs"><h3>Professional experience includes</h3><ul class="tags">${li(f.organisations)}</ul><p class="note">${esc(f.disclaimer)}</p></div>`)}
<section class="section tinted">
  <div class="wrap">
    ${c.sectionHead(a.principles)}
    ${c.nameList(a.principles.items, 'cols-4')}
  </div>
</section>
<section class="section">
  <div class="wrap">
    ${c.sectionHead({ eyebrow: 'What we do', headline: 'Three business lines that reinforce each other' })}
    ${c.pillarCards(pillars)}
  </div>
</section>
${c.closing(a.closing)}`;
}

function contactPage() {
  const k = content.contact, ct = config.contact;
  const link = (url, label) => (url ? `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a></li>` : `<li class="todo">${esc(label)} <span>link to be added</span></li>`);
  return `${c.pageHero(k.hero)}
<section class="section tight">
  <div class="wrap contact">
    <div class="enquiry">
      <h2 class="form-title">Get in touch</h2>
      <div class="signup" id="signup" data-form="${esc(ct.beehiivFormId)}"></div>
      <p class="note">Form not showing? <a href="${esc(config.newsletterUrl)}" target="_blank" rel="noopener">Open it on our sign-up page</a>.</p>
      <p class="note">Submitting the form also subscribes you to the weekly TechCap Intelligence Roundup. You can unsubscribe in one click.</p>
    </div>
    <aside class="direct">
      <h2>What we can help with</h2>
      <dl class="helps">${k.types.map((t) => `<div id="${t.id}"><dt>${esc(t.label)}</dt><dd>${esc(t.text)}</dd></div>`).join('')}</dl>
      ${ct.email ? `<h2>Email</h2><p class="email-row"><span class="email" id="email">${esc(ct.email)}</span><button class="btn btn-outline sm" type="button" id="copy-email">Copy</button></p>` : ''}
      <h2>LinkedIn</h2>
      <ul class="links">${link(ct.linkedinCompany, 'TechCap Intelligence on LinkedIn')}${link(ct.linkedinFounder, 'Founder on LinkedIn')}</ul>
    </aside>
  </div>
</section>`;
}

const pages = [
  ['index.html', content.home, homePage],
  ['platform.html', content.platform, platformPage],
  ['research.html', content.research, researchPage],
  ['engagement.html', content.engagement, engagementPage],
  ['about.html', content.about, aboutPage],
  ['contact.html', content.contact, contactPage],
];

// ---------- write ----------

const data = loadData();
const render = (file, page, fn, artifact) => {
  const ctx = { page, config, nav, file, data, artifact };
  let extra = '';
  if (file === 'index.html' && !artifact) {
    // The dashboard used to live at this address. Old shared links carry its filters in the hash: send them on.
    extra = `<script>if(/(^|[#&])(year|country|sector|cmp)=/.test(location.hash))location.replace('dashboard.html'+location.hash)</script>\n<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: config.name, url: config.baseUrl, slogan: config.tagline, description: config.positioning, logo: config.baseUrl + 'assets/apple-touch-icon.png', areaServed: 'Europe' })}</script>\n`;
  }
  return c.layout(ctx, extra + fn(ctx));
};

for (const [file, page, fn] of pages) writeFileSync(join(site, file), render(file, page, fn, false));

const lastmod = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(site, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.map((p) => p[0]), 'dashboard.html', 'policy.html']
    .map((f) => `  <url><loc>${config.baseUrl}${f === 'index.html' ? '' : f}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(join(site, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.baseUrl}sitemap.xml\n`);

const ai = process.argv.indexOf('--artifact');
if (ai > -1) {
  const out = process.argv[ai + 1];
  mkdirSync(out, { recursive: true });
  cpSync(site, out, { recursive: true });
  writeFileSync(join(out, 'index.html'), render('index.html', content.home, homePage, true));
}
console.log(`Built ${pages.length} pages. Data snapshot: ${data.updatedLabel}.`);
