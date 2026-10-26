/* Deltakerflyt: start, kart, verk, navn og mobil, bekreftelse. */
(function () {
  'use strict';
  var C = window.Common;
  var P = window.Pickers;

  function $(id) { return document.getElementById(id); }

  var SCREENS = ['start', 'step1', 'step2', 'step3', 'done', 'closed'];
  var HELP_MAP_EMPTY = 'Trykk der verket henger, ikke der du står.';
  var HELP_MAP_SET = 'Trykk et annet sted for å flytte markøren.';

  var state = {
    screen: 'start',
    map: null,
    shape: 'staende',
    group: 'alene',
    mouse: null,
    sending: false
  };
  var mapPicker = null;
  var workPicker = null;

  /* ---------- Visning ---------- */
  // Nettleserens tilbake-knapp skal gå ett steg tilbake i skjemaet, ikke forlate siden.
  function show(name, fromHistory) {
    if (!fromHistory) {
      try {
        if (name === 'done' || name === 'closed') history.replaceState({ s: name }, '');
        else if (name === 'start') history.replaceState({ s: name }, '');
        else history.pushState({ s: name }, '');
      } catch (e) { /* ignorer */ }
    }
    state.screen = name;
    SCREENS.forEach(function (s) { $('screen-' + s).hidden = s !== name; });

    var stepNo = { step1: 1, step2: 2, step3: 3 }[name];
    $('progress').hidden = !stepNo;
    if (stepNo) {
      $('progress').setAttribute('aria-label', 'Steg ' + stepNo + ' av 3');
      Array.prototype.forEach.call($('progress').children, function (el, i) { el.classList.toggle('on', i < stepNo); });
    }

    if (name === 'step1') ensureMap();
    if (name === 'step2') ensureWork();

    $('nav').hidden = name === 'done' || name === 'closed';
    $('back').hidden = name === 'start' || name === 'step1';
    $('next').textContent = name === 'start' ? 'Start' : name === 'step3' ? 'Send inn' : 'Neste';
    updateNext();

    window.scrollTo(0, 0);
    var heading = $('screen-' + name).querySelector('h1, h2');
    if (heading) heading.focus({ preventScroll: true });
  }

  function updateNext() {
    var ok = true;
    if (state.screen === 'step1') ok = !!state.map;
    if (state.screen === 'step2') ok = !!state.mouse;
    if (state.screen === 'step3') ok = !state.sending;
    $('next').disabled = !ok;
  }

  /* ---------- Steg 1: kart ---------- */
  function ensureMap() {
    if (mapPicker) return;
    mapPicker = new P.MapPicker($('map'), {
      onChange: function (p) {
        state.map = p;
        $('map-help').textContent = p ? HELP_MAP_SET : HELP_MAP_EMPTY;
        updateNext();
      }
    });
    $('map-help').textContent = HELP_MAP_EMPTY;
    $('map-wrap').appendChild(P.zoomTools(mapPicker));
  }

  /* ---------- Steg 2: verk ---------- */
  function ensureWork() {
    if (workPicker) return;
    workPicker = new P.WorkPicker($('work'), {
      hint: 'Trykk der musen er',
      onChange: function (p) { state.mouse = p; updateNext(); }
    });
    workPicker.setShape(state.shape);
  }

  function bindChips(containerId, key, onChange) {
    var box = $(containerId);
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (c) {
        c.setAttribute('aria-pressed', c === btn ? 'true' : 'false');
      });
      var changed = state[key] !== btn.dataset.value;
      state[key] = btn.dataset.value;
      if (changed && onChange) onChange();
    });
  }

  bindChips('shape-chips', 'shape', function () {
    workPicker.setShape(state.shape);
    workPicker.setValue(null); // markøren hører til en bestemt ramme, så den nullstilles
  });
  bindChips('group-chips', 'group');

  /* ---------- Steg 3: send inn ---------- */
  function setError(id, msg) {
    var el = $(id);
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function validate() {
    var name = $('name').value.replace(/\s+/g, ' ').trim();
    var phone = C.normalizePhone($('phone').value);
    var nameErr = name.length < 2 ? 'Skriv inn navnet ditt.' : '';
    var phoneErr = phone ? '' : 'Skriv inn et gyldig mobilnummer.';
    setError('err-name', nameErr);
    setError('err-phone', phoneErr);
    $('name').setAttribute('aria-invalid', nameErr ? 'true' : 'false');
    $('phone').setAttribute('aria-invalid', phoneErr ? 'true' : 'false');
    setError('err-form', '');
    if (nameErr) { $('name').focus(); return null; }
    if (phoneErr) { $('phone').focus(); return null; }
    return { name: name, phone: phone };
  }

  function submit() {
    if (state.sending) return;
    var v = validate();
    if (!v) return;
    state.sending = true;
    $('next').textContent = 'Sender…';
    updateNext();

    C.call('submit', {
      name: v.name,
      phone: v.phone,
      map: state.map,
      shape: state.shape,
      group: state.group,
      mouse: state.mouse,
      website: $('hp').value
    }).then(function (res) {
      state.sending = false;
      if (res && res.ok) {
        $('done-text').textContent = 'Takk, ' + v.name.split(' ')[0] + '. Er svaret riktig, er du med i trekningen.';
        show('done');
        return;
      }
      $('next').textContent = 'Send inn';
      updateNext();
      var code = res && res.error;
      if (code === 'duplicate') {
        setError('err-phone', 'Dette nummeret har allerede sendt inn et svar.');
        $('phone').setAttribute('aria-invalid', 'true');
        $('phone').focus();
      } else if (code === 'closed') {
        show('closed');
      } else if (code === 'invalid') {
        setError('err-form', 'Noe i svaret er ugyldig. Gå tilbake og sjekk markeringene.');
      } else {
        setError('err-form', 'Noe gikk galt hos oss. Prøv igjen om litt.');
      }
    }).catch(function () {
      state.sending = false;
      $('next').textContent = 'Send inn';
      updateNext();
      setError('err-form', 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.');
    });
  }

  /* ---------- Navigasjon ---------- */
  $('next').addEventListener('click', function () {
    if (state.screen === 'start') show('step1');
    else if (state.screen === 'step1') show('step2');
    else if (state.screen === 'step2') show('step3');
    else if (state.screen === 'step3') submit();
  });
  $('back').addEventListener('click', function () { history.back(); });
  window.addEventListener('popstate', function (e) {
    var s = e.state && e.state.s;
    if (s === 'closed' || s === 'done') s = state.screen === s ? s : 'start';
    show(SCREENS.indexOf(s) >= 0 ? s : 'start', true);
  });
  $('form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });

  /* ---------- Oppstart ---------- */
  show('start');
  if (!C.configured) {
    var b = $('banner');
    b.textContent = 'Siden er ikke koblet til databasen ennå. Legg inn API_URL i config.js.';
    b.hidden = false;
  } else {
    C.call('status').then(function (res) {
      if (res && res.ok && res.open === false) show('closed');
    }).catch(function () { /* hvis statussjekken feiler, lar vi deltakeren prøve likevel */ });
  }
})();
