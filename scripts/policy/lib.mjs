// Shared helpers for the Policy & Capital Intelligence pipeline. No dependencies (Node 20+).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA = path.resolve(process.env.POLICY_OUT || 'site/data/policy');
export const ROUNDS = path.resolve(process.env.ROUNDS_DIR || 'site/data');

export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
export async function writeJSON(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj));
  await fs.rename(tmp, file); // atomic: a crash never leaves half a file
}
export const p = (name) => path.join(DATA, name);

export const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
export const normUrl = (u) => String(u || '').trim().replace(/#.*$/, '').replace(/[?&](utm_[^=&]+|xtor)=[^&]*/g, '').replace(/\/+$/, '').toLowerCase();
export const normTitle = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const isoDay = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
export const nowIso = () => new Date().toISOString();

// Fetch with retries and exponential backoff. POLICY_FIXTURES=<dir> serves files instead (tests).
export async function fetchText(url, opts = {}, tries = 3) {
  if (process.env.POLICY_FIXTURES) {
    const key = hash(url + (opts.fixtureKey || ''));
    const map = await readJSON(path.join(process.env.POLICY_FIXTURES, 'map.json'), {});
    const f = map[url] || map[key];
    if (!f) throw new Error(`fixture missing for ${url}`);
    if (f.startsWith('HTTP ')) throw new Error(f);
    return fs.readFile(path.join(process.env.POLICY_FIXTURES, f), 'utf8');
  }
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
      const res = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'user-agent': 'TechCap-Intelligence-policy/1.0 (+https://github.com/azizainoubli-cloud/eurotech-signal)', ...(opts.headers || {}) } });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.fatal = true; throw e; }
      return await res.text();
    } catch (e) {
      err = e; if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw err;
}

