/* MAHAM — "owner only" start for a hosted copy (GitHub Pages and the like).
 * When the settings file (maham.config.js) names an owner, the app starts with that one person as the super admin
 * instead of the sample team. Add everyone else later in Admin → People. Your own edits always win over this.
 *   owner: { id: 'mohammed', name: 'Mohammed', short: 'Mohammed', team: 'apps' }
 * Sign in with the id (or an employee ID once you set one) and choose a PIN on the first sign-in. */
'use strict';

(function () {
  const c = window.MAHAM_CONFIG || {};
  const o = c.owner;
  const seed = window.SEED_DATA;
  if (!seed || !Array.isArray(seed.records)) return;
  const team = seed.records.find(r => r.id === 'settings-team');
  if (!team) return;
  // online (many companies): no sample people — the company's people come from the database (invitations)
  if (c.storage === 'cloud') {
    team.members = [];
    seed.source = 'online company';
    return;
  }
  if (!o || !o.id) return;
  const teams = seed.records.find(r => r.id === 'settings-teams');
  const first = teams && teams.teams && teams.teams[0] ? teams.teams[0].id : 'apps';
  const name = o.name || o.id;
  team.members = [
    {
      id: String(o.id),
      name,
      short: o.short || name,
      me: name,
      scored: false,
      active: true,
      aliases: [],
      role: o.role || 'analyst',
      team: o.team || first,
      superAdmin: true,
      empId: o.empId || '',
    },
  ];
  seed.source = 'owner only';
})();
