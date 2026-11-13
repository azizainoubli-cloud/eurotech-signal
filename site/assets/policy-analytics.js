// TechCap Intelligence — Policy & Capital analytics. Pure functions, no DOM: used by the policy page in the
// browser and by scripts/policy/analytics.mjs in the build (same logic, same numbers).
//
// Evidence levels used throughout (never mixed):
//   direct      the round names an EU institution or EU instrument as investor (EIC Fund, EIF, EIB, Scaleup Europe Fund...)
//   documented  the round names a national public investor (national promotional bank or agency)
//   association a statistical pattern in round data (e.g. a sector's funding before/after a policy date); not causal
//   influence   a policy targets a sector; whether it moved capital is not shown by the data

export const SCOPE = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Norway','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','Switzerland','UK'];
export const VC_STAGES = new Set(['Pre-Seed', 'Seed', 'Early VC', 'Series A', 'Series B', 'Series C', 'Series D+', 'Growth/Late', 'Other']);
export const STAGE_ORDER = ['Pre-Seed', 'Seed', 'Early VC', 'Series A', 'Series B', 'Series C', 'Series D+', 'Growth/Late', 'Other'];

// Investor-name rules. Case-sensitive acronyms avoid false hits (e.g. "Eiffel" is not EIF, "Horizon Capital" is not Horizon Europe).
export const EU_INVESTORS = [
  ['EIC / EIC Fund', /\b(European Innovation Council|EIC)\b/],
  ['European Investment Fund', /\b(European Investment Fund|EIF)\b/],
  ['European Investment Bank', /\b(European Investment Bank|EIB)\b/],
  ['European Commission programmes', /\b(European Commission|Horizon Europe|Horizon 2020|InvestEU|Scale-?[Uu]p Europe Fund|European Tech Champions|ETCI)\b/],
];
export const NATIONAL_INVESTORS = [
  ['Bpifrance (FR)', /\b(Bpifrance|BPI France|BPI)\b/],
  ['KfW / KfW Capital (DE)', /\bKfW\b/],
  ['High-Tech Gründerfonds (DE)', /\b(High-Tech Gründerfonds|HTGF)\b/],
  ['Regional public funds (DE)', /\b(Bayern Kapital|IBB Ventures|IBB Capital|NRW\.BANK|NRW\.Bank|Technologie ?[Gg]ründerfonds Sachsen|TGFS)\b/],
  ['UK public funders (UK)', /\b(Innovate UK|UK Research and Innovation|UKRI|UK Government|UK Space Agency|British Business Bank|British Patient Capital|Scottish Enterprise|Scottish National Investment Bank|Development Bank of Wales|Midlands Engine Investment Fund|MEIF)\b/],
  ['CDP Venture Capital (IT)', /\bCDP Venture/],
  ['Spanish public funders (ES)', /\b(CDTI|ENISA|Enisa|AXIS)\b/],
  ['Invest-NL (NL)', /\bInvest-NL\b/],
  ['Enterprise Ireland (IE)', /\bEnterprise Ireland\b/],
  ['Nordic public funders', /\b(Almi Invest|Industrifonden|Business Finland|Tesi|Finnish Industry Investment|EIFO|Export and Investment Fund of Denmark|Vækstfonden|Innovation Norway|Investinor|Nysnø)\b/],
  ['Belgian public funders (BE)', /\b(PMV|SFPIM|SFPI|Wallonie Entreprendre)\b/],
  ['aws (AT)', /\b(aws Gründerfonds|Austria Wirtschaftsservice)\b/],
  ['Portuguese public funders (PT)', /\b(Portugal Ventures|Banco Português de Fomento)\b/],
  ['SmartCap (EE)', /\bSmartCap\b/],
  ['Innosuisse (CH)', /\bInnosuisse\b/],
];
// Placeholder names in announcements ("existing investors", "business angels"…) are not investors to rank.
export const GENERIC = /^(the )?(existing|new|other|several|various|private|undisclosed|unnamed|local|strategic|individual)?\s*(shareholders?|investors?|backers?|business angels?|angel investors?|angels?|family offices?|founders?|employees)( and .*)?$/i;
export function publicInvestors(names) {
  const eu = [], nat = [], euBodies = new Set(), natBodies = new Set();
  for (const n of names || []) {
    const e = EU_INVESTORS.find(([, re]) => re.test(n)); if (e) { eu.push(n); euBodies.add(e[0]); continue; }
    const m = NATIONAL_INVESTORS.find(([, re]) => re.test(n)); if (m) { nat.push(n); natBodies.add(m[0]); }
  }
  return { eu, nat, euBodies: [...euBodies], natBodies: [...natBodies] };
}

