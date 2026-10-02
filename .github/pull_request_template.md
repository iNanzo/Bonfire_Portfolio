## What and why

<!-- What changes and why, in a few lines. -->

## Captures

<!-- Before and after, for anything you can see: the site, Bonfire Live, the Painter or
the admin. Effects are judged at real speed from the site's normal cameras, so a short
clip beats a still for anything that moves. -->

## Saved state

<!-- Anything stored that this touches: Bonfire Live's settings (localStorage) and
exported Setups, Painter scenes (v: 1), src/content.json. A stored key is never renamed
without a migration; say how old data still loads. Write "None" if nothing stored changes. -->

- [ ] The content's shape changed (a key added, renamed or removed in `src/content.json`
      or the admin's schema). After merging, run `npm run admin:deploy` so the admin
      knows the new shape.

## Checks run

- [ ] `npm run check` (lint, types, unit and admin tests)
- [ ] `npm run e2e` (locally: `PW_CHANNEL=chrome npm run e2e`)
- [ ] Looked at it in the browser, at desktop and phone widths
- [ ] Every new Bonfire Live effect has its Off / In the Mix / Always switch
