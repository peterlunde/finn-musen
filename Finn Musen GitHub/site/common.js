/* Felles hjelpere for deltakersiden og admin. Ingen avhengigheter. */
(function () {
  'use strict';

  /** Bygger DOM-elementer uten innerHTML, slik at navn og annen brukertekst aldri tolkes som HTML. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }

  /** Samme regler som i Code.gs. Returnerer sifre med landskode, eller null. */
  function normalizePhone(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/[\s().\-]/g, '');
    var intl = false;
    if (s.charAt(0) === '+') { intl = true; s = s.slice(1); }
    else if (s.slice(0, 2) === '00') { intl = true; s = s.slice(2); }
    if (!/^\d+$/.test(s)) return null;
    if (!intl) {
      if (s.length === 8) return '47' + s;
      if (s.length === 10 && s.slice(0, 2) === '47') return s;
      return null;
    }
    if (s.length < 9 || s.length > 15) return null;
    if (s.slice(0, 2) === '47' && s.length !== 10) return null;
    return s;
  }

  function formatPhone(digits) {
    var s = String(digits || '');
    if (/^47\d{8}$/.test(s)) return '+47 ' + s.slice(2, 5) + ' ' + s.slice(5, 7) + ' ' + s.slice(7);
    return s ? '+' + s : '';
  }

  var cfg = window.APP_CONFIG || {};

  /** Alle kall går som POST med tekst/plain, slik at nettleseren ikke trenger forhåndssjekk (CORS) mot Apps Script. */
  function call(action, payload) {
    if (!cfg.API_URL) return Promise.reject(new Error('config'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    return fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json();
    }).catch(function () {
      throw new Error('network');
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  window.Common = {
    h: h,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    call: call,
    configured: !!cfg.API_URL
  };
})();
