/* TechCap Intelligence — public site logic. Reads the daily snapshot in /data and draws everything client-side. */
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
  const state = { cmp: [], cmpMetric: 'amount', from: '', to: '', evo: 'amount', year: null, country: '', sector: '', min: 0, stage: '', q: '', sort: 'date', dir: -1, shown: 150 };
  const readHash = () => { const h = new URLSearchParams(location.hash.slice(1)); return { cmp: (h.get('cmp') || '').split(',').filter(Boolean), year: h.get('year'), from: h.get('from') || '', to: h.get('to') || '', country: h.get('country') || '', sector: h.get('sector') || '' }; };
  const writeHash = () => { const p = new URLSearchParams(); p.set('year', state.year); if (state.year === 'custom') { p.set('from', state.from); p.set('to', state.to); } if (state.cmp.length) p.set('cmp', state.cmp.join(',')); if (state.country) p.set('country', state.country); if (state.sector) p.set('sector', state.sector); history.replaceState(null, '', '#' + p.toString()); };

  const loadJSON = (f) => fetch(`data/${f}`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  async function loadYear(y) {
    if (yearCache.has(y)) return yearCache.get(y);
    const p = loadJSON(`rounds-${y}.json`).then((j) => j.rows.map((r) => ({ id: r[0], date: r[1], company: r[2], company_id: r[3] || r[0], country: r[4], city: r[5],
      sectors: r[6] ? r[6].split('|') : [], stage: r[7] || 'Other', amount: r[8], investors: r[9] ? r[9].split('|') : [], url: r[10], source: r[11], origin: r[12] || 'techeu' })))
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
  // ---------- period: a calendar year, or a custom range of months ----------
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const addMonths = (ym, k) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1)); return d.toISOString().slice(0, 7); };
  const monthEnd = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  function period() {
    const today = todayISO();
    if (state.year === 'custom') {
      const n = (Number(state.to.slice(0, 4)) - Number(state.from.slice(0, 4))) * 12 + Number(state.to.slice(5, 7)) - Number(state.from.slice(5, 7)) + 1;
      const from = state.from + '-01', to = monthEnd(state.to) < today ? monthEnd(state.to) : today;
      const pTo = addMonths(state.from, -1), pFrom = addMonths(state.from, -n);
      const partial = to === today && monthEnd(state.to) > today;
      // previous period: same length, ending just before the range starts (trimmed the same way when the range runs to today)
      const prevTo = partial ? (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); })() : monthEnd(pTo);
      return { custom: true, from, to, prevFrom: pFrom + '-01', prevTo, months: n,
        label: state.from === state.to ? mLabel(state.from) : `${mLabel(state.from)} – ${mLabel(state.to)}`,
        prevLabel: `previous ${n} month${n > 1 ? 's' : ''}`, inPeriod: partial ? ' so far' : '', noPrev: pFrom < `${firstYear}-01` };
    }
    const y = String(state.year), cut = ytdCut(y);
    return { custom: false, from: `${y}-01-01`, to: cut ? today : `${y}-12-31`, prevFrom: `${Number(y) - 1}-01-01`, prevTo: cut ? `${Number(y) - 1}-${cut}` : `${Number(y) - 1}-12-31`,
      months: cut ? Number(today.slice(5, 7)) : 12, label: y, prevLabel: `${Number(y) - 1}${cut ? ' same period' : ''}`, inPeriod: cut ? ' so far' : '', ytd: !!cut };
  }
  const yearsBetween = (a, b) => { const out = []; for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) out.push(String(y)); return out; };
  async function loadPeriod(from, to) {
    const ys = yearsBetween(from, to).filter((y) => !meta || !meta.years || y in meta.years);
    const sets = await Promise.all(ys.map((y) => loadYear(y)));
    return sets.flat().filter((r) => r.date >= from && r.date <= to);
  }
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
    const cs = colors(); const F = opts.fmt || eur;
    const ymax = d3.max(groups, (g) => d3.sum(g.vals)) || 1;
    const y = d3.scaleLinear([0, ymax * 1.1], [H - m.b, m.t]).nice(); const ticks = y.ticks(4);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opts.label || 'Chart');
    const pr = svg.append('g').attr('font-size', 11); let tw = 0; ticks.forEach((t) => { const n = pr.append('text').text(F(t)); tw = Math.max(tw, n.node().getComputedTextLength()); n.remove(); }); pr.remove();
    m.l = tw + 10;
    const x = d3.scaleBand(groups.map((g) => g.k), [m.l, W - m.r]).padding(0.28);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--line'));
    svg.append('g').attr('font-size', 11).attr('fill', css('--muted')).selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '.35em').attr('text-anchor', 'end').text(F);
    const showTot = x.bandwidth() > 36;
    groups.forEach((g) => {
      const gg = svg.append('g').style('cursor', opts.onClick ? 'pointer' : null)
        .on('mousemove', (ev) => showTip(ev, g.tip)).on('mouseleave', hideTip).on('click', () => opts.onClick && opts.onClick(g));
      gg.append('rect').attr('x', x(g.k)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent');
      let base = 0;
      g.vals.forEach((v, i) => { gg.append('rect').attr('x', x(g.k)).attr('width', x.bandwidth()).attr('y', y(base + v)).attr('height', Math.max(0, y(base) - y(base + v))).attr('fill', cs[i]).attr('opacity', g.dim ? 0.45 : 1); base += v; });
      if (showTot) gg.append('text').attr('x', x(g.k) + x.bandwidth() / 2).attr('y', y(base) - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', css('--fg')).text(F(base));
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
        if (!inScope(c.n)) return showTip(ev, [c.n, 'Outside the TechCap Intelligence scope']);
        const v = by.get(c.n);
        if (!v) return showTip(ev, [`${c.n} · ${period().label}`, 'No rounds on record']);
        showTip(ev, [`${c.n} · ${period().label}${state.sector ? ' · ' + state.sector : ''}`, `#${rk.get(c.n)} in Europe · ${eur(v.total)} (${pct(all ? v.total / all : null)})`,
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
    const pl = period().noPrev ? '' : period().prevLabel;
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
    const P = period();
    lead.append(`${P.custom ? 'From ' + P.label.replace(' – ', ' to ') : 'In ' + P.label}${P.inPeriod}, ${where ? where + ' startups' : 'European startups'} raised `, el('b', null, eur(cur.total)), ` across `, el('b', null, int(cur.rounds)), ' disclosed rounds',
      chg != null ? `, ${chg >= 0 ? 'up' : 'down'} ${pct0(Math.abs(chg))} on ${P.custom ? 'the ' + P.prevLabel : (Number(state.year) - 1) + (P.ytd ? ' at the same point' : '')}.` : (P.noPrev ? '. No comparison: the data starts in ' + firstYear + '.' : '.'));
  }

  function renderSignals(rows) {
    const s = sum(rows); const ul = $('signals'); ul.replaceChildren();
    $('signalsNote').textContent = `${state.country || 'Europe'}${state.sector ? ' · ' + state.sector : ''} · ${period().label}`;
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

  // ---------- plain-English analysis, computed from the numbers on screen ----------
  const NAMED_OUT = ['Other', 'Debt', 'Grant', 'Crowdfunding', 'ICO'];
  const EARLY = ['Pre-Seed', 'Seed'], LATE = ['Series B', 'Series C', 'Series D+', 'Growth/Late'];
  const chgOf = (a, b) => (b ? a / b - 1 : null);
  const upDown = (x) => (Math.abs(x) < 0.005 ? 'flat' : x >= 1 ? `up ${(x + 1).toFixed(1)}×` : `${x >= 0 ? 'up' : 'down'} ${pct0(Math.abs(x))}`);
  const nR = (n) => `${int(n)} round${n === 1 ? '' : 's'}`;
  const pp = (x) => (Math.round(Math.abs(x) * 100) === 0 ? 'unchanged' : `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)} pts`);
  const B = (t) => el('b', null, t);
  function sentence(box, parts, tag = 'p') { const n = el(tag); parts.forEach((p) => n.append(p && p.nodeType ? p.cloneNode(true) : p)); box.append(n); return n; }
  function takeaway(id, parts) {
    const box = $(id); if (!box) return;
    box.replaceChildren(); if (!parts || !parts.length) { box.hidden = true; return; }
    box.hidden = false; box.append(el('span', 'tk-l', 'Insight')); parts.forEach((p) => box.append(p && p.nodeType ? p.cloneNode(true) : p));
  }
  function stageMix(rows) {
    const named = rows.filter((r) => !NAMED_OUT.includes(r.stage));
    return { n: named.length, early: named.length ? named.filter((r) => EARLY.includes(r.stage)).length / named.length : null, late: named.length ? named.filter((r) => LATE.includes(r.stage)).length / named.length : null };
  }
  const bySum = (rows, key) => new Map(d3.rollups(rows.flatMap((r) => (key === 'sectors' ? (r.sectors.length ? r.sectors : []) : [r[key]]).map((k) => [k, r.amount || 0, r])), (v) => ({ e: d3.sum(v, (z) => z[1]), n: v.length, big: v.slice().sort((a, b) => b[1] - a[1])[0][2] }), (z) => z[0]));
  function movers(cur, prev, total, prevTotal) {
    // keys that matter in either period: at least 3% of the money and 5 rounds
    const out = [];
    for (const [k, c] of cur) {
      const p = prev.get(k) || { e: 0, n: 0 };
      if (c.n < 5 || p.n < 5 || (c.e < 0.03 * total && p.e < 0.03 * prevTotal) || !p.e) continue;
      out.push({ k, cur: c.e, prev: p.e, chg: c.e / p.e - 1, share: total ? c.e / total : 0, prevShare: prevTotal ? p.e / prevTotal : 0, big: c.big });
    }
    return out;
  }
  function topInvestors(rows, n = 3) {
    return d3.rollups(rows.flatMap((r) => r.investors.map((x) => x.trim()).filter((x) => x && !/^(undisclosed|existing (investors|shareholders)|angels?|new investors|business angels|private investors)$/i.test(x))), (v) => v.length, (x) => x)
      .sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  function lastMonthsMomentum(rows, P) {
    const today = todayISO(), curM = today.slice(0, 7);
    const end = P.to.slice(0, 7) === curM ? addMonths(curM, -1) : P.to.slice(0, 7); // last full month
    const a0 = addMonths(end, -2), b1 = addMonths(end, -3), b0 = addMonths(end, -5);
    if (b0 < P.from.slice(0, 7)) return null;
    const s = (f, t) => d3.sum(rows.filter((r) => r.date.slice(0, 7) >= f && r.date.slice(0, 7) <= t), (r) => r.amount || 0);
    const last = s(a0, end), before = s(b0, b1);
    return before ? { chg: last / before - 1, last, before, label: `${mLabel(a0)}–${mLabel(end)}` } : null;
  }

  function renderAnalysis(rows, prev, periodRows, periodPrev) {
    const P = period(); const box = $('analysis'); box.replaceChildren();
    const subj = `${state.sector ? state.sector + ' ' : ''}startups${state.country ? ' in ' + state.country : ' across Europe'}`;
    $('signalsNote').textContent = `${state.country || 'Europe'}${state.sector ? ' · ' + state.sector : ''} · ${P.label}${P.inPeriod}. Written automatically from the figures below; it changes with every filter.`;
    const fUl = $('forFounders'), iUl = $('forInvestors'); fUl.replaceChildren(); iUl.replaceChildren();
    if (!rows.length) { sentence(box, ['No disclosed rounds for this selection, so there is nothing to analyse yet.']); $('audience').hidden = true; ['mapTake', 'sectorTake', 'stageTake', 'invTake'].forEach((id) => takeaway(id, null)); return; }
    $('audience').hidden = false;
    const s = sum(rows), ps = sum(prev), hasPrev = !P.noPrev && prev.length > 0;
    const vs = P.custom ? `the ${P.prevLabel}` : `${Number(state.year) - 1}${P.ytd ? ' at the same point' : ''}`;
    const priced = rows.filter((r) => r.amount).sort((a, b) => b.amount - a.amount);
    const pPriced = prev.filter((r) => r.amount).sort((a, b) => b.amount - a.amount);
    const big = priced[0], pBig = pPriced[0];
    const top10 = s.total ? d3.sum(priced.slice(0, 10), (r) => r.amount) / s.total : null;
    const mix = stageMix(rows), pmix = stageMix(prev);
    const tChg = hasPrev ? chgOf(s.total, ps.total) : null, rChg = hasPrev ? chgOf(s.rounds, ps.rounds) : null, mChg = hasPrev && ps.median ? chgOf(s.median, ps.median) : null;
    const flat = (x) => x != null && Math.abs(x) < 0.05;
    const founders = [], investors = [];

    if (rows.length < 5) {
      sentence(box, [`${subj.charAt(0).toUpperCase() + subj.slice(1)} had `, B(nR(rows.length)), ` in this period${s.total ? `, raising ${eur(s.total)}` : ', none with a disclosed amount'}. That is too few for a meaningful analysis; widen the period or remove a filter.`]);
      $('audience').hidden = true; ['mapTake', 'sectorTake', 'stageTake', 'invTake'].forEach((id) => takeaway(id, null)); return;
    }
    if (rows.length < 20) sentence(box, [el('span', 'warn', `Small sample: ${nR(rows.length)}. `), 'Percentages can swing a lot on a few deals, so read the changes below with care.']);

    // 1. momentum and what kind of growth it is
    if (tChg != null && rChg != null) {
      let shape;
      if (flat(tChg) && flat(rChg)) shape = 'a broadly stable market';
      else if (tChg > 0 && rChg < 0) shape = 'more money flowing into fewer deals, so capital is concentrating';
      else if (tChg > 0 && rChg >= 0) shape = 'growth in both money and deal count, a broad-based upswing';
      else if (tChg < 0 && rChg > 0) shape = 'more deals but less money, so rounds are getting smaller';
      else shape = 'a slowdown in both money and deal count';
      sentence(box, [`${subj.charAt(0).toUpperCase() + subj.slice(1)} raised `, B(eur(s.total)), ` across `, B(nR(s.rounds)), `, funding ${upDown(tChg)} and deal count ${upDown(rChg)} on ${vs}. That points to `, B(shape), '.']);
    } else sentence(box, [`${subj.charAt(0).toUpperCase() + subj.slice(1)} raised `, B(eur(s.total)), ` across `, B(nR(s.rounds)), ` with a disclosed stage or amount${P.noPrev ? ' (no earlier data to compare with)' : ''}.`]);

    // 2. one deal driving the headline?
    if (big && s.total && big.amount / s.total >= 0.2) {
      const parts = [`One round dominates: `, B(big.company), ` (${big.country}, ${eur(big.amount)}) is `, B(pct0(big.amount / s.total)), ' of the total.'];
      if (hasPrev && pBig) { const ex = chgOf(s.total - big.amount, ps.total - pBig.amount); if (ex != null) parts.push(` Leaving out each period's largest round, funding is ${upDown(ex)}, a better read of the underlying trend.`); }
      sentence(box, parts);
      investors.push(['Headline totals here hinge on one deal (', B(big.company), '); judge the market on the rest of the rounds.']);
    } else if (top10 != null) {
      sentence(box, [`The 10 largest rounds took `, B(pct0(top10)), ` of the money, ${top10 >= 0.6 ? 'so funding is highly concentrated in a few big deals' : top10 <= 0.35 ? 'so money is spread fairly widely' : 'a typical level of concentration'}.`]);
      if (top10 >= 0.6) investors.push(['Capital is concentrated: the top 10 deals took ', B(pct0(top10)), ', so competition for the largest rounds is intense while the long tail is less crowded.']);
    }

    // 3. round sizes
    if (mChg != null && Math.abs(mChg) >= 0.1) {
      sentence(box, ['The typical (median) disclosed round ', mChg > 0 ? 'grew' : 'shrank', ` ${pct0(Math.abs(mChg))} to `, B(eur(s.median)), '.']);
      if (mChg > 0 && rChg != null && rChg < 0) founders.push(['Investors are writing bigger cheques into fewer companies (median round ', B(`+${pct0(mChg)}`), ', deals ', B(`−${pct0(Math.abs(rChg))}`), '): expect a higher bar before a round closes.']);
      else if (mChg > 0) investors.push(['Round sizes are rising (median ', B(`+${pct0(mChg)}`), '), which often goes with higher entry prices.']);
      else founders.push(['Rounds are getting smaller (median ', B(`−${pct0(Math.abs(mChg))}`), '): plan for leaner raises or more tranches.']);
    }

    // 4. stage shift
    if (mix.n >= 10 && pmix.n >= 10 && hasPrev) {
      const d = mix.early - pmix.early;
      if (Math.abs(d) >= 0.05) {
        sentence(box, [`Pre-seed and seed made up `, B(pct0(mix.early)), ` of rounds with a named stage (${pp(d)} on ${vs}), so the market is tilting `, d > 0 ? 'towards early-stage deals' : 'towards later-stage deals', '.']);
        founders.push(d < 0 ? ['Early-stage deals are a shrinking share (', B(pp(d)), '): first rounds are relatively harder to land here.'] : ['Early-stage deals are a growing share (', B(pp(d)), '): a relatively active market for first rounds.']);
      } else sentence(box, [`The stage mix is steady: `, B(pct0(mix.early)), ` of named rounds were pre-seed or seed and `, B(pct0(mix.late)), ' Series B or later.']);
    }

    // 5. sectors (when no sector picked)
    let sectorLine = null;
    if (!state.sector) {
      const cur = bySum(rows, 'sectors'), pv = bySum(prev, 'sectors');
      const top = [...cur].sort((a, b) => b[1].e - a[1].e).slice(0, 3);
      if (top.length) {
        const mv = hasPrev ? movers(cur, pv, s.total, ps.total) : [];
        const up = mv.slice().sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev))[0], down = mv.slice().sort((a, b) => (a.cur - a.prev) - (b.cur - b.prev))[0];
        const parts = [`By sector, `, B(top.map((t) => t[0]).join(', ')), ` led${s.total ? ` with ${pct0(d3.sum(top, (t) => t[1].e) / s.total)} of funding between them` : ''}.`];
        const oneDeal = (m) => m.big && m.big.amount && m.big.amount >= 0.5 * (m.cur - m.prev) ? `, mostly one deal: ${m.big.company}, ${eur(m.big.amount)}` : '';
        if (up && up.cur > up.prev) parts.push(` The biggest gain was in `, B(up.k), ` (${upDown(up.chg)}, ${eur(up.cur - up.prev)} more${oneDeal(up)}).`);
        if (down && down.cur < down.prev && down.k !== (up && up.k)) parts.push(` The sharpest pull-back was in `, B(down.k), ` (${upDown(down.chg)}).`);
        sentence(box, parts);
        if (up && up.cur > up.prev && !oneDeal(up)) { founders.push(['Investor appetite is growing fastest in ', B(up.k), ` (${upDown(up.chg)}).`]); investors.push(['Momentum is shifting towards ', B(up.k), down && down.cur < down.prev && down.k !== up.k ? [' and away from ', B(down.k)] : '', '.'].flat()); }
        sectorLine = s.total ? [B(top[0][0]), ` took the most money (${pct0(top[0][1].e / s.total)}).`, ...(up && up.cur > up.prev ? [' Biggest gain: ', B(up.k), ` (${upDown(up.chg)}${oneDeal(up)}).`] : [])] : null;
      }
    }

    // 6. countries (when no country picked)
    let mapLine = null;
    if (!state.country) {
      const base = periodRows.filter((r) => inScope(r.country) && (!state.sector || r.sectors.includes(state.sector)));
      const pbase = periodPrev.filter((r) => inScope(r.country) && (!state.sector || r.sectors.includes(state.sector)));
      const tot = d3.sum(base, (r) => r.amount || 0), ptot = d3.sum(pbase, (r) => r.amount || 0);
      const cur = bySum(base, 'country'), pv = bySum(pbase, 'country');
      const top = [...cur].sort((a, b) => b[1].e - a[1].e).slice(0, 3);
      if (top.length && tot) {
        const parts = [B(top[0][0]), ` led with `, B(pct0(top[0][1].e / tot)), ` of funding`, top.length > 2 ? `; the top three (${top.map((t) => t[0]).join(', ')}) took ${pct0(d3.sum(top, (t) => t[1].e) / tot)}.` : '.'];
        if (hasPrev && ptot) {
          const gains = [...cur].filter(([k, v]) => v.n >= 5 && (pv.get(k) || {}).n >= 5).map(([k, v]) => ({ k, d: v.e / tot - (pv.get(k).e / ptot) })).sort((a, b) => b.d - a.d);
          if (gains[0] && gains[0].d >= 0.02) { parts.push(` `, B(gains[0].k), ` gained the most ground (${pp(gains[0].d)} of the European total).`); investors.push([B(gains[0].k), ` gained the most share of funding (${pp(gains[0].d)}).`]); }
        }
        sentence(box, parts); mapLine = parts;
      }
    } else {
      const base = periodRows.filter((r) => inScope(r.country) && (!state.sector || r.sectors.includes(state.sector)));
      const tot = d3.sum(base, (r) => r.amount || 0);
      const ranked = d3.rollups(base, (v) => d3.sum(v, (r) => r.amount || 0), (r) => r.country).sort((a, b) => b[1] - a[1]);
      const i = ranked.findIndex((d) => d[0] === state.country);
      if (i >= 0 && tot) { mapLine = [B(state.country), ` ranks `, B(`#${i + 1}`), ` in Europe for ${state.sector ? state.sector + ' ' : ''}funding, with `, B(pct0(ranked[i][1] / tot)), ' of the total.']; sentence(box, mapLine); }
    }

    // 7. recent momentum inside the period
    const mom = lastMonthsMomentum(rows, P);
    if (mom && Math.abs(mom.chg) >= 0.1) sentence(box, [`Recent momentum: the last three full months (${mom.label}) brought `, B(eur(mom.last)), `, ${upDown(mom.chg)} on the three months before${mom.chg >= 1 && mom.before < 0.25 * mom.last ? ' (from a low base)' : ''}.`]);

    // 8. debt and disclosure caveats
    if (s.total && s.debt / s.total >= 0.2) { sentence(box, [`Debt is a large part of the money (`, B(pct0(s.debt / s.total)), `), so equity alone was `, B(eur(s.equity)), '.']); founders.push(['Non-dilutive debt is a meaningful share of funding here (', B(pct0(s.debt / s.total)), ').']); }
    const undisclosed = s.rounds ? (s.rounds - s.priced) / s.rounds : 0;
    if (undisclosed >= 0.35) sentence(box, [el('span', 'muted', `${pct0(undisclosed)} of rounds did not disclose an amount, so the real total is higher than shown.`)]);

    // 9. who is investing
    const ti = topInvestors(rows);
    if (ti.length) founders.push(['Most active backers in this selection: ', B(ti.map((t) => `${t[0]} (${t[1]})`).join(', ')), '.']);

    // 10. exits
    if (exits && exits.length) {
      const inSel = (e, f, t) => e.date >= f && e.date <= t && (!state.country || e.country === state.country) && (!state.sector || ((compById && compById.get(e.company_id)) || {}).sectors?.includes(state.sector));
      const ex = exits.filter((e) => inSel(e, P.from, P.to)), pex = hasPrev ? exits.filter((e) => inSel(e, P.prevFrom, P.prevTo)) : [];
      const known = ex.filter((e) => e.acq_country), foreign = known.filter((e) => !EUROPE.has(e.acq_country));
      if (ex.length) {
        const parts = [`On the exit side, `, B(int(ex.length)), ` companies were acquired, merged or listed`, pex.length ? ` (${upDown(chgOf(ex.length, pex.length))} on ${vs})` : '', '.'];
        if (known.length >= 10) parts.push(` `, B(pct0(foreign.length / known.length)), ` of those with a known buyer went to non-European acquirers.`);
        sentence(box, parts);
        if (known.length >= 10) investors.push([`${int(ex.length)} exits in this period; `, B(pct0(foreign.length / known.length)), foreign.length / known.length >= 0.4 ? ' went to buyers outside Europe, so foreign acquirers are a key exit route.' : ' went to buyers outside Europe; most exits stay within Europe.']);
      }
    }

    const fill = (ul, items) => { items.slice(0, 3).forEach((parts) => { const li = el('li'); parts.forEach((p) => li.append(p)); ul.append(li); }); if (!items.length) ul.append(el('li', 'muted', 'No clear signal for this selection.')); };
    fill(fUl, founders); fill(iUl, investors);

    // one-line takeaways under the charts
    takeaway('mapTake', mapLine);
    takeaway('sectorTake', sectorLine);
    const stageCount = d3.rollups(rows.filter((r) => !NAMED_OUT.includes(r.stage)), (v) => v.length, (r) => r.stage).sort((a, b) => b[1] - a[1])[0];
    takeaway('stageTake', stageCount ? [B(stageCount[0]), ` is the most common stage (${nR(stageCount[1])}). `, ...(mix.n ? [B(pct0(mix.early)), ' of named rounds were pre-seed or seed', hasPrev && pmix.n >= 10 ? ` (${pp(mix.early - pmix.early)} on ${vs}).` : '.'] : [])] : null);
    const invCur = new Set(rows.flatMap((r) => r.investors.map((x) => x.trim().toLowerCase()))).size, invPrev = new Set(prev.flatMap((r) => r.investors.map((x) => x.trim().toLowerCase()))).size;
    takeaway('invTake', ti.length ? [B(ti[0][0]), ` was the most active investor (${nR(ti[0][1])}). `, B(int(invCur)), ' different investors were named', hasPrev && invPrev ? `, ${upDown(chgOf(invCur, invPrev))} on ${vs}.` : '.'] : null);
  }

  function evolutionTake(rows) {
    const P = period();
    if (rows.length < 5 || !d3.sum(rows, (r) => r.amount || 0)) return takeaway('evoTake', null);
    const quarterly = P.months > 24;
    const keyOf = (d) => quarterly ? `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}` : d.slice(0, 7);
    const g = d3.rollups(rows, (v) => d3.sum(v, (r) => r.amount || 0), (r) => keyOf(r.date)).sort((a, b) => b[1] - a[1]);
    const name = (k) => quarterly ? `${k.slice(5)} ${k.slice(0, 4)}` : mLabel(k);
    const parts = [`Funding peaked in `, B(name(g[0][0])), ` (${eur(g[0][1])}).`];
    const mom = lastMonthsMomentum(rows, P);
    if (mom) parts.push(` The last three full months were `, B(upDown(mom.chg)), ` on the three before${mom.chg >= 1 && mom.before < 0.25 * mom.last ? ' (from a low base)' : ''}.`);
    if (P.months >= 12) {
      const half = addMonths(P.from.slice(0, 7), Math.floor(P.months / 2));
      const a = d3.sum(rows.filter((r) => r.date.slice(0, 7) < half), (r) => r.amount || 0), b = d3.sum(rows.filter((r) => r.date.slice(0, 7) >= half), (r) => r.amount || 0);
      if (a) parts.push(` Funding in the second half of the period was `, B(upDown(b / a - 1)), ` on the first half.`);
    }
    takeaway('evoTake', parts);
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
      return { k: String(y), label: y === thisY ? `${y} YTD` : String(y), vals, dim: !(state.year === 'custom' ? (String(y) >= state.from.slice(0, 4) && String(y) <= state.to.slice(0, 4)) : String(y) === String(state.year)), bold: state.year !== 'custom' && String(y) === String(state.year),
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
    renderEvolution(rows);
    // investors
    const inv = d3.rollups(rows.flatMap((r) => r.investors.filter((x) => x && !/^(undisclosed|existing (investors|shareholders)|angels?|new investors|business angels)$/i.test(x.trim())).map((x) => [x.trim(), r.amount || 0])),
      (v) => ({ n: v.length, e: d3.sum(v, (z) => z[1]) }), (z) => z[0]).sort((a, b) => b[1].n - a[1].n || b[1].e - a[1].e).slice(0, 12);
    rank($('investors'), inv.map(([i, o]) => ({ label: i, value: o.n, valueText: `${int(o.n)} deals`, sub: eur(o.e), tip: [i, `Rounds: ${int(o.n)}`, `Combined round size: ${eur(o.e)}`, 'Click to see their deals'], onClick: () => { state.q = i; $('fQ').value = i; renderRounds(); $('roundsTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); } })), css('--c3'));
  }

  function renderEvolution(rows) {
    const P = period();
    const quarterly = P.months > 24;
    const keyOf = (date) => quarterly ? `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` : date.slice(0, 7);
    // every bucket in the period, including empty ones, so gaps show
    const buckets = []; for (let m = P.from.slice(0, 7); m <= P.to.slice(0, 7); m = addMonths(m, 1)) { const k = keyOf(m + '-01'); if (buckets[buckets.length - 1] !== k) buckets.push(k); }
    const agg = new Map(d3.rollups(rows, (v) => ({ e: d3.sum(v, (r) => r.amount || 0), n: v.length, c: new Set(v.map((r) => r.company_id)).size }), (r) => keyOf(r.date)));
    const byRounds = state.evo === 'rounds';
    const multiYear = P.from.slice(0, 4) !== P.to.slice(0, 4);
    const lab = (k) => quarterly ? `${k.slice(5)} ’${k.slice(2, 4)}` : `${MONTHS[Number(k.slice(5, 7)) - 1]}${multiYear ? ' ’' + k.slice(2, 4) : ''}`;
    const full = (k) => quarterly ? `${k.slice(5)} ${k.slice(0, 4)}` : mLabel(k);
    $('evoTitle').textContent = `How it evolves · ${quarterly ? 'by quarter' : 'by month'}`;
    $('evoNote').textContent = `${byRounds ? 'Number of disclosed rounds' : 'Disclosed funding'} per ${quarterly ? 'quarter' : 'month'}, ${P.label}${P.inPeriod}. Hover for details. Faded bars cover only part of a period. Choose “Custom range” in the Period menu to see any timeframe.`;
    const qStart = (k) => `${k.slice(0, 4)}-${String((Number(k.slice(6)) - 1) * 3 + 1).padStart(2, '0')}`;
    const partOf = (k) => {
      const today = todayISO();
      if (!quarterly) return k === today.slice(0, 7) && P.to === today ? 'month so far' : '';
      const s = qStart(k), e = addMonths(s, 2), a = P.from.slice(0, 7) > s ? P.from.slice(0, 7) : s, b = P.to.slice(0, 7) < e ? P.to.slice(0, 7) : e;
      if (a === s && b === e && !(P.to === today && b === today.slice(0, 7))) return '';
      return a === b ? `${mLabel(a)} only` : `${MONTHS[Number(a.slice(5, 7)) - 1]}–${mLabel(b)} only`;
    };
    vbars($('months'), buckets.map((k) => { const o = agg.get(k) || { e: 0, n: 0, c: 0 }; const part = partOf(k); return { k, label: lab(k), dim: !!part, vals: [byRounds ? o.n : o.e], tip: [full(k) + (part ? ` (${part})` : ''), `Raised: ${eur(o.e)}`, `Rounds: ${int(o.n)}`, `Companies: ${int(o.c)}`] }; }),
      [byRounds ? 'Rounds' : 'Raised'], { label: 'Funding over time', fmt: byRounds ? int : eur });
    evolutionTake(rows);
  }

  let curRows = [];
  function renderRounds() {
    const q = state.q.toLowerCase();
    let rows = curRows.filter((r) => (!state.min || (r.amount || 0) >= state.min) && (!state.stage || r.stage === state.stage) && (!q || r.company.toLowerCase().includes(q) || r.investors.join(' ').toLowerCase().includes(q)));
    const k = state.sort, d = state.dir;
    rows = rows.slice().sort((a, b) => k === 'amount' ? d * ((a.amount || 0) - (b.amount || 0)) : d * String(a[k] ?? '').localeCompare(String(b[k] ?? '')));
    $('roundsNote').textContent = `${int(rows.length)} rounds in this selection, newest first. Click a company for its profile. Rounds marked “Other sources” were found by the daily multi-source scan and confirmed by at least two sources; Tech.eu does not list them.`;
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
      const c = tr.insertCell(); { const b = el('button', 'linkish', r.company); b.type = 'button'; b.onclick = () => openProfile(r.company_id); c.append(b); }
      td(r.country); td(r.sectors.join(', '), 'hide-sm'); td(stageLabel(r.stage)); td(r.amount ? eur(r.amount) : 'Undisclosed', 'num'); td(r.investors.slice(0, 6).join(', ') || '—', 'dim hide-sm');
      const sc = td('', 'hide-sm'); if (r.origin === 'scan') { sc.append(el('span', 'pill hot', 'Other sources'), document.createTextNode(' ' + (r.source || ''))); } else sc.textContent = r.source || '—';
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
    $('rangeBox').hidden = state.year !== 'custom';
    if (state.year === 'custom') { $('fFrom').value = state.from; $('fTo').value = state.to; }
    const P = period();
    const [yearRows, prevRows] = await Promise.all([loadPeriod(P.from, P.to), P.noPrev ? Promise.resolve([]) : loadPeriod(P.prevFrom, P.prevTo)]);
    const cut = P.ytd || P.inPeriod ? 'x' : null;
    const rows = filt(yearRows);
    const prevSel = filt(prevRows);
    periodAll = yearRows; periodPrev = prevRows;
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
    renderTrend();
    renderBreakdowns(rows, yearRows);
    state.shown = 150; renderRounds();
    renderAnnouncements();
    await buildActive(); renderActive();
    await Promise.all([loadExits(), loadCompanies()]); renderAnalysis(rows, prevSel, yearRows, prevRows); renderExits(); renderCompare();
  }
  // ---------- companies, unicorns, exits ----------
  const API = 'https://funding.tech.eu/api/v1';
  const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b(gmbh|ltd|limited|sas|sa|ag|ab|bv|nv|srl|spa|inc|oy|as|aps|sl)\b/g, '').replace(/[^a-z0-9]/g, '');
  let companies = null, unicorns = null, exits = null, compById = null;
  let compLoad = null;
  function loadCompanies() {
    if (!compLoad) compLoad = Promise.all([
      loadJSON('companies.json').then((j) => j.rows.map((r) => ({ id: r[0], name: r[1], country: r[2], sectors: r[3] ? r[3].split('|') : [], total: r[4], n: r[5], last: r[6], stage: r[7], origin: r[8], key: normName(r[1]) }))).catch(() => []),
      loadJSON('unicorns.json').then((j) => j.rows).catch(() => [])
    ]).then(([c, u]) => { companies = c; unicorns = u; compById = new Map(c.map((x) => [x.id, x])); });
    return compLoad;
  }
  function unicornOf(name) {
    if (!unicorns || !unicorns.length) return null;
    const k = normName(name); if (!k) return null;
    return unicorns.find((u) => u[1] === k) || unicorns.find((u) => k.length >= 5 && u[1].length >= 5 && (u[1] === k + 'ai' || k === u[1] + 'ai' || u[1].startsWith(k + 'group') || k.startsWith(u[1] + 'group'))) || null;
  }
  const typeLabel = (t) => { const s = String(t || 'other').toLowerCase().trim();
    if (/^merge/.test(s)) return 'Merger'; if (/acqui/.test(s)) return 'Acquisition'; if (/buyout|lbo|mbo/.test(s)) return 'Buyout'; if (s === 'ipo' || /listing/.test(s)) return 'IPO'; if (s === 'spac') return 'SPAC'; if (s === 'ico') return 'Token sale (ICO)';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' '); };

  // search box
  const sIn = $('coSearch'), sList = $('coResults');
  let sSel = -1, sHits = [];
  function showHits() {
    sList.replaceChildren(); sSel = -1;
    const q = normName(sIn.value);
    if (!q || q.length < 2 || !companies) { sList.hidden = true; return; }
    const starts = [], has = [];
    for (const c of companies) { if (c.key.startsWith(q)) starts.push(c); else if (c.key.includes(q)) has.push(c); if (starts.length >= 8) break; }
    sHits = [...starts, ...has].slice(0, 8);
    if (!sHits.length) { sList.append(el('li', 'none', 'No startup by that name in the data.')); sList.hidden = false; return; }
    sHits.forEach((c, i) => {
      const li = el('li'); li.setAttribute('role', 'option'); li.id = 'co-opt-' + i;
      li.append(el('b', null, c.name), el('span', null, ` ${c.country}${c.total ? ' · ' + eur(c.total) + ' raised' : ''}${unicornOf(c.name) ? ' · Unicorn' : ''}`));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(c); });
      sList.append(li);
    });
    sList.hidden = false;
  }
  function pick(c) { sList.hidden = true; sIn.value = c.name; openProfile(c.id); }
  sIn.addEventListener('focus', () => { loadCompanies().then(showHits); });
  sIn.addEventListener('input', () => { loadCompanies().then(showHits); });
  sIn.addEventListener('blur', () => setTimeout(() => { sList.hidden = true; }, 120));
  sIn.addEventListener('keydown', (e) => {
    const items = [...sList.querySelectorAll('li[role=option]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sSel = (sSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('on', i === sSel)); sIn.setAttribute('aria-activedescendant', items[sSel].id); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = sHits[sSel >= 0 ? sSel : 0]; if (c) pick(c); }
    else if (e.key === 'Escape') sList.hidden = true;
  });

  // profile dialog
  const pDlg = $('profile');
  $('profileClose').addEventListener('click', () => pDlg.close());
  pDlg.addEventListener('click', (e) => { if (e.target === pDlg) pDlg.close(); });
  async function allRoundsOf(id) {
    const ys = meta && meta.years ? Object.keys(meta.years) : [];
    const sets = await Promise.all(ys.map((y) => loadYear(y)));
    return sets.flat().filter((r) => r.company_id === id);
  }
  async function openProfile(id) {
    await loadCompanies();
    const c = compById.get(id) || { id, name: '', country: '', sectors: [], total: 0, n: 0, origin: 'techeu' };
    const box = $('profileBody'); box.replaceChildren(el('p', 'note', 'Loading…'));
    if (!pDlg.open) pDlg.showModal();
    const [local, api] = await Promise.all([
      allRoundsOf(id),
      c.origin === 'scan' ? Promise.resolve(null) : fetch(`${API}/companies/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.data && j.data.name ? j.data : j)).catch(() => null)
    ]);
    const name = (api && api.name) || c.name || (local[0] && local[0].company) || 'Company';
    // rounds: the API has the full history (including before 2021); local adds rounds from other sources
    let rounds = [];
    if (api && Array.isArray(api.rounds)) rounds = api.rounds.map((r) => ({ date: r.date || '', stage: r.stage || 'Other', amount: Number(r.amountEur) > 0 ? Number(r.amountEur) : null, investors: (r.investors || []).map((x) => String(typeof x === 'string' ? x : x.name || '').trim()).filter(Boolean), url: r.url || r.pageUrl || '', origin: 'techeu' }));
    const useLocal = !rounds.length;
    local.forEach((r) => { if (r.origin === 'scan' || useLocal) rounds.push({ date: r.date, stage: r.stage, amount: r.amount, investors: r.investors, url: r.url, origin: r.origin, source: r.source }); });
    rounds.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const priced = rounds.filter((r) => r.amount);
    const total = d3.sum(priced, (r) => r.amount);
    const dated = rounds.filter((r) => r.date);
    const lastNamed = dated.find((r) => !['Other', 'Debt', 'Grant', 'Crowdfunding'].includes(r.stage));
    const sectors = (api && api.sectors && api.sectors.length ? api.sectors : c.sectors) || [];
    const country = (api && api.country) || c.country, city = api && api.city;
    const uni = unicornOf(name);
    const exit = (api && api.exit) || (exits && exits.find((e) => e.company_id === id)) || null;
    box.replaceChildren();
    const head = el('div', 'p-head');
    const h = el('h2', null, name); h.id = 'profileTitle'; head.append(h);
    const badges = el('div', 'badges');
    if (uni && uni[6] === 'current') badges.append(el('span', 'pill uni', `🦄 Unicorn · valued at $${uni[2]}B${uni[3] ? ' as of ' + uni[3] : ''} (Wikipedia)`));
    if (uni && uni[6] === 'former') badges.append(el('span', 'pill', `Former unicorn · peak $${uni[2]}B${uni[8] ? ' · exited via ' + uni[8] : ''}`));
    if (exit) badges.append(el('span', 'pill exit', `Exited · ${typeLabel(exit.type)}${exit.acquirors || exit.acquirers ? ' by ' + (exit.acquirors || exit.acquirers) : ''}${exit.date ? ' · ' + exit.date.slice(0, 7) : ''}`));
    if (badges.childNodes.length) head.append(badges);
    head.append(el('p', 'p-meta', [city, country].filter(Boolean).join(', ') + (sectors.length ? ' · ' + sectors.join(', ') : '') + (api && api.founded ? ' · founded ' + api.founded : '')));
    box.append(head);
    if (api && api.description) box.append(el('p', 'p-desc', api.description));
    const links = el('p', 'p-links');
    if (api && /^https?:\/\//.test(api.website || '')) { const a = el('a', null, 'Website'); a.href = api.website; a.target = '_blank'; a.rel = 'noopener'; links.append(a); }
    const tUrl = (api && (api.canonicalUrl || api.url)) || (c.origin !== 'scan' ? `https://funding.tech.eu/companies/${id}` : '');
    if (tUrl) { const a = el('a', null, 'Tech.eu profile'); a.href = tUrl.startsWith('http') ? tUrl : 'https://funding.tech.eu' + tUrl; a.target = '_blank'; a.rel = 'noopener'; links.append(a); }
    if (links.childNodes.length) box.append(links);
    // key figures
    const kf = el('div', 'tiles mini');
    const t = (h3, big, s) => { const d = el('div', 'tile'); d.append(el('h3', null, h3), el('div', 'big', big)); if (s) d.append(el('div', 'chg', s)); kf.append(d); };
    t('Total disclosed funding', eur(total), `${int(priced.length)} of ${int(rounds.length)} rounds disclosed an amount`);
    t('Latest stage', lastNamed ? stageLabel(lastNamed.stage) : (dated[0] ? stageLabel(dated[0].stage) : '—'), lastNamed && lastNamed.date ? d3.utcFormat('%b %Y')(new Date(lastNamed.date + 'T00:00:00Z')) : '');
    t('Last round', dated[0] ? d3.utcFormat('%b %Y')(new Date(dated[0].date + 'T00:00:00Z')) : '—', dated[0] ? `${Math.round((Date.now() - Date.parse(dated[0].date)) / 2629746000)} months ago` : '');
    t('Largest round', priced.length ? eur(d3.max(priced, (r) => r.amount)) : '—', priced.length ? stageLabel(priced.slice().sort((a, b) => b.amount - a.amount)[0].stage) : '');
    if (uni) t(uni[6] === 'current' ? 'Latest known valuation' : 'Peak valuation', `$${uni[2]}B`, `${uni[3] ? uni[3] + ' · ' : ''}per Wikipedia`);
    box.append(kf);
    // history
    box.append(el('h3', 'p-sec', 'Fundraising history'));
    if (!rounds.length) box.append(el('p', 'note', 'No disclosed funding rounds on record.'));
    else {
      const tb = el('div', 'tbox'); const tbl = document.createElement('table'); tb.append(tbl);
      const hr = tbl.createTHead().insertRow(); [['Date'], ['Stage'], ['Amount', 'num'], ['Investors'], ['Source', 'hide-sm']].forEach(([l, cl]) => { const th = document.createElement('th'); if (cl) th.className = cl; th.append(el('span', 'thl', l)); hr.append(th); });
      const body = tbl.createTBody();
      rounds.forEach((r) => {
        const tr = body.insertRow(); const td = (x, cl) => { const q = tr.insertCell(); if (cl) q.className = cl; q.textContent = x; return q; };
        td(r.date ? d3.utcFormat('%-d %b %Y')(new Date(r.date + 'T00:00:00Z')) : 'Undated'); td(stageLabel(r.stage)); td(r.amount ? eur(r.amount) : 'Undisclosed', 'num'); td(r.investors.join(', ') || '—', 'dim');
        const s = tr.insertCell(); s.className = 'hide-sm';
        if (r.url) { const a = el('a', null, r.origin === 'scan' ? (r.source || 'Source').split(',')[0] : 'Tech.eu'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; s.append(a); } else s.textContent = '—';
      });
      box.append(tb);
    }
    // investors (cap table)
    const invCount = new Map();
    rounds.slice().reverse().forEach((r) => r.investors.forEach((x) => { const k = x.trim(); if (!k || /^(undisclosed|existing (investors|shareholders)|private investors|angels?)$/i.test(k)) return; const o = invCount.get(k.toLowerCase()) || { name: k, n: 0, first: r.date }; o.n++; invCount.set(k.toLowerCase(), o); }));
    box.append(el('h3', 'p-sec', 'Investors on record'));
    box.append(el('p', 'note', 'Shareholdings (who owns what percentage) are not public for private companies, so a full cap table isn’t available. These are the investors named in its disclosed rounds, most frequent first.'));
    if (!invCount.size) box.append(el('p', 'note', 'No investors named.'));
    else { const ul = el('ul', 'inv-list'); [...invCount.values()].sort((a, b) => b.n - a.n || String(a.first).localeCompare(String(b.first))).forEach((o) => { const li = el('li'); li.append(el('b', null, o.name), el('span', null, ` ${o.n > 1 ? o.n + ' rounds' : '1 round'}${o.first ? ' · since ' + o.first.slice(0, 4) : ''}`)); ul.append(li); }); box.append(ul); }
    if (api && Array.isArray(api.founders) && api.founders.length) { box.append(el('h3', 'p-sec', 'Founders')); box.append(el('p', null, api.founders.map((f) => (typeof f === 'string' ? f : f.name)).filter(Boolean).join(', '))); }
    const src = el('p', 'note p-src');
    src.append(`Sources: ${api ? 'Tech.eu Funding Explorer (CC BY 4.0)' : 'TechCap Intelligence data'}${rounds.some((r) => r.origin === 'scan') ? ', daily multi-source scan' : ''}${uni ? ', valuation from Wikipedia’s list of unicorn companies' : ''}.${!api && c.origin !== 'scan' ? ' The live company profile could not be loaded just now, so this shows rounds from 2021 onwards only.' : ''}`);
    box.append(src);
  }

  // exits section
  async function loadExits() {
    if (exits) return exits;
    exits = await loadJSON('exits.json').then((j) => j.rows.map((r) => ({ id: r[0], date: r[1], type: r[2], value: r[3], acquirers: r[4], acq_country: r[5], company_id: r[6], company: r[7], country: r[8], url: r[9] }))).catch(() => []);
    return exits;
  }
  const EUROPE = new Set([...SCOPE, 'Türkiye', 'Ukraine', 'Serbia', 'Moldova']);
  async function renderExits() {
    const card = $('exitsCard');
    const all = await loadExits();
    if (!all.length) { card.hidden = true; return; }
    card.hidden = false;
    if (state.sector) await loadCompanies();
    const P = period();
    const rows = all.filter((e) => e.date >= P.from && e.date <= P.to && (!state.country || e.country === state.country) && (!state.sector || ((compById.get(e.company_id) || {}).sectors || []).includes(state.sector)));
    $('exitsNote').textContent = `Acquisitions, IPOs and other exits of European startups, ${P.label}${state.country ? ' · ' + state.country : ''}${state.sector ? ' · ' + state.sector : ''}. Most deal values are not disclosed.${state.sector ? ' Sector comes from the company’s funding profile, so exits of companies without one are left out.' : ''}`;
    const tiles = $('exitTiles'); tiles.replaceChildren();
    const tl = (h3, big, s) => { const d = el('div', 'tile'); d.append(el('h3', null, h3), el('div', 'big', big)); if (s) d.append(el('div', 'chg', s)); tiles.append(d); };
    const priced = rows.filter((e) => e.value);
    const foreign = rows.filter((e) => e.acq_country && !EUROPE.has(e.acq_country));
    const withC = rows.filter((e) => e.acq_country);
    tl('Exits', int(rows.length), '');
    tl('Acquisitions & mergers', int(rows.filter((e) => /acqui|merge/i.test(e.type)).length), '');
    tl('IPOs', int(rows.filter((e) => /ipo|spac|listing/i.test(e.type)).length), '');
    tl('Buyouts', int(rows.filter((e) => /buyout/i.test(e.type)).length), '');
    tl('Disclosed exit value', eur(d3.sum(priced, (e) => e.value)), `${int(priced.length)} of ${int(rows.length)} disclosed`);
    tl('Bought by non-European buyers', pct0(withC.length ? foreign.length / withC.length : null), `${int(foreign.length)} of ${int(withC.length)} with a known buyer HQ`);
    { const topBuyer = d3.rollups(rows.filter((e) => e.acquirers), (v) => v.length, (e) => e.acquirers).sort((a, b) => b[1] - a[1])[0];
      const hqTop = d3.rollups(withC, (v) => v.length, (e) => e.acq_country).sort((a, b) => b[1] - a[1])[0];
      takeaway('exitTake', rows.length ? [B(int(rows.length)), ' exits', hqTop ? [', most often to buyers based in ', B(hqTop[0]), ` (${pct0(hqTop[1] / withC.length)} of known buyers)`] : '', '.', withC.length >= 10 ? [' ', B(pct0(foreign.length / withC.length)), ' went outside Europe.'] : '', topBuyer && topBuyer[1] > 1 ? [' Most active acquirer: ', B(topBuyer[0]), ` (${topBuyer[1]} deals).`] : ''].flat() : null); }
    const ty = d3.rollups(rows, (v) => v.length, (e) => typeLabel(e.type)).sort((a, b) => b[1] - a[1]);
    rank($('exitTypes'), ty.map(([k, n]) => ({ label: k, value: n, valueText: int(n), sub: pct0(rows.length ? n / rows.length : null) })), css('--c3'));
    const aq = d3.rollups(rows.filter((e) => e.acquirers), (v) => ({ n: v.length, c: v[0].acq_country }), (e) => e.acquirers).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    rank($('exitBuyers'), aq.map(([k, o]) => ({ label: k, value: o.n, valueText: `${int(o.n)} deal${o.n > 1 ? 's' : ''}`, sub: o.c || '' })), css('--c4'));
    const hq = d3.rollups(withC, (v) => v.length, (e) => e.acq_country).sort((a, b) => b[1] - a[1]).slice(0, 10);
    rank($('exitHq'), hq.map(([k, n]) => ({ label: k, value: n, valueText: int(n), sub: pct0(withC.length ? n / withC.length : null), muted: !EUROPE.has(k) ? false : false })), css('--c2'));
    const t = $('exitTable'); t.replaceChildren();
    const hr = t.createTHead().insertRow(); [['Date'], ['Company'], ['Country'], ['Type'], ['Acquirer'], ['Acquirer HQ', 'hide-sm'], ['Value', 'num']].forEach(([l, cl]) => { const th = document.createElement('th'); if (cl) th.className = cl; th.append(el('span', 'thl', l)); hr.append(th); });
    const tb = t.createTBody();
    rows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, state.exShown || 100).forEach((e) => {
      const tr = tb.insertRow(); const td = (x, cl) => { const q = tr.insertCell(); if (cl) q.className = cl; q.textContent = x; return q; };
      td(d3.utcFormat('%-d %b %Y')(new Date(e.date + 'T00:00:00Z')));
      const c = tr.insertCell(); const b = el('button', 'linkish', e.company); b.type = 'button'; b.onclick = () => openProfile(e.company_id); c.append(b);
      td(e.country); td(typeLabel(e.type)); td(e.acquirers || (/ipo/i.test(e.type) ? 'Public listing' : 'Not disclosed'), 'dim'); td(e.acq_country || '—', 'hide-sm'); td(e.value ? eur(e.value) : 'Undisclosed', 'num');
    });
    $('exMore').hidden = rows.length <= (state.exShown || 100);
  }
  $('exMore').addEventListener('click', () => { state.exShown = (state.exShown || 100) + 200; renderExits(); });

  // ---------- compare countries ----------
  const CMP_MAX = 6;
  let periodAll = [], periodPrev = [];
  const cmpColors = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(css);
  function lines(box, series, buckets, opts) {
    box.replaceChildren();
    const W = Math.max(300, box.clientWidth), H = 300, m = { t: 16, r: 12, b: 26, l: 8 };
    const F = opts.fmt || eur;
    const ymax = d3.max(series, (s) => d3.max(s.vals)) || 1;
    const y = d3.scaleLinear([0, ymax * 1.08], [H - m.b, m.t]).nice(); const ticks = y.ticks(4);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', opts.label);
    const pr = svg.append('g').attr('font-size', 11); let tw = 0; ticks.forEach((t) => { const n = pr.append('text').text(F(t)); tw = Math.max(tw, n.node().getComputedTextLength()); n.remove(); }); pr.remove();
    m.l = tw + 10;
    const x = d3.scalePoint(buckets.map((b) => b.k), [m.l + 6, W - m.r - 6]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--line'));
    svg.append('g').attr('font-size', 11).attr('fill', css('--muted')).selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '.35em').attr('text-anchor', 'end').text(F);
    const every = Math.ceil(buckets.length / Math.max(1, Math.floor((W - m.l) / 56)));
    svg.append('g').attr('font-size', 11).attr('fill', css('--muted')).selectAll('text').data(buckets.filter((_, i) => i % every === 0)).join('text')
      .attr('x', (b) => x(b.k)).attr('y', H - 8).attr('text-anchor', 'middle').text((b) => b.label);
    const line = d3.line().x((_, i) => x(buckets[i].k)).y((v) => y(v));
    series.forEach((s) => {
      svg.append('path').attr('d', line(s.vals)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round');
      if (buckets.length <= 40) svg.append('g').selectAll('circle').data(s.vals).join('circle').attr('cx', (_, i) => x(buckets[i].k)).attr('cy', (v) => y(v)).attr('r', 2.6).attr('fill', s.color);
    });
    const guide = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--muted')).attr('stroke-dasharray', '3 3').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const step = x.step() || 1;
        const i = Math.max(0, Math.min(buckets.length - 1, Math.round((px - x(buckets[0].k)) / step)));
        guide.attr('x1', x(buckets[i].k)).attr('x2', x(buckets[i].k)).attr('opacity', 1);
        showTip(ev, [buckets[i].full, ...series.slice().sort((a, b) => b.vals[i] - a.vals[i]).map((s) => `${s.name}: ${F(s.vals[i])}`)]);
      })
      .on('mouseleave', () => { guide.attr('opacity', 0); hideTip(); });
  }
  function renderCompare() {
    const P = period(), sel = state.cmp;
    const chips = $('cmpChips'); chips.replaceChildren();
    const cs = cmpColors();
    sel.forEach((c, i) => {
      const b = el('button', 'chip'); b.type = 'button'; b.setAttribute('aria-label', `Remove ${c}`);
      const dot = el('span', 'dot'); dot.style.background = cs[i]; b.append(dot, c, el('span', 'x', '×'));
      b.onclick = () => { state.cmp = sel.filter((x) => x !== c); writeHash(); renderCompare(); };
      chips.append(b);
    });
    const base = periodAll.filter((r) => inScope(r.country) && (!state.sector || r.sectors.includes(state.sector)));
    const prevBase = periodPrev.filter((r) => inScope(r.country) && (!state.sector || r.sectors.includes(state.sector)));
    const ranked = d3.rollups(base, (v) => d3.sum(v, (r) => r.amount || 0), (r) => r.country).sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    fillSelect($('cmpAdd'), SCOPE.filter((c) => !sel.includes(c)), sel.length >= CMP_MAX ? `Up to ${CMP_MAX} countries` : '+ Add a country', '');
    $('cmpAdd').disabled = sel.length >= CMP_MAX;
    $('cmpNote').textContent = `${P.label}${P.inPeriod}${state.sector ? ' · ' + state.sector : ''}. Uses the Period and Sector filters above.`;
    const out = $('cmpOut');
    if (sel.length < 2) {
      out.replaceChildren();
      const e = el('div', 'empty'); e.append(`Pick at least two countries to compare. `);
      const q = el('button', 'linkish', `Compare the top 3 (${ranked.slice(0, 3).join(', ')})`); q.type = 'button'; q.onclick = () => { state.cmp = ranked.slice(0, 3); writeHash(); renderCompare(); };
      if (ranked.length >= 3) e.append(q);
      out.append(e); return;
    }
    out.replaceChildren();
    const all = d3.sum(base, (r) => r.amount || 0);
    const stats = sel.map((c, i) => {
      const v = base.filter((r) => r.country === c), pv = prevBase.filter((r) => r.country === c);
      const s = sum(v), ps = sum(pv);
      const named = v.filter((r) => !['Other', 'Debt', 'Grant', 'Crowdfunding', 'ICO'].includes(r.stage));
      const early = named.filter((r) => ['Pre-Seed', 'Seed'].includes(r.stage)).length;
      const late = named.filter((r) => ['Series B', 'Series C', 'Series D+', 'Growth/Late'].includes(r.stage)).length;
      const big = v.filter((r) => r.amount).sort((a, b) => b.amount - a.amount)[0];
      const top10 = d3.sum(v.filter((r) => r.amount).sort((a, b) => b.amount - a.amount).slice(0, 10), (r) => r.amount);
      const secs = d3.rollups(v.flatMap((r) => r.sectors.map((x) => [x, r.amount || 0])), (a) => d3.sum(a, (z) => z[1]), (z) => z[0]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const ex = (exits || []).filter((e) => e.country === c && e.date >= P.from && e.date <= P.to && (!state.sector || ((compById && compById.get(e.company_id)) || {}).sectors?.includes(state.sector)));
      const unis = (unicorns || []).filter((u) => u[6] === 'current' && u[5].split(', ').includes(c) && (!state.sector || (companies || []).some((co) => co.key === u[1] && co.sectors.includes(state.sector)))).length;
      const invs = new Set(v.flatMap((r) => r.investors.map((x) => x.trim().toLowerCase()))).size;
      return { c, color: cs[i], s, ps, early: named.length ? early / named.length : null, late: named.length ? late / named.length : null, big, conc: s.total ? top10 / s.total : null, secs,
        share: all ? s.total / all : null, exits: ex.length, unis, invs, growth: ps.total && !P.noPrev ? s.total / ps.total - 1 : null, rgrowth: ps.rounds && !P.noPrev ? s.rounds / ps.rounds - 1 : null };
    });
    { const lead = stats.slice().sort((a, b) => b.s.total - a.s.total)[0], fast = stats.filter((x) => x.growth != null).sort((a, b) => b.growth - a.growth)[0];
      const med = stats.filter((x) => x.s.median).sort((a, b) => b.s.median - a.s.median)[0], early = stats.filter((x) => x.early != null).sort((a, b) => b.early - a.early)[0];
      const parts = [B(lead.c), ` raised the most (${eur(lead.s.total)}`, stats.length > 1 && stats[1] ? `, ${(lead.s.total / (stats.filter((x) => x !== lead).sort((a, b) => b.s.total - a.s.total)[0].s.total || 1)).toFixed(1)}× the next country` : '', ').'];
      if (fast && fast.c !== lead.c && fast.growth > 0) parts.push(' Fastest-growing: ', B(fast.c), ` (${upDown(fast.growth)}).`); else if (fast) parts.push(' ', B(fast.c), ` also grew fastest (${upDown(fast.growth)}).`);
      if (med) parts.push(' Largest typical rounds: ', B(med.c), ` (median ${eur(med.s.median)}).`);
      if (early && early.early != null) parts.push(' Most early-stage-heavy: ', B(early.c), ` (${pct0(early.early)} pre-seed or seed).`);
      const tk = el('p', 'takeaway'); tk.append(el('span', 'tk-l', 'Insight')); parts.forEach((p) => tk.append(p)); out.append(tk); }
    // table: metrics as rows, countries as columns, best value highlighted
    const T = [
      ['Total disclosed funding', (x) => x.s.total, eur, 'max'],
      ['Share of European funding', (x) => x.share, pct, 'max'],
      [P.noPrev ? null : `Funding growth vs ${P.prevLabel}`, (x) => x.growth, (v) => v == null ? '—' : `${v >= 0 ? '+' : '−'}${d3.format('.1%')(Math.abs(v))}`, 'max'],
      ['Funding rounds', (x) => x.s.rounds, int, 'max'],
      [P.noPrev ? null : `Rounds growth vs ${P.prevLabel}`, (x) => x.rgrowth, (v) => v == null ? '—' : `${v >= 0 ? '+' : '−'}${d3.format('.1%')(Math.abs(v))}`, 'max'],
      ['Companies funded', (x) => x.s.companies, int, 'max'],
      ['Median disclosed round', (x) => x.s.median, eur, 'max'],
      ['Equity raised', (x) => x.s.equity, eur, 'max'],
      ['Debt share of funding', (x) => (x.s.total ? x.s.debt / x.s.total : null), pct0, null],
      ['Pre-seed and seed share of rounds', (x) => x.early, pct0, null],
      ['Series B+ share of rounds', (x) => x.late, pct0, null],
      ['Top 10 rounds’ share of funding', (x) => x.conc, pct0, null],
      ['Active investors (named in rounds)', (x) => x.invs, int, 'max'],
      ['Exits', (x) => x.exits, int, 'max'],
      ['Current unicorns', (x) => x.unis, int, 'max']
    ].filter((r) => r[0]);
    const tb = el('div', 'tbox cmp'); const t = document.createElement('table'); tb.append(t);
    const hr = t.createTHead().insertRow(); const th0 = document.createElement('th'); th0.append(el('span', 'thl', 'Metric')); hr.append(th0);
    stats.forEach((x) => { const th = document.createElement('th'); th.className = 'num'; const s = el('span', 'thl'); const d = el('span', 'dot'); d.style.background = x.color; s.append(d, x.c); th.append(s); hr.append(th); });
    const body = t.createTBody();
    T.forEach(([label, get, fmt, best]) => {
      const tr = body.insertRow(); tr.insertCell().textContent = label;
      const vals = stats.map(get); const top = best ? d3.max(vals.filter((v) => v != null && isFinite(v))) : null;
      vals.forEach((v) => { const td = tr.insertCell(); td.className = 'num' + (best && v != null && v === top && stats.length > 1 ? ' best' : ''); td.textContent = v == null || (typeof v === 'number' && !isFinite(v)) ? '—' : fmt(v); });
    });
    const tr2 = body.insertRow(); tr2.insertCell().textContent = 'Largest round';
    stats.forEach((x) => { const td = tr2.insertCell(); td.className = 'num dim'; td.textContent = x.big ? `${x.big.company}, ${eur(x.big.amount)}` : '—'; });
    const tr3 = body.insertRow(); tr3.insertCell().textContent = 'Top sectors';
    stats.forEach((x) => { const td = tr3.insertCell(); td.className = 'num dim'; td.textContent = x.secs.map((s) => s[0]).join(', ') || '—'; });
    out.append(tb);
    out.append(el('p', 'note', 'Bold marks the highest value in each row. Shares are of disclosed funding; rounds with no amount count in round numbers only. Unicorn counts come from Wikipedia’s list of unicorn companies, which is not exhaustive, and count a company under each country it is listed for. With a sector selected, only unicorns we can match to that sector are counted.'));
    // evolution lines
    const quarterly = P.months > 24;
    const keyOf = (date) => quarterly ? `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` : date.slice(0, 7);
    const ks = []; for (let mth = P.from.slice(0, 7); mth <= P.to.slice(0, 7); mth = addMonths(mth, 1)) { const k = keyOf(mth + '-01'); if (ks[ks.length - 1] !== k) ks.push(k); }
    const multiYear = P.from.slice(0, 4) !== P.to.slice(0, 4);
    const buckets = ks.map((k) => ({ k, label: quarterly ? `${k.slice(5)} ’${k.slice(2, 4)}` : `${MONTHS[Number(k.slice(5, 7)) - 1]}${multiYear ? ' ’' + k.slice(2, 4) : ''}`, full: quarterly ? `${k.slice(5)} ${k.slice(0, 4)}` : mLabel(k) }));
    const byRounds = state.cmpMetric === 'rounds';
    const head = el('div', 'card-head row'); head.append(el('h3', 'sub', `${byRounds ? 'Rounds' : 'Funding'} ${quarterly ? 'per quarter' : 'per month'}`));
    const sw = document.createElement('select'); sw.id = 'cmpMetric'; [['amount', 'Funding raised'], ['rounds', 'Number of rounds']].forEach(([v, l]) => sw.append(new Option(l, v))); sw.value = state.cmpMetric;
    sw.onchange = () => { state.cmpMetric = sw.value; renderCompare(); };
    const lab = el('label', null, 'Show '); lab.append(sw); head.append(lab); out.append(head);
    const series = stats.map((x) => {
      const g = new Map(d3.rollups(base.filter((r) => r.country === x.c), (v) => byRounds ? v.length : d3.sum(v, (r) => r.amount || 0), (r) => keyOf(r.date)));
      return { name: x.c, color: x.color, vals: ks.map((k) => g.get(k) || 0) };
    });
    const leg = el('div', 'legend'); stats.forEach((x) => { const s = el('span', null, x.c); s.style.setProperty('--sw', x.color); leg.append(s); }); out.append(leg);
    const ch = el('div', 'chart'); out.append(ch);
    lines(ch, series, buckets, { label: 'Country comparison over time', fmt: byRounds ? int : eur });
    // stage mix bars
    out.append(el('h3', 'sub mix-h', 'Stage mix (share of rounds with a named stage)'));
    const ST = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'Growth/Late'];
    const stc = (i) => css(['--c5', '--c1', '--c2', '--c3', '--c4', '--c6', '--fg'][i]);
    const mix = el('div', 'mix');
    stats.forEach((x) => {
      const v = base.filter((r) => r.country === x.c && ST.includes(r.stage));
      const row = el('div', 'mix-row'); row.append(el('span', 'mix-l', x.c));
      const bar = el('div', 'mix-bar');
      ST.forEach((s, i) => { const n = v.filter((r) => r.stage === s).length; if (!n) return; const seg = el('span'); seg.style.width = (100 * n / v.length) + '%'; seg.style.background = stc(i);
        seg.addEventListener('mousemove', (ev) => showTip(ev, [`${x.c} · ${s}`, `${int(n)} rounds (${pct0(n / v.length)})`])); seg.addEventListener('mouseleave', hideTip); bar.append(seg); });
      row.append(bar); mix.append(row);
    });
    const ml = el('div', 'legend'); ST.forEach((s, i) => { const sp = el('span', null, s); sp.style.setProperty('--sw', stc(i)); ml.append(sp); });
    out.append(mix, ml);
  }
  $('goCmp').addEventListener('click', () => {
    if (!state.cmp.length && state.country) { state.cmp = [state.country]; writeHash(); renderCompare(); }
    const top = $('cmpCard').getBoundingClientRect().top + scrollY - ($('cmpCard').closest('.wrap') ? document.querySelector('.bar').offsetHeight + 12 : 0);
    scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => $('cmpAdd').focus({ preventScroll: true }), 400);
  });
  $('cmpAdd').addEventListener('change', (e) => { const c = e.target.value; if (c && !state.cmp.includes(c) && state.cmp.length < CMP_MAX) { state.cmp = [...state.cmp, c]; writeHash(); renderCompare(); } });

  function setState(p) { Object.assign(state, p); if ('country' in p || 'sector' in p || 'year' in p) { state.stage = ''; } render(); }

  $('fYear').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'custom') {
      const now = todayISO().slice(0, 7);
      if (!state.from || !state.to) { state.to = now; state.from = `${Number(now.slice(0, 4)) - 2}-01`; }
      setState({ year: 'custom' });
    } else setState({ year: v });
  });
  const clampRange = () => {
    const lo = `${firstYear}-01`, hi = todayISO().slice(0, 7);
    let f = $('fFrom').value || lo, t = $('fTo').value || hi;
    if (f < lo) f = lo; if (t > hi) t = hi; if (f > hi) f = hi; if (t < lo) t = lo;
    if (f > t) [f, t] = [t, f];
    return [f, t];
  };
  ['fFrom', 'fTo'].forEach((id) => $(id).addEventListener('change', () => { const [f, t] = clampRange(); setState({ year: 'custom', from: f, to: t }); }));
  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const hi = todayISO().slice(0, 7), k = Number(b.dataset.range);
    const f = k ? addMonths(hi, -(k - 1)) : `${firstYear}-01`;
    setState({ year: 'custom', from: f < `${firstYear}-01` ? `${firstYear}-01` : f, to: hi });
  }));
  $('evoMode').addEventListener('change', (e) => { state.evo = e.target.value; renderEvolution(curRows); });
  let firstYear = '2021';
  $('fCountry').addEventListener('change', (e) => setState({ country: e.target.value }));
  $('fSector').addEventListener('change', (e) => setState({ sector: e.target.value }));
  $('reset').addEventListener('click', () => { state.q = ''; $('fQ').value = ''; state.min = 0; $('fMin').value = '0'; state.from = ''; state.to = ''; setState({ country: '', sector: '', year: String(new Date().getUTCFullYear() - (new Date().getUTCMonth() < 2 ? 1 : 0)) }); });
  $('fMin').addEventListener('change', (e) => { state.min = Number(e.target.value); state.shown = 150; renderRounds(); });
  $('fStage').addEventListener('change', (e) => { state.stage = e.target.value; state.shown = 150; renderRounds(); });
  $('fQ').addEventListener('input', (e) => { state.q = e.target.value; state.shown = 150; renderRounds(); });
  $('more').addEventListener('click', () => { state.shown += 300; renderRounds(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { mapPaths = null; $('map').replaceChildren(); render(); }, 250); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

  (async () => {
    try {
      const joinDlg = $('join'), sub = $('subscribe'), cls = $('joinClose');
      // Load the Beehiiv form only once the pop-up is open, so it renders at its real size.
      const loadForm = () => {
        const box = $('joinForm'); if (!box || box.dataset.loaded) return; box.dataset.loaded = '1';
        const s = document.createElement('script'); s.async = true; s.src = 'https://subscribe-forms.beehiiv.com/v3/loader.js';
        s.setAttribute('data-beehiiv-form', 'e144240e-0ef7-48e0-849a-57f2a25f4973'); box.append(s);
      };
      const openJoin = () => { joinDlg.showModal(); requestAnimationFrame(loadForm); };
      if (joinDlg && sub && joinDlg.showModal) {
        sub.addEventListener('click', openJoin);
        if (cls) cls.addEventListener('click', () => joinDlg.close());
        joinDlg.addEventListener('click', (e) => { if (e.target === joinDlg) joinDlg.close(); });
        if (location.hash.includes('join')) openJoin();
      }
    } catch (e) { /* the form pop-up must never stop the data from loading */ }
    try { meta = await loadJSON('meta.json'); } catch { meta = null; }
    try { cube = (await loadJSON('cube.json')).rows; } catch { cube = null; }
    try { ann = (await loadJSON('announcements.json')).rows || []; } catch { ann = []; }
    try { const it = await loadJSON('investors.json'); invTypes = Object.fromEntries((it.rows || []).map((r) => [String(r[0]).toLowerCase(), r[1]])); } catch { invTypes = null; }
    const years = meta && meta.years ? Object.keys(meta.years).sort().reverse() : [String(new Date().getUTCFullYear())];
    const thisY = String(new Date().getUTCFullYear());
    fillSelect($('fYear'), [...years, 'custom'], null, null, (y) => y === 'custom' ? 'Custom range…' : y === thisY ? `${y} (year to date)` : y);
    firstYear = years[years.length - 1];
    $('fFrom').min = $('fTo').min = `${firstYear}-01`; $('fFrom').max = $('fTo').max = todayISO().slice(0, 7);
    const h = readHash();
    const okM = (m) => /^\d{4}-\d{2}$/.test(m) && m >= `${firstYear}-01` && m <= todayISO().slice(0, 7);
    if (h.year === 'custom' && okM(h.from) && okM(h.to)) { state.year = 'custom'; [state.from, state.to] = h.from <= h.to ? [h.from, h.to] : [h.to, h.from]; }
    else state.year = years.includes(h.year) ? h.year : years[0];
    state.country = SCOPE.includes(h.country) ? h.country : '';
    state.sector = h.sector || '';
    state.cmp = h.cmp.filter((c) => SCOPE.includes(c)).slice(0, CMP_MAX);
    $('fYear').value = state.year;
    if (meta && meta.updated) $('updated').textContent = `Data updated ${d3.timeFormat('%-d %B %Y, %H:%M')(new Date(meta.updated))} · ${int(d3.sum(Object.values(meta.years)))} rounds since ${years[years.length - 1]}${meta.scan_added && d3.sum(Object.values(meta.scan_added)) ? ` · ${int(d3.sum(Object.values(meta.scan_added)))} added from sources beyond Tech.eu` : ''}`;
    await render();
  })();
})();