const ym = (d) => d.slice(0, 7);
const addMonths = (iso, k) => { const [y, m] = iso.slice(0, 7).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + k, 1)); return t.toISOString().slice(0, 7); };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const growth = (a, b) => (b > 0 ? a / b - 1 : null);

// Policy exposure of a sector: how many frameworks and programmes name it (cross-sector records are not counted).
export function exposure(frameworks, programmes) {
  const m = new Map();
  const live = (s) => s !== 'completed';
  for (const f of frameworks) if (live(f.status)) for (const s of f.sectors || []) { const v = m.get(s) || { frameworks: [], programmes: [] }; v.frameworks.push(f.id); m.set(s, v); }
  for (const pr of programmes) for (const s of pr.sectors || []) if (s !== 'All') { const v = m.get(s) || { frameworks: [], programmes: [] }; v.programmes.push(pr.id); m.set(s, v); }
  return m;
}

export function analyse(allRounds, { frameworks = [], programmes = [], filters = {}, strategic = [] } = {}) {
  const f = filters;
  const scope = new Set(SCOPE);
  // The market benchmark ignores the sector filter, so a sector is always compared with the whole market.
  const market = allRounds.filter((r) => scope.has(r.country) && (!f.country || r.country === f.country) && (!f.stage || r.stage === f.stage));
  const rounds = allRounds.filter((r) => scope.has(r.country) && (!f.country || r.country === f.country) && (!f.sector || r.sectors.includes(f.sector)) && (!f.stage || r.stage === f.stage));
  const asOf = rounds.reduce((m, r) => (r.date > m ? r.date : m), '0000');
  const strat = new Set(strategic);
  // Rolling windows to the day: last 12 months = (asOf - 365d, asOf], previous = the 365 days before that.
  const shift = (d) => new Date(Date.parse(asOf) - d * 864e5).toISOString().slice(0, 10);
  const lastFrom = shift(365), prevFrom = shift(730);
  const inLast = (r) => r.date > lastFrom, inPrev = (r) => r.date > prevFrom && r.date <= lastFrom;

  const years = new Map();
  const sec = new Map(), cty = new Map(), stg = new Map(), coInv = new Map(), euBody = new Map(), natBody = new Map();
  const monthsBySector = new Map(), monthsAll = new Map();
  const euRounds = [];
  const Y = (y) => years.get(y) || years.set(y, { year: y, vc_eur: 0, vc_n: 0, grant_eur: 0, grant_n: 0, debt_eur: 0, debt_n: 0, eu_n: 0, eu_eur: 0, nat_n: 0, nat_eur: 0, strat_eur: 0, strat_n: 0 }).get(y);
  const S = (map, k) => map.get(k) || map.set(k, { key: k, vc_eur: 0, vc_n: 0, last_eur: 0, last_n: 0, prev_eur: 0, prev_n: 0, eu_n: 0, eu_eur: 0, nat_n: 0, grant_n: 0, grant_eur: 0, pub_last_n: 0, sizes_last: [] }).get(k);

  for (const r of rounds) {
    const y = Y(r.date.slice(0, 4));
    const isVC = VC_STAGES.has(r.stage), isGrant = r.stage === 'Grant', isDebt = r.stage === 'Debt';
    const amt = r.amount || 0;
    const pub = publicInvestors(r.investors);
    const hasEU = pub.eu.length > 0, hasNat = pub.nat.length > 0;
    if (isVC) { y.vc_eur += amt; y.vc_n++; if (r.sectors.some((s) => strat.has(s))) { y.strat_eur += amt; y.strat_n++; } }
    if (isGrant) { y.grant_eur += amt; y.grant_n++; }
    if (isDebt) { y.debt_eur += amt; y.debt_n++; }
    if (hasEU) { y.eu_n++; y.eu_eur += amt; }
    if (hasNat) { y.nat_n++; y.nat_eur += amt; }
    const keys = [[sec, r.sectors.length ? r.sectors : ['Unclassified']], [cty, [r.country]]];
    for (const [map, ks] of keys) for (const k of ks) {
      const s = S(map, k);
      if (isVC) {
        s.vc_eur += amt; s.vc_n++;
        if (inLast(r)) { s.last_eur += amt; s.last_n++; if (amt) s.sizes_last.push(amt); if (hasEU || hasNat) s.pub_last_n++; }
        else if (inPrev(r)) { s.prev_eur += amt; s.prev_n++; }
      }
      if (hasEU) { s.eu_n++; s.eu_eur += amt; }
      if (hasNat) s.nat_n++;
      if (isGrant) { s.grant_n++; s.grant_eur += amt; }
    }
    if (isVC) for (const s of r.sectors) { const mm = monthsBySector.get(s) || new Map(); const k = ym(r.date); mm.set(k, (mm.get(k) || 0) + amt); monthsBySector.set(s, mm); }
    if (isVC || isGrant || isDebt) {
      const st = stg.get(r.stage) || stg.set(r.stage, { stage: r.stage, n: 0, eur: 0, eu_n: 0, nat_n: 0, pub_eur: 0 }).get(r.stage);
      st.n++; st.eur += amt; if (hasEU) st.eu_n++; if (hasNat) st.nat_n++; if (hasEU || hasNat) st.pub_eur += amt;
    }
    if (hasEU) {
      for (const b of pub.euBodies) euBody.set(b, (euBody.get(b) || 0) + 1);
      for (const n of r.investors) if (!pub.eu.includes(n) && !pub.nat.includes(n) && !GENERIC.test(n)) coInv.set(n, (coInv.get(n) || 0) + 1);
      euRounds.push({ date: r.date, company: r.company, company_id: r.company_id, country: r.country, sectors: r.sectors, stage: r.stage, amount: r.amount, public: pub.eu, national: pub.nat, private: r.investors.filter((n) => !pub.eu.includes(n) && !pub.nat.includes(n)), url: r.url, origin: r.origin });
    }
    if (hasNat) for (const b of pub.natBodies) natBody.set(b, (natBody.get(b) || 0) + 1);
  }

  const exp = exposure(frameworks, programmes);
  const sectors = [...sec.values()].filter((s) => s.key !== 'Unclassified').map((s) => {
    const e = exp.get(s.key) || { frameworks: [], programmes: [] };
    return { sector: s.key, vc_eur: s.vc_eur, vc_n: s.vc_n, last_eur: s.last_eur, last_n: s.last_n, prev_eur: s.prev_eur, prev_n: s.prev_n,
      growth: growth(s.last_eur, s.prev_eur), median_last: median(s.sizes_last), eu_n: s.eu_n, eu_eur: s.eu_eur, nat_n: s.nat_n,
      grant_n: s.grant_n, grant_eur: s.grant_eur, pub_share_last: s.last_n ? s.pub_last_n / s.last_n : null,
      exposure: e.frameworks.length + e.programmes.length, frameworks: e.frameworks, programmes: e.programmes, strategic: strat.has(s.key) };
  });
  const totLast = sectors.reduce((a, s) => a + s.last_eur, 0) || 1;
  for (const r of market) if (VC_STAGES.has(r.stage)) { const k = ym(r.date); monthsAll.set(k, (monthsAll.get(k) || 0) + (r.amount || 0)); }
  const allLast = market.filter((r) => VC_STAGES.has(r.stage) && inLast(r)).reduce((a, r) => a + (r.amount || 0), 0);
  const allPrev = market.filter((r) => VC_STAGES.has(r.stage) && inPrev(r)).reduce((a, r) => a + (r.amount || 0), 0);
  const mGrowth = growth(allLast, allPrev);
  for (const s of sectors) { s.share_last = s.last_eur / totLast; s.rel_growth = s.growth == null || mGrowth == null ? null : (1 + s.growth) / (1 + mGrowth) - 1; }

  // Gap view: sectors with policy exposure at or above the median, whose funding lags the market (descriptive flag only).
  const expMed = median(sectors.filter((s) => s.exposure > 0).map((s) => s.exposure)) || 1;
  for (const s of sectors) s.gap = s.exposure >= expMed && s.last_n >= 10 && s.rel_growth != null && s.rel_growth < -0.15 ? 'lagging' : s.exposure >= expMed && s.rel_growth != null && s.rel_growth > 0.15 ? 'outpacing' : s.exposure === 0 && s.share_last > 0.03 ? 'market-led' : null;

  // Event study: VC into a framework's sectors in the 12 months before vs after its key date, relative to the whole market.
  const sumRange = (mm, a, b) => { let t = 0; for (const [k, v] of mm) if (k >= a && k <= b) t += v; return t; };
  const events = [];
  for (const fw of frameworks) {
    const date = fw.in_force || fw.published; const secs = (fw.sectors || []).filter((s) => monthsBySector.has(s));
    if (!date || !secs.length || secs.length > 4 || date < '2022-01-01') continue;
    const m0 = date.slice(0, 7), bA = addMonths(m0, -12), bB = addMonths(m0, -1), aA = addMonths(m0, 1), aB = addMonths(m0, 12);
    const complete = aB <= ym(asOf);
    const merged = new Map(); for (const s of secs) for (const [k, v] of monthsBySector.get(s)) merged.set(k, (merged.get(k) || 0) + v);
    const before = sumRange(merged, bA, bB), after = sumRange(merged, aA, aB);
    const mb = sumRange(monthsAll, bA, bB), ma = sumRange(monthsAll, aA, aB);
    const g = growth(after, before), mg = growth(ma, mb);
    events.push({ framework: fw.id, name: fw.short || fw.name, date, date_kind: fw.in_force ? 'in force' : 'published', sectors: secs, before, after, growth: g, market_growth: mg,
      relative: g == null || mg == null ? null : (1 + g) / (1 + mg) - 1, complete, window: `${bA} to ${bB} vs ${aA} to ${aB}`, evidence: 'association' });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : 1));

  const yearsArr = [...years.values()].sort((a, b) => (a.year < b.year ? -1 : 1));
  for (const y of yearsArr) { y.strat_share = y.vc_eur ? y.strat_eur / y.vc_eur : null; y.pub_share = y.vc_n ? (y.eu_n + y.nat_n) / (y.vc_n + y.grant_n + y.debt_n) : null; }
  const vcAll = rounds.filter((r) => VC_STAGES.has(r.stage) && r.amount);
  return {
    asOf, lastFrom, prevFrom, market_growth: mGrowth, years: yearsArr, sectors: sectors.sort((a, b) => b.last_eur - a.last_eur),
    countries: [...cty.values()].map((c) => ({ country: c.key, vc_eur: c.vc_eur, vc_n: c.vc_n, last_eur: c.last_eur, last_n: c.last_n, growth: growth(c.last_eur, c.prev_eur), eu_n: c.eu_n, eu_eur: c.eu_eur, nat_n: c.nat_n, grant_n: c.grant_n, grant_eur: c.grant_eur, pub_share_last: c.last_n ? c.pub_last_n / c.last_n : null })).sort((a, b) => b.last_eur - a.last_eur),
    stages: STAGE_ORDER.concat(['Grant', 'Debt']).map((s) => stg.get(s)).filter(Boolean),
    eu_bodies: [...euBody].sort((a, b) => b[1] - a[1]), national_bodies: [...natBody].sort((a, b) => b[1] - a[1]),
    co_investors: [...coInv].sort((a, b) => b[1] - a[1]).slice(0, 25),
    eu_rounds: euRounds.sort((a, b) => (a.date < b.date ? 1 : -1)),
    eu_round_median: median(euRounds.filter((r) => r.amount && VC_STAGES.has(r.stage)).map((r) => r.amount)), vc_median: median(vcAll.map((r) => r.amount)),
    events, n_rounds: rounds.length,
  };
}

