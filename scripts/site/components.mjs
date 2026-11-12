// TechCap Intelligence — website components.
// Pure functions that return HTML strings. Copy lives in content/site.mjs.

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const eur = (v) => '€' + compact.format(v);
export const int = (v) => new Intl.NumberFormat('en').format(v);

// ---------- brand ----------

// The Signal C symbol, exactly as in assets/favicon.svg. `parts` limits it to one element for pillar icons.
export function symbol({ size = 40, parts = ['outer', 'inner', 'dot'], label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const on = (p) => (parts.includes(p) ? '' : ' class="off"');
  return `<svg class="sym" width="${size}" height="${size}" viewBox="0 0 100 100" ${a11y}><g fill="none" stroke-linecap="round" stroke-width="11"><path${on('outer')} stroke="#FD0A71" d="M75.1 25.6 A38 38 0 1 0 67.8 81.1"/><path${on('inner')} stroke="#988AFB" d="M57.0 30.9 A22 22 0 1 0 65.1 61.0"/></g><circle${on('dot')} fill="#F4B860" cx="80" cy="50" r="9"/></svg>`;
}

const pillarParts = { track: ['outer'], interpret: ['inner'], connect: ['dot'] };
export const pillarIcon = (key, size = 44) => symbol({ size, parts: pillarParts[key] });

// The lockup uses the existing logo files (wordmark as a mask so it follows the text colour).
export const logo = (cls = '') =>
  `<span class="logo ${cls}" role="img" aria-label="TechCap Intelligence"><span class="w"></span><span class="m"></span></span>`;

const arrow = '<svg class="arr" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.500 3.500" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function button({ href, label, external }, variant = 'solid') {
  const ext = external ? ' target="_blank" rel="noopener"' : '';
  return `<a class="btn btn-${variant}" href="${esc(href)}"${ext}>${esc(label)}${variant === 'text' ? arrow : ''}</a>`;
}

// ---------- page chrome ----------

