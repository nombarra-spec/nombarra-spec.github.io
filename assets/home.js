/* Landing page behaviour.
 *
 *   - The "Meet the doctors" rail, live from the public register (the same
 *     `search_public_practitioners` RPC the directory uses). A practitioner
 *     appears the moment the CEO verifies them — nothing on this page is
 *     hand-maintained.
 *   - Area hotlines and store buttons, switched on from assets/config.js.
 *   - The "List your practice" form, which opens the visitor's own email app
 *     (nothing is posted to or stored by this website).
 *   - The phone mock's little now-serving animation.
 *
 * Every value that came from the database is written with textContent /
 * setAttribute — never innerHTML — so a name or town can't inject markup.
 */
(function () {
  'use strict';

  var CONFIG = window.NOMBARA_CONFIG || {};
  var core = window.NombaraDirectory;
  var api = window.NombaraApi;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ------------------------------------------------------------ doctors rail */

  var rail = document.getElementById('rail');
  var railMsg = document.getElementById('railMsg');
  var arrows = document.getElementById('railArrows');

  if (arrows) {
    arrows.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-dir]');
      if (b && rail) rail.scrollBy({ left: Number(b.getAttribute('data-dir')) * 320, behavior: 'smooth' });
    });
  }

  function docCard(row) {
    var li = el('li', 'doc');
    var top = el('div', 'doc-top');
    var av = el('div', 'avatar');
    var photo = core.photoUrl(CONFIG, row.photo_path);
    if (photo) {
      var img = document.createElement('img');
      img.src = photo;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () { av.textContent = core.initials(row.doctor_name); });
      av.appendChild(img);
    } else {
      av.textContent = core.initials(row.doctor_name);
    }
    av.setAttribute('aria-hidden', 'true');
    top.appendChild(av);

    var who = el('div');
    var h = el('h3');
    var link = el('a', null, row.doctor_name || 'Practitioner');
    link.href = core.profileUrl(row, CONFIG);
    h.appendChild(link);
    who.appendChild(h);
    who.appendChild(el('div', 'spec', row.specialty || row.category_label || ''));
    top.appendChild(who);
    li.appendChild(top);

    var meta = el('div', 'meta');
    var where = [row.dispensary_name, row.town].filter(Boolean).join(' · ');
    meta.appendChild(el('div', null, where));
    if (row.other_locations > 0) {
      meta.appendChild(el('div', null, 'Also at ' + row.other_locations + ' more place' + (row.other_locations === 1 ? '' : 's')));
    }
    var rating = core.formatRating(row.rating_average, row.rating_count);
    if (rating) {
      var r = el('div');
      r.appendChild(el('span', 'stars', '★ ' + rating.average));
      r.appendChild(document.createTextNode(' · ' + rating.label));
      meta.appendChild(r);
    }
    li.appendChild(meta);

    var next = core.formatNextAvailable(row.next_available_date, row.next_available_start);
    li.appendChild(el('div', next ? 'avail' : 'avail none', next ? 'Next: ' + next : 'Session times in the app'));

    var acts = el('div', 'acts');
    var profile = el('a', 'nb-btn nb-btn-primary', 'View profile');
    profile.href = core.profileUrl(row, CONFIG);
    profile.setAttribute('aria-label', 'View the profile of ' + (row.doctor_name || 'practitioner'));
    var app = el('a', 'nb-btn nb-btn-ghost', 'Book in app');
    app.href = core.appDownloadUrl(CONFIG, navigator.userAgent);
    app.setAttribute('aria-label', 'Download the Nombara app to book ' + (row.doctor_name || 'practitioner'));
    acts.appendChild(profile);
    acts.appendChild(app);
    li.appendChild(acts);
    return li;
  }

  function showRailMessage(text, retry) {
    rail.textContent = '';
    rail.hidden = true;
    if (arrows) arrows.hidden = true;
    railMsg.textContent = '';
    var box = el('div', 'rail-msg');
    box.appendChild(el('p', null, text));
    if (retry) {
      var b = el('button', 'nb-btn nb-btn-ghost', 'Try again');
      b.type = 'button';
      b.addEventListener('click', function () { loadRail(true); });
      box.appendChild(b);
    }
    railMsg.appendChild(box);
  }

  function loadRail(noCache) {
    if (!rail || !core || !api) return;
    rail.hidden = false;
    railMsg.textContent = '';
    rail.setAttribute('aria-busy', 'true');
    api.search({ limit: 24, noCache: !!noCache })
      .then(function (rows) {
        var docs = core.collapseToNearest(rows).slice(0, 12);
        rail.setAttribute('aria-busy', 'false');
        if (!docs.length) {
          showRailMessage('New practitioners are being verified right now — check back soon.', false);
          return;
        }
        rail.textContent = '';
        docs.forEach(function (row) { rail.appendChild(docCard(row)); });
        if (arrows) arrows.hidden = docs.length < 3;
      })
      .catch(function (err) {
        rail.setAttribute('aria-busy', 'false');
        showRailMessage(((err && err.friendly) || "Couldn't load practitioners.") + ' You can still browse the full list.', true);
      });

    if (api.filters) {
      api.filters().then(function (f) {
        var total = f && Number(f.total);
        if (total > 0) {
          document.getElementById('docCount').textContent = String(total);
          document.getElementById('docCountLbl').textContent = total === 1 ? 'verified practitioner' : 'verified practitioners';
        }
        renderBrowseChips(f);
      }).catch(function () { /* keep the static metric */ });
    }
  }

  /* "By field" / "By area" — live from the register, so every button leads
     to at least one practitioner. The static buttons in the HTML stay if
     this can't load. */
  function chip(href, label, count) {
    var a = el('a', 'chip', label);
    a.href = href;
    if (count > 0) a.appendChild(el('span', 'n', String(count)));
    return a;
  }

  function renderBrowseChips(f) {
    if (!f) return;
    var field = document.getElementById('fieldChips');
    var area = document.getElementById('areaChips');
    var cats = (f.categories || []).filter(function (c) { return c && c.code && c.count > 0; });
    var specs = (f.specialties || []).filter(function (s) { return s && s.specialty && s.count > 0; });
    if (field && (cats.length > 1 || specs.length)) {
      field.textContent = '';
      if (cats.length > 1) {
        cats.forEach(function (c) {
          field.appendChild(chip('doctors.html?category=' + encodeURIComponent(c.code), c.label || c.code, c.count));
        });
      }
      specs.forEach(function (s) {
        field.appendChild(chip('doctors.html?specialty=' + encodeURIComponent(s.specialty), s.specialty, s.count));
      });
    }
    var towns = (f.towns || []).filter(function (t) { return t && t.town && t.count > 0; });
    if (area && towns.length) {
      area.textContent = '';
      area.appendChild(chip('doctors.html', 'All areas', 0));
      towns.forEach(function (t) {
        area.appendChild(chip('doctors.html?town=' + encodeURIComponent(t.town), t.town, t.count));
      });
    }
  }

  loadRail(false);

  /* ------------------------------------------------------------ hotlines */

  function digits(s) { return String(s || '').replace(/[^\d+]/g, ''); }

  var hotlines = Array.isArray(CONFIG.hotlines) ? CONFIG.hotlines.filter(function (h) {
    return h && h.area && digits(h.phone).length >= 9;
  }) : [];
  var firstWa = null;

  if (hotlines.length) {
    var list = document.getElementById('hotlineList');
    hotlines.forEach(function (h) {
      var li = el('li');
      li.appendChild(el('div', 'area', h.area));
      var row = el('div', 'row');
      var call = el('a', null, 'Call ' + h.phone);
      call.href = 'tel:' + digits(h.phone);
      row.appendChild(call);
      var wa = digits(h.whatsapp).replace(/^\+/, '');
      if (wa.length >= 9) {
        var w = el('a', null, 'WhatsApp');
        w.href = 'https://wa.me/' + wa;
        w.rel = 'noopener noreferrer';
        w.target = '_blank';
        row.appendChild(w);
        if (!firstWa) firstWa = wa;
      }
      li.appendChild(row);
      if (h.hours) li.appendChild(el('div', 'hrs', h.hours));
      list.appendChild(li);
    });
    document.getElementById('hotlineCard').hidden = false;
  }

  /* ------------------------------------------------------------ stores */

  function https(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }
  var stores = CONFIG.stores || {};
  var play = https(stores.playStore);
  var ios = https(stores.appStore);
  if (play) { var p = document.getElementById('playBtn'); p.href = play; p.hidden = false; }
  if (ios) { var i = document.getElementById('iosBtn'); i.href = ios; i.hidden = false; }
  if (play || ios) document.getElementById('storeSoon').hidden = true;
  if (play && ios) document.getElementById('webBtn').hidden = true;

  /* ------------------------------------------------------------ join form */

  var email = (CONFIG.contact && CONFIG.contact.email) || 'nombara@naazglobalcorp.com';
  var form = document.getElementById('join');
  var contacts = document.getElementById('joinContacts');

  if (contacts && hotlines.length) {
    var c = el('a', null, 'Call');
    c.href = 'tel:' + digits(hotlines[0].phone);
    contacts.insertBefore(c, contacts.firstChild);
    if (firstWa) {
      var w2 = el('a', null, 'WhatsApp');
      w2.href = 'https://wa.me/' + firstWa;
      w2.rel = 'noopener noreferrer';
      w2.target = '_blank';
      contacts.appendChild(w2);
    }
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (id) { return String(document.getElementById(id).value || '').trim().slice(0, 120); };
      var name = v('jName'), phone = v('jPhone'), role = v('jRole'), place = v('jPlace');
      var err = document.getElementById('joinErr');
      if (!name || digits(phone).length < 9) {
        err.textContent = 'Please enter your name and a phone number we can call.';
        err.hidden = false;
        return;
      }
      err.hidden = true;
      var body = 'Nombara sign-up\n\nName: ' + name + '\nPhone: ' + phone + '\nRole: ' + role + '\nTown / dispensary: ' + (place || '-');
      window.location.href = 'mailto:' + email
        + '?subject=' + encodeURIComponent('List my practice on Nombara')
        + '&body=' + encodeURIComponent(body);
    });
  }

  /* ------------------------------------------------------------ phone mock */

  if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var s = document.getElementById('serv'), vl = document.getElementById('vln');
    var a = document.getElementById('ah'), wt = document.getElementById('wt');
    var n = 11, ahead = 3, wait = 24;
    var t = setInterval(function () {
      if (n >= 14) { clearInterval(t); return; }
      n++; ahead--; wait -= 8;
      s.textContent = n;
      vl.textContent = '“Next token ' + n + '”';
      a.textContent = ahead === 0 ? "It's your turn" : ahead + ' patient' + (ahead === 1 ? '' : 's') + ' ahead of you';
      wt.textContent = ahead === 0 ? 'Now' : '~' + Math.max(wait, 4) + 'm';
    }, 1500);
  }
})();
