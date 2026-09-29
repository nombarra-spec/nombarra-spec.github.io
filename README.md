# Nombara public website — nombara.naazglobalcorp.com

One static site, one origin: the home page (`index.html`), the live doctor
directory (`doctors.html`, `doctor.html`), the four pages the App Store and
Google Play require (`privacy.html`, `terms.html`, `support.html`,
`delete-account.html`), and the deep-link plumbing (`/d/`, `/.well-known/`).

**Doctors appear automatically.** Every doctor list on the site reads the
`public_practitioners` view, which only contains practitioners with
`verified = true` and `status = 'active'`. When a collector onboards a doctor
and the CEO approves them, they are on the website on the next page load — no
rebuild. (Run `node scripts/build_public_directory.mjs` only to refresh the
pre-rendered, search-engine copy.)

**Things you edit** — all in `assets/config.js`:
- `hotlines` — add one entry per area to switch on the Call / WhatsApp option.
- `stores.playStore`, `stores.appStore` — the store buttons appear once set.
- `contact` — operator name and support email.

## Deploying to nombara.naazglobalcorp.com (Cloudflare Pages — recommended)

Cloudflare Pages is recommended over GitHub Pages because it applies
`_headers` (HSTS, CSP, anti-framing) and `_redirects` (clean `/d/<slug>`
links). GitHub Pages ignores both.

1. `node scripts/build_public_directory.mjs` (from the repo root) → `build/public_site/`.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → upload
   `build/public_site/` (or `npx wrangler pages deploy build/public_site --project-name nombara-site`).
3. Pages project → Custom domains → add `nombara.naazglobalcorp.com`.
   If naazglobalcorp.com's DNS is on Cloudflare this is automatic; otherwise
   add a `CNAME nombara → <project>.pages.dev` record at your DNS provider.
4. Cloudflare → SSL/TLS → "Always Use HTTPS" on, minimum TLS 1.2.
5. Check: `curl -sI https://nombara.naazglobalcorp.com | grep -i strict-transport`
   and https://securityheaders.com/?q=nombara.naazglobalcorp.com (expect A/A+).

## Then point the apps at it

- Build with `--dart-define=WEBSITE_URL=https://nombara.naazglobalcorp.com`
  and `--dart-define=LEGAL_BASE_URL=https://nombara.naazglobalcorp.com`.
- Android manifest `<data android:host>` and iOS Associated Domains
  (`applinks:nombara.naazglobalcorp.com`) for the deep links.
- App Store Connect / Play Console: Privacy Policy URL, Support URL, Marketing
  URL, and Play's "Delete account URL" → the pages above.

---

## Deep-link plumbing (history)

Static files that make the dispensary-shared booking links
(`https://<host>/d/<slug>?doc=<doctorId>`) resolve — opening the installed
app, or routing to the store / web app when it isn't installed.

## What this folder is now

Two things share one host:

1. **The public site** — `index.html` (landing), `doctors.html` (the live
   doctor directory, Session 44) and `doctor.html` (one practitioner), plus
   `assets/`. These read the `public_practitioners` view with the **publishable**
   anon key. No secret key belongs in this folder, ever.
2. **The deep-link plumbing** — `/.well-known/` and `/d/`, below.

They are deliberately on the same origin: the directory's **Book** buttons
link to `/d/?d=<slug>&doc=<doctorId>`, so they are relative links that cannot
point at the wrong host.

Deploy this folder as-is, or run `node scripts/build_public_directory.mjs`
and deploy `build/public_site/` instead for the pre-rendered, crawlable copy
(per-practitioner pages + `sitemap.xml`). Both are self-contained; the second
is a superset.

## Where it goes

Host these at the **root** of the deep-link domain — the same origin as
`AppConfig.deepLinkBaseUrl` and the Android/iOS deep-link config.

- Now (stopgap): a **root** GitHub Pages repo, `nombarra-spec/nombarra-spec.github.io`.
  A project path (`nombarra-spec.github.io/nombara-site/…`) will **not** work —
  `/.well-known/` must sit at the host root.
- Before launch: a real registered domain. Then also update
  `--dart-define=DEEP_LINK_BASE_URL`, the Android manifest `<data android:host>`,
  and the iOS Associated Domains entitlement. See
  `review documents/06-pre-submission-checklist.md`.

Resulting layout at the host:

```
/.well-known/assetlinks.json
/.well-known/apple-app-site-association      (no extension, served as application/json)
/d/index.html                               (also serves /d/<anything> — it reads the path itself)
```

GitHub Pages serves `/d/index.html` for `/d/` but **not** for `/d/akurana-central`
(no SPA fallback). Two options:
- add a `/d/akurana-central/index.html` per dispensary (a tiny build step), or
- put the slug in the query instead: share `https://<host>/d/?d=<slug>&doc=<id>`
  (the page and the app both accept the `?d=` form). Simplest for GitHub Pages.
A real host (Netlify/Cloudflare Pages) can rewrite `/d/*` → `/d/index.html` and
the clean path works.

## Fill in before deploying

| File | Placeholder | Value |
|------|-------------|-------|
| `.well-known/assetlinks.json` | `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` | Play Console → Setup → App signing → **App signing key certificate** SHA-256 (colon-separated hex). Available after the first AAB upload. |
| `.well-known/apple-app-site-association` | `REPLACE_WITH_APPLE_TEAM_ID` | Apple Developer → Membership → **Team ID** (10 chars). |
| `d/index.html` | `APPLE_APP_ID` | App Store numeric id (after the listing exists). Until then iOS falls back to the App Store search / the scheme. |
| `d/index.html` | `WEB_APP_ORIGIN` | Where the Flutter web patient build (`flutter build web`) is hosted. |

## Verifying

- Android App Links: `adb shell pm verify-app-links --re-verify com.nombara.nombara`
  then `adb shell pm get-app-links com.nombara.nombara` → host should show `verified`.
- iOS AASA: `https://<host>/.well-known/apple-app-site-association` must return
  `200` with `Content-Type: application/json` and **no redirect**.
- Both files must be reachable over **HTTPS** with a valid cert (GitHub Pages is fine).
