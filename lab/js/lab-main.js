/* MAHAM Lab — start: find the shared folder (the one MAHAM uses on this PC), read it, sign in as super admin. */
'use strict';

const LabMain = {
  async boot() {
    if (!('showDirectoryPicker' in window)) return LabUI.screen('<h1>Please open this in Google Chrome or Microsoft Edge</h1>');
    await Lab.loadSettings(); await LabFinder.loadFeedback();
    let st; try { st = await Lab.restore(); } catch (e) { st = 'none'; }
    if (st === 'ok') return LabMain.loaded();
    LabMain.connect(st === 'needs-permission');
  },
  connect(again, err) {
    LabUI.screen(`<h1>MAHAM Lab</h1><p class="lab-sub">Quick win ideas and patterns from the team's data. The shared folder is opened <b>read-only</b> — nothing in it can change.</p>
      ${err ? `<p class="lab-err">${h(err)}</p>` : ''}
      <div class="lab-form">${again ? '<button class="btn primary lab-big" id="lgrant">Allow reading the shared folder</button>' : ''}<button class="btn ${again ? '' : 'primary'} lab-big" id="lpick">Choose the shared folder…</button></div>
      <p class="lab-note">The same folder you use for MAHAM — the one with MAHAM.html and “${h(Config.DATA_FOLDER)}” in it.</p>`);
    const g = UI.$('#lgrant'); if (g) g.onclick = async () => { try { if (await Lab.grant()) LabMain.loaded(); else LabMain.connect(true, 'Reading was not allowed.'); } catch (e) { LabMain.connect(true, e.message); } };
    UI.$('#lpick').onclick = async () => { try { await Lab.pick(); LabMain.loaded(); } catch (e) { if (e.name !== 'AbortError') LabMain.connect(false, e.message); } };
  },
  async loaded() {
    LabUI.screen('<h1>MAHAM Lab</h1><div class="spin"></div><p class="lab-sub">Reading the shared folder (read-only)…</p>');
    try { await Lab.load(); } catch (e) { console.error(e); return LabMain.connect(false, 'Could not read the folder: ' + e.message); }
    if (!Store.get('settings-team')) return LabMain.connect(false, 'No team data found in this folder.');
    let me = ''; try { me = localStorage.getItem('maham.lab.me') || ''; } catch (e) { /* */ }   // stays signed in until "Sign out"
    if (me && Lab.allowed(me)) return LabMain.start(me);
    LabMain.signIn();
  },
  /* the same accounts as MAHAM: employee ID + MAHAM PIN (both apps check the PIN the same way) */
  signIn(err, idVal) {
    LabUI.screen(`<h1>MAHAM Lab</h1><p class="lab-sub">Quick win ideas and patterns from the team's data</p>${err ? `<p class="lab-err" role="alert">${h(err)}</p>` : ''}
      <form id="lsign" class="lab-form"><label>Employee ID<input id="lid" name="id" autocomplete="username" spellcheck="false" value="${h(idVal || '')}"></label>
        <label>Your MAHAM PIN<input type="password" id="lpin" name="pin" autocomplete="current-password"></label>
        <button class="btn primary lab-big" id="lgo" type="submit">Open the Lab</button></form>
      <p class="lab-note">Open to people the super admin has given <b>“Open the MAHAM Lab”</b> (Admin → Permissions).</p>`);
    { const p = UI.$(idVal ? '#lpin' : '#lid'); if (p) p.focus(); }
    UI.$('#lsign').onsubmit = async e => {
      e.preventDefault(); const idv = UI.$('#lid').value.trim(), pin = UI.$('#lpin').value; if (!idv) return LabMain.signIn('Enter your employee ID.');
      const m = App.findLogin(idv); if (!m) return LabMain.signIn('Employee ID not found.', idv);
      if (!Lab.allowed(m.id)) return LabMain.signIn('You do not have access to the Lab — ask the super admin.', idv);
      const lk = App.lockLeft(m.id); if (lk) return LabMain.signIn(`Too many wrong PINs — try again in ${lk} minute${lk > 1 ? 's' : ''}.`, idv);
      const r = await Lab.checkPin(m.id, pin); if (r === 'nopin') return LabMain.signIn('Sign in to MAHAM once first to choose your PIN.', idv);
      if (r !== 'ok') { const left = App.wrongPin(m.id); return LabMain.signIn(left ? `Wrong PIN — ${left} ${left > 1 ? 'tries' : 'try'} left.` : 'Too many wrong PINs — locked for 15 minutes.', idv); }
      try { localStorage.setItem('bct.lock.' + m.id, 'null'); localStorage.setItem('maham.lab.me', m.id); } catch (err2) { /* */ } LabMain.start(m.id);
    };
  },
  start(id) { App.me = id; App.mode = 'admin'; App.viewTeam = '*'; LabUI.invalidate(); LabUI.shell(); },
};
window.addEventListener('DOMContentLoaded', () => LabMain.boot());
