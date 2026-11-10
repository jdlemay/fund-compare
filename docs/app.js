// Long-Term Fund Compare — all client-side. Data: data/summary.json + data/series.json
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HZ = [1, 5, 10, 15, 20];
  const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
  const RAMP = ['var(--r1)', 'var(--r2)', 'var(--r3)', 'var(--r4)', 'var(--r5)', 'var(--r6)'];

  let D = null;          // summary
  let SER = null;        // series
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ltfc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ltfc:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const ui = {
    tab: 'funds', fundH: store.get('fundH', 10), tspH: store.get('tspH', 10), calcH: store.get('calcH', 10), mixH: store.get('mixH', 20),
    picks: store.get('picks', ['TSP:C Fund', 'VTI', 'MIX:c60']),
  };

  // ---------- formatting ----------
  const pct = (x, d = 1) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`);
  const pctPlain = (x, d = 2) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
  const money = (x) => (x == null ? '—' : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x).toLocaleString()}`);
  const bigMoney = (x) => (x == null ? '—' : x >= 1e12 ? `$${(x / 1e12).toFixed(1)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(0)}M` : money(x));
  const monthName = (k) => { const [y, m] = k.split('-'); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`; };
  const addMonths = (k, n) => { const [y, m] = k.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

  // ---------- series helpers ----------
  function seriesOf(key) { return SER?.[key] || null; }
  function lastN(key, months) {
    const s = seriesOf(key);
    if (!s || s.v.length < months + 1) return null;
    const v = s.v.slice(-(months + 1));
    const start = addMonths(s.start, s.v.length - months - 1);
    return { start, v };
  }
  // Rebalanced monthly blend of several series. weights: {key: w}
  function blend(weights) {
    const parts = Object.entries(weights).filter(([, w]) => w > 0).map(([k, w]) => [seriesOf(k), w]);
    if (!parts.length || parts.some(([s]) => !s)) return null;
    const ends = parts.map(([s]) => addMonths(s.start, s.v.length - 1));
    const end = ends.sort()[0];
    const start = parts.map(([s]) => s.start).sort().at(-1);
    const out = [1];
    let k = start;
    const idx = (s, key) => monthsBetween(s.start, key);
    while (k < end) {
      const nk = addMonths(k, 1);
      let g = 0;
      for (const [s, w] of parts) g += w * (s.v[idx(s, nk)] / s.v[idx(s, k)]);
      out.push(out.at(-1) * g);
      k = nk;
    }
    return { start, v: out };
  }
  const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

  // Stats from a monthly series (used for blended mixes)
  function monthlyStats(s) {
    if (!s || s.v.length < 13) return null;
    const n = s.v.length - 1;
    const ret = {};
    for (const y of HZ) ret[y] = n >= y * 12 ? Math.pow(s.v[n] / s.v[n - y * 12], 1 / y) - 1 : null;
    let worst = null;
    s.v.forEach((v, i) => {
      const k = addMonths(s.start, i);
      if (!k.endsWith('-12') || i < 12) return;
      const r = v / s.v[i - 12] - 1;
      if (!worst || r < worst.r) worst = { year: Number(k.slice(0, 4)), r };
    });
    let peak = 0, dd = 0;
    for (const v of s.v) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
    return { ret, worst, maxDD: { r: dd } };
  }

  // Growth of start + monthly contributions over the last `years`.
  function growth(key, years, start, monthly) {
    const s = lastN(key, years * 12);
    if (!s) return null;
    let val = start, put = start;
    const pts = [{ d: s.start, v: val, put }];
    for (let i = 1; i < s.v.length; i++) {
      val = val * (s.v[i] / s.v[i - 1]) + monthly;
      put += monthly;
      pts.push({ d: addMonths(s.start, i), v: val, put });
    }
    return pts;
  }

  // ---------- tooltip ----------
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${top}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- charts ----------
  function niceTicks(min, max, count = 4) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
    return out;
  }

  // series: [{label, color, pts:[{d, v}]}]; fmt for y values
  function lineChart(el, series, { fmt = money, height = 260, baseline = null } = {}) {
    const W = Math.max(300, el.clientWidth || 600);
    const H = height;
    const labelRoom = series.length <= 4 ? Math.min(130, Math.max(70, W * 0.18)) : 12;
    const m = { l: 52, r: labelRoom, t: 10, b: 26 };
    const all = series.flatMap((s) => s.pts.map((p) => p.v));
    if (baseline) all.push(...baseline.pts.map((p) => p.v));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo > 0 && lo / hi > 0.3) lo = lo * 0.9; else lo = Math.min(0, lo);
    const ticks = niceTicks(lo, hi, 4);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));
    const n = Math.max(...series.map((s) => s.pts.length));
    const x = (i) => m.l + (i / Math.max(1, n - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
    const dates = series.find((s) => s.pts.length === n).pts.map((p) => p.d);

    let g = '';
    for (const t of ticks) g += `<line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`;
    const xt = Math.min(6, Math.floor((W - m.l - m.r) / 80));
    for (let k = 0; k <= xt; k++) {
      const i = Math.round((k / xt) * (n - 1));
      const lbl = n > 30 ? dates[i].slice(0, 4) : monthName(dates[i]);
      g += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === xt ? 'end' : 'middle'}">${esc(lbl)}</text>`;
    }
    const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i + (n - pts.length)).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    if (baseline) g += `<path d="${path(baseline.pts)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>`;
    for (const s of series) g += `<path d="${path(s.pts)}" stroke="${s.color}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    // direct labels at line ends, nudged apart
    if (series.length <= 4) {
      const ends = series.map((s) => ({ s, yy: y(s.pts.at(-1).v) })).sort((a, b) => a.yy - b.yy);
      for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;
      for (const e of ends) {
        g += `<circle cx="${x(n - 1)}" cy="${y(e.s.pts.at(-1).v)}" r="4" fill="${e.s.color}" stroke="var(--surface)" stroke-width="2"/>`;
        g += `<text class="lbl" x="${x(n - 1) + 8}" y="${e.yy + 4}">${esc(e.s.short || e.s.label)}</text>`;
      }
    }
    g += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><g class="dots"></g>`;
    g += `<rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" class="hit" style="touch-action:pan-y"/>`;
    el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))} over time">${g}</svg></div>`;
    if (series.length > 1 || baseline) {
      el.insertAdjacentHTML('afterbegin', `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}${baseline ? `<span><i style="background:var(--muted)"></i>${esc(baseline.label)}</span>` : ''}</div>`);
    }
    const svg = $('svg', el), xh = $('.xh', el), dots = $('.dots', el);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      let rows = '', dd = '';
      for (const s of series) {
        const p = s.pts[i - (n - s.pts.length)];
        if (!p) continue;
        dd += `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
        rows += `<div class="r"><span><i style="background:${s.color}"></i>${esc(s.short || s.label)}</span><b>${esc(fmt(p.v))}</b></div>`;
      }
      if (baseline) { const p = baseline.pts[i - (n - baseline.pts.length)]; if (p) rows += `<div class="r"><span><i style="background:var(--muted)"></i>${esc(baseline.label)}</span><b>${esc(fmt(p.v))}</b></div>`; }
      dots.innerHTML = dd;
      showTip(`<div class="t">${esc(monthName(dates[i]))}</div>${rows}`, ev.clientX, ev.clientY);
    };
    const hit = $('.hit', el);
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { xh.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; hideTip(); });
  }

  // Calendar-year returns: bars up (blue) / down (red) from a zero line.
  function yearBars(el, cal) {
    const yrs = Object.keys(cal).map(Number).sort((a, b) => a - b).slice(-20);
    if (!yrs.length) { el.innerHTML = '<p class="muted small">Not enough full years yet.</p>'; return; }
    const W = Math.max(300, el.clientWidth || 600), H = 200;
    const m = { l: 44, r: 8, t: 10, b: 24 };
    const vals = yrs.map((y) => cal[y]);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const ticks = niceTicks(lo, hi, 4); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));
    const bw = (W - m.l - m.r) / yrs.length;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
    let g = '';
    for (const t of ticks) g += `<line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`;
    yrs.forEach((yr, i) => {
      const v = cal[yr];
      const x0 = m.l + i * bw + Math.min(2, bw * 0.15);
      const w = Math.max(2, bw - Math.min(4, bw * 0.3));
      const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
      const r = Math.min(4, w / 2, h);
      const up = v >= 0;
      // rounded at the data end, square at the zero line
      const d = up
        ? `M${x0} ${top + h} V${top + r} Q${x0} ${top} ${x0 + r} ${top} H${x0 + w - r} Q${x0 + w} ${top} ${x0 + w} ${top + r} V${top + h} Z`
        : `M${x0} ${top} V${top + h - r} Q${x0} ${top + h} ${x0 + r} ${top + h} H${x0 + w - r} Q${x0 + w} ${top + h} ${x0 + w} ${top + h - r} V${top} Z`;
      g += `<path d="${d}" fill="${up ? 'var(--up)' : 'var(--down)'}"/>`;
      g += `<rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" fill="transparent" data-i="${i}"/>`;
      if (yrs.length <= 12 || i % Math.ceil(yrs.length / 10) === 0 || i === yrs.length - 1) g += `<text class="axis" x="${m.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${String(yr).slice(bw < 30 ? 2 : 0)}</text>`;
    });
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
    el.innerHTML = `<div class="legend"><span><i class="sq" style="background:var(--up)"></i>Up year</span><span><i class="sq" style="background:var(--down)"></i>Down year</span></div><div class="chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Returns by calendar year">${g}</svg></div>`;
    for (const r of $$('rect[data-i]', el)) {
      const yr = yrs[+r.dataset.i];
      const f = (ev) => showTip(`<div class="t">${yr}</div><div class="r"><span>Return</span><b>${pct(cal[yr])}</b></div>`, ev.clientX, ev.clientY);
      r.addEventListener('pointermove', f); r.addEventListener('pointerdown', f); r.addEventListener('pointerleave', hideTip);
    }
  }

  // ---------- segmented horizon control ----------
  function seg(el, value, onChange, opts = HZ) {
    el.innerHTML = opts.map((h) => `<button type="button" role="radio" aria-checked="${h === value}" data-h="${h}">${h}Y</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('button[data-h]'); if (!b) return;
      $$('button', el).forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
      onChange(Number(b.dataset.h));
    };
  }

  // ---------- FUNDS ----------
  const catName = (id) => (D.categories.find((c) => c[0] === id) || [id, id])[1];
  function renderFunds() {
    const h = ui.fundH;
    const cat = $('#fCat').value, prov = $('#fProv').value, type = $('#fType').value, q = $('#fSearch').value.trim().toLowerCase(), sort = $('#fSort').value;
    let list = D.funds.filter((f) => (!cat || f.cat === cat) && (!prov || f.provider === prov) && (!type || f.type === type) &&
      (!q || f.s.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || (f.index || '').toLowerCase().includes(q)));
    const key = {
      ret: (f) => -(f.ret[h] ?? -9), er: (f) => f.er ?? 9, worst: (f) => -(f.worst?.r ?? -9), dd: (f) => -(f.maxDD?.r ?? -9),
      vol: (f) => f.vol ?? 9, name: (f) => f.s,
    }[sort];
    list.sort((a, b) => {
      if (sort === 'ret') { const na = a.ret[h] == null, nb = b.ret[h] == null; if (na !== nb) return na ? 1 : -1; }
      const ka = key(a), kb = key(b);
      return typeof ka === 'string' ? ka.localeCompare(kb) : ka - kb;
    });
    const withH = list.filter((f) => f.ret[h] != null).length;
    $('#fCount').textContent = `${list.length} funds · ${withH} have ${h} years of history` + (sort === 'ret' ? ` · ranked by average yearly return over ${h} year${h > 1 ? 's' : ''}` : '');
    if (!list.length) { $('#fundList').innerHTML = '<div class="empty">No funds match. Clear a filter or the search.</div>'; return; }
    $('#fundList').innerHTML = list.map((f) => {
      const r = f.ret[h];
      return `<button class="fund ${r == null ? 'nohist' : ''}" type="button" data-s="${esc(f.s)}">
        <div class="id"><div class="sym">${esc(f.s)}</div><div class="nm" title="${esc(f.name)}">${esc(f.name)}</div>
          <div class="tags"><span class="tag">${esc(f.provider)}</span><span class="tag">${esc(f.type)}</span><span class="tag">${esc(catName(f.cat))}</span></div></div>
        <div class="big num"><b>${r == null ? '—' : pct(r)}</b><span>${r == null ? `only since ${f.since.slice(0, 4)}` : `per year, ${h}Y`}</span></div>
        <div class="hz num">${HZ.map((x) => `<div class="${x === h ? 'on' : ''}">${x}Y<b>${f.ret[x] == null ? '—' : pct(f.ret[x])}</b></div>`).join('')}</div>
        <div class="facts num">
          <div>Fee / yr<b>${f.er == null ? '—' : pctPlain(f.er)}</b></div>
          <div>Worst year<b>${f.worst ? `${pct(f.worst.r, 0)} <span class="na">’${String(f.worst.year).slice(2)}</span>` : '—'}</b></div>
          <div>Biggest drop<b>${f.maxDD ? pct(f.maxDD.r, 0) : '—'}</b></div>
        </div></button>`;
    }).join('');
  }

  function openDetail(key) {
    const f = key.startsWith('TSP:') ? D.tsp.find((t) => `TSP:${t.key}` === key) : D.funds.find((x) => x.s === key);
    if (!f) return;
    const isTsp = key.startsWith('TSP:');
    const title = isTsp ? `TSP ${f.name}` : `${f.s} · ${f.name}`;
    $('#dTitle').textContent = title;
    const h = ui.fundH;
    const g = growth(key, h, 10000, 0) || growth(key, 5, 10000, 0) || growth(key, 1, 10000, 0);
    const years = g ? Math.round((g.length - 1) / 12) : 0;
    $('#dBody').innerHTML = `
      <p class="muted small">${isTsp ? esc(f.what) : `${esc(f.provider)} ${esc(f.type)} · tracks ${esc(f.index)} · history since ${esc(f.since)}`}</p>
      <div class="stats num">
        ${HZ.map((x) => `<div class="stat"><span>${x}Y per year</span><b>${pct(f.ret[x])}</b></div>`).join('')}
        <div class="stat"><span>This year so far</span><b>${pct(f.ret.ytd)}</b></div>
        ${isTsp ? '' : `<div class="stat"><span>Fee per year</span><b>${f.er == null ? '—' : pctPlain(f.er)}</b></div>
        <div class="stat"><span>Yield</span><b>${f.yield == null ? '—' : pctPlain(f.yield)}</b></div>
        <div class="stat"><span>Fund size</span><b>${bigMoney(f.assets)}</b></div>`}
        <div class="stat"><span>Worst year</span><b>${f.worst ? `${pct(f.worst.r)} (${f.worst.year})` : '—'}</b></div>
        <div class="stat"><span>Biggest drop</span><b>${f.maxDD ? pct(f.maxDD.r) : '—'}</b>${f.maxDD?.peak ? `<span>${monthName(f.maxDD.peak)} → ${monthName(f.maxDD.trough)}</span>` : ''}</div>
        <div class="stat"><span>Yearly swings (volatility)</span><b>${f.vol == null ? '—' : pctPlain(f.vol, 1)}</b></div>
      </div>
      <h3 class="small">$10,000 invested ${years} year${years === 1 ? '' : 's'} ago</h3>
      <div id="dChart"></div>
      <h3 class="small">Return by calendar year</h3>
      <div id="dBars"></div>
      <div class="mixfoot"><button class="btn" type="button" id="dCompare">Add to calculator</button>
      ${isTsp ? '' : `<a class="small" href="https://finance.yahoo.com/quote/${encodeURIComponent(f.s)}" target="_blank" rel="noopener">More on Yahoo Finance</a>`}</div>`;
    const dlg = $('#detail');
    dlg.showModal();
    requestAnimationFrame(() => {
      if (g) lineChart($('#dChart'), [{ label: isTsp ? f.name : f.s, color: 'var(--s1)', pts: g }], { height: 220 });
      else $('#dChart').innerHTML = '<p class="muted small">Not enough history for a chart.</p>';
      yearBars($('#dBars'), f.cal || {});
    });
    $('#dCompare').onclick = () => { addPick(key); dlg.close(); switchTab('calc'); };
  }
  $('#detail').addEventListener('click', (e) => { if (e.target.matches('[data-close]') || e.target === e.currentTarget) e.currentTarget.close(); });
  $('#detail').addEventListener('close', hideTip);

  // ---------- TSP ----------
  const CORE = ['G Fund', 'F Fund', 'C Fund', 'S Fund', 'I Fund'];
  function readMixFromHash() {
    const m = location.hash.match(/mix=([^&]+)/);
    if (!m) return null;
    const out = {};
    for (const part of decodeURIComponent(m[1]).split(',')) {
      const [k, v] = part.split(':');
      // Link format: C:60,S:20,I:20,L2050:0,LIncome:0
      const key = /^[GFCSI]$/.test(k) ? `${k} Fund` : /^L(\d{4}|Income)$/.test(k) ? `L ${k.slice(1)}` : null;
      if (key && Number(v) >= 0) out[key] = Math.min(100, Number(v));
    }
    return out;
  }
  let mix = readMixFromHash() || store.get('mix', { 'G Fund': 0, 'F Fund': 0, 'C Fund': 0, 'S Fund': 0, 'I Fund': 0 });
  if (readMixFromHash()) store.set('mix', mix);

  function renderMixForm() {
    const lKeys = D.tsp.filter((t) => t.key.startsWith('L ')).map((t) => t.key);
    const lChosen = Object.keys(mix).find((k) => k.startsWith('L ')) || 'L 2050';
    $('#mixForm').innerHTML = CORE.map((k) => {
      const t = D.tsp.find((x) => x.key === k);
      return `<label>${esc(k)}<small>${esc(t?.what.split('(')[0] || '')}</small><input type="number" inputmode="decimal" min="0" max="100" step="1" data-k="${esc(k)}" value="${mix[k] ?? 0}"></label>`;
    }).join('') + `<div class="lrow"><label>Lifecycle (L) fund<select id="lPick">${lKeys.map((k) => `<option ${k === lChosen ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
      <label>&nbsp;<input type="number" inputmode="decimal" min="0" max="100" step="1" id="lPct" value="${mix[lChosen] ?? 0}"></label></div>`;
    const bal = store.get('balance', '');
    $('#mixBalance').value = bal;
    const sync = () => {
      const next = {};
      for (const inp of $$('input[data-k]', $('#mixForm'))) next[inp.dataset.k] = Math.max(0, Number(inp.value) || 0);
      next[$('#lPick').value] = Math.max(0, Number($('#lPct').value) || 0);
      mix = next; store.set('mix', mix);
      renderMixResult();
    };
    $('#mixForm').oninput = sync;
    $('#mixForm').onchange = sync;
  }
  $('#mixBalance').addEventListener('input', (e) => { store.set('balance', e.target.value); renderMixResult(); });

  function renderMixResult() {
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    const pill = $('#mixTotal');
    pill.textContent = `Total ${Math.round(total * 10) / 10}%`;
    pill.className = `pill ${Math.abs(total - 100) < 0.01 ? 'ok' : 'bad'}`;
    const out = $('#mixResult');
    if (Math.abs(total - 100) > 0.01) { out.innerHTML = `<p class="muted small">${total ? `Add up to 100% to see how this mix did (${total > 100 ? 'over' : 'short'} by ${Math.abs(100 - total).toFixed(1)}%).` : 'Type your percentages above, for example C 60, S 20, I 20.'}</p>`; return; }
    const w = Object.fromEntries(Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => [`TSP:${k}`, v / 100]));
    const b = blend(w);
    const st = monthlyStats(b);
    if (!st) { out.innerHTML = '<p class="muted small">Not enough shared history for this mix.</p>'; return; }
    const yrs = Math.floor((b.v.length - 1) / 12);
    const bal = Number($('#mixBalance').value) || 0;
    const parts = Object.entries(mix).filter(([, v]) => v > 0);
    out.innerHTML = `
      <div class="stats num">${HZ.map((x) => `<div class="stat"><span>${x}Y per year</span><b>${pct(st.ret[x])}</b></div>`).join('')}
        <div class="stat"><span>Worst calendar year</span><b>${st.worst ? `${pct(st.worst.r)} (${st.worst.year})` : '—'}</b></div>
        <div class="stat"><span>Biggest drop (month-end)</span><b>${pct(st.maxDD.r)}</b></div></div>
      ${bal ? `<p class="small">With ${money(bal)} today: ${parts.map(([k, v]) => `${esc(k)} ${money((bal * v) / 100)}`).join(' · ')}. A repeat of the worst drop would be about ${money(bal * Math.abs(st.maxDD.r))} on paper.</p>` : ''}
      <p class="muted small">Rebalanced monthly back to these percentages, using ${yrs} years of shared history${yrs < 20 ? ' (limited by the newest fund in the mix)' : ''}. Compared with the C Fund alone below.</p>
      <div id="mixGrowth"></div>`;
    const h = Math.min(20, yrs);
    const cut = (s) => { const v = s.v.slice(-(h * 12 + 1)); const base = v[0]; return v.map((x, i) => ({ d: addMonths(s.start, s.v.length - v.length + i), v: (10000 * x) / base })); };
    const c = seriesOf('TSP:C Fund');
    lineChart($('#mixGrowth'), [{ label: 'Our mix', color: 'var(--s1)', pts: cut(b) }], { height: 220, baseline: c ? { label: 'C Fund only', pts: cut(c) } : null });
  }

  $('#copyMix').addEventListener('click', async () => {
    const enc = Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${k.startsWith('L ') ? 'L' + k.slice(2) : k[0]}:${v}`).join(',');
    const url = `${location.origin}${location.pathname}#tab=tsp&mix=${encodeURIComponent(enc)}`;
    try { await navigator.clipboard.writeText(url); $('#copied').textContent = 'Link copied. Send it to your spouse.'; } catch { prompt('Copy this link:', url); }
  });

  function renderTwins() {
    const h = ui.tspH;
    const rowFund = (f) => `<tr><td>${esc(f.s)}<span class="sub">${esc(f.provider)} ${esc(f.type)}</span></td><td>${pct(f.ret[h])}</td><td>${f.er == null ? '—' : pctPlain(f.er)}</td><td>${f.worst ? pct(f.worst.r, 0) : '—'}</td></tr>`;
    const head = `<thead><tr><th>Fund</th><th>${h}Y / yr</th><th>Fee</th><th>Worst yr</th></tr></thead>`;
    const groups = D.tsp.filter((t) => CORE.includes(t.key) || [2030, 2040, 2050, 2060].includes(t.year));
    $('#twins').innerHTML = groups.map((t) => {
      let twins = (t.twins || []).concat(t.compare || []).map((s) => D.funds.find((f) => f.s === s)).filter(Boolean);
      let note = t.twinNote || '';
      if (t.year) { twins = D.funds.filter((f) => f.cat === 'target-date' && f.year === t.year); note = `Other companies’ ${t.year} target-date funds. Each company uses its own stock/bond glide path, so they aren’t exact matches.`; }
      return `<div class="twin"><h3>${esc(t.name)}</h3><p>${esc(t.what)}${note ? `. ${esc(note)}` : ''}</p>
        <div class="tablewrap"><table class="data">${head}<tbody>
          <tr class="tsp"><td>TSP ${esc(t.name)}<span class="sub">Thrift Savings Plan</span></td><td>${pct(t.ret[h])}</td><td title="Approximate. TSP publishes its exact yearly expense ratio on tsp.gov.">~0.05%</td><td>${t.worst ? pct(t.worst.r, 0) : '—'}</td></tr>
          ${twins.map(rowFund).join('')}</tbody></table></div></div>`;
    }).join('');
  }

  function renderTspTable() {
    $('#tspTable').innerHTML = `<thead><tr><th>Fund</th>${HZ.map((x) => `<th>${x}Y</th>`).join('')}<th>This year</th><th>Worst year</th><th>Biggest drop</th></tr></thead><tbody>` +
      D.tsp.map((t) => `<tr data-k="${esc(t.key)}" style="cursor:pointer"><td>${esc(t.name)}<span class="sub">since ${esc(t.since.slice(0, 4))}</span></td>${HZ.map((x) => `<td>${pct(t.ret[x])}</td>`).join('')}<td>${pct(t.ret.ytd)}</td><td>${t.worst ? `${pct(t.worst.r, 0)} ’${String(t.worst.year).slice(2)}` : '—'}</td><td>${t.maxDD ? pct(t.maxDD.r, 0) : '—'}</td></tr>`).join('') + '</tbody>';
    $('#tspTable').onclick = (e) => { const tr = e.target.closest('tr[data-k]'); if (tr) openDetail(`TSP:${tr.dataset.k}`); };
  }

  // ---------- CALCULATOR ----------
  function pickLabel(key) {
    if (key.startsWith('TSP:')) return { label: `TSP ${key.slice(4)}`, short: key.slice(4) };
    if (key.startsWith('MIX:')) { const m = D.mixes.find((x) => `MIX:${x.id}` === key); return { label: `Sample mix: ${m?.name} (${m?.stocks}% stocks)`, short: m?.name || key }; }
    const f = D.funds.find((x) => x.s === key);
    return { label: `${key} · ${f?.name || ''}`, short: key };
  }
  function pickOptions() {
    const opts = [];
    for (const t of D.tsp) opts.push([`TSP:${t.key}`, `TSP ${t.name}`]);
    for (const m of D.mixes) opts.push([`MIX:${m.id}`, `Sample mix: ${m.name} (${m.stocks}% stocks)`]);
    for (const f of D.funds) opts.push([f.s, `${f.s} — ${f.name}`]);
    return opts;
  }
  function addPick(key) {
    if (!key || ui.picks.includes(key)) return;
    if (ui.picks.length >= 4) ui.picks.shift();
    ui.picks.push(key); store.set('picks', ui.picks);
    renderCalc();
  }
  $('#pickInput').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    const opts = pickOptions();
    const hit = opts.find(([k, l]) => l.toLowerCase() === v.toLowerCase() || k.toLowerCase() === v.toLowerCase()) ||
      opts.find(([, l]) => l.toLowerCase().startsWith(v.toLowerCase()));
    if (hit) { addPick(hit[0]); e.target.value = ''; }
  });
  for (const id of ['#cStart', '#cMonthly']) $(id).addEventListener('input', () => { store.set(id, $(id).value); renderCalc(); });

  function renderCalc() {
    $('#pickList').innerHTML = pickOptions().map(([, l]) => `<option value="${esc(l)}"></option>`).join('');
    $('#picks').innerHTML = ui.picks.map((k, i) => `<span class="chip"><i style="background:${COLORS[i]}"></i>${esc(pickLabel(k).short)}<button type="button" aria-label="Remove ${esc(pickLabel(k).short)}" data-rm="${esc(k)}">×</button></span>`).join('');
    $('#picks').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; ui.picks = ui.picks.filter((k) => k !== b.dataset.rm); store.set('picks', ui.picks); renderCalc(); };
    const start = Math.max(0, Number($('#cStart').value) || 0), monthly = Math.max(0, Number($('#cMonthly').value) || 0), h = ui.calcH;
    const out = $('#calcResult');
    if (!ui.picks.length) { out.innerHTML = '<p class="muted">Add a fund above to start.</p>'; return; }
    const rows = ui.picks.map((k, i) => ({ k, i, ...pickLabel(k), g: growth(k, h, start, monthly) }));
    const ok = rows.filter((r) => r.g);
    const put = start + monthly * h * 12;
    out.innerHTML = `<div class="results">${rows.map((r) => r.g
      ? `<div class="res"><div class="h"><i style="background:${COLORS[r.i]}"></i>${esc(r.short)}</div><b class="num">${money(r.g.at(-1).v)}</b><span>You put in ${money(put)} · gain ${money(r.g.at(-1).v - put)}</span></div>`
      : `<div class="res"><div class="h"><i style="background:${COLORS[r.i]}"></i>${esc(r.short)}</div><b class="na">—</b><span>Doesn’t have ${h} years of history</span></div>`).join('')}</div>
      <div id="calcChart"></div>
      <p class="muted small">Assumes the money went in at the start and on each month-end, dividends reinvested, no taxes. ${h} years back from ${ok[0] ? monthName(ok[0].g.at(-1).d) : 'today'}.</p>`;
    if (ok.length) {
      const putLine = ok[0].g.map((p) => ({ d: p.d, v: p.put }));
      lineChart($('#calcChart'), ok.map((r) => ({ label: r.label, short: r.short, color: COLORS[r.i], pts: r.g })), { baseline: { label: 'Money put in', pts: putLine } });
    }
  }

  // ---------- MIXES ----------
  function renderMixes() {
    const h = ui.mixH;
    const ms = D.mixes;
    $('#mixTable').innerHTML = `<thead><tr><th>Mix</th>${HZ.map((x) => `<th>${x}Y</th>`).join('')}<th>Worst year</th><th>Biggest drop</th></tr></thead><tbody>` +
      ms.map((m) => `<tr><td>${esc(m.name)}<span class="sub">${esc(m.desc)}</span></td>${HZ.map((x) => `<td>${pct(m.ret[x])}</td>`).join('')}<td>${m.worst ? `${pct(m.worst.r, 0)} ’${String(m.worst.year).slice(2)}` : '—'}</td><td>${m.maxDD ? pct(m.maxDD.r, 0) : '—'}</td></tr>`).join('') + '</tbody>';
    const parts = D.mixParts;
    $('#mixNote').textContent = `Built from Vanguard index funds: ${parts.us} (US stocks), ${parts.intl} (international stocks, 30% of the stock part), ${parts.bond} (bonds) and ${parts.short} for cash-like. Rebalanced every month, dividends reinvested. Worst year and biggest drop use month-end prices.`;
    const series = ms.map((m, i) => ({ label: `${m.name} (${m.stocks}% stocks)`, short: `${m.stocks}% stocks`, color: RAMP[i], pts: growth(`MIX:${m.id}`, h, 10000, 0) })).filter((s) => s.pts);
    if (series.length) {
      $('#mixChart').innerHTML = '';
      const wrap = document.createElement('div'); $('#mixChart').append(wrap);
      $('#mixChart').insertAdjacentHTML('afterbegin', `<p class="small" style="margin:0">$10,000 invested ${h} years ago</p>`);
      lineChart(wrap, series, { height: 260 });
    }
  }

  // ---------- tabs ----------
  function switchTab(t) {
    ui.tab = t;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
    $$('.tab').forEach((s) => { s.hidden = s.id !== `tab-${t}`; });
    hideTip();
    const keepMix = location.hash.match(/mix=[^&]+/);
    history.replaceState(null, '', `#tab=${t}${keepMix && t === 'tsp' ? '&' + keepMix[0] : ''}`);
    renderTab();
  }
  function renderTab() {
    if (!D) return;
    if (ui.tab === 'funds') renderFunds();
    if (ui.tab === 'tsp') { renderMixResult(); renderTwins(); renderTspTable(); }
    if (ui.tab === 'calc') renderCalc();
    if (ui.tab === 'mixes') renderMixes();
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) switchTab(b.dataset.tab); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderTab, 200); });

  // ---------- boot ----------
  async function boot() {
    try {
      const [s, ser] = await Promise.all([fetch('data/summary.json', { cache: 'no-cache' }).then((r) => r.json()), fetch('data/series.json', { cache: 'no-cache' }).then((r) => r.json())]);
      D = s; SER = ser;
    } catch {
      $('#asof').textContent = 'Couldn’t load the fund data. Try refreshing.';
      return;
    }
    const asof = new Date(D.asOf + 'T12:00:00');
    $('#asof').textContent = `${D.funds.length} funds + TSP · prices as of ${asof.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    $('#fCat').insertAdjacentHTML('beforeend', D.categories.filter(([id]) => D.funds.some((f) => f.cat === id)).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join(''));
    $('#fProv').insertAdjacentHTML('beforeend', [...new Set(D.funds.map((f) => f.provider))].sort().map((p) => `<option>${esc(p)}</option>`).join(''));
    for (const id of ['fCat', 'fProv', 'fType', 'fSort']) { const v = store.get(id, ''); if (v) $('#' + id).value = v; $('#' + id).addEventListener('change', (e) => { store.set(id, e.target.value); renderFunds(); }); }
    $('#fSearch').addEventListener('input', renderFunds);
    $('#fundList').addEventListener('click', (e) => { const b = e.target.closest('.fund'); if (b) openDetail(b.dataset.s); });
    for (const id of ['#cStart', '#cMonthly']) { const v = store.get(id, null); if (v != null) $(id).value = v; }
    seg($('#fundHorizon'), ui.fundH, (h) => { ui.fundH = h; store.set('fundH', h); renderFunds(); });
    seg($('#tspHorizon'), ui.tspH, (h) => { ui.tspH = h; store.set('tspH', h); renderTwins(); });
    seg($('#calcHorizon'), ui.calcH, (h) => { ui.calcH = h; store.set('calcH', h); renderCalc(); });
    seg($('#mixHorizon'), ui.mixH, (h) => { ui.mixH = h; store.set('mixH', h); renderMixes(); });
    renderMixForm();
    const t = (location.hash.match(/tab=(\w+)/) || [])[1];
    switchTab(['funds', 'tsp', 'calc', 'mixes'].includes(t) ? t : (location.hash.includes('mix=') ? 'tsp' : 'funds'));
  }
  boot();
})();
