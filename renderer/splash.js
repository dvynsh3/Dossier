'use strict';
// Start-up splash: the logo and the name on a gradient, shown until the first page is ready.
(function () {
  const box = document.querySelector('#splash .splashin'); if (!box || !window.Logo) return;
  const t0 = Date.now();
  const logo = Logo.el(Logo.current(), 132); const name = document.createElement('div'); name.className = 'brandname'; name.textContent = 'Dossier';
  box.append(logo, name);
  // hide(): keeps the splash up for a short minimum so it never just flickers, then fades it away
  window.hideSplash = function () {
    const sp = document.getElementById('splash'); if (!sp || sp.dataset.gone) return; sp.dataset.gone = '1';
    // the image itself stays still; once the app is ready it fades out quickly
    setTimeout(() => { sp.classList.add('fading'); setTimeout(() => sp.remove(), 260); }, Math.max(0, 900 - (Date.now() - t0)));
  };
})();
