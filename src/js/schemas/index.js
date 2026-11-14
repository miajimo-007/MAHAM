/* MAHAM — Schemas describe each record type for the generic editor (UI.editRecord):
 *  single, defaults(), fields[], beforeSave(r)
 *  field flags: mgr (manager-only), dir (director-only), required, span
 *  optional hooks: canCreate(), canDelete(r), readOnly(r), mgrOk(r), fullEdit(r) */
'use strict';

const L = k => () => Store.list(k);

const Schemas = {};

/* Several files add to one record type (e.g. project tasks: workflows, work items, Lanes). Instead of each wrapping the
 * hooks of the one before, they register here; the record editor (ui/forms.js) runs them, in load order:
 *   Schemas.extend(coll, {
 *     prepare(rec) → rec          the record as the form should open it (e.g. an old follow-up read the new way)
 *     defaults(d)                 add to a new record's defaults               (after the type's own)
 *     fields(list, rec) → list    add / change fields for this record           (on a copy, each in turn)
 *     mount(form, base)           when the form is open                         (after the type's own)
 *     before(r, prev)             saving: before the type's own beforeSave
 *     after(r, prev)              saving: after it
 *     validate(out) → message     checks, the last added first (as the wrappers they replace did), then the type's own
 *     saved(out, prev)            after the save went through })
 * Schemas.extensions(coll) lists them (System Check / docs). */
Schemas.extend = (coll, ext) => {
  const S = Schemas[coll];
  if (!S) return;
  if (!S._ext) {
    const own = { defaults: S.defaults, beforeSave: S.beforeSave, validate: S.validate, onFormMount: S.onFormMount };
    S._ext = [];
    S.defaults = function () {
      const d = own.defaults ? own.defaults.call(S) : {};
      for (const e of S._ext) if (e.defaults) e.defaults.call(S, d);
      return d;
    };
    S.beforeSave = function (r, prev) {
      for (const e of S._ext) if (e.before) e.before.call(S, r, prev);
      if (own.beforeSave) own.beforeSave.call(S, r, prev);
      for (const e of S._ext) if (e.after) e.after.call(S, r, prev);
    };
    S.validate = function (out) {
      for (let i = S._ext.length - 1; i >= 0; i--) {
        const v = S._ext[i].validate;
        const m = v ? v.call(S, out) : '';
        if (m) return m;
      }
      return own.validate ? own.validate.call(S, out) : '';
    };
    S.onFormMount = function (form, base) {
      if (own.onFormMount) own.onFormMount.call(S, form, base);
      for (const e of S._ext) if (e.mount) e.mount.call(S, form, base);
    };
    S.fieldsFor = rec => S._ext.reduce((l, e) => (e.fields ? e.fields.call(S, l, rec) || l : l), S.fields.slice());
    S.prepare = rec => S._ext.reduce((x, e) => (e.prepare ? e.prepare.call(S, x) || x : x), rec);
    S.afterSaved = (out, prev) => {
      for (const e of S._ext)
        if (e.saved)
          try {
            e.saved.call(S, out, prev);
          } catch (err) {
            console.error(err);
          }
    };
  }
  S._ext.push(ext);
};
Schemas.extensions = coll => ((Schemas[coll] || {})._ext || []).map(e => e.name || '?');
