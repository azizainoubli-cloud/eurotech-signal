/* EuroTech Signals — public site logic. Reads the daily snapshot in /data and draws everything client-side. */
(() => {
  const SCOPE = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Norway','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','Switzerland','UK'];
  const STAGES = ['Pre-Seed','Seed','Early VC','Series A','Series B','Series C','Series D+','Growth/Late','Debt','Grant','Crowdfunding','ICO','Other'];
  const $ = (id) => document.getElementById(id);
  const inScope = (c) => SCOPE.includes(c);
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const eur = (v) => v == null || isNaN(v) ? '—' : '€' + compact.format(v);
  const int = (v) => v == null || isNaN(v) ? '—' : d3.format(',')(v);
  const pct = (v) => v == null || isNaN(v) ? '—' : d3.format('.1%')(v);
  const pct0 = (v) => v == null || isNaN(v) ? '—' : d3.format('.0%')(v);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const colors = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(css);
  const stageLabel = (s) => s === 'Other' ? 'Not specified' : s;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- state ----------
  const yearCache = new Map();
  let meta = null, cube = null, ann = [];
  const state = { year: null, country: '', sector: '', min: 0, stage: '', q: '', sort: 'date', dir: -1, shown: 150 };
  const readHash = () => { const h = new URLSearchParams(location.hash.slice(1)); return { year: h.get('year'), country: h.get('country') || '', sector: h.get('sector') || '' }; };
  const writeHash = () => { const p = new URLSearchParams(); p.set('year', state.year); if (state.country) p.set('country', state.country); if (state.sector) p.set('sector', state.sector); history.replaceState(null, '', '#' + p.toString()); };

  const loadJSON = (f) => fetch(`data/${f}`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  async function loadYear(y) {
    if (yearCache.has(y)) return yearCache.get(y);
    const p = loadJSON(`rounds-${y}.json`).then((j) => j.rows.map((r) => ({ id: r[0], date: r[1], company: r[2], company_id: r[3] || r[0], country: r[4], city: r[5],
      sectors: r[6] ? r[6].split('|') : [], stage: r[7] || 'Other', amount: r[8], investors: r[9] ? r[9].split('|') : [], url: r[10], source: r[11] })))
      .catch(() => []);
    yearCache.set(y, p); return p;
  }

  // ---------- selections ----------
  const filt = (rows) => rows.filter((r) => (!state.country || r.country === state.country) && (!state.sector || r.sectors.includes(state.sector)));
  const sum = (rows) => {
    const amt = (r) => r.amount || 0;
    const total = d3.sum(rows, amt), debt = d3.sum(rows.filter((r) => r.stage === 'Debt'), amt), grant = d3.sum(rows.filter((r) => r.stage === 'Grant'), amt);
    const priced = rows.filter((r) => r.amount > 0);
    return { total, equity: total - debt - grant, debt, grant, rounds: rows.length, companies: new Set(rows.map((r) => r.company_id)).size,
      median: priced.length ? d3.median(priced, amt) : null, priced: priced.length };
  };
  const ytdCut = (y) => { const now = new Date(); return Number(y) === now.getUTCFullYear() ? now.toISOString().slice(5, 10) : null; };

  // ---------- tooltip ----------
  const tip = $('tip');
  const showTip = (ev, lines) => {
    tip.replaceChildren(...lines.map((l) => el('div', null, l))); tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };

  // ---------- ranked list ----------
  function rank(box, rows, color, opts = {}) {
    box.replaceChildren();
    if (!rows.length) { box.append(el('div', 'empty', 'Nothing in this selection.')); return; }
    const max = d3.max(rows, (r) => r.value) || 1;
    rows.forEach((r, i) => {
      const row = el('div', 'rrow' + (r.onClick ? ' click' : ''));
      row.append(el('span', 'n', `${i + 1}.`), el('span', 'l', r.label), el('span', 'v', r.valueText), el('span', 's', r.sub || ''));
      const tr = el('div', 'track'); const f = el('div', 'fill'); f.style.width = Math.max(1, 100 * r.value / max) + '%'; f.style.background = r.muted ? css('--c6') : color; tr.append(f); row.append(tr);
      if (r.label && r.muted) row.querySelector('.l').style.color = css('--muted');
      if (r.tip) { row.addEventListener('mousemove', (ev) => showTip(ev, r.tip)); row.addEventListener('mouseleave', hideTip); }
      if (r.onClick) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('click', r.onClick); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.onClick(); }); }
      box.append(row);
    });
  }

  // ---------- vertical bars (stacked) ----------
  function vbars(box, groups, names, opts = {}) {
    box.replaceChildren();
    if (!groups.length) { box.append(el('div', 'empty', 'Nothing in this selection.')); return; }
    const W = Math.max(300, box.clientWidth), H = 280, m = { t: 20, r: 6, b: 26, l: 8 };
    const cs = colors();
    const ymax = d3.max(groups, (g) => d3.sum(g.vals)) || 1;
    const y = d3.scaleLinear([0, ymax * 1.1], [H - m.b, m.t]).nice(); const ticks = y.ticks(4);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opts.label || 'Chart');
    const pr = svg.append('g').attr('font-size', 11); let tw = 0; ticks.forEach((t) => { const n = pr.append('text').text(eur(t)); tw = Math.max(tw, n.node().getComputedTextLength()); n.remove(); }); pr.remove();
    m.l = tw + 10;
    const x = d3.scaleBand(groups.map((g) => g.k), [m.l, W - m.r]).padding(0.28);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--line'));
    svg.append('g').attr('font-size', 11).attr('fill', css('--muted')).selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '.35em').attr('text-anchor', 'end').text(eur);
    const showTot = x.bandwidth() > 36;
    groups.forEach((g) => {
      const gg = svg.append('g').style('cursor', opts.onClick ? 'pointer' : null)
        .on('mousemove', (ev) => showTip(ev, g.tip)).on('mouseleave', hideTip).on('click', () => opts.onClick && opts.onClick(g));
      gg.append('rect').attr('x', x(g.k)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent');
      let base = 0;
      g.vals.forEach((v, i) => { gg.append('rect').attr('x', x(g.k)).attr('width', x.bandwidth()).attr('y', y(base + v)).attr('height', Math.max(0, y(base) - y(base + v))).attr('fill', cs[i]).attr('opacity', g.dim ? 0.45 : 1); base += v; });
      if (showTot) gg.append('text').attr('x', x(g.k) + x.bandwidth() / 2).attr('y', y(base) - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--fg')).text(eur(base));
    });
    const every = Math.ceil(groups.length / Math.max(1, Math.floor((W - m.l) / 56)));
    svg.append('g').attr('font-size', 11).selectAll('text').data(groups.filter((_, i) => i % every === 0)).join('text')
      .attr('x', (g) => x(g.k) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').attr('fill', (g) => g.dim ? css('--muted') : css('--fg')).attr('font-weight', (g) => g.bold ? 700 : 400).text((g) => g.label || g.k);
  }

  // ---------- map ----------
  let mapPaths = null;
  function drawMap(rows) {
    const box = $('map'); const M = window.EF_MAP;
    if (!mapPaths) {
      const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${M.w} ${M.h}`).attr('role', 'img').attr('aria-label', 'Map of Europe shaded by disclosed startup funding');
      mapPaths = svg.append('g').selectAll('path').data(M.c).join('path').attr('d', (c) => c.d);
    }
    const base = rows.filter((r) => !state.sector || r.sectors.includes(state.sector));
    const all = d3.sum(base, (r) => r.amount || 0);
    const by = new Map(d3.rollups(base, (v) => {
      const s = sum(v); const big = v.filter((r) => r.amount).sort((a, b) => b.amount - a.amount)[0];
      const sec = d3.rollups(v.flatMap((r) => r.sectors.map((x) => [x, r.amount || 0])), (a) => d3.sum(a, (z) => z[1]), (z) => z[0]).sort((a, b) => b[1] - a[1])[0];
      return { ...s, big, sec };
    }, (r) => r.country));
    const ranked = [...by].filter(([c]) => inScope(c)).sort((a, b) => b[1].total - a[1].total).map(([c], i) => [c, i + 1]);
    const rk = new Map(ranked);
    const vals = [...by].filter(([c, v]) => inScope(c) && v.total > 0).map(([, v]) => v.total);
    const lo = d3.min(vals) || 1, hi = d3.max(vals) || 2;
    const t = d3.scaleLog([Math.max(1, lo), Math.max(2, hi)], [0.12, 1]).clamp(true);
    const ramp = d3.interpolateRgb(css('--soft'), css('--c1'));
    mapPaths.attr('class', (c) => (inScope(c.n) ? 'in' : '') + (c.n === state.country ? ' sel' : ''))
      .attr('fill', (c) => !inScope(c.n) ? css('--line') : (by.get(c.n) && by.get(c.n).total > 0 ? ramp(t(by.get(c.n).total)) : css('--bg')))
      .on('mousemove', (ev, c) => {
        if (!inScope(c.n)) return showTip(ev, [c.n, 'Outside the EuroTech Signals scope']);
        const v = by.get(c.n);
        if (!v) return showTip(ev, [`${c.n} · ${state.year}`, 'No rounds on record']);
        showTip(ev, [`${c.n} · ${state.year}${state.sector ? ' · ' + state.sector : ''}`, `#${rk.get(c.n)} in Europe · ${eur(v.total)} (${pct(all ? v.total / all : null)})`,
          `Rounds: ${int(v.rounds)} · companies: ${int(v.companies)}`, `Equity ${eur(v.equity)} · debt ${eur(v.debt)}`, `Median round: ${eur(v.median)}`,
          `Top sector: ${v.sec ? `${v.sec[0]} (${eur(v.sec[1])})` : '—'}`, `Largest: ${v.big ? `${v.big.company}, ${eur(v.big.amount)}` : '—'}`, 'Click to filter']);
      })
      .on('mouseleave', hideTip)
      .on('click', (ev, c) => { if (inScope(c.n)) { hideTip(); setState({ country: c.n === state.country ? '' : c.n }); } });
    const lg = $('mapLegend'); lg.replaceChildren();
    const bar = el('span', 'ramp'); bar.style.background = `linear-gradient(90deg, ${d3.range(0, 1.01, 0.2).map((u) => ramp(0.12 + 0.88 * u)).join(', ')})`;
    const out = el('span'); out.append(el('span', 'sw'), 'Outside scope');
    lg.append(el('span', null, eur(lo)), bar, el('span', null, eur(hi)), out);
  }

  // ---------- renderers ----------
  function tile(title, value, chg, prevLabel) {
    const t = el('div', 'tile'); t.append(el('h3', null, title), el('div', 'big', value));
    const c = el('div', 'chg');
    if (chg != null && isFinite(chg)) { c.textContent = `${chg >= 0 ? '+' : '−'}${d3.format('.1%')(Math.abs(chg))} vs ${prevLabel}`; c.classList.add(chg > 0.0005 ? 'up' : chg < -0.0005 ? 'down' : 'x'); }
    else c.textContent = prevLabel ? `vs ${prevLabel}: —` : '';
    t.append(c); return t;
  }

  function renderTiles(cur, prev, yearRows, isYtd) {
    const pl = `${Number(state.year) - 1}${isYtd ? ' same period' : ''}`;
    const ch = (a, b) => b ? a / b - 1 : null;
    const box = $('tiles'); box.replaceChildren(
      tile('Total disclosed funding', eur(cur.total), ch(cur.total, prev.total), pl),
      tile('Equity raised', eur(cur.equity), ch(cur.equity, prev.equity), pl),
      tile('Funding rounds', int(cur.rounds), ch(cur.rounds, prev.rounds), pl),
      tile('Companies funded', int(cur.companies), ch(cur.companies, prev.companies), pl),
      tile('Median disclosed round', eur(cur.median), ch(cur.median, prev.median), pl)
    );
    const scopeAll = sum(yearRows.filter((r) => inScope(r.country)));
    if (state.country || state.sector) box.append(tile('Share of European funding', pct(scopeAll.total ? cur.total / scopeAll.total : null), null, ''));
  }

  function renderLead(cur, prev, isYtd) {
    const where = [state.country, state.sector].filter(Boolean).join(' ');
    const lead = $('lead'); lead.replaceChildren();
    const chg = prev.total ? cur.total / prev.total - 1 : null;
    lead.append(`In ${state.year}${isYtd ? ' so far' : ''}, ${where ? where + ' startups' : 'European startups'} raised `, el('b', null, eur(cur.total)), ` across `, el('b', null, int(cur.rounds)), ' disclosed rounds',
      chg != null ? `, ${chg >= 0 ? 'up' : 'down'} ${pct0(Math.abs(chg))} on ${Number(state.year) - 1}${isYtd ? ' at the same point' : ''}.` : '.');
  }

  function renderSignals(rows) {
    const s = sum(rows); const ul = $('signals'); ul.replaceChildren();
    $('signalsNote').textContent = `${state.country || 'Europe'}${state.sector ? ' · ' + state.sector : ''} · ${state.year}`;
    if (!rows.length) { ul.append(el('li', null, 'No rounds on record for this selection.')); return; }
    const priced = rows.filter((r) => r.amount).sort((a, b) => b.amount - a.amount);
    const named = rows.filter((r) => !['Other', 'Debt', 'Grant', 'Crowdfunding', 'ICO'].includes(r.stage));
    const early = named.filter((r) => ['Pre-Seed', 'Seed'].includes(r.stage)).length, late = named.filter((r) => ['Series B', 'Series C', 'Series D+', 'Growth/Late'].includes(r.stage)).length;
    const li = (...parts) => { const l = el('li'); parts.forEach((p) => l.append(typeof p === 'string' ? p : p)); ul.append(l); };
    if (priced[0]) li('Largest round: ', el('b', null, priced[0].company), ` (${priced[0].country}), ${eur(priced[0].amount)}${priced[0].stage !== 'Other' ? ' ' + priced[0].stage : ''}.`);
    li('The 10 largest rounds took ', el('b', null, pct0(s.total ? d3.sum(priced.slice(0, 10), (r) => r.amount) / s.total : null)), ' of the money.');
    if (named.length) li(el('b', null, pct0(early / named.length)), ' of rounds with a named stage were pre-seed or seed; ', el('b', null, pct0(late / named.length)), ' were Series B or later.');
    li('Debt made up ', el('b', null, pct0(s.total ? s.debt / s.total : null)), ' of the money raised.');
    li(el('b', null, int(rows.length - s.priced)), ' rounds did not disclose an amount and are not in the totals.');
  }

  function renderTrend() {
    const box = $('trend'), leg = $('trendLegend'); leg.replaceChildren();
    const cs = colors(); ['Equity', 'Debt', 'Grant'].forEach((n, i) => { const s = el('span', null, n); s.style.setProperty('--sw', cs[i]); leg.append(s); });
    $('trendTitle').textContent = `Funding by year and instrument${state.country || state.sector ? ' · ' + [state.country, state.sector].filter(Boolean).join(' · ') : ''}`;
    if (!cube) { box.replaceChildren(el('div', 'empty', 'Trend data is not available.')); return; }
    const c = state.country || '*', s = state.sector || '*';
    const rows = cube.filter((r) => r[1] === c && r[2] === s && (c !== '*' || true));
    const years = [...new Set(cube.map((r) => r[0]))].sort();
    const thisY = new Date().getUTCFullYear();
    // all-Europe '*' rows include out-of-scope countries; keep them (Tech.eu definition minus Israel), note in footer
    const groups = years.map((y) => {
      const get = (k) => { const r = rows.find((q) => q[0] === y && q[3] === k); return r ? r[4] : 0; };
      const cnt = d3.sum(rows.filter((q) => q[0] === y), (q) => q[5]);
      const vals = [get('equity'), get('debt'), get('grant')];
      return { k: String(y), label: y === thisY ? `${y} YTD` : String(y), vals, dim: String(y) !== String(state.year), bold: String(y) === String(state.year),
        tip: [`${y}${y === thisY ? ' (year to date)' : ''}`, `Equity: ${eur(vals[0])}`, `Debt: ${eur(vals[1])}`, `Grants: ${eur(vals[2])}`, `Rounds: ${int(cnt)}`, 'Click to select'] };
    });
    vbars(box, groups, ['Equity', 'Debt', 'Grant'], { label: 'Funding by year', onClick: (g) => setState({ year: g.k }) });
  }

  function renderBreakdowns(rows, yearRows) {
    const total = d3.sum(rows, (r) => r.amount || 0);
    // countries (hidden when a country is picked)
    $('byCountryCard').hidden = !!state.country;
    if (!state.country) {
      const base = yearRows.filter((r) => !state.sector || r.sectors.includes(state.sector));
      const all = d3.sum(base, (r) => r.amount || 0);
      const cs = d3.rollups(base, (v) => ({ e: d3.sum(v, (r) => r.amount || 0), n: v.length }), (r) => r.country).filter(([c]) => inScope(c)).sort((a, b) => b[1].e - a[1].e).slice(0, 10);
      rank($('byCountry'), cs.map(([c, o]) => ({ label: c, value: o.e, valueText: eur(o.e), sub: pct(all ? o.e / all : null), tip: [c, `Raised: ${eur(o.e)}`, `Rounds: ${int(o.n)}`, 'Click to filter'], onClick: () => setState({ country: c }) })), css('--c1'));
    }
    const ss = d3.rollups(rows.flatMap((r) => (r.sectors.length ? r.sectors : ['Unclassified']).map((s) => [s, r.amount || 0])), (v) => ({ e: d3.sum(v, (z) => z[1]), n: v.length }), (z) => z[0]).sort((a, b) => b[1].e - a[1].e).slice(0, 10);
    rank($('bySector'), ss.map(([s, o]) => ({ label: s, value: o.e, valueText: eur(o.e), sub: pct(total ? o.e / total : null), tip: [s, `Raised: ${eur(o.e)}`, `Rounds: ${int(o.n)}`, 'Click to filter'], onClick: s === 'Unclassified' ? null : () => setState({ sector: s === state.sector ? '' : s }) })), css('--c4'));
    const st = d3.rollups(rows, (v) => ({ e: d3.sum(v, (r) => r.amount || 0), n: v.length }), (r) => r.stage).sort((a, b) => STAGES.indexOf(a[0]) - STAGES.indexOf(b[0]));
    rank($('byStage'), st.map(([s, o]) => ({ label: stageLabel(s), value: o.e, valueText: eur(o.e), sub: `${int(o.n)} rounds`, muted: s === 'Other', tip: [stageLabel(s), `Raised: ${eur(o.e)}`, `Rounds: ${int(o.n)}`] })), css('--c2'));
    // months
    const fm = d3.utcFormat('%b');
    const ms = d3.rollups(rows, (v) => ({ e: d3.sum(v, (r) => r.amount || 0), n: v.length }), (r) => r.date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0]));
    vbars($('months'), ms.map(([m, o]) => { const d = new Date(m + '-01T00:00:00Z'); return { k: m, label: fm(d), vals: [o.e], tip: [d3.utcFormat('%B %Y')(d), `Raised: ${eur(o.e)}`, `Rounds: ${int(o.n)}`] }; }), ['Raised'], { label: 'Funding by month' });
    // investors
    const inv = d3.rollups(rows.flatMap((r) => r.investors.filter((x) => x && !/^(undisclosed|existing (investors|shareholders)|angels?|new investors|business angels)$/i.test(x.trim())).map((x) => [x.trim(), r.amount || 0])),
      (v) => ({ n: v.length, e: d3.sum(v, (z) => z[1]) }), (z) => z[0]).sort((a, b) => b[1].n - a[1].n || b[1].e - a[1].e).slice(0, 12);
    rank($('investors'), inv.map(([i, o]) => ({ label: i, value: o.n, valueText: `${int(o.n)} deals`, sub: eur(o.e), tip: [i, `Rounds: ${int(o.n)}`, `Combined round size: ${eur(o.e)}`, 'Click to see their deals'], onClick: () => { state.q = i; $('fQ').value = i; renderRounds(); $('roundsTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); } })), css('--c3'));
  }

  let curRows = [];
  function renderRounds() {
    const q = state.q.toLowerCase();
    let rows = curRows.filter((r) => (!state.min || (r.amount || 0) >= state.min) && (!state.stage || r.stage === state.stage) && (!q || r.company.toLowerCase().includes(q) || r.investors.join(' ').toLowerCase().includes(q)));
    const k = state.sort, d = state.dir;
    rows = rows.slice().sort((a, b) => k === 'amount' ? d * ((a.amount || 0) - (b.amount || 0)) : d * String(a[k] ?? '').localeCompare(String(b[k] ?? '')));
    $('roundsNote').textContent = `${int(rows.length)} rounds in this selection, newest first. Click a company for its Tech.eu page and source.`;
    const t = $('roundsTable'); t.replaceChildren();
    const cols = [['date', 'Date'], ['company', 'Company'], ['country', 'Country'], ['sectors', 'Sector', 'hide-sm'], ['stage', 'Stage'], ['amount', 'Amount', 'num'], ['investors', 'Investors', 'hide-sm'], ['source', 'Source', 'hide-sm']];
    const hr = t.createTHead().insertRow();
    cols.forEach(([key, label, cls]) => { const th = document.createElement('th'); if (cls) th.className = cls; const b = el('button', null, label); b.type = 'button';
      th.setAttribute('aria-sort', state.sort === key ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
      b.onclick = () => { state.dir = state.sort === key ? -state.dir : (key === 'amount' || key === 'date' ? -1 : 1); state.sort = key; renderRounds(); }; th.append(b); hr.append(th); });
    const tb = t.createTBody(); const fmtD = d3.utcFormat('%-d %b %Y');
    rows.slice(0, state.shown).forEach((r) => {
      const tr = tb.insertRow();
      const td = (text, cls) => { const c = tr.insertCell(); if (cls) c.className = cls; c.textContent = text; return c; };
      td(fmtD(new Date(r.date + 'T00:00:00Z')));
      const c = tr.insertCell(); if (r.url) { const a = el('a', null, r.company); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; c.append(a); } else c.textContent = r.company;
      td(r.country); td(r.sectors.join(', '), 'hide-sm'); td(stageLabel(r.stage)); td(r.amount ? eur(r.amount) : 'Undisclosed', 'num'); td(r.investors.slice(0, 6).join(', ') || '—', 'dim hide-sm'); td(r.source || '—', 'hide-sm');
    });
    $('more').hidden = rows.length <= state.shown;
  }

  function renderAnnouncements() {
    const rows = ann.filter((r) => r.country !== 'Israel' && (!state.country || r.country === state.country) && (!state.sector || String(r.sector || '').split(', ').includes(state.sector)));
    $('annCard').hidden = !ann.length;
    const t = $('annTable'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    [['Announced'], ['Company'], ['Country'], ['Sector', 'hide-sm'], ['Stage'], ['Amount', 'num'], ['Sources', 'num'], ['Main source']].forEach(([l, c]) => { const th = document.createElement('th'); if (c) th.className = c; th.append(el('button', null, l)); hr.append(th); });
    const tb = t.createTBody(); const fmtD = d3.utcFormat('%-d %b %Y');
    if (!rows.length) { const tr = tb.insertRow(); const c = tr.insertCell(); c.colSpan = 8; c.className = 'dim'; c.textContent = 'No announcements for this selection in the last 60 days.'; }
    rows.slice(0, 60).forEach((r) => {
      const tr = tb.insertRow(); const td = (text, cls) => { const c = tr.insertCell(); if (cls) c.className = cls; c.textContent = text; return c; };
      td(r.date ? fmtD(new Date(r.date + 'T00:00:00Z')) : ''); td(r.company || ''); td(r.country || ''); td(r.sector || '', 'hide-sm'); td(r.stage || 'Not specified');
      td(Number(r.amount_eur) > 0 ? eur(Number(r.amount_eur)) : (r.currency_amount || 'Undisclosed'), 'num'); td(String(Number(r.n_sources) || 1), 'num');
      const c = tr.insertCell(); if (r.source_url && /^https:\/\//.test(r.source_url)) { const a = el('a', null, r.source || 'Source'); a.href = r.source_url; a.target = '_blank'; a.rel = 'noopener'; c.append(a); } else c.textContent = r.source || '';
    });
  }

  // ---------- funds currently investing ----------
  let invTypes = null; // { name -> type } from Tech.eu's investor directory
  const GENERIC = /^(undisclosed|existing (investors|shareholders)|angels?|business angels|new investors|private investors|family offices?|others?|various)$/i;
  const astate = { type: '', stage: '', win: 365, q: '', sort: 'deals', dir: -1, shown: 100 };
  let activeAll = [];
  async function buildActive() {
    const thisY = new Date().getUTCFullYear();
    const [a, b] = await Promise.all([loadYear(String(thisY)), loadYear(String(thisY - 1))]);
    const today = new Date();
    const cut = (days) => new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
    const since = cut(astate.win), hot = cut(90);
    const rows = filt([...a, ...b]).filter((r) => r.date >= since && r.date <= today.toISOString().slice(0, 10));
    const by = new Map();
    for (const r of rows) for (let name of r.investors) {
      name = name.trim(); if (!name || GENERIC.test(name)) continue;
      let o = by.get(name); if (!o) { o = { name, deals: 0, eur: 0, sizes: [], companies: new Set(), stages: new Map(), sectors: new Map(), countries: new Map(), last: null, recent: 0 }; by.set(name, o); }
      o.deals++; o.companies.add(r.company_id); if (r.amount) { o.eur += r.amount; o.sizes.push(r.amount); }
      o.stages.set(r.stage, (o.stages.get(r.stage) || 0) + 1);
      r.sectors.forEach((s) => o.sectors.set(s, (o.sectors.get(s) || 0) + 1));
      o.countries.set(r.country, (o.countries.get(r.country) || 0) + 1);
      if (!o.last || r.date > o.last.date) o.last = r;
      if (r.date >= hot) o.recent++;
    }
    const top = (m, n) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map((x) => x[0]);
    activeAll = [...by.values()].map((o) => ({
      name: o.name, type: (invTypes && invTypes[o.name.toLowerCase()]) || 'Not classified', deals: o.deals, companies: o.companies.size, eur: o.eur,
      median: o.sizes.length ? d3.median(o.sizes) : null, stages: top([...o.stages].filter(([s]) => s !== 'Other'), 2).map(stageLabel), stageKeys: [...o.stages.keys()],
      sectors: top(o.sectors, 2), countries: top(o.countries, 3), last: o.last, recent: o.recent
    }));
  }
  function renderActive() {
    const q = astate.q.toLowerCase();
    let rows = activeAll.filter((o) => (!astate.type || o.type === astate.type) && (!astate.stage || o.stageKeys.includes(astate.stage)) && (!q || o.name.toLowerCase().includes(q)));
    const k = astate.sort, d = astate.dir;
    const val = (o) => k === 'last' ? o.last.date : k === 'name' || k === 'type' ? o[k] : o[k] ?? -1;
    rows = rows.slice().sort((x, y) => { const a = val(x), b = val(y); return typeof a === 'string' ? d * a.localeCompare(b) : d * (a - b); });
    const where = [state.country, state.sector].filter(Boolean).join(' · ');
    $('activeNote').textContent = `Investors with at least one disclosed deal in the ${astate.win === 365 ? 'last 12 months' : astate.win === 180 ? 'last 6 months' : 'last 90 days'}${where ? ' in ' + where : ' in Europe'}. "Hot" means 2 or more deals in the last 90 days.`;
    const all = activeAll, vc = all.filter((o) => /venture|investment firm/i.test(o.type)).length;
    $('activeTiles').replaceChildren(
      tile('Active funds and investors', int(all.length), null, ''),
      tile('Hot in the last 90 days', int(all.filter((o) => o.recent >= 2).length), null, ''),
      tile('Backed 5+ companies', int(all.filter((o) => o.companies >= 5).length), null, ''),
      tile('VCs and investment firms', int(vc), null, '')
    );
    // filter options
    const types = [...new Set(all.map((o) => o.type))].sort((a, b) => a.localeCompare(b));
    fillSelect($('aType'), types, 'All types', astate.type);
    fillSelect($('aStage'), STAGES.filter((s) => s !== 'Other' && all.some((o) => o.stageKeys.includes(s))), 'All stages', astate.stage, stageLabel);
    const t = $('activeTable'); t.replaceChildren();
    const cols = [['name', 'Investor'], ['type', 'Type', 'hide-sm'], ['deals', 'Deals', 'num'], ['companies', 'Companies', 'num hide-sm'], ['median', 'Typical round', 'num'], ['stages', 'Stage focus', 'hide-sm'], ['sectors', 'Sector focus', 'hide-sm'], ['countries', 'Where', 'hide-sm'], ['last', 'Latest deal']];
    const hr = t.createTHead().insertRow();
    cols.forEach(([key, label, cls]) => { const th = document.createElement('th'); if (cls) th.className = cls; const b = el('button', null, label); b.type = 'button';
      const sortable = !['stages', 'sectors', 'countries'].includes(key);
      th.setAttribute('aria-sort', astate.sort === key ? (astate.dir > 0 ? 'ascending' : 'descending') : 'none');
      if (sortable) b.onclick = () => { astate.dir = astate.sort === key ? -astate.dir : (key === 'name' || key === 'type' ? 1 : -1); astate.sort = key; renderActive(); };
      th.append(b); hr.append(th); });
    const tb = t.createTBody(); const fmtD = d3.utcFormat('%-d %b %Y');
    if (!rows.length) { const tr = tb.insertRow(); const c = tr.insertCell(); c.colSpan = cols.length; c.className = 'dim'; c.textContent = 'No investors match these filters.'; }
    rows.slice(0, astate.shown).forEach((o) => {
      const tr = tb.insertRow(); const td = (text, cls) => { const c = tr.insertCell(); if (cls) c.className = cls; c.textContent = text; return c; };
      const n = tr.insertCell(); n.append(o.name); if (o.recent >= 2) { n.append(' '); n.append(el('span', 'pill hot', 'Hot')); }
      td(o.type, 'hide-sm'); td(int(o.deals), 'num'); td(int(o.companies), 'num hide-sm'); td(eur(o.median), 'num');
      td(o.stages.join(', ') || '—', 'focus hide-sm'); td(o.sectors.join(', ') || '—', 'focus hide-sm'); td(o.countries.join(', '), 'focus hide-sm');
      const l = tr.insertCell(); const r = o.last;
      if (r.url) { const a = el('a', null, r.company); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; l.append(a); } else l.append(r.company);
      l.append(el('div', 'dim', `${fmtD(new Date(r.date + 'T00:00:00Z'))}${r.amount ? ' · ' + eur(r.amount) : ''}`));
    });
    $('aMore').hidden = rows.length <= astate.shown;
  }
  $('aType').addEventListener('change', (e) => { astate.type = e.target.value; astate.shown = 100; renderActive(); });
  $('aStage').addEventListener('change', (e) => { astate.stage = e.target.value; astate.shown = 100; renderActive(); });
  $('aWin').addEventListener('change', async (e) => { astate.win = Number(e.target.value); astate.shown = 100; await buildActive(); renderActive(); });
  $('aQ').addEventListener('input', (e) => { astate.q = e.target.value; astate.shown = 100; renderActive(); });
  $('aMore').addEventListener('click', () => { astate.shown += 200; renderActive(); });

  // ---------- controls ----------
  function fillSelect(sel, values, all, cur, label = (v) => v) {
    sel.replaceChildren(...(all ? [new Option(all, '')] : []), ...values.map((v) => new Option(label(v), v)));
    sel.value = cur || '';
  }
  async function render() {
    writeHash();
    $('fYear').value = state.year;
    const y = state.year;
    const [yearRows, prevRows] = await Promise.all([loadYear(y), loadYear(String(Number(y) - 1))]);
    const cut = ytdCut(y);
    const rows = filt(yearRows);
    const prevSel = filt(prevRows).filter((r) => !cut || r.date.slice(5, 10) <= cut);
    curRows = rows;
    const cur = sum(rows), prev = sum(prevSel);
    // filter options from data
    fillSelect($('fCountry'), SCOPE.filter((c) => yearRows.some((r) => r.country === c) || c === state.country), 'All countries', state.country);
    const secs = [...new Set(yearRows.flatMap((r) => r.sectors))].sort((a, b) => a.localeCompare(b));
    if (state.sector && !secs.includes(state.sector)) secs.unshift(state.sector);
    fillSelect($('fSector'), secs, 'All sectors', state.sector);
    fillSelect($('fStage'), STAGES.filter((s) => rows.some((r) => r.stage === s)), 'All stages', state.stage, stageLabel);
    renderLead(cur, prev, !!cut);
    renderTiles(cur, prev, yearRows, !!cut);
    drawMap(yearRows);
    renderSignals(rows);
    renderTrend();
    renderBreakdowns(rows, yearRows);
    state.shown = 150; renderRounds();
    renderAnnouncements();
    await buildActive(); renderActive();
  }
  function setState(p) { Object.assign(state, p); if ('country' in p || 'sector' in p || 'year' in p) { state.stage = ''; } render(); }

  $('fYear').addEventListener('change', (e) => setState({ year: e.target.value }));
  $('fCountry').addEventListener('change', (e) => setState({ country: e.target.value }));
  $('fSector').addEventListener('change', (e) => setState({ sector: e.target.value }));
  $('reset').addEventListener('click', () => { state.q = ''; $('fQ').value = ''; state.min = 0; $('fMin').value = '0'; setState({ country: '', sector: '', year: String(new Date().getUTCFullYear() - (new Date().getUTCMonth() < 2 ? 1 : 0)) }); });
  $('fMin').addEventListener('change', (e) => { state.min = Number(e.target.value); state.shown = 150; renderRounds(); });
  $('fStage').addEventListener('change', (e) => { state.stage = e.target.value; state.shown = 150; renderRounds(); });
  $('fQ').addEventListener('input', (e) => { state.q = e.target.value; state.shown = 150; renderRounds(); });
  $('more').addEventListener('click', () => { state.shown += 300; renderRounds(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { mapPaths = null; $('map').replaceChildren(); render(); }, 250); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

  (async () => {
    const joinDlg = $('join');
    $('subscribe').addEventListener('click', () => { if (joinDlg.showModal) joinDlg.showModal(); else joinDlg.setAttribute('open', ''); });
    $('joinClose').addEventListener('click', () => joinDlg.close ? joinDlg.close() : joinDlg.removeAttribute('open'));
    joinDlg.addEventListener('click', (e) => { if (e.target === joinDlg) joinDlg.close(); });
    if (location.hash.includes('join')) $('subscribe').click();
    try { meta = await loadJSON('meta.json'); } catch { meta = null; }
    try { cube = (await loadJSON('cube.json')).rows; } catch { cube = null; }
    try { ann = (await loadJSON('announcements.json')).rows || []; } catch { ann = []; }
    try { const it = await loadJSON('investors.json'); invTypes = Object.fromEntries((it.rows || []).map((r) => [String(r[0]).toLowerCase(), r[1]])); } catch { invTypes = null; }
    const years = meta && meta.years ? Object.keys(meta.years).sort().reverse() : [String(new Date().getUTCFullYear())];
    const thisY = String(new Date().getUTCFullYear());
    fillSelect($('fYear'), years, null, null, (y) => y === thisY ? `${y} (year to date)` : y);
    const h = readHash();
    state.year = years.includes(h.year) ? h.year : years[0];
    state.country = SCOPE.includes(h.country) ? h.country : '';
    state.sector = h.sector || '';
    $('fYear').value = state.year;
    if (meta && meta.updated) $('updated').textContent = `Data updated ${d3.timeFormat('%-d %B %Y, %H:%M')(new Date(meta.updated))} · ${int(d3.sum(Object.values(meta.years)))} rounds since ${years[years.length - 1]}`;
    await render();
  })();
})();
