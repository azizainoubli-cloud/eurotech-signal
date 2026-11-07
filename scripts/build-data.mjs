// Builds the data snapshot for the TechCap Intelligence public site from the free
// Tech.eu Funding Explorer API (CC BY 4.0, https://funding.tech.eu/api-docs).
//
// Output (site/data/):
//   rounds-YYYY.json   every round of that year, compact rows, Israel excluded
//   cube.json          yearly totals by country x sector x instrument, for the trend chart
//   meta.json          when the data was built and what it holds
//   scan-archive.json  every round ever found by the daily multi-source scan or the historical
//                      backfill (backfill.json), never pruned
//
// Aggregation: rounds from the daily multi-source scan (news, startup and VC announcements,
// press wires) that at least two independent sources confirm and that Tech.eu does not list
// (same company within 30 days) are added to the yearly files with origin "scan", so the
// totals cover more than Tech.eu alone. Nothing is estimated: undisclosed amounts stay empty.
//
// Refresh policy (keeps well inside Tech.eu's fair-use limits of 120 req/min, 600/h, 2000/day):
//   - the current and previous year are re-fetched on every run;
//   - older years are re-fetched on Mondays, or when their file is missing, or with FULL=1.

import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://funding.tech.eu/api/v1';
const OUT = path.resolve('site/data');
const FIRST_YEAR = 2021;
const EXCLUDE = new Set(['Israel']);
const OFFLINE = process.env.OFFLINE === '1'; // rebuild from local files only (no API calls)
const MIN_GAP_MS = 650; // about 90 requests a minute
const today = new Date();
const thisYear = today.getUTCFullYear();

let last = 0, calls = 0;
async function get(url, tries = 4) {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now(); calls++;
  const res = await fetch(url, { headers: { 'user-agent': 'TechCap-Intelligence-site (+https://github.com)' } });
  if (res.status === 429 && tries > 0) {
    const s = Number(res.headers.get('retry-after')) || 30;
    console.log(`  rate limited, waiting ${s}s`);
    await new Promise((r) => setTimeout(r, s * 1000));
    return get(url, tries - 1);
  }
  if (res.status >= 500 && tries > 0) { await new Promise((r) => setTimeout(r, 5000)); return get(url, tries - 1); }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const sectorsOf = (c) => (c && Array.isArray(c.sectors) ? c.sectors : []).map(String);
const investorsOf = (r) => (Array.isArray(r.investors) ? r.investors : []).map((i) => (typeof i === 'string' ? i : i && (i.name || i.displayName) || '')).filter(Boolean);

async function fetchMonth(y, m) {
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const rows = []; let after = null;
  do {
    const q = new URLSearchParams({ from, to, limit: '100', ...(after ? { after } : {}) });
    const a = await get(`${API}/rounds?${q}`);
    rows.push(...(a.data || []));
    after = a.nextCursor || null;
  } while (after);
  return rows;
}

async function fetchYear(y) {
  const lastMonth = y === thisYear ? today.getUTCMonth() + 1 : 12;
  const all = [];
  for (let m = 1; m <= lastMonth; m++) {
    const rows = await fetchMonth(y, m);
    all.push(...rows);
  }
  const seen = new Set();
  const rows = [];
  for (const r of all) {
    if (!r || seen.has(r.id)) continue; seen.add(r.id);
    const c = r.company || {};
    const country = c.country || '';
    if (EXCLUDE.has(country)) continue;
    const amt = Number(r.amountEur) > 0 ? Math.round(Number(r.amountEur)) : null;
    rows.push([
      r.id, String(r.date || '').slice(0, 10), c.name || '', c.id || '', country, c.city || '',
      sectorsOf(c).join('|'), r.stage || 'Other', amt, investorsOf(r).join('|'),
      r.pageUrl || (r.url ? `https://funding.tech.eu${r.url}` : ''), r.source && r.source.domain ? r.source.domain : '', 'techeu'
    ]);
  }
  rows.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return rows;
}

const COLUMNS = ['id', 'date', 'company', 'company_id', 'country', 'city', 'sectors', 'stage', 'amount_eur', 'investors', 'url', 'source', 'origin'];
const SCOPE = new Set(['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Norway','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','Switzerland','UK']);
const SECTOR_MAP = { Biotech: 'Healthtech', Insurtech: 'Fintech', Mobility: 'Transportation' };
const STAGES = new Set(['Pre-Seed','Seed','Early VC','Series A','Series B','Series C','Series D+','Growth/Late','Debt','Grant','Crowdfunding']);
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(gmbh|ltd|limited|sas|sa|ag|ab|bv|nv|srl|spa|inc|oy|as|aps|sl)\b/g, '').replace(/[^a-z0-9]/g, '');
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

