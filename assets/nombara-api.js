/* Session 44 — the read-only Supabase client the public site uses.
 *
 * Deliberately a thin `fetch` wrapper over PostgREST rather than the
 * supabase-js bundle from a CDN. Three reasons, all of them the "no broken
 * pages" requirement:
 *
 *   1. A third-party script tag is a second thing that can fail to load; if
 *      it does, the page is blank before any of our error handling runs.
 *      With plain fetch the only network call is the data call, and that one
 *      has a retry button.
 *   2. It is the same HTTP API supabase-js speaks — same anon key, same
 *      row-level security, same `public_practitioners` view. Nothing is
 *      bypassed by talking to it directly.
 *   3. ~2 kB instead of ~40 kB on a page people open on mobile data.
 *
 * Everything here is a READ. There is no insert/update path on the public
 * site, and the key it carries cannot perform one.
 */
(function (root) {
  'use strict';

  var CONFIG = root.NOMBARA_CONFIG || {};
  var TIMEOUT_MS = 12000;

  function restUrl(path) {
    return String(CONFIG.supabaseUrl || '').replace(/\/+$/, '') + '/rest/v1/' + path;
  }

  function cacheKey(name, params) {
    return 'nombara:' + name + ':' + JSON.stringify(params || {});
  }

  function readCache(key) {
    try {
      var raw = root.sessionStorage && root.sessionStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var ttl = (CONFIG.cacheSeconds || 300) * 1000;
      if (!parsed || Date.now() - parsed.at > ttl) return null;
      return parsed.value;
    } catch (_) {
      /* Private mode, disabled storage, corrupt entry — caching is an
         optimisation, never a requirement. */
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      root.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value: value }));
    } catch (_) { /* quota or private mode: ignore */ }
  }

  /**
   * Calls a Postgres function through PostgREST. Rejects with an Error
   * carrying a human-readable `.friendly` message — the page never prints a
   * raw PostgREST payload at a visitor.
   */
  function rpc(name, params, options) {
    var opts = options || {};
    var key = cacheKey(name, params);

    if (!opts.noCache) {
      var hit = readCache(key);
      if (hit !== null) return Promise.resolve(hit);
    }

    if (!CONFIG.supabaseUrl || !CONFIG.anonKey) {
      var misconfigured = new Error('Missing Supabase configuration');
      misconfigured.friendly = "The directory isn't configured yet.";
      return Promise.reject(misconfigured);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    return fetch(restUrl('rpc/' + name), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.anonKey,
        Authorization: 'Bearer ' + CONFIG.anonKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(params || {}),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            var err = new Error('HTTP ' + res.status + ': ' + body.slice(0, 200));
            err.friendly = res.status >= 500
              ? "Nombara's directory is having a moment."
              : "Couldn't load the directory.";
            throw err;
          });
        }
        return res.json();
      })
      .then(function (value) {
        writeCache(key, value);
        return value;
      })
      .catch(function (err) {
        if (err && err.friendly) throw err;
        var wrapped = new Error(String((err && err.message) || err));
        wrapped.friendly = (err && err.name === 'AbortError')
          ? 'That took too long.'
          : "Couldn't reach Nombara.";
        throw wrapped;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  root.NombaraApi = {
    config: CONFIG,

    /** The directory list, already filtered, distance-sorted and paged. */
    search: function (params) {
      return rpc('search_public_practitioners', {
        p_lat: params.lat != null ? params.lat : null,
        p_lng: params.lng != null ? params.lng : null,
        p_category: params.category || null,
        p_town: params.town || null,
        p_district: params.district || null,
        p_specialty: params.specialty || null,
        p_query: params.query || null,
        p_limit: params.limit || 24,
        p_offset: params.offset || 0,
      }, { noCache: params.noCache }).then(function (rows) {
        return Array.isArray(rows) ? rows : [];
      });
    },

    /** Categories, towns and specialties that actually have practitioners. */
    filters: function () {
      return rpc('public_directory_filters', {}).then(function (value) {
        return value || { total: 0, categories: [], towns: [], specialties: [] };
      });
    },

    /** One practitioner, or null when the id is unknown/unlisted. */
    profile: function (doctorId) {
      return rpc('public_practitioner_profile', { p_doctor_id: doctorId })
        .then(function (value) { return value || null; });
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
