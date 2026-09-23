/* Session 44 — one practitioner's public page.
 *
 * Reached from every card on the directory, so the states that matter most
 * are the ones where the link is stale: an id that was never real, or a
 * practitioner who has since been suspended, archived or merged away by the
 * Session 36 de-duplication. `public_practitioner_profile` returns null for
 * all of those, and this page turns null into "we couldn't find that one —
 * here is the directory", never a 404 and never a blank screen.
 */
(function () {
  'use strict';

  var C = window.NombaraDirectory;
  var Api = window.NombaraApi;
  var CONFIG = window.NOMBARA_CONFIG || {};

  if (location.protocol === 'http:' &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    location.replace('https://' + location.host + location.pathname + location.search);
    return;
  }

  var slot = document.getElementById('slot');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function notFound(heading, detail) {
    slot.textContent = '';
    var box = el('div', 'notice');
    box.appendChild(el('h2', null, heading));
    box.appendChild(el('p', null, detail));
    var actions = el('div', 'actions');
    var browse = el('a', 'btn', 'Browse all practitioners');
    browse.href = 'doctors.html';
    actions.appendChild(browse);
    var home = el('a', 'btn btn--ghost', 'Nombara home');
    home.href = 'index.html';
    actions.appendChild(home);
    box.appendChild(actions);
    slot.appendChild(box);
    document.title = heading + ' — Nombara';
  }

  function failed(err) {
    slot.textContent = '';
    var box = el('div', 'notice notice--error');
    box.appendChild(el('h2', null, "Couldn't load this practitioner"));
    box.appendChild(el('p', null,
      ((err && err.friendly) || "Couldn't reach Nombara.") + ' Your connection may have dropped.'));
    var actions = el('div', 'actions');
    var retry = el('button', 'btn', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', start);
    actions.appendChild(retry);
    var browse = el('a', 'btn btn--ghost', 'Browse all practitioners');
    browse.href = 'doctors.html';
    actions.appendChild(browse);
    box.appendChild(actions);
    slot.appendChild(box);
  }

  function skeleton() {
    slot.textContent = '';
    var head = el('div', 'profile__head');
    head.appendChild(el('span', 'avatar skeleton', '··'));
    var who = el('div');
    who.appendChild(el('h1', 'skeleton', 'Loading practitioner'));
    who.appendChild(el('p', 'card__sub skeleton', 'Loading specialty'));
    head.appendChild(who);
    slot.appendChild(head);
    slot.appendChild(el('div', 'loc skeleton', 'Loading where they practise'));
  }

  function avatar(profile) {
    var url = C.photoUrl(CONFIG, profile.photo_path);
    if (url) {
      var img = document.createElement('img');
      img.className = 'avatar';
      img.src = url;
      img.alt = 'Photograph of ' + (profile.doctor_name || 'the practitioner');
      img.width = 88;
      img.height = 88;
      img.addEventListener('error', function () {
        var fallback = el('span', 'avatar', C.initials(profile.doctor_name));
        fallback.setAttribute('aria-hidden', 'true');
        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
      });
      return img;
    }
    var span = el('span', 'avatar', C.initials(profile.doctor_name));
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function locationBlock(loc, profile) {
    var box = el('div', 'loc');
    box.appendChild(el('h3', null, loc.dispensary_name || 'Dispensary'));

    var townText = [loc.town, loc.district ? loc.district + ' district' : null]
      .filter(Boolean).join(', ');
    if (townText) box.appendChild(el('div', 'town', townText));

    var weekly = el('div', 'weekly');
    (loc.weekly || []).forEach(function (slotRow) {
      var label = C.formatWeeklySlot(slotRow);
      if (label) weekly.appendChild(el('span', null, label));
    });
    if (!weekly.childNodes.length) {
      weekly.appendChild(el('span', null, 'Session times are shown in the app'));
    }
    box.appendChild(weekly);

    var next = C.formatNextAvailable(loc.next_available_date, loc.next_available_start);
    box.appendChild(el('div', next ? 'when' : 'when when--none',
      next ? 'Next session: ' + next : 'No session scheduled yet — check the app for the latest times'));

    var book = el('a', 'btn btn--green btn--block', 'Book a token here');
    book.href = C.bookingUrl(CONFIG, {
      dispensary_slug: loc.dispensary_slug,
      doctor_id: profile.doctor_id,
    });
    book.style.marginTop = '.8rem';
    book.setAttribute('aria-label',
      'Book a token with ' + (profile.doctor_name || 'this practitioner') +
      ' at ' + (loc.dispensary_name || 'this dispensary'));
    box.appendChild(book);

    return box;
  }

  function render(profile) {
    slot.textContent = '';

    var name = profile.doctor_name || 'Practitioner';
    document.title = name + ' — Nombara';
    var descriptionParts = [name];
    if (profile.specialty) descriptionParts.push(profile.specialty);
    var firstLocation = (profile.locations || [])[0];
    if (firstLocation && firstLocation.town) descriptionParts.push(firstLocation.town);
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content',
        descriptionParts.join(' · ') + ' — verified on Nombara. Book a numbered token and skip the waiting room.');
    }

    var head = el('div', 'profile__head');
    head.appendChild(avatar(profile));

    var who = el('div');
    who.appendChild(el('h1', null, name));

    var sub = el('p', 'card__sub');
    if (profile.specialty) sub.appendChild(document.createTextNode(profile.specialty + ' '));
    if (profile.category_label) sub.appendChild(el('span', 'tag', profile.category_label));
    who.appendChild(sub);

    if (profile.qualifications) who.appendChild(el('p', 'card__sub', profile.qualifications));

    var rating = C.formatRating(profile.rating_average, profile.rating_count);
    if (rating) {
      var r = el('p', 'card__sub');
      r.appendChild(el('span', 'rating', '★ ' + rating.average));
      r.appendChild(el('span', 'of', ' · ' + rating.label + ' from patients who were seen'));
      who.appendChild(r);
    }

    head.appendChild(who);
    slot.appendChild(head);

    if (profile.bio) slot.appendChild(el('p', 'profile__bio', profile.bio));

    var locations = profile.locations || [];
    slot.appendChild(el('h2', null,
      locations.length === 1 ? 'Where they practise' : 'Where they practise (' + locations.length + ')'));

    if (!locations.length) {
      var none = el('div', 'notice');
      none.appendChild(el('h2', null, 'No dispensary listed yet'));
      none.appendChild(el('p', null,
        'This practitioner is verified but has no published sessions right now.'));
      var back = el('a', 'btn', 'Browse all practitioners');
      back.href = 'doctors.html';
      var actions = el('div', 'actions');
      actions.appendChild(back);
      none.appendChild(actions);
      slot.appendChild(none);
    } else {
      locations.forEach(function (loc) { slot.appendChild(locationBlock(loc, profile)); });
    }

    var note = el('div', 'callout');
    note.appendChild(el('p', null,
      'Nombara verifies every practitioner against their professional register before '
      + 'listing them. Booking and doctor’s fees are paid in cash at the dispensary counter.'));
    slot.appendChild(note);

    addStructuredData(profile);
  }

  /* schema.org Physician, so a "dentist in Kandy" search can surface the page.
     Only the fields the public view already exposes go in here. */
  function addStructuredData(profile) {
    var first = (profile.locations || [])[0];
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Physician',
      name: profile.doctor_name,
      medicalSpecialty: profile.specialty || undefined,
      url: location.href,
    };
    if (profile.photo_path) data.image = C.photoUrl(CONFIG, profile.photo_path);
    if (first) {
      data.address = {
        '@type': 'PostalAddress',
        addressLocality: first.town || undefined,
        addressRegion: first.district || undefined,
        addressCountry: 'LK',
      };
      data.worksFor = { '@type': 'MedicalClinic', name: first.dispensary_name };
    }
    var rating = C.formatRating(profile.rating_average, profile.rating_count);
    if (rating) {
      data.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: rating.average,
        reviewCount: rating.count,
        bestRating: '5',
      };
    }
    var tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.textContent = JSON.stringify(data);
    document.head.appendChild(tag);
  }

  /* `doctor.html?id=<uuid>` is the always-works form. A pre-rendered build
     also serves `doctor/<uuid>/index.html`, where the id is the last path
     segment — read both so either entry point resolves. */
  function doctorIdFromLocation() {
    var fromQuery = new URLSearchParams(location.search).get('id') || '';
    if (UUID.test(fromQuery)) return fromQuery;
    var segments = location.pathname.split('/').filter(Boolean);
    var last = segments[segments.length - 1] || '';
    return UUID.test(last) ? last : fromQuery;
  }

  function start() {
    var id = doctorIdFromLocation();
    if (!UUID.test(id)) {
      notFound('We couldn’t find that practitioner',
        'The link looks incomplete. Browse the directory and pick them from the list.');
      return;
    }

    skeleton();
    Api.profile(id).then(function (profile) {
      if (!profile || !profile.doctor_id) {
        notFound('That practitioner isn’t listed',
          'They may have stopped practising at a Nombara dispensary, or the link is out of date. '
          + 'Everyone currently listed is one tap away.');
        return;
      }
      render(profile);
    }).catch(failed);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