// ---------- Policy scorecard ----------
// Question: after a policy's key date, did the indicator linked to its goal move more in the EU than in a comparison
// group outside EU rules (UK and Switzerland)? Same windows, same indicator, both groups. Method in full on the page
// (Methodology) and in site/data/policy/scorecard.json. Evidence level: statistical association, never causation.
export const EU27 = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const shiftMonths = (d, k) => { const t = new Date(d + 'T00:00:00Z'); const day = t.getUTCDate(); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + k); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); return iso(t); };
const monthsDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 / 12 * 864e5);

// Which rounds an indicator counts: a sector list (any match) and/or a minimum round size.
export function indicatorTest(match = {}) {
  const secs = match.sectors && match.sectors.length ? new Set(match.sectors) : null;
  const min = match.min_amount_eur || 0;
  return (r) => (!secs || r.sectors.some((s) => secs.has(s))) && (!min || (r.amount || 0) >= min);
}
// Share of a group's VC rounds (count, and € as a cross-check) that the indicator counts, in [from, to).
export function shareIn(vc, countries, test, from, to) {
  let N = 0, n = 0, E = 0, e = 0;
  for (const r of vc) {
    if (r.date < from || r.date >= to || !countries.has(r.country)) continue;
    N++; E += r.amount || 0;
    if (test(r)) { n++; e += r.amount || 0; }
  }
  return { n, N, share: N ? n / N : null, eur: e, eur_total: E, eur_share: E ? e / E : null };
}
const ratio = (a1, a0, b1, b0) => (a0 && b0 && b1 != null && a1 != null && b1 / b0 > 0 ? (a1 / a0) / (b1 / b0) - 1 : null);

