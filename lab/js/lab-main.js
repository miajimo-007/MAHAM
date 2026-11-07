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
    let me = ''; try { me = sessionStorage.getItem('maham.lab.me') || ''; } catch (e) { /* */ }
    if (me && Lab.allowed(me)) return LabMain.start(me);
    LabMain.signIn();
  },
  signIn(err) {
    const ppl = Lab.people();
    LabUI.screen(`<h1>MAHAM Lab</h1><p class="lab-sub">Quick win ideas and patterns from the team's data</p>${err ? `<p class="lab-err">${h(err)}</p>` : ''}
      <form id="lsign" class="lab-form"><label>Who are you?<select name="who">${ppl.map(m => `<option value="${h(m.id)}">${h(m.name)}${m.superAdmin ? ' · super admin' : ''}</option>`).join('')}</select></label>
        <label>Your MAHAM PIN<input type="password" id="lpin" name="pin" autocomplete="off" inputmode="numeric"></label>
        <button class="btn primary lab-big" id="lgo" type="submit">Open the Lab</button></form>
      <p class="lab-note">Only people the super admin has given <b>“Open the MAHAM Lab”</b> (Admin → Permissions) are listed.</p>`);
    setTimeout(() => { const p = UI.$('#lpin'); if (p) p.focus(); }, 50);
    const go = async () => { const id = UI.$('#lsign [name=who]').value, pin = UI.$('#lsign [name=pin]').value; const r = await Lab.checkPin(id, pin); if (r === 'nopin') return LabMain.signIn('Set a PIN for yourself in MAHAM first (click your name at the bottom left → PIN).'); if (r !== 'ok') return LabMain.signIn('Wrong PIN.'); try { sessionStorage.setItem('maham.lab.me', id); } catch (e) { /* */ } LabMain.start(id); };
    UI.$('#lsign').onsubmit = e => { e.preventDefault(); go(); };
  },
  start(id) { App.me = id; App.mode = 'admin'; App.viewTeam = '*'; LabUI.invalidate(); LabUI.shell(); },
};
window.addEventListener('DOMContentLoaded', () => LabMain.boot());
