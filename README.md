# Nombara deep-link landing site

Static files that make the dispensary-shared booking links
(`https://<host>/d/<slug>?doc=<doctorId>`) resolve — opening the installed
app, or routing to the store / web app when it isn't installed.

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
