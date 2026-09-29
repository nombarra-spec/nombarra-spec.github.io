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
  /* The canonical public addresses. Every page links the legal pages
     relatively (same site), and these absolute forms are what the apps, the
     store listings and the sitemap use (pinned by test/web/site_links_test.cjs).
     The Flutter app derives the same URLs from WEBSITE_URL + LEGAL_BASE_URL
     (lib/core/config/app_config.dart). */
  site: {
    url: 'https://nombara.naazglobalcorp.com',
    privacy: 'https://nombara.naazglobalcorp.com/privacy.html',
    terms: 'https://nombara.naazglobalcorp.com/terms.html',
    support: 'https://nombara.naazglobalcorp.com/support.html',
    deleteAccount: 'https://nombara.naazglobalcorp.com/delete-account.html',
  },

  /* Who runs Nombara and how to reach them. Shown on the home page, footer
     and legal pages. */
  contact: {
    operator: 'Naaz Global Corporation (Pvt) Ltd',
    email: 'nombara@naazglobalcorp.com',
  },

  /* Phone / WhatsApp booking lines, one per area. While this list is empty
     the "Call" and "WhatsApp" booking options stay hidden on the home page.
     Add an area to switch them on, e.g.
       { area: 'Akurana & Kandy', phone: '+94 77 123 4567', whatsapp: '+94 77 123 4567', hours: '7 AM – 10 PM' },
     `whatsapp` and `hours` are optional. */
  hotlines: [],

  /* Store listings. Empty = that store button is hidden. Fill in once each
     listing is live. */
  stores: {
    playStore: '',
    appStore: '',
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
