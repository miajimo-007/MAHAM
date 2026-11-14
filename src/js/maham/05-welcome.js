/* MAHAM — a new person starts clean: "✨ What's new" lists changes since the version someone last saw, which means
 * nothing to a customer who has just joined. Someone who has never seen any version on this PC and has no work older
 * than a day is new: every version counts as seen (online companies only). People who already use MAHAM keep getting
 * What's new as before. */
'use strict';

(() => {
  if (typeof WhatsNew === 'undefined' || !WhatsNew.auto) return;
  const auto0 = WhatsNew.auto;
  WhatsNew.auto = function () {
    try {
      if (Store.storageMode === 'cloud' && App.me && !App.preview && !LS.get(WhatsNew.key(), '')) {
        // online companies (new customers); a shared folder or this device keeps What's new as before
        const dayAgo = Date.now() - 864e5;
        const old = Object.values(Store.own || {}).some(r => r && (r._ts || 0) > 1 && r._ts < dayAgo);
        if (!old) {
          LS.set(WhatsNew.key(), APP_VERSION);
          return;
        }
      }
    } catch (e) {
      /* fall back to the usual */
    }
    return auto0.apply(this, arguments);
  };
})();