export function head({ page, config, file, artifact }) {
  const title = file === 'index.html' ? `${config.name}` : `${page.title} · ${config.name}`;
  const fullTitle = file === 'index.html' ? `${config.name} · European tech capital flows` : title;
  const url = config.baseUrl + (file === 'index.html' ? '' : file);
  const links = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/site.css">`;
  if (artifact) {
    // Artifact preview: the host wraps the page, so only the title, the gutter promise and the styles go here.
    return `<title>${esc(config.name)}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${links}\n`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(config.baseUrl)}assets/apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/favicon-64.png" sizes="64x64" type="image/png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
${links}
</head>
<body>
`;
}

export function header({ nav, file }) {
  const items = nav
    .map((n) => `<li><a href="${n.href}"${n.href === file ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`)
    .join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-in">
    <a class="home-link" href="index.html" aria-label="TechCap Intelligence, home">${logo()}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="bars" aria-hidden="true"></span><span class="sr-only">Menu</span></button>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <ul>${items}</ul>
      <a class="btn btn-solid" href="contact.html"${file === 'contact.html' ? ' aria-current="page"' : ''}>Work with us</a>
    </nav>
  </div>
</header>
`;
}

export function footer({ nav, config, data }) {
  const c = config.contact;
  const li = (url, label) =>
    url ? `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a></li>` : `<li class="todo">${esc(label)} <span>link to be added</span></li>`;
  return `<footer class="site-foot">
  <div class="wrap foot-in">
    <div class="foot-brand">
      <a class="home-link" href="index.html" aria-label="TechCap Intelligence, home">${logo()}</a>
      <p class="slogan">Making sense of European tech capital flows</p>
    </div>
    <nav aria-label="Footer">
      <h2>Explore</h2>
      <ul>
        ${nav.map((n) => `<li><a href="${n.href}">${esc(n.label)}</a></li>`).join('\n        ')}
        <li><a href="dashboard.html">Funding dashboard</a></li>
        <li><a href="contact.html">Contact</a></li>
      </ul>
    </nav>
    <div>
      <h2>Contact</h2>
      <ul>
        <li><span class="email">${esc(c.email)}</span>${c.emailIsPlaceholder ? ' <span class="ph">placeholder</span>' : ''}</li>
        ${li(c.linkedinCompany, 'LinkedIn')}
        <li><a href="${esc(config.newsletterUrl)}" target="_blank" rel="noopener">Weekly Roundup newsletter</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap foot-legal">
    <p>Funding data: <a href="https://funding.tech.eu" target="_blank" rel="noopener">Tech.eu Funding Explorer</a> (CC BY 4.0) plus the TechCap Intelligence daily multi-source scan. Not investment advice.</p>
    <p>© ${data.year} TechCap Intelligence. No cookies, no tracking.</p>
  </div>
</footer>
<script src="assets/site.js" defer></script>
`;
}

export function layout(ctx, body) {
  const end = ctx.artifact ? '' : '</body>\n</html>\n';
  return `${head(ctx)}${header(ctx)}<main id="main">\n${body}</main>\n${footer(ctx)}${end}`;
}

// ---------- shared sections ----------

export function pageHero({ eyebrow, headline, text, primary, secondary }, extra = '') {
  const ctas = [primary && button(primary, 'solid'), secondary && button(secondary, 'outline')].filter(Boolean).join('');
  return `<section class="page-hero">
  <div class="wrap">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h1>${esc(headline)}</h1>
    <p class="lead">${esc(text)}</p>
    ${ctas ? `<div class="cta-row">${ctas}</div>` : ''}
    ${extra}
  </div>
</section>
`;
}

export const sectionHead = ({ eyebrow, headline, text }) =>
  `<div class="sec-head">${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2>${esc(headline)}</h2>${text ? `<p class="lead">${esc(text)}</p>` : ''}</div>`;

// Two-column text block: headline on the left, paragraphs and an optional extra on the right.
export function split({ eyebrow, headline, paragraphs }, extra = '', cls = '') {
  return `<section class="section ${cls}">
  <div class="wrap split">
    <div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(headline)}</h2></div>
    <div class="prose">${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}${extra}</div>
  </div>
</section>
`;
}

export function closing({ headline, text, cta, secondary }) {
  return `<section class="closing">
  <div class="wrap closing-in">
    <div><h2>${esc(headline)}</h2><p>${esc(text)}</p></div>
    <div class="cta-row">${button(cta, 'light')}${secondary ? button(secondary, 'ghost') : ''}</div>
  </div>
</section>
`;
}

export function pillarCards(pillars) {
  return `<div class="pillars">
${pillars
  .map(
    (p) => `  <article class="pillar pillar-${p.key}">
    <div class="pillar-top">${pillarIcon(p.key)}<p class="verb">We <b>${esc(p.verb)}</b> ${esc(p.object)}</p></div>
    <h3><a href="${p.href}">${esc(p.title)}</a></h3>
    <p class="line">${esc(p.line)}</p>
    <p class="text">${esc(p.text)}</p>
    <p class="more"><a class="btn btn-text" href="${p.href}">${esc(p.cta)}${arrow}</a></p>
  </article>`,
  )
  .join('\n')}
</div>`;
}

export function serviceBlocks(services) {
  return `<div class="services">
${services
  .map(
    (s) => `  <article class="service">
    <div class="service-head"><span class="letter" aria-hidden="true">${esc(s.letter)}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></div>
    <ul class="ticks">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  </article>`,
  )
  .join('\n')}
</div>`;
}

export const nameList = (items, cls = '') =>
  `<dl class="name-list ${cls}">${items.map((i) => `<div><dt>${esc(i.name || i.title)}</dt><dd>${esc(i.text || i.need)}</dd></div>`).join('')}</dl>`;

export const sourceNote = (data) =>
  `Snapshot of ${esc(data.updatedLabel)}. Source: <a href="https://funding.tech.eu" target="_blank" rel="noopener">Tech.eu Funding Explorer</a> (CC BY 4.0) plus the daily multi-source scan. Publicly announced rounds; undisclosed amounts are left out, not estimated.`;

// ---------- data graphics (drawn at build time from the live dataset) ----------

// Europe with one circle per country, sized by disclosed funding in the current year.
export function heroMap(data) {
  const { map, bubbles, labels, arcs, year } = data.hero;
  const paths = map.countries.map((c) => `<path class="${c.in ? 'in' : 'out'}" d="${c.d}"/>`).join('');
  const arcEls = arcs.map((a, i) => `<path class="arc" style="animation-delay:${-i * 1.3}s" d="${a}"/>`).join('');
  const circles = bubbles.map((b) => `<circle class="bub" cx="${b.x}" cy="${b.y}" r="${b.r}"/>`).join('');
  const cores = labels.map((b) => `<circle class="core" cx="${b.x}" cy="${b.y}" r="4"/>`).join('');
  const texts = labels
    .map((b) => `<g class="lab" transform="translate(${b.lx} ${b.ly})"><text class="n" text-anchor="${b.anchor}">${esc(b.name)}</text><text class="v" y="17" text-anchor="${b.anchor}">${esc(eur(b.value))}</text></g>`)
    .join('');
  return `<figure class="hero-map">
  <svg viewBox="${map.viewBox}" role="img" aria-label="Map of Europe. Circles show disclosed startup funding by country in ${year} to date. Largest: ${esc(labels.map((l) => `${l.name} ${eur(l.value)}`).join(', '))}.">
    <g class="land">${paths}</g>
    <g class="arcs" aria-hidden="true">${arcEls}</g>
    <g>${circles}</g>
    <g>${cores}</g>
    <g>${texts}</g>
  </svg>
  <figcaption>Disclosed startup funding by country, ${year} to date. Circle area is proportional to the amount. Connecting lines are decorative. ${sourceNote(data)}</figcaption>
</figure>`;
}

function yearChart(data) {
  const W = 560, H = 250, padL = 8, padR = 8, top = 28, base = H - 30;
  const max = Math.max(...data.years.map((y) => y.total));
  const slot = (W - padL - padR) / data.years.length;
  const bw = Math.min(56, slot * 0.6);
  const sc = (v) => (v / max) * (base - top);
  const bars = data.years
    .map((y, i) => {
      const x = padL + slot * i + (slot - bw) / 2;
      let yy = base;
      const seg = ['equity', 'debt', 'grant']
        .map((k) => {
          const h = sc(y[k]);
          yy -= h;
          return h > 0.4 ? `<rect class="k-${k}" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"/>` : '';
        })
        .join('');
      const cx = (x + bw / 2).toFixed(1);
      return `${seg}<text class="val" x="${cx}" y="${(yy - 8).toFixed(1)}" text-anchor="middle">${eur(y.total)}</text><text class="tick" x="${cx}" y="${base + 20}" text-anchor="middle">${y.year}${y.ytd ? ' YTD' : ''}</text>`;
    })
    .join('');
  const label = data.years.map((y) => `${y.year}${y.ytd ? ' to date' : ''}: ${eur(y.total)}`).join('; ');
  return `<svg class="chart-years" viewBox="0 0 ${W} ${H}" role="img" aria-label="Disclosed funding by year. ${esc(label)}."><line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}

const rank = (rows) => {
  const max = rows[0].value;
  return `<ol class="rank">${rows
    .map((r) => `<li><span class="rk-n">${esc(r.name)}</span><span class="rk-bar"><i style="width:${((r.value / max) * 100).toFixed(1)}%"></i></span><span class="rk-v">${eur(r.value)}</span></li>`)
    .join('')}</ol>`;
};

export function terminal(data, policySample) {
  const t = data.current;
  const chips = ['Period', `${t.year} to date`, 'Country', 'All Europe', 'Sector', 'All sectors'];
  const chipEls = [0, 2, 4].map((i) => `<span class="chip"><em>${chips[i]}</em>${chips[i + 1]}</span>`).join('');
  return `<div class="terminal">
  <div class="term-bar"><div class="term-title">${symbol({ size: 22 })}<span>Funding dashboard</span><span class="status status-live">Live data</span></div><div class="chips" aria-label="Preview filters">${chipEls}</div></div>
  <div class="tiles">
    <div class="tile"><h3>Disclosed funding, ${t.year} to date</h3><p class="big">${eur(t.total)}</p><p class="chg">${int(t.rounds)} announced rounds</p></div>
    <div class="tile"><h3>Equity</h3><p class="big">${eur(t.equity)}</p><p class="chg">${Math.round((t.equity / t.total) * 100)}% of disclosed funding</p></div>
    <div class="tile"><h3>Debt and grants</h3><p class="big">${eur(t.debt + t.grant)}</p><p class="chg">Debt ${eur(t.debt)}, grants ${eur(t.grant)}</p></div>
    <div class="tile"><h3>Rounds tracked since 2021</h3><p class="big">${int(data.totalRounds)}</p><p class="chg">Updated twice a day</p></div>
  </div>
  <div class="term-grid">
    <section class="panel wide"><h3>Funding by year and instrument</h3><p class="legend"><span class="k-equity">Equity</span><span class="k-debt">Debt</span><span class="k-grant">Grants</span></p>${yearChart(data)}</section>
    <section class="panel"><h3>Top countries, ${t.year} to date</h3>${rank(data.topCountries)}</section>
    <section class="panel"><h3>Top sectors, ${t.year} to date</h3>${rank(data.topSectors)}<p class="note">A round tagged with two sectors counts toward both.</p></section>
    <section class="panel sample"><h3>${esc(policySample.title)}</h3><p class="status status-dev">${esc(policySample.tag)}</p><dl>${policySample.fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.text)}</dd></div>`).join('')}</dl></section>
  </div>
  <p class="term-foot">${sourceNote(data)}</p>
</div>`;
}

