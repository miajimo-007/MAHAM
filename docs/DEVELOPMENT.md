# Making changes

## Conventions

- Every file starts with a one-line comment saying what it is for, then `'use strict';`.
- Put code in the right layer (docs/ARCHITECTURE.md). Business rules go in `domain/`, not in pages.
- Constants go in `Config` (`js/config/app-config.js`), not inline.
- Refer to namespaces by name (`Store.get`), never `this`.
- Always escape user text with `h()` when building HTML.
- Never write into another person's file; always save through `Store.save` / `Store.saveMany`.
- Two-space indentation, single quotes, semicolons (`.editorconfig`, `.eslintrc.json`).

## Add a page

1. Create `src/js/pages/<name>.js`:
   ```js
   /* DARRIK — <what the page is for>. */
   'use strict';
   P.mypage = () => ({
     title: 'My page',
     html: card('Hello', '<p>…</p>'),
     mount(root) {
       /* handlers */
     },
   });
   ```
2. Add `<script src="js/pages/<name>.js"></script>` to `src/index.html` in the pages block.
3. Add it to the menu: `Config.NAV` (and `Config.PAGES` if its access should be configurable).
4. Add a test in `tests/e2e/`, then build and run the tests.

## Add a record type

Add a schema in the matching `src/js/schemas/*.js` (`single`, `defaults`, `fields`, `beforeSave`),
map it to a function in `Config.COLL_PAGE`, and add it to `Config.TEAM_SCOPED` if it belongs to one team.
Document it in docs/DATA-MODEL.md.

## Add a permission

Add it to `Config.PERMS`, give role defaults in `Store.roleDefault` (access/permissions.js), and check it
with `App.can('<key>')`. Document it in docs/PERMISSIONS.md.

## Add a team

No code change: Admin → Teams → _Add team_, then add its manager in Admin → People.

## Release

Bump `APP_VERSION` → `CHANGELOG.md` → `python tools/build.py` → `python tests/run_all.py` →
try in a test folder with a copy of the data → replace `DARRIK.html` in the live folder.
People who have the app open get an "update available" bar.
