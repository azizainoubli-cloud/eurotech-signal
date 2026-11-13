// Offline tests for the Policy & Capital pipeline: node scripts/policy/test.mjs
// Runs ingestion twice against fixture feeds in a temporary copy of site/data/policy and checks:
// new vs duplicate vs historical vs update detection, call change history, error logging,
// incremental behaviour, that curated records are never modified, and the analytics module.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-test-'));
const out = path.join(tmp, 'policy'), fx = path.join(tmp, 'fx');
await fs.cp('site/data/policy', out, { recursive: true });
for (const f of ['ingest-state.json', 'ingest-log.json', 'calls.json', 'changes.json']) await fs.rm(path.join(out, f), { force: true });
await fs.mkdir(fx);
const before = { fw: await fs.readFile(path.join(out, 'frameworks.json'), 'utf8'), pr: await fs.readFile(path.join(out, 'programmes.json'), 'utf8') };
const devs0 = JSON.parse(await fs.readFile(path.join(out, 'developments.json'), 'utf8')).records;
const devCount0 = devs0.length, seedIds = new Set(devs0.map((d) => d.id)); // the live file already holds feed items: tests look only at what the fixtures add

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) => `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${i.d}</pubDate><description>${i.s || ''}</description></item>`).join('')}</channel></rss>`;
const sedia = (deadline) => JSON.stringify({ results: [
  { metadata: { identifier: ['HORIZON-EIC-2027-ACCELERATOR-01'], title: ['EIC Accelerator'], status: ['31094502'], deadlineDate: [deadline], startDate: ['2026-11-01T00:00:00.000+0000'], frameworkProgramme: ['43108390'] } },
  { metadata: { identifier: ['HORIZON-CL4-2027-05-01'], title: ['Digital and industry'], status: ['31094501'], deadlineDate: ['2027-03-18T17:00:00.000+0100'], frameworkProgramme: ['43108390'] } },
  { metadata: { identifier: ['ERASMUS-EDU-2027-01'], title: ['Not startup relevant'], status: ['31094502'], deadlineDate: ['2027-02-01'] } },
] });
const SED = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=1';
const cfg = { sources: [
  { id: 'feed-a', name: 'A', institution: 'European Innovation Council', adapter: 'rss', level: 2, url: 'https://a.test/rss', every_hours: 20, enabled: true },
  { id: 'feed-b', name: 'B', institution: 'European Commission', adapter: 'rss', level: 1, url: 'https://b.test/rss', every_hours: 20, enabled: true, strict: true },
  { id: 'feed-down', name: 'Down', institution: 'X', adapter: 'rss', level: 1, url: 'https://down.test/rss', every_hours: 20, enabled: true },
  { id: 'ft-calls', name: 'F&T', institution: 'European Commission', adapter: 'sedia', level: 2, url: 'https://api.tech.ec.europa.eu/search-api/prod/rest/search', every_hours: 20, enabled: true },
  { id: 'off', name: 'Off', adapter: 'none', enabled: false },
] };
await fs.writeFile(path.join(tmp, 'sources.json'), JSON.stringify(cfg));

async function round(n, files) {
  const map = {};
  for (const [url, name, body] of files) { if (body.startsWith('HTTP ')) { map[url] = body; continue; } await fs.writeFile(path.join(fx, name), body); map[url] = name; }
  await fs.writeFile(path.join(fx, 'map.json'), JSON.stringify(map));
  execFileSync('node', ['scripts/policy/ingest.mjs'], { env: { ...process.env, POLICY_OUT: out, POLICY_FIXTURES: fx, POLICY_CONFIG: path.join(tmp, 'sources.json'), POLICY_NOW: n === 1 ? '2026-11-10T06:00:00Z' : '2026-11-11T06:00:00Z' }, stdio: 'pipe' });
  return {
    devs: JSON.parse(await fs.readFile(path.join(out, 'developments.json'), 'utf8')).records,
    calls: JSON.parse(await fs.readFile(path.join(out, 'calls.json'), 'utf8')).records,
    changes: JSON.parse(await fs.readFile(path.join(out, 'changes.json'), 'utf8')).records,
    log: JSON.parse(await fs.readFile(path.join(out, 'ingest-log.json'), 'utf8')).runs,
  };
}

// Run 1
let r = await round(1, [
  ['https://a.test/rss', 'a.xml', rss([
    { t: 'EIC opens new STEP Scale Up cut-off for deep tech scaleups', l: 'https://eic.test/news/1?utm_source=rss', d: 'Mon, 09 Nov 2026 10:00:00 GMT', s: 'Equity investments of €10-30 million in semiconductors and AI companies in Finland.' },
    { t: 'Staff canteen menu', l: 'https://eic.test/news/2', d: 'Mon, 09 Nov 2026 10:00:00 GMT' },
    { t: 'Old EIC investment programme note for startups', l: 'https://eic.test/news/old', d: 'Mon, 01 Jun 2026 10:00:00 GMT' },
  ])],
  ['https://b.test/rss', 'b.xml', rss([
    { t: 'EIC opens new STEP Scale Up cut-off for deep tech scaleups', l: 'https://ec.test/press/99', d: 'Mon, 09 Nov 2026 12:00:00 GMT' },
    { t: 'Commission approves Spanish fisheries aid', l: 'https://ec.test/press/100', d: 'Mon, 09 Nov 2026 12:00:00 GMT' },
  ])],
  ['https://down.test/rss', 'x', 'HTTP 500'],
  [SED, 's1.json', sedia('2027-01-20T17:00:00.000+0100')],
]);
const added = r.devs.filter((d) => d.origin === 'feed' && !seedIds.has(d.id));
assert.equal(added.length, 2, 'one new + one historical item from feed A');
const nw = added.find((d) => d.status === 'unverified');
assert.ok(nw, 'new item is unverified until reviewed');
assert.ok(nw.frameworks.includes('eic') && nw.frameworks.includes('step'), 'framework classification');
assert.ok(nw.sectors.includes('Semiconductors') && nw.sectors.includes('AI'), 'sector classification');
assert.deepEqual(nw.countries, ['Finland']);
assert.ok(nw.also_reported && nw.also_reported[0].includes('ec.test/press/99'), 'same story in feed B recorded as duplicate');
assert.ok(added.some((d) => d.status === 'historical'), 'old item flagged historical');
assert.ok(!r.devs.some((d) => /canteen|fisheries/i.test(d.headline)), 'irrelevant items filtered');
assert.equal(r.calls.length, 2, 'only startup-relevant calls kept');
assert.equal(r.calls.find((c) => c.id.includes('ACCELERATOR')).programme, 'eic-accelerator');
assert.equal(r.log[0].sources.find((s) => s.id === 'feed-down').status, 'error', 'failed source logged');
assert.deepEqual(r.log[0].incomplete, ['feed-down']);
assert.equal(r.devs.length, devCount0 + 2, 'analyst records kept');

// Run 2: title edited at the source, deadline moved, nothing else new; feed-down still down
r = await round(2, [
  ['https://a.test/rss', 'a.xml', rss([{ t: 'EIC opens STEP Scale Up cut-off for deep-tech scale-ups (updated)', l: 'https://eic.test/news/1', d: 'Mon, 09 Nov 2026 10:00:00 GMT' }])],
  ['https://b.test/rss', 'b.xml', rss([])],
  ['https://down.test/rss', 'x', 'HTTP 500'],
  [SED, 's1.json', sedia('2027-01-27T17:00:00.000+0100')],
]);
const upd = r.devs.find((d) => d.origin === 'feed' && !seedIds.has(d.id) && d.status === 'update');
assert.ok(upd && upd.version === 2, 'edited item marked as update with a new version');
assert.ok(r.changes.some((c) => c.record_type === 'development' && c.field === 'headline' && c.old.startsWith('EIC opens new')), 'old headline kept in change log');
assert.ok(r.changes.some((c) => c.record_type === 'call' && c.field === 'deadlines' && c.old[0] === '2027-01-20' && c.new[0] === '2027-01-27'), 'deadline change logged');
assert.equal(r.devs.filter((d) => d.origin === 'feed' && !seedIds.has(d.id)).length, 2, 'no duplicates on rerun');
assert.equal(r.log[0].sources.find((s) => s.id === 'feed-down').consecutive_errors, 2);
assert.equal(await fs.readFile(path.join(out, 'frameworks.json'), 'utf8'), before.fw, 'frameworks untouched');
assert.equal(await fs.readFile(path.join(out, 'programmes.json'), 'utf8'), before.pr, 'programmes untouched');

// Analytics module
const src = await fs.readFile('site/assets/policy-analytics.js', 'utf8');
const m = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const pub = m.publicInvestors(['EIC Fund', 'Eiffel Investment Group', 'Horizon Capital', 'Bpifrance', 'Accel', 'European Investment Bank (EIB)']);
assert.deepEqual(pub.eu, ['EIC Fund', 'European Investment Bank (EIB)']);
assert.deepEqual(pub.nat, ['Bpifrance']);
const R = (date, sectors, stage, amount, investors, country = 'France') => ({ date, sectors, stage, amount, investors, country, company: 'X', company_id: 'x' });
const a = m.analyse([
  R('2025-03-01', ['AI'], 'Seed', 10, []), R('2026-03-01', ['AI'], 'Seed', 30, ['EIC Fund', 'Accel']), R('2026-04-01', ['Fintech'], 'Series A', 20, []),
  R('2025-04-01', ['Fintech'], 'Series A', 40, []), R('2026-05-01', ['AI'], 'Grant', 5, ['European Innovation Council']), R('2026-05-02', ['AI'], 'Seed', 1, [], 'Türkiye'),
], { frameworks: [{ id: 'ai-act', status: 'in-force', sectors: ['AI'] }], programmes: [], strategic: ['AI'] });
const ai = a.sectors.find((s) => s.sector === 'AI');
assert.equal(ai.last_eur, 30); assert.equal(ai.prev_eur, 10); assert.equal(ai.growth, 2); assert.equal(ai.exposure, 1);
assert.equal(a.market_growth, 0, '50 vs 50'); assert.equal(ai.rel_growth, 2);
assert.equal(a.eu_rounds.length, 2, 'EU-backed VC round and EIC grant'); assert.deepEqual(a.co_investors, [['Accel', 1]]);
assert.ok(!a.countries.some((c) => c.country === 'Türkiye'), 'out-of-scope country excluded');

// Scorecard: EU share of AI rounds doubles (10% -> 20%) while the comparison stays at 10% -> relative +100%, "ahead".
{
  const rows = [];
  const add = (country, date, n, ai, amt = 1e6) => { for (let k = 0; k < n; k++) rows.push({ date, country, sectors: [k < ai ? 'AI' : 'Fintech'], stage: 'Seed', amount: amt, investors: [], company: 'c', company_id: `${country}${date}${k}` }); };
  add('France', '2023-06-01', 2000, 200); add('France', '2025-06-01', 2000, 400);
  add('UK', '2023-06-01', 2000, 200); add('UK', '2025-06-01', 2000, 200);
  add('France', '2026-09-01', 1, 0); // sets the data date after the window closes
  const cfg = { data_start: '2021-01-01', window_months: 24, min_months_after: 12, comparison: { countries: ['UK', 'Switzerland'] }, thresholds: { band: 0.15, min_rounds: 20, medium_rounds: 40, high_rounds: 150, eur_inline_tolerance: 0.5 },
    indicators: [{ framework: 'ai-act', match: { sectors: ['AI'] }, fit: 'good' }, { framework: 'late', match: { sectors: ['AI'] }, fit: 'good' }, { framework: 'old', match: { sectors: ['AI'] }, fit: 'good' }, { framework: 'chips', match: { sectors: ['AI'] }, fit: 'partial' }] };
  const fws = [{ id: 'ai-act', in_force: '2024-08-01' }, { id: 'late', in_force: '2026-01-01' }, { id: 'old', published: '2019-12-11' }, { id: 'chips', in_force: '2024-08-01' }];
  const sc = m.scorecard(rows, cfg, fws);
  const [c, late, old, chips] = sc.cards;
  assert.equal(c.target[0].share, 0.1); assert.equal(c.target[1].share, 0.2); assert.equal(c.comparison[1].share, 0.1);
  assert.ok(Math.abs(c.rel - 1) < 1e-9, 'relative change +100%');
  assert.equal(c.verdict, 'ahead'); assert.equal(c.confidence, 'High', '150+ rounds in every cell and € agrees');
  assert.equal(late.verdict, 'early', 'under 12 months of data after the date');
  assert.equal(old.verdict, 'no-baseline', 'policy predates the data');
  assert.equal(chips.confidence, 'Medium', 'partial fit lowers confidence one level');
  assert.equal(m.scorecard(rows, cfg, fws, { noise: 2 }).cards[0].confidence, 'Medium', 'gap inside placebo noise lowers confidence');
  assert.equal(m.scorecard(rows, cfg, fws, { country: 'Germany' }).cards[0].verdict, 'insufficient', 'no rounds in the target group');
  assert.equal(m.shiftMonths('2024-08-31', -24), '2022-08-31'); assert.equal(m.shiftMonths('2024-03-31', -1), '2024-02-29');
}

await fs.rm(tmp, { recursive: true, force: true });
console.log('policy tests: all passed');
