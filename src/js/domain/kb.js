/* MAHAM — 📚 Knowledge base (2026.11.11.11).
 * An article is its own small signed record, saved in the writer's own file (like reference notes):
 *   { c: 'kbarticle', id: 'kbarticle-<by>-<time>', by, at, team, title, problem, solution, tags: [..], vis: 'team' | 'all',
 *     on?: <item id>, onC?: <item type>, edited?, editedBy? }
 * Made from an item (To Do, shadow work, quick win, project task, follow-up, Good Catch — the 📚 box at the bottom of its
 * form) or from scratch (Reference → Knowledge base → ＋ New article). It stays when the item is converted or deleted.
 * Who marks an item: the person it belongs to, the team's managers, the super admin.
 * Who reads: vis 'all' = everyone; 'team' = that team (+ the writer, the super admin and directors).
 * Who changes / removes: the writer, the team's managers, the super admin (checked again when files are read — trust.js). */
'use strict';

const KB = {
  COLLS: { todo: 'To Do', shadow: 'Shadow work', quickwin: 'Quick win', ptask: 'Project task', central: 'Follow-up', gcatch: 'Good Catch' },
  VIS: [
    ['team', 'My team'],
    ['all', 'Everyone (whole department)'],
  ],
  PATIENT: 'Do not type patient names, MRNs or anything that identifies a patient.',

  /* a manager of that team (or the super admin) — the same test is used by the trust check */
  isLead(id, team, ts) {
    if (!id) return false;
    if (Store.isSuper(id)) return true;
    const m = Store.member(id);
    if (!m || (m.team || 'apps') !== (team || 'apps')) return false;
    return Store.isManager(id) || Store.privileged(id, 'assignTodo', ts);
  },
  /* the team an item belongs to */
  teamOf(rec) {
    if (!rec) return (Store.member(App.me) || {}).team || 'apps';
    if (rec.c === 'ptask' && typeof Scrum !== 'undefined') {
      const p = Scrum.proj(rec.project);
      if (p) return Scrum.teamOf(p);
    }
    return rec.team || (Store.member(Store.recOwner(rec)) || {}).team || 'apps';
  },
  itemTitle(r) {
    return !r ? '' : r.title || r.task || r.subject || '';
  },
  /* the people an item belongs to */
  owners(r) {
    if (!r) return [];
    return [Store.recOwner(r), r.assignee, r.analyst, r.createdBy].filter(Boolean);
  },

  all() {
    return Calc.memo('kbarticles', () =>
      (Store.byC.kbarticle || []).filter(a => a && !a._del && a.id).sort((a, b) => (b.edited || b.at || 0) - (a.edited || a.at || 0))
    );
  },
  get(id) {
    const a = Store.get(id);
    return a && a.c === 'kbarticle' && !a._del ? a : null;
  },
  canRead(a) {
    if (!a) return false;
    if (a.vis === 'all' || a.by === App.me || App.isSuper() || App.isDir()) return true;
    return ((Store.member(App.me) || {}).team || 'apps') === (a.team || 'apps');
  },
  canEdit(a) {
    return !!a && !App.preview && (a.by === App.me || KB.isLead(App.me, a.team));
  },
  canMark(rec) {
    return !!rec && !!rec.id && !App.preview && !!KB.COLLS[rec.c] && (KB.owners(rec).includes(App.me) || KB.isLead(App.me, KB.teamOf(rec)));
  },
  list() {
    return KB.all().filter(KB.canRead);
  },
  /* articles made from this item — also from what it was before a conversion */
  of(id) {
    if (!id) return [];
    const ids = new Set(typeof Conv !== 'undefined' ? Conv.family(id) : [id]);
    return KB.all().filter(a => a.on && ids.has(a.on));
  },
  /* the item an article came from, as it is now (after conversions), or null */
  source(a) {
    if (!a || !a.on) return null;
    const r = typeof Conv !== 'undefined' ? Conv.current(a.on) : Store.get(a.on);
    return r && !r._del ? r : null;
  },
  tags(v) {
    return [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map(x => String(x).trim()).filter(Boolean))].slice(0, 12);
  },

  /* a ready-to-edit article from an item */
  draft(rec) {
    const pick = ks => {
      for (const k of ks) {
        const v = String(rec[k] || '').trim();
        if (v) return v;
      }
      return '';
    };
    const notes =
      typeof RefNotes !== 'undefined'
        ? RefNotes.of(rec.id)
            .slice()
            .reverse()
            .map(n => n.text)
            .join('\n')
        : '';
    return {
      title: KB.itemTitle(rec),
      problem: pick(['details', 'description', 'instruction', 'problem', 'notes']),
      solution: [pick(['resolution', 'action', 'finishNote', 'solution']), notes].filter(Boolean).join('\n'),
      tags: KB.tags([rec.module, rec.system].filter(Boolean)),
      vis: 'team',
      on: rec.id,
      onC: rec.c,
      team: KB.teamOf(rec),
    };
  },
  /* → '' or what is missing */
  missing(a) {
    if (!String(a.title || '').trim()) return 'Give the article a title';
    if (!String(a.problem || '').trim() && !String(a.solution || '').trim()) return 'Write the problem or the solution';
    return '';
  },
  save(a, prev) {
    const out = Object.assign({}, prev || {}, a, {
      c: 'kbarticle',
      title: String(a.title || '').trim(),
      problem: String(a.problem || '').trim(),
      solution: String(a.solution || '').trim(),
      tags: KB.tags(a.tags),
      vis: a.vis === 'all' ? 'all' : 'team',
    });
    if (prev) {
      if (!KB.canEdit(prev)) return null;
      Object.assign(out, { id: prev.id, by: prev.by, at: prev.at, edited: Date.now(), editedBy: App.me });
    } else {
      Object.assign(out, {
        id: `kbarticle-${App.me}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        by: App.me,
        at: Date.now(),
        team: a.team || (Store.member(App.me) || {}).team || 'apps',
      });
    }
    Store.save(out);
    return out;
  },
  remove(a) {
    if (KB.canEdit(a)) Store.save(Object.assign({}, a, { _del: true }));
  },
};
