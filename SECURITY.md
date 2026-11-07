# Security

MAHAM runs entirely in the browser and stores data only in the folder the user chooses. It makes no network
requests. Please report a security problem privately through GitHub's "Report a vulnerability" (Security tab)
rather than in a public issue.

Notes for deployers:

- Folder permissions are the real access boundary: anyone with write access to the shared folder can write files.
  The app's trust rules (`src/js/access/trust.js`) ignore changes that are not allowed, and System Check lists them.
- PINs are a light protection against using a colleague's name on a shared PC, not authentication.
- Do not store data that identifies patients or the public.
