/* DARRIK — Date helpers. Dates are stored as local "YYYY-MM-DD" (or "YYYY-MM-DDTHH:MM") strings. */
'use strict';

Object.assign(U, {
  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  },
  nowStr() {
    const d = new Date();
    return `${U.todayStr()}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  },
  // parse 'YYYY-MM-DD' (or with time) as a LOCAL date
  pd(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  },
  ds(d) {
    return d ? `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}` : '';
  },
  addDays(s, n) {
    const d = U.pd(s);
    if (!d) return '';
    d.setDate(d.getDate() + (+n || 0));
    return U.ds(d);
  },
  diffDays(a, b) {
    // b - a in whole days
    const x = U.pd(a),
      y = U.pd(b);
    if (!x || !y) return null;
    return Math.round(
      (Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5
    );
  },
  year(s) {
    return s ? +s.slice(0, 4) : null;
  },
  month(s) {
    return s ? +s.slice(5, 7) : null;
  },
  MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fmtDate(s) {
    if (!s) return '';
    const d = U.pd(s);
    return d ? `${U.pad(d.getDate())}-${U.MONTHS[d.getMonth()]}-${d.getFullYear()}` : s;
  },
  fmtDT(s) {
    if (!s) return '';
    const d = U.pd(s);
    return d ? `${U.fmtDate(s)} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}` : s;
  },
  fmtTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${U.fmtDate(U.ds(d))} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  },
  /* a day off: Fri/Sat or a public holiday (Admin → Teams & departments → Public holidays) */
  isOff(s) {
    return U.isWeekend(s) || !!(typeof Store !== 'undefined' && Store.holidayOf && Store.holidayOf(s));
  },
  isWeekend(s) {
    const d = U.pd(s);
    if (!d) return false;
    return (typeof Custom !== 'undefined' ? Custom.weekend() : [5, 6]).includes(d.getDay());
  }, // Fri/Sat unless changed in Admin → Customize
});
