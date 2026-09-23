/* Session 44 — the pure, testable half of the public doctor directory.
 *
 * No DOM, no network, no globals beyond the one it exports. Loaded in the
 * browser as a classic script (it defines `NombaraDirectory`) and by
 * `node --test test/web/public_directory_core_test.cjs` through the
 * CommonJS tail at the bottom — so the rules below are pinned by tests
 * rather than by eyeballing the rendered page.
 *
 * The rules worth pinning:
 *   * Location SORTS, it never HIDES (Session 33).
 *   * A practitioner with several dispensaries is ONE card — their nearest —
 *     not three near-identical ones (Session 36's de-duplication, carried
 *     into the presentation layer).
 *   * Every fallback returns something renderable. A missing photo, a
 *     missing coordinate, a missing next session and a missing specialty are
 *     all designed states; none of them may produce "undefined" on a card.
 */
(function (root) {
  'use strict';

  var EARTH_RADIUS_KM = 6371;
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toRad(deg) { return (deg * Math.PI) / 180; }

  /**
   * A coordinate, or null. Deliberately NOT `isFinite(value)` — that coerces,
   * so `isFinite(null)` is true and a dispensary with no coordinates would
   * silently become (0, 0), somewhere in the Atlantic, 8,972 km from Kandy.
   * PostgREST also hands `numeric` columns back as strings, so a numeric
   * string is accepted; null, undefined, '' and NaN are not.
   */
  function coord(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = typeof value === 'number' ? value : Number(value);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  /** Great-circle distance in km, or null if either point is incomplete. */
  function haversineKm(from, to) {
    if (!from || !to) return null;
    var fromLat = coord(from.lat), fromLng = coord(from.lng);
    var toLat = coord(to.lat), toLng = coord(to.lng);
    if (fromLat === null || fromLng === null || toLat === null || toLng === null) return null;
    var dLat = toRad(toLat - fromLat);
    var dLng = toRad(toLng - fromLng);
    var a = Math.pow(Math.sin(dLat / 2), 2)
          + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.pow(Math.sin(dLng / 2), 2);
    return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** '2.3 km' / '450 m' / '' — never 'null km'. */
  function formatDistance(km) {
    if (km === null || km === undefined || !isFinite(km)) return '';
    var n = Number(km);
    if (n < 1) return Math.max(50, Math.round(n * 1000 / 50) * 50) + ' m';
    if (n < 10) return n.toFixed(1) + ' km';
    return Math.round(n) + ' km';
  }

  /** '4:00 PM' from a Postgres `time` ('16:00:00'); '' when absent. */
  function formatTime(hms) {
    if (!hms) return '';
    var parts = String(hms).split(':');
    var h = parseInt(parts[0], 10);
    if (isNaN(h)) return '';
    var m = (parts[1] || '00').slice(0, 2);
    var suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + suffix;
  }

  /** Parses 'YYYY-MM-DD' as a LOCAL date (never UTC — that shifts the day). */
  function parseDate(ymd) {
    if (!ymd) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /**
   * 'Today · 4:00 PM' / 'Tomorrow · 8:00 AM' / 'Mon 15 Sep · 8:00 AM'.
   * Returns '' when the practitioner has no generated session yet — the card
   * then shows its own "times in the app" line rather than a blank.
   */
  function formatNextAvailable(dateStr, timeStr, today) {
    var date = parseDate(dateStr);
    if (!date) return '';
    var base = startOfDay(today || new Date());
    var days = Math.round((date - base) / 86400000);
    var time = formatTime(timeStr);
    var label;
    if (days <= 0) label = 'Today';
    else if (days === 1) label = 'Tomorrow';
    else label = DAY_NAMES[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
    return time ? label + ' · ' + time : label;
  }

  /** 'Sun 8:00 AM – 11:00 AM' for a weekly template slot. */
  function formatWeeklySlot(slot) {
    if (!slot) return '';
    var day = DAY_NAMES[(Number(slot.day_of_week) || 0) % 7];
    var from = formatTime(slot.start_time);
    var to = formatTime(slot.end_time);
    return (day + ' ' + from + (to ? ' – ' + to : '')).trim();
  }

  /**
   * Two initials for the avatar fallback. Drops the honorific so
   * "Dr. Yasas Jayasinghe" reads YJ, not DY.
   */
  var HONORIFICS = /^(dr|doctor|prof|professor|mr|mrs|ms|miss)$/i;

  function initials(name) {
    var words = String(name || '').split(/[\s.]+/).filter(Boolean);
    /* Strip the honorific only while something is left to name the person —
       "Dr." on its own is not two initials, it is no name at all. */
    var named = words.filter(function (w) { return !HONORIFICS.test(w); });
    if (named.length) words = named;
    else return '·';
    if (words.length === 0) return '·';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  /** Public CDN URL for a photo path, or '' when there is no consented photo. */
  function photoUrl(config, path) {
    if (!path || !config || !config.supabaseUrl) return '';
    var base = String(config.supabaseUrl).replace(/\/+$/, '');
    var bucket = config.photoBucket || 'doctor-photos';
    return base + '/storage/v1/object/public/' + bucket + '/'
         + String(path).split('/').map(encodeURIComponent).join('/');
  }

  /**
   * The booking destination for a card: the `/d/` landing page, which opens
   * the installed app, falls back to the store, and offers the browser
   * booking app. Mirrors `DispensaryLink.build` in the Flutter client — the
   * two must stay in step or a shared link stops focusing the right doctor.
   */
  function bookingUrl(config, row) {
    var origin = (config && config.deepLinkOrigin ? String(config.deepLinkOrigin) : '').replace(/\/+$/, '');
    var slug = row && row.dispensary_slug ? String(row.dispensary_slug) : '';
    var doc = row && row.doctor_id ? String(row.doctor_id) : '';
    var query = [];
    if (slug) query.push('d=' + encodeURIComponent(slug));
    if (doc) query.push('doc=' + encodeURIComponent(doc));
    return origin + '/d/' + (query.length ? '?' + query.join('&') : '');
  }

  /**
   * The detail page for a practitioner. Always a real, servable path.
   *
   * `doctor.html?id=…` is the form that works on a raw checkout of this
   * folder with no build step, so it is the default and it can never 404.
   * `scripts/build_public_directory.mjs` pre-renders `doctor/<id>/index.html`
   * for search engines and flips `prettyProfileUrls` on in the built output,
   * at which point the links point at the files that exist there.
   */
  function profileUrl(row, config) {
    var id = row && row.doctor_id ? String(row.doctor_id) : '';
    if (config && config.prettyProfileUrls) return 'doctor/' + encodeURIComponent(id) + '/';
    return 'doctor.html?id=' + encodeURIComponent(id);
  }

  /**
   * The view returns one row per practitioner × dispensary. A directory that
   * printed all of them would show the same doctor three times in a row.
   * Collapse to one card each — keeping the nearest location (or, with no
   * location, the soonest session) — and remember how many others there are
   * so the card can say "also at 2 more places".
   *
   * Input order is preserved: the server already sorted it.
   */
  function collapseToNearest(rows) {
    var byDoctor = Object.create(null);
    var out = [];
    (rows || []).forEach(function (row) {
      if (!row || !row.doctor_id) return;
      var seen = byDoctor[row.doctor_id];
      if (!seen) {
        var card = Object.assign({}, row, { other_locations: 0 });
        byDoctor[row.doctor_id] = card;
        out.push(card);
        return;
      }
      seen.other_locations += 1;
    });
    return out;
  }

  /**
   * Sorts by distance when the visitor shared a location, and NEVER drops a
   * row for being far away or for having no coordinates — those sink to the
   * bottom, they do not disappear. Used for the pre-rendered/cached list;
   * a live fetch is already ordered by the database.
   */
  function sortByDistance(rows, origin) {
    var withDistance = (rows || []).map(function (row) {
      /* Raw values, not Number(...) — coercing null to 0 is exactly the bug
         that puts a coordinate-less dispensary in the Atlantic. */
      var km = origin
        ? haversineKm(origin, { lat: row.latitude, lng: row.longitude })
        : null;
      /* `null` (not `undefined`) is the "no distance" value everywhere —
         the card renders it as nothing at all rather than as a gap. */
      var existing = row.distance_km === undefined ? null : row.distance_km;
      return Object.assign({}, row, {
        distance_km: km === null ? existing : Math.round(km * 10) / 10,
      });
    });
    withDistance.sort(function (a, b) {
      var da = a.distance_km === null || a.distance_km === undefined ? Infinity : Number(a.distance_km);
      var db = b.distance_km === null || b.distance_km === undefined ? Infinity : Number(b.distance_km);
      if (da !== db) return da - db;
      var na = a.next_available_date || '9999-12-31';
      var nb = b.next_available_date || '9999-12-31';
      if (na !== nb) return na < nb ? -1 : 1;
      return String(a.doctor_name || '').localeCompare(String(b.doctor_name || ''));
    });
    return withDistance;
  }

  /**
   * The words for an empty result, in the plural the patient would use:
   * "No dentists in Kandy yet". `plural` comes from the database
   * (`practitioner_categories.plural_en`), never from a hard-coded list, so
   * a category added by INSERT reads correctly without an app release.
   */
  function emptyStateMessage(state) {
    var s = state || {};
    var who = s.plural || 'practitioners';
    if (s.query) {
      return 'No practitioner or dispensary matches “' + s.query + '”.';
    }
    if (s.town) return 'No ' + who + ' in ' + s.town + ' yet.';
    if (s.district) return 'No ' + who + ' in the ' + s.district + ' district yet.';
    if (s.nearby) return 'No ' + who + ' near you yet.';
    return 'No ' + who + ' listed yet.';
  }

  /** The action that actually fixes an empty result, given what is set. */
  function emptyStateAction(state) {
    var s = state || {};
    if (s.query) return { label: 'Clear the search', clears: ['query'] };
    if (s.town || s.district) return { label: 'Widen the area', clears: ['town', 'district'] };
    if (s.specialty) return { label: 'Any specialty', clears: ['specialty'] };
    if (s.category) return { label: 'Show everyone', clears: ['category'] };
    return { label: 'Reload', clears: [] };
  }

  /** '4.6' + '12 ratings', or null when nobody has rated yet. */
  function formatRating(average, count) {
    var n = Number(count);
    if (!average || !isFinite(Number(average)) || !isFinite(n) || n <= 0) return null;
    return {
      average: Number(average).toFixed(1),
      count: n,
      label: n === 1 ? '1 rating' : n + ' ratings',
    };
  }

  var api = {
    DAY_NAMES: DAY_NAMES,
    haversineKm: haversineKm,
    formatDistance: formatDistance,
    formatTime: formatTime,
    formatNextAvailable: formatNextAvailable,
    formatWeeklySlot: formatWeeklySlot,
    formatRating: formatRating,
    initials: initials,
    photoUrl: photoUrl,
    bookingUrl: bookingUrl,
    profileUrl: profileUrl,
    collapseToNearest: collapseToNearest,
    sortByDistance: sortByDistance,
    emptyStateMessage: emptyStateMessage,
    emptyStateAction: emptyStateAction,
  };

  root.NombaraDirectory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
