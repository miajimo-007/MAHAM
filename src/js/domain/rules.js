/* MAHAM — small rules applied to every record just before it is saved (Store.saveMany → Store.normalize). */
'use strict';

Object.assign(Store, {
  normalize(r) {
    // a quick win accepted without a QW ID gets the next one, however it was approved (form, button, import) — by someone who may approve
    if (
      r.c === 'quickwin' &&
      !r._del &&
      U.lc(r.approval) === 'accepted' &&
      !String(r.qwId || '').trim() &&
      typeof nextQwId === 'function' &&
      Store.can(App.me, 'approveQW')
    ) {
      const qwId = nextQwId();
      (nextQwId.taken = nextQwId.taken || []).push({ qwId });
      return Object.assign({}, r, { qwId });
    }
    // a To Do's status follows its finish date and the manager's confirmation; an already-done To Do stays done when someone adds a comment
    if (r.c === 'todo' && !r._del && r.status !== 'Canceled' && App.me) {
      const p = r.id && Store.db.get(r.id);
      return Object.assign({}, r, {
        status: p && !p._del && p.status === 'Resolved' && p.finish && p.finish === r.finish ? 'Resolved' : Store.finishStatus(r, App.me),
      });
    }
    return r;
  },
});
