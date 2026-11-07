/* MAHAM — Help desk month lock. ManageEngine exports only the last 6 months, so older months must not be
 * touched by an import (their KPIs are already reported). A request belongs to the month it was CREATED.
 *   open months  the current month and the ones before it, `hdOpen` in all (Admin → Customize; default 3)
 *   by hand      the admin can lock or unlock ANY month (e.g. lock a recent month once it is reported)
 * In a locked month: new rows are skipped; a request the app still has OPEN may only be closed (status, resolved
 * date, elapsed hours) — nothing else changes; editing by hand is not possible; a request missing from the export is
 * kept. In an open month a request missing from the export (transferred to another team / deleted) is removed.
 * Every lock / unlock is recorded. */
'use strict';

const HDLock = {
  DEF_OPEN: 3,
  openCount() {
    const n = +Custom.get('hdOpen', HDLock.DEF_OPEN);
    return n > 0 ? Math.min(60, Math.round(n)) : HDLock.DEF_OPEN;
  },
  unlocked() {
    const l = Custom.get('hdUnlocked', []);
    return Array.isArray(l) ? l : [];
  },
  lockedByHand() {
    const l = Custom.get('hdLocked', []);
    return Array.isArray(l) ? l : [];
  },
  autoLocked(ym) {
    return ym < HDLock.firstOpen();
  },
  ym(d) {
    return U.ds(d).slice(0, 7);
  },
  firstOpen() {
    const d = new Date();
    return HDLock.ym(new Date(d.getFullYear(), d.getMonth() - (HDLock.openCount() - 1), 1));
  },
  monthOf(r) {
    return String((r && r.created) || '').slice(0, 7);
  },
  isLocked(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return false;
    if (HDLock.lockedByHand().includes(ym)) return true;
    return HDLock.autoLocked(ym) && !HDLock.unlocked().includes(ym);
  },
  locked(r) {
    return HDLock.isLocked(HDLock.monthOf(r));
  },
  CLOSE_KEYS: ['status', 'resolved', 'elapsedHrs'],
  /* what an import may save for one row: { rec, kind: 'new'|'changed'|'closed'|'locked' } (rec null = skip) */
  forImport(cur, next) {
    if (!HDLock.locked(next) && !(cur && HDLock.locked(cur))) return { rec: next, kind: cur ? 'changed' : 'new' };
    if (cur && !Calc.isClosed(cur.status) && Calc.isClosed(next.status)) {
      const o = Object.assign({}, cur);
      for (const k of HDLock.CLOSE_KEYS) o[k] = next[k];
      return { rec: o, kind: 'closed' };
    }
    return { rec: null, kind: 'locked' };
  },
  /* the last 12 months for the admin grid */
  months(n = 12) {
    const d = new Date();
    const out = [];
    for (let i = 0; i < n; i++) out.push(HDLock.ym(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    return out;
  },
  label(ym) {
    return U.MONTHS[+ym.slice(5, 7) - 1].slice(0, 3) + ' ' + ym.slice(0, 4);
  },
  log() {
    const l = Custom.get('hdLockLog', []);
    return Array.isArray(l) ? l : [];
  },
  /* lock (open = false) or unlock (open = true) one month by hand */
  setUnlocked(ym, open) {
    const un = HDLock.unlocked().filter(x => x !== ym),
      lk = HDLock.lockedByHand().filter(x => x !== ym);
    if (open && HDLock.autoLocked(ym)) un.push(ym);
    if (!open && !HDLock.autoLocked(ym)) lk.push(ym);
    Custom.save(
      {
        hdUnlocked: un.sort(),
        hdLocked: lk.sort(),
        hdLockLog: [{ at: Date.now(), by: App.me, what: (open ? 'Unlocked ' : 'Locked ') + HDLock.label(ym) }, ...HDLock.log()].slice(
          0,
          60
        ),
      },
      (open ? '🔓 ' : '🔒 ') +
        HDLock.label(ym) +
        (open ? ' unlocked — the import may change it, and removes its requests that are no longer in the export' : ' locked')
    );
  },
  setOpenCount(n) {
    n = Math.max(1, Math.min(60, Math.round(+n || HDLock.DEF_OPEN)));
    Custom.save(
      { hdOpen: n, hdLockLog: [{ at: Date.now(), by: App.me, what: `Open months set to ${n}` }, ...HDLock.log()].slice(0, 60) },
      `The last ${n} month${n === 1 ? '' : 's'} stay open`
    );
  },
  /* Admin → Customize box */
  adminBox() {
    const ms = HDLock.months();
    const fo = HDLock.firstOpen();
    return `<p class="muted small">ManageEngine exports only the last 6 months. A request belongs to the month it was <b>created</b>.<br>
      🔒 <b>Locked</b>: the import does not change it, and requests missing from the Excel are <b>kept</b> — its numbers and KPIs stay as reported (only exception: a request still open in the app may be closed — status, resolved date and hours).<br>
      🔓 <b>Open</b>: the import adds and updates, and requests missing from the Excel (transferred to another team or deleted in ManageEngine) are <b>removed</b>. Lock or unlock any month with its button.</p>
      <div class="row-btns"><label class="flt"><span>Months open automatically (this month and before)</span><input type="number" min="1" max="60" id="hdopen" value="${HDLock.openCount()}" style="width:80px"></label><button class="btn sm" id="hdopensave">Save</button></div>
      <div class="hdl-grid">${ms
        .map(m => {
          const lk = HDLock.isLocked(m);
          const hand = HDLock.lockedByHand().includes(m) || HDLock.unlocked().includes(m);
          return `<div class="hdl ${lk ? 'lock' : hand ? 'unl' : 'open'}"><b>${HDLock.label(m)}</b><span class="small">${lk ? '🔒 locked' : '🔓 open'}${hand ? ' (by hand)' : ''}</span><button class="btn xs ${lk ? 'ghost' : ''}" data-hdl="${m}|${lk ? 1 : 0}">${lk ? 'Unlock' : 'Lock'}</button></div>`;
        })
        .join('')}</div>
      ${
        HDLock.log().length
          ? `<details class="small"><summary>History (${HDLock.log().length})</summary>${HDLock.log()
              .map(
                e =>
                  `<div>${(d => U.fmtDate(U.ds(d)) + ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()))(new Date(e.at))} · ${h(Store.memberShort(e.by))} · ${h(e.what)}</div>`
              )
              .join('')}</details>`
          : ''
      }`;
  },
  bindAdmin(root) {
    const s = root.querySelector('#hdopensave');
    if (s)
      s.onclick = () => {
        HDLock.setOpenCount(root.querySelector('#hdopen').value);
        App.render();
      };
    root.querySelectorAll('[data-hdl]').forEach(
      b =>
        (b.onclick = () => {
          const [m, o] = b.dataset.hdl.split('|');
          HDLock.setUnlocked(m, o === '1');
          App.render();
        })
    );
  },
};
