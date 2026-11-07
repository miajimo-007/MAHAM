/* MAHAM — About MAHAM (everyone can open it: menu → About MAHAM).
 * The text lives in the settings record 'settings-about' so the super admin can edit it in the app
 * (✎ Edit page). Until it is edited the built-in text below is shown. */
'use strict';

const About = {
  ID: 'settings-about',
  DEFAULT: {
    tagline: 'Every Effort Matters.',
    aboutTitle: 'About MAHAM',
    about: `Every Effort Matters.

Behind every successful organization are countless efforts that often go unnoticed.

Tasks completed behind the scenes, challenges resolved, and contributions made every day. Yet, not all of this work is captured, measured, or connected to organizational goals.

MAHAM was created with one belief:

> Every effort deserves to be seen, every contribution deserves to be recognized and every action should have a purpose.

Inspired by a Saudi colloquial expression meaning to catch something before it slips away and hold onto it firmly, MAHAM is an Effort-to-Impact Platform designed to connect work, people, performance, and strategy.

Our goal is to transform everyday efforts into measurable organizational impact.`,
    peopleTitle: '',
    people: [],
    originRole: '',
    origin: '',
    version: 'Version 1.0 | 2026',
    philosophyTitle: 'Our Philosophy',
    philosophy:
      "We're not building another task management tool.\n\nWe're building a better way to understand work, recognize contributions, and turn everyday efforts into meaningful results.",
    footer: 'MAHAM — Every Effort Matters.',
    footer2: 'From Effort to Impact.',
  },
  get() {
    const r = Store.get(About.ID);
    return Object.assign({}, About.DEFAULT, { tagline: Custom.tagline() }, r ? r.page || {} : {});
  },
  /* blank line = new paragraph; a paragraph starting with ">" is a quote; the first paragraph of the About text is the lead line */
  paras(text, lead) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map((p, i) =>
        p.startsWith('>')
          ? `<blockquote>${h(p.replace(/^>\s*/, ''))}</blockquote>`
          : `<p${lead && i === 0 ? ' class="ab-lead"' : ''}>${h(p).replace(/\n/g, '<br>')}</p>`
      )
      .join('');
  },
  editor() {
    const P = About.get();
    let people = P.people.map(x => Object.assign({}, x));
    const fld = (k, label, v, rows) =>
      rows ? UI.field({ key: k, label, type: 'textarea', span: 2, rows }, v) : UI.field({ key: k, label, type: 'text', span: 2 }, v);
    const pplHtml = () =>
      people
        .map(
          (
            x,
            i
          ) => `<div class="ab-edit-person" data-i="${i}"><div class="row-btns tight"><b class="grow">Person ${i + 1}</b>${i ? `<button type="button" class="btn xs ghost" data-up="${i}">↑</button>` : ''}<button type="button" class="btn xs ghost danger" data-rm="${i}">Remove</button></div>
      <div class="grid-form">${UI.field({ key: 'p_name_' + i, label: 'Name', type: 'text' }, x.name)}${UI.field({ key: 'p_role_' + i, label: 'Role', type: 'text' }, x.role)}${UI.field({ key: 'p_text_' + i, label: 'Text', type: 'textarea', span: 2, rows: 4 }, x.text)}</div></div>`
        )
        .join('');
    const readPeople = w =>
      (people = people.map((x, i) => ({
        name: w.querySelector(`[name=p_name_${i}]`).value.trim(),
        role: w.querySelector(`[name=p_role_${i}]`).value.trim(),
        text: w.querySelector(`[name=p_text_${i}]`).value.trim(),
      })));
    UI.modal({
      title: 'Edit the About page',
      wide: true,
      body: `<p class="muted small">Blank line = new paragraph · start a paragraph with <b>&gt;</b> to show it as a quote. Everyone sees the change after their next refresh.</p>
      <form id="abf" class="grid-form">
        ${fld('tagline', 'Tagline (under the name)', P.tagline)}
        ${fld('aboutTitle', 'First section — title', P.aboutTitle)}${fld('about', 'First section — text', P.about, 9)}
        ${fld('peopleTitle', 'People section — title', P.peopleTitle)}
        <div class="fld span2"><div id="abppl">${pplHtml()}</div><button type="button" class="btn xs" id="abadd">＋ Add a person</button></div>
        ${fld('originRole', 'Origin — small heading', P.originRole)}${fld('origin', 'Origin — name', P.origin)}${fld('version', 'Version line', P.version)}
        ${fld('philosophyTitle', 'Last section — title', P.philosophyTitle)}${fld('philosophy', 'Last section — text', P.philosophy, 4)}
        ${fld('footer', 'Footer — bold line', P.footer)}${fld('footer2', 'Footer — second line', P.footer2)}
      </form>`,
      actions: `<button class="btn ghost" data-reset title="Go back to the built-in text">Restore the original text</button><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save</button>`,
      onMount: w => {
        const redraw = () => {
          w.querySelector('#abppl').innerHTML = pplHtml();
          bindP();
        };
        const bindP = () => {
          w.querySelectorAll('[data-rm]').forEach(
            b =>
              (b.onclick = () => {
                readPeople(w);
                people.splice(+b.dataset.rm, 1);
                redraw();
              })
          );
          w.querySelectorAll('[data-up]').forEach(
            b =>
              (b.onclick = () => {
                readPeople(w);
                const i = +b.dataset.up;
                [people[i - 1], people[i]] = [people[i], people[i - 1]];
                redraw();
              })
          );
        };
        bindP();
        w.querySelector('#abadd').onclick = () => {
          readPeople(w);
          people.push({ name: '', role: '', text: '' });
          redraw();
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-reset]').onclick = () =>
          UI.confirm('Go back to the original About text? Your edits will be replaced.', () => {
            Store.save({ id: About.ID, c: 'settings', page: {} });
            UI.closeModal();
            UI.toast('Original text restored', 'good');
            App.render();
          });
        w.querySelector('[data-s]').onclick = () => {
          readPeople(w);
          const f = w.querySelector('#abf');
          const page = {};
          for (const k of [
            'tagline',
            'aboutTitle',
            'about',
            'peopleTitle',
            'originRole',
            'origin',
            'version',
            'philosophyTitle',
            'philosophy',
            'footer',
            'footer2',
          ])
            page[k] = f.querySelector(`[name=${k}]`).value.trim();
          page.people = people.filter(x => x.name || x.text);
          Store.save(Object.assign({}, Store.get(About.ID) || { id: About.ID, c: 'settings' }, { page }));
          UI.closeModal();
          UI.toast('About page saved', 'good');
          App.render();
        };
      },
    });
  },
};

