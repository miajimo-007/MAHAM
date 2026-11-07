/* MAHAM — Schemas describe each record type for the generic editor (UI.editRecord):
 *  single, defaults(), fields[], beforeSave(r)
 *  field flags: mgr (manager-only), dir (director-only), required, span
 *  optional hooks: canCreate(), canDelete(r), readOnly(r), mgrOk(r), fullEdit(r) */
'use strict';

const L = k => () => Store.list(k);

const Schemas = {};
