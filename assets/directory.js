/* Session 44 — the doctor directory page.
 *
 * Owns the DOM and the four states a visitor can be in, all of which are
 * DESIGNED states and none of which is a blank page:
 *
 *   loading  → skeleton cards in the shape of the real ones
 *   results  → real practitioners, nearest first
 *   empty    → a sentence in the plural the patient uses, plus the one
 *              button that actually fixes it ("Widen the area")
 *   failed   → "Couldn't load doctors" + Retry, never a raw error
 *
 * Filter state lives in the URL, so a filtered list is shareable, the back
 * button works, and a link like `doctors.html?category=dental&town=Kandy`
 * (which the pre-render writes into the sitemap) opens exactly that list.
 */
(function () {
  'use strict';

  var C = window.NombaraDirectory;
  var Api = window.NombaraApi;
  var CONFIG = window.NOMBARA_CONFIG || {};
  var PAGE_SIZE = 24;

  /* HTTPS only. GitHub Pages already redirects, but a custom domain mid-
     migration might not, and the geolocation API refuses to run on http
     anyway. */
  if (location.protocol === 'http:' &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    location.replace('https://' + location.host + location.pathname + location.search);
    return;
  }

  var els = {
    search: document.getElementById('search'),
    nearMe: document.getElementById('nearMe'),
    nearMeLabel: document.getElementById('nearMeLabel'),
    town: document.getElementById('town'),
    specialty: document.getElementById('specialty'),
    chips: document.getElementById('categoryChips'),
    results: document.getElementById('results'),
    status: document.getElementById('status'),
    stateSlot: document.getElementById('stateSlot'),
    moreSlot: document.getElementById('moreSlot'),
    heroCount: document.getElementById('heroCount'),
  };

  var state = {
    query: '', category: '', town: '', district: '', specialty: '',
    lat: null, lng: null, locationLabel: '',
    offset: 0, total: 0, rows: [], filters: null, requestId: 0,
  };

  // ------------------------------------------------------------------ URL

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.query = p.get('q') || '';
    state.category = p.get('category') || '';
    state.town = p.get('town') || '';
    state.district = p.get('district') || '';
    state.specialty = p.get('specialty') || '';
    var near = p.get('near');
    if (near && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(near)) {
      var parts = near.split(',');
      state.lat = Number(parts[0]);
      state.lng = Number(parts[1]);
    }
  }

  function writeUrl(replace) {
    var p = new URLSearchParams();
    if (state.query) p.set('q', state.query);
    if (state.category) p.set('category', state.category);
    if (state.town) p.set('town', state.town);
    if (state.district) p.set('district', state.district);
    if (state.specialty) p.set('specialty', state.specialty);
    if (state.lat != null && state.lng != null) {
      p.set('near', state.lat.toFixed(4) + ',' + state.lng.toFixed(4));
    }
    var url = location.pathname + (p.toString() ? '?' + p.toString() : '');
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

  // ------------------------------------------------------------- fragments

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function avatar(row) {
    var url = C.photoUrl(CONFIG, row.photo_path);
    if (url) {
      var img = document.createElement('img');
      img.className = 'avatar';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 56;
      img.height = 56;
      /* A photo that 404s (a deleted object, a CDN hiccup) must not leave a
         broken-image glyph on the card — swap in the initials. */
      img.addEventListener('error', function () {
        var fallback = el('span', 'avatar', C.initials(row.doctor_name));
        fallback.setAttribute('aria-hidden', 'true');
        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
      });
      return img;
    }
    var span = el('span', 'avatar', C.initials(row.doctor_name));
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function card(row) {
    var li = el('li', 'card');

    var head = el('div', 'card__head');
    head.appendChild(avatar(row));

    var who = el('div');
    var h3 = el('h3', 'card__name');
    var link = el('a', null, row.doctor_name || 'Practitioner');
    link.href = C.profileUrl(row, CONFIG);
    h3.appendChild(link);
    who.appendChild(h3);

    var sub = el('p', 'card__sub');
    if (row.specialty) sub.appendChild(document.createTextNode(row.specialty + ' '));
    if (row.category_label && row.category !== 'medical') {
      sub.appendChild(el('span', 'tag', row.category_label));
    } else if (!row.specialty) {
      sub.appendChild(document.createTextNode(row.category_label || 'Practitioner'));
    }
    who.appendChild(sub);

    var rating = C.formatRating(row.rating_average, row.rating_count);
    if (rating) {
      var r = el('p', 'card__sub');
      r.appendChild(el('span', 'rating', '★ ' + rating.average));
      r.appendChild(el('span', 'of', ' · ' + rating.label));
      who.appendChild(r);
    }

    head.appendChild(who);
    li.appendChild(head);

    var meta = el('div', 'card__meta');

    var whereText = row.dispensary_name || 'Dispensary';
    if (row.town) whereText += ', ' + row.town;
    var where = el('div', 'where', whereText);
    if (row.distance_km != null) {
      where.appendChild(document.createTextNode(' '));
      where.appendChild(el('span', 'dist', '· ' + C.formatDistance(row.distance_km)));
    }
    meta.appendChild(where);

    var next = C.formatNextAvailable(row.next_available_date, row.next_available_start);
    if (next) {
      meta.appendChild(el('div', 'when', 'Next: ' + next));
    } else {
      meta.appendChild(el('div', 'when when--none', 'Times are shown in the app'));
    }

    if (row.other_locations > 0) {
      var more = el('a', 'more-link');
      more.href = C.profileUrl(row, CONFIG);
      more.textContent = row.other_locations === 1
        ? 'Also sits at 1 more dispensary'
        : 'Also sits at ' + row.other_locations + ' more dispensaries';
      meta.appendChild(more);
    }

    li.appendChild(meta);

    var actions = el('div', 'card__actions');
    var book = el('a', 'btn btn--green', 'Book a token');
    book.href = C.bookingUrl(CONFIG, row);
    book.setAttribute('aria-label', 'Book a token with ' + (row.doctor_name || 'this practitioner'));
    actions.appendChild(book);

    var profile = el('a', 'btn btn--ghost', 'Profile');
    profile.href = C.profileUrl(row, CONFIG);
    actions.appendChild(profile);

    li.appendChild(actions);
    return li;
  }

  function skeletonCard() {
    var li = el('li', 'card');
    var head = el('div', 'card__head');
    head.appendChild(el('span', 'avatar skeleton', '··'));
    var who = el('div');
    who.appendChild(el('h3', 'card__name skeleton', 'Loading practitioner'));
    who.appendChild(el('p', 'card__sub skeleton', 'Loading specialty'));
    head.appendChild(who);
    li.appendChild(head);
    var meta = el('div', 'card__meta');
    meta.appendChild(el('div', 'skeleton', 'Loading dispensary, town'));
    meta.appendChild(el('div', 'skeleton', 'Loading next session'));
    li.appendChild(meta);
    return li;
  }

  // ---------------------------------------------------------------- states

  function clearSlots() {
    els.stateSlot.textContent = '';
    els.moreSlot.textContent = '';
  }

  function showSkeletons() {
    clearSlots();
    els.results.textContent = '';
    els.results.setAttribute('aria-busy', 'true');
    for (var i = 0; i < 6; i++) els.results.appendChild(skeletonCard());
    els.status.textContent = 'Loading practitioners…';
  }

  function showEmpty() {
    var plural = 'practitioners';
    if (state.filters && state.category) {
      (state.filters.categories || []).forEach(function (c) {
        if (c.code === state.category && c.plural) plural = c.plural;
      });
    }
    var message = C.emptyStateMessage({
      plural: plural,
      query: state.query,
      town: state.town,
      district: state.district,
      nearby: state.lat != null,
    });
    var action = C.emptyStateAction(state);

    var box = el('div', 'notice');
    box.appendChild(el('h2', null, message));
    box.appendChild(el('p', null,
      'Nombara is still signing dispensaries up across Sri Lanka. Try a wider area — or search a name, which looks everywhere.'));

    var actions = el('div', 'actions');
    var fix = el('button', 'btn', action.label);
    fix.type = 'button';
    fix.addEventListener('click', function () {
      action.clears.forEach(function (key) { state[key] = ''; });
      if (action.clears.indexOf('query') !== -1 && els.search) els.search.value = '';
      syncControls();
      reload();
    });
    actions.appendChild(fix);

    if (action.clears.length) {
      var all = el('button', 'btn btn--ghost', 'Show every practitioner');
      all.type = 'button';
      all.addEventListener('click', function () {
        state.query = state.category = state.town = state.district = state.specialty = '';
        if (els.search) els.search.value = '';
        syncControls();
        reload();
      });
      actions.appendChild(all);
    }
    box.appendChild(actions);
    els.stateSlot.appendChild(box);
  }

  function showError(err) {
    els.results.textContent = '';
    clearSlots();
    var box = el('div', 'notice notice--error');
    box.appendChild(el('h2', null, "Couldn't load doctors"));
    box.appendChild(el('p', null,
      ((err && err.friendly) || "Couldn't reach Nombara.") + ' Your connection may have dropped.'));
    var actions = el('div', 'actions');
    var retry = el('button', 'btn', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', function () { reload({ noCache: true }); });
    actions.appendChild(retry);
    var home = el('a', 'btn btn--ghost', 'Back to Nombara');
    home.href = 'index.html';
    actions.appendChild(home);
    box.appendChild(actions);
    els.stateSlot.appendChild(box);
    els.status.textContent = '';
  }

  function showStatus(shown) {
    var bits = [];
    bits.push(shown === 1 ? '1 practitioner' : shown + ' practitioners');
    if (state.query) bits.push('matching “' + state.query + '”');
    else if (state.lat != null) bits.push('nearest first' + (state.locationLabel ? ' from ' + state.locationLabel : ''));
    else if (state.town) bits.push('in ' + state.town);
    els.status.textContent = bits.join(' · ');

    if (state.query && (state.category || state.town || state.specialty)) {
      els.status.appendChild(document.createTextNode(' '));
      els.status.appendChild(el('span', null,
        '— a search looks across all of Sri Lanka, so your filters sort rather than hide.'));
    }
  }

  // ----------------------------------------------------------------- fetch

  function reload(options) {
    state.offset = 0;
    state.rows = [];
    load(options || {}, true);
  }

  function load(options, replaceList) {
    var opts = options || {};
    var id = ++state.requestId;
    if (replaceList) showSkeletons();

    Api.search({
      lat: state.lat, lng: state.lng,
      category: state.category, town: state.town, district: state.district,
      specialty: state.specialty, query: state.query,
      limit: PAGE_SIZE, offset: state.offset,
      noCache: opts.noCache,
    }).then(function (rows) {
      if (id !== state.requestId) return;                 // a newer keystroke won
      els.results.removeAttribute('aria-busy');
      state.rows = replaceList ? rows : state.rows.concat(rows);
      state.total = rows.length ? Number(rows[0].total_count) || state.rows.length : state.rows.length;
      render();
    }).catch(function (err) {
      if (id !== state.requestId) return;
      els.results.removeAttribute('aria-busy');
      showError(err);
    });
  }

  function render() {
    clearSlots();
    els.results.textContent = '';

    var cards = C.collapseToNearest(state.rows);
    if (!cards.length) {
      els.status.textContent = '';
      showEmpty();
      return;
    }

    cards.forEach(function (row) { els.results.appendChild(card(row)); });
    showStatus(cards.length);

    if (state.rows.length < state.total) {
      var more = el('button', 'btn btn--ghost', 'Show more');
      more.type = 'button';
      more.addEventListener('click', function () {
        more.disabled = true;
        more.textContent = 'Loading…';
        state.offset = state.rows.length;
        load({}, false);
      });
      els.moreSlot.appendChild(more);
    }
  }

  // ------------------------------------------------------------ the filters

  function syncControls() {
    if (els.search) els.search.value = state.query;
    if (els.town) els.town.value = state.town;
    if (els.specialty) els.specialty.value = state.specialty;
    Array.prototype.forEach.call(els.chips.querySelectorAll('.chip'), function (chip) {
      chip.setAttribute('aria-pressed', String(chip.dataset.code === state.category));
    });
    els.nearMeLabel.textContent = state.lat != null ? 'Nearest first ✓' : 'Sort by nearest';
  }

  function buildFilters(filters) {
    state.filters = filters;

    if (filters.total) {
      els.heroCount.textContent = filters.total === 1
        ? '1 practitioner listed right now.'
        : filters.total + ' practitioners listed right now.';
    }

    els.chips.textContent = '';
    var all = el('button', 'chip', 'Everyone');
    all.type = 'button';
    all.dataset.code = '';
    all.addEventListener('click', function () { state.category = ''; onFilterChange(); });
    els.chips.appendChild(all);

    (filters.categories || []).forEach(function (c) {
      var chip = el('button', 'chip', c.label || c.code);
      chip.type = 'button';
      chip.dataset.code = c.code;
      chip.appendChild(document.createTextNode(' '));
      chip.appendChild(el('span', 'n', String(c.count)));
      chip.addEventListener('click', function () {
        state.category = (state.category === c.code) ? '' : c.code;
        onFilterChange();
      });
      els.chips.appendChild(chip);
    });

    /* Towns are grouped by district so "Kandy" the town and "Kandy" the
       district never look like the same choice. */
    els.town.textContent = '';
    els.town.appendChild(new Option('Any town', ''));
    var groups = {};
    (filters.towns || []).forEach(function (t) {
      var key = t.district || 'Sri Lanka';
      if (!groups[key]) {
        groups[key] = document.createElement('optgroup');
        groups[key].label = key + ' district';
        els.town.appendChild(groups[key]);
      }
      groups[key].appendChild(new Option(t.town + ' (' + t.count + ')', t.town));
    });

    els.specialty.textContent = '';
    els.specialty.appendChild(new Option('Any specialty', ''));
    var seen = {};
    (filters.specialties || []).forEach(function (s) {
      if (!s.specialty || seen[s.specialty]) return;
      seen[s.specialty] = true;
      els.specialty.appendChild(new Option(s.specialty, s.specialty));
    });

    syncControls();
  }

  function onFilterChange() {
    syncControls();
    writeUrl(false);
    reload();
  }

  // ---------------------------------------------------------------- location

  var LOCATION_KEY = 'nombara:location';

  function rememberLocation(lat, lng, label) {
    state.lat = lat; state.lng = lng; state.locationLabel = label || '';
    try {
      sessionStorage.setItem(LOCATION_KEY, JSON.stringify({ lat: lat, lng: lng, label: label || '' }));
    } catch (_) { /* fine — it just won't survive a reload */ }
  }

  function restoreLocation() {
    if (state.lat != null) return;                        // the URL already said where
    try {
      var raw = sessionStorage.getItem(LOCATION_KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && isFinite(v.lat) && isFinite(v.lng)) {
        state.lat = v.lat; state.lng = v.lng; state.locationLabel = v.label || '';
      }
    } catch (_) { /* ignore */ }
  }

  function askForLocation() {
    if (state.lat != null) {                              // a second tap turns it off
      state.lat = state.lng = null;
      state.locationLabel = '';
      try { sessionStorage.removeItem(LOCATION_KEY); } catch (_) {}
      onFilterChange();
      return;
    }

    if (!navigator.geolocation) { fallBackToTown('This browser has no location support.'); return; }

    els.nearMeLabel.textContent = 'Locating…';
    els.nearMe.disabled = true;

    navigator.geolocation.getCurrentPosition(function (pos) {
      els.nearMe.disabled = false;
      rememberLocation(
        Math.round(pos.coords.latitude * 10000) / 10000,
        Math.round(pos.coords.longitude * 10000) / 10000,
        'your location'
      );
      onFilterChange();
    }, function () {
      /* Declined, or the device simply couldn't get a fix. Either way the
         directory still works — the visitor picks a town instead. */
      els.nearMe.disabled = false;
      els.nearMeLabel.textContent = 'Sort by nearest';
      fallBackToTown('No problem — pick your town instead and we’ll sort from there.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  function fallBackToTown(message) {
    clearSlots();
    var box = el('div', 'callout');
    box.appendChild(el('p', null, message));
    els.stateSlot.appendChild(box);
    if (els.town) {
      els.town.focus();
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 9000);
    }
  }

  /* Picking a town also gives us a point to measure from, so distances
     appear even for a visitor who declined GPS. */
  function townCoordinates(town) {
    if (!town || !state.filters) return null;
    var found = null;
    (state.filters.towns || []).forEach(function (t) {
      if (t.town === town && isFinite(t.latitude) && isFinite(t.longitude)) found = t;
    });
    return found;
  }

  // -------------------------------------------------------------------- go

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function bind() {
    els.search.addEventListener('input', debounce(function () {
      state.query = els.search.value.trim();
      writeUrl(true);
      reload();
    }, 260));

    els.search.addEventListener('search', function () {
      state.query = els.search.value.trim();
      writeUrl(true);
      reload();
    });

    els.town.addEventListener('change', function () {
      state.town = els.town.value;
      state.district = '';
      var point = townCoordinates(state.town);
      if (point && state.lat == null) {
        /* Not a GPS fix — just a centre to measure from, so the list can
           still say "2.3 km". Not remembered as "your location". */
        state.lat = Number(point.latitude);
        state.lng = Number(point.longitude);
        state.locationLabel = state.town;
      } else if (!state.town && state.locationLabel && state.locationLabel !== 'your location') {
        state.lat = state.lng = null;
        state.locationLabel = '';
      }
      onFilterChange();
    });

    els.specialty.addEventListener('change', function () {
      state.specialty = els.specialty.value;
      onFilterChange();
    });

    els.nearMe.addEventListener('click', askForLocation);

    window.addEventListener('popstate', function () {
      readUrl();
      syncControls();
      reload();
    });
  }

  function start() {
    readUrl();
    restoreLocation();
    bind();
    /* Reflect the URL in the controls before anything is fetched — arriving
       at `doctors.html?q=perera` must show "perera" in the box straight
       away, not once the filter vocabulary happens to come back. */
    syncControls();
    showSkeletons();

    /* The filter vocabulary and the first page are independent — fetch both
       at once, and don't let a failed filter fetch take the list down with
       it (the chips just stay minimal). */
    Api.filters().then(buildFilters).catch(function () {
      els.chips.textContent = '';
      syncControls();
    });

    load({}, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