// Keeps every scan row ever seen, so rounds stay in the totals after the scan's 60-day window drops them.
async function updateScanArchive() {
  const annFile = path.join(OUT, 'announcements.json'), arcFile = path.join(OUT, 'scan-archive.json');
  let ann = [], arc = [];
  try { ann = JSON.parse(await fs.readFile(annFile, 'utf8')).rows || []; } catch {}
  try { arc = JSON.parse(await fs.readFile(arcFile, 'utf8')).rows || []; } catch {}
  // backfill.json: rounds announced before the daily scan started, found by the historical backfill task.
  let bf = [];
  try { bf = JSON.parse(await fs.readFile(path.join(OUT, 'backfill.json'), 'utf8')).rows || []; } catch {}
  const byId = new Map(arc.map((r) => [r.id, r]));
  for (const r of [...bf, ...ann]) if (r && r.id && r.company && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) byId.set(r.id, { ...byId.get(r.id), ...r });
  const rows = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  await fs.writeFile(arcFile, JSON.stringify({ rows }));
  return rows;
}

// Adds confirmed scan rounds that Tech.eu does not have to one year's rows. Returns the merged rows.
function mergeScan(y, teRows, scanRows, neighbours) {
  const te = teRows.filter((r) => r[12] !== 'scan');
  const known = [...te, ...neighbours].map((r) => [norm(r[2]), r[1]]);
  const added = [];
  for (const s of scanRows) {
    if (!String(s.date).startsWith(String(y))) continue;
    if (!SCOPE.has(s.country) || EXCLUDE.has(s.country)) continue;
    if ((Number(s.n_sources) || 1) < 2) continue;
    if (String(s.in_techeu).toLowerCase() === 'yes' || /funding\.tech\.eu/.test(`${s.source} ${s.other_sources} ${s.source_url}`)) continue;
    const n = norm(s.company); if (!n) continue;
    const n1 = norm(String(s.company).replace(/\(.*?\)/g, ''));
    const same = (k) => k === n || k === n1 || (k.length >= 4 && n1.length >= 4 && (k.startsWith(n1) || n1.startsWith(k)));
    if (known.some(([k, d]) => same(k) && days(d, s.date) <= 30)) continue;
    const sectors = String(s.sector || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => SECTOR_MAP[x] || x);
    const sources = [s.source, ...String(s.other_sources || '').split(',').map((x) => x.trim())].filter(Boolean);
    added.push([
      'scan:' + s.id, s.date, s.company, 'scan:' + n, s.country, '', sectors.join('|'),
      STAGES.has(s.stage) ? s.stage : 'Other', Number(s.amount_eur) > 0 ? Math.round(Number(s.amount_eur)) : null,
      String(s.investors || '').split(',').map((x) => x.trim()).filter(Boolean).join('|'),
      /^https:\/\//.test(String(s.source_url)) ? s.source_url : '', [...new Set(sources)].join(', '), 'scan'
    ]);
    known.push([n, s.date]);
  }
  const rows = [...te.map((r) => (r.length > 12 ? r : [...r, 'techeu'])), ...added];
  rows.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return { rows, added: added.length };
}

