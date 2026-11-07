/* MAHAM — Page registry (P) and helpers shared by all pages: filters, cards, add buttons, empty states. */
'use strict';

const P = {}; // page registry: P.name = () => ({ title, html, mount })

/* ---------- shared filter bar ---------- */
function ps(page) {
  return (App.ps[page] = App.ps[page] || {});
}

function filterBar(page, defs) {
  const s = ps(page);
  const parts = defs.map(d => {
    const v = s[d.key] != null ? s[d.key] : d.dflt != null ? d.dflt : '';
    if (s[d.key] == null && d.dflt != null) s[d.key] = d.dflt;
    if (d.type === 'member')
      return `<label class="flt"><span>${h(d.label || 'Analyst')}</span><select data-flt="${page}|${d.key}">${UI.memberOptions(v, { all: true, includeInactive: true })}</select></label>`;
    if (d.type === 'month')
      return `<label class="flt"><span>Month</span><select data-flt="${page}|${d.key}"><option value="">All months</option>${U.MONTHS.map((m, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>`;
    if (d.type === 'toggle')
      return `<label class="flt tog"><input type="checkbox" data-flt="${page}|${d.key}" ${v ? 'checked' : ''}> ${h(d.label)}</label>`;
    const opts = typeof d.options === 'function' ? d.options() : d.options;
    return `<label class="flt"><span>${h(d.label)}</span><select data-flt="${page}|${d.key}"><option value="">All</option>${opts
      .map(o => {
        const [val, lab] = Array.isArray(o) ? o : [o, o];
        return `<option value="${h(val)}" ${String(v) === String(val) ? 'selected' : ''}>${h(lab)}</option>`;
      })
      .join('')}</select></label>`;
  });
  FLT_DEFS[page] = defs;
  const set = defs.some(d => {
    const v = s[d.key];
    return v != null && v !== '' && v !== false && String(v) !== String(d.dflt != null ? d.dflt : '');
  });
  return `<div class="filters">${parts.join('')}${set ? `<button type="button" class="btn xs ghost flt-clear" data-fltclear="${h(page)}">✕ Clear filters</button>` : ''}</div>`;
}
const FLT_DEFS = {};
/* does a date (YYYY-MM-DD…) fall in the chosen month (1–12, '' = all) of the chosen year? */
const inMonth = (d, mo) => !mo || (!!d && +String(d).slice(5, 7) === +mo);

function bindFilters(root) {
  root.querySelectorAll('[data-fltclear]').forEach(
    b =>
      (b.onclick = () => {
        const page = b.dataset.fltclear;
        const s = ps(page);
        for (const d of FLT_DEFS[page] || []) {
          if (d.dflt != null) s[d.key] = d.dflt;
          else delete s[d.key];
        }
        App.render();
      })
  );
  root.querySelectorAll('[data-flt]').forEach(
    el =>
      (el.onchange = () => {
        const [page, key] = el.dataset.flt.split('|');
        ps(page)[key] = el.type === 'checkbox' ? el.checked : el.value;
        App.render();
      })
  );
}

const monthOf = s => U.month(s);

const yearOf = s => U.year(s);

const memberCell = id => h(Store.memberShort(id) || '—');

const card = (title, body, extra = '') => `<section class="card"><div class="card-head"><h3>${title}</h3>${extra}</div>${body}</section>`;

const addBtn = (coll, label) =>
  !App.canEdit(coll)
    ? ''
    : Schemas[coll] && Schemas[coll].canCreate
      ? Schemas[coll].canCreate()
        ? `<button class="btn primary" data-add="${coll}">＋ ${h(label || 'Add')}</button>`
        : ''
      : Schemas[coll] &&
          ((Schemas[coll].mgrCreate && !App.can(Schemas[coll].mgrPerm || 'manageTeam')) ||
            (Schemas[coll].dirCreate && !((App.isDir() || App.isSuper()) && App.can('assignToManagers'))))
        ? ''
        : `<button class="btn primary" data-add="${coll}">＋ ${h(label || 'Add')}</button>`;

function bindAdd(root, defaults) {
  root
    .querySelectorAll('[data-add]')
    .forEach(b => (b.onclick = () => UI.editRecord(b.dataset.add, Object.assign({}, defaults && defaults[b.dataset.add]))));
}

const empty = t => `<div class="empty-state">${h(t)}</div>`;
