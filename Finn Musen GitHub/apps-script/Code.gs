/**
 * Finn musen: backend
 *
 * Lagrer svar i regnearket denne koden ligger i (fanen «Svar»), og lar siden
 * admin.html styre fasit, godkjenning og trekning.
 *
 * Oppsett: se OPPSETT.md.
 */

// ====== ENDRE DETTE ======
const ADMIN_PASSWORD = 'ENDRE-MEG';
// =========================

const TIME_ZONE = 'Europe/Oslo';
const SHEET_NAME = 'Svar';
const HEADERS = ['Tidspunkt', 'ID', 'Navn', 'Mobil', 'Kart X', 'Kart Y', 'Format', 'Plassering', 'Mus X', 'Mus Y', 'Status', 'Verk'];
const NCOLS = HEADERS.length;
const COL = { TIME: 1, ID: 2, NAME: 3, PHONE: 4, MX: 5, MY: 6, SHAPE: 7, GROUP: 8, WX: 9, WY: 10, STATUS: 11, WORK: 12 };

// Kartet er 555 x 1378 enheter. Brukes til å regne avstand i fasiten.
const MAP_W = 555;
const MAP_H = 1378;

const SHAPES = ['staende', 'liggende', 'kvadratisk'];
const SHAPE_RATIO = { staende: 4 / 3, liggende: 3 / 4, kvadratisk: 1 }; // høyde / bredde
const GROUPS = ['alene', 'venstre', 'midten', 'hoyre'];
const STATUSES = ['Venter', 'Godkjent', 'Avvist'];

// Kunstverkene ligger i fanen «Verk»: ID, navn, plassering på kartet, bildets bredde/høyde,
// og selve bildet (JPEG som tekst) delt opp i biter fordi en celle tar maks 50 000 tegn.
const WORKS_SHEET = 'Verk';
const WORK_HEADERS = ['ID', 'Navn', 'Kart X', 'Kart Y', 'Bredde/høyde'];
const WORK_FIXED = WORK_HEADERS.length;
const IMG_CHUNK = 45000;
const IMG_CHUNKS = 10;
const IMG_MAX = IMG_CHUNK * IMG_CHUNKS; // ca. 330 kB JPEG
const MAX_WORKS = 40;

// ---------- Inngangspunkter ----------

function doGet() {
  const st = readSettings_();
        return json_({ ok: true, open: st.open, shape: st.fasit ? st.fasit.shape : null });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    switch (req.action) {
      case 'status':
        const st = readSettings_();
        return json_({ ok: true, open: st.open, shape: st.fasit ? st.fasit.shape : null, works: readWorks_(false).map(publicWork_) });
      case 'work':
        return json_(getWork_(req));
      case 'submit':
        return json_(submit_(req));
      case 'admin.addWork':
        checkAuth_(req);
        return json_(addWork_(req));
      case 'admin.updateWork':
        checkAuth_(req);
        return json_(updateWork_(req));
      case 'admin.deleteWork':
        checkAuth_(req);
        return json_(deleteWork_(req));
      case 'admin.state':
        checkAuth_(req);
        return json_(adminState_());
      case 'admin.setStatus':
        checkAuth_(req);
        return json_(withLock_(function () { return setStatus_(req); }));
      case 'admin.approveMatching':
        checkAuth_(req);
        return json_(withLock_(approveMatching_));
      case 'admin.setFasit':
        checkAuth_(req);
        return json_(withLock_(function () { return setFasit_(req); }));
      case 'admin.setOpen':
        checkAuth_(req);
        return json_(withLock_(function () { return setOpen_(req); }));
      case 'admin.draw':
        checkAuth_(req);
        return json_(withLock_(draw_));
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    const known = ['unauthorized', 'password_not_set', 'closed', 'duplicate', 'invalid', 'no_candidates', 'not_found'];
    const code = known.indexOf(err.message) >= 0 ? err.message : 'server_error';
    if (code === 'server_error') console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: code });
  }
}

// ---------- Verktøy du kan kjøre fra Apps Script-editoren ----------

/** Kjør én gang: lager fanen «Svar» med overskrifter. */
function oppsett() {
  sheet_();
  console.log('Klar. Fanen «Svar» finnes.');
}

/** Sletter ALLE svar og trukne vinnere og åpner innsendingen. Beholder fasiten. Bruk etter testing. */
function nullstillTestdata() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, NCOLS).clearContent();
  const s = readSettings_();
  s.winners = [];
  s.open = true;
  writeSettings_(s);
  console.log('Alle svar og vinnere er slettet.');
}

