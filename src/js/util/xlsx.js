/* MAHAM — Minimal Excel (.xlsx) reader / writer on top of JSZip — no internet, no other libraries. */
'use strict';

/* ---------------- minimal XLSX read/write (JSZip) ---------------- */
const XL = {
  colIdx(ref) {
    const m = /^([A-Z]+)/.exec(ref);
    let n = 0;
    for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  },
  async read(file) {
    return XL.readZip(await JSZip.loadAsync(file), () => true);
  },
  /* want(sheetName) -> parse this sheet? Unwanted sheets come back with rows: null (never unpacked). */
  async readZip(zip, want) {
    const txt = async p => {
      const f = zip.file(p);
      return f ? f.async('string') : null;
    };
    const P = s => new DOMParser().parseFromString(s, 'application/xml');
    const wb = P(await txt('xl/workbook.xml'));
    const rels = P(await txt('xl/_rels/workbook.xml.rels'));
    const sheets = [...wb.getElementsByTagName('sheet')];
    const relMap = {};
    for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const ss = [];
    const sst = await txt('xl/sharedStrings.xml');
    if (sst)
      for (const si of P(sst).getElementsByTagName('si')) ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    const out = [];
    for (const sh of sheets) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid] || '';
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target;
      if (!want(sh.getAttribute('name'))) {
        out.push({ name: sh.getAttribute('name'), rows: null });
        continue;
      }
      const xml = await txt(target);
      if (!xml) continue;
      const doc = P(xml);
      const rows = [];
      for (const row of doc.getElementsByTagName('row')) {
        const ri = +row.getAttribute('r') - 1;
        const arr = [];
        for (const c of row.getElementsByTagName('c')) {
          const ci = XL.colIdx(c.getAttribute('r'));
          const t = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0];
          let val = v ? v.textContent : null;
          if (t === 's') val = ss[+val];
          else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else if (t === 'b') val = val === '1';
          else if (t === 'str' || t === 'e') {
            /* text */
          } else if (val != null && val !== '') val = +val;
          arr[ci] = val;
        }
        rows[ri] = arr;
      }
      out.push({ name: sh.getAttribute('name'), rows: Array.from(rows, r => r || []) });
    }
    return out;
  },
  serialToDT(n) {
    // Excel serial -> 'YYYY-MM-DDTHH:MM'
    const ms = Math.round((n - 25569) * 864e5);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${U.pad(d.getUTCMonth() + 1)}-${U.pad(d.getUTCDate())}T${U.pad(d.getUTCHours())}:${U.pad(d.getUTCMinutes())}`;
  },
  /* eslint-disable no-control-regex -- strips characters that are not allowed in XML */
  esc(s) {
    return String(s)
      .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  },
  /* eslint-enable no-control-regex */
  colName(i) {
    let s = '';
    i++;
    while (i) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  },
  /* sheets: [{name, rows: [[...]]}] -> Blob */
  async write(sheets) {
    const zip = new JSZip();
    const names = sheets.map((s, i) => (s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    );
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${XL.esc(n).replace(/"/g, '&quot;')}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    );
    zip.file(
      'xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E4A6B"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`
    );
    sheets.forEach((s, i) => {
      const rows = s.rows
        .map(
          (r, ri) =>
            `<row r="${ri + 1}">${r
              .map((v, ci) => {
                if (v == null || v === '') return '';
                const ref = XL.colName(ci) + (ri + 1);
                const st = ri === 0 ? ' s="1"' : '';
                if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
                return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${XL.esc(v)}</t></is></c>`;
              })
              .join('')}</row>`
        )
        .join('');
      const widths = (s.rows[0] || []).map((_, ci) =>
        Math.min(60, Math.max(8, ...s.rows.slice(0, 200).map(r => String(r[ci] == null ? '' : r[ci]).length + 2)))
      );
      zip.file(
        `xl/worksheets/sheet${i + 1}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths.length ? `<cols>${widths.map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData>${s.rows.length > 1 ? `<autoFilter ref="A1:${XL.colName(Math.max(0, (s.rows[0] || []).length - 1))}${s.rows.length}"/>` : ''}</worksheet>`
      );
    });
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      compression: 'DEFLATE',
    });
  },
  download(blob, name) {
    if (typeof Admin !== 'undefined' && Admin.fn)
      try {
        Admin.fn('excel:export');
      } catch (e) {
        /* usage only */
      }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
};
