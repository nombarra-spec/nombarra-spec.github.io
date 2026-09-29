/* /d/ deep-link landing: open the installed app, else route to the store or
   the browser booking app. Kept out of index.html so the CSP can forbid
   inline scripts. */
(function () {
  'use strict';

  var CONFIG = window.NOMBARA_CONFIG || {};
  var stores = CONFIG.stores || {};
  var PLAY_PACKAGE = 'com.nombara.nombara';
  var HOME_DOWNLOAD = location.origin + '/index.html#get-app';   // booking is app-only

  var parts = location.pathname.split('/').filter(Boolean);   // ["d", "<slug>"]
  var qs = new URLSearchParams(location.search);
  var slug = (parts[0] === 'd' && parts[1]) ? decodeURIComponent(parts[1]) : (qs.get('d') || '');
  var doc = qs.get('doc') || '';

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua);

  var scheme = 'nombara://d/' + encodeURIComponent(slug) + (doc ? '?doc=' + encodeURIComponent(doc) : '');
  var referrer = encodeURIComponent('d=' + slug + (doc ? '&doc=' + doc : ''));
  var play = 'https://play.google.com/store/apps/details?id=' + PLAY_PACKAGE + '&referrer=' + referrer;
  var appStore = /^https:\/\/apps\.apple\.com\//.test(stores.appStore || '') ? stores.appStore : '';
  var store = isIOS ? appStore : play;

  var getApp = document.getElementById('getApp');
  getApp.href = store || HOME_DOWNLOAD;

  function openApp() {
    var start = Date.now();
    // Verified App/Universal Links already intercepted this URL if installed;
    // this scheme hop covers the unverified-iOS / pre-entitlement case.
    window.location.href = scheme;
    setTimeout(function () {
      if (Date.now() - start < 2100 && !document.hidden) window.location.href = store || HOME_DOWNLOAD;
    }, 1600);
  }
  document.getElementById('openApp').addEventListener('click', function (e) {
    e.preventDefault(); openApp();
  });

  if (!slug) {
    document.getElementById('title').textContent = 'Nombara';
    document.getElementById('sub').textContent = 'Book a doctor and skip the clinic waiting room.';
    return;
  }
  // Auto-attempt once.
  openApp();
})();
