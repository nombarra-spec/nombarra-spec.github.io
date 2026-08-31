# Deep-link setup — step by step

Do STEP 0–4 now. STEP 5–6 are blocked until you've created the store listings.
STEP 7 is done when you build for iOS. STEP 8 is testing.

All paths below are on your Mac. Replace `<...>` placeholders with real values.

---

## STEP 0 — Apply the database migrations (2 min)

The reception "Send a booking link" feature needs `dispensaries.slug`. In the
**Supabase SQL editor** (project `tmkeqkxumbktodcylzpe`):

1. First check whether the slug column already exists:
   ```sql
   select id, name, slug from public.dispensaries limit 3;
   ```
   - **Errors** ("column slug does not exist") → paste and run the full contents of
     `supabase/migrations/20260831100000_dispensary_scoped_patient_links.sql`.
   - **Works** → already applied, skip it.

2. Paste and run, in order:
   - `supabase/migrations/20260830090000_one_token_per_patient_per_session.sql`
   - `supabase/migrations/20260831090000_patient_cancel_token.sql`
   - `supabase/migrations/20260831163609_fix_cancel_my_token_race.sql`

3. Confirm:
   ```sql
   select slug from public.dispensaries where name = 'testdispensary1';   -- expect e.g. 'testdispensary1'
   select proname from pg_proc where proname in ('cancel_my_token','book_token');
   ```

---

## STEP 1 — Create the root GitHub Pages repo (10 min)

`.well-known/` files must sit at the **host root** — your existing
`nombara-site` repo publishes under `/nombara-site/…`, which won't work. You
need a repo named exactly `nombarra-spec.github.io`.

1. Create it: <https://github.com/new>
   - Owner: **nombarra-spec**
   - Repository name: **`nombarra-spec.github.io`** (exactly this)
   - **Public**, do **not** add a README / .gitignore / license
   - Create repository

2. Push this folder to it (Terminal):
   ```bash
   cd /Users/naazikmahsoom/nombara/deploy/deeplink-site
   git init -b main
   git add -A
   git commit -m "Nombara deep-link landing site"
   git remote add origin https://github.com/nombarra-spec/nombarra-spec.github.io.git
   git push -u origin main
   ```

3. Enable Pages: repo → **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**
   - Wait 1–2 minutes.

4. Verify (Terminal):
   ```bash
   curl -sI https://nombarra-spec.github.io/d/ | grep -i "^HTTP"
   curl -s  https://nombarra-spec.github.io/.well-known/assetlinks.json
   curl -sI https://nombarra-spec.github.io/.well-known/apple-app-site-association | grep -i "^HTTP\|content-type"
   ```
   All should return **200**. (The AASA `content-type` may be
   `application/octet-stream` on GitHub Pages — iOS 14+ accepts that. If
   Universal Links fail verification later, that's why: put Cloudflare in
   front, or move to a real host.)

---

## STEP 2 — Fill in the Apple Team ID (5 min — you have the account)

1. <https://developer.apple.com/account> → **Membership details** → copy the
   **Team ID** (10 characters, e.g. `AB12CD34EF`).
2. Edit `deploy/deeplink-site/.well-known/apple-app-site-association` — replace
   `REPLACE_WITH_APPLE_TEAM_ID` (keep the `.com.nombara.nombara` after it).
3. Push:
   ```bash
   cd /Users/naazikmahsoom/nombara/deploy/deeplink-site
   git add -A && git commit -m "Fill Apple Team ID in AASA" && git push
   ```

---

## STEP 3 — Build & host the web patient app (15 min — optional for v1)

Only needed for the landing page's "Continue in browser" option. Skip if you
only want the install path for now (come back to it later).

```bash
cd /Users/naazikmahsoom/nombara
flutter build web --release \
  --dart-define=SUPABASE_URL=<prod supabase url> \
  --dart-define=SUPABASE_ANON_KEY=<prod anon key> \
  --dart-define=DEEP_LINK_BASE_URL=https://nombarra-spec.github.io \
  --base-href=/app/
rm -rf deploy/deeplink-site/app && cp -R build/web deploy/deeplink-site/app
cd deploy/deeplink-site
git add -A && git commit -m "Add web patient app" && git push
```

Then edit `deploy/deeplink-site/d/index.html`:
`var WEB_APP_ORIGIN = "https://nombarra-spec.github.io/app";`  → push again.

---

## STEP 4 — Confirm the app is pointed at the domain

`AppConfig.deepLinkBaseUrl` already defaults to
`https://nombarra-spec.github.io`. For release builds, also pass it explicitly:
```
--dart-define=DEEP_LINK_BASE_URL=https://nombarra-spec.github.io
```
Nothing else to change now.

---

## STEP 5 — assetlinks.json fingerprint  ⛔ after first Play Console upload

1. Play Console → your app → **Test and release → Setup → App signing**
2. Copy the **SHA-256 certificate fingerprint** under *App signing key certificate*
3. Edit `deploy/deeplink-site/.well-known/assetlinks.json` → replace
   `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` → push
4. Android verifies App Links automatically within a few hours. Force-check on a
   device: `adb shell pm verify-app-links --re-verify com.nombara.nombara` then
   `adb shell pm get-app-links com.nombara.nombara`

Until this is done, tapping the https link on Android shows a chooser /
"open with" rather than launching the app silently — the `nombara://` bridge
via the landing page still works.

---

## STEP 6 — APPLE_APP_ID  ⛔ after creating the App Store Connect record

1. App Store Connect → your app → **App Information → General** → copy **Apple ID**
   (a number, e.g. `6740000000`)
2. Edit `deploy/deeplink-site/d/index.html` → replace `APPLE_APP_ID` → push

---

## STEP 7 — iOS Associated Domains  (when you build for iOS, in Xcode)

1. `open /Users/naazikmahsoom/nombara/ios/Runner.xcworkspace`
2. **Runner** target → **Signing & Capabilities** → team = your Apple account
3. **+ Capability → Associated Domains**
4. Add: `applinks:nombarra-spec.github.io`
5. Commit the generated `ios/Runner/Runner.entitlements`
6. Rebuild. Universal Links now open the app directly (needs STEP 2 live).

---

## STEP 8 — Test

Get the demo doctor id: `select id from doctors where name = 'testdoctor1';`

| Test | How |
|------|-----|
| Web fallback (now) | Open `https://nombarra-spec.github.io/d/?d=testdispensary1&doc=<id>` on a phone → landing page → "Continue in the browser" → web app scoped to testdispensary1 with testdoctor1 focused |
| Android app (debug) | `adb shell am start -a android.intent.action.VIEW -d "nombara://d/?d=testdispensary1&doc=<id>"` → app opens on the doctor, booking sheet auto-opens |
| Android App Links (after STEP 5) | Send yourself the `https://` link in WhatsApp, tap it → opens the app, not Chrome |
| Reception UI | Sign in as a reception account for testdispensary1 → scroll to **"Send a booking link"** → tap Share on a doctor → the link is in the share sheet |
| Install-then-land (after STEP 5) | Uninstall, open a Play Store link with `&referrer=d%3Dtestdispensary1%26doc%3D<id>`, install, first open → lands on the doctor |

---

## Finally — commit the app code

The Flutter changes for this feature are on branch `store-submission-prep`
(uncommitted). Commit them:
```bash
cd /Users/naazikmahsoom/nombara
git add -A && git commit -m "Reception doctor booking links + deep linking"
```
