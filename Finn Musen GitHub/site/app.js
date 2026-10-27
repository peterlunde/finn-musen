/* Deltakerflyt: start, kart, verk, navn og mobil, bekreftelse. */
(function () {
  'use strict';
  var C = window.Common;
  var P = window.Pickers;

  function $(id) { return document.getElementById(id); }

  var SCREENS = ['start', 'step1', 'step2', 'step3', 'done', 'closed'];
  var HELP_MAP_EMPTY = 'Zoom inn og trykk der verket henger, ikke der du står.';
  var HELP_MAP_SET = 'Bra. Trykk et annet sted hvis du vil flytte markøren.';

  var state = {
    screen: 'start',
    map: null,
    shape: 'staende',
    group: 'alene',
    mouse: null,
    works: [],          // registrerte kunstverk (uten bilder)
    candidates: [],     // verkene nærmest kartmarkøren
    candidatesFor: '',  // hvilken markør kandidatene gjelder for
    work: null,         // verket som vises i steg 2
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
    if (name === 'step2') enterStep2();

    $('nav').hidden = name === 'done' || name === 'closed';
    $('back').hidden = name === 'start' || name === 'step1';
    $('next').textContent = name === 'start' ? 'Sett i gang' : name === 'step3' ? 'Send inn' : 'Neste';
    updateNext();

    window.scrollTo(0, 0);
    var heading = $('screen-' + name).querySelector('h1, h2');
    if (heading) heading.focus({ preventScroll: true });
  }

  function updateNext() {
    var ok = true;
    if (state.screen === 'step1') ok = !!state.map;
    if (state.screen === 'step2') ok = !!state.mouse && (!state.works.length || !!state.work);
    if (state.screen === 'step3') ok = !state.sending;
    var was = $('next').disabled;
    $('next').disabled = !ok;
    if (was && ok) { // liten bekreftelse når man kan gå videre
      var n = $('next');
      n.classList.remove('ready');
      void n.offsetWidth;
      n.classList.add('ready');
    }
  }

  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignorer */ } }

  /* ---------- Steg 1: kart ---------- */
  function ensureMap() {
    if (mapPicker) return;
    mapPicker = new P.MapPicker($('map'), {
      onChange: function (p) {
        state.map = p;
        if (p) buzz();
        $('map-help').textContent = p ? HELP_MAP_SET : HELP_MAP_EMPTY;
        if (p && state.works.length) { // begynn å hente verket mens gjesten fortsatt ser på kartet
          var near = C.nearestWorks(state.works, p, 1)[0];
          if (near) C.workImage(near.id).catch(function () { /* hentes på nytt i steg 2 */ });
        }
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
      onChange: function (p) { state.mouse = p; if (p) buzz(); updateNext(); }
    });
    workPicker.setShape(state.shape);
  }

  // Har vi registrert verk, vises verket som henger nærmest der gjesten trykket på kartet.
  function enterStep2() {
    ensureWork();
    if (!state.works.length) { $('switch').hidden = true; return; }
    var key = state.map ? state.map.x + ',' + state.map.y : '';
    if (key !== state.candidatesFor || !state.work) {
      state.candidatesFor = key;
      state.candidates = C.nearestWorks(state.works, state.map || { x: 0.5, y: 0.5 }, 3);
      $('switch-list').textContent = '';
      $('switch-list').hidden = true;
      $('switch-toggle').setAttribute('aria-expanded', 'false');
      showWork(state.candidates[0]);
    }
    $('switch').hidden = state.candidates.length < 2;
  }

  function showWork(w) {
    var changed = !state.work || state.work.id !== w.id;
    state.work = w;
    if (changed) { workPicker.setValue(null); }
    workPicker.setImage(null, w.aspect);
    workPicker.setHint('Henter verket…');
    workPicker.hint.classList.remove('on-image');
    $('work-retry').hidden = true;
    updateNext();
    C.workImage(w.id).then(function (src) {
      if (!state.work || state.work.id !== w.id) return; // gjesten har byttet verk i mellomtiden
      workPicker.setImage(src, w.aspect);
      workPicker.setHint('Trykk der musen er');
      workPicker.hint.classList.add('on-image');
    }).catch(function () {
      if (!state.work || state.work.id !== w.id) return;
      workPicker.setHint('Fikk ikke hentet verket.');
      $('work-retry').hidden = false;
    });
  }

  $('work-retry').addEventListener('click', function () { if (state.work) showWork(state.work); });

  $('switch-toggle').addEventListener('click', function () {
    var list = $('switch-list');
    var open = list.hidden;
    list.hidden = !open;
    $('switch-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open || list.children.length) return;
    state.candidates.forEach(function (w) {
      var thumb = C.h('span', { class: 'switch-thumb' }, 'Henter…');
      var btn = C.h('button', { type: 'button', class: 'switch-item', 'aria-pressed': state.work && state.work.id === w.id ? 'true' : 'false', 'data-id': w.id },
        thumb, C.h('span', { class: 'switch-name' }, w.name));
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(list.children, function (c) { c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'); });
        if (!state.work || state.work.id !== w.id) showWork(w);
      });
      list.appendChild(btn);
      C.workImage(w.id).then(function (src) {
        thumb.textContent = '';
        thumb.appendChild(C.h('img', { src: src, alt: '' }));
      }).catch(function () { thumb.textContent = ''; });
    });
  });


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
      workId: state.work ? state.work.id : '',
      website: $('hp').value
    }).then(function (res) {
      state.sending = false;
      if (res && res.ok) {
        $('done-title').textContent = 'Takk for at du var med, ' + v.name.split(' ')[0];
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
      if (res && res.ok && res.open === false) { show('closed'); return; }
      if (res && res.ok && Array.isArray(res.works)) state.works = res.works;
      // Uten registrerte verk får rammen samme format som fasiten, så gjestene slipper å velge det selv.
      if (res && res.ok && !state.works.length && ['staende', 'liggende', 'kvadratisk'].indexOf(res.shape) >= 0) {
        state.shape = res.shape;
        if (workPicker) workPicker.setShape(state.shape);
      }
    }).catch(function () { /* hvis statussjekken feiler, lar vi deltakeren prøve likevel */ });
  }
})();