const COUNTRY_ALIASES = { 'United Kingdom': 'UK', 'England': 'UK', 'Scotland': 'UK', 'Czechia': 'Czech Republic' };
function wikiClean(s) {
  return String(s || '')
    .replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{(?:flag|flagcountry|flagicon|flagu)\|([^}|]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{start date\|(\d{4})(?:\|(\d{1,2}))?(?:\|\d{1,2})?[^}]*\}\}/gi, (m, y, mo) => (mo ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(mo) - 1]} ${y}` : y))
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s?([^\]]*)\]/g, '$1')
    .replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/'{2,}/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseUnicorns(text) {
  const out = [];
  const tables = String(text).split(/\n\{\|/).slice(1).map((t) => t.split(/\n\|\}/)[0]);
  for (const tb of tables) {
    const rows = tb.split(/\n\|-[^\n]*/);
    let head = null;
    for (const raw of rows) {
      const lines = raw.split('\n').filter((l) => /^[!|]/.test(l) && !/^\|\+/.test(l));
      if (!lines.length) continue;
      const isHead = lines.every((l) => l.startsWith('!'));
      const cells = [];
      for (const l of lines) for (const c of l.replace(/^[!|]/, '').split(/!!|\|\|/)) {
        const v = /^[^\[{|]*=\s*"[^"]*"\s*\|/.test(c) || /^\s*(style|scope|class|rowspan|colspan|data-sort-value|align)=[^|]*\|/.test(c) ? c.slice(c.indexOf('|') + 1) : c;
        cells.push(wikiClean(v));
      }
      if (isHead) { head = cells.map((h) => h.toLowerCase()); continue; }
      if (!head) continue;
      const col = (re) => head.findIndex((h) => re.test(h));
      const iC = col(/^company/), iV = col(/^(last )?valuation(?! date)/), iD = col(/^valuation date/), iI = col(/industry/), iN = col(/countr/),
        iX = col(/exit date/), iR = col(/exit reason/);
      if (iC < 0 || iV < 0 || iN < 0) continue;
      const countries = (cells[iN] || '').split(/,| and |\//).map((x) => x.trim()).filter(Boolean).map((x) => COUNTRY_ALIASES[x] || x);
      if (!countries.some((c) => SCOPE.has(c))) continue;
      const name = cells[iC]; const val = parseFloat(String(cells[iV]).replace(/[^0-9.]/g, ''));
      if (!name || !(val > 0)) continue;
      out.push([name, norm(name), val, iD >= 0 ? cells[iD] : '', iI >= 0 ? cells[iI] : '', countries.join(', '), iX >= 0 ? 'former' : 'current', iX >= 0 ? cells[iX] : '', iR >= 0 ? cells[iR] : '']);
    }
  }
  return out;
}

// Search index: one row per company across all years (Tech.eu + confirmed scan rounds), plus companies that only appear in exits.
async function buildCompanyIndex(years) {
  const m = new Map();
  for (const y of years) {
    const f = path.join(OUT, `rounds-${y}.json`);
    if (!(await exists(f))) continue;
    for (const r of JSON.parse(await fs.readFile(f, 'utf8')).rows) {
      if (!SCOPE.has(r[4])) continue;
      const id = r[3] || r[0];
      const c = m.get(id) || { id, name: r[2], country: r[4], sectors: new Set(), total: 0, n: 0, last: '', stage: '', origin: r[12] || 'techeu' };
      (r[6] ? r[6].split('|') : []).forEach((s) => c.sectors.add(s));
      c.total += r[8] || 0; c.n++;
      if (r[1] > c.last) { c.last = r[1]; c.stage = r[7]; }
      m.set(id, c);
    }
  }
  let ex = [];
  try { ex = JSON.parse(await fs.readFile(path.join(OUT, 'exits.json'), 'utf8')).rows; } catch {}
  for (const e of ex) if (e[6] && !m.has(e[6])) m.set(e[6], { id: e[6], name: e[7], country: e[8], sectors: new Set(), total: 0, n: 0, last: '', stage: '', origin: 'techeu' });
  const rows = [...m.values()].map((c) => [c.id, c.name, c.country, [...c.sectors].join('|'), c.total, c.n, c.last, c.stage, c.origin]);
  rows.sort((a, b) => b[4] - a[4]);
  await fs.writeFile(path.join(OUT, 'companies.json'), JSON.stringify({ columns: ['id', 'name', 'country', 'sectors', 'total_eur', 'rounds', 'last_date', 'last_stage', 'origin'], rows }));
  console.log(`companies: ${rows.length} indexed`);
}

async function exists(f) { try { await fs.access(f); return true; } catch { return false; } }

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const full = process.env.FULL === '1' || today.getUTCDay() === 1;
  const years = [];
  for (let y = FIRST_YEAR; y <= thisYear; y++) years.push(y);

  for (const y of years) {
    const file = path.join(OUT, `rounds-${y}.json`);
    const refresh = !OFFLINE && (y >= thisYear - 1 || full || !(await exists(file)));
    if (!refresh) { console.log(`${y}: kept`); continue; }
    const t0 = Date.now();
    const rows = await fetchYear(y);
    if (!rows.length && await exists(file)) { console.log(`${y}: API returned nothing, kept previous file`); continue; }
    await fs.writeFile(file, JSON.stringify({ year: y, columns: COLUMNS, rows }));
    console.log(`${y}: ${rows.length} rounds in ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  // Merge confirmed multi-source scan rounds into every year file (idempotent: old scan rows are replaced).
  const scanRows = await updateScanArchive();
  const scanAdded = {};
  for (const y of years) {
    const file = path.join(OUT, `rounds-${y}.json`);
    if (!(await exists(file))) continue;
    const cur = JSON.parse(await fs.readFile(file, 'utf8')).rows;
    const near = [];
    for (const z of [y - 1, y + 1]) {
      const f = path.join(OUT, `rounds-${z}.json`);
      if (await exists(f)) near.push(...JSON.parse(await fs.readFile(f, 'utf8')).rows.filter((r) => r[12] !== 'scan'));
    }
    const { rows, added } = mergeScan(y, cur, scanRows, near);
    scanAdded[y] = added;
    await fs.writeFile(file, JSON.stringify({ year: y, columns: COLUMNS, rows }));
  }
  console.log('scan rounds added:', JSON.stringify(scanAdded));

  // Trend cube: [year, country, sector ('*' = all sectors), kind ('equity'|'debt'|'grant'), euros, rounds]
  const cube = new Map();
  const add = (k, eur) => { const v = cube.get(k) || [0, 0]; v[0] += eur; v[1] += 1; cube.set(k, v); };
  const yearCounts = {};
  for (const y of years) {
    const file = path.join(OUT, `rounds-${y}.json`);
    if (!(await exists(file))) continue;
    const { rows } = JSON.parse(await fs.readFile(file, 'utf8'));
    yearCounts[y] = rows.length;
    for (const r of rows) {
      const kind = r[7] === 'Debt' ? 'debt' : r[7] === 'Grant' ? 'grant' : 'equity';
      const eur = r[8] || 0;
      const secs = r[6] ? r[6].split('|') : ['Unclassified'];
      for (const country of [r[4], '*']) {
        add(`${y}\t${country}\t*\t${kind}`, eur);
        for (const s of secs) add(`${y}\t${country}\t${s}\t${kind}`, eur);
      }
    }
  }
  const cubeRows = [...cube].map(([k, v]) => { const [y, c, s, kind] = k.split('\t'); return [Number(y), c, s, kind, v[0], v[1]]; });
  await fs.writeFile(path.join(OUT, 'cube.json'), JSON.stringify({ columns: ['year', 'country', 'sector', 'kind', 'euros', 'rounds'], rows: cubeRows }));

  // Investor types from Tech.eu's investor directory (top 2,500 investors by deal count), refreshed on every run.
  const invFile = path.join(OUT, 'investors.json');
  if (!OFFLINE) {
    const rows = []; let page = 1, pages = 1;
    do {
      const a = await get(`${API}/investors?sort=deals_desc&page=${page}`);
      for (const i of a.data || []) if (i && i.name) rows.push([i.name, i.type || 'Not classified', i.deals || 0]);
      pages = Math.min(a.totalPages || 1, 100); page++;
    } while (page <= pages);
    if (rows.length) await fs.writeFile(invFile, JSON.stringify({ columns: ['name', 'type', 'deals'], rows }));
    console.log(`investors: ${rows.length} typed`);
  }

  // Exits and M&A since 2021 for in-scope companies, refreshed every run.
  if (!OFFLINE) {
    const rows = []; let after = null, pages = 0;
    do {
      const q = new URLSearchParams({ from: `${FIRST_YEAR}-01-01`, limit: '100', ...(after ? { after } : {}) });
      const a = await get(`${API}/exits?${q}`);
      for (const e of a.data || []) {
        const c = e.company || {};
        if (!SCOPE.has(c.country)) continue;
        rows.push([e.id, String(e.date || '').slice(0, 10), e.type || 'other', Number(e.valueEur) > 0 ? Math.round(Number(e.valueEur)) : null,
          String(e.acquirors || '').trim(), e.acquirorHqCountry || '', c.id || '', c.name || '', c.country,
          c.pageUrl || (c.canonicalUrl ? `https://funding.tech.eu${c.canonicalUrl}` : '')]);
      }
      after = a.nextCursor || null; pages++;
    } while (after && pages < 300);
    if (rows.length) await fs.writeFile(path.join(OUT, 'exits.json'), JSON.stringify({ columns: ['id', 'date', 'type', 'value_eur', 'acquirers', 'acquirer_country', 'company_id', 'company', 'country', 'url'], rows }));
    console.log(`exits: ${rows.length} in scope (${pages} pages)`);
  }

  // Unicorns: Wikipedia's "List of unicorn startup companies" (CC BY-SA), current and former, European companies only.
  if (!OFFLINE) {
    try {
      const w = await fetch('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_unicorn_startup_companies&prop=wikitext&format=json&formatversion=2',
        { headers: { 'user-agent': 'TechCap-Intelligence-site/1.0 (https://github.com/azizainoubli-cloud/eurotech-signal)' } }).then((r) => r.json());
      const rows = parseUnicorns(w.parse.wikitext);
      if (!rows.some((r) => r[6] === 'current')) console.log('unicorns: no current rows parsed, check the Wikipedia table format');
      if (rows.length) await fs.writeFile(path.join(OUT, 'unicorns.json'), JSON.stringify({ source: 'https://en.wikipedia.org/wiki/List_of_unicorn_startup_companies',
        columns: ['company', 'key', 'valuation_usd_b', 'valuation_date', 'industry', 'countries', 'status', 'exit_date', 'exit_reason'], rows }));
      console.log(`unicorns: ${rows.length} European (${rows.filter((r) => r[6] === 'current').length} current)`);
    } catch (e) { console.log('unicorns: skipped,', e.message); }
  }

  await buildCompanyIndex(years);

  const annFile = path.join(OUT, 'announcements.json');
  if (!(await exists(annFile))) await fs.writeFile(annFile, JSON.stringify({ rows: [] }));

  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify({
    updated: new Date().toISOString(), years: yearCounts, scan_added: scanAdded, api_calls: calls,
    source: 'Tech.eu Funding Explorer (CC BY 4.0) plus the daily multi-source scan', source_url: 'https://funding.tech.eu', excluded: [...EXCLUDE]
  }, null, 1));
  console.log(`done, ${calls} API calls`);
}

main().catch((e) => { console.error(e); process.exit(1); });
