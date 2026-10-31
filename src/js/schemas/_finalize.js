/* DARRIK — Rules applied once all record types are defined (load this after every schemas/*.js file). */
'use strict';

// collections where every field is manager-only
for (const k of Object.keys(Schemas)) if (Schemas[k].mgrAll) Schemas[k].fields.forEach(f => (f.mgr = true));
