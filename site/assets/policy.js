/* TechCap Intelligence — Policy & Capital Intelligence page. Reads site/data/policy/*.json (curated + ingested)
   and the existing funding snapshot (rounds-YYYY.json, companies.json). Self-contained: shares only style tokens with the main page. */
import { analyse, publicInvestors, SCOPE, STAGE_ORDER, GENERIC } from './policy-analytics.js?v=1';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const eur = (v) => (v == null || isNaN(v) ? '—' : '€' + compact.format(v));
const int = (v) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('en').format(v));
const pct = (v, d = 0) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const sgn = (v) => (v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`);
const fmtDate = (d) => { if (!d) return '—'; const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : esc(d); };
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (d) => (Date.parse(TODAY) - Date.parse(d)) / 864e5;
const slug = (s) => encodeURIComponent(s);

const FW_STATUS = ['announced', 'proposed', 'adopted', 'in-force', 'under-implementation', 'completed'];
const FW_STATUS_LABEL = { announced: 'Announced', proposed: 'Proposed', adopted: 'Adopted', 'in-force': 'In force', 'under-implementation': 'Under implementation', completed: 'Completed' };
const PR_STATUS = ['open', 'forthcoming', 'rolling', 'continuous', 'closed'];
const DEV_STATUS = ['new', 'update', 'unverified', 'historical'];
const INSTRUMENTS = ['grant', 'equity', 'blended', 'co-investment', 'fund-of-funds', 'guarantee', 'loan', 'procurement', 'support'];
const P_STAGES = ['Research', 'Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth/Late'];
const LEVEL = { 0: 'internal', 1: 'Level 1 · EU legislation / institution', 2: 'Level 2 · EU funding database', 3: 'Level 3 · public financial institution', 4: 'Level 4 · industry research', 5: 'Level 5 · news' };
const EVIDENCE = {
  direct: ['Direct attribution', 'The round names an EU institution or EU instrument (EIC Fund, EIF, EIB, Scaleup Europe Fund…) as an investor or funder.'],
  documented: ['Documented participation', 'The round names a national public investor (a promotional bank or agency, some of which deploy EU funds).'],
  association: ['Statistical association', 'A pattern in the funding data around a policy date or priority. Not evidence that the policy caused it.'],
  influence: ['Potential policy influence', 'A policy targets the sector; the data does not show whether it moved private capital.'],
};
const evBadge = (k) => `<span class="ev ${k}" title="${esc(EVIDENCE[k][1])}">${esc(EVIDENCE[k][0])}</span>`;
const stBadge = (s, label) => `<span class="st ${esc(s)}">${esc(label || FW_STATUS_LABEL[s] || s)}</span>`;

// ---------- data ----------
const DB = { fw: [], pr: [], dev: [], calls: [], pc: [], disc: [], ins: [], an: null, meta: null, companies: null, rounds: null };
const byId = { fw: new Map(), pr: new Map(), dev: new Map(), ins: new Map() };
const load = (f) => fetch(`data/${f}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
async function boot() {
  const [fw, pr, dev, calls, pc, disc, ins, an, meta] = await Promise.all(['frameworks', 'programmes', 'developments', 'calls', 'public-capital', 'discrepancies', 'insights', 'analytics', 'meta'].map((n) => load(`policy/${n}.json`)));
  DB.fw = (fw && fw.records) || []; DB.pr = (pr && pr.records) || []; DB.dev = (dev && dev.records) || []; DB.calls = (calls && calls.records) || [];
  DB.pc = (pc && pc.records) || []; DB.disc = (disc && disc.discrepancies) || []; DB.ins = (ins && ins.records) || []; DB.an = an; DB.meta = meta;
  for (const [k, arr] of [['fw', DB.fw], ['pr', DB.pr], ['dev', DB.dev], ['ins', DB.ins]]) for (const r of arr) byId[k].set(r.id, r);
  fillFilters();
  const up = meta && meta.updated ? `Policy data checked ${fmtDate(meta.updated)}` : '';
  const as = an && an.asOf ? ` · funding data to ${fmtDate(an.asOf)}` : '';
  $('pUpdated').textContent = up + as;
  window.addEventListener('hashchange', route);
  route();
}
let roundsPromise = null;
function loadRounds() {
  if (DB.rounds) return Promise.resolve(DB.rounds);
  if (roundsPromise) return roundsPromise;
  const years = []; for (let y = 2021; y <= new Date().getUTCFullYear(); y++) years.push(y);
  roundsPromise = Promise.all(years.map((y) => load(`rounds-${y}.json`))).then((files) => {
    const rows = [];
    for (const j of files) if (j) for (const r of j.rows) rows.push({ id: r[0], date: r[1], company: r[2], company_id: r[3] || r[0], country: r[4], sectors: r[6] ? r[6].split('|') : [], stage: r[7] || 'Other', amount: r[8], investors: r[9] ? r[9].split('|') : [], url: r[10], origin: r[12] || 'techeu' });
    DB.rounds = rows; return rows;
  });
  return roundsPromise;
}
const loadCompanies = () => (DB.companies ? Promise.resolve(DB.companies) : load('companies.json').then((j) => (DB.companies = j ? j.rows : [])));

// ---------- saved items (browser only) ----------
const KEY = 'tci-policy-saved-v1';
function readSaved() { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { items: s.items || [], sectors: s.sectors || [], searches: s.searches || [], lastVisit: s.lastVisit || null, prevVisit: s.prevVisit || null }; } catch { return { items: [], sectors: [], searches: [], lastVisit: null, prevVisit: null }; } }
function writeSaved(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} updateSavedCount(); }
let SAVED = readSaved();
(() => { const s = SAVED; if (s.lastVisit !== TODAY) { s.prevVisit = s.lastVisit; s.lastVisit = TODAY; writeSaved(s); } })();
const isSaved = (type, id) => SAVED.items.some((i) => i.type === type && i.id === id);
function toggleSaved(type, id) {
  SAVED = readSaved();
  SAVED.items = isSaved(type, id) ? SAVED.items.filter((i) => !(i.type === type && i.id === id)) : [...SAVED.items, { type, id, at: TODAY }];
  writeSaved(SAVED);
}
function toggleSector(s) { SAVED = readSaved(); SAVED.sectors = SAVED.sectors.includes(s) ? SAVED.sectors.filter((x) => x !== s) : [...SAVED.sectors, s]; writeSaved(SAVED); }
const saveBtn = (type, id) => `<button class="save${isSaved(type, id) ? ' on' : ''}" type="button" data-save="${esc(type)}|${esc(id)}" aria-pressed="${isSaved(type, id)}">${isSaved(type, id) ? '★ Saved' : '☆ Save'}</button>`;
const followBtn = (s) => `<button class="save${SAVED.sectors.includes(s) ? ' on' : ''}" type="button" data-follow="${esc(s)}" aria-pressed="${SAVED.sectors.includes(s)}">${SAVED.sectors.includes(s) ? '✓ Following' : '+ Follow sector'}</button>`;
function updateSavedCount() { const n = SAVED.items.length + SAVED.sectors.length + SAVED.searches.length; $('savedCount').textContent = n ? n : ''; }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-save],[data-follow],[data-unsearch]');
  if (!b) return;
  if (b.dataset.save) { const [t, id] = b.dataset.save.split('|'); toggleSaved(t, id); }
  if (b.dataset.follow) toggleSector(b.dataset.follow);
  if (b.dataset.unsearch) { SAVED = readSaved(); SAVED.searches = SAVED.searches.filter((s) => s.hash !== b.dataset.unsearch); writeSaved(SAVED); }
  route();
});

