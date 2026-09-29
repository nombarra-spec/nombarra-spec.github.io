/* Shared site chrome behaviour: the mobile menu toggle and the footer year.
   Kept out of the HTML so the Content-Security-Policy can forbid every
   inline script and inline event handler. */
(function () {
  'use strict';

  var btn = document.querySelector('.nb-menu');
  var links = document.getElementById('nb-links');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        links.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var yr = document.getElementById('nb-year');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