// Compare one indicator around one date. cfg = scorecard.json settings.
export function compare(vc, test, date, asOf, groups, cfg) {
  const W = cfg.window_months, from = shiftMonths(date, -W), end0 = shiftMonths(date, W), end = end0 < asOf ? end0 : shiftMonths(asOf, 0) + 'T';
  const months_after = Math.max(0, Math.min(W, Math.floor(monthsDiff(date, asOf))));
  const g0 = shareIn(vc, groups.target, test, from, date), g1 = shareIn(vc, groups.target, test, date, end);
  const c0 = shareIn(vc, groups.comparison, test, from, date), c1 = shareIn(vc, groups.comparison, test, date, end);
  const rel = ratio(g1.share, g0.share, c1.share, c0.share), rel_eur = ratio(g1.eur_share, g0.eur_share, c1.eur_share, c0.eur_share);
  const min_n = Math.min(g0.n, g1.n, c0.n, c1.n);
  return { window: { before: [from, shiftMonths(date, -0)], after: [date, end0 < asOf ? end0 : asOf], months_after }, target: [g0, g1], comparison: [c0, c1], rel, rel_eur, min_n };
}

export function verdictOf(x, cfg, fit = 'good', noise = null) {
  const t = cfg.thresholds;
  if (x.window.before[0] < cfg.data_start) return { verdict: 'no-baseline', confidence: null };
  if (x.window.months_after < cfg.min_months_after) return { verdict: 'early', confidence: null };
  if (x.min_n < t.min_rounds || x.rel == null) return { verdict: 'insufficient', confidence: null };
  const verdict = x.rel > t.band ? 'ahead' : x.rel < -t.band ? 'behind' : 'inline';
  // € cross-check: for ahead/behind, the € comparison must point the same way; for in line, it must not show a large gap.
  const eurAgrees = x.rel_eur != null && (verdict === 'inline' ? Math.abs(x.rel_eur) <= t.eur_inline_tolerance : Math.sign(x.rel_eur) === Math.sign(x.rel));
  let level = x.min_n >= t.high_rounds && eurAgrees ? 2 : x.min_n >= t.medium_rounds && eurAgrees ? 1 : 0;
  if (fit === 'partial') level = Math.max(0, level - 1);
  // An ahead/behind gap that chance alone produces in 1 test out of 10 (placebo 90th percentile) counts one level lower.
  const beyondNoise = verdict === 'inline' || noise == null ? null : Math.abs(x.rel) > noise;
  if (beyondNoise === false) level = Math.max(0, level - 1);
  return { verdict, confidence: ['Low', 'Medium', 'High'][level], eur_agrees: eurAgrees, beyond_noise: beyondNoise };
}

