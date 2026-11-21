'use strict';
// Runs inside the LinkedIn window (a normal web page) before the page's own scripts. It switches off passkey / WebAuthn calls,
// so LinkedIn's sign-in page cannot open the Windows passkey prompt. Signing in with a password works as usual.
// This script exposes nothing to the page and has no access to the app.
const { contextBridge } = require('electron');
try {
  contextBridge.executeInMainWorld({
    func: () => {
      const no = () => Promise.reject(new DOMException('Passkeys are turned off in this window.', 'NotAllowedError'));
      try { if (navigator.credentials) { navigator.credentials.get = no; navigator.credentials.create = no; } } catch (e) { /* ignore */ }
      try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }); } catch (e) { /* ignore */ }
    }
  });
} catch (e) { /* the sign-in button in the app is the fallback */ }