// ---------- filters (kept in the address, so every view can be bookmarked and shared) ----------
const F = { sector: '', country: '', framework: '', instrument: '', stage: '', status: '', since: '' };
const FILTER_IDS = { sector: 'pSector', country: 'pCountry', framework: 'pFramework', instrument: 'pInstrument', stage: 'pStage', status: 'pStatus', since: 'pSince' };
const APPLIES = {
  overview: ['sector', 'country'], radar: ['sector', 'status', 'since', 'instrument'], funding: ['sector', 'country', 'framework', 'instrument', 'stage', 'status'],
  capital: ['sector', 'country', 'stage'], feed: ['sector', 'country', 'framework', 'status', 'since'], insights: ['sector', 'framework'], saved: [],
  framework: [], programme: [], development: [], insight: [], sector: ['country'],
};
function opt(sel, values, all, labels = {}) { sel.innerHTML = `<option value="">${esc(all)}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(labels[v] || v)}</option>`).join(''); }
function fillFilters() {
  const sectors = new Set();
  for (const r of [...DB.fw, ...DB.pr, ...DB.dev]) for (const s of r.sectors || []) if (s !== 'All') sectors.add(s);
  opt($('pSector'), [...sectors].sort(), 'All sectors');
  opt($('pCountry'), SCOPE, 'All countries');
  opt($('pFramework'), DB.fw.map((f) => f.id), 'All frameworks', Object.fromEntries(DB.fw.map((f) => [f.id, f.short || f.name])));
  opt($('pInstrument'), INSTRUMENTS, 'All instruments', { 'fund-of-funds': 'Fund-of-funds', 'co-investment': 'Co-investment' });
  opt($('pStage'), P_STAGES, 'All stages');
  for (const [k, id] of Object.entries(FILTER_IDS)) $(id).addEventListener('change', () => { F[k] = $(id).value; go(currentView, currentArg); });
  $('pReset').addEventListener('click', () => { for (const k of Object.keys(F)) F[k] = ''; go(currentView, currentArg); });
  $('pSaveSearch').addEventListener('click', () => {
    const name = [viewTitle(currentView), describeFilters()].filter(Boolean).join(': ');
    SAVED = readSaved(); SAVED.searches = [...SAVED.searches.filter((s) => s.hash !== location.hash), { name, hash: location.hash, at: TODAY }]; writeSaved(SAVED);
    const btn = $('pSaveSearch'); btn.textContent = 'Search saved ✓'; setTimeout(() => { btn.textContent = 'Save this search'; }, 2000);
  });
}
function setStatusOptions(view) {
  const sel = $('pStatus');
  const list = view === 'funding' ? PR_STATUS : view === 'feed' ? DEV_STATUS : FW_STATUS;
  const labels = view === 'radar' ? FW_STATUS_LABEL : {};
  const cur = F.status; opt(sel, list, 'Any status', labels); sel.value = list.includes(cur) ? cur : ''; F.status = sel.value;
}
function describeFilters() { return Object.entries(F).filter(([, v]) => v).map(([k, v]) => (k === 'framework' ? (byId.fw.get(v) || {}).short || v : v)).join(' · '); }
let currentView = 'overview', currentArg = '';
function go(view, arg) {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(F)) if (v && (APPLIES[view] || []).includes(k)) q.set(k, v);
  const h = `#${view}${arg ? '/' + slug(arg) : ''}${q.toString() ? '?' + q : ''}`;
  if (location.hash !== h) location.hash = h; else route();
}
const viewTitle = (v) => ({ overview: 'Overview', radar: 'Policy Radar', funding: 'Funding & Opportunities', capital: 'Policy → Capital', feed: 'Developments', insights: 'Insights', saved: 'Saved' }[v] || v);

function route() {
  const raw = location.hash.slice(1) || 'overview';
  const [path, qs] = raw.split('?');
  const [view, ...rest] = path.split('/');
  currentView = view || 'overview'; currentArg = decodeURIComponent(rest.join('/'));
  const q = new URLSearchParams(qs || '');
  for (const k of Object.keys(F)) F[k] = q.get(k) || '';
  setStatusOptions(currentView);
  for (const [k, id] of Object.entries(FILTER_IDS)) { $(id).value = F[k]; $(id).closest('label').classList.toggle('off', !(APPLIES[currentView] || []).includes(k)); $(id).disabled = !(APPLIES[currentView] || []).includes(k); }
  const tab = { framework: 'radar', programme: 'funding', development: 'feed', insight: 'insights', sector: 'capital' }[currentView] || currentView;
  for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('on', a.dataset.view === tab);
  const V = { overview, radar, funding, capital, feed, insights, saved, framework, programme, development, insight, sector }[currentView] || overview;
  updateSavedCount();
  Promise.resolve(V(currentArg)).catch((e) => { console.error(e); $('view').innerHTML = `<section class="card"><p class="empty">This view could not be drawn: ${esc(e.message)}</p></section>`; });
  if (!['overview', 'radar', 'funding', 'capital', 'feed', 'insights', 'saved'].includes(currentView)) window.scrollTo({ top: 0 });
}
const render = (html) => { $('view').innerHTML = html; };
const card = (title, note, body, extra = '') => `<section class="card"${extra}><div class="card-head"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}</div>${body}</section>`;

// ---------- shared filters on records ----------
const matchSector = (r) => !F.sector || (r.sectors || []).includes(F.sector) || (r.sectors || []).includes('All');
// EU-wide records apply to every member state; non-EU countries match only records that name them or cover EEA / associated countries.
const matchCountry = (countries) => {
  if (!F.country || !countries) return true;
  const s = String(countries);
  if (s.includes(F.country) || /associated|EEA|\bEurope\b/i.test(s)) return true;
  return /EU27/.test(s) && !['UK', 'Switzerland', 'Norway', 'Iceland'].includes(F.country);
};
const fwFiltered = () => DB.fw.filter((f) => matchSector(f) && (!F.status || f.status === F.status) && (!F.since || (f.announced || f.published || '') >= F.since)
  && (!F.instrument || (f.related_programmes || []).some((id) => ((byId.pr.get(id) || {}).mechanism || []).includes(F.instrument))));
const prFiltered = () => DB.pr.filter((p) => matchSector(p) && matchCountry(p.countries) && (!F.framework || p.framework === F.framework) && (!F.instrument || (p.mechanism || []).includes(F.instrument))
  && (!F.stage || (p.stages || []).includes(F.stage)) && (!F.status || p.status === F.status));
const devFiltered = () => DB.dev.filter((d) => matchSector(d) && matchCountry((d.countries || []).join(',')) && (!F.framework || (d.frameworks || []).includes(F.framework))
  && (!F.status || d.status === F.status) && (!F.since || d.date >= F.since));

