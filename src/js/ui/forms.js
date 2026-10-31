/* DARRIK — Form fields and the generic record editor (driven by Schemas). */
'use strict';

Object.assign(UI, {
  /* ---------- form fields ---------- */
  memberOptions(sel, { all, includeInactive, blank } = {}) {
    const team = includeInactive ? Store.team() : Store.activeTeam();
    if (sel && !team.some(m => m.id === sel) && Store.member(sel)) team.unshift(Store.member(sel));
    return (
      (blank ? `<option value="">${blank === true ? '—' : h(blank)}</option>` : '') +
      (all ? `<option value="">All team</option>` : '') +
      team.map(m => `<option value="${h(m.id)}" ${m.id === sel ? 'selected' : ''}>${h(m.name)}</option>`).join('')
    );
  },
  options(list, sel, blank) {
    const arr = [...list].map(o => (Array.isArray(o) ? o : [o, o]));
    if (sel && !arr.some(o => o[0] === sel)) arr.unshift([sel, sel]);
    return (
      (blank !== false ? `<option value="">${blank && blank !== true ? h(blank) : '—'}</option>` : '') +
      arr.map(([v, l]) => `<option value="${h(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${h(l)}</option>`).join('')
    );
  },
  taskTypeOptions(sel) {
    let out = '<option value="">—</option>',
      open = false;
    for (const t of Store.list('taskTypes')) {
      if (/^>>>/.test(t)) {
        if (open) out += '</optgroup>';
        out += `<optgroup label="${h(t.replace(/[<>]/g, '').trim())}">`;
        open = true;
      } else out += `<option ${t === sel ? 'selected' : ''}>${h(t)}</option>`;
    }
    if (open) out += '</optgroup>';
    if (sel && !Store.list('taskTypes').includes(sel)) out = `<option selected>${h(sel)}</option>` + out;
    return out;
  },
  field(f, v) {
    const id = 'f_' + f.key;
    const req = f.required ? 'required' : '';
    let input;
    const val = v == null ? '' : v;
    switch (f.type) {
      case 'textarea':
        input = `<textarea id="${id}" name="${f.key}" rows="${f.rows || 3}" ${req}>${h(val)}</textarea>`;
        break;
      case 'date':
        input = `<input type="date" id="${id}" name="${f.key}" value="${h(val)}" ${req}>`;
        break;
      case 'datetime':
        input = `<input type="datetime-local" id="${id}" name="${f.key}" value="${h(val)}" ${req}>`;
        break;
      case 'time':
        input = `<input type="time" id="${id}" name="${f.key}" value="${h(val)}" ${req}>`;
        break;
      case 'number':
        input = `<input type="number" id="${id}" name="${f.key}" value="${h(val)}" step="${f.step || 'any'}" min="${f.min != null ? f.min : ''}" ${req}>`;
        break;
      case 'bool':
        input = `<label class="check"><input type="checkbox" id="${id}" name="${f.key}" ${val ? 'checked' : ''}> ${h(f.checkLabel || 'Yes')}</label>`;
        break;
      case 'member':
        input = `<select id="${id}" name="${f.key}" ${req}>${UI.memberOptions(val, { blank: true, includeInactive: true })}</select>`;
        break;
      case 'select':
        input = `<select id="${id}" name="${f.key}" ${req}>${UI.options(typeof f.options === 'function' ? f.options() : f.options, val, f.blank)}</select>`;
        break;
      case 'list':
        input = `<input id="${id}" name="${f.key}" value="${h(val)}" list="dl_${f.key}" autocomplete="off" ${req}><datalist id="dl_${f.key}">${(typeof f.options === 'function' ? f.options() : f.options).map(o => `<option value="${h(o)}">`).join('')}</datalist>`;
        break;
      case 'tasktype':
        input = `<select id="${id}" name="${f.key}" ${req}>${UI.taskTypeOptions(val)}</select>`;
        break;
      case 'minutes':
        input = `<div class="minutes"><input type="number" id="${id}" name="${f.key}" value="${h(val)}" min="0" step="5" ${req}><div class="chips">${[15, 30, 45, 60, 90, 120].map(n => `<button type="button" class="chip" data-min="${n}">${n < 60 ? n + 'm' : n / 60 + 'h'}</button>`).join('')}</div></div>`;
        break;
      case 'members': {
        const sel = new Set(Array.isArray(val) ? val : []);
        const ex = (UI._recBase || {}).analyst || App.me;
        const ms = Store.team().filter(m => m.active !== false && !Store.topRole(m.role) && m.id !== ex);
        input = `<div class="pick members-pick" id="${id}">${ms.map(m => `<label class="check"><input type="checkbox" name="${f.key}" value="${h(m.id)}" ${sel.has(m.id) ? 'checked' : ''}> ${h(m.short || m.name)}</label>`).join('') || '<span class="muted small">Nobody else in the team</span>'}</div>`;
        break;
      }
      case 'readonly':
        input = `<input id="${id}" value="${h(val)}" readonly class="ro" title="Only the manager can change this">`;
        break;
      default:
        input = `<input type="text" id="${id}" name="${f.key}" value="${h(val)}" ${req} ${f.placeholder ? `placeholder="${h(f.placeholder)}"` : ''}>`;
    }
    return `<div class="fld ${f.span ? 'span' + f.span : ''} ${f.type === 'bool' ? 'fld-bool' : ''} ${f.cls || ''}"><label for="${id}">${h(f.label)}${f.required ? ' <i>*</i>' : ''}</label>${input}${f.hint ? `<small>${h(f.hint)}</small>` : ''}</div>`;
  },
  /* fields marked flag: true (priority, FU, milestone …) sit together on one row */
  groupFlags(fields, render) {
    const out = [];
    let row = [];
    const flush = () => {
      if (row.length) out.push(`<div class="fld span2 flag-row">${row.join('')}</div>`);
      row = [];
    };
    for (const f of fields) {
      if (f.flag || (f._orig && f._orig.flag)) row.push(render(f));
      else {
        flush();
        out.push(render(f));
      }
    }
    flush();
    return out.join('');
  },
  readForm(form, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === 'readonly') continue;
      if (f.type === 'members') {
        out[f.key] = [...form.querySelectorAll(`[name="${f.key}"]:checked`)].map(c => c.value);
        continue;
      }
      const el = form.querySelector(`[name="${f.key}"]`);
      if (!el) continue;
      if (f.type === 'bool') out[f.key] = el.checked;
      else if (f.type === 'number' || f.type === 'minutes') out[f.key] = el.value === '' ? (f.type === 'minutes' ? 0 : '') : +el.value;
      else out[f.key] = el.value.trim();
    }
    return out;
  },
  /* Edit clash: someone else saved the same record while I had it open.
     Different fields → combine both changes. Same field changed differently → ask which to keep. */
  resolveClash(base, vals, fields, commit) {
    const latest = Store.get(base.id);
    const eq = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
    const editable = fields.filter(f => f.type !== 'readonly').map(f => f.key);
    const mine = editable.filter(k => !eq(vals[k], base[k]));
    if (!latest) {
      // deleted by someone else
      if (!Store.db.get(base.id)) return commit(Object.assign({}, base, vals));
      const who = Store.memberName((Store.db.get(base.id) || {})._by);
      return UI.confirm(`${who} deleted this while you were editing it. Save your version anyway (it will come back)?`, () =>
        commit(Object.assign({}, base, vals, { _del: false }), 'Saved — it is back')
      );
    }
    const changedByOther = (latest._ts || 0) > (base._ts || 0) && latest._by !== App.me;
    if (!changedByOther) return commit(Object.assign({}, latest, vals));
    const theirs = editable.filter(k => !eq(latest[k], base[k]));
    const both = mine.filter(k => theirs.includes(k) && !eq(vals[k], latest[k]));
    const who = Store.memberName(latest._by) || latest._by;
    const pickMine = Object.fromEntries(mine.map(k => [k, vals[k]]));
    const theirsAny = fields.map(f => f.key).some(k => !eq(latest[k], base[k]));
    if (!both.length) return commit(Object.assign({}, latest, pickMine), theirsAny ? `Saved — combined with ${who}'s changes` : 'Saved');
    const label = k => (fields.find(f => f.key === k) || {}).label || k;
    const show = (k, v) => {
      const f = fields.find(x => x.key === k) || {};
      const o = f._orig || f;
      if (o.type === 'member' || k === 'manager' || k === 'assignee' || k === 'analyst') return Store.memberName(v) || '—';
      if (o.type === 'bool') return v ? 'Yes' : 'No';
      if (o.type === 'members') return (v || []).map(Store.memberShort).join(', ');
      if (o.type === 'date') return U.fmtDate(v) || '—';
      return v === '' || v == null ? '—' : String(v);
    };
    UI.modal({
      title: 'Someone changed this while you were editing',
      body: `<p><b>${h(who)}</b> saved this ${h(U.fmtTs(latest._ts))}. You both changed:</p>
        <table class="tbl"><thead><tr><th>Field</th><th>${h(Store.memberShort(latest._by))}'s version</th><th>Your version</th></tr></thead><tbody>${both.map(k => `<tr><td><b>${h(label(k))}</b></td><td>${h(show(k, latest[k]))}</td><td>${h(show(k, vals[k]))}</td></tr>`).join('')}</tbody></table>
        ${mine.length > both.length || theirs.length > both.length ? '<p class="muted small">Other fields changed by either of you are kept either way.</p>' : ''}`,
      actions: `<span class="grow"></span><button class="btn" data-theirs>Keep ${h(Store.memberShort(latest._by))}'s</button><button class="btn primary" data-mine>Keep mine</button>`,
      onMount: w => {
        w.querySelector('[data-mine]').onclick = () => commit(Object.assign({}, latest, pickMine), 'Saved — your version kept');
        w.querySelector('[data-theirs]').onclick = () => {
          const keep = Object.fromEntries(mine.filter(k => !both.includes(k)).map(k => [k, vals[k]]));
          if (Object.keys(keep).length) commit(Object.assign({}, latest, keep), `Saved — ${who}'s version kept for the clashing fields`);
          else {
            UI.closeModal();
            UI.toast(`Kept ${who}'s version`, 'good');
            App.render();
          }
        };
      },
    });
  },

  /* generic record editor */
  editRecord(coll, rec, opts = {}) {
    const S = Schemas[coll];
    const isNew = !rec || !rec.id;
    UI._recProject = (rec && rec.project) || ''; // defaults() of project tasks need to know the project
    const base = Object.assign({ c: coll }, S.defaults ? S.defaults() : {}, rec || {});
    UI._recProject = base.project || '';
    UI._recBase = base;
    const lockYm = !isNew && Store.FAIR_COLLS.has(coll) && !App.can('lockScores') ? Store.recMonth(base) : '';
    const lockedMonth = !!(lockYm && Store.lockMap()[`${base.team || App.viewTeam || 'apps'}|${lockYm}`]);
    const ro = !App.canEdit(coll) || !!(S.readOnly && S.readOnly(base)) || lockedMonth;
    const mgr = (S.mgrOk ? S.mgrOk(base) : App.can(S.mgrPerm || 'manageTeam')) && !ro;
    const dir = (S.fullEdit ? S.fullEdit(base) : (App.isDir() || App.isSuper()) && App.can('assignToManagers')) && !ro;
    const lockedNow = !mgr && S.lockedFields ? S.lockedFields(base) : [];
    const fields = S.fields
      .filter(f => !f.showIf || f.showIf(base))
      .map(f =>
        ro || (f.mgr && !mgr) || (f.dir && !dir) || lockedNow.includes(f.key)
          ? Object.assign({}, f, { type: 'readonly', label: f.label + (f.dir ? ' (director)' : ' (manager)'), _orig: f })
          : f
      );
    const roVal = (f, v) => {
      const o = f._orig;
      if (!o) return v;
      if (o.type === 'member' || o.key === 'manager') return Store.memberName(v);
      if (o.type === 'bool') return v ? 'Yes' : 'No';
      if (o.type === 'members') return (v || []).map(Store.memberShort).join(', ');
      if (o.type === 'date') return U.fmtDate(v);
      return v;
    };
    const canDel = !ro && !isNew && (S.canDelete ? S.canDelete(base) : (!S.mgrDelete || mgr) && (!S.dirDelete || dir));
    const meta =
      !isNew && base._ts
        ? `<div class="meta">Last edited by <b>${h(Store.memberShort(base._by) || base._by)}</b> · ${h(U.fmtTs(base._ts))}</div>`
        : '';
    UI.modal({
      title: opts.title || (ro ? 'View ' : isNew ? 'New ' : 'Edit ') + S.single,
      wide: fields.length > 6,
      body: `${isNew && Store.TEAM_SCOPED.has(coll) && App.viewTeam && App.viewTeam !== ((Store.member(App.me) || {}).team || 'apps') ? `<div class="insights addto"><div>➕ Adding to <b>${h(Store.teamName(App.viewTeam))}</b> — switch team at the top to add it somewhere else.</div></div>` : ''}<form id="recform" class="grid-form" novalidate>${UI.groupFlags(fields, f => UI.field(f, roVal(f, base[f.key])))}</form>${lockedMonth ? `<p class="note">🔒 ${h(Store.monthLabel(lockYm))} is locked — scores for this month are final, so only your manager can change it.</p>` : ''}${lockedNow.length ? '<p class="note">🔒 Approved — the details are locked. Your manager can still change them.</p>' : ''}${S.formNote ? `<p class="note">${S.formNote}</p>` : ''}${!isNew && S.formExtra ? S.formExtra(base) : ''}${typeof Conv !== 'undefined' ? Conv.note(base) : ''}${meta}`,
      actions: `${canDel ? '<button class="btn danger ghost" data-del>Delete</button>' : ''}${!isNew && !ro && typeof Conv !== 'undefined' && Conv.KINDS[coll] && Object.keys(Conv.KINDS).some(k => k !== coll && !Conv.why(base, k)) ? '<button class="btn ghost" data-convert>⇄ Convert to…</button>' : ''}<span class="grow"></span><button class="btn" data-cancel>${ro ? 'Close' : 'Cancel'}</button>${ro ? '' : `<button class="btn primary" data-save>${isNew ? 'Add' : 'Save'}</button>`}`,
      onMount: w => {
        const form = w.querySelector('#recform');
        w.querySelectorAll('[data-min]').forEach(
          b =>
            (b.onclick = () => {
              const i = b.closest('.minutes').querySelector('input');
              i.value = b.dataset.min;
            })
        );
        if (S.onFormMount) S.onFormMount(form, base);
        w.querySelector('[data-cancel]').onclick = UI.closeModal;
        const cv = w.querySelector('[data-convert]');
        if (cv)
          cv.onclick = () => {
            UI.closeModal();
            setTimeout(() => Conv.start(base), 0);
          };
        const ql = w.querySelector('[data-qwleave]');
        if (ql)
          ql.onclick = () => {
            UI.closeModal();
            QS.answer(Store.get(base.id) || base, false);
          };
        const cu = w.querySelector('[data-cvundo]');
        if (cu) cu.onclick = () => Conv.undo(Store.get(base.id) || base);
        const del = w.querySelector('[data-del]');
        if (del)
          del.onclick = () => {
            const extra = S.cascade ? S.cascade(Object.assign({}, base, { _del: true }), base, true) : []; // e.g. cancel forwarded To Dos
            UI.confirm(
              `Delete this ${S.single.toLowerCase()}?${extra.length ? ` ${extra.length} open To Do${extra.length > 1 ? 's' : ''} forwarded from it will be canceled.` : ''}`,
              () => {
                Store.saveMany([Object.assign({}, Store.db.get(base.id) || base, { _del: true }), ...extra]);
                UI.toast('Deleted');
                App.render();
              }
            );
          };
        const commit = (out, msg) => {
          if (S.beforeSave) S.beforeSave(out, base);
          const why = Store.whyNotFair(out);
          if (why) {
            UI.toast(why, 'bad');
            return;
          } // keep the form open
          const extra = S.cascade ? S.cascade(out, base, false) : []; // records that follow this one (see schemas)
          const more = opts.with ? opts.with(out) : [];
          Store.saveMany([out, ...extra, ...more]);
          if (extra.length) msg = (msg || 'Saved') + ` — ${extra.length} forwarded To Do${extra.length > 1 ? 's' : ''} updated`;
          UI.closeModal();
          UI.toast(msg || opts.savedMsg || (isNew ? `${S.single} added` : 'Saved'), 'good');
          if (opts.after) opts.after(out);
          App.render();
        };
        const save = async () => {
          const vals = UI.readForm(form, fields);
          for (const f of fields)
            if (f.required && f.type !== 'readonly' && (vals[f.key] === '' || vals[f.key] == null)) {
              UI.toast(`"${f.label}" is required`, 'bad');
              form.querySelector(`[name="${f.key}"]`).focus();
              return;
            }
          if (isNew) return commit(Object.assign({}, base, vals));
          // did someone else change this record while I was editing? (fetch their latest saves first)
          try {
            await Store.sync(false);
          } catch (e) {
            /* offline: compare with what we have */
          }
          UI.resolveClash(base, vals, fields, commit);
        };
        const sv = w.querySelector('[data-save]');
        if (sv) sv.onclick = save;
        form.addEventListener('keydown', e => {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            save();
          }
        });
      },
    });
  },
});
