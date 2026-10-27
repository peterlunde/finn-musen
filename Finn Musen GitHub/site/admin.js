/* Admin: svarliste, fasit, trekning. All brukertekst settes med textContent via h(). */
(function () {
  'use strict';
  var C = window.Common;
  var P = window.Pickers;
  var h = C.h;

  function $(id) { return document.getElementById(id); }

  var SHAPE_LABEL = { staende: 'Stående', liggende: 'Liggende', kvadratisk: 'Kvadratisk' };
  var ERRORS = {
    unauthorized: 'Feil passord.',
    password_not_set: 'Passordet er ikke satt i Code.gs ennå.',
    network: 'Fikk ikke kontakt med serveren. Prøv igjen.',
    config: 'API_URL mangler i config.js.',
    server_error: 'Noe gikk galt hos serveren.',
    no_candidates: 'Ingen godkjente deltakere å trekke blant.'
  };

  var S = { password: '', data: null, tab: 'answers', filter: 'Alle', query: '', lastDraw: null, worksView: null };

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
    else if (S.tab === 'works') panel.appendChild(viewWorks());
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
      var wk = f.workId ? workById(a.workId) : null;
      checks = h('ul', { class: 'checks' },
        f.workId
          ? checkItem('Verk: ' + (wk ? wk.name : 'ukjent'), m.work)
          : checkItem('Verket på kartet', m.map),
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
          checks)),
      err,
      h('div', { class: 'actions dialog-actions' }, approve, reject)));

    dlg.showModal();

    var mp = new P.MapPicker(mapBox, { readOnly: true });
    mapWrap.appendChild(P.zoomTools(mp));
    mp.setPin('answer', a.map, 'answer');
    if (f) mp.setPin('fasit', f.map, 'fasit');
    var wp = new P.WorkPicker(workBox, { readOnly: true });
    var aw = a.workId ? workById(a.workId) : null;
    if (aw) {
      wp.setImage(null, aw.aspect);
      C.workImage(aw.id).then(function (src) { wp.setImage(src, aw.aspect); }).catch(function () { /* rammen vises uten bilde */ });
    } else {
      wp.setShape(f ? f.shape : a.shape);
    }
    wp.hint.hidden = true;
    wp.setPin('answer', a.mouse, 'answer');
    if (f && (!f.workId || f.workId === a.workId)) wp.setPin('fasit', f.mouse, 'fasit');
  }

  function workById(id) {
    return (S.data.works || []).filter(function (w) { return w.id === id; })[0] || null;
  }

  function checkItem(text, ok) {
    return h('li', null, h('span', null, text), h('span', { class: ok ? 'yes' : 'no' }, ok ? 'Stemmer' : 'Stemmer ikke'));
  }

  /* ---------- Verk ---------- */
  var IMG_LIMIT = 440000; // tegn i data-URL-en. Må være under grensen i Code.gs (450 000).

  /** Leser et bilde, skalerer det ned og lagrer som JPEG under størrelsesgrensen. */
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w0 = img.naturalWidth, h0 = img.naturalHeight;
        if (!w0 || !h0) { reject(new Error('bad_image')); return; }
        var sizes = [1100, 1000, 900, 800, 700, 600, 500];
        for (var i = 0; i < sizes.length; i++) {
          var k = Math.min(1, sizes[i] / Math.max(w0, h0));
          var cw = Math.max(1, Math.round(w0 * k)), ch = Math.max(1, Math.round(h0 * k));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          for (var q = 0.85; q >= 0.5; q -= 0.1) {
            var data = cv.toDataURL('image/jpeg', q);
            if (data.length <= IMG_LIMIT) { resolve({ image: data, aspect: cw / ch }); return; }
          }
        }
        reject(new Error('too_big'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
      img.src = url;
    });
  }

  function viewWorks() {
    var d = S.data;
    var v = S.worksView;
    if (v) return viewWorkForm(v);

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('p', { class: d.works.length ? 'count-line' : 'help' },
      d.works.length
        ? d.works.length + ' verk. Gjestene ser verket som henger nærmest der de trykker på kartet.'
        : 'Ingen verk er lagt inn. Uten verk får gjestene en tom ramme å trykke i. Legg inn et bilde av hvert verk og marker hvor det henger.'));
    wrap.appendChild(h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { S.worksView = { mode: 'add' }; renderTab(); } }, 'Legg til verk')));
    var list = h('div', { class: 'list' });
    d.works.forEach(function (w) {
      var thumb = h('span', { class: 'switch-thumb row-thumb' });
      C.workImage(w.id).then(function (src) { thumb.appendChild(h('img', { src: src, alt: '' })); }).catch(function () { /* ingen miniatyr */ });
      list.appendChild(h('button', { type: 'button', class: 'row', onclick: function () { S.worksView = { mode: 'edit', id: w.id }; renderTab(); } },
        h('span', { class: 'row-lead' }, thumb, h('span', { class: 'row-name' }, w.name)),
        h('span', { class: 'help' }, 'Endre')));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function viewWorkForm(v) {
    var d = S.data;
    var existing = v.mode === 'edit' ? workById(v.id) : null;
    if (v.mode === 'edit' && !existing) { S.worksView = null; return viewWorks(); }
    var F = { name: existing ? existing.name : '', pos: existing ? { x: existing.x, y: existing.y } : null, image: null, aspect: null };

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('h2', null, existing ? 'Endre verk' : 'Nytt verk'));

    var err = h('p', { class: 'error', hidden: true });
    var save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Lagre');
    function ready() { return F.name.trim().length > 0 && !!F.pos && (!!existing || !!F.image); }
    function refreshSave() { save.disabled = !ready(); }

    var nameInput = h('input', { id: 'work-name', type: 'text', maxlength: '60', value: F.name });
    nameInput.addEventListener('input', function () { F.name = nameInput.value; refreshSave(); });
    wrap.appendChild(h('div', { class: 'field' }, h('label', { for: 'work-name' }, 'Navn på verket'), nameInput));

    if (!existing) {
      var preview = h('div', { class: 'work-preview', hidden: true });
      var fileInput = h('input', { id: 'work-file', type: 'file', accept: 'image/*' });
      var fileMsg = h('p', { class: 'help' }, 'Zoom gjerne litt ut, så hele verket er med. Bildet skaleres ned automatisk.');
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        F.image = null; refreshSave(); preview.hidden = true;
        if (!f) return;
        fileMsg.textContent = 'Behandler bildet…';
        prepareImage(f).then(function (r) {
          F.image = r.image; F.aspect = r.aspect;
          preview.textContent = '';
          preview.appendChild(h('img', { src: r.image, alt: 'Forhåndsvisning' }));
          preview.hidden = false;
          fileMsg.textContent = 'Bildet er klart.';
          refreshSave();
        }).catch(function (ex) {
          fileMsg.textContent = ex.message === 'too_big' ? 'Bildet ble for stort selv etter nedskalering. Prøv et annet.' : 'Kunne ikke lese bildet. Prøv et annet.';
        });
      });
      wrap.appendChild(h('div', { class: 'field' }, h('label', { for: 'work-file' }, 'Bilde av verket'), fileInput, fileMsg, preview));
    }

    var mapBox = h('div', { class: 'compact' });
    var mapWrap = h('div', { class: 'picker-wrap' }, mapBox);
    wrap.appendChild(h('div', { class: 'field' },
      h('p', { class: 'help' }, 'Trykk på kartet der verket henger. De andre verkene vises som ringer.'), mapWrap));
    wrap.appendChild(err);

    var buttons = [save, h('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { S.worksView = null; renderTab(); } }, 'Avbryt')];
    if (existing) {
      buttons.push(h('button', { type: 'button', class: 'btn btn-secondary', onclick: function () {
        var warn = d.fasit && d.fasit.workId === existing.id ? ' Fasit er satt på dette verket og blir også fjernet.' : '';
        if (!window.confirm('Slette «' + existing.name + '»?' + warn)) return;
        api('admin.deleteWork', { id: existing.id }).then(function () { S.worksView = null; return refresh(); })
          .catch(function (ex) { err.textContent = errText(ex.message); err.hidden = false; });
      } }, 'Slett'));
    }
    wrap.appendChild(h('div', { class: 'actions' }, buttons));

    save.addEventListener('click', function () {
      save.disabled = true; err.hidden = true;
      var req = existing
        ? api('admin.updateWork', { id: existing.id, name: F.name.trim(), pos: F.pos })
        : api('admin.addWork', { name: F.name.trim(), pos: F.pos, aspect: F.aspect, image: F.image });
      req.then(function () { S.worksView = null; return refresh(); }).catch(function (ex) {
        err.textContent = ex.message === 'invalid' ? 'Noe er ugyldig. Sjekk navn, bilde og plassering.' : errText(ex.message);
        err.hidden = false; refreshSave();
      });
    });

    setTimeout(function () {
      var mp = new P.MapPicker(mapBox, { onChange: function (p) { F.pos = p; refreshSave(); } });
      mapWrap.appendChild(P.zoomTools(mp));
      d.works.forEach(function (w) { if (!existing || w.id !== existing.id) mp.setPin('w' + w.id, { x: w.x, y: w.y }, 'fasit'); });
      mp.setValue(F.pos, true);
    }, 0);
    refreshSave();
    return wrap;
  }

  /* ---------- Fasit ---------- */
  function viewFasit() {
    var d = S.data;
    if (d.works && d.works.length) return viewFasitWorks();
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
    
    var tolMap = numberField('Toleranse på kartet (% av kartbredden)', d.tolMap);
    var tolWork = numberField('Toleranse på verket (% av verkets bredde)', d.tolWork);

    wrap.appendChild(h('div', { class: 'two-col' },
      h('div', { class: 'review-col' },
        h('p', { class: 'help' }, 'Hvor henger verket?'), mapWrap),
      h('div', { class: 'review-col' },
        h('fieldset', null, h('legend', null, 'Format på verket'), shapeChips,
          h('p', { class: 'help' }, 'Gjestene ser en ramme i dette formatet når de skal markere musen.')),
        h('div', { class: 'work-slot' }, workBox))));
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

  function viewFasitWorks() {
    var d = S.data;
    var F = d.fasit && d.fasit.workId
      ? { workId: d.fasit.workId, mouse: d.fasit.mouse }
      : { workId: d.works[0].id, mouse: null };
    if (!workById(F.workId)) F = { workId: d.works[0].id, mouse: null };

    var wrap = h('section', { class: 'admin-section' });
    wrap.appendChild(h('p', { class: d.fasit ? 'count-line' : 'help' },
      d.fasit ? 'Fasit er satt. Endringer gjelder alle svar når du lagrer.' : 'Fasit er ikke satt. Velg verket musen er på, og trykk der den sitter.'));

    var save = h('button', { type: 'button', class: 'btn btn-primary' }, 'Lagre fasit');
    var msg = h('p', { class: 'count-line' });
    function refreshSave() { save.disabled = !(F.workId && F.mouse); }

    var workBox = h('div', { class: 'compact' });
    var labels = {};
    d.works.forEach(function (w) { labels[w.id] = w.name; });
    var chips = chipRow(labels, function () { return F.workId; }, function (id) {
      if (id === F.workId) return;
      F.workId = id; F.mouse = null; showWork(); wp.setValue(null);
    });
    var tolWork = numberField('Toleranse på verket (% av verkets bredde)', d.tolWork);

    function showWork() {
      var w = workById(F.workId);
      wp.setImage(null, w.aspect);
      wp.setHint('Henter verket…');
      C.workImage(w.id).then(function (src) {
        if (F.workId !== w.id) return;
        wp.setImage(src, w.aspect);
        wp.setHint('Trykk der musen er');
      }).catch(function () { wp.setHint('Fikk ikke hentet verket.'); });
    }

    wrap.appendChild(h('fieldset', null, h('legend', null, 'Verk'), chips));
    wrap.appendChild(h('div', { class: 'work-slot' }, workBox));
    wrap.appendChild(h('div', { class: 'tol' }, tolWork.el));
    wrap.appendChild(h('div', { class: 'actions' }, save));
    wrap.appendChild(msg);

    save.addEventListener('click', function () {
      save.disabled = true;
      msg.textContent = '';
      api('admin.setFasit', {
        fasit: { workId: F.workId, mouse: F.mouse },
        tolMap: d.tolMap, tolWork: Number(tolWork.input.value)
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

    var wp;
    setTimeout(function () {
      wp = new P.WorkPicker(workBox, { hint: 'Trykk der musen er', onChange: function (p) { F.mouse = p; refreshSave(); } });
      showWork();
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
