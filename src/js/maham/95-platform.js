/* MAHAM — platform: 🕌 Hijri dates, العربية (Arabic, right to left), sign in with Microsoft / Google (online),
 * ⬆ import from CSV (contacts, companies, assets, vendors, tickets, project tasks from Jira / Trello), 🎯 goals (OKRs).
 * Hijri and the language are each person's choice, kept on this PC (Account: the menu → your name). */
'use strict';

const PLAT = {
  pref(k, d) {
    try {
      const v = localStorage.getItem(`maham.${k}.${App.me || ''}`);
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  },
  setPref(k, v) {
    try {
      localStorage.setItem(`maham.${k}.${App.me || ''}`, v);
    } catch (e) {
      /* private window */
    }
  },
  /* ---------- 🕌 Hijri (Umm al-Qura) next to every date ---------- */
  hijri(s) {
    try {
      const d = U.pd(s);
      return d ? new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '';
    } catch (e) {
      return '';
    }
  },
  /* ---------- العربية: the words people see most, and right-to-left ---------- */
  AR: {
    'Analyst Desk': 'مكتب المحلل',
    'Manager Desk': 'مكتب المدير',
    'Director Desk': 'مكتب المدير التنفيذي',
    WorkList: 'قائمة العمل',
    'To Do List': 'المهام',
    'Personal tasks': 'المهام الشخصية',
    'Shadow work': 'العمل الإضافي',
    'IT Help Desk': 'مكتب الدعم',
    Projects: 'المشاريع',
    Tracking: 'المتابعة',
    'Quick wins': 'المكاسب السريعة',
    'External Follow-up': 'المتابعة الخارجية',
    'Good Catch': 'ملاحظة جيدة',
    'Team & Time': 'الفريق والوقت',
    'Requests & Approvals': 'الطلبات والموافقات',
    Attendance: 'الحضور',
    Meetings: 'الاجتماعات',
    Announcements: 'الإعلانات',
    Performance: 'الأداء',
    Reports: 'التقارير',
    Reference: 'المراجع',
    'Knowledge base': 'قاعدة المعرفة',
    Directory: 'الدليل',
    Courses: 'الدورات',
    Connect: 'التواصل',
    Chat: 'المحادثة',
    Service: 'الخدمة',
    Tickets: 'التذاكر',
    Timesheet: 'سجل الوقت',
    Sales: 'المبيعات',
    Marketing: 'التسويق',
    AI: 'الذكاء الاصطناعي',
    'AI connections': 'اتصالات الذكاء الاصطناعي',
    Operations: 'العمليات',
    Quality: 'الجودة',
    Procurement: 'المشتريات',
    Workplace: 'بيئة العمل',
    Assets: 'الأصول',
    Bookings: 'الحجوزات',
    Documents: 'المستندات',
    HR: 'الموارد البشرية',
    Learning: 'التعلم',
    Expenses: 'المصروفات',
    Goals: 'الأهداف',
    Import: 'الاستيراد',
    Admin: 'الإدارة',
    Feedback: 'الملاحظات',
    Save: 'حفظ',
    Cancel: 'إلغاء',
    Close: 'إغلاق',
    Delete: 'حذف',
    Edit: 'تعديل',
    Add: 'إضافة',
    Search: 'بحث',
    '＋ New': '＋ جديد',
    '🔎 Search': '🔎 بحث',
    Send: 'إرسال',
    Approve: 'موافقة',
    Reject: 'رفض',
    Status: 'الحالة',
    Priority: 'الأولوية',
    Due: 'الاستحقاق',
    Owner: 'المالك',
    'Assigned to': 'مسند إلى',
    Date: 'التاريخ',
    Team: 'الفريق',
    Done: 'منجز',
    Open: 'مفتوح',
    'In Progress': 'قيد التنفيذ',
    'For you': 'لك',
    'Mark all read': 'تعليم الكل كمقروء',
    Refresh: 'تحديث',
    Saved: 'تم الحفظ',
    Settings: 'الإعدادات',
    Excel: 'إكسل',
    Pipeline: 'مسار الصفقات',
    Deals: 'الصفقات',
    Contacts: 'جهات الاتصال',
    Companies: 'الشركات',
  },
  ar() {
    return PLAT.pref('lang', 'en') === 'ar';
  },
  translate(root) {
    if (!PLAT.ar() || !root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n =>
        n.parentElement && !n.parentElement.closest('input,textarea,script,style,.ch-text,.tk-desc,.ai-msg,code')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const list = [];
    while (walk.nextNode()) list.push(walk.currentNode);
    for (const n of list) {
      const t = n.nodeValue.trim();
      const ar = t && PLAT.AR[t];
      if (ar) n.nodeValue = n.nodeValue.replace(t, ar);
    }
    root.querySelectorAll('input[placeholder], button[title], a[title]').forEach(e => {
      for (const a of ['placeholder', 'title']) {
        const v = e.getAttribute(a);
        if (v && PLAT.AR[v]) e.setAttribute(a, PLAT.AR[v]);
      }
    });
  },
  applyLang() {
    const ar = PLAT.ar();
    document.documentElement.lang = ar ? 'ar' : 'en';
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('lang-ar', ar);
    if (ar) PLAT.translate(document.getElementById('app') || document.body);
  },

  /* ---------- ⬆ import from CSV ---------- */
  TARGETS: {
    contact: {
      label: 'Contacts',
      fields: [
        ['name', /^(full ?)?name$|^contact/i],
        ['email', /mail/i],
        ['phone', /phone|mobile|tel/i],
        ['title', /title|position|job/i],
        ['company', /company|account|organi[sz]ation/i],
        ['tags', /tags?|labels?/i],
      ],
    },
    account: {
      label: 'Companies',
      fields: [
        ['name', /^(company|account|organi[sz]ation)?\s*name$|^company$|^account$/i],
        ['industry', /industry|sector/i],
        ['city', /city|location/i],
        ['website', /web|url/i],
        ['phone', /phone/i],
      ],
    },
    asset: {
      label: 'Assets',
      fields: [
        ['name', /name|asset|description/i],
        ['kind', /kind|type|category/i],
        ['serial', /serial/i],
        ['location', /location|where|room/i],
        ['bought', /bought|purchase/i],
        ['warranty', /warranty/i],
        ['value', /value|cost|price/i],
      ],
    },
    vendor: {
      label: 'Vendors',
      fields: [
        ['name', /name|vendor|supplier/i],
        ['category', /category|type/i],
        ['contact', /contact/i],
        ['email', /mail/i],
        ['phone', /phone/i],
      ],
    },
    ticket: {
      label: 'Tickets',
      fields: [
        ['subject', /subject|summary|title/i],
        ['desc', /desc|details|body/i],
        ['priority', /priority/i],
        ['status', /status|state/i],
        ['category', /category|type/i],
        ['email', /mail|requester/i],
      ],
    },
    ptask: {
      label: 'Project tasks (Jira / Trello / Asana CSV)',
      fields: [
        ['title', /^summary$|^title$|^name$|card name|task name/i],
        ['status', /^status$|^list( name)?$|^section/i],
        ['key', /issue key|^key$|card id/i],
        ['assigneeName', /assignee|members?/i],
        ['due', /due/i],
        ['description', /description|desc/i],
        ['points', /story points|points|estimate/i],
      ],
    },
  },
  guess(target, headers) {
    const m = {};
    for (const [k, re] of PLAT.TARGETS[target].fields) {
      const i = headers.findIndex(x => re.test(String(x).trim()));
      if (i >= 0 && !Object.values(m).includes(i)) m[k] = i;
    }
    return m;
  },
  norm(v) {
    return U.lc(String(v || '')).replace(/[^a-z0-9؀-ۿ]/g, '');
  }, // a name as exports spell it: no spaces, hyphens, dots or case
  flip(n) {
    const m = /^([^,]+),\s*(.+)$/.exec(String(n || ''));
    return m ? m[2] + ' ' + m[1] : '';
  }, // "ALGHAMDI, NORA" → "NORA ALGHAMDI"
  dateOf(v) {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? '' : U.ds(d);
  },
  build(target, rows, map, opt) {
    const g = (r, k) => (map[k] != null ? String(r[map[k]] == null ? '' : r[map[k]]).trim() : '');
    const out = [];
    const today = U.todayStr();
    for (const r of rows) {
      const base = { id: Maham.uid(target), c: target, importedAt: Date.now() };
      if (target === 'contact') {
        if (!g(r, 'name')) continue;
        const acc =
          g(r, 'company') &&
          (Store.all('account', '*').find(a => U.lc(a.name) === U.lc(g(r, 'company'))) ||
            out.find(a => a.c === 'account' && U.lc(a.name) === U.lc(g(r, 'company'))));
        let accId = acc ? acc.id : '';
        if (!acc && g(r, 'company')) {
          const a = { id: Maham.uid('account'), c: 'account', name: g(r, 'company'), owner: App.me };
          out.push(a);
          accId = a.id;
        }
        out.push(
          Object.assign(base, {
            name: g(r, 'name'),
            email: g(r, 'email').toLowerCase(),
            phone: g(r, 'phone'),
            title: g(r, 'title'),
            account: accId,
            tags: g(r, 'tags')
              ? g(r, 'tags')
                  .split(/[;,]/)
                  .map(x => x.trim())
                  .filter(Boolean)
              : [],
            owner: App.me,
          })
        );
      } else if (target === 'account') {
        if (g(r, 'name'))
          out.push(
            Object.assign(base, {
              name: g(r, 'name'),
              industry: g(r, 'industry'),
              city: g(r, 'city'),
              website: g(r, 'website'),
              phone: g(r, 'phone'),
              owner: App.me,
            })
          );
      } else if (target === 'asset') {
        if (g(r, 'name'))
          out.push(
            Object.assign(base, {
              no: WP.next('asset'),
              name: g(r, 'name'),
              kind: g(r, 'kind'),
              serial: g(r, 'serial'),
              location: g(r, 'location'),
              bought: PLAT.dateOf(g(r, 'bought')),
              warranty: PLAT.dateOf(g(r, 'warranty')),
              value: +g(r, 'value').replace(/[^\d.]/g, '') || 0,
              status: 'In use',
              owner: App.me,
            })
          );
      } else if (target === 'vendor') {
        if (g(r, 'name'))
          out.push(
            Object.assign(base, {
              name: g(r, 'name'),
              category: g(r, 'category'),
              contact: g(r, 'contact'),
              email: g(r, 'email'),
              phone: g(r, 'phone'),
            })
          );
      } else if (target === 'ticket') {
        if (!g(r, 'subject')) continue;
        const pri = TK.PRI.find(p => U.lc(p) === U.lc(g(r, 'priority'))) || 'Normal';
        const st = TK.ST.find(p => U.lc(p) === U.lc(g(r, 'status'))) || 'Open';
        out.push(
          Object.assign(base, {
            no: TK.nextNo(),
            subject: g(r, 'subject'),
            desc: g(r, 'desc'),
            priority: pri,
            status: st,
            category: g(r, 'category'),
            channel: 'import',
            created: Date.now(),
            requester: '',
            cust: g(r, 'email') ? { name: '', email: g(r, 'email') } : undefined,
            token: Maham.uid('t').slice(-12) + Math.random().toString(36).slice(2, 10),
          })
        );
      } else if (target === 'ptask') {
        if (!g(r, 'title') || !opt.project) continue;
        const who = PLAT.norm(g(r, 'assigneeName'));
        const m =
          who && Store.members().find(x => [x.name, x.short, x.id, x.email, PLAT.flip(x.name)].some(v => v && PLAT.norm(v) === who)); // "Nora Al-Ghamdi" = "Nora Al Ghamdi"
        const cols = Scrum.columns(Store.get(opt.project));
        const st =
          cols.find(cn => U.lc(cn) === U.lc(g(r, 'status'))) ||
          (/done|closed|complete/i.test(g(r, 'status')) ? cols[cols.length - 1] : cols[0]);
        out.push(
          Object.assign(base, {
            project: opt.project,
            team: (Store.get(opt.project) || {}).team,
            title: g(r, 'title'),
            status: st,
            assignee: m ? m.id : '',
            due: PLAT.dateOf(g(r, 'due')),
            description: [g(r, 'description'), g(r, 'key') ? 'Imported from ' + g(r, 'key') : ''].filter(Boolean).join('\n'),
            points: +g(r, 'points') || 1,
            created: today,
          })
        );
      }
    }
    return out;
  },
  importPage() {
    return {
      title: 'Import',
      html: card(
        '⬆ Import from a CSV file',
        `<p class="muted small">Export from your old system (Excel → Save as CSV, Jira → Export → CSV, Trello → Export → CSV, HubSpot, Freshdesk …), pick what it is, check the matching, import. Nothing is saved before you press Import.</p>
        <div class="grid-form"><label class="fld"><span>What is in the file</span>${CRM.sel(
          'imt',
          Object.entries(PLAT.TARGETS).map(([k, v]) => [k, v.label]),
          'contact'
        )}</label>
        <label class="fld" id="impw" hidden><span>Into project</span>${CRM.sel(
          'imp',
          Store.all('project', '*')
            .filter(p => !['Done', 'Canceled'].includes(p.status))
            .map(p => [p.id, p.name]),
          '',
          '— choose —'
        )}</label>
        <label class="fld span2"><span>CSV file</span><input type="file" id="imf" accept=".csv,.tsv,.txt"></label></div><div id="imout"></div>`
      ),
      mount(root) {
        const t = root.querySelector('#imt');
        const sync = () => {
          root.querySelector('#impw').hidden = t.value !== 'ptask';
        };
        t.onchange = () => {
          sync();
          root.querySelector('#imout').innerHTML = '';
          root.querySelector('#imf').value = '';
        };
        sync();
        root.querySelector('#imf').onchange = async e => {
          const f = e.target.files[0];
          if (!f) return;
          const rows = parseDelimited((await f.text()).replace(new RegExp('^' + String.fromCharCode(0xfeff)), '')).filter(r =>
            r.some(x => String(x).trim())
          );
          if (rows.length < 2) {
            root.querySelector('#imout').innerHTML = '<p class="t-bad">The file has no rows.</p>';
            return;
          }
          const head = rows[0];
          const body = rows.slice(1);
          const target = t.value;
          const map = PLAT.guess(target, head);
          const out = root.querySelector('#imout');
          out.innerHTML = `<h4>Matching — ${body.length} rows</h4><table class="tbl"><tbody>${PLAT.TARGETS[target].fields.map(([k]) => `<tr><td>${h(k)}</td><td><select data-imk="${k}"><option value="">— not in the file —</option>${head.map((x, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${h(x)}</option>`).join('')}</select></td><td class="muted small">${h(map[k] != null ? String(body[0][map[k]] || '').slice(0, 40) : '')}</td></tr>`).join('')}</tbody></table>
            <div class="row-btns"><span class="grow"></span><button class="btn primary" id="imgo">Import ${body.length} rows</button></div>`;
          out.querySelector('#imgo').onclick = () => {
            const m = {};
            out.querySelectorAll('[data-imk]').forEach(s => {
              if (s.value !== '') m[s.dataset.imk] = +s.value;
            });
            const project = root.querySelector('#imp').value;
            if (target === 'ptask' && !project) return UI.toast('Choose the project', 'bad');
            const recs = PLAT.build(target, body, m, { project });
            if (!recs.length) return UI.toast('Nothing to import — check the matching', 'bad');
            Store.saveMany(recs);
            out.innerHTML = `<div class="insights goodbox"><div>✓ Imported ${recs.filter(r => r.c === target).length} ${h(PLAT.TARGETS[target].label.toLowerCase())}${recs.length > recs.filter(r => r.c === target).length ? ` (and ${recs.length - recs.filter(r => r.c === target).length} new companies)` : ''}.</div></div>`;
            UI.toast('Imported', 'good');
          };
        };
      },
    };
  },

  /* ---------- 🎯 goals (OKRs) ---------- */
  KR_LINKS: [
    ['', 'I update it by hand'],
    ['deals-won', 'Won deal value (this year)'],
    ['tickets-resolved', 'Tickets resolved (this year)'],
    ['project', "A project's progress (%)"],
    ['csat', 'Average satisfaction (1–5)'],
  ],
  krNow(k) {
    const y = U.todayStr().slice(0, 4);
    try {
      if (k.link === 'deals-won')
        return CRM.all('deal')
          .filter(d => d.status === 'won' && d.wonAt && U.ds(new Date(d.wonAt)).startsWith(y))
          .reduce((n, d) => n + (+d.value || 0), 0);
      if (k.link === 'tickets-resolved') return TK.all().filter(t => t.resolvedAt && U.ds(new Date(t.resolvedAt)).startsWith(y)).length;
      if (k.link === 'project') {
        const p = Store.get(k.project);
        return p ? Scrum.progress(p) : 0;
      }
      if (k.link === 'csat') {
        const c = TK.all()
          .filter(t => t.csat)
          .map(t => t.csat.score);
        return c.length ? Math.round((c.reduce((a, b) => a + b, 0) / c.length) * 10) / 10 : 0;
      }
    } catch (e) {
      return 0;
    }
    return +k.current || 0;
  },
  krPct(k) {
    const t = +k.target || 0;
    return t ? Math.max(0, Math.min(100, Math.round((PLAT.krNow(k) / t) * 100))) : 0;
  },
  goals() {
    const list = Store.all('okr', '*');
    const can = App.isSuper() || App.isMgr();
    const one = o => {
      const krs = o.krs || [];
      const pct = krs.length ? Math.round(krs.reduce((n, k) => n + PLAT.krPct(k), 0) / krs.length) : 0;
      return card(
        `🎯 ${h(o.title)} <span class="muted small">· ${h(o.period || '')} · ${h(Store.memberShort(o.owner) || '')}</span>`,
        `<div class="okr-bar"><span style="width:${pct}%"></span></div><p class="small"><b>${pct}%</b></p>
        ${krs.map(k => `<div class="li"><div class="grow">${h(k.title)} <span class="muted small">— ${U.num(PLAT.krNow(k), 0)} of ${U.num(+k.target || 0, 0)}${k.link ? ' (live)' : ''}</span><div class="okr-bar sm"><span style="width:${PLAT.krPct(k)}%"></span></div></div>${!k.link && (can || o.owner === App.me) ? `<input type="number" class="okr-cur" data-okr="${h(o.id)}|${h(k.id)}" value="${+k.current || 0}" style="width:90px" aria-label="Now">` : ''}</div>`).join('')}`,
        can || o.owner === App.me ? `<a href="#" class="link small" data-okred="${h(o.id)}">Edit</a>` : ''
      );
    };
    return {
      title: 'Goals',
      html: `<div class="page-actions"><span class="muted small">Objectives with key results. A result can follow real numbers (deals won, tickets resolved, a project's progress, satisfaction).</span><span class="grow"></span>${can ? '<button class="btn primary" id="okrnew">＋ Objective</button>' : ''}</div>${list.map(one).join('') || '<div class="oneline">No goals yet.</div>'}`,
      mount(root) {
        const n = root.querySelector('#okrnew');
        if (n) n.onclick = () => PLAT.editOkr({ c: 'okr', id: Maham.uid('okr'), owner: App.me, period: U.todayStr().slice(0, 4), krs: [] });
        root.querySelectorAll('[data-okred]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              PLAT.editOkr(Store.get(a.dataset.okred));
            })
        );
        root.querySelectorAll('.okr-cur').forEach(i => {
          i.addEventListener('keydown', e => e.stopPropagation());
          i.onchange = () => {
            const [oid, kid] = i.dataset.okr.split('|');
            const o = Store.get(oid);
            Store.save(
              Object.assign({}, o, { krs: (o.krs || []).map(k => (k.id === kid ? Object.assign({}, k, { current: +i.value || 0 }) : k)) })
            );
            App.render();
          };
        });
      },
    };
  },
  editOkr(o) {
    const kr = (k, i) =>
      `<tr data-kr="${i}"><td><input class="kr-t" value="${h(k.title || '')}" placeholder="Key result"></td><td>${CRM.sel('', PLAT.KR_LINKS, k.link || '').replace('<select id=""', '<select class="kr-l"')}</td><td>${CRM.sel(
        '',
        Store.all('project', '*').map(p => [p.id, p.name]),
        k.project || '',
        '—'
      ).replace(
        '<select id=""',
        '<select class="kr-p"'
      )}</td><td><input class="kr-g" type="number" value="${+k.target || 0}" style="width:100px"></td><input type="hidden" class="kr-id" value="${h(k.id || '')}"><input type="hidden" class="kr-c" value="${+k.current || 0}"></tr>`;
    UI.modal({
      title: 'Objective',
      wide: true,
      body: `<div class="grid-form"><label class="fld span2"><span>Objective</span><input id="okt" value="${h(o.title || '')}"></label><label class="fld"><span>Period</span><input id="okp" value="${h(o.period || '')}"></label><label class="fld"><span>Owner</span>${CRM.sel(
        'oko',
        Maham.people().map(p => [p.id, p.name]),
        o.owner
      )}</label></div>
        <table class="tbl"><thead><tr><th>Key result</th><th>Measured by</th><th>Project</th><th>Target</th></tr></thead><tbody id="okrs">${[...(o.krs || []), {}].map(kr).join('')}</tbody></table><button class="btn sm" id="okadd">＋ Key result</button>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        const kd = () => w.querySelectorAll('input').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        kd();
        w.querySelector('#okadd').onclick = () => {
          const tb = w.querySelector('#okrs');
          tb.insertAdjacentHTML('beforeend', kr({}, tb.children.length));
          kd();
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const title = w.querySelector('#okt').value.trim();
          if (!title) return UI.toast('Write the objective', 'bad');
          const krs = [...w.querySelectorAll('#okrs tr')]
            .map(r => ({
              id: r.querySelector('.kr-id').value || Maham.uid('kr'),
              title: r.querySelector('.kr-t').value.trim(),
              link: r.querySelector('.kr-l').value,
              project: r.querySelector('.kr-p').value,
              target: +r.querySelector('.kr-g').value || 0,
              current: +r.querySelector('.kr-c').value || 0,
            }))
            .filter(k => k.title);
          Store.save(
            Object.assign({}, o, { title, period: w.querySelector('#okp').value.trim(), owner: w.querySelector('#oko').value, krs })
          );
          UI.closeModal();
          App.render();
        };
      },
    });
  },
};

/* the pages */
Maham.addTo('Workplace', [
  ['goals', 'Goals', '🎯'],
  ['import', 'Import', '⬆'],
]);
Maham.page('goals', 'Goals (OKRs)', ['okr']);
Maham.page('import', 'Import from CSV');
P.goals = () => PLAT.goals();
P.import = () => PLAT.importPage();

/* 🕌 Hijri next to dates (each person's choice) */
(() => {
  const f0 = U.fmtDate;
  U.fmtDate = function (s) {
    const out = f0.apply(this, arguments);
    if (!out || PLAT.pref('hijri', '') !== '1') return out;
    const hj = PLAT.hijri(s);
    return hj ? `${out} (${hj})` : out;
  };
})();

/* language and Hijri switches in the top bar's ☀/☾ group area, and Arabic applied after every page */
(() => {
  const launch = App.launch;
  App.launch = function () {
    const out = launch.apply(this, arguments);
    try {
      const top = document.querySelector('header.top');
      if (top && App.me && !document.getElementById('langbtn')) {
        const at = top.querySelector('.theme-sw');
        const b = `<button type="button" class="btn sm" id="langbtn" title="${PLAT.ar() ? 'English' : 'العربية'}">${PLAT.ar() ? 'EN' : 'ع'}</button><button type="button" class="btn sm${PLAT.pref('hijri', '') === '1' ? ' primary' : ''}" id="hijbtn" title="Hijri dates">هـ</button>`;
        if (at) at.insertAdjacentHTML('beforebegin', b);
        else top.insertAdjacentHTML('beforeend', b);
        document.getElementById('langbtn').onclick = () => {
          PLAT.setPref('lang', PLAT.ar() ? 'en' : 'ar');
          location.reload();
        };
        document.getElementById('hijbtn').onclick = () => {
          PLAT.setPref('hijri', PLAT.pref('hijri', '') === '1' ? '' : '1');
          location.reload();
        };
      }
      PLAT.applyLang();
    } catch (e) {
      console.warn('language', e);
    }
    return out;
  };
  const render = App.render;
  App.render = function () {
    const out = render.apply(this, arguments);
    try {
      if (PLAT.ar()) {
        PLAT.translate(document.getElementById('main'));
        PLAT.translate(document.querySelector('nav'));
        PLAT.translate(document.querySelector('header.top'));
      }
    } catch (e) {
      /* never break a page */
    }
    return out;
  };
})();

/* sign in with Microsoft / Google (online; the company lists them in maham.config.js → cloud.sso: ['azure', 'google']) */
(() => {
  if (typeof MahamStorage === 'undefined' || !MahamStorage.signInScreen) return;
  const s0 = MahamStorage.signInScreen;
  MahamStorage.signInScreen = function () {
    const out = s0.apply(this, arguments);
    try {
      const sso = ((MahamStorage.cfg().cloud || {}).sso || []).filter(p => ['azure', 'google'].includes(p));
      const f = document.getElementById('cl-in');
      if (!sso.length || !f) return out;
      f.insertAdjacentHTML(
        'afterend',
        `<div class="sso">${sso.map(p => `<button type="button" class="btn big" data-sso="${p}">${p === 'azure' ? 'Sign in with Microsoft' : 'Sign in with Google'}</button>`).join(' ')}</div>`
      );
      document.querySelectorAll('[data-sso]').forEach(
        b =>
          (b.onclick = () => {
            location.href = `${CloudBackend.base()}/auth/v1/authorize?provider=${b.dataset.sso}&redirect_to=${encodeURIComponent(location.href.replace(/#.*$/, ''))}`;
          })
      );
    } catch (e) {
      /* the usual form still works */
    }
    return out;
  };
})();
