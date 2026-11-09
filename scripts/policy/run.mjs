// Policy & Capital Intelligence pipeline entry point (run by the workflow after the funding build).
// Each stage is isolated: a failing source or stage is logged and never stops the others or the funding site.
//   OFFLINE=1        skip network ingestion (analytics and meta only)
//   POLICY_FORCE=1   check every source now, ignoring its schedule
import { readJSON, writeJSON, p, nowIso } from './lib.mjs';
import { ingest } from './ingest.mjs';
import { analytics } from './analytics.mjs';

const stages = [];
async function stage(name, fn) {
  const t0 = Date.now();
  try { const r = await fn(); stages.push({ name, ok: true, ms: Date.now() - t0 }); return r; }
  catch (e) { console.error(`policy ${name} failed:`, e); stages.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 200) }); return null; }
}

const run = process.env.OFFLINE === '1' ? null : await stage('ingest', ingest);
if (run) for (const s of run.sources) console.log(`  ${s.id}: ${s.status}${s.error ? ' — ' + s.error : ''}${s.new != null ? ` (new ${s.new}, updated ${s.update})` : ''}`);
const a = await stage('analytics', analytics);

await stage('meta', async () => {
  const count = async (f) => ((await readJSON(p(f), { records: [] })).records || []).length;
  const devs = (await readJSON(p('developments.json'), { records: [] })).records;
  const log = await readJSON(p('ingest-log.json'), { runs: [] });
  const state = await readJSON(p('ingest-state.json'), { sources: {} });
  const cfg = await readJSON('scripts/policy/sources.json', { sources: [] });
  await writeJSON(p('meta.json'), {
    updated: nowIso(), stages,
    counts: { frameworks: await count('frameworks.json'), programmes: await count('programmes.json'), developments: devs.length, calls: await count('calls.json'),
      changes: await count('changes.json'), insights: await count('insights.json'), unverified_developments: devs.filter((d) => d.status === 'unverified').length },
    analytics_as_of: a ? a.asOf : null,
    last_ingest: log.runs[0] || null,
    sources: cfg.sources.map((s) => ({ id: s.id, name: s.name, institution: s.institution, adapter: s.adapter, level: s.level, url: s.url, enabled: s.enabled, every_hours: s.every_hours, note: s.note || null,
      last_checked: (state.sources[s.id] || {}).last_checked || null, last_ok: (state.sources[s.id] || {}).last_ok || null, last_error: (state.sources[s.id] || {}).last_error || null })),
    hierarchy: ['1 — EU legislation and institutional documents', '2 — Official EU funding and programme databases', '3 — Public financial institutions and national agencies', '4 — Industry research and datasets', '5 — News and secondary publications'],
  });
});
console.log('policy pipeline:', stages.map((s) => `${s.name} ${s.ok ? 'ok' : 'FAILED'}`).join(', '));