// ---------- Deltaker ----------

function submit_(req) {
  // Honeypot: skjult felt som bare roboter fyller ut.
  if (req.website) return { ok: true };

  const name = cleanName_(req.name);
  const phone = normalizePhone_(req.phone);
  const map = point_(req.map);
  const mouse = point_(req.mouse);
  if (!name || !phone || !map || !mouse) throw new Error('invalid');
  if (SHAPES.indexOf(req.shape) < 0 || GROUPS.indexOf(req.group) < 0) throw new Error('invalid');

  return withLock_(function () {
    if (!readSettings_().open) throw new Error('closed');
    // Finnes det registrerte verk, må svaret peke på et av dem.
    const works = readWorks_(false);
    const workId = String(req.workId || '');
    if (works.length && !works.some(function (w) { return w.id === workId; })) throw new Error('invalid');
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last > 1) {
      const phones = sh.getRange(2, COL.PHONE, last - 1, 1).getValues();
      for (let i = 0; i < phones.length; i++) {
        if (String(phones[i][0]) === phone) throw new Error('duplicate');
      }
    }
    const row = last + 1;
    sh.getRange(row, 1, 1, 4).setNumberFormat('@');
    sh.getRange(row, COL.WORK).setNumberFormat('@'); // tidspunkt, id, navn og mobil lagres som tekst
    const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    sh.getRange(row, 1, 1, NCOLS).setValues([[
      Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
      id, name, phone,
      map.x, map.y, req.shape, req.group, mouse.x, mouse.y, 'Venter', works.length ? workId : ''
    ]]);
    return { ok: true };
  });
}

// ---------- Admin ----------

function adminState_() {
  const s = readSettings_();
  const answers = readAnswers_().map(function (a) {
    return {
      id: a.id, time: a.time, name: a.name, phone: a.phone,
      map: a.map, shape: a.shape, group: a.group, mouse: a.mouse, workId: a.workId,
      status: a.status, match: evaluate_(a, s.fasit, s)
    };
  });
  return {
    ok: true, open: s.open, fasit: s.fasit, tolMap: s.tolMap, tolWork: s.tolWork,
    winners: s.winners, answers: answers, works: readWorks_(false).map(publicWork_)
  };
}

function setStatus_(req) {
  if (STATUSES.indexOf(req.status) < 0) throw new Error('invalid');
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) throw new Error('not_found');
  const ids = sh.getRange(2, COL.ID, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(req.id)) {
      sh.getRange(i + 2, COL.STATUS).setValue(req.status);
      return { ok: true };
    }
  }
  throw new Error('not_found');
}

function approveMatching_() {
  const s = readSettings_();
  if (!s.fasit) throw new Error('invalid');
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, count: 0 };
  const answers = readAnswers_();
  const statuses = answers.map(function (a) { return [a.status]; });
  let count = 0;
  answers.forEach(function (a, i) {
    const m = evaluate_(a, s.fasit, s);
    if (a.status === 'Venter' && m && m.ok) {
      statuses[i][0] = 'Godkjent';
      count++;
    }
  });
  sh.getRange(2, COL.STATUS, last - 1, 1).setValues(statuses);
  return { ok: true, count: count };
}

function setFasit_(req) {
  const f = req.fasit;
  const mouse = f && point_(f.mouse);
  const tolMap = Number(req.tolMap);
  const tolWork = Number(req.tolWork);
  if (!mouse) throw new Error('invalid');
  if (!(tolMap >= 1 && tolMap <= 60) || !(tolWork >= 1 && tolWork <= 60)) throw new Error('invalid');
  let fasit;
  if (f.workId) {
    // Fasit knyttet til et registrert verk: kartposisjon og format hentes fra verket.
    const work = readWorks_(false).filter(function (w) { return w.id === String(f.workId); })[0];
    if (!work) throw new Error('invalid');
    fasit = { workId: work.id, map: { x: work.x, y: work.y }, shape: 'staende', group: 'alene', ratio: 1 / work.aspect, mouse: mouse };
  } else {
    const map = point_(f.map);
    if (!map || SHAPES.indexOf(f.shape) < 0 || GROUPS.indexOf(f.group) < 0) throw new Error('invalid');
    fasit = { map: map, shape: f.shape, group: f.group, mouse: mouse };
  }
  const s = readSettings_();
  s.fasit = fasit;
  s.tolMap = tolMap;
  s.tolWork = tolWork;
  writeSettings_(s);
  return { ok: true };
}

