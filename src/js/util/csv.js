/* DARRIK — CSV / TSV parser for pasted rows and .csv exports. */
'use strict';

/* CSV / TSV parser (for pasted data or .csv exports) */
function parseDelimited(text) {
  const delim = (text.split('\n')[0].match(/\t/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [],
    cur = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"' && cur === '') {
      q = true;
      continue;
    }
    if (ch === delim) {
      row.push(cur);
      cur = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
