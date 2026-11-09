// Policy & Capital Intelligence: incremental ingestion.
// Reads scripts/policy/sources.json, checks each source when it is due, and writes to site/data/policy/:
//   developments.json  new items from official feeds (status unverified until the analyst task reviews them)
//   calls.json         open and forthcoming EU calls from the Funding & Tenders Portal
//   changes.json       append-only history: every field that changed on a call or development, with old and new value
//   ingest-state.json  per-source last check, last success and seen item fingerprints (incremental runs)
//   ingest-log.json    one entry per run: per-source status, counts and errors (last 120 runs kept)
// Curated records (frameworks.json, programmes.json) are never modified here; the link check only annotates them.
import path from 'node:path';
import { readJSON, writeJSON, p, fetchText, parseFeed, classify, hash, normUrl, normTitle, nowIso, isoDay, RELEVANT, STRICT } from './lib.mjs';

const CONFIG = path.resolve(process.env.POLICY_CONFIG || 'scripts/policy/sources.json');
const NOW = process.env.POLICY_NOW ? new Date(process.env.POLICY_NOW) : new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const FORCE = process.env.POLICY_FORCE === '1';
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

function due(src, st) {
  if (FORCE || !st || !st.last_checked) return true;
  return (NOW - Date.parse(st.last_checked)) / 36e5 >= (src.every_hours || 20);
}

// ---------- RSS adapter ----------
async function runRss(src, ctx) {
  const xml = await fetchText(src.url);
  const items = parseFeed(xml);
  if (!items.length && !/<(rss|feed)[\s>]/i.test(xml)) throw new Error('response is not an RSS/Atom feed');
  const out = { fetched: items.length, relevant: 0, new: 0, update: 0, duplicate: 0, historical: 0, skipped: 0 };
  for (const it of items) {
    const text = `${it.title} ${it.summary}`;
    if (!(src.strict ? STRICT : RELEVANT).test(text)) { out.skipped++; continue; }
    out.relevant++;
    const urlKey = hash(normUrl(it.link));
    const titleKey = normTitle(it.title);
    const date = it.date || TODAY;
    const existing = ctx.byHash.get(urlKey);
    if (existing) {
      if (normTitle(existing.headline) !== titleKey && existing.origin === 'feed') {
        ctx.change('development', existing.id, 'headline', existing.headline, it.title, src.id);
        existing.headline = it.title; existing.status = 'update'; existing.record_updated = nowIso(); existing.version = (existing.version || 1) + 1;
        out.update++;
      }
      continue; // already known: incremental
    }
    // Same story published elsewhere (another feed or the analyst file) within 14 days -> duplicate, not a new record.
    const dup = ctx.devs.find((d) => normTitle(d.headline) === titleKey && days(d.date, date) <= 14);
    if (dup) {
      dup.also_reported = [...new Set([...(dup.also_reported || []), it.link])];
      ctx.byHash.set(urlKey, dup); out.duplicate++; continue;
    }
    const c = classify(text);
    const historical = days(date, TODAY) > 30;
    const rec = {
      id: `${date}-${src.id}-${urlKey.slice(0, 8)}`, date, headline: it.title, institution: src.institution,
      frameworks: c.frameworks, sectors: c.sectors, countries: c.countries, type: c.type,
      what: it.summary || null, why: null, startups: null, investors: null, programmes: [],
      source_url: it.link, source_institution: src.institution, source_type: 'official', source_level: src.level, source_id: src.id,
      retrieved: TODAY, last_verified: null, record_updated: nowIso(), version: 1,
      status: historical ? 'historical' : 'unverified', origin: 'feed', summary_by: null, verified: false, hash: urlKey,
    };
    ctx.devs.push(rec); ctx.byHash.set(urlKey, rec);
    historical ? out.historical++ : out.new++;
  }
  return out;
}