function setOpen_(req) {
  const s = readSettings_();
  s.open = !!req.open;
  writeSettings_(s);
  return { ok: true, open: s.open };
}

function draw_() {
  const s = readSettings_();
  const drawn = {};
  s.winners.forEach(function (w) { drawn[w.id] = true; });
  const candidates = readAnswers_().filter(function (a) { return a.status === 'Godkjent' && !drawn[a.id]; });
  if (!candidates.length) throw new Error('no_candidates');
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const winner = {
    id: pick.id, name: pick.name, phone: pick.phone,
    time: Utilities.formatDate(new Date(), TIME_ZONE, 'HH:mm:ss')
  };
  s.winners.push(winner);
  writeSettings_(s);
  return { ok: true, winner: winner, remaining: candidates.length - 1 };
}

// ---------- Fasit ----------

function evaluate_(a, fasit, s) {
  if (!fasit) return null;
  const dMap = Math.hypot((a.map.x - fasit.map.x) * MAP_W, (a.map.y - fasit.map.y) * MAP_H);
  const mapOk = dMap <= (s.tolMap / 100) * MAP_W;
  const ratio = fasit.ratio || SHAPE_RATIO[fasit.shape] || 1;
  const dWork = Math.hypot(a.mouse.x - fasit.mouse.x, (a.mouse.y - fasit.mouse.y) * ratio); // 1 = verkets bredde
  const mouseOk = dWork <= s.tolWork / 100;
  // Gjestene velger verken format eller plassering. De ser rammen i fasitens format, så begge teller som riktige.
  const shapeOk = true;
  const groupOk = true;
  if (fasit.workId) {
    // Riktig verk og riktig sted på verket avgjør. Kartmarkøren brukes bare til å finne verket.
    const workOk = a.workId === fasit.workId;
    return { map: mapOk, work: workOk, shape: true, group: true, mouse: workOk && mouseOk, ok: workOk && mouseOk };
  }
  return { map: mapOk, shape: shapeOk, group: groupOk, mouse: mouseOk, ok: mapOk && shapeOk && groupOk && mouseOk };
}

// ---------- Hjelpere ----------

function checkAuth_(req) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'ENDRE-MEG') throw new Error('password_not_set');
  if (String(req.password || '') !== ADMIN_PASSWORD) {
    Utilities.sleep(800);
    throw new Error('unauthorized');
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cleanName_(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[=+\-@\s]+/, ''); // hindrer at navnet tolkes som formel i regneark
  if (s.length < 2 || s.length > 80) return null;
  return s;
}

/** Returnerer sifre med landskode (f.eks. 4741234567), eller null hvis ugyldig. */
function normalizePhone_(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/[\s().\-]/g, '');
  let intl = false;
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

function point_(p) {
  if (!p) return null;
  const x = Number(p.x);
  const y = Number(p.y);
  if (!isFinite(x) || !isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, NCOLS).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, NCOLS).setFontWeight('bold');
  } else if (String(sh.getRange(1, COL.WORK).getValue()) !== 'Verk') {
    sh.getRange(1, COL.WORK).setValue('Verk'); // regneark laget før verkene ble innført
  }
  return sh;
}

// ---------- Verk ----------

function worksSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WORKS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WORKS_SHEET);
    sh.getRange(1, 1, 1, WORK_FIXED).setValues([WORK_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readWorks_(withImage) {
  const sh = worksSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = WORK_FIXED + (withImage ? IMG_CHUNKS : 0);
  const rows = sh.getRange(2, 1, last - 1, width).getValues();
  const out = [];
  rows.forEach(function (r, i) {
    if (!r[0]) return;
    const w = { id: String(r[0]), name: String(r[1]), x: Number(r[2]), y: Number(r[3]), aspect: Number(r[4]), row: i + 2 };
    if (withImage) w.image = r.slice(WORK_FIXED).join('');
    out.push(w);
  });
  return out;
}

function publicWork_(w) { return { id: w.id, name: w.name, x: w.x, y: w.y, aspect: w.aspect }; }

function getWork_(req) {
  const id = String(req.id || '');
  const w = readWorks_(true).filter(function (x) { return x.id === id; })[0];
  if (!w || !w.image) throw new Error('not_found');
  return { ok: true, id: w.id, image: w.image };
}

function cleanWorkName_(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[=+\-@\s]+/, '');
  return s.length >= 1 && s.length <= 60 ? s : null;
}

function validImage_(img) {
  return typeof img === 'string' && img.length <= IMG_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(img);
}

function addWork_(req) {
  const name = cleanWorkName_(req.name);
  const pos = point_(req.pos);
  const aspect = Math.round(Number(req.aspect) * 1000) / 1000;
  if (!name || !pos || !(aspect >= 0.2 && aspect <= 5) || !validImage_(req.image)) throw new Error('invalid');
  return withLock_(function () {
    const works = readWorks_(false);
    if (works.length >= MAX_WORKS) throw new Error('invalid');
    const sh = worksSheet_();
    const row = sh.getLastRow() + 1;
    const id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    // ID, navn og bildebitene lagres som tekst. Ellers kan en bit som starter med + eller = tolkes som formel.
    sh.getRange(row, 1, 1, 2).setNumberFormat('@');
    sh.getRange(row, WORK_FIXED + 1, 1, IMG_CHUNKS).setNumberFormat('@');
    const cells = [id, name, pos.x, pos.y, aspect];
    for (let i = 0; i < IMG_CHUNKS; i++) cells.push(req.image.slice(i * IMG_CHUNK, (i + 1) * IMG_CHUNK));
    sh.getRange(row, 1, 1, WORK_FIXED + IMG_CHUNKS).setValues([cells]);
    return { ok: true, id: id };
  });
}

function updateWork_(req) {
  const name = cleanWorkName_(req.name);
  const pos = point_(req.pos);
  const aspect = Math.round(Number(req.aspect) * 1000) / 1000;
  if (!name || !pos) throw new Error('invalid');
  return withLock_(function () {
    const w = readWorks_(false).filter(function (x) { return x.id === String(req.id || ''); })[0];
    if (!w) throw new Error('not_found');
    const sh = worksSheet_();
    sh.getRange(w.row, 2).setNumberFormat('@').setValue(name);
    sh.getRange(w.row, 3, 1, 2).setValues([[pos.x, pos.y]]);
    const s = readSettings_();
    if (s.fasit && s.fasit.workId === w.id) { s.fasit.map = pos; }
    if (req.image) { // nytt bilde (og dermed kanskje nytt format)
      if (!validImage_(req.image) || !(aspect >= 0.2 && aspect <= 5)) throw new Error('invalid');
      sh.getRange(w.row, 5).setValue(aspect);
      sh.getRange(w.row, WORK_FIXED + 1, 1, IMG_CHUNKS).setNumberFormat('@');
      const chunks = [];
      for (let i = 0; i < IMG_CHUNKS; i++) chunks.push(req.image.slice(i * IMG_CHUNK, (i + 1) * IMG_CHUNK));
      sh.getRange(w.row, WORK_FIXED + 1, 1, IMG_CHUNKS).setValues([chunks]);
      if (s.fasit && s.fasit.workId === w.id) s.fasit.ratio = 1 / aspect;
    }
    writeSettings_(s);
    return { ok: true };
  });
}

function deleteWork_(req) {
  return withLock_(function () {
    const w = readWorks_(false).filter(function (x) { return x.id === String(req.id || ''); })[0];
    if (!w) throw new Error('not_found');
    worksSheet_().deleteRow(w.row);
    const s = readSettings_();
    if (s.fasit && s.fasit.workId === w.id) { s.fasit = null; writeSettings_(s); }
    return { ok: true };
  });
}

function readAnswers_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, NCOLS).getValues();
  const out = [];
  rows.forEach(function (r) {
    if (!r[COL.ID - 1]) return;
    out.push({
      time: String(r[COL.TIME - 1]),
      id: String(r[COL.ID - 1]),
      name: String(r[COL.NAME - 1]),
      phone: String(r[COL.PHONE - 1]),
      map: { x: Number(r[COL.MX - 1]), y: Number(r[COL.MY - 1]) },
      shape: String(r[COL.SHAPE - 1]),
      group: String(r[COL.GROUP - 1]),
      mouse: { x: Number(r[COL.WX - 1]), y: Number(r[COL.WY - 1]) },
      workId: String(r[COL.WORK - 1] || ''),
      status: STATUSES.indexOf(String(r[COL.STATUS - 1])) >= 0 ? String(r[COL.STATUS - 1]) : 'Venter'
    });
  });
  return out;
}

function readSettings_() {
  const def = { open: true, fasit: null, tolMap: 15, tolWork: 15, winners: [] };
  const raw = PropertiesService.getScriptProperties().getProperty('settings');
  if (!raw) return def;
  return Object.assign(def, JSON.parse(raw));
}

function writeSettings_(s) {
  PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(s));
}