P.about = () => {
  const A = About.get();
  const canEdit = App.isSuper();
  const person = x =>
    `<section class="ab-person">${x.role ? `<div class="ab-role">${h(x.role)}</div>` : ''}<h3>${h(x.name)}</h3>${About.paras(x.text)}</section>`;
  const html = `<div class="about">
  ${canEdit ? '<div class="ab-tools"><button class="btn sm" id="abedit">✎ Edit page</button></div>' : ''}
  <header class="ab-hero">${Store.appLogo() ? `<img class="ab-logo" src="${h(Store.appLogo())}" alt="">` : `<div class="ab-mark">${APP_MARK}</div>`}<h1>${h(Store.appName ? Store.appName() : 'MAHAM')}</h1>${A.tagline ? `<p class="ab-tag">${h(A.tagline)}</p>` : ''}</header>

  ${A.about ? `<section class="card ab-block">${A.aboutTitle ? `<h2>${h(A.aboutTitle)}</h2>` : ''}${About.paras(A.about, true)}</section>` : ''}

  ${A.people.length ? `<section class="card ab-block">${A.peopleTitle ? `<h2>${h(A.peopleTitle)}</h2>` : ''}${A.people.map(person).join('')}</section>` : ''}

  ${A.origin || A.version ? `<section class="card ab-block ab-origin">${A.originRole ? `<div class="ab-role">${h(A.originRole)}</div>` : ''}<h3>${h(A.origin)}</h3><p class="muted">${h(A.version)} <span class="small">· app build ${h(APP_VERSION)}</span></p></section>` : ''}

  ${A.philosophy ? `<section class="card ab-block">${A.philosophyTitle ? `<h2>${h(A.philosophyTitle)}</h2>` : ''}${About.paras(A.philosophy)}</section>` : ''}

  ${A.footer || A.footer2 ? `<footer class="ab-foot"><b>${h(A.footer)}</b><span>${h(A.footer2)}</span></footer>` : ''}
  </div>`;
  return {
    title: 'About ' + (Store.appName ? Store.appName() : 'MAHAM'),
    html,
    mount(root) {
      const b = root.querySelector('#abedit');
      if (b) b.onclick = About.editor;
    },
  };
};
