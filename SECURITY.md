# Security

## Reporting a vulnerability

Please report it privately, through GitHub's security advisories: the repository's
**Security** tab → **Report a vulnerability**
([direct link](https://github.com/iNanzo/Bonfire_Portfolio/security/advisories/new)).
Don't open a public issue or pull request for it.

Say what's affected, how to reproduce it and what it lets someone do. This is a personal
project, so replies are best effort, but every report is read, and a fix ships through the
usual checks and deploy.

Only what's live is supported: the site at [nhoang.dev](https://nhoang.dev) (built from
`main`) and the deployed admin.

## What's worth a look

- **The admin** (`admin/`): a Cloudflare Worker that edits `src/content.json` and commits
  it to this repo.
  - **Sign-in:** Cloudflare Access lets only allowlisted Google accounts through, and the
    Worker verifies every request again (the Access token's signature, team, audience,
    expiry and the email allowlist; `admin/server/auth.js`), the page included.
  - **GitHub:** it commits through a GitHub App limited to this repository (contents
    write, actions read), with a token minted per hour that never reaches the browser
    (`admin/server/github.js`).
  - **Saves:** same-origin JSON only; every save is re-checked on the server (the content
    rules, WebP-only uploads, image paths locked to `public/assets/projects/<id>/`, no
    path traversal; `admin/server/api.js`).
  - **The page:** a strict Content Security Policy, and it can't be framed
    (`admin/worker.js`).
  - **Secrets** (the App's private key, the allowlist) are Worker secrets in Cloudflare,
    never in the repository. Setup: "Put it online" in [docs/admin.md](docs/admin.md).
- **The site, Bonfire Live and the Painter** are static pages on GitHub Pages, with no
  server and no accounts. What they keep (settings, Setups, scenes) stays in the browser.
  Imported Setups and scene files are untrusted input: they're validated before use, and
  their text is escaped before it reaches the page.
- **The site's preview mode** (`?preview`, used by the admin's live preview) only accepts
  messages from its parent frame, and validates them first.