// A roundtable: the moderator and the stakeholders a conversation brings together.
export function roundtable() {
  const seats = ['Moderator', 'Investor', 'Founder', 'Corporate', 'Institution', 'Researcher'];
  const cx = 230, cy = 190, r = 118;
  const pts = seats.map((s, i) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return { s, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), lx: cx + (r + 34) * Math.cos(a), ly: cy + (r + 34) * Math.sin(a), a };
  });
  const lines = pts.slice(1).map((p) => `<line class="link" x1="${pts[0].x.toFixed(1)}" y1="${pts[0].y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`).join('');
  const cross = [[1, 3], [2, 4], [3, 5], [1, 4], [2, 5]].map(([a, b]) => `<line class="link faint" x1="${pts[a].x.toFixed(1)}" y1="${pts[a].y.toFixed(1)}" x2="${pts[b].x.toFixed(1)}" y2="${pts[b].y.toFixed(1)}"/>`).join('');
  const nodes = pts
    .map((p, i) => {
      const anchor = Math.abs(Math.cos(p.a)) < 0.3 ? 'middle' : Math.cos(p.a) > 0 ? 'start' : 'end';
      const dy = Math.abs(Math.cos(p.a)) < 0.3 ? (Math.sin(p.a) < 0 ? -2 : 12) : 5;
      return `<circle class="${i === 0 ? 'seat mod' : 'seat'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 ? 13 : 10}"/><text x="${p.lx.toFixed(1)}" y="${(p.ly + dy).toFixed(1)}" text-anchor="${anchor}"${i === 0 ? ' class="mod"' : ''}>${p.s}</text>`;
    })
    .join('');
  return `<figure class="roundtable"><svg viewBox="0 0 460 380" role="img" aria-label="A roundtable: a moderator connecting an investor, a founder, a corporate, an institution and a researcher around one question."><circle class="table" cx="${cx}" cy="${cy}" r="${r}"/>${cross}${lines}<circle class="q" cx="${cx}" cy="${cy}" r="9"/><text class="qt" x="${cx}" y="${cy + 30}" text-anchor="middle">One question that matters</text>${nodes}</svg><figcaption>A conversation is designed from the question outwards: who has a stake in it, and what each of them knows that the others do not.</figcaption></figure>`;
}
