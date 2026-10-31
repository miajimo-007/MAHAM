/* DARRIK — Admin → Customize: name, logo, tagline, colours, menu, words, targets, weekend,
 * sign-in message, report header, start pages, My Day tiles, backup. Only the super admin sees it (and only a
 * super admin's settings are accepted by everyone's app — access/trust.js). Values live in Custom (domain/custom.js). */
'use strict';

function adminCustom() {
  const C = Custom.rec();
  const A = Store.appName();
  const reset = k => `<button class="btn ghost sm" data-cdef="${k}" title="Go back to the original">Restore default</button>`;
  const saveRow = (k, extra = '') =>
    `<div class="row-btns">${reset(k)}${extra}<span class="grow"></span><button class="btn primary" data-csave="${k}">Save</button></div>`;
  const pal = Custom.palette();
  const cur = Custom.get('color', 'teal');
  const sw = (k, p) =>
    `<label class="cz-sw ${cur === k ? 'on' : ''}" title="${h(p.name)}"><input type="radio" name="color" value="${k}" ${cur === k ? 'checked' : ''}><span class="cz-dot" style="background:${p.accent};box-shadow: inset 0 -10px 0 ${p.side}"></span>${h(p.name)}</label>`;

  const look = card(
    'Name, logo, tagline and colour',
    `<div class="brandset"><div class="brand-prev">${Store.logoHtml('', 'big')}<div><b>${h(A)}</b><div class="muted small">${h(Custom.tagline())}</div></div></div>
    <form class="grid-form" id="cz-look">
      ${UI.field({ key: 'appName', label: 'App name', type: 'text', placeholder: 'DARRIK', hint: 'menu, sign-in screen, browser tab, About, reports' }, Store.setting('settings-features', 'appName', '') || 'DARRIK')}
      ${UI.field({ key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Every Effort Matters.', hint: 'under the name on the sign-in screen and About' }, C.tagline || '')}
      <div class="fld span2"><label>Logo (PNG, JPG or SVG — square works best)</label><input type="file" id="logofile" accept="image/png,image/jpeg,image/svg+xml,image/webp"></div>
      <div class="fld span2"><label>Colour</label><div class="cz-colors">${Object.entries(Custom.COLORS)
        .map(([k, p]) => sw(k, p))
        .join('')}
        <label class="cz-sw ${/^#/.test(cur) ? 'on' : ''}"><input type="radio" name="color" value="custom" ${/^#/.test(cur) ? 'checked' : ''}><input type="color" id="cz-hex" value="${h(/^#/.test(cur) ? cur : pal.accent)}"> Your own</label></div>
        <div class="muted small">Buttons, links, highlights and the menu. The file name stays DARRIK.html so desktop links keep working.</div></div>
    </form>
    ${saveRow('look', Store.appLogo() ? '<button class="btn ghost sm" id="logooff">Remove logo</button>' : '')}</div>`
  );

  const nav = Custom.get('nav', {});
  const groups = Custom.get('groups', {});
  const menu = card(
    'Menu',
    `<p class="muted small">Rename a page, change its icon (any emoji or symbol) or its place in the group. Leave a box empty to keep the original. The page title changes too.</p>
    <div class="cz-menu">${Config.NAV.map(
      ([
        g,
        items,
      ]) => `<div class="cz-grp" data-g="${h(g)}"><div class="cz-gh"><input class="cz-gname" value="${h(groups[g] || '')}" placeholder="${h(g)}" title="Group name"></div>
      ${Custom.navItems(g, items)
        .map(([k]) => {
          const o = items.find(x => x[0] === k);
          return `<div class="cz-item" data-k="${h(k)}"><input class="cz-ic" value="${h((nav[k] || {}).icon || '')}" placeholder="${h(o[2])}" maxlength="3" title="Icon"><input class="cz-lb" value="${h((nav[k] || {}).label || '')}" placeholder="${h(o[1])}" title="Name"><button type="button" class="btn xs ghost" data-up title="Move up">↑</button><button type="button" class="btn xs ghost" data-dn title="Move down">↓</button></div>`;
        })
        .join('')}</div>`
    ).join('')}</div>
    ${saveRow('menu')}`
  );

  const W = Custom.get('words', {});
  const extra = Object.keys(W).filter(k => !Custom.WORDS.includes(k));
  const wrow = (k, v, fixed) =>
    `<tr class="cz-w"><td>${fixed ? `<b>${h(k)}</b><input type="hidden" data-wf value="${h(k)}">` : `<input data-wf value="${h(k)}" placeholder="word in the app">`}</td><td>→</td><td><input data-wt value="${h(v || '')}" placeholder="keep “${h(k || 'word')}”"></td><td>${fixed ? '' : '<button type="button" class="btn xs ghost" data-wdel>✕</button>'}</td></tr>`;
  const words = card(
    'Words used in the app',
    `<p class="muted small">Write the word you want instead. It changes on every screen, button, pop-up and printed report (plurals follow: “To Dos” → “Tasks”). What people typed themselves is not touched in their records.</p>
    <table class="tbl cz-words"><tbody id="cz-wl">${Custom.WORDS.map(k => wrow(k, W[k], true)).join('')}${extra.map(k => wrow(k, W[k], false)).join('')}</tbody></table>
    ${saveRow('words', '<button type="button" class="btn sm" id="cz-wadd">＋ Another word</button>')}`
  );

  const T = Custom.get('targets', {});
  const targets = card(
    'Targets and limits',
    `<form class="grid-form" id="cz-t">${Object.entries(Custom.TARGETS)
      .map(([k, t]) =>
        UI.field(
          {
            key: k,
            label: t.label + (t.unit ? ` (${t.unit})` : ''),
            type: 'number',
            min: 1,
            step: 1,
            placeholder: String(t.def),
            hint: `${t.hint} · original ${t.def}`,
          },
          T[k] || ''
        )
      )
      .join('')}</form>
    ${saveRow('targets')}`
  );

  const wk = Custom.weekend();
  const weekend = card(
    'Weekend',
    `<p class="muted small">Weekend days are not working days: no attendance, not lazy days, not counted as leave. Locked months keep their official score.</p>
    <div class="pick" id="cz-wk">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label class="check"><input type="checkbox" value="${i}" ${wk.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
    ${saveRow('weekend')}`
  );

  const welcome = card(
    'Sign-in message',
    `<p class="muted small">Shown to everyone on the “Who are you?” screen — a welcome, a notice or a reminder.</p>
    <form class="grid-form" id="cz-wel">${UI.field({ key: 'welcome', label: 'Message', type: 'textarea', rows: 3, span: 2, placeholder: 'e.g. Remember to log your shadow work before 3 pm.' }, C.welcome || '')}</form>${saveRow('welcome')}`
  );

  const R = Custom.get('report', {});
  const report = card(
    'Report header',
    `<p class="muted small">Printed and PDF reports and the first sheet of the Excel report.</p>
    <form class="grid-form" id="cz-rep">${UI.field({ key: 'org', label: 'Organisation line', type: 'text', placeholder: 'e.g. APPS – Central Region, MEH' }, R.org || '')}${UI.field({ key: 'footer', label: 'Footer line', type: 'text', placeholder: 'e.g. Internal — for management use' }, R.footer || '')}
      ${UI.field({ key: 'logo', label: 'Logo on reports', type: 'bool', checkLabel: 'Show the app logo' }, R.logo !== false)}</form>${saveRow('report')}`
  );

  const S = Custom.get('start', {});
  const pages = [
    ['', 'Normal (My Day / their desk)'],
    ...Config.NAV.flatMap(([, it]) => it.filter(x => x[0] !== 'home').map(x => [x[0], Custom.navLabel(x[0], x[1])])),
    ['projects', 'Projects'],
    ['meetings', 'Meetings'],
    ['mgrtasks', 'Tasks from Director'],
  ].filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);
  const start = card(
    'Start page',
    `<p class="muted small">The page each role opens on after signing in. If someone can't see that page, they get the normal one.</p>
    <form class="grid-form" id="cz-st">${[
      ['analyst', 'Analysts'],
      ['teamleader', 'Team leaders'],
      ['manager', 'Managers'],
      ['director', 'Directors & AED'],
    ]
      .map(
        ([k, l]) =>
          `<div class="fld"><label>${l}</label><select name="${k}">${pages.map(([v, t]) => `<option value="${h(v)}" ${(S[k] || '') === v ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></div>`
      )
      .join('')}</form>${saveRow('start')}`
  );

  const tiles = card(
    'My Day tiles',
    `<p class="muted small">Which boxes analysts see at the top of My Day.</p>
    <div class="pick" id="cz-tiles">${Custom.TILES.map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" ${Custom.tile(k) ? 'checked' : ''}> ${h(l)}</label>`).join('')}</div>${saveRow('tiles')}`
  );

  const backup = card(
    'Backup and copy',
    `<p class="muted small">Everything on this page plus the name, logo and the About text in one file — keep it as a backup or load it in another shared folder.</p>
    <div class="row-btns"><button class="btn" id="cz-exp">⬇ Save customize file</button><label class="btn">⬆ Load customize file<input type="file" id="cz-imp" accept=".json,application/json" hidden></label><a class="btn ghost" href="#/about">✎ Edit the About page</a><span class="grow"></span><button class="btn danger ghost" id="cz-all">Restore all defaults</button></div>`
  );

  const html = `<div class="no-words"><p class="muted small">Only you (super admin) can change these. Everyone sees the change after their next refresh.</p>
    <div class="cols2"><div>${look}${words}${targets}${weekend}</div><div>${menu}${start}${tiles}${welcome}${report}</div></div>${backup}</div>`;

  return {
    html,
    mount(root) {
      const done = msg => {
        UI.toast(msg + ' — everyone sees it after their next refresh', 'good');
        App.launch();
      };
      let newLogo = null;
      root.querySelector('#logofile').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          newLogo = await shrinkLogo(f);
          const pv = root.querySelector('.brand-prev .logo');
          if (pv) {
            pv.classList.add('img');
            pv.innerHTML = `<img src="${newLogo}" alt="">`;
          }
          UI.toast('Logo ready — press Save', 'good');
        } catch (err) {
          UI.toast('Could not read that image', 'bad');
        }
      };
      const feat = patch =>
        Store.save(Object.assign({}, Store.get('settings-features') || { id: 'settings-features', c: 'settings' }, patch));
      const lo = root.querySelector('#logooff');
      if (lo)
        lo.onclick = () =>
          UI.confirm('Remove the logo? The first letter of the app name is shown instead.', () => {
            feat({ logo: '' });
            done('Logo removed');
          });
      root.querySelector('#cz-hex').oninput = () => {
        root.querySelector('[name=color][value=custom]').checked = true;
      };
      root.querySelectorAll('.cz-item [data-up], .cz-item [data-dn]').forEach(
        b =>
          (b.onclick = () => {
            const it = b.closest('.cz-item');
            if (b.hasAttribute('data-up')) {
              const p = it.previousElementSibling;
              if (p && p.classList.contains('cz-item')) it.parentNode.insertBefore(it, p);
            } else {
              const n = it.nextElementSibling;
              if (n) it.parentNode.insertBefore(n, it);
            }
          })
      );
      const bindDel = () => root.querySelectorAll('[data-wdel]').forEach(b => (b.onclick = () => b.closest('tr').remove()));
      bindDel();
      root.querySelector('#cz-wadd').onclick = () => {
        const tb = root.querySelector('#cz-wl');
        tb.insertAdjacentHTML(
          'beforeend',
          `<tr class="cz-w"><td><input data-wf placeholder="word in the app"></td><td>→</td><td><input data-wt placeholder="new word"></td><td><button type="button" class="btn xs ghost" data-wdel>✕</button></td></tr>`
        );
        bindDel();
      };

      const read = {
        look() {
          const f = root.querySelector('#cz-look');
          const c = f.querySelector('[name=color]:checked');
          const col = !c ? 'teal' : c.value === 'custom' ? root.querySelector('#cz-hex').value : c.value;
          const p = { appName: f.querySelector('[name=appName]').value.trim() || 'DARRIK' };
          if (newLogo) p.logo = newLogo;
          feat(p);
          Custom.save({ tagline: f.querySelector('[name=tagline]').value.trim() || undefined, color: col === 'teal' ? undefined : col });
          return 'Name, logo and colour saved';
        },
        menu() {
          const nav = {},
            groups = {},
            order = {};
          root.querySelectorAll('.cz-grp').forEach(g => {
            const gn = g.querySelector('.cz-gname').value.trim();
            if (gn) groups[g.dataset.g] = gn;
            order[g.dataset.g] = [...g.querySelectorAll('.cz-item')].map(i => i.dataset.k);
            g.querySelectorAll('.cz-item').forEach(i => {
              const label = i.querySelector('.cz-lb').value.trim(),
                icon = i.querySelector('.cz-ic').value.trim();
              if (label || icon) nav[i.dataset.k] = { label, icon };
            });
          });
          Custom.save({ nav, groups, order });
          return 'Menu saved';
        },
        words() {
          const w = {};
          root.querySelectorAll('#cz-wl tr').forEach(tr => {
            const a = tr.querySelector('[data-wf]').value.trim(),
              b = tr.querySelector('[data-wt]').value.trim();
            if (a && b && a !== b) w[a] = b;
          });
          Custom.save({ words: w });
          return 'Words saved';
        },
        targets() {
          const t = {};
          for (const k of Object.keys(Custom.TARGETS)) {
            const v = +root.querySelector(`#cz-t [name=${k}]`).value;
            if (v > 0) t[k] = v;
          }
          Custom.save({ targets: t });
          Calc.invalidate();
          return 'Targets saved';
        },
        weekend() {
          const d = [...root.querySelectorAll('#cz-wk input:checked')].map(i => +i.value);
          if (d.length > 3) {
            UI.toast('Pick at most 3 weekend days', 'bad');
            return null;
          }
          Custom.save({ weekend: d });
          Calc.invalidate();
          return 'Weekend saved';
        },
        welcome() {
          Custom.save({ welcome: root.querySelector('#cz-wel [name=welcome]').value.trim() || undefined });
          return 'Sign-in message saved';
        },
        report() {
          const f = root.querySelector('#cz-rep');
          Custom.save({
            report: {
              org: f.querySelector('[name=org]').value.trim(),
              footer: f.querySelector('[name=footer]').value.trim(),
              logo: f.querySelector('[name=logo]').checked,
            },
          });
          return 'Report header saved';
        },
        start() {
          const s = {};
          root.querySelectorAll('#cz-st select').forEach(x => {
            if (x.value) s[x.name] = x.value;
          });
          Custom.save({ start: s });
          return 'Start pages saved';
        },
        tiles() {
          const t = {};
          root.querySelectorAll('#cz-tiles input').forEach(i => {
            if (!i.checked) t[i.value] = false;
          });
          Custom.save({ tiles: t });
          return 'My Day tiles saved';
        },
      };
      const DEF = {
        look: () => {
          feat({ appName: '', logo: '' });
          Custom.save({ tagline: undefined, color: undefined });
        },
        menu: () => Custom.save({ nav: undefined, groups: undefined, order: undefined }),
        words: () => Custom.save({ words: undefined }),
        targets: () => Custom.save({ targets: undefined }),
        weekend: () => Custom.save({ weekend: undefined }),
        welcome: () => Custom.save({ welcome: undefined }),
        report: () => Custom.save({ report: undefined }),
        start: () => Custom.save({ start: undefined }),
        tiles: () => Custom.save({ tiles: undefined }),
      };
      root.querySelectorAll('[data-csave]').forEach(
        b =>
          (b.onclick = () => {
            const m = read[b.dataset.csave]();
            if (m) done(m);
          })
      );
      root.querySelectorAll('[data-cdef]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm(
              b.dataset.cdef === 'look'
                ? 'Go back to the original name (DARRIK), no logo, the original tagline and colour?'
                : 'Go back to the original for this section?',
              () => {
                DEF[b.dataset.cdef]();
                Calc.invalidate();
                done('Original restored');
              }
            ))
      );
      root.querySelector('#cz-all').onclick = () =>
        UI.confirm(
          'Restore every setting on this page to the original? (The app name, logo and About text are kept — restore those in their own sections.)',
          () => {
            Store.save({ id: Custom.ID, c: 'settings' });
            Calc.invalidate();
            done('All customize settings restored');
          }
        );
      root.querySelector('#cz-exp').onclick = () => {
        const blob = new Blob([JSON.stringify(Custom.bundle(), null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${Store.appName()} customize ${U.todayStr()}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 500);
      };
      root.querySelector('#cz-imp').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        let b;
        try {
          b = JSON.parse(await f.text());
          if (b.kind !== 'darrik-customize') throw new Error();
        } catch (err) {
          UI.toast('That is not a customize file', 'bad');
          return;
        }
        UI.confirm(
          `Load the settings from “${f.name}” (saved ${U.fmtDate((b.saved || '').slice(0, 10)) || 'unknown'})? Your current customize settings, name, logo and About text are replaced.`,
          () => {
            Custom.restore(b);
            Calc.invalidate();
            done('Customize file loaded');
          }
        );
      };
    },
  };
}