// ---------- EU Funding & Tenders Portal (SEDIA search API) ----------
const FP = { 43108390: 'Horizon Europe', 43152860: 'Digital Europe Programme' };
const PROGRAMME_OF = (id) => /EIC-\d{4}-ACCELERATOR/i.test(id) ? 'eic-accelerator' : /EIC-\d{4}-PATHFINDER/i.test(id) ? 'eic-pathfinder'
  : /EIC-\d{4}-TRANSITION/i.test(id) ? 'eic-transition' : /^HORIZON-(CL\d|EIE|WIDERA|MISS|BRIDGING)/i.test(id) ? 'horizon-europe-cluster'
  : /^DIGITAL-/i.test(id) ? 'digital-europe' : /^INNOVFUND/i.test(id) ? 'innovfund' : /^(HORIZON-)?(CHIPS|KDT)/i.test(id) ? 'chips-ju' : null;
const FOR_STARTUPS = /^(HORIZON-(EIC|EIE|CL\d|BRIDGING|MISS)|DIGITAL-|INNOVFUND|CHIPS|HORIZON-KDT|EDF-|SMP-)/i;
const first = (v) => (Array.isArray(v) ? v[0] : v);
async function runSedia(src, ctx) {
  const query = { bool: { must: [{ terms: { type: ['1', '8'] } }, { terms: { status: ['31094501', '31094502'] } }] } };
  const out = { fetched: 0, relevant: 0, new: 0, update: 0, unchanged: 0, closed: 0 };
  const seen = new Set();
  for (let page = 1; page <= 25; page++) {
    const fd = new FormData();
    fd.append('query', new Blob([JSON.stringify(query)], { type: 'application/json' }));
    fd.append('languages', new Blob([JSON.stringify(['en'])], { type: 'application/json' }));
    fd.append('sort', new Blob([JSON.stringify({ field: 'sortStatus', order: 'ASC' })], { type: 'application/json' }));
    const url = `${src.url}?apiKey=SEDIA&text=***&pageSize=100&pageNumber=${page}`;
    const body = JSON.parse(await fetchText(url, { method: 'POST', body: fd, fixtureKey: `page${page}` }));
    const results = body.results || [];
    out.fetched += results.length;
    for (const r of results) {
      const m = r.metadata || {};
      const id = first(m.identifier) || first(m.callIdentifier);
      if (!id || seen.has(id)) continue; seen.add(id);
      if (!FOR_STARTUPS.test(id)) continue;
      out.relevant++;
      const status = String(first(m.status)) === '31094502' ? 'open' : String(first(m.status)) === '31094501' ? 'forthcoming' : 'closed';
      const deadlines = (Array.isArray(m.deadlineDate) ? m.deadlineDate : [m.deadlineDate]).map(isoDay).filter(Boolean).sort();
      const rec = {
        id, title: first(m.title) || r.summary || id, call: first(m.callTitle) || first(m.callIdentifier) || null,
        programme_name: FP[first(m.frameworkProgramme)] || (first(m.frameworkProgramme) ? `Programme ${first(m.frameworkProgramme)}` : null),
        programme: PROGRAMME_OF(id), status, opening: isoDay(first(m.startDate)), deadlines,
        url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(String(id).toLowerCase())}`,
        source_id: src.id, source_level: src.level, retrieved: TODAY, last_verified: TODAY,
      };
      const prev = ctx.calls.get(id);
      if (!prev) { ctx.calls.set(id, { ...rec, first_seen: TODAY, version: 1, record_updated: nowIso() }); out.new++; continue; }
      let changed = false;
      for (const k of ['title', 'status', 'opening', 'deadlines', 'call']) {
        if (JSON.stringify(prev[k]) !== JSON.stringify(rec[k])) { ctx.change('call', id, k, prev[k], rec[k], src.id); changed = true; }
      }
      ctx.calls.set(id, { ...prev, ...rec, version: (prev.version || 1) + (changed ? 1 : 0), record_updated: changed ? nowIso() : prev.record_updated });
      changed ? out.update++ : out.unchanged++;
    }
    if (results.length < 100) break;
  }
  if (!out.fetched) throw new Error('API returned no results (format change or outage); existing calls kept');
  // Calls that dropped out of the open/forthcoming list: keep them, mark closed once their last deadline has passed.
  for (const [id, c] of ctx.calls) {
    if (seen.has(id) || c.source_id !== src.id) continue;
    const last = (c.deadlines || []).slice(-1)[0];
    if (c.status !== 'closed' && last && last < TODAY) { ctx.change('call', id, 'status', c.status, 'closed', src.id); c.status = 'closed'; c.record_updated = nowIso(); out.closed++; }
    c.in_last_check = false;
  }
  for (const id of seen) { const c = ctx.calls.get(id); if (c) c.in_last_check = true; }
  return out;
}

// ---------- reconciliation: re-check stored source links (annotates, never rewrites content) ----------
async function runLinkCheck(src, ctx) {
  const urls = new Set();
  for (const r of [...ctx.frameworks, ...ctx.programmes]) for (const s of r.sources || []) urls.add(s.url);
  const out = { checked: 0, ok: 0, broken: 0 };
  const status = ctx.state.link_status || {};
  for (const u of [...urls].slice(0, 400)) {
    out.checked++;
    try { await fetchText(u, {}, 2); status[u] = { ok: true, at: TODAY }; out.ok++; }
    catch (e) { status[u] = { ok: false, at: TODAY, error: String(e.message || e).slice(0, 120) }; out.broken++; }
  }
  ctx.state.link_status = status;
  return out;
}

const ADAPTERS = { rss: runRss, sedia: runSedia, linkcheck: runLinkCheck };

export async function ingest() {
  const cfg = await readJSON(CONFIG, { sources: [] });
  const state = await readJSON(p('ingest-state.json'), { sources: {} });
  const devDoc = await readJSON(p('developments.json'), { records: [] });
  const callDoc = await readJSON(p('calls.json'), { records: [] });
  const changes = await readJSON(p('changes.json'), { records: [] });
  const log = await readJSON(p('ingest-log.json'), { runs: [] });
  const frameworks = (await readJSON(p('frameworks.json'), { records: [] })).records;
  const programmes = (await readJSON(p('programmes.json'), { records: [] })).records;
  const ctx = {
    state, frameworks, programmes, devs: devDoc.records,
    byHash: new Map(devDoc.records.map((d) => [d.hash || hash(normUrl(d.source_url)), d])),
    calls: new Map(callDoc.records.map((c) => [c.id, c])),
    change: (type, id, field, oldV, newV, source) => changes.records.push({ at: nowIso(), record_type: type, id, field, old: oldV ?? null, new: newV ?? null, source }),
  };
  const run = { started: nowIso(), sources: [] };
  for (const src of cfg.sources) {
    const st = state.sources[src.id] || (state.sources[src.id] = {});
    if (process.env.POLICY_ONLY && !process.env.POLICY_ONLY.split(',').includes(src.id)) { run.sources.push({ id: src.id, status: 'skipped' }); continue; }
    if (!src.enabled || !ADAPTERS[src.adapter]) { run.sources.push({ id: src.id, status: 'disabled', note: src.note || null }); continue; }
    if (!due(src, st)) { run.sources.push({ id: src.id, status: 'not-due', last_checked: st.last_checked }); continue; }
    const t0 = Date.now();
    st.last_checked = nowIso();
    try {
      const counts = await ADAPTERS[src.adapter](src, ctx);
      st.last_ok = st.last_checked; st.consecutive_errors = 0; delete st.last_error;
      run.sources.push({ id: src.id, status: 'ok', ms: Date.now() - t0, ...counts });
    } catch (e) {
      st.consecutive_errors = (st.consecutive_errors || 0) + 1; st.last_error = String(e.message || e).slice(0, 200);
      run.sources.push({ id: src.id, status: 'error', ms: Date.now() - t0, error: st.last_error, consecutive_errors: st.consecutive_errors });
    }
  }
  run.finished = nowIso();
  run.incomplete = run.sources.filter((s) => s.status === 'error').map((s) => s.id);
  log.runs.unshift(run); log.runs = log.runs.slice(0, 120);
  devDoc.records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  await writeJSON(p('developments.json'), devDoc);
  await writeJSON(p('calls.json'), { records: [...ctx.calls.values()].sort((a, b) => String((a.deadlines || [])[0] || '9').localeCompare(String((b.deadlines || [])[0] || '9'))) });
  await writeJSON(p('changes.json'), changes);
  await writeJSON(p('ingest-state.json'), state);
  await writeJSON(p('ingest-log.json'), log);
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingest().then((r) => console.log(JSON.stringify(r, null, 1))).catch((e) => { console.error(e); process.exit(1); });
}
