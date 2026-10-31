/* DARRIK — Small display widgets: badges, KPI tiles, progress bars, bar charts. */
'use strict';

Object.assign(UI, {
  /* ---------- small visual helpers ---------- */
  badge(text, kind) {
    return text ? `<span class="badge ${kind || ''}">${h(text)}</span>` : '';
  },
  statusKind(s) {
    const x = U.lc(s);
    if (/overdue|delayed|urgent|manager follow|rejected|need manager|high/.test(x)) return 'bad';
    if (
      /team leader|analyst follow|due today|pending|insert|under review|in progress|in-progress|wait|open|onhold|follow up|normal/.test(x)
    )
      return 'warn';
    if (/done|resolved|closed|completed|solved|on time|accepted|request closed|yes/.test(x)) return 'good';
    return '';
  },
  /* one set of words for every kind of task: Open · In progress · Review · Done · Canceled (stored values unchanged) */
  /* small tags for a record: priority (when not Normal), ⭐ milestone, FU — kept to one or two so lists stay calm */
  PRI_RANK: { High: 0, Medium: 1, Normal: 2, Low: 3 },
  flagTags(r, opts = {}) {
    const p =
      !opts.noPri && r.priority && r.priority !== 'Normal'
        ? `<span class="tag-pri ${h(r.priority)}" title="Priority">${h(r.priority)}</span>`
        : '';
    return (
      p +
      (r.milestone ? '<span class="tag-ms" title="Milestone">⭐</span>' : '') +
      (opts.fu && r.fu ? '<span class="tag-fu" title="Needs follow-up">FU</span>' : '')
    );
  },
  TASK_WORDS: {
    Resolved: 'Done',
    'Ready for review': 'Review',
    'In Review': 'Review',
    'To Do': 'Open',
    'In Progress': 'In progress',
    'Not forwarded': 'Open',
  },
  statusLabel(s) {
    return UI.TASK_WORDS[s] || s;
  },
  statusOpts(list) {
    return list.map(v => [v, UI.statusLabel(v)]);
  },
  sbadge(s) {
    return UI.badge(UI.statusLabel(s), /review/i.test(s || '') ? 'warn' : UI.statusKind(s));
  },
  scoreClass(v) {
    if (v == null) return 'sc-none';
    if (v >= 95) return 'sc-a';
    if (v >= 90) return 'sc-b';
    if (v >= 85) return 'sc-c';
    if (v >= 75) return 'sc-d';
    return 'sc-e';
  },
  kpi(label, value, sub, kind) {
    return `<div class="kpi ${kind || ''}"><div class="kpi-label">${h(label)}</div><div class="kpi-val">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  },
  bar(v, max) {
    const p = Math.max(0, Math.min(100, (v / (max || 100)) * 100));
    return `<div class="pbar"><span style="width:${p}%"></span></div>`;
  },
  /* simple SVG bar chart: series = [{label, value}] */
  barChart(
    series,
    {
      height = 180,
      width = 640,
      fmt = v => U.num(v),
      color = 'var(--accent)',
      target,
      emptyText = 'Nothing recorded yet for this period.',
    } = {}
  ) {
    if (!series.some(s => +s.value)) return `<p class="muted chart-empty">${h(emptyText)}</p>`; // an empty chart is one line
    const W = width,
      H = height,
      pad = 26,
      bw = (W - pad * 2) / Math.max(1, series.length);
    const max = Math.max(1, target || 0, ...series.map(s => s.value || 0)) * 1.12;
    const y = v => H - 22 - (v / max) * (H - 40);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="bar chart">
      ${target ? `<line x1="${pad}" x2="${W - pad}" y1="${y(target)}" y2="${y(target)}" class="target"/><text x="${W - pad}" y="${y(target) - 4}" text-anchor="end" class="tl">target ${fmt(target)}</text>` : ''}
      ${series
        .map((s, i) => {
          const v = s.value || 0;
          const x = pad + i * bw + bw * 0.18;
          const w = bw * 0.64;
          return `<g><rect x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, H - 22 - y(v))}" rx="3" fill="${s.color || color}"><title>${h(s.label)}: ${fmt(v)}</title></rect>
        ${v ? `<text x="${x + w / 2}" y="${y(v) - 4}" text-anchor="middle" class="vl">${fmt(v)}</text>` : ''}<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" class="xl">${h(s.label)}</text></g>`;
        })
        .join('')}
      <line x1="${pad}" x2="${W - pad}" y1="${H - 22}" y2="${H - 22}" class="axis"/></svg>`;
  },
  hbars(items, { fmt = v => U.num(v), max } = {}) {
    const mx = max || Math.max(1, ...items.map(i => i.value || 0));
    return `<div class="hbars">${items.map(i => `<div class="hb"><span class="hb-l" title="${h(i.label)}">${h(i.label)}</span><span class="hb-t"><span style="width:${((100 * (i.value || 0)) / mx).toFixed(1)}%;${i.color ? `background:${i.color}` : ''}"></span></span><span class="hb-v">${fmt(i.value)}</span></div>`).join('')}</div>`;
  },
});