const fwLink = (id) => { const f = byId.fw.get(id); return f ? `<a class="tag" href="#framework/${slug(id)}">${esc(f.short || f.name)}</a>` : ''; };
const prLink = (id) => { const p = byId.pr.get(id); return p ? `<a class="tag pipe" href="#programme/${slug(id)}">${esc(p.name)}</a>` : ''; };
const secLink = (s) => (s && s !== 'All' ? `<a class="tag hub" href="#sector/${slug(s)}">${esc(s)}</a>` : '<span class="tag">All sectors</span>');
const srcList = (sources) => `<ol class="src">${(sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a> <span class="lv">· ${esc(s.institution || '')}${s.published ? ` · published ${fmtDate(s.published)}` : ''} · ${esc(LEVEL[s.level] || s.type || '')}${s.retrieved ? ` · retrieved ${fmtDate(s.retrieved)}` : ''}</span></li>`).join('')}</ol>`;
const verif = (r) => `<span class="lv">${r.verification === 'verified' ? '✓ verified' : '◐ partly verified'} ${fmtDate(r.last_verified)}</span>`;
const nextDeadline = (p) => (p.deadlines || []).map((d) => d.date).filter((d) => d >= TODAY).sort()[0] || null;
const discFor = (id) => DB.disc.filter((d) => (d.records || []).includes(id));
const discBox = (id) => { const d = discFor(id); return d.length ? `<div class="box warn"><h3>Sources disagree</h3><ul>${d.map((x) => `<li><b>${esc(x.topic)}:</b> ${esc(x.detail)}</li>`).join('')}</ul></div>` : ''; };

// ---------- views ----------
function devItem(d, compact = false) {
  const analyst = d.summary_by && d.why;
  return `<article class="pitem"><div class="meta"><span>${fmtDate(d.date)}</span><span>${esc(d.source_institution || d.institution || '')}</span><span class="tag">${esc(d.type)}</span>${stBadge(d.status)}${d.source_type === 'news' ? '<span class="lv">secondary source</span>' : ''}${saveBtn('dev', d.id)}</div>
    <h3><a href="#development/${slug(d.id)}">${esc(d.headline)}</a></h3>
    ${d.what && !compact ? `<p>${esc(d.what)}</p>` : ''}
    ${analyst && !compact ? `<p class="an"><b>Why it matters (analysis):</b> ${esc(d.why)}</p>` : !analyst && !compact ? '<p class="note">Captured automatically from an official feed. Awaiting analyst review: no implications written yet.</p>' : ''}
    <div class="tags">${(d.frameworks || []).map(fwLink).join('')}${(d.programmes || []).map(prLink).join('')}${(d.sectors || []).map(secLink).join('')}</div></article>`;
}
function fwItem(f, compact = false) {
  return `<article class="pitem"><div class="meta">${stBadge(f.status)}<span>${esc(f.category)}</span><span>${esc(f.institution)}</span>${verif(f)}${saveBtn('fw', f.id)}</div>
    <h3><a href="#framework/${slug(f.id)}">${esc(f.name)}</a></h3>
    ${compact ? '' : `<p class="small muted">${esc(f.status_note || '')}</p>`}
    ${f.latest_development ? `<p class="small"><b>Latest (${fmtDate(f.latest_development.date)}):</b> ${esc(f.latest_development.text)}</p>` : ''}
    <div class="tags">${(f.sectors || []).length ? f.sectors.map(secLink).join('') : '<span class="tag">Cross-sector</span>'}${f.funding ? `<span class="tag cheap">${esc(f.funding.label)}</span>` : ''}</div></article>`;
}
function prRow(p) {
  const nd = nextDeadline(p);
  return `<tr><td><a href="#programme/${slug(p.id)}"><b>${esc(p.name)}</b></a><div class="small muted">${esc(p.institution.split(/[;(]/)[0].trim())}</div></td><td>${stBadge(p.status)}</td><td>${(p.mechanism || []).map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</td>
    <td class="dim">${esc((p.amount && p.amount.label) || '—')}</td><td class="hide-sm">${(p.stages || []).join(', ')}</td><td class="num">${nd ? fmtDate(nd) : (p.status === 'rolling' || p.status === 'continuous' ? 'Rolling' : '—')}</td><td>${p.framework ? fwLink(p.framework) : ''}</td><td>${saveBtn('pr', p.id)}</td></tr>`;
}
const prTable = (rows) => rows.length ? `<div class="tbox"><table><thead><tr><th><span class="thl">Programme</span></th><th><span class="thl">Status</span></th><th><span class="thl">Instrument</span></th><th><span class="thl">Amount</span></th><th class="hide-sm"><span class="thl">Stage</span></th><th class="num"><span class="thl">Next deadline</span></th><th><span class="thl">Policy</span></th><th></th></tr></thead><tbody>${rows.map(prRow).join('')}</tbody></table></div>` : '<p class="empty">No programme matches these filters.</p>';

async function overview() {
  const a = DB.an;
  const fws = fwFiltered(), devs = devFiltered(), prs = prFiltered();
  const openP = DB.pr.filter((p) => ['open', 'rolling', 'continuous'].includes(p.status)).length;
  const recent = DB.dev.filter((d) => daysAgo(d.date) <= 30).length;
  const last12 = a ? a.eu_rounds.filter((r) => r.date > a.lastFrom).length : null;
  const y = a ? a.years.filter((x) => x.year >= '2021') : [];
  const firstY = y[0], lastY = y[y.length - 1];
  const tiles = `<section class="tiles" aria-label="Headline figures">
    <div class="tile"><h3>EU frameworks tracked</h3><div class="big">${DB.fw.length}</div><div class="chg">${DB.fw.filter((f) => f.status === 'in-force').length} in force · ${DB.fw.filter((f) => f.status === 'proposed').length} proposed</div></div>
    <div class="tile"><h3>Funding programmes</h3><div class="big">${DB.pr.length}</div><div class="chg">${openP} open or rolling now</div></div>
    <div class="tile"><h3>Policy developments, 30 days</h3><div class="big">${recent}</div><div class="chg">${DB.dev.filter((d) => d.status === 'unverified').length} awaiting review</div></div>
    <div class="tile"><h3>Rounds with an EU investor, 12 months</h3><div class="big">${int(last12)}</div><div class="chg">${evBadge('direct')}</div></div>
    <div class="tile"><h3>VC in EU strategic (STEP) sectors</h3><div class="big">${lastY ? pct(lastY.strat_share) : '—'}</div><div class="chg">${lastY ? `${esc(lastY.year)} to date, vs ${pct(firstY.strat_share)} in ${esc(firstY.year)}` : ''}</div></div>
  </section>`;
  // alerts for followed sectors
  const fol = SAVED.sectors;
  const since = SAVED.prevVisit || '0000';
  const alerts = fol.length ? DB.dev.filter((d) => d.retrieved > since && (d.sectors || []).some((s) => fol.includes(s))) : [];
  const alertBox = fol.length ? `<div class="box"><h3>Followed sectors: ${fol.map(esc).join(', ')}</h3>${alerts.length ? `<ul>${alerts.slice(0, 6).map((d) => `<li><a href="#development/${slug(d.id)}">${esc(d.headline)}</a> <span class="lv">${fmtDate(d.date)}</span></li>`).join('')}</ul>` : `<p class="small muted">No new developments in these sectors since your last visit${SAVED.prevVisit ? ` (${fmtDate(SAVED.prevVisit)})` : ''}.</p>`}</div>` : '';
  const counts = FW_STATUS.map((s) => [s, DB.fw.filter((f) => f.status === s).length]).filter(([, n]) => n);
  const radarBox = card('Policy Radar', `${fws.length} of ${DB.fw.length} frameworks${F.sector ? ` naming ${esc(F.sector)}` : ''}. <a href="#radar">Open the radar</a>`,
    `<div class="tags" style="margin-bottom:10px">${counts.map(([s, n]) => `<a href="#radar?status=${s}" class="st ${s}" style="text-decoration:none">${esc(FW_STATUS_LABEL[s])} · ${n}</a>`).join(' ')}</div>
     <div class="plist">${[...fws].sort((x, z) => ((z.latest_development || {}).date || '').localeCompare((x.latest_development || {}).date || '')).slice(0, 5).map((f) => fwItem(f, true)).join('')}</div>`);
  const devBox = card('Latest developments', `Newest first. <a href="#feed">All developments</a>`, `<div class="plist">${devs.slice(0, 5).map((d) => devItem(d, true)).join('') || '<p class="empty">No development matches these filters.</p>'}</div>`);
  const upcoming = [];
  for (const p of DB.pr) for (const d of p.deadlines || []) if (d.date >= TODAY && matchSector(p)) upcoming.push({ date: d.date, label: d.label, p });
  for (const c of DB.calls) for (const d of c.deadlines || []) if (d >= TODAY) upcoming.push({ date: d, label: c.title, call: c });
  upcoming.sort((x, z) => x.date.localeCompare(z.date));
  const oppBox = card('Funding opportunities: next deadlines', `Official deadlines only. <a href="#funding">All programmes</a>`,
    upcoming.length ? `<div class="tbox"><table><thead><tr><th><span class="thl">Deadline</span></th><th><span class="thl">Programme or call</span></th></tr></thead><tbody>${upcoming.slice(0, 8).map((u) => `<tr><td class="num">${fmtDate(u.date)}</td><td>${u.p ? `<a href="#programme/${slug(u.p.id)}">${esc(u.p.name)}</a> <span class="small muted">${esc(u.label || '')}</span>` : `<a href="${esc(u.call.url)}" target="_blank" rel="noopener">${esc(u.call.title)}</a> <span class="small muted">${esc(u.call.id)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No upcoming deadline is recorded.</p>');
  const sec = a ? a.sectors.filter((s) => s.exposure > 0 || s.share_last > 0.02).slice(0, 14) : [];
  const maxE = Math.max(1, ...sec.map((s) => s.exposure)), maxV = Math.max(1, ...sec.map((s) => s.last_eur));
  const expBox = card('Sector-level policy exposure', `How many tracked frameworks and programmes name each sector, next to venture funding in the last 12 months (Europe, ${a ? fmtDate(a.lastFrom) + ' – ' + fmtDate(a.asOf) : ''}). ${evBadge('influence')}`,
    sec.length ? `<div class="bars">${sec.map((s) => `<div class="bar2"><a href="#sector/${slug(s.sector)}">${esc(s.sector)}</a><div class="t" title="${s.exposure} frameworks/programmes"><span style="width:${(s.exposure / maxE) * 100}%;background:var(--c3)"></span></div><span class="v">${s.exposure}</span></div><div class="bar2"><span class="small muted">VC 12m</span><div class="t"><span style="width:${(s.last_eur / maxV) * 100}%;background:var(--c1)"></span></div><span class="v">${eur(s.last_eur)}</span></div>`).join('')}</div><p class="note">Purple: number of policy records naming the sector. Teal: disclosed venture funding (equity rounds). A sector can be named by policy without that policy having moved capital.</p>` : '<p class="loading">No analytics snapshot yet.</p>');
  const ind = DB.pc.slice(0, 12);
  const pcBox = card('Public funding and investment indicators', 'Official figures as published by the institutions. Each figure links to its source.',
    `<div class="tbox"><table><thead><tr><th><span class="thl">Indicator</span></th><th class="num"><span class="thl">Value</span></th><th><span class="thl">Period</span></th><th><span class="thl">Source</span></th></tr></thead><tbody>${ind.map((r) => `<tr><td>${esc(r.metric)}</td><td class="num"><b>${/EUR/.test(r.unit) && r.value > 1000 ? eur(r.value) : int(r.value)}</b> <span class="small muted">${esc(r.unit.replace(/^EUR ?/, ''))}</span></td><td class="dim">${esc(r.period)}</td><td><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.source_institution)}</a></td></tr>`).join('')}</tbody></table></div>`);
  const insBox = card('Policy & Capital Insights', `Evidence-based analysis; facts, calculations and interpretation are labelled. <a href="#insights">All insights</a>`,
    DB.ins.length ? `<div class="plist">${DB.ins.filter((i) => matchSector({ sectors: i.sectors })).slice(0, 3).map(insItem).join('')}</div>` : '<p class="empty">No insight published yet.</p>');
  const savedN = SAVED.items.length;
  const savedBox = card('Saved frameworks and followed sectors', '', savedN || fol.length ? `<div class="tags">${SAVED.items.slice(0, 12).map(savedChip).join('')}${fol.map(secLink).join('')}</div><p class="note"><a href="#saved">Manage saved items</a></p>` : '<p class="small muted">Use ☆ Save on any framework, programme or development, and + Follow on a sector page. Saved items stay in this browser.</p>');
  render(`${tiles}${alertBox}<div class="two">${radarBox}${devBox}</div><div class="two">${oppBox}${expBox}</div>${pcBox}${insBox}${savedBox}`);
}
function savedChip(i) {
  const r = i.type === 'fw' ? byId.fw.get(i.id) : i.type === 'pr' ? byId.pr.get(i.id) : i.type === 'dev' ? byId.dev.get(i.id) : byId.ins.get(i.id);
  if (!r) return '';
  const href = { fw: 'framework', pr: 'programme', dev: 'development', ins: 'insight' }[i.type];
  return `<a class="tag" href="#${href}/${slug(i.id)}">${esc(r.short || r.name || r.headline || r.title)}</a>`;
}

let radarQ = '', radarInst = '', radarCat = '';
function radar() {
  const insts = [...new Set(DB.fw.map((f) => f.institution.split(/[(;,]/)[0].trim()))].sort();
  const cats = [...new Set(DB.fw.map((f) => f.category))].sort();
  const q = radarQ.toLowerCase();
  const rows = fwFiltered().filter((f) => (!radarInst || f.institution.startsWith(radarInst)) && (!radarCat || f.category === radarCat)
    && (!q || `${f.name} ${f.short} ${f.description} ${(f.objectives || []).join(' ')} ${f.document_id || ''}`.toLowerCase().includes(q)));
  rows.sort((a, b) => FW_STATUS.indexOf(a.status) - FW_STATUS.indexOf(b.status) || a.name.localeCompare(b.name));
  render(card('EU Policy Radar', `${rows.length} of ${DB.fw.length} frameworks, strategies and initiatives relevant to startups and investors. Status as last verified on the official source.`,
    `<div class="filters"><label class="grow">Search <input id="rq" class="search-in" type="search" placeholder="Name, objective or document number" value="${esc(radarQ)}"></label>
     <label>Institution <select id="rInst"><option value="">All institutions</option>${insts.map((i) => `<option${i === radarInst ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
     <label>Policy type <select id="rCat"><option value="">All types</option>${cats.map((c) => `<option${c === radarCat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
     <div class="legend-ev small" style="margin-bottom:10px">${FW_STATUS.map((s) => stBadge(s)).join(' ')} <span class="muted">announced → proposed → adopted → in force / under implementation → completed</span></div>
     <div class="plist">${rows.map(fwItem).join('') || '<p class="empty">No framework matches.</p>'}</div>`));
  const rq = $('rq'); rq.addEventListener('input', () => { radarQ = rq.value; const pos = rq.selectionStart; radar(); const n = $('rq'); n.focus(); n.setSelectionRange(pos, pos); });
  $('rInst').addEventListener('change', (e) => { radarInst = e.target.value; radar(); });
  $('rCat').addEventListener('change', (e) => { radarCat = e.target.value; radar(); });
}

async function framework(id) {
  const f = byId.fw.get(id);
  if (!f) return render(card('Framework not found', '', `<p class="empty">No framework with id “${esc(id)}”. <a href="#radar">Back to the radar</a></p>`));
  const devs = DB.dev.filter((d) => (d.frameworks || []).includes(id));
  const progs = (f.related_programmes || []).map((p) => byId.pr.get(p)).filter(Boolean).concat(DB.pr.filter((p) => p.framework === id && !(f.related_programmes || []).includes(p.id)));
  const ins = DB.ins.filter((i) => (i.frameworks || []).includes(id));
  const a = DB.an; const ev = a ? a.events.find((e) => e.framework === id) : null;
  const secRows = a ? a.sectors.filter((s) => (f.sectors || []).includes(s.sector)) : [];
  const dates = [...(f.key_dates || [])].sort((x, z) => x.date.localeCompare(z.date));
  render(`<div class="crumbs"><a href="#radar">Policy Radar</a> › <span>${esc(f.short || f.name)}</span></div>
   <section class="card"><div class="card-head row"><div><h2 style="font-size:22px">${esc(f.name)}</h2><p class="note">${esc(f.category)} · ${esc(f.institution)} · ${esc(f.document_id || 'no document number')}</p></div><div>${stBadge(f.status)} ${saveBtn('fw', f.id)}</div></div>
    <p style="max-width:80ch">${esc(f.description)}</p>
    <div class="two"><div><h3 class="sub">Objectives</h3><ul class="signals">${(f.objectives || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
     <dl class="kv"><dt>Status</dt><dd>${stBadge(f.status)} ${esc(f.status_note || '')}</dd><dt>Announced</dt><dd>${fmtDate(f.announced)}</dd><dt>Published / adopted</dt><dd>${fmtDate(f.published)}</dd><dt>In force</dt><dd>${fmtDate(f.in_force)}</dd>
      <dt>Beneficiaries</dt><dd>${(f.beneficiaries || []).map(esc).join(', ') || '—'}</dd><dt>Geography</dt><dd>${esc(f.geography || '—')}</dd><dt>Sectors</dt><dd><div class="tags">${(f.sectors || []).length ? f.sectors.map(secLink).join('') : 'Cross-sector'}</div></dd>
      <dt>Funding</dt><dd>${f.funding ? `${esc(f.funding.label)} <a class="small" href="${esc(f.funding.source_url)}" target="_blank" rel="noopener">source</a>` : 'No dedicated budget recorded'}</dd>
      <dt>Last verified</dt><dd>${verif(f)}${(f.unverified_fields || []).length ? ` <span class="small warn">Not confirmed: ${f.unverified_fields.map(esc).join(', ')}</span>` : ''}</dd></dl></div>
    ${f.latest_development ? `<div class="takeaway"><span class="tk-l">Latest verified development</span>${fmtDate(f.latest_development.date)}: ${esc(f.latest_development.text)} <a href="${esc(f.latest_development.source_url)}" target="_blank" rel="noopener">Source</a></div>` : ''}
    ${discBox(id)}</section>
   ${card('Timeline', 'Key dates as stated in official sources. Amber dots are in the future.', `<ul class="timeline">${dates.map((d) => `<li class="${d.date > TODAY ? 'future' : ''}"><span class="d">${fmtDate(d.date)}</span>${esc(d.event)}</li>`).join('') || '<li>No dates recorded.</li>'}</ul>`)}
    ${card('Funding programmes linked to this framework', '', prTable(progs))}
   ${card('What the funding data shows', `Venture funding in this framework's sectors. ${evBadge(ev ? 'association' : 'influence')}`,
      secRows.length ? `<div class="tbox"><table><thead><tr><th><span class="thl">Sector</span></th><th class="num"><span class="thl">VC, last 12m</span></th><th class="num"><span class="thl">vs prior 12m</span></th><th class="num"><span class="thl">vs market</span></th><th class="num"><span class="thl">Rounds with EU investor (since 2021)</span></th></tr></thead><tbody>${secRows.map((s) => `<tr><td>${secLink(s.sector)}</td><td class="num">${eur(s.last_eur)}</td><td class="num">${sgn(s.growth)}</td><td class="num ${s.rel_growth > 0 ? 'pos' : 'neg'}">${sgn(s.rel_growth)}</td><td class="num">${int(s.eu_n)}</td></tr>`).join('')}</tbody></table></div>
        ${ev ? `<p class="takeaway"><span class="tk-l">Before / after ${esc(ev.date_kind)} date</span>VC into ${ev.sectors.map(esc).join(', ')} went from ${eur(ev.before)} to ${eur(ev.after)} (${sgn(ev.growth)}) in the 12 months after ${fmtDate(ev.date)}, while the whole market changed ${sgn(ev.market_growth)}: ${sgn(ev.relative)} relative to the market${ev.complete ? '' : ' (after-window not complete yet)'}. This is a statistical association: rates, large rounds and sector cycles move these numbers too.</p>` : ''}`
      : '<p class="small muted">Cross-sector framework: see the <a href="#capital">Policy → Capital</a> view for market-wide figures.</p>')}
   <div class="two">${card('Related developments', '', `<div class="plist">${devs.slice(0, 8).map((d) => devItem(d, true)).join('') || '<p class="empty">No development linked yet.</p>'}</div>`)}
    ${card('Sources', 'Ordered as recorded; level shows the source hierarchy.', srcList(f.sources))}</div>
   ${ins.length ? card('Insights on this framework', '', `<div class="plist">${ins.map(insItem).join('')}</div>`) : ''}`);
}

let fundAmt = 0;
function funding() {
  const prs = prFiltered().filter((p) => !fundAmt || (p.amount && (p.amount.max_eur || 0) >= fundAmt));
  prs.sort((a, b) => PR_STATUS.indexOf(a.status) - PR_STATUS.indexOf(b.status) || (nextDeadline(a) || '9').localeCompare(nextDeadline(b) || '9'));
  const calls = DB.calls.filter((c) => (!F.status || c.status === F.status) && (!F.framework || (byId.pr.get(c.programme) || {}).framework === F.framework) && c.status !== 'closed');
  const lastF = (DB.meta && DB.meta.sources || []).find((s) => s.id === 'ft-calls');
  render(card('EU Funding & Opportunities', `${prs.length} of ${DB.pr.length} programmes. Amounts, budgets, eligibility and deadlines are copied from the official pages listed on each programme; nothing is estimated. Always confirm on the official page before applying.`,
     `<div class="filters"><label>Maximum ticket at least <select id="fAmt"><option value="0">Any amount</option>${[1e6, 2.5e6, 1e7, 3e7].map((v) => `<option value="${v}"${fundAmt === v ? ' selected' : ''}>${eur(v)}</option>`).join('')}</select></label></div>${prTable(prs)}`)
   + card('Open and forthcoming calls (EU Funding & Tenders Portal)', lastF ? `Checked ${lastF.last_checked ? fmtDate(lastF.last_checked) : 'not yet'}${lastF.last_error ? ` · last check failed: ${esc(lastF.last_error)}` : ''}. Startup-relevant calls only (EIC, Horizon Europe clusters, Digital Europe, Innovation Fund, Chips).` : '',
     calls.length ? `<div class="tbox tall"><table><thead><tr><th><span class="thl">Call topic</span></th><th><span class="thl">Status</span></th><th><span class="thl">Programme</span></th><th class="num"><span class="thl">Opens</span></th><th class="num"><span class="thl">Deadline</span></th></tr></thead><tbody>${calls.slice(0, 200).map((c) => `<tr><td><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a><div class="small muted">${esc(c.id)}</div></td><td>${stBadge(c.status)}</td><td>${c.programme ? prLink(c.programme) : esc(c.programme_name || '')}</td><td class="num">${fmtDate(c.opening)}</td><td class="num">${(c.deadlines || []).map(fmtDate).join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>`
       : '<p class="empty">No calls ingested yet. The portal is checked by the daily pipeline; calls appear here after its first successful run.</p>'));
  $('fAmt').addEventListener('change', (e) => { fundAmt = Number(e.target.value); funding(); });
}

function programme(id) {
  const p = byId.pr.get(id);
  if (!p) return render(card('Programme not found', '', `<p class="empty"><a href="#funding">Back to funding</a></p>`));
  const fw = p.framework ? byId.fw.get(p.framework) : null;
  const devs = DB.dev.filter((d) => (d.programmes || []).includes(id));
  const calls = DB.calls.filter((c) => c.programme === id && c.status !== 'closed');
  const fwRefs = DB.fw.filter((f) => (f.related_programmes || []).includes(id));
  const dl = [...(p.deadlines || [])].sort((x, z) => x.date.localeCompare(z.date));
  render(`<div class="crumbs"><a href="#funding">Funding & Opportunities</a> › <span>${esc(p.name)}</span></div>
   <section class="card"><div class="card-head row"><div><h2 style="font-size:22px">${esc(p.name)}</h2><p class="note">${esc(p.institution)}</p></div><div>${stBadge(p.status)} ${saveBtn('pr', p.id)}</div></div>
    <div class="two"><dl class="kv"><dt>Parent framework</dt><dd>${fw ? fwLink(fw.id) : '—'}</dd><dt>Instrument</dt><dd>${(p.mechanism || []).map((m) => `<span class="tag">${esc(m)}</span>`).join('')}</dd>
      <dt>Amount</dt><dd>${esc((p.amount && p.amount.label) || 'Not stated')}</dd><dt>Budget</dt><dd>${p.budget ? `${esc(p.budget.label)}${p.budget.source_url ? ` <a class="small" href="${esc(p.budget.source_url)}" target="_blank" rel="noopener">source</a>` : ''}` : 'Not published'}</dd>
      <dt>Beneficiaries</dt><dd>${(p.beneficiaries || []).map(esc).join(', ')}</dd><dt>Eligible countries</dt><dd>${esc(p.countries || '—')}</dd><dt>Sectors</dt><dd><div class="tags">${(p.sectors || []).map(secLink).join('')}</div></dd>
      <dt>Startup stage</dt><dd>${(p.stages || []).map(esc).join(', ')} <span class="small muted">(TechCap classification)</span></dd><dt>Opens</dt><dd>${fmtDate(p.opening)}</dd>
      <dt>Apply</dt><dd>${p.apply_url ? `<a href="${esc(p.apply_url)}" target="_blank" rel="noopener">Official application page</a>` : '—'}</dd><dt>Last verified</dt><dd>${verif(p)}${(p.unverified_fields || []).length ? ` <span class="small warn">Not confirmed: ${p.unverified_fields.map(esc).join(', ')}</span>` : ''}</dd></dl>
     <div><h3 class="sub">Eligibility (as stated by the programme)</h3><ul class="signals">${(p.eligibility || []).map((e) => `<li>${esc(e)}</li>`).join('') || '<li>Not recorded</li>'}</ul>
      <h3 class="sub" style="margin-top:14px">Deadlines</h3><ul class="timeline">${dl.map((d) => `<li class="${d.date >= TODAY ? 'future' : ''}"><span class="d">${fmtDate(d.date)}</span>${esc(d.label || '')}${d.date < TODAY ? ' <span class="small muted">passed</span>' : ''}</li>`).join('') || '<li>No confirmed deadline published.</li>'}</ul></div></div>
    ${discBox(id)}</section>
   ${calls.length ? card('Matching calls on the Funding & Tenders Portal', '', `<ul class="signals">${calls.map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a> · ${stBadge(c.status)} · deadline ${(c.deadlines || []).map(fmtDate).join(', ') || '—'}</li>`).join('')}</ul>`) : ''}
   <div class="two">${card('Policies that reference it', '', `<div class="tags">${fwRefs.map((f) => fwLink(f.id)).join('') || 'None recorded'}</div>`)}
    ${card('Related developments', '', `<div class="plist">${devs.map((d) => devItem(d, true)).join('') || '<p class="empty">None linked yet.</p>'}</div>`)}</div>
   ${card('Sources', '', srcList(p.sources))}`);
}

let feedType = '';
function feed() {
  const types = [...new Set(DB.dev.map((d) => d.type))].sort();
  const rows = devFiltered().filter((d) => !feedType || d.type === feedType);
  render(card('Policy developments and intelligence feed', `${rows.length} developments. Analyst-reviewed items carry a summary and implications; items captured automatically from official feeds are marked <span class="st unverified">unverified</span> until reviewed. Duplicates are merged and listed under “also reported”.`,
    `<div class="filters"><label>Type of development <select id="dType"><option value="">All types</option>${types.map((t) => `<option${t === feedType ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div><div class="plist">${rows.map((d) => devItem(d)).join('') || '<p class="empty">No development matches these filters.</p>'}</div>`));
  $('dType').addEventListener('change', (e) => { feedType = e.target.value; feed(); });
}
function development(id) {
  const d = byId.dev.get(id);
  if (!d) return render(card('Development not found', '', '<p class="empty"><a href="#feed">Back to the feed</a></p>'));
  const progs = (d.programmes || []).map((x) => byId.pr.get(x)).filter(Boolean);
  render(`<div class="crumbs"><a href="#feed">Developments</a> › <span>${fmtDate(d.date)}</span></div>
   <section class="card"><div class="card-head row"><div><h2 style="font-size:21px">${esc(d.headline)}</h2><p class="note">${fmtDate(d.date)} · ${esc(d.source_institution || d.institution)} · ${esc(d.type)}</p></div><div>${stBadge(d.status)} ${saveBtn('dev', d.id)}</div></div>
    <dl class="kv"><dt>What happened <span class="ev fact">fact</span></dt><dd>${esc(d.what || 'Not summarised yet.')}</dd>
     <dt>Why it matters <span class="ev interp">analysis</span></dt><dd>${esc(d.why || 'Awaiting analyst review.')}</dd>
     <dt>For startups <span class="ev interp">analysis</span></dt><dd>${esc(d.startups || '—')}</dd><dt>For investors <span class="ev interp">analysis</span></dt><dd>${esc(d.investors || '—')}</dd>
     <dt>Policy</dt><dd><div class="tags">${(d.frameworks || []).map(fwLink).join('') || '—'}</div></dd><dt>Sectors</dt><dd><div class="tags">${(d.sectors || []).map(secLink).join('') || '—'}</div></dd>
     <dt>Countries affected</dt><dd>${(d.countries || []).map(esc).join(', ')}</dd><dt>Related funding</dt><dd><div class="tags">${progs.map((p) => prLink(p.id)).join('') || '—'}</div></dd>
     <dt>Source</dt><dd><a href="${esc(d.source_url)}" target="_blank" rel="noopener">${esc(d.source_institution || d.source_url)}</a> <span class="lv">· ${esc(LEVEL[d.source_level] || d.source_type)} · retrieved ${fmtDate(d.retrieved)}${d.last_verified ? ` · verified ${fmtDate(d.last_verified)}` : ' · not yet verified'}</span>${d.source_type === 'news' ? '<div class="small warn">Secondary source: no official page could be read for this item.</div>' : ''}</dd>
     ${(d.also_reported || []).length ? `<dt>Also reported</dt><dd>${d.also_reported.map((u) => `<a class="small" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('<br>')}</dd>` : ''}
     <dt>Record</dt><dd class="small muted">id ${esc(d.id)} · version ${d.version || 1} · ${d.origin === 'feed' ? 'captured from an official feed' : 'compiled by the analyst'}${d.summary_by ? ' · summary written with AI assistance (Claude) and reviewed against the source' : ''}</dd></dl></section>`);
}

function insItem(i) {
  return `<article class="pitem"><div class="meta"><span class="tag">${esc({ spotlight: 'Policy Spotlight', signal: 'Capital Signal', implications: 'Market Implications' }[i.type] || i.type)}</span><span>${fmtDate(i.date)}</span>${i.evidence ? evBadge(i.evidence) : ''}${saveBtn('ins', i.id)}</div>
    <h3><a href="#insight/${slug(i.id)}">${esc(i.title)}</a></h3><p>${esc(i.summary)}</p><div class="tags">${(i.frameworks || []).map(fwLink).join('')}${(i.sectors || []).map(secLink).join('')}</div></article>`;
}
function insights() {
  const rows = DB.ins.filter((i) => (!F.sector || (i.sectors || []).includes(F.sector)) && (!F.framework || (i.frameworks || []).includes(F.framework)));
  const groups = [['spotlight', 'Policy Spotlight'], ['signal', 'Capital Signals'], ['implications', 'Market Implications']];
  render(card('Policy & Capital Insights', 'Each insight separates verified facts (with sources), calculations from the funding data (with method), interpretation and hypotheses. An insight is only published when the evidence supports it; open questions are listed as such.',
    `<div class="legend-ev"><div><span class="ev fact">Fact</span> stated by a cited source</div><div><span class="ev calc">Calculation</span> computed by TechCap from disclosed rounds; method given</div><div><span class="ev interp">Interpretation</span> analyst reading of the facts</div><div><span class="ev hyp">Hypothesis</span> to be tested; not established</div></div>`)
    + groups.map(([k, label]) => { const g = rows.filter((i) => i.type === k); return g.length ? card(label, '', `<div class="plist">${g.map(insItem).join('')}</div>`) : ''; }).join('')
    + (rows.length ? '' : card('No insight matches', '', '<p class="empty">Try removing a filter.</p>')));
}
const cite = (srcs) => (srcs || []).map((s, k) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">[${k + 1}] ${esc(s.title || s.institution || 'source')}</a>`).join(' ');
function insight(id) {
  const i = byId.ins.get(id);
  if (!i) return render(card('Insight not found', '', '<p class="empty"><a href="#insights">Back to insights</a></p>'));
  const sec = (title, cls, label, arr, f) => (arr && arr.length ? `<h3 class="ins-sec">${title}</h3>${arr.map((x) => `<div class="claim"><span class="ev ${cls}">${label}</span><div>${f(x)}</div></div>`).join('')}` : '');
  const aud = i.audiences || {};
  render(`<div class="crumbs"><a href="#insights">Insights</a> › <span>${esc(i.title)}</span></div>
   <section class="card"><div class="card-head row"><div><h2 style="font-size:22px">${esc(i.title)}</h2><p class="note">${esc({ spotlight: 'Policy Spotlight', signal: 'Capital Signal', implications: 'Market Implications' }[i.type] || i.type)} · ${fmtDate(i.date)} · data as of ${fmtDate(i.data_as_of)} · ${esc(i.author || '')}</p></div><div>${i.evidence ? evBadge(i.evidence) : ''} ${saveBtn('ins', i.id)}</div></div>
    <p style="max-width:85ch;font-size:16px">${esc(i.summary)}</p>
    ${(i.sections || []).map((s) => `<h3 class="ins-sec">${esc(s.title)}</h3><p style="max-width:85ch">${esc(s.text)}</p>${s.sources ? `<p class="small muted">${cite(s.sources)}</p>` : ''}`).join('')}
    ${sec('Verified facts', 'fact', 'Fact', i.facts, (x) => `${esc(x.text)} <span class="cite">${cite(x.sources)}</span>`)}
    ${sec('Calculations from the funding data', 'calc', 'Calculation', i.calculations, (x) => `${esc(x.text)}<div class="cite">Method: ${esc(x.method)}</div>`)}
    ${sec('Interpretation', 'interp', 'Analysis', i.interpretation, (x) => esc(x))}
    ${sec('Hypotheses to test', 'hyp', 'Hypothesis', i.hypotheses, (x) => esc(x))}
    ${Object.keys(aud).length ? `<h3 class="ins-sec">What it means</h3><div class="aud">${[['founders', 'Startup founders'], ['investors', 'Venture capital investors'], ['corporates', 'Corporate investors'], ['ecosystem', 'Innovation ecosystem organisations']].filter(([k]) => aud[k]).map(([k, l]) => `<div><h4>${l}</h4><p>${esc(aud[k])}</p></div>`).join('')}</div>` : ''}
    ${(i.alternatives || []).length ? `<div class="box" style="margin-top:14px"><h3>Alternative explanations</h3><ul>${i.alternatives.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${(i.limitations || []).length ? `<div class="box warn" style="margin-top:10px"><h3>Data limitations</h3><ul>${i.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="tags" style="margin-top:12px">${(i.frameworks || []).map(fwLink).join('')}${(i.programmes || []).map(prLink).join('')}${(i.sectors || []).map(secLink).join('')}</div></section>`);
}

function saved() {
  SAVED = readSaved();
  const groups = [['fw', 'Frameworks'], ['pr', 'Funding programmes'], ['dev', 'Developments'], ['ins', 'Insights']];
  render(card('Saved items', 'Stored in this browser only (no account, nothing sent anywhere). Clearing site data removes them.',
    groups.map(([t, l]) => { const g = SAVED.items.filter((i) => i.type === t); return g.length ? `<h3 class="sub">${l}</h3><div class="tags" style="margin-bottom:12px">${g.map((i) => savedChip(i) + saveBtn(i.type, i.id)).join(' ')}</div>` : ''; }).join('') || '<p class="empty">Nothing saved yet.</p>')
    + card('Followed sectors', 'New developments in these sectors are flagged on the overview after each visit.', SAVED.sectors.length ? `<div class="tags">${SAVED.sectors.map((s) => secLink(s) + followBtn(s)).join(' ')}</div>` : '<p class="empty">Follow a sector from its sector page.</p>')
    + card('Saved searches', 'A saved search keeps the view and filters.', SAVED.searches.length ? `<ul class="signals">${SAVED.searches.map((s) => `<li><a href="${esc(s.hash)}">${esc(s.name)}</a> <span class="lv">${fmtDate(s.at)}</span> <button class="save" type="button" data-unsearch="${esc(s.hash)}">Remove</button></li>`).join('')}</ul>` : '<p class="empty">Use “Save this search” in the filter bar.</p>'));
}

// ---------- Policy → Capital (computed in the browser from the funding dataset) ----------
async function capital() {
  render(card('Policy → Capital', '', '<p class="loading">Loading the funding dataset (all rounds since 2021)…</p>'));
  const rounds = await loadRounds();
  if (currentView !== 'capital') return;
  const strategic = (byId.fw.get('step') || {}).sectors || [];
  const stage = F.stage && F.stage !== 'Research' ? F.stage : '';
  const a = analyse(rounds, { frameworks: DB.fw, programmes: DB.pr, filters: { country: F.country, sector: F.sector, stage }, strategic });
  const scope = [F.country || 'Europe', F.sector || 'all sectors', stage || 'all stages'].join(' · ');
  const yrs = a.years;
  const lastY = yrs[yrs.length - 1] || {};
  const pubLast = a.eu_rounds.filter((r) => r.date > a.lastFrom).length;
  const tiles = `<section class="tiles"><div class="tile"><h3>Venture funding, last 12 months</h3><div class="big">${eur(a.countries.reduce((t, c) => t + c.last_eur, 0))}</div><div class="chg">${fmtDate(a.lastFrom)} – ${fmtDate(a.asOf)} · ${sgn(a.market_growth)} vs prior 12m</div></div>
    <div class="tile"><h3>Rounds with an EU-level investor</h3><div class="big">${int(pubLast)}</div><div class="chg">last 12m · ${int(a.eu_rounds.length)} since 2021 ${evBadge('direct')}</div></div>
    <div class="tile"><h3>Rounds with a national public investor</h3><div class="big">${int(yrs.reduce((t, y) => t + y.nat_n, 0))}</div><div class="chg">since 2021 ${evBadge('documented')}</div></div>
    <div class="tile"><h3>Share of VC in STEP sectors</h3><div class="big">${pct(lastY.strat_share)}</div><div class="chg">${esc(lastY.year || '')} to date · ${strategic.map(esc).join(', ')}</div></div>
    <div class="tile"><h3>Median round with EU investor</h3><div class="big">${eur(a.eu_round_median)}</div><div class="chg">vs ${eur(a.vc_median)} for all disclosed VC rounds</div></div></section>`;
  const maxY = Math.max(1, ...yrs.map((y) => y.vc_eur));
  const W = 1000, H = 230, bw = W / Math.max(1, yrs.length);
  const chart = `<svg viewBox="0 0 ${W} ${H + 40}" role="img" aria-label="Venture funding by year, split into STEP strategic sectors and other sectors">${yrs.map((y, k) => { const h = (y.vc_eur / maxY) * H, hs = (y.strat_eur / maxY) * H; const x = k * bw + bw * 0.18, w = bw * 0.64; return `<g><rect x="${x}" y="${H - h}" width="${w}" height="${h - hs}" fill="var(--c6)" opacity=".45"><title>${y.year}: ${eur(y.vc_eur - y.strat_eur)} other sectors</title></rect><rect x="${x}" y="${H - hs}" width="${w}" height="${hs}" fill="var(--c1)"><title>${y.year}: ${eur(y.strat_eur)} in STEP sectors (${pct(y.strat_share)})</title></rect><text x="${x + w / 2}" y="${H + 16}" text-anchor="middle" font-size="12" fill="var(--muted)">${y.year}</text><text x="${x + w / 2}" y="${H - h - 6}" text-anchor="middle" font-size="11" fill="var(--fg)">${pct(y.strat_share)}</text></g>`; }).join('')}</svg>`;
  const secRows = a.sectors.filter((s) => s.vc_n >= 5).slice(0, 25);
  const gapLabel = { lagging: '<span class="lvl neg">Policy priority, funding lags market</span>', outpacing: '<span class="lvl pos">Policy priority, funding outpaces market</span>', 'market-led': '<span class="lvl mid">Market-led, little policy focus</span>' };
  const secTable = `<div class="tbox tall"><table><thead><tr><th><span class="thl">Sector</span></th><th class="num"><span class="thl">Policy exposure</span></th><th class="num"><span class="thl">VC last 12m</span></th><th class="num"><span class="thl">Share</span></th><th class="num"><span class="thl">vs prior 12m</span></th><th class="num"><span class="thl">vs market</span></th><th class="num"><span class="thl">Rounds w/ public investor</span></th><th class="num"><span class="thl">EU-backed since 2021</span></th><th class="num"><span class="thl">Grants since 2021</span></th><th><span class="thl">Reading</span></th></tr></thead><tbody>${secRows.map((s) => `<tr><td>${secLink(s.sector)}${s.strategic ? ' <span class="tag rise" title="STEP strategic sector">STEP</span>' : ''}</td><td class="num">${s.exposure}</td><td class="num">${eur(s.last_eur)}</td><td class="num">${pct(s.share_last, 1)}</td><td class="num">${sgn(s.growth)}</td><td class="num ${s.rel_growth > 0 ? 'pos' : s.rel_growth < 0 ? 'neg' : ''}">${sgn(s.rel_growth)}</td><td class="num">${pct(s.pub_share_last)}</td><td class="num">${int(s.eu_n)}</td><td class="num">${int(s.grant_n)}</td><td>${gapLabel[s.gap] || ''}</td></tr>`).join('')}</tbody></table></div>`;
  const ctyRows = a.countries.filter((c) => c.vc_n >= 5);
  const ctyTable = `<div class="tbox tall"><table><thead><tr><th><span class="thl">Country</span></th><th class="num"><span class="thl">VC last 12m</span></th><th class="num"><span class="thl">vs prior 12m</span></th><th class="num"><span class="thl">Rounds w/ public investor, 12m</span></th><th class="num"><span class="thl">EU-backed rounds since 2021</span></th><th class="num"><span class="thl">Their total size</span></th><th class="num"><span class="thl">Grants recorded</span></th></tr></thead><tbody>${ctyRows.map((c) => `<tr><td>${esc(c.country)}</td><td class="num">${eur(c.last_eur)}</td><td class="num">${sgn(c.growth)}</td><td class="num">${pct(c.pub_share_last)}</td><td class="num">${int(c.eu_n)}</td><td class="num">${eur(c.eu_eur)}</td><td class="num">${int(c.grant_n)}</td></tr>`).join('')}</tbody></table></div>`;
  const vcStages = a.stages.filter((s) => STAGE_ORDER.includes(s.stage) && s.stage !== 'Other' && s.n >= 5);
  const maxS = Math.max(...vcStages.map((s) => (s.eu_n + s.nat_n) / s.n), 0.01);
  const stageBars = `<div class="bars">${vcStages.map((s) => `<div class="bar2"><span>${esc(s.stage)}</span><div class="t" title="${s.eu_n} with EU investor, ${s.nat_n} with national public investor, of ${s.n} rounds"><span style="width:${((s.eu_n + s.nat_n) / s.n / maxS) * 100}%;background:var(--c2)"></span></div><span class="v">${pct((s.eu_n + s.nat_n) / s.n)}</span></div>`).join('')}</div><p class="note">Share of rounds at each stage that name an EU-level or national public investor. Rounds with no stage given (${int((a.stages.find((s) => s.stage === 'Other') || {}).n)}) are not shown.</p>`;
  const evRows = a.events;
  const evTable = evRows.length ? `<div class="tbox"><table><thead><tr><th><span class="thl">Policy</span></th><th><span class="thl">Date</span></th><th><span class="thl">Sectors</span></th><th class="num"><span class="thl">VC 12m before</span></th><th class="num"><span class="thl">12m after</span></th><th class="num"><span class="thl">Change</span></th><th class="num"><span class="thl">Market change</span></th><th class="num"><span class="thl">Relative</span></th></tr></thead><tbody>${evRows.map((e) => `<tr><td>${fwLink(e.framework)}</td><td class="num">${fmtDate(e.date)} <span class="small muted">${esc(e.date_kind)}</span></td><td class="dim">${e.sectors.map(esc).join(', ')}</td><td class="num">${eur(e.before)}</td><td class="num">${eur(e.after)}${e.complete ? '' : ' <span class="small muted">(partial)</span>'}</td><td class="num">${sgn(e.growth)}</td><td class="num">${sgn(e.market_growth)}</td><td class="num ${e.relative > 0 ? 'pos' : 'neg'}">${sgn(e.relative)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No sector-specific policy date in range.</p>';
  const coTable = `<div class="two"><div><h3 class="sub">EU bodies named in rounds</h3><div class="bars">${a.eu_bodies.map(([b, n]) => `<div class="bar2"><span>${esc(b)}</span><div class="t"><span style="width:${(n / (a.eu_bodies[0] || [0, 1])[1]) * 100}%;background:var(--c1)"></span></div><span class="v">${n}</span></div>`).join('') || '<p class="empty">None in this selection.</p>'}</div></div>
    <div><h3 class="sub">Private investors most often alongside them</h3><ol class="signals">${a.co_investors.slice(0, 12).map(([n, k]) => `<li>${esc(n)} <span class="lv">${k} rounds</span></li>`).join('') || '<li>None in this selection.</li>'}</ol></div></div>`;
  const euTable = `<div class="tbox tall"><table><thead><tr><th><span class="thl">Date</span></th><th><span class="thl">Company</span></th><th><span class="thl">Country</span></th><th><span class="thl">Stage</span></th><th class="num"><span class="thl">Round</span></th><th><span class="thl">EU / public investor</span></th><th class="hide-sm"><span class="thl">Private co-investors</span></th></tr></thead><tbody>${a.eu_rounds.slice(0, 60).map((r) => `<tr><td class="num">${fmtDate(r.date)}</td><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.company)}</a>` : esc(r.company)}</td><td>${esc(r.country)}</td><td>${esc(r.stage === 'Other' ? 'Not specified' : r.stage)}</td><td class="num">${eur(r.amount)}</td><td class="dim">${r.public.concat(r.national).map(esc).join(', ')}</td><td class="dim hide-sm">${r.private.slice(0, 4).map(esc).join(', ')}${r.private.length > 4 ? '…' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  render(`<section class="card"><div class="card-head"><h2>Policy → Capital: ${esc(scope)}</h2><p class="note">Connects policy priorities and public investors to disclosed startup funding rounds. Each panel states its evidence level.</p></div>
     <div class="legend-ev">${Object.keys(EVIDENCE).map((k) => `<div>${evBadge(k)} <span class="small">${esc(EVIDENCE[k][1])}</span></div>`).join('')}</div></section>
   ${tiles}
   ${card('Where venture capital goes: strategic vs other sectors', `Disclosed equity rounds by year; teal = STEP strategic sectors (${strategic.map(esc).join(', ')}), label = their share. A round tagged with two sectors counts once here. ${evBadge('influence')}`, `<div class="chart">${chart}</div>`)}
   ${card('Sector view: policy exposure vs actual funding', `Policy exposure = tracked frameworks + programmes naming the sector. “vs market” compares the sector's 12-month change with the whole market's (${sgn(a.market_growth)}). Readings are descriptive flags, not forecasts. ${evBadge('association')}`, secTable)}
   ${card('Which stages get public co-investors', evBadge('documented'), stageBars)}
   ${card('Before and after major policy dates', `12 months either side of the date the act entered into force (or was published). ${evBadge('association')}`, evTable + '<p class="note">Read with care: interest rates, a handful of mega-rounds and global sector cycles (e.g. generative AI from 2023) move these windows far more than any single act.</p>')}
   ${card('Country view', `Venture funding and public participation by country. ${evBadge('documented')}`, ctyTable + '<p class="note">EU grant awards by country (CORDIS) are not yet ingested; grants shown are only those announced as funding rounds.</p>')}
   ${card('Is EU money crowding in private investors?', `Rounds that name an EU institution or instrument, and who invested alongside. ${evBadge('direct')}`, coTable + `<p class="note">A public-to-private ratio cannot be computed from round data: announcements rarely state each investor's share. Official leverage figures (e.g. EIC Fund: over €3.5 of other investment per €1 invested directly) are listed on the <a href="#overview">overview</a> with their sources.</p>`)}
   ${card(`Latest rounds with an EU-level investor (${int(a.eu_rounds.length)})`, 'Most recent first. Links open the round on its source.', euTable)}
   <section class="card"><div class="box warn"><h3>Data limitations</h3><ul>
     <li>Funding data covers publicly announced rounds only; undisclosed amounts are left out of totals, not estimated.</li>
     <li>Public participation is detected from investor names (rules listed in the open-source code). Rounds where a public investor took part but was not named are missed; names that resemble an institution are excluded by strict matching.</li>
     <li>National promotional banks are counted as “documented participation”, not as EU funding, even where they deploy EU money (e.g. via InvestEU or cohesion funds): the round data does not show which money was used.</li>
     <li>${int((a.stages.find((s) => s.stage === 'Other') || {}).n)} rounds have no stage in their announcement; stage views exclude them.</li>
     <li>Policy exposure counts records in this database; it measures policy attention, not money committed.</li>
     <li>Sector tags come from the funding dataset and can be applied more often in later years (e.g. “AI” and “Deeptech”), which raises strategic-sector shares over time independently of investment.</li></ul></div></section>`);
}

async function sector(name) {
  const s = name;
  render(card(esc(s), '', '<p class="loading">Loading…</p>'));
  const [rounds, comps] = await Promise.all([loadRounds(), loadCompanies()]);
  if (currentView !== 'sector') return;
  const fws = DB.fw.filter((f) => (f.sectors || []).includes(s));
  const prs = DB.pr.filter((p) => (p.sectors || []).includes(s));
  const prsAll = DB.pr.filter((p) => (p.sectors || []).includes('All'));
  const devs = DB.dev.filter((d) => (d.sectors || []).includes(s));
  const ins = DB.ins.filter((i) => (i.sectors || []).includes(s));
  const a = analyse(rounds, { frameworks: DB.fw, programmes: DB.pr, filters: { country: F.country, sector: s }, strategic: (byId.fw.get('step') || {}).sectors || [] });
  const row = a.sectors.find((x) => x.sector === s) || {};
  const recent = rounds.filter((r) => r.sectors.includes(s) && (!F.country || r.country === F.country) && SCOPE.includes(r.country)).sort((x, z) => (x.date < z.date ? 1 : -1));
  const invCount = new Map();
  for (const r of recent) if (r.date > a.lastFrom) for (const n of r.investors) if (!GENERIC.test(n)) invCount.set(n, (invCount.get(n) || 0) + 1);
  const topInv = [...invCount].sort((x, z) => z[1] - x[1]).slice(0, 12);
  const topCo = comps.filter((c) => (c[3] || '').split('|').includes(s) && (!F.country || c[2] === F.country) && SCOPE.includes(c[2])).slice(0, 10);
  render(`<div class="crumbs"><a href="#capital">Policy → Capital</a> › <span>Sector</span></div>
   <section class="card"><div class="card-head row"><div><h2 style="font-size:24px">${esc(s)}${F.country ? ` · ${esc(F.country)}` : ' in Europe'}</h2><p class="note">Policies, EU funding, startups, investors and rounds for this sector, connected.</p></div><div>${followBtn(s)}</div></div>
    <section class="tiles mini"><div class="tile"><h3>VC, last 12 months</h3><div class="big">${eur(row.last_eur)}</div><div class="chg">${sgn(row.growth)} vs prior 12m · ${sgn(row.rel_growth)} vs market</div></div>
     <div class="tile"><h3>Policy exposure</h3><div class="big">${fws.length + prs.length}</div><div class="chg">${fws.length} frameworks · ${prs.length} sector programmes</div></div>
     <div class="tile"><h3>Rounds with public investor, 12m</h3><div class="big">${pct(row.pub_share_last)}</div><div class="chg">${int(row.eu_n)} EU-backed rounds since 2021</div></div>
     <div class="tile"><h3>Median round, 12m</h3><div class="big">${eur(row.median_last)}</div><div class="chg">${int(row.last_n)} rounds</div></div></section></section>
   <div class="two">${card('Policies naming this sector', evBadge('influence'), `<div class="plist">${fws.map(fwItem).join('') || '<p class="empty">No tracked framework names this sector specifically.</p>'}</div>`)}
   </div>${card('EU funding programmes', `Sector-specific first, then open-to-all programmes.`, prTable([...prs, ...prsAll.filter((p) => !prs.includes(p))]))}
   <div class="two">${card('Leading startups by disclosed funding', 'Since 2021, from the TechCap funding dataset.', `<div class="tbox"><table><thead><tr><th><span class="thl">Company</span></th><th><span class="thl">Country</span></th><th class="num"><span class="thl">Raised</span></th><th class="num"><span class="thl">Last round</span></th></tr></thead><tbody>${topCo.map((c) => `<tr><td>${esc(c[1])}</td><td>${esc(c[2])}</td><td class="num">${eur(c[4])}</td><td class="num">${fmtDate(c[6])}</td></tr>`).join('')}</tbody></table></div>`)}
    ${card('Most active investors, last 12 months', 'Investors named most often in this sector’s rounds; public investors marked.', `<ol class="signals">${topInv.map(([n, k]) => { const p = publicInvestors([n]); return `<li>${esc(n)} <span class="lv">${k} rounds</span>${p.eu.length ? ' ' + evBadge('direct') : p.nat.length ? ' ' + evBadge('documented') : ''}</li>`; }).join('') || '<li>No rounds in the last 12 months.</li>'}</ol>`)}</div>
   ${card('Latest funding rounds', '', `<div class="tbox"><table><thead><tr><th><span class="thl">Date</span></th><th><span class="thl">Company</span></th><th><span class="thl">Country</span></th><th><span class="thl">Stage</span></th><th class="num"><span class="thl">Amount</span></th><th class="hide-sm"><span class="thl">Investors</span></th></tr></thead><tbody>${recent.slice(0, 15).map((r) => `<tr><td class="num">${fmtDate(r.date)}</td><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.company)}</a>` : esc(r.company)}</td><td>${esc(r.country)}</td><td>${esc(r.stage === 'Other' ? 'Not specified' : r.stage)}</td><td class="num">${eur(r.amount)}</td><td class="dim hide-sm">${r.investors.slice(0, 4).map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div>`)}
   <div class="two">${card('Developments', '', `<div class="plist">${devs.slice(0, 8).map((d) => devItem(d, true)).join('') || '<p class="empty">None yet.</p>'}</div>`)}${card('Insights', '', `<div class="plist">${ins.map(insItem).join('') || '<p class="empty">No insight on this sector yet.</p>'}</div>`)}</div>`);
}

boot();
