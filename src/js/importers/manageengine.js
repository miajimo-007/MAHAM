/* DARRIK — ManageEngine "daily details report" import: column names, date and elapsed-time parsing. */
'use strict';

/* ---------- ManageEngine import ---------- */
const HD_COLS = [
  { key: 'reqId', label: 'Request ID', names: ['request id', 'requestid', 'id', 'request no', 'request number'] },
  { key: 'requester', label: 'Requester', names: ['requester', 'requester name', 'requested by'] },
  { key: 'subject', label: 'Subject', names: ['subject', 'title'] },
  { key: 'department', label: 'Department', names: ['department', 'dept'] },
  { key: 'status', label: 'Request Status', names: ['request status', 'status'] },
  { key: 'group', label: 'Group', names: ['group', 'support group'] },
  { key: 'technician', label: 'Technician', names: ['technician', 'assigned technician', 'technician name'] },
  { key: 'created', label: 'Created Time', names: ['created time', 'created date', 'created on', 'created'] },
  { key: 'resolved', label: 'Resolved Time', names: ['resolved time', 'resolved date', 'completed time', 'resolved'] },
  { key: 'elapsedHrs', label: 'Time Elapsed', names: ['time elapsed', 'elapsed time', 'time spent'] },
];

function parseDT(v, order) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return XL.serialToDT(v);
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || /not assigned|^-$/i.test(s)) return '';
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // ManageEngine report style: "Oct 11, 2026 10:12 AM" or "11 Oct 2026 10:12 AM"
  let m =
    /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:,? (\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/.exec(s) ||
    (x => x && [x[0], x[2], x[1], x[3], x[4], x[5], x[6]])(
      /^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})(?:,? (\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/.exec(s)
    );
  if (m && MON[m[1].toLowerCase()]) {
    let hh = m[4] ? +m[4] : 0;
    const mm = m[5] ? +m[5] : 0;
    if (m[6]) {
      const pm = /p/i.test(m[6]);
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
    return `${m[3]}-${U.pad(MON[m[1].toLowerCase()])}-${U.pad(m[2])}T${U.pad(hh)}:${U.pad(mm)}`;
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(\d{1,2})?:?(\d{2})?/.exec(s);
  if (m) return `${m[1]}-${U.pad(m[2])}-${U.pad(m[3])}T${U.pad(m[4] || 0)}:${U.pad(m[5] || 0)}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/.exec(s);
  if (m) {
    const a = +m[1],
      b = +m[2];
    let yy = +m[3];
    if (yy < 100) yy += 2000;
    let day, mon;
    if (order === 'mdy') {
      mon = a;
      day = b;
    } else {
      day = a;
      mon = b;
    }
    let hh = m[4] ? +m[4] : 0;
    const mm = m[5] ? +m[5] : 0;
    if (m[6]) {
      const pm = /p/i.test(m[6]);
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
    return `${yy}-${U.pad(mon)}-${U.pad(day)}T${U.pad(hh)}:${U.pad(mm)}`;
  }
  const d = new Date(s.replace(/(\d)(AM|PM)/i, '$1 $2'));
  if (!isNaN(d))
    return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  return '';
}

function parseElapsed(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 30 ? v * 24 : v / 3600000; // Excel day-fraction, else milliseconds
  const s = String(v).trim();
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (m) return +m[1] + +m[2] / 60 + +(m[3] || 0) / 3600;
  let hrs = 0,
    hit = false;
  for (const [re, f] of [
    [/(\d+(?:\.\d+)?)\s*d(?:ay)?s?/i, 24],
    [/(\d+(?:\.\d+)?)\s*h(?:ou)?r?s?/i, 1],
    [/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i, 1 / 60],
    [/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i, 1 / 3600],
  ]) {
    const x = re.exec(s);
    if (x) {
      hrs += +x[1] * f;
      hit = true;
    }
  }
  if (hit) return hrs;
  return isNaN(+s) ? null : +s;
}