// Score every indicator in scorecard.json. opts.country narrows the target group to one EU country.
export function scorecard(rounds, cfg, frameworks, opts = {}) {
  const vc = rounds.filter((r) => VC_STAGES.has(r.stage));
  const asOf = rounds.reduce((m, r) => (r.date > m ? r.date : m), '0000');
  const target = new Set(opts.country ? [opts.country] : EU27);
  const groups = { target, comparison: new Set(cfg.comparison.countries) };
  const fw = new Map(frameworks.map((f) => [f.id, f]));
  const cards = cfg.indicators.map((s) => {
    const f = fw.get(s.framework) || {};
    const date = s.date || f.in_force || f.published;
    const date_kind = s.date ? s.date_kind : f.in_force ? 'entered into force' : 'adopted / published';
    if (!date) return { ...s, name: f.short || f.name || s.framework, verdict: 'no-date' };
    const x = compare(vc, indicatorTest(s.match), date, asOf, groups, cfg);
    return { ...s, name: f.short || f.name || s.framework, status: f.status, date, date_kind, ...x, ...verdictOf(x, cfg, s.fit, opts.noise) };
  });
  return { asOf, target: opts.country || 'EU27', comparison: cfg.comparison.countries, cards };
}

// Calibration ("placebo" test): the same comparison for every sector at dates when no tracked policy applied to it.
// Shows how far EU and comparison shares drift apart by chance, which is what the ±band has to clear.
export function placebo(rounds, cfg, frameworks) {
  const vc = rounds.filter((r) => VC_STAGES.has(r.stage));
  const asOf = rounds.reduce((m, r) => (r.date > m ? r.date : m), '0000');
  const groups = { target: new Set(EU27), comparison: new Set(cfg.comparison.countries) };
  const W = cfg.window_months, first = shiftMonths(cfg.data_start, W), last = shiftMonths(asOf, -W);
  const dates = []; for (let d = first; d <= last; d = shiftMonths(d, 3)) dates.push(d);
  // Leave out every sector that a scored policy measures, within the window around that policy's date.
  const fwDate = new Map(frameworks.map((f) => [f.id, f.in_force || f.published]));
  const covered = (sector, d) => cfg.indicators.some((s) => { const fd = s.date || fwDate.get(s.framework); return fd && (s.match.sectors || []).includes(sector) && Math.abs(monthsDiff(fd, d)) < 2 * W; });
  const sectors = [...new Set(vc.flatMap((r) => r.sectors))].filter(Boolean);
  const rels = [];
  for (const s of sectors) for (const d of dates) {
    if (covered(s, d)) continue;
    const x = compare(vc, indicatorTest({ sectors: [s] }), d, asOf, groups, cfg);
    if (x.min_n >= cfg.thresholds.medium_rounds && x.rel != null) rels.push({ sector: s, date: d, rel: x.rel });
  }
  const abs = rels.map((r) => Math.abs(r.rel)).sort((a, b) => a - b);
  const q = (p) => (abs.length ? abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] : null);
  return { tests: rels.length, dates, within_band: abs.length ? abs.filter((v) => v <= cfg.thresholds.band).length / abs.length : null, median_abs: q(0.5), p80_abs: q(0.8), p90_abs: q(0.9) };
}

