/* MAHAM — "View as" (super admin): see the app exactly as another person sees it, read-only.
 * While previewing, App.preview is set: Store.saveMany refuses every change and Store.flush writes nothing,
 * so nothing can be saved under the other person's name. */
'use strict';

Object.assign(App, {
  preview: null,
  async viewAs(id) {
    if (!Store.isSuper(App.me) || App.preview || !Store.member(id) || id === App.me) return;
    if (Store.dirty) await Store.flush();
    App.preview = { real: App.me, team: App.viewTeam, back: location.hash || '#/admin' };
    App.me = id;
    Store.own = Object.assign({}, (Store.sources['u:' + id + '.json'] || {}).records || {});
    App.setViewTeam(App.teamFor(id));
    Store.rebuild();
    location.hash = '#/home';
    App.launch();
    App.previewBar();
  },
  exitPreview() {
    if (!App.preview) return;
    const p = App.preview;
    App.preview = null;
    App.me = p.real;
    Store.own = Object.assign({}, (Store.sources['u:' + p.real + '.json'] || {}).records || {});
    App.setViewTeam(p.team);
    Store.rebuild();
    location.hash = p.back;
    App.launch();
  },
  previewBar() {
    if (!App.preview) return;
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    bar.id = 'previewbar';
    bar.innerHTML = `<span>👁 Viewing as <b>${U.h(Store.memberName(App.me))}</b> (${U.h(Store.titleOf(Store.member(App.me) || {}))}) — read-only, nothing is saved</span><button class="btn sm" id="exitpreview">Back to my account</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#exitpreview').onclick = () => {
      bar.remove();
      App.exitPreview();
    };
  },
});
