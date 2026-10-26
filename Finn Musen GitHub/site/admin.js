/* Admin: svarliste, fasit, trekning. All brukertekst settes med textContent via h(). */
(function () {
  'use strict';
  var C = window.Common;
  var P = window.Pickers;
  var h = C.h;

  function $(id) { return document.getElementById(id); }

  var SHAPE_LABEL = { staende: 'Stående', liggende: 'Liggende', kvadratisk: 'Kvadratisk' };
  var GROUP_LABEL = { alene: 'Bare ett verk', venstre: 'Venstre', midten: 'Midten', hoyre: 'Høyre' };
  var ERRORS = {
    unauthorized: 'Feil passord.',
    password_not_set: 'Passordet er ikke satt i Code.gs ennå.',
    network: 'Fikk ikke kontakt med serveren. Prøv igjen.',
    config: 'API_URL mangler i config.js.',
    server_error: 'Noe gikk galt hos serveren.',
    no_candidates: 'Ingen godkjente deltakere å trekke blant.'
  };

  var S = { password: '', data: null, tab: 'answers', filter: 'Alle', query: '', lastDraw: null };

  function errText(code) { return ERRORS[code] || 'Noe gikk galt.'; }

  function api(action, payload) {
    return C.call(action, Object.assign({ password: S.password }, payload || {})).then(function (res) {
      if (res && res.ok) return res;
      var e = new Error((res && res.error) || 'server_error');
      throw e;
    });
  }

  /* ---------- Innlogging ---------- */
  function loadState() {
    return api('admin.state').then(function (res) { S.data = res; return res; });
  }

  function login(password) {
    S.password = password;
    return loadState().then(function () {
      try { sessionStorage.setItem('pw', password); } catch (e) { /* ignorer */ }
      $('login').hidden = true;
      $('app').hidden = false;
      $('top-actions').hidden = false;
      renderTop();
      renderTab();
    });
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('login-error');
    err.hidden = true;
    $('login-btn').disabled = true;
    login($('pw').value).catch(function (ex) {
      err.textContent = errText(ex.message);
      err.hidden = false;
    }).then(function () { $('login-btn').disabled = false; });
  });

  /* ---------- Toppfelt ---------- */
  function renderTop() {
    var open = S.data.open;
    $('open-text').textContent = open ? 'Innsending åpen' : 'Innsending stengt';
    $('toggle-open').textContent = open ? 'Steng' : 'Åpne';
    $('toggle-open').title = open ? 'Steng innsendingen' : 'Åpne innsendingen';
  }

  $('toggle-open').addEventListener('click', function () {
    var open = S.data.open;
    if (open && !window.confirm('Steng innsendingen? Ingen nye svar tas imot før du åpner den igjen.')) return;
    api('admin.setOpen', { open: !open }).then(function () { return refresh(); }).catch(showTopError);
  });
  $('refresh').addEventListener('click', function () { refresh().catch(showTopError); });

  function showTopError(ex) {
    var b = $('banner');
    b.textContent = errText(ex.message);
    b.hidden = false;
    setTimeout(function () { b.hidden = true; }, 5000);
  }

  function refresh() {
    return loadState().then(function () { renderTop(); renderTab(); });
  }

  /* ---------- Faner ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (btn) {
    btn.addEventListener('click', function () {
      S.tab = btn.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      renderTab();
    });
  });

  function renderTab() {
    var panel = $('panel');
    panel.textContent = '';
    if (S.tab === 'answers') panel.appendChild(viewAnswers());
    else if (S.tab === 'fasit') panel.appendChild(viewFasit());
    else panel.appendChild(viewDraw());
  }

  /* ---------- Svar ---------- */
  function timeOf(a) { return a.time ? a.time.slice(11, 16) : ''; }

  function statusTag(status) {
    return h('span', { class: 'tag' + (status === 'Godkjent' ? ' ok' : status === 'Avvist' ? ' bad' : '') }, status);
  }

  function viewAnswers() {
    var d = S.data;
    var counts = { Venter: 0, Godkjent: 0, Avvist: 0 };
    d.answers.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });
    var matching = d.answers.filter(function (a) { return a.status === 'Venter' && a.match && a.match.ok; }).length;

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('p', { class: 'count-line' },
      d.answers.length + ' svar · ' + counts.Godkjent + ' godkjent · ' + counts.Venter + ' venter · ' + counts.Avvist + ' avvist'));

    var search = h('input', { type: 'search', placeholder: 'Søk på navn eller nummer', 'aria-label': 'Søk', value: S.query });
    var list = h('div', { class: 'list' });
    search.addEventListener('input', function () { S.query = search.value; fillList(list); });

    var chips = h('div', { class: 'chips' });
    ['Alle', 'Venter', 'Godkjent', 'Avvist'].forEach(function (f) {
      chips.appendChild(h('button', {
        type: 'button', class: 'chip', 'aria-pressed': S.filter === f ? 'true' : 'false',
        onclick: function () {
          S.filter = f;
          Array.prototype.forEach.call(chips.children, function (c) { c.setAttribute('aria-pressed', c.textContent === f ? 'true' : 'false'); });
          fillList(list);
        }
      }, f));
    });
    wrap.appendChild(h('div', { class: 'toolbar' }, search, chips));

    if (d.fasit && matching > 0) {
      var bulk = h('button', { type: 'button', class: 'btn btn-primary small' }, 'Godkjenn alle som stemmer med fasit (' + matching + ')');
      bulk.addEventListener('click', function () {
        if (!window.confirm('Godkjenne ' + matching + ' svar som stemmer med fasit?')) return;
        bulk.disabled = true;
        api('admin.approveMatching').then(refresh).catch(function (ex) { bulk.disabled = false; showTopError(ex); });
      });
      wrap.appendChild(h('div', { class: 'actions' }, bulk));
    } else if (!d.fasit) {
      wrap.appendChild(h('p', { class: 'help' }, 'Fasit er ikke satt. Legg den inn under Fasit for å se hvilke svar som stemmer.'));
    }

    wrap.appendChild(list);
    fillList(list);
    return wrap;
  }

  function fillList(list) {
    list.textContent = '';
    var q = S.query.trim().toLowerCase();
    var qDigits = q.replace(/\D/g, '');
    var rows = S.data.answers.slice().reverse().filter(function (a) {
      if (S.filter !== 'Alle' && a.status !== S.filter) return false;
      if (!q) return true;
      return a.name.toLowerCase().indexOf(q) >= 0 || (qDigits && a.phone.indexOf(qDigits) >= 0);
    });
    if (!rows.length) {
      list.appendChild(h('p', { class: 'empty' }, S.data.answers.length ? 'Ingen svar passer.' : 'Ingen svar ennå.'));
      return;
    }
    rows.forEach(function (a) {
      var tags = [];
      if (a.match) tags.push(h('span', { class: 'tag' }, a.match.ok ? 'Riktig' : 'Feil'));
      tags.push(statusTag(a.status));
      list.appendChild(h('button', { type: 'button', class: 'row', onclick: function () { openReview(a.id); } },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-name' }, a.name),
          h('span', { class: 'row-sub' }, C.formatPhone(a.phone) + ' · ' + timeOf(a))),
        h('span', { class: 'row-tags' }, tags)));
    });
  }

  /* ---------- Gjennomgang av ett svar ---------- */
  function openReview(id) {
    var a = S.data.answers.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var f = S.data.fasit;
    var dlg = $('review');
    dlg.textContent = '';

    var err = h('p', { class: 'error', hidden: true });
    var approve = h('button', { type: 'button', class: 'btn btn-primary' }, 'Godkjenn');
    var reject = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Avvis');
    function decide(status) {
      approve.disabled = reject.disabled = true;
      api('admin.setStatus', { id: a.id, status: status }).then(function () {
        a.status = status;
        dlg.close();
        renderTab();
      }).catch(function (ex) {
        approve.disabled = reject.disabled = false;
        err.textContent = errText(ex.message);
        err.hidden = false;
      });
    }
    approve.addEventListener('click', function () { decide('Godkjent'); });
    reject.addEventListener('click', function () { decide('Avvist'); });

    var mapBox = h('div', { class: 'compact' });
    var mapWrap = h('div', { class: 'picker-wrap' }, mapBox);
    var workBox = h('div', { class: 'compact' });
    var workSlot = h('div', { class: 'work-slot' }, workBox);

    var legend = h('div', { class: 'legend' },
      h('span', null, h('span', { class: 'pin pin-answer' }), 'Svaret'),
      f ? h('span', null, h('span', { class: 'pin pin-fasit' }), 'Fasit') : null);

    var checks = null;
    if (a.match && f) {
      var m = a.match;
      checks = h('ul', { class: 'checks' },
        checkItem('Verket på kartet', m.map),
        checkItem('Format: ' + SHAPE_LABEL[a.shape] + (m.shape ? '' : ' (fasit: ' + SHAPE_LABEL[f.shape] + ')'), m.shape),
        checkItem('Plassering: ' + GROUP_LABEL[a.group] + (m.group ? '' : ' (fasit: ' + GROUP_LABEL[f.group] + ')'), m.group),
        checkItem('Musen på verket', m.mouse));
    }

    dlg.appendChild(h('div', { class: 'dialog-body' },
      h('div', { class: 'dialog-head' },
        h('div', null,
          h('div', { class: 'title-row' }, h('h2', { id: 'review-title' }, a.name), statusTag(a.status)),
          h('p', { class: 'help' }, C.formatPhone(a.phone) + ' · ' + timeOf(a))),
        h('button', { type: 'button', class: 'btn btn-secondary small', onclick: function () { dlg.close(); } }, 'Lukk')),
      h('div', { class: 'review-grid' },
        h('div', { class: 'review-col' }, mapWrap, legend),
        h('div', { class: 'review-col' }, workSlot,
          h('p', { class: 'help' }, SHAPE_LABEL[a.shape] + ' · ' + GROUP_LABEL[a.group]),
          checks)),
      err,
      h('div', { class: 'actions dialog-actions' }, approve, reject)));

    dlg.showModal();

    var mp = new P.MapPicker(mapBox, { readOnly: true });
    mapWrap.appendChild(P.zoomTools(mp));
    mp.setPin('answer', a.map, 'answer');
    if (f) mp.setPin('fasit', f.map, 'fasit');
    var wp = new P.WorkPicker(workBox, { readOnly: true });
    wp.setShape(a.shape);
    wp.hint.hidden = true;
    wp.setPin('answer', a.mouse, 'answer');
    if (f && f.shape === a.shape) wp.setPin('fasit', f.mouse, 'fasit');
  }

  function checkItem(text, ok) {
    return h('li', null, h('span', null, text), h('span', { class: ok ? 'yes' : 'no' }, ok ? 'Stemmer' : 'Stemmer ikke'));
  }

  /* ---------- Fasit ---------- */
  function viewFasit() {
    var d = S.data;
    var F = d.fasit
      ? { map: d.fasit.map, shape: d.fasit.shape, group: d.fasit.group, mouse: d.fasit.mouse }
      : { map: null, shape: 'staende', group: 'alene', mouse: null };

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('p', { class: d.fasit ? 'count-line' : 'help' },
      d.fasit ? 'Fasit er satt. Endringer gjelder alle svar når du lagrer.' : 'Fasit er ikke satt. Marker verket på kartet og musen på verket, og lagre.'));

    var save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Lagre fasit');
    var msg = h('p', { class: 'count-line' });
    function refreshSave() { save.disabled = !(F.map && F.mouse); }

    var mapBox = h('div', { class: 'compact' });
    var mapWrap = h('div', { class: 'picker-wrap' }, mapBox);
    var workBox = h('div', { class: 'compact' });

    var shapeChips = chipRow(SHAPE_LABEL, function () { return F.shape; }, function (v) {
      if (v === F.shape) return;
      F.shape = v; wp.setShape(v); wp.setValue(null);
    });
    var groupChips = chipRow(GROUP_LABEL, function () { return F.group; }, function (v) { F.group = v; });

    var tolMap = numberField('Toleranse på kartet (% av kartbredden)', d.tolMap);
    var tolWork = numberField('Toleranse på verket (% av verkets bredde)', d.tolWork);

    wrap.appendChild(h('div', { class: 'two-col' },
      h('div', { class: 'review-col' },
        h('p', { class: 'help' }, 'Hvor henger verket?'), mapWrap),
      h('div', { class: 'review-col' },
        h('fieldset', null, h('legend', null, 'Format'), shapeChips),
        h('div', { class: 'work-slot' }, workBox),
        h('fieldset', null, h('legend', null, 'Hvis flere verk henger side om side, hvilket er det?'), groupChips))));
    wrap.appendChild(h('div', { class: 'tol' }, tolMap.el, tolWork.el));
    wrap.appendChild(h('div', { class: 'actions' }, save));
    wrap.appendChild(msg);

    save.addEventListener('click', function () {
      save.disabled = true;
      msg.textContent = '';
      api('admin.setFasit', {
        fasit: { map: F.map, shape: F.shape, group: F.group, mouse: F.mouse },
        tolMap: Number(tolMap.input.value), tolWork: Number(tolWork.input.value)
      }).then(function () { return loadState(); }).then(function () {
        var total = S.data.answers.length;
        var ok = S.data.answers.filter(function (a) { return a.match && a.match.ok; }).length;
        msg.textContent = 'Fasit lagret. ' + ok + ' av ' + total + ' svar stemmer.';
        renderTop();
        refreshSave();
      }).catch(function (ex) {
        msg.textContent = ex.message === 'invalid' ? 'Toleransen må være mellom 1 og 60.' : errText(ex.message);
        refreshSave();
      });
    });

    // Plukkerne lages etter at elementene ligger i dokumentet
    var mp, wp;
    setTimeout(function () {
      mp = new P.MapPicker(mapBox, { onChange: function (p) { F.map = p; refreshSave(); } });
      mapWrap.appendChild(P.zoomTools(mp));
      mp.setValue(F.map, true);
      wp = new P.WorkPicker(workBox, { hint: 'Trykk der musen er', onChange: function (p) { F.mouse = p; refreshSave(); } });
      wp.setShape(F.shape);
      wp.setValue(F.mouse, true);
    }, 0);
    refreshSave();
    return wrap;
  }

  function chipRow(labels, get, onPick) {
    var box = h('div', { class: 'chips' });
    Object.keys(labels).forEach(function (key) {
      box.appendChild(h('button', { type: 'button', class: 'chip', 'data-value': key, 'aria-pressed': get() === key ? 'true' : 'false' }, labels[key]));
    });
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      Array.prototype.forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'); });
      onPick(btn.dataset.value);
    });
    return box;
  }

  function numberField(label, value) {
    var id = 'n' + Math.random().toString(36).slice(2, 8);
    var input = h('input', { id: id, type: 'number', min: '1', max: '60', step: '1', inputmode: 'numeric', value: String(value) });
    return { input: input, el: h('div', { class: 'number-field' }, h('label', { for: id }, label), input) };
  }

  /* ---------- Trekning ---------- */
  function viewDraw() {
    var d = S.data;
    var drawn = {};
    d.winners.forEach(function (w) { drawn[w.id] = true; });
    var approved = d.answers.filter(function (a) { return a.status === 'Godkjent'; });
    var remaining = approved.filter(function (a) { return !drawn[a.id]; }).length;

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('p', { class: 'count-line' }, 'Godkjent: ' + approved.length + ' · Kan trekkes: ' + remaining + ' · Trukket: ' + d.winners.length));

    var btn = h('button', { type: 'button', class: 'btn btn-primary' }, d.winners.length ? 'Trekk ny vinner' : 'Trekk vinner');
    btn.disabled = remaining === 0;
    var err = h('p', { class: 'error', hidden: true });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      err.hidden = true;
      api('admin.draw').then(function (res) {
        S.lastDraw = res.winner;
        return refresh();
      }).catch(function (ex) {
        btn.disabled = false;
        err.textContent = errText(ex.message);
        err.hidden = false;
      });
    });
    wrap.appendChild(h('div', { class: 'actions' }, btn));
    wrap.appendChild(err);

    var last = d.winners.length ? d.winners[d.winners.length - 1] : null;
    if (last) {
      wrap.appendChild(h('div', { class: 'draw-result' },
        h('p', { class: 'help' }, 'Siste vinner'),
        h('h2', null, last.name),
        h('p', null, C.formatPhone(last.phone))));
    }
    if (d.winners.length > 1) {
      wrap.appendChild(h('p', { class: 'help' }, 'Alle trekninger'));
      wrap.appendChild(h('ul', { class: 'winners' },
        d.winners.slice().reverse().map(function (w) {
          return h('li', null, h('span', null, w.name + ' · ' + C.formatPhone(w.phone)), h('span', { class: 'help' }, w.time));
        })));
    }
    return wrap;
  }

  /* ---------- Oppstart ---------- */
  if (!C.configured) {
    $('banner').textContent = 'API_URL mangler i config.js.';
    $('banner').hidden = false;
    $('login-btn').disabled = true;
  } else {
    var saved = '';
    try { saved = sessionStorage.getItem('pw') || ''; } catch (e) { /* ignorer */ }
    if (saved) {
      login(saved).catch(function () {
        try { sessionStorage.removeItem('pw'); } catch (e) { /* ignorer */ }
      });
    }
  }

  // Henter nye svar automatisk mens svarlisten er åpen og ingen vurdering pågår
  setInterval(function () {
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!S.data || S.tab !== 'answers' || $('review').open || document.hidden || typing) return;
    refresh().catch(function () { /* stille */ });
  }, 30000);
})();