// Follow-on funding: companies whose round names an EU-level investor (e.g. the EIC) vs other EU companies in the same
// sectors without one. Share that raise another round within N months, and the median size of that next round.
export function followOn(rounds, { investor = /\b(European Innovation Council|EIC)\b/, sectors = [], months = 24, since = '2021-01-01' } = {}) {
  const vc = rounds.filter((r) => VC_STAGES.has(r.stage) && EU27.includes(r.country) && r.company_id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const asOf = rounds.reduce((m, r) => (r.date > m ? r.date : m), '0000');
  const cutoff = shiftMonths(asOf, -months);
  const secs = new Set(sectors);
  const byCo = new Map(); for (const r of vc) (byCo.get(r.company_id) || byCo.set(r.company_id, []).get(r.company_id)).push(r);
  const res = { backed: { companies: 0, followed: 0, next_sizes: [] }, peers: { companies: 0, followed: 0, next_sizes: [] } };
  for (const list of byCo.values()) {
    const anyPublicEU = list.some((r) => publicInvestors(r.investors).eu.length);
    const i = list.findIndex((r) => r.investors.some((n) => investor.test(n)));
    let g, k;
    if (i >= 0) { g = res.backed; k = i; }
    else if (!anyPublicEU) { k = list.findIndex((r) => r.date >= since && (!secs.size || r.sectors.some((s) => secs.has(s)))); if (k < 0) continue; g = res.peers; }
    else continue;
    const a = list[k];
    if (a.date < since || a.date > cutoff) continue;
    g.companies++;
    const lim = shiftMonths(a.date, months);
    const nx = list.slice(k + 1).find((r) => r.date > a.date && r.date <= lim);
    if (nx) { g.followed++; if (nx.amount) g.next_sizes.push(nx.amount); }
  }
  for (const g of [res.backed, res.peers]) { g.rate = g.companies ? g.followed / g.companies : null; g.median_next = median(g.next_sizes); g.disclosed_next = g.next_sizes.length; delete g.next_sizes; }
  return { months, since, cutoff, asOf, ...res };
}
