// Daily data refresh. Pulls full price history (dividends reinvested) for every fund,
// the official TSP share prices, and fund facts; writes docs/data/*.json for the site.
// Run: node scripts/update-data.mjs        (GitHub Actions runs it every market day)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUNDS, CATEGORIES, TSP } from './funds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'data');
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HORIZONS = [1, 3, 5, 10, 15, 20];
const DAY = 86400e3;

const prev = readJson(path.join(OUT, 'summary.json'));
const prevSeries = readJson(path.join(OUT, 'series.json'));
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return r;
      if (r.status === 404) throw new Error('404');
    } catch (e) { if (String(e.message) === '404') throw e; }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`failed ${url.split('?')[0]}`);
}

// ---------- Yahoo ----------
async function history(sym) {
  const r = await get(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=max&interval=1d&events=div,split`);
  const c = (await r.json()).chart?.result?.[0];
  const ts = c?.timestamp || [];
  const adj = c?.indicators?.adjclose?.[0]?.adjclose || [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) if (adj[i] != null && adj[i] > 0) pts.push([ts[i] * 1000, adj[i]]);
  return { pts, meta: c?.meta || {} };
}

let cookie = '', crumb = '';
async function auth() {
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const r2 = await get('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { cookie } });
  crumb = (await r2.text()).trim();
}
async function facts(sym) {
  if (!crumb) await auth();
  const r = await get(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=fundProfile,defaultKeyStatistics,summaryDetail,price&crumb=${encodeURIComponent(crumb)}`, { headers: { cookie } });
  const q = (await r.json()).quoteSummary?.result?.[0] || {};
  const fee = q.fundProfile?.feesExpensesInvestment;
  return {
    name: q.price?.longName || q.price?.shortName,
    type: q.price?.quoteType === 'MUTUALFUND' ? 'Mutual fund' : 'ETF',
    er: fee?.annualReportExpenseRatio?.raw ?? q.defaultKeyStatistics?.annualReportExpenseRatio?.raw ?? fee?.netExpRatio?.raw ?? null,
    yield: q.summaryDetail?.yield?.raw ?? null,
    assets: q.summaryDetail?.totalAssets?.raw ?? q.defaultKeyStatistics?.totalAssets?.raw ?? null,
  };
}

// ---------- TSP ----------
async function tspHistory() {
  const end = new Date().toISOString().slice(0, 10);
  const r = await get(`https://www.tsp.gov/data/fund-price-history.csv?startdate=2003-01-01&enddate=${end}&Lfunds=1&InvFunds=1&download=1`, {
    headers: { accept: 'text/csv,*/*', 'accept-language': 'en-US,en;q=0.9', referer: 'https://www.tsp.gov/share-price-history/' },
  });
  const text = await r.text();
  if (text.trimStart().startsWith('<')) throw new Error('TSP returned a web page instead of data');
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((s) => s.trim());
  const cols = Object.fromEntries(head.map((h, i) => [h, []]));
  for (const line of lines.slice(1)) {
    const v = line.split(',');
    const t = Date.parse(v[0] + 'T16:00:00-05:00');
    if (!Number.isFinite(t)) continue;
    head.forEach((h, i) => { if (i && v[i] && Number(v[i]) > 0) cols[h].push([t, Number(v[i])]); });
  }
  for (const h of head) cols[h].sort((a, b) => a[0] - b[0]);
  return cols;
}

