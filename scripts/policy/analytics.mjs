// Computes the Europe-wide Policy-to-Capital snapshot (site/data/policy/analytics.json) from the existing
// rounds files, with the same module the page uses (site/assets/policy-analytics.js). The page recomputes
// filtered views in the browser; this snapshot feeds the overview, the analyst task and the tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJSON, writeJSON, p, ROUNDS } from './lib.mjs';

export async function loadModule() {
  const src = await fs.readFile(path.resolve('site/assets/policy-analytics.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

export async function loadRounds() {
  const rows = [];
  const files = (await fs.readdir(ROUNDS)).filter((f) => /^rounds-\d{4}\.json$/.test(f)).sort();
  for (const f of files) {
    const j = await readJSON(path.join(ROUNDS, f), { rows: [] });
    for (const r of j.rows) rows.push({ id: r[0], date: r[1], company: r[2], company_id: r[3] || r[0], country: r[4], sectors: r[6] ? r[6].split('|') : [], stage: r[7] || 'Other', amount: r[8], investors: r[9] ? r[9].split('|') : [], url: r[10], origin: r[12] || 'techeu' });
  }
  return rows;
}

export async function analytics() {
  const m = await loadModule();
  const frameworks = (await readJSON(p('frameworks.json'), { records: [] })).records;
  const programmes = (await readJSON(p('programmes.json'), { records: [] })).records;
  const strategic = (frameworks.find((f) => f.id === 'step') || {}).sectors || [];
  const rounds = (await loadRounds()).filter((r) => r.date >= '2021-01-01');
  const a = m.analyse(rounds, { frameworks, programmes, strategic });
  const out = { built: new Date().toISOString(), scope: 'Europe (all in-scope countries), all sectors', strategic_sectors: strategic, strategic_source: 'STEP regulation record (frameworks.json, id "step")', ...a, eu_rounds: a.eu_rounds.slice(0, 300), eu_rounds_total: a.eu_rounds.length };
  await writeJSON(p('analytics.json'), out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  analytics().then((a) => console.log(`analytics: ${a.n_rounds} rounds, as of ${a.asOf}, ${a.eu_rounds_total} with EU-level investors`)).catch((e) => { console.error(e); process.exit(1); });
}
