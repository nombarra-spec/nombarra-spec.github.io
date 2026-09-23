/* Session 44 — public site configuration.
 *
 * Everything here is PUBLIC by design. `anonKey` is Supabase's publishable
 * key: it identifies the project, it is not a secret, and it is the same key
 * the Flutter web build already ships. The service-role key must NEVER
 * appear in this file, in any other file under deploy/, or in any build that
 * reaches a browser — it bypasses every row-level security policy in the
 * database.
 *
 * The only data this key can reach is the `public_practitioners` view and
 * the three read RPCs over it (Session 44's migration). Every other table is
 * closed to it.
 */
window.NOMBARA_CONFIG = {
  /* Session 45: the canonical public addresses. The site's own pages link to
     these (pinned by test/web/site_links_test.cjs), and the Flutter app
     derives the same URLs from its WEBSITE_URL (lib/core/config/app_links.dart).
     Moving to a real domain: change them here, in the app's WEBSITE_URL, and
     re-run the test. */
  site: {
    url: 'https://nombarra-spec.github.io',
    privacy: 'https://nombarra-spec.github.io/nombara-site/privacy.html',
    terms: 'https://nombarra-spec.github.io/nombara-site/terms.html',
    support: 'https://nombarra-spec.github.io/nombara-site/support.html',
    deleteAccount: 'https://nombarra-spec.github.io/nombara-site/delete-account.html',
  },

  /* Supabase project (production). Swap both lines together when pointing the
     site at staging — see docs/RELEASE_PROCESS.md. */
  supabaseUrl: 'https://tmkeqkxumbktodcylzpe.supabase.co',
  anonKey: 'sb_publishable_MdfBcqvgkX9-wQTRnj6Wzg_D4YS9fq_',

  /* Public bucket holding practitioner photos (Session 41 + CDN, Session 28). */
  photoBucket: 'doctor-photos',

  /* Origin that serves `/d/` — the deep link that opens the app, or routes to
     the store / web booking app. Empty string = this same origin, which is
     the case while the site and the deep-link landing page share the
     `nombarra-spec.github.io` host. Set it to the real domain (no trailing
     slash) if the directory is ever hosted apart from `/d/`. */
  deepLinkOrigin: '',

  /* How long a fetched directory page stays warm in sessionStorage. The
     register changes on the order of days, so this is about not hammering
     PostgREST while a visitor flips between filters, not about freshness. */
  cacheSeconds: 300,
};
