/* DARRIK — small rules applied to every record just before it is saved (Store.saveMany → Store.normalize). */
'use strict';

Object.assign(Store, {
  normalize(r) {
    // a quick win accepted without a QW ID gets the next one, however it was approved (form, button, import)
    if (r.c === 'quickwin' && !r._del && U.lc(r.approval) === 'accepted' && !r.qwId && typeof nextQwId === 'function') {
      const qwId = nextQwId();
      (nextQwId.taken = nextQwId.taken || []).push({ qwId });
      return Object.assign({}, r, { qwId });
    }
    return r;
  },
});