// ---------- statistics ----------
function priceAt(pts, t) {
  // last point on or before t
  let lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function monthEnds(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const d = new Date(pts[i][0]); const nx = pts[i + 1] ? new Date(pts[i + 1][0]) : null;
    if (!nx || nx.getUTCMonth() !== d.getUTCMonth()) out.push([`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, pts[i][1]]);
  }
  return out;
}
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

function stats(pts) {
  if (pts.length < 30) return null;
  const end = pts.at(-1);
  const first = pts[0];
  const ret = {};
  for (const y of HORIZONS) {
    const target = end[0] - y * 365.25 * DAY;
    if (first[0] > target + 10 * DAY) { ret[y] = null; continue; }
    const i = priceAt(pts, target);
    const start = pts[Math.max(0, i)][1];
    ret[y] = r4(Math.pow(end[1] / start, 1 / y) - 1);
  }
  const ey = new Date(end[0]).getUTCFullYear();
  const ytdI = priceAt(pts, Date.UTC(ey, 0, 1) - 1);
  ret.ytd = ytdI >= 0 ? r4(end[1] / pts[ytdI][1] - 1) : null;

  // calendar years (full years only)
  const cal = {};
  const fy = new Date(first[0]).getUTCFullYear();
  for (let y = fy + 1; y <= ey; y++) {
    const a = priceAt(pts, Date.UTC(y, 0, 1) - 1);
    if (a < 0 || new Date(pts[a][0]).getUTCFullYear() !== y - 1) continue;
    const b = y === ey ? pts.length - 1 : priceAt(pts, Date.UTC(y + 1, 0, 1) - 1);
    if (y === ey) continue; // current year lives in ytd
    cal[y] = r4(pts[b][1] / pts[a][1] - 1);
  }
  const years = Object.entries(cal);
  const worst = years.length ? years.reduce((m, x) => (x[1] < m[1] ? x : m)) : null;
  const best = years.length ? years.reduce((m, x) => (x[1] > m[1] ? x : m)) : null;

  // max drawdown on daily data, last 20 years
  const from = priceAt(pts, end[0] - 20 * 365.25 * DAY);
  let peak = 0, peakT = 0, dd = 0, ddPeak = 0, ddT = 0;
  for (let i = Math.max(0, from); i < pts.length; i++) {
    const [t, p] = pts[i];
    if (p > peak) { peak = p; peakT = t; }
    const d = p / peak - 1;
    if (d < dd) { dd = d; ddT = t; ddPeak = peakT; }
  }
  // volatility: annualized std dev of monthly returns, last 10 years (needs 3+)
  const me = monthEnds(pts.slice(Math.max(0, priceAt(pts, end[0] - 10 * 365.25 * DAY))));
  const mr = me.slice(1).map((x, i) => x[1] / me[i][1] - 1);
  let vol = null;
  if (mr.length >= 36) {
    const mean = mr.reduce((a, b) => a + b, 0) / mr.length;
    vol = Math.sqrt(mr.reduce((a, b) => a + (b - mean) ** 2, 0) / (mr.length - 1)) * Math.sqrt(12);
  }
  return {
    asOf: new Date(end[0]).toISOString().slice(0, 10),
    since: new Date(first[0]).toISOString().slice(0, 10),
    ret, cal,
    worst: worst ? { year: Number(worst[0]), r: worst[1] } : null,
    best: best ? { year: Number(best[0]), r: best[1] } : null,
    maxDD: dd < 0 ? { r: r4(dd), peak: new Date(ddPeak).toISOString().slice(0, 7), trough: new Date(ddT).toISOString().slice(0, 7) } : null,
    vol: r4(vol),
  };
}

// Monthly series for charts and the calculator: last 25 years, as a growth index.
function series(pts) {
  const me = monthEnds(pts);
  const cut = me.findIndex((x) => x[0] >= `${new Date().getUTCFullYear() - 25}`);
  const s = me.slice(Math.max(0, cut));
  if (!s.length) return null;
  const base = s[0][1];
  return { start: s[0][0], v: s.map((x) => Math.round((x[1] / base) * 1e5) / 1e5) };
}

// ---------- sample mixes (textbook stock/bond splits, rebalanced monthly) ----------
const MIX_PARTS = { us: 'VTSAX', intl: 'VGTSX', bond: 'VBTLX', short: 'SHY' };
const MIXES = [
  { id: 'cash', name: 'Cash-like', stocks: 0, desc: '100% short-term (1–3 yr) Treasuries', w: { short: 1 } },
  { id: 'c20', name: 'Conservative', stocks: 20, desc: '20% stocks / 80% bonds', w: { us: 0.14, intl: 0.06, bond: 0.8 } },
  { id: 'c40', name: 'Moderately conservative', stocks: 40, desc: '40% stocks / 60% bonds', w: { us: 0.28, intl: 0.12, bond: 0.6 } },
  { id: 'c60', name: 'Balanced', stocks: 60, desc: '60% stocks / 40% bonds', w: { us: 0.42, intl: 0.18, bond: 0.4 } },
  { id: 'c80', name: 'Growth', stocks: 80, desc: '80% stocks / 20% bonds', w: { us: 0.56, intl: 0.24, bond: 0.2 } },
  { id: 'c100', name: 'All stocks', stocks: 100, desc: '100% stocks (70% US / 30% international)', w: { us: 0.7, intl: 0.3 } },
];
function mixDaily(hist, w) {
  // Build a daily-ish index from month-end points so stats() can run on it.
  const parts = Object.entries(w).map(([k, wt]) => [monthEnds(hist[MIX_PARTS[k]]), wt]);
  const startKey = parts.map(([m]) => m[0][0]).sort().at(-1);
  const maps = parts.map(([m, wt]) => [new Map(m), wt]);
  const keys = parts[0][0].map((x) => x[0]).filter((k) => k >= startKey && maps.every(([mm]) => mm.has(k)));
  let v = 1;
  const pts = [];
  keys.forEach((k, i) => {
    if (i) {
      const pk = keys[i - 1];
      v *= maps.reduce((a, [mm, wt]) => a + wt * (mm.get(k) / mm.get(pk)), 0);
    }
    const [y, m] = k.split('-').map(Number);
    pts.push([Date.UTC(y, m, 0, 21), v]);
  });
  return pts;
}

// ---------- run ----------
const t0 = Date.now();
const prevBySym = new Map((prev?.funds || []).map((f) => [f.s, f]));
const symbols = [...new Set([...FUNDS.map((f) => f[0]), ...Object.values(MIX_PARTS)])];
const hist = {};
const meta = {};
const failures = [];

for (let i = 0; i < symbols.length; i += 6) {
  await Promise.all(symbols.slice(i, i + 6).map(async (s) => {
    try { const h = await history(s); hist[s] = h.pts; meta[s] = h.meta; } catch (e) { failures.push(`${s}: ${e.message}`); }
  }));
}

let factsOk = 0;
const factBySym = {};
try { await auth(); } catch (e) { failures.push(`Yahoo facts sign-in: ${e.message}`); }
if (crumb) {
  for (let i = 0; i < FUNDS.length; i += 5) {
    await Promise.all(FUNDS.slice(i, i + 5).map(async ([s]) => {
      try { factBySym[s] = await facts(s); factsOk++; } catch { /* keep last known */ }
    }));
  }
}

const funds = [];
const seriesOut = {};
for (const [s, provider, cat, index, year] of FUNDS) {
  const old = prevBySym.get(s);
  const st = hist[s] ? stats(hist[s]) : null;
  if (!st) {
    if (old) { funds.push({ ...old, stale: true }); if (prevSeries?.[s]) seriesOut[s] = prevSeries[s]; }
    continue;
  }
  const f = factBySym[s] || {};
  funds.push({
    s, provider, cat, index, ...(year ? { year } : {}),
    name: f.name || meta[s]?.longName || old?.name || s,
    type: f.type || (meta[s]?.instrumentType === 'MUTUALFUND' ? 'Mutual fund' : 'ETF'),
    er: f.er ?? old?.er ?? null,
    yield: f.yield ?? old?.yield ?? null,
    assets: f.assets ?? old?.assets ?? null,
    ...st,
  });
  seriesOut[s] = series(hist[s]);
}

let tsp = prev?.tsp || [];
try {
  const cols = await tspHistory();
  tsp = TSP.map((t) => {
    const pts = cols[t.key] || [];
    const st = stats(pts);
    if (st) seriesOut[`TSP:${t.key}`] = series(pts);
    return { ...t, ...(st || {}), price: pts.at(-1)?.[1] ?? null };
  }).filter((t) => t.ret);
} catch (e) {
  failures.push(`TSP: ${e.message}`);
  for (const t of tsp) if (prevSeries?.[`TSP:${t.key}`]) seriesOut[`TSP:${t.key}`] = prevSeries[`TSP:${t.key}`];
}

const mixes = [];
if (Object.values(MIX_PARTS).every((s) => hist[s]?.length)) {
  for (const m of MIXES) {
    const pts = mixDaily(hist, m.w);
    const st = stats(pts);
    if (!st) continue;
    seriesOut[`MIX:${m.id}`] = series(pts);
    mixes.push({ ...m, ...st, maxDD: st.maxDD, note: 'Built from month-end prices, so the biggest drop is measured month to month.' });
  }
} else if (prev?.mixes) {
  mixes.push(...prev.mixes);
  for (const m of prev.mixes) if (prevSeries?.[`MIX:${m.id}`]) seriesOut[`MIX:${m.id}`] = prevSeries[`MIX:${m.id}`];
}

const asOf = funds.map((f) => f.asOf).sort().at(-1);
const summary = {
  generated: new Date().toISOString(),
  asOf,
  horizons: HORIZONS,
  categories: CATEGORIES,
  funds, tsp, mixes,
  mixParts: MIX_PARTS,
  failures,
};

if (funds.length < FUNDS.length * 0.6) {
  console.error(`Only ${funds.length} funds loaded — keeping yesterday's data.`, failures.slice(0, 10));
  process.exit(1);
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary));
fs.writeFileSync(path.join(OUT, 'series.json'), JSON.stringify(seriesOut));
console.log(`Funds ${funds.length}/${FUNDS.length}, facts ${factsOk}, TSP ${tsp.length}, mixes ${mixes.length}, as of ${asOf}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) console.log('Problems:', failures.join(' | '));