// ---------- minimal RSS 2.0 / Atom parser ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
export const stripTags = (s) => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let link = stripTags(tag(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? decode(m[1]) : ''; }
    const date = isoDay(stripTags(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated')));
    items.push({ title: stripTags(tag(b, 'title')), link: link.trim(), date, summary: stripTags(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 600) });
  }
  return items.filter((i) => i.title && i.link);
}

// ---------- classification (keyword rules; transparent and editable) ----------
export const FRAMEWORK_RULES = [
  ['ai-act', /\b([Aa][Ii] [Aa]ct|[Aa]rtificial [Ii]ntelligence [Aa]ct|AI Office|[Gg]eneral-purpose AI|GPAI)\b/],
  ['data-act', /\bdata act\b/i],
  ['dma', /\b([Dd]igital [Mm]arkets [Aa]ct|DMA|[Gg]atekeepers?)\b/],
  ['dsa', /\b([Dd]igital [Ss]ervices [Aa]ct|DSA|[Vv]ery [Ll]arge [Oo]nline [Pp]latforms?)\b/],
  ['cra', /\b([Cc]yber [Rr]esilience [Aa]ct|CRA)\b/],
  ['chips-act', /\b(chips act|chips joint undertaking|chips ju|semiconductor)/i],
  ['step', /\b(STEP|[Ss]trategic [Tt]echnologies for Europe)\b/],
  ['investeu', /\binvesteu\b/i],
  ['horizon-europe', /\bhorizon europe\b/i],
  ['eic', /\b(EIC|[Ee]uropean [Ii]nnovation [Cc]ouncil)\b/],
  ['28th-regime', /\b(28th regime|eu inc)\b/i],
  ['innovation-act', /\binnovation act\b/i],
  ['startup-scaleup-strategy', /\b(start-?up and scale-?up strategy|scale-?up strategy|choose europe)\b/i],
  ['scaleup-europe', /\b([Ss]cale-?[Uu]p Europe [Ff]und|[Tt]ech [Cc]hampions|ETCI|[Ii]nstitutional [Ii]nvestors [Pp]act)\b/],
  ['clean-industrial-deal', /\b(clean industrial deal|industrial decarboni[sz]ation bank|industrial accelerator act)\b/i],
  ['green-deal', /\b(green deal|innovation fund|climate law|emissions trading)\b/i],
  ['digital-europe-programme', /\bdigital europe\b/i],
];
export const SECTOR_RULES = [
  ['AI', /(\b[Aa]rtificial [Ii]ntelligence|\bAI\b|[Mm]achine [Ll]earning|\bGenAI|[Gg]enerative|[Gg]igafactor)/],
  ['Semiconductors', /\b(semiconductor|chip|microelectronic|photonic)/i],
  ['Deeptech', /\b(quantum|deep tech|deeptech|advanced material|breakthrough)/i],
  ['Cybersecurity', /\b(cyber|cybersecurity|ransomware|enisa)/i],
  ['Space', /\b(space|satellite|copernicus|galileo|iris²|iris2)/i],
  ['Defence', /\b(defen[cs]e|dual-use|military)/i],
  ['Cleantech', /\b(clean tech|cleantech|net-zero|net zero|hydrogen|battery|batteries|decarboni[sz]|renewable|circular|carbon)/i],
  ['Energy', /\b(energy|grid|electricity|nuclear|wind|solar)/i],
  ['Healthtech', /\b(health|biotech|medic|pharma|life science|clinical)/i],
  ['Fintech', /\b(fintech|payment|crypto|digital euro|capital markets|savings and investments union|securiti[sz]ation)/i],
  ['Cloud', /\b(cloud|data cent|edge computing)/i],
  ['Robotics', /\b(robot)/i],
  ['Telecom', /\b(5g|6g|telecom|connectivity|gigabit)/i],
  ['Transportation', /\b(mobility|automotive|vehicle|aviation|maritime|rail)/i],
  ['Agritech', /\b(agri|farm|food system)/i],
];
export const RELEVANT = /\b(start-?up|scale-?up|sme|innovation|innovative|venture|equity|investment|invest|fund|funding|grant|call for|calls for|eic|horizon|chips|artificial intelligence|\bai\b|cyber|quantum|digital|tech|semiconductor|deep tech|capital markets|competitiveness)\b/i;
export const STRICT = /\b(start-?up|scale-?up|venture capital|innovation council|\beic\b|horizon europe|investeu|chips act|ai act|artificial intelligence|cyber resilience|data act|digital markets|digital services|strategic technologies|28th regime|eu inc|innovation act|scale-?up europe|tech champions|savings and investments union|innovation fund|quantum)\b/i;
export const TYPE_RULES = [
  ['call', /\b(call for|calls for|call opens|apply|applications|cut-?off|deadline)\b/i],
  ['investment', /\b(invests?|investment in|backs|co-invest|equity|fund-of-funds|signs? .*(agreement|guarantee)|commitment)\b/i],
  ['legislative', /\b(regulation|directive|proposal|proposes|council position|general approach|trilogue|provisional agreement|official journal|adopt)/i],
  ['regulatory', /\b(enforcement|fine[sd]?|guidelines|compliance|obligations|designat|preliminary findings|code of practice)\b/i],
  ['statistics', /\b(scoreboard|statistics|report|survey|index|figures|data show)\b/i],
  ['funding', /\b(funding|budget|million|billion|€\s?\d)/i],
  ['strategy', /\b(strategy|plan|roadmap|communication|package|pact|initiative)\b/i],
];
export const COUNTRIES = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czechia','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Norway','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','Switzerland','United Kingdom'];
export function classify(text) {
  const frameworks = FRAMEWORK_RULES.filter(([, re]) => re.test(text)).map(([id]) => id);
  const sectors = SECTOR_RULES.filter(([, re]) => re.test(text)).map(([s]) => s);
  const type = (TYPE_RULES.find(([, re]) => re.test(text)) || ['strategy'])[0];
  let countries = COUNTRIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)).map((c) => (c === 'Czechia' ? 'Czech Republic' : c === 'United Kingdom' ? 'UK' : c));
  if (!countries.length) countries = ['EU27'];
  return { frameworks, sectors, type, countries: [...new Set(countries)] };
}
